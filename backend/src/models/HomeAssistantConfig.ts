/**
 * Home Assistant Configuration Model
 *
 * Stores Home Assistant instance configurations per user/organization.
 * Tokens are stored encrypted for security.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface HomeAssistantConfigAttributes {
  id: string;
  name: string;
  url: string;
  encryptedToken: string;
  userId: string | null;
  organizationId: string | null;
  isDefault: boolean;
  isActive: boolean;
  lastConnected: Date | null;
  lastError: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

interface HomeAssistantConfigCreationAttributes
  extends Optional<
    HomeAssistantConfigAttributes,
    'id' | 'userId' | 'organizationId' | 'isDefault' | 'isActive' | 'lastConnected' | 'lastError' | 'metadata' | 'createdAt' | 'updatedAt'
  > {}

class HomeAssistantConfig
  extends Model<HomeAssistantConfigAttributes, HomeAssistantConfigCreationAttributes>
  implements HomeAssistantConfigAttributes
{
  declare id: string;
  declare name: string;
  declare url: string;
  declare encryptedToken: string;
  declare userId: string | null;
  declare organizationId: string | null;
  declare isDefault: boolean;
  declare isActive: boolean;
  declare lastConnected: Date | null;
  declare lastError: string | null;
  declare metadata: Record<string, any> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

HomeAssistantConfig.init(
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
    url: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isUrl: true,
      },
    },
    encryptedToken: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    lastConnected: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastError: {
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
    tableName: 'home_assistant_configs',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['organizationId'] },
      { fields: ['isDefault'] },
      { fields: ['isActive'] },
    ],
  }
);

export default HomeAssistantConfig;
