import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptPushPayload } from '../server/src/push.js';

// Vecteurs de test officiels de la RFC 8291, appendice A.
const VECTOR = {
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  plaintext: 'When I grow up, I want to be a watermelon',
  expected:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const fromBase64Url = (value) => {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(Buffer.from(padded, 'base64'));
};

const toBase64Url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('le chiffrement Web Push reproduit exactement le vecteur de la RFC 8291', async () => {
  const rawPublic = fromBase64Url(VECTOR.asPublic);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(rawPublic.slice(1, 33)),
    y: toBase64Url(rawPublic.slice(33, 65)),
    d: VECTOR.asPrivate,
  };
  const keyPair = {
    privateKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, [
      'deriveBits',
    ]),
    publicKey: await crypto.subtle.importKey(
      'raw',
      rawPublic,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    ),
  };

  const subscription = {
    endpoint: 'https://push.example.net/exemple',
    keys: { p256dh: VECTOR.uaPublic, auth: VECTOR.authSecret },
  };

  const result = await encryptPushPayload(subscription, new TextEncoder().encode(VECTOR.plaintext), {
    keyPair,
    salt: fromBase64Url(VECTOR.salt),
  });

  assert.equal(toBase64Url(result), VECTOR.expected);
});
