import { notifySubscriptions } from './push.js';

const HOLD_HOURS = 48;
const MILLISECONDS_PER_HOUR = 3600000;

const reachedAt = (history, statusId) =>
  [...(history ?? [])].reverse().find((entry) => entry.status === statusId)?.at ?? null;

// Alerte quotidienne : une date réservée dont le contrat n'est pas signé ou la
// facture pas réglée immobilise une journée de vente.
export const notifyPendingHolds = async (env, now = new Date()) => {
  const { results } = await env.DB.prepare(
    "SELECT reference, status, payload FROM missions WHERE status IN ('confirmee', 'facturee')",
  ).all();

  const overdue = (results ?? []).flatMap((row) => {
    let payload = {};
    try {
      payload = JSON.parse(row.payload);
    } catch {
      return [];
    }
    if (row.status === 'confirmee' && payload.contractSignedAt) return [];
    const since = reachedAt(payload.history, row.status);
    if (!since) return [];
    const hours = Math.floor((now.getTime() - new Date(since).getTime()) / MILLISECONDS_PER_HOUR);
    if (hours < HOLD_HOURS) return [];
    return [
      {
        reference: row.reference,
        kind: row.status === 'confirmee' ? 'contrat non signé' : 'facture non réglée',
        hours,
      },
    ];
  });

  if (overdue.length === 0) return { notified: 0 };

  const detail = overdue
    .slice(0, 3)
    .map((entry) => `${entry.reference} (${entry.kind})`)
    .join(', ');
  await notifySubscriptions(env, {
    title: overdue.length === 1 ? 'Une date réservée à relancer' : `${overdue.length} dates réservées à relancer`,
    body: `${detail}${overdue.length > 3 ? '…' : ''}. Relancez le client ou libérez la journée.`,
    url: './#/espace',
  });
  return { notified: overdue.length };
};
