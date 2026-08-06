import { VAT_EXEMPTION_MENTION, VAT_EXEMPT, VAT_RATE } from '../config/pricing.js';
import { HOME_BASE } from '../config/pricing.js';
import { getSettings } from '../config/settings.js';
import { getState, setState } from '../core/store.js';
import { formatDistance } from '../core/format.js';

export const INVOICE_STATUSES = [
  { id: 'emise', label: 'Émise', tone: 'info', next: 'transmise' },
  { id: 'transmise', label: 'Transmise à la plateforme', tone: 'progress', next: 'payee' },
  { id: 'payee', label: 'Payée', tone: 'success', next: null },
];

const INVOICE_PREFIX = 'FA';
const MILLISECONDS_PER_DAY = 86400000;

const roundToCents = (amount) => Math.round(amount * 100) / 100;

export const invoiceStatusById = (id) =>
  INVOICE_STATUSES.find((status) => status.id === id) ?? INVOICE_STATUSES[0];

export const nextInvoiceNumber = (invoices, issuedAt) => {
  const year = new Date(issuedAt).getFullYear();
  const prefix = `${INVOICE_PREFIX}-${year}-`;
  const highest = invoices.reduce((currentHighest, invoice) => {
    if (!invoice.number?.startsWith(prefix)) return currentHighest;
    return Math.max(currentHighest, Number(invoice.number.slice(prefix.length)) || 0);
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
};

export const buildInvoiceLines = (mission) => {
  const quote = mission.quote;
  const lines = [
    {
      description: `Convoyage par la route ${mission.departure} vers ${mission.arrival} — ${formatDistance(quote.kilometers)}`,
      quantity: 1,
      unitPrice: roundToCents(quote.base),
    },
  ];

  quote.surchargeLines.forEach((surcharge) => {
    lines.push({
      description: `Majoration ${surcharge.label.toLowerCase()}`,
      quantity: 1,
      unitPrice: roundToCents(surcharge.amount),
    });
  });

  if (quote.vehicleCount > 1) {
    lines.push({
      description: `${quote.vehicleCount - 1} véhicule(s) supplémentaire(s) sur le même trajet, remise de 10 % appliquée`,
      quantity: 1,
      unitPrice: roundToCents(quote.additionalVehiclesPrice),
    });
  }

  if (quote.approachTotal > 0) {
    lines.push({
      description: `Frais d’approche et de retour depuis ${HOME_BASE.city} — ${formatDistance(quote.approachBillableKilometers)} facturés sur ${formatDistance(quote.approachKilometers)}`,
      quantity: 1,
      unitPrice: roundToCents(quote.approachTotal),
    });
  }

  quote.extras.forEach((service) => {
    if (service.price > 0) {
      lines.push({ description: service.label, quantity: 1, unitPrice: roundToCents(service.price) });
    }
  });

  return lines;
};

export const buildInvoiceAllowances = (mission) => {
  const quote = mission.quote;
  if (quote.discountAmount <= 0) return [];
  return [
    {
      reason: quote.volumeTier
        ? `Remise commerciale — ${quote.volumeTier.label}`
        : 'Remise commerciale',
      amount: roundToCents(quote.discountAmount),
    },
  ];
};

export const computeInvoiceTotals = (lines, allowances = []) => {
  const lineTotal = roundToCents(
    lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
  );
  const allowanceTotal = roundToCents(
    allowances.reduce((sum, allowance) => sum + allowance.amount, 0),
  );
  const taxBasis = roundToCents(lineTotal - allowanceTotal);
  const taxAmount = roundToCents(taxBasis * VAT_RATE);
  return {
    lineTotal,
    allowanceTotal,
    taxBasis,
    taxAmount,
    grandTotal: roundToCents(taxBasis + taxAmount),
    duePayable: roundToCents(taxBasis + taxAmount),
  };
};

const addDays = (isoDate, days) =>
  new Date(new Date(isoDate).getTime() + days * MILLISECONDS_PER_DAY).toISOString();

export const buildInvoiceFromMissions = (missions, invoices, issuedAt) => {
  const settings = getSettings();
  const reference = missions[0];
  const lines = missions.flatMap((mission) =>
    buildInvoiceLines(mission).map((line) =>
      missions.length === 1
        ? line
        : { ...line, description: `${mission.reference} — ${line.description}` },
    ),
  );
  const allowances = missions.flatMap((mission) => {
    const missionAllowances = buildInvoiceAllowances(mission);
    return missions.length === 1
      ? missionAllowances
      : missionAllowances.map((allowance) => ({
          ...allowance,
          reason: `${allowance.reason} (${mission.reference})`,
        }));
  });
  const totals = computeInvoiceTotals(lines, allowances);
  const deliveredAt =
    reference.arrivalReport?.completedAt ?? reference.pickupDate ?? issuedAt;
  const paymentTermDays = Number(settings.paymentTermDays) || 0;

  return {
    id: `invoice-${new Date(issuedAt).getTime()}`,
    number: nextInvoiceNumber(invoices, issuedAt),
    missionIds: missions.map((mission) => mission.id),
    missionReferences: missions.map((mission) => mission.reference),
    missionId: reference.id,
    missionReference:
      missions.length === 1 ? reference.reference : `${missions.length} missions groupées`,
    issuedAt,
    // Paiement à réception : 2 jours de tolérance avant l'alerte de retard.
    dueAt: addDays(issuedAt, paymentTermDays > 0 ? paymentTermDays : 2),
    deliveredAt,
    status: 'emise',
    transmittedAt: null,
    paidAt: null,
    operationNature: 'Prestation de services',
    isVatExempt: VAT_EXEMPT,
    vatMention: VAT_EXEMPT ? VAT_EXEMPTION_MENTION : `TVA ${Math.round(VAT_RATE * 100)} %`,
    seller: {
      name: settings.legalName,
      legalForm: settings.legalForm,
      siret: settings.siret,
      vatNumber: settings.vatNumber,
      addressLine: settings.addressLine,
      postalCode: settings.postalCode,
      city: settings.city,
      countryCode: settings.countryCode,
      email: settings.email,
      phone: settings.phone,
      iban: settings.iban,
      bic: settings.bic,
    },
    buyer: {
      name: reference.company?.trim() || reference.contactName,
      contactName: reference.contactName,
      siren: reference.buyerSiren ?? '',
      addressLine: reference.buyerAddressLine ?? '',
      postalCode: reference.buyerPostalCode ?? '',
      city: reference.buyerCity ?? '',
      countryCode: 'FR',
      email: reference.contactEmail ?? '',
    },
    deliveryAddress: reference.dropAddress?.trim() || reference.arrival,
    paymentTerms:
      paymentTermDays > 0
        ? `Paiement à ${paymentTermDays} jours nets`
        : 'Payable à réception, par virement bancaire',
    latePenaltyMention: `Tout retard de paiement engendre une pénalité exigible à compter de la date d’échéance, calculée sur la base de ${settings.latePenaltyRate}.`,
    recoveryIndemnityMention: `Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : ${settings.recoveryIndemnity} €.`,
    noDiscountMention: 'Les règlements reçus avant la date d’échéance ne donneront pas lieu à escompte.',
    lines,
    allowances,
    totals,
  };
};

export const invoiceCoversMission = (invoice, missionId) =>
  (invoice.missionIds ?? [invoice.missionId]).includes(missionId);

export const createInvoiceForMissions = (missions) => {
  const { invoices = [] } = getState();
  const alreadyInvoiced = missions.filter((mission) =>
    invoices.some((invoice) => invoiceCoversMission(invoice, mission.id)),
  );
  if (alreadyInvoiced.length === missions.length) {
    return invoices.find((invoice) => invoiceCoversMission(invoice, missions[0].id));
  }
  const pending = missions.filter(
    (mission) => !invoices.some((invoice) => invoiceCoversMission(invoice, mission.id)),
  );
  const invoice = buildInvoiceFromMissions(pending, invoices, new Date().toISOString());
  setState({ invoices: [invoice, ...invoices] });
  return invoice;
};

export const createInvoiceForMission = (mission) => createInvoiceForMissions([mission]);

export const groupInvoiceableMissions = (missions, invoices) => {
  const uninvoiced = missions
    .filter((mission) => ['confirmee', 'facturee', 'payee', 'en-cours', 'livree'].includes(mission.status))
    .filter((mission) => !invoices.some((invoice) => invoiceCoversMission(invoice, mission.id)));

  const groups = new Map();
  uninvoiced.forEach((mission) => {
    const client = (mission.company?.trim() || mission.contactName || 'Client').trim();
    const period = String(mission.pickupDate ?? mission.createdAt).slice(0, 7);
    const key = `${client}::${period}`;
    if (!groups.has(key)) groups.set(key, { client, period, missions: [] });
    groups.get(key).missions.push(mission);
  });
  return [...groups.values()].sort((first, second) => second.missions.length - first.missions.length);
};

export const updateInvoice = (invoiceId, patch) => {
  const { invoices = [] } = getState();
  setState({
    invoices: invoices.map((invoice) =>
      invoice.id === invoiceId ? { ...invoice, ...patch } : invoice,
    ),
  });
};

export const advanceInvoiceStatus = (invoiceId, statusId) => {
  const timestampField =
    statusId === 'transmise' ? 'transmittedAt' : statusId === 'payee' ? 'paidAt' : null;
  const patch = { status: statusId };
  if (timestampField) patch[timestampField] = new Date().toISOString();
  updateInvoice(invoiceId, patch);
};

export const invoiceForMission = (missionId) =>
  (getState().invoices ?? []).find((invoice) => invoiceCoversMission(invoice, missionId)) ?? null;

export const isInvoiceOverdue = (invoice, now = new Date()) =>
  invoice.status !== 'payee' && new Date(invoice.dueAt) < now;
