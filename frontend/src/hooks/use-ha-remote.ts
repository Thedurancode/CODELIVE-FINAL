'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useTVRemoteController } from './use-tv-remote';

// ============================================================================
// TYPES
// ============================================================================

export interface HADeviceState {
  entity_id: string;
  state: string;
  friendly_name: string;
  domain: string;
  attributes: Record<string, any>;
  brightness?: number;
  color_temp?: number;
  rgb_color?: [number, number, number];
  temperature?: number;
  hvac_mode?: string;
  current_temperature?: number;
  media_title?: string;
  media_artist?: string;
  volume_level?: number;
}

export interface HARemoteStatus {
  configId: string;
  states: HADeviceState[];
}

export type HAAction =
  | 'turn_on'
  | 'turn_off'
  | 'toggle'
  | 'media_play_pause'
  | 'set_brightness'
  | 'set_color'
  | 'set_temperature'
  | 'set_mode'
  | 'activate_scene'
  | 'call_service';

// Get WebSocket URL
const getWebSocketUrl = () => {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = process.env.NEXT_PUBLIC_WS_HOST || window.location.hostname;
  const port = process.env.NEXT_PUBLIC_API_PORT || '3001';
  return `${protocol}//${host}:${port}/ws/tv-remote`;
};

/**
 * Hook for controlling Home Assistant devices via the TV Remote WebSocket
 * This allows the iPad to control HA devices through the same WebSocket connection
 * used for TV remote control.
 */
export function useHARemoteController(roomCode?: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [haDevices, setHaDevices] = useState<HADeviceState[]>([]);
  const [configId, setConfigId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Connect to WebSocket
  const connect = useCallback((room?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(getWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[HARemote] WebSocket connected');
      setIsConnected(true);
      setError(null);

      // Join room if provided
      if (room) {
        ws.send(
          JSON.stringify({
            type: 'join',
            room,
            role: 'remote',
            timestamp: new Date().toISOString(),
          })
        );
      }

      // Subscribe to HA states
      console.log('[HARemote] Sending ha-subscribe');
      ws.send(
        JSON.stringify({
          type: 'ha-subscribe',
          payload: {},
          timestamp: new Date().toISOString(),
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[HARemote] Received message:', message.type, message);
        handleMessage(message);
      } catch (e) {
        console.error('[HARemote] Failed to parse message:', e);
      }
    };

    ws.onerror = (event) => {
      console.error('[HARemote] WebSocket error:', event);
      setError('Connection error');
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsSubscribed(false);
      wsRef.current = null;

      // Attempt reconnection
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        connect(room);
      }, 3000);
    };
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((message: any) => {
    console.log('[HARemote] handleMessage:', message.type);
    switch (message.type) {
      case 'ha-states':
        // Initial state load
        console.log('[HARemote] Received ha-states:', message.payload?.states?.length, 'devices');
        if (message.payload?.states) {
          setHaDevices(message.payload.states);
          setConfigId(message.payload.configId);
          setIsSubscribed(true);
          console.log('[HARemote] Set isSubscribed to true');
        }
        break;

      case 'ha-state':
        // Single state update
        if (message.payload) {
          console.log('[HARemote] State update:', message.payload.entity_id, '->', message.payload.state);
          setHaDevices((prev) => {
            const index = prev.findIndex((d) => d.entity_id === message.payload.entity_id);
            if (index >= 0) {
              const updated = [...prev];
              // Merge old device data with new state data
              updated[index] = { ...prev[index], ...message.payload };
              return updated;
            }
            return [...prev, message.payload];
          });
        }
        break;

      case 'ha-result':
        // Command result
        if (!message.payload?.success && message.payload?.error) {
          // Make error message more user-friendly
          let errorMsg = message.payload.error;
          if (errorMsg.includes('timed out') || errorMsg.includes('fetch failed')) {
            errorMsg = 'Device not responding - it may be turned off or unreachable';
          } else if (errorMsg.includes('not supported') || errorMsg.includes('400')) {
            errorMsg = 'This action is not supported by this device';
          } else if (errorMsg.includes('500')) {
            errorMsg = 'Device control failed - the device may be unavailable';
          }
          console.warn(`[HARemote] Command failed for ${message.payload.entityId}: ${errorMsg}`);
          setError(errorMsg);
          setTimeout(() => setError(null), 5000);
        }
        break;

      case 'error':
        setError(message.error);
        break;
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.send(
        JSON.stringify({
          type: 'ha-unsubscribe',
          timestamp: new Date().toISOString(),
        })
      );
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsSubscribed(false);
  }, []);

  // Send HA command
  const sendCommand = useCallback(
    (action: HAAction, entityId?: string, data?: Record<string, any>, extra?: { domain?: string; service?: string }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setError('Not connected');
        return;
      }

      wsRef.current.send(
        JSON.stringify({
          type: 'ha-command',
          payload: {
            action,
            entityId,
            data,
            ...extra,  // domain/service for call_service action
          },
          timestamp: new Date().toISOString(),
        })
      );
    },
    []
  );

  // Convenience methods
  const turnOn = useCallback(
    (entityId: string, options?: Record<string, any>) => {
      sendCommand('turn_on', entityId, options);
    },
    [sendCommand]
  );

  const turnOff = useCallback(
    (entityId: string) => {
      sendCommand('turn_off', entityId);
    },
    [sendCommand]
  );

  const toggle = useCallback(
    (entityId: string) => {
      sendCommand('toggle', entityId);
    },
    [sendCommand]
  );

  const mediaPlayPause = useCallback(
    (entityId: string) => {
      sendCommand('media_play_pause', entityId);
    },
    [sendCommand]
  );

  const setBrightness = useCallback(
    (entityId: string, brightness: number) => {
      sendCommand('set_brightness', entityId, { brightness });
    },
    [sendCommand]
  );

  const setColor = useCallback(
    (entityId: string, color: { r: number; g: number; b: number } | string) => {
      const data =
        typeof color === 'string' ? { hex_color: color } : { rgb_color: [color.r, color.g, color.b] };
      sendCommand('set_color', entityId, data);
    },
    [sendCommand]
  );

  const setTemperature = useCallback(
    (entityId: string, temperature: number) => {
      sendCommand('set_temperature', entityId, { temperature });
    },
    [sendCommand]
  );

  const setVolume = useCallback(
    (entityId: string, volume: number) => {
      sendCommand('call_service', entityId, { volume_level: volume }, { domain: 'media_player', service: 'volume_set' });
    },
    [sendCommand]
  );

  const setMode = useCallback(
    (entityId: string, mode: string) => {
      sendCommand('set_mode', entityId, { mode });
    },
    [sendCommand]
  );

  const activateScene = useCallback(
    (sceneId: string) => {
      sendCommand('activate_scene', sceneId);
    },
    [sendCommand]
  );

  const callService = useCallback(
    (domain: string, service: string, entityId?: string, data?: Record<string, any>) => {
      sendCommand('call_service', entityId, data, { domain, service });
    },
    [sendCommand]
  );

  // Filter helpers
  const getDevicesByDomain = useCallback(
    (domain: string) => {
      return haDevices.filter((d) => d.domain === domain);
    },
    [haDevices]
  );

  const getLights = useCallback(() => getDevicesByDomain('light'), [getDevicesByDomain]);
  const getSwitches = useCallback(() => getDevicesByDomain('switch'), [getDevicesByDomain]);
  const getClimate = useCallback(() => getDevicesByDomain('climate'), [getDevicesByDomain]);
  const getMediaPlayers = useCallback(() => getDevicesByDomain('media_player'), [getDevicesByDomain]);
  const getScenes = useCallback(() => getDevicesByDomain('scene'), [getDevicesByDomain]);
  const getSensors = useCallback(() => getDevicesByDomain('sensor'), [getDevicesByDomain]);

  // Get device by entity ID
  const getDevice = useCallback(
    (entityId: string) => {
      return haDevices.find((d) => d.entity_id === entityId);
    },
    [haDevices]
  );

  // Connect on mount - always connect for HA control (room code is optional)
  useEffect(() => {
    // Always connect to WebSocket for HA control
    connect(roomCode);

    return () => {
      disconnect();
    };
  }, [roomCode, connect, disconnect]);

  return {
    // Connection state
    isConnected,
    isSubscribed,
    configId,
    error,

    // Devices
    devices: haDevices,
    getDevice,
    getDevicesByDomain,
    getLights,
    getSwitches,
    getClimate,
    getMediaPlayers,
    getScenes,
    getSensors,

    // Connection methods
    connect,
    disconnect,

    // Actions
    sendCommand,
    turnOn,
    turnOff,
    toggle,
    mediaPlayPause,
    setBrightness,
    setColor,
    setTemperature,
    setVolume,
    setMode,
    activateScene,
    callService,
  };
}

/**
 * Combined hook that provides both TV Remote and HA control
 */
export function useCombinedRemote(roomCode?: string) {
  const tvRemote = useTVRemoteController(roomCode);
  const haRemote = useHARemoteController(roomCode);

  return {
    // TV Remote
    tv: {
      status: tvRemote.status,
      isConnected: tvRemote.isConnected,
      sendCommand: tvRemote.sendCommand,
      next: tvRemote.next,
      prev: tvRemote.prev,
      goto: tvRemote.goto,
      togglePause: tvRemote.togglePause,
      setSpeed: tvRemote.setSpeed,
      toggleFullscreen: tvRemote.toggleFullscreen,
    },

    // Home Assistant
    ha: {
      isConnected: haRemote.isConnected,
      isSubscribed: haRemote.isSubscribed,
      devices: haRemote.devices,
      error: haRemote.error,
      getLights: haRemote.getLights,
      getSwitches: haRemote.getSwitches,
      getClimate: haRemote.getClimate,
      getScenes: haRemote.getScenes,
      turnOn: haRemote.turnOn,
      turnOff: haRemote.turnOff,
      toggle: haRemote.toggle,
      setBrightness: haRemote.setBrightness,
      setColor: haRemote.setColor,
      setTemperature: haRemote.setTemperature,
      activateScene: haRemote.activateScene,
      callService: haRemote.callService,
    },

    // Room info
    roomCode,
    connectionMode: tvRemote.connectionMode,
  };
}
