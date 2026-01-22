/**
 * DealTeamMember Model
 *
 * Associates team members with specific deals/properties.
 * Team members assigned to a deal receive notifications on all deal activity.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type DealRole =
  | 'lead'           // Primary person responsible for the deal
  | 'acquisitions'   // Handling acquisition/negotiation
  | 'underwriting'   // Analyzing numbers/due diligence
  | 'closing'        // Managing closing process
  | 'support'        // General support/assistance
  | 'observer';      // View-only, receives notifications

export interface DealTeamMemberAttributes {
  id: number;
  propertyId: number;
  userId: string;
  organizationId: string;
  dealRole: DealRole;
  assignedAt: Date;
  assignedBy?: string; // userId who assigned this team member
  isActive: boolean;

  // Notification preferences for this specific deal
  notifyOnOffer: boolean;
  notifyOnMessage: boolean;
  notifyOnStatusChange: boolean;
  notifyOnDocument: boolean;
  notifyOnNote: boolean;

  notes?: string; // Internal notes about this assignment
  createdAt: Date;
  updatedAt: Date;
}

export interface DealTeamMemberCreationAttributes
  extends Optional<
    DealTeamMemberAttributes,
    | 'id'
    | 'assignedAt'
    | 'assignedBy'
    | 'isActive'
    | 'notifyOnOffer'
    | 'notifyOnMessage'
    | 'notifyOnStatusChange'
    | 'notifyOnDocument'
    | 'notifyOnNote'
    | 'notes'
    | 'createdAt'
    | 'updatedAt'
  > {}

class DealTeamMember
  extends Model<DealTeamMemberAttributes, DealTeamMemberCreationAttributes>
  implements DealTeamMemberAttributes
{
  declare id: number;
  declare propertyId: number;
  declare userId: string;
  declare organizationId: string;
  declare dealRole: DealRole;
  declare assignedAt: Date;
  declare assignedBy: string | undefined;
  declare isActive: boolean;

  declare notifyOnOffer: boolean;
  declare notifyOnMessage: boolean;
  declare notifyOnStatusChange: boolean;
  declare notifyOnDocument: boolean;
  declare notifyOnNote: boolean;

  declare notes: string | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual fields populated by associations
  declare user?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
    title?: string;
  };

  declare property?: {
    id: number;
    address: string;
    city: string;
    state: string;
  };

  /**
   * Get all team members for a property
   */
  static async getForProperty(
    propertyId: number,
    organizationId: string,
    includeInactive = false
  ): Promise<DealTeamMember[]> {
    const where: any = { propertyId, organizationId };
    if (!includeInactive) {
      where.isActive = true;
    }
    return this.findAll({
      where,
      order: [
        ['dealRole', 'ASC'],
        ['assignedAt', 'ASC'],
      ],
    });
  }

  /**
   * Get all deals assigned to a user
   */
  static async getForUser(
    userId: string,
    organizationId: string,
    includeInactive = false
  ): Promise<DealTeamMember[]> {
    const where: any = { userId, organizationId };
    if (!includeInactive) {
      where.isActive = true;
    }
    return this.findAll({
      where,
      order: [['assignedAt', 'DESC']],
    });
  }

  /**
   * Assign a team member to a deal
   */
  static async assignToProperty(data: {
    propertyId: number;
    userId: string;
    organizationId: string;
    dealRole: DealRole;
    assignedBy?: string;
    notes?: string;
  }): Promise<DealTeamMember> {
    // Check if already assigned
    const existing = await this.findOne({
      where: {
        propertyId: data.propertyId,
        userId: data.userId,
        organizationId: data.organizationId,
      },
    });

    if (existing) {
      // Reactivate if inactive
      if (!existing.isActive) {
        return existing.update({
          isActive: true,
          dealRole: data.dealRole,
          assignedBy: data.assignedBy,
          assignedAt: new Date(),
          notes: data.notes,
        });
      }
      // Update role if already active
      return existing.update({
        dealRole: data.dealRole,
        notes: data.notes,
      });
    }

    return this.create({
      ...data,
      assignedAt: new Date(),
    });
  }

  /**
   * Remove a team member from a deal (soft delete)
   */
  static async removeFromProperty(
    propertyId: number,
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    const assignment = await this.findOne({
      where: { propertyId, userId, organizationId },
    });

    if (!assignment) return false;

    await assignment.update({ isActive: false });
    return true;
  }

  /**
   * Get team members who should be notified for a specific event type
   */
  static async getForNotification(
    propertyId: number,
    organizationId: string,
    eventType: 'offer' | 'message' | 'statusChange' | 'document' | 'note'
  ): Promise<DealTeamMember[]> {
    const notifyField = {
      offer: 'notifyOnOffer',
      message: 'notifyOnMessage',
      statusChange: 'notifyOnStatusChange',
      document: 'notifyOnDocument',
      note: 'notifyOnNote',
    }[eventType];

    return this.findAll({
      where: {
        propertyId,
        organizationId,
        isActive: true,
        [notifyField]: true,
      },
    });
  }

  /**
   * Get the lead team member for a property
   */
  static async getLeadForProperty(
    propertyId: number,
    organizationId: string
  ): Promise<DealTeamMember | null> {
    return this.findOne({
      where: {
        propertyId,
        organizationId,
        dealRole: 'lead',
        isActive: true,
      },
    });
  }
}

DealTeamMember.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'property_id',
      references: {
        model: 'properties',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
    },
    dealRole: {
      type: DataTypes.ENUM('lead', 'acquisitions', 'underwriting', 'closing', 'support', 'observer'),
      allowNull: false,
      defaultValue: 'support',
      field: 'deal_role',
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'assigned_at',
    },
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_by',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    notifyOnOffer: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'notify_on_offer',
    },
    notifyOnMessage: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'notify_on_message',
    },
    notifyOnStatusChange: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'notify_on_status_change',
    },
    notifyOnDocument: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'notify_on_document',
    },
    notifyOnNote: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'notify_on_note',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'deal_team_members',
    modelName: 'DealTeamMember',
    timestamps: true,
    indexes: [
      { fields: ['property_id'] },
      { fields: ['user_id'] },
      { fields: ['organization_id'] },
      { fields: ['property_id', 'user_id', 'organization_id'], unique: true },
      { fields: ['deal_role'] },
      { fields: ['is_active'] },
      { fields: ['property_id', 'is_active'] },
    ],
  }
);

export default DealTeamMember;
