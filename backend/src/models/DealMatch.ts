/**
 * Deal Match Model
 *
 * Tracks when a user "matches" with a deal based on ML predictions
 * and buy box criteria. A match occurs when:
 * - ML confidence is high (>= 85%)
 * - Buy box match score is excellent (>= 95%)
 * - User super-liked the deal
 * - Deal is a priority buy box match
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface DealMatchAttributes {
  id: string;
  userId: string;
  dealId: string;
  propertyId?: string;

  // Match details
  matchType: 'ml_prediction' | 'buybox_score' | 'super_like' | 'priority_match';
  matchScore: number; // 0-100
  mlConfidence?: number; // ML prediction confidence
  buyBoxScore?: number; // Buy box match percentage

  // Match reasons
  matchReasons: string[];

  // Action that triggered the match
  actionId?: string; // Reference to DealAction
  actionType: 'like' | 'super_like';

  // Status
  status: 'new' | 'viewed' | 'contacted' | 'offered' | 'closed';
  viewedAt?: Date;
  contactedAt?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface DealMatchCreationAttributes
  extends Optional<
    DealMatchAttributes,
    | 'id'
    | 'propertyId'
    | 'mlConfidence'
    | 'buyBoxScore'
    | 'actionId'
    | 'status'
    | 'viewedAt'
    | 'contactedAt'
    | 'createdAt'
    | 'updatedAt'
  > {}

class DealMatch
  extends Model<DealMatchAttributes, DealMatchCreationAttributes>
  implements DealMatchAttributes
{
  declare id: string;
  declare userId: string;
  declare dealId: string;
  declare propertyId: string | undefined;

  declare matchType: 'ml_prediction' | 'buybox_score' | 'super_like' | 'priority_match';
  declare matchScore: number;
  declare mlConfidence: number | undefined;
  declare buyBoxScore: number | undefined;

  declare matchReasons: string[];

  declare actionId: string | undefined;
  declare actionType: 'like' | 'super_like';

  declare status: 'new' | 'viewed' | 'contacted' | 'offered' | 'closed';
  declare viewedAt: Date | undefined;
  declare contactedAt: Date | undefined;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

DealMatch.init(
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
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'properties',
        key: 'id',
      },
    },
    matchType: {
      type: DataTypes.ENUM('ml_prediction', 'buybox_score', 'super_like', 'priority_match'),
      allowNull: false,
    },
    matchScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    mlConfidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    buyBoxScore: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    matchReasons: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    actionId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    actionType: {
      type: DataTypes.ENUM('like', 'super_like'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('new', 'viewed', 'contacted', 'offered', 'closed'),
      allowNull: false,
      defaultValue: 'new',
    },
    viewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    contactedAt: {
      type: DataTypes.DATE,
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
    tableName: 'deal_matches',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['dealId'] },
      { fields: ['userId', 'dealId'], unique: true },
      { fields: ['matchType'] },
      { fields: ['matchScore'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
    ],
  }
);

export default DealMatch;
