/**
 * Buyer Controller
 *
 * API endpoints for managing buyers:
 * - CRUD operations for buyers
 * - CSV import
 * - Property-to-buyer matching
 */

import { Request, Response } from 'express';
import { buyerService } from '../services/BuyerService';
import { advancedBuyerMatchingService } from '../services/AdvancedBuyerMatchingService';

// ============================================================================
// BUYERS CRUD
// ============================================================================

export const getBuyers = async (req: Request, res: Response) => {
  try {
    const {
      page,
      limit,
      search,
      county,
      state,
      zip,
      status,
      hotOnly,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await buyerService.getBuyers({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      search: search as string,
      county: county as string,
      state: state as string,
      zip: zip as string,
      status: status as any,
      hotOnly: hotOnly === 'true',
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'ASC' | 'DESC',
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
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

export const getBuyer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const buyer = await buyerService.getBuyer(id);
    if (!buyer) {
      return res.status(404).json({
        success: false,
        error: 'Buyer not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        ...buyer.toJSON(),
        isHotPotential: buyer.purchases6Month > 10,
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

export const createBuyer = async (req: Request, res: Response) => {
  try {
    const buyer = await buyerService.createBuyer(req.body);

    res.status(201).json({
      success: true,
      data: buyer,
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

export const updateBuyer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const buyer = await buyerService.updateBuyer(id, req.body);
    if (!buyer) {
      return res.status(404).json({
        success: false,
        error: 'Buyer not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: buyer,
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

export const deleteBuyer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await buyerService.deleteBuyer(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Buyer not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Buyer deleted',
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
// PROPERTY MATCHING
// ============================================================================

export const getMatchedBuyers = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;

    const matchedBuyers = await buyerService.matchBuyersToProperty(
      parseInt(propertyId, 10)
    );

    // Transform for API response
    const data = matchedBuyers.map((match) => ({
      id: match.buyer.id,
      name: match.buyer.name,
      buyingCounties: match.buyer.buyingCounties,
      buyingState: match.buyer.buyingState,
      zip: match.buyer.zip,
      purchases6Month: match.buyer.purchases6Month,
      matchType: match.matchType,
      isHotPotential: match.isHotPotential,
      priority: match.priority,
      contacts: match.contacts.map((contact) => ({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phones: contact.phones,
        emails: contact.emails,
        isPrimary: contact.isPrimary,
      })),
    }));

    res.json({
      success: true,
      data,
      meta: {
        total: data.length,
        hotBuyers: data.filter((b) => b.isHotPotential).length,
        zipcodeMatches: data.filter((b) => b.matchType === 'zipcode').length,
        countyMatches: data.filter((b) => b.matchType === 'county').length,
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

/**
 * Get ML-powered advanced matched buyers for a property
 * Uses historical behavior, buy box criteria, and engagement patterns
 */
export const getAdvancedMatchedBuyers = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const {
      limit,
      minScore,
      minConfidence,
      includeEngagement,
      includeBehavior,
      includeML,
      rankBy,
    } = req.query;

    // Initialize service if not ready
    if (!advancedBuyerMatchingService.isReady()) {
      await advancedBuyerMatchingService.initialize();
    }

    const result = await advancedBuyerMatchingService.matchBuyersToProperty(
      parseInt(propertyId, 10),
      {
        limit: limit ? parseInt(limit as string, 10) : 50,
        minScore: minScore ? parseInt(minScore as string, 10) : 30,
        minConfidence: (minConfidence as 'high' | 'medium' | 'low') || 'low',
        includeEngagementScore: includeEngagement !== 'false',
        includeBehaviorProfile: includeBehavior === 'true',
        includeMLPrediction: includeML === 'true',
        rankBy: (rankBy as 'matchScore' | 'engagement' | 'recent') || 'matchScore',
      }
    );

    // Transform matched buyers for API response
    const data = result.matchedBuyers.map((match) => ({
      id: match.buyerId,
      name: match.buyerName,
      matchScore: match.matchScore,
      confidenceLevel: match.confidenceLevel,
      matchReasons: match.matchReasons,
      matchFactors: match.matchFactors.map((factor) => ({
        name: factor.name,
        score: factor.score,
        weight: factor.weight,
        details: factor.details,
      })),
      hotPotential: match.hotPotential,
      suggestedContactMethod: match.suggestedContactMethod,
      buyingCounties: match.buyingCounties,
      buyingState: match.buyingState,
      purchases6Month: match.purchases6Month,
      mlPredictionScore: match.mlPredictionScore,
      mlConfidence: match.mlConfidence,
      behaviorProfile: match.behaviorProfile ? {
        totalViews: match.behaviorProfile.totalViews,
        totalLikes: match.behaviorProfile.totalLikes,
        totalPasses: match.behaviorProfile.totalPasses,
        totalOffers: match.behaviorProfile.totalOffers,
        likeRate: match.behaviorProfile.likeRate,
        offerRate: match.behaviorProfile.offerRate,
        avgViewDuration: match.behaviorProfile.avgViewDuration,
        activityScore: match.behaviorProfile.activityScore,
        engagementVelocity: match.behaviorProfile.engagementVelocity,
        lastActiveAt: match.behaviorProfile.lastActiveAt,
      } : undefined,
      contacts: match.contacts.map((contact) => ({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phones: contact.phones,
        emails: contact.emails,
        isPrimary: contact.isPrimary,
      })),
    }));

    res.json({
      success: true,
      data,
      meta: {
        propertyId: result.propertyId,
        dealId: result.dealId,
        matchedAt: result.matchedAt,
        statistics: result.statistics,
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
// SEARCH & FILTER
// ============================================================================

export const searchBuyers = async (req: Request, res: Response) => {
  try {
    const { q, limit } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required',
        timestamp: new Date().toISOString(),
      });
    }

    const buyers = await buyerService.searchBuyers(
      q as string,
      limit ? parseInt(limit as string, 10) : 10
    );

    res.json({
      success: true,
      data: buyers.map((buyer) => ({
        ...buyer.toJSON(),
        isHotPotential: buyer.purchases6Month > 10,
      })),
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

export const getBuyersByCounty = async (req: Request, res: Response) => {
  try {
    const { county, state } = req.params;

    const buyers = await buyerService.getBuyersByCounty(county, state);

    res.json({
      success: true,
      data: buyers.map((buyer) => ({
        ...buyer.toJSON(),
        isHotPotential: buyer.purchases6Month > 10,
      })),
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

export const getBuyersByZip = async (req: Request, res: Response) => {
  try {
    const { zip } = req.params;

    const buyers = await buyerService.getBuyersByZip(zip);

    res.json({
      success: true,
      data: buyers.map((buyer) => ({
        ...buyer.toJSON(),
        isHotPotential: buyer.purchases6Month > 10,
      })),
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

export const getHotBuyers = async (req: Request, res: Response) => {
  try {
    const { state } = req.query;

    const buyers = await buyerService.getHotBuyers(state as string);

    res.json({
      success: true,
      data: buyers.map((buyer) => ({
        ...buyer.toJSON(),
        isHotPotential: true,
      })),
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
// STATISTICS
// ============================================================================

export const getBuyerStats = async (req: Request, res: Response) => {
  try {
    const stats = await buyerService.getBuyerStats();

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

// ============================================================================
// CSV IMPORT
// ============================================================================

export const importBuyersFromCSV = async (req: Request, res: Response) => {
  try {
    const { filePath, csvContent } = req.body;

    if (!filePath && !csvContent) {
      return res.status(400).json({
        success: false,
        error: 'Either filePath or csvContent is required',
        timestamp: new Date().toISOString(),
      });
    }

    // If csvContent is provided, use it directly; otherwise read from filePath
    const result = csvContent
      ? await buyerService.importFromCSV(csvContent, true)
      : await buyerService.importFromCSV(filePath, false);

    res.json({
      success: true,
      data: {
        imported: result.imported,
        errors: result.errors.slice(0, 10), // Return first 10 errors
        totalErrors: result.errors.length,
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
