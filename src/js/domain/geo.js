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

// Les villes choisies via l'API officielle des communes sont mémorisées sur
// l'appareil pour que les distances restent calculables après rechargement.
const REGISTRY_KEY = 'chanfiou.cities.v1';
const hasStorage = typeof window !== 'undefined' && 'localStorage' in window;

const loadRegistry = () => {
  if (!hasStorage) return new Map();
  try {
    return new Map(JSON.parse(window.localStorage.getItem(REGISTRY_KEY) ?? '[]'));
  } catch {
    return new Map();
  }
};

const registry = loadRegistry();

const persistRegistry = () => {
  if (!hasStorage) return;
  try {
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify([...registry.entries()].slice(-80)));
  } catch {
    return;
  }
};

export const rememberCities = (cities) => {
  cities.forEach((city) => registry.set(city.label, city));
  persistRegistry();
};

export const searchCitiesRemote = async (query) => {
  const needle = String(query ?? '').trim();
  if (needle.length < 2) return [];
  const params = /^\d{4,5}$/.test(needle)
    ? `codePostal=${encodeURIComponent(needle)}`
    : `nom=${encodeURIComponent(needle)}&boost=population`;
  try {
    const response = await fetch(
      `https://geo.api.gouv.fr/communes?${params}&fields=nom,codeDepartement,centre&limit=${MAX_SUGGESTIONS}`,
    );
    if (!response.ok) return [];
    const communes = await response.json();
    const cities = communes
      .filter((commune) => commune.centre?.coordinates)
      .map((commune) => ({
        name: commune.nom,
        dept: commune.codeDepartement,
        lat: commune.centre.coordinates[1],
        lon: commune.centre.coordinates[0],
        label: `${commune.nom} (${commune.codeDepartement})`,
      }));
    rememberCities(cities);
    return cities;
  } catch {
    return [];
  }
};

export const findCityByLabel = (label) =>
  registry.get(label) ??
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
