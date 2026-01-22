/**
 * Fund Feedback Model
 *
 * Tracks fund responses to deal submissions for ML training:
 * - Response type (interested, passed, offer made, closed)
 * - Deal snapshot at submission time
 * - Scoring context for feature engineering
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type FundResponseType =
  | 'interested'
  | 'passed'
  | 'offer_made'
  | 'offer_accepted'
  | 'closed'
  | 'no_response';

// Loss categories for win/loss analysis
export const LOSS_CATEGORIES = [
  'price',
  'condition',
  'location',
  'competition',
  'timing',
  'financing',
  'other',
] as const;

export type LossCategory = (typeof LOSS_CATEGORIES)[number];

export interface DealSnapshot {
  price: number;
  arv?: number;
  equity?: number;
  state: string;
  city?: string;
  county?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  yearBuilt?: number;
  condition?: string;
  occupancyStatus?: string;
  daysOnMarket?: number;
  photoCount?: number;
}

interface FundFeedbackAttributes {
  id: string;
  dealId: string;
  propertyId?: string;
  buyBoxId: string;
  fundName: string;

  // Submission tracking
  submittedAt: Date;
  submissionScore: number;

  // Fund response
  responseType: FundResponseType;
  responseAt?: Date;
  responseNotes?: string;

  // Offer details
  offerAmount?: number;
  askingPrice?: number;

  // Snapshots for ML training
  dealSnapshot: DealSnapshot;
  buyBoxSnapshot?: Record<string, any>;

  // Win/Loss Analysis fields
  lossCategory?: LossCategory;
  winFactors?: string[];
  scoreAccuracy?: number;
  lessonsLearned?: string;
  applyToFutureBuyBox: boolean;

  createdAt: Date;
  updatedAt: Date;
}

interface FundFeedbackCreationAttributes
  extends Optional<
    FundFeedbackAttributes,
    | 'id'
    | 'propertyId'
    | 'responseAt'
    | 'responseNotes'
    | 'offerAmount'
    | 'askingPrice'
    | 'buyBoxSnapshot'
    | 'lossCategory'
    | 'winFactors'
    | 'scoreAccuracy'
    | 'lessonsLearned'
    | 'applyToFutureBuyBox'
    | 'createdAt'
    | 'updatedAt'
  > {}

class FundFeedback
  extends Model<FundFeedbackAttributes, FundFeedbackCreationAttributes>
  implements FundFeedbackAttributes
{
  declare id: string;
  declare dealId: string;
  declare propertyId: string | undefined;
  declare buyBoxId: string;
  declare fundName: string;

  declare submittedAt: Date;
  declare submissionScore: number;

  declare responseType: FundResponseType;
  declare responseAt: Date | undefined;
  declare responseNotes: string | undefined;

  declare offerAmount: number | undefined;
  declare askingPrice: number | undefined;

  declare dealSnapshot: DealSnapshot;
  declare buyBoxSnapshot: Record<string, any> | undefined;

  // Win/Loss Analysis fields
  declare lossCategory: LossCategory | undefined;
  declare winFactors: string[] | undefined;
  declare scoreAccuracy: number | undefined;
  declare lessonsLearned: string | undefined;
  declare applyToFutureBuyBox: boolean;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if this feedback represents a positive outcome for ML training
   */
  isPositiveOutcome(): boolean {
    return ['offer_accepted', 'closed'].includes(this.responseType);
  }

  /**
   * Check if this feedback represents a negative outcome for ML training
   */
  isNegativeOutcome(): boolean {
    return this.responseType === 'passed' ||
      (this.responseType === 'no_response' && this.isStale());
  }

  /**
   * Check if feedback is stale (no response after 14 days)
   */
  isStale(): boolean {
    const staleDays = 14;
    const staleDate = new Date(this.submittedAt);
    staleDate.setDate(staleDate.getDate() + staleDays);
    return new Date() > staleDate && this.responseType === 'no_response';
  }
}

FundFeedback.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
    buyBoxId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fundName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    submissionScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    responseType: {
      type: DataTypes.ENUM(
        'interested',
        'passed',
        'offer_made',
        'offer_accepted',
        'closed',
        'no_response'
      ),
      allowNull: false,
      defaultValue: 'no_response',
    },
    responseAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    responseNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    offerAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    askingPrice: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    dealSnapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    buyBoxSnapshot: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    // Win/Loss Analysis fields
    lossCategory: {
      type: DataTypes.ENUM(...LOSS_CATEGORIES),
      allowNull: true,
    },
    winFactors: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    scoreAccuracy: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    lessonsLearned: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    applyToFutureBuyBox: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    tableName: 'fund_feedback',
    timestamps: true,
    indexes: [
      { fields: ['dealId'] },
      { fields: ['buyBoxId'] },
      { fields: ['fundName'] },
      { fields: ['responseType'] },
      { fields: ['submittedAt'] },
      { fields: ['createdAt'] },
      // Composite indexes for training queries
      { fields: ['responseType', 'createdAt'] },
      { fields: ['buyBoxId', 'responseType'] },
      // Win/Loss analysis indexes
      { fields: ['lossCategory'] },
      { fields: ['applyToFutureBuyBox'] },
    ],
  }
);

export default FundFeedback;
