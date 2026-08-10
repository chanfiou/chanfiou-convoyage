export const BUSINESS_TIME_ZONE = 'Europe/Paris';

const EURO_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

const EURO_ROUNDED_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  timeZone: BUSINESS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatEuro = (amount) => EURO_FORMATTER.format(amount);

export const formatEuroRounded = (amount) => EURO_ROUNDED_FORMATTER.format(amount);

export const formatPercent = (ratio) => `${Math.round(ratio * 100)} %`;

export const formatDistance = (kilometers) => `${Math.round(kilometers)} km`;

// Une date invalide (donnée synchronisée corrompue ou forgée) ne doit jamais
// faire lever le formateur, sinon l'écran entier ne se construit plus.
export const formatDate = (isoDate) => {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMATTER.format(date);
};

export const formatDateTime = (isoDate) => {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME_FORMATTER.format(date);
};

export const formatDuration = (kilometers) => {
  const averageSpeedKmPerHour = 78;
  const totalMinutes = Math.round((kilometers / averageSpeedKmPerHour) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')}`;
};

export const normalizeText = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
