import { VAT_EXEMPT, VAT_EXEMPTION_MENTION, VAT_RATE } from '../config/pricing.js';

export const TOTAL_LABEL = VAT_EXEMPT ? 'Total net' : 'Total TTC';
export const AMOUNT_SUFFIX = VAT_EXEMPT ? 'net' : 'TTC';
export const BASE_SUFFIX = VAT_EXEMPT ? 'net' : 'HT';

export const VAT_HEADLINE_NOTE = VAT_EXEMPT
  ? VAT_EXEMPTION_MENTION
  : `Prix hors taxes, TVA ${Math.round(VAT_RATE * 100)} % en sus`;

export const VAT_GRID_NOTE = VAT_EXEMPT
  ? `Tarifs nets de taxe. ${VAT_EXEMPTION_MENTION}, aucune TVA n’est facturée.`
  : `Tarifs hors taxes, TVA ${Math.round(VAT_RATE * 100)} % en sus.`;

export const showsVatLines = !VAT_EXEMPT;

export const vatRatePercent = Math.round(VAT_RATE * 100);
