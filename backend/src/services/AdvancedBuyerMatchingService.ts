/**
 * Advanced Buyer Matching Service
 *
 * ML-powered service for matching deals with the most likely interested buyers
 * based on historical behavior, buy box criteria, and engagement patterns.
 * Prioritizes distribution to high-probability buyers.
 *
 * Features:
 * - Geographic matching (county, state, zip)
 * - Buy box criteria alignment
 * - Historical behavior analysis (likes, passes, offers)
 * - Engagement pattern recognition (view duration, activity frequency)
 * - ML prediction integration
 * - Confidence scoring with explanations
 */

import { Op, Sequelize, literal } from 'sequelize';
import Buyer from '../models/Buyer';
import BuyerContact from '../models/BuyerContact';
import Property from '../models/Property';
import DealAction from '../models/DealAction';
import MarketplaceUser from '../models/MarketplaceUser';
import UserBuyBox from '../models/UserBuyBox';
import DealMatch from '../models/DealMatch';
import { scoreRangeMatch, scoreListMatch, formatCurrency } from '../plugins/scoring/scoringUtils';

// =============================================================================
// TYPES
// =============================================================================

export interface BuyerBehaviorProfile {
  userId: string;
  buyerId?: string;
  totalViews: number;
  totalLikes: number;
  totalPasses: number;
  totalOffers: number;
  acceptedOffers: number;
  likeRate: number;          // likes / views
  offerRate: number;         // offers / likes
  conversionRate: number;    // accepted / offers
  avgViewDuration: number;   // ms

  // Inferred preferences from behavior
  preferredPriceRange: { min: number; max: number } | null;
  preferredStates: Map<string, number>;   // state -> affinity score
  preferredCounties: Map<string, number>; // county -> affinity score
  preferredPropertyTypes: Map<string, number>;
  topPassReasons: string[];

  // Engagement signals
  lastActiveAt: Date | null;
  activityScore: number;     // decay-weighted recent activity (0-100)
  engagementVelocity: number; // actions per week

  // Computed at extraction time
  extractedAt: Date;
}

export interface MatchFactor {
  name: string;
  score: number;      // 0-100
  weight: number;     // 0-1
  details: string;
}

export interface AdvancedBuyerMatch {
  buyerId: string;
  buyerName: string;
  matchScore: number;           // 0-100 weighted total
  matchFactors: MatchFactor[];
  matchReasons: string[];
  confidenceLevel: 'high' | 'medium' | 'low';
  hotPotential: boolean;
  contacts: BuyerContact[];
  suggestedContactMethod: 'email' | 'phone' | 'sms';

  // Buyer details
  buyingCounties: string[];
  buyingState: string;
  purchases6Month: number;

  // ML enhancement
  mlPredictionScore?: number;
  mlConfidence?: number;

  // Behavior insights
  behaviorProfile?: Partial<BuyerBehaviorProfile>;
}

export interface MatchingOptions {
  limit?: number;
  minScore?: number;
  minConfidence?: 'high' | 'medium' | 'low';
  includeEngagementScore?: boolean;
  includeBehaviorProfile?: boolean;
  includeMLPrediction?: boolean;
  rankBy?: 'matchScore' | 'engagement' | 'recent';
}

export interface MatchResult {
  propertyId: number;
  dealId?: string;
  matchedBuyers: AdvancedBuyerMatch[];
  statistics: {
    totalMatched: number;
    avgScore: number;
    highConfidenceCount: number;
    hotBuyerCount: number;
    topMatch: AdvancedBuyerMatch | null;
  };
  matchedAt: Date;
}

// =============================================================================
// SCORING WEIGHTS
// =============================================================================

const SCORING_WEIGHTS = {
  geographic: 0.25,           // County/state match
  buyBox: 0.20,              // Buy box criteria alignment
  historicalBehavior: 0.25,   // Past likes/passes on similar deals
  engagement: 0.15,           // Recent activity and engagement velocity
  purchaseHistory: 0.10,      // Purchases in last 6 months
  mlPrediction: 0.05,         // ML model prediction (if available)
};

// Confidence thresholds
const CONFIDENCE_THRESHOLDS = {
  high: 75,
  medium: 50,
  low: 0,
};

// Activity decay factor (half-life in days)
const ACTIVITY_DECAY_HALFLIFE = 7;

// =============================================================================
// SERVICE CLASS
// =============================================================================

class AdvancedBuyerMatchingService {
  private initialized = false;
  private behaviorProfileCache: Map<string, { profile: BuyerBehaviorProfile; cachedAt: Date }> = new Map();
  private cacheMaxAge = 60 * 60 * 1000; // 1 hour

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('✅ AdvancedBuyerMatchingService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  // ===========================================================================
  // MAIN MATCHING METHODS
  // ===========================================================================

  /**
   * Match buyers to a property using advanced ML-powered matching
   */
  async matchBuyersToProperty(
    propertyId: number,
    options: MatchingOptions = {}
  ): Promise<MatchResult> {
    const {
      limit = 50,
      minScore = 30,
      minConfidence = 'low',
      includeEngagementScore = true,
      includeBehaviorProfile = false,
      includeMLPrediction = false,
      rankBy = 'matchScore',
    } = options;

    // Get the property
    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    // Get all active buyers
    const buyers = await Buyer.findAll({
      where: { status: 'active' },
      include: [{ model: BuyerContact, as: 'contacts' }],
    });

    // Score each buyer
    const scoredBuyers: AdvancedBuyerMatch[] = [];

    for (const buyer of buyers) {
      const match = await this.scoreBuyerForProperty(buyer, property, {
        includeEngagementScore,
        includeBehaviorProfile,
        includeMLPrediction,
      });

      if (match.matchScore >= minScore) {
        const confidenceLevel = this.getConfidenceLevel(match.matchScore);
        if (this.meetsConfidenceThreshold(confidenceLevel, minConfidence)) {
          scoredBuyers.push(match);
        }
      }
    }

    // Sort by the specified ranking
    this.sortBuyerMatches(scoredBuyers, rankBy);

    // Apply limit
    const limitedBuyers = scoredBuyers.slice(0, limit);

    // Calculate statistics
    const statistics = this.calculateMatchStatistics(limitedBuyers);

    return {
      propertyId,
      dealId: property.externalId || property.propertyId,
      matchedBuyers: limitedBuyers,
      statistics,
      matchedAt: new Date(),
    };
  }

  /**
   * Score a single buyer for a property
   */
  async scoreBuyerForProperty(
    buyer: Buyer,
    property: Property,
    options: {
      includeEngagementScore?: boolean;
      includeBehaviorProfile?: boolean;
      includeMLPrediction?: boolean;
    } = {}
  ): Promise<AdvancedBuyerMatch> {
    const matchFactors: MatchFactor[] = [];
    const matchReasons: string[] = [];

    // 1. Geographic Match
    const geoScore = this.calculateGeographicScore(buyer, property);
    matchFactors.push({
      name: 'Geographic Match',
      score: geoScore.score,
      weight: SCORING_WEIGHTS.geographic,
      details: geoScore.details,
    });
    if (geoScore.score > 50) {
      matchReasons.push(geoScore.reason);
    }

    // 2. Purchase History Score
    const purchaseScore = this.calculatePurchaseHistoryScore(buyer);
    matchFactors.push({
      name: 'Purchase History',
      score: purchaseScore.score,
      weight: SCORING_WEIGHTS.purchaseHistory,
      details: purchaseScore.details,
    });
    if (purchaseScore.score > 70) {
      matchReasons.push(purchaseScore.reason);
    }

    // 3. Historical Behavior Score (if we have marketplace user linked)
    let behaviorScore = { score: 50, details: 'No behavior data available', reason: '' };
    let behaviorProfile: Partial<BuyerBehaviorProfile> | undefined;

    if (options.includeEngagementScore || options.includeBehaviorProfile) {
      const marketplaceUser = await this.findLinkedMarketplaceUser(buyer);
      if (marketplaceUser) {
        behaviorProfile = await this.extractBuyerBehaviorProfile(marketplaceUser.id);
        behaviorScore = this.calculateBehaviorScore(behaviorProfile, property);
      }
    }

    matchFactors.push({
      name: 'Historical Behavior',
      score: behaviorScore.score,
      weight: SCORING_WEIGHTS.historicalBehavior,
      details: behaviorScore.details,
    });
    if (behaviorScore.score > 60 && behaviorScore.reason) {
      matchReasons.push(behaviorScore.reason);
    }

    // 4. Buy Box Alignment Score
    const buyBoxScore = await this.calculateBuyBoxScore(buyer, property);
    matchFactors.push({
      name: 'Buy Box Alignment',
      score: buyBoxScore.score,
      weight: SCORING_WEIGHTS.buyBox,
      details: buyBoxScore.details,
    });
    if (buyBoxScore.score > 70) {
      matchReasons.push(buyBoxScore.reason);
    }

    // 5. Engagement Score
    let engagementScore = { score: 50, details: 'Engagement data not included', reason: '' };
    if (options.includeEngagementScore && behaviorProfile) {
      engagementScore = this.calculateEngagementScore(behaviorProfile);
    }
    matchFactors.push({
      name: 'Engagement Level',
      score: engagementScore.score,
      weight: SCORING_WEIGHTS.engagement,
      details: engagementScore.details,
    });
    if (engagementScore.score > 70 && engagementScore.reason) {
      matchReasons.push(engagementScore.reason);
    }

    // 6. ML Prediction Score (placeholder - integrates with existing ML infrastructure)
    let mlScore = { score: 50, confidence: 0.5 };
    if (options.includeMLPrediction) {
      mlScore = await this.getMLPredictionScore(buyer, property);
    }
    matchFactors.push({
      name: 'ML Prediction',
      score: mlScore.score,
      weight: SCORING_WEIGHTS.mlPrediction,
      details: `ML confidence: ${(mlScore.confidence * 100).toFixed(0)}%`,
    });

    // Calculate weighted total score
    const totalScore = matchFactors.reduce(
      (sum, factor) => sum + factor.score * factor.weight,
      0
    );

    // Determine confidence level
    const confidenceLevel = this.getConfidenceLevel(totalScore);

    // Determine suggested contact method
    const suggestedContactMethod = this.determineBestContactMethod(
      buyer,
      (buyer as any).contacts || []
    );

    return {
      buyerId: buyer.id,
      buyerName: buyer.name,
      matchScore: Math.round(totalScore),
      matchFactors,
      matchReasons,
      confidenceLevel,
      hotPotential: buyer.purchases6Month > 10,
      contacts: (buyer as any).contacts || [],
      suggestedContactMethod,
      buyingCounties: buyer.buyingCounties,
      buyingState: buyer.buyingState,
      purchases6Month: buyer.purchases6Month,
      mlPredictionScore: options.includeMLPrediction ? mlScore.score : undefined,
      mlConfidence: options.includeMLPrediction ? mlScore.confidence : undefined,
      behaviorProfile: options.includeBehaviorProfile ? behaviorProfile : undefined,
    };
  }

  // ===========================================================================
  // BEHAVIOR PROFILE EXTRACTION
  // ===========================================================================

  /**
   * Extract buyer behavior profile from DealAction history
   */
  async extractBuyerBehaviorProfile(
    userId: string,
    windowDays: number = 90
  ): Promise<BuyerBehaviorProfile> {
    // Check cache first
    const cached = this.behaviorProfileCache.get(userId);
    if (cached && Date.now() - cached.cachedAt.getTime() < this.cacheMaxAge) {
      return cached.profile;
    }

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);

    // Get all actions for this user within the window
    const actions = await DealAction.findAll({
      where: {
        userId,
        createdAt: { [Op.gte]: windowStart },
      },
      order: [['createdAt', 'DESC']],
    });

    // Get marketplace user stats
    const marketplaceUser = await MarketplaceUser.findByPk(userId);

    // Calculate basic metrics
    const views = actions.filter(a => a.actionType === 'view');
    const likes = actions.filter(a => a.actionType === 'like');
    const passes = actions.filter(a => a.actionType === 'pass');
    const offers = actions.filter(a => a.actionType === 'offer');

    const totalViews = views.length || 1; // Avoid division by zero
    const totalLikes = likes.length;
    const totalPasses = passes.length;
    const totalOffers = offers.length;

    // Calculate rates
    const likeRate = totalLikes / totalViews;
    const offerRate = totalLikes > 0 ? totalOffers / totalLikes : 0;
    const conversionRate = marketplaceUser?.totalOffers
      ? marketplaceUser.acceptedOffers / marketplaceUser.totalOffers
      : 0;

    // Calculate average view duration
    const avgViewDuration = views.length > 0
      ? views.reduce((sum, v) => sum + (v.viewDuration || 0), 0) / views.length
      : 0;

    // Extract preferred price range from liked deals
    const likedPrices = likes
      .map(l => l.dealSnapshotPrice)
      .filter((p): p is number => p !== undefined && p > 0);

    let preferredPriceRange: { min: number; max: number } | null = null;
    if (likedPrices.length >= 3) {
      likedPrices.sort((a, b) => a - b);
      preferredPriceRange = {
        min: likedPrices[Math.floor(likedPrices.length * 0.1)],
        max: likedPrices[Math.floor(likedPrices.length * 0.9)],
      };
    }

    // Extract preferred states
    const preferredStates = new Map<string, number>();
    likes.forEach(l => {
      if (l.dealSnapshotState) {
        const current = preferredStates.get(l.dealSnapshotState) || 0;
        preferredStates.set(l.dealSnapshotState, current + 1);
      }
    });
    // Normalize to affinity scores (0-100)
    const maxStateCount = Math.max(...preferredStates.values(), 1);
    preferredStates.forEach((count, state) => {
      preferredStates.set(state, (count / maxStateCount) * 100);
    });

    // Extract preferred counties (from deal snapshot cities as proxy)
    const preferredCounties = new Map<string, number>();
    likes.forEach(l => {
      if (l.dealSnapshotCity) {
        const current = preferredCounties.get(l.dealSnapshotCity) || 0;
        preferredCounties.set(l.dealSnapshotCity, current + 1);
      }
    });
    const maxCountyCount = Math.max(...preferredCounties.values(), 1);
    preferredCounties.forEach((count, county) => {
      preferredCounties.set(county, (count / maxCountyCount) * 100);
    });

    // Extract preferred property types
    const preferredPropertyTypes = new Map<string, number>();
    likes.forEach(l => {
      if (l.dealSnapshotPropertyType) {
        const current = preferredPropertyTypes.get(l.dealSnapshotPropertyType) || 0;
        preferredPropertyTypes.set(l.dealSnapshotPropertyType, current + 1);
      }
    });
    const maxTypeCount = Math.max(...preferredPropertyTypes.values(), 1);
    preferredPropertyTypes.forEach((count, type) => {
      preferredPropertyTypes.set(type, (count / maxTypeCount) * 100);
    });

    // Extract top pass reasons
    const passReasonCounts = new Map<string, number>();
    passes.forEach(p => {
      if (p.passReason) {
        const current = passReasonCounts.get(p.passReason) || 0;
        passReasonCounts.set(p.passReason, current + 1);
      }
    });
    const topPassReasons = Array.from(passReasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason]) => reason);

    // Calculate activity score (decay-weighted)
    const activityScore = this.calculateActivityScore(actions);

    // Calculate engagement velocity (actions per week)
    const weeksInWindow = windowDays / 7;
    const engagementVelocity = actions.length / weeksInWindow;

    // Get last active date
    const lastActiveAt = actions.length > 0 ? actions[0].createdAt : null;

    const profile: BuyerBehaviorProfile = {
      userId,
      totalViews,
      totalLikes,
      totalPasses,
      totalOffers,
      acceptedOffers: marketplaceUser?.acceptedOffers || 0,
      likeRate,
      offerRate,
      conversionRate,
      avgViewDuration,
      preferredPriceRange,
      preferredStates,
      preferredCounties,
      preferredPropertyTypes,
      topPassReasons,
      lastActiveAt,
      activityScore,
      engagementVelocity,
      extractedAt: new Date(),
    };

    // Cache the profile
    this.behaviorProfileCache.set(userId, {
      profile,
      cachedAt: new Date(),
    });

    return profile;
  }

  // ===========================================================================
  // SCORING METHODS
  // ===========================================================================

  /**
   * Calculate geographic match score
   */
  private calculateGeographicScore(
    buyer: Buyer,
    property: Property
  ): { score: number; details: string; reason: string } {
    const propertyState = property.state?.toUpperCase();
    const propertyCounty = property.county;

    let score = 0;
    const details: string[] = [];
    let reason = '';

    // State match
    if (buyer.buyingState?.toUpperCase() === propertyState) {
      score += 40;
      details.push(`State match: ${propertyState}`);
    } else {
      details.push(`State mismatch: buyer prefers ${buyer.buyingState}, property in ${propertyState}`);
    }

    // County match
    if (propertyCounty && buyer.buyingCounties?.includes(propertyCounty)) {
      score += 60;
      details.push(`County match: ${propertyCounty}`);
      reason = `Active in ${propertyCounty} County`;
    } else if (buyer.buyingCounties?.length > 0) {
      details.push(`County mismatch: buyer active in ${buyer.buyingCounties.slice(0, 3).join(', ')}`);
    }

    return {
      score: Math.min(100, score),
      details: details.join('; '),
      reason,
    };
  }

  /**
   * Calculate purchase history score
   */
  private calculatePurchaseHistoryScore(
    buyer: Buyer
  ): { score: number; details: string; reason: string } {
    const purchases = buyer.purchases6Month || 0;

    let score = 0;
    let reason = '';

    if (purchases > 20) {
      score = 100;
      reason = `Very active buyer (${purchases} purchases in 6 months)`;
    } else if (purchases > 10) {
      score = 85;
      reason = `Hot buyer (${purchases} purchases in 6 months)`;
    } else if (purchases > 5) {
      score = 70;
    } else if (purchases > 0) {
      score = 50;
    } else {
      score = 30;
    }

    return {
      score,
      details: `${purchases} purchases in last 6 months`,
      reason,
    };
  }

  /**
   * Calculate behavior-based score
   */
  private calculateBehaviorScore(
    profile: Partial<BuyerBehaviorProfile>,
    property: Property
  ): { score: number; details: string; reason: string } {
    if (!profile.totalViews || profile.totalViews < 5) {
      return {
        score: 50,
        details: 'Insufficient behavior history',
        reason: '',
      };
    }

    let score = 50; // Base score
    const details: string[] = [];
    let reason = '';

    // Like rate bonus
    if (profile.likeRate && profile.likeRate > 0.3) {
      score += 15;
      details.push(`High like rate: ${(profile.likeRate * 100).toFixed(0)}%`);
    }

    // Price range match
    if (profile.preferredPriceRange && property.purchaseContractPrice) {
      const price = Number(property.purchaseContractPrice);
      if (price >= profile.preferredPriceRange.min && price <= profile.preferredPriceRange.max) {
        score += 20;
        details.push(`Price in preferred range: ${formatCurrency(profile.preferredPriceRange.min)}-${formatCurrency(profile.preferredPriceRange.max)}`);
        reason = 'Price matches historical preferences';
      }
    }

    // State preference match
    if (profile.preferredStates && property.state) {
      const stateAffinity = profile.preferredStates.get(property.state.toUpperCase()) || 0;
      if (stateAffinity > 50) {
        score += 10;
        details.push(`State preference match: ${stateAffinity.toFixed(0)}% affinity`);
      }
    }

    // Property type match
    if (profile.preferredPropertyTypes && property.propertyType) {
      const typeAffinity = profile.preferredPropertyTypes.get(property.propertyType) || 0;
      if (typeAffinity > 50) {
        score += 10;
        details.push(`Property type preference match`);
      }
    }

    // Conversion rate bonus
    if (profile.conversionRate && profile.conversionRate > 0.5) {
      score += 10;
      details.push(`High conversion rate: ${(profile.conversionRate * 100).toFixed(0)}%`);
    }

    return {
      score: Math.min(100, score),
      details: details.length > 0 ? details.join('; ') : 'Behavior data analyzed',
      reason,
    };
  }

  /**
   * Calculate buy box alignment score
   */
  private async calculateBuyBoxScore(
    buyer: Buyer,
    property: Property
  ): Promise<{ score: number; details: string; reason: string }> {
    // Try to find linked marketplace user and their buy boxes
    const marketplaceUser = await this.findLinkedMarketplaceUser(buyer);

    if (!marketplaceUser) {
      // No buy box data - return neutral score based on basic criteria
      return {
        score: 50,
        details: 'No buy box configuration found',
        reason: '',
      };
    }

    const buyBoxes = await UserBuyBox.findAll({
      where: { userId: marketplaceUser.id, active: true },
    });

    if (buyBoxes.length === 0) {
      return {
        score: 50,
        details: 'No active buy boxes',
        reason: '',
      };
    }

    // Score against each buy box, take the best match
    let bestScore = 0;
    let bestDetails = '';
    let bestReason = '';

    for (const buyBox of buyBoxes) {
      let boxScore = 0;
      const matchedCriteria: string[] = [];

      // Check state match
      if (buyBox.states && buyBox.states.length > 0) {
        if (buyBox.states.includes(property.state?.toUpperCase() || '')) {
          boxScore += 20;
          matchedCriteria.push('State');
        }
      } else {
        boxScore += 10; // No restriction
      }

      // Check price range
      const price = Number(property.purchaseContractPrice) || Number(property.buyItNowPrice) || 0;
      if (price > 0) {
        if ((!buyBox.minPrice || price >= buyBox.minPrice) &&
            (!buyBox.maxPrice || price <= buyBox.maxPrice)) {
          boxScore += 25;
          matchedCriteria.push('Price');
        }
      }

      // Check property type
      if (buyBox.propertyTypes && buyBox.propertyTypes.length > 0) {
        if (buyBox.propertyTypes.some((t: string) =>
          t.toLowerCase() === property.propertyType?.toLowerCase()
        )) {
          boxScore += 20;
          matchedCriteria.push('Property Type');
        }
      } else {
        boxScore += 10;
      }

      // Check bedrooms
      if (property.bedroomCount) {
        if ((!buyBox.minBedrooms || property.bedroomCount >= buyBox.minBedrooms) &&
            (!buyBox.maxBedrooms || property.bedroomCount <= buyBox.maxBedrooms)) {
          boxScore += 15;
          matchedCriteria.push('Bedrooms');
        }
      }

      // Check year built
      if (property.yearBuilt) {
        if (!buyBox.minYearBuilt || property.yearBuilt >= buyBox.minYearBuilt) {
          boxScore += 10;
          matchedCriteria.push('Year Built');
        }
      }

      // Check occupancy
      if (buyBox.occupancyStatuses && buyBox.occupancyStatuses.length > 0 && property.occupancyStatus) {
        if (buyBox.occupancyStatuses.includes(property.occupancyStatus as any)) {
          boxScore += 10;
          matchedCriteria.push('Occupancy');
        }
      }

      if (boxScore > bestScore) {
        bestScore = boxScore;
        bestDetails = `Matched criteria: ${matchedCriteria.join(', ')}`;
        if (matchedCriteria.length >= 4) {
          bestReason = 'Strong buy box alignment';
        }
      }
    }

    return {
      score: Math.min(100, bestScore),
      details: bestDetails || 'Partial buy box match',
      reason: bestReason,
    };
  }

  /**
   * Calculate engagement score
   */
  private calculateEngagementScore(
    profile: Partial<BuyerBehaviorProfile>
  ): { score: number; details: string; reason: string } {
    let score = 50; // Base score
    const details: string[] = [];
    let reason = '';

    // Activity score (decay-weighted recent activity)
    if (profile.activityScore) {
      if (profile.activityScore > 70) {
        score += 25;
        details.push(`Very active: ${profile.activityScore.toFixed(0)} activity score`);
        reason = 'Very active in marketplace';
      } else if (profile.activityScore > 40) {
        score += 15;
        details.push(`Active: ${profile.activityScore.toFixed(0)} activity score`);
      } else {
        details.push(`Low activity: ${profile.activityScore.toFixed(0)} activity score`);
        score -= 10;
      }
    }

    // Engagement velocity (actions per week)
    if (profile.engagementVelocity) {
      if (profile.engagementVelocity > 20) {
        score += 20;
        details.push(`High velocity: ${profile.engagementVelocity.toFixed(1)} actions/week`);
      } else if (profile.engagementVelocity > 5) {
        score += 10;
        details.push(`Moderate velocity: ${profile.engagementVelocity.toFixed(1)} actions/week`);
      }
    }

    // Average view duration (high duration = serious interest)
    if (profile.avgViewDuration) {
      if (profile.avgViewDuration > 30000) { // > 30 seconds
        score += 15;
        details.push(`Long view times: ${(profile.avgViewDuration / 1000).toFixed(0)}s avg`);
      } else if (profile.avgViewDuration > 10000) {
        score += 5;
      }
    }

    // Recency bonus
    if (profile.lastActiveAt) {
      const daysSinceActive = (Date.now() - new Date(profile.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceActive <= 1) {
        score += 10;
        details.push('Active today');
      } else if (daysSinceActive <= 7) {
        score += 5;
        details.push('Active this week');
      }
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      details: details.join('; ') || 'Engagement data analyzed',
      reason,
    };
  }

  /**
   * Get ML prediction score (integrates with existing ML infrastructure)
   */
  private async getMLPredictionScore(
    buyer: Buyer,
    property: Property
  ): Promise<{ score: number; confidence: number }> {
    // TODO: Integrate with existing MLService when buyer matching model is trained
    // For now, return neutral score
    // This would call: mlService.predictBuyerInterest(buyer, property)

    return {
      score: 50,
      confidence: 0.5,
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Calculate activity score with exponential decay
   */
  private calculateActivityScore(actions: DealAction[]): number {
    if (actions.length === 0) return 0;

    const now = Date.now();
    let weightedSum = 0;
    let weightSum = 0;

    actions.forEach(action => {
      const actionTime = new Date(action.createdAt).getTime();
      const daysSinceAction = (now - actionTime) / (1000 * 60 * 60 * 24);

      // Exponential decay weight
      const weight = Math.pow(0.5, daysSinceAction / ACTIVITY_DECAY_HALFLIFE);

      // Different action types have different importance
      let actionValue = 1;
      switch (action.actionType) {
        case 'offer': actionValue = 3; break;
        case 'like': actionValue = 2; break;
        case 'save': actionValue = 1.5; break;
        case 'view': actionValue = 1; break;
        default: actionValue = 0.5;
      }

      weightedSum += actionValue * weight;
      weightSum += weight;
    });

    // Normalize to 0-100 scale
    const rawScore = weightSum > 0 ? (weightedSum / weightSum) * 33.33 : 0;
    return Math.min(100, rawScore * 3);
  }

  /**
   * Find linked marketplace user for a buyer
   */
  private async findLinkedMarketplaceUser(buyer: Buyer): Promise<MarketplaceUser | null> {
    // Try to find by company name match
    if (buyer.name) {
      const user = await MarketplaceUser.findOne({
        where: {
          [Op.or]: [
            { company: { [Op.iLike]: `%${buyer.name}%` } },
            { name: { [Op.iLike]: `%${buyer.name}%` } },
          ],
        },
      });
      if (user) return user;
    }

    // Try to find by email match with buyer contacts
    const contacts = await BuyerContact.findAll({
      where: { buyerId: buyer.id },
    });

    for (const contact of contacts) {
      if (contact.emails && contact.emails.length > 0) {
        for (const email of contact.emails) {
          const user = await MarketplaceUser.findOne({
            where: { email: { [Op.iLike]: email } },
          });
          if (user) return user;
        }
      }
    }

    return null;
  }

  /**
   * Determine confidence level from score
   */
  private getConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
    if (score >= CONFIDENCE_THRESHOLDS.high) return 'high';
    if (score >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Check if a confidence level meets the minimum threshold
   */
  private meetsConfidenceThreshold(
    level: 'high' | 'medium' | 'low',
    minimum: 'high' | 'medium' | 'low'
  ): boolean {
    const levels = { high: 3, medium: 2, low: 1 };
    return levels[level] >= levels[minimum];
  }

  /**
   * Determine best contact method based on available data
   */
  private determineBestContactMethod(
    buyer: Buyer,
    contacts: BuyerContact[]
  ): 'email' | 'phone' | 'sms' {
    // Find primary contact
    const primaryContact = contacts.find(c => c.isPrimary) || contacts[0];

    if (!primaryContact) return 'email';

    // Prefer email for initial contact
    if (primaryContact.emails && primaryContact.emails.length > 0) {
      return 'email';
    }

    // Fall back to phone
    if (primaryContact.phones && primaryContact.phones.length > 0) {
      // Check for mobile phones for SMS
      const mobilePhone = primaryContact.phones.find(p =>
        p.type?.toLowerCase().includes('mobile') || p.type?.toLowerCase().includes('cell')
      );
      if (mobilePhone) return 'sms';
      return 'phone';
    }

    return 'email';
  }

  /**
   * Sort buyer matches by the specified criteria
   */
  private sortBuyerMatches(
    matches: AdvancedBuyerMatch[],
    rankBy: 'matchScore' | 'engagement' | 'recent'
  ): void {
    switch (rankBy) {
      case 'engagement':
        matches.sort((a, b) => {
          const aEngagement = a.matchFactors.find(f => f.name === 'Engagement Level')?.score || 0;
          const bEngagement = b.matchFactors.find(f => f.name === 'Engagement Level')?.score || 0;
          return bEngagement - aEngagement || b.matchScore - a.matchScore;
        });
        break;
      case 'recent':
        matches.sort((a, b) => {
          const aActivity = a.behaviorProfile?.lastActiveAt?.getTime() || 0;
          const bActivity = b.behaviorProfile?.lastActiveAt?.getTime() || 0;
          return bActivity - aActivity || b.matchScore - a.matchScore;
        });
        break;
      case 'matchScore':
      default:
        matches.sort((a, b) => b.matchScore - a.matchScore);
    }
  }

  /**
   * Calculate match statistics
   */
  private calculateMatchStatistics(matches: AdvancedBuyerMatch[]) {
    if (matches.length === 0) {
      return {
        totalMatched: 0,
        avgScore: 0,
        highConfidenceCount: 0,
        hotBuyerCount: 0,
        topMatch: null,
      };
    }

    return {
      totalMatched: matches.length,
      avgScore: Math.round(matches.reduce((sum, m) => sum + m.matchScore, 0) / matches.length),
      highConfidenceCount: matches.filter(m => m.confidenceLevel === 'high').length,
      hotBuyerCount: matches.filter(m => m.hotPotential).length,
      topMatch: matches[0],
    };
  }

  // ===========================================================================
  // BATCH AND RECORDING METHODS
  // ===========================================================================

  /**
   * Match buyers to multiple properties in batch
   */
  async batchMatchBuyers(
    propertyIds: number[],
    options: MatchingOptions = {}
  ): Promise<Map<number, MatchResult>> {
    const results = new Map<number, MatchResult>();

    for (const propertyId of propertyIds) {
      try {
        const result = await this.matchBuyersToProperty(propertyId, options);
        results.set(propertyId, result);
      } catch (error) {
        console.error(`Error matching buyers for property ${propertyId}:`, error);
      }
    }

    return results;
  }

  /**
   * Record a match for ML training
   */
  async recordMatch(
    userId: string,
    dealId: string,
    propertyId: number,
    match: AdvancedBuyerMatch
  ): Promise<DealMatch> {
    return await DealMatch.create({
      userId,
      dealId,
      propertyId: String(propertyId), // Convert to string to match DealMatch model interface
      matchType: 'ml_prediction',
      matchScore: match.matchScore,
      mlConfidence: match.mlConfidence,
      matchReasons: match.matchReasons,
      actionType: 'like', // Default action type
    });
  }

  /**
   * Clear behavior profile cache
   */
  clearCache(): void {
    this.behaviorProfileCache.clear();
  }
}

// Export singleton instance
export const advancedBuyerMatchingService = new AdvancedBuyerMatchingService();
export default advancedBuyerMatchingService;
