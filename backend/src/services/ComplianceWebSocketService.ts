/**
 * Compliance WebSocket Service
 *
 * Real-time WebSocket streaming for compliance events:
 * - Live compliance dashboard updates
 * - Instant fraud alert notifications
 * - Real-time monitoring consoles
 * - Per-user and per-property subscriptions
 * - Heartbeat and reconnection handling
 * - Message buffering for offline clients
 */

import { WebSocket, WebSocketServer } from 'ws';
import * as crypto from 'crypto';
import { IncomingMessage } from 'http';
import { complianceEventStream, ComplianceEvent, ComplianceEventType } from './ComplianceEventStream';
import { soc2AuditLogger } from './SOC2AuditLogger';

// Client subscription options
export interface SubscriptionOptions {
  eventTypes?: ComplianceEventType[] | ['*'];
  resourceTypes?: ('property' | 'broker' | 'document' | 'rule' | 'alert')[];
  propertyIds?: number[];
  states?: string[];
  minSeverity?: 'info' | 'warning' | 'critical';
}

// WebSocket message types
export type WSMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'ping'
  | 'pong'
  | 'event'
  | 'error'
  | 'ack'
  | 'connected'
  | 'reconnect';

// WebSocket message structure
export interface WSMessage {
  type: WSMessageType;
  id?: string;
  payload?: any;
  timestamp: string;
}

// Connected client
interface ConnectedClient {
  id: string;
  ws: WebSocket;
  userId?: string;
  subscriptions: SubscriptionOptions;
  connectedAt: Date;
  lastPingAt: Date;
  lastPongAt: Date;
  messageBuffer: WSMessage[];
  bufferLimit: number;
  authenticated: boolean;
  metadata?: Record<string, any>;
}

// Service statistics
interface WSServiceStats {
  totalConnections: number;
  activeConnections: number;
  totalMessages: number;
  totalEvents: number;
  messagesPerSecond: number;
  uptime: number;
  lastEventAt: Date | null;
}

class ComplianceWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private initialized = false;
  private startTime = Date.now();
  private stats: WSServiceStats;
  private pingInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private messageCount = 0;
  private lastMessageCountReset = Date.now();

  // Configuration
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly PONG_TIMEOUT = 10000; // 10 seconds
  private readonly MAX_BUFFER_SIZE = 100;
  private readonly METRICS_INTERVAL = 60000; // 1 minute

  constructor() {
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      totalMessages: 0,
      totalEvents: 0,
      messagesPerSecond: 0,
      uptime: 0,
      lastEventAt: null,
    };
  }

  /**
   * Initialize the WebSocket server
   */
  initialize(server: any): void {
    if (this.initialized) return;

    try {
      // Use noServer mode to avoid conflicts with other WebSocketServers
      this.wss = new WebSocketServer({ noServer: true });

      this.setupEventHandlers();
      this.setupComplianceEventListener();
      this.startPingInterval();
      this.startMetricsCollection();

      // Register upgrade handler on the HTTP server
      server.on('upgrade', (request: any, socket: any, head: any) => {
        const { parse } = require('url');
        const { pathname } = parse(request.url || '');

        // Only handle /ws/compliance path
        if (pathname !== '/ws/compliance') {
          return; // Let other handlers deal with this
        }

        this.wss!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          this.wss!.emit('connection', ws, request);
        });
      });

      this.initialized = true;
      console.log('[ComplianceWebSocket] ✅ WebSocket server initialized on /ws/compliance');
    } catch (error) {
      console.error('[ComplianceWebSocket] ❌ Failed to initialize:', error);
    }
  }

  /**
   * Initialize standalone (without existing HTTP server)
   */
  initializeStandalone(port: number): void {
    if (this.initialized) return;

    try {
      this.wss = new WebSocketServer({ port, path: '/ws/compliance' });
      this.setupEventHandlers();
      this.setupComplianceEventListener();
      this.startPingInterval();
      this.startMetricsCollection();

      this.initialized = true;
      console.log(`[ComplianceWebSocket] ✅ Standalone WebSocket server on port ${port}`);
    } catch (error) {
      console.error('[ComplianceWebSocket] ❌ Failed to initialize standalone:', error);
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
      console.error('[ComplianceWebSocket] Server error:', error);
    });

    this.wss.on('close', () => {
      console.log('[ComplianceWebSocket] Server closed');
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientId = `ws_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    // Extract user info from query string or headers
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const userId = this.extractUserIdFromToken(token);

    const client: ConnectedClient = {
      id: clientId,
      ws,
      userId,
      subscriptions: { eventTypes: ['*'] }, // Default to all events
      connectedAt: new Date(),
      lastPingAt: new Date(),
      lastPongAt: new Date(),
      messageBuffer: [],
      bufferLimit: this.MAX_BUFFER_SIZE,
      authenticated: !!userId,
      metadata: {
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      },
    };

    this.clients.set(clientId, client);
    this.stats.totalConnections++;
    this.stats.activeConnections = this.clients.size;

    console.log(`[ComplianceWebSocket] Client connected: ${clientId} (user: ${userId || 'anonymous'})`);

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

    ws.on('close', (code, reason) => {
      this.handleDisconnection(client, code, reason.toString());
    });

    ws.on('error', (error) => {
      console.error(`[ComplianceWebSocket] Client error (${clientId}):`, error);
    });

    ws.on('pong', () => {
      client.lastPongAt = new Date();
    });

    // Log connection
    soc2AuditLogger.log({
      eventType: 'websocket.connected',
      eventCategory: 'access',
      severity: 'info',
      actor: { type: userId ? 'user' : 'anonymous', id: userId || clientId },
      resource: { type: 'websocket', id: clientId },
      action: 'connect',
      outcome: 'success',
      details: {
        ip: client.metadata?.ip,
        authenticated: client.authenticated,
      },
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(client: ConnectedClient, data: string): void {
    this.messageCount++;
    this.stats.totalMessages++;

    try {
      const message: WSMessage = JSON.parse(data);

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(client, message.payload);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(client, message.payload);
          break;

        case 'ping':
          this.sendToClient(client, {
            type: 'pong',
            id: message.id,
            timestamp: new Date().toISOString(),
          });
          break;

        case 'pong':
          client.lastPongAt = new Date();
          break;

        default:
          this.sendToClient(client, {
            type: 'error',
            payload: { message: `Unknown message type: ${message.type}` },
            timestamp: new Date().toISOString(),
          });
      }
    } catch (error) {
      console.error(`[ComplianceWebSocket] Invalid message from ${client.id}:`, error);
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
  private handleSubscribe(client: ConnectedClient, options: SubscriptionOptions): void {
    // Merge with existing subscriptions
    client.subscriptions = {
      ...client.subscriptions,
      ...options,
    };

    console.log(`[ComplianceWebSocket] Client ${client.id} subscribed:`, options);

    this.sendToClient(client, {
      type: 'ack',
      payload: {
        action: 'subscribe',
        subscriptions: client.subscriptions,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle unsubscription request
   */
  private handleUnsubscribe(client: ConnectedClient, options: Partial<SubscriptionOptions>): void {
    // Remove specified subscriptions
    if (options.eventTypes) {
      client.subscriptions.eventTypes = (client.subscriptions.eventTypes || [])
        .filter(t => !options.eventTypes!.includes(t));
    }
    if (options.propertyIds) {
      client.subscriptions.propertyIds = (client.subscriptions.propertyIds || [])
        .filter(id => !options.propertyIds!.includes(id));
    }

    this.sendToClient(client, {
      type: 'ack',
      payload: {
        action: 'unsubscribe',
        subscriptions: client.subscriptions,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(client: ConnectedClient, code: number, reason: string): void {
    this.clients.delete(client.id);
    this.stats.activeConnections = this.clients.size;

    console.log(`[ComplianceWebSocket] Client disconnected: ${client.id} (code: ${code})`);

    soc2AuditLogger.log({
      eventType: 'websocket.disconnected',
      eventCategory: 'access',
      severity: 'info',
      actor: { type: client.userId ? 'user' : 'anonymous', id: client.userId || client.id },
      resource: { type: 'websocket', id: client.id },
      action: 'disconnect',
      outcome: 'success',
      details: { code, reason },
    });
  }

  /**
   * Setup listener for compliance events
   */
  private setupComplianceEventListener(): void {
    // Listen to all compliance events
    complianceEventStream.on('*', (event: ComplianceEvent) => {
      this.broadcastEvent(event);
    });

    console.log('[ComplianceWebSocket] Listening to compliance event stream');
  }

  /**
   * Broadcast a compliance event to matching clients
   */
  private broadcastEvent(event: ComplianceEvent): void {
    this.stats.totalEvents++;
    this.stats.lastEventAt = new Date();

    const message: WSMessage = {
      type: 'event',
      id: event.id,
      payload: {
        eventType: event.type,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        data: event.data,
        metadata: event.metadata,
        timestamp: event.timestamp.toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    let deliveredCount = 0;

    for (const client of this.clients.values()) {
      if (this.shouldDeliverToClient(client, event)) {
        if (client.ws.readyState === WebSocket.OPEN) {
          this.sendToClient(client, message);
          deliveredCount++;
        } else {
          // Buffer message for potential reconnection
          this.bufferMessage(client, message);
        }
      }
    }

    if (deliveredCount > 0) {
      console.log(`[ComplianceWebSocket] Broadcasted ${event.type} to ${deliveredCount} clients`);
    }
  }

  /**
   * Check if event should be delivered to client based on subscriptions
   */
  private shouldDeliverToClient(client: ConnectedClient, event: ComplianceEvent): boolean {
    const subs = client.subscriptions;

    // Check event type filter
    if (subs.eventTypes && subs.eventTypes.length > 0) {
      const types = subs.eventTypes as (ComplianceEventType | '*')[];
      if (!types.includes('*') && !types.includes(event.type)) {
        return false;
      }
    }

    // Check resource type filter
    if (subs.resourceTypes && subs.resourceTypes.length > 0) {
      if (!subs.resourceTypes.includes(event.resourceType)) {
        return false;
      }
    }

    // Check property ID filter
    if (subs.propertyIds && subs.propertyIds.length > 0) {
      const eventPropertyId = typeof event.resourceId === 'number'
        ? event.resourceId
        : parseInt(String(event.resourceId));

      if (event.resourceType === 'property' && !subs.propertyIds.includes(eventPropertyId)) {
        return false;
      }
    }

    // Check state filter
    if (subs.states && subs.states.length > 0 && event.metadata?.state) {
      if (!subs.states.includes(event.metadata.state)) {
        return false;
      }
    }

    // Check severity filter
    if (subs.minSeverity && event.metadata?.severity) {
      const severityOrder = { info: 0, warning: 1, critical: 2 };
      const minLevel = severityOrder[subs.minSeverity] || 0;
      const eventLevel = severityOrder[event.metadata.severity as keyof typeof severityOrder] || 0;

      if (eventLevel < minLevel) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(client: ConnectedClient, message: WSMessage): boolean {
    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
        return true;
      }
    } catch (error) {
      console.error(`[ComplianceWebSocket] Send error to ${client.id}:`, error);
    }
    return false;
  }

  /**
   * Buffer message for client (for reconnection scenarios)
   */
  private bufferMessage(client: ConnectedClient, message: WSMessage): void {
    if (client.messageBuffer.length >= client.bufferLimit) {
      client.messageBuffer.shift(); // Remove oldest
    }
    client.messageBuffer.push(message);
  }

  /**
   * Send a message to a specific user
   */
  sendToUser(userId: string, message: WSMessage): number {
    let sentCount = 0;

    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        if (this.sendToClient(client, message)) {
          sentCount++;
        }
      }
    }

    return sentCount;
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: WSMessage): number {
    let sentCount = 0;

    for (const client of this.clients.values()) {
      if (this.sendToClient(client, message)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Start ping interval to detect stale connections
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();

      for (const [clientId, client] of this.clients) {
        // Check for pong timeout
        if (now - client.lastPongAt.getTime() > this.PING_INTERVAL + this.PONG_TIMEOUT) {
          console.log(`[ComplianceWebSocket] Client ${clientId} timed out`);
          client.ws.terminate();
          this.clients.delete(clientId);
          continue;
        }

        // Send ping
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
          client.lastPingAt = new Date();
        }
      }

      this.stats.activeConnections = this.clients.size;
    }, this.PING_INTERVAL);
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.lastMessageCountReset) / 1000;

      this.stats.messagesPerSecond = Math.round(this.messageCount / elapsed * 100) / 100;
      this.stats.uptime = Math.round((now - this.startTime) / 1000);

      this.messageCount = 0;
      this.lastMessageCountReset = now;
    }, this.METRICS_INTERVAL);
  }

  /**
   * Extract user ID from JWT token
   */
  private extractUserIdFromToken(token: string | null): string | undefined {
    if (!token) return undefined;

    try {
      // Basic JWT decode (header.payload.signature)
      const parts = token.split('.');
      if (parts.length !== 3) return undefined;

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return payload.userId || payload.sub || payload.id;
    } catch {
      return undefined;
    }
  }

  /**
   * Get service statistics
   */
  getStats(): WSServiceStats {
    return {
      ...this.stats,
      activeConnections: this.clients.size,
      uptime: Math.round((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Get connected clients info
   */
  getConnectedClients(): Array<{
    id: string;
    userId?: string;
    connectedAt: Date;
    subscriptions: SubscriptionOptions;
    authenticated: boolean;
  }> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      userId: client.userId,
      connectedAt: client.connectedAt,
      subscriptions: client.subscriptions,
      authenticated: client.authenticated,
    }));
  }

  /**
   * Disconnect a specific client
   */
  disconnectClient(clientId: string, reason = 'Server disconnect'): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    this.sendToClient(client, {
      type: 'error',
      payload: { message: reason, code: 'DISCONNECT' },
      timestamp: new Date().toISOString(),
    });

    client.ws.close(1000, reason);
    this.clients.delete(clientId);
    return true;
  }

  /**
   * Shutdown the WebSocket server
   */
  shutdown(): void {
    console.log('[ComplianceWebSocket] Shutting down...');

    // Clear intervals
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.metricsInterval) clearInterval(this.metricsInterval);

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutdown');
    }
    this.clients.clear();

    // Close server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.initialized = false;
    console.log('[ComplianceWebSocket] Shutdown complete');
  }
}

export const complianceWebSocketService = new ComplianceWebSocketService();
export default complianceWebSocketService;
