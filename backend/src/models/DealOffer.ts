/**
 * Deal Offer Model
 *
 * Tracks offers made by marketplace users on deals
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface DealOfferAttributes {
  id: string;
  userId: string;
  dealId: string;
  propertyId?: string;

  // Offer details
  offerAmount: number;
  earnestMoney?: number;
  closingDays: number;
  contingencies: string[];
  notes?: string;

  // Finance
  financeType: 'cash' | 'hard_money' | 'conventional' | 'other';
  proofOfFunds: boolean;
  preApprovalLetter: boolean;

  // Status
  status: 'pending' | 'viewed' | 'countered' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';

  // Counter offer
  counterOfferAmount?: number;
  counterOfferClosingDays?: number;
  counterOfferNotes?: string;
  counterOfferAt?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  viewedAt?: Date;
  respondedAt?: Date;
}

interface DealOfferCreationAttributes
  extends Optional<
    DealOfferAttributes,
    | 'id'
    | 'propertyId'
    | 'earnestMoney'
    | 'notes'
    | 'proofOfFunds'
    | 'preApprovalLetter'
    | 'status'
    | 'counterOfferAmount'
    | 'counterOfferClosingDays'
    | 'counterOfferNotes'
    | 'counterOfferAt'
    | 'createdAt'
    | 'updatedAt'
    | 'viewedAt'
    | 'respondedAt'
  > {}

class DealOffer
  extends Model<DealOfferAttributes, DealOfferCreationAttributes>
  implements DealOfferAttributes
{
  public id!: string;
  public userId!: string;
  public dealId!: string;
  public propertyId?: string;

  public offerAmount!: number;
  public earnestMoney?: number;
  public closingDays!: number;
  public contingencies!: string[];
  public notes?: string;

  public financeType!: 'cash' | 'hard_money' | 'conventional' | 'other';
  public proofOfFunds!: boolean;
  public preApprovalLetter!: boolean;

  public status!: 'pending' | 'viewed' | 'countered' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';

  public counterOfferAmount?: number;
  public counterOfferClosingDays?: number;
  public counterOfferNotes?: string;
  public counterOfferAt?: Date;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public expiresAt!: Date;
  public viewedAt?: Date;
  public respondedAt?: Date;
}

DealOffer.init(
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
    offerAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    earnestMoney: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    closingDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 14,
    },
    contingencies: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    financeType: {
      type: DataTypes.ENUM('cash', 'hard_money', 'conventional', 'other'),
      defaultValue: 'cash',
    },
    proofOfFunds: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    preApprovalLetter: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'viewed', 'countered', 'accepted', 'rejected', 'expired', 'withdrawn'),
      defaultValue: 'pending',
    },
    counterOfferAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    counterOfferClosingDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    counterOfferNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    counterOfferAt: {
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
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    viewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    respondedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'deal_offers',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['dealId'] },
      { fields: ['status'] },
      { fields: ['userId', 'status'] },
      { fields: ['dealId', 'status'] },
      { fields: ['expiresAt'] },
      { fields: ['createdAt'] },
    ],
  }
);

export default DealOffer;
