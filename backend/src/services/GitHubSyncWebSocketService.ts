/**
 * GitHub Sync WebSocket Service
 *
 * Real-time WebSocket notifications for GitHub issue synchronization:
 * - Issue edit notifications
 * - New comment notifications
 * - PR merge notifications
 * - Task status change notifications
 * - Per-project subscriptions
 */

import { WebSocket, WebSocketServer } from 'ws';
import * as crypto from 'crypto';
import { IncomingMessage } from 'http';

// Sync event types
export type GitHubSyncEventType =
  | 'issue_edited'
  | 'issue_comment'
  | 'issue_closed'
  | 'pr_merged'
  | 'task_synced'
  | 'task_status_changed'
  | 'sync_error';

// Subscription options
export interface SyncSubscriptionOptions {
  projectIds?: string[];
  taskIds?: string[];
  eventTypes?: GitHubSyncEventType[] | ['*'];
}

// WebSocket message types
export type WSMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'ping'
  | 'pong'
  | 'event'
  | 'error'
  | 'connected';

// WebSocket message structure
export interface WSMessage {
  type: WSMessageType;
  id?: string;
  payload?: unknown;
  timestamp: string;
}

// Sync event payload
export interface GitHubSyncEvent {
  eventType: GitHubSyncEventType;
  projectId?: string;
  taskId?: string;
  issueNumber?: number;
  repository?: string;
  data: Record<string, unknown>;
}

// Connected client
interface ConnectedClient {
  id: string;
  ws: WebSocket;
  userId?: string;
  organizationId?: string;
  subscriptions: SyncSubscriptionOptions;
  connectedAt: Date;
  lastPingAt: Date;
  lastPongAt: Date;
  authenticated: boolean;
}

class GitHubSyncWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private initialized = false;

  // Configuration
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly PONG_TIMEOUT = 10000; // 10 seconds
  private pingInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the WebSocket server
   */
  initialize(server: unknown): void {
    if (this.initialized) return;

    try {
      // Use noServer mode to avoid conflicts with other WebSocketServers
      this.wss = new WebSocketServer({ noServer: true });

      this.setupEventHandlers();
      this.startPingInterval();

      // Register upgrade handler on the HTTP server
      (server as any).on('upgrade', (request: any, socket: any, head: any) => {
        const { parse } = require('url');
        const { pathname } = parse(request.url || '');

        // Only handle /ws/github-sync path
        if (pathname !== '/ws/github-sync') {
          return; // Let other handlers deal with this
        }

        this.wss!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          this.wss!.emit('connection', ws, request);
        });
      });

      this.initialized = true;
      console.log('[GitHubSyncWebSocket] ✅ WebSocket server initialized on /ws/github-sync');
    } catch (error) {
      console.error('[GitHubSyncWebSocket] ❌ Failed to initialize:', error);
    }
  }

  isReady(): boolean {
    return this.initialized && this.wss !== null;
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('[GitHubSyncWebSocket] Server error:', error);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientId = `ghsync_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    // Extract user info from query string
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const { userId, organizationId } = this.extractUserFromToken(token);

    const client: ConnectedClient = {
      id: clientId,
      ws,
      userId,
      organizationId,
      subscriptions: { eventTypes: ['*'] }, // Default to all events
      connectedAt: new Date(),
      lastPingAt: new Date(),
      lastPongAt: new Date(),
      authenticated: !!userId,
    };

    this.clients.set(clientId, client);

    console.log(`[GitHubSyncWebSocket] Client connected: ${clientId} (user: ${userId || 'anonymous'})`);

    // Send connected message
    this.sendToClient(client, {
      type: 'connected',
      id: clientId,
      payload: {
        clientId,
        authenticated: client.authenticated,
        serverTime: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });

    // Setup client event handlers
    ws.on('message', (data) => {
      this.handleMessage(client, data.toString());
    });

    ws.on('close', () => {
      this.handleDisconnection(client);
    });

    ws.on('error', (error) => {
      console.error(`[GitHubSyncWebSocket] Client error (${clientId}):`, error);
    });

    ws.on('pong', () => {
      client.lastPongAt = new Date();
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(client: ConnectedClient, data: string): void {
    try {
      const message = JSON.parse(data) as WSMessage;

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(client, message.payload as SyncSubscriptionOptions);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(client, message.payload as Partial<SyncSubscriptionOptions>);
          break;

        case 'ping':
          this.sendToClient(client, {
            type: 'pong',
            timestamp: new Date().toISOString(),
          });
          break;

        default:
          console.warn(`[GitHubSyncWebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[GitHubSyncWebSocket] Failed to parse message:', error);
      this.sendToClient(client, {
        type: 'error',
        payload: { message: 'Invalid message format' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle subscription request
   */
  private handleSubscribe(client: ConnectedClient, options: SyncSubscriptionOptions): void {
    // Merge with existing subscriptions
    if (options.projectIds) {
      client.subscriptions.projectIds = [
        ...(client.subscriptions.projectIds || []),
        ...options.projectIds,
      ];
    }
    if (options.taskIds) {
      client.subscriptions.taskIds = [
        ...(client.subscriptions.taskIds || []),
        ...options.taskIds,
      ];
    }
    if (options.eventTypes) {
      client.subscriptions.eventTypes = options.eventTypes;
    }

    console.log(`[GitHubSyncWebSocket] Client ${client.id} subscribed:`, client.subscriptions);
  }

  /**
   * Handle unsubscription request
   */
  private handleUnsubscribe(client: ConnectedClient, options: Partial<SyncSubscriptionOptions>): void {
    if (options.projectIds) {
      client.subscriptions.projectIds = client.subscriptions.projectIds?.filter(
        (id) => !options.projectIds!.includes(id)
      );
    }
    if (options.taskIds) {
      client.subscriptions.taskIds = client.subscriptions.taskIds?.filter(
        (id) => !options.taskIds!.includes(id)
      );
    }

    console.log(`[GitHubSyncWebSocket] Client ${client.id} unsubscribed:`, options);
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(client: ConnectedClient): void {
    this.clients.delete(client.id);
    console.log(`[GitHubSyncWebSocket] Client disconnected: ${client.id}`);
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(client: ConnectedClient, message: WSMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast a sync event to subscribed clients
   */
  broadcastSyncEvent(event: GitHubSyncEvent): void {
    if (!this.initialized) return;

    const message: WSMessage = {
      type: 'event',
      payload: event,
      timestamp: new Date().toISOString(),
    };

    let broadcastCount = 0;

    for (const client of this.clients.values()) {
      if (this.shouldReceiveEvent(client, event)) {
        this.sendToClient(client, message);
        broadcastCount++;
      }
    }

    console.log(
      `[GitHubSyncWebSocket] Broadcast ${event.eventType} to ${broadcastCount} clients` +
        (event.taskId ? ` (task: ${event.taskId})` : '') +
        (event.issueNumber ? ` (issue: #${event.issueNumber})` : '')
    );
  }

  /**
   * Check if a client should receive an event based on subscriptions
   */
  private shouldReceiveEvent(client: ConnectedClient, event: GitHubSyncEvent): boolean {
    const { subscriptions } = client;

    // Check event type filter
    if (
      subscriptions.eventTypes &&
      subscriptions.eventTypes[0] !== '*' &&
      !subscriptions.eventTypes.includes(event.eventType)
    ) {
      return false;
    }

    // Check project filter
    if (subscriptions.projectIds && subscriptions.projectIds.length > 0) {
      if (!event.projectId || !subscriptions.projectIds.includes(event.projectId)) {
        return false;
      }
    }

    // Check task filter
    if (subscriptions.taskIds && subscriptions.taskIds.length > 0) {
      if (!event.taskId || !subscriptions.taskIds.includes(event.taskId)) {
        return false;
      }
    }

    // Check organization (clients only see their org's events)
    // For now, allow all authenticated clients to receive events
    // TODO: Add organization filtering if needed

    return true;
  }

  /**
   * Extract user info from JWT token
   */
  private extractUserFromToken(token: string | null): { userId?: string; organizationId?: string } {
    if (!token) return {};

    try {
      const parts = token.split('.');
      if (parts.length !== 3) return {};

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return {
        userId: payload.userId || payload.sub || payload.id,
        organizationId: payload.organizationId,
      };
    } catch {
      return {};
    }
  }

  /**
   * Start ping interval for heartbeat
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();

      for (const client of this.clients.values()) {
        // Check for pong timeout
        if (now - client.lastPongAt.getTime() > this.PING_INTERVAL + this.PONG_TIMEOUT) {
          console.log(`[GitHubSyncWebSocket] Client ${client.id} timed out, disconnecting`);
          client.ws.terminate();
          this.clients.delete(client.id);
          continue;
        }

        // Send ping
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
          client.lastPingAt = new Date();
        }
      }
    }, this.PING_INTERVAL);
  }

  /**
   * Shutdown the WebSocket service
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.initialized = false;
    console.log('[GitHubSyncWebSocket] Service shutdown complete');
  }

  /**
   * Get service statistics
   */
  getStats(): { activeConnections: number; initialized: boolean } {
    return {
      activeConnections: this.clients.size,
      initialized: this.initialized,
    };
  }
}

// Export singleton instance
export const githubSyncWebSocketService = new GitHubSyncWebSocketService();
