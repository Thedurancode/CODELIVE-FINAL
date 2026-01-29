/**
 * Team Chat Controller
 *
 * Handles API requests for the unified team communication system.
 * Supports platform messages, SMS, and email integration.
 */

import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { teamCommunicationService } from '../services/TeamCommunicationService';
import TeamMessage, { SenderType, MessageSource } from '../models/TeamMessage';
import MarketplaceUser from '../models/MarketplaceUser';
import { supabaseRealtimeService } from '../services/SupabaseRealtimeService';
import { notificationService } from '../services/NotificationService';

export const teamChatController = {
  // ============================================================================
  // CONVERSATION ENDPOINTS
  // ============================================================================

  /**
   * Get all conversations for the current user
   *
   * VISIBILITY MODEL (Hybrid Approach):
   * - Management (admin, super_admin, broker): See ALL conversations for oversight
   * - Regular team members: Only see conversations they're participants in
   * - Buyers: Only see their own conversations
   * - Auto-participation: When creating a conversation, creator is automatically added as participant
   */
  async getConversations(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const { includeArchived, limit, offset } = req.query;

      let conversations;

      // Management roles see ALL conversations for oversight
      const managementRoles = ['admin', 'super_admin', 'broker'];

      // Regular team roles only see conversations they're participants in
      const regularTeamRoles = [
        'broker_assistant',
        'transaction_coordinator',
        'agent',
        'wholesaler',
        'investor',
        'team_member',
      ];

      if (managementRoles.includes(userRole)) {
        // Admins, super_admins, and brokers see ALL conversations
        conversations = await teamCommunicationService.getAllConversations({
          includeArchived: includeArchived === 'true',
          limit: limit ? parseInt(limit as string) : 50,
          offset: offset ? parseInt(offset as string) : 0,
        });
      } else if (regularTeamRoles.includes(userRole) || (userRole as string) === 'buyer') {
        // Regular team members and buyers see only their conversations
        conversations = await teamCommunicationService.getConversationsForUser(userId, {
          includeArchived: includeArchived === 'true',
          limit: limit ? parseInt(limit as string) : 50,
          offset: offset ? parseInt(offset as string) : 0,
        });
      } else {
        // Unknown role - default to user-specific conversations for safety
        conversations = await teamCommunicationService.getConversationsForUser(userId, {
          includeArchived: includeArchived === 'true',
          limit: limit ? parseInt(limit as string) : 50,
          offset: offset ? parseInt(offset as string) : 0,
        });
      }

      // Add unread count, property image and preview for each conversation
      const conversationsWithUnread = conversations.map((conv) => {
        const convJson = conv.toJSON() as any;
        const property = convJson.property;

        // Build property preview for hover card
        const propertyPreview = property ? {
          id: property.id,
          address: property.address?.houseNumber && property.address?.street
            ? `${property.address.houseNumber} ${property.address.street}`
            : property.propertyAddress,
          city: property.city,
          state: property.state,
          zip: property.zip,
          propertyType: property.propertyType,
          askingPrice: property.askingPrice || property.purchaseContractPrice,
          arv: property.arv,
          bedroomCount: property.bedroomCount,
          bathroomCount: property.bathroomCount,
          livingSpaceSqFt: property.livingSpaceSqFt,
          yearBuilt: property.yearBuilt,
          status: property.status,
          photoLinks: property.photoLinks || [],
        } : null;

        return {
          ...convJson,
          unreadCount: conv.getUnreadCount(userId),
          propertyImage: property?.photoLinks?.[0] || null,
          propertyPreview,
        };
      });

      res.json({
        success: true,
        data: conversationsWithUnread,
        count: conversations.length,
      });
    } catch (error) {
      console.error('Error getting conversations:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Create a new conversation
   */
  async createConversation(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { propertyId, title } = req.body;

      const conversation = await teamCommunicationService.createConversation({
        propertyId: propertyId ? parseInt(propertyId) : undefined,
        title,
        creatorId: userId,
      });

      res.status(201).json({
        success: true,
        data: conversation,
        message: 'Conversation created successfully',
      });
    } catch (error) {
      console.error('Error creating conversation:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get a specific conversation
   */
  async getConversation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const conversation = await teamCommunicationService.getConversation(id);

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      // Authorization check: management roles can see all, others must be participants
      const managementRoles = ['admin', 'super_admin', 'broker'];
      const isManagement = managementRoles.includes(userRole);
      const isParticipant = conversation.participantIds?.includes(userId);

      if (!isManagement && !isParticipant) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to access this conversation',
        });
      }

      res.json({
        success: true,
        data: {
          ...conversation.toJSON(),
          unreadCount: conversation.getUnreadCount(userId),
        },
      });
    } catch (error) {
      console.error('Error getting conversation:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get conversation by property ID
   * Auto-adds current user as participant if not already included
   */
  async getConversationByProperty(req: Request, res: Response) {
    try {
      const { propertyId } = req.params;
      const userId = req.user!.id;

      const conversation = await teamCommunicationService.getOrCreateForProperty(
        parseInt(propertyId)
      );

      // Auto-add current user as participant if not already included
      // (All users including admins should be participants to track unread counts)
      if (!conversation.participantIds.includes(userId)) {
        await conversation.update({
          participantIds: [...conversation.participantIds, userId],
        });
      }

      res.json({
        success: true,
        data: {
          ...conversation.toJSON(),
          unreadCount: conversation.getUnreadCount(userId),
        },
      });
    } catch (error) {
      console.error('Error getting conversation by property:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Archive a conversation
   */
  async archiveConversation(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await teamCommunicationService.archiveConversation(id);

      res.json({
        success: true,
        message: 'Conversation archived successfully',
      });
    } catch (error) {
      console.error('Error archiving conversation:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Unarchive a conversation
   */
  async unarchiveConversation(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await teamCommunicationService.unarchiveConversation(id);

      res.json({
        success: true,
        message: 'Conversation unarchived successfully',
      });
    } catch (error) {
      console.error('Error unarchiving conversation:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Delete a conversation (admin only)
   */
  async deleteConversation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userRole = req.user!.role;

      // Only admins can delete conversations
      if (!['admin', 'super_admin'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          error: 'Only admins can delete conversations',
        });
      }

      await teamCommunicationService.deleteConversation(id);

      res.json({
        success: true,
        message: 'Conversation deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Add participants to a conversation
   */
  async addParticipants(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { userIds } = req.body;
      const currentUserId = req.user!.id;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'userIds array is required',
        });
      }

      const conversation = await teamCommunicationService.addParticipants(id, userIds);

      // Send a system message about new participants
      const addedUsers = await MarketplaceUser.findAll({
        where: { id: userIds },
        attributes: ['name'],
      });
      const names = addedUsers.map((u: any) => u.name).join(', ');

      await teamCommunicationService.sendMessage({
        conversationId: id,
        senderId: currentUserId,
        senderType: 'system',
        senderName: 'System',
        source: 'platform',
        content: `Added ${names} to the conversation`,
      });

      res.json({
        success: true,
        data: conversation,
        message: `Added ${userIds.length} participant(s) to the conversation`,
      });
    } catch (error) {
      console.error('Error adding participants:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get conversation participants
   */
  async getParticipants(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const participants = await teamCommunicationService.getParticipants(id);

      res.json({
        success: true,
        data: participants,
      });
    } catch (error) {
      console.error('Error getting participants:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Search conversations
   */
  async searchConversations(req: Request, res: Response) {
    try {
      const { q, limit } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Search query (q) is required',
        });
      }

      const conversations = await teamCommunicationService.searchConversations(
        q,
        limit ? parseInt(limit as string) : 10
      );

      res.json({
        success: true,
        data: conversations,
        count: conversations.length,
      });
    } catch (error) {
      console.error('Error searching conversations:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // MESSAGE ENDPOINTS
  // ============================================================================

  /**
   * Get messages for a conversation
   */
  async getMessages(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const { limit, offset, before, after } = req.query;

      // Authorization check: verify user can access this conversation
      const conversation = await teamCommunicationService.getConversation(id);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      const managementRoles = ['admin', 'super_admin', 'broker'];
      const isManagement = managementRoles.includes(userRole);
      const isParticipant = conversation.participantIds?.includes(userId);

      if (!isManagement && !isParticipant) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to access this conversation',
        });
      }

      const messages = await teamCommunicationService.getMessages(id, {
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
        before: before ? new Date(before as string) : undefined,
        after: after ? new Date(after as string) : undefined,
      });

      res.json({
        success: true,
        data: messages,
        count: messages.length,
      });
    } catch (error) {
      console.error('Error getting messages:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Send a message to a conversation
   */
  async sendMessage(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const userName = req.user!.name;
      const userRole = req.user!.role;
      const { id } = req.params;
      const { content, replyToMessageId, attachments } = req.body;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Message content is required',
        });
      }

      if (content.length > 10000) {
        return res.status(400).json({
          success: false,
          error: 'Message too long. Maximum 10,000 characters.',
        });
      }

      // Auto-add sender as participant if not already included
      // (All users including admins need to be participants to track unread counts)
      const conversation = await teamCommunicationService.getConversation(id);
      if (conversation && !conversation.participantIds.includes(userId)) {
        await conversation.update({
          participantIds: [...conversation.participantIds, userId],
        });
      }

      // Determine sender type based on role
      let senderType: SenderType = 'team';
      if ((userRole as string) === 'buyer') {
        senderType = 'buyer';
      }

      const message = await teamCommunicationService.sendMessage({
        conversationId: id,
        senderId: userId,
        senderType,
        senderName: userName,
        source: 'platform',
        content: content.trim(),
        attachments: attachments || [],
        replyToMessageId,
      });

      res.status(201).json({
        success: true,
        data: message,
        message: 'Message sent successfully',
      });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Mark messages as read
   */
  async markAsRead(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      await teamCommunicationService.markAsRead(userId, id);

      res.json({
        success: true,
        message: 'Messages marked as read',
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Confirm message delivery
   *
   * Called by recipients when they receive a message via realtime.
   * Updates the message's deliveredTo array and deliveryStatus.
   */
  async confirmDelivery(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { id: conversationId, messageId } = req.params;

      // Find the message
      const message = await TeamMessage.findOne({
        where: {
          id: messageId,
          conversationId,
        },
      });

      if (!message) {
        return res.status(404).json({
          success: false,
          error: 'Message not found',
        });
      }

      // Mark as delivered (method handles duplicates and status update)
      const wasNewDelivery = await message.markDeliveredTo(userId);

      // Get user info for broadcast
      if (wasNewDelivery) {
        const user = await MarketplaceUser.findByPk(userId);
        const userName = user?.name || user?.email || 'Unknown';

        // Broadcast delivery confirmation to the sender via Supabase
        await supabaseRealtimeService.broadcastToChannel(
          `conversation:${conversationId}`,
          'message_delivered',
          {
            messageId,
            conversationId,
            userId,
            userName,
            deliveredAt: new Date().toISOString(),
            deliveryStatus: message.deliveryStatus,
            deliveryCount: message.getDeliveryCount(),
          }
        );
      }

      res.json({
        success: true,
        delivered: wasNewDelivery,
        deliveryStatus: message.deliveryStatus,
        deliveryCount: message.getDeliveryCount(),
      });
    } catch (error) {
      console.error('Error confirming delivery:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Edit a message
   */
  async editMessage(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { id, messageId } = req.params;
      const { content } = req.body;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Message content is required',
        });
      }

      const message = await teamCommunicationService.editMessage(
        messageId,
        content.trim(),
        userId
      );

      if (!message) {
        return res.status(404).json({
          success: false,
          error: 'Message not found',
        });
      }

      res.json({
        success: true,
        data: message,
        message: 'Message edited successfully',
      });
    } catch (error) {
      console.error('Error editing message:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Delete a message
   */
  async deleteMessage(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { id, messageId } = req.params;

      const deleted = await teamCommunicationService.deleteMessage(messageId, userId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Message not found',
        });
      }

      res.json({
        success: true,
        message: 'Message deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting message:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // TYPING INDICATORS
  // ============================================================================

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const userName = req.user!.name;
      const { id } = req.params;
      const { typing } = req.body;

      if (typing) {
        teamCommunicationService.emitTypingStart(id, userId, userName);
      } else {
        teamCommunicationService.emitTypingStop(id, userId);
      }

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('Error sending typing indicator:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // UNREAD COUNT
  // ============================================================================

  /**
   * Get total unread count for current user
   */
  async getUnreadCount(req: Request, res: Response) {
    try {
      const userId = req.user!.id;

      const count = await teamCommunicationService.getUnreadCount(userId);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get team chat statistics
   */
  async getStats(req: Request, res: Response) {
    try {
      const { conversationId } = req.query;

      const stats = await teamCommunicationService.getStats(
        conversationId as string | undefined
      );

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Error getting team chat stats:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // TEAM MEMBERS
  // ============================================================================

  /**
   * Get team members for @mentions
   */
  async getTeamMembers(req: Request, res: Response) {
    try {
      const { search } = req.query;

      const where: any = {
        // Only get team roles (not external buyers/guests)
        role: {
          [Op.in]: [
            'admin',
            'super_admin',
            'broker',
            'broker_assistant',
            'transaction_coordinator',
            'agent',
            'wholesaler',
            'investor',
            'team_member',
          ],
        },
      };

      // Add search filter if provided
      if (search && typeof search === 'string' && search.length >= 1) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const members = await MarketplaceUser.findAll({
        where,
        attributes: ['id', 'name', 'email', 'role', 'company', 'phone'],
        order: [['name', 'ASC']],
        limit: 50,
      });

      res.json({
        success: true,
        data: members,
      });
    } catch (error) {
      console.error('Error getting team members:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Update a user's role (admin only)
   */
  async updateUserRole(req: Request, res: Response) {
    try {
      const currentUserRole = req.user!.role;
      const { userId } = req.params;
      const { role } = req.body;

      // Only admins can change roles
      if (!['admin', 'super_admin'].includes(currentUserRole)) {
        return res.status(403).json({
          success: false,
          error: 'Only admins can update user roles',
        });
      }

      // Validate the role
      const validRoles = [
        'buyer',
        'investor',
        'wholesaler',
        'agent',
        'broker',
        'broker_assistant',
        'transaction_coordinator',
        'team_member',
        'admin',
      ];

      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
        });
      }

      // Cannot set super_admin role (must be done in database)
      if (role === 'super_admin') {
        return res.status(403).json({
          success: false,
          error: 'Cannot assign super_admin role via API',
        });
      }

      // Find and update the user
      const user = await MarketplaceUser.findByPk(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Cannot change a super_admin's role (legacy role type check)
      if ((user.role as string) === 'super_admin') {
        return res.status(403).json({
          success: false,
          error: 'Cannot change role of a super_admin',
        });
      }

      await user.update({ role });

      res.json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        message: `User role updated to ${role}`,
      });
    } catch (error) {
      console.error('Error updating user role:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // ONLINE STATUS
  // ============================================================================

  /**
   * Get currently online users
   */
  async getOnlineUsers(req: Request, res: Response) {
    try {
      const onlineUsers = await notificationService.getOnlineUsers();

      res.json({
        success: true,
        data: onlineUsers,
        count: onlineUsers.length,
      });
    } catch (error) {
      console.error('Error getting online users:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },
};

export default teamChatController;
