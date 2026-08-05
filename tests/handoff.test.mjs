import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HANDOFF_VERSION,
  alreadyImported,
  decodeRequest,
  encodeRequest,
  handoffLink,
  missionPayloadFromRequest,
  quoteFromRequest,
} from '../src/js/domain/handoff.js';
import { computeQuote } from '../src/js/domain/quote.js';

const missionFixture = () => ({
  id: 'mission-1754300000000',
  clientRequestId: 'mission-1754300000000',
  createdAt: '2026-08-04T10:00:00.000Z',
  departure: 'Paris (75)',
  arrival: 'Lyon (69)',
  contactName: 'Mathis Le Goff',
  contactPhone: '06 78 90 12 34',
  contactEmail: 'mathis@garage-berthier.fr',
  company: 'Garage Berthier & Fils',
  buyerSiren: '812345678',
  buyerAddressLine: '18 rue Victor Hugo',
  buyerPostalCode: '69007',
  buyerCity: 'Lyon',
  vehicleModel: 'Peugeot 3008',
  plate: 'EG-482-QR',
  pickupDate: '2026-08-12',
  pickupAddress: '12 rue des Ateliers',
  dropAddress: '5 avenue de la Gare',
  notes: 'Clé à récupérer à l’accueil, code portail 1234',
  quote: computeQuote({
    kilometers: 478,
    vehicleId: 'suv',
    urgencyId: 'rapide',
    scheduleId: 'samedi',
    isNightDeparture: true,
    vehicleCount: 2,
    monthlyMissions: 6,
    extraIds: ['lavage-ext'],
    approachKilometers: 478,
  }),
});

test('un aller-retour encodage puis décodage conserve la demande', () => {
  const mission = missionFixture();
  const { request, error } = decodeRequest(encodeRequest(mission));
  assert.equal(error, undefined);
  assert.equal(request.v, HANDOFF_VERSION);
  assert.equal(request.dep, 'Paris (75)');
  assert.equal(request.arr, 'Lyon (69)');
  assert.equal(request.c.co, 'Garage Berthier & Fils');
  assert.equal(request.m.pl, 'EG-482-QR');
  assert.equal(request.m.no, 'Clé à récupérer à l’accueil, code portail 1234');
});

test('les accents et les caractères spéciaux traversent le lien', () => {
  const mission = missionFixture();
  mission.contactName = 'Mémé Chanfiou & Cie <75>';
  mission.notes = 'Créneau après 17h, portail à côté du café';
  const { request } = decodeRequest(encodeRequest(mission));
  assert.equal(request.c.n, 'Mémé Chanfiou & Cie <75>');
  assert.equal(request.m.no, 'Créneau après 17h, portail à côté du café');
});

test('le devis se recalcule à l’identique chez le convoyeur', () => {
  const mission = missionFixture();
  const { request } = decodeRequest(encodeRequest(mission));
  const recalcule = quoteFromRequest(request);
  assert.equal(recalcule.totalExcludingVat, mission.quote.totalExcludingVat);
  assert.equal(recalcule.vehicle.id, 'suv');
  assert.equal(recalcule.urgency.id, 'rapide');
  assert.equal(recalcule.schedule.id, 'samedi');
  assert.equal(recalcule.isNightDeparture, true);
  assert.equal(recalcule.vehicleCount, 2);
  assert.equal(recalcule.approachKilometers, 478);
  assert.deepEqual(
    recalcule.extras.map((service) => service.id),
    ['lavage-ext'],
  );
});

test('la charge utile du lien reste transmissible par SMS', () => {
  const token = encodeRequest(missionFixture());
  assert.ok(token.length < 900, `${token.length} caractères, trop long pour un message`);
  assert.match(token, /^[A-Za-z0-9_-]+$/, 'le jeton doit être sûr dans une URL');
});

test('un lien tronqué est refusé avec une explication claire', () => {
  const token = encodeRequest(missionFixture());
  const { error } = decodeRequest(token.slice(0, Math.floor(token.length * 0.8)));
  assert.ok(error);
  assert.match(error, /coupé|abîmé|tronqué|modifié/);
});

test('un lien altéré est détecté par la somme de contrôle', () => {
  const mission = missionFixture();
  const token = encodeRequest(mission);
  const decode = JSON.parse(
    Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  );
  decode.b.q.km = 50;
  const falsifie = Buffer.from(JSON.stringify(decode), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const { error } = decodeRequest(falsifie);
  assert.match(error, /modifié|tronqué/);
});

test('un lien vide ou étranger est refusé', () => {
  assert.match(decodeRequest('').error, /aucune demande/);
  assert.match(decodeRequest('   ').error, /aucune demande/);
  assert.ok(decodeRequest('nimportequoi').error);
});

test('une demande sans trajet est refusée', () => {
  const mission = missionFixture();
  mission.departure = '';
  const { error } = decodeRequest(encodeRequest(mission));
  assert.match(error, /incomplète/);
});

test('la charge de mission reconstruit tous les champs client', () => {
  const { request } = decodeRequest(encodeRequest(missionFixture()));
  const payload = missionPayloadFromRequest(request);
  assert.equal(payload.company, 'Garage Berthier & Fils');
  assert.equal(payload.buyerSiren, '812345678');
  assert.equal(payload.buyerPostalCode, '69007');
  assert.equal(payload.pickupDate, '2026-08-12');
  assert.equal(payload.dropAddress, '5 avenue de la Gare');
  assert.ok(payload.quote.totalExcludingVat > 0);
  assert.equal(payload.clientRequestId, 'mission-1754300000000');
});

test('une demande déjà importée est reconnue, pas de doublon', () => {
  const { request } = decodeRequest(encodeRequest(missionFixture()));
  const dejaLa = [{ id: 'autre', clientRequestId: 'mission-1754300000000' }];
  assert.equal(alreadyImported(request, dejaLa), true);
  assert.equal(alreadyImported(request, [{ id: 'x', clientRequestId: 'autre-id' }]), false);
  assert.equal(alreadyImported(request, [{ id: 'x' }]), false);
  assert.equal(alreadyImported(request, []), false);
});

test('le lien pointe sur la route d’import quelle que soit la page courante', () => {
  const mission = missionFixture();
  const lien = handoffLink(mission, 'https://chanfiou.netlify.app/index.html#/demande');
  assert.ok(lien.startsWith('https://chanfiou.netlify.app/index.html#/importer?d='));
  const jeton = lien.split('d=')[1];
  assert.equal(decodeRequest(jeton).error, undefined);
});
