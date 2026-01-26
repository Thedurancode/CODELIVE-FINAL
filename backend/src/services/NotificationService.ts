/**
 * Real-time Notification Service
 *
 * WebSocket-based notification system for:
 * - Deal match alerts when properties match buy boxes
 * - Offer status updates
 * - New deal notifications
 * - System announcements
 */

import { EventEmitter } from 'events';
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { Server as HttpServer } from 'http';
import { createClient } from '@supabase/supabase-js';
import MarketplaceUser from '../models/MarketplaceUser';

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType =
  | 'deal_match'           // New deal matches user's buy box
  | 'deal_alert'           // Deal alert notification
  | 'offer_received'       // Seller received an offer
  | 'offer_status'         // Offer status changed
  | 'offer_update'         // Offer updated
  | 'deal_expiring'        // Deal about to expire
  | 'price_drop'           // Price reduced on a saved deal
  | 'new_deal'             // New deal in watched area
  | 'pipeline_update'      // Pipeline stage changed
  | 'compliance_event'     // Compliance check result
  | 'team_message'         // New team chat message
  | 'team_mention'         // User mentioned in team chat
  | 'system';              // System announcement

export interface Notification {
  id: string;
  type: NotificationType;
  userId: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  read: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

export interface DealMatchNotification extends Notification {
  type: 'deal_match';
  data: {
    dealId: string;
    buyBoxId: string;
    buyBoxName: string;
    matchScore: number;
    dealSummary: {
      address: string;
      price: number;
      arv?: number;
      equity?: number;
      propertyType: string;
      bedrooms?: number;
      bathrooms?: number;
    };
  };
}

export interface OfferNotification extends Notification {
  type: 'offer_received' | 'offer_status';
  data: {
    offerId: string;
    dealId: string;
    offerAmount: number;
    status: string;
    counterOfferAmount?: number;
  };
}

export interface WebSocketClient {
  socket: WebSocket;
  userId: string;
  subscriptions: Set<string>;
  connectedAt: Date;
  lastPing: Date;
}

export interface SubscriptionRequest {
  action: 'subscribe' | 'unsubscribe';
  channels: string[];
}

// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

class NotificationService extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient[]> = new Map();
  private notificationQueue: Notification[] = [];
  private pingInterval: NodeJS.Timeout | null = null;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize WebSocket server
   */
  initialize(server: HttpServer): void {
    // Use noServer mode to avoid conflicts with other WebSocketServers
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    // Register upgrade handler on the HTTP server
    server.on('upgrade', (request: any, socket: any, head: any) => {
      const { parse } = require('url');
      const { pathname } = parse(request.url || '');

      // Only handle /ws/notifications path
      if (pathname !== '/ws/notifications') {
        return; // Let other handlers deal with this
      }

      this.wss!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        this.wss!.emit('connection', ws, request);
      });
    });

    // Start ping interval to keep connections alive
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000);

    console.log('🔔 Notification WebSocket server initialized');
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.clients.forEach((clients) => {
      clients.forEach((client) => {
        client.socket.close(1000, 'Server shutdown');
      });
    });

    this.wss?.close();
    console.log('🔔 Notification service shut down');
  }

  // ============================================================================
  // CONNECTION HANDLING
  // ============================================================================

  private async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    // Extract token from query string or Authorization header
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('token') ||
                  (request.headers.authorization?.replace('Bearer ', ''));

    if (!token) {
      socket.close(4001, 'Authentication token required');
      return;
    }

    // Validate token and extract user ID
    let userId: string;
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('Supabase not configured for WebSocket auth');
        socket.close(4003, 'Authentication service unavailable');
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        socket.close(4002, 'Invalid or expired token');
        return;
      }

      userId = user.id;
    } catch (error) {
      console.error('WebSocket auth error:', error);
      socket.close(4003, 'Authentication failed');
      return;
    }

    const client: WebSocketClient = {
      socket,
      userId,
      subscriptions: new Set(['all', `user:${userId}`]),
      connectedAt: new Date(),
      lastPing: new Date(),
    };

    // Add to clients map
    const isFirstConnection = !this.clients.has(userId) || this.clients.get(userId)!.length === 0;
    if (!this.clients.has(userId)) {
      this.clients.set(userId, []);
    }
    this.clients.get(userId)!.push(client);

    console.log(`🔔 Client connected: ${userId} (${this.getConnectionCount()} total connections)`);

    // Update user presence in database and broadcast if first connection
    if (isFirstConnection) {
      this.setUserOnline(userId).catch(console.error);
    }

    // Send welcome message
    this.sendToClient(client, {
      type: 'connected',
      message: 'Connected to notification service',
      subscriptions: Array.from(client.subscriptions),
    });

    // Handle incoming messages
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(client, message);
      } catch (error) {
        this.sendToClient(client, { type: 'error', message: 'Invalid message format' });
      }
    });

    // Handle disconnection
    socket.on('close', () => {
      this.removeClient(client);
      console.log(`🔔 Client disconnected: ${userId} (${this.getConnectionCount()} remaining)`);
    });

    socket.on('error', (error) => {
      console.error(`WebSocket error for ${userId}:`, error);
      this.removeClient(client);
    });

    // Handle pong responses
    socket.on('pong', () => {
      client.lastPing = new Date();
    });
  }

  private handleMessage(client: WebSocketClient, message: any): void {
    switch (message.type) {
      case 'subscribe':
        this.handleSubscribe(client, message.channels || []);
        break;

      case 'unsubscribe':
        this.handleUnsubscribe(client, message.channels || []);
        break;

      case 'ping':
        this.sendToClient(client, { type: 'pong', timestamp: Date.now() });
        break;

      case 'ack':
        // Acknowledge notification receipt
        this.emit('notification:ack', {
          userId: client.userId,
          notificationId: message.notificationId,
        });
        break;

      default:
        this.sendToClient(client, { type: 'error', message: 'Unknown message type' });
    }
  }

  private handleSubscribe(client: WebSocketClient, channels: string[]): void {
    channels.forEach((channel) => {
      // Validate channel subscription (prevent subscribing to other users' channels)
      if (channel.startsWith('user:') && !channel.includes(client.userId)) {
        return; // Skip unauthorized subscriptions
      }
      client.subscriptions.add(channel);
    });

    this.sendToClient(client, {
      type: 'subscribed',
      channels,
      subscriptions: Array.from(client.subscriptions),
    });
  }

  private handleUnsubscribe(client: WebSocketClient, channels: string[]): void {
    channels.forEach((channel) => {
      // Don't allow unsubscribing from required channels
      if (channel !== 'all' && channel !== `user:${client.userId}`) {
        client.subscriptions.delete(channel);
      }
    });

    this.sendToClient(client, {
      type: 'unsubscribed',
      channels,
      subscriptions: Array.from(client.subscriptions),
    });
  }

  private removeClient(client: WebSocketClient): void {
    // Remove all event listeners to prevent memory leaks
    client.socket.removeAllListeners();

    const clients = this.clients.get(client.userId);
    if (clients) {
      const index = clients.indexOf(client);
      if (index > -1) {
        clients.splice(index, 1);
      }
      // If this was the last connection, set user offline
      if (clients.length === 0) {
        this.clients.delete(client.userId);
        this.setUserOffline(client.userId).catch(console.error);
      }
    }
  }

  private pingClients(): void {
    const now = Date.now();
    const timeout = 60000; // 60 seconds timeout
    const clientsToRemove: WebSocketClient[] = [];

    // First pass: identify timed out clients and ping active ones
    this.clients.forEach((clients, userId) => {
      clients.forEach((client) => {
        if (now - client.lastPing.getTime() > timeout) {
          console.log(`🔔 Client timed out: ${userId}`);
          client.socket.terminate();
          clientsToRemove.push(client);
        } else if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.ping();
        }
      });
    });

    // Second pass: remove timed out clients (after iteration completes)
    for (const client of clientsToRemove) {
      this.removeClient(client);
    }
  }

  // ============================================================================
  // NOTIFICATION SENDING
  // ============================================================================

  /**
   * Send notification to a specific user
   */
  sendToUser(userId: string, notification: Partial<Notification>): void {
    const fullNotification: Notification = {
      id: this.generateId(),
      type: notification.type || 'system',
      userId,
      title: notification.title || 'Notification',
      message: notification.message || '',
      data: notification.data,
      priority: notification.priority || 'normal',
      read: false,
      createdAt: new Date(),
      expiresAt: notification.expiresAt,
    };

    const clients = this.clients.get(userId);
    if (clients && clients.length > 0) {
      clients.forEach((client) => {
        this.sendToClient(client, {
          type: 'notification',
          notification: fullNotification,
        });
      });
    } else {
      // Queue for later delivery or push notification
      this.queueNotification(fullNotification);
    }

    this.emit('notification:sent', fullNotification);
  }

  /**
   * Send notification to a channel (all subscribed users)
   */
  sendToChannel(channel: string, notification: Partial<Notification>): void {
    this.clients.forEach((clients, userId) => {
      clients.forEach((client) => {
        if (client.subscriptions.has(channel)) {
          const fullNotification: Notification = {
            id: this.generateId(),
            type: notification.type || 'system',
            userId,
            title: notification.title || 'Notification',
            message: notification.message || '',
            data: notification.data,
            priority: notification.priority || 'normal',
            read: false,
            createdAt: new Date(),
            expiresAt: notification.expiresAt,
          };

          this.sendToClient(client, {
            type: 'notification',
            notification: fullNotification,
          });
        }
      });
    });
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(notification: Partial<Notification>): void {
    this.sendToChannel('all', notification);
  }

  private sendToClient(client: WebSocketClient, message: any): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  private queueNotification(notification: Notification): void {
    this.notificationQueue.push(notification);

    // In production, this would persist to database
    // and trigger push notification
    this.emit('notification:queued', notification);
  }

  // ============================================================================
  // DEAL MATCH NOTIFICATIONS
  // ============================================================================

  /**
   * Send deal match notification
   */
  notifyDealMatch(
    userId: string,
    deal: {
      id: string;
      address: string;
      price: number;
      arv?: number;
      equity?: number;
      propertyType: string;
      bedrooms?: number;
      bathrooms?: number;
    },
    buyBox: {
      id: string;
      name: string;
    },
    matchScore: number
  ): void {
    const notification: DealMatchNotification = {
      id: this.generateId(),
      type: 'deal_match',
      userId,
      title: 'New Deal Match!',
      message: `A new property matches your "${buyBox.name}" criteria with ${matchScore}% match`,
      priority: matchScore >= 90 ? 'high' : 'normal',
      read: false,
      createdAt: new Date(),
      data: {
        dealId: deal.id,
        buyBoxId: buyBox.id,
        buyBoxName: buyBox.name,
        matchScore,
        dealSummary: {
          address: deal.address,
          price: deal.price,
          arv: deal.arv,
          equity: deal.equity,
          propertyType: deal.propertyType,
          bedrooms: deal.bedrooms,
          bathrooms: deal.bathrooms,
        },
      },
    };

    this.sendToUser(userId, notification);
  }

  /**
   * Send offer status notification
   */
  notifyOfferStatus(
    userId: string,
    offer: {
      id: string;
      dealId: string;
      amount: number;
      status: string;
      counterOfferAmount?: number;
    }
  ): void {
    const statusMessages: Record<string, string> = {
      viewed: 'Your offer has been viewed by the seller',
      countered: `Counter offer received: $${offer.counterOfferAmount?.toLocaleString()}`,
      accepted: 'Congratulations! Your offer has been accepted!',
      rejected: 'Your offer was not accepted',
      expired: 'Your offer has expired',
    };

    const notification: OfferNotification = {
      id: this.generateId(),
      type: 'offer_status',
      userId,
      title: `Offer ${offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}`,
      message: statusMessages[offer.status] || `Offer status: ${offer.status}`,
      priority: offer.status === 'accepted' ? 'urgent' : offer.status === 'countered' ? 'high' : 'normal',
      read: false,
      createdAt: new Date(),
      data: {
        offerId: offer.id,
        dealId: offer.dealId,
        offerAmount: offer.amount,
        status: offer.status,
        counterOfferAmount: offer.counterOfferAmount,
      },
    };

    this.sendToUser(userId, notification);
  }

  /**
   * Send new deal notification to all matching users
   */
  async notifyNewDeal(
    deal: {
      id: string;
      address: string;
      price: number;
      state: string;
      propertyType: string;
    },
    matchedUsers: Array<{ userId: string; buyBoxId: string; buyBoxName: string; matchScore: number }>
  ): Promise<void> {
    for (const match of matchedUsers) {
      this.notifyDealMatch(
        match.userId,
        {
          id: deal.id,
          address: deal.address,
          price: deal.price,
          propertyType: deal.propertyType,
        },
        {
          id: match.buyBoxId,
          name: match.buyBoxName,
        },
        match.matchScore
      );
    }
  }

  // ============================================================================
  // TEAM CHAT NOTIFICATIONS
  // ============================================================================

  /**
   * Send team message notification to conversation participants
   */
  notifyTeamMessage(
    conversationId: string,
    message: {
      id: string;
      senderId: string;
      senderName: string;
      senderType: string;
      source: string;
      content: string;
      mentions?: string[];
      attachments?: any[];
      createdAt: Date;
    },
    participantIds: string[]
  ): void {
    // Send to all participants except the sender
    participantIds
      .filter(userId => userId !== message.senderId)
      .forEach(userId => {
        const clients = this.clients.get(userId);
        if (clients && clients.length > 0) {
          clients.forEach(client => {
            // Check if client is subscribed to team_chat or this conversation
            if (client.subscriptions.has('team_chat') ||
                client.subscriptions.has(`conversation:${conversationId}`)) {
              this.sendToClient(client, {
                type: 'team_message',
                conversationId,
                message: {
                  id: message.id,
                  conversationId,
                  senderId: message.senderId,
                  senderName: message.senderName,
                  senderType: message.senderType,
                  source: message.source,
                  content: message.content,
                  mentions: message.mentions || [],
                  attachments: message.attachments || [],
                  createdAt: message.createdAt,
                },
              });
            }
          });
        }
      });
  }

  /**
   * Send typing indicator
   */
  notifyTyping(
    conversationId: string,
    userId: string,
    userName: string,
    isTyping: boolean
  ): void {
    // Broadcast to all clients subscribed to this conversation
    this.clients.forEach((clients, clientUserId) => {
      if (clientUserId === userId) return; // Don't send to self

      clients.forEach(client => {
        if (client.subscriptions.has(`conversation:${conversationId}`) ||
            client.subscriptions.has('team_chat')) {
          this.sendToClient(client, {
            type: isTyping ? 'typing_start' : 'typing_stop',
            conversationId,
            userId,
            userName,
          });
        }
      });
    });
  }

  /**
   * Send unread count update
   */
  notifyUnreadCount(userId: string, conversationId: string, count: number, totalCount: number): void {
    const clients = this.clients.get(userId);
    if (clients && clients.length > 0) {
      clients.forEach(client => {
        this.sendToClient(client, {
          type: 'unread_count',
          conversationId,
          count,
          totalCount,
        });
      });
    }
  }

  /**
   * Notify new conversation created
   */
  notifyNewConversation(participantIds: string[], conversation: any): void {
    participantIds.forEach(userId => {
      const clients = this.clients.get(userId);
      if (clients && clients.length > 0) {
        clients.forEach(client => {
          if (client.subscriptions.has('team_chat')) {
            this.sendToClient(client, {
              type: 'conversation_created',
              conversation,
            });
          }
        });
      }
    });
  }

  /**
   * Notify message read
   */
  notifyMessageRead(conversationId: string, userId: string, participantIds: string[]): void {
    participantIds
      .filter(id => id !== userId)
      .forEach(participantId => {
        const clients = this.clients.get(participantId);
        if (clients && clients.length > 0) {
          clients.forEach(client => {
            if (client.subscriptions.has(`conversation:${conversationId}`) ||
                client.subscriptions.has('team_chat')) {
              this.sendToClient(client, {
                type: 'message_read',
                conversationId,
                userId,
              });
            }
          });
        }
      });
  }

  // ============================================================================
  // PRESENCE MANAGEMENT
  // ============================================================================

  /**
   * Set user as online and broadcast to all connected users
   */
  async setUserOnline(userId: string): Promise<void> {
    try {
      // Update database
      await MarketplaceUser.update(
        {
          isOnline: true,
          onlineStatus: 'online',
          lastActiveAt: new Date(),
        },
        { where: { id: userId } }
      );

      // Get user info for broadcast
      const user = await MarketplaceUser.findByPk(userId, {
        attributes: ['id', 'name', 'avatar'],
      });

      if (user) {
        this.broadcastPresence({
          type: 'presence_update',
          userId,
          status: 'online',
          user: {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
          },
        });
      }

      console.log(`👤 User ${userId} is now online`);
    } catch (error) {
      console.error(`Failed to set user ${userId} online:`, error);
    }
  }

  /**
   * Set user as offline and broadcast to all connected users
   */
  async setUserOffline(userId: string): Promise<void> {
    try {
      const now = new Date();

      // Update database
      await MarketplaceUser.update(
        {
          isOnline: false,
          onlineStatus: 'offline',
          lastSeenAt: now,
          lastActiveAt: now,
        },
        { where: { id: userId } }
      );

      // Get user info for broadcast
      const user = await MarketplaceUser.findByPk(userId, {
        attributes: ['id', 'name', 'avatar'],
      });

      if (user) {
        this.broadcastPresence({
          type: 'presence_update',
          userId,
          status: 'offline',
          lastSeenAt: now.toISOString(),
          user: {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
          },
        });
      }

      console.log(`👤 User ${userId} is now offline`);
    } catch (error) {
      console.error(`Failed to set user ${userId} offline:`, error);
    }
  }

  /**
   * Broadcast presence update to all connected clients
   */
  private broadcastPresence(data: {
    type: 'presence_update';
    userId: string;
    status: 'online' | 'away' | 'offline';
    lastSeenAt?: string;
    user?: { id: string; name: string; avatar?: string };
  }): void {
    this.clients.forEach((clients) => {
      clients.forEach((client) => {
        if (client.socket.readyState === WebSocket.OPEN) {
          this.sendToClient(client, data);
        }
      });
    });
  }

  /**
   * Get list of online users with their info
   */
  async getOnlineUsers(): Promise<Array<{
    id: string;
    name: string;
    avatar?: string;
    onlineStatus: string;
    lastActiveAt?: Date;
  }>> {
    const connectedUserIds = this.getConnectedUsers();
    if (connectedUserIds.length === 0) return [];

    const users = await MarketplaceUser.findAll({
      where: { id: connectedUserIds },
      attributes: ['id', 'name', 'avatar', 'onlineStatus', 'lastActiveAt'],
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      onlineStatus: u.onlineStatus,
      lastActiveAt: u.lastActiveAt,
    }));
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getConnectionCount(): number {
    let count = 0;
    this.clients.forEach((clients) => {
      count += clients.length;
    });
    return count;
  }

  getConnectedUsers(): string[] {
    return Array.from(this.clients.keys());
  }

  isUserConnected(userId: string): boolean {
    return this.clients.has(userId) && (this.clients.get(userId)?.length ?? 0) > 0;
  }

  getQueuedNotifications(userId: string): Notification[] {
    return this.notificationQueue.filter((n) => n.userId === userId);
  }

  clearQueuedNotifications(userId: string): void {
    this.notificationQueue = this.notificationQueue.filter((n) => n.userId !== userId);
  }

  /**
   * Get service stats
   */
  getStats(): {
    connections: number;
    users: number;
    queuedNotifications: number;
  } {
    return {
      connections: this.getConnectionCount(),
      users: this.clients.size,
      queuedNotifications: this.notificationQueue.length,
    };
  }
}

export const notificationService = new NotificationService();
export default notificationService;
