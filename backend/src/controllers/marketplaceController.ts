/**
 * Marketplace Controller
 *
 * API endpoints for the deal marketplace:
 * - User feed (deals matched to preferences)
 * - Swipe actions (like/pass)
 * - Offers
 * - Analytics & predictions
 */

import { Request, Response } from 'express';
import { marketplaceService } from '../services/MarketplaceService';
import { dealComparisonService } from '../services/DealComparisonService';
import { notificationService } from '../services/NotificationService';
import { PASS_REASONS } from '../types/marketplace';
import UserBuyBox from '../models/UserBuyBox';

// ============================================================================
// USERS
// ============================================================================

export const createUser = async (req: Request, res: Response) => {
  try {
    const user = await marketplaceService.createUser(req.body);
    res.status(201).json({
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // SECURITY: Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot access other users profile',
        timestamp: new Date().toISOString(),
      });
    }

    const user = await marketplaceService.getUser(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// BUY BOXES
// ============================================================================

export const createBuyBox = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot create buy boxes for other users',
        timestamp: new Date().toISOString(),
      });
    }

    const buyBox = await marketplaceService.createUserBuyBox(userId, req.body);
    res.status(201).json({
      success: true,
      data: buyBox,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getUserBuyBoxes = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot access other users buy boxes',
        timestamp: new Date().toISOString(),
      });
    }

    const buyBoxes = await marketplaceService.getUserBuyBoxes(userId);
    res.json({
      success: true,
      data: buyBoxes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const updateBuyBox = async (req: Request, res: Response) => {
  try {
    const { buyBoxId } = req.params;
    const authenticatedUserId = (req as any).user?.id;

    if (!authenticatedUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        timestamp: new Date().toISOString(),
      });
    }

    // SECURITY: Verify ownership before update - prevent IDOR
    const buyBox = await UserBuyBox.findByPk(buyBoxId);
    if (!buyBox) {
      return res.status(404).json({
        success: false,
        error: 'Buy box not found',
        timestamp: new Date().toISOString(),
      });
    }
    if (buyBox.userId !== authenticatedUserId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot update other users buy boxes',
        timestamp: new Date().toISOString(),
      });
    }

    await marketplaceService.updateUserBuyBox(buyBoxId, req.body);
    res.json({
      success: true,
      message: 'Buy box updated',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// DEAL FEED
// ============================================================================

export const getFeed = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { page, limit, sortBy, buyBoxId, ...filters } = req.query;

    // Check if user is admin
    const userRole = (req as any).user?.role;
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';

    // Validate ownership - prevent IDOR (admins can access any user's feed)
    if (!isAdmin && (req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot access other users feed',
        timestamp: new Date().toISOString(),
      });
    }

    // Validate and sanitize pagination parameters
    const parsedPage = page ? parseInt(page as string, 10) : 1;
    const parsedLimit = limit ? parseInt(limit as string, 10) : 20;
    const safePage = isNaN(parsedPage) || parsedPage < 1 ? 1 : Math.min(parsedPage, 1000);
    const safeLimit = isNaN(parsedLimit) || parsedLimit < 1 ? 20 : Math.min(parsedLimit, 100);

    const feed = await marketplaceService.getFeedForUser({
      userId,
      page: safePage,
      limit: safeLimit,
      buyBoxId: buyBoxId as string,
      isAdmin, // Pass admin flag to show all deals regardless of approval status
      filters: {
        sortBy: (sortBy as any) || 'match_score',
        ...filters,
      },
    });

    res.json({
      success: true,
      data: feed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// SWIPE ACTIONS
// ============================================================================

export const swipeDeal = async (req: Request, res: Response) => {
  try {
    const { userId, dealId } = req.params;
    const { action, passReason, passReasonCustom, viewDuration } = req.body;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot perform actions for other users',
        timestamp: new Date().toISOString(),
      });
    }

    if (!['like', 'pass'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Action must be "like" or "pass"',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await marketplaceService.recordSwipe({
      userId,
      dealId,
      action,
      passReason,
      passReasonCustom,
      viewDuration,
    });

    res.json({
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const recordView = async (req: Request, res: Response) => {
  try {
    const { userId, dealId } = req.params;
    const { duration } = req.body;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot perform actions for other users',
        timestamp: new Date().toISOString(),
      });
    }

    await marketplaceService.recordView(userId, dealId, duration);

    res.json({
      success: true,
      message: 'View recorded',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getPassReasons = async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: PASS_REASONS,
    timestamp: new Date().toISOString(),
  });
};

// ============================================================================
// OFFERS
// ============================================================================

export const createOffer = async (req: Request, res: Response) => {
  try {
    const { userId, dealId } = req.params;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot create offers for other users',
        timestamp: new Date().toISOString(),
      });
    }

    const offer = await marketplaceService.createOffer({
      userId,
      dealId,
      ...req.body,
    });

    res.status(201).json({
      success: true,
      data: offer,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getUserOffers = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot access other users offers',
        timestamp: new Date().toISOString(),
      });
    }

    const offers = await marketplaceService.getUserOffers(
      userId,
      status as string
    );

    res.json({
      success: true,
      data: offers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const respondToOffer = async (req: Request, res: Response) => {
  try {
    const { offerId } = req.params;
    const { response, counterOffer } = req.body;

    if (!['accepted', 'rejected', 'countered'].includes(response)) {
      return res.status(400).json({
        success: false,
        error: 'Response must be "accepted", "rejected", or "countered"',
        timestamp: new Date().toISOString(),
      });
    }

    const offer = await marketplaceService.respondToOffer(offerId, response, counterOffer);

    if (!offer) {
      return res.status(404).json({
        success: false,
        error: 'Offer not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: offer,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getDealOffers = async (req: Request, res: Response) => {
  try {
    const { dealId } = req.params;
    const { status } = req.query;

    const offers = await marketplaceService.getDealOffers(
      dealId,
      status as string
    );

    res.json({
      success: true,
      data: offers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PREDICTIONS & ANALYTICS
// ============================================================================

export const getUserBehaviorProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot access other users behavior profile',
        timestamp: new Date().toISOString(),
      });
    }

    const profile = await marketplaceService.getUserBehaviorProfile(userId);

    res.json({
      success: true,
      data: profile,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const predictDealInterest = async (req: Request, res: Response) => {
  try {
    const { userId, dealId } = req.params;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot access other users predictions',
        timestamp: new Date().toISOString(),
      });
    }

    const prediction = await marketplaceService.predictDealInterest(userId, dealId);

    res.json({
      success: true,
      data: prediction,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getPassReasonAnalytics = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    const analytics = await marketplaceService.getPassReasonAnalytics(userId as string);

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getDealAnalytics = async (req: Request, res: Response) => {
  try {
    const analytics = await marketplaceService.getDealAnalytics(req.params.dealId);

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// DEAL COMPARISON
// ============================================================================

export const compareDeals = async (req: Request, res: Response) => {
  try {
    const { dealIds, weights } = req.body;
    const { userId } = req.query;

    if (!dealIds || !Array.isArray(dealIds)) {
      return res.status(400).json({
        success: false,
        error: 'dealIds array is required',
        timestamp: new Date().toISOString(),
      });
    }

    const comparison = await dealComparisonService.compareDeals({
      dealIds,
      userId: userId as string,
      weights,
    });

    res.json({
      success: true,
      data: comparison,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const quickCompareDeals = async (req: Request, res: Response) => {
  try {
    const { dealIds } = req.body;

    if (!dealIds || !Array.isArray(dealIds)) {
      return res.status(400).json({
        success: false,
        error: 'dealIds array is required',
        timestamp: new Date().toISOString(),
      });
    }

    const comparison = await dealComparisonService.quickCompare(dealIds);

    res.json({
      success: true,
      data: comparison,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export const getNotificationStats = async (req: Request, res: Response) => {
  try {
    const stats = notificationService.getStats();

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const sendTestNotification = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { title, message, type, priority } = req.body;

    // Validate ownership - prevent IDOR (users can only send test notifications to themselves)
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot send notifications to other users',
        timestamp: new Date().toISOString(),
      });
    }

    notificationService.sendToUser(userId, {
      type: type || 'system',
      title: title || 'Test Notification',
      message: message || 'This is a test notification',
      priority: priority || 'normal',
    });

    res.json({
      success: true,
      message: 'Notification sent',
      connected: notificationService.isUserConnected(userId),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// HIGH-SIGNAL ACTIONS
// ============================================================================

export const trackSave = async (req: Request, res: Response) => {
  try {
    const { userId, dealId } = req.params;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot track actions for other users',
        timestamp: new Date().toISOString(),
      });
    }

    await marketplaceService.trackSave(userId, dealId);

    res.json({
      success: true,
      message: 'Deal saved',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const trackShare = async (req: Request, res: Response) => {
  try {
    const { userId, dealId } = req.params;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot track actions for other users',
        timestamp: new Date().toISOString(),
      });
    }

    await marketplaceService.trackShare(userId, dealId);

    res.json({
      success: true,
      message: 'Share tracked',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const trackRequestInfo = async (req: Request, res: Response) => {
  try {
    const { userId, dealId } = req.params;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot track actions for other users',
        timestamp: new Date().toISOString(),
      });
    }

    await marketplaceService.trackRequestInfo(userId, dealId);

    res.json({
      success: true,
      message: 'Info request tracked',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const trackFilterUsage = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { filters } = req.body;

    // Validate ownership - prevent IDOR
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot track actions for other users',
        timestamp: new Date().toISOString(),
      });
    }

    await marketplaceService.trackFilterUsage(userId, filters);

    res.json({
      success: true,
      message: 'Filter usage tracked',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// MAGIC LINK MATCHES
// ============================================================================

/**
 * Get user matches via magic link token (no auth required)
 * Used for SMS notifications that link directly to matched deals
 */
export const getMatchesViaMagicLink = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Magic link token is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Import MagicLinkToken and verify
    const MagicLinkToken = (await import('../models/MagicLinkToken')).default;
    const MarketplaceUser = (await import('../models/MarketplaceUser')).default;
    const DealMatch = (await import('../models/DealMatch')).default;
    const Property = (await import('../models/Property')).default;

    const magicToken = await MagicLinkToken.verifyToken(token);
    if (!magicToken) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired magic link',
        timestamp: new Date().toISOString(),
      });
    }

    // Find user by email
    const user = await MarketplaceUser.findOne({
      where: { email: magicToken.email },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Get user's matches with property details
    const matches = await DealMatch.findAll({
      where: { userId: user.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    // Get property details for each match
    const matchesWithDeals = await Promise.all(
      matches.map(async (match: any) => {
        const property = await Property.findByPk(match.dealId, {
          attributes: [
            'id', 'address', 'city', 'state', 'zip', 'reservePrice', 'arv',
            'bedroomCount', 'bathroomCount', 'livingSpaceSqFt', 'yearBuilt', 'propertyType',
            'status', 'photoLinks', 'createdAt'
          ],
        });
        return {
          id: match.id,
          matchType: match.matchType,
          matchScore: match.matchScore,
          matchReasons: match.matchReasons,
          status: match.status,
          viewedAt: match.viewedAt,
          createdAt: match.createdAt,
          deal: property ? {
            id: property.id,
            address: property.address,
            city: property.city,
            state: property.state,
            zipCode: property.zip,
            price: property.reservePrice,
            arv: property.arv,
            bedrooms: property.bedroomCount,
            bathrooms: property.bathroomCount,
            sqft: property.livingSpaceSqFt,
            yearBuilt: property.yearBuilt,
            propertyType: property.propertyType,
            status: property.status,
            photos: property.photoLinks,
            createdAt: property.createdAt,
          } : null,
        };
      })
    );

    // Don't mark token as used - allow multiple views
    // This is intentional for SMS links that users may tap multiple times

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        matches: matchesWithDeals,
        total: matchesWithDeals.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// MAYBE PILE
// ============================================================================

/**
 * Get user's "maybe" deals (needs more research)
 */
export const getMaybeDeals = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Validate ownership
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
    }

    const { swipeService } = await import('../services/marketplace/SwipeService');
    const maybeDeals = await swipeService.getUserMaybeDeals(userId);

    res.json({
      success: true,
      data: maybeDeals,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Update notes for a maybe deal
 */
export const updateMaybeNotes = async (req: Request, res: Response) => {
  try {
    const { userId, dealId } = req.params;
    const { notes } = req.body;

    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
    }

    const { swipeService } = await import('../services/marketplace/SwipeService');
    const updated = await swipeService.updateMaybeNotes(userId, dealId, notes);

    res.json({
      success: updated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Resolve a maybe deal (move to liked or passed)
 */
export const resolveMaybeDeal = async (req: Request, res: Response) => {
  try {
    const { userId, dealId } = req.params;
    const { decision, passReason } = req.body;

    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
    }

    if (!['like', 'pass'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'Decision must be "like" or "pass"',
        timestamp: new Date().toISOString(),
      });
    }

    const { swipeService } = await import('../services/marketplace/SwipeService');
    const result = await swipeService.resolveMaybeDeal(userId, dealId, decision, passReason);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// TEAM COLLABORATION
// ============================================================================

/**
 * Assign a deal to a team member
 */
export const assignDeal = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { dealId, assignedTo, notes, priority, dueDate } = req.body;

    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
    }

    const DealAssignment = (await import('../models/DealAssignment')).default;
    const assignment = await DealAssignment.create({
      dealId,
      assignedBy: userId,
      assignedTo,
      notes,
      priority: priority || 'normal',
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });

    res.status(201).json({
      success: true,
      data: assignment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get assignments for a user (deals assigned TO them)
 */
export const getAssignments = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
    }

    const DealAssignment = (await import('../models/DealAssignment')).default;
    const { swipeService } = await import('../services/marketplace/SwipeService');

    const assignments = await DealAssignment.getAssignmentsForUser(
      userId,
      typeof status === 'string' ? status : undefined
    );

    // Enrich with deal data
    const enrichedAssignments = await Promise.all(
      assignments.map(async (assignment: any) => ({
        ...assignment.toJSON(),
        deal: await swipeService.getDealById(assignment.dealId),
      }))
    );

    res.json({
      success: true,
      data: enrichedAssignments,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Respond to an assignment
 */
export const respondToAssignment = async (req: Request, res: Response) => {
  try {
    const { userId, assignmentId } = req.params;
    const { status, responseNotes } = req.body;

    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
    }

    const DealAssignment = (await import('../models/DealAssignment')).default;
    const assignment = await DealAssignment.findByPk(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (assignment.assignedTo !== userId) {
      return res.status(403).json({
        success: false,
        error: 'This assignment is not assigned to you',
        timestamp: new Date().toISOString(),
      });
    }

    await assignment.update({
      status,
      responseNotes,
      respondedAt: new Date(),
    });

    res.json({
      success: true,
      data: assignment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get team members for assignment (users in same organization)
 */
export const getTeamMembers = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
    }

    const MarketplaceUser = (await import('../models/MarketplaceUser')).default;
    const currentUser = await MarketplaceUser.findByPk(userId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
    }

    // For now, return users from the same fund (if applicable)
    // In the future, this could use an organization model
    let teamMembers: any[] = [];
    if (currentUser.fundId) {
      teamMembers = await MarketplaceUser.findAll({
        where: { fundId: currentUser.fundId },
        attributes: ['id', 'name', 'email', 'role'],
      });
    }

    res.json({
      success: true,
      data: teamMembers.filter((m: any) => m.id !== userId),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// DEAL EXPORT
// ============================================================================

/**
 * Export liked deals as CSV and PDF via email
 */
export const exportLikedDeals = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { deals } = req.body;

    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
    }

    if (!deals || !Array.isArray(deals) || deals.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No deals provided for export',
        timestamp: new Date().toISOString(),
      });
    }

    const MarketplaceUser = (await import('../models/MarketplaceUser')).default;
    const user = await MarketplaceUser.findByPk(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
    }

    const { dealExportService } = await import('../services/DealExportService');

    // Transform deals to export format
    const exportDeals = deals.map((deal: any) => ({
      address: deal.deal?.address || deal.address,
      city: deal.deal?.city || deal.city,
      state: deal.deal?.state || deal.state,
      zip: deal.deal?.zip || deal.zip,
      price: deal.deal?.price || deal.price,
      arv: deal.deal?.arv || deal.arv,
      propertyType: deal.deal?.propertyType || deal.propertyType,
      bedrooms: deal.deal?.bedrooms || deal.bedrooms,
      bathrooms: deal.deal?.bathrooms || deal.bathrooms,
      sqft: deal.deal?.sqft || deal.sqft,
      yearBuilt: deal.deal?.yearBuilt || deal.yearBuilt,
      status: deal.deal?.status || deal.status,
      daysOnMarket: deal.deal?.daysOnMarket || deal.daysOnMarket,
      matchScore: deal.matchScore,
      likedAt: deal.likedAt,
      notes: deal.notes,
    }));

    const result = await dealExportService.sendExportEmail(
      user.email,
      user.name || 'Investor',
      exportDeals
    );

    res.json({
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Download CSV directly (no email)
 */
export const downloadDealsCSV = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { deals } = req.body;

    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
    }

    if (!deals || !Array.isArray(deals) || deals.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No deals provided',
        timestamp: new Date().toISOString(),
      });
    }

    const { dealExportService } = await import('../services/DealExportService');

    const exportDeals = deals.map((deal: any) => ({
      address: deal.deal?.address || deal.address,
      city: deal.deal?.city || deal.city,
      state: deal.deal?.state || deal.state,
      zip: deal.deal?.zip || deal.zip,
      price: deal.deal?.price || deal.price,
      arv: deal.deal?.arv || deal.arv,
      propertyType: deal.deal?.propertyType || deal.propertyType,
      bedrooms: deal.deal?.bedrooms || deal.bedrooms,
      bathrooms: deal.deal?.bathrooms || deal.bathrooms,
      sqft: deal.deal?.sqft || deal.sqft,
      yearBuilt: deal.deal?.yearBuilt || deal.yearBuilt,
      status: deal.deal?.status || deal.status,
      daysOnMarket: deal.deal?.daysOnMarket || deal.daysOnMarket,
      matchScore: deal.matchScore,
      likedAt: deal.likedAt,
      notes: deal.notes,
    }));

    const csv = dealExportService.generateCSV(exportDeals);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=liked-deals.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// VIEW TRACKING
// ============================================================================

/**
 * Get all users who viewed a specific deal
 */
export const getDealViewers = async (req: Request, res: Response) => {
  try {
    const { dealId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const includeAllActions = req.query.includeAllActions !== 'false';

    const result = await marketplaceService.getDealViewers(dealId, {
      page,
      limit,
      includeAllActions,
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get all deals a user has viewed (their view history)
 */
export const getUserViewHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // SECURITY: Validate ownership or admin access
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Cannot view other users history',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await marketplaceService.getUserViewHistory(userId, {
      page,
      limit,
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// FORWARD TRACKING
// ============================================================================

/**
 * Forward a deal to a recipient
 */
export const forwardDeal = async (req: Request, res: Response) => {
  try {
    const { userId, dealId } = req.params;
    const { method, recipientEmail, recipientPhone, recipientUserId, recipientName, recipientCompany, message, subject, sendEmail } = req.body;

    // SECURITY: Validate ownership
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
    }

    if (!method) {
      return res.status(400).json({
        success: false,
        error: 'Forward method is required',
        timestamp: new Date().toISOString(),
      });
    }

    if (!recipientEmail && !recipientPhone && !recipientUserId) {
      return res.status(400).json({
        success: false,
        error: 'At least one recipient identifier is required (email, phone, or userId)',
        timestamp: new Date().toISOString(),
      });
    }

    const forward = await marketplaceService.forwardDeal({
      userId,
      dealId,
      method,
      recipientEmail,
      recipientPhone,
      recipientUserId,
      recipientName,
      recipientCompany,
      message,
      subject,
      sendEmail: sendEmail ?? (method === 'email'), // Default to true for email method
    });

    res.status(201).json({
      success: true,
      data: forward,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get all forwards for a deal (admin)
 */
export const getDealForwards = async (req: Request, res: Response) => {
  try {
    const { dealId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await marketplaceService.getDealForwards(dealId, { page, limit });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get all forwards by a user
 */
export const getUserForwards = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // Users can view their own forwards, admins can view any
    if ((req as any).user?.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await marketplaceService.getUserForwards(userId, { page, limit });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Track a forward link click (public - no auth required)
 */
export const trackForwardClick = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const forward = await marketplaceService.trackForwardClick(token);

    if (!forward) {
      return res.status(404).json({
        success: false,
        error: 'Invalid tracking token',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: { dealId: forward.dealId },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get forward analytics (admin)
 */
export const getForwardAnalytics = async (req: Request, res: Response) => {
  try {
    const dealId = req.query.dealId as string | undefined;

    const analytics = await marketplaceService.getForwardAnalytics(dealId);

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// RESEND WEBHOOKS (Email Tracking)
// ============================================================================

/**
 * Handle Resend webhook events for email tracking
 * Tracks: sent, delivered, opened, clicked, bounced
 */
export const handleResendWebhook = async (req: Request, res: Response) => {
  try {
    const { resendWebhookService } = await import('../services/ResendWebhookService');

    // Verify webhook signature
    const signature = req.headers['svix-signature'] as string;
    const rawBody = JSON.stringify(req.body);

    if (signature && !resendWebhookService.verifySignature(rawBody, signature)) {
      console.error('[ResendWebhook] Invalid signature');
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature',
        timestamp: new Date().toISOString(),
      });
    }

    // Process the webhook event
    const result = await resendWebhookService.processEvent(req.body);

    res.json({
      success: result.success,
      message: result.message,
      forwardId: result.forwardId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ResendWebhook] Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get email tracking statistics
 */
export const getEmailTrackingStats = async (req: Request, res: Response) => {
  try {
    const { resendWebhookService } = await import('../services/ResendWebhookService');

    const stats = await resendWebhookService.getEmailTrackingStats();

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};
