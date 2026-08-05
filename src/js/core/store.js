const STORAGE_KEY = 'chanfiou.state.v1';

const DEFAULT_STATE = {
  missions: [],
  drivers: [],
  lastQuote: null,
  adminUnlocked: false,
  apiBaseUrl: 'https://api.chanfiou-convoyage.fr',
};

const listeners = new Set();

const readStorage = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

let state = { ...DEFAULT_STATE, ...(readStorage() ?? {}) };

const persist = () => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
};

export const getState = () => state;

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setState = (patch) => {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((listener) => listener(state));
};

export const resetState = () => {
  state = { ...DEFAULT_STATE };
  persist();
  listeners.forEach((listener) => listener(state));
};
