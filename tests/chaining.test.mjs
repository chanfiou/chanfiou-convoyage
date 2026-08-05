import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chainedApproachKilometers,
  chainingBenefit,
  emptyKilometreRatio,
  findChainCandidates,
  gapBetween,
  quoteInputFrom,
  soloApproachKilometers,
} from '../src/js/domain/chaining.js';
import { computeQuote } from '../src/js/domain/quote.js';
import { CHAINING_RADIUS_KILOMETERS } from '../src/js/config/pricing.js';

const missionFrom = (overrides) => {
  const { departure, arrival, pickupDate, status = 'confirmee', id, reference } = overrides;
  return {
    id,
    reference,
    departure,
    arrival,
    pickupDate,
    status,
    chainedToId: null,
    quote: computeQuote({
      kilometers: 300,
      approachKilometers: 500,
    }),
  };
};

const LYON_DELIVERY = missionFrom({
  id: 'm1',
  reference: 'CHF-2608-001',
  departure: 'Paris (75)',
  arrival: 'Lyon (69)',
  pickupDate: '2026-08-10',
});

const NEARBY_PICKUP = missionFrom({
  id: 'm2',
  reference: 'CHF-2608-002',
  departure: 'Villeurbanne (69)',
  arrival: 'Marseille (13)',
  pickupDate: '2026-08-11',
});

const FAR_PICKUP = missionFrom({
  id: 'm3',
  reference: 'CHF-2608-003',
  departure: 'Brest (29)',
  arrival: 'Nantes (44)',
  pickupDate: '2026-08-11',
});

const LATE_PICKUP = missionFrom({
  id: 'm4',
  reference: 'CHF-2608-004',
  departure: 'Villeurbanne (69)',
  arrival: 'Nice (06)',
  pickupDate: '2026-08-30',
});

test('la distance entre deux villes est mesurable', () => {
  const proche = gapBetween('Lyon (69)', 'Villeurbanne (69)');
  assert.equal(typeof proche, 'number', 'Villeurbanne doit être dans la base de villes');
  assert.ok(proche <= 10, `${proche} km attendus sous 10`);
  assert.ok(gapBetween('Lyon (69)', 'Brest (29)') > 700);
  assert.equal(gapBetween('Atlantide', 'Lyon (69)'), null);
});

test('une ville inconnue ne produit jamais une approche gratuite', () => {
  const inconnue = missionFrom({
    id: 'mx',
    reference: 'CHF-2608-099',
    departure: 'Atlantide',
    arrival: 'Lyon (69)',
    pickupDate: '2026-08-11',
  });
  assert.equal(soloApproachKilometers(inconnue), null, 'doit signaler l’impossibilité, pas retourner 0');
  assert.equal(chainedApproachKilometers(LYON_DELIVERY, inconnue), null);
  assert.equal(chainingBenefit(inconnue, LYON_DELIVERY), null);
  assert.deepEqual(findChainCandidates(inconnue, [LYON_DELIVERY]), []);
});

test('une mission qui démarre près d’une livraison prévue est détectée', () => {
  const candidates = findChainCandidates(NEARBY_PICKUP, [LYON_DELIVERY, FAR_PICKUP]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].candidate.id, 'm1');
  assert.ok(candidates[0].detour <= CHAINING_RADIUS_KILOMETERS);
});

test('une mission trop éloignée n’est pas proposée', () => {
  const candidates = findChainCandidates(FAR_PICKUP, [LYON_DELIVERY]);
  assert.deepEqual(candidates, []);
});

test('une mission hors de la fenêtre de dates n’est pas proposée', () => {
  const candidates = findChainCandidates(LATE_PICKUP, [LYON_DELIVERY]);
  assert.deepEqual(candidates, []);
});

test('une mission déjà livrée ne sert pas de point de chaînage', () => {
  const delivered = { ...LYON_DELIVERY, status: 'livree' };
  assert.deepEqual(findChainCandidates(NEARBY_PICKUP, [delivered]), []);
});

test('le chaînage réduit fortement les kilomètres à vide', () => {
  const solo = soloApproachKilometers(NEARBY_PICKUP);
  const chained = chainedApproachKilometers(LYON_DELIVERY, NEARBY_PICKUP);
  assert.ok(chained < solo, `${chained} doit être inférieur à ${solo}`);
  assert.ok(solo - chained > 400, `économie de ${solo - chained} km attendue au-delà de 400`);
});

test('le chaînage baisse le prix pour le client', () => {
  const benefit = chainingBenefit(NEARBY_PICKUP, LYON_DELIVERY);
  assert.ok(benefit.clientSaving > 0);
  assert.ok(benefit.chained.totalExcludingVat < benefit.solo.totalExcludingVat);
  assert.ok(benefit.emptyKilometersSaved > 400);
});

test('les paramètres du devis sont reconstituables depuis une mission', () => {
  const mission = missionFrom({
    id: 'm5',
    reference: 'CHF-2608-005',
    departure: 'Paris (75)',
    arrival: 'Lille (59)',
    pickupDate: '2026-08-12',
  });
  mission.quote = computeQuote({
    kilometers: 248,
    vehicleId: 'premium',
    urgencyId: 'express',
    scheduleId: 'samedi',
    isNightDeparture: true,
    vehicleCount: 2,
    monthlyMissions: 6,
    extraIds: ['lavage-ext'],
    approachKilometers: 248,
  });
  const input = quoteInputFrom(mission);
  assert.equal(input.vehicleId, 'premium');
  assert.equal(input.urgencyId, 'express');
  assert.equal(input.scheduleId, 'samedi');
  assert.equal(input.isNightDeparture, true);
  assert.equal(input.vehicleCount, 2);
  assert.deepEqual(input.extraIds, ['lavage-ext']);
  const rebuilt = computeQuote({ ...input, approachKilometers: 248 });
  assert.equal(rebuilt.totalExcludingVat, mission.quote.totalExcludingVat);
});

test('le taux de kilomètres à vide se calcule sur le parc de missions', () => {
  const ratio = emptyKilometreRatio([LYON_DELIVERY, NEARBY_PICKUP]);
  assert.ok(ratio > 0 && ratio < 1);
  assert.equal(emptyKilometreRatio([]), null);
});
