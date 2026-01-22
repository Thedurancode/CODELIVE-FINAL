/**
 * Organization Model
 *
 * Represents a team/company that owns contacts, deals, and other resources.
 * Users belong to an organization, and resources are shared within the organization.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Organization status options
export type OrganizationStatus = 'active' | 'inactive' | 'suspended';

// Organization plan/tier options
export type OrganizationPlan = 'free' | 'starter' | 'professional' | 'enterprise';

// Organization attributes interface
interface OrganizationAttributes {
  id: string;
  name: string;
  slug: string; // URL-friendly identifier
  description: string | null;
  logo: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  status: OrganizationStatus;
  plan: OrganizationPlan;
  // Owner/primary admin
  ownerId: string | null;
  // Settings stored as JSON
  settings: {
    defaultTimezone?: string;
    defaultCurrency?: string;
    allowPublicProfiles?: boolean;
    requireApprovalForDeals?: boolean;
    defaultCommunicationUserId?: string;
    [key: string]: any;
  } | null;
  // Metadata for additional fields
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

// Attributes for creating a new organization
interface OrganizationCreationAttributes
  extends Optional<
    OrganizationAttributes,
    | 'id'
    | 'description'
    | 'logo'
    | 'website'
    | 'phone'
    | 'email'
    | 'address'
    | 'city'
    | 'state'
    | 'zip'
    | 'country'
    | 'status'
    | 'plan'
    | 'ownerId'
    | 'settings'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

// Organization model class
class Organization
  extends Model<OrganizationAttributes, OrganizationCreationAttributes>
  implements OrganizationAttributes
{
  declare id: string;
  declare name: string;
  declare slug: string;
  declare description: string | null;
  declare logo: string | null;
  declare website: string | null;
  declare phone: string | null;
  declare email: string | null;
  declare address: string | null;
  declare city: string | null;
  declare state: string | null;
  declare zip: string | null;
  declare country: string;
  declare status: OrganizationStatus;
  declare plan: OrganizationPlan;
  declare ownerId: string | null;
  declare settings: {
    defaultTimezone?: string;
    defaultCurrency?: string;
    allowPublicProfiles?: boolean;
    requireApprovalForDeals?: boolean;
    defaultCommunicationUserId?: string;
    [key: string]: any;
  } | null;
  declare metadata: Record<string, any> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

// Initialize the model
Organization.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        is: /^[a-z0-9-]+$/i, // alphanumeric and hyphens only
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    logo: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'URL to organization logo',
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true,
      },
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING(2),
      allowNull: true,
    },
    zip: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING(2),
      allowNull: false,
      defaultValue: 'US',
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended'),
      allowNull: false,
      defaultValue: 'active',
    },
    plan: {
      type: DataTypes.ENUM('free', 'starter', 'professional', 'enterprise'),
      allowNull: false,
      defaultValue: 'free',
    },
    ownerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'owner_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'Primary owner/admin of the organization',
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Organization settings and preferences',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Flexible metadata for additional fields',
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
    tableName: 'organizations',
    timestamps: true,
    indexes: [
      { fields: ['slug'], unique: true },
      { fields: ['status'] },
      { fields: ['owner_id'] },
      { fields: ['plan'] },
    ],
  }
);

export default Organization;
export { OrganizationAttributes, OrganizationCreationAttributes };
