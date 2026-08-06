import { getState, setState } from '../core/store.js';

export const DEFAULT_SETTINGS = {
  legalName: 'Chanfiou Entreprise',
  legalForm: 'Entreprise individuelle',
  siret: '87845520300025',
  vatNumber: '',
  addressLine: '159 Grande Rue',
  postalCode: '92310',
  city: 'Sèvres',
  countryCode: 'FR',
  phone: '+33 7 64 82 07 46',
  email: 'malrproductions@gmail.com',
  iban: 'FR7628233000017332333877915',
  bic: 'REVOFRP2',
  paymentTermDays: 0,
  latePenaltyRate: 'trois fois le taux d’intérêt légal',
  recoveryIndemnity: 40,
  platformName: 'Abby',
  platformUrl: 'https://my.app-abby.com',
  platformAccountReference: '',
  adminAccessCode: '2026',
};

export const REQUIRED_SETTINGS = ['siret', 'addressLine', 'postalCode', 'city', 'email'];

export const SETTINGS_LABELS = {
  siret: 'Numéro de SIRET',
  addressLine: 'Adresse',
  postalCode: 'Code postal',
  city: 'Ville',
  email: 'Adresse électronique',
};

export const getSettings = () => {
  const settings = { ...DEFAULT_SETTINGS, ...(getState().settings ?? {}) };
  // Migration : « Super PDP » était un nom d'exemple, la plateforme réelle est Abby.
  if (settings.platformName === 'Super PDP') {
    settings.platformName = DEFAULT_SETTINGS.platformName;
    settings.platformUrl = DEFAULT_SETTINGS.platformUrl;
  }
  return settings;
};

export const saveSettings = (patch) => setState({ settings: { ...getSettings(), ...patch } });

export const sirenFromSiret = (siret) => String(siret ?? '').replace(/\D/g, '').slice(0, 9);

export const missingSettings = (settings) =>
  REQUIRED_SETTINGS.filter((field) => !String(settings[field] ?? '').trim());

export const isSiretValid = (siret) => {
  const digits = String(siret ?? '').replace(/\D/g, '');
  if (digits.length !== 14) return false;
  const total = [...digits].reduce((sum, character, index) => {
    const doubled = index % 2 === 0 ? Number(character) * 2 : Number(character);
    return sum + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return total % 10 === 0;
};

export const isSirenValid = (siren) => {
  const digits = String(siren ?? '').replace(/\D/g, '');
  if (digits.length !== 9) return false;
  const total = [...digits].reduce((sum, character, index) => {
    const doubled = index % 2 === 1 ? Number(character) * 2 : Number(character);
    return sum + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return total % 10 === 0;
};
