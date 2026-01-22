/**
 * Notification Sound Hook
 *
 * Plays notification sounds for chat messages and other events.
 * Respects user preferences and browser audio policies.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Base64 encoded notification sound (short pleasant chime)
// This avoids needing an external audio file
const NOTIFICATION_SOUND_BASE64 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYL+SCLAAAAAAAAAAAAAAAAAAAAAP/7UGQAD/AAADSAAAAAIAAANIAAAAQAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7UGRAj/AAADSAAAAAIAAANIAAAAQAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';

interface SoundSettings {
  enabled: boolean;
  volume: number; // 0-100
}

const DEFAULT_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 50,
};

/**
 * Hook for managing notification sounds
 */
export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const queryClient = useQueryClient();

  // Get sound settings from server
  const { data: settings } = useQuery({
    queryKey: ['settings', 'notification_sound'],
    queryFn: async () => {
      try {
        const response = await api.get<{ key: string; value: string }>('/api/settings/notification_sound');
        return JSON.parse(response.value) as SoundSettings;
      } catch {
        return DEFAULT_SETTINGS;
      }
    },
    staleTime: 60000, // 1 minute
  });

  // Update sound settings
  const updateSettings = useMutation({
    mutationFn: async (newSettings: Partial<SoundSettings>) => {
      const merged = { ...DEFAULT_SETTINGS, ...settings, ...newSettings };
      await api.put('/api/settings/notification_sound', { value: JSON.stringify(merged) });
      return merged;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['settings', 'notification_sound'], data);
    },
  });

  // Initialize audio element
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Create audio element
    audioRef.current = new Audio(NOTIFICATION_SOUND_BASE64);
    audioRef.current.preload = 'auto';

    // Try to create AudioContext for better control
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      // AudioContext not available
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  // Update volume when settings change
  useEffect(() => {
    if (audioRef.current && settings?.volume !== undefined) {
      audioRef.current.volume = settings.volume / 100;
    }
  }, [settings?.volume]);

  /**
   * Play notification sound
   */
  const playSound = useCallback(async () => {
    // Check if sounds are enabled
    if (!settings?.enabled) return;

    // Check if audio element exists
    if (!audioRef.current) return;

    try {
      // Resume AudioContext if suspended (required by browsers)
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Reset and play
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } catch (error) {
      // Browser may block autoplay - this is expected behavior
      console.debug('Could not play notification sound:', error);
    }
  }, [settings?.enabled]);

  /**
   * Play sound for new message
   */
  const playMessageSound = useCallback(() => {
    playSound();
  }, [playSound]);

  /**
   * Enable/disable sounds
   */
  const setEnabled = useCallback((enabled: boolean) => {
    updateSettings.mutate({ enabled });
  }, [updateSettings]);

  /**
   * Set volume (0-100)
   */
  const setVolume = useCallback((volume: number) => {
    updateSettings.mutate({ volume: Math.max(0, Math.min(100, volume)) });
  }, [updateSettings]);

  /**
   * Toggle sounds on/off
   */
  const toggleSound = useCallback(() => {
    updateSettings.mutate({ enabled: !settings?.enabled });
  }, [settings?.enabled, updateSettings]);

  return {
    // State
    enabled: settings?.enabled ?? DEFAULT_SETTINGS.enabled,
    volume: settings?.volume ?? DEFAULT_SETTINGS.volume,
    isLoading: updateSettings.isPending,

    // Actions
    playSound,
    playMessageSound,
    setEnabled,
    setVolume,
    toggleSound,
  };
}

/**
 * Hook to automatically play sound on new team messages
 */
export function useTeamChatNotificationSound(
  currentUserId: string | undefined,
  isWindowFocused: boolean = true
) {
  const { playMessageSound, enabled } = useNotificationSound();
  const lastMessageIdRef = useRef<string | null>(null);

  const handleNewMessage = useCallback((message: { id: string; senderId?: string }) => {
    // Don't play sound for own messages
    if (message.senderId === currentUserId) return;

    // Don't play if same message (deduplication)
    if (message.id === lastMessageIdRef.current) return;

    // Don't play if window is focused and user is actively viewing
    // (optional - you might want sounds even when focused)
    // if (isWindowFocused) return;

    lastMessageIdRef.current = message.id;
    playMessageSound();
  }, [currentUserId, playMessageSound]);

  return {
    handleNewMessage,
    enabled,
  };
}

export default useNotificationSound;
