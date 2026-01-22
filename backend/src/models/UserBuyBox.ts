/**
 * User Buy Box Model
 *
 * Comprehensive user-defined criteria for matching deals.
 * Supports multiple investment strategies (Fix & Flip, Long-Term Rental).
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import {
  InvestmentStrategy,
  PropertyType,
  ConditionLevel,
  DealSourcePreference,
  OccupancyStatus,
  CrimeTolerance,
  LeaseType,
  MatchStrictness,
  DeliveryFrequency,
  DeliveryChannel,
} from '../types';

// =============================================================================
// INTERFACES
// =============================================================================

interface UserBuyBoxAttributes {
  id: string;
  userId: string;

  // Basic Info
  name: string;
  active: boolean;
  priority: number;
  investmentStrategies: InvestmentStrategy[];

  // Geographic Criteria
  states: string[];
  cities?: string[];
  zipCodes?: string[];
  radiusCenterZip?: string;
  radiusMiles?: number;

  // Property Types
  propertyTypes: PropertyType[];

  // Price Range
  minPrice?: number;
  maxPrice?: number;

  // Condition
  conditionLevels: ConditionLevel[];

  // Deal Source
  dealSourcePreference: DealSourcePreference;

  // Property Specs
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minYearBuilt?: number;
  minSqft?: number;
  maxSqft?: number;
  minLotSizeSqft?: number;
  maxLotSizeSqft?: number;

  // Garage Requirements
  minGarages?: number;
  maxGarages?: number;
  allowCarport: boolean;

  // Rehab Preferences
  minRehabBudget?: number;
  maxRehabBudget?: number;
  allowStructuralIssues: boolean;
  allowFoundationIssues: boolean;
  allowFireDamage: boolean;

  // Property Features
  allowPool: boolean;
  allowSolarPanels: boolean;
  allowSeptic: boolean;
  allowWell: boolean;

  // Risk Preferences
  allowHoa: boolean;
  maxMonthlyHoa?: number;
  allowLeasingRestrictions: boolean;
  allowAgeRestrictions: boolean;
  allowCodeViolations: boolean;
  allowOpenPermits: boolean;
  allowLiensIfCurable: boolean;
  allowFloodZone: boolean;
  crimeTolerance: CrimeTolerance;
  hardNos?: string; // Free text for absolute deal breakers

  // Location Quality
  minSchoolScore?: number;
  allowMainRoad: boolean;

  // Rental Yield
  minGrossYield?: number;

  // Occupancy Preferences
  occupancyStatuses: OccupancyStatus[];

  // Fix & Flip Strategy Options
  flipMinBelowArvPercent?: number;
  flipMinExpectedProfit?: number;
  flipMaxClosingDays?: number;

  // Long-Term Rental Strategy Options
  rentalMinHoldYears?: number;
  rentalMinMonthlyRent?: number;
  rentalMaxMonthlyRent?: number;
  rentalMinRentToPrice?: number; // e.g., 0.008 for 0.8%
  rentalMinCapRate?: number; // e.g., 0.08 for 8%
  rentalMinCashOnCash?: number; // e.g., 0.10 for 10%
  rentalAllowBelowMarket: boolean;
  rentalLeaseTypes: LeaseType[];

  // Zestimate Pricing
  maxPercentBelowZestimate?: number; // e.g., 10 for 10% below

  // ARV/Equity
  minARV?: number;
  maxARV?: number;
  minEquityPercent?: number;

  // Notification Settings
  matchStrictness: MatchStrictness;
  deliveryFrequency: DeliveryFrequency;
  deliveryChannels: DeliveryChannel[];

  createdAt: Date;
  updatedAt: Date;
}

interface UserBuyBoxCreationAttributes
  extends Optional<
    UserBuyBoxAttributes,
    | 'id'
    | 'active'
    | 'priority'
    | 'investmentStrategies'
    | 'cities'
    | 'zipCodes'
    | 'radiusCenterZip'
    | 'radiusMiles'
    | 'minPrice'
    | 'maxPrice'
    | 'conditionLevels'
    | 'dealSourcePreference'
    | 'minBedrooms'
    | 'maxBedrooms'
    | 'minBathrooms'
    | 'maxBathrooms'
    | 'minYearBuilt'
    | 'minSqft'
    | 'maxSqft'
    | 'minLotSizeSqft'
    | 'maxLotSizeSqft'
    | 'minGarages'
    | 'maxGarages'
    | 'allowCarport'
    | 'minRehabBudget'
    | 'maxRehabBudget'
    | 'allowStructuralIssues'
    | 'allowFoundationIssues'
    | 'allowFireDamage'
    | 'allowPool'
    | 'allowSolarPanels'
    | 'allowSeptic'
    | 'allowWell'
    | 'allowHoa'
    | 'maxMonthlyHoa'
    | 'allowLeasingRestrictions'
    | 'allowAgeRestrictions'
    | 'allowCodeViolations'
    | 'allowOpenPermits'
    | 'allowLiensIfCurable'
    | 'allowFloodZone'
    | 'crimeTolerance'
    | 'hardNos'
    | 'minSchoolScore'
    | 'allowMainRoad'
    | 'minGrossYield'
    | 'occupancyStatuses'
    | 'flipMinBelowArvPercent'
    | 'flipMinExpectedProfit'
    | 'flipMaxClosingDays'
    | 'rentalMinHoldYears'
    | 'rentalMinMonthlyRent'
    | 'rentalMaxMonthlyRent'
    | 'rentalMinRentToPrice'
    | 'rentalMinCapRate'
    | 'rentalMinCashOnCash'
    | 'rentalAllowBelowMarket'
    | 'rentalLeaseTypes'
    | 'maxPercentBelowZestimate'
    | 'minARV'
    | 'maxARV'
    | 'minEquityPercent'
    | 'matchStrictness'
    | 'deliveryFrequency'
    | 'deliveryChannels'
    | 'createdAt'
    | 'updatedAt'
  > {}

// =============================================================================
// MODEL
// =============================================================================

class UserBuyBox
  extends Model<UserBuyBoxAttributes, UserBuyBoxCreationAttributes>
  implements UserBuyBoxAttributes
{
  declare id: string;
  declare userId: string;

  // Basic Info
  declare name: string;
  declare active: boolean;
  declare priority: number;
  declare investmentStrategies: InvestmentStrategy[];

  // Geographic
  declare states: string[];
  declare cities: string[] | undefined;
  declare zipCodes: string[] | undefined;
  declare radiusCenterZip: string | undefined;
  declare radiusMiles: number | undefined;

  // Property Types
  declare propertyTypes: PropertyType[];

  // Price
  declare minPrice: number | undefined;
  declare maxPrice: number | undefined;

  // Condition
  declare conditionLevels: ConditionLevel[];

  // Deal Source
  declare dealSourcePreference: DealSourcePreference;

  // Specs
  declare minBedrooms: number | undefined;
  declare maxBedrooms: number | undefined;
  declare minBathrooms: number | undefined;
  declare maxBathrooms: number | undefined;
  declare minYearBuilt: number | undefined;
  declare minSqft: number | undefined;
  declare maxSqft: number | undefined;
  declare minLotSizeSqft: number | undefined;
  declare maxLotSizeSqft: number | undefined;

  // Garage
  declare minGarages: number | undefined;
  declare maxGarages: number | undefined;
  declare allowCarport: boolean;

  // Rehab
  declare minRehabBudget: number | undefined;
  declare maxRehabBudget: number | undefined;
  declare allowStructuralIssues: boolean;
  declare allowFoundationIssues: boolean;
  declare allowFireDamage: boolean;

  // Property Features
  declare allowPool: boolean;
  declare allowSolarPanels: boolean;
  declare allowSeptic: boolean;
  declare allowWell: boolean;

  // Risk
  declare allowHoa: boolean;
  declare maxMonthlyHoa: number | undefined;
  declare allowLeasingRestrictions: boolean;
  declare allowAgeRestrictions: boolean;
  declare allowCodeViolations: boolean;
  declare allowOpenPermits: boolean;
  declare allowLiensIfCurable: boolean;
  declare allowFloodZone: boolean;
  declare crimeTolerance: CrimeTolerance;
  declare hardNos: string | undefined;

  // Location Quality
  declare minSchoolScore: number | undefined;
  declare allowMainRoad: boolean;

  // Rental Yield
  declare minGrossYield: number | undefined;

  // Occupancy
  declare occupancyStatuses: OccupancyStatus[];

  // Fix & Flip
  declare flipMinBelowArvPercent: number | undefined;
  declare flipMinExpectedProfit: number | undefined;
  declare flipMaxClosingDays: number | undefined;

  // Rental
  declare rentalMinHoldYears: number | undefined;
  declare rentalMinMonthlyRent: number | undefined;
  declare rentalMaxMonthlyRent: number | undefined;
  declare rentalMinRentToPrice: number | undefined;
  declare rentalMinCapRate: number | undefined;
  declare rentalMinCashOnCash: number | undefined;
  declare rentalAllowBelowMarket: boolean;
  declare rentalLeaseTypes: LeaseType[];

  // Zestimate
  declare maxPercentBelowZestimate: number | undefined;

  // ARV/Equity
  declare minARV: number | undefined;
  declare maxARV: number | undefined;
  declare minEquityPercent: number | undefined;

  // Notifications
  declare matchStrictness: MatchStrictness;
  declare deliveryFrequency: DeliveryFrequency;
  declare deliveryChannels: DeliveryChannel[];

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if this buy box uses Fix & Flip strategy
   */
  isFixAndFlip(): boolean {
    return this.investmentStrategies.includes('fix_and_flip');
  }

  /**
   * Check if this buy box uses Long-Term Rental strategy
   */
  isLongTermRental(): boolean {
    return this.investmentStrategies.includes('long_term_rental');
  }
}

UserBuyBox.init(
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

    // Basic Info
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      validate: { min: 1, max: 10 },
    },
    investmentStrategies: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: ['fix_and_flip'],
    },

    // Geographic
    states: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
    cities: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    zipCodes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    radiusCenterZip: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    radiusMiles: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // Property Types
    propertyTypes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: ['single_family'],
    },

    // Price
    minPrice: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    maxPrice: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // Condition
    conditionLevels: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: ['any'],
    },

    // Deal Source
    dealSourcePreference: {
      type: DataTypes.STRING,
      defaultValue: 'both',
    },

    // Specs
    minBedrooms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    maxBedrooms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    minBathrooms: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    maxBathrooms: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    minYearBuilt: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    minSqft: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    maxSqft: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    minLotSizeSqft: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    maxLotSizeSqft: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // Garage Requirements
    minGarages: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    maxGarages: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    allowCarport: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    // Rehab
    minRehabBudget: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    maxRehabBudget: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    allowStructuralIssues: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    allowFoundationIssues: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    allowFireDamage: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    // Property Features
    allowPool: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    allowSolarPanels: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    allowSeptic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    allowWell: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    // Risk
    allowHoa: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    maxMonthlyHoa: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    allowLeasingRestrictions: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    allowAgeRestrictions: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    allowCodeViolations: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    allowOpenPermits: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    allowLiensIfCurable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    allowFloodZone: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    crimeTolerance: {
      type: DataTypes.STRING,
      defaultValue: 'medium',
    },
    hardNos: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Location Quality
    minSchoolScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1, max: 10 },
    },
    allowMainRoad: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    // Rental Yield
    minGrossYield: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    // Occupancy
    occupancyStatuses: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: ['vacant_only', 'vacant_preferred'],
    },

    // Fix & Flip
    flipMinBelowArvPercent: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    flipMinExpectedProfit: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    flipMaxClosingDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // Rental
    rentalMinHoldYears: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rentalMinMonthlyRent: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rentalMaxMonthlyRent: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rentalMinRentToPrice: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    rentalMinCapRate: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    rentalMinCashOnCash: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    rentalAllowBelowMarket: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    rentalLeaseTypes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: ['fixed_term'],
    },

    // Zestimate
    maxPercentBelowZestimate: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    // ARV/Equity
    minARV: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    maxARV: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    minEquityPercent: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    // Notifications
    matchStrictness: {
      type: DataTypes.STRING,
      defaultValue: 'flexible',
    },
    deliveryFrequency: {
      type: DataTypes.STRING,
      defaultValue: 'daily',
    },
    deliveryChannels: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: ['email', 'in_app'],
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
    tableName: 'user_buy_boxes',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['active'] },
      { fields: ['states'] },
      { fields: ['priority'] },
      { fields: ['investmentStrategies'] },
      { fields: ['propertyTypes'] },
    ],
  }
);

export default UserBuyBox;
export { UserBuyBoxAttributes, UserBuyBoxCreationAttributes };
// Re-export types from shared types module for backwards compatibility
export type {
  InvestmentStrategy,
  PropertyType,
  ConditionLevel,
  DealSourcePreference,
  OccupancyStatus,
  CrimeTolerance,
  LeaseType,
  MatchStrictness,
  DeliveryFrequency,
  DeliveryChannel,
} from '../types';
