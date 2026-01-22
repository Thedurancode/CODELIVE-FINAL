/**
 * HumanApprovalRequest Model
 *
 * Tracks pending approval requests for destructive agent actions.
 * Used by HumanApprovalService for the approval workflow.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

interface HumanApprovalRequestAttributes {
  id: string;
  userId: string;
  sessionId: string;
  requestId: string; // Links to the original chat request

  // Tool information
  toolName: string;
  toolInput: Record<string, unknown>;
  approvalReason: string;

  // Status tracking
  status: ApprovalStatus;
  expiresAt: Date;
  respondedAt?: Date;
  respondedBy?: string;
  rejectionReason?: string;

  // Context for the approval
  context?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

interface HumanApprovalRequestCreationAttributes
  extends Optional<
    HumanApprovalRequestAttributes,
    | 'id'
    | 'status'
    | 'respondedAt'
    | 'respondedBy'
    | 'rejectionReason'
    | 'context'
    | 'createdAt'
    | 'updatedAt'
  > {}

class HumanApprovalRequest
  extends Model<HumanApprovalRequestAttributes, HumanApprovalRequestCreationAttributes>
  implements HumanApprovalRequestAttributes
{
  declare id: string;
  declare userId: string;
  declare sessionId: string;
  declare requestId: string;
  declare toolName: string;
  declare toolInput: Record<string, unknown>;
  declare approvalReason: string;
  declare status: ApprovalStatus;
  declare expiresAt: Date;
  declare respondedAt: Date | undefined;
  declare respondedBy: string | undefined;
  declare rejectionReason: string | undefined;
  declare context: Record<string, unknown> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if request is still pending and not expired
   */
  isPending(): boolean {
    return this.status === 'pending' && new Date() < this.expiresAt;
  }

  /**
   * Check if request has expired
   */
  isExpired(): boolean {
    return this.status === 'pending' && new Date() >= this.expiresAt;
  }

  /**
   * Approve the request
   */
  async approve(respondedBy?: string): Promise<void> {
    this.status = 'approved';
    this.respondedAt = new Date();
    this.respondedBy = respondedBy;
    await this.save();
  }

  /**
   * Reject the request
   */
  async reject(reason?: string, respondedBy?: string): Promise<void> {
    this.status = 'rejected';
    this.respondedAt = new Date();
    this.respondedBy = respondedBy;
    this.rejectionReason = reason;
    await this.save();
  }

  /**
   * Mark as expired
   */
  async markExpired(): Promise<void> {
    this.status = 'expired';
    await this.save();
  }
}

HumanApprovalRequest.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: () => `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    requestId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    toolName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    toolInput: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    approvalReason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'expired'),
      defaultValue: 'pending',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    respondedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    respondedBy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    context: {
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
    tableName: 'human_approval_requests',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['sessionId'] },
      { fields: ['requestId'] },
      { fields: ['status'] },
      { fields: ['expiresAt'] },
      {
        name: 'approval_requests_pending',
        fields: ['userId', 'status'],
        where: { status: 'pending' },
      },
    ],
  }
);

export default HumanApprovalRequest;
export { HumanApprovalRequestAttributes, HumanApprovalRequestCreationAttributes };
