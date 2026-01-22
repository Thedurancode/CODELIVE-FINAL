/**
 * PropertyLookup Model
 *
 * Stores full property lookup data from RapidAPI Zillow to:
 * - Reduce API costs by caching lookups in the database
 * - Build historical records of property data
 * - Enable analytics on researched properties
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Interface for the full lookup data stored as JSONB
export interface PropertyLookupAttributes {
  id: number;

  // Primary identifiers
  zpid: string;
  address: string;
  normalizedAddress: string; // Lowercase, no special chars for matching
  city: string;
  state: string;
  zip: string;

  // Property data summary (for quick queries without parsing JSONB)
  zestimate?: number;
  rentZestimate?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  yearBuilt?: number;
  propertyType?: string;

  // Full lookup data (stored as JSONB)
  propertyData: object;      // Full PropertyMarketData
  skipTraceData?: object;    // Full SkipTraceData
  imagesData?: object;       // Full PropertyImages
  priceHistoryData?: object; // Full PriceHistoryData
  taxHistoryData?: object;   // Full TaxHistoryData
  taxAssessmentChartData?: object;
  taxPaidChartData?: object;
  comparablesData?: object;  // Full ComparableHomesData

  // Lookup metadata
  lookupCount: number;       // How many times this property was looked up
  lastLookupAt: Date;
  dataFreshness: number;     // Days since data was fetched
  confidence: number;        // Data confidence score
  dataSource: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface PropertyLookupCreationAttributes extends Optional<PropertyLookupAttributes,
  'id' | 'createdAt' | 'updatedAt' | 'lookupCount' | 'dataFreshness'> {}

class PropertyLookup extends Model<PropertyLookupAttributes, PropertyLookupCreationAttributes>
  implements PropertyLookupAttributes {

  // Using 'declare' instead of 'public' to avoid Sequelize class field shadowing
  // See: https://sequelize.org/main/manual/model-basics.html#caveat-with-public-class-fields
  declare id: number;
  declare zpid: string;
  declare address: string;
  declare normalizedAddress: string;
  declare city: string;
  declare state: string;
  declare zip: string;

  declare zestimate: number | undefined;
  declare rentZestimate: number | undefined;
  declare bedrooms: number | undefined;
  declare bathrooms: number | undefined;
  declare sqft: number | undefined;
  declare yearBuilt: number | undefined;
  declare propertyType: string | undefined;

  declare propertyData: object;
  declare skipTraceData: object | undefined;
  declare imagesData: object | undefined;
  declare priceHistoryData: object | undefined;
  declare taxHistoryData: object | undefined;
  declare taxAssessmentChartData: object | undefined;
  declare taxPaidChartData: object | undefined;
  declare comparablesData: object | undefined;

  declare lookupCount: number;
  declare lastLookupAt: Date;
  declare dataFreshness: number;
  declare confidence: number;
  declare dataSource: string;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // ============================================================================
  // STATIC METHODS
  // ============================================================================

  /**
   * Find a lookup by ZPID
   */
  static async findByZpid(zpid: string): Promise<PropertyLookup | null> {
    return PropertyLookup.findOne({ where: { zpid } });
  }

  /**
   * Find a lookup by address (normalized)
   */
  static async findByAddress(address: string): Promise<PropertyLookup | null> {
    const normalized = PropertyLookup.normalizeAddress(address);
    return PropertyLookup.findOne({ where: { normalizedAddress: normalized } });
  }

  /**
   * Find lookups by city/state
   */
  static async findByLocation(city: string, state: string): Promise<PropertyLookup[]> {
    return PropertyLookup.findAll({
      where: {
        city: city.toLowerCase(),
        state: state.toUpperCase(),
      },
      order: [['lastLookupAt', 'DESC']],
    });
  }

  /**
   * Get recent lookups
   */
  static async getRecent(limit: number = 20): Promise<PropertyLookup[]> {
    return PropertyLookup.findAll({
      order: [['lastLookupAt', 'DESC']],
      limit,
    });
  }

  /**
   * Check if data is stale (older than maxAgeDays)
   */
  isStale(maxAgeDays: number = 7): boolean {
    // If no lastLookupAt, consider it stale
    if (!this.lastLookupAt) {
      return true;
    }
    const ageMs = Date.now() - this.lastLookupAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays > maxAgeDays;
  }

  /**
   * Normalize address for consistent matching
   */
  static normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 100);
  }

  /**
   * Increment lookup count and update timestamp
   */
  async recordLookup(): Promise<void> {
    this.lookupCount += 1;
    this.lastLookupAt = new Date();
    await this.save();
  }
}

PropertyLookup.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    zpid: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    address: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    normalizedAddress: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING(2),
      allowNull: false,
    },
    zip: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },

    // Property summary
    zestimate: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rentZestimate: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    bedrooms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    bathrooms: {
      type: DataTypes.DECIMAL(3, 1),
      allowNull: true,
    },
    sqft: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    yearBuilt: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    propertyType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    // Full lookup data (JSONB for PostgreSQL)
    propertyData: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    skipTraceData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    imagesData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    priceHistoryData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    taxHistoryData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    taxAssessmentChartData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    taxPaidChartData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    comparablesData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    // Metadata
    lookupCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    lastLookupAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    dataFreshness: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    confidence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    dataSource: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'rapidapi-zillow',
    },

    // Timestamps
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'PropertyLookup',
    tableName: 'property_lookups',
    timestamps: true,
    indexes: [
      { fields: ['zpid'], unique: true },
      { fields: ['normalizedAddress'], unique: true },
      { fields: ['city', 'state'] },
      { fields: ['state'] },
      { fields: ['lastLookupAt'] },
      { fields: ['zestimate'] },
    ],
  }
);

export default PropertyLookup;
