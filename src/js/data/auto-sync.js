import { subscribe } from '../core/store.js';
import { isConfigured, isSignedIn } from './api.js';
import { pendingMissions, syncNow } from './sync.js';

const SYNC_INTERVAL_MS = 60000;
const LOCAL_CHANGE_DEBOUNCE_MS = 3000;

let started = false;
let running = false;
let debounceTimer = null;

const canSync = () => navigator.onLine && isConfigured() && isSignedIn();

const run = async () => {
  if (running || !canSync()) return;
  running = true;
  try {
    await syncNow();
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
