'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const CHANNEL_NAME = 'tv-remote-control';

// Get WebSocket URL based on environment
const getWebSocketUrl = () => {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = process.env.NEXT_PUBLIC_WS_HOST || window.location.hostname;
  const port = process.env.NEXT_PUBLIC_API_PORT || '3001';
  return `${protocol}//${host}:${port}/ws/tv-remote`;
};

// Slide configuration type
export interface SlideConfig {
  type: string;
  duration: number;
  label: string;
  url?: string;
}

// Command types sent from iPad to TV
export type RemoteCommand =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; index: number }
  | { type: 'pause' }
  | { type: 'play' }
  | { type: 'toggle-pause' }
  | { type: 'fullscreen' }
  | { type: 'set-speed'; speed: number }
  | { type: 'set-brightness'; value: number }
  | { type: 'refresh' }
  | { type: 'request-status' }
  // Slide management commands
  | { type: 'add-slide'; slide: SlideConfig }
  | { type: 'remove-slide'; index: number }
  | { type: 'update-slide'; index: number; slide: Partial<SlideConfig> }
  | { type: 'reorder-slide'; fromIndex: number; toIndex: number }
  | { type: 'toggle-slideshow'; enabled: boolean };

// Status updates sent from TV to iPad
export interface TVStatus {
  type: 'status';
  currentSlideIndex: number;
  totalSlides: number;
  isPaused: boolean;
  isFullscreen: boolean;
  currentSlideLabel: string;
  speed: number;
  brightness: number;
  slideshowEnabled: boolean;
  slides: SlideConfig[];
}

// Connection mode
export type ConnectionMode = 'broadcast' | 'websocket';

// Room info from WebSocket
interface RoomInfo {
  hasDisplay: boolean;
  remoteCount: number;
}

// Hook for iPad controller - sends commands and receives status
export function useTVRemoteController(roomCode?: string) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<TVStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('broadcast');
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const lastResponseRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Send message via appropriate channel
  const sendMessage = useCallback((message: any) => {
    if (connectionMode === 'websocket' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'command',
        payload: message,
        timestamp: new Date().toISOString(),
      }));
    } else if (channelRef.current) {
      channelRef.current.postMessage(message);
    }
  }, [connectionMode]);

  // Connect to WebSocket
  const connectWebSocket = useCallback((room: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(getWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      // Join room as remote
      ws.send(JSON.stringify({
        type: 'join',
        room,
        role: 'remote',
        timestamp: new Date().toISOString(),
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'status') {
          setStatus({ type: 'status', ...data.payload } as TVStatus);
          setIsConnected(true);
          lastResponseRef.current = Date.now();
        } else if (data.type === 'room-info') {
          setRoomInfo(data.payload as RoomInfo);
          setIsConnected(data.payload.hasDisplay);
          if (data.payload.hasDisplay) {
            lastResponseRef.current = Date.now();
          }
        } else if (data.type === 'error') {
          console.error('[TVRemote] WebSocket error:', data.error);
        }
      } catch (e) {
        console.error('[TVRemote] Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      // Attempt to reconnect after 3 seconds
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (roomCode) {
          connectWebSocket(roomCode);
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('[TVRemote] WebSocket error:', error);
    };
  }, [roomCode]);

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Initialize connection based on mode
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // If room code provided, use WebSocket
    if (roomCode) {
      setConnectionMode('websocket');
      connectWebSocket(roomCode);

      return () => {
        disconnectWebSocket();
      };
    }

    // Otherwise, use BroadcastChannel for same-device communication
    if (!('BroadcastChannel' in window)) {
      return;
    }

    setConnectionMode('broadcast');
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event) => {
      const data = event.data;
      if (data?.type === 'status') {
        setStatus(data as TVStatus);
        setIsConnected(true);
        lastResponseRef.current = Date.now();
      }
    };

    // Request initial status
    channel.postMessage({ type: 'request-status' });

    // Poll for status periodically and detect disconnection
    const interval = setInterval(() => {
      channel.postMessage({ type: 'request-status' });

      // If no response in 5 seconds, consider disconnected
      if (lastResponseRef.current > 0 && Date.now() - lastResponseRef.current > 5000) {
        setIsConnected(false);
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      channel.close();
      channelRef.current = null;
    };
  }, [roomCode, connectWebSocket, disconnectWebSocket]);

  // Request status periodically when using WebSocket
  useEffect(() => {
    if (connectionMode !== 'websocket' || !wsRef.current) return;

    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'command',
          payload: { type: 'request-status' },
          timestamp: new Date().toISOString(),
        }));
      }

      // If no response in 5 seconds, consider disconnected
      if (lastResponseRef.current > 0 && Date.now() - lastResponseRef.current > 5000) {
        setIsConnected(false);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [connectionMode]);

  const sendCommand = useCallback((command: RemoteCommand) => {
    sendMessage(command);
  }, [sendMessage]);

  const next = useCallback(() => sendCommand({ type: 'next' }), [sendCommand]);
  const prev = useCallback(() => sendCommand({ type: 'prev' }), [sendCommand]);
  const goTo = useCallback((index: number) => sendCommand({ type: 'goto', index }), [sendCommand]);
  const pause = useCallback(() => sendCommand({ type: 'pause' }), [sendCommand]);
  const play = useCallback(() => sendCommand({ type: 'play' }), [sendCommand]);
  const togglePause = useCallback(() => sendCommand({ type: 'toggle-pause' }), [sendCommand]);
  const toggleFullscreen = useCallback(() => sendCommand({ type: 'fullscreen' }), [sendCommand]);
  const setSpeed = useCallback((speed: number) => sendCommand({ type: 'set-speed', speed }), [sendCommand]);
  const setBrightness = useCallback((value: number) => sendCommand({ type: 'set-brightness', value }), [sendCommand]);
  const refresh = useCallback(() => sendCommand({ type: 'refresh' }), [sendCommand]);

  // Slide management
  const addSlide = useCallback((slide: SlideConfig) => sendCommand({ type: 'add-slide', slide }), [sendCommand]);
  const removeSlide = useCallback((index: number) => sendCommand({ type: 'remove-slide', index }), [sendCommand]);
  const updateSlide = useCallback((index: number, slide: Partial<SlideConfig>) => sendCommand({ type: 'update-slide', index, slide }), [sendCommand]);
  const reorderSlide = useCallback((fromIndex: number, toIndex: number) => sendCommand({ type: 'reorder-slide', fromIndex, toIndex }), [sendCommand]);
  const toggleSlideshow = useCallback((enabled: boolean) => sendCommand({ type: 'toggle-slideshow', enabled }), [sendCommand]);

  return {
    status,
    isConnected,
    connectionMode,
    roomInfo,
    sendCommand,
    next,
    prev,
    goTo,
    pause,
    play,
    togglePause,
    toggleFullscreen,
    setSpeed,
    setBrightness,
    refresh,
    // Slide management
    addSlide,
    removeSlide,
    updateSlide,
    reorderSlide,
    toggleSlideshow,
  };
}

// Handler types for TV display
export interface TVRemoteHandlers {
  onNext: () => void;
  onPrev: () => void;
  onGoTo: (index: number) => void;
  onPause: () => void;
  onPlay: () => void;
  onTogglePause: () => void;
  onFullscreen: () => void;
  onSetSpeed: (speed: number) => void;
  onSetBrightness: (value: number) => void;
  onRefresh: () => void;
  // Slide management
  onAddSlide: (slide: SlideConfig) => void;
  onRemoveSlide: (index: number) => void;
  onUpdateSlide: (index: number, slide: Partial<SlideConfig>) => void;
  onReorderSlide: (fromIndex: number, toIndex: number) => void;
  onToggleSlideshow: (enabled: boolean) => void;
  getStatus: () => Omit<TVStatus, 'type'>;
}

// Hook for TV display - receives commands and broadcasts status
export function useTVRemoteReceiver(handlers: TVRemoteHandlers, roomCode?: string) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('broadcast');
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [wasKickedOut, setWasKickedOut] = useState(false);
  const kickedOutRef = useRef(false); // Use ref to avoid stale closure in callbacks

  // Broadcast status via appropriate channel
  const broadcastStatus = useCallback(() => {
    const status = handlers.getStatus();

    if (connectionMode === 'websocket' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'status',
        payload: status,
        timestamp: new Date().toISOString(),
      }));
    }

    if (channelRef.current) {
      channelRef.current.postMessage({ type: 'status', ...status });
    }
  }, [handlers, connectionMode]);

  // Process incoming command
  const processCommand = useCallback((command: RemoteCommand) => {
    switch (command.type) {
      case 'next':
        handlers.onNext();
        break;
      case 'prev':
        handlers.onPrev();
        break;
      case 'goto':
        handlers.onGoTo(command.index);
        break;
      case 'pause':
        handlers.onPause();
        break;
      case 'play':
        handlers.onPlay();
        break;
      case 'toggle-pause':
        handlers.onTogglePause();
        break;
      case 'fullscreen':
        handlers.onFullscreen();
        break;
      case 'set-speed':
        handlers.onSetSpeed(command.speed);
        break;
      case 'set-brightness':
        handlers.onSetBrightness(command.value);
        break;
      case 'refresh':
        handlers.onRefresh();
        break;
      case 'add-slide':
        handlers.onAddSlide(command.slide);
        break;
      case 'remove-slide':
        handlers.onRemoveSlide(command.index);
        break;
      case 'update-slide':
        handlers.onUpdateSlide(command.index, command.slide);
        break;
      case 'reorder-slide':
        handlers.onReorderSlide(command.fromIndex, command.toIndex);
        break;
      case 'toggle-slideshow':
        handlers.onToggleSlideshow(command.enabled);
        break;
      case 'request-status':
        // Status will be broadcast after this function
        break;
    }
  }, [handlers]);

  // Connect to WebSocket
  const connectWebSocket = useCallback((room: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(getWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      // Join room as display
      ws.send(JSON.stringify({
        type: 'join',
        room,
        role: 'display',
        timestamp: new Date().toISOString(),
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'command' && data.payload) {
          processCommand(data.payload as RemoteCommand);
          // Broadcast updated status after processing command
          setTimeout(broadcastStatus, 50);
        } else if (data.type === 'room-info') {
          setRoomInfo(data.payload as RoomInfo);
        } else if (data.type === 'error') {
          console.warn('[TVRemote] WebSocket error:', data.error);
          // Handle "kicked out" scenario - another display took over this room
          if (data.error === 'Another display connected to this room') {
            console.info('[TVRemote] This display was replaced by another. Stopping reconnection attempts.');
            kickedOutRef.current = true;
            setWasKickedOut(true);
            // Close WebSocket cleanly - onclose will check kickedOutRef and skip reconnection
          }
        }
      } catch (e) {
        console.error('[TVRemote] Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;

      // Don't reconnect if this display was kicked out by another display
      if (kickedOutRef.current) {
        console.info('[TVRemote] Not reconnecting - display was replaced.');
        return;
      }

      // Attempt to reconnect after 3 seconds
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (roomCode) {
          connectWebSocket(roomCode);
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('[TVRemote] WebSocket error:', error);
    };
  }, [roomCode, processCommand, broadcastStatus]);

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Initialize connection based on mode
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // If room code provided, use WebSocket
    if (roomCode) {
      setConnectionMode('websocket');
      connectWebSocket(roomCode);
    }

    // Always set up BroadcastChannel for local connections
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;

      channel.onmessage = (event) => {
        const command = event.data as RemoteCommand;
        processCommand(command);
        // Broadcast updated status after processing command
        setTimeout(broadcastStatus, 50);
      };

      // Broadcast initial status
      setTimeout(broadcastStatus, 100);
    }

    return () => {
      disconnectWebSocket();
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
    };
  }, [roomCode, connectWebSocket, disconnectWebSocket, processCommand, broadcastStatus]);

  // Reset kicked out state and attempt to reconnect
  const resetConnection = useCallback(() => {
    kickedOutRef.current = false;
    setWasKickedOut(false);
    if (roomCode) {
      connectWebSocket(roomCode);
    }
  }, [roomCode, connectWebSocket]);

  return {
    broadcastStatus,
    connectionMode,
    roomInfo,
    wasKickedOut,
    resetConnection,
  };
}

// Generate a random room code
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
