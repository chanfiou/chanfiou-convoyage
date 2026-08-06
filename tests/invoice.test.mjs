import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInvoiceAllowances,
  buildInvoiceFromMissions,
  buildInvoiceLines,
  groupInvoiceableMissions,
  invoiceCoversMission,
  computeInvoiceTotals,
  isInvoiceOverdue,
  nextInvoiceNumber,
} from '../src/js/domain/invoice.js';
import { isSirenValid, isSiretValid, sirenFromSiret } from '../src/js/config/settings.js';
import { computeQuote } from '../src/js/domain/quote.js';
import { VAT_EXEMPT } from '../src/js/config/pricing.js';

const AUGUST = '2026-08-04T10:00:00.000Z';

const missionFixture = () => ({
  id: 'mission-1',
  reference: 'CHF-2608-001',
  departure: 'Lyon (69)',
  arrival: 'Lille (59)',
  pickupDate: '2026-08-12',
  quote: computeQuote({
    kilometers: 679,
    vehicleId: 'suv',
    urgencyId: 'rapide',
    monthlyMissions: 30,
    extraIds: ['lavage-ext'],
    approachKilometers: 745,
  }),
});

test('la numérotation des factures est continue et annuelle', () => {
  assert.equal(nextInvoiceNumber([], AUGUST), 'FA-2026-0001');
  assert.equal(nextInvoiceNumber([{ number: 'FA-2026-0007' }], AUGUST), 'FA-2026-0008');
  assert.equal(nextInvoiceNumber([{ number: 'FA-2025-0099' }], AUGUST), 'FA-2026-0001');
});

test('la numérotation ne produit jamais de doublon en série', () => {
  const invoices = [];
  for (let index = 0; index < 15; index += 1) {
    invoices.push({ number: nextInvoiceNumber(invoices, AUGUST) });
  }
  const numbers = invoices.map((invoice) => invoice.number);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.equal(numbers.at(-1), 'FA-2026-0015');
});

test('lignes et remises reconstituent exactement le total du devis', () => {
  const mission = missionFixture();
  const totals = computeInvoiceTotals(buildInvoiceLines(mission), buildInvoiceAllowances(mission));
  assert.ok(Math.abs(totals.taxBasis - mission.quote.totalExcludingVat) < 0.02);
});

test('chaque majoration et remise apparaît sur une ligne distincte', () => {
  const lines = buildInvoiceLines(missionFixture());
  const descriptions = lines.map((line) => line.description);
  assert.ok(descriptions.some((text) => text.startsWith('Convoyage par la route')));
  assert.ok(descriptions.some((text) => text.includes('Majoration')));
  assert.ok(descriptions.some((text) => text.includes('Lavage extérieur')));
  assert.ok(descriptions.some((text) => text.includes('Frais d’approche et de retour depuis Paris')));
  assert.ok(lines.every((line) => line.unitPrice >= 0), 'aucun prix de ligne négatif');
  const allowances = buildInvoiceAllowances(missionFixture());
  assert.equal(allowances.length, 1);
  assert.ok(allowances[0].reason.startsWith('Remise commerciale'));
  assert.ok(allowances[0].amount > 0);
});

test('en franchise en base aucune TVA n’est calculée', () => {
  assert.equal(VAT_EXEMPT, true);
  const totals = computeInvoiceTotals([{ quantity: 1, unitPrice: 500 }], [{ reason: 'Remise', amount: 50 }]);
  assert.equal(totals.taxAmount, 0);
  assert.equal(totals.taxBasis, 450);
  assert.equal(totals.grandTotal, 450);
  assert.equal(totals.duePayable, totals.taxBasis);
});

test('une facture échue non payée est signalée en retard', () => {
  const reference = new Date('2026-08-04T00:00:00.000Z');
  assert.equal(isInvoiceOverdue({ status: 'emise', dueAt: '2026-07-01' }, reference), true);
  assert.equal(isInvoiceOverdue({ status: 'emise', dueAt: '2026-09-01' }, reference), false);
  assert.equal(isInvoiceOverdue({ status: 'payee', dueAt: '2026-07-01' }, reference), false);
});

test('le SIRET est contrôlé par la clé de Luhn', () => {
  assert.equal(isSiretValid('73282932000074'), true);
  assert.equal(isSiretValid('732 829 320 00074'), true);
  assert.equal(isSiretValid('73282932000075'), false);
  assert.equal(isSiretValid('7328293200007'), false);
  assert.equal(isSiretValid(''), false);
});

test('le SIREN est contrôlé par la clé de Luhn', () => {
  assert.equal(isSirenValid('732829320'), true);
  assert.equal(isSirenValid('732829321'), false);
  assert.equal(isSirenValid('73282932'), false);
});

test('le SIREN est extrait des neuf premiers chiffres du SIRET', () => {
  assert.equal(sirenFromSiret('73282932000074'), '732829320');
  assert.equal(sirenFromSiret('732 829 320 00074'), '732829320');
});

test('une facture groupée regroupe plusieurs missions du même client', () => {
  const premiere = { ...missionFixture(), id: 'm1', reference: 'CHF-2608-001' };
  const seconde = { ...missionFixture(), id: 'm2', reference: 'CHF-2608-002' };
  const facture = buildInvoiceFromMissions([premiere, seconde], [], AUGUST);

  assert.deepEqual(facture.missionIds, ['m1', 'm2']);
  assert.deepEqual(facture.missionReferences, ['CHF-2608-001', 'CHF-2608-002']);
  assert.ok(facture.lines.every((line) => /^CHF-2608-00[12] — /.test(line.description)));
  const unitaire = buildInvoiceFromMissions([premiere], [], AUGUST);
  assert.ok(Math.abs(facture.totals.taxBasis - unitaire.totals.taxBasis * 2) < 0.05);
});

test('une facture unitaire ne préfixe pas ses lignes', () => {
  const facture = buildInvoiceFromMissions([{ ...missionFixture(), id: 'm1', reference: 'CHF-2608-001' }], [], AUGUST);
  assert.equal(facture.missionReference, 'CHF-2608-001');
  assert.ok(facture.lines.every((line) => !line.description.startsWith('CHF-')));
});

test('les missions sont regroupées par client et par mois', () => {
  const missions = [
    { id: 'a', reference: 'R1', status: 'livree', company: 'Garage Nord', pickupDate: '2026-08-03', quote: { totalExcludingVat: 300 } },
    { id: 'b', reference: 'R2', status: 'livree', company: 'Garage Nord', pickupDate: '2026-08-19', quote: { totalExcludingVat: 200 } },
    { id: 'c', reference: 'R3', status: 'livree', company: 'Garage Nord', pickupDate: '2026-09-02', quote: { totalExcludingVat: 250 } },
    { id: 'd', reference: 'R4', status: 'livree', company: 'Loueur Sud', pickupDate: '2026-08-11', quote: { totalExcludingVat: 400 } },
    { id: 'e', reference: 'R5', status: 'confirmee', company: 'Garage Nord', pickupDate: '2026-08-25', quote: { totalExcludingVat: 100 } },
    { id: 'f', reference: 'R6', status: 'demande', company: 'Garage Nord', pickupDate: '2026-08-27', quote: { totalExcludingVat: 150 } },
  ];
  const groupes = groupInvoiceableMissions(missions, []);
  const aout = groupes.find((g) => g.client === 'Garage Nord' && g.period === '2026-08');
  assert.equal(aout.missions.length, 3, 'les missions confirmées ou livrées d’août, pas les demandes');
  assert.ok(groupes.some((g) => g.client === 'Garage Nord' && g.period === '2026-09'));
  assert.ok(groupes.some((g) => g.client === 'Loueur Sud'));
  assert.equal(groupes.reduce((sum, g) => sum + g.missions.length, 0), 5);
});

test('une mission déjà facturée sort des regroupements', () => {
  const missions = [
    { id: 'a', reference: 'R1', status: 'livree', company: 'Garage Nord', pickupDate: '2026-08-03', quote: { totalExcludingVat: 300 } },
    { id: 'b', reference: 'R2', status: 'livree', company: 'Garage Nord', pickupDate: '2026-08-19', quote: { totalExcludingVat: 200 } },
  ];
  const factures = [{ missionIds: ['a'] }];
  const groupes = groupInvoiceableMissions(missions, factures);
  assert.equal(groupes.length, 1);
  assert.deepEqual(groupes[0].missions.map((m) => m.id), ['b']);
});

test('la couverture d’une mission fonctionne sur les anciennes factures', () => {
  assert.equal(invoiceCoversMission({ missionId: 'a' }, 'a'), true);
  assert.equal(invoiceCoversMission({ missionId: 'a' }, 'b'), false);
  assert.equal(invoiceCoversMission({ missionIds: ['a', 'b'] }, 'b'), true);
});
