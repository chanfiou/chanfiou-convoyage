import {
  CHAINING_RADIUS_KILOMETERS,
  CHAINING_WINDOW_DAYS,
  HOME_BASE,
} from '../config/pricing.js';
import { estimateRoadDistance, findCityByLabel, straightLineDistance } from './geo.js';
import { computeQuote } from './quote.js';

const MILLISECONDS_PER_DAY = 86400000;

const CHAINABLE_STATUSES = ['demande', 'confirmee', 'en-cours'];

const dayGap = (firstDate, secondDate) => {
  if (!firstDate || !secondDate) return null;
  const difference = new Date(secondDate).getTime() - new Date(firstDate).getTime();
  return Math.round(difference / MILLISECONDS_PER_DAY);
};

export const gapBetween = (fromLabel, toLabel) => {
  const from = findCityByLabel(fromLabel);
  const to = findCityByLabel(toLabel);
  if (!from || !to) return null;
  return Math.round(straightLineDistance(from, to));
};

export const chainedApproachKilometers = (previousMission, mission) => {
  const legToPickup = estimateRoadDistance(previousMission.arrival, mission.departure);
  const legHome = estimateRoadDistance(mission.arrival, HOME_BASE.label);
  if (legToPickup === null || legHome === null) return null;
  return legToPickup + legHome;
};

export const soloApproachKilometers = (mission) => {
  const legToPickup = estimateRoadDistance(HOME_BASE.label, mission.departure);
  const legHome = estimateRoadDistance(mission.arrival, HOME_BASE.label);
  if (legToPickup === null || legHome === null) return null;
  return legToPickup + legHome;
};

export const findChainCandidates = (mission, missions) => {
  if (!CHAINABLE_STATUSES.includes(mission.status)) return [];

  return missions
    .filter((candidate) => candidate.id !== mission.id)
    .filter((candidate) => CHAINABLE_STATUSES.includes(candidate.status))
    .filter((candidate) => candidate.chainedToId !== mission.id)
    .map((candidate) => {
      const detour = gapBetween(candidate.arrival, mission.departure);
      const gap = dayGap(candidate.pickupDate, mission.pickupDate);
      return { candidate, detour, gap };
    })
    .filter((entry) => entry.detour !== null && entry.detour <= CHAINING_RADIUS_KILOMETERS)
    .filter((entry) => entry.gap !== null && entry.gap >= 0 && entry.gap <= CHAINING_WINDOW_DAYS)
    .map((entry) => {
      const chained = chainedApproachKilometers(entry.candidate, mission);
      const solo = soloApproachKilometers(mission);
      if (chained === null || solo === null) return null;
      return {
        ...entry,
        chainedApproach: chained,
        soloApproach: solo,
        savedKilometers: Math.max(0, solo - chained),
      };
    })
    .filter(Boolean)
    .sort((first, second) => second.savedKilometers - first.savedKilometers);
};

export const quoteInputFrom = (mission) => {
  const quote = mission.quote;
  return {
    kilometers: quote.kilometers,
    vehicleId: quote.vehicle.id,
    urgencyId: quote.urgency.id,
    scheduleId: quote.schedule.id,
    isNightDeparture: quote.isNightDeparture,
    vehicleCount: quote.vehicleCount,
    monthlyMissions: quote.volumeTier?.minMonthlyMissions ?? 0,
    extraIds: quote.extras.map((service) => service.id),
    includeApproach: quote.includeApproach,
  };
};

export const chainingBenefit = (mission, previousMission) => {
  const input = quoteInputFrom(mission);
  const soloKilometers = soloApproachKilometers(mission);
  const chainedKilometers = chainedApproachKilometers(previousMission, mission);
  if (soloKilometers === null || chainedKilometers === null) return null;
  const solo = computeQuote({ ...input, approachKilometers: soloKilometers });
  const chained = computeQuote({ ...input, approachKilometers: chainedKilometers });
  return {
    solo,
    chained,
    clientSaving: Math.max(0, solo.totalExcludingVat - chained.totalExcludingVat),
    emptyKilometersSaved: Math.max(0, soloKilometers - chainedKilometers),
  };
};

export const emptyKilometreRatio = (missions) => {
  const relevant = missions.filter((mission) => mission.quote?.kilometers);
  if (relevant.length === 0) return null;
  const paid = relevant.reduce((sum, mission) => sum + mission.quote.kilometers, 0);
  const empty = relevant.reduce((sum, mission) => sum + (mission.quote.approachKilometers ?? 0), 0);
  return empty / (paid + empty);
};
