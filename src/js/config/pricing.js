export const VAT_EXEMPT = true;
export const VAT_RATE = VAT_EXEMPT ? 0 : 0.2;
export const VAT_EXEMPTION_MENTION = 'TVA non applicable, article 293 B du CGI';
export const VAT_EXEMPTION_CODE = 'VATEX-FR-FRANCHISE';

export const MINIMUM_FEE = 129;
export const MINIMUM_FEE_DISTANCE = 80;

// Repositionnés sous l'offre Budget d'Otoqi (devis réel du 7 août 2026 :
// 278,40 € TTC pour Calais -> Le Mesnil-Amelot, 270 km, carburant et frais
// inclus). Ces plateformes facturent la TVA, que nos clients professionnels
// récupèrent : la comparaison utile se fait donc sur leurs montants TTC.
export const DISTANCE_BRACKETS = [
  { upTo: 200, pricePerKm: 0.92 },
  { upTo: 500, pricePerKm: 0.81 },
  { upTo: 900, pricePerKm: 0.72 },
  { upTo: Infinity, pricePerKm: 0.64 },
];

export const VEHICLE_CATEGORIES = [
  { id: 'citadine', label: 'Citadine ou berline', surcharge: 0, hint: 'Clio, 308, Golf, Mégane…' },
  { id: 'suv', label: 'SUV ou monospace', surcharge: 0.08, hint: '3008, Tiguan, Espace…' },
  { id: 'utilitaire', label: 'Utilitaire jusqu’à 3,5 t', surcharge: 0.15, hint: 'Kangoo, Jumpy, Master…' },
  { id: 'electrique', label: 'Véhicule électrique', surcharge: 0.12, hint: 'Temps de recharge intégré' },
  { id: 'premium', label: 'Premium ou sportive', surcharge: 0.25, hint: 'Valeur supérieure à 80 000 €' },
];

export const HOME_BASE = { label: 'Paris (75)', city: 'Paris' };
export const APPROACH_PRICE_PER_KM = 0.14;
export const APPROACH_FREE_KILOMETERS = 100;
export const APPROACH_MAX_FEE = 120;

export const URGENCY_LEVELS = [
  { id: 'standard', label: 'Départ planifié', hint: 'Plus de 48 heures à l’avance', surcharge: 0 },
  { id: 'rapide', label: 'Départ sous 48 heures', hint: 'Appliqué selon la date choisie', surcharge: 0.15 },
  { id: 'express', label: 'Départ sous 24 heures', hint: 'Appliqué selon la date choisie', surcharge: 0.3 },
];

export const SCHEDULE_SURCHARGES = [
  { id: 'semaine', label: 'Semaine', hint: 'Du lundi au vendredi', surcharge: 0 },
  { id: 'samedi', label: 'Samedi', surcharge: 0.15 },
  { id: 'dimanche', label: 'Dimanche ou jour férié', surcharge: 0.25 },
];

export const NIGHT_SURCHARGE = {
  id: 'nuit',
  label: 'Départ de nuit',
  hint: 'Prise en charge entre 21h et 5h',
  surcharge: 0.2,
};

export const EXTRA_SERVICES = [
  { id: 'lavage-ext', label: 'Lavage extérieur avant livraison', price: 25 },
  { id: 'lavage-complet', label: 'Lavage intérieur et extérieur', price: 55 },
  { id: 'carburant', label: 'Plein de carburant avancé', price: 30, hint: 'Coût réel refacturé, 8 % de frais d’avance' },
  { id: 'retour-train', label: 'Second véhicule au retour', price: 0, discount: 0.15, hint: 'Remise de 15 % sur le second trajet' },
];

export const VOLUME_DISCOUNTS = [
  { minMonthlyMissions: 3, discount: 0.06, label: '3 à 5 convoyages par mois' },
  { minMonthlyMissions: 6, discount: 0.12, label: '6 à 9 convoyages par mois' },
  { minMonthlyMissions: 10, discount: 0.18, label: '10 convoyages et plus par mois' },
];

export const CHAINING_RADIUS_KILOMETERS = 60;
export const CHAINING_WINDOW_DAYS = 3;

export const WAITING_FEE_PER_HOUR = 22;
export const WAITING_FEE_FREE_MINUTES = 30;
export const SECOND_VEHICLE_DISCOUNT = 0.1;
export const ROAD_DISTANCE_FACTOR = 1.22;
