/**
 * Sprite WebSocket Hook
 *
 * Custom hook for managing WebSocket connection to Sprite terminal.
 * Handles bidirectional I/O, reconnection, and terminal resize events.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTerminalDimensions } from '@/stores/sprite-store';

// WebSocket message types
export type SpriteWsMessageType =
  | 'input'
  | 'output'
  | 'error'
  | 'resize'
  | 'status'
  | 'ping'
  | 'pong'
  | 'connected'
  | 'disconnected';

export interface SpriteWsMessage {
  type: SpriteWsMessageType;
  data?: string;
  error?: string;
  cols?: number;
  rows?: number;
  status?: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseSpriteWebSocketOptions {
  spriteId: string | null;
  sessionId?: string;
  cols?: number;
  rows?: number;
  onOutput?: (data: string) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

interface UseSpriteWebSocketReturn {
  status: ConnectionStatus;
  connect: () => void;
  disconnect: () => void;
  send: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  isConnected: boolean;
  error: string | null;
}

const DEFAULT_RECONNECT_ATTEMPTS = 3;
const DEFAULT_RECONNECT_DELAY = 2000;
const PING_INTERVAL = 30000;

export function useSpriteWebSocket(
  options: UseSpriteWebSocketOptions
): UseSpriteWebSocketReturn {
  const {
    spriteId,
    sessionId,
    cols = 80,
    rows = 24,
    onOutput,
    onError,
    onStatusChange,
    autoConnect = true,
    reconnectAttempts = DEFAULT_RECONNECT_ATTEMPTS,
    reconnectDelay = DEFAULT_RECONNECT_DELAY,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isManualDisconnectRef = useRef(false);

  const { cols: terminalCols, rows: terminalRows } = useTerminalDimensions();

  // Update status and notify
  const updateStatus = useCallback(
    (newStatus: ConnectionStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange]
  );

  // Build WebSocket URL
  const buildWsUrl = useCallback(() => {
    if (!spriteId) return null;

    // Get auth token (try all possible keys - dispotree_token, codelive_token, token)
    const token = localStorage.getItem('dispotree_token') || localStorage.getItem('codelive_token') || localStorage.getItem('token');
    if (!token) {
      setError('Authentication token not found');
      console.error('[SpriteWebSocket] No auth token found in localStorage');
      return null;
    }

    // Build URL with query params
    // Determine the backend host from NEXT_PUBLIC_API_URL or fall back to same host with port 3001
    let wsHost: string;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (apiUrl) {
      // Extract just the host:port from the API URL (remove protocol and any path)
      try {
        const url = new URL(apiUrl);
        wsHost = url.host;
      } catch {
        // If URL parsing fails, try simple regex extraction
        wsHost = apiUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      }
    } else {
      // Fall back to same hostname but on backend port 3001
      wsHost = `${window.location.hostname}:3001`;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    const params = new URLSearchParams({
      token,
      spriteId,
      cols: (cols || terminalCols).toString(),
      rows: (rows || terminalRows).toString(),
    });

    if (sessionId) {
      params.set('sessionId', sessionId);
    }

    const wsUrl = `${protocol}//${wsHost}/ws/sprites?${params.toString()}`;
    console.log('[SpriteWebSocket] Built WebSocket URL:', wsUrl.replace(token, 'TOKEN_HIDDEN'));

    return wsUrl;
  }, [spriteId, sessionId, cols, rows, terminalCols, terminalRows]);

  // Start ping interval
  const startPingInterval = useCallback(() => {
    stopPingInterval();
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL);
  }, []);

  // Stop ping interval
  const stopPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: SpriteWsMessage = JSON.parse(event.data);
        console.log('[SpriteWebSocket] Received message:', message.type, message);

        switch (message.type) {
          case 'output':
            if (message.data) {
              onOutput?.(message.data);
            }
            break;

          case 'error':
            const errorMsg = message.error || message.data || 'Unknown error';
            console.error('[SpriteWebSocket] Server error:', errorMsg);
            setError(errorMsg);
            onError?.(errorMsg);
            updateStatus('error');
            break;

          case 'connected':
            console.log('[SpriteWebSocket] Connection established successfully');
            reconnectAttemptsRef.current = 0;
            updateStatus('connected');
            startPingInterval();
            break;

          case 'disconnected':
            console.log('[SpriteWebSocket] Server indicated disconnection');
            updateStatus('disconnected');
            stopPingInterval();
            break;

          case 'status':
            console.log('[SpriteWebSocket] Status update:', message.status);
            if (message.status) {
              updateStatus(message.status);
            }
            break;

          case 'pong':
            // Connection is alive
            break;

          default:
            console.log('[SpriteWebSocket] Unknown message type:', message.type);
            break;
        }
      } catch (e) {
        // If not JSON, treat as raw output
        if (typeof event.data === 'string') {
          onOutput?.(event.data);
        }
      }
    },
    [onOutput, onError, updateStatus, startPingInterval, stopPingInterval]
  );

  // Attempt reconnection
  const attemptReconnect = useCallback(() => {
    if (isManualDisconnectRef.current) return;
    if (reconnectAttemptsRef.current >= reconnectAttempts) {
      setError(`Failed to reconnect after ${reconnectAttempts} attempts`);
      updateStatus('error');
      return;
    }

    reconnectAttemptsRef.current += 1;
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, reconnectDelay);
  }, [reconnectAttempts, reconnectDelay, updateStatus]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    console.log('[SpriteWebSocket] Connecting...');

    // Clean up existing connection
    if (wsRef.current) {
      console.log('[SpriteWebSocket] Cleaning up existing connection');
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = buildWsUrl();
    if (!url) {
      console.error('[SpriteWebSocket] Failed to build WebSocket URL');
      updateStatus('error');
      return;
    }

    isManualDisconnectRef.current = false;
    setError(null);
    updateStatus('connecting');

    try {
      console.log('[SpriteWebSocket] Creating WebSocket connection...');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[SpriteWebSocket] WebSocket connection opened, waiting for server handshake');
        // Connection established, wait for 'connected' message from server
      };

      ws.onmessage = handleMessage;

      ws.onerror = (event) => {
        console.error('[SpriteWebSocket] WebSocket error:', event);
        // Browser doesn't expose actual error details for security reasons
        // Check if the backend is running and the path is correct
        setError('WebSocket connection failed. Please check that the backend server is running.');
        updateStatus('error');
      };

      ws.onclose = (event) => {
        console.log('[SpriteWebSocket] WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        stopPingInterval();

        if (!isManualDisconnectRef.current && event.code !== 1000) {
          // Unexpected close, attempt reconnect
          console.log('[SpriteWebSocket] Unexpected close, attempting reconnect...');
          attemptReconnect();
        } else {
          updateStatus('disconnected');
        }
      };
    } catch (e) {
      console.error('[SpriteWebSocket] Exception creating WebSocket:', e);
      setError((e as Error).message);
      updateStatus('error');
    }
  }, [buildWsUrl, handleMessage, updateStatus, attemptReconnect, stopPingInterval]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    stopPingInterval();

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }

    updateStatus('disconnected');
  }, [updateStatus, stopPingInterval]);

  // Send data to terminal
  const send = useCallback((data: string) => {
    const wsState = wsRef.current?.readyState;
    console.log('[SpriteWebSocket] send() called, WS readyState:', wsState, 'data:', JSON.stringify(data));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'input',
        data,
      });
      console.log('[SpriteWebSocket] Sending message:', message);
      wsRef.current.send(message);
    } else {
      console.warn('[SpriteWebSocket] Cannot send - WebSocket not open. State:', wsState);
    }
  }, []);

  // Resize terminal
  const resize = useCallback((newCols: number, newRows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'resize',
          cols: newCols,
          rows: newRows,
        })
      );
    }
  }, []);

  // Auto-connect on mount if enabled and spriteId is provided
  useEffect(() => {
    if (autoConnect && spriteId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [spriteId]); // Only reconnect when spriteId changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      stopPingInterval();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [stopPingInterval]);

  return {
    status,
    connect,
    disconnect,
    send,
    resize,
    isConnected: status === 'connected',
    error,
  };
}

// Export a simpler hook for basic usage
export function useSimpleSpriteTerminal(spriteId: string | null) {
  const [output, setOutput] = useState<string>('');

  const handleOutput = useCallback((data: string) => {
    setOutput((prev) => prev + data);
  }, []);

  const ws = useSpriteWebSocket({
    spriteId,
    onOutput: handleOutput,
  });

  const clearOutput = useCallback(() => {
    setOutput('');
  }, []);

  return {
    ...ws,
    output,
    clearOutput,
  };
}
