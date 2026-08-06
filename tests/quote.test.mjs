import assert from 'node:assert/strict';
import test from 'node:test';
import { approachPrice, computeQuote, roadBasePrice, volumeDiscountFor } from '../src/js/domain/quote.js';
import { estimateRoadDistance } from '../src/js/domain/geo.js';
import {
  APPROACH_FREE_KILOMETERS,
  APPROACH_MAX_FEE,
  APPROACH_PRICE_PER_KM,
  EXTRA_SERVICES,
  MINIMUM_FEE,
  VAT_RATE,
  VEHICLE_CATEGORIES,
  VOLUME_DISCOUNTS,
} from '../src/js/config/pricing.js';

test('un trajet court applique le forfait minimum', () => {
  assert.equal(roadBasePrice(12), MINIMUM_FEE);
  assert.equal(roadBasePrice(80), MINIMUM_FEE);
});

test('le barème est dégressif par tranche cumulée', () => {
  assert.equal(roadBasePrice(200), 230);
  assert.equal(roadBasePrice(500), 515);
  assert.equal(roadBasePrice(900), 855);
});

// Références août 2026 (comparatifs ConvoyMax / Portail Auto-Entrepreneur) :
// ~1,50 €/km sur les 200 premiers km, ~1,15 €/km au-delà chez les plateformes.
const MARKET_AVERAGE = [
  { label: 'Paris → Orléans', kilometers: 130, approach: 130, market: 195 },
  { label: 'Paris → Lille', kilometers: 248, approach: 248, market: 355 },
  { label: 'Rouen → Reims', kilometers: 230, approach: 305, market: 334 },
  { label: 'Paris → Lyon', kilometers: 471, approach: 471, market: 611 },
  { label: 'Paris → Bordeaux', kilometers: 585, approach: 585, market: 742 },
  { label: 'Lyon → Lille', kilometers: 679, approach: 726, market: 850 },
  { label: 'Paris → Marseille', kilometers: 775, approach: 775, market: 961 },
];

test('le prix reste sous la moyenne du marché sur les trajets liés à la base', () => {
  MARKET_AVERAGE.forEach((route) => {
    const quote = computeQuote({
      kilometers: route.kilometers,
      approachKilometers: route.approach,
    });
    const gap = (quote.totalExcludingVat - route.market) / route.market;
    assert.ok(
      gap <= -0.1,
      `${route.label} : ${quote.totalExcludingVat.toFixed(0)} € contre ${route.market} € au marché, soit ${(gap * 100).toFixed(0)} %`,
    );
  });
});

test('le prix ne descend jamais sous le plancher du marché', () => {
  const floors = [
    { kilometers: 130, approach: 130, floor: 128 },
    { kilometers: 248, approach: 248, floor: 240 },
    { kilometers: 471, approach: 471, floor: 426 },
    { kilometers: 775, approach: 775, floor: 670 },
  ];
  floors.forEach((route) => {
    const quote = computeQuote({
      kilometers: route.kilometers,
      approachKilometers: route.approach,
    });
    assert.ok(
      quote.totalExcludingVat >= route.floor,
      `${route.kilometers} km : ${quote.totalExcludingVat.toFixed(0)} € sous le plancher ${route.floor} €`,
    );
  });
});

test('les frais de déplacement sont plafonnés', () => {
  assert.equal(approachPrice(5000), APPROACH_MAX_FEE);
  const extreme = computeQuote({ kilometers: 570, approachKilometers: 2000 });
  assert.equal(extreme.approachTotal, APPROACH_MAX_FEE);
});

test('le prix au kilomètre baisse quand la distance augmente', () => {
  const shortTrip = roadBasePrice(200) / 200;
  const longTrip = roadBasePrice(1000) / 1000;
  assert.ok(longTrip < shortTrip, 'le tarif au km doit être dégressif');
});

test('les majorations se cumulent sur la base et non entre elles', () => {
  const quote = computeQuote({
    kilometers: 300,
    vehicleId: 'premium',
    urgencyId: 'express',
    scheduleId: 'samedi',
  });
  const expectedSurcharge = quote.base * (0.25 + 0.3 + 0.15);
  assert.ok(Math.abs(quote.surchargeTotal - expectedSurcharge) < 0.01);
  assert.equal(quote.surchargeLines.length, 3);
});

test('la TVA suit le régime configuré', () => {
  const quote = computeQuote({ kilometers: 420, vehicleId: 'citadine' });
  assert.ok(Math.abs(quote.vatAmount - quote.totalExcludingVat * VAT_RATE) < 0.01);
  assert.ok(
    Math.abs(quote.totalIncludingVat - (quote.totalExcludingVat + quote.vatAmount)) < 0.01,
  );
});

test('un second véhicule bénéficie de 10 % de remise', () => {
  const single = computeQuote({ kilometers: 300, vehicleCount: 1 });
  const double = computeQuote({ kilometers: 300, vehicleCount: 2 });
  const expected = single.totalExcludingVat * 1.9;
  assert.ok(Math.abs(double.totalExcludingVat - expected) < 0.02);
});

test('les paliers de remise volume sont atteignables par un convoyeur seul', () => {
  assert.equal(volumeDiscountFor(0), null);
  assert.equal(volumeDiscountFor(2), null);
  assert.equal(volumeDiscountFor(3).discount, 0.06);
  assert.equal(volumeDiscountFor(5).discount, 0.06);
  assert.equal(volumeDiscountFor(6).discount, 0.12);
  assert.equal(volumeDiscountFor(9).discount, 0.12);
  assert.equal(volumeDiscountFor(10).discount, 0.18);
  assert.equal(volumeDiscountFor(40).discount, 0.18);
});

test('le palier le plus haut reste réaliste pour une seule personne', () => {
  const highest = VOLUME_DISCOUNTS.at(-1);
  assert.ok(
    highest.minMonthlyMissions <= 12,
    `${highest.minMonthlyMissions} convoyages par mois est hors de portée en solo`,
  );
});

test('le catalogue ne propose plus de véhicule non roulant', () => {
  assert.equal(VEHICLE_CATEGORIES.some((category) => category.id === 'plateau'), false);
  assert.equal(
    VEHICLE_CATEGORIES.every((category) => category.surcharge >= 0),
    true,
  );
  const unwanted = ['controle-technique', 'plaques-w'];
  assert.deepEqual(
    EXTRA_SERVICES.filter((service) => unwanted.includes(service.id)),
    [],
  );
});

test('l’approche et le retour depuis la base sont facturés, franchise déduite', () => {
  const distance = 745;
  const quote = computeQuote({ kilometers: 679, approachKilometers: distance });
  const billable = distance - APPROACH_FREE_KILOMETERS;
  assert.equal(quote.approachKilometers, distance);
  assert.equal(quote.approachBillableKilometers, billable);
  assert.ok(Math.abs(quote.approachTotal - billable * APPROACH_PRICE_PER_KM) < 0.01);
});

test('les premiers kilomètres d’approche sont offerts', () => {
  const quote = computeQuote({ kilometers: 400, approachKilometers: APPROACH_FREE_KILOMETERS });
  assert.equal(quote.approachTotal, 0);
  assert.equal(quote.approachBillableKilometers, 0);
  assert.equal(approachPrice(10), 0);
  assert.equal(approachPrice(0), 0);
});

test('l’approche peut être retirée du devis', () => {
  const withApproach = computeQuote({ kilometers: 400, approachKilometers: 600 });
  const without = computeQuote({ kilometers: 400, approachKilometers: 600, includeApproach: false });
  assert.ok(withApproach.approachTotal > 0);
  assert.equal(without.approachTotal, 0);
  assert.equal(without.approachKilometers, 0);
  assert.ok(withApproach.totalExcludingVat > without.totalExcludingVat);
});

test('l’approche n’est comptée qu’une fois même pour plusieurs véhicules', () => {
  const one = computeQuote({ kilometers: 300, approachKilometers: 500, vehicleCount: 1 });
  const three = computeQuote({ kilometers: 300, approachKilometers: 500, vehicleCount: 3 });
  assert.equal(one.approachTotal, three.approachTotal);
});

test('les majorations ne s’appliquent pas aux frais d’approche', () => {
  const standard = computeQuote({ kilometers: 300, approachKilometers: 500 });
  const premium = computeQuote({
    kilometers: 300,
    approachKilometers: 500,
    vehicleId: 'premium',
    urgencyId: 'express',
  });
  assert.equal(standard.approachTotal, premium.approachTotal);
});

test('la remise volume porte aussi sur les frais d’approche', () => {
  const plain = computeQuote({ kilometers: 300, approachKilometers: 500 });
  const discounted = computeQuote({ kilometers: 300, approachKilometers: 500, monthlyMissions: 6 });
  const expected = (plain.base + plain.approachTotal) * 0.88;
  assert.ok(Math.abs(discounted.totalExcludingVat - expected) < 0.02);
});

test('le total ne descend jamais sous le forfait minimum', () => {
  const quote = computeQuote({ kilometers: 20, monthlyMissions: 200 });
  assert.ok(quote.totalExcludingVat >= MINIMUM_FEE);
});

test('une distance nulle est ramenée à un kilomètre facturable', () => {
  const quote = computeQuote({ kilometers: 0 });
  assert.equal(quote.kilometers, 1);
  assert.equal(quote.totalExcludingVat, MINIMUM_FEE);
});

test('l’estimation routière reste dans une fourchette réaliste', () => {
  const parisLyon = estimateRoadDistance('Paris (75)', 'Lyon (69)');
  assert.ok(parisLyon > 420 && parisLyon < 520, `Paris–Lyon estimé à ${parisLyon} km`);

  const parisMarseille = estimateRoadDistance('Paris (75)', 'Marseille (13)');
  assert.ok(parisMarseille > 700 && parisMarseille < 900, `Paris–Marseille estimé à ${parisMarseille} km`);

  const lyonSaintEtienne = estimateRoadDistance('Lyon (69)', 'Saint-Étienne (42)');
  assert.ok(lyonSaintEtienne > 40 && lyonSaintEtienne < 90, `Lyon–Saint-Étienne estimé à ${lyonSaintEtienne} km`);
});

test('une ville inconnue ne produit pas de distance', () => {
  assert.equal(estimateRoadDistance('Atlantide', 'Paris (75)'), null);
});

test('le départ de nuit se cumule avec la majoration du samedi', () => {
  const daytime = computeQuote({ kilometers: 300, scheduleId: 'samedi' });
  const nighttime = computeQuote({ kilometers: 300, scheduleId: 'samedi', isNightDeparture: true });
  assert.equal(daytime.surchargeLines.length, 1);
  assert.equal(nighttime.surchargeLines.length, 2);
  assert.ok(Math.abs(nighttime.surchargeTotal - daytime.base * 0.35) < 0.01);
});
