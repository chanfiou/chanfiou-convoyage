import assert from 'node:assert/strict';
import test from 'node:test';
import { HOLD_HOURS, pendingHolds } from '../src/js/domain/reminders.js';

const NOW = new Date('2026-08-10T12:00:00.000Z');
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 3600000).toISOString();

const mission = (patch) => ({
  id: patch.id ?? 'm1',
  reference: patch.reference ?? 'CHF-2608-001',
  pickupDate: '2026-08-20',
  ...patch,
});

test('un contrat non signé au-delà du délai de tenue remonte en relance', () => {
  const missions = [
    mission({
      id: 'a',
      status: 'confirmee',
      history: [{ status: 'confirmee', at: hoursAgo(HOLD_HOURS + 1) }],
    }),
  ];
  const holds = pendingHolds(missions, NOW);
  assert.equal(holds.length, 1);
  assert.equal(holds[0].kind, 'signature');
  assert.ok(holds[0].hours >= HOLD_HOURS);
});

test('rien ne remonte avant l’expiration du délai', () => {
  const missions = [
    mission({ status: 'confirmee', history: [{ status: 'confirmee', at: hoursAgo(HOLD_HOURS - 2) }] }),
  ];
  assert.deepEqual(pendingHolds(missions, NOW), []);
});

test('un contrat signé ne remonte jamais en relance de signature', () => {
  const missions = [
    mission({
      status: 'confirmee',
      contractSignedAt: hoursAgo(1),
      history: [{ status: 'confirmee', at: hoursAgo(72) }],
    }),
  ];
  assert.deepEqual(pendingHolds(missions, NOW), []);
});

test('une facture émise et non réglée remonte en relance de paiement', () => {
  const missions = [
    mission({
      status: 'facturee',
      contractSignedAt: hoursAgo(80),
      history: [
        { status: 'confirmee', at: hoursAgo(96) },
        { status: 'facturee', at: hoursAgo(80) },
      ],
    }),
  ];
  const holds = pendingHolds(missions, NOW);
  assert.equal(holds.length, 1);
  assert.equal(holds[0].kind, 'paiement');
});

test('les missions payées ou en route ne remontent plus', () => {
  const missions = [
    mission({ id: 'a', status: 'payee', history: [{ status: 'facturee', at: hoursAgo(200) }] }),
    mission({ id: 'b', status: 'en-cours', history: [{ status: 'confirmee', at: hoursAgo(200) }] }),
    mission({ id: 'c', status: 'livree', history: [{ status: 'facturee', at: hoursAgo(200) }] }),
    mission({ id: 'd', status: 'annulee', history: [{ status: 'confirmee', at: hoursAgo(200) }] }),
  ];
  assert.deepEqual(pendingHolds(missions, NOW), []);
});

test('les relances les plus anciennes passent en premier', () => {
  const missions = [
    mission({ id: 'a', status: 'confirmee', history: [{ status: 'confirmee', at: hoursAgo(50) }] }),
    mission({ id: 'b', status: 'confirmee', history: [{ status: 'confirmee', at: hoursAgo(120) }] }),
  ];
  assert.deepEqual(
    pendingHolds(missions, NOW).map((entry) => entry.mission.id),
    ['b', 'a'],
  );
});
