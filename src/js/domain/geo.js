import { CITIES } from '../config/cities.js';
import { ROAD_DISTANCE_FACTOR } from '../config/pricing.js';
import { normalizeText } from '../core/format.js';

const EARTH_RADIUS_KM = 6371;
const MAX_SUGGESTIONS = 6;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const indexedCities = CITIES.map((city) => ({
  ...city,
  searchKey: normalizeText(city.name),
  label: `${city.name} (${city.dept})`,
}));

export const searchCities = (query) => {
  const needle = normalizeText(query);
  if (needle.length < 2) return [];
  const startsWith = [];
  const contains = [];
  indexedCities.forEach((city) => {
    if (city.searchKey.startsWith(needle)) startsWith.push(city);
    else if (city.searchKey.includes(needle) || city.dept === query.trim()) contains.push(city);
  });
  return [...startsWith, ...contains].slice(0, MAX_SUGGESTIONS);
};

export const findCityByLabel = (label) =>
  indexedCities.find((city) => city.label === label) ??
  indexedCities.find((city) => normalizeText(city.name) === normalizeText(label ?? ''));

export const straightLineDistance = (from, to) => {
  const deltaLatitude = toRadians(to.lat - from.lat);
  const deltaLongitude = toRadians(to.lon - from.lon);
  const halfChordSquared =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(halfChordSquared)));
};

export const estimateRoadDistance = (fromLabel, toLabel) => {
  const from = findCityByLabel(fromLabel);
  const to = findCityByLabel(toLabel);
  if (!from || !to) return null;
  const distance = straightLineDistance(from, to) * ROAD_DISTANCE_FACTOR;
  return Math.round(distance);
};
