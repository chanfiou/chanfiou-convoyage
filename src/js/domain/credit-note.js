import { getState, setState } from '../core/store.js';
import { computeInvoiceTotals } from './invoice.js';

export const CREDIT_NOTE_PREFIX = 'AV';

export const CREDIT_REASONS = [
  { id: 'annulation', label: 'Mission annulée par le client' },
  { id: 'erreur-tarif', label: 'Erreur de tarif sur la facture' },
  { id: 'erreur-client', label: 'Erreur sur le destinataire de la facture' },
  { id: 'geste-commercial', label: 'Geste commercial' },
  { id: 'litige', label: 'Litige sur la prestation' },
  { id: 'autre', label: 'Autre motif' },
];

const roundToCents = (amount) => Math.round(amount * 100) / 100;

export const nextCreditNoteNumber = (creditNotes, issuedAt) => {
  const year = new Date(issuedAt).getFullYear();
  const prefix = `${CREDIT_NOTE_PREFIX}-${year}-`;
  const highest = creditNotes.reduce((currentHighest, note) => {
    if (!note.number?.startsWith(prefix)) return currentHighest;
    return Math.max(currentHighest, Number(note.number.slice(prefix.length)) || 0);
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
};

export const creditedAmountFor = (invoiceId, creditNotes) =>
  roundToCents(
    creditNotes
      .filter((note) => note.invoiceId === invoiceId)
      .reduce((sum, note) => sum + note.totals.duePayable, 0),
  );

export const remainingCreditable = (invoice, creditNotes) =>
  roundToCents(invoice.totals.duePayable - creditedAmountFor(invoice.id, creditNotes));

export const isFullyCredited = (invoice, creditNotes) =>
  remainingCreditable(invoice, creditNotes) <= 0.01;

export const buildCreditNote = (invoice, { reason, amount, isPartial }, creditNotes, issuedAt) => {
  const lines = isPartial
    ? [
        {
          description: `Avoir partiel sur la facture ${invoice.number} — ${reason}`,
          quantity: 1,
          unitPrice: roundToCents(amount),
        },
      ]
    : invoice.lines.map((line) => ({ ...line }));

  const allowances = isPartial ? [] : invoice.allowances ?? [];
  const totals = computeInvoiceTotals(lines, allowances);

  return {
    id: `credit-${new Date(issuedAt).getTime()}`,
    number: nextCreditNoteNumber(creditNotes, issuedAt),
    documentType: 'avoir',
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    invoiceIssuedAt: invoice.issuedAt,
    issuedAt,
    dueAt: issuedAt,
    deliveredAt: invoice.deliveredAt,
    reason,
    isPartial: Boolean(isPartial),
    missionIds: invoice.missionIds ?? [invoice.missionId],
    missionReferences: invoice.missionReferences ?? [invoice.missionReference],
    missionReference: invoice.missionReference,
    status: 'emise',
    transmittedAt: null,
    operationNature: invoice.operationNature,
    isVatExempt: invoice.isVatExempt,
    vatMention: invoice.vatMention,
    seller: invoice.seller,
    buyer: invoice.buyer,
    deliveryAddress: invoice.deliveryAddress,
    paymentTerms: `Avoir à valoir ou à rembourser, sur la facture ${invoice.number}`,
    latePenaltyMention: '',
    recoveryIndemnityMention: '',
    noDiscountMention: '',
    lines,
    allowances,
    totals,
  };
};

export const createCreditNote = (invoice, options) => {
  const { creditNotes = [] } = getState();
  const note = buildCreditNote(invoice, options, creditNotes, new Date().toISOString());
  setState({ creditNotes: [note, ...creditNotes] });
  return note;
};

export const updateCreditNote = (noteId, patch) => {
  const { creditNotes = [] } = getState();
  setState({
    creditNotes: creditNotes.map((note) => (note.id === noteId ? { ...note, ...patch } : note)),
  });
};

export const creditNotesForInvoice = (invoiceId) =>
  (getState().creditNotes ?? []).filter((note) => note.invoiceId === invoiceId);
