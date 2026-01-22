/**
 * Push Notifications Utility
 *
 * Handles service worker registration and push subscription management.
 * Uses the Web Push API for background notifications.
 */

import { api } from './api';

// Check if push notifications are supported
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('Service worker registered:', registration.scope);

    // Check for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available
            console.log('New service worker available');
          }
        });
      }
    });

    return registration;
  } catch (error) {
    console.error('Service worker registration failed:', error);
    return null;
  }
}

/**
 * Get the current push subscription
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/**
 * Convert a base64 string to Uint8Array (for applicationServerKey)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    console.warn('Push notifications not supported');
    return null;
  }

  try {
    // Request notification permission first
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission denied');
      return null;
    }

    // Ensure service worker is registered
    const registration = await navigator.serviceWorker.ready;

    // Get VAPID public key from server
    const { key: vapidPublicKey } = await api.get<{ key: string }>('/api/push/vapid-public-key');

    if (!vapidPublicKey) {
      console.warn('VAPID public key not configured on server');
      return null;
    }

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });

    // Send subscription to server
    await api.post('/api/push/subscribe', subscription.toJSON());

    console.log('Push notification subscription successful');
    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const subscription = await getCurrentSubscription();

    if (subscription) {
      // Notify server first
      await api.delete('/api/push/unsubscribe', {
        data: { endpoint: subscription.endpoint },
      });

      // Then unsubscribe locally
      await subscription.unsubscribe();
      console.log('Push notification unsubscribed');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to unsubscribe from push:', error);
    return false;
  }
}

/**
 * Check if user is subscribed to push notifications
 */
export async function isSubscribedToPush(): Promise<boolean> {
  const subscription = await getCurrentSubscription();
  return subscription !== null;
}

/**
 * Initialize push notifications
 * Should be called on app startup for logged-in users
 */
export async function initializePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  try {
    // Register service worker
    await registerServiceWorker();

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'notification-click') {
        handleNotificationClick(event.data.data);
      } else if (event.data?.type === 'push-subscription-changed') {
        handleSubscriptionChange(event.data.subscription);
      }
    });

    // Check if already subscribed
    const isSubscribed = await isSubscribedToPush();

    if (!isSubscribed && Notification.permission === 'granted') {
      // User has granted permission before, re-subscribe
      await subscribeToPush();
    }

    return true;
  } catch (error) {
    console.error('Failed to initialize push notifications:', error);
    return false;
  }
}

/**
 * Handle notification click from service worker
 */
function handleNotificationClick(data: Record<string, unknown>): void {
  // Navigate to the relevant page
  if (data.url && typeof data.url === 'string') {
    window.location.href = data.url;
  }

  // Dispatch custom event for app handling
  window.dispatchEvent(
    new CustomEvent('push-notification-click', {
      detail: data,
    })
  );
}

/**
 * Handle subscription change from service worker
 */
async function handleSubscriptionChange(
  newSubscription: PushSubscriptionJSON
): Promise<void> {
  try {
    await api.post('/api/push/subscribe', newSubscription);
    console.log('Push subscription updated on server');
  } catch (error) {
    console.error('Failed to update push subscription:', error);
  }
}

/**
 * Request push notification permission and subscribe
 * Use this for explicit user opt-in
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  const permission = await Notification.requestPermission();

  if (permission === 'granted') {
    const subscription = await subscribeToPush();
    return subscription !== null;
  }

  return false;
}

/**
 * Get the current notification permission status
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) {
    return 'unsupported';
  }

  return Notification.permission;
}
