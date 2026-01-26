/**
 * Probability Service
 *
 * Twitter-inspired probability prediction for buy box matching.
 * Converts arbitrary point scores into meaningful probability predictions.
 *
 * Key concepts borrowed from Twitter's algorithm:
 * 1. Calibrated probabilities (not arbitrary scores)
 * 2. Multi-task prediction (predict multiple outcomes)
 * 3. Feature contribution tracking
 * 4. Confidence scoring based on data availability
 */

import InvestorAction from '../models/InvestorAction';
import { PredictedEngagement, EngagementFactor } from '../types/ai-agents';
import { Op } from 'sequelize';

// =============================================================================
// CONSTANTS
// =============================================================================

const MODEL_VERSION = '1.0.0';

// Base rates (priors) - will be updated from historical data
const DEFAULT_BASE_RATES = {
  close: 0.05,    // 5% of matches result in close
  bid: 0.15,      // 15% of matches result in bid
  save: 0.30,     // 30% of matches get saved
  pass: 0.40,     // 40% of matches get passed
};

// Feature weights for probability calculation
const FEATURE_WEIGHTS = {
  // Location features
  stateMatch: { close: 0.3, bid: 0.25, save: 0.15, pass: -0.2 },
  countyMatch: { close: 0.15, bid: 0.12, save: 0.08, pass: -0.1 },

  // Price features
  priceAlignment: { close: 0.35, bid: 0.3, save: 0.2, pass: -0.25 },
  pricePerSqftGood: { close: 0.2, bid: 0.18, save: 0.1, pass: -0.15 },

  // Property features
  propertyTypeMatch: { close: 0.2, bid: 0.18, save: 0.12, pass: -0.15 },
  bedroomMatch: { close: 0.12, bid: 0.1, save: 0.08, pass: -0.08 },
  bathroomMatch: { close: 0.08, bid: 0.06, save: 0.04, pass: -0.05 },
  yearBuiltOk: { close: 0.1, bid: 0.08, save: 0.05, pass: -0.08 },
  sqftMatch: { close: 0.1, bid: 0.08, save: 0.06, pass: -0.06 },

  // Deal characteristics
  noHoaMatch: { close: 0.08, bid: 0.06, save: 0.04, pass: -0.05 },
  vacancyMatch: { close: 0.12, bid: 0.1, save: 0.05, pass: -0.08 },
  lowDaysOnMarket: { close: 0.15, bid: 0.12, save: 0.08, pass: -0.1 },

  // Deal quality indicators
  goodArvSpread: { close: 0.25, bid: 0.2, save: 0.12, pass: -0.2 },
  goodCapRate: { close: 0.2, bid: 0.15, save: 0.1, pass: -0.15 },
  cashFlow: { close: 0.18, bid: 0.15, save: 0.1, pass: -0.12 },

  // Risk factors (negative = increases pass probability)
  floodZone: { close: -0.2, bid: -0.15, save: -0.08, pass: 0.15 },
  structuralIssues: { close: -0.3, bid: -0.25, save: -0.15, pass: 0.25 },
  septicSystem: { close: -0.1, bid: -0.08, save: -0.05, pass: 0.08 },
  wellWater: { close: -0.08, bid: -0.06, save: -0.04, pass: 0.06 },
};

// =============================================================================
// TYPES
// =============================================================================

interface FeatureScores {
  [key: string]: number; // Feature name -> contribution (0-1)
}

interface HistoricalRates {
  closeRate: number;
  bidRate: number;
  saveRate: number;
  passRate: number;
  totalActions: number;
}

interface PropertyFeatures {
  state?: string;
  county?: string;
  price?: number;
  pricePerSqft?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  yearBuilt?: number;
  sqft?: number;
  hasHoa?: boolean;
  isVacant?: boolean;
  daysOnMarket?: number;
  arvSpread?: number;
  capRate?: number;
  cashFlow?: number;
  inFloodZone?: boolean;
  hasStructuralIssues?: boolean;
  hasSeptic?: boolean;
  hasWell?: boolean;
}

interface BuyBoxCriteria {
  states?: string[];
  counties?: string[];
  minPrice?: number;
  maxPrice?: number;
  propertyTypes?: string[];
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minYearBuilt?: number;
  minSqft?: number;
  maxSqft?: number;
  noHoa?: boolean;
  preferVacant?: boolean;
  maxDaysOnMarket?: number;
  minArvSpread?: number;
  minCapRate?: number;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

class ProbabilityService {
  private baseRates: typeof DEFAULT_BASE_RATES;
  private cachedHistoricalRates: Map<string, HistoricalRates>;
  private cacheTimeouts: Map<string, NodeJS.Timeout>;

  constructor() {
    this.baseRates = { ...DEFAULT_BASE_RATES };
    this.cachedHistoricalRates = new Map();
    this.cacheTimeouts = new Map();
  }

  /**
   * Main method: Calculate predicted engagement probabilities
   */
  async calculateEngagement(
    property: PropertyFeatures,
    criteria: BuyBoxCriteria,
    buyBoxId: string,
    rawScore: number
  ): Promise<PredictedEngagement> {
    // Get historical rates for this buy box
    const historicalRates = await this.getHistoricalRates(buyBoxId);

    // Extract feature scores
    const { features, factors } = this.extractFeatures(property, criteria);

    // Calculate raw probabilities using logistic combination
    const rawProbs = this.calculateRawProbabilities(features, historicalRates);

    // Calibrate probabilities
    const calibratedProbs = this.calibrateProbabilities(rawProbs, rawScore);

    // Calculate confidence
    const confidence = this.calculateConfidence(historicalRates, features);

    return {
      probClose: calibratedProbs.close,
      probBid: calibratedProbs.bid,
      probSave: calibratedProbs.save,
      probPass: calibratedProbs.pass,
      confidence,
      modelVersion: MODEL_VERSION,
      factors,
    };
  }

  /**
   * Get historical action rates for a buy box
   */
  private async getHistoricalRates(buyBoxId: string): Promise<HistoricalRates> {
    // Check cache first
    const cached = this.cachedHistoricalRates.get(buyBoxId);
    if (cached) {
      return cached;
    }

    try {
      // Query historical actions
      const actions = await InvestorAction.findAll({
        where: { buyBoxId },
        attributes: ['action'],
      });

      if (actions.length < 10) {
        // Not enough data, use defaults
        return {
          closeRate: this.baseRates.close,
          bidRate: this.baseRates.bid,
          saveRate: this.baseRates.save,
          passRate: this.baseRates.pass,
          totalActions: actions.length,
        };
      }

      // Calculate rates
      const total = actions.length;
      const rates: HistoricalRates = {
        closeRate: actions.filter(a => a.action === 'closed').length / total,
        bidRate: actions.filter(a => ['bid', 'offer_accepted', 'closed'].includes(a.action)).length / total,
        saveRate: actions.filter(a => a.action === 'saved').length / total,
        passRate: actions.filter(a => ['passed', 'rejected'].includes(a.action)).length / total,
        totalActions: total,
      };

      // Cache for 5 minutes (clear any existing timeout first)
      const existingTimeout = this.cacheTimeouts.get(buyBoxId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      this.cachedHistoricalRates.set(buyBoxId, rates);
      const timeoutId = setTimeout(() => {
        this.cachedHistoricalRates.delete(buyBoxId);
        this.cacheTimeouts.delete(buyBoxId);
      }, 5 * 60 * 1000);
      this.cacheTimeouts.set(buyBoxId, timeoutId);

      return rates;
    } catch {
      // Database not available, use defaults
      return {
        closeRate: this.baseRates.close,
        bidRate: this.baseRates.bid,
        saveRate: this.baseRates.save,
        passRate: this.baseRates.pass,
        totalActions: 0,
      };
    }
  }

  /**
   * Extract feature scores from property and criteria
   */
  private extractFeatures(
    property: PropertyFeatures,
    criteria: BuyBoxCriteria
  ): { features: FeatureScores; factors: EngagementFactor[] } {
    const features: FeatureScores = {};
    const factors: EngagementFactor[] = [];

    // State match
    if (criteria.states && property.state) {
      const match = criteria.states.includes(property.state);
      features.stateMatch = match ? 1 : 0;
      if (match) {
        factors.push({
          name: 'state_match',
          contribution: 0.3,
          description: `Property in target state: ${property.state}`,
        });
      } else {
        factors.push({
          name: 'state_match',
          contribution: -0.5,
          description: `Property not in target states`,
        });
      }
    }

    // Price alignment
    if (criteria.minPrice !== undefined && criteria.maxPrice !== undefined && property.price) {
      const range = criteria.maxPrice - criteria.minPrice;
      const midpoint = (criteria.minPrice + criteria.maxPrice) / 2;
      const deviation = Math.abs(property.price - midpoint) / (range / 2);
      const alignment = Math.max(0, 1 - deviation);
      features.priceAlignment = alignment;

      if (alignment > 0.7) {
        factors.push({
          name: 'price_alignment',
          contribution: alignment * 0.35,
          description: `Price $${property.price.toLocaleString()} is well within budget`,
        });
      } else if (alignment > 0.3) {
        factors.push({
          name: 'price_alignment',
          contribution: alignment * 0.2,
          description: `Price $${property.price.toLocaleString()} is acceptable`,
        });
      } else {
        factors.push({
          name: 'price_alignment',
          contribution: -0.2,
          description: `Price $${property.price.toLocaleString()} is outside preferred range`,
        });
      }
    }

    // Property type match
    if (criteria.propertyTypes && property.propertyType) {
      const match = criteria.propertyTypes.includes(property.propertyType);
      features.propertyTypeMatch = match ? 1 : 0;
      factors.push({
        name: 'property_type',
        contribution: match ? 0.2 : -0.15,
        description: match
          ? `${property.propertyType} is a target property type`
          : `${property.propertyType} is not in preferred types`,
      });
    }

    // Bedroom match
    if (property.bedrooms !== undefined) {
      const minOk = !criteria.minBedrooms || property.bedrooms >= criteria.minBedrooms;
      const maxOk = !criteria.maxBedrooms || property.bedrooms <= criteria.maxBedrooms;
      features.bedroomMatch = (minOk && maxOk) ? 1 : 0;
      if (!minOk || !maxOk) {
        factors.push({
          name: 'bedroom_count',
          contribution: -0.08,
          description: `${property.bedrooms} bedrooms outside preferred range`,
        });
      }
    }

    // Bathroom match
    if (property.bathrooms !== undefined) {
      const minOk = !criteria.minBathrooms || property.bathrooms >= criteria.minBathrooms;
      const maxOk = !criteria.maxBathrooms || property.bathrooms <= criteria.maxBathrooms;
      features.bathroomMatch = (minOk && maxOk) ? 1 : 0;
    }

    // Year built
    if (property.yearBuilt && criteria.minYearBuilt) {
      features.yearBuiltOk = property.yearBuilt >= criteria.minYearBuilt ? 1 : 0;
      if (!features.yearBuiltOk) {
        factors.push({
          name: 'year_built',
          contribution: -0.1,
          description: `Built in ${property.yearBuilt}, older than preferred`,
        });
      }
    }

    // Square footage
    if (property.sqft !== undefined) {
      const minOk = !criteria.minSqft || property.sqft >= criteria.minSqft;
      const maxOk = !criteria.maxSqft || property.sqft <= criteria.maxSqft;
      features.sqftMatch = (minOk && maxOk) ? 1 : 0;
    }

    // HOA preference
    if (criteria.noHoa !== undefined && property.hasHoa !== undefined) {
      features.noHoaMatch = (criteria.noHoa && !property.hasHoa) || !criteria.noHoa ? 1 : 0;
      if (criteria.noHoa && property.hasHoa) {
        factors.push({
          name: 'hoa',
          contribution: -0.1,
          description: 'Property has HOA but investor prefers no HOA',
        });
      }
    }

    // Vacancy preference
    if (criteria.preferVacant !== undefined && property.isVacant !== undefined) {
      features.vacancyMatch = (criteria.preferVacant === property.isVacant) ? 1 : 0.5;
      if (criteria.preferVacant && property.isVacant) {
        factors.push({
          name: 'vacancy',
          contribution: 0.12,
          description: 'Property is vacant as preferred',
        });
      }
    }

    // Days on market
    if (property.daysOnMarket !== undefined) {
      const isLow = !criteria.maxDaysOnMarket || property.daysOnMarket <= criteria.maxDaysOnMarket;
      features.lowDaysOnMarket = isLow ? 1 : 0;
      if (property.daysOnMarket < 14) {
        factors.push({
          name: 'days_on_market',
          contribution: 0.15,
          description: `Fresh listing: only ${property.daysOnMarket} days on market`,
        });
      } else if (property.daysOnMarket > 60) {
        factors.push({
          name: 'days_on_market',
          contribution: -0.1,
          description: `Stale listing: ${property.daysOnMarket} days on market`,
        });
      }
    }

    // ARV Spread
    if (property.arvSpread !== undefined) {
      const isGood = !criteria.minArvSpread || property.arvSpread >= criteria.minArvSpread;
      features.goodArvSpread = isGood ? Math.min(1, property.arvSpread / 0.3) : 0;
      if (property.arvSpread >= 0.25) {
        factors.push({
          name: 'arv_spread',
          contribution: 0.25,
          description: `Strong ARV spread: ${(property.arvSpread * 100).toFixed(1)}%`,
        });
      }
    }

    // Cap Rate
    if (property.capRate !== undefined) {
      const isGood = !criteria.minCapRate || property.capRate >= criteria.minCapRate;
      features.goodCapRate = isGood ? Math.min(1, property.capRate / 10) : 0;
      if (property.capRate >= 8) {
        factors.push({
          name: 'cap_rate',
          contribution: 0.2,
          description: `Good cap rate: ${property.capRate.toFixed(1)}%`,
        });
      }
    }

    // Risk factors
    if (property.inFloodZone) {
      features.floodZone = 1;
      factors.push({
        name: 'flood_zone',
        contribution: -0.2,
        description: 'Property is in a flood zone',
      });
    }

    if (property.hasStructuralIssues) {
      features.structuralIssues = 1;
      factors.push({
        name: 'structural_issues',
        contribution: -0.3,
        description: 'Property has structural issues',
      });
    }

    if (property.hasSeptic) {
      features.septicSystem = 1;
      factors.push({
        name: 'septic_system',
        contribution: -0.1,
        description: 'Property has septic system',
      });
    }

    if (property.hasWell) {
      features.wellWater = 1;
      factors.push({
        name: 'well_water',
        contribution: -0.08,
        description: 'Property has well water',
      });
    }

    // Sort factors by absolute contribution
    factors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    return { features, factors };
  }

  /**
   * Calculate raw probabilities from features
   */
  private calculateRawProbabilities(
    features: FeatureScores,
    historicalRates: HistoricalRates
  ): { close: number; bid: number; save: number; pass: number } {
    // Start with base rates (log-odds)
    let closeLogOdds = this.logit(historicalRates.closeRate);
    let bidLogOdds = this.logit(historicalRates.bidRate);
    let saveLogOdds = this.logit(historicalRates.saveRate);
    let passLogOdds = this.logit(historicalRates.passRate);

    // Add feature contributions
    for (const [featureName, featureValue] of Object.entries(features)) {
      const weights = FEATURE_WEIGHTS[featureName as keyof typeof FEATURE_WEIGHTS];
      if (weights && featureValue !== undefined) {
        closeLogOdds += weights.close * featureValue;
        bidLogOdds += weights.bid * featureValue;
        saveLogOdds += weights.save * featureValue;
        passLogOdds += weights.pass * featureValue;
      }
    }

    // Convert back to probabilities using sigmoid
    return {
      close: this.sigmoid(closeLogOdds),
      bid: this.sigmoid(bidLogOdds),
      save: this.sigmoid(saveLogOdds),
      pass: this.sigmoid(passLogOdds),
    };
  }

  /**
   * Calibrate probabilities using raw score as additional signal
   */
  private calibrateProbabilities(
    rawProbs: { close: number; bid: number; save: number; pass: number },
    rawScore: number
  ): { close: number; bid: number; save: number; pass: number } {
    // Normalize raw score to 0-1 (assuming 0-100 scale)
    const normalizedScore = Math.max(0, Math.min(1, rawScore / 100));

    // Blend model predictions with raw score (70% model, 30% score)
    const blendWeight = 0.7;

    return {
      close: rawProbs.close * blendWeight + normalizedScore * 0.1 * (1 - blendWeight),
      bid: rawProbs.bid * blendWeight + normalizedScore * 0.3 * (1 - blendWeight),
      save: rawProbs.save * blendWeight + normalizedScore * 0.5 * (1 - blendWeight),
      pass: rawProbs.pass * (1 - blendWeight) + (1 - normalizedScore) * 0.5 * blendWeight,
    };
  }

  /**
   * Calculate confidence based on data availability
   */
  private calculateConfidence(
    historicalRates: HistoricalRates,
    features: FeatureScores
  ): number {
    // Base confidence from historical data
    let confidence = 0.3; // Minimum confidence

    // More historical data = higher confidence
    if (historicalRates.totalActions >= 100) {
      confidence += 0.3;
    } else if (historicalRates.totalActions >= 50) {
      confidence += 0.2;
    } else if (historicalRates.totalActions >= 20) {
      confidence += 0.1;
    }

    // More features = higher confidence
    const featureCount = Object.keys(features).length;
    confidence += Math.min(0.3, featureCount * 0.03);

    // Cap at 0.95
    return Math.min(0.95, confidence);
  }

  /**
   * Logit function (log-odds)
   */
  private logit(p: number): number {
    // Clamp to avoid infinity
    const clampedP = Math.max(0.001, Math.min(0.999, p));
    return Math.log(clampedP / (1 - clampedP));
  }

  /**
   * Sigmoid function
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Clear cached historical rates (for testing or manual refresh)
   */
  clearCache(): void {
    // Clear all timeouts to prevent memory leaks
    for (const timeoutId of this.cacheTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.cacheTimeouts.clear();
    this.cachedHistoricalRates.clear();
  }

  /**
   * Update base rates from global historical data
   */
  async updateBaseRates(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const actions = await InvestorAction.findAll({
        where: {
          createdAt: { [Op.gte]: thirtyDaysAgo },
        },
        attributes: ['action'],
      });

      if (actions.length >= 100) {
        const total = actions.length;
        this.baseRates = {
          close: actions.filter(a => a.action === 'closed').length / total,
          bid: actions.filter(a => ['bid', 'offer_accepted', 'closed'].includes(a.action)).length / total,
          save: actions.filter(a => a.action === 'saved').length / total,
          pass: actions.filter(a => ['passed', 'rejected'].includes(a.action)).length / total,
        };
      }
    } catch {
      // Keep defaults if database unavailable
    }
  }
}

// Export singleton instance
export const probabilityService = new ProbabilityService();
export default ProbabilityService;
