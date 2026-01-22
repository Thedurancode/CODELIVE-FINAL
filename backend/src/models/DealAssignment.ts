/**
 * Deal Assignment Model
 *
 * Tracks deal assignments to team members for collaboration:
 * - Assign deals to team members
 * - Add notes and context
 * - Track assignment status
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface DealAssignmentAttributes {
  id: string;
  dealId: string;
  assignedBy: string; // User who made the assignment
  assignedTo: string; // User who received the assignment
  organizationId?: string; // For future org/team support

  // Assignment details
  notes?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'completed';
  dueDate?: Date;

  // Response
  responseNotes?: string;
  respondedAt?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface DealAssignmentCreationAttributes
  extends Optional<
    DealAssignmentAttributes,
    | 'id'
    | 'organizationId'
    | 'notes'
    | 'priority'
    | 'status'
    | 'dueDate'
    | 'responseNotes'
    | 'respondedAt'
    | 'createdAt'
    | 'updatedAt'
  > {}

class DealAssignment
  extends Model<DealAssignmentAttributes, DealAssignmentCreationAttributes>
  implements DealAssignmentAttributes
{
  declare id: string;
  declare dealId: string;
  declare assignedBy: string;
  declare assignedTo: string;
  declare organizationId: string | undefined;

  declare notes: string | undefined;
  declare priority: 'low' | 'normal' | 'high' | 'urgent';
  declare status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'completed';
  declare dueDate: Date | undefined;

  declare responseNotes: string | undefined;
  declare respondedAt: Date | undefined;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Static methods for common operations
  static async getAssignmentsForUser(userId: string, status?: string) {
    const where: Record<string, unknown> = { assignedTo: userId };
    if (status) where.status = status;
    return this.findAll({
      where,
      order: [
        ['priority', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });
  }

  static async getAssignmentsByUser(userId: string) {
    return this.findAll({
      where: { assignedBy: userId },
      order: [['createdAt', 'DESC']],
    });
  }

  static async getPendingCount(userId: string): Promise<number> {
    return this.count({
      where: { assignedTo: userId, status: 'pending' },
    });
  }
}

DealAssignment.init(
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
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    assignedTo: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      allowNull: false,
      defaultValue: 'normal',
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_review', 'approved', 'rejected', 'completed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    responseNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    respondedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'deal_assignments',
    timestamps: true,
    indexes: [
      { fields: ['assignedTo', 'status'] },
      { fields: ['assignedBy'] },
      { fields: ['dealId'] },
      { fields: ['organizationId'] },
    ],
  }
);

export default DealAssignment;
