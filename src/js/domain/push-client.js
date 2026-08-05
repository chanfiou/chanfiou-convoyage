import { fetchPushKey } from '../data/api.js';

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const subscribeToPush = async () => {
  if (!pushSupported()) {
    return {
      error:
        'Notifications non disponibles ici. Sur iPhone, installez d’abord l’application sur l’écran d’accueil et ouvrez-la depuis son icône.',
    };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { error: 'Autorisation refusée. Activez les notifications dans les réglages de l’appareil.' };
  }
  const { data, error } = await fetchPushKey();
  if (error) return { error };
  const applicationServerKey = Uint8Array.from(
    atob(data.key.replace(/-/g, '+').replace(/_/g, '/')),
    (character) => character.charCodeAt(0),
  );
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
    return { subscription: subscription.toJSON() };
  } catch {
    return { error: 'Activation impossible sur cet appareil ou ce navigateur.' };
  }
};
