import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CREDIT_REASONS,
  buildCreditNote,
  creditedAmountFor,
  isFullyCredited,
  nextCreditNoteNumber,
  remainingCreditable,
} from '../src/js/domain/credit-note.js';
import { buildInvoiceFromMissions } from '../src/js/domain/invoice.js';
import { computeQuote } from '../src/js/domain/quote.js';
import { buildFacturXXml } from '../src/js/domain/facturx.js';

const SCHEMA_DIR = path.join(import.meta.dirname, 'schema');
const XSD = path.join(SCHEMA_DIR, 'Factur-X_BASIC.xsd');
const SCHEMATRON = path.join(SCHEMA_DIR, 'Factur-X_1.09_BASIC.xsl');
const RUNNER = path.join(import.meta.dirname, 'schematron.py');

const AOUT = '2026-08-04T10:00:00.000Z';
const SEPTEMBRE = '2026-09-02T10:00:00.000Z';

const hasTool = (tool) => {
  try {
    execFileSync('which', [tool], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const hasSchematron = () => {
  try {
    execFileSync('python3', ['-c', 'import saxonche'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const writeTemp = (xml) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'avoir-'));
  const file = path.join(directory, 'document.xml');
  writeFileSync(file, xml, 'utf8');
  return file;
};

const factureFixture = () => {
  const quote = computeQuote({
    kilometers: 478,
    vehicleId: 'suv',
    monthlyMissions: 6,
    extraIds: ['lavage-ext'],
    approachKilometers: 478,
  });
  const mission = {
    id: 'm1',
    reference: 'CHF-2608-001',
    departure: 'Paris (75)',
    arrival: 'Lyon (69)',
    pickupDate: '2026-08-05',
    company: 'Garage Berthier',
    contactName: 'Garage Berthier',
    buyerSiren: '812345678',
    buyerAddressLine: '18 rue Victor Hugo',
    buyerPostalCode: '69007',
    buyerCity: 'Lyon',
    quote,
  };
  const facture = buildInvoiceFromMissions([mission], [], AOUT);
  facture.seller = {
    name: 'Chanfiou Entreprise',
    legalForm: 'Entreprise individuelle',
    siret: '73282932000074',
    vatNumber: '',
    addressLine: '8 rue de Belleville',
    postalCode: '75020',
    city: 'Paris',
    countryCode: 'FR',
    email: 'contact@chanfiou-convoyage.fr',
    iban: 'FR7630006000011234567890189',
    bic: '',
  };
  return facture;
};

test('la numérotation des avoirs est propre, continue et annuelle', () => {
  assert.equal(nextCreditNoteNumber([], AOUT), 'AV-2026-0001');
  assert.equal(nextCreditNoteNumber([{ number: 'AV-2026-0003' }], AOUT), 'AV-2026-0004');
  assert.equal(nextCreditNoteNumber([{ number: 'AV-2025-0009' }], AOUT), 'AV-2026-0001');
  assert.equal(nextCreditNoteNumber([{ number: 'AV-2026-0009' }], SEPTEMBRE), 'AV-2026-0010');
});

test('la série des avoirs est distincte de celle des factures', () => {
  const numero = nextCreditNoteNumber([{ number: 'FA-2026-0042' }], AOUT);
  assert.equal(numero, 'AV-2026-0001', 'une facture ne doit pas décaler la série des avoirs');
});

test('un avoir total reprend le montant complet de la facture', () => {
  const facture = factureFixture();
  const avoir = buildCreditNote(facture, { reason: 'Mission annulée', isPartial: false }, [], AOUT);
  assert.equal(avoir.documentType, 'avoir');
  assert.equal(avoir.totals.duePayable, facture.totals.duePayable);
  assert.equal(avoir.lines.length, facture.lines.length);
  assert.equal(avoir.isPartial, false);
});

test('un avoir partiel ne porte que le montant saisi', () => {
  const facture = factureFixture();
  const avoir = buildCreditNote(facture, { reason: 'Geste commercial', amount: 80, isPartial: true }, [], AOUT);
  assert.equal(avoir.totals.duePayable, 80);
  assert.equal(avoir.lines.length, 1);
  assert.ok(avoir.lines[0].description.includes(facture.number));
  assert.ok(avoir.lines[0].description.includes('Geste commercial'));
});

test('un avoir référence toujours la facture d’origine et son motif', () => {
  const facture = factureFixture();
  const avoir = buildCreditNote(facture, { reason: 'Erreur de tarif', isPartial: false }, [], AOUT);
  assert.equal(avoir.invoiceNumber, facture.number);
  assert.equal(avoir.invoiceIssuedAt, facture.issuedAt);
  assert.equal(avoir.reason, 'Erreur de tarif');
});

test('un avoir ne porte ni pénalité de retard ni indemnité de recouvrement', () => {
  const avoir = buildCreditNote(factureFixture(), { reason: 'Annulation', isPartial: false }, [], AOUT);
  assert.equal(avoir.latePenaltyMention, '');
  assert.equal(avoir.recoveryIndemnityMention, '');
  assert.equal(avoir.noDiscountMention, '');
});

test('le montant crédité s’accumule et borne le reste créditable', () => {
  const facture = factureFixture();
  const premier = buildCreditNote(facture, { reason: 'Geste', amount: 100, isPartial: true }, [], AOUT);
  const second = buildCreditNote(facture, { reason: 'Litige', amount: 50, isPartial: true }, [premier], AOUT);
  const notes = [premier, second];

  assert.equal(creditedAmountFor(facture.id, notes), 150);
  assert.equal(remainingCreditable(facture, notes), Math.round((facture.totals.duePayable - 150) * 100) / 100);
  assert.equal(isFullyCredited(facture, notes), false);
});

test('une facture entièrement créditée est détectée', () => {
  const facture = factureFixture();
  const avoir = buildCreditNote(facture, { reason: 'Annulation', isPartial: false }, [], AOUT);
  assert.equal(isFullyCredited(facture, [avoir]), true);
  assert.ok(remainingCreditable(facture, [avoir]) <= 0.01);
});

test('les avoirs d’une autre facture ne sont pas comptés', () => {
  const facture = factureFixture();
  const autre = { ...facture, id: 'invoice-autre' };
  const avoir = buildCreditNote(autre, { reason: 'Annulation', isPartial: false }, [], AOUT);
  assert.equal(creditedAmountFor(facture.id, [avoir]), 0);
  assert.equal(isFullyCredited(facture, [avoir]), false);
});

test('les motifs proposés couvrent les cas courants', () => {
  const identifiants = CREDIT_REASONS.map((reason) => reason.id);
  assert.ok(identifiants.includes('annulation'));
  assert.ok(identifiants.includes('erreur-tarif'));
  assert.ok(identifiants.includes('autre'));
  assert.equal(new Set(identifiants).size, identifiants.length);
});

test('le XML d’un avoir porte le code de type 381 et la facture référencée', () => {
  const avoir = buildCreditNote(factureFixture(), { reason: 'Annulation', isPartial: false }, [], AOUT);
  const xml = buildFacturXXml(avoir);
  assert.ok(xml.includes('<ram:TypeCode>381</ram:TypeCode>'));
  assert.ok(!xml.includes('<ram:TypeCode>380</ram:TypeCode>'));
  assert.ok(xml.includes('<ram:InvoiceReferencedDocument>'));
  assert.ok(xml.includes('<ram:IssuerAssignedID>FA-2026-0001</ram:IssuerAssignedID>'));
  assert.ok(xml.includes('<qdt:DateTimeString format="102">20260804</qdt:DateTimeString>'));
  assert.ok(xml.includes('Avoir sur la facture FA-2026-0001'));
});

test('les montants d’un avoir restent positifs, le code de type porte le sens', () => {
  const avoir = buildCreditNote(factureFixture(), { reason: 'Annulation', isPartial: false }, [], AOUT);
  const xml = buildFacturXXml(avoir);
  assert.ok(!/>-\d/.test(xml), 'aucun montant négatif attendu dans un avoir EN 16931');
  assert.ok(avoir.totals.duePayable > 0);
});

test('une facture porte toujours le code 380', () => {
  const xml = buildFacturXXml(factureFixture());
  assert.ok(xml.includes('<ram:TypeCode>380</ram:TypeCode>'));
  assert.ok(!xml.includes('<ram:InvoiceReferencedDocument>'));
});

test('un avoir total est valide au schéma et aux règles EN 16931', (context) => {
  if (!hasTool('xmllint') || !hasSchematron()) {
    context.skip('outils de validation absents');
    return;
  }
  const avoir = buildCreditNote(factureFixture(), { reason: 'Mission annulée', isPartial: false }, [], AOUT);
  const xml = buildFacturXXml(avoir);
  const file = writeTemp(xml);
  const sortie = execFileSync('xmllint', ['--noout', '--schema', XSD, file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.doesNotMatch(sortie, /error/i);
  const rapport = execFileSync('python3', [RUNNER, SCHEMATRON, file], { encoding: 'utf8' });
  assert.deepEqual(rapport.split('\n').map((l) => l.trim()).filter(Boolean), []);
});

test('un avoir partiel est valide au schéma et aux règles EN 16931', (context) => {
  if (!hasTool('xmllint') || !hasSchematron()) {
    context.skip('outils de validation absents');
    return;
  }
  const avoir = buildCreditNote(factureFixture(), { reason: 'Geste commercial', amount: 80, isPartial: true }, [], AOUT);
  const xml = buildFacturXXml(avoir);
  const file = writeTemp(xml);
  const sortie = execFileSync('xmllint', ['--noout', '--schema', XSD, file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.doesNotMatch(sortie, /error/i);
  const rapport = execFileSync('python3', [RUNNER, SCHEMATRON, file], { encoding: 'utf8' });
  assert.deepEqual(rapport.split('\n').map((l) => l.trim()).filter(Boolean), []);
});
