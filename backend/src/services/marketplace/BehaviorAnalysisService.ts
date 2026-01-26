/**
 * Behavior Analysis Service
 *
 * Handles user behavior profiling, predictions, and pattern detection.
 * Single responsibility: Analyzing user behavior for personalization and ML.
 */

import { Op } from 'sequelize';
import DealAction from '../../models/DealAction';
import {
  UserBehaviorProfile,
  DealPrediction,
  PassReason,
} from '../../types/marketplace';
import { mlService } from '../../plugins/ml/MLService';
import { mlScoringPlugin } from '../../plugins/ml/MLScoringPlugin';
import { NormalizedDeal as PluginNormalizedDeal } from '../../plugins/types';
import { feedService, NormalizedDeal } from './FeedService';
import {
  MIN_ACTIONS_FOR_PROFILE,
  MIN_LIKED_FOR_DURATION_BASELINE,
  MIN_MEANINGFUL_DURATION_MS,
  ALMOST_LIKED_DURATION_RATIO,
  MAX_ALMOST_LIKED_DEALS,
  QUICK_DISMISS_THRESHOLD_MS,
  MAX_QUICK_DISMISS_ACTIONS,
  MIN_QUICK_DISMISS_FOR_PATTERN,
  QUICK_DISMISS_FREQUENCY_RATIO,
  PREDICTION_BASE_SCORE,
  PREDICTION_PRICE_IN_RANGE,
  PREDICTION_PRICE_TOO_HIGH,
  PREDICTION_LIKED_STATE,
  PREDICTION_LIKED_TYPE,
  PREDICTION_PASS_REASON_PENALTY,
  PREDICTION_ALMOST_LIKED_SIMILAR,
  PREDICTION_ALMOST_LIKED_BETTER_PRICE,
  PREDICTION_ALMOST_LIKED_LARGER,
  PREDICTION_ALMOST_LIKED_MORE_EQUITY,
  PREDICTION_QUICK_DISMISS_STATE,
  PREDICTION_QUICK_DISMISS_TYPE,
  PREDICTION_QUICK_DISMISS_PRICE,
  ML_PRIMARY_CONFIDENCE_THRESHOLD,
  ML_ACTIVE_SCORE_REDUCTION,
  ALMOST_LIKED_BETTER_PRICE_RATIO,
  ALMOST_LIKED_LARGER_RATIO,
  ALMOST_LIKED_MORE_EQUITY_RATIO,
  QUICK_DISMISS_HIGH_PRICE_RATIO,
  PASS_REASON_HIGH_PRICE_RATIO,
  PRICE_PREFERENCE_RANGE_FACTOR,
  PRICE_PREDICTION_RANGE_FACTOR,
  SESSION_GAP_MS,
  TOP_PASS_REASONS_COUNT,
  MAX_ML_SCORE,
} from './constants';

// =============================================================================
// TYPES
// =============================================================================

export interface PredictionFactor {
  factor: string;
  impact: 'positive' | 'negative';
  weight: number;
}

export interface AlmostLikedAnalysis {
  isAlmostLikedMatch: boolean;
  score: number;
  factors: PredictionFactor[];
}

export interface QuickDismissAnalysis {
  isQuickDismissMatch: boolean;
  score: number;
  factors: PredictionFactor[];
}

// =============================================================================
// BEHAVIOR ANALYSIS SERVICE
// =============================================================================

class BehaviorAnalysisService {
  /**
   * Build user behavior profile from actions
   */
  async getUserBehaviorProfile(userId: string): Promise<UserBehaviorProfile | null> {
    const actions = await DealAction.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    if (actions.length < MIN_ACTIONS_FOR_PROFILE) return null;

    const likes = actions.filter((a) => a.actionType === 'like');
    const passes = actions.filter((a) => a.actionType === 'pass');
    const views = actions.filter((a) => a.actionType === 'view');

    // Calculate implicit preferences
    const avgLikedPrice = this.average(
      likes.map((a) => a.dealSnapshotPrice).filter(Boolean) as number[]
    );
    const avgPassedPrice = this.average(
      passes.map((a) => a.dealSnapshotPrice).filter(Boolean) as number[]
    );

    const likedStates = this.countOccurrences(
      likes.map((a) => a.dealSnapshotState).filter(Boolean) as string[]
    );
    const passedStates = this.countOccurrences(
      passes.map((a) => a.dealSnapshotState).filter(Boolean) as string[]
    );

    const likedTypes = this.countOccurrences(
      likes.map((a) => a.dealSnapshotPropertyType).filter(Boolean) as string[]
    );
    const passedTypes = this.countOccurrences(
      passes.map((a) => a.dealSnapshotPropertyType).filter(Boolean) as string[]
    );

    // Analyze pass reasons
    const passReasons = passes
      .filter((p) => p.passReason)
      .reduce((acc, p) => {
        acc[p.passReason!] = (acc[p.passReason!] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const topPassReasons = Object.entries(passReasons)
      .map(([reason, count]) => ({
        reason: reason as PassReason,
        count,
        percentage: (count / passes.length) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_PASS_REASONS_COUNT);

    // Calculate engagement metrics
    const likeRate = views.length > 0 ? (likes.length / views.length) * 100 : 0;
    const offers = actions.filter((a) => a.actionType === 'offer');
    const offerRate = likes.length > 0 ? (offers.length / likes.length) * 100 : 0;

    return {
      userId,
      implicitPreferences: {
        avgLikedPrice,
        avgPassedPrice,
        preferredPriceRange: {
          min: avgLikedPrice * (1 - PRICE_PREFERENCE_RANGE_FACTOR),
          max: avgLikedPrice * (1 + PRICE_PREFERENCE_RANGE_FACTOR),
        },
        likedStates: new Map(Object.entries(likedStates)),
        passedStates: new Map(Object.entries(passedStates)),
        likedPropertyTypes: new Map(Object.entries(likedTypes)),
        passedPropertyTypes: new Map(Object.entries(passedTypes)),
        avgLikedSqft: this.average(
          likes.map((a) => a.dealSnapshotSqft).filter(Boolean) as number[]
        ),
        avgPassedSqft: this.average(
          passes.map((a) => a.dealSnapshotSqft).filter(Boolean) as number[]
        ),
        avgLikedBedrooms: this.average(
          likes.map((a) => a.dealSnapshotBedrooms).filter(Boolean) as number[]
        ),
        avgPassedBedrooms: this.average(
          passes.map((a) => a.dealSnapshotBedrooms).filter(Boolean) as number[]
        ),
        avgViewDurationLiked: this.average(
          likes.map((a) => a.viewDuration).filter(Boolean) as number[]
        ),
        avgViewDurationPassed: this.average(
          passes.map((a) => a.viewDuration).filter(Boolean) as number[]
        ),
      },
      topPassReasons,
      mostActiveHours: this.getMostActiveHours(actions),
      mostActiveDays: this.getMostActiveDays(actions),
      avgDealsPerSession: views.length / Math.max(1, this.countSessions(views)),
      likeRate,
      offerRate,
      conversionRate: 0,
      predictedInterests: {
        priceRange: {
          min: avgLikedPrice * (1 - PRICE_PREDICTION_RANGE_FACTOR),
          max: avgLikedPrice * (1 + PRICE_PREDICTION_RANGE_FACTOR),
        },
        states: Object.keys(likedStates).slice(0, 3),
        propertyTypes: Object.keys(likedTypes).slice(0, 3),
        minEquity: 15,
      },
      lastUpdated: new Date(),
    };
  }

  /**
   * Predict user interest in a deal
   */
  async predictDealInterest(userId: string, dealId: string): Promise<DealPrediction> {
    const profile = await this.getUserBehaviorProfile(userId);
    const deal = await this.getDealById(dealId);

    if (!profile || !deal) {
      return {
        dealId,
        userId,
        predictedAction: 'like',
        confidence: 50,
        factors: [],
      };
    }

    const factors: PredictionFactor[] = [];
    let score = PREDICTION_BASE_SCORE;
    let mlConfidence = 0;

    // ML Model Prediction (Primary when available)
    if (mlService.isReady()) {
      try {
        const buyBoxes = await feedService.getUserBuyBoxes(userId);
        if (buyBoxes.length > 0) {
          const mlResult = await this.getMLPredictionScore(deal, buyBoxes);
          if (mlResult.confidence > ML_PRIMARY_CONFIDENCE_THRESHOLD) {
            score = PREDICTION_BASE_SCORE + (mlResult.score / MAX_ML_SCORE) * 30;
            mlConfidence = mlResult.confidence;
            factors.push({
              factor: `ML model prediction: ${Math.round(mlResult.confidence * 100)}% confidence`,
              impact: mlResult.score >= MAX_ML_SCORE / 2 ? 'positive' : 'negative',
              weight: 20,
            });
          }
        }
      } catch (error) {
        console.warn('[BehaviorAnalysisService] ML prediction failed:', error);
      }
    }

    // Rule-based analysis
    const prefs = profile.implicitPreferences;
    const scoreReduction = mlConfidence > ML_PRIMARY_CONFIDENCE_THRESHOLD ? ML_ACTIVE_SCORE_REDUCTION : 1;

    // Price analysis
    if (deal.price) {
      if (
        deal.price >= prefs.preferredPriceRange.min &&
        deal.price <= prefs.preferredPriceRange.max
      ) {
        const points = Math.round(PREDICTION_PRICE_IN_RANGE * scoreReduction);
        score += points;
        factors.push({ factor: 'Price in preferred range', impact: 'positive', weight: points });
      } else if (deal.price > prefs.avgPassedPrice * QUICK_DISMISS_HIGH_PRICE_RATIO) {
        const points = Math.round(PREDICTION_PRICE_TOO_HIGH * scoreReduction);
        score -= points;
        factors.push({ factor: 'Price higher than typical passes', impact: 'negative', weight: points });
      }
    }

    // State preference
    const likedStates = prefs.likedStates as unknown as Record<string, number>;
    if (likedStates && likedStates[deal.state] > 0) {
      const points = Math.round(PREDICTION_LIKED_STATE * scoreReduction);
      score += points;
      factors.push({
        factor: `Previously liked ${deal.state} properties`,
        impact: 'positive',
        weight: points,
      });
    }

    // Property type preference
    const likedTypes = prefs.likedPropertyTypes as unknown as Record<string, number>;
    if (likedTypes && likedTypes[deal.propertyType] > 0) {
      const points = Math.round(PREDICTION_LIKED_TYPE * scoreReduction);
      score += points;
      factors.push({ factor: `Prefers ${deal.propertyType}`, impact: 'positive', weight: points });
    }

    // Pass reason analysis
    for (const reason of profile.topPassReasons) {
      if (
        reason.reason === 'price_too_high' &&
        deal.price > prefs.avgLikedPrice * PASS_REASON_HIGH_PRICE_RATIO
      ) {
        const points = Math.round(PREDICTION_PASS_REASON_PENALTY * scoreReduction);
        score -= points;
        factors.push({ factor: 'Often passes for price', impact: 'negative', weight: points });
        break;
      }
    }

    // "Almost Liked" analysis
    const almostLikedAnalysis = await this.analyzeAlmostLikedDeals(userId, deal, prefs);
    if (almostLikedAnalysis.isAlmostLikedMatch) {
      score += almostLikedAnalysis.score;
      factors.push(...almostLikedAnalysis.factors);
    }

    // Quick-dismiss pattern analysis
    const quickDismissAnalysis = await this.analyzeQuickDismissPatterns(userId, deal, prefs);
    if (quickDismissAnalysis.isQuickDismissMatch) {
      score += quickDismissAnalysis.score;
      factors.push(...quickDismissAnalysis.factors);
    }

    score = Math.min(100, Math.max(0, score));

    return {
      dealId,
      userId,
      predictedAction: score >= 50 ? 'like' : 'pass',
      confidence: Math.abs(score - 50) + 50,
      factors,
    };
  }

  // ===========================================================================
  // VIEW DURATION ANALYSIS
  // ===========================================================================

  /**
   * Find "almost liked" deals - significant view time but passed
   */
  async findAlmostLikedDeals(userId: string): Promise<DealAction[]> {
    const likedActions = await DealAction.findAll({
      where: { userId, actionType: 'like', viewDuration: { [Op.gt]: 0 } },
    });

    if (likedActions.length < MIN_LIKED_FOR_DURATION_BASELINE) return [];

    const avgLikedDuration = this.average(
      likedActions.map((a) => a.viewDuration).filter(Boolean) as number[]
    );

    if (!avgLikedDuration || avgLikedDuration < MIN_MEANINGFUL_DURATION_MS) return [];

    // Find passes where view duration was >= 70% of average liked duration
    return DealAction.findAll({
      where: {
        userId,
        actionType: 'pass',
        viewDuration: { [Op.gte]: avgLikedDuration * ALMOST_LIKED_DURATION_RATIO },
      },
      order: [['createdAt', 'DESC']],
      limit: MAX_ALMOST_LIKED_DEALS,
    });
  }

  /**
   * Analyze if deal matches "almost liked" patterns
   */
  async analyzeAlmostLikedDeals(
    userId: string,
    deal: NormalizedDeal,
    prefs: UserBehaviorProfile['implicitPreferences']
  ): Promise<AlmostLikedAnalysis> {
    const almostLiked = await this.findAlmostLikedDeals(userId);

    if (almostLiked.length === 0) {
      return { isAlmostLikedMatch: false, score: 0, factors: [] };
    }

    const factors: PredictionFactor[] = [];
    let score = 0;

    // Find similar almost-liked deals
    const similarAlmostLiked = almostLiked.filter((a) => {
      const stateMatch = a.dealSnapshotState === deal.state;
      const priceClose =
        a.dealSnapshotPrice && deal.price
          ? Math.abs(a.dealSnapshotPrice - deal.price) / deal.price < 0.2
          : false;
      const typeMatch = a.dealSnapshotPropertyType === deal.propertyType;

      return stateMatch && (priceClose || typeMatch);
    });

    if (similarAlmostLiked.length > 0) {
      score += PREDICTION_ALMOST_LIKED_SIMILAR;
      factors.push({
        factor: 'Similar to deals you carefully considered',
        impact: 'positive',
        weight: PREDICTION_ALMOST_LIKED_SIMILAR,
      });

      // Check if this deal addresses why they passed
      const passReasons = similarAlmostLiked
        .map((a) => a.passReason)
        .filter(Boolean) as string[];

      // Price concern addressed
      if (passReasons.includes('price_too_high')) {
        const avgAlmostLikedPrice = this.average(
          similarAlmostLiked.map((a) => a.dealSnapshotPrice).filter(Boolean) as number[]
        );

        if (deal.price < avgAlmostLikedPrice * ALMOST_LIKED_BETTER_PRICE_RATIO) {
          score += PREDICTION_ALMOST_LIKED_BETTER_PRICE;
          factors.push({
            factor: 'Better priced than similar deals you passed on',
            impact: 'positive',
            weight: PREDICTION_ALMOST_LIKED_BETTER_PRICE,
          });
        }
      }

      // Size concern addressed
      if (passReasons.includes('too_small')) {
        const avgAlmostLikedSqft = this.average(
          similarAlmostLiked.map((a) => a.dealSnapshotSqft).filter(Boolean) as number[]
        );

        if (deal.sqft && avgAlmostLikedSqft && deal.sqft > avgAlmostLikedSqft * ALMOST_LIKED_LARGER_RATIO) {
          score += PREDICTION_ALMOST_LIKED_LARGER;
          factors.push({
            factor: 'Larger than similar deals you passed on',
            impact: 'positive',
            weight: PREDICTION_ALMOST_LIKED_LARGER,
          });
        }
      }

      // Equity concern addressed
      if (passReasons.includes('not_enough_equity')) {
        const avgAlmostLikedEquity = this.average(
          similarAlmostLiked.map((a) => a.dealSnapshotEquity).filter(Boolean) as number[]
        );

        if (deal.equity && avgAlmostLikedEquity && deal.equity > avgAlmostLikedEquity * ALMOST_LIKED_MORE_EQUITY_RATIO) {
          score += PREDICTION_ALMOST_LIKED_MORE_EQUITY;
          factors.push({
            factor: 'More equity than similar deals you passed on',
            impact: 'positive',
            weight: PREDICTION_ALMOST_LIKED_MORE_EQUITY,
          });
        }
      }
    }

    return {
      isAlmostLikedMatch: score > 0,
      score,
      factors,
    };
  }

  /**
   * Analyze quick-dismiss patterns
   */
  async analyzeQuickDismissPatterns(
    userId: string,
    deal: NormalizedDeal,
    prefs: UserBehaviorProfile['implicitPreferences']
  ): Promise<QuickDismissAnalysis> {
    const quickDismisses = await DealAction.findAll({
      where: {
        userId,
        actionType: 'pass',
        viewDuration: { [Op.lt]: QUICK_DISMISS_THRESHOLD_MS, [Op.gt]: 0 },
      },
      order: [['createdAt', 'DESC']],
      limit: MAX_QUICK_DISMISS_ACTIONS,
    });

    if (quickDismisses.length < MIN_QUICK_DISMISS_FOR_PATTERN) {
      return { isQuickDismissMatch: false, score: 0, factors: [] };
    }

    const factors: PredictionFactor[] = [];
    let score = 0;

    const quickDismissStates = this.countOccurrences(
      quickDismisses.map((a) => a.dealSnapshotState).filter(Boolean) as string[]
    );
    const quickDismissTypes = this.countOccurrences(
      quickDismisses.map((a) => a.dealSnapshotPropertyType).filter(Boolean) as string[]
    );

    const totalQuickDismisses = quickDismisses.length;

    // State frequently quick-dismissed
    if (
      quickDismissStates[deal.state] &&
      quickDismissStates[deal.state] / totalQuickDismisses > QUICK_DISMISS_FREQUENCY_RATIO
    ) {
      score -= PREDICTION_QUICK_DISMISS_STATE;
      factors.push({
        factor: `Often quickly passes on ${deal.state} properties`,
        impact: 'negative',
        weight: PREDICTION_QUICK_DISMISS_STATE,
      });
    }

    // Type frequently quick-dismissed
    if (
      quickDismissTypes[deal.propertyType] &&
      quickDismissTypes[deal.propertyType] / totalQuickDismisses > QUICK_DISMISS_FREQUENCY_RATIO
    ) {
      score -= PREDICTION_QUICK_DISMISS_TYPE;
      factors.push({
        factor: `Often quickly passes on ${deal.propertyType}`,
        impact: 'negative',
        weight: PREDICTION_QUICK_DISMISS_TYPE,
      });
    }

    // Price pattern
    const quickDismissPrices = quickDismisses
      .map((a) => a.dealSnapshotPrice)
      .filter(Boolean) as number[];
    const avgQuickDismissPrice = this.average(quickDismissPrices);

    if (avgQuickDismissPrice > 0 && deal.price > avgQuickDismissPrice * QUICK_DISMISS_HIGH_PRICE_RATIO) {
      score -= PREDICTION_QUICK_DISMISS_PRICE;
      factors.push({
        factor: 'Price above quick-dismiss threshold',
        impact: 'negative',
        weight: PREDICTION_QUICK_DISMISS_PRICE,
      });
    }

    return {
      isQuickDismissMatch: score < 0,
      score,
      factors,
    };
  }

  /**
   * Get view duration score for an action
   */
  getViewDurationScore(duration: number | null, action: 'like' | 'pass'): number {
    if (!duration) return 0;

    const seconds = duration / 1000;

    if (action === 'like') {
      if (seconds > 60) return 15;
      if (seconds > 30) return 10;
      if (seconds > 15) return 5;
      if (seconds > 5) return 2;
      return 0;
    } else {
      if (seconds > 45) return 8;
      if (seconds > 20) return 3;
      if (seconds > 5) return 0;
      return -5;
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Get ML prediction score for a deal
   */
  private async getMLPredictionScore(
    deal: NormalizedDeal,
    buyBoxes: Awaited<ReturnType<typeof feedService.getUserBuyBoxes>>
  ): Promise<{ score: number; confidence: number }> {
    const normalizedDeal = {
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

    const primaryBuyBox = buyBoxes[0];
    if (!primaryBuyBox) {
      return { score: 0, confidence: 0 };
    }

    const { mlScoringPlugin } = await import('../../plugins/ml/MLScoringPlugin');

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
      console.warn('[BehaviorAnalysisService] ML scoring error:', error);
      return { score: 0, confidence: 0 };
    }
  }

  /**
   * Get deal by ID
   */
  private async getDealById(dealId: string): Promise<NormalizedDeal | null> {
    const { swipeService } = await import('./SwipeService');
    return swipeService.getDealById(dealId);
  }

  /**
   * Calculate average of numbers
   */
  private average(nums: number[]): number {
    if (nums.length === 0) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  /**
   * Count occurrences of items
   */
  private countOccurrences(items: string[]): Record<string, number> {
    return items.reduce((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get most active hours
   */
  private getMostActiveHours(actions: DealAction[]): number[] {
    const hours = actions.map((a) => new Date(a.createdAt).getHours());
    const counts = this.countOccurrences(hours.map(String));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => parseInt(h));
  }

  /**
   * Get most active days
   */
  private getMostActiveDays(actions: DealAction[]): string[] {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNums = actions.map((a) => new Date(a.createdAt).getDay());
    const counts = this.countOccurrences(dayNums.map(String));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => days[parseInt(d)]);
  }

  /**
   * Count sessions from actions
   */
  private countSessions(actions: DealAction[]): number {
    if (actions.length === 0) return 0;
    let sessions = 1;

    for (let i = 1; i < actions.length; i++) {
      const gap =
        new Date(actions[i - 1].createdAt).getTime() -
        new Date(actions[i].createdAt).getTime();
      if (gap > SESSION_GAP_MS) sessions++;
    }

    return sessions;
  }
}

export const behaviorAnalysisService = new BehaviorAnalysisService();
export default behaviorAnalysisService;
