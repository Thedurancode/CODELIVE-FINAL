/**
 * Deal Forward Model
 *
 * Tracks when users forward/share deals to others.
 * Provides complete audit trail for admin visibility.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type ForwardMethod = 'email' | 'sms' | 'internal' | 'link' | 'whatsapp' | 'other';
export type ForwardStatus = 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'failed';

interface DealForwardAttributes {
  id: string;

  // Who forwarded
  forwardedByUserId: string;
  forwardedByName?: string;
  forwardedByEmail?: string;

  // What was forwarded
  dealId: string;
  propertyId?: number;

  // Who received it
  recipientEmail?: string;
  recipientPhone?: string;
  recipientUserId?: string; // If forwarded to an existing user
  recipientName?: string;
  recipientCompany?: string;

  // How it was forwarded
  method: ForwardMethod;
  status: ForwardStatus;

  // Optional message
  message?: string;
  subject?: string;

  // Tracking
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  failedAt?: Date;
  failureReason?: string;

  // Link tracking
  trackingToken?: string;
  clickCount: number;

  // Email provider tracking (Resend)
  resendMessageId?: string;

  // Deal snapshot at time of forward
  dealSnapshotAddress?: string;
  dealSnapshotPrice?: number;
  dealSnapshotArv?: number;

  // Metadata
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

interface DealForwardCreationAttributes
  extends Optional<
    DealForwardAttributes,
    | 'id'
    | 'forwardedByName'
    | 'forwardedByEmail'
    | 'propertyId'
    | 'recipientEmail'
    | 'recipientPhone'
    | 'recipientUserId'
    | 'recipientName'
    | 'recipientCompany'
    | 'status'
    | 'message'
    | 'subject'
    | 'sentAt'
    | 'deliveredAt'
    | 'openedAt'
    | 'clickedAt'
    | 'failedAt'
    | 'failureReason'
    | 'trackingToken'
    | 'clickCount'
    | 'resendMessageId'
    | 'dealSnapshotAddress'
    | 'dealSnapshotPrice'
    | 'dealSnapshotArv'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class DealForward
  extends Model<DealForwardAttributes, DealForwardCreationAttributes>
  implements DealForwardAttributes
{
  declare id: string;
  declare forwardedByUserId: string;
  declare forwardedByName: string | undefined;
  declare forwardedByEmail: string | undefined;
  declare dealId: string;
  declare propertyId: number | undefined;
  declare recipientEmail: string | undefined;
  declare recipientPhone: string | undefined;
  declare recipientUserId: string | undefined;
  declare recipientName: string | undefined;
  declare recipientCompany: string | undefined;
  declare method: ForwardMethod;
  declare status: ForwardStatus;
  declare message: string | undefined;
  declare subject: string | undefined;
  declare sentAt: Date | undefined;
  declare deliveredAt: Date | undefined;
  declare openedAt: Date | undefined;
  declare clickedAt: Date | undefined;
  declare failedAt: Date | undefined;
  declare failureReason: string | undefined;
  declare trackingToken: string | undefined;
  declare clickCount: number;
  declare resendMessageId: string | undefined;
  declare dealSnapshotAddress: string | undefined;
  declare dealSnapshotPrice: number | undefined;
  declare dealSnapshotArv: number | undefined;
  declare metadata: Record<string, unknown> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

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
   * Mark as opened (email opened, SMS read, etc.)
   */
  async markOpened(): Promise<void> {
    this.status = 'opened';
    this.openedAt = new Date();
    await this.save();
  }

  /**
   * Record a click on the forwarded deal link
   */
  async recordClick(): Promise<void> {
    this.status = 'clicked';
    this.clickedAt = this.clickedAt || new Date();
    this.clickCount = (this.clickCount || 0) + 1;
    await this.save();
  }

  /**
   * Mark as failed
   */
  async markFailed(reason: string): Promise<void> {
    this.status = 'failed';
    this.failedAt = new Date();
    this.failureReason = reason;
    await this.save();
  }

  /**
   * Get recipient display string
   */
  getRecipientDisplay(): string {
    if (this.recipientName) return this.recipientName;
    if (this.recipientEmail) return this.recipientEmail;
    if (this.recipientPhone) return this.recipientPhone;
    return 'Unknown recipient';
  }
}

DealForward.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    forwardedByUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    forwardedByName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    forwardedByEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dealId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    recipientEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    recipientPhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    recipientUserId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    recipientName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    recipientCompany: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    method: {
      type: DataTypes.ENUM('email', 'sms', 'internal', 'link', 'whatsapp', 'other'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'delivered', 'opened', 'clicked', 'failed'),
      defaultValue: 'pending',
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    openedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    clickedAt: {
      type: DataTypes.DATE,
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
    trackingToken: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    clickCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    resendMessageId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dealSnapshotAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dealSnapshotPrice: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    dealSnapshotArv: {
      type: DataTypes.INTEGER,
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
    tableName: 'deal_forwards',
    timestamps: true,
    indexes: [
      { fields: ['forwardedByUserId'] },
      { fields: ['dealId'] },
      { fields: ['recipientEmail'] },
      { fields: ['recipientUserId'] },
      { fields: ['method'] },
      { fields: ['status'] },
      { fields: ['trackingToken'], unique: true },
      { fields: ['resendMessageId'] },
      { fields: ['createdAt'] },
      { fields: ['forwardedByUserId', 'dealId'] },
      { fields: ['dealId', 'status'] },
    ],
  }
);

export default DealForward;
