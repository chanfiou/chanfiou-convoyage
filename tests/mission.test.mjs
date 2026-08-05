import assert from 'node:assert/strict';
import test from 'node:test';
import { nextReference } from '../src/js/domain/mission.js';

const AUGUST = '2026-08-04T10:00:00.000Z';
const SEPTEMBER = '2026-09-02T10:00:00.000Z';

test('la première référence du mois démarre à 001', () => {
  assert.equal(nextReference([], AUGUST), 'CHF-2608-001');
});

test('la référence suit le plus haut numéro déjà attribué', () => {
  const missions = [{ reference: 'CHF-2608-001' }, { reference: 'CHF-2608-004' }];
  assert.equal(nextReference(missions, AUGUST), 'CHF-2608-005');
});

test('le compteur repart à 001 au changement de mois', () => {
  const missions = [{ reference: 'CHF-2608-009' }];
  assert.equal(nextReference(missions, SEPTEMBER), 'CHF-2609-001');
});

test('des missions ajoutées en série ne partagent jamais de référence', () => {
  const missions = [];
  for (let index = 0; index < 12; index += 1) {
    missions.push({ reference: nextReference(missions, AUGUST) });
  }
  const references = missions.map((mission) => mission.reference);
  assert.equal(new Set(references).size, references.length);
  assert.equal(references.at(-1), 'CHF-2608-012');
});

test('une référence malformée ne casse pas la numérotation', () => {
  const missions = [{ reference: 'CHF-2608-abc' }, { reference: undefined }, { reference: 'CHF-2608-002' }];
  assert.equal(nextReference(missions, AUGUST), 'CHF-2608-003');
});
