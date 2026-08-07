import { getState, setState } from '../core/store.js';
import { isConfigured, isSignedIn, transmitInvoiceToAbby } from '../data/api.js';
import { markPending } from '../data/sync.js';
import { createInvoiceForMissions, updateInvoice } from './invoice.js';
import { updateMission } from './mission.js';

const attachToMissions = (missions, invoice) => {
  const known = new Set(missions.map((mission) => mission.id));
  missions.forEach((mission) => updateMission(mission.id, { invoice }));
  setState({
    missions: (getState().missions ?? []).map((mission) =>
      known.has(mission.id) ? markPending(mission) : mission,
    ),
  });
};

// Reprise d'une facture déjà créée localement mais jamais numérotée
// officiellement (plateforme injoignable au moment de l'émission).
export const transmitExistingInvoice = async (invoice) => {
  if (!isConfigured() || !isSignedIn()) {
    return { error: 'Connectez-vous à l’Espace convoyeur pour transmettre la facture.' };
  }
  const { data, error } = await transmitInvoiceToAbby(invoice);
  if (error || !data?.number) {
    return {
      error:
        error ??
        (data?.finalizeRequirements?.length
          ? `Abby refuse la finalisation : ${data.finalizeRequirements.join(' ')}`
          : 'Numéro officiel non attribué par la plateforme.'),
    };
  }
  const patch = {
    number: data.number,
    abbyBillingId: data.abbyBillingId,
    isTestInvoice: Boolean(data.isTestInvoice),
    status: 'transmise',
    transmittedAt: new Date().toISOString(),
  };
  updateInvoice(invoice.id, patch);
  const official = { ...invoice, ...patch };
  const covered = (getState().missions ?? []).filter((mission) =>
    (invoice.missionIds ?? [invoice.missionId]).includes(mission.id),
  );
  if (covered.length > 0) attachToMissions(covered, official);
  return { invoice: official };
};

// La numérotation officielle vient de la plateforme agréée : la facture est
// créée puis finalisée chez Abby, et c'est son numéro que porte le document
// remis au client. Sans numéro officiel, rien n'est transmis au client.
export const issueInvoiceForMissions = async (missions) => {
  const invoice = createInvoiceForMissions(missions);
  if (!invoice) return { error: 'Facture introuvable.' };

  if (!isConfigured() || !isSignedIn()) {
    return {
      invoice,
      official: false,
      error: 'Connectez-vous à l’Espace convoyeur pour obtenir le numéro officiel de la facture.',
    };
  }

  const { data, error } = await transmitInvoiceToAbby(invoice);
  if (error || !data?.number) {
    return {
      invoice,
      official: false,
      error:
        error ??
        (data?.finalizeRequirements?.length
          ? `Abby refuse la finalisation : ${data.finalizeRequirements.join(' ')}`
          : 'Numéro officiel non attribué par la plateforme.'),
    };
  }

  const patch = {
    number: data.number,
    abbyBillingId: data.abbyBillingId,
    isTestInvoice: Boolean(data.isTestInvoice),
    status: 'transmise',
    transmittedAt: new Date().toISOString(),
  };
  updateInvoice(invoice.id, patch);
  const official = { ...invoice, ...patch };
  attachToMissions(missions, official);
  return { invoice: official, official: true };
};
