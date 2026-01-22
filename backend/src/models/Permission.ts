/**
 * Permission Model
 *
 * Defines individual permissions that can be assigned to roles.
 * Supports fine-grained access control for specific actions on resource types.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Resource types in the system
export type ResourceType =
  | 'property'
  | 'deal'
  | 'contact'
  | 'document'
  | 'compliance'
  | 'pipeline'
  | 'portfolio'
  | 'user'
  | 'organization'
  | 'settings'
  | 'analytics'
  | 'broker'
  | 'contract'
  | 'inquiry'
  | 'notification';

// Actions that can be performed on resources
export type ActionType = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'manage';

// Permission code format: resource:action (e.g., "property:view", "deal:approve")
export type PermissionCode = `${ResourceType}:${ActionType}`;

// Pre-defined permission codes for the system
export const PERMISSION_CODES = {
  // Property permissions
  PROPERTY_VIEW: 'property:view' as PermissionCode,
  PROPERTY_CREATE: 'property:create' as PermissionCode,
  PROPERTY_EDIT: 'property:edit' as PermissionCode,
  PROPERTY_DELETE: 'property:delete' as PermissionCode,
  PROPERTY_APPROVE: 'property:approve' as PermissionCode,
  PROPERTY_EXPORT: 'property:export' as PermissionCode,

  // Deal permissions
  DEAL_VIEW: 'deal:view' as PermissionCode,
  DEAL_CREATE: 'deal:create' as PermissionCode,
  DEAL_EDIT: 'deal:edit' as PermissionCode,
  DEAL_DELETE: 'deal:delete' as PermissionCode,
  DEAL_APPROVE: 'deal:approve' as PermissionCode,
  DEAL_MANAGE: 'deal:manage' as PermissionCode,

  // Contact permissions
  CONTACT_VIEW: 'contact:view' as PermissionCode,
  CONTACT_CREATE: 'contact:create' as PermissionCode,
  CONTACT_EDIT: 'contact:edit' as PermissionCode,
  CONTACT_DELETE: 'contact:delete' as PermissionCode,
  CONTACT_EXPORT: 'contact:export' as PermissionCode,

  // Document permissions
  DOCUMENT_VIEW: 'document:view' as PermissionCode,
  DOCUMENT_CREATE: 'document:create' as PermissionCode,
  DOCUMENT_EDIT: 'document:edit' as PermissionCode,
  DOCUMENT_DELETE: 'document:delete' as PermissionCode,
  DOCUMENT_APPROVE: 'document:approve' as PermissionCode,

  // Compliance permissions
  COMPLIANCE_VIEW: 'compliance:view' as PermissionCode,
  COMPLIANCE_CREATE: 'compliance:create' as PermissionCode,
  COMPLIANCE_EDIT: 'compliance:edit' as PermissionCode,
  COMPLIANCE_DELETE: 'compliance:delete' as PermissionCode,
  COMPLIANCE_APPROVE: 'compliance:approve' as PermissionCode,
  COMPLIANCE_MANAGE: 'compliance:manage' as PermissionCode,

  // Pipeline permissions
  PIPELINE_VIEW: 'pipeline:view' as PermissionCode,
  PIPELINE_CREATE: 'pipeline:create' as PermissionCode,
  PIPELINE_EDIT: 'pipeline:edit' as PermissionCode,
  PIPELINE_DELETE: 'pipeline:delete' as PermissionCode,
  PIPELINE_MANAGE: 'pipeline:manage' as PermissionCode,

  // Portfolio permissions
  PORTFOLIO_VIEW: 'portfolio:view' as PermissionCode,
  PORTFOLIO_CREATE: 'portfolio:create' as PermissionCode,
  PORTFOLIO_EDIT: 'portfolio:edit' as PermissionCode,
  PORTFOLIO_DELETE: 'portfolio:delete' as PermissionCode,

  // User management permissions
  USER_VIEW: 'user:view' as PermissionCode,
  USER_CREATE: 'user:create' as PermissionCode,
  USER_EDIT: 'user:edit' as PermissionCode,
  USER_DELETE: 'user:delete' as PermissionCode,
  USER_MANAGE: 'user:manage' as PermissionCode,

  // Organization permissions
  ORGANIZATION_VIEW: 'organization:view' as PermissionCode,
  ORGANIZATION_EDIT: 'organization:edit' as PermissionCode,
  ORGANIZATION_MANAGE: 'organization:manage' as PermissionCode,

  // Settings permissions
  SETTINGS_VIEW: 'settings:view' as PermissionCode,
  SETTINGS_EDIT: 'settings:edit' as PermissionCode,
  SETTINGS_MANAGE: 'settings:manage' as PermissionCode,

  // Analytics permissions
  ANALYTICS_VIEW: 'analytics:view' as PermissionCode,
  ANALYTICS_EXPORT: 'analytics:export' as PermissionCode,
  ANALYTICS_MANAGE: 'analytics:manage' as PermissionCode,

  // Broker permissions
  BROKER_VIEW: 'broker:view' as PermissionCode,
  BROKER_CREATE: 'broker:create' as PermissionCode,
  BROKER_EDIT: 'broker:edit' as PermissionCode,
  BROKER_DELETE: 'broker:delete' as PermissionCode,
  BROKER_APPROVE: 'broker:approve' as PermissionCode,
  BROKER_MANAGE: 'broker:manage' as PermissionCode,

  // Contract permissions
  CONTRACT_VIEW: 'contract:view' as PermissionCode,
  CONTRACT_CREATE: 'contract:create' as PermissionCode,
  CONTRACT_EDIT: 'contract:edit' as PermissionCode,
  CONTRACT_DELETE: 'contract:delete' as PermissionCode,
  CONTRACT_APPROVE: 'contract:approve' as PermissionCode,

  // Inquiry permissions
  INQUIRY_VIEW: 'inquiry:view' as PermissionCode,
  INQUIRY_CREATE: 'inquiry:create' as PermissionCode,
  INQUIRY_EDIT: 'inquiry:edit' as PermissionCode,
  INQUIRY_DELETE: 'inquiry:delete' as PermissionCode,

  // Notification permissions
  NOTIFICATION_VIEW: 'notification:view' as PermissionCode,
  NOTIFICATION_MANAGE: 'notification:manage' as PermissionCode,
} as const;

interface PermissionAttributes {
  id: string;
  code: string; // e.g., "property:view", "deal:approve"
  name: string; // Human readable name
  description?: string;
  resourceType: ResourceType;
  action: ActionType;
  isSystem: boolean; // System permissions cannot be deleted
  createdAt: Date;
  updatedAt: Date;
}

interface PermissionCreationAttributes
  extends Optional<
    PermissionAttributes,
    'id' | 'description' | 'isSystem' | 'createdAt' | 'updatedAt'
  > {}

class Permission
  extends Model<PermissionAttributes, PermissionCreationAttributes>
  implements PermissionAttributes
{
  declare id: string;
  declare code: string;
  declare name: string;
  declare description: string | undefined;
  declare resourceType: ResourceType;
  declare action: ActionType;
  declare isSystem: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Get all permissions for a resource type
   */
  static async getByResourceType(resourceType: ResourceType): Promise<Permission[]> {
    return Permission.findAll({
      where: { resourceType },
      order: [['action', 'ASC']],
    });
  }

  /**
   * Get permission by code
   */
  static async getByCode(code: string): Promise<Permission | null> {
    return Permission.findOne({ where: { code } });
  }

  /**
   * Initialize default system permissions
   */
  static async initializeDefaults(): Promise<void> {
    const defaultPermissions: PermissionCreationAttributes[] = Object.entries(PERMISSION_CODES).map(
      ([key, code]) => {
        const [resourceType, action] = code.split(':') as [ResourceType, ActionType];
        return {
          code,
          name: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase()),
          description: `Permission to ${action} ${resourceType} resources`,
          resourceType,
          action,
          isSystem: true,
        };
      }
    );

    for (const perm of defaultPermissions) {
      await Permission.findOrCreate({
        where: { code: perm.code },
        defaults: perm,
      });
    }
  }
}

Permission.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        is: /^[a-z_]+:[a-z_]+$/i, // Format: resource:action
      },
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    resourceType: {
      type: DataTypes.ENUM(
        'property',
        'deal',
        'contact',
        'document',
        'compliance',
        'pipeline',
        'portfolio',
        'user',
        'organization',
        'settings',
        'analytics',
        'broker',
        'contract',
        'inquiry',
        'notification'
      ),
      allowNull: false,
    },
    action: {
      type: DataTypes.ENUM('view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'),
      allowNull: false,
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_system',
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
    tableName: 'permissions',
    timestamps: true,
    indexes: [
      { fields: ['code'], unique: true },
      { fields: ['resourceType'] },
      { fields: ['action'] },
      { fields: ['resourceType', 'action'] },
    ],
  }
);

export default Permission;
