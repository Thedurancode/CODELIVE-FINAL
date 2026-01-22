/**
 * Investor Action Model
 *
 * Tracks investor behavior on properties for behavior-based learning.
 * Used to learn which criteria actually matter for deal success.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// =============================================================================
// TYPES
// =============================================================================

export type ActionType =
  | 'viewed'           // Investor looked at the property
  | 'saved'            // Investor saved/bookmarked
  | 'requested_info'   // Investor requested more info
  | 'bid'              // Investor placed a bid
  | 'offer_accepted'   // Offer was accepted
  | 'closed'           // Deal closed successfully
  | 'passed'           // Investor explicitly passed
  | 'rejected'         // Investor rejected after review
  | 'expired'          // Deal expired without action
  | 'lost_to_competitor'; // Lost to another buyer

export type ActionOutcome =
  | 'positive'   // Actions that indicate interest (viewed, saved, bid, closed)
  | 'negative'   // Actions that indicate rejection (passed, rejected)
  | 'neutral';   // Actions with unclear intent (expired, lost)

// =============================================================================
// INTERFACES
// =============================================================================

interface InvestorActionAttributes {
  id: string;

  // Who did what on which property
  investorId: string;      // User or Fund ID
  investorType: 'user' | 'fund';
  buyBoxId: string;        // Which buy box was matched
  propertyId: string;      // Which property

  // The action
  action: ActionType;
  outcome: ActionOutcome;

  // Property snapshot at time of action (for learning)
  propertySnapshot: {
    state: string;
    price: number;
    propertyType: string;
    bedrooms: number;
    bathrooms: number;
    sqft: number;
    yearBuilt: number;
    hasHoa: boolean;
    hasPool: boolean;
    hasSeptic: boolean;
    hasWell: boolean;
    inFloodZone: boolean;
    hasStructuralIssues: boolean;
    occupancyStatus: string;
    daysOnMarket: number;
    pricePerSqft: number;
    // Computed metrics
    matchScore: number;       // Original match score
    arvSpread?: number;       // (ARV - Price) / ARV
    capRate?: number;
    rentToPrice?: number;
  };

  // Buy box criteria snapshot (for comparing what was requested vs what was acted on)
  buyBoxSnapshot: {
    states: string[];
    minPrice: number;
    maxPrice: number;
    propertyTypes: string[];
    minBedrooms: number;
    maxBedrooms: number;
    investmentStrategies: string[];
  };

  // Metadata
  source?: string;         // Where the action came from (web, api, email, etc.)
  notes?: string;          // Optional notes
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

interface InvestorActionCreationAttributes
  extends Optional<
    InvestorActionAttributes,
    'id' | 'outcome' | 'source' | 'notes' | 'metadata' | 'createdAt' | 'updatedAt'
  > {}

// =============================================================================
// MODEL
// =============================================================================

class InvestorAction
  extends Model<InvestorActionAttributes, InvestorActionCreationAttributes>
  implements InvestorActionAttributes
{
  declare id: string;
  declare investorId: string;
  declare investorType: 'user' | 'fund';
  declare buyBoxId: string;
  declare propertyId: string;
  declare action: ActionType;
  declare outcome: ActionOutcome;
  declare propertySnapshot: InvestorActionAttributes['propertySnapshot'];
  declare buyBoxSnapshot: InvestorActionAttributes['buyBoxSnapshot'];
  declare source: string | undefined;
  declare notes: string | undefined;
  declare metadata: Record<string, unknown> | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Determine outcome from action type
   */
  static getOutcomeForAction(action: ActionType): ActionOutcome {
    switch (action) {
      case 'viewed':
      case 'saved':
      case 'requested_info':
      case 'bid':
      case 'offer_accepted':
      case 'closed':
        return 'positive';
      case 'passed':
      case 'rejected':
        return 'negative';
      case 'expired':
      case 'lost_to_competitor':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  /**
   * Check if this action indicates a successful deal
   */
  isSuccess(): boolean {
    return this.action === 'closed';
  }

  /**
   * Check if this action indicates strong interest
   */
  isStrongInterest(): boolean {
    return ['bid', 'offer_accepted', 'closed'].includes(this.action);
  }

  /**
   * Check if this action indicates rejection
   */
  isRejection(): boolean {
    return ['passed', 'rejected'].includes(this.action);
  }
}

InvestorAction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    investorId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    investorType: {
      type: DataTypes.ENUM('user', 'fund'),
      allowNull: false,
      defaultValue: 'fund',
    },
    buyBoxId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'properties',
        key: 'id',
      },
    },
    action: {
      type: DataTypes.ENUM(
        'viewed',
        'saved',
        'requested_info',
        'bid',
        'offer_accepted',
        'closed',
        'passed',
        'rejected',
        'expired',
        'lost_to_competitor'
      ),
      allowNull: false,
    },
    outcome: {
      type: DataTypes.ENUM('positive', 'negative', 'neutral'),
      allowNull: false,
      defaultValue: 'neutral',
    },
    propertySnapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    buyBoxSnapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
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
    tableName: 'investor_actions',
    timestamps: true,
    indexes: [
      { fields: ['investorId'] },
      { fields: ['buyBoxId'] },
      { fields: ['propertyId'] },
      { fields: ['action'] },
      { fields: ['outcome'] },
      { fields: ['createdAt'] },
      // Composite indexes for learning queries
      { fields: ['buyBoxId', 'action'] },
      { fields: ['buyBoxId', 'outcome'] },
      { fields: ['investorId', 'action', 'createdAt'] },
    ],
  }
);

export default InvestorAction;
export { InvestorActionAttributes, InvestorActionCreationAttributes };
