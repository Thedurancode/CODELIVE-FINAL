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
import { homeAssistantService, HAEntityState } from './HomeAssistantService';

// Message types
export type TVRemoteMessageType =
  | 'join' // Join a room
  | 'leave' // Leave a room
  | 'command' // Remote command (iPad → TV)
  | 'status' // Status update (TV → iPad)
  | 'ping'
  | 'pong'
  | 'error'
  | 'room-info' // Room information
  // Home Assistant message types
  | 'ha-command' // iPad → Backend: Control HA device
  | 'ha-state' // Backend → iPad: Single device state update
  | 'ha-states' // Backend → iPad: All device states
  | 'ha-subscribe' // iPad → Backend: Subscribe to entity updates
  | 'ha-unsubscribe' // iPad → Backend: Unsubscribe
  | 'ha-result'; // Backend → iPad: Command result

// Home Assistant command payload
export interface HACommandPayload {
  configId?: string;
  action: 'turn_on' | 'turn_off' | 'toggle' | 'media_play_pause' | 'set_brightness' | 'set_color' | 'set_temperature' | 'set_mode' | 'activate_scene' | 'call_service';
  entityId?: string;
  domain?: string;
  service?: string;
  data?: Record<string, any>;
}

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
  // Home Assistant subscriptions
  haConfigId?: string;
  haSubscribedEntities: Set<string>;
  haUnsubscribe?: () => void;
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
      haSubscribedEntities: new Set(),
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

      // Home Assistant commands
      case 'ha-command':
        this.handleHACommand(connection, message);
        break;

      case 'ha-subscribe':
        this.handleHASubscribe(connection, message);
        break;

      case 'ha-unsubscribe':
        this.handleHAUnsubscribe(connection);
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

  // ============================================================================
  // HOME ASSISTANT HANDLERS
  // ============================================================================

  /**
   * Handle Home Assistant command from iPad remote
   */
  private async handleHACommand(connection: TVConnection, message: TVRemoteMessage): Promise<void> {
    const payload = message.payload as HACommandPayload;
    if (!payload || !payload.action) {
      this.sendError(connection.ws, 'Invalid HA command payload');
      return;
    }

    // Get config ID (use connection's config or payload's config)
    const configId = payload.configId || connection.haConfigId;
    if (!configId) {
      // Try to get default config
      const defaultConfig = homeAssistantService.getDefaultConfiguration();
      if (!defaultConfig) {
        this.sendError(connection.ws, 'No Home Assistant configuration available');
        return;
      }
      connection.haConfigId = defaultConfig.id;
    }

    const haConfigId = configId || connection.haConfigId!;

    try {
      let result: any;

      switch (payload.action) {
        case 'turn_on':
          if (!payload.entityId) throw new Error('entityId is required');
          await homeAssistantService.turnOn(haConfigId, payload.entityId, payload.data);
          result = { success: true, action: 'turn_on', entityId: payload.entityId };
          break;

        case 'turn_off':
          if (!payload.entityId) throw new Error('entityId is required');
          await homeAssistantService.turnOff(haConfigId, payload.entityId);
          result = { success: true, action: 'turn_off', entityId: payload.entityId };
          break;

        case 'toggle':
          if (!payload.entityId) throw new Error('entityId is required');
          await homeAssistantService.toggle(haConfigId, payload.entityId);
          result = { success: true, action: 'toggle', entityId: payload.entityId };
          break;

        case 'media_play_pause':
          if (!payload.entityId) throw new Error('entityId is required');
          await homeAssistantService.mediaPlayPause(haConfigId, payload.entityId);
          result = { success: true, action: 'media_play_pause', entityId: payload.entityId };
          break;

        case 'set_brightness':
          if (!payload.entityId || payload.data?.brightness === undefined) {
            throw new Error('entityId and brightness are required');
          }
          await homeAssistantService.setLightBrightness(haConfigId, payload.entityId, payload.data.brightness);
          result = { success: true, action: 'set_brightness', entityId: payload.entityId };
          break;

        case 'set_color':
          if (!payload.entityId || !payload.data) {
            throw new Error('entityId and color data are required');
          }
          const color = payload.data.rgb_color
            ? { r: payload.data.rgb_color[0], g: payload.data.rgb_color[1], b: payload.data.rgb_color[2] }
            : payload.data.hex_color;
          if (!color) throw new Error('rgb_color or hex_color is required');
          await homeAssistantService.setLightColor(haConfigId, payload.entityId, color);
          result = { success: true, action: 'set_color', entityId: payload.entityId };
          break;

        case 'set_temperature':
          if (!payload.entityId || payload.data?.temperature === undefined) {
            throw new Error('entityId and temperature are required');
          }
          await homeAssistantService.setClimateTemperature(haConfigId, payload.entityId, payload.data.temperature);
          result = { success: true, action: 'set_temperature', entityId: payload.entityId };
          break;

        case 'set_mode':
          if (!payload.entityId || !payload.data?.mode) {
            throw new Error('entityId and mode are required');
          }
          await homeAssistantService.setClimateMode(haConfigId, payload.entityId, payload.data.mode);
          result = { success: true, action: 'set_mode', entityId: payload.entityId };
          break;

        case 'activate_scene':
          if (!payload.entityId) throw new Error('entityId (scene) is required');
          await homeAssistantService.activateScene(haConfigId, payload.entityId);
          result = { success: true, action: 'activate_scene', entityId: payload.entityId };
          break;

        case 'call_service':
          if (!payload.domain || !payload.service) {
            throw new Error('domain and service are required');
          }
          await homeAssistantService.callService(haConfigId, {
            domain: payload.domain,
            service: payload.service,
            target: payload.entityId ? { entity_id: payload.entityId } : undefined,
            service_data: payload.data,
          });
          result = { success: true, action: 'call_service', domain: payload.domain, service: payload.service };
          break;

        default:
          throw new Error(`Unknown action: ${payload.action}`);
      }

      // Send success result
      this.send(connection.ws, {
        type: 'ha-result',
        payload: result,
        timestamp: new Date().toISOString(),
      });

      console.log(`[TVRemoteWS] HA command executed: ${payload.action} on ${payload.entityId || 'N/A'}`);
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`[TVRemoteWS] HA command error for ${payload.entityId || 'unknown entity'}:`, errorMessage);
      this.send(connection.ws, {
        type: 'ha-result',
        payload: {
          success: false,
          error: errorMessage,
          entityId: payload.entityId,
          action: payload.action,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle Home Assistant subscription request
   */
  private async handleHASubscribe(connection: TVConnection, message: TVRemoteMessage): Promise<void> {
    const payload = message.payload as { configId?: string; entityIds?: string[] };
    const configId = payload?.configId || connection.haConfigId;

    // Get or set config ID
    if (!configId) {
      const defaultConfig = homeAssistantService.getDefaultConfiguration();
      if (!defaultConfig) {
        this.sendError(connection.ws, 'No Home Assistant configuration available');
        return;
      }
      connection.haConfigId = defaultConfig.id;
    } else {
      connection.haConfigId = configId;
    }

    const haConfigId = connection.haConfigId!;

    try {
      // Unsubscribe from previous subscription
      if (connection.haUnsubscribe) {
        connection.haUnsubscribe();
      }

      // Get initial states
      const states = await homeAssistantService.getStates(haConfigId);

      // Filter to requested entities if specified
      let filteredStates = states;
      if (payload?.entityIds && payload.entityIds.length > 0) {
        connection.haSubscribedEntities = new Set(payload.entityIds);
        filteredStates = states.filter(s => connection.haSubscribedEntities.has(s.entity_id));
      } else {
        // Subscribe to all entities
        connection.haSubscribedEntities = new Set(states.map(s => s.entity_id));
      }

      // Send initial states
      this.send(connection.ws, {
        type: 'ha-states',
        payload: {
          configId: haConfigId,
          states: filteredStates.map(s => ({
            entity_id: s.entity_id,
            state: s.state,
            attributes: s.attributes,
            friendly_name: s.attributes.friendly_name || s.entity_id,
            domain: s.entity_id.split('.')[0],
          })),
        },
        timestamp: new Date().toISOString(),
      });

      // Subscribe to state changes
      connection.haUnsubscribe = homeAssistantService.onStateChange(haConfigId, (state: HAEntityState) => {
        // Only send if subscribed to this entity
        if (connection.haSubscribedEntities.size === 0 || connection.haSubscribedEntities.has(state.entity_id)) {
          console.log(`[TVRemoteWS] Forwarding state update: ${state.entity_id} -> ${state.state}`);
          this.send(connection.ws, {
            type: 'ha-state',
            payload: {
              entity_id: state.entity_id,
              state: state.state,
              attributes: state.attributes,
              friendly_name: state.attributes.friendly_name || state.entity_id,
              domain: state.entity_id.split('.')[0],
            },
            timestamp: new Date().toISOString(),
          });
        }
      });

      console.log(`[TVRemoteWS] HA subscribed: ${connection.id} to ${connection.haSubscribedEntities.size} entities`);
    } catch (error) {
      console.error('[TVRemoteWS] HA subscribe error:', error);
      this.sendError(connection.ws, `Failed to subscribe: ${(error as Error).message}`);
    }
  }

  /**
   * Handle Home Assistant unsubscription
   */
  private handleHAUnsubscribe(connection: TVConnection): void {
    if (connection.haUnsubscribe) {
      connection.haUnsubscribe();
      connection.haUnsubscribe = undefined;
    }
    connection.haSubscribedEntities.clear();
    connection.haConfigId = undefined;
    console.log(`[TVRemoteWS] HA unsubscribed: ${connection.id}`);
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
