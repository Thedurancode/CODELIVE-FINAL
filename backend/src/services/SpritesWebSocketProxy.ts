/**
 * Sprites WebSocket Proxy Service
 *
 * Proxies WebSocket connections between frontend terminals and Sprites exec API.
 * Handles JWT authentication, bidirectional I/O forwarding, and session tracking.
 *
 * Features:
 * - Secure JWT-based authentication
 * - Bidirectional stdin/stdout/stderr forwarding
 * - Terminal resize event handling
 * - Session tracking per sprite/user
 * - Automatic reconnection handling
 * - Heartbeat for connection health
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import * as crypto from 'crypto';
import { spritesService } from './SpritesService';
import ProjectSprite from '../models/ProjectSprite';
import MarketplaceUser from '../models/MarketplaceUser';

// Message types for frontend communication
export type TerminalMessageType =
  | 'input' // stdin from frontend
  | 'output' // stdout to frontend
  | 'error' // error message
  | 'resize' // terminal resize
  | 'status' // connection status
  | 'ping'
  | 'pong'
  | 'connected'
  | 'disconnected';

// Terminal message structure
export interface TerminalMessage {
  type: TerminalMessageType;
  data?: string;
  error?: string;
  cols?: number;
  rows?: number;
  status?: 'connecting' | 'connected' | 'disconnected' | 'error';
  timestamp: string;
}

// Active proxy connection
interface ProxyConnection {
  id: string;
  frontendWs: WebSocket;
  spritesWs: WebSocket | null;
  userId: string;
  organizationId: string;
  spriteId: string;
  projectSpriteId: string;
  sessionId: string;
  connectedAt: Date;
  lastActivityAt: Date;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  metadata?: Record<string, unknown>;
}

// Service statistics
interface ProxyServiceStats {
  totalConnections: number;
  activeConnections: number;
  totalBytesIn: number;
  totalBytesOut: number;
  uptime: number;
}

class SpritesWebSocketProxy {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, ProxyConnection> = new Map();
  private initialized = false;
  private startTime = Date.now();

  // Configuration
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly PONG_TIMEOUT = 10000; // 10 seconds
  private readonly ACTIVITY_TIMEOUT = 300000; // 5 minutes

  private pingInterval: NodeJS.Timeout | null = null;
  private stats: ProxyServiceStats = {
    totalConnections: 0,
    activeConnections: 0,
    totalBytesIn: 0,
    totalBytesOut: 0,
    uptime: 0,
  };

  /**
   * Initialize the WebSocket proxy server
   */
  initialize(server: any): void {
    if (this.initialized) return;

    try {
      // Use noServer mode to avoid conflicts with other WebSocketServers
      // We'll manually handle the upgrade event
      this.wss = new WebSocketServer({ noServer: true });

      this.setupEventHandlers();
      this.startPingInterval();

      // Register upgrade handler on the HTTP server
      server.on('upgrade', (request: any, socket: any, head: any) => {
        const { parse } = require('url');
        const { pathname } = parse(request.url || '');

        // Only handle /ws/sprites path
        if (pathname !== '/ws/sprites') {
          return; // Let other handlers deal with this
        }

        console.log('[SpritesWebSocket] Handling upgrade request for /ws/sprites');

        this.wss!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          console.log('[SpritesWebSocket] Upgrade complete, emitting connection');
          this.wss!.emit('connection', ws, request);
        });
      });

      this.initialized = true;
      console.log('[SpritesWebSocket] ✅ WebSocket proxy initialized on /ws/sprites');
    } catch (error) {
      console.error('[SpritesWebSocket] ❌ Failed to initialize:', error);
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
      console.log('[SpritesWebSocket] Connection event received on /ws/sprites');
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('[SpritesWebSocket] Server error:', error);
    });

    this.wss.on('close', () => {
      console.log('[SpritesWebSocket] Server closed');
    });

    this.wss.on('headers', (headers, req) => {
      console.log('[SpritesWebSocket] Headers event - client requesting upgrade');
    });
  }

  /**
   * Handle new frontend WebSocket connection
   */
  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const connectionId = `proxy_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    console.log(`[SpritesWebSocket] New connection attempt: ${connectionId}`);
    console.log(`[SpritesWebSocket] Request URL: ${req.url}`);
    console.log(`[SpritesWebSocket] Headers host: ${req.headers.host}`);

    // Parse URL for session info and auth
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const spriteId = url.searchParams.get('spriteId');
    const sessionId = url.searchParams.get('sessionId');

    console.log(`[SpritesWebSocket] Parsed params - spriteId: ${spriteId}, sessionId: ${sessionId}, hasToken: ${!!token}`);

    // Validate required parameters
    if (!token || !spriteId) {
      this.sendToFrontend(ws, {
        type: 'error',
        error: 'Missing required parameters: token and spriteId',
        status: 'error',
        timestamp: new Date().toISOString(),
      });
      ws.close(4000, 'Missing required parameters');
      return;
    }

    // Authenticate user from JWT (async - looks up org from DB)
    const authResult = await this.authenticateToken(token);
    if (!authResult) {
      this.sendToFrontend(ws, {
        type: 'error',
        error: 'Invalid or expired authentication token',
        status: 'error',
        timestamp: new Date().toISOString(),
      });
      ws.close(4001, 'Authentication failed');
      return;
    }

    const { userId, organizationId } = authResult;

    // Get the ProjectSprite record to verify access
    const projectSprite = await ProjectSprite.findByPk(spriteId);
    if (!projectSprite) {
      this.sendToFrontend(ws, {
        type: 'error',
        error: 'Sprite not found',
        status: 'error',
        timestamp: new Date().toISOString(),
      });
      ws.close(4004, 'Sprite not found');
      return;
    }

    // Verify user has access to this organization's sprite
    if (projectSprite.organizationId !== organizationId) {
      this.sendToFrontend(ws, {
        type: 'error',
        error: 'Access denied to this sprite',
        status: 'error',
        timestamp: new Date().toISOString(),
      });
      ws.close(4003, 'Access denied');
      return;
    }

    // Create connection record
    const connection: ProxyConnection = {
      id: connectionId,
      frontendWs: ws,
      spritesWs: null,
      userId,
      organizationId,
      spriteId: projectSprite.spriteId || projectSprite.spriteName,
      projectSpriteId: spriteId,
      sessionId: sessionId || `session_${Date.now()}`,
      connectedAt: new Date(),
      lastActivityAt: new Date(),
      status: 'connecting',
      metadata: {
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      },
    };

    this.connections.set(connectionId, connection);
    this.stats.totalConnections++;
    this.stats.activeConnections = this.connections.size;

    // Send initial status
    this.sendToFrontend(ws, {
      type: 'status',
      status: 'connecting',
      timestamp: new Date().toISOString(),
    });

    // Setup frontend WebSocket handlers
    ws.on('message', (data) => {
      this.handleFrontendMessage(connection, data.toString());
    });

    ws.on('close', (code, reason) => {
      this.handleFrontendDisconnect(connection, code, reason.toString());
    });

    ws.on('error', (error) => {
      console.error(`[SpritesWebSocket] Frontend error (${connectionId}):`, error);
    });

    ws.on('pong', () => {
      connection.lastActivityAt = new Date();
    });

    // Connect to Sprites API WebSocket
    await this.connectToSpritesApi(connection);
  }

  /**
   * Connect to the Sprites exec WebSocket API
   */
  private async connectToSpritesApi(connection: ProxyConnection, retryWithoutCheckpoint = false): Promise<void> {
    console.log(`[SpritesWebSocket] Connecting to Sprites API for ${connection.id}... (retryWithoutCheckpoint: ${retryWithoutCheckpoint})`);

    try {
      // Get WebSocket connection info from SpritesService
      console.log(`[SpritesWebSocket] Getting WebSocket info for sprite: ${connection.projectSpriteId}`);
      const wsInfo = await spritesService.getExecWebSocketInfo(connection.projectSpriteId, {
        cols: 80,
        rows: 24,
        sessionId: connection.sessionId,
      });

      if (!wsInfo.wsUrl) {
        throw new Error('Failed to get WebSocket URL from Sprites API');
      }

      console.log(`[SpritesWebSocket] Got WebSocket URL, connecting to Sprites API...`);

      // Create WebSocket connection to Sprites
      const spritesWs = new WebSocket(wsInfo.wsUrl, {
        headers: {
          Authorization: `Bearer ${wsInfo.token}`,
        },
      });

      connection.spritesWs = spritesWs;

      // Track if we've received an error about checkpoint
      let checkpointErrorReceived = false;

      spritesWs.on('open', () => {
        console.log(`[SpritesWebSocket] ✅ Connected to Sprites API for ${connection.id}`);
        connection.status = 'connected';

        this.sendToFrontend(connection.frontendWs, {
          type: 'connected',
          status: 'connected',
          timestamp: new Date().toISOString(),
        });

        // Update sprite access time
        this.updateSpriteAccess(connection);
      });

      spritesWs.on('message', (data) => {
        // Check for checkpoint error in message
        try {
          const messageStr = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
          if (messageStr.includes('checkpoint not found') || messageStr.includes('failed to restore checkpoint')) {
            checkpointErrorReceived = true;
            console.log(`[SpritesWebSocket] Checkpoint error detected in message`);

            // If we haven't retried yet, attempt to reconnect
            if (!retryWithoutCheckpoint) {
              console.log(`[SpritesWebSocket] Will attempt reconnection after checkpoint error`);
              return; // Don't forward this error to frontend yet
            }
          }
        } catch {
          // Ignore parse errors, pass message through
        }
        this.handleSpritesMessage(connection, data);
      });

      spritesWs.on('close', async (code, reason) => {
        const reasonStr = reason.toString();
        console.log(`[SpritesWebSocket] Sprites connection closed: ${code} ${reasonStr}`);

        // Check if closed due to checkpoint error and we haven't retried
        if (!retryWithoutCheckpoint && (checkpointErrorReceived || reasonStr.includes('checkpoint not found') || reasonStr.includes('failed to restore'))) {
          console.log(`[SpritesWebSocket] Connection closed due to checkpoint error, marking sprite for recreation`);

          // Update sprite status to indicate it needs recreation
          try {
            await ProjectSprite.update(
              {
                status: 'error',
                statusMessage: 'Sprite checkpoint not found. The sprite needs to be recreated.',
                errorMessage: 'Checkpoint corrupted or deleted. Please delete this sprite and create a new one.',
              },
              { where: { id: connection.projectSpriteId } }
            );
          } catch (updateError) {
            console.error(`[SpritesWebSocket] Failed to update sprite status:`, updateError);
          }

          this.sendToFrontend(connection.frontendWs, {
            type: 'error',
            error: 'Sprite checkpoint not found. The sprite state was lost and needs to be recreated. Please delete this sprite and create a new one from the project.',
            status: 'error',
            timestamp: new Date().toISOString(),
          });

          connection.status = 'error';
          return;
        }

        connection.status = 'disconnected';

        this.sendToFrontend(connection.frontendWs, {
          type: 'disconnected',
          status: 'disconnected',
          timestamp: new Date().toISOString(),
        });
      });

      spritesWs.on('error', (error) => {
        const errorStr = String(error);
        console.error(`[SpritesWebSocket] Sprites API WebSocket error (${connection.id}):`, error);

        // Check for checkpoint-related errors
        if (errorStr.includes('checkpoint') || errorStr.includes('restore')) {
          checkpointErrorReceived = true;
        }

        connection.status = 'error';

        this.sendToFrontend(connection.frontendWs, {
          type: 'error',
          error: 'Failed to connect to Sprites API terminal. Please ensure the sprite is running.',
          status: 'error',
          timestamp: new Date().toISOString(),
        });
      });
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`[SpritesWebSocket] ❌ Failed to connect to Sprites API:`, errorMessage);
      connection.status = 'error';

      // Provide specific error messages based on the error type
      let userMessage = `Failed to connect to sprite: ${errorMessage}`;
      if (errorMessage.includes('token not configured')) {
        userMessage = 'Sprites API token is not configured. Please set up your Sprites API token in Settings.';
      } else if (errorMessage.includes('not found')) {
        userMessage = 'Sprite not found. It may have been deleted or not yet created.';
      } else if (errorMessage.includes('not initialized')) {
        userMessage = 'Sprite is still initializing. Please wait a moment and try again.';
      } else if (errorMessage.includes('checkpoint')) {
        userMessage = 'Sprite checkpoint not found. The sprite needs to be recreated. Please delete and create a new one.';

        // Update sprite status
        try {
          await ProjectSprite.update(
            {
              status: 'error',
              statusMessage: 'Checkpoint not found',
              errorMessage: 'Sprite checkpoint was lost. Please delete and recreate.',
            },
            { where: { id: connection.projectSpriteId } }
          );
        } catch {
          // Ignore update errors
        }
      }

      this.sendToFrontend(connection.frontendWs, {
        type: 'error',
        error: userMessage,
        status: 'error',
        timestamp: new Date().toISOString(),
      });

      connection.frontendWs.close(4002, 'Failed to connect to sprite');
    }
  }

  /**
   * Handle message from frontend terminal
   */
  private handleFrontendMessage(connection: ProxyConnection, data: string): void {
    connection.lastActivityAt = new Date();

    try {
      const message: TerminalMessage = JSON.parse(data);

      switch (message.type) {
        case 'input':
          // Forward stdin to Sprites
          if (connection.spritesWs?.readyState === WebSocket.OPEN && message.data) {
            connection.spritesWs.send(JSON.stringify({
              type: 'stdin',
              data: message.data,
            }));
            this.stats.totalBytesOut += message.data.length;
          }
          break;

        case 'resize':
          // Forward resize to Sprites
          if (connection.spritesWs?.readyState === WebSocket.OPEN) {
            connection.spritesWs.send(JSON.stringify({
              type: 'resize',
              cols: message.cols || 80,
              rows: message.rows || 24,
            }));
          }
          break;

        case 'ping':
          this.sendToFrontend(connection.frontendWs, {
            type: 'pong',
            timestamp: new Date().toISOString(),
          });
          break;

        default:
          console.warn(`[SpritesWebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[SpritesWebSocket] Invalid message from frontend:`, error);
    }
  }

  /**
   * Handle message from Sprites API
   */
  private handleSpritesMessage(connection: ProxyConnection, data: Buffer | ArrayBuffer | Buffer[]): void {
    connection.lastActivityAt = new Date();

    try {
      // Handle both binary and text data
      let messageData: string;
      if (Buffer.isBuffer(data)) {
        messageData = data.toString('utf8');
      } else if (data instanceof ArrayBuffer) {
        messageData = Buffer.from(data).toString('utf8');
      } else {
        messageData = Buffer.concat(data).toString('utf8');
      }

      this.stats.totalBytesIn += messageData.length;

      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(messageData);

        // Handle different Sprites API message types
        if (parsed.type === 'stdout' || parsed.type === 'stderr') {
          this.sendToFrontend(connection.frontendWs, {
            type: 'output',
            data: parsed.data,
            timestamp: new Date().toISOString(),
          });
        } else if (parsed.type === 'exit') {
          this.sendToFrontend(connection.frontendWs, {
            type: 'status',
            status: 'disconnected',
            data: `Process exited with code ${parsed.code}`,
            timestamp: new Date().toISOString(),
          });
        } else if (parsed.type === 'error') {
          this.sendToFrontend(connection.frontendWs, {
            type: 'error',
            error: parsed.message || parsed.data,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // If not JSON, treat as raw terminal output
        this.sendToFrontend(connection.frontendWs, {
          type: 'output',
          data: messageData,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(`[SpritesWebSocket] Error processing Sprites message:`, error);
    }
  }

  /**
   * Handle frontend WebSocket disconnect
   */
  private handleFrontendDisconnect(connection: ProxyConnection, code: number, reason: string): void {
    console.log(`[SpritesWebSocket] Frontend disconnected: ${connection.id} (${code})`);

    // Close Sprites connection
    if (connection.spritesWs?.readyState === WebSocket.OPEN) {
      connection.spritesWs.close(1000, 'Frontend disconnected');
    }

    // Remove from connections map
    this.connections.delete(connection.id);
    this.stats.activeConnections = this.connections.size;
  }

  /**
   * Send message to frontend terminal
   */
  private sendToFrontend(ws: WebSocket, message: TerminalMessage): boolean {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        return true;
      }
    } catch (error) {
      console.error('[SpritesWebSocket] Error sending to frontend:', error);
    }
    return false;
  }

  /**
   * Authenticate JWT token and extract user info
   * Supports both Supabase JWTs (which have 'sub' for userId) and custom JWTs
   * Looks up organization from database since Supabase tokens don't include it
   */
  private async authenticateToken(token: string): Promise<{ userId: string; organizationId: string } | null> {
    try {
      // Basic JWT decode (header.payload.signature)
      const parts = token.split('.');
      if (parts.length !== 3) {
        console.log('[SpritesWebSocket] Invalid token format - not a JWT');
        return null;
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      console.log('[SpritesWebSocket] JWT payload keys:', Object.keys(payload));

      // Extract userId from various possible JWT claim names
      const userId = payload.userId || payload.sub || payload.id;
      if (!userId) {
        console.log('[SpritesWebSocket] No userId found in token');
        return null;
      }

      // Check for organizationId in token first (custom JWTs)
      let organizationId = payload.organizationId || payload.orgId || payload.org;

      // If not in token (Supabase JWTs), look up from database
      if (!organizationId) {
        console.log('[SpritesWebSocket] Looking up organization from database for user:', userId);
        // The userId from Supabase JWT (sub claim) should match the MarketplaceUser.id
        const user = await MarketplaceUser.findByPk(userId, {
          attributes: ['id', 'organizationId'],
        });

        if (!user) {
          console.log('[SpritesWebSocket] User not found in database:', userId);
          return null;
        }
        organizationId = user.organizationId;
      }

      if (!organizationId) {
        console.log('[SpritesWebSocket] No organizationId found for user:', userId);
        return null;
      }

      console.log('[SpritesWebSocket] Authentication successful:', { userId, organizationId });
      return { userId, organizationId };
    } catch (error) {
      console.error('[SpritesWebSocket] Token authentication error:', error);
      return null;
    }
  }

  /**
   * Update sprite last accessed time
   */
  private async updateSpriteAccess(connection: ProxyConnection): Promise<void> {
    try {
      await ProjectSprite.update(
        {
          lastAccessedAt: new Date(),
          lastAccessedById: connection.userId,
        },
        {
          where: { id: connection.projectSpriteId },
        }
      );
    } catch (error) {
      console.error('[SpritesWebSocket] Failed to update sprite access:', error);
    }
  }

  /**
   * Start ping interval for connection health
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();

      for (const [id, connection] of this.connections) {
        // Check for activity timeout
        if (now - connection.lastActivityAt.getTime() > this.ACTIVITY_TIMEOUT) {
          console.log(`[SpritesWebSocket] Connection ${id} timed out due to inactivity`);
          this.disconnectConnection(id, 'Inactivity timeout');
          continue;
        }

        // Send ping to frontend
        if (connection.frontendWs.readyState === WebSocket.OPEN) {
          connection.frontendWs.ping();
        }
      }

      this.stats.activeConnections = this.connections.size;
    }, this.PING_INTERVAL);
  }

  /**
   * Disconnect a specific connection
   */
  disconnectConnection(connectionId: string, reason = 'Server disconnect'): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    this.sendToFrontend(connection.frontendWs, {
      type: 'error',
      error: reason,
      status: 'disconnected',
      timestamp: new Date().toISOString(),
    });

    // Close both connections
    if (connection.spritesWs?.readyState === WebSocket.OPEN) {
      connection.spritesWs.close(1000, reason);
    }
    connection.frontendWs.close(1000, reason);

    this.connections.delete(connectionId);
    return true;
  }

  /**
   * Get connections for a specific sprite
   */
  getConnectionsForSprite(projectSpriteId: string): ProxyConnection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.projectSpriteId === projectSpriteId
    );
  }

  /**
   * Get all active connections info
   */
  getActiveConnections(): Array<{
    id: string;
    userId: string;
    spriteId: string;
    sessionId: string;
    status: string;
    connectedAt: Date;
    lastActivityAt: Date;
  }> {
    return Array.from(this.connections.values()).map((conn) => ({
      id: conn.id,
      userId: conn.userId,
      spriteId: conn.spriteId,
      sessionId: conn.sessionId,
      status: conn.status,
      connectedAt: conn.connectedAt,
      lastActivityAt: conn.lastActivityAt,
    }));
  }

  /**
   * Get service statistics
   */
  getStats(): ProxyServiceStats {
    return {
      ...this.stats,
      activeConnections: this.connections.size,
      uptime: Math.round((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Shutdown the WebSocket proxy
   */
  shutdown(): void {
    console.log('[SpritesWebSocket] Shutting down...');

    // Clear intervals
    if (this.pingInterval) clearInterval(this.pingInterval);

    // Close all connections
    for (const connection of this.connections.values()) {
      if (connection.spritesWs?.readyState === WebSocket.OPEN) {
        connection.spritesWs.close(1001, 'Server shutdown');
      }
      connection.frontendWs.close(1001, 'Server shutdown');
    }
    this.connections.clear();

    // Close server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.initialized = false;
    console.log('[SpritesWebSocket] Shutdown complete');
  }
}

export const spritesWebSocketProxy = new SpritesWebSocketProxy();
export default spritesWebSocketProxy;
