/**
 * Deal Intelligence Service
 *
 * Provides predictive analytics and smart recommendations for deals:
 * - Deal success probability prediction
 * - Optimal offer price calculation
 * - Days-to-close estimation
 * - Best fund matching with confidence scores
 * - Negotiation strategy recommendations
 */

import { Property } from '../models';
import { Op } from 'sequelize';

export interface DealPrediction {
  successProbability: number; // 0-100%
  confidence: string; // 'high', 'medium', 'low'
  factors: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };
}

export interface PricingRecommendation {
  suggestedOffer: number;
  minOffer: number; // Walk-away price
  maxOffer: number; // Ceiling price
  askingPrice: number;
  discount: number; // Percentage below asking
  strategy: string;
  reasoning: string[];
  negotiationTactics: string[];
}

export interface FundMatch {
  fundId: string;
  fundName: string;
  matchScore: number;
  confidence: number;
  reasoning: string[];
  contactRecommendation: string;
  expectedResponseTime: string;
  historicalAcceptanceRate: number;
}

export interface DealIntelligence {
  propertyId: string;
  address: string;
  prediction: DealPrediction;
  pricing: PricingRecommendation;
  fundMatches: FundMatch[];
  marketContext: {
    marketTemperature: string; // 'hot', 'warm', 'cool', 'cold'
    daysOnMarketAvg: number;
    pricePerSqftAvg: number;
    inventoryLevel: string; // 'low', 'normal', 'high'
    bestTimeToOffer: string;
  };
  actionRecommendation: string;
  urgency: 'high' | 'medium' | 'low';
}

// Historical patterns for learning (would be populated from actual data)
interface HistoricalPattern {
  state: string;
  avgDaysToClose: number;
  avgDiscount: number;
  successRate: number;
  hotMonths: number[]; // 1-12
}

const HISTORICAL_PATTERNS: Record<string, HistoricalPattern> = {
  TX: { state: 'TX', avgDaysToClose: 32, avgDiscount: 8, successRate: 72, hotMonths: [3, 4, 5, 6] },
  FL: { state: 'FL', avgDaysToClose: 28, avgDiscount: 6, successRate: 68, hotMonths: [1, 2, 3, 11, 12] },
  GA: { state: 'GA', avgDaysToClose: 35, avgDiscount: 9, successRate: 65, hotMonths: [4, 5, 6, 7] },
  NC: { state: 'NC', avgDaysToClose: 38, avgDiscount: 7, successRate: 70, hotMonths: [5, 6, 7, 8] },
  AZ: { state: 'AZ', avgDaysToClose: 30, avgDiscount: 7, successRate: 71, hotMonths: [10, 11, 12, 1, 2] },
  TN: { state: 'TN', avgDaysToClose: 34, avgDiscount: 8, successRate: 69, hotMonths: [4, 5, 6, 7] },
  DEFAULT: { state: 'DEFAULT', avgDaysToClose: 35, avgDiscount: 8, successRate: 65, hotMonths: [4, 5, 6] },
};

// Fund acceptance patterns (would be learned from actual data)
interface FundPattern {
  fundName: string;
  preferredStates: string[];
  avgResponseDays: number;
  acceptanceRate: number;
  preferredPriceRange: { min: number; max: number };
  preferredBedrooms: { min: number; max: number };
  dealFlowCapacity: 'high' | 'medium' | 'low';
  bestContactMethod: string;
}

const FUND_PATTERNS: Record<string, FundPattern> = {
  'Tricon Residential': {
    fundName: 'Tricon Residential',
    preferredStates: ['TX', 'GA', 'NC', 'SC'],
    avgResponseDays: 2,
    acceptanceRate: 45,
    preferredPriceRange: { min: 150000, max: 350000 },
    preferredBedrooms: { min: 3, max: 4 },
    dealFlowCapacity: 'high',
    bestContactMethod: 'Email to regional manager',
  },
  'Amherst': {
    fundName: 'Amherst',
    preferredStates: ['TX', 'FL', 'GA', 'AZ', 'NC'],
    avgResponseDays: 3,
    acceptanceRate: 38,
    preferredPriceRange: { min: 175000, max: 400000 },
    preferredBedrooms: { min: 3, max: 5 },
    dealFlowCapacity: 'high',
    bestContactMethod: 'Portal submission',
  },
  'Progress Residential': {
    fundName: 'Progress Residential',
    preferredStates: ['TX', 'FL', 'AZ'],
    avgResponseDays: 4,
    acceptanceRate: 42,
    preferredPriceRange: { min: 200000, max: 450000 },
    preferredBedrooms: { min: 3, max: 4 },
    dealFlowCapacity: 'medium',
    bestContactMethod: 'Direct email to acquisitions',
  },
  'Invitation Homes': {
    fundName: 'Invitation Homes',
    preferredStates: ['TX', 'FL', 'GA', 'AZ', 'NC', 'TN'],
    avgResponseDays: 5,
    acceptanceRate: 35,
    preferredPriceRange: { min: 250000, max: 500000 },
    preferredBedrooms: { min: 3, max: 5 },
    dealFlowCapacity: 'high',
    bestContactMethod: 'Portal + follow-up call',
  },
};

class DealIntelligenceService {
  /**
   * Get comprehensive deal intelligence
   */
  async analyzeDeal(property: {
    address: string;
    city: string;
    state: string;
    askingPrice: number;
    arv?: number;
    bedrooms?: number;
    bathrooms?: number;
    sqft?: number;
    yearBuilt?: number;
    condition?: string;
    daysOnMarket?: number;
  }): Promise<DealIntelligence> {
    const prediction = this.predictDealSuccess(property);
    const pricing = this.calculateOptimalPricing(property);
    const fundMatches = this.findBestFundMatches(property);
    const marketContext = this.analyzeMarketContext(property);

    // Generate action recommendation
    const actionRecommendation = this.generateActionRecommendation(
      prediction,
      pricing,
      fundMatches,
      marketContext
    );

    // Determine urgency
    const urgency = this.determineUrgency(prediction, marketContext, property.daysOnMarket);

    return {
      propertyId: '', // Would be set if property exists
      address: `${property.address}, ${property.city}, ${property.state}`,
      prediction,
      pricing,
      fundMatches,
      marketContext,
      actionRecommendation,
      urgency,
    };
  }

  /**
   * Predict deal success probability
   */
  predictDealSuccess(property: {
    state: string;
    askingPrice: number;
    arv?: number;
    bedrooms?: number;
    sqft?: number;
    yearBuilt?: number;
    condition?: string;
    daysOnMarket?: number;
  }): DealPrediction {
    const pattern = HISTORICAL_PATTERNS[property.state] || HISTORICAL_PATTERNS.DEFAULT;
    const factors: DealPrediction['factors'] = { positive: [], negative: [], neutral: [] };

    let baseScore = pattern.successRate;

    // Price to ARV ratio
    if (property.arv && property.askingPrice) {
      const ratio = property.askingPrice / property.arv;
      if (ratio < 0.65) {
        baseScore += 15;
        factors.positive.push(`Strong equity position (${((1 - ratio) * 100).toFixed(0)}% below ARV)`);
      } else if (ratio < 0.75) {
        baseScore += 8;
        factors.positive.push(`Good equity margin (${((1 - ratio) * 100).toFixed(0)}% below ARV)`);
      } else if (ratio > 0.85) {
        baseScore -= 10;
        factors.negative.push(`Thin margins (only ${((1 - ratio) * 100).toFixed(0)}% below ARV)`);
      }
    }

    // Bedroom count (3-4 beds are most desirable)
    if (property.bedrooms) {
      if (property.bedrooms >= 3 && property.bedrooms <= 4) {
        baseScore += 5;
        factors.positive.push(`Ideal bedroom count (${property.bedrooms} beds)`);
      } else if (property.bedrooms < 3) {
        baseScore -= 8;
        factors.negative.push(`Low bedroom count limits buyer pool`);
      } else if (property.bedrooms > 5) {
        baseScore -= 3;
        factors.neutral.push(`Large home may limit institutional buyers`);
      }
    }

    // Year built
    if (property.yearBuilt) {
      if (property.yearBuilt >= 2000) {
        baseScore += 5;
        factors.positive.push(`Newer construction (${property.yearBuilt})`);
      } else if (property.yearBuilt < 1970) {
        baseScore -= 8;
        factors.negative.push(`Older home may need more repairs`);
      }
    }

    // Days on market (motivated seller indicator)
    if (property.daysOnMarket !== undefined) {
      if (property.daysOnMarket > 60) {
        baseScore += 10;
        factors.positive.push(`Extended DOM (${property.daysOnMarket} days) - seller likely motivated`);
      } else if (property.daysOnMarket > 30) {
        baseScore += 5;
        factors.positive.push(`Moderate DOM suggests negotiation room`);
      } else if (property.daysOnMarket < 7) {
        baseScore -= 5;
        factors.negative.push(`New listing - less negotiation leverage`);
      }
    }

    // Seasonality
    const currentMonth = new Date().getMonth() + 1;
    if (pattern.hotMonths.includes(currentMonth)) {
      baseScore += 3;
      factors.positive.push(`Active buying season in ${property.state}`);
    }

    // Cap the score
    baseScore = Math.min(95, Math.max(15, baseScore));

    // Determine confidence
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    const dataPoints = [property.arv, property.bedrooms, property.sqft, property.yearBuilt, property.daysOnMarket]
      .filter(Boolean).length;
    if (dataPoints >= 4) confidence = 'high';
    else if (dataPoints <= 2) confidence = 'low';

    return {
      successProbability: Math.round(baseScore),
      confidence,
      factors,
    };
  }

  /**
   * Calculate optimal pricing strategy
   */
  calculateOptimalPricing(property: {
    state: string;
    askingPrice: number;
    arv?: number;
    sqft?: number;
    daysOnMarket?: number;
    condition?: string;
  }): PricingRecommendation {
    const pattern = HISTORICAL_PATTERNS[property.state] || HISTORICAL_PATTERNS.DEFAULT;
    const askingPrice = property.askingPrice;
    const reasoning: string[] = [];
    const tactics: string[] = [];

    // Base discount from historical pattern
    let targetDiscount = pattern.avgDiscount;

    // Adjust for days on market
    if (property.daysOnMarket && property.daysOnMarket > 45) {
      targetDiscount += 3;
      reasoning.push(`+3% discount: Property has been on market ${property.daysOnMarket} days`);
      tactics.push('Reference the extended listing time in your offer');
    }
    if (property.daysOnMarket && property.daysOnMarket > 90) {
      targetDiscount += 2;
      reasoning.push(`+2% additional: Severely stale listing indicates motivated seller`);
      tactics.push('Ask seller directly about their timeline and motivation');
    }

    // Adjust for ARV margin
    if (property.arv) {
      const margin = (property.arv - askingPrice) / property.arv;
      if (margin < 0.15) {
        targetDiscount += 5;
        reasoning.push(`+5% discount needed: Thin ARV margin (${(margin * 100).toFixed(0)}%)`);
        tactics.push('Emphasize renovation costs and market risks in offer');
      } else if (margin > 0.35) {
        targetDiscount -= 2;
        reasoning.push(`-2% discount: Strong ARV margin allows room (${(margin * 100).toFixed(0)}%)`);
      }
    }

    // Adjust for condition
    if (property.condition) {
      const condLower = property.condition.toLowerCase();
      if (condLower.includes('heavy') || condLower.includes('major')) {
        targetDiscount += 8;
        reasoning.push(`+8% discount: Heavy rehab needed`);
        tactics.push('Get contractor estimates to justify lower offer');
      } else if (condLower.includes('medium') || condLower.includes('moderate')) {
        targetDiscount += 3;
        reasoning.push(`+3% discount: Moderate repairs needed`);
      }
    }

    // Calculate prices
    const suggestedOffer = Math.round(askingPrice * (1 - targetDiscount / 100));
    const minOffer = Math.round(askingPrice * (1 - (targetDiscount + 5) / 100)); // Walk-away
    const maxOffer = Math.round(askingPrice * (1 - (targetDiscount - 3) / 100)); // Ceiling

    // Determine strategy
    let strategy = 'Standard Offer';
    if (targetDiscount >= 15) {
      strategy = 'Aggressive Low Ball';
      tactics.push('Submit with short expiration (24-48 hours) to create urgency');
      tactics.push('Be prepared for counter-offer or rejection');
    } else if (targetDiscount >= 10) {
      strategy = 'Negotiated Discount';
      tactics.push('Start low, expect to meet in the middle');
      tactics.push('Have your financing pre-approved to strengthen position');
    } else {
      strategy = 'Competitive Offer';
      tactics.push('Move quickly - this may have multiple interested parties');
      tactics.push('Consider escalation clause if competition expected');
    }

    return {
      suggestedOffer,
      minOffer,
      maxOffer,
      askingPrice,
      discount: targetDiscount,
      strategy,
      reasoning,
      negotiationTactics: tactics,
    };
  }

  /**
   * Find best matching funds with detailed reasoning
   */
  findBestFundMatches(property: {
    state: string;
    askingPrice: number;
    bedrooms?: number;
    city?: string;
  }): FundMatch[] {
    const matches: FundMatch[] = [];

    for (const [fundId, pattern] of Object.entries(FUND_PATTERNS)) {
      let score = 0;
      const reasoning: string[] = [];

      // State match
      if (pattern.preferredStates.includes(property.state)) {
        score += 30;
        reasoning.push(`✓ ${property.state} is in their target markets`);
      } else {
        reasoning.push(`✗ ${property.state} not in preferred states`);
        continue; // Skip non-matching states
      }

      // Price range match
      if (property.askingPrice >= pattern.preferredPriceRange.min &&
          property.askingPrice <= pattern.preferredPriceRange.max) {
        score += 25;
        reasoning.push(`✓ Price $${property.askingPrice.toLocaleString()} within their range`);
      } else if (property.askingPrice < pattern.preferredPriceRange.min) {
        score += 10;
        reasoning.push(`△ Price below their typical range (may still consider)`);
      } else {
        score += 5;
        reasoning.push(`△ Price above typical range`);
      }

      // Bedroom match
      if (property.bedrooms) {
        if (property.bedrooms >= pattern.preferredBedrooms.min &&
            property.bedrooms <= pattern.preferredBedrooms.max) {
          score += 20;
          reasoning.push(`✓ ${property.bedrooms} beds matches their criteria`);
        } else {
          score += 5;
          reasoning.push(`△ Bedroom count outside preferred range`);
        }
      }

      // Deal flow capacity bonus
      if (pattern.dealFlowCapacity === 'high') {
        score += 15;
        reasoning.push(`✓ High deal flow capacity - actively buying`);
      } else if (pattern.dealFlowCapacity === 'medium') {
        score += 8;
        reasoning.push(`△ Moderate deal flow - selective`);
      }

      // Historical acceptance rate bonus
      score += Math.round(pattern.acceptanceRate / 5);

      matches.push({
        fundId,
        fundName: pattern.fundName,
        matchScore: Math.min(100, score),
        confidence: score >= 70 ? 90 : score >= 50 ? 70 : 50,
        reasoning,
        contactRecommendation: pattern.bestContactMethod,
        expectedResponseTime: `${pattern.avgResponseDays} business days`,
        historicalAcceptanceRate: pattern.acceptanceRate,
      });
    }

    // Sort by match score
    return matches.sort((a, b) => b.matchScore - a.matchScore).slice(0, 5);
  }

  /**
   * Analyze market context
   */
  analyzeMarketContext(property: {
    state: string;
    city?: string;
    askingPrice: number;
    sqft?: number;
  }): DealIntelligence['marketContext'] {
    const pattern = HISTORICAL_PATTERNS[property.state] || HISTORICAL_PATTERNS.DEFAULT;
    const currentMonth = new Date().getMonth() + 1;

    // Determine market temperature
    let temperature: 'hot' | 'warm' | 'cool' | 'cold';
    if (pattern.hotMonths.includes(currentMonth)) {
      temperature = 'hot';
    } else if (pattern.hotMonths.includes(currentMonth - 1) || pattern.hotMonths.includes(currentMonth + 1)) {
      temperature = 'warm';
    } else {
      // Check if we're in opposite season (cold market)
      const oppositeMonths = pattern.hotMonths.map(m => ((m + 5) % 12) + 1);
      if (oppositeMonths.includes(currentMonth)) {
        temperature = 'cold';
      } else {
        temperature = 'cool';
      }
    }

    // Calculate price per sqft if available
    const pricePerSqft = property.sqft ? Math.round(property.askingPrice / property.sqft) : 0;

    // Best time to offer
    let bestTime = 'Submit offer early in the week (Mon-Wed)';
    if (temperature === 'hot') {
      bestTime = 'Submit immediately - competitive market';
    } else if (temperature === 'cold') {
      bestTime = 'End of month when sellers may be more motivated';
    }

    // Determine inventory level
    let inventoryLevel: 'low' | 'normal' | 'high' = 'normal';
    if (temperature === 'hot') inventoryLevel = 'low';
    else if (temperature === 'cold') inventoryLevel = 'high';

    return {
      marketTemperature: temperature,
      daysOnMarketAvg: pattern.avgDaysToClose,
      pricePerSqftAvg: pricePerSqft || 150, // Default estimate
      inventoryLevel,
      bestTimeToOffer: bestTime,
    };
  }

  /**
   * Generate action recommendation
   */
  private generateActionRecommendation(
    prediction: DealPrediction,
    pricing: PricingRecommendation,
    fundMatches: FundMatch[],
    marketContext: DealIntelligence['marketContext']
  ): string {
    const topFund = fundMatches[0];

    if (prediction.successProbability >= 75 && topFund?.matchScore >= 70) {
      return `STRONG BUY: ${prediction.successProbability}% success probability. Submit offer at $${pricing.suggestedOffer.toLocaleString()} to ${topFund.fundName} (${topFund.matchScore}% match). ${marketContext.marketTemperature === 'hot' ? 'Move fast - hot market!' : ''}`;
    } else if (prediction.successProbability >= 60 && topFund?.matchScore >= 50) {
      return `CONSIDER: Decent opportunity (${prediction.successProbability}% success). Offer $${pricing.suggestedOffer.toLocaleString()}. Best match: ${topFund.fundName}. Review the negative factors before proceeding.`;
    } else if (prediction.successProbability >= 40) {
      return `PROCEED WITH CAUTION: Marginal deal (${prediction.successProbability}% success). Only pursue if you can get significant discount. Target $${pricing.minOffer.toLocaleString()} or below.`;
    } else {
      return `PASS: Low probability of success (${prediction.successProbability}%). Focus on better opportunities unless you have unique insight.`;
    }
  }

  /**
   * Determine urgency level
   */
  private determineUrgency(
    prediction: DealPrediction,
    marketContext: DealIntelligence['marketContext'],
    daysOnMarket?: number
  ): 'high' | 'medium' | 'low' {
    if (prediction.successProbability >= 75 && marketContext.marketTemperature === 'hot') {
      return 'high';
    }
    if (daysOnMarket && daysOnMarket < 7 && prediction.successProbability >= 60) {
      return 'high';
    }
    if (prediction.successProbability >= 60) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Quick deal score for rapid assessment
   */
  quickScore(property: {
    state: string;
    askingPrice: number;
    arv?: number;
    bedrooms?: number;
  }): { score: number; verdict: string; topReason: string } {
    const prediction = this.predictDealSuccess(property);

    let verdict = 'Pass';
    if (prediction.successProbability >= 75) verdict = 'Strong Buy';
    else if (prediction.successProbability >= 60) verdict = 'Consider';
    else if (prediction.successProbability >= 45) verdict = 'Weak';

    const topReason = prediction.factors.positive[0] ||
                     prediction.factors.negative[0] ||
                     'Insufficient data for detailed analysis';

    return {
      score: prediction.successProbability,
      verdict,
      topReason,
    };
  }
}

export const dealIntelligenceService = new DealIntelligenceService();
export default dealIntelligenceService;
