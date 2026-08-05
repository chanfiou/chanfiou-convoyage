import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildFacturXXml, facturXFileName, toBasicDate } from '../src/js/domain/facturx.js';
import {
  buildInvoiceAllowances,
  buildInvoiceLines,
  computeInvoiceTotals,
} from '../src/js/domain/invoice.js';
import { computeQuote } from '../src/js/domain/quote.js';

const SCHEMA_DIR = path.join(import.meta.dirname, 'schema');
const XSD = path.join(SCHEMA_DIR, 'Factur-X_BASIC.xsd');
const SCHEMATRON = path.join(SCHEMA_DIR, 'Factur-X_1.09_BASIC.xsl');
const SCHEMATRON_RUNNER = path.join(import.meta.dirname, 'schematron.py');

const hasTool = (tool) => {
  try {
    execFileSync('which', [tool], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const invoiceFixture = (overrides = {}) => {
  const quote = computeQuote({
    kilometers: 679,
    vehicleId: 'suv',
    urgencyId: 'rapide',
    monthlyMissions: 30,
    extraIds: ['lavage-ext'],
    approachKilometers: 745,
  });
  const mission = {
    reference: 'CHF-2608-001',
    departure: 'Lyon (69)',
    arrival: 'Lille (59)',
    pickupDate: '2026-08-12',
    quote,
  };
  const lines = buildInvoiceLines(mission);
  const allowances = buildInvoiceAllowances(mission);

  return {
    number: 'FA-2026-0001',
    missionReference: mission.reference,
    issuedAt: '2026-08-04T10:00:00.000Z',
    dueAt: '2026-09-03T10:00:00.000Z',
    deliveredAt: '2026-08-12T10:00:00.000Z',
    operationNature: 'Prestation de services',
    vatMention: 'TVA non applicable, article 293 B du CGI',
    latePenaltyMention: 'Pénalité de retard calculée sur la base de trois fois le taux légal.',
    recoveryIndemnityMention: 'Indemnité forfaitaire de recouvrement : 40 €.',
    noDiscountMention: 'Pas d’escompte pour paiement anticipé.',
    paymentTerms: 'Paiement à 30 jours nets',
    deliveryAddress: 'Lille (59)',
    seller: {
      name: 'Chanfiou Entreprise & Fils',
      legalForm: 'Entreprise individuelle',
      siret: '73282932000074',
      vatNumber: '',
      addressLine: '12 rue des Ateliers',
      postalCode: '69003',
      city: 'Lyon',
      countryCode: 'FR',
      email: 'contact@chanfiou-convoyage.fr',
      phone: '0600000000',
      iban: 'FR7630006000011234567890189',
      bic: 'AGRIFRPP',
    },
    buyer: {
      name: 'Garage Berthier <SARL>',
      siren: '732829320',
      addressLine: '5 avenue de la Gare',
      postalCode: '13001',
      city: 'Marseille',
      countryCode: 'FR',
      email: 'contact@garage-berthier.fr',
    },
    lines,
    allowances,
    totals: computeInvoiceTotals(lines, allowances),
    ...overrides,
  };
};

const writeTemp = (xml) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'facturx-'));
  const file = path.join(directory, 'invoice.xml');
  writeFileSync(file, xml, 'utf8');
  return file;
};

test('les dates sont converties au format 102 attendu', () => {
  assert.equal(toBasicDate('2026-08-04T10:00:00.000Z'), '20260804');
  assert.equal(toBasicDate('2026-01-09T23:00:00.000Z'), '20260110');
});

test('le nom de fichier est sûr pour un dépôt sur la plateforme', () => {
  assert.equal(facturXFileName({ number: 'FA-2026-0001' }), 'FA-2026-0001-facturx.xml');
  assert.equal(facturXFileName({ number: 'FA/2026 0001' }), 'FA20260001-facturx.xml');
});

test('le XML porte le profil BASIC et l’exonération de TVA française', () => {
  const xml = buildFacturXXml(invoiceFixture());
  assert.ok(xml.includes('urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic'));
  assert.ok(xml.includes('<ram:ExemptionReasonCode>VATEX-FR-FRANCHISE</ram:ExemptionReasonCode>'));
  assert.ok(xml.includes('<ram:CategoryCode>E</ram:CategoryCode>'));
  assert.ok(xml.includes('<ram:TypeCode>380</ram:TypeCode>'));
});

test('le XML porte les mentions obligatoires et le SIREN des deux parties', () => {
  const xml = buildFacturXXml(invoiceFixture());
  assert.ok(xml.includes('<ram:ID schemeID="0002">732829320</ram:ID>'));
  assert.ok(xml.includes('Nature de l’opération : Prestation de services'));
  assert.ok(xml.includes('Indemnité forfaitaire de recouvrement'));
  assert.ok(xml.includes('<ram:IBANID>FR7630006000011234567890189</ram:IBANID>'));
});

test('les caractères spéciaux des raisons sociales sont échappés', () => {
  const xml = buildFacturXXml(invoiceFixture());
  assert.ok(xml.includes('Chanfiou Entreprise &amp; Fils'));
  assert.ok(xml.includes('Garage Berthier &lt;SARL&gt;'));
  assert.ok(!xml.includes('Berthier <SARL>'));
});

test('les totaux du XML sont cohérents avec les lignes et les remises', () => {
  const invoice = invoiceFixture();
  const xml = buildFacturXXml(invoice);
  const { totals } = invoice;
  assert.ok(xml.includes(`<ram:LineTotalAmount>${totals.lineTotal.toFixed(2)}</ram:LineTotalAmount>`));
  assert.ok(
    xml.includes(`<ram:AllowanceTotalAmount>${totals.allowanceTotal.toFixed(2)}</ram:AllowanceTotalAmount>`),
  );
  assert.ok(xml.includes(`<ram:TaxBasisTotalAmount>${totals.taxBasis.toFixed(2)}</ram:TaxBasisTotalAmount>`));
  assert.ok(xml.includes(`<ram:GrandTotalAmount>${totals.taxBasis.toFixed(2)}</ram:GrandTotalAmount>`));
  assert.ok(xml.includes('<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>'));
  assert.ok(Math.abs(totals.lineTotal - totals.allowanceTotal - totals.taxBasis) < 0.005);
  assert.equal(totals.taxBasis, Math.round(totals.taxBasis * 100) / 100, 'la base est arrondie au centime');
});

test('aucun prix de ligne n’est négatif, la remise est au niveau du document', () => {
  const invoice = invoiceFixture();
  assert.ok(invoice.lines.every((line) => line.unitPrice >= 0), 'BR-27 interdit un prix négatif');
  assert.ok(invoice.allowances.length > 0);
  const xml = buildFacturXXml(invoice);
  assert.ok(xml.includes('<ram:SpecifiedTradeAllowanceCharge>'));
  assert.ok(!/<ram:ChargeAmount>-/.test(xml));
});

test('un identifiant fiscal vendeur est présent malgré l’absence de TVA', () => {
  const xml = buildFacturXXml(invoiceFixture());
  assert.ok(xml.includes('<ram:ID schemeID="FC">73282932000074</ram:ID>'), 'BR-E-02 exige un identifiant fiscal');
});

test('une facture sans IBAN reste bien formée', () => {
  const invoice = invoiceFixture();
  invoice.seller.iban = '';
  const xml = buildFacturXXml(invoice);
  assert.ok(!xml.includes('SpecifiedTradeSettlementPaymentMeans'));
  assert.ok(xml.includes('</rsm:CrossIndustryInvoice>'));
});

test('le XML est valide au regard du schéma officiel Factur-X BASIC', (context) => {
  if (!hasTool('xmllint')) {
    context.skip('xmllint absent de cet environnement');
    return;
  }
  const file = writeTemp(buildFacturXXml(invoiceFixture()));
  const output = execFileSync('xmllint', ['--noout', '--schema', XSD, file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.doesNotMatch(output, /error/i);
});

const runSchematron = (xml) => {
  const file = writeTemp(xml);
  const output = execFileSync('python3', [SCHEMATRON_RUNNER, SCHEMATRON, file], {
    encoding: 'utf8',
  });
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
};

const hasSchematronRunner = () => {
  try {
    execFileSync('python3', ['-c', 'import saxonche'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

test('le XML respecte toutes les règles métier EN 16931', (context) => {
  if (!hasSchematronRunner()) {
    context.skip('saxonche absent, XSLT 2.0 requis pour le schematron');
    return;
  }
  assert.deepEqual(runSchematron(buildFacturXXml(invoiceFixture())), []);
});

test('une facture sans remise ni IBAN respecte aussi les règles métier', (context) => {
  if (!hasSchematronRunner()) {
    context.skip('saxonche absent, XSLT 2.0 requis pour le schematron');
    return;
  }
  const invoice = invoiceFixture();
  invoice.allowances = [];
  invoice.seller.iban = '';
  invoice.totals = computeInvoiceTotals(invoice.lines, []);
  assert.deepEqual(runSchematron(buildFacturXXml(invoice)), []);
});

test('une facture sans SIREN client reste valide au schéma', (context) => {
  if (!hasTool('xmllint')) {
    context.skip('xmllint absent de cet environnement');
    return;
  }
  const invoice = invoiceFixture();
  invoice.buyer.siren = '';
  const file = writeTemp(buildFacturXXml(invoice));
  const output = execFileSync('xmllint', ['--noout', '--schema', XSD, file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.doesNotMatch(output, /error/i);
});

test('une facture groupée multi-missions reste conforme au schéma et aux règles', (context) => {
  if (!hasTool('xmllint') || !hasSchematronRunner()) {
    context.skip('outils de validation absents');
    return;
  }
  const base = invoiceFixture();
  const groupee = {
    ...base,
    missionReferences: ['CHF-2608-001', 'CHF-2608-002'],
    missionReference: '2 missions groupées',
    lines: [
      ...base.lines.map((line) => ({ ...line, description: `CHF-2608-001 — ${line.description}` })),
      ...base.lines.map((line) => ({ ...line, description: `CHF-2608-002 — ${line.description}` })),
    ],
    allowances: base.allowances.map((allowance) => ({
      ...allowance,
      reason: `${allowance.reason} (CHF-2608-001)`,
    })),
  };
  groupee.totals = computeInvoiceTotals(groupee.lines, groupee.allowances);

  const xml = buildFacturXXml(groupee);
  const file = writeTemp(xml);
  const sortie = execFileSync('xmllint', ['--noout', '--schema', XSD, file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.doesNotMatch(sortie, /error/i);
  assert.deepEqual(runSchematron(xml), []);
  assert.ok(xml.includes('<ram:LineID>8</ram:LineID>'), 'les lignes des deux missions doivent être numérotées en continu');
});
