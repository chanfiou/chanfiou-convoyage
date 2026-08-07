import { randomToken } from './crypto.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const fail = (status, message) => json({ error: message }, status);

// ~2 Mo décodés : largement suffisant pour les photos compressées des PV.
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const CONTENT_TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const uploadPhoto = async (request, env, requestUrl) => {
  if (!env.PHOTOS) return fail(503, 'Le stockage des photos n’est pas configuré.');

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Contenu illisible.');
  }

  const reference = String(body?.reference ?? '').trim();
  const dataUrl = String(body?.dataUrl ?? '');
  const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if (!reference || !match) return fail(422, 'Photo illisible ou référence manquante.');

  let bytes;
  try {
    const binary = atob(match[2]);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return fail(422, 'Photo illisible.');
  }
  if (bytes.length > MAX_PHOTO_BYTES) return fail(413, 'Photo trop lourde.');

  // Clé non devinable : elle fait office de droit d'accès, comme le jeton de suivi.
  const key = `pv/${reference}/${randomToken(18)}.${match[1]}`;
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: CONTENT_TYPES[match[1]] } });

  return json({ url: `${requestUrl.origin}/api/photos/${key}` }, 201);
};

export const servePhoto = async (env, pathname) => {
  if (!env.PHOTOS) return fail(503, 'Le stockage des photos n’est pas configuré.');
  const key = decodeURIComponent(pathname.slice('/api/photos/'.length));
  if (!key.startsWith('pv/')) return fail(404, 'Photo inconnue.');
  const object = await env.PHOTOS.get(key);
  if (!object) return fail(404, 'Photo inconnue.');
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
