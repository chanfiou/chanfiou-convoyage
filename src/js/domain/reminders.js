// Une date confirmée n'est tenue que 48 heures : au-delà, sans signature ni
// paiement, la journée bloquée doit être relancée ou libérée (article 4 des
// conditions générales).
export const HOLD_HOURS = 48;

const MILLISECONDS_PER_HOUR = 3600000;

const statusReachedAt = (mission, statusId) =>
  (mission.history ?? []).findLast?.((entry) => entry.status === statusId)?.at ??
  [...(mission.history ?? [])].reverse().find((entry) => entry.status === statusId)?.at ??
  null;

const hoursSince = (isoDate, now) =>
  isoDate ? Math.floor((now.getTime() - new Date(isoDate).getTime()) / MILLISECONDS_PER_HOUR) : null;

export const pendingHolds = (missions, now = new Date()) =>
  (missions ?? [])
    .map((mission) => {
      if (mission.status === 'confirmee' && !mission.contractSignedAt) {
        const hours = hoursSince(statusReachedAt(mission, 'confirmee'), now);
        return hours === null
          ? null
          : { mission, kind: 'signature', hours, overdue: hours >= HOLD_HOURS };
      }
      if (mission.status === 'facturee') {
        const hours = hoursSince(statusReachedAt(mission, 'facturee'), now);
        return hours === null
          ? null
          : { mission, kind: 'paiement', hours, overdue: hours >= HOLD_HOURS };
      }
      return null;
    })
    .filter((entry) => entry?.overdue)
    .sort((first, second) => second.hours - first.hours);

export const holdLabel = (kind) =>
  kind === 'signature' ? 'contrat non signé' : 'facture non réglée';
