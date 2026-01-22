/**
 * Match Service
 *
 * Handles match detection, match conditions, and celebrations.
 * Single responsibility: Determining when deals are "matches" for users.
 */

import DealMatch from '../../models/DealMatch';
import Property from '../../models/Property';
import { MatchInfo, MatchType } from '../../types/marketplace';
import { feedService, NormalizedDeal } from './FeedService';
import { behaviorAnalysisService } from './BehaviorAnalysisService';
import { notificationQueueService } from '../NotificationQueueService';
import {
  ML_MATCH_CONFIDENCE_THRESHOLD,
  BUYBOX_MATCH_THRESHOLD,
  PRIORITY_BUYBOX_MATCH_THRESHOLD,
  PRIORITY_BUYBOX_MIN_RATING,
  TOP_MATCH_REASONS_COUNT,
} from './constants';

// =============================================================================
// TYPES
// =============================================================================

export interface MatchCheckResult extends MatchInfo {
  actionId?: string;
}

// =============================================================================
// CELEBRATION MESSAGES
// =============================================================================

const CELEBRATION_MESSAGES: Record<MatchType, (score: number) => string> = {
  super_like: () => "⭐ It's a Super Match! This deal has been prioritized for you.",
  ml_prediction: (score) => `🎯 It's a Match! Our AI is ${Math.round(score)}% confident this is perfect for you.`,
  buybox_score: (score) => `💎 It's a Match! This deal scores ${Math.round(score)}% with your criteria.`,
  priority_match: () => "🏆 Priority Match! This deal fits your top investment criteria.",
};

// =============================================================================
// MATCH SERVICE
// =============================================================================

class MatchService {
  /**
   * Check if a like/super_like triggers a match
   *
   * Match conditions (any one triggers):
   * 1. Super Like - always a match
   * 2. ML confidence >= 85%
   * 3. Buy box match score >= 95%
   * 4. Priority buy box with score >= 80%
   */
  async checkMatchConditions(
    userId: string,
    dealId: string,
    deal: NormalizedDeal,
    action: 'like' | 'super_like',
    actionId: string
  ): Promise<MatchCheckResult> {
    const matchReasons: string[] = [];
    let matchType: MatchType | undefined;
    let matchScore = 0;
    let mlConfidence: number | undefined;
    let buyBoxScore: number | undefined;

    // Get user's buy boxes for scoring
    const buyBoxes = await feedService.getUserBuyBoxes(userId);

    // Calculate buy box match score
    if (buyBoxes.length > 0) {
      buyBoxScore = feedService.calculateBuyBoxMatchScore(deal, buyBoxes);
      matchReasons.push(...feedService.getMatchReasons(deal, buyBoxes));
    }

    // Get ML prediction for confidence
    const prediction = await behaviorAnalysisService.predictDealInterest(userId, dealId);
    mlConfidence = prediction.confidence;

    // Priority check: find if any priority buy box matches
    const priorityBuyBox = buyBoxes.find((bb) => bb.priority >= PRIORITY_BUYBOX_MIN_RATING);
    const priorityMatch = priorityBuyBox && buyBoxScore && buyBoxScore >= PRIORITY_BUYBOX_MATCH_THRESHOLD;

    // Determine if it's a match and why
    if (action === 'super_like') {
      matchType = 'super_like';
      matchScore = 100;
      matchReasons.unshift('You Super Liked this deal!');
    } else if (mlConfidence && mlConfidence >= ML_MATCH_CONFIDENCE_THRESHOLD) {
      matchType = 'ml_prediction';
      matchScore = mlConfidence;
      matchReasons.unshift(`AI predicts ${Math.round(mlConfidence)}% match with your preferences`);
    } else if (buyBoxScore && buyBoxScore >= BUYBOX_MATCH_THRESHOLD) {
      matchType = 'buybox_score';
      matchScore = buyBoxScore;
      matchReasons.unshift('Near-perfect match with your buy box criteria');
    } else if (priorityMatch && buyBoxScore) {
      matchType = 'priority_match';
      matchScore = buyBoxScore;
      matchReasons.unshift(`Matches your priority buy box: ${priorityBuyBox!.name}`);
    }

    const isMatch = matchType !== undefined;
    const celebrationMessage = isMatch
      ? CELEBRATION_MESSAGES[matchType!](matchScore)
      : undefined;

    return {
      isMatch,
      matchType,
      matchScore,
      matchReasons: matchReasons.slice(0, TOP_MATCH_REASONS_COUNT),
      mlConfidence,
      buyBoxScore,
      celebrationMessage,
      actionId,
    };
  }

  /**
   * Record a match in the database and queue notification
   */
  async recordMatch(
    userId: string,
    dealId: string,
    matchInfo: MatchCheckResult,
    actionType: 'like' | 'super_like'
  ): Promise<DealMatch> {
    const match = await DealMatch.create({
      userId,
      dealId,
      matchType: matchInfo.matchType || 'buybox_score',
      matchScore: matchInfo.matchScore,
      mlConfidence: matchInfo.mlConfidence,
      buyBoxScore: matchInfo.buyBoxScore,
      matchReasons: matchInfo.matchReasons,
      actionId: matchInfo.actionId,
      actionType: actionType === 'super_like' ? 'super_like' : 'like',
    });

    // Queue notification based on user preferences
    try {
      // Get the property for notification context
      const property = await Property.findByPk(dealId, {
        attributes: ['id', 'address', 'city', 'state', 'price', 'arv', 'propertyType', 'bedrooms', 'bathrooms'],
      });

      // Get user's buy boxes to find the matching one
      const buyBoxes = await feedService.getUserBuyBoxes(userId);
      const matchingBuyBox = buyBoxes[0]; // Use first/primary buy box

      if (property && matchingBuyBox) {
        await notificationQueueService.queueDealMatchNotification({
          userId,
          dealId,
          buyBoxId: matchingBuyBox.id,
          buyBoxName: matchingBuyBox.name,
          matchScore: matchInfo.matchScore,
          deal: {
            address: property.address ? `${property.address.houseNumber} ${property.address.street}` : 'Unknown Address',
            city: property.city || '',
            state: property.state || '',
            price: property.reservePrice || property.buyItNowPrice || 0,
            arv: property.arv || undefined,
            propertyType: property.propertyType || 'single_family',
            bedrooms: property.bedroomCount || undefined,
            bathrooms: property.bathroomCount || undefined,
          },
        });
      }
    } catch (notifError) {
      // Don't fail the match if notification queueing fails
      console.error('Failed to queue match notification:', notifError);
    }

    return match;
  }

  /**
   * Get all matches for a user
   */
  async getUserMatches(userId: string, status?: string): Promise<DealMatch[]> {
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    return DealMatch.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Mark a match as viewed
   */
  async markMatchViewed(matchId: string): Promise<void> {
    await DealMatch.update(
      { status: 'viewed', viewedAt: new Date() },
      { where: { id: matchId } }
    );
  }

  /**
   * Get match statistics for a user
   */
  async getMatchStats(userId: string): Promise<{
    totalMatches: number;
    byType: Record<MatchType, number>;
    avgScore: number;
    recentMatches: DealMatch[];
  }> {
    const matches = await DealMatch.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    const byType: Record<MatchType, number> = {
      super_like: 0,
      ml_prediction: 0,
      buybox_score: 0,
      priority_match: 0,
    };

    let totalScore = 0;

    for (const match of matches) {
      if (match.matchType) {
        byType[match.matchType as MatchType]++;
      }
      totalScore += match.matchScore || 0;
    }

    return {
      totalMatches: matches.length,
      byType,
      avgScore: matches.length > 0 ? totalScore / matches.length : 0,
      recentMatches: matches.slice(0, 10),
    };
  }

  /**
   * Check if a deal has previously matched with a user
   */
  async hasExistingMatch(userId: string, dealId: string): Promise<boolean> {
    const existingMatch = await DealMatch.findOne({
      where: { userId, dealId },
    });
    return !!existingMatch;
  }
}

export const matchService = new MatchService();
export default matchService;
