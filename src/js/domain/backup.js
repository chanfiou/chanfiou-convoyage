import { getState, setState } from '../core/store.js';

export const BACKUP_VERSION = 1;
export const BACKUP_STALE_DAYS = 7;

const MILLISECONDS_PER_DAY = 86400000;
const BACKED_UP_KEYS = ['missions', 'invoices', 'creditNotes', 'settings', 'lastQuote'];

export const buildBackup = (state, exportedAt) => ({
  format: 'chanfiou-convoyage',
  version: BACKUP_VERSION,
  exportedAt,
  counts: {
    missions: (state.missions ?? []).length,
    invoices: (state.invoices ?? []).length,
    creditNotes: (state.creditNotes ?? []).length,
  },
  data: BACKED_UP_KEYS.reduce(
    (accumulator, key) => ({ ...accumulator, [key]: state[key] ?? null }),
    {},
  ),
});

export const parseBackup = (rawText) => {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { error: 'Ce fichier n’est pas une sauvegarde lisible. Choisissez le fichier .json produit par l’application.' };
  }

  if (parsed?.format !== 'chanfiou-convoyage') {
    return { error: 'Ce fichier ne vient pas de cette application. Choisissez une sauvegarde Chanfiou.' };
  }
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    return { error: `Cette sauvegarde vient d’une version plus récente de l’application. Mettez l’application à jour avant de la restaurer.` };
  }
  if (!parsed.data || typeof parsed.data !== 'object') {
    return { error: 'Cette sauvegarde est incomplète, elle ne contient aucune donnée.' };
  }
  const listKeys = ['missions', 'invoices', 'creditNotes'];
  const invalid = listKeys.filter(
    (key) => parsed.data[key] != null && !Array.isArray(parsed.data[key]),
  );
  if (invalid.length > 0) {
    return { error: `Cette sauvegarde est corrompue sur ${invalid.join(', ')}. Essayez une sauvegarde plus ancienne.` };
  }

  return { backup: parsed };
};

export const backupSummary = (backup) => ({
  exportedAt: backup.exportedAt,
  missions: (backup.data.missions ?? []).length,
  invoices: (backup.data.invoices ?? []).length,
  creditNotes: (backup.data.creditNotes ?? []).length,
});

export const applyBackup = (backup) => {
  const patch = BACKED_UP_KEYS.reduce((accumulator, key) => {
    const value = backup.data[key];
    if (value === undefined) return accumulator;
    return { ...accumulator, [key]: value ?? (key === 'lastQuote' || key === 'settings' ? null : []) };
  }, {});
  setState({ ...patch, adminUnlocked: true });
  return backupSummary(backup);
};

export const backupFileName = (exportedAt) =>
  `chanfiou-sauvegarde-${new Date(exportedAt).toISOString().slice(0, 10)}.json`;

export const daysSinceBackup = (lastBackupAt, now = new Date()) => {
  if (!lastBackupAt) return null;
  return Math.floor((now.getTime() - new Date(lastBackupAt).getTime()) / MILLISECONDS_PER_DAY);
};

export const isBackupStale = (lastBackupAt, missionCount, now = new Date()) => {
  if (missionCount === 0) return false;
  const days = daysSinceBackup(lastBackupAt, now);
  return days === null || days >= BACKUP_STALE_DAYS;
};

export const markBackupDone = (exportedAt) => setState({ lastBackupAt: exportedAt });

export const currentBackup = () => {
  const exportedAt = new Date().toISOString();
  return { backup: buildBackup(getState(), exportedAt), exportedAt };
};
