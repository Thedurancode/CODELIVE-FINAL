/**
 * Team Communication Service
 *
 * Core service for the unified team communication system.
 * Handles platform messages, SMS (Twilio), and email integration.
 * All communications are organized by property address.
 */

import { EventEmitter } from 'events';
import { Op } from 'sequelize';
import sequelize from '../config/database';
import TeamConversation from '../models/TeamConversation';
import TeamMessage, { SenderType, MessageSource, DeliveryStatus } from '../models/TeamMessage';
import GuestSession from '../models/GuestSession';
import Property from '../models/Property';
import MarketplaceUser from '../models/MarketplaceUser';
import { notificationService } from './NotificationService';
import { supabaseRealtimeService } from './SupabaseRealtimeService';
import { pushNotificationService } from './PushNotificationService';

// ============================================================================
// TYPES
// ============================================================================

export interface SendMessageOptions {
  conversationId: string;
  senderId?: string;
  senderType: SenderType;
  senderName: string;
  senderPhone?: string;
  senderEmail?: string;
  source: MessageSource;
  content: string;
  contentHtml?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    url?: string;
  }>;
  replyToMessageId?: string;
  externalMessageId?: string;
  metadata?: Record<string, any>;
}

export interface CreateConversationOptions {
  propertyId?: number;
  propertyAddress?: string;
  title?: string;
  creatorId?: string;
}

export interface ConversationFilters {
  includeArchived?: boolean;
  source?: MessageSource;
  limit?: number;
  offset?: number;
}

export interface MessageFilters {
  before?: Date;
  after?: Date;
  source?: MessageSource;
  limit?: number;
  offset?: number;
}

export interface InboundSMSData {
  from: string;
  body: string;
  twilioSid: string;
  to?: string;
  numMedia?: number;
  mediaUrls?: string[];
}

export interface TeamChatWebSocketEvent {
  type: 'team_message' | 'typing_start' | 'typing_stop' | 'message_read' | 'conversation_created' | 'unread_count';
  conversationId?: string;
  message?: any;
  userId?: string;
  userName?: string;
  count?: number;
  totalCount?: number;
  conversation?: any;
}

// ============================================================================
// SERVICE
// ============================================================================

class TeamCommunicationService extends EventEmitter {
  private initialized = false;

  constructor() {
    super();
  }

  /**
   * Initialize the service
   */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    console.log('💬 Team Communication Service initialized');
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // CONVERSATION METHODS
  // ============================================================================

  /**
   * Create a new conversation
   * If propertyId is provided, uses getOrCreateForProperty to ensure only ONE conversation per property
   */
  async createConversation(options: CreateConversationOptions): Promise<TeamConversation> {
    const { propertyId, propertyAddress, title, creatorId } = options;

    // If propertyId is provided, use getOrCreate to ensure only one conversation per property
    if (propertyId) {
      const conversation = await this.getOrCreateForProperty(propertyId);

      // Add creator as participant if provided
      if (creatorId && !conversation.participantIds.includes(creatorId)) {
        await conversation.addParticipant(creatorId);
      }

      // Update title if custom title provided
      if (title && title !== conversation.title) {
        await conversation.update({ title });
      }

      return conversation;
    }

    // For non-property conversations, create normally
    const conversation = await TeamConversation.create({
      propertyId: null,
      propertyAddress: propertyAddress || null,
      title: title || propertyAddress || 'General Conversation',
      participantIds: creatorId ? [creatorId] : [],
      unreadCounts: {},
    });

    // Emit event
    this.emitEvent('conversation_created', {
      type: 'conversation_created',
      conversation: conversation.toJSON(),
    });

    return conversation;
  }

  /**
   * Get or create conversation for a property
   */
  async getOrCreateForProperty(propertyId: number): Promise<TeamConversation> {
    if (!propertyId || isNaN(propertyId)) {
      throw new Error(`Invalid property ID: ${propertyId}`);
    }

    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error(`Property not found: ${propertyId}`);
    }

    const address = this.formatPropertyAddress(property);
    const [conversation] = await TeamConversation.findOrCreateForProperty(propertyId, address);

    // Return conversation with property included
    return TeamConversation.findByPk(conversation.id, {
      include: [
        {
          model: Property,
          as: 'property',
          required: false,
        },
      ],
    }) as Promise<TeamConversation>;
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: string): Promise<TeamConversation | null> {
    return TeamConversation.findByPk(conversationId, {
      include: [
        {
          model: Property,
          as: 'property',
          required: false,
        },
      ],
    });
  }

  /**
   * Get conversations for a user
   */
  async getConversationsForUser(
    userId: string,
    filters: ConversationFilters = {}
  ): Promise<TeamConversation[]> {
    return TeamConversation.getForUser(userId, {
      includeArchived: filters.includeArchived,
      limit: filters.limit,
      offset: filters.offset,
    });
  }

  /**
   * Get all conversations (for admins)
   */
  async getAllConversations(filters: ConversationFilters = {}): Promise<TeamConversation[]> {
    const where: any = {};

    if (!filters.includeArchived) {
      where.isArchived = false;
    }

    return TeamConversation.findAll({
      where,
      order: [['lastMessageAt', 'DESC NULLS LAST']],
      limit: filters.limit || 50,
      offset: filters.offset || 0,
      include: [
        {
          model: Property,
          as: 'property',
          required: false,
        },
      ],
    });
  }

  /**
   * Search conversations by address
   */
  async searchConversations(query: string, limit: number = 10): Promise<TeamConversation[]> {
    return TeamConversation.searchByAddress(query, limit);
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: string): Promise<void> {
    const conversation = await TeamConversation.findByPk(conversationId);
    if (conversation) {
      await conversation.archive();
    }
  }

  /**
   * Unarchive a conversation
   */
  async unarchiveConversation(conversationId: string): Promise<void> {
    const conversation = await TeamConversation.findByPk(conversationId);
    if (conversation) {
      await conversation.unarchive();
    }
  }

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const conversation = await TeamConversation.findByPk(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Delete all messages first (cascade should handle this, but be explicit)
    await TeamMessage.destroy({ where: { conversationId } });

    // Delete the conversation
    await conversation.destroy();
  }

  /**
   * Add participants to a conversation
   */
  async addParticipants(conversationId: string, userIds: string[]): Promise<TeamConversation> {
    const conversation = await TeamConversation.findByPk(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Get current participants and merge with new ones
    const currentParticipants = conversation.participantIds || [];
    const uniqueParticipants = [...new Set([...currentParticipants, ...userIds])];

    await conversation.update({ participantIds: uniqueParticipants });

    return conversation;
  }

  /**
   * Get participants of a conversation
   */
  async getParticipants(conversationId: string): Promise<any[]> {
    const conversation = await TeamConversation.findByPk(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const participantIds = conversation.participantIds || [];
    if (participantIds.length === 0) {
      return [];
    }

    const participants = await MarketplaceUser.findAll({
      where: { id: participantIds },
      attributes: ['id', 'name', 'email', 'role', 'phone', 'company'],
    });

    return participants;
  }

  // ============================================================================
  // MESSAGE METHODS
  // ============================================================================

  /**
   * Send a message to a conversation
   */
  async sendMessage(options: SendMessageOptions): Promise<TeamMessage> {
    const {
      conversationId,
      senderId,
      senderType,
      senderName,
      senderPhone,
      senderEmail,
      source,
      content,
      contentHtml,
      attachments,
      replyToMessageId,
      externalMessageId,
      metadata,
    } = options;

    // Get conversation
    const conversation = await TeamConversation.findByPk(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Parse @mentions from content
    const mentionUsernames = TeamMessage.parseMentions(content);
    const mentionUserIds = await this.resolveMentions(mentionUsernames);

    // Create message
    const message = await TeamMessage.create({
      conversationId,
      senderId: senderId || null,
      senderType,
      senderName,
      senderPhone: senderPhone || null,
      senderEmail: senderEmail || null,
      source,
      content,
      contentHtml: contentHtml || null,
      attachments: attachments || [],
      mentions: mentionUserIds,
      replyToMessageId: replyToMessageId || null,
      externalMessageId: externalMessageId || null,
      metadata: metadata || null,
      // Start as 'sent' - will be updated to 'delivered' when recipients confirm via realtime
      deliveryStatus: 'sent',
    });

    // Update conversation
    if (senderId) {
      await conversation.addParticipant(senderId);
    }
    await conversation.updateLastMessage(content, senderName, source);
    await conversation.incrementUnreadForAll(senderId || '');

    // Notify mentioned users
    if (mentionUserIds.length > 0) {
      await this.notifyMentionedUsers(message, mentionUserIds, conversation);
    }

    // Broadcast via Supabase Realtime (primary method)
    await supabaseRealtimeService.broadcastTeamMessage({
      id: message.id,
      conversationId,
      senderId: message.senderId || '',
      senderName: message.senderName,
      senderType: message.senderType,
      source: message.source,
      content: message.content,
      mentions: mentionUserIds,
      attachments: message.attachments,
      createdAt: message.createdAt,
    });

    // Also send via custom WebSocket (fallback for clients not using Supabase)
    const participantIds = conversation.participantIds || [];
    notificationService.notifyTeamMessage(
      conversationId,
      {
        id: message.id,
        senderId: message.senderId || '',
        senderName: message.senderName,
        senderType: message.senderType,
        source: message.source,
        content: message.content,
        mentions: mentionUserIds,
        attachments: message.attachments,
        createdAt: message.createdAt,
      },
      participantIds
    );

    // Send push notifications to offline participants
    if (pushNotificationService.isReady()) {
      // Find participants who are not currently connected via WebSocket
      const connectedUserIds = notificationService.getConnectedUsers?.() || [];
      const offlineParticipants = participantIds.filter(
        (id) => id !== senderId && !connectedUserIds.includes(id)
      );

      // Send push to each offline participant (fire-and-forget)
      for (const userId of offlineParticipants) {
        const isMention = mentionUserIds.includes(userId);
        pushNotificationService
          .sendTeamChatNotification(userId, {
            conversationId,
            messageId: message.id,
            senderName: senderName,
            content: message.content,
            isMention,
          })
          .catch((err) => {
            console.debug(`Push notification failed for user ${userId}:`, err.message);
          });
      }
    }

    // Emit internal event for other handlers
    this.emitEvent('team_message', {
      type: 'team_message',
      conversationId,
      message: {
        ...message.toJSON(),
        sender: senderId ? await MarketplaceUser.findByPk(senderId) : null,
      },
    });

    return message;
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(
    conversationId: string,
    filters: MessageFilters = {}
  ): Promise<TeamMessage[]> {
    const messages = await TeamMessage.getForConversation(conversationId, {
      limit: filters.limit,
      offset: filters.offset,
      before: filters.before,
      after: filters.after,
    });

    // Load sender info for each message
    const messagesWithSenders = await Promise.all(
      messages.map(async (msg) => {
        const msgJson = msg.toJSON() as any;
        if (msg.senderId) {
          const sender = await MarketplaceUser.findByPk(msg.senderId);
          msgJson.sender = sender;
          msgJson.senderAvatar = sender?.avatar || null;
        }
        return msgJson;
      })
    );

    return messagesWithSenders as any;
  }

  /**
   * Mark messages as read
   */
  async markAsRead(userId: string, conversationId: string): Promise<void> {
    const conversation = await TeamConversation.findByPk(conversationId);
    if (!conversation) return;

    // Clear unread count for user
    await conversation.clearUnread(userId);

    // Mark individual messages as read
    const unreadMessages = await TeamMessage.findAll({
      where: {
        conversationId,
        senderId: { [Op.ne]: userId },
      },
    });

    for (const msg of unreadMessages) {
      if (!msg.wasReadBy(userId)) {
        await msg.markReadBy(userId);
      }
    }

    // Broadcast via Supabase Realtime
    await supabaseRealtimeService.broadcastMessageRead(conversationId, {
      userId,
      conversationId,
    });

    const totalUnread = await TeamConversation.getTotalUnreadCount(userId);
    await supabaseRealtimeService.broadcastUnreadCount({
      userId,
      conversationId,
      count: 0,
      totalCount: totalUnread,
    });

    // Also send via custom WebSocket (fallback)
    const participantIds = conversation.participantIds || [];
    notificationService.notifyMessageRead(conversationId, userId, participantIds);
    notificationService.notifyUnreadCount(userId, conversationId, 0, totalUnread);

    // Emit internal events
    this.emitEvent('message_read', {
      type: 'message_read',
      conversationId,
      userId,
    });
  }

  /**
   * Get total unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return TeamConversation.getTotalUnreadCount(userId);
  }

  /**
   * Edit a message
   */
  async editMessage(messageId: string, newContent: string, userId: string): Promise<TeamMessage | null> {
    const message = await TeamMessage.findByPk(messageId);
    if (!message) return null;

    // Only sender can edit
    if (message.senderId !== userId) {
      throw new Error('Only the sender can edit this message');
    }

    // Only platform messages can be edited
    if (message.source !== 'platform') {
      throw new Error('Only platform messages can be edited');
    }

    await message.editContent(newContent);
    return message;
  }

  /**
   * Delete a message (soft delete - mark as deleted)
   */
  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    const message = await TeamMessage.findByPk(messageId);
    if (!message) return false;

    // Only sender or admin can delete
    if (message.senderId !== userId) {
      const user = await MarketplaceUser.findByPk(userId);
      if (!user || !['admin', 'super_admin'].includes(user.role)) {
        throw new Error('Not authorized to delete this message');
      }
    }

    await message.destroy();
    return true;
  }

  // ============================================================================
  // INBOUND MESSAGE ROUTING
  // ============================================================================

  /**
   * Route inbound SMS to a conversation
   */
  async routeInboundSMS(data: InboundSMSData): Promise<TeamMessage> {
    const { from, body, twilioSid, mediaUrls } = data;

    // Try to find existing user by phone
    const existingUser = await MarketplaceUser.findOne({
      where: { phone: from },
    });

    // Try to find or create guest session
    const [guestSession] = await GuestSession.findOrCreateByPhone(from);

    // Try to extract property address from message
    const property = await this.matchPropertyFromText(body);

    let conversation: TeamConversation;
    if (property) {
      // Route to property conversation
      conversation = await this.getOrCreateForProperty(property.id);

      // Grant guest access to this property
      if (!guestSession.hasPropertyAccess(property.id)) {
        await guestSession.grantPropertyAccess(property.id);
      }
    } else {
      // Route to general/unassigned conversation
      conversation = await this.getOrCreateGeneralConversation(from);
    }

    // Determine sender info
    const senderType: SenderType = existingUser
      ? existingUser.role === 'buyer'
        ? 'buyer'
        : 'team'
      : 'guest';
    const senderName = existingUser?.name || guestSession.name || from;

    // Create attachments from media
    const attachments = mediaUrls?.map((url, index) => ({
      filename: `media_${index + 1}`,
      contentType: 'image/jpeg',
      size: 0,
      url,
    })) || [];

    // Send message
    return this.sendMessage({
      conversationId: conversation.id,
      senderId: existingUser?.id,
      senderType,
      senderName,
      senderPhone: from,
      source: 'sms',
      content: body,
      attachments,
      externalMessageId: twilioSid,
      metadata: { twilioData: data },
    });
  }

  /**
   * Route inbound email to a conversation
   */
  async routeInboundEmail(options: {
    from: string;
    fromName?: string;
    subject: string;
    body: string;
    bodyHtml?: string;
    emailMessageId: string;
    attachments?: Array<{ filename: string; contentType: string; size: number; url?: string }>;
  }): Promise<TeamMessage> {
    const { from, fromName, subject, body, bodyHtml, emailMessageId, attachments } = options;

    // Try to find existing user by email
    const existingUser = await MarketplaceUser.findOne({
      where: { email: from },
    });

    // Try to extract property from subject or body
    const property = await this.matchPropertyFromText(`${subject} ${body}`);

    let conversation: TeamConversation;
    if (property) {
      conversation = await this.getOrCreateForProperty(property.id);
    } else {
      conversation = await this.getOrCreateGeneralConversation(from);
    }

    // Determine sender info
    const senderType: SenderType = existingUser
      ? existingUser.role === 'buyer'
        ? 'buyer'
        : 'team'
      : 'guest';
    const senderName = fromName || existingUser?.name || from;

    return this.sendMessage({
      conversationId: conversation.id,
      senderId: existingUser?.id,
      senderType,
      senderName,
      senderEmail: from,
      source: 'email',
      content: body,
      contentHtml: bodyHtml,
      attachments: attachments || [],
      externalMessageId: emailMessageId,
      metadata: { subject },
    });
  }

  // ============================================================================
  // TYPING INDICATORS
  // ============================================================================

  /**
   * Emit typing start event
   */
  emitTypingStart(conversationId: string, userId: string, userName: string): void {
    this.emitEvent('typing_start', {
      type: 'typing_start',
      conversationId,
      userId,
      userName,
    });
  }

  /**
   * Emit typing stop event
   */
  emitTypingStop(conversationId: string, userId: string): void {
    this.emitEvent('typing_stop', {
      type: 'typing_stop',
      conversationId,
      userId,
    });
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Format property address for display
   */
  private formatPropertyAddress(property: Property): string {
    const parts = [];

    // Check if address is a string (most common case)
    if (typeof property.address === 'string' && property.address) {
      parts.push(property.address);
    } else {
      // Try to build from address object parts
      const addr = property.address as any;
      if (addr?.houseNumber) parts.push(addr.houseNumber);
      if (addr?.street) parts.push(addr.street);
    }

    // Add city, state, zip if not already in address string
    if (property.city && !parts.join(' ').includes(property.city)) {
      parts.push(property.city);
    }
    if (property.state && !parts.join(' ').includes(property.state)) {
      parts.push(property.state);
    }
    if (property.zip && !parts.join(' ').includes(property.zip)) {
      parts.push(property.zip);
    }

    return parts.join(', ') || (property.id ? `Property #${property.id}` : 'Property');
  }

  /**
   * Try to match a property from message text
   */
  private async matchPropertyFromText(text: string): Promise<Property | null> {
    // Simple address pattern matching
    // Look for patterns like "123 Main St" or "123 Main Street, City, ST 12345"
    const addressPatterns = [
      // Full address with zip
      /(\d+\s+[\w\s]+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard|way|pl|place)[\w\s,]*,?\s*[\w\s]+,?\s*[A-Z]{2}\s*\d{5})/gi,
      // Street address with city/state
      /(\d+\s+[\w\s]+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard|way|pl|place)[\w\s,]*,?\s*[\w\s]+,?\s*[A-Z]{2})/gi,
      // Just street address
      /(\d+\s+[\w\s]+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard|way|pl|place))/gi,
    ];

    for (const pattern of addressPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const addressQuery = matches[0].trim();

        // Try to find matching property by address field (not city)
        const properties = await Property.findAll({
          where: {
            [Op.or]: [
              // Search in address field (string or JSON)
              sequelize.where(
                sequelize.cast(sequelize.col('address'), 'TEXT'),
                { [Op.iLike]: `%${addressQuery}%` }
              ),
              // Also search propertyAddress if it exists
              { propertyAddress: { [Op.iLike]: `%${addressQuery}%` } },
            ],
          },
          limit: 5,
        });

        if (properties.length > 0) {
          return properties[0];
        }

        // Try fuzzy match on property address
        const allProperties = await Property.findAll({
          limit: 100,
          order: [['createdAt', 'DESC']],
        });

        for (const property of allProperties) {
          const propAddress = this.formatPropertyAddress(property).toLowerCase();
          if (propAddress.includes(addressQuery.toLowerCase()) ||
              addressQuery.toLowerCase().includes(propAddress)) {
            return property;
          }
        }
      }
    }

    return null;
  }

  /**
   * Get or create general conversation for external contacts
   */
  private async getOrCreateGeneralConversation(identifier: string): Promise<TeamConversation> {
    // Look for existing conversation for this contact
    const existing = await TeamConversation.findOne({
      where: {
        propertyId: null,
        title: { [Op.iLike]: `%${identifier}%` },
      },
    });

    if (existing) return existing;

    // Create new general conversation
    return this.createConversation({
      title: `Conversation with ${identifier}`,
    });
  }

  /**
   * Resolve @mentions to user IDs
   */
  private async resolveMentions(usernames: string[]): Promise<string[]> {
    if (usernames.length === 0) return [];

    const users = await MarketplaceUser.findAll({
      where: {
        [Op.or]: usernames.map((username) => ({
          [Op.or]: [
            { name: { [Op.iLike]: username } },
            { email: { [Op.iLike]: `${username}@%` } },
          ],
        })),
      },
    });

    return users.map((u) => u.id);
  }

  /**
   * Notify mentioned users
   */
  private async notifyMentionedUsers(
    message: TeamMessage,
    userIds: string[],
    conversation: TeamConversation
  ): Promise<void> {
    for (const userId of userIds) {
      try {
        // Use notification service to send mention notification
        if (notificationService) {
          notificationService.emit('notification', {
            type: 'team_mention',
            userId,
            title: 'You were mentioned',
            message: `${message.senderName} mentioned you in ${conversation.getDisplayTitle()}`,
            data: {
              conversationId: conversation.id,
              messageId: message.id,
              propertyId: conversation.propertyId,
            },
            priority: 'normal',
          });
        }
      } catch (error) {
        console.error(`Failed to notify user ${userId}:`, error);
      }
    }
  }

  /**
   * Emit event to WebSocket clients
   */
  private emitEvent(eventName: string, data: TeamChatWebSocketEvent): void {
    this.emit(eventName, data);

    // Also emit to notification service for WebSocket broadcast
    if (notificationService) {
      notificationService.emit('team_chat', data);
    }
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get message statistics
   */
  async getStats(conversationId?: string): Promise<{
    totalConversations: number;
    totalMessages: number;
    messagesBySource: Record<MessageSource, number>;
  }> {
    const totalConversations = await TeamConversation.count({
      where: conversationId ? { id: conversationId } : {},
    });

    const totalMessages = await TeamMessage.count({
      where: conversationId ? { conversationId } : {},
    });

    const messagesBySource = await TeamMessage.countBySource(conversationId);

    return {
      totalConversations,
      totalMessages,
      messagesBySource,
    };
  }
}

// Export singleton instance
export const teamCommunicationService = new TeamCommunicationService();
export default teamCommunicationService;
