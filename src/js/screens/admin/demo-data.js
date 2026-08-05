import { getState, setState } from '../../core/store.js';
import { nextReference } from '../../domain/mission.js';
import { computeQuote } from '../../domain/quote.js';
import { estimateRoadDistance } from '../../domain/geo.js';
import { HOME_BASE } from '../../config/pricing.js';

const approachFor = (departure, arrival) =>
  (estimateRoadDistance(HOME_BASE.label, departure) ?? 0) +
  (estimateRoadDistance(arrival, HOME_BASE.label) ?? 0);

const SEED_MISSIONS = [
  {
    departure: 'Paris (75)',
    arrival: 'Lyon (69)',
    contactName: 'Garage Berthier',
    buyerSiren: '812345678',
    buyerAddressLine: '18 rue Victor Hugo',
    buyerPostalCode: '69007',
    buyerCity: 'Lyon',
    contactPhone: '04 72 11 22 33',
    vehicleModel: 'Peugeot 3008',
    plate: 'EG-482-QR',
    status: 'confirmee',
    dayOffset: 1,
    input: { kilometers: 478, vehicleId: 'suv', urgencyId: 'standard', scheduleId: 'semaine', vehicleCount: 1, monthlyMissions: 6, extraIds: ['lavage-ext'] },
  },
  {
    departure: 'Villeurbanne (69)',
    arrival: 'Marseille (13)',
    contactName: 'Garage Berthier',
    buyerSiren: '812345678',
    buyerAddressLine: '18 rue Victor Hugo',
    buyerPostalCode: '69007',
    buyerCity: 'Lyon',
    contactPhone: '04 72 11 22 33',
    vehicleModel: 'Renault Captur',
    plate: 'FL-201-TB',
    status: 'demande',
    dayOffset: 2,
    input: { kilometers: 316, vehicleId: 'citadine', urgencyId: 'standard', scheduleId: 'semaine', vehicleCount: 1, monthlyMissions: 6, extraIds: [] },
  },
  {
    departure: 'Paris (75)',
    arrival: 'Lille (59)',
    contactName: 'Concession Nord Auto',
    buyerSiren: '552081317',
    buyerAddressLine: '240 avenue de Dunkerque',
    buyerPostalCode: '59000',
    buyerCity: 'Lille',
    contactPhone: '01 45 67 89 10',
    vehicleModel: 'BMW Série 5',
    plate: 'GK-770-ZZ',
    status: 'livree',
    dayOffset: -6,
    input: { kilometers: 248, vehicleId: 'premium', urgencyId: 'express', scheduleId: 'semaine', vehicleCount: 1, monthlyMissions: 6, extraIds: ['lavage-complet'] },
  },
  {
    departure: 'Roubaix (59)',
    arrival: 'Paris (75)',
    contactName: 'Concession Nord Auto',
    buyerSiren: '552081317',
    buyerAddressLine: '240 avenue de Dunkerque',
    buyerPostalCode: '59000',
    buyerCity: 'Lille',
    contactPhone: '01 45 67 89 10',
    vehicleModel: 'BMW Série 3',
    plate: 'GK-771-ZZ',
    status: 'livree',
    dayOffset: -4,
    input: { kilometers: 232, vehicleId: 'premium', urgencyId: 'standard', scheduleId: 'semaine', vehicleCount: 1, monthlyMissions: 6, extraIds: [] },
  },
  {
    departure: 'Bordeaux (33)',
    arrival: 'Nantes (44)',
    contactName: 'Loueur Atlantique',
    buyerSiren: '443061841',
    buyerAddressLine: '7 quai de la Fosse',
    buyerPostalCode: '44000',
    buyerCity: 'Nantes',
    contactPhone: '05 56 44 88 12',
    vehicleModel: 'Renault Clio',
    plate: 'FT-119-AB',
    status: 'en-cours',
    dayOffset: -1,
    input: { kilometers: 340, vehicleId: 'citadine', urgencyId: 'rapide', scheduleId: 'semaine', vehicleCount: 2, monthlyMissions: 3, extraIds: [] },
  },
  {
    departure: 'Toulouse (31)',
    arrival: 'Montpellier (34)',
    contactName: 'Carrosserie Occitane',
    buyerSiren: '391838042',
    buyerAddressLine: '12 route de Toulouse',
    buyerPostalCode: '34000',
    buyerCity: 'Montpellier',
    contactPhone: '05 61 23 45 67',
    vehicleModel: 'Citroën Berlingo',
    plate: 'DA-902-LM',
    status: 'facturee',
    dayOffset: -12,
    input: { kilometers: 245, vehicleId: 'utilitaire', urgencyId: 'standard', scheduleId: 'semaine', vehicleCount: 1, monthlyMissions: 3, extraIds: [] },
  },
];

const dateFromOffset = (dayOffset) => {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return date;
};

export const seedDemoMissions = () => {
  const existingMissions = getState().missions;
  const missions = [];

  SEED_MISSIONS.forEach((seed, index) => {
    const createdDate = dateFromOffset(Math.min(seed.dayOffset, 0) - 1);
    const createdAt = createdDate.toISOString();
    const quote = computeQuote({
      ...seed.input,
      approachKilometers: approachFor(seed.departure, seed.arrival),
    });
    missions.push({
      id: `demo-${Date.now()}-${index}`,
      reference: nextReference([...existingMissions, ...missions], createdAt),
      createdAt,
      status: seed.status,
      driverId: null,
      departure: seed.departure,
      arrival: seed.arrival,
      contactName: seed.contactName,
      contactPhone: seed.contactPhone,
      contactEmail: '',
      company: seed.contactName,
      buyerSiren: seed.buyerSiren ?? '',
      buyerAddressLine: seed.buyerAddressLine ?? '',
      buyerPostalCode: seed.buyerPostalCode ?? '',
      buyerCity: seed.buyerCity ?? '',
      vehicleModel: seed.vehicleModel,
      plate: seed.plate,
      pickupDate: dateFromOffset(seed.dayOffset).toISOString().slice(0, 10),
      pickupAddress: '',
      dropAddress: '',
      notes: '',
      quote,
      departureReport: null,
      arrivalReport: null,
      history: [{ status: 'demande', at: createdAt }, { status: seed.status, at: createdAt }],
    });
  });

  setState({ missions: [...missions, ...existingMissions] });
  return missions.length;
};

export const exportMissionsCsv = (missions) => {
  const header = [
    'Reference',
    'Cree le',
    'Statut',
    'Depart',
    'Arrivee',
    'Km',
    'Client',
    'Telephone',
    'Vehicule',
    'Immatriculation',
    'Total HT',
    'Total TTC',
  ];
  const rows = missions.map((mission) => [
    mission.reference,
    mission.createdAt.slice(0, 10),
    mission.status,
    mission.departure,
    mission.arrival,
    mission.quote.kilometers,
    mission.contactName ?? '',
    mission.contactPhone ?? '',
    mission.vehicleModel ?? '',
    mission.plate ?? '',
    mission.quote.totalExcludingVat.toFixed(2),
    mission.quote.totalIncludingVat.toFixed(2),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `chanfiou-missions-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};
