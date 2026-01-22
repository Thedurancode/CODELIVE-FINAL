'use client';

// Notification sound management
class NotificationManager {
  private audioContext: AudioContext | null = null;
  private soundEnabled = true;
  private notificationsEnabled = false;
  private notificationPermission: NotificationPermission = 'default';

  constructor() {
    if (typeof window !== 'undefined') {
      this.notificationPermission = Notification?.permission || 'default';
      this.loadPreferences();
    }
  }

  private loadPreferences() {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem('messenger_preferences');
    if (stored) {
      try {
        const prefs = JSON.parse(stored);
        this.soundEnabled = prefs.soundEnabled ?? true;
        this.notificationsEnabled = prefs.notificationsEnabled ?? false;
      } catch {
        // Use defaults
      }
    }
  }

  private savePreferences() {
    if (typeof window === 'undefined') return;

    localStorage.setItem('messenger_preferences', JSON.stringify({
      soundEnabled: this.soundEnabled,
      notificationsEnabled: this.notificationsEnabled,
    }));
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  // Play a pleasant notification sound using Web Audio API
  playNotificationSound(type: 'message' | 'mention' = 'message') {
    if (!this.soundEnabled || typeof window === 'undefined') return;

    try {
      const ctx = this.getAudioContext();

      // Resume context if suspended (browsers require user interaction)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Different sounds for different notification types
      if (type === 'mention') {
        // Higher pitch, two tones for mentions
        oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
        oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // C#6
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
      } else {
        // Single soft tone for regular messages
        oscillator.frequency.setValueAtTime(587, ctx.currentTime); // D5
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
      }
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  }

  // Request notification permission
  async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      this.notificationPermission = 'granted';
      this.notificationsEnabled = true;
      this.savePreferences();
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.notificationPermission = permission;
      this.notificationsEnabled = permission === 'granted';
      this.savePreferences();
      return permission === 'granted';
    }

    return false;
  }

  // Show a browser notification
  showNotification(title: string, options?: {
    body?: string;
    icon?: string;
    tag?: string;
    onClick?: () => void;
  }) {
    if (!this.notificationsEnabled || typeof window === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    // Don't show if tab is focused
    if (document.hasFocus()) return;

    try {
      const notification = new Notification(title, {
        body: options?.body,
        icon: options?.icon || '/icon-192.png',
        tag: options?.tag || 'team-chat',
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        options?.onClick?.();
      };

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch (error) {
      console.warn('Could not show notification:', error);
    }
  }

  // Getters and setters
  isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    this.savePreferences();
  }

  isNotificationsEnabled(): boolean {
    return this.notificationsEnabled && this.notificationPermission === 'granted';
  }

  setNotificationsEnabled(enabled: boolean) {
    this.notificationsEnabled = enabled;
    this.savePreferences();
  }

  getNotificationPermission(): NotificationPermission {
    return this.notificationPermission;
  }
}

// Singleton instance
export const notificationManager = new NotificationManager();

// React hook for notification preferences
export function useNotificationPreferences() {
  return {
    soundEnabled: notificationManager.isSoundEnabled(),
    notificationsEnabled: notificationManager.isNotificationsEnabled(),
    notificationPermission: notificationManager.getNotificationPermission(),
    setSoundEnabled: (enabled: boolean) => notificationManager.setSoundEnabled(enabled),
    setNotificationsEnabled: (enabled: boolean) => notificationManager.setNotificationsEnabled(enabled),
    requestPermission: () => notificationManager.requestNotificationPermission(),
    playSound: (type?: 'message' | 'mention') => notificationManager.playNotificationSound(type),
    showNotification: (title: string, options?: Parameters<typeof notificationManager.showNotification>[1]) =>
      notificationManager.showNotification(title, options),
  };
}
