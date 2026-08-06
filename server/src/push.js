import { timingSafeEqual } from './crypto.js';

const encoder = new TextEncoder();

const CLIENT_STATUS_MESSAGES = {
  confirmee: 'Votre convoyage est confirmé. Réglez le virement depuis l’écran de suivi pour lancer la mission.',
  'en-cours': 'Votre véhicule est en route vers sa destination.',
  livree: 'Votre véhicule est livré. Merci de votre confiance !',
  annulee: 'Votre convoyage a été annulé. Contactez-nous pour toute question.',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const fail = (status, message) => json({ error: message }, status);

const toBase64Url = (bytes) => {
  let binary = '';
  new Uint8Array(bytes).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (value) => {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const concatBytes = (...parts) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    merged.set(part, offset);
    offset += part.length;
  });
  return merged;
};

const hmacSha256 = async (keyBytes, data) => {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
};

// HKDF (RFC 5869) limité à une seule itération d'expansion, suffisant pour Web Push.
const hkdf = async (salt, ikm, info, length) => {
  const prk = await hmacSha256(salt, ikm);
  const expanded = await hmacSha256(prk, concatBytes(info, Uint8Array.of(1)));
  return expanded.slice(0, length);
};

// Chiffrement du contenu selon RFC 8291 (aes128gcm, RFC 8188).
// `overrides` permet d'injecter clé éphémère et sel pour les tests.
export const encryptPushPayload = async (subscription, plaintext, overrides = {}) => {
  const uaPublic = fromBase64Url(subscription.keys.p256dh);
  const authSecret = fromBase64Url(subscription.keys.auth);
  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const asKeys =
    overrides.keyPair ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256),
  );

  const keyInfo = concatBytes(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const contentKey = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  const record = concatBytes(plaintext, Uint8Array.of(2));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record),
  );

  const recordSize = Uint8Array.of(0, 0, 16, 0);
  const header = concatBytes(salt, recordSize, Uint8Array.of(asPublic.length), asPublic);
  return concatBytes(header, encrypted);
};

// En-tête d'autorisation VAPID (RFC 8292).
const vapidAuthorization = async (endpoint, env) => {
  const { origin } = new URL(endpoint);
  const privateJwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = toBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: `mailto:${env.OPERATOR_EMAIL ?? 'contact@example.org'}`,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput)),
  );
  return `vapid t=${signingInput}.${toBase64Url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
};

const sendToSubscription = async (env, subscription, payload) => {
  const body = await encryptPushPayload(subscription, encoder.encode(JSON.stringify(payload)));
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      ttl: '86400',
      urgency: 'high',
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      authorization: await vapidAuthorization(subscription.endpoint, env),
    },
    body,
  });
  return response.status;
};

export const notifySubscriptions = async (env, payload) => {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return;
  const { results } = await env.DB.prepare('SELECT endpoint, payload FROM push_subscriptions').all();
  await Promise.all(
    (results ?? []).map(async (row) => {
      try {
        const status = await sendToSubscription(env, JSON.parse(row.payload), payload);
        if (status === 404 || status === 410) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1')
            .bind(row.endpoint)
            .run();
        }
      } catch {
        // Une notification qui échoue ne doit jamais bloquer le traitement principal.
      }
    }),
  );
};

export const readPublicKey = (env) => {
  if (!env.VAPID_PUBLIC_KEY) return fail(503, 'Les notifications ne sont pas configurées.');
  return json({ key: env.VAPID_PUBLIC_KEY });
};

export const registerSubscription = async (request, env) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Contenu illisible.');
  }
  const subscription = body?.subscription;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return fail(422, 'Abonnement incomplet.');
  }
  await env.DB.prepare(
    'INSERT INTO push_subscriptions (endpoint, payload, created_at) VALUES (?1, ?2, ?3) ' +
      'ON CONFLICT(endpoint) DO UPDATE SET payload = ?2',
  )
    .bind(subscription.endpoint, JSON.stringify(subscription), new Date().toISOString())
    .run();
  return json({ saved: true }, 201);
};

export const registerClientSubscription = async (request, env) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Contenu illisible.');
  }
  const { reference, token, subscription } = body ?? {};
  if (!reference || !token || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return fail(422, 'Abonnement incomplet.');
  }
  const row = await env.DB.prepare('SELECT client_token FROM missions WHERE reference = ?1')
    .bind(reference)
    .first();
  if (!row) return fail(404, 'Référence inconnue.');
  if (!timingSafeEqual(token, row.client_token)) return fail(403, 'Jeton de suivi invalide.');

  await env.DB.prepare(
    'INSERT INTO client_push (endpoint, reference, payload, created_at) VALUES (?1, ?2, ?3, ?4) ' +
      'ON CONFLICT(endpoint, reference) DO UPDATE SET payload = ?3',
  )
    .bind(subscription.endpoint, reference, JSON.stringify(subscription), new Date().toISOString())
    .run();
  return json({ saved: true }, 201);
};

export const notifyClientStatusChange = async (env, reference, status) => {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return;
  const message = CLIENT_STATUS_MESSAGES[status];
  if (!message) return;
  const { results } = await env.DB.prepare('SELECT endpoint, payload FROM client_push WHERE reference = ?1')
    .bind(reference)
    .all();
  await Promise.all(
    (results ?? []).map(async (row) => {
      try {
        const pushStatus = await sendToSubscription(env, JSON.parse(row.payload), {
          title: `Convoyage ${reference}`,
          body: message,
          url: `./#/suivi?reference=${encodeURIComponent(reference)}`,
        });
        if (pushStatus === 404 || pushStatus === 410) {
          await env.DB.prepare('DELETE FROM client_push WHERE endpoint = ?1 AND reference = ?2')
            .bind(row.endpoint, reference)
            .run();
        }
      } catch {
        // Une notification qui échoue ne doit jamais bloquer la mise à jour de la mission.
      }
    }),
  );
};

export const sendTestNotification = async (env) => {
  if (!env.VAPID_PRIVATE_JWK) return fail(503, 'Les notifications ne sont pas configurées.');
  await notifySubscriptions(env, {
    title: 'Chanfiou — test',
    body: 'Les notifications fonctionnent sur cet appareil. 🚚',
    url: './#/espace',
  });
  return json({ sent: true });
};
