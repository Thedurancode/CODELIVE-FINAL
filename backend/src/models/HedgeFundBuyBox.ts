/**
 * Hedge Fund Buy Box Model
 *
 * Persists hedge fund buy box configurations to the database.
 * Used by the ScoringEngine for deal matching.
 * Supports comprehensive criteria including investment strategies,
 * risk preferences, and strategy-specific options.
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
  MarketContact,
  BuyBoxCriteria as SharedBuyBoxCriteria,
  ScoringWeights as SharedScoringWeights,
  HardRequirements,
} from '../types';

// =============================================================================
// INTERFACES
// =============================================================================

// Use shared types from types/index.ts
type ScoringWeights = SharedScoringWeights;

// Extended BuyBoxCriteria with legacy support fields
interface BuyBoxCriteria extends SharedBuyBoxCriteria {
  // Legacy support fields
  allowedOccupancy?: string[];
  excludedOccupancy?: string[];
  maxEquity?: number;
}

interface HedgeFundBuyBoxAttributes {
  id: string;
  name: string;
  description?: string;
  fundId?: string;
  fundName?: string;
  fundType?: string;
  contactEmail?: string;
  contactPhone?: string;
  marketContacts?: MarketContact[];
  enabled: boolean;
  priority: number;
  criteria: BuyBoxCriteria;
  scoringWeights: ScoringWeights;
  autoSubmit: boolean;
  autoSubmitThreshold: number;
  version: number; // Optimistic locking version
  createdAt: Date;
  updatedAt: Date;
}

interface HedgeFundBuyBoxCreationAttributes
  extends Optional<
    HedgeFundBuyBoxAttributes,
    | 'id'
    | 'description'
    | 'fundId'
    | 'fundName'
    | 'fundType'
    | 'contactEmail'
    | 'contactPhone'
    | 'marketContacts'
    | 'enabled'
    | 'autoSubmit'
    | 'autoSubmitThreshold'
    | 'version'
    | 'createdAt'
    | 'updatedAt'
  > {}

class HedgeFundBuyBox
  extends Model<HedgeFundBuyBoxAttributes, HedgeFundBuyBoxCreationAttributes>
  implements HedgeFundBuyBoxAttributes
{
  declare id: string;
  declare name: string;
  declare description: string | undefined;
  declare fundId: string | undefined;
  declare fundName: string | undefined;
  declare fundType: string | undefined;
  declare contactEmail: string | undefined;
  declare contactPhone: string | undefined;
  declare marketContacts: MarketContact[] | undefined;
  declare enabled: boolean;
  declare priority: number;
  declare criteria: BuyBoxCriteria;
  declare scoringWeights: ScoringWeights;
  declare autoSubmit: boolean;
  declare autoSubmitThreshold: number;
  declare version: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if this buy box uses Fix & Flip strategy
   */
  isFixAndFlip(): boolean {
    return this.criteria.investmentStrategies?.includes('fix_and_flip') ?? false;
  }

  /**
   * Check if this buy box uses Long-Term Rental strategy
   */
  isLongTermRental(): boolean {
    return this.criteria.investmentStrategies?.includes('long_term_rental') ?? false;
  }

  /**
   * Convert to the BuyBox type expected by ScoringEngine
   */
  toBuyBox() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      fundName: this.fundName,
      fundType: this.fundType,
      contactEmail: this.contactEmail,
      contactPhone: this.contactPhone,
      marketContacts: this.marketContacts,
      enabled: this.enabled,
      priority: this.priority,
      criteria: this.criteria,
      scoringWeights: this.scoringWeights,
      autoSubmit: this.autoSubmit,
      autoSubmitThreshold: this.autoSubmitThreshold,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Get the contact for a specific market/region (simple string match)
   * Returns the first matching contact or undefined
   */
  getContactForMarket(market: string): MarketContact | undefined {
    if (!this.marketContacts) return undefined;
    return this.marketContacts.find(contact =>
      contact.markets.some(m =>
        m.toLowerCase().includes(market.toLowerCase()) ||
        market.toLowerCase().includes(m.toLowerCase())
      )
    );
  }

  /**
   * Smart contact lookup using property location details
   * Tries multiple matching strategies in order of specificity:
   * 1. City + State (e.g., "Atlanta GA")
   * 2. County + State (e.g., "Fulton GA")
   * 3. City only (e.g., "Atlanta")
   * 4. County only (e.g., "Fulton")
   * 5. State only (e.g., "GA")
   * Returns the matched contact and which field matched
   */
  findContactForProperty(location: {
    city?: string;
    county?: string;
    state?: string;
  }): { contact: MarketContact; matchedOn: string } | undefined {
    if (!this.marketContacts || this.marketContacts.length === 0) {
      return undefined;
    }

    const { city, county, state } = location;
    const normalize = (s: string) => s.toLowerCase().trim();

    // Helper to check if market matches search term with word boundary awareness
    const matchesMarket = (market: string, term: string): boolean => {
      const marketLower = normalize(market);
      const termLower = normalize(term);

      // Exact match
      if (marketLower === termLower) return true;

      // For short terms (2-3 chars like state codes), require word boundary
      if (termLower.length <= 3) {
        // Split market into words and check for exact word match
        const marketWords = marketLower.split(/[\s,]+/);
        return marketWords.some(word => word === termLower);
      }

      // For longer terms, allow substring matching
      return (
        marketLower.includes(termLower) ||
        termLower.includes(marketLower) ||
        marketLower.replace(/,/g, '').includes(termLower.replace(/,/g, ''))
      );
    };

    // Helper to check if any market string matches the search term
    const findMatch = (searchTerms: string[]): MarketContact | undefined => {
      for (const term of searchTerms) {
        const found = this.marketContacts!.find(contact =>
          contact.markets.some(m => matchesMarket(m, term))
        );
        if (found) return found;
      }
      return undefined;
    };

    // Strategy 1: City + State (most specific)
    if (city && state) {
      const variations = [
        `${city} ${state}`,
        `${city}, ${state}`,
        `${city} ${state}`.replace(' County', ''),
      ];
      const contact = findMatch(variations);
      if (contact) return { contact, matchedOn: `${city}, ${state}` };
    }

    // Strategy 2: County + State
    if (county && state) {
      const countyClean = county.replace(' County', '').replace(' Parish', '');
      const variations = [
        `${countyClean} ${state}`,
        `${countyClean}, ${state}`,
        `${county} ${state}`,
      ];
      const contact = findMatch(variations);
      if (contact) return { contact, matchedOn: `${county}, ${state}` };
    }

    // Strategy 3: City only
    if (city) {
      const contact = findMatch([city]);
      if (contact) return { contact, matchedOn: city };
    }

    // Strategy 4: County only
    if (county) {
      const countyClean = county.replace(' County', '').replace(' Parish', '');
      const contact = findMatch([countyClean, county]);
      if (contact) return { contact, matchedOn: county };
    }

    // Strategy 5: State only (fallback)
    if (state) {
      const contact = findMatch([state]);
      if (contact) return { contact, matchedOn: state };
    }

    // Strategy 6: Buy box default contact (if no regional contact matched)
    // Only use if the buy box has a default contactEmail set
    if (this.contactEmail) {
      return {
        contact: {
          name: this.fundName || this.name,
          email: this.contactEmail,
          phone: this.contactPhone,
          markets: ['Default'],
        },
        matchedOn: 'Default Contact',
      };
    }

    // No contact available
    return undefined;
  }
}

HedgeFundBuyBox.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: () => `buybox-${Date.now()}`,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    fundId: {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: 'funds',
        key: 'id',
      },
    },
    fundName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fundType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contactEmail: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true,
      },
    },
    contactPhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    marketContacts: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      validate: { min: 1, max: 100 },
    },
    criteria: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        investmentStrategies: ['fix_and_flip'],
        propertyTypes: ['single_family'],
        conditionLevels: ['any'],
        dealSourcePreference: 'both',
        occupancyStatuses: ['vacant_only', 'vacant_preferred'],
        allowHoa: true,
        allowStructuralIssues: false,
        allowFoundationIssues: false,
        allowFireDamage: false,
        allowCodeViolations: false,
        allowOpenPermits: false,
        allowLiensIfCurable: true,
        allowFloodZone: false,
        crimeTolerance: 'medium',
        matchStrictness: 'flexible',
        // Default hard requirements - state is always hard, others are soft
        hardRequirements: {
          state: true,        // Wrong state = always excluded
          maxPrice: false,    // Over budget = reduced score (use 15% tolerance)
          propertyType: false,
          minBedrooms: false,
          maxBedrooms: false,
          minBathrooms: false,
          maxBathrooms: false,
          minYearBuilt: false,
          allowHoa: false,
          allowFloodZone: false,
          allowStructuralIssues: false,
        },
      },
    },
    scoringWeights: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        geographic: 25,
        price: 20,
        propertyType: 10,
        bedrooms: 5,
        bathrooms: 5,
        yearBuilt: 5,
        occupancy: 5,
        hoa: 5,
        photos: 5,
        condition: 5,
        riskFactors: 5,
        strategyMetrics: 5,
        custom: 0,
      },
    },
    autoSubmit: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    autoSubmitThreshold: {
      type: DataTypes.INTEGER,
      defaultValue: 80,
      validate: { min: 0, max: 100 },
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
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
    tableName: 'hedge_fund_buy_boxes',
    timestamps: true,
    version: true, // Enable optimistic locking
    indexes: [
      { fields: ['enabled'] },
      { fields: ['priority'] },
      { fields: ['fundName'] },
      { fields: ['fundType'] },
    ],
  }
);

export default HedgeFundBuyBox;
export { HedgeFundBuyBoxAttributes, HedgeFundBuyBoxCreationAttributes, BuyBoxCriteria, ScoringWeights };
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
  MarketContact,
  HardRequirements,
} from '../types';
