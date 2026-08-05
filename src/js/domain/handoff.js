import { computeQuote } from './quote.js';

export const HANDOFF_VERSION = 1;

const toBase64Url = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (token) => {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const checksum = (text) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};

const trimmed = (value) => String(value ?? '').trim();

export const encodeRequest = (mission) => {
  const quote = mission.quote;
  const body = {
    v: HANDOFF_VERSION,
    rid: mission.clientRequestId ?? mission.id,
    at: mission.createdAt,
    dep: mission.departure,
    arr: mission.arrival,
    q: {
      km: quote.kilometers,
      ve: quote.vehicle.id,
      ur: quote.urgency.id,
      sc: quote.schedule.id,
      ni: quote.isNightDeparture ? 1 : 0,
      vc: quote.vehicleCount,
      mm: quote.volumeTier?.minMonthlyMissions ?? 0,
      ex: quote.extras.map((service) => service.id),
      ia: quote.includeApproach ? 1 : 0,
      ak: quote.approachKilometers ?? 0,
    },
    c: {
      n: trimmed(mission.contactName),
      p: trimmed(mission.contactPhone),
      e: trimmed(mission.contactEmail),
      co: trimmed(mission.company),
      si: trimmed(mission.buyerSiren),
      ad: trimmed(mission.buyerAddressLine),
      cp: trimmed(mission.buyerPostalCode),
      ci: trimmed(mission.buyerCity),
    },
    m: {
      vm: trimmed(mission.vehicleModel),
      pl: trimmed(mission.plate),
      pd: trimmed(mission.pickupDate),
      pa: trimmed(mission.pickupAddress),
      da: trimmed(mission.dropAddress),
      no: trimmed(mission.notes),
    },
  };
  const json = JSON.stringify(body);
  return toBase64Url(JSON.stringify({ b: body, ck: checksum(json) }));
};

export const decodeRequest = (token) => {
  if (!trimmed(token)) {
    return { error: 'Ce lien ne contient aucune demande. Demandez au client de le renvoyer en entier.' };
  }

  let envelope;
  try {
    envelope = JSON.parse(fromBase64Url(token));
  } catch {
    return {
      error: 'Ce lien est incomplet ou abîmé. Il a probablement été coupé à l’envoi, demandez-le à nouveau.',
    };
  }

  const body = envelope?.b;
  if (!body || typeof body !== 'object') {
    return { error: 'Ce lien ne correspond pas à une demande de convoyage.' };
  }
  if (body.v !== HANDOFF_VERSION) {
    return {
      error: 'Ce lien vient d’une autre version de l’application. Mettez les deux appareils à jour.',
    };
  }
  if (envelope.ck !== checksum(JSON.stringify(body))) {
    return {
      error: 'Ce lien a été modifié ou tronqué en route. Demandez au client de le renvoyer.',
    };
  }
  if (!trimmed(body.dep) || !trimmed(body.arr) || !body.q?.km) {
    return { error: 'Cette demande est incomplète, il manque le trajet. Contactez le client.' };
  }

  return { request: body };
};

export const quoteFromRequest = (request) =>
  computeQuote({
    kilometers: request.q.km,
    vehicleId: request.q.ve,
    urgencyId: request.q.ur,
    scheduleId: request.q.sc,
    isNightDeparture: request.q.ni === 1,
    vehicleCount: request.q.vc,
    monthlyMissions: request.q.mm,
    extraIds: request.q.ex ?? [],
    includeApproach: request.q.ia === 1,
    approachKilometers: request.q.ak,
  });

export const missionPayloadFromRequest = (request) => ({
  clientRequestId: request.rid,
  departure: request.dep,
  arrival: request.arr,
  quote: quoteFromRequest(request),
  contactName: request.c.n,
  contactPhone: request.c.p,
  contactEmail: request.c.e,
  company: request.c.co,
  buyerSiren: request.c.si,
  buyerAddressLine: request.c.ad,
  buyerPostalCode: request.c.cp,
  buyerCity: request.c.ci,
  vehicleModel: request.m.vm,
  plate: request.m.pl,
  pickupDate: request.m.pd,
  pickupAddress: request.m.pa,
  dropAddress: request.m.da,
  notes: request.m.no,
});

export const alreadyImported = (request, missions) =>
  missions.some((mission) => mission.clientRequestId && mission.clientRequestId === request.rid);

export const handoffLink = (mission, baseUrl) => {
  const root = String(baseUrl).split('#')[0];
  return `${root}#/importer?d=${encodeRequest(mission)}`;
};
