import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeMissions, markPending, newRequestCount, normaliseMission } from '../src/js/data/sync.js';
import { computeQuote } from '../src/js/domain/quote.js';

const missionComplete = (surcharge = {}) => ({
  reference: 'CHF-2608-001',
  departure: 'Paris (75)',
  arrival: 'Lyon (69)',
  status: 'demande',
  updatedAt: '2026-08-04T10:00:00.000Z',
  quote: computeQuote({ kilometers: 478, vehicleId: 'suv', approachKilometers: 478 }),
  ...surcharge,
});

test('une mission du serveur sans devis complet est réparée, pas fatale', () => {
  const abimee = {
    reference: 'CHF-2608-009',
    departure: 'Paris (75)',
    arrival: 'Lyon (69)',
    status: 'demande',
    quote: { kilometers: 478, totalExcludingVat: 459.19 },
  };
  const propre = normaliseMission(abimee);
  assert.ok(propre.quote.vehicle?.label, 'le véhicule doit être reconstruit');
  assert.ok(propre.quote.urgency?.label);
  assert.ok(propre.quote.schedule?.label);
  assert.equal(propre.quote.kilometers, 478);
});

test('les paramètres du devis transmis reconstruisent le prix exact', () => {
  const attendu = computeQuote({
    kilometers: 478,
    vehicleId: 'premium',
    urgencyId: 'express',
    approachKilometers: 478,
  });
  const propre = normaliseMission({
    reference: 'CHF-2608-010',
    departure: 'Paris (75)',
    arrival: 'Lyon (69)',
    status: 'demande',
    quoteInput: { kilometers: 478, vehicleId: 'premium', urgencyId: 'express', approachKilometers: 478 },
  });
  assert.equal(propre.quote.totalExcludingVat, attendu.totalExcludingVat);
});

test('un statut inconnu venant du serveur retombe sur un statut valide', () => {
  const propre = normaliseMission({ ...missionComplete(), status: 'nimportequoi' });
  assert.equal(propre.status, 'demande');
});

test('un trajet vide ne casse pas l’affichage', () => {
  const propre = normaliseMission({ reference: 'X', status: 'demande', departure: '', arrival: null });
  assert.equal(propre.departure, 'Départ à préciser');
  assert.equal(propre.arrival, 'Arrivée à préciser');
  assert.deepEqual(propre.history, []);
});

test('une mission distante inconnue est ajoutée', () => {
  const { missions, added } = mergeMissions([], [missionComplete()]);
  assert.equal(added, 1);
  assert.equal(missions.length, 1);
  assert.equal(missions[0].pendingSync, false);
});

test('la version la plus récente gagne', () => {
  const locale = missionComplete({ status: 'demande', updatedAt: '2026-08-04T10:00:00.000Z' });
  const distante = missionComplete({ status: 'confirmee', updatedAt: '2026-08-04T12:00:00.000Z' });
  const { missions, updated } = mergeMissions([locale], [distante]);
  assert.equal(updated, 1);
  assert.equal(missions[0].status, 'confirmee');
});

test('une modification locale non encore envoyée n’est pas écrasée', () => {
  const locale = missionComplete({
    status: 'en-cours',
    updatedAt: '2026-08-04T14:00:00.000Z',
    pendingSync: true,
  });
  const distante = missionComplete({ status: 'demande', updatedAt: '2026-08-04T12:00:00.000Z' });
  const { missions, updated } = mergeMissions([locale], [distante]);
  assert.equal(updated, 0);
  assert.equal(missions[0].status, 'en-cours', 'le travail local en attente doit survivre');
});

test('une modification locale en attente survit toujours, même à une version distante plus récente', () => {
  const locale = missionComplete({ status: 'en-cours', updatedAt: '2026-08-04T10:00:00.000Z', pendingSync: true });
  const distante = missionComplete({ status: 'annulee', updatedAt: '2026-08-04T18:00:00.000Z' });
  const { missions, updated } = mergeMissions([locale], [distante]);
  assert.equal(updated, 0);
  assert.equal(
    missions[0].status,
    'en-cours',
    'ce que le convoyeur a saisi hors ligne ne doit jamais disparaître sans avoir été envoyé',
  );
  assert.equal(missions[0].pendingSync, true, 'la mission reste à envoyer');
});

test('la fusion ne crée jamais de doublon de référence', () => {
  const locale = missionComplete();
  const { missions } = mergeMissions([locale], [missionComplete({ status: 'confirmee', updatedAt: '2026-08-05T10:00:00.000Z' })]);
  assert.equal(missions.length, 1);
});

test('marquer en attente horodate la modification', () => {
  const marquee = markPending(missionComplete());
  assert.equal(marquee.pendingSync, true);
  assert.ok(marquee.updatedAt > '2026-08-04T10:00:00.000Z');
});

test('le compteur ne retient que les demandes venues des clients', () => {
  const missions = [
    { origin: 'client', status: 'demande' },
    { origin: 'client', status: 'confirmee' },
    { origin: 'convoyeur', status: 'demande' },
    { origin: 'client', status: 'demande' },
  ];
  assert.equal(newRequestCount(missions), 2);
});
