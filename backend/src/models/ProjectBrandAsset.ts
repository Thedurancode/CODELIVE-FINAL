/**
 * ProjectBrandAsset Model
 *
 * Stores brand assets (logos, images, icons) for projects.
 * Supports different variants (light, dark, etc.) and categories.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Asset types
export type BrandAssetType = 'logo' | 'icon' | 'banner' | 'favicon' | 'watermark' | 'background' | 'other';
export type BrandAssetVariant = 'default' | 'light' | 'dark' | 'monochrome' | 'colored' | 'transparent';

export interface ProjectBrandAssetAttributes {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  name: string;
  description: string | null;
  assetType: BrandAssetType;
  variant: BrandAssetVariant;
  storageUrl: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectBrandAssetCreationAttributes
  extends Optional<
    ProjectBrandAssetAttributes,
    'id' | 'description' | 'width' | 'height' | 'isPrimary' | 'sortOrder' | 'metadata' | 'createdAt' | 'updatedAt'
  > {}

class ProjectBrandAsset
  extends Model<ProjectBrandAssetAttributes, ProjectBrandAssetCreationAttributes>
  implements ProjectBrandAssetAttributes
{
  declare id: number;
  declare projectId: string;
  declare userId: string;
  declare organizationId: string;
  declare name: string;
  declare description: string | null;
  declare assetType: BrandAssetType;
  declare variant: BrandAssetVariant;
  declare storageUrl: string;
  declare storagePath: string;
  declare mimeType: string;
  declare fileSize: number;
  declare width: number | null;
  declare height: number | null;
  declare isPrimary: boolean;
  declare sortOrder: number;
  declare metadata: Record<string, unknown> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual field populated by association
  declare author?: {
    id: string;
    name?: string;
    email?: string;
  };

  /**
   * Get display name for asset type
   */
  getTypeDisplayName(): string {
    const typeNames: Record<BrandAssetType, string> = {
      logo: 'Logo',
      icon: 'Icon',
      banner: 'Banner',
      favicon: 'Favicon',
      watermark: 'Watermark',
      background: 'Background',
      other: 'Other',
    };
    return typeNames[this.assetType] || 'Asset';
  }

  /**
   * Get display name for variant
   */
  getVariantDisplayName(): string {
    const variantNames: Record<BrandAssetVariant, string> = {
      default: 'Default',
      light: 'Light',
      dark: 'Dark',
      monochrome: 'Monochrome',
      colored: 'Colored',
      transparent: 'Transparent',
    };
    return variantNames[this.variant] || 'Default';
  }

  /**
   * Get full display name (e.g., "Logo - Dark")
   */
  getFullDisplayName(): string {
    if (this.variant === 'default') {
      return this.getTypeDisplayName();
    }
    return `${this.getTypeDisplayName()} - ${this.getVariantDisplayName()}`;
  }
}

ProjectBrandAsset.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    projectId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'project_id',
      references: {
        model: 'projects',
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    assetType: {
      type: DataTypes.ENUM('logo', 'icon', 'banner', 'favicon', 'watermark', 'background', 'other'),
      allowNull: false,
      field: 'asset_type',
      defaultValue: 'logo',
    },
    variant: {
      type: DataTypes.ENUM('default', 'light', 'dark', 'monochrome', 'colored', 'transparent'),
      allowNull: false,
      defaultValue: 'default',
    },
    storageUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'storage_url',
    },
    storagePath: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'storage_path',
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'mime_type',
    },
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'file_size',
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_primary',
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'sort_order',
    },
    metadata: {
      type: DataTypes.JSONB,
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
    tableName: 'project_brand_assets',
    modelName: 'ProjectBrandAsset',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['user_id'] },
      { fields: ['organization_id'] },
      { fields: ['project_id', 'organization_id'] },
      { fields: ['project_id', 'asset_type'] },
      { fields: ['project_id', 'asset_type', 'variant'] },
      { fields: ['project_id', 'is_primary'] },
      { fields: ['sort_order'] },
      { fields: ['created_at'] },
    ],
  }
);

export default ProjectBrandAsset;
