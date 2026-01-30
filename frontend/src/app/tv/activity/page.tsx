'use client';

/**
 * TV Activity Feed Page
 *
 * Displays a real-time activity timeline using Remotion Player.
 * Fetches activity data from the API and renders an animated feed.
 */

import { useState, useEffect, useCallback } from 'react';
import { Player } from '@remotion/player';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityTimeline } from '@/remotion/compositions/ActivityTimeline';
import type { Activity, ActivityTimelineProps } from '@/remotion/types';
import { api } from '@/lib/api';

// Create a client for this page
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
  },
});

// API response type
interface ActivityFeedResponse {
  data: Activity[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Settings interface
interface ActivitySettings {
  theme: 'dark' | 'light';
  showTimestamps: boolean;
  refreshInterval: number;
  limit: number;
  autoPlay: boolean;
  loop: boolean;
}

const DEFAULT_SETTINGS: ActivitySettings = {
  theme: 'dark',
  showTimestamps: true,
  refreshInterval: 60000, // 1 minute
  limit: 10,
  autoPlay: true,
  loop: true,
};

function ActivityFeedContent() {
  const [settings, setSettings] = useState<ActivitySettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tv-activity-settings');
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Save settings to localStorage
  const updateSettings = useCallback((updates: Partial<ActivitySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem('tv-activity-settings', JSON.stringify(next));
      return next;
    });
  }, []);

  // Fetch activity data
  const { data: activityData, isLoading, error, refetch } = useQuery({
    queryKey: ['activity-feed', settings.limit],
    queryFn: async () => {
      const response = await api.get<ActivityFeedResponse>(
        `/api/activity-feed?limit=${settings.limit}`
      );
      return response;
    },
    refetchInterval: settings.refreshInterval,
  });

  // Transform API data to Remotion props
  const activities: Activity[] = activityData?.data || [];

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'f') toggleFullscreen();
      if (e.key === 's') setShowSettings((prev) => !prev);
      if (e.key === 'r') refetch();
      if (e.key === 't') updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [toggleFullscreen, refetch, settings.theme, updateSettings]);

  // Props for the composition
  const compositionProps: ActivityTimelineProps = {
    activities,
    title: 'Activity Feed',
    showTimestamps: settings.showTimestamps,
    theme: settings.theme,
  };

  // Calculate duration based on activity count
  const durationInFrames = Math.max(300, 150 + activities.length * 60);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: settings.theme === 'dark' ? '#0a0a0a' : '#ffffff',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Loading state */}
      {isLoading && activities.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                border: '3px solid rgba(255,255,255,0.1)',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span style={{ color: '#71717a', fontSize: 14 }}>Loading activity feed...</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              padding: 32,
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 16,
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            <span style={{ fontSize: 48 }}>⚠️</span>
            <span style={{ color: '#ef4444', fontSize: 16 }}>Failed to load activity feed</span>
            <button
              onClick={() => refetch()}
              style={{
                padding: '8px 24px',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Remotion Player */}
      {!isLoading && !error && (
        <Player
          component={ActivityTimeline}
          inputProps={compositionProps}
          durationInFrames={durationInFrames}
          fps={30}
          compositionWidth={1920}
          compositionHeight={1080}
          style={{
            width: '100%',
            height: '100%',
          }}
          autoPlay={settings.autoPlay}
          loop={settings.loop}
          showVolumeControls={false}
          clickToPlay={false}
        />
      )}

      {/* Controls overlay (hidden in fullscreen) */}
      {!isFullscreen && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            gap: 8,
            zIndex: 100,
          }}
        >
          <button
            onClick={() => setShowSettings((prev) => !prev)}
            style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ⚙️ Settings
          </button>
          <button
            onClick={toggleFullscreen}
            style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ⛶ Fullscreen
          </button>
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      {!isFullscreen && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            display: 'flex',
            gap: 16,
            color: '#52525b',
            fontSize: 12,
            zIndex: 100,
          }}
        >
          <span>
            <kbd style={{ background: '#27272a', padding: '2px 6px', borderRadius: 4 }}>F</kbd>{' '}
            Fullscreen
          </span>
          <span>
            <kbd style={{ background: '#27272a', padding: '2px 6px', borderRadius: 4 }}>S</kbd>{' '}
            Settings
          </span>
          <span>
            <kbd style={{ background: '#27272a', padding: '2px 6px', borderRadius: 4 }}>R</kbd>{' '}
            Refresh
          </span>
          <span>
            <kbd style={{ background: '#27272a', padding: '2px 6px', borderRadius: 4 }}>T</kbd>{' '}
            Toggle theme
          </span>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div
          style={{
            position: 'absolute',
            top: 60,
            right: 16,
            width: 320,
            background: settings.theme === 'dark' ? '#18181b' : '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: 24,
            zIndex: 200,
          }}
        >
          <h3
            style={{
              margin: '0 0 20px 0',
              fontSize: 18,
              fontWeight: 600,
              color: settings.theme === 'dark' ? '#fff' : '#18181b',
            }}
          >
            Settings
          </h3>

          {/* Theme */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 14,
                color: '#71717a',
              }}
            >
              Theme
            </label>
            <select
              value={settings.theme}
              onChange={(e) => updateSettings({ theme: e.target.value as 'dark' | 'light' })}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: settings.theme === 'dark' ? '#27272a' : '#f4f4f5',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: settings.theme === 'dark' ? '#fff' : '#18181b',
                fontSize: 14,
              }}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          {/* Activity count */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 14,
                color: '#71717a',
              }}
            >
              Number of activities
            </label>
            <input
              type="number"
              min={5}
              max={50}
              value={settings.limit}
              onChange={(e) => updateSettings({ limit: parseInt(e.target.value, 10) || 10 })}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: settings.theme === 'dark' ? '#27272a' : '#f4f4f5',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: settings.theme === 'dark' ? '#fff' : '#18181b',
                fontSize: 14,
              }}
            />
          </div>

          {/* Refresh interval */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 14,
                color: '#71717a',
              }}
            >
              Refresh interval (seconds)
            </label>
            <input
              type="number"
              min={10}
              max={300}
              value={settings.refreshInterval / 1000}
              onChange={(e) =>
                updateSettings({ refreshInterval: (parseInt(e.target.value, 10) || 60) * 1000 })
              }
              style={{
                width: '100%',
                padding: '8px 12px',
                background: settings.theme === 'dark' ? '#27272a' : '#f4f4f5',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: settings.theme === 'dark' ? '#fff' : '#18181b',
                fontSize: 14,
              }}
            />
          </div>

          {/* Checkboxes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: settings.theme === 'dark' ? '#fff' : '#18181b',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={settings.showTimestamps}
                onChange={(e) => updateSettings({ showTimestamps: e.target.checked })}
              />
              Show timestamps
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: settings.theme === 'dark' ? '#fff' : '#18181b',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={settings.autoPlay}
                onChange={(e) => updateSettings({ autoPlay: e.target.checked })}
              />
              Auto-play
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: settings.theme === 'dark' ? '#fff' : '#18181b',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={settings.loop}
                onChange={(e) => updateSettings({ loop: e.target.checked })}
              />
              Loop playback
            </label>
          </div>

          {/* Close button */}
          <button
            onClick={() => setShowSettings(false)}
            style={{
              width: '100%',
              marginTop: 20,
              padding: '10px 16px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Close
          </button>
        </div>
      )}

      {/* CSS for spinner animation */}
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

// Wrap with QueryClientProvider
export default function TVActivityPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <ActivityFeedContent />
    </QueryClientProvider>
  );
}
