/**
 * Market Data Routes
 *
 * REST API endpoints for property lookups, market data, and rental trends
 * Powered by RapidAPI Zillow integration with PostgreSQL caching
 */

import { Router, Request, Response } from 'express';
import { MarketDataService } from '../services/MarketDataService';
import { safeParseInt } from '../utils/security';

const router = Router();

// ============================================================================
// PROPERTY LOOKUP ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/market-data/lookup:
 *   post:
 *     summary: Full property lookup
 *     description: Get comprehensive property data including Zestimate, owners, images, price history, tax history, and comparables. Checks database first, fetches from API if needed.
 *     tags: [Market Data]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *             properties:
 *               address:
 *                 type: string
 *                 example: "123 Main St, Austin, TX 78701"
 *               forceRefresh:
 *                 type: boolean
 *                 description: Skip database cache and fetch fresh data
 *                 default: false
 *               maxAgeDays:
 *                 type: integer
 *                 description: Max age of cached data in days
 *                 default: 7
 *               includeImages:
 *                 type: boolean
 *                 default: true
 *               includePriceHistory:
 *                 type: boolean
 *                 default: true
 *               includeTaxHistory:
 *                 type: boolean
 *                 default: true
 *               includeComparables:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Property lookup successful
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/lookup', async (req: Request, res: Response) => {
  try {
    const {
      address,
      city,
      state,
      zip,
      forceRefresh,
      maxAgeDays,
      includeImages,
      includePriceHistory,
      includeTaxHistory,
      includeTaxAssessmentChart,
      includeTaxPaidChart,
      includeComparables,
      includeSkipTrace,
    } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required',
      });
    }

    const service = MarketDataService.getInstance();
    const result = await service.getFullPropertyLookup(
      { address, city, state, zip },
      {
        forceRefresh,
        maxAgeDays,
        includeImages,
        includePriceHistory,
        includeTaxHistory,
        includeTaxAssessmentChart,
        includeTaxPaidChart,
        includeComparables,
        includeSkipTrace,
      }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Market data lookup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to lookup property',
    });
  }
});

/**
 * @swagger
 * /api/market-data/lookup/{zpid}:
 *   get:
 *     summary: Get property by ZPID from database
 *     description: Retrieve a previously looked up property by its Zillow Property ID
 *     tags: [Market Data]
 *     parameters:
 *       - in: path
 *         name: zpid
 *         required: true
 *         schema:
 *           type: string
 *         description: Zillow Property ID
 *     responses:
 *       200:
 *         description: Property found
 *       404:
 *         description: Property not found in database
 */
router.get('/lookup/:zpid', async (req: Request, res: Response) => {
  try {
    const { zpid } = req.params;

    const service = MarketDataService.getInstance();
    const result = await service.getFromDatabaseByZpid(zpid);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Property not found in database',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Market data lookup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve property',
    });
  }
});

/**
 * @swagger
 * /api/market-data/recent:
 *   get:
 *     summary: Get recent property lookups
 *     description: Retrieve recently looked up properties from the database
 *     tags: [Market Data]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of results to return
 *     responses:
 *       200:
 *         description: List of recent lookups
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    // SECURITY: Use safe parseInt with range validation
    const limit = safeParseInt(req.query.limit, { min: 1, max: 100, defaultValue: 20 }) || 20;

    const service = MarketDataService.getInstance();
    const results = await service.getRecentLookups(limit);

    res.json({
      success: true,
      count: results.length,
      data: results.map(r => ({
        zpid: r.zpid,
        address: r.address,
        city: r.city,
        state: r.state,
        zestimate: r.zestimate,
        bedrooms: r.bedrooms,
        bathrooms: r.bathrooms,
        sqft: r.sqft,
        lookupCount: r.lookupCount,
        lastLookupAt: r.lastLookupAt,
      })),
    });
  } catch (error: any) {
    console.error('Recent lookups error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get recent lookups',
    });
  }
});

/**
 * @swagger
 * /api/market-data/location/{state}/{city}:
 *   get:
 *     summary: Get lookups by location
 *     description: Retrieve property lookups for a specific city and state
 *     tags: [Market Data]
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State code (e.g., TX, FL)
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City name
 *     responses:
 *       200:
 *         description: List of lookups for location
 */
router.get('/location/:state/:city', async (req: Request, res: Response) => {
  try {
    const { state, city } = req.params;

    const service = MarketDataService.getInstance();
    const results = await service.getLookupsByLocation(city, state);

    res.json({
      success: true,
      location: { city, state },
      count: results.length,
      data: results.map(r => ({
        zpid: r.zpid,
        address: r.address,
        zestimate: r.zestimate,
        bedrooms: r.bedrooms,
        bathrooms: r.bathrooms,
        sqft: r.sqft,
        lookupCount: r.lookupCount,
        lastLookupAt: r.lastLookupAt,
      })),
    });
  } catch (error: any) {
    console.error('Location lookups error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get lookups by location',
    });
  }
});

// ============================================================================
// INDIVIDUAL DATA ENDPOINTS (for lighter requests)
// ============================================================================

/**
 * @swagger
 * /api/market-data/zestimate:
 *   post:
 *     summary: Get Zestimate only
 *     description: Quick lookup for just the property valuation
 *     tags: [Market Data]
 */
router.post('/zestimate', async (req: Request, res: Response) => {
  try {
    const { address, city, state, zip } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required',
      });
    }

    const service = MarketDataService.getInstance();
    const result = await service.getMarketData({ address, city, state, zip });

    res.json({
      success: true,
      data: {
        zpid: result.zpid,
        address: result.address,
        zestimate: result.zestimate,
        zestimateRangeLow: result.zestimateRangeLow,
        zestimateRangeHigh: result.zestimateRangeHigh,
        rentZestimate: result.rentZestimate,
        confidence: result.confidence,
        dataSource: result.dataSource,
      },
    });
  } catch (error: any) {
    console.error('Zestimate lookup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get Zestimate',
    });
  }
});

/**
 * @swagger
 * /api/market-data/skip-trace:
 *   post:
 *     summary: Get owner/contact info
 *     description: Skip trace lookup for property owner information
 *     tags: [Market Data]
 */
router.post('/skip-trace', async (req: Request, res: Response) => {
  try {
    const { address, city, state, zip, propertyId } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required',
      });
    }

    const service = MarketDataService.getInstance();
    const result = await service.getSkipTrace({ address, city, state, zip });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'No skip trace data found',
      });
    }

    // If propertyId is provided, update the property with skip trace data
    if (propertyId) {
      try {
        const { Property } = await import('../models');
        const property = await Property.findByPk(propertyId);
        if (property) {
          const updateData: Record<string, unknown> = {};

          // Extract owner info from skip trace result
          if (result.owners && result.owners.length > 0) {
            const primaryOwner = result.owners[0];
            updateData.ownerName = primaryOwner.name;

            // Collect all phones from all owners
            const allPhones: string[] = [];
            const allEmails: string[] = [];
            result.owners.forEach((owner: { phones?: { number: string }[]; emails?: string[] }) => {
              if (owner.phones) {
                owner.phones.forEach((p: { number: string }) => {
                  if (p.number && !allPhones.includes(p.number)) {
                    allPhones.push(p.number);
                  }
                });
              }
              if (owner.emails) {
                owner.emails.forEach((e: string) => {
                  if (e && !allEmails.includes(e)) {
                    allEmails.push(e);
                  }
                });
              }
            });

            if (allPhones.length > 0) updateData.ownerPhones = allPhones;
            if (allEmails.length > 0) updateData.ownerEmails = allEmails;
          }

          // Save mailing address if available
          if (result.mailingAddress) {
            const ma = result.mailingAddress;
            updateData.ownerMailingAddress = `${ma.street}, ${ma.city}, ${ma.state} ${ma.zip}`;
          }

          if (Object.keys(updateData).length > 0) {
            await property.update(updateData);
            console.log(`✅ Updated property ${propertyId} with skip trace data`);
          }
        }
      } catch (updateError) {
        console.error('Failed to update property with skip trace:', updateError);
        // Don't fail the request, just log the error
      }
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Skip trace error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get skip trace',
    });
  }
});

// ============================================================================
// RENTAL MARKET ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/market-data/rental-trends:
 *   get:
 *     summary: Get rental market trends
 *     description: Get rental market trends for a city or area
 *     tags: [Market Data]
 *     parameters:
 *       - in: query
 *         name: location
 *         required: true
 *         schema:
 *           type: string
 *         description: City and state (e.g., "Austin, TX")
 *       - in: query
 *         name: bedroomType
 *         schema:
 *           type: string
 *           enum: [All_Bedrooms, Studio, One, Two, Three, Four_Plus]
 *           default: All_Bedrooms
 *       - in: query
 *         name: homeType
 *         schema:
 *           type: string
 *           enum: [All_Property_Types, Apartments, Houses, Condos, Townhomes]
 *           default: All_Property_Types
 *     responses:
 *       200:
 *         description: Rental market trends
 */
router.get('/rental-trends', async (req: Request, res: Response) => {
  try {
    const location = req.query.location as string;
    const bedroomType = req.query.bedroomType as string || 'All_Bedrooms';
    const homeType = req.query.homeType as string || 'All_Property_Types';

    if (!location) {
      return res.status(400).json({
        success: false,
        error: 'Location is required (e.g., "Austin, TX")',
      });
    }

    const service = MarketDataService.getInstance();
    const result = await service.getRentalMarketTrends(location, bedroomType, homeType);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'No rental market data found',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Rental trends error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get rental trends',
    });
  }
});

// ============================================================================
// API USAGE ENDPOINT
// ============================================================================

/**
 * @swagger
 * /api/market-data/api-usage:
 *   get:
 *     summary: Get API usage stats
 *     description: Check RapidAPI request count and limits
 *     tags: [Market Data]
 */
router.get('/api-usage', async (req: Request, res: Response) => {
  try {
    const service = MarketDataService.getInstance();
    const usage = await service.getApiRequestCount();

    if (!usage) {
      return res.status(503).json({
        success: false,
        error: 'Unable to fetch API usage (no API key configured)',
      });
    }

    res.json({
      success: true,
      data: usage,
    });
  } catch (error: any) {
    console.error('API usage error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get API usage',
    });
  }
});

export default router;
