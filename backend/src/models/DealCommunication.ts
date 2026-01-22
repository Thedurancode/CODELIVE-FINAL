/**
 * Deal Communication Model
 *
 * Tracks all communications related to a deal, routed through the broker-mediated system.
 * Provides audit trail for compliance and broker oversight.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

export type PartyType = 'buyer' | 'wholesaler' | 'broker' | 'ai_assistant';
export type MessageType = 'inquiry' | 'response' | 'offer' | 'counter_offer' | 'negotiation' | 'system' | 'notification';
export type CommunicationStatus = 'pending' | 'processing' | 'sent' | 'delivered' | 'read' | 'blocked' | 'failed';
export type CommunicationDirection = 'inbound' | 'outbound';

interface DealCommunicationAttributes {
  id: string;
  dealId: string;
  msaId: string;
  propertyId: number;
  direction: CommunicationDirection;
  fromType: PartyType;
  fromUserId: string;
  fromName?: string;
  fromEmail?: string;
  toType: PartyType;
  toUserId: string;
  toName?: string;
  toEmail?: string;
  messageType: MessageType;
  subject?: string;
  content: string;
  // AI Processing
  aiProcessed: boolean;
  aiProcessedAt?: Date;
  aiResponse?: string;
  aiConfidenceScore?: number;
  aiSuggestedAction?: string;
  // Broker Oversight
  brokerReviewed: boolean;
  brokerReviewedAt?: Date;
  brokerReviewedBy?: string;
  brokerApproved?: boolean;
  brokerNotes?: string;
  // Override handling
  brokerOverridden: boolean;
  brokerOverriddenAt?: Date;
  brokerOverrideReason?: string;
  originalContent?: string;
  // Status tracking
  status: CommunicationStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  blockedAt?: Date;
  blockedBy?: string;
  blockReason?: string;
  failedAt?: Date;
  failureReason?: string;
  // Thread tracking
  threadId?: string;
  parentMessageId?: string;
  // Metadata
  channel?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface DealCommunicationCreationAttributes
  extends Optional<
    DealCommunicationAttributes,
    | 'id'
    | 'fromName'
    | 'fromEmail'
    | 'toName'
    | 'toEmail'
    | 'subject'
    | 'aiProcessed'
    | 'aiProcessedAt'
    | 'aiResponse'
    | 'aiConfidenceScore'
    | 'aiSuggestedAction'
    | 'brokerReviewed'
    | 'brokerReviewedAt'
    | 'brokerReviewedBy'
    | 'brokerApproved'
    | 'brokerNotes'
    | 'brokerOverridden'
    | 'brokerOverriddenAt'
    | 'brokerOverrideReason'
    | 'originalContent'
    | 'status'
    | 'sentAt'
    | 'deliveredAt'
    | 'readAt'
    | 'blockedAt'
    | 'blockedBy'
    | 'blockReason'
    | 'failedAt'
    | 'failureReason'
    | 'threadId'
    | 'parentMessageId'
    | 'channel'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class DealCommunication
  extends Model<DealCommunicationAttributes, DealCommunicationCreationAttributes>
  implements DealCommunicationAttributes
{
  declare id: string;
  declare dealId: string;
  declare msaId: string;
  declare propertyId: number;
  declare direction: CommunicationDirection;
  declare fromType: PartyType;
  declare fromUserId: string;
  declare fromName: string | undefined;
  declare fromEmail: string | undefined;
  declare toType: PartyType;
  declare toUserId: string;
  declare toName: string | undefined;
  declare toEmail: string | undefined;
  declare messageType: MessageType;
  declare subject: string | undefined;
  declare content: string;
  declare aiProcessed: boolean;
  declare aiProcessedAt: Date | undefined;
  declare aiResponse: string | undefined;
  declare aiConfidenceScore: number | undefined;
  declare aiSuggestedAction: string | undefined;
  declare brokerReviewed: boolean;
  declare brokerReviewedAt: Date | undefined;
  declare brokerReviewedBy: string | undefined;
  declare brokerApproved: boolean | undefined;
  declare brokerNotes: string | undefined;
  declare brokerOverridden: boolean;
  declare brokerOverriddenAt: Date | undefined;
  declare brokerOverrideReason: string | undefined;
  declare originalContent: string | undefined;
  declare status: CommunicationStatus;
  declare sentAt: Date | undefined;
  declare deliveredAt: Date | undefined;
  declare readAt: Date | undefined;
  declare blockedAt: Date | undefined;
  declare blockedBy: string | undefined;
  declare blockReason: string | undefined;
  declare failedAt: Date | undefined;
  declare failureReason: string | undefined;
  declare threadId: string | undefined;
  declare parentMessageId: string | undefined;
  declare channel: string | undefined;
  declare metadata: Record<string, any> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Mark as reviewed by broker
   */
  async markReviewed(brokerId: string, approved: boolean, notes?: string): Promise<void> {
    this.brokerReviewed = true;
    this.brokerReviewedAt = new Date();
    this.brokerReviewedBy = brokerId;
    this.brokerApproved = approved;
    if (notes) this.brokerNotes = notes;
    await this.save();
  }

  /**
   * Override the message content
   */
  async override(brokerId: string, newContent: string, reason: string): Promise<void> {
    this.originalContent = this.content;
    this.content = newContent;
    this.brokerOverridden = true;
    this.brokerOverriddenAt = new Date();
    this.brokerOverrideReason = reason;
    this.brokerReviewed = true;
    this.brokerReviewedAt = new Date();
    this.brokerReviewedBy = brokerId;
    await this.save();
  }

  /**
   * Block the message
   */
  async block(brokerId: string, reason: string): Promise<void> {
    this.status = 'blocked';
    this.blockedAt = new Date();
    this.blockedBy = brokerId;
    this.blockReason = reason;
    this.brokerReviewed = true;
    this.brokerReviewedAt = new Date();
    this.brokerReviewedBy = brokerId;
    await this.save();
  }

  /**
   * Mark as sent
   */
  async markSent(): Promise<void> {
    this.status = 'sent';
    this.sentAt = new Date();
    await this.save();
  }

  /**
   * Mark as delivered
   */
  async markDelivered(): Promise<void> {
    this.status = 'delivered';
    this.deliveredAt = new Date();
    await this.save();
  }

  /**
   * Mark as read
   */
  async markRead(): Promise<void> {
    this.status = 'read';
    this.readAt = new Date();
    await this.save();
  }

  /**
   * Record AI processing result
   */
  async recordAIProcessing(
    response: string,
    confidenceScore?: number,
    suggestedAction?: string
  ): Promise<void> {
    this.aiProcessed = true;
    this.aiProcessedAt = new Date();
    this.aiResponse = response;
    if (confidenceScore !== undefined) this.aiConfidenceScore = confidenceScore;
    if (suggestedAction) this.aiSuggestedAction = suggestedAction;
    await this.save();
  }

  /**
   * Check if message needs broker review
   */
  needsBrokerReview(): boolean {
    return !this.brokerReviewed && this.status !== 'blocked';
  }

  /**
   * Get communication summary for reporting
   */
  getSummary(): {
    direction: string;
    from: string;
    to: string;
    type: string;
    status: string;
    wasOverridden: boolean;
  } {
    return {
      direction: this.direction,
      from: `${this.fromType}: ${this.fromName || this.fromUserId}`,
      to: `${this.toType}: ${this.toName || this.toUserId}`,
      type: this.messageType,
      status: this.status,
      wasOverridden: this.brokerOverridden,
    };
  }

  /**
   * Get thread messages
   */
  static async getThread(threadId: string): Promise<DealCommunication[]> {
    return DealCommunication.findAll({
      where: { threadId },
      order: [['createdAt', 'ASC']],
    });
  }

  /**
   * Get unreviewed communications for a broker
   */
  static async getUnreviewed(brokerId: string, dealId?: string): Promise<DealCommunication[]> {
    const where: any = {
      brokerReviewed: false,
      status: { [Op.notIn]: ['blocked', 'failed'] },
    };
    if (dealId) where.dealId = dealId;

    return DealCommunication.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
  }
}

DealCommunication.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    dealId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    msaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'deal_broker_msas',
        key: 'id',
      },
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'properties',
        key: 'id',
      },
    },
    direction: {
      type: DataTypes.ENUM('inbound', 'outbound'),
      allowNull: false,
    },
    fromType: {
      type: DataTypes.ENUM('buyer', 'wholesaler', 'broker', 'ai_assistant'),
      allowNull: false,
    },
    fromUserId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fromName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fromEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    toType: {
      type: DataTypes.ENUM('buyer', 'wholesaler', 'broker', 'ai_assistant'),
      allowNull: false,
    },
    toUserId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    toName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    toEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    messageType: {
      type: DataTypes.ENUM('inquiry', 'response', 'offer', 'counter_offer', 'negotiation', 'system', 'notification'),
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    aiProcessed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    aiProcessedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    aiResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    aiConfidenceScore: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    aiSuggestedAction: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    brokerReviewed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    brokerReviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    brokerReviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    brokerApproved: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    brokerNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    brokerOverridden: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    brokerOverriddenAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    brokerOverrideReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    originalContent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'sent', 'delivered', 'read', 'blocked', 'failed'),
      defaultValue: 'pending',
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    blockedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    blockedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    blockReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    failedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    threadId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    parentMessageId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    channel: {
      type: DataTypes.STRING,
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
    tableName: 'deal_communications',
    timestamps: true,
    indexes: [
      { fields: ['dealId'] },
      { fields: ['msaId'] },
      { fields: ['propertyId'] },
      { fields: ['fromUserId'] },
      { fields: ['toUserId'] },
      { fields: ['status'] },
      { fields: ['brokerReviewed'] },
      { fields: ['threadId'] },
      { fields: ['createdAt'] },
      { fields: ['dealId', 'status'] },
      { fields: ['msaId', 'brokerReviewed'] },
    ],
  }
);

export default DealCommunication;
