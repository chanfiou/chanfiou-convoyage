import { getState, setState } from '../core/store.js';
import { computeQuote } from '../domain/quote.js';
import { statusById } from '../domain/mission.js';
import { fetchMissions, isConfigured, isSignedIn, pushMission } from './api.js';

export const normaliseMission = (mission) => {
  const source = mission?.quoteInput ?? null;
  const quote = mission?.quote;
  const needsRebuild = !quote || !quote.vehicle?.label || !quote.urgency?.label || !quote.schedule?.label;

  const rebuilt = needsRebuild
    ? computeQuote({
        kilometers: source?.kilometers ?? quote?.kilometers ?? 1,
        vehicleId: source?.vehicleId ?? quote?.vehicle?.id,
        urgencyId: source?.urgencyId ?? quote?.urgency?.id,
        scheduleId: source?.scheduleId ?? quote?.schedule?.id,
        isNightDeparture: source?.isNightDeparture ?? quote?.isNightDeparture ?? false,
        vehicleCount: source?.vehicleCount ?? quote?.vehicleCount ?? 1,
        monthlyMissions: source?.monthlyMissions ?? 0,
        extraIds: source?.extraIds ?? (quote?.extras ?? []).map((service) => service?.id).filter(Boolean),
        includeApproach: source?.includeApproach ?? quote?.includeApproach ?? true,
        approachKilometers: source?.approachKilometers ?? quote?.approachKilometers ?? 0,
      })
    : quote;

  return {
    ...mission,
    status: statusById(mission?.status).id,
    departure: String(mission?.departure ?? '').trim() || 'Départ à préciser',
    arrival: String(mission?.arrival ?? '').trim() || 'Arrivée à préciser',
    history: Array.isArray(mission?.history) ? mission.history : [],
    quote: rebuilt,
  };
};

export const mergeMissions = (localMissions, remoteMissions) => {
  const byReference = new Map(localMissions.map((mission) => [mission.reference, mission]));
  let added = 0;
  let updated = 0;

  remoteMissions.map(normaliseMission).forEach((remote) => {
    const local = byReference.get(remote.reference);
    if (!local) {
      byReference.set(remote.reference, { ...remote, pendingSync: false });
      added += 1;
      return;
    }
    if (local.pendingSync) return;
    const localStamp = local.updatedAt ?? local.createdAt ?? '';
    const remoteStamp = remote.updatedAt ?? '';
    if (remoteStamp > localStamp) {
      byReference.set(remote.reference, { ...local, ...remote, pendingSync: false });
      updated += 1;
    }
  });

  const merged = [...byReference.values()].sort((first, second) =>
    String(second.createdAt ?? '').localeCompare(String(first.createdAt ?? '')),
  );
  return { missions: merged, added, updated };
};

export const markPending = (mission) => ({
  ...mission,
  pendingSync: true,
  updatedAt: new Date().toISOString(),
});

export const pendingMissions = (missions) => missions.filter((mission) => mission.pendingSync);

export const syncNow = async () => {
  if (!isConfigured()) return { skipped: 'non-configure' };
  if (!isSignedIn()) return { skipped: 'non-connecte' };

  const state = getState();
  const missions = state.missions ?? [];
  const failures = [];
  let pushed = 0;

  for (const mission of pendingMissions(missions)) {
    const { data, error } = await pushMission(mission);
    if (error) {
      failures.push({ reference: mission.reference, error });
      continue;
    }
    pushed += 1;
    const current = getState().missions ?? [];
    setState({
      missions: current.map((entry) =>
        entry.reference === mission.reference
          ? { ...entry, ...data.mission, pendingSync: false }
          : entry,
      ),
    });
  }

  const { data, error } = await fetchMissions(getState().syncCursor ?? null);
  if (error) return { pushed, failures, error };

  const { missions: merged, added, updated } = mergeMissions(getState().missions ?? [], data.missions ?? []);
  setState({
    missions: merged,
    syncCursor: data.cursor ?? getState().syncCursor ?? null,
    lastSyncAt: new Date().toISOString(),
  });

  return { pushed, failures, added, updated, hasMore: Boolean(data.hasMore) };
};

export const newRequestCount = (missions) =>
  missions.filter((mission) => mission.origin === 'client' && mission.status === 'demande').length;
