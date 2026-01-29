/**
 * Deal Action Model
 *
 * Tracks all user actions on deals for ML training:
 * - Views, likes, passes, saves, shares, offers
 * - Pass reasons for learning preferences
 * - Deal snapshots for historical analysis
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import type MarketplaceUser from './MarketplaceUser';

interface DealActionAttributes {
  id: string;
  userId: string;
  dealId: string;
  propertyId?: string;

  actionType: 'view' | 'like' | 'pass' | 'maybe' | 'save' | 'share' | 'offer';

  // For pass actions
  passReason?: string;
  passReasonCustom?: string;

  // For maybe actions
  maybeNotes?: string;

  // For offer actions
  offerId?: string;

  // Engagement metrics
  viewDuration?: number; // milliseconds
  position?: number; // position in feed when shown

  // Deal snapshot at time of action (for ML)
  dealSnapshotPrice?: number;
  dealSnapshotArv?: number;
  dealSnapshotEquity?: number;
  dealSnapshotState?: string;
  dealSnapshotCity?: string;
  dealSnapshotPropertyType?: string;
  dealSnapshotBedrooms?: number;
  dealSnapshotBathrooms?: number;
  dealSnapshotSqft?: number;
  dealSnapshotYearBuilt?: number;
  dealSnapshotCondition?: string;
  dealSnapshotDaysOnMarket?: number;

  // Match context
  matchScore?: number;
  matchedBuyBoxId?: string;

  createdAt: Date;
}

interface DealActionCreationAttributes
  extends Optional<
    DealActionAttributes,
    | 'id'
    | 'propertyId'
    | 'passReason'
    | 'passReasonCustom'
    | 'maybeNotes'
    | 'offerId'
    | 'viewDuration'
    | 'position'
    | 'dealSnapshotPrice'
    | 'dealSnapshotArv'
    | 'dealSnapshotEquity'
    | 'dealSnapshotState'
    | 'dealSnapshotCity'
    | 'dealSnapshotPropertyType'
    | 'dealSnapshotBedrooms'
    | 'dealSnapshotBathrooms'
    | 'dealSnapshotSqft'
    | 'dealSnapshotYearBuilt'
    | 'dealSnapshotCondition'
    | 'dealSnapshotDaysOnMarket'
    | 'matchScore'
    | 'matchedBuyBoxId'
    | 'createdAt'
  > {}

class DealAction
  extends Model<DealActionAttributes, DealActionCreationAttributes>
  implements DealActionAttributes
{
  declare id: string;
  declare userId: string;
  declare dealId: string;
  declare propertyId: string | undefined;

  declare actionType: 'view' | 'like' | 'pass' | 'maybe' | 'save' | 'share' | 'offer';

  declare passReason: string | undefined;
  declare passReasonCustom: string | undefined;
  declare maybeNotes: string | undefined;
  declare offerId: string | undefined;

  declare viewDuration: number | undefined;
  declare position: number | undefined;

  declare dealSnapshotPrice: number | undefined;
  declare dealSnapshotArv: number | undefined;
  declare dealSnapshotEquity: number | undefined;
  declare dealSnapshotState: string | undefined;
  declare dealSnapshotCity: string | undefined;
  declare dealSnapshotPropertyType: string | undefined;
  declare dealSnapshotBedrooms: number | undefined;
  declare dealSnapshotBathrooms: number | undefined;
  declare dealSnapshotSqft: number | undefined;
  declare dealSnapshotYearBuilt: number | undefined;
  declare dealSnapshotCondition: string | undefined;
  declare dealSnapshotDaysOnMarket: number | undefined;

  declare matchScore: number | undefined;
  declare matchedBuyBoxId: string | undefined;

  declare readonly createdAt: Date;

  // Associations
  declare user?: MarketplaceUser;
}

DealAction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    dealId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: true,
      // Note: Properties use integer IDs, so this field may not reference them directly
      // It's kept as UUID for compatibility with UUID-based property systems
    },
    actionType: {
      type: DataTypes.ENUM('view', 'like', 'pass', 'maybe', 'save', 'share', 'offer'),
      allowNull: false,
    },
    passReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    passReasonCustom: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    maybeNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    offerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    viewDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    dealSnapshotPrice: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    dealSnapshotArv: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    dealSnapshotEquity: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    dealSnapshotState: {
      type: DataTypes.STRING(2),
      allowNull: true,
    },
    dealSnapshotCity: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dealSnapshotPropertyType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dealSnapshotBedrooms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    dealSnapshotBathrooms: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    dealSnapshotSqft: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    dealSnapshotYearBuilt: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    dealSnapshotCondition: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dealSnapshotDaysOnMarket: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    matchScore: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    matchedBuyBoxId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'deal_actions',
    timestamps: false,
    indexes: [
      { fields: ['userId'] },
      { fields: ['dealId'] },
      { fields: ['actionType'] },
      { fields: ['userId', 'actionType'] },
      { fields: ['userId', 'dealId'] },
      { fields: ['passReason'] },
      { fields: ['createdAt'] },
      { fields: ['dealSnapshotState'] },
      { fields: ['dealSnapshotPrice'] },
      // View duration indexes for ML queries
      { fields: ['viewDuration'] },
      { fields: ['userId', 'actionType', 'viewDuration'] },
    ],
  }
);

export default DealAction;
