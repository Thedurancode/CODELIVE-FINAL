/**
 * TV Remote WebSocket Service
 *
 * Enables cross-device communication between iPad remotes and TV displays.
 * Uses room-based sessions to pair remotes with displays.
 *
 * Features:
 * - Room-based pairing (remote + display share a room code)
 * - No authentication required (public access for TV displays)
 * - Bidirectional command/status forwarding
 * - Automatic cleanup on disconnect
 * - Heartbeat for connection health
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import * as crypto from 'crypto';

// Message types
export type TVRemoteMessageType =
  | 'join' // Join a room
  | 'leave' // Leave a room
  | 'command' // Remote command (iPad → TV)
  | 'status' // Status update (TV → iPad)
  | 'ping'
  | 'pong'
  | 'error'
  | 'room-info'; // Room information

// Message structure
export interface TVRemoteMessage {
  type: TVRemoteMessageType;
  room?: string;
  role?: 'remote' | 'display';
  payload?: Record<string, unknown>;
  error?: string;
  timestamp: string;
}

// Connection tracking
interface TVConnection {
  id: string;
  ws: WebSocket;
  room: string | null;
  role: 'remote' | 'display' | null;
  connectedAt: Date;
  lastActivityAt: Date;
}

// Room tracking
interface TVRoom {
  code: string;
  display: TVConnection | null;
  remotes: Set<string>; // Connection IDs
  createdAt: Date;
}

class TVRemoteWebSocketService {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, TVConnection> = new Map();
  private rooms: Map<string, TVRoom> = new Map();
  private initialized = false;

  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly ROOM_CLEANUP_INTERVAL = 60000; // 1 minute
  private pingInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the WebSocket server
   */
  initialize(server: any): void {
    if (this.initialized) return;

    try {
      this.wss = new WebSocketServer({ noServer: true });

      this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
        this.handleConnection(ws, request);
      });

      // Handle upgrade requests
      server.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
        const url = new URL(request.url || '', `http://${request.headers.host}`);
        const pathname = url.pathname;

        if (pathname !== '/ws/tv-remote') {
          return; // Let other handlers deal with this
        }

        this.wss!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          this.wss!.emit('connection', ws, request);
        });
      });

      // Start ping interval
      this.pingInterval = setInterval(() => this.pingConnections(), this.PING_INTERVAL);

      // Start room cleanup interval
      this.cleanupInterval = setInterval(() => this.cleanupEmptyRooms(), this.ROOM_CLEANUP_INTERVAL);

      this.initialized = true;
      console.log('[TVRemoteWS] Service initialized');
    } catch (error) {
      console.error('[TVRemoteWS] Failed to initialize:', error);
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const connectionId = crypto.randomUUID();

    const connection: TVConnection = {
      id: connectionId,
      ws,
      room: null,
      role: null,
      connectedAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.connections.set(connectionId, connection);
    console.log(`[TVRemoteWS] New connection: ${connectionId}`);

    // Handle messages
    ws.on('message', (data: Buffer) => {
      try {
        const message: TVRemoteMessage = JSON.parse(data.toString());
        this.handleMessage(connectionId, message);
      } catch (error) {
        this.sendError(ws, 'Invalid message format');
      }
    });

    // Handle close
    ws.on('close', () => {
      this.handleDisconnect(connectionId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[TVRemoteWS] Connection error (${connectionId}):`, error.message);
      this.handleDisconnect(connectionId);
    });

    // Handle pong responses
    ws.on('pong', () => {
      connection.lastActivityAt = new Date();
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(connectionId: string, message: TVRemoteMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.lastActivityAt = new Date();

    switch (message.type) {
      case 'join':
        this.handleJoin(connection, message);
        break;

      case 'leave':
        this.handleLeave(connection);
        break;

      case 'command':
        this.handleCommand(connection, message);
        break;

      case 'status':
        this.handleStatus(connection, message);
        break;

      case 'ping':
        this.send(connection.ws, { type: 'pong', timestamp: new Date().toISOString() });
        break;

      default:
        this.sendError(connection.ws, `Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle join room request
   */
  private handleJoin(connection: TVConnection, message: TVRemoteMessage): void {
    const { room, role } = message;

    if (!room || !role) {
      this.sendError(connection.ws, 'Room code and role are required');
      return;
    }

    if (role !== 'remote' && role !== 'display') {
      this.sendError(connection.ws, 'Role must be "remote" or "display"');
      return;
    }

    // Leave current room if in one
    if (connection.room) {
      this.handleLeave(connection);
    }

    // Get or create room
    let tvRoom = this.rooms.get(room);
    if (!tvRoom) {
      tvRoom = {
        code: room,
        display: null,
        remotes: new Set(),
        createdAt: new Date(),
      };
      this.rooms.set(room, tvRoom);
      console.log(`[TVRemoteWS] Room created: ${room}`);
    }

    // Join room
    connection.room = room;
    connection.role = role;

    if (role === 'display') {
      // Only one display per room
      if (tvRoom.display && tvRoom.display.id !== connection.id) {
        // Disconnect old display
        this.send(tvRoom.display.ws, {
          type: 'error',
          error: 'Another display connected to this room',
          timestamp: new Date().toISOString(),
        });
        tvRoom.display.room = null;
        tvRoom.display.role = null;
      }
      tvRoom.display = connection;
    } else {
      tvRoom.remotes.add(connection.id);
    }

    // Send room info
    this.send(connection.ws, {
      type: 'room-info',
      room,
      payload: {
        role,
        hasDisplay: !!tvRoom.display,
        remoteCount: tvRoom.remotes.size,
      },
      timestamp: new Date().toISOString(),
    });

    // Notify others in room
    this.broadcastRoomUpdate(tvRoom);

    console.log(`[TVRemoteWS] ${connection.id} joined room ${room} as ${role}`);
  }

  /**
   * Handle leave room
   */
  private handleLeave(connection: TVConnection): void {
    if (!connection.room) return;

    const room = this.rooms.get(connection.room);
    if (room) {
      if (connection.role === 'display') {
        room.display = null;
      } else {
        room.remotes.delete(connection.id);
      }
      this.broadcastRoomUpdate(room);
    }

    console.log(`[TVRemoteWS] ${connection.id} left room ${connection.room}`);
    connection.room = null;
    connection.role = null;
  }

  /**
   * Handle command from remote to display
   */
  private handleCommand(connection: TVConnection, message: TVRemoteMessage): void {
    if (connection.role !== 'remote' || !connection.room) {
      this.sendError(connection.ws, 'Must be a remote in a room to send commands');
      return;
    }

    const room = this.rooms.get(connection.room);
    if (!room || !room.display) {
      this.sendError(connection.ws, 'No display connected to this room');
      return;
    }

    // Forward command to display
    this.send(room.display.ws, {
      type: 'command',
      payload: message.payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle status from display to remotes
   */
  private handleStatus(connection: TVConnection, message: TVRemoteMessage): void {
    if (connection.role !== 'display' || !connection.room) {
      this.sendError(connection.ws, 'Must be a display in a room to send status');
      return;
    }

    const room = this.rooms.get(connection.room);
    if (!room) return;

    // Broadcast status to all remotes
    for (const remoteId of room.remotes) {
      const remote = this.connections.get(remoteId);
      if (remote) {
        this.send(remote.ws, {
          type: 'status',
          payload: message.payload,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Broadcast room update to all members
   */
  private broadcastRoomUpdate(room: TVRoom): void {
    const info = {
      type: 'room-info' as const,
      room: room.code,
      payload: {
        hasDisplay: !!room.display,
        remoteCount: room.remotes.size,
      },
      timestamp: new Date().toISOString(),
    };

    if (room.display) {
      this.send(room.display.ws, info);
    }

    for (const remoteId of room.remotes) {
      const remote = this.connections.get(remoteId);
      if (remote) {
        this.send(remote.ws, info);
      }
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    this.handleLeave(connection);
    this.connections.delete(connectionId);
    console.log(`[TVRemoteWS] Connection closed: ${connectionId}`);
  }

  /**
   * Send message to a WebSocket
   */
  private send(ws: WebSocket, message: TVRemoteMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error message
   */
  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, {
      type: 'error',
      error,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Ping all connections to detect dead connections
   */
  private pingConnections(): void {
    const now = Date.now();
    const timeout = this.PING_INTERVAL * 2;

    for (const [id, connection] of this.connections) {
      if (now - connection.lastActivityAt.getTime() > timeout) {
        console.log(`[TVRemoteWS] Connection timeout: ${id}`);
        connection.ws.terminate();
        this.handleDisconnect(id);
      } else if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.ping();
      }
    }
  }

  /**
   * Clean up empty rooms
   */
  private cleanupEmptyRooms(): void {
    for (const [code, room] of this.rooms) {
      if (!room.display && room.remotes.size === 0) {
        this.rooms.delete(code);
        console.log(`[TVRemoteWS] Room cleaned up: ${code}`);
      }
    }
  }

  /**
   * Generate a random room code
   */
  generateRoomCode(): string {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  /**
   * Get room info
   */
  getRoomInfo(code: string): { hasDisplay: boolean; remoteCount: number } | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    return {
      hasDisplay: !!room.display,
      remoteCount: room.remotes.size,
    };
  }

  /**
   * Get service stats
   */
  getStats(): { connections: number; rooms: number } {
    return {
      connections: this.connections.size,
      rooms: this.rooms.size,
    };
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    for (const connection of this.connections.values()) {
      connection.ws.close(1001, 'Server shutting down');
    }

    this.connections.clear();
    this.rooms.clear();

    if (this.wss) {
      this.wss.close();
    }

    this.initialized = false;
    console.log('[TVRemoteWS] Service shut down');
  }
}

export const tvRemoteWebSocketService = new TVRemoteWebSocketService();
