/**
 * Broker Assistant Model
 *
 * Support role under a broker. Can view deals and help with documents
 * but cannot change deal status, accept offers, or modify terms.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type AssistantPermission =
  | 'view_deals'
  | 'view_communications'
  | 'manage_documents'
  | 'post_notes'
  | 'support_compliance';

interface BrokerAssistantAttributes {
  id: string;
  userId: string;
  brokerId: string;
  permissions: AssistantPermission[];
  assignedBy: string;
  active: boolean;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface BrokerAssistantCreationAttributes
  extends Optional<
    BrokerAssistantAttributes,
    | 'id'
    | 'permissions'
    | 'active'
    | 'notes'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class BrokerAssistant
  extends Model<BrokerAssistantAttributes, BrokerAssistantCreationAttributes>
  implements BrokerAssistantAttributes
{
  declare id: string;
  declare userId: string;
  declare brokerId: string;
  declare permissions: AssistantPermission[];
  declare assignedBy: string;
  declare active: boolean;
  declare notes: string | undefined;
  declare metadata: Record<string, any> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if assistant has a specific permission
   */
  hasPermission(permission: AssistantPermission): boolean {
    return this.permissions.includes(permission);
  }

  /**
   * Check if assistant can perform an action
   */
  canPerformAction(action: 'view' | 'edit' | 'create' | 'delete', resource: string): boolean {
    // Assistants can NEVER:
    // - Change deal status
    // - Accept offers
    // - Modify pricing/terms

    const blockedActions = ['change_status', 'accept_offer', 'modify_terms', 'delete_deal'];
    if (blockedActions.includes(action)) {
      return false;
    }

    // Allowed actions based on permissions
    const permissionMap: Record<string, string[]> = {
      view_deals: ['view'],
      view_communications: ['view'],
      manage_documents: ['view', 'edit', 'create'],
      post_notes: ['create'],
      support_compliance: ['view', 'create'],
    };

    for (const perm of this.permissions) {
      if (permissionMap[perm]?.includes(action)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get default permissions for new assistants
   */
  static getDefaultPermissions(): AssistantPermission[] {
    return ['view_deals', 'view_communications', 'manage_documents', 'post_notes'];
  }

  /**
   * Get assistants for a broker
   */
  static async getBrokerAssistants(brokerId: string): Promise<BrokerAssistant[]> {
    return BrokerAssistant.findAll({
      where: { brokerId, active: true },
      include: ['user', 'broker'],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Assign an assistant to a broker
   */
  static async assignAssistant(data: {
    userId: string;
    brokerId: string;
    assignedBy: string;
    permissions?: AssistantPermission[];
  }): Promise<BrokerAssistant> {
    // Check if already assigned
    const existing = await BrokerAssistant.findOne({
      where: { userId: data.userId, brokerId: data.brokerId },
    });

    if (existing) {
      // Reactivate if inactive
      if (!existing.active) {
        return existing.update({
          active: true,
          permissions: data.permissions || BrokerAssistant.getDefaultPermissions(),
        });
      }
      return existing;
    }

    return BrokerAssistant.create({
      ...data,
      permissions: data.permissions || BrokerAssistant.getDefaultPermissions(),
      active: true,
    });
  }

  /**
   * Revoke assistant access
   */
  async revokeAccess(revokedBy: string): Promise<void> {
    await this.update({
      active: false,
      metadata: {
        ...this.metadata,
        revokedAt: new Date(),
        revokedBy,
      },
    });
  }

  /**
   * Update permissions
   */
  async updatePermissions(
    permissions: AssistantPermission[],
    updatedBy: string
  ): Promise<void> {
    await this.update({
      permissions,
      metadata: {
        ...this.metadata,
        permissionsUpdatedAt: new Date(),
        permissionsUpdatedBy: updatedBy,
      },
    });
  }
}

BrokerAssistant.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    brokerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'broker_profiles',
        key: 'id',
      },
    },
    permissions: {
      type: DataTypes.ARRAY(DataTypes.ENUM('view_deals', 'view_communications', 'manage_documents', 'post_notes', 'support_compliance')),
      defaultValue: () => ["view_deals", "view_communications", "manage_documents", "post_notes"],
    },
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    notes: {
      type: DataTypes.TEXT,
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
    tableName: 'broker_assistants',
    timestamps: true,
    indexes: [
      { fields: ['userId'], unique: true },
      { fields: ['brokerId'] },
      { fields: ['active'] },
      { fields: ['brokerId', 'active'] },
    ],
  }
);

export default BrokerAssistant;
