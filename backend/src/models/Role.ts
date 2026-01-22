/**
 * Role Model
 *
 * Custom roles that group permissions together.
 * Supports both system-defined roles and custom organization-level roles.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';
import Permission, { PermissionCode, PERMISSION_CODES } from './Permission';

interface RoleAttributes {
  id: string;
  name: string;
  description?: string;
  organizationId?: string; // null = global role, set = organization-specific role
  permissions: string[]; // Array of permission codes
  isSystem: boolean; // System roles cannot be deleted
  isDefault: boolean; // Default role for new users in the organization
  priority: number; // Higher priority = more privileges in conflict resolution
  metadata?: Record<string, any>;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface RoleCreationAttributes
  extends Optional<
    RoleAttributes,
    | 'id'
    | 'description'
    | 'organizationId'
    | 'permissions'
    | 'isSystem'
    | 'isDefault'
    | 'priority'
    | 'metadata'
    | 'createdBy'
    | 'createdAt'
    | 'updatedAt'
  > {}

// Pre-defined system roles with their permissions
export const SYSTEM_ROLES = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Full system access with all permissions',
    permissions: Object.values(PERMISSION_CODES),
    priority: 100,
  },
  ADMIN: {
    name: 'Admin',
    description: 'Administrative access with most permissions except system management',
    permissions: Object.values(PERMISSION_CODES).filter(
      (p) => !p.includes('user:manage') && !p.includes('organization:manage')
    ),
    priority: 90,
  },
  BROKER: {
    name: 'Broker',
    description: 'Broker role with deal and compliance management',
    permissions: [
      PERMISSION_CODES.PROPERTY_VIEW,
      PERMISSION_CODES.PROPERTY_CREATE,
      PERMISSION_CODES.PROPERTY_EDIT,
      PERMISSION_CODES.DEAL_VIEW,
      PERMISSION_CODES.DEAL_CREATE,
      PERMISSION_CODES.DEAL_EDIT,
      PERMISSION_CODES.DEAL_APPROVE,
      PERMISSION_CODES.CONTACT_VIEW,
      PERMISSION_CODES.CONTACT_CREATE,
      PERMISSION_CODES.CONTACT_EDIT,
      PERMISSION_CODES.DOCUMENT_VIEW,
      PERMISSION_CODES.DOCUMENT_CREATE,
      PERMISSION_CODES.DOCUMENT_EDIT,
      PERMISSION_CODES.COMPLIANCE_VIEW,
      PERMISSION_CODES.COMPLIANCE_CREATE,
      PERMISSION_CODES.PIPELINE_VIEW,
      PERMISSION_CODES.PIPELINE_CREATE,
      PERMISSION_CODES.PIPELINE_EDIT,
      PERMISSION_CODES.PORTFOLIO_VIEW,
      PERMISSION_CODES.CONTRACT_VIEW,
      PERMISSION_CODES.CONTRACT_CREATE,
      PERMISSION_CODES.CONTRACT_EDIT,
      PERMISSION_CODES.BROKER_VIEW,
      PERMISSION_CODES.BROKER_EDIT,
      PERMISSION_CODES.INQUIRY_VIEW,
      PERMISSION_CODES.INQUIRY_CREATE,
      PERMISSION_CODES.INQUIRY_EDIT,
      PERMISSION_CODES.ANALYTICS_VIEW,
      PERMISSION_CODES.NOTIFICATION_VIEW,
    ],
    priority: 70,
  },
  WHOLESALER: {
    name: 'Wholesaler',
    description: 'Wholesaler with property and deal management',
    permissions: [
      PERMISSION_CODES.PROPERTY_VIEW,
      PERMISSION_CODES.PROPERTY_CREATE,
      PERMISSION_CODES.PROPERTY_EDIT,
      PERMISSION_CODES.DEAL_VIEW,
      PERMISSION_CODES.DEAL_CREATE,
      PERMISSION_CODES.DEAL_EDIT,
      PERMISSION_CODES.CONTACT_VIEW,
      PERMISSION_CODES.CONTACT_CREATE,
      PERMISSION_CODES.CONTACT_EDIT,
      PERMISSION_CODES.DOCUMENT_VIEW,
      PERMISSION_CODES.DOCUMENT_CREATE,
      PERMISSION_CODES.DOCUMENT_EDIT,
      PERMISSION_CODES.PIPELINE_VIEW,
      PERMISSION_CODES.PIPELINE_CREATE,
      PERMISSION_CODES.PIPELINE_EDIT,
      PERMISSION_CODES.PORTFOLIO_VIEW,
      PERMISSION_CODES.CONTRACT_VIEW,
      PERMISSION_CODES.CONTRACT_CREATE,
      PERMISSION_CODES.INQUIRY_VIEW,
      PERMISSION_CODES.INQUIRY_CREATE,
      PERMISSION_CODES.ANALYTICS_VIEW,
      PERMISSION_CODES.NOTIFICATION_VIEW,
    ],
    priority: 60,
  },
  AGENT: {
    name: 'Agent',
    description: 'Real estate agent with limited deal access',
    permissions: [
      PERMISSION_CODES.PROPERTY_VIEW,
      PERMISSION_CODES.PROPERTY_CREATE,
      PERMISSION_CODES.PROPERTY_EDIT,
      PERMISSION_CODES.DEAL_VIEW,
      PERMISSION_CODES.CONTACT_VIEW,
      PERMISSION_CODES.CONTACT_CREATE,
      PERMISSION_CODES.CONTACT_EDIT,
      PERMISSION_CODES.DOCUMENT_VIEW,
      PERMISSION_CODES.DOCUMENT_CREATE,
      PERMISSION_CODES.PIPELINE_VIEW,
      PERMISSION_CODES.INQUIRY_VIEW,
      PERMISSION_CODES.INQUIRY_CREATE,
      PERMISSION_CODES.NOTIFICATION_VIEW,
    ],
    priority: 50,
  },
  BUYER: {
    name: 'Buyer',
    description: 'Buyer with view and inquiry permissions',
    permissions: [
      PERMISSION_CODES.PROPERTY_VIEW,
      PERMISSION_CODES.DEAL_VIEW,
      PERMISSION_CODES.DOCUMENT_VIEW,
      PERMISSION_CODES.PIPELINE_VIEW,
      PERMISSION_CODES.PORTFOLIO_VIEW,
      PERMISSION_CODES.INQUIRY_VIEW,
      PERMISSION_CODES.INQUIRY_CREATE,
      PERMISSION_CODES.NOTIFICATION_VIEW,
    ],
    priority: 30,
  },
  INVESTOR: {
    name: 'Investor',
    description: 'Investor with view and portfolio permissions',
    permissions: [
      PERMISSION_CODES.PROPERTY_VIEW,
      PERMISSION_CODES.DEAL_VIEW,
      PERMISSION_CODES.DOCUMENT_VIEW,
      PERMISSION_CODES.PORTFOLIO_VIEW,
      PERMISSION_CODES.PORTFOLIO_CREATE,
      PERMISSION_CODES.ANALYTICS_VIEW,
      PERMISSION_CODES.INQUIRY_VIEW,
      PERMISSION_CODES.NOTIFICATION_VIEW,
    ],
    priority: 40,
  },
  VIEWER: {
    name: 'Viewer',
    description: 'Read-only access to most resources',
    permissions: [
      PERMISSION_CODES.PROPERTY_VIEW,
      PERMISSION_CODES.DEAL_VIEW,
      PERMISSION_CODES.CONTACT_VIEW,
      PERMISSION_CODES.DOCUMENT_VIEW,
      PERMISSION_CODES.PIPELINE_VIEW,
      PERMISSION_CODES.PORTFOLIO_VIEW,
      PERMISSION_CODES.ANALYTICS_VIEW,
      PERMISSION_CODES.NOTIFICATION_VIEW,
    ],
    priority: 10,
  },
  TEAM_MEMBER: {
    name: 'Team Member',
    description: 'Team member with basic access',
    permissions: [
      PERMISSION_CODES.PROPERTY_VIEW,
      PERMISSION_CODES.DEAL_VIEW,
      PERMISSION_CODES.CONTACT_VIEW,
      PERMISSION_CODES.CONTACT_CREATE,
      PERMISSION_CODES.DOCUMENT_VIEW,
      PERMISSION_CODES.DOCUMENT_CREATE,
      PERMISSION_CODES.PIPELINE_VIEW,
      PERMISSION_CODES.INQUIRY_VIEW,
      PERMISSION_CODES.NOTIFICATION_VIEW,
    ],
    priority: 20,
  },
} as const;

class Role
  extends Model<RoleAttributes, RoleCreationAttributes>
  implements RoleAttributes
{
  declare id: string;
  declare name: string;
  declare description: string | undefined;
  declare organizationId: string | undefined;
  declare permissions: string[];
  declare isSystem: boolean;
  declare isDefault: boolean;
  declare priority: number;
  declare metadata: Record<string, any> | undefined;
  declare createdBy: string | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if role has a specific permission
   */
  hasPermission(permissionCode: string): boolean {
    return this.permissions.includes(permissionCode);
  }

  /**
   * Check if role has any of the specified permissions
   */
  hasAnyPermission(permissionCodes: string[]): boolean {
    return permissionCodes.some((code) => this.permissions.includes(code));
  }

  /**
   * Check if role has all of the specified permissions
   */
  hasAllPermissions(permissionCodes: string[]): boolean {
    return permissionCodes.every((code) => this.permissions.includes(code));
  }

  /**
   * Add permissions to role
   */
  async addPermissions(permissionCodes: string[]): Promise<void> {
    const newPermissions = [...new Set([...this.permissions, ...permissionCodes])];
    await this.update({ permissions: newPermissions });
  }

  /**
   * Remove permissions from role
   */
  async removePermissions(permissionCodes: string[]): Promise<void> {
    const newPermissions = this.permissions.filter((p) => !permissionCodes.includes(p));
    await this.update({ permissions: newPermissions });
  }

  /**
   * Get all roles for an organization (includes global roles)
   */
  static async getByOrganization(organizationId?: string): Promise<Role[]> {
    return Role.findAll({
      where: organizationId
        ? {
            [Op.or]: [
              { organizationId },
              { organizationId: null }, // Global roles
            ],
          }
        : { organizationId: null },
      order: [
        ['priority', 'DESC'],
        ['name', 'ASC'],
      ],
    });
  }

  /**
   * Get role by name (within organization context)
   */
  static async getByName(name: string, organizationId?: string): Promise<Role | null> {
    return Role.findOne({
      where: organizationId
        ? {
            name,
            [Op.or]: [{ organizationId }, { organizationId: null }],
          }
        : { name, organizationId: null },
    });
  }

  /**
   * Initialize system roles
   */
  static async initializeDefaults(): Promise<void> {
    for (const [key, roleData] of Object.entries(SYSTEM_ROLES)) {
      await Role.findOrCreate({
        where: { name: roleData.name, organizationId: null },
        defaults: {
          name: roleData.name,
          description: roleData.description,
          permissions: roleData.permissions as string[],
          priority: roleData.priority,
          isSystem: true,
          isDefault: key === 'VIEWER', // Viewer is default for new users
        },
      });
    }
  }

  /**
   * Get the default role for new users
   */
  static async getDefaultRole(organizationId?: string): Promise<Role | null> {
    return Role.findOne({
      where: organizationId
        ? {
            isDefault: true,
            [Op.or]: [{ organizationId }, { organizationId: null }],
          }
        : { isDefault: true, organizationId: null },
      order: [['priority', 'DESC']], // Higher priority organization role takes precedence
    });
  }
}

Role.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    permissions: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_system',
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_default',
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
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
    tableName: 'roles',
    timestamps: true,
    indexes: [
      { fields: ['name'] },
      { fields: ['organization_id'] },
      { fields: ['is_system'] },
      { fields: ['is_default'] },
      { fields: ['priority'] },
      { fields: ['name', 'organization_id'], unique: true },
    ],
  }
);

export default Role;
