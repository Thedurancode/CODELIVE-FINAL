/**
 * GitHub Sync WebSocket Hook
 *
 * Real-time WebSocket notifications for GitHub issue synchronization.
 * Automatically refreshes React Query caches when sync events arrive.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { spriteTaskKeys } from './use-sprite-tasks';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Convert HTTP URL to WebSocket URL
const getWebSocketUrl = () => {
  const wsProtocol = API_URL.startsWith('https') ? 'wss' : 'ws';
  const wsUrl = API_URL.replace(/^https?/, wsProtocol);
  return `${wsUrl}/ws/github-sync`;
};

// Sync event types
export type GitHubSyncEventType =
  | 'issue_edited'
  | 'issue_comment'
  | 'issue_closed'
  | 'pr_merged'
  | 'task_synced'
  | 'task_status_changed'
  | 'sync_error';

// Sync event payload
export interface GitHubSyncEvent {
  eventType: GitHubSyncEventType;
  projectId?: string;
  taskId?: string;
  issueNumber?: number;
  repository?: string;
  data: Record<string, unknown>;
}

// WebSocket message structure
export interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'pong' | 'event' | 'error' | 'connected';
  id?: string;
  payload?: unknown;
  timestamp: string;
}

// Subscription options
export interface SyncSubscriptionOptions {
  projectIds?: string[];
  taskIds?: string[];
  eventTypes?: GitHubSyncEventType[] | ['*'];
}

export interface UseGitHubSyncWebSocketOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Project IDs to subscribe to */
  projectIds?: string[];
  /** Task IDs to subscribe to */
  taskIds?: string[];
  /** Event types to listen for (default: all) */
  eventTypes?: GitHubSyncEventType[];
  /** Show toast notifications for events (default: true) */
  showToasts?: boolean;
  /** Callback when sync event is received */
  onSyncEvent?: (event: GitHubSyncEvent) => void;
  /** Callback when connected */
  onConnect?: () => void;
  /** Callback when disconnected */
  onDisconnect?: () => void;
}

export interface UseGitHubSyncWebSocketReturn {
  /** Whether the WebSocket is connected */
  isConnected: boolean;
  /** Last received sync event */
  lastEvent: GitHubSyncEvent | null;
  /** Recent sync events (last 50) */
  events: GitHubSyncEvent[];
  /** Manually connect to WebSocket */
  connect: () => void;
  /** Manually disconnect from WebSocket */
  disconnect: () => void;
  /** Subscribe to specific projects/tasks */
  subscribe: (options: SyncSubscriptionOptions) => void;
  /** Unsubscribe from projects/tasks */
  unsubscribe: (options: Partial<SyncSubscriptionOptions>) => void;
  /** Clear event history */
  clearEvents: () => void;
}

export function useGitHubSyncWebSocket(
  options: UseGitHubSyncWebSocketOptions = {}
): UseGitHubSyncWebSocketReturn {
  const {
    autoConnect = true,
    projectIds,
    taskIds,
    eventTypes,
    showToasts = true,
    onSyncEvent,
    onConnect,
    onDisconnect,
  } = options;

  const queryClient = useQueryClient();

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<GitHubSyncEvent | null>(null);
  const [events, setEvents] = useState<GitHubSyncEvent[]>([]);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountRef = useRef(0);
  const onSyncEventRef = useRef(onSyncEvent);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);

  // Update refs when callbacks change
  useEffect(() => {
    onSyncEventRef.current = onSyncEvent;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
  }, [onSyncEvent, onConnect, onDisconnect]);

  // Handle incoming sync event
  const handleSyncEvent = useCallback(
    (event: GitHubSyncEvent) => {
      // Update state
      setLastEvent(event);
      setEvents((prev) => [event, ...prev].slice(0, 50)); // Keep last 50

      // Invalidate React Query caches
      if (event.taskId) {
        queryClient.invalidateQueries({ queryKey: spriteTaskKeys.detail(event.taskId) });
        queryClient.invalidateQueries({ queryKey: spriteTaskKeys.syncStatus(event.taskId) });
        queryClient.invalidateQueries({ queryKey: spriteTaskKeys.activity(event.taskId) });
      }
      if (event.projectId) {
        queryClient.invalidateQueries({ queryKey: spriteTaskKeys.byProject(event.projectId) });
      }
      queryClient.invalidateQueries({ queryKey: spriteTaskKeys.lists() });

      // Show toast notification
      if (showToasts) {
        switch (event.eventType) {
          case 'issue_edited':
            toast.info('Issue updated', {
              description: `Issue #${event.issueNumber} was edited`,
            });
            break;
          case 'issue_comment':
            toast.info('New comment', {
              description: `${(event.data as any).author || 'Someone'} commented on #${event.issueNumber}`,
            });
            break;
          case 'pr_merged':
            toast.success('PR merged!', {
              description: `PR #${(event.data as any).prNumber} was merged`,
            });
            break;
          case 'sync_error':
            toast.error('Sync error', {
              description: (event.data as any).message || 'Failed to sync with GitHub',
            });
            break;
        }
      }

      // Call user callback
      onSyncEventRef.current?.(event);
    },
    [queryClient, showToasts]
  );

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Get auth token
    let token: string | null = null;
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('dispotree_token') || localStorage.getItem('codelive_token');
      if (!token) {
        const match = document.cookie.match(/(?:dispotree_token|codelive_token)=([^;]+)/);
        token = match ? match[1] : null;
      }
    }

    try {
      const wsUrl = token
        ? `${getWebSocketUrl()}?token=${encodeURIComponent(token)}`
        : getWebSocketUrl();

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[GitHubSyncWS] Connected');
        setIsConnected(true);
        reconnectCountRef.current = 0;
        onConnectRef.current?.();

        // Send initial subscriptions
        if (projectIds || taskIds || eventTypes) {
          const subscribeMsg: WSMessage = {
            type: 'subscribe',
            payload: {
              projectIds,
              taskIds,
              eventTypes: eventTypes || ['*'],
            },
            timestamp: new Date().toISOString(),
          };
          ws.send(JSON.stringify(subscribeMsg));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;

          if (message.type === 'event' && message.payload) {
            handleSyncEvent(message.payload as GitHubSyncEvent);
          } else if (message.type === 'connected') {
            console.log('[GitHubSyncWS] Server acknowledged connection');
          } else if (message.type === 'error') {
            console.error('[GitHubSyncWS] Server error:', message.payload);
          }
        } catch (err) {
          console.error('[GitHubSyncWS] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        console.log('[GitHubSyncWS] Disconnected');
        setIsConnected(false);
        onDisconnectRef.current?.();

        // Attempt reconnection with exponential backoff
        if (reconnectCountRef.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectCountRef.current), 30000);
          reconnectCountRef.current++;
          console.log(`[GitHubSyncWS] Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current})`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('[GitHubSyncWS] Error:', error);
      };
    } catch (err) {
      console.error('[GitHubSyncWS] Failed to connect:', err);
    }
  }, [projectIds, taskIds, eventTypes, handleSyncEvent]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectCountRef.current = 5; // Prevent auto-reconnect
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  // Subscribe to specific projects/tasks
  const subscribe = useCallback((opts: SyncSubscriptionOptions) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: WSMessage = {
        type: 'subscribe',
        payload: opts,
        timestamp: new Date().toISOString(),
      };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Unsubscribe from projects/tasks
  const unsubscribe = useCallback((opts: Partial<SyncSubscriptionOptions>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: WSMessage = {
        type: 'unsubscribe',
        payload: opts,
        timestamp: new Date().toISOString(),
      };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Clear event history
  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastEvent(null);
  }, []);

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
    lastEvent,
    events,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    clearEvents,
  };
}

/**
 * Simplified hook for subscribing to a specific project's sync events
 */
export function useProjectSyncEvents(projectId: string | null | undefined) {
  return useGitHubSyncWebSocket({
    autoConnect: !!projectId,
    projectIds: projectId ? [projectId] : undefined,
  });
}

/**
 * Simplified hook for subscribing to a specific task's sync events
 */
export function useTaskSyncEvents(taskId: string | null | undefined) {
  return useGitHubSyncWebSocket({
    autoConnect: !!taskId,
    taskIds: taskId ? [taskId] : undefined,
  });
}
