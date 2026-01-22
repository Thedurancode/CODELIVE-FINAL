/**
 * Team Message Model
 *
 * Represents an individual message within a team conversation.
 * Supports messages from platform chat, SMS (Twilio), and email.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

export type SenderType = 'team' | 'buyer' | 'guest' | 'system';
export type MessageSource = 'platform' | 'sms' | 'email';
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed';

interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  url?: string;
}

interface ReadReceipt {
  userId: string;
  readAt: Date;
}

interface DeliveryReceipt {
  userId: string;
  deliveredAt: Date;
}

interface TeamMessageAttributes {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderType: SenderType;
  senderName: string;
  senderPhone: string | null;
  senderEmail: string | null;
  source: MessageSource;
  content: string;
  contentHtml: string | null;
  attachments: Attachment[];
  mentions: string[];
  isEdited: boolean;
  editedAt: Date | null;
  readBy: ReadReceipt[];
  deliveredTo: DeliveryReceipt[];
  deliveryStatus: DeliveryStatus;
  externalMessageId: string | null;
  replyToMessageId: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TeamMessageCreationAttributes
  extends Optional<
    TeamMessageAttributes,
    | 'id'
    | 'senderId'
    | 'senderPhone'
    | 'senderEmail'
    | 'contentHtml'
    | 'attachments'
    | 'mentions'
    | 'isEdited'
    | 'editedAt'
    | 'readBy'
    | 'deliveredTo'
    | 'deliveryStatus'
    | 'externalMessageId'
    | 'replyToMessageId'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class TeamMessage
  extends Model<TeamMessageAttributes, TeamMessageCreationAttributes>
  implements TeamMessageAttributes
{
  declare id: string;
  declare conversationId: string;
  declare senderId: string | null;
  declare senderType: SenderType;
  declare senderName: string;
  declare senderPhone: string | null;
  declare senderEmail: string | null;
  declare source: MessageSource;
  declare content: string;
  declare contentHtml: string | null;
  declare attachments: Attachment[];
  declare mentions: string[];
  declare isEdited: boolean;
  declare editedAt: Date | null;
  declare readBy: ReadReceipt[];
  declare deliveredTo: DeliveryReceipt[];
  declare deliveryStatus: DeliveryStatus;
  declare externalMessageId: string | null;
  declare replyToMessageId: string | null;
  declare metadata: Record<string, any> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Mark message as read by a user
   */
  async markReadBy(userId: string): Promise<void> {
    const existingReceipt = this.readBy.find((r) => r.userId === userId);
    if (!existingReceipt) {
      this.readBy = [...this.readBy, { userId, readAt: new Date() }];
      await this.save();
    }
  }

  /**
   * Check if message was read by a user
   */
  wasReadBy(userId: string): boolean {
    return this.readBy.some((r) => r.userId === userId);
  }

  /**
   * Mark message as delivered to a user
   * Also updates deliveryStatus to 'delivered' if this is the first delivery confirmation
   */
  async markDeliveredTo(userId: string): Promise<boolean> {
    // Don't mark delivery from sender
    if (userId === this.senderId) return false;

    const existingReceipt = this.deliveredTo.find((r) => r.userId === userId);
    if (!existingReceipt) {
      this.deliveredTo = [...this.deliveredTo, { userId, deliveredAt: new Date() }];

      // Update status to delivered on first delivery confirmation
      if (this.deliveryStatus === 'sent') {
        this.deliveryStatus = 'delivered';
      }

      await this.save();
      return true;
    }
    return false;
  }

  /**
   * Check if message was delivered to a user
   */
  wasDeliveredTo(userId: string): boolean {
    return this.deliveredTo.some((r) => r.userId === userId);
  }

  /**
   * Get the number of delivery confirmations
   */
  getDeliveryCount(): number {
    return this.deliveredTo.length;
  }

  /**
   * Edit message content
   */
  async editContent(newContent: string): Promise<void> {
    this.content = newContent;
    this.isEdited = true;
    this.editedAt = new Date();
    await this.save();
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(status: DeliveryStatus): Promise<void> {
    this.deliveryStatus = status;
    await this.save();
  }

  /**
   * Parse @mentions from content
   */
  static parseMentions(content: string): string[] {
    // Match @username patterns
    const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
    const matches = content.match(mentionRegex);
    return matches ? matches.map((m) => m.substring(1)) : [];
  }

  /**
   * Get messages for a conversation with pagination
   *
   * Initial load (no before/after): Returns most recent messages in ASC order for display
   * With 'before': Returns older messages (for infinite scroll up)
   * With 'after': Returns newer messages (for catching up)
   */
  static async getForConversation(
    conversationId: string,
    options: {
      limit?: number;
      offset?: number;
      before?: Date;
      after?: Date;
    } = {}
  ): Promise<TeamMessage[]> {
    const where: any = { conversationId };
    const limit = options.limit || 50;

    if (options.before) {
      // Loading older messages (scrolling up) - get messages before timestamp
      where.createdAt = { ...where.createdAt, [Op.lt]: options.before };

      // Get oldest messages before the cursor, then reverse for display
      const messages = await TeamMessage.findAll({
        where,
        order: [['createdAt', 'DESC']], // Get most recent of the "older" messages
        limit,
        offset: options.offset || 0,
      });

      // Reverse to maintain ASC order for display (oldest first)
      return messages.reverse();
    }

    if (options.after) {
      // Loading newer messages - get messages after timestamp
      where.createdAt = { ...where.createdAt, [Op.gt]: options.after };

      return TeamMessage.findAll({
        where,
        order: [['createdAt', 'ASC']], // Oldest first for display
        limit,
        offset: options.offset || 0,
      });
    }

    // Initial load - get the MOST RECENT messages, then reverse for ASC display
    const messages = await TeamMessage.findAll({
      where,
      order: [['createdAt', 'DESC']], // Get most recent first
      limit,
      offset: options.offset || 0,
    });

    // Reverse so oldest is first (for proper chat display order)
    return messages.reverse();
  }

  /**
   * Get messages by source type
   */
  static async getBySource(
    conversationId: string,
    source: MessageSource,
    limit: number = 50
  ): Promise<TeamMessage[]> {
    return TeamMessage.findAll({
      where: { conversationId, source },
      order: [['createdAt', 'DESC']],
      limit,
    });
  }

  /**
   * Get messages mentioning a user
   */
  static async getMentioning(userId: string, limit: number = 50): Promise<TeamMessage[]> {
    return TeamMessage.findAll({
      where: {
        mentions: { [Op.contains]: [userId] },
      },
      order: [['createdAt', 'DESC']],
      limit,
    });
  }

  /**
   * Search messages by content
   */
  static async searchContent(
    query: string,
    conversationId?: string,
    limit: number = 50
  ): Promise<TeamMessage[]> {
    const where: any = {
      content: { [Op.iLike]: `%${query}%` },
    };

    if (conversationId) {
      where.conversationId = conversationId;
    }

    return TeamMessage.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
    });
  }

  /**
   * Find message by external ID (Twilio SID or email ID)
   */
  static async findByExternalId(externalId: string): Promise<TeamMessage | null> {
    return TeamMessage.findOne({
      where: { externalMessageId: externalId },
    });
  }

  /**
   * Get unread messages for a user in a conversation
   */
  static async getUnreadForUser(
    conversationId: string,
    userId: string
  ): Promise<TeamMessage[]> {
    return TeamMessage.findAll({
      where: {
        conversationId,
        senderId: { [Op.ne]: userId },
        readBy: {
          [Op.not]: {
            [Op.contains]: [{ userId }],
          },
        },
      },
      order: [['createdAt', 'ASC']],
    });
  }

  /**
   * Count messages by source for analytics
   */
  static async countBySource(
    conversationId?: string
  ): Promise<Record<MessageSource, number>> {
    const where: any = {};
    if (conversationId) {
      where.conversationId = conversationId;
    }

    const results = await TeamMessage.findAll({
      where,
      attributes: [
        'source',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      group: ['source'],
      raw: true,
    }) as any[];

    const counts: Record<MessageSource, number> = {
      platform: 0,
      sms: 0,
      email: 0,
    };

    for (const row of results) {
      counts[row.source as MessageSource] = parseInt(row.count, 10);
    }

    return counts;
  }
}

TeamMessage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'team_conversations',
        key: 'id',
      },
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    senderType: {
      type: DataTypes.ENUM('team', 'buyer', 'guest', 'system'),
      allowNull: false,
      defaultValue: 'team',
    },
    senderName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    senderPhone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    senderEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    source: {
      type: DataTypes.ENUM('platform', 'sms', 'email'),
      allowNull: false,
      defaultValue: 'platform',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contentHtml: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attachments: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    mentions: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      defaultValue: [],
    },
    isEdited: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    readBy: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    deliveredTo: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of { userId, deliveredAt } tracking delivery confirmations',
    },
    deliveryStatus: {
      type: DataTypes.ENUM('pending', 'sent', 'delivered', 'failed'),
      defaultValue: 'pending',
    },
    externalMessageId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    replyToMessageId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'team_messages',
    timestamps: true,
    indexes: [
      { fields: ['conversationId', 'createdAt'] },
      { fields: ['senderId'] },
      { fields: ['source'] },
      { fields: ['senderPhone'] },
      { fields: ['senderEmail'] },
      { fields: ['externalMessageId'] },
      { fields: ['createdAt'] },
    ],
  }
);

export default TeamMessage;
