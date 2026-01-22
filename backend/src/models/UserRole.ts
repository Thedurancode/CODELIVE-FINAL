/**
 * UserRole Model
 *
 * Maps users to roles, enabling fine-grained permission assignment.
 * Users can have multiple roles, with permissions aggregated from all assigned roles.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

interface UserRoleAttributes {
  id: string;
  userId: string;
  roleId: string;
  organizationId?: string; // Context for the role assignment
  assignedBy?: string; // Who assigned this role
  expiresAt?: Date; // Optional expiration for temporary role assignments
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface UserRoleCreationAttributes
  extends Optional<
    UserRoleAttributes,
    | 'id'
    | 'organizationId'
    | 'assignedBy'
    | 'expiresAt'
    | 'isActive'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class UserRole
  extends Model<UserRoleAttributes, UserRoleCreationAttributes>
  implements UserRoleAttributes
{
  declare id: string;
  declare userId: string;
  declare roleId: string;
  declare organizationId: string | undefined;
  declare assignedBy: string | undefined;
  declare expiresAt: Date | undefined;
  declare isActive: boolean;
  declare metadata: Record<string, any> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if the role assignment is still valid
   */
  isValid(): boolean {
    if (!this.isActive) return false;
    if (this.expiresAt && new Date() > this.expiresAt) return false;
    return true;
  }

  /**
   * Get all active role assignments for a user
   */
  static async getActiveForUser(userId: string, organizationId?: string): Promise<UserRole[]> {
    const where: any = {
      userId,
      isActive: true,
      [Op.or]: [
        { expiresAt: null },
        { expiresAt: { [Op.gt]: new Date() } },
      ],
    };

    if (organizationId) {
      where[Op.or] = [
        { organizationId },
        { organizationId: null }, // Global role assignments
      ];
    }

    return UserRole.findAll({
      where,
      include: ['role'],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Assign a role to a user
   */
  static async assignRole(data: {
    userId: string;
    roleId: string;
    organizationId?: string;
    assignedBy?: string;
    expiresAt?: Date;
  }): Promise<UserRole> {
    // Check if role is already assigned
    const existing = await UserRole.findOne({
      where: {
        userId: data.userId,
        roleId: data.roleId,
        organizationId: data.organizationId || null,
      },
    });

    if (existing) {
      // Reactivate if inactive
      if (!existing.isActive) {
        await existing.update({
          isActive: true,
          expiresAt: data.expiresAt,
          assignedBy: data.assignedBy,
        });
      }
      return existing;
    }

    return UserRole.create({
      ...data,
      isActive: true,
    });
  }

  /**
   * Revoke a role from a user
   */
  static async revokeRole(
    userId: string,
    roleId: string,
    organizationId?: string
  ): Promise<boolean> {
    const [updated] = await UserRole.update(
      {
        isActive: false,
        metadata: {
          revokedAt: new Date().toISOString(),
        },
      },
      {
        where: {
          userId,
          roleId,
          organizationId: organizationId || null,
        },
      }
    );
    return updated > 0;
  }

  /**
   * Get all users with a specific role
   */
  static async getUsersByRole(roleId: string, organizationId?: string): Promise<UserRole[]> {
    return UserRole.findAll({
      where: {
        roleId,
        isActive: true,
        ...(organizationId && {
          [Op.or]: [{ organizationId }, { organizationId: null }],
        }),
      },
      include: ['user'],
    });
  }

  /**
   * Clean up expired role assignments
   */
  static async cleanupExpired(): Promise<number> {
    const [updated] = await UserRole.update(
      { isActive: false },
      {
        where: {
          expiresAt: { [Op.lt]: new Date() },
          isActive: true,
        },
      }
    );
    return updated;
  }
}

UserRole.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'role_id',
      references: {
        model: 'roles',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_id',
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'CASCADE',
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
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
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
    tableName: 'user_roles',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['role_id'] },
      { fields: ['organization_id'] },
      { fields: ['is_active'] },
      { fields: ['expires_at'] },
      { fields: ['user_id', 'role_id', 'organization_id'], unique: true },
      { fields: ['user_id', 'is_active'] },
    ],
  }
);

export default UserRole;
