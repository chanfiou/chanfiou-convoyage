import { randomToken, signSession, timingSafeEqual, verifyPassword, verifySession } from './crypto.js';
import { transmitInvoiceToAbby } from './abby.js';
import {
  notifyClientStatusChange,
  notifySubscriptions,
  readPublicKey,
  registerClientSubscription,
  registerSubscription,
  sendTestNotification,
} from './push.js';
import {
  blockDayForMission,
  isDayBlocked,
  listAvailability,
  setAvailability,
  unblockDayForMission,
} from './availability.js';
import { servePhoto, uploadPhoto } from './photos.js';
import { notifyPendingHolds } from './reminders.js';
import { purgeOldBackups ,readBackup, writeBackup } from './backup.js';
import { clearRateLimit, isRateLimited , purgeExpiredThrottle} from './throttle.js';

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
export const SIGNATURE_PATTERN = /^data:image\/(png|jpeg|webp);base64,/;
const MAX_PAYLOAD_BYTES = 512 * 1024;
const MAX_PAGE_SIZE = 200;

const CLIENT_VISIBLE_FIELDS = [
  'reference',
  'status',
  'departure',
  'arrival',
  'pickupDate',
  'history',
  'createdAt',
  'updatedAt',
  'vehicleModel',
  'plate',
  'departureReport',
  'arrivalReport',
  'termsAcceptedAt',
  'termsVersion',
  'contractSignedAt',
  'contractSignatoryName',
  'contractSignature',
  'invoice',
  // Données fournies par le client lui-même : il doit les retrouver sur
  // n'importe quel appareil, via son lien de suivi.
  'quote',
  'contactName',
  'contactPhone',
  'contactEmail',
  'company',
  'buyerSiren',
  'pickupAddress',
  'dropAddress',
];

// Champs que seul le client alimente : ils ne doivent jamais être écrasés
// par une mise à jour venue du convoyeur.
const CLIENT_OWNED_FIELDS = ['contractSignedAt', 'contractSignatoryName', 'contractSignature'];

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });

const fail = (status, message) => json({ error: message }, status);

const corsHeaders = (request, env) => {
  const allowed = String(env.ALLOWED_ORIGIN ?? '*');
  const origin = request.headers.get('origin') ?? '';
  const value = allowed === '*' ? '*' : allowed.split(',').map((entry) => entry.trim()).includes(origin) ? origin : '';
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    'x-content-type-options': 'nosniff',
    vary: 'origin',
  };
  // Origine non autorisée : on n'émet pas l'en-tête plutôt que « null »,
  // valeur qu'un document sandboxé pourrait revendiquer comme origine.
  if (value) headers['access-control-allow-origin'] = value;
  return headers;
};

const readJson = async (request) => {
  const raw = await request.text();
  if (raw.length > MAX_PAYLOAD_BYTES) return { error: 'Contenu trop volumineux.' };
  if (!raw) return { error: 'Contenu manquant.' };
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return { error: 'Contenu illisible.' };
  }
};

const operatorFrom = async (request, env) => {
  // Sans secret configuré, aucune session ne peut être valide : mieux vaut
  // tout refuser que de vérifier des signatures dérivées d'une clé vide.
  if (!env.SESSION_SECRET) return null;
  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  try {
    return await verifySession(header.slice(7).trim(), env.SESSION_SECRET);
  } catch {
    return null;
  }
};

const nextReference = async (env, createdAt) => {
  const date = new Date(createdAt);
  const period = `${String(date.getUTCFullYear()).slice(-2)}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const row = await env.DB.prepare(
    'INSERT INTO counters (period, last_sequence) VALUES (?1, 1) ' +
      'ON CONFLICT(period) DO UPDATE SET last_sequence = last_sequence + 1' +' RETURNING last_sequence',
  )
    .bind(period)
    .first();
  return `CHF-${period}-${String(row.last_sequence).padStart(3, '0')}`;
};

const rowToMission = (row) => ({
  ...JSON.parse(row.payload),
  id: row.id,
  reference: row.reference,
  status: row.status,
  origin: row.origin,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const publicView = (mission) =>
  CLIENT_VISIBLE_FIELDS.reduce(
    (accumulator, field) => (mission[field] === undefined ? accumulator : { ...accumulator, [field]: mission[field] }),
    {},
  );

const createRequest = async (request, env, ctx) => {
  // Vingt demandes par heure et par adresse : large pour un client réel,
  // bloquant pour un script qui inonderait la base et les notifications.
  if (await isRateLimited(env, 'demande', request, 20, 60 * 60)) {
    return fail(429, 'Trop de demandes envoyées. Réessayez dans une heure.');
  }

  const { body, error } = await readJson(request);
  if (error) return fail(400, error);

  const mission = body?.mission;
  if (!mission?.departure || !mission?.arrival || !mission?.quote?.kilometers) {
    return fail(422, 'Demande incomplète : trajet ou distance manquants.');
  }

  const pickupDay = String(mission.pickupDate ?? '').slice(0, 10);
  if (pickupDay && (await isDayBlocked(env, pickupDay))) {
    return fail(422, 'Cette date n’est plus disponible. Choisissez un autre jour de prise en charge.');
  }

  const now = new Date().toISOString();
  const existing = mission.clientRequestId
    ? await env.DB.prepare("SELECT * FROM missions WHERE json_extract(payload, '$.clientRequestId') = ?1")
        .bind(mission.clientRequestId)
        .first()
    : null;

  if (existing) {
    return json({ reference: existing.reference, token: existing.client_token, duplicate: true });
  }

  const reference = await nextReference(env, now);
  const token = randomToken();
  const id = `srv-${crypto.randomUUID()}`;
  const stored = {
    ...mission,
    reference,
    status: 'demande',
    history: [{ status: 'demande', at: now }],
  };

  await env.DB.prepare(
    'INSERT INTO missions (id, reference, client_token, status, origin, created_at, updated_at, payload) ' +
      'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
  )
    .bind(id, reference, token, 'demande', 'client', now, now, JSON.stringify(stored))
    .run();

  ctx?.waitUntil(
    notifySubscriptions(env, {
      title: 'Nouvelle demande de convoyage',
      body: `${reference} — ${mission.departure} vers ${mission.arrival}`,
      url: './#/espace',
    }),
  );

  return json({ reference, token, duplicate: false }, 201);
};

const readRequest = async (request, env, url) => {
  const reference = url.pathname.split('/').pop();
  const token = url.searchParams.get('token') ?? '';
  const row = await env.DB.prepare('SELECT * FROM missions WHERE reference = ?1').bind(reference).first();
  if (!row) return fail(404, 'Référence inconnue.');
  if (!timingSafeEqual(token, row.client_token)) return fail(403, 'Jeton de suivi invalide.');
  return json({ mission: publicView(rowToMission(row)) });
};

// Signature du contrat par le client, authentifiée par son jeton de suivi.
const signContract = async (request, env, ctx) => {
  const { body, error } = await readJson(request);
  if (error) return fail(400, error);

  const reference = String(body?.reference ?? '').trim();
  const signature = String(body?.signature ?? '');
  const signatoryName = String(body?.signatoryName ?? '').trim();
  if (!reference || !SIGNATURE_PATTERN.test(signature) || !signatoryName) {
    return fail(422, 'Signature ou nom du signataire manquant.');
  }

  const row = await env.DB.prepare('SELECT * FROM missions WHERE reference = ?1').bind(reference).first();
  if (!row) return fail(404, 'Référence inconnue.');
  if (!timingSafeEqual(String(body?.token ?? ''), row.client_token)) {
    return fail(403, 'Jeton de suivi invalide.');
  }
  if (row.status === 'demande') {
    return fail(409, 'Le contrat est signable dès la confirmation du convoyage.');
  }

  const payload = JSON.parse(row.payload);
  if (payload.contractSignedAt) {
    return json({ contractSignedAt: payload.contractSignedAt, alreadySigned: true });
  }

  const signedAt = new Date().toISOString();
  const stored = {
    ...payload,
    contractSignedAt: signedAt,
    contractSignatoryName: signatoryName,
    contractSignature: signature,
  };
  await env.DB.prepare('UPDATE missions SET payload = ?1, updated_at = ?2 WHERE reference = ?3')
    .bind(JSON.stringify(stored), signedAt, reference)
    .run();

  ctx?.waitUntil(
    notifySubscriptions(env, {
      title: 'Contrat signé',
      body: `${reference} — ${signatoryName} a signé le contrat. Vous pouvez facturer.`,
      url: './#/espace',
    }),
  );

  return json({ contractSignedAt: signedAt });
};

const openSession = async (request, env) => {
  if (!env.SESSION_SECRET || !env.OPERATOR_PASSWORD_HASH) {
    return fail(503, 'La connexion n’est pas configurée sur le serveur.');
  }

  // Dix tentatives par quart d'heure et par adresse : de quoi se tromper
  // de mot de passe, pas de quoi le deviner.
  if (await isRateLimited(env, 'session', request, 10, 15 * 60)) {
    return fail(429, 'Trop de tentatives. Réessayez dans un quart d’heure.');
  }

  const { body, error } = await readJson(request);
  if (error) return fail(400, error);

  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  const expected = String(env.OPERATOR_EMAIL ?? '').trim().toLowerCase();

  const emailMatches = expected.length > 0 && timingSafeEqual(email, expected);
  const passwordMatches = await verifyPassword(password, env.OPERATOR_PASSWORD_HASH ?? '');

  if (!emailMatches || !passwordMatches) {
    return fail(401, 'Adresse ou mot de passe incorrect.');
  }

  await clearRateLimit(env, 'session', request);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const token = await signSession({ sub: expected, exp: expiresAt }, env.SESSION_SECRET);
  return json({ token, expiresAt });
};

const listMissions = async (request, env, url) => {
  const since = url.searchParams.get('since');
  // Borne basse comprise : en SQLite, un LIMIT négatif signifie « sans limite ».
  const requested = Math.floor(Number(url.searchParams.get('limit')));
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(MAX_PAGE_SIZE, requested) : MAX_PAGE_SIZE;
  const statement = since
    ? env.DB.prepare('SELECT * FROM missions WHERE updated_at > ?1 ORDER BY updated_at ASC LIMIT ?2').bind(since, limit)
    : env.DB.prepare('SELECT * FROM missions ORDER BY updated_at ASC LIMIT ?1').bind(limit);
  const { results } = await statement.all();
  const missions = (results ?? []).map(rowToMission);
  return json({
    missions,
    cursor: missions.length > 0 ? missions.at(-1).updatedAt : since ?? null,
    hasMore: missions.length === limit,
  });
};

const upsertMission = async (request, env, ctx) => {
  const { body, error } = await readJson(request);
  if (error) return fail(400, error);

  const mission = body?.mission;
  if (!mission?.reference || !mission?.status) return fail(422, 'Mission incomplète : référence ou statut manquants.');

  const now = new Date().toISOString();
  const existing = await env.DB.prepare('SELECT * FROM missions WHERE reference = ?1')
    .bind(mission.reference)
    .first();

  if (existing && mission.updatedAt && existing.updated_at > mission.updatedAt) {
    return json({ mission: rowToMission(existing), conflict: true }, 409);
  }

  const id = existing?.id ?? mission.id ?? `srv-${crypto.randomUUID()}`;
  const token = existing?.client_token ?? randomToken();
  const createdAt = existing?.created_at ?? mission.createdAt ?? now;
  const stored = { ...mission, id, reference: mission.reference };

  if (existing) {
    const previous = JSON.parse(existing.payload);
    CLIENT_OWNED_FIELDS.forEach((field) => {
      if (previous[field] !== undefined) stored[field] = previous[field];
    });
  }

  await env.DB.prepare(
    'INSERT INTO missions (id, reference, client_token, status, origin, created_at, updated_at, payload) ' +
      'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ' +
      'ON CONFLICT(reference) DO UPDATE SET status = ?4, updated_at = ?7, payload = ?8',
  )
    .bind(id, mission.reference, token, mission.status, existing?.origin ?? 'convoyeur', createdAt, now, JSON.stringify(stored))
    .run();

  if (existing && existing.status !== mission.status) {
    // La journée se réserve à la confirmation et se libère à l'annulation.
    if (mission.status === 'confirmee') {
      await blockDayForMission(env, stored.pickupDate, mission.reference);
    }
    if (mission.status === 'annulee') {
      await unblockDayForMission(env, mission.reference);
    }
    ctx?.waitUntil(notifyClientStatusChange(env, mission.reference, mission.status));
  }

  const row = await env.DB.prepare('SELECT * FROM missions WHERE reference = ?1').bind(mission.reference).first();
  return json({ mission: rowToMission(row) }, existing ? 200 : 201);
};

// Suppression définitive d'une mission : la seule façon d'exercer le droit
// d'effacement et de retirer une demande de test. Refusée dès qu'une facture
// est attachée, la conservation étant alors obligatoire.
const deleteMission = async (request, env, url) => {
  const reference = decodeURIComponent(url.pathname.slice('/api/missions/'.length));
  const row = await env.DB.prepare('SELECT * FROM missions WHERE reference = ?1').bind(reference).first();
  if (!row) return json({ deleted: false, alreadyAbsent: true });

  const payload = JSON.parse(row.payload);
  if (payload.invoice) {
    return fail(409, 'Cette mission porte une facture : elle doit être conservée dix ans.');
  }

  await env.DB.prepare('DELETE FROM client_push WHERE reference = ?1').bind(reference).run();
  await env.DB.prepare('DELETE FROM missions WHERE reference = ?1').bind(reference).run();
  await unblockDayForMission(env, reference);
  return json({ deleted: true, reference });
};

const routes = async (request, env, url, ctx) => {
  const { pathname } = url;
  const method = request.method;

  if (method === 'GET' && pathname === '/api/health') {
    return json({ status: 'ok', service: 'chanfiou-convoyage' });
  }
  if (method === 'POST' && pathname === '/api/requests') return createRequest(request, env, ctx);
  if (method === 'GET' && pathname.startsWith('/api/requests/')) return readRequest(request, env, url);
  if (method === 'POST' && pathname === '/api/session') return openSession(request, env);
  if (method === 'GET' && pathname === '/api/push/key') return readPublicKey(env);

  if (method === 'GET' && pathname.startsWith('/api/photos/')) return servePhoto(env, pathname);
  if (method === 'POST' && pathname === '/api/photos') {
    const operator = await operatorFrom(request, env);
    if (!operator) return fail(401, 'Connexion requise.');
    return uploadPhoto(request, env, url);
  }

  if (pathname === '/api/availability') {
    if (method === 'GET') {
      return listAvailability(request, env, url, Boolean(await operatorFrom(request, env)));
    }
    if (method === 'POST') {
      const operator = await operatorFrom(request, env);
      if (!operator) return fail(401, 'Connexion requise.');
      return setAvailability(request, env);
    }
  }
  if (method === 'POST' && pathname === '/api/push/track') return registerClientSubscription(request, env);
  if (method === 'POST' && pathname === '/api/contract-signature') return signContract(request, env, ctx);

  if (pathname === '/api/missions') {
    const operator = await operatorFrom(request, env);
    if (!operator) return fail(401, 'Connexion requise.');
    if (method === 'GET') return listMissions(request, env, url);
    if (method === 'POST' || method === 'PATCH') return upsertMission(request, env, ctx);
  }

  if (method === 'DELETE' && pathname.startsWith('/api/missions/')) {
    const operator = await operatorFrom(request, env);
    if (!operator) return fail(401, 'Connexion requise.');
    return deleteMission(request, env, url);
  }

  if (pathname === '/api/backup') {
    const operator = await operatorFrom(request, env);
    if (!operator) return fail(401, 'Connexion requise.');
    if (method === 'GET') return readBackup(env);
    if (method === 'POST') return writeBackup(request, env);
  }

  if (method === 'POST' && pathname === '/api/abby/invoice') {
    const operator = await operatorFrom(request, env);
    if (!operator) return fail(401, 'Connexion requise.');
    return transmitInvoiceToAbby(request, env);
  }

  if (method === 'POST' && (pathname === '/api/push/subscribe' || pathname === '/api/push/test')) {
    const operator = await operatorFrom(request, env);
    if (!operator) return fail(401, 'Connexion requise.');
    return pathname === '/api/push/subscribe'
      ? registerSubscription(request, env)
      : sendTestNotification(env);
  }

  return fail(404, 'Route inconnue.');
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // www redirige vers le domaine principal : un seul site, un seul cache PWA.
    if (url.hostname === 'www.chanfiou-convoyage.fr') {
      return Response.redirect(`https://chanfiou-convoyage.fr${url.pathname}${url.search}`, 301);
    }

    const headers = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    try {
      const response = await routes(request, env, url, ctx);
      Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      return response;
    } catch (cause) {
      console.error('erreur non gérée', cause);
      return json({ error: 'Erreur interne du serveur.' }, 500, headers);
    }
  },

  // Déclencheur quotidien : alerte sur les dates réservées non honorées.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      notifyPendingHolds(env).catch((cause) => console.error('relances quotidiennes', cause)),
    );
  },
};
