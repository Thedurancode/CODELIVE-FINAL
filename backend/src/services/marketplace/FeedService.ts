/**
 * Feed Service
 *
 * Handles feed generation, deal scoring, and filtering.
 * Single responsibility: Generating personalized deal feeds for users.
 */

import { Op } from 'sequelize';
import HedgeFundBuyBox from '../../models/HedgeFundBuyBox';
import MarketplaceUser from '../../models/MarketplaceUser';
import DealAction from '../../models/DealAction';
import Property from '../../models/Property';
import { mlScoringPlugin } from '../../plugins/ml/MLScoringPlugin';
import { NormalizedDeal as PluginNormalizedDeal } from '../../plugins/types';
import { mlService } from '../../plugins/ml/MLService';
import {
  MarketplaceDeal,
  MarketplaceFeed,
  FeedRequest,
  FeedFilters,
  UserBehaviorProfile,
} from '../../types/marketplace';
import {
  MAX_BUYBOX_SCORE,
  SCORE_STATE_MATCH,
  SCORE_PRICE_RANGE,
  SCORE_PROPERTY_TYPE,
  SCORE_BEDROOMS,
  SCORE_EQUITY,
  SCORE_HOA,
  MAX_ML_SCORE,
  BASE_SCORE_WEIGHT,
  ML_CONFIDENCE_THRESHOLD,
  BOOST_PRICE_ALIGNMENT,
  BOOST_LIKED_STATE,
  BOOST_LIKED_TYPE,
  PENALTY_PASS_REASON_PATTERN,
  BOOST_DELIBERATE_HIGH_EQUITY,
  BOOST_DELIBERATE_GOOD_PRICE,
  BOOST_DECISIVE_STATE,
  BOOST_DECISIVE_TYPE,
  DECISIVE_BUYER_DURATION_RATIO,
  DELIBERATE_BUYER_VIEW_SECONDS,
  PRICE_ALIGNMENT_TOLERANCE,
  PASS_REASON_HIGH_PRICE_RATIO,
  DEFAULT_FEED_LIMIT,
  MAX_DEALS_FETCH,
  NEW_DEAL_HOURS,
} from './constants';

// =============================================================================
// TYPES
// =============================================================================

export interface NormalizedDeal {
  id: string;
  price: number;
  arv?: number;
  equity?: number;
  state: string;
  city: string;
  address?: string;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  yearBuilt?: number;
  hasPool?: boolean;
  hasGarage?: boolean;
  hasHOA?: boolean;
  photos?: string[];
  condition?: string;
  occupancyStatus?: string;
  monthlyRent?: number;
  renovationBudget?: number;
  rehabCost?: number;
  zestimate?: number;
  createdAt?: Date;
  viewCount?: number;
  offerCount?: number;
  savedCount?: number;
}

/**
 * Normalized buy box interface for feed generation
 * Maps HedgeFundBuyBox criteria to a flat structure for easier processing
 */
export interface NormalizedBuyBox {
  id: string;
  name: string;
  priority: number;
  states: string[];
  minPrice?: number;
  maxPrice?: number;
  propertyTypes?: string[];
  minBedrooms?: number;
  maxBedrooms?: number;
  minEquityPercent?: number;
  allowHoa?: boolean;
  // Original buy box for ML scoring
  original: HedgeFundBuyBox;
}

export interface MLScoreResult {
  score: number;
  confidence: number;
}

// =============================================================================
// FEED SERVICE
// =============================================================================

class FeedService {
  /**
   * Generate personalized feed for a user
   */
  async getFeedForUser(request: FeedRequest): Promise<MarketplaceFeed> {
    const { userId, page = 1, limit = DEFAULT_FEED_LIMIT, filters, buyBoxId, isAdmin } = request;

    // Get user's buy boxes (from HedgeFundBuyBox via email)
    let buyBoxes: NormalizedBuyBox[];
    if (buyBoxId) {
      const specificBox = await HedgeFundBuyBox.findByPk(buyBoxId);
      buyBoxes = specificBox ? [this.normalizeBuyBox(specificBox)] : [];
    } else {
      buyBoxes = await this.getUserBuyBoxes(userId);
    }

    const defaultFilters: FeedFilters = { sortBy: 'match_score' };
    const appliedFilters = filters ? { ...defaultFilters, ...filters } : defaultFilters;

    // Non-admin users need buy boxes to see deals
    // Admins can see all deals even without buy boxes
    if (buyBoxes.length === 0 && !isAdmin) {
      return {
        deals: [],
        pagination: { page, limit, total: 0, hasMore: false },
        filters: appliedFilters,
      };
    }

    // Get deals user has already acted on
    const actedDealIds = await this.getActedDealIds(userId);

    // Get matching deals (admins see all deals regardless of approval status)
    const matchingDeals = await this.findMatchingDeals(buyBoxes, actedDealIds, filters, isAdmin);

    // Score and rank deals
    const scoredDeals = await this.scoreDealsForUser(userId, matchingDeals, buyBoxes);

    // Sort based on filter
    const sortedDeals = this.sortDeals(scoredDeals, appliedFilters.sortBy || 'match_score');

    // Paginate
    const start = (page - 1) * limit;
    const paginatedDeals = sortedDeals.slice(start, start + limit);

    return {
      deals: paginatedDeals,
      pagination: {
        page,
        limit,
        total: sortedDeals.length,
        hasMore: start + limit < sortedDeals.length,
      },
      filters: appliedFilters,
    };
  }

  /**
   * Get user's active buy boxes (from HedgeFundBuyBox via email)
   * Links MarketplaceUser to HedgeFundBuyBox via contactEmail
   */
  async getUserBuyBoxes(userId: string): Promise<NormalizedBuyBox[]> {
    // Get user's email
    const user = await MarketplaceUser.findByPk(userId);
    if (!user?.email) {
      return [];
    }

    // Find HedgeFundBuyBoxes linked to this email
    const hedgeFundBoxes = await HedgeFundBuyBox.findAll({
      where: {
        contactEmail: user.email.toLowerCase(),
        enabled: true,
      },
      order: [['priority', 'DESC']],
    });

    // Normalize to flat structure for feed processing
    return hedgeFundBoxes.map((bb) => this.normalizeBuyBox(bb));
  }

  /**
   * Convert HedgeFundBuyBox to normalized flat structure
   */
  private normalizeBuyBox(bb: HedgeFundBuyBox): NormalizedBuyBox {
    const criteria = bb.criteria || {};
    return {
      id: bb.id,
      name: bb.name,
      priority: bb.priority,
      states: criteria.states || [],
      minPrice: criteria.minPrice,
      maxPrice: criteria.maxPrice,
      propertyTypes: criteria.propertyTypes,
      minBedrooms: criteria.minBedrooms,
      maxBedrooms: criteria.maxBedrooms,
      minEquityPercent: criteria.minEquityPercent,
      allowHoa: criteria.allowHoa,
      original: bb,
    };
  }

  /**
   * Get IDs of deals user has already acted on
   */
  private async getActedDealIds(userId: string): Promise<Set<string>> {
    const actions = await DealAction.findAll({
      where: {
        userId,
        actionType: { [Op.in]: ['like', 'pass', 'offer'] },
      },
      attributes: ['dealId'],
    });
    return new Set(actions.map((a) => a.dealId));
  }

  /**
   * Find deals matching user's buy boxes
   */
  private async findMatchingDeals(
    buyBoxes: NormalizedBuyBox[],
    excludeDealIds: Set<string>,
    filters?: Partial<FeedFilters>,
    isAdmin?: boolean
  ): Promise<NormalizedDeal[]> {
    // Build query conditions from buy boxes
    const statesSet = new Set<string>();
    let minPrice: number | undefined;
    let maxPrice: number | undefined;
    const propertyTypesSet = new Set<string>();

    for (const bb of buyBoxes) {
      bb.states.forEach((s) => statesSet.add(s));
      if (bb.minPrice && (!minPrice || bb.minPrice < minPrice)) {
        minPrice = bb.minPrice;
      }
      if (bb.maxPrice && (!maxPrice || bb.maxPrice > maxPrice)) {
        maxPrice = bb.maxPrice;
      }
      if (bb.propertyTypes) {
        bb.propertyTypes.forEach((t) => propertyTypesSet.add(t));
      }
    }

    // Build where clause for Property query
    const where: Record<string, unknown> = {};

    // Only filter by state if buy boxes have states defined
    // Admins with no buy boxes should see all deals from all states
    if (statesSet.size > 0) {
      where.state = { [Op.in]: Array.from(statesSet) };
    }

    // Only filter by approval status for non-admin users
    // Admins can see all deals regardless of approval status
    if (!isAdmin) {
      where[Op.and as unknown as string] = [
        { [Op.or]: [{ processingState: 'active' }, { approvalStatus: 'live' }] },
      ];
    }

    // Price filter
    if (minPrice || maxPrice) {
      where[Op.or as unknown as string] = [];
      const orConditions = where[Op.or as unknown as string] as Record<string, unknown>[];

      if (minPrice && maxPrice) {
        orConditions.push(
          { reservePrice: { [Op.between]: [minPrice, maxPrice] } },
          { buyItNowPrice: { [Op.between]: [minPrice, maxPrice] } }
        );
      } else if (minPrice) {
        orConditions.push(
          { reservePrice: { [Op.gte]: minPrice } },
          { buyItNowPrice: { [Op.gte]: minPrice } }
        );
      } else if (maxPrice) {
        orConditions.push(
          { reservePrice: { [Op.lte]: maxPrice } },
          { buyItNowPrice: { [Op.lte]: maxPrice } }
        );
      }
    }

    // Property type filter
    if (propertyTypesSet.size > 0) {
      where.propertyType = { [Op.in]: Array.from(propertyTypesSet) };
    }

    // Exclude already acted deals
    if (excludeDealIds.size > 0) {
      where.propertyId = { [Op.notIn]: Array.from(excludeDealIds) };
    }

    try {
      const properties = await Property.findAll({
        where,
        limit: MAX_DEALS_FETCH,
        order: [['createdAt', 'DESC']],
      });

      // Convert and filter
      return properties
        .map((p) => this.propertyToDeal(p))
        .filter((deal) => {
          if (excludeDealIds.has(deal.id)) return false;
          // Admin with no buy boxes sees all deals
          if (isAdmin && buyBoxes.length === 0) return true;
          return buyBoxes.some((bb) => this.dealMatchesBuyBox(deal, bb));
        });
    } catch (error) {
      console.warn('[FeedService] Failed to query properties:', error);
      return [];
    }
  }

  /**
   * Convert Property model to normalized deal format
   */
  propertyToDeal(property: Property): NormalizedDeal {
    const price = property.reservePrice || property.buyItNowPrice || property.startingBidAmount;
    const arv = property.arv || property.zestimate;
    const equity = price && arv ? Math.round(((arv - price) / arv) * 100) : 0;

    return {
      id: property.propertyId,
      price: price || 0,
      arv,
      equity,
      state: property.state,
      city: property.city,
      address: typeof property.address === 'string'
        ? property.address
        : `${property.address?.houseNumber || ''} ${property.address?.street || ''}`.trim(),
      propertyType: property.propertyType,
      bedrooms: property.bedroomCount,
      bathrooms: property.bathroomCount,
      sqft: property.livingSpaceSqFt,
      yearBuilt: property.yearBuilt,
      hasPool: property.pool,
      hasGarage: !!property.garage,
      hasHOA: property.hoa,
      photos: property.photoLinks || [],
      condition: property.condition,
      occupancyStatus: property.occupancyStatus,
      monthlyRent: property.monthlyRent,
      renovationBudget: property.renovationBudget,
      rehabCost: property.rehabCost,
      zestimate: property.zestimate,
      createdAt: property.createdAt,
      viewCount: 0,
      offerCount: 0,
      savedCount: 0,
    };
  }

  /**
   * Check if deal matches buy box criteria
   */
  dealMatchesBuyBox(deal: NormalizedDeal, buyBox: NormalizedBuyBox): boolean {
    // State check (required)
    if (!buyBox.states.includes(deal.state)) return false;

    // Price range
    if (buyBox.minPrice && deal.price < buyBox.minPrice) return false;
    if (buyBox.maxPrice && deal.price > buyBox.maxPrice) return false;

    // Property type
    if (buyBox.propertyTypes && buyBox.propertyTypes.length > 0) {
      if (!buyBox.propertyTypes.includes(deal.propertyType)) return false;
    }

    // Bedrooms
    if (buyBox.minBedrooms && deal.bedrooms && deal.bedrooms < buyBox.minBedrooms) return false;
    if (buyBox.maxBedrooms && deal.bedrooms && deal.bedrooms > buyBox.maxBedrooms) return false;

    // Equity
    if (buyBox.minEquityPercent && deal.equity && deal.equity < buyBox.minEquityPercent) return false;

    return true;
  }

  /**
   * Score deals for a user using buy box matching, ML, and personalization
   */
  async scoreDealsForUser(
    userId: string,
    deals: NormalizedDeal[],
    buyBoxes: NormalizedBuyBox[],
    behaviorProfile?: UserBehaviorProfile | null
  ): Promise<MarketplaceDeal[]> {
    const mlReady = mlService.isReady();

    const scoredDeals = await Promise.all(
      deals.map(async (deal) => {
        // Base score from buy box matching
        let matchScore = this.calculateBuyBoxMatchScore(deal, buyBoxes);

        // ML scoring boost
        let mlScore = 0;
        let mlConfidence = 0;
        if (mlReady) {
          try {
            const mlResult = await this.getMLScore(deal, buyBoxes);
            mlScore = mlResult.score;
            mlConfidence = mlResult.confidence;
          } catch (error) {
            console.warn('[FeedService] ML scoring failed:', error);
          }
        }

        // Personalization boost
        if (behaviorProfile) {
          matchScore = this.applyPersonalizationBoost(matchScore, deal, behaviorProfile);
        }

        // Blend scores
        const finalScore = Math.min(100, matchScore * BASE_SCORE_WEIGHT + mlScore);

        const matchReasons = this.getMatchReasons(deal, buyBoxes);

        if (mlConfidence >= ML_CONFIDENCE_THRESHOLD) {
          matchReasons.unshift(`AI confidence: ${Math.round(mlConfidence * 100)}%`);
        }

        return {
          id: deal.id,
          deal,
          matchScore: Math.round(finalScore),
          matchReasons,
          isNew: this.isDealNew(deal),
          isFeatured: finalScore >= 90,
          viewCount: deal.viewCount || 0,
          offerCount: deal.offerCount || 0,
          savedCount: deal.savedCount || 0,
          mlConfidence: mlConfidence > 0 ? mlConfidence : undefined,
        };
      })
    );

    return scoredDeals;
  }

  /**
   * Get ML score for a deal
   */
  private async getMLScore(
    deal: NormalizedDeal,
    buyBoxes: NormalizedBuyBox[]
  ): Promise<MLScoreResult> {
    const normalizedDeal = this.normalizePropertyForML(deal);

    const primaryBuyBox = buyBoxes[0];
    if (!primaryBuyBox) {
      return { score: 0, confidence: 0 };
    }

    const buyBox = {
      id: primaryBuyBox.id,
      name: primaryBuyBox.name,
      states: primaryBuyBox.states,
      minPrice: primaryBuyBox.minPrice,
      maxPrice: primaryBuyBox.maxPrice,
      propertyTypes: primaryBuyBox.propertyTypes,
      minBedrooms: primaryBuyBox.minBedrooms,
      maxBedrooms: primaryBuyBox.maxBedrooms,
      minEquityPercent: primaryBuyBox.minEquityPercent,
    };

    try {
      const breakdowns = await mlScoringPlugin.score(normalizedDeal as unknown as PluginNormalizedDeal, buyBox as never);
      const mlBreakdown = breakdowns.find((b) => b.criterion === 'ML Deal Quality');
      if (mlBreakdown) {
        return {
          score: mlBreakdown.earnedPoints,
          confidence: mlBreakdown.passed ? 0.7 : 0.5,
        };
      }
      return { score: 0, confidence: 0 };
    } catch (error) {
      console.warn('[FeedService] ML plugin scoring error:', error);
      return { score: 0, confidence: 0 };
    }
  }

  /**
   * Normalize deal for ML scoring
   */
  private normalizePropertyForML(deal: NormalizedDeal): Record<string, unknown> {
    return {
      externalId: deal.id,
      askingPrice: deal.price,
      arv: deal.arv,
      address: {
        street: deal.address || '',
        city: deal.city || '',
        state: deal.state || '',
        zip: '',
      },
      propertyType: deal.propertyType,
      bedrooms: deal.bedrooms,
      bathrooms: deal.bathrooms,
      sqft: deal.sqft,
      yearBuilt: deal.yearBuilt,
      occupancyStatus: deal.occupancyStatus,
      monthlyRent: deal.monthlyRent,
      photos: deal.photos || [],
      condition: deal.condition,
      repairEstimate: deal.renovationBudget || deal.rehabCost,
    };
  }

  /**
   * Calculate buy box match score
   */
  calculateBuyBoxMatchScore(deal: NormalizedDeal, buyBoxes: NormalizedBuyBox[]): number {
    let bestScore = 0;

    for (const bb of buyBoxes) {
      let score = 0;
      let maxScore = 0;

      // State match (required)
      if (bb.states.includes(deal.state)) {
        score += SCORE_STATE_MATCH;
      }
      maxScore += SCORE_STATE_MATCH;

      // Price range
      if (bb.minPrice || bb.maxPrice) {
        const inRange =
          (!bb.minPrice || deal.price >= bb.minPrice) &&
          (!bb.maxPrice || deal.price <= bb.maxPrice);
        if (inRange) score += SCORE_PRICE_RANGE;
        maxScore += SCORE_PRICE_RANGE;
      }

      // Property type
      if (bb.propertyTypes && bb.propertyTypes.length > 0) {
        if (bb.propertyTypes.includes(deal.propertyType)) score += SCORE_PROPERTY_TYPE;
        maxScore += SCORE_PROPERTY_TYPE;
      }

      // Bedrooms
      if (bb.minBedrooms || bb.maxBedrooms) {
        const inRange =
          (!bb.minBedrooms || (deal.bedrooms && deal.bedrooms >= bb.minBedrooms)) &&
          (!bb.maxBedrooms || (deal.bedrooms && deal.bedrooms <= bb.maxBedrooms));
        if (inRange) score += SCORE_BEDROOMS;
        maxScore += SCORE_BEDROOMS;
      }

      // Equity
      if (bb.minEquityPercent) {
        if (deal.equity && deal.equity >= bb.minEquityPercent) score += SCORE_EQUITY;
        maxScore += SCORE_EQUITY;
      }

      // HOA preference
      if (!bb.allowHoa && !deal.hasHOA) score += SCORE_HOA;
      else if (bb.allowHoa) score += SCORE_HOA;

      const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
      bestScore = Math.max(bestScore, percentage);
    }

    return bestScore;
  }

  /**
   * Apply personalization boost based on learned behavior
   */
  applyPersonalizationBoost(
    baseScore: number,
    deal: NormalizedDeal,
    profile: UserBehaviorProfile
  ): number {
    let boost = 0;
    const prefs = profile.implicitPreferences;

    // Price preference alignment
    if (prefs.avgLikedPrice > 0) {
      const priceDiff = Math.abs(deal.price - prefs.avgLikedPrice) / prefs.avgLikedPrice;
      if (priceDiff < PRICE_ALIGNMENT_TOLERANCE) boost += BOOST_PRICE_ALIGNMENT;
    }

    // State preference
    const likedStates = prefs.likedStates as unknown as Record<string, number>;
    if (likedStates && likedStates[deal.state] > 2) {
      boost += BOOST_LIKED_STATE;
    }

    // Property type preference
    const likedTypes = prefs.likedPropertyTypes as unknown as Record<string, number>;
    if (likedTypes && likedTypes[deal.propertyType] > 2) {
      boost += BOOST_LIKED_TYPE;
    }

    // Penalty for features user typically passes on
    const passReasons = profile.topPassReasons;
    if (passReasons.some((r) => r.reason === 'price_too_high' && deal.price > prefs.avgLikedPrice * PASS_REASON_HIGH_PRICE_RATIO)) {
      boost -= PENALTY_PASS_REASON_PATTERN;
    }

    // View duration personalization
    if (prefs.avgViewDurationLiked > 0) {
      const avgViewSeconds = prefs.avgViewDurationLiked / 1000;

      if (avgViewSeconds > DELIBERATE_BUYER_VIEW_SECONDS) {
        // Deliberate buyer - boost high-equity, well-priced deals
        if (deal.equity && deal.equity > 20) boost += BOOST_DELIBERATE_HIGH_EQUITY;
        if (deal.price < prefs.avgLikedPrice) boost += BOOST_DELIBERATE_GOOD_PRICE;
      }
    }

    // Check view duration differential
    if (prefs.avgViewDurationLiked > 0 && prefs.avgViewDurationPassed > 0) {
      const durationRatio = prefs.avgViewDurationLiked / prefs.avgViewDurationPassed;

      if (durationRatio > DECISIVE_BUYER_DURATION_RATIO) {
        // User is decisive - boost explicit preferences
        if (likedStates && likedStates[deal.state] > 0) boost += BOOST_DECISIVE_STATE;
        if (likedTypes && likedTypes[deal.propertyType] > 0) boost += BOOST_DECISIVE_TYPE;
      }
    }

    return Math.min(100, Math.max(0, baseScore + boost));
  }

  /**
   * Get human-readable match reasons
   */
  getMatchReasons(deal: NormalizedDeal, buyBoxes: NormalizedBuyBox[]): string[] {
    const reasons: string[] = [];

    for (const bb of buyBoxes) {
      if (bb.states.includes(deal.state)) {
        reasons.push(`Matches ${bb.name} - ${deal.state}`);
      }
      if (bb.minPrice && bb.maxPrice && deal.price >= bb.minPrice && deal.price <= bb.maxPrice) {
        reasons.push('Price in range');
      }
      if (deal.equity && deal.equity >= 20) {
        reasons.push(`${deal.equity}% equity`);
      }
    }

    return reasons.slice(0, 3);
  }

  /**
   * Sort deals by specified criteria
   */
  sortDeals(deals: MarketplaceDeal[], sortBy: string): MarketplaceDeal[] {
    switch (sortBy) {
      case 'newest':
        return deals.sort((a, b) => {
          const dateA = a.deal.createdAt ? new Date(a.deal.createdAt).getTime() : 0;
          const dateB = b.deal.createdAt ? new Date(b.deal.createdAt).getTime() : 0;
          return dateB - dateA;
        });
      case 'price_low':
        return deals.sort((a, b) => a.deal.price - b.deal.price);
      case 'price_high':
        return deals.sort((a, b) => b.deal.price - a.deal.price);
      case 'match_score':
      default:
        return deals.sort((a, b) => b.matchScore - a.matchScore);
    }
  }

  /**
   * Check if deal is new (within last 24 hours)
   */
  private isDealNew(deal: NormalizedDeal): boolean {
    if (!deal.createdAt) return false;
    const threshold = Date.now() - NEW_DEAL_HOURS * 60 * 60 * 1000;
    return new Date(deal.createdAt).getTime() > threshold;
  }
}

export const feedService = new FeedService();
export default feedService;
