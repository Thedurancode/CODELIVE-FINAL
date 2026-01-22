/**
 * Team Conversation Model
 *
 * Represents a conversation thread about a specific property.
 * Aggregates messages from platform chat, SMS (Twilio), and email.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

type MessageSource = 'platform' | 'sms' | 'email';

interface TeamConversationAttributes {
  id: string;
  propertyId: number | null;
  propertyAddress: string | null;
  title: string | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  lastMessageSource: MessageSource | null;
  participantIds: string[];
  unreadCounts: Record<string, number>;
  isArchived: boolean;
  isPublic: boolean;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TeamConversationCreationAttributes
  extends Optional<
    TeamConversationAttributes,
    | 'id'
    | 'propertyId'
    | 'propertyAddress'
    | 'title'
    | 'lastMessageAt'
    | 'lastMessagePreview'
    | 'lastMessageSender'
    | 'lastMessageSource'
    | 'participantIds'
    | 'unreadCounts'
    | 'isArchived'
    | 'isPublic'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class TeamConversation
  extends Model<TeamConversationAttributes, TeamConversationCreationAttributes>
  implements TeamConversationAttributes
{
  declare id: string;
  declare propertyId: number | null;
  declare propertyAddress: string | null;
  declare title: string | null;
  declare lastMessageAt: Date | null;
  declare lastMessagePreview: string | null;
  declare lastMessageSender: string | null;
  declare lastMessageSource: MessageSource | null;
  declare participantIds: string[];
  declare unreadCounts: Record<string, number>;
  declare isArchived: boolean;
  declare isPublic: boolean;
  declare metadata: Record<string, any> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Get display title (uses property address if no custom title)
   */
  getDisplayTitle(): string {
    return this.title || this.propertyAddress || 'General Conversation';
  }

  /**
   * Add a participant to the conversation
   */
  async addParticipant(userId: string): Promise<void> {
    if (!this.participantIds.includes(userId)) {
      this.participantIds = [...this.participantIds, userId];
      await this.save();
    }
  }

  /**
   * Increment unread count for a user
   */
  async incrementUnread(userId: string): Promise<void> {
    const counts = { ...this.unreadCounts };
    counts[userId] = (counts[userId] || 0) + 1;
    this.unreadCounts = counts;
    await this.save();
  }

  /**
   * Increment unread for all participants except sender
   */
  async incrementUnreadForAll(exceptUserId: string): Promise<void> {
    const counts = { ...this.unreadCounts };
    for (const participantId of this.participantIds) {
      if (participantId !== exceptUserId) {
        counts[participantId] = (counts[participantId] || 0) + 1;
      }
    }
    this.unreadCounts = counts;
    await this.save();
  }

  /**
   * Clear unread count for a user
   */
  async clearUnread(userId: string): Promise<void> {
    const counts = { ...this.unreadCounts };
    counts[userId] = 0;
    this.unreadCounts = counts;
    await this.save();
  }

  /**
   * Get unread count for a user
   */
  getUnreadCount(userId: string): number {
    return this.unreadCounts[userId] || 0;
  }

  /**
   * Update last message info
   */
  async updateLastMessage(
    content: string,
    senderName: string,
    source: MessageSource = 'platform'
  ): Promise<void> {
    this.lastMessageAt = new Date();
    this.lastMessagePreview = content.substring(0, 200);
    this.lastMessageSender = senderName;
    this.lastMessageSource = source;
    await this.save();
  }

  /**
   * Archive the conversation
   */
  async archive(): Promise<void> {
    this.isArchived = true;
    await this.save();
  }

  /**
   * Unarchive the conversation
   */
  async unarchive(): Promise<void> {
    this.isArchived = false;
    await this.save();
  }

  /**
   * Find or create a conversation for a property
   * Uses transaction with row-level locking to prevent race conditions
   */
  static async findOrCreateForProperty(
    propertyId: number,
    propertyAddress: string
  ): Promise<[TeamConversation, boolean]> {
    // Use a transaction to ensure atomicity
    const result = await sequelize.transaction(async (transaction) => {
      // First, try to find existing conversation with lock
      let conversation = await TeamConversation.findOne({
        where: { propertyId, isPublic: false },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (conversation) {
        return { conversation, created: false };
      }

      // No existing conversation, create new one
      try {
        conversation = await TeamConversation.create(
          {
            propertyId,
            propertyAddress,
            title: propertyAddress,
            participantIds: [],
            unreadCounts: {},
            isPublic: false,
          },
          { transaction }
        );
        return { conversation, created: true };
      } catch (error: any) {
        // Handle unique constraint violation (race condition where another request created it)
        if (error.name === 'SequelizeUniqueConstraintError') {
          // Another request created the conversation, fetch it
          conversation = await TeamConversation.findOne({
            where: { propertyId, isPublic: false },
            transaction,
          });
          if (conversation) {
            return { conversation, created: false };
          }
        }
        throw error;
      }
    });

    return [result.conversation, result.created];
  }

  /**
   * Find or create a PUBLIC conversation for a property
   * Uses transaction with row-level locking to prevent race conditions
   */
  static async findOrCreatePublicForProperty(
    propertyId: number,
    propertyAddress: string
  ): Promise<[TeamConversation, boolean]> {
    const result = await sequelize.transaction(async (transaction) => {
      let conversation = await TeamConversation.findOne({
        where: { propertyId, isPublic: true },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (conversation) {
        return { conversation, created: false };
      }

      try {
        conversation = await TeamConversation.create(
          {
            propertyId,
            propertyAddress,
            title: `Public Discussion: ${propertyAddress}`,
            participantIds: [],
            unreadCounts: {},
            isPublic: true,
          },
          { transaction }
        );
        return { conversation, created: true };
      } catch (error: any) {
        if (error.name === 'SequelizeUniqueConstraintError') {
          conversation = await TeamConversation.findOne({
            where: { propertyId, isPublic: true },
            transaction,
          });
          if (conversation) {
            return { conversation, created: false };
          }
        }
        throw error;
      }
    });

    return [result.conversation, result.created];
  }

  /**
   * Get public conversation for a property
   */
  static async getPublicForProperty(propertyId: number): Promise<TeamConversation | null> {
    return TeamConversation.findOne({
      where: { propertyId, isPublic: true },
    });
  }

  /**
   * Get conversations for a user (with unread counts)
   */
  static async getForUser(
    userId: string,
    options: {
      includeArchived?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<TeamConversation[]> {
    const where: any = {
      participantIds: { [Op.contains]: [userId] },
    };

    if (!options.includeArchived) {
      where.isArchived = false;
    }

    // Dynamically import Property to avoid circular dependency
    const { default: Property } = await import('./Property');

    return TeamConversation.findAll({
      where,
      order: [['lastMessageAt', 'DESC NULLS LAST']],
      limit: options.limit || 50,
      offset: options.offset || 0,
      include: [
        {
          model: Property,
          as: 'property',
          required: false,
          attributes: ['id', 'address', 'city', 'state', 'zip', 'photoLinks'],
        },
      ],
    });
  }

  /**
   * Get total unread count across all conversations for a user
   */
  static async getTotalUnreadCount(userId: string): Promise<number> {
    const conversations = await TeamConversation.findAll({
      where: {
        participantIds: { [Op.contains]: [userId] },
        isArchived: false,
      },
      attributes: ['unreadCounts'],
    });

    return conversations.reduce((total, conv) => {
      return total + (conv.unreadCounts[userId] || 0);
    }, 0);
  }

  /**
   * Search conversations by property address
   */
  static async searchByAddress(
    query: string,
    limit: number = 10
  ): Promise<TeamConversation[]> {
    return TeamConversation.findAll({
      where: {
        [Op.or]: [
          { propertyAddress: { [Op.iLike]: `%${query}%` } },
          { title: { [Op.iLike]: `%${query}%` } },
        ],
        isArchived: false,
      },
      order: [['lastMessageAt', 'DESC NULLS LAST']],
      limit,
    });
  }
}

TeamConversation.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'properties',
        key: 'id',
      },
    },
    propertyAddress: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastMessagePreview: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    lastMessageSender: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    lastMessageSource: {
      type: DataTypes.ENUM('platform', 'sms', 'email'),
      allowNull: true,
    },
    participantIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      defaultValue: [],
    },
    unreadCounts: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
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
    tableName: 'team_conversations',
    timestamps: true,
    indexes: [
      { fields: ['propertyId'] },
      { fields: ['lastMessageAt'] },
      { fields: ['isArchived'] },
      // Unique constraint: only ONE conversation per property per type (public/private)
      // This prevents duplicate conversations being created by race conditions
      {
        unique: true,
        fields: ['propertyId', 'isPublic'],
        where: { propertyId: { [Op.ne]: null } },
        name: 'unique_property_conversation',
      },
    ],
  }
);

export default TeamConversation;
