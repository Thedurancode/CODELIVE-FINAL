/**
 * Marketplace Service
 *
 * Thin orchestration layer that delegates to specialized services.
 * Maintains backward compatibility with existing code.
 *
 * For new code, prefer importing from individual services:
 * - FeedService: Feed generation, scoring, filtering
 * - SwipeService: Recording swipes, tracking actions
 * - BehaviorAnalysisService: User profiles, predictions
 * - MatchService: Match detection, celebrations
 */

import MarketplaceUser from '../models/MarketplaceUser';
import UserBuyBox from '../models/UserBuyBox';
import DealOffer from '../models/DealOffer';
import DealMatch from '../models/DealMatch';
import Contact from '../models/Contact';
import {
  MarketplaceFeed,
  FeedRequest,
  SwipeRequest,
  SwipeResponse,
  OfferRequest,
  UserBehaviorProfile,
  DealPrediction,
  MatchInfo,
} from '../types/marketplace';

// Import specialized services
import { feedService, NormalizedBuyBox } from './marketplace/FeedService';
import { swipeService } from './marketplace/SwipeService';
import { behaviorAnalysisService } from './marketplace/BehaviorAnalysisService';
import { matchService } from './marketplace/MatchService';

// Re-export for convenience
export { feedService, swipeService, behaviorAnalysisService, matchService };

// =============================================================================
// MARKETPLACE SERVICE (ORCHESTRATION LAYER)
// =============================================================================

class MarketplaceService {
  // ===========================================================================
  // USER MANAGEMENT
  // ===========================================================================

  async createUser(data: {
    email: string;
    name: string;
    company?: string;
    phone?: string;
    role?: 'buyer' | 'investor' | 'wholesaler' | 'agent';
  }): Promise<MarketplaceUser> {
    return MarketplaceUser.create({
      email: data.email,
      name: data.name,
      company: data.company,
      phone: data.phone,
      role: data.role || 'buyer',
    });
  }

  async getUser(userId: string): Promise<MarketplaceUser | null> {
    return MarketplaceUser.findByPk(userId);
  }

  async updateUserActivity(userId: string): Promise<void> {
    return swipeService.updateUserActivity(userId);
  }

  // ===========================================================================
  // BUY BOX MANAGEMENT
  // ===========================================================================

  async createUserBuyBox(
    userId: string,
    data: {
      name: string;
      states: string[];
      propertyTypes?: string[];
      minPrice?: number;
      maxPrice?: number;
      minBedrooms?: number;
      maxBedrooms?: number;
      minEquityPercent?: number;
      [key: string]: unknown;
    }
  ): Promise<UserBuyBox> {
    const buyBox = await UserBuyBox.create({
      userId,
      ...data,
      propertyTypes: (data.propertyTypes || ['single_family']) as never,
    });

    // Create a buyer contact for the user if they don't have one
    try {
      const user = await MarketplaceUser.findByPk(userId);
      if (user) {
        // Check if buyer contact already exists for this user
        const existingContact = await Contact.findOne({
          where: { userId, type: 'buyer' },
        });

        if (!existingContact) {
          await Contact.create({
            userId,
            type: 'buyer',
            name: user.name || 'Unknown Buyer',
            email: user.email || null,
            state: data.states?.[0]?.toUpperCase() || null,
            status: 'active',
            tags: ['buyer', 'buybox-owner'],
            metadata: {
              buyBoxId: buyBox.id,
              source: 'user-buybox',
              states: data.states,
              propertyTypes: data.propertyTypes || ['single_family'],
              priceRange: { min: data.minPrice || 0, max: data.maxPrice || 10000000 },
            },
          });
          console.log(`📇 Created buyer contact for user ${userId}`);
        }
      }
    } catch (contactError) {
      console.error('Failed to create buyer contact:', contactError);
      // Don't fail the buybox creation if contact creation fails
    }

    return buyBox;
  }

  async getUserBuyBoxes(userId: string): Promise<NormalizedBuyBox[]> {
    return feedService.getUserBuyBoxes(userId);
  }

  async updateUserBuyBox(buyBoxId: string, data: Partial<UserBuyBox>): Promise<void> {
    await UserBuyBox.update(data, { where: { id: buyBoxId } });
  }

  // ===========================================================================
  // DEAL FEED - Delegated to FeedService
  // ===========================================================================

  async getFeedForUser(request: FeedRequest): Promise<MarketplaceFeed> {
    // Get behavior profile for personalization
    const profile = await behaviorAnalysisService.getUserBehaviorProfile(request.userId);

    // Get buy boxes
    const buyBoxes = request.buyBoxId
      ? await UserBuyBox.findAll({ where: { id: request.buyBoxId, userId: request.userId } })
      : await feedService.getUserBuyBoxes(request.userId);

    if (buyBoxes.length === 0) {
      return {
        deals: [],
        pagination: { page: request.page || 1, limit: request.limit || 20, total: 0, hasMore: false },
        filters: { sortBy: 'match_score' },
      };
    }

    return feedService.getFeedForUser(request);
  }

  // ===========================================================================
  // SWIPE ACTIONS - Delegated to SwipeService + MatchService
  // ===========================================================================

  async recordSwipe(request: SwipeRequest): Promise<SwipeResponse> {
    const swipeData = await swipeService.recordSwipe(request);

    if (!swipeData) {
      return { success: false, message: 'Deal not found' };
    }

    // Check for match (only for likes and super likes)
    let matchInfo: MatchInfo | undefined;
    const { action } = request;

    if (action === 'like' || action === 'super_like') {
      matchInfo = await matchService.checkMatchConditions(
        request.userId,
        request.dealId,
        swipeData.deal,
        action,
        swipeData.dealAction.id
      );

      // Record match if it's a match
      if (matchInfo.isMatch && matchInfo.matchType) {
        await matchService.recordMatch(
          request.userId,
          request.dealId,
          matchInfo,
          action
        );
      }
    }

    const baseMessage =
      action === 'super_like'
        ? 'Super Liked! This deal has been prioritized.'
        : action === 'like'
          ? 'Deal liked! You can now make an offer.'
          : 'Deal passed.';

    return {
      success: true,
      message: matchInfo?.isMatch ? matchInfo.celebrationMessage || baseMessage : baseMessage,
      match: matchInfo,
    };
  }

  async recordView(userId: string, dealId: string, duration?: number): Promise<void> {
    return swipeService.recordView(userId, dealId, duration);
  }

  // ===========================================================================
  // MATCHES - Delegated to MatchService
  // ===========================================================================

  async getUserMatches(userId: string, status?: string): Promise<DealMatch[]> {
    return matchService.getUserMatches(userId, status);
  }

  async markMatchViewed(matchId: string): Promise<void> {
    return matchService.markMatchViewed(matchId);
  }

  // ===========================================================================
  // OFFERS - Delegated to SwipeService
  // ===========================================================================

  async createOffer(request: OfferRequest): Promise<DealOffer> {
    return swipeService.createOffer(request);
  }

  async getUserOffers(userId: string, status?: string): Promise<DealOffer[]> {
    return swipeService.getUserOffers(userId, status);
  }

  async getDealOffers(dealId: string, status?: string): Promise<DealOffer[]> {
    return swipeService.getDealOffers(dealId, status);
  }

  async respondToOffer(
    offerId: string,
    response: 'accepted' | 'rejected' | 'countered',
    counterOffer?: { amount: number; closingDays?: number; notes?: string }
  ): Promise<DealOffer | null> {
    return swipeService.respondToOffer(offerId, response, counterOffer);
  }

  // ===========================================================================
  // HIGH-SIGNAL EVENT TRACKING - Delegated to SwipeService
  // ===========================================================================

  async trackFilterUsage(userId: string, filters: Record<string, unknown>): Promise<void> {
    return swipeService.trackFilterUsage(userId, filters);
  }

  async trackSave(userId: string, dealId: string): Promise<void> {
    return swipeService.trackSave(userId, dealId);
  }

  async trackShare(userId: string, dealId: string): Promise<void> {
    return swipeService.trackShare(userId, dealId);
  }

  async trackRequestInfo(userId: string, dealId: string): Promise<void> {
    return swipeService.trackRequestInfo(userId, dealId);
  }

  // ===========================================================================
  // BEHAVIOR & PREDICTIONS - Delegated to BehaviorAnalysisService
  // ===========================================================================

  async getUserBehaviorProfile(userId: string): Promise<UserBehaviorProfile | null> {
    return behaviorAnalysisService.getUserBehaviorProfile(userId);
  }

  async predictDealInterest(userId: string, dealId: string): Promise<DealPrediction> {
    return behaviorAnalysisService.predictDealInterest(userId, dealId);
  }

  // ===========================================================================
  // ANALYTICS - Delegated to SwipeService
  // ===========================================================================

  async getPassReasonAnalytics(userId?: string) {
    return swipeService.getPassReasonAnalytics(userId);
  }

  async getDealAnalytics(dealId: string) {
    return swipeService.getDealAnalytics(dealId);
  }

  // ===========================================================================
  // VIEW TRACKING - Delegated to SwipeService
  // ===========================================================================

  async getDealViewers(dealId: string, options?: {
    page?: number;
    limit?: number;
    includeAllActions?: boolean;
  }) {
    return swipeService.getDealViewers(dealId, options);
  }

  async getUserViewHistory(userId: string, options?: {
    page?: number;
    limit?: number;
  }) {
    return swipeService.getUserViewHistory(userId, options);
  }

  // ===========================================================================
  // FORWARD TRACKING - Delegated to SwipeService
  // ===========================================================================

  async forwardDeal(params: {
    userId: string;
    dealId: string;
    method: 'email' | 'sms' | 'internal' | 'link' | 'whatsapp' | 'other';
    recipientEmail?: string;
    recipientPhone?: string;
    recipientUserId?: string;
    recipientName?: string;
    recipientCompany?: string;
    message?: string;
    subject?: string;
    sendEmail?: boolean;
  }) {
    return swipeService.forwardDeal(params);
  }

  async getDealForwards(dealId: string, options?: {
    page?: number;
    limit?: number;
  }) {
    return swipeService.getDealForwards(dealId, options);
  }

  async getUserForwards(userId: string, options?: {
    page?: number;
    limit?: number;
  }) {
    return swipeService.getUserForwards(userId, options);
  }

  async trackForwardClick(trackingToken: string) {
    return swipeService.trackForwardClick(trackingToken);
  }

  async getForwardAnalytics(dealId?: string) {
    return swipeService.getForwardAnalytics(dealId);
  }
}

export const marketplaceService = new MarketplaceService();
export default marketplaceService;
