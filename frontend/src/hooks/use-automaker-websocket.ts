/**
 * Automaker WebSocket Hook
 *
 * Manages WebSocket connection to Automaker server for real-time events.
 * Handles reconnection, event subscriptions, and state management.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const AUTOMAKER_WS_BASE = process.env.NEXT_PUBLIC_AUTOMAKER_WS_URL || 'ws://localhost:3008/api/events';
const AUTOMAKER_API_KEY = process.env.NEXT_PUBLIC_AUTOMAKER_API_KEY || '';
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

// Build WebSocket URL with API key authentication
function getWebSocketUrl(): string {
  const url = new URL(AUTOMAKER_WS_BASE);
  if (AUTOMAKER_API_KEY) {
    url.searchParams.set('apiKey', AUTOMAKER_API_KEY);
  }
  return url.toString();
}

// Event types from Automaker
export type AutomakerEventType =
  | 'agent:stream'
  | 'auto-mode:event'
  | 'suggestions:event'
  | 'spec-regeneration:event'
  | 'backlog-plan:event';

// Suggestions event payloads
export interface SuggestionsProgressEvent {
  type: 'suggestions_progress';
  content: string;
}

export interface SuggestionsToolEvent {
  type: 'suggestions_tool';
  tool: string;
  input: unknown;
}

export interface SuggestionsCompleteEvent {
  type: 'suggestions_complete';
  suggestions: Array<{
    id: string;
    category: string;
    description: string;
    priority: number;
    reasoning?: string;
  }>;
}

export interface SuggestionsErrorEvent {
  type: 'suggestions_error';
  error: string;
}

export type SuggestionsEvent =
  | SuggestionsProgressEvent
  | SuggestionsToolEvent
  | SuggestionsCompleteEvent
  | SuggestionsErrorEvent;

// Backlog plan event payloads
export interface BacklogPlanProgressEvent {
  type: 'backlog_plan_progress';
  content: string;
}

export interface BacklogPlanCompleteEvent {
  type: 'backlog_plan_complete';
  plan: {
    features: Array<{
      title: string;
      description: string;
      priority: number;
      category?: string;
    }>;
    reasoning?: string;
  };
}

export interface BacklogPlanErrorEvent {
  type: 'backlog_plan_error';
  error: string;
}

export type BacklogPlanEvent =
  | BacklogPlanProgressEvent
  | BacklogPlanCompleteEvent
  | BacklogPlanErrorEvent;

// WebSocket message format
interface WebSocketMessage {
  type: AutomakerEventType;
  payload: unknown;
}

type EventCallback<T = unknown> = (payload: T) => void;

interface UseAutomakerWebSocketOptions {
  autoConnect?: boolean;
}

interface UseAutomakerWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  subscribe: <T>(eventType: AutomakerEventType, callback: EventCallback<T>) => () => void;
}

/**
 * Hook for managing WebSocket connection to Automaker server
 */
export function useAutomakerWebSocket(
  options: UseAutomakerWebSocketOptions = {}
): UseAutomakerWebSocketReturn {
  const { autoConnect = true } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const subscribersRef = useRef<Map<AutomakerEventType, Set<EventCallback>>>(new Map());

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      const { type, payload } = message;

      // Get subscribers for this event type
      const callbacks = subscribersRef.current.get(type);
      if (callbacks) {
        callbacks.forEach((callback) => {
          try {
            callback(payload);
          } catch (err) {
            console.error(`[AutomakerWS] Error in callback for ${type}:`, err);
          }
        });
      }
    } catch (err) {
      console.error('[AutomakerWS] Failed to parse message:', err);
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (isConnecting) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const ws = new WebSocket(getWebSocketUrl());

      ws.onopen = () => {
        console.log('[AutomakerWS] Connected');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.log('[AutomakerWS] Disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;

        // Attempt reconnection if not intentionally closed
        if (event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          console.log(
            `[AutomakerWS] Reconnecting in ${RECONNECT_DELAY}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
          );
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = (event) => {
        console.error('[AutomakerWS] Error:', event);
        setError('WebSocket connection error');
        setIsConnecting(false);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[AutomakerWS] Failed to connect:', err);
      setError('Failed to connect to Automaker');
      setIsConnecting(false);
    }
  }, [isConnecting, handleMessage]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect
  }, []);

  // Subscribe to events
  const subscribe = useCallback(
    <T,>(eventType: AutomakerEventType, callback: EventCallback<T>): (() => void) => {
      if (!subscribersRef.current.has(eventType)) {
        subscribersRef.current.set(eventType, new Set());
      }

      const callbacks = subscribersRef.current.get(eventType)!;
      callbacks.add(callback as EventCallback);

      // Return unsubscribe function
      return () => {
        callbacks.delete(callback as EventCallback);
        if (callbacks.size === 0) {
          subscribersRef.current.delete(eventType);
        }
      };
    },
    []
  );

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    subscribe,
  };
}

/**
 * Hook specifically for suggestions events
 */
export function useAutomakerSuggestions() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [suggestions, setSuggestions] = useState<SuggestionsCompleteEvent['suggestions'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<Array<{ tool: string; input: unknown }>>([]);

  const { isConnected, subscribe, connect } = useAutomakerWebSocket();

  // Subscribe to suggestions events
  useEffect(() => {
    const unsubscribe = subscribe<SuggestionsEvent>('suggestions:event', (event) => {
      switch (event.type) {
        case 'suggestions_progress':
          setIsGenerating(true);
          setProgress((prev) => prev + event.content);
          break;

        case 'suggestions_tool':
          setToolCalls((prev) => [...prev, { tool: event.tool, input: event.input }]);
          break;

        case 'suggestions_complete':
          setIsGenerating(false);
          setSuggestions(event.suggestions);
          break;

        case 'suggestions_error':
          setIsGenerating(false);
          setError(event.error);
          break;
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // Reset state
  const reset = useCallback(() => {
    setIsGenerating(false);
    setProgress('');
    setSuggestions(null);
    setError(null);
    setToolCalls([]);
  }, []);

  // Mark as generating (call when starting generation)
  const startGenerating = useCallback(() => {
    reset();
    setIsGenerating(true);
  }, [reset]);

  return {
    isConnected,
    isGenerating,
    progress,
    suggestions,
    error,
    toolCalls,
    reset,
    startGenerating,
    connect,
  };
}

/**
 * Hook specifically for backlog plan events
 */
export function useAutomakerBacklogPlan() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [plan, setPlan] = useState<BacklogPlanCompleteEvent['plan'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, subscribe, connect } = useAutomakerWebSocket();

  // Subscribe to backlog plan events
  useEffect(() => {
    const unsubscribe = subscribe<BacklogPlanEvent>('backlog-plan:event', (event) => {
      switch (event.type) {
        case 'backlog_plan_progress':
          setIsGenerating(true);
          setProgress((prev) => prev + event.content);
          break;

        case 'backlog_plan_complete':
          setIsGenerating(false);
          setPlan(event.plan);
          break;

        case 'backlog_plan_error':
          setIsGenerating(false);
          setError(event.error);
          break;
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // Reset state
  const reset = useCallback(() => {
    setIsGenerating(false);
    setProgress('');
    setPlan(null);
    setError(null);
  }, []);

  // Mark as generating (call when starting generation)
  const startGenerating = useCallback(() => {
    reset();
    setIsGenerating(true);
  }, [reset]);

  return {
    isConnected,
    isGenerating,
    progress,
    plan,
    error,
    reset,
    startGenerating,
    connect,
  };
}
