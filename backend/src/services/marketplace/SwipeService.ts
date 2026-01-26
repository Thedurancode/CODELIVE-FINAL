/**
 * Swipe Service
 *
 * Handles recording swipes, tracking user actions, and updating stats.
 * Single responsibility: Managing all swipe-related data operations.
 */

import MarketplaceUser from '../../models/MarketplaceUser';
import DealAction from '../../models/DealAction';
import DealOffer from '../../models/DealOffer';
import DealForward, { ForwardMethod } from '../../models/DealForward';
import DealPipeline from '../../models/DealPipeline';
import Property from '../../models/Property';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import {
  SwipeRequest,
  OfferRequest,
  PassReason,
  PASS_REASONS,
} from '../../types/marketplace';
import { feedService, NormalizedDeal } from './FeedService';
import { OFFER_EXPIRY_DAYS, TOP_PASS_REASONS_COUNT } from './constants';
import { automationEngine } from '../../plugins/automation/AutomationEngine';
import { complianceTriggerService } from '../ComplianceTriggerService';
import { pipelineService } from '../PipelineService';
import { webhookService } from '../WebhookService';
import { activityFeedService } from '../ActivityFeedService';

// =============================================================================
// TYPES
// =============================================================================

export interface SwipeData {
  dealAction: DealAction;
  deal: NormalizedDeal;
  matchScore?: number;
  matchedBuyBoxId?: string;
}

export interface PassReasonAnalytics {
  reason: string;
  label: string;
  count: number;
  percentage: number;
}

export interface DealAnalytics {
  views: number;
  likes: number;
  passes: number;
  offers: number;
  conversionRate: number;
  topPassReasons: { reason: string; count: number }[];
}

// =============================================================================
// SWIPE SERVICE
// =============================================================================

class SwipeService {
  /**
   * Record a swipe action (like, pass, super_like, maybe)
   */
  async recordSwipe(request: SwipeRequest): Promise<SwipeData | null> {
    const { userId, dealId, action, passReason, passReasonCustom, viewDuration, maybeNotes } = request;

    // Get deal details
    const deal = await this.getDealById(dealId);
    if (!deal) {
      return null;
    }

    // Map super_like to like for database storage (maybe stays as maybe)
    const actionType = action === 'super_like' ? 'like' : action;

    // Get user's buy boxes for match context
    const buyBoxes = await feedService.getUserBuyBoxes(userId);
    const matchScore = buyBoxes.length > 0
      ? feedService.calculateBuyBoxMatchScore(deal, buyBoxes)
      : undefined;
    const matchedBuyBoxId = buyBoxes.length > 0 ? buyBoxes[0].id : undefined;

    // Calculate days on market
    const daysOnMarket = deal.createdAt
      ? Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    // Record the action with complete snapshot
    const dealAction = await DealAction.create({
      userId,
      dealId,
      actionType,
      passReason: action === 'pass' ? passReason : undefined,
      passReasonCustom: action === 'pass' ? passReasonCustom : undefined,
      maybeNotes: action === 'maybe' ? maybeNotes : undefined,
      viewDuration,
      // Complete deal snapshot for ML training
      dealSnapshotPrice: deal.price,
      dealSnapshotArv: deal.arv,
      dealSnapshotEquity: deal.equity,
      dealSnapshotState: deal.state,
      dealSnapshotCity: deal.city,
      dealSnapshotPropertyType: deal.propertyType,
      dealSnapshotBedrooms: deal.bedrooms,
      dealSnapshotBathrooms: deal.bathrooms,
      dealSnapshotSqft: deal.sqft,
      dealSnapshotYearBuilt: deal.yearBuilt,
      dealSnapshotCondition: deal.condition,
      dealSnapshotDaysOnMarket: daysOnMarket,
      matchScore,
      matchedBuyBoxId,
    });

    // Update user stats
    if (action === 'like' || action === 'super_like') {
      await MarketplaceUser.increment('totalLikes', { where: { id: userId } });
    } else if (action === 'pass') {
      await MarketplaceUser.increment('totalPasses', { where: { id: userId } });
    }
    // 'maybe' doesn't count as like or pass

    // Update user activity
    await this.updateUserActivity(userId);

    // Log activity feed event
    const user = await MarketplaceUser.findByPk(userId);
    const activityType = (action === 'like' || action === 'super_like') ? 'deal_liked' : 'deal_passed';
    if (activityType === 'deal_liked' || activityType === 'deal_passed') {
      activityFeedService.logDealActivity(
        activityType,
        dealId,
        deal.address || `Deal ${dealId}`,
        {
          id: userId,
          name: user?.name || 'Unknown User',
          type: 'user',
        },
        undefined,
        {
          price: deal.price,
          city: deal.city,
          state: deal.state,
          matchScore,
          passReason: action === 'pass' ? passReason : undefined,
        }
      ).catch(err => console.warn('Activity logging failed:', err.message));
    }

    return {
      dealAction,
      deal,
      matchScore,
      matchedBuyBoxId,
    };
  }

  /**
   * Record a view action
   */
  async recordView(userId: string, dealId: string, duration?: number): Promise<void> {
    const deal = await this.getDealById(dealId);

    if (!deal) {
      console.warn(`[SwipeService] recordView: Deal not found: ${dealId}`);
      return;
    }

    // Check if this is the first view by this user for this deal (unique view)
    const existingView = await DealAction.findOne({
      where: { userId, dealId, actionType: 'view' },
    });
    const isUniqueView = !existingView;

    await DealAction.create({
      userId,
      dealId,
      actionType: 'view',
      viewDuration: duration,
      dealSnapshotPrice: deal.price,
      dealSnapshotState: deal.state,
    });

    await MarketplaceUser.increment('totalDealsViewed', { where: { id: userId } });
    await this.updateUserActivity(userId);

    // Only log unique views to activity feed
    if (isUniqueView) {
      const user = await MarketplaceUser.findByPk(userId);
      activityFeedService.logDealActivity(
        'deal_viewed',
        dealId,
        deal.address || `Deal ${dealId}`,
        {
          id: userId,
          name: user?.name || 'Unknown User',
          type: 'user',
        },
        undefined,
        {
          price: deal.price,
          city: deal.city,
          state: deal.state,
          isUniqueView: true,
        }
      ).catch(err => console.warn('Activity logging failed:', err.message));
    }
  }

  /**
   * Create an offer on a deal
   *
   * FIX 6: Validates buyer before allowing offer creation
   */
  async createOffer(request: OfferRequest): Promise<DealOffer> {
    // FIX 6: Buyer verification gate
    const buyer = await MarketplaceUser.findByPk(request.userId);
    if (!buyer) {
      throw new Error('User not found');
    }

    // Check if buyer is verified (if verification is required)
    if (buyer.requiresVerification && !buyer.isVerified) {
      throw new Error('You must complete buyer verification before making offers. Please verify your account.');
    }

    // For cash offers, optionally require proof of funds verification
    if (request.financeType === 'cash' && buyer.requiresProofOfFunds && !buyer.proofOfFundsVerified) {
      throw new Error('Cash offers require verified proof of funds. Please upload your POF documents.');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + OFFER_EXPIRY_DAYS);

    const offer = await DealOffer.create({
      userId: request.userId,
      dealId: request.dealId,
      offerAmount: request.offerAmount,
      earnestMoney: request.earnestMoney,
      closingDays: request.closingDays,
      contingencies: request.contingencies || [],
      notes: request.notes,
      financeType: request.financeType,
      proofOfFunds: request.proofOfFunds || false,
      expiresAt,
    });

    // Record the offer action
    await DealAction.create({
      userId: request.userId,
      dealId: request.dealId,
      actionType: 'offer',
      offerId: offer.id,
    });

    // Update user stats
    await MarketplaceUser.increment('totalOffers', { where: { id: request.userId } });

    // Emit offer.created event for seller notification
    await this.emitOfferEvent('offer.created', offer, request.userId);

    // Fire compliance trigger for offer created (sanctions screen buyer)
    // Get property ID from deal
    const property = await Property.findOne({ where: { propertyId: request.dealId } });
    if (property) {
      complianceTriggerService
        .handlePropertyEvent('offer.created', property.id, {
          offerId: offer.id,
          buyerId: request.userId,
          buyerName: buyer.name,
          buyerEmail: buyer.email,
          offerAmount: request.offerAmount,
          financeType: request.financeType,
        })
        .catch(err => console.warn('Offer created trigger failed:', err.message));

      // Also fire buyer.added trigger for sanctions screening
      complianceTriggerService
        .handlePropertyEvent('buyer.added', property.id, {
          buyerId: request.userId,
          buyerName: buyer.name,
          buyerEmail: buyer.email,
          buyerCompany: buyer.company,
          source: 'offer',
        })
        .catch(err => console.warn('Buyer added trigger failed:', err.message));
    }

    // Log activity feed event for offer
    const deal = await this.getDealById(request.dealId);
    activityFeedService.logOfferActivity(
      'offer_made',
      offer.id,
      deal?.address || `Deal ${request.dealId}`,
      {
        id: request.userId,
        name: buyer.name || 'Unknown Buyer',
        type: 'user',
      },
      {
        offerAmount: request.offerAmount,
        earnestMoney: request.earnestMoney,
        closingDays: request.closingDays,
        financeType: request.financeType,
        dealId: request.dealId,
      }
    ).catch(err => console.warn('Activity logging failed:', err.message));

    return offer;
  }

  /**
   * Get user's offers
   */
  async getUserOffers(userId: string, status?: string): Promise<DealOffer[]> {
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    return DealOffer.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Respond to an offer
   *
   * When accepted:
   * - Updates pipeline to 'under_contract'
   * - Auto-rejects all other pending offers on same deal
   * - Emits events for seller/buyer notifications
   */
  async respondToOffer(
    offerId: string,
    response: 'accepted' | 'rejected' | 'countered',
    counterOffer?: { amount: number; closingDays?: number; notes?: string },
    respondedBy?: string
  ): Promise<DealOffer | null> {
    const offer = await DealOffer.findByPk(offerId, {
      include: [{ model: MarketplaceUser, as: 'user' }],
    });
    if (!offer) return null;

    const updates: Record<string, unknown> = {
      status: response,
      respondedAt: new Date(),
    };

    if (response === 'countered' && counterOffer) {
      updates.counterOfferAmount = counterOffer.amount;
      updates.counterOfferClosingDays = counterOffer.closingDays;
      updates.counterOfferNotes = counterOffer.notes;
      updates.counterOfferAt = new Date();
    }

    await offer.update(updates);

    if (response === 'accepted') {
      await MarketplaceUser.increment('acceptedOffers', { where: { id: offer.userId } });

      // FIX 1: Update pipeline to 'under_contract'
      await this.movePipelineToUnderContract(offer);

      // FIX 2: Auto-reject all other pending offers on this deal
      await this.rejectCompetingOffers(offer.dealId, offer.id);

      // Emit offer.accepted event for automation/notifications
      await this.emitOfferEvent('offer.accepted', offer, respondedBy);

      // Log activity feed event
      const deal = await this.getDealById(offer.dealId);
      activityFeedService.logOfferActivity(
        'offer_accepted',
        offer.id,
        deal?.address || `Deal ${offer.dealId}`,
        {
          id: respondedBy || 'system',
          name: 'Seller',
          type: 'user',
        },
        {
          offerAmount: offer.offerAmount,
          buyerId: offer.userId,
          buyerName: (offer as any).user?.name,
          dealId: offer.dealId,
        }
      ).catch(err => console.warn('Activity logging failed:', err.message));
    } else if (response === 'rejected') {
      // Emit offer.rejected event
      await this.emitOfferEvent('offer.rejected', offer, respondedBy);

      // Log activity feed event
      const deal = await this.getDealById(offer.dealId);
      activityFeedService.logOfferActivity(
        'offer_rejected',
        offer.id,
        deal?.address || `Deal ${offer.dealId}`,
        {
          id: respondedBy || 'system',
          name: 'Seller',
          type: 'user',
        },
        {
          offerAmount: offer.offerAmount,
          buyerId: offer.userId,
          buyerName: (offer as any).user?.name,
          dealId: offer.dealId,
        }
      ).catch(err => console.warn('Activity logging failed:', err.message));
    } else if (response === 'countered') {
      // Emit offer.countered event
      await this.emitOfferEvent('offer.countered', offer, respondedBy);
    }

    return offer;
  }

  /**
   * Move pipeline to 'under_contract' when offer is accepted
   * Uses PipelineService to ensure compliance triggers fire
   */
  private async movePipelineToUnderContract(offer: DealOffer): Promise<void> {
    try {
      // Find existing pipeline for this deal
      const pipeline = await DealPipeline.findOne({
        where: { dealId: offer.dealId },
      });

      const offerNotes = `Offer accepted: $${offer.offerAmount.toLocaleString()} by ${(offer as any).user?.name || offer.userId}`;

      if (pipeline) {
        // Update to under_contract if not already closed - USE PIPELINE SERVICE
        if (!pipeline.isClosed()) {
          await pipelineService.updateStage(pipeline.id, 'under_contract', {
            triggeredBy: 'automation',
            notes: offerNotes,
          });
          console.log(`[SwipeService] Pipeline ${pipeline.id} moved to under_contract via PipelineService`);
        }
      } else {
        // Create pipeline if doesn't exist - USE PIPELINE SERVICE
        console.log(`[SwipeService] No pipeline found for deal ${offer.dealId}, creating one`);

        const deal = await this.getDealById(offer.dealId);

        // Get property ID from deal if available
        const property = deal ? await Property.findOne({ where: { propertyId: offer.dealId } }) : null;

        const newPipeline = await pipelineService.addToPipeline(
          offer.userId,
          offer.dealId,
          {
            propertyId: property?.id,
            stage: 'under_contract',
            snapshot: deal ? {
              price: deal.price,
              arv: deal.arv,
              equity: deal.equity,
              state: deal.state,
              city: deal.city,
            } : {},
            triggeredBy: 'automation',
            notes: offerNotes,
          }
        );

        console.log(`[SwipeService] Created pipeline ${newPipeline.id} at under_contract via PipelineService`);
      }
    } catch (error) {
      console.error('[SwipeService] Failed to move pipeline to under_contract:', error);
      // Don't throw - offer acceptance should still succeed
    }
  }

  /**
   * FIX 2: Auto-reject all other pending offers when one is accepted
   */
  private async rejectCompetingOffers(dealId: string, acceptedOfferId: string): Promise<number> {
    try {
      // Find all other pending offers on this deal
      const competingOffers = await DealOffer.findAll({
        where: {
          dealId,
          id: { [Op.ne]: acceptedOfferId },
          status: 'pending',
        },
        include: [{ model: MarketplaceUser, as: 'user' }],
      });

      if (competingOffers.length === 0) {
        return 0;
      }

      // Reject all competing offers
      await DealOffer.update(
        {
          status: 'rejected',
          notes: 'Auto-rejected: Another offer was accepted',
          respondedAt: new Date(),
        },
        {
          where: {
            dealId,
            id: { [Op.ne]: acceptedOfferId },
            status: 'pending',
          },
        }
      );

      console.log(`[SwipeService] Auto-rejected ${competingOffers.length} competing offers on deal ${dealId}`);

      // Emit events for each rejected buyer
      for (const rejectedOffer of competingOffers) {
        await this.emitOfferEvent('offer.auto_rejected', rejectedOffer, 'system');
      }

      return competingOffers.length;
    } catch (error) {
      console.error('[SwipeService] Failed to reject competing offers:', error);
      return 0;
    }
  }

  /**
   * Emit offer events for automation/notifications and webhooks
   */
  private async emitOfferEvent(
    eventType: string,
    offer: DealOffer,
    triggeredBy?: string
  ): Promise<void> {
    try {
      const deal = await this.getDealById(offer.dealId);
      const buyer = await MarketplaceUser.findByPk(offer.userId);

      const eventPayload = {
        offerId: offer.id,
        dealId: offer.dealId,
        buyerId: offer.userId,
        buyerName: buyer?.name,
        buyerEmail: buyer?.email,
        offerAmount: offer.offerAmount,
        status: offer.status,
        propertyAddress: deal?.address,
        propertyPrice: deal?.price,
      };

      // Emit to automation engine
      await automationEngine.emitEvent({
        id: `${eventType}_${offer.id}_${Date.now()}`,
        type: eventType as any,
        timestamp: new Date(),
        payload: eventPayload,
        metadata: {
          dealId: offer.dealId,
          userId: offer.userId,
          sourceId: triggeredBy || 'user',
        },
      });

      // Emit to webhook service for external integrations
      // Map internal event types to webhook event types
      const webhookEventMap: Record<string, string> = {
        'offer.created': 'offer.created',
        'offer.accepted': 'offer.accepted',
        'offer.rejected': 'offer.rejected',
        'offer.countered': 'offer.countered',
        'offer.auto_rejected': 'offer.rejected',
      };

      const webhookEventType = webhookEventMap[eventType];
      if (webhookEventType) {
        await webhookService.emitOfferEvent(
          webhookEventType as any,
          offer.id,
          eventPayload,
          {
            userId: offer.userId,
            dealId: parseInt(offer.dealId) || undefined,
          }
        ).catch(err => {
          console.warn(`[SwipeService] Webhook emission failed for ${eventType}:`, err.message);
        });
      }
    } catch (error) {
      console.error(`[SwipeService] Failed to emit ${eventType} event:`, error);
    }
  }

  /**
   * Get all offers for a deal (seller view)
   */
  async getDealOffers(dealId: string, status?: string): Promise<DealOffer[]> {
    const where: Record<string, unknown> = { dealId };
    if (status) where.status = status;

    return DealOffer.findAll({
      where,
      include: [
        {
          model: MarketplaceUser,
          as: 'user',
          attributes: ['id', 'name', 'email', 'company', 'phone'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  // ===========================================================================
  // HIGH-SIGNAL EVENT TRACKING
  // ===========================================================================

  /**
   * Track filter usage
   */
  async trackFilterUsage(userId: string, filters: Record<string, unknown>): Promise<void> {
    await DealAction.create({
      userId,
      dealId: 'filter-event',
      actionType: 'filter_applied' as never,
      dealSnapshotState: (filters.states as string[] | undefined)?.[0] ?? undefined,
      dealSnapshotCity: (filters.cities as string[] | undefined)?.[0] ?? undefined,
      dealSnapshotPrice: typeof filters.minPrice === 'number' ? filters.minPrice : undefined,
    });
    await this.updateUserActivity(userId);
  }

  /**
   * Track save action
   */
  async trackSave(userId: string, dealId: string): Promise<void> {
    const deal = await this.getDealById(dealId);
    if (!deal) {
      console.warn(`[SwipeService] trackSave: Deal not found: ${dealId}`);
      return;
    }
    await DealAction.create({
      userId,
      dealId,
      actionType: 'save',
      dealSnapshotPrice: deal.price,
      dealSnapshotState: deal.state,
    });
    await this.updateUserActivity(userId);
  }

  /**
   * Track share action
   */
  async trackShare(userId: string, dealId: string): Promise<void> {
    const deal = await this.getDealById(dealId);
    if (!deal) {
      console.warn(`[SwipeService] trackShare: Deal not found: ${dealId}`);
      return;
    }
    await DealAction.create({
      userId,
      dealId,
      actionType: 'share',
      dealSnapshotPrice: deal.price,
      dealSnapshotState: deal.state,
    });
    await this.updateUserActivity(userId);
  }

  /**
   * Track request info action
   */
  async trackRequestInfo(userId: string, dealId: string): Promise<void> {
    const deal = await this.getDealById(dealId);
    if (!deal) {
      console.warn(`[SwipeService] trackRequestInfo: Deal not found: ${dealId}`);
      return;
    }
    await DealAction.create({
      userId,
      dealId,
      actionType: 'request_info' as never,
      dealSnapshotPrice: deal.price,
      dealSnapshotState: deal.state,
    });
    await this.updateUserActivity(userId);
  }

  // ===========================================================================
  // ANALYTICS
  // ===========================================================================

  /**
   * Get pass reason analytics
   */
  async getPassReasonAnalytics(userId?: string): Promise<PassReasonAnalytics[]> {
    const where: Record<string, unknown> = {
      actionType: 'pass',
      passReason: { [Symbol.for('ne')]: null },
    };
    if (userId) where.userId = userId;

    const passes = await DealAction.findAll({ where });

    const counts = passes.reduce((acc, p) => {
      acc[p.passReason!] = (acc[p.passReason!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const total = passes.length;

    return PASS_REASONS.map((r) => ({
      reason: r.value,
      label: r.label,
      count: counts[r.value] || 0,
      percentage: total > 0 ? ((counts[r.value] || 0) / total) * 100 : 0,
    })).sort((a, b) => b.count - a.count);
  }

  /**
   * Get analytics for a specific deal
   */
  async getDealAnalytics(dealId: string): Promise<DealAnalytics> {
    const actions = await DealAction.findAll({ where: { dealId } });

    const views = actions.filter((a) => a.actionType === 'view').length;
    const likes = actions.filter((a) => a.actionType === 'like').length;
    const passes = actions.filter((a) => a.actionType === 'pass').length;
    const offers = actions.filter((a) => a.actionType === 'offer').length;

    const passReasons = actions
      .filter((a) => a.actionType === 'pass' && a.passReason)
      .reduce((acc, a) => {
        acc[a.passReason!] = (acc[a.passReason!] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return {
      views,
      likes,
      passes,
      offers,
      conversionRate: views > 0 ? (offers / views) * 100 : 0,
      topPassReasons: Object.entries(passReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_PASS_REASONS_COUNT),
    };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Update user's last activity timestamp
   */
  async updateUserActivity(userId: string): Promise<void> {
    await MarketplaceUser.update(
      { lastActiveAt: new Date() },
      { where: { id: userId } }
    );
  }

  /**
   * Get deal by ID
   */
  async getDealById(dealId: string): Promise<NormalizedDeal | null> {
    try {
      const property = await Property.findOne({
        where: { propertyId: dealId },
      });

      if (property) {
        return feedService.propertyToDeal(property);
      }

      return null;
    } catch (error) {
      console.warn('[SwipeService] Failed to get property by ID:', error);
      return null;
    }
  }

  // ===========================================================================
  // MAYBE PILE
  // ===========================================================================

  /**
   * Get user's "maybe" deals (needs more research)
   */
  async getUserMaybeDeals(userId: string): Promise<{
    dealId: string;
    notes?: string;
    createdAt: Date;
    deal: NormalizedDeal | null;
  }[]> {
    const maybeActions = await DealAction.findAll({
      where: { userId, actionType: 'maybe' },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    const results = await Promise.all(
      maybeActions.map(async (action) => ({
        dealId: action.dealId,
        notes: action.maybeNotes,
        createdAt: action.createdAt,
        deal: await this.getDealById(action.dealId),
      }))
    );

    return results;
  }

  /**
   * Update notes for a maybe deal
   */
  async updateMaybeNotes(userId: string, dealId: string, notes: string): Promise<boolean> {
    const [updated] = await DealAction.update(
      { maybeNotes: notes },
      { where: { userId, dealId, actionType: 'maybe' } }
    );
    return updated > 0;
  }

  /**
   * Move a maybe deal to liked or passed
   */
  async resolveMaybeDeal(
    userId: string,
    dealId: string,
    decision: 'like' | 'pass',
    passReason?: string
  ): Promise<SwipeData | null> {
    // First, mark the maybe action as resolved (we keep it for analytics)
    // Then record the actual like/pass
    return this.recordSwipe({
      userId,
      dealId,
      action: decision,
      passReason: decision === 'pass' ? passReason as any : undefined,
    });
  }

  // ===========================================================================
  // VIEW TRACKING
  // ===========================================================================

  /**
   * Get all users who viewed a specific deal
   */
  async getDealViewers(dealId: string, options?: {
    page?: number;
    limit?: number;
    includeAllActions?: boolean;
  }): Promise<{
    viewers: {
      userId: string;
      user: { id: string; name: string; email: string; company?: string } | null;
      viewCount: number;
      totalViewDuration: number;
      firstViewedAt: Date;
      lastViewedAt: Date;
      actions: string[];
    }[];
    total: number;
    pagination: { page: number; limit: number; totalPages: number };
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const includeAllActions = options?.includeAllActions ?? true;

    // Get all view actions for this deal
    const whereClause: Record<string, unknown> = { dealId };
    if (!includeAllActions) {
      whereClause.actionType = 'view';
    }

    const actions = await DealAction.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
    });

    // Group by user
    const userMap = new Map<string, {
      viewCount: number;
      totalViewDuration: number;
      firstViewedAt: Date;
      lastViewedAt: Date;
      actions: Set<string>;
    }>();

    for (const action of actions) {
      const existing = userMap.get(action.userId);
      if (existing) {
        if (action.actionType === 'view') {
          existing.viewCount++;
          existing.totalViewDuration += action.viewDuration || 0;
        }
        existing.actions.add(action.actionType);
        if (action.createdAt < existing.firstViewedAt) {
          existing.firstViewedAt = action.createdAt;
        }
        if (action.createdAt > existing.lastViewedAt) {
          existing.lastViewedAt = action.createdAt;
        }
      } else {
        userMap.set(action.userId, {
          viewCount: action.actionType === 'view' ? 1 : 0,
          totalViewDuration: action.viewDuration || 0,
          firstViewedAt: action.createdAt,
          lastViewedAt: action.createdAt,
          actions: new Set([action.actionType]),
        });
      }
    }

    // Get user details
    const userIds = Array.from(userMap.keys());
    const users = await MarketplaceUser.findAll({
      where: { id: userIds },
      attributes: ['id', 'name', 'email', 'company'],
    });

    const userLookup = new Map(users.map(u => [u.id, u]));

    // Build result with pagination
    const total = userIds.length;
    const startIndex = (page - 1) * limit;
    const paginatedUserIds = userIds.slice(startIndex, startIndex + limit);

    const viewers = paginatedUserIds.map(userId => {
      const data = userMap.get(userId)!;
      const user = userLookup.get(userId);
      return {
        userId,
        user: user ? {
          id: user.id,
          name: user.name,
          email: user.email,
          company: user.company,
        } : null,
        viewCount: data.viewCount,
        totalViewDuration: data.totalViewDuration,
        firstViewedAt: data.firstViewedAt,
        lastViewedAt: data.lastViewedAt,
        actions: Array.from(data.actions),
      };
    });

    return {
      viewers,
      total,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all deals a user has viewed
   */
  async getUserViewHistory(userId: string, options?: {
    page?: number;
    limit?: number;
    includeAllActions?: boolean;
  }): Promise<{
    history: {
      dealId: string;
      deal: NormalizedDeal | null;
      viewCount: number;
      totalViewDuration: number;
      firstViewedAt: Date;
      lastViewedAt: Date;
      actions: string[];
      liked: boolean;
      passed: boolean;
      offered: boolean;
    }[];
    total: number;
    pagination: { page: number; limit: number; totalPages: number };
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;

    // Get all actions for this user
    const actions = await DealAction.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    // Group by deal
    const dealMap = new Map<string, {
      viewCount: number;
      totalViewDuration: number;
      firstViewedAt: Date;
      lastViewedAt: Date;
      actions: Set<string>;
    }>();

    for (const action of actions) {
      const existing = dealMap.get(action.dealId);
      if (existing) {
        if (action.actionType === 'view') {
          existing.viewCount++;
          existing.totalViewDuration += action.viewDuration || 0;
        }
        existing.actions.add(action.actionType);
        if (action.createdAt < existing.firstViewedAt) {
          existing.firstViewedAt = action.createdAt;
        }
        if (action.createdAt > existing.lastViewedAt) {
          existing.lastViewedAt = action.createdAt;
        }
      } else {
        dealMap.set(action.dealId, {
          viewCount: action.actionType === 'view' ? 1 : 0,
          totalViewDuration: action.viewDuration || 0,
          firstViewedAt: action.createdAt,
          lastViewedAt: action.createdAt,
          actions: new Set([action.actionType]),
        });
      }
    }

    // Paginate deal IDs
    const dealIds = Array.from(dealMap.keys());
    const total = dealIds.length;
    const startIndex = (page - 1) * limit;
    const paginatedDealIds = dealIds.slice(startIndex, startIndex + limit);

    // Get deal details
    const history = await Promise.all(
      paginatedDealIds.map(async dealId => {
        const data = dealMap.get(dealId)!;
        const deal = await this.getDealById(dealId);
        const actionsArray = Array.from(data.actions);

        return {
          dealId,
          deal,
          viewCount: data.viewCount,
          totalViewDuration: data.totalViewDuration,
          firstViewedAt: data.firstViewedAt,
          lastViewedAt: data.lastViewedAt,
          actions: actionsArray,
          liked: actionsArray.includes('like'),
          passed: actionsArray.includes('pass'),
          offered: actionsArray.includes('offer'),
        };
      })
    );

    return {
      history,
      total,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ===========================================================================
  // DEAL FORWARDING
  // ===========================================================================

  /**
   * Record a deal forward/share with recipient tracking
   * If method is 'email' and sendEmail is true, sends the email and tracks it
   */
  async forwardDeal(params: {
    userId: string;
    dealId: string;
    method: ForwardMethod;
    recipientEmail?: string;
    recipientPhone?: string;
    recipientUserId?: string;
    recipientName?: string;
    recipientCompany?: string;
    message?: string;
    subject?: string;
    sendEmail?: boolean; // If true and method is email, actually send the email
  }): Promise<DealForward> {
    const user = await MarketplaceUser.findByPk(params.userId);
    const deal = await this.getDealById(params.dealId);

    // Generate tracking token
    const trackingToken = uuidv4();

    const forward = await DealForward.create({
      forwardedByUserId: params.userId,
      forwardedByName: user?.name,
      forwardedByEmail: user?.email,
      dealId: params.dealId,
      recipientEmail: params.recipientEmail,
      recipientPhone: params.recipientPhone,
      recipientUserId: params.recipientUserId,
      recipientName: params.recipientName,
      recipientCompany: params.recipientCompany,
      method: params.method,
      message: params.message,
      subject: params.subject,
      trackingToken,
      // Deal snapshot
      dealSnapshotAddress: deal?.address,
      dealSnapshotPrice: deal?.price,
      dealSnapshotArv: deal?.arv,
    });

    // Send email if requested and method is email
    if (params.method === 'email' && params.sendEmail && params.recipientEmail) {
      try {
        const resendMessageId = await this.sendForwardEmail(forward, deal, user);
        if (resendMessageId) {
          await forward.update({ resendMessageId });
          await forward.markSent();
        }
      } catch (error) {
        console.error('[SwipeService] Failed to send forward email:', error);
        await forward.markFailed((error as Error).message);
      }
    }

    // Also record in DealAction for legacy compatibility
    await DealAction.create({
      userId: params.userId,
      dealId: params.dealId,
      actionType: 'share',
      dealSnapshotPrice: deal?.price,
      dealSnapshotState: deal?.state,
    });

    await this.updateUserActivity(params.userId);

    return forward;
  }

  /**
   * Send a forward email and return the Resend message ID
   */
  private async sendForwardEmail(
    forward: DealForward,
    deal: NormalizedDeal | null,
    sender: MarketplaceUser | null
  ): Promise<string | null> {
    if (!process.env.RESEND_API_KEY) {
      console.log('[SwipeService] Resend not configured, skipping email send');
      return null;
    }

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const trackingUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/forward/${forward.trackingToken}`;

    const subject = forward.subject ||
      `${sender?.name || 'Someone'} shared a deal with you: ${deal?.address || 'Property'}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Deal Shared With You</h2>

        <p style="color: #666;">
          <strong>${sender?.name || 'A Dispotree user'}</strong> thought you might be interested in this deal:
        </p>

        ${forward.message ? `<p style="color: #333; background: #f5f5f5; padding: 15px; border-radius: 8px;">${forward.message}</p>` : ''}

        <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1a1a1a;">${deal?.address || 'Property'}</h3>
          <p style="color: #666; margin: 5px 0;">${deal?.city || ''}, ${deal?.state || ''}</p>

          <div style="display: flex; gap: 20px; margin-top: 15px;">
            <div>
              <div style="color: #888; font-size: 12px;">Price</div>
              <div style="font-size: 18px; font-weight: bold; color: #2563eb;">
                $${(deal?.price || 0).toLocaleString()}
              </div>
            </div>
            ${deal?.arv ? `
            <div>
              <div style="color: #888; font-size: 12px;">ARV</div>
              <div style="font-size: 18px; font-weight: bold; color: #16a34a;">
                $${deal.arv.toLocaleString()}
              </div>
            </div>
            ` : ''}
          </div>

          <div style="margin-top: 15px; color: #666; font-size: 14px;">
            ${deal?.bedrooms ? `${deal.bedrooms} beds` : ''}
            ${deal?.bathrooms ? `• ${deal.bathrooms} baths` : ''}
            ${deal?.sqft ? `• ${deal.sqft.toLocaleString()} sqft` : ''}
          </div>
        </div>

        <a href="${trackingUrl}"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 6px; font-weight: bold;">
          View Deal Details
        </a>

        <p style="color: #888; font-size: 12px; margin-top: 30px;">
          Sent via Dispotree • ${new Date().toLocaleDateString()}
        </p>
      </div>
    `;

    const response = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'deals@dispotree.com',
      to: forward.recipientEmail!,
      subject,
      html: htmlContent,
    });

    return response.data?.id || null;
  }

  /**
   * Get all forwards for a specific deal (admin view)
   */
  async getDealForwards(dealId: string, options?: {
    page?: number;
    limit?: number;
  }): Promise<{
    forwards: DealForward[];
    total: number;
    pagination: { page: number; limit: number; totalPages: number };
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;

    const { rows: forwards, count: total } = await DealForward.findAndCountAll({
      where: { dealId },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return {
      forwards,
      total,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all forwards by a specific user
   */
  async getUserForwards(userId: string, options?: {
    page?: number;
    limit?: number;
  }): Promise<{
    forwards: DealForward[];
    total: number;
    pagination: { page: number; limit: number; totalPages: number };
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;

    const { rows: forwards, count: total } = await DealForward.findAndCountAll({
      where: { forwardedByUserId: userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return {
      forwards,
      total,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Track when a forwarded deal link is clicked
   */
  async trackForwardClick(trackingToken: string): Promise<DealForward | null> {
    const forward = await DealForward.findOne({ where: { trackingToken } });
    if (forward) {
      await forward.recordClick();
    }
    return forward;
  }

  /**
   * Get forward analytics summary
   */
  async getForwardAnalytics(dealId?: string): Promise<{
    totalForwards: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
    clickRate: number;
    topForwarders: { userId: string; name: string; count: number }[];
  }> {
    const where = dealId ? { dealId } : {};
    const forwards = await DealForward.findAll({ where });

    const byMethod: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const forwarderCounts: Record<string, { name: string; count: number }> = {};
    let clickedCount = 0;

    for (const forward of forwards) {
      byMethod[forward.method] = (byMethod[forward.method] || 0) + 1;
      byStatus[forward.status] = (byStatus[forward.status] || 0) + 1;

      if (forward.status === 'clicked' || forward.clickCount > 0) {
        clickedCount++;
      }

      const key = forward.forwardedByUserId;
      if (!forwarderCounts[key]) {
        forwarderCounts[key] = { name: forward.forwardedByName || 'Unknown', count: 0 };
      }
      forwarderCounts[key].count++;
    }

    const topForwarders = Object.entries(forwarderCounts)
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalForwards: forwards.length,
      byMethod,
      byStatus,
      clickRate: forwards.length > 0 ? (clickedCount / forwards.length) * 100 : 0,
      topForwarders,
    };
  }
}

export const swipeService = new SwipeService();
export default swipeService;
