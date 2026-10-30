import assert from 'node:assert/strict';
import test from 'node:test';
import { SIGNATURE_PATTERN } from '../server/src/index.js';
import { purgeOldBackups } from '../server/src/backup.js';
import { purgeExpiredThrottle } from '../server/src/throttle.js';

const NOW = new Date('2026-08-11T07:00:00.000Z');

test('la signature accepte les formats image inertes du pad et des photos', () => {
  assert.ok(SIGNATURE_PATTERN.test('data:image/png;base64,iVBORw0KGgo='));
  assert.ok(SIGNATURE_PATTERN.test('data:image/jpeg;base64,/9j/4AAQ'));
  assert.ok(SIGNATURE_PATTERN.test('data:image/webp;base64,UklGRg=='));
});

test('la signature refuse le SVG et tout ce qui n’est pas une image en base64', () => {
  assert.ok(!SIGNATURE_PATTERN.test('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='));
  assert.ok(!SIGNATURE_PATTERN.test('data:image/svg+xml,<svg onload=alert(1)></svg>'));
  assert.ok(!SIGNATURE_PATTERN.test('data:image/png,pas-du-base64'));
  assert.ok(!SIGNATURE_PATTERN.test('data:text/html;base64,PGh0bWw+'));
  assert.ok(!SIGNATURE_PATTERN.test('https://exemple.fr/signature.png'));
});

const fakeBucket = (keys) => {
  const deleted = [];
  return {
    deleted,
    list: async ({ prefix }) => ({
      objects: keys.filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
    }),
    delete: async (key) => {
      deleted.push(key);
    },
  };
};


test('la purge des sauvegardes épargne dernier.json et les clés inattendues', async () => {
  const bucket = fakeBucket(['backup/dernier.json', 'backup/notes.txt', 'backup/2020-01-01.json.bak']);
  const { purged } = await purgeOldBackups({ PHOTOS: bucket }, NOW);
  assert.equal(purged, 0);
  assert.deepEqual(bucket.deleted, []);
});

test('la purge des sauvegardes reste muette sans stockage configuré', async () => {
  assert.deepEqual(await purgeOldBackups({}, NOW), { purged: 0 });
});

test('la purge des compteurs de débit supprime les fenêtres vieilles d’un jour', async () => {
  const calls = [];
  const db = {
    prepare: (sql) => ({
      bind: (...values) => ({
        run: async () => {
          calls.push({ sql, values });
          return { meta: { changes: 3 } };
        },
      }),
    }),
  };
  const { purged } = await purgeExpiredThrottle({ DB: db }, NOW);
  assert.equal(purged, 3);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ['2026-08-10T07:00:00.000Z']);
});

