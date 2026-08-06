import { getState, setState } from '../core/store.js';

// La facture est émise et réglée après la confirmation, avant le départ.
export const MISSION_STATUSES = [
  { id: 'demande', label: 'Demande reçue', tone: 'neutral', next: 'confirmee' },
  { id: 'confirmee', label: 'Confirmée', tone: 'info', next: 'facturee' },
  { id: 'facturee', label: 'Facturée — règlement', tone: 'warning', next: 'en-cours' },
  { id: 'en-cours', label: 'En cours de route', tone: 'progress', next: 'livree' },
  { id: 'livree', label: 'Livrée', tone: 'success', next: null },
  { id: 'annulee', label: 'Annulée', tone: 'danger', next: null },
];

export const CHECKLIST_ITEMS = [
  { id: 'carrosserie', label: 'Carrosserie sans rayure ni choc' },
  { id: 'pneumatiques', label: 'Pneumatiques en bon état' },
  { id: 'vitrage', label: 'Pare-brise et vitrages intacts' },
  { id: 'interieur', label: 'Intérieur propre et sans dommage' },
  { id: 'equipements', label: 'Roue de secours, gilet et triangle présents' },
  { id: 'documents', label: 'Carte grise et attestation d’assurance à bord' },
  { id: 'cles', label: 'Jeu de clés complet remis' },
];

export const statusById = (id) =>
  MISSION_STATUSES.find((status) => status.id === id) ?? MISSION_STATUSES[0];

const REFERENCE_PREFIX = 'CHF';

const referencePeriod = (createdAt) => {
  const date = new Date(createdAt);
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${REFERENCE_PREFIX}-${year}${month}`;
};

export const nextReference = (missions, createdAt) => {
  const period = referencePeriod(createdAt);
  const highestSequence = missions.reduce((highest, mission) => {
    if (!mission.reference?.startsWith(`${period}-`)) return highest;
    return Math.max(highest, Number(mission.reference.slice(period.length + 1)) || 0);
  }, 0);
  return `${period}-${String(highestSequence + 1).padStart(3, '0')}`;
};

export const createMission = (payload) => {
  const { missions } = getState();
  const createdAt = new Date().toISOString();
  const mission = {
    id: `mission-${Date.now()}`,
    reference: nextReference(missions, createdAt),
    createdAt,
    status: 'demande',
    driverId: null,
    departureReport: null,
    arrivalReport: null,
    history: [{ status: 'demande', at: createdAt }],
    ...payload,
  };
  setState({ missions: [mission, ...missions] });
  return mission;
};

export const updateMission = (missionId, patch) => {
  const { missions } = getState();
  setState({
    missions: missions.map((mission) =>
      mission.id === missionId ? { ...mission, ...patch } : mission,
    ),
  });
};

export const advanceMissionStatus = (missionId, statusId) => {
  const { missions } = getState();
  setState({
    missions: missions.map((mission) => {
      if (mission.id !== missionId) return mission;
      return {
        ...mission,
        status: statusId,
        history: [...mission.history, { status: statusId, at: new Date().toISOString() }],
      };
    }),
  });
};

export const findMissionByReference = (reference) => {
  const needle = reference.trim().toUpperCase();
  return getState().missions.find((mission) => mission.reference.toUpperCase() === needle) ?? null;
};

export const missionRevenue = (missions) =>
  missions.reduce((sum, mission) => sum + (mission.quote?.totalExcludingVat ?? 0), 0);

export const missionsThisMonth = (missions) => {
  const now = new Date();
  return missions.filter((mission) => {
    const date = new Date(mission.createdAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
};
