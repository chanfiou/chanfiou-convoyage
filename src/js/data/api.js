import { getState, setState } from '../core/store.js';

const REQUEST_TIMEOUT_MS = 12000;

export const apiBaseUrl = () => String(getState().apiBaseUrl ?? '').replace(/\/+$/, '');

export const isConfigured = () => apiBaseUrl().length > 0;

export const session = () => getState().session ?? null;

export const isSignedIn = () => {
  const current = session();
  if (!current?.token) return false;
  return !current.expiresAt || current.expiresAt * 1000 > Date.now();
};

export const clearSession = () => setState({ session: null });

const request = async (path, { method = 'GET', body, authenticated = false } = {}) => {
  if (!isConfigured()) return { error: 'Aucun serveur configuré. Renseignez son adresse dans les réglages.' };

  const headers = { 'content-type': 'application/json' };
  if (authenticated) {
    if (!isSignedIn()) return { error: 'Votre session a expiré. Reconnectez-vous.', unauthorized: true };
    headers.authorization = `Bearer ${session().token}`;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (response.status === 401) {
      clearSession();
      return { error: data.error ?? 'Connexion requise.', unauthorized: true };
    }
    if (!response.ok) return { error: data.error ?? `Le serveur a répondu ${response.status}.`, status: response.status, data };
    return { data };
  } catch (cause) {
    console.error('ERREUR REQUEST:', cause.name, cause.message, cause);
    if (cause.name === 'AbortError') {
      return { error: 'Le serveur ne répond pas. Vos données restent enregistrées sur cet appareil.', offline: true };
    }
    return { error: 'Serveur injoignable. Vos données restent enregistrées sur cet appareil.', offline: true };
  } finally {
    window.clearTimeout(timer);
  }
};

export const checkHealth = () => request('/api/health');

export const signIn = async (email, password) => {
  const { data, error } = await request('/api/session', {
    method: 'POST',
    body: { email, password },
  });
  if (error) return { error };
  setState({ session: { token: data.token, expiresAt: data.expiresAt, email }, adminUnlocked: true });
  return { session: data };
};

export const signOut = () => setState({ session: null, adminUnlocked: false });

export const submitRequest = (mission) =>
  request('/api/requests', { method: 'POST', body: { mission } });

export const fetchTrackedMission = (reference, token) =>
  request(`/api/requests/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}`);

export const fetchMissions = (since) =>
  request(`/api/missions${since ? `?since=${encodeURIComponent(since)}` : ''}`, { authenticated: true });

export const pushMission = (mission) =>
  request('/api/missions', { method: 'PATCH', body: { mission }, authenticated: true });

export const deleteMissionOnServer = (reference) =>
  request(`/api/missions/${encodeURIComponent(reference)}`, {
    method: 'DELETE',
    authenticated: true,
  });

export const transmitInvoiceToAbby = (invoice) =>
  request('/api/abby/invoice', { method: 'POST', body: { invoice }, authenticated: true });

export const fetchPushKey = () => request('/api/push/key');

export const savePushSubscription = (subscription) =>
  request('/api/push/subscribe', { method: 'POST', body: { subscription }, authenticated: true });

export const sendTestPush = () => request('/api/push/test', { method: 'POST', body: {}, authenticated: true });

export const saveClientPushSubscription = (reference, token, subscription) =>
  request('/api/push/track', { method: 'POST', body: { reference, token, subscription } });

export const fetchAvailability = () => request('/api/availability');

export const fetchAvailabilityDetailed = () => request('/api/availability', { authenticated: true });

export const saveAvailability = (day, blocked) =>
  request('/api/availability', { method: 'POST', body: { day, blocked }, authenticated: true });

export const uploadReportPhoto = (reference, dataUrl) =>
  request('/api/photos', { method: 'POST', body: { reference, dataUrl }, authenticated: true });

export const pushBackup = (backup) =>
  request('/api/backup', { method: 'POST', body: backup, authenticated: true });

export const fetchBackup = () => request('/api/backup', { authenticated: true });

export const signContract = (reference, token, signature, signatoryName) =>
  request('/api/contract-signature', {
    method: 'POST',
    body: { reference, token, signature, signatoryName },
  });
