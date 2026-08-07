import { getState, subscribe } from '../core/store.js';
import { isConfigured, isSignedIn, pushBackup } from './api.js';
import { pendingMissions, syncNow } from './sync.js';
import { currentBackup, markBackupDone } from '../domain/backup.js';

const SYNC_INTERVAL_MS = 60000;
const LOCAL_CHANGE_DEBOUNCE_MS = 3000;
const BACKUP_INTERVAL_MS = 15 * 60000;

let started = false;
let running = false;
let debounceTimer = null;
let lastBackupSignature = null;
let lastBackupAttempt = 0;

const canSync = () => navigator.onLine && isConfigured() && isSignedIn();

// Sauvegarde automatique de ce que la synchronisation ne couvre pas
// (factures, avoirs, réglages), au plus une fois par quart d'heure et
// seulement si quelque chose a changé.
const backupIfNeeded = async () => {
  if (!canSync()) return;
  if (Date.now() - lastBackupAttempt < BACKUP_INTERVAL_MS) return;
  const state = getState();
  const signature = JSON.stringify({
    invoices: (state.invoices ?? []).length,
    creditNotes: (state.creditNotes ?? []).length,
    missions: (state.missions ?? []).length,
    settings: state.settings ?? null,
    lastInvoice: (state.invoices ?? [])[0]?.number ?? null,
  });
  if (signature === lastBackupSignature) return;
  lastBackupAttempt = Date.now();
  const { backup, exportedAt } = currentBackup();
  const { data, error } = await pushBackup(backup);
  if (error || !data?.savedAt) return;
  lastBackupSignature = signature;
  markBackupDone(exportedAt);
};

const run = async () => {
  if (running || !canSync()) return;
  running = true;
  try {
    await syncNow();
    await backupIfNeeded();
  } finally {
    running = false;
  }
};

export const startAutoSync = () => {
  if (started) return;
  started = true;

  window.setInterval(run, SYNC_INTERVAL_MS);
  window.addEventListener('online', run);
  window.addEventListener('focus', run);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) run();
  });

  // Une modification locale (statut, PV…) part au serveur quelques secondes après.
  subscribe((state) => {
    if (pendingMissions(state.missions ?? []).length === 0) return;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(run, LOCAL_CHANGE_DEBOUNCE_MS);
  });

  // Le service worker signale chaque notification push reçue : on resynchronise aussitôt.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'sync') run();
    });
  }

  run();
};
