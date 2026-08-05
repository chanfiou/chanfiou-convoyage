const encoder = new TextEncoder();

// Cloudflare Workers plafonne PBKDF2 à 100 000 itérations.
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH_BITS = 256;

const toBase64Url = (bytes) => {
  let binary = '';
  new Uint8Array(bytes).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (value) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const randomToken = (byteLength = 24) =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));

export const hashPassword = async (password, saltBase64Url, iterations = PBKDF2_ITERATIONS) => {
  const salt = saltBase64Url ? fromBase64Url(saltBase64Url) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return `pbkdf2$${iterations}$${toBase64Url(salt)}$${toBase64Url(bits)}`;
};

export const verifyPassword = async (password, stored) => {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  const candidate = await hashPassword(password, parts[2], iterations);
  return timingSafeEqual(candidate, stored);
};

export const timingSafeEqual = (first, second) => {
  const a = encoder.encode(String(first));
  const b = encoder.encode(String(second));
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
};

const hmacKey = (secret) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);

export const signSession = async (payload, secret) => {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return `${body}.${toBase64Url(signature)}`;
};

export const verifySession = async (token, secret) => {
  const [body, signature] = String(token ?? '').split('.');
  if (!body || !signature) return null;
  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(body));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};
