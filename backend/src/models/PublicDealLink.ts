import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface PublicDealSettings {
  showFinancials: boolean;
  showPropertyDetails: boolean;
  showOccupancy: boolean;
  showFeatures: boolean;
  showDocuments: boolean;
  showCompliance: boolean;
  showViewers: boolean;
  showBuyers: boolean;
  showOffers: boolean;
  showSkipTrace: boolean;
  showContacts: boolean;
  showDiscussion: boolean;
  showPhotos: boolean;
}

interface PublicDealLinkAttributes {
  id: number;
  propertyId: number;
  token: string;
  settings: PublicDealSettings;
  expiresAt: Date | null;
  createdBy: string;
  isActive: boolean;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PublicDealLinkCreationAttributes
  extends Optional<PublicDealLinkAttributes, 'id' | 'expiresAt' | 'isActive' | 'viewCount' | 'createdAt' | 'updatedAt'> {}

class PublicDealLink extends Model<PublicDealLinkAttributes, PublicDealLinkCreationAttributes> implements PublicDealLinkAttributes {
  public id!: number;
  public propertyId!: number;
  public token!: string;
  public settings!: PublicDealSettings;
  public expiresAt!: Date | null;
  public createdBy!: string;
  public isActive!: boolean;
  public viewCount!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Check if the link is valid (active and not expired)
   */
  public isValid(): boolean {
    if (!this.isActive) {
      return false;
    }

    if (this.expiresAt && new Date() > this.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Increment view count
   */
  public async incrementViewCount(): Promise<void> {
    this.viewCount += 1;
    await this.save();
  }

  /**
   * Generate a random token
   */
  public static generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }
}

PublicDealLink.init(
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
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        showFinancials: true,
        showPropertyDetails: true,
        showOccupancy: true,
        showFeatures: true,
        showDocuments: true,
        showCompliance: true,
        showViewers: true,
        showBuyers: true,
        showOffers: true,
        showSkipTrace: true,
        showContacts: true,
        showDiscussion: true,
        showPhotos: true,
      },
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    viewCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'view_count',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'public_deal_links',
    timestamps: true,
    underscored: true,
  }
);

export default PublicDealLink;
