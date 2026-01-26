/**
 * Portfolio Routes
 *
 * API endpoints for portfolio management
 *
 * SECURITY:
 * - All routes require authentication
 * - Users can only access their own portfolio
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { portfolioService } from '../services/PortfolioService';
import { PortfolioStatus, ValuationSource } from '../models/Portfolio';
import { authenticate } from '../middleware/auth';
import { safeParseInt } from '../utils/security';

const router = Router();

// Rate limit for portfolio operations
const portfolioLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication to ALL portfolio routes
router.use(authenticate);
router.use(portfolioLimiter);

/**
 * @swagger
 * tags:
 *   name: Portfolio
 *   description: User portfolio management
 */

/**
 * @swagger
 * /api/portfolio:
 *   get:
 *     summary: Get user's portfolio
 *     description: Get all properties in the user's portfolio
 *     tags: [Portfolio]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [holding, renting, renovating, listed_for_sale, sold]
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User's portfolio
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // SECURITY: Only use authenticated user's ID - never trust query params
    const userId = req.user?.id;
    const { status, state, limit, offset } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Validate status enum if provided
    const validStatuses: PortfolioStatus[] = ['holding', 'renting', 'renovating', 'listed_for_sale', 'sold'];
    const safeStatus = status && validStatuses.includes(status as PortfolioStatus)
      ? (status as PortfolioStatus)
      : undefined;

    const result = await portfolioService.getUserPortfolio(userId, {
      status: safeStatus,
      state: state as string,
      limit: safeParseInt(limit, { min: 1, max: 100 }) || undefined,
      offset: safeParseInt(offset, { min: 0 }) || undefined,
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
    });
  }
});

/**
 * @swagger
 * /api/portfolio:
 *   post:
 *     summary: Add property to portfolio
 *     description: Add a new property to the user's portfolio
 *     tags: [Portfolio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - address
 *               - city
 *               - state
 *               - propertyType
 *               - acquisitionDate
 *               - acquisitionPrice
 *               - totalInvested
 *             properties:
 *               userId:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               propertyType:
 *                 type: string
 *               acquisitionDate:
 *                 type: string
 *                 format: date
 *               acquisitionPrice:
 *                 type: number
 *               totalInvested:
 *                 type: number
 *     responses:
 *       201:
 *         description: Property added to portfolio
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // SECURITY: Use authenticated user's ID
    const userId = req.user?.id;
    const { ...propertyDetails } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const portfolio = await portfolioService.addProperty(userId, propertyDetails);

    res.status(201).json({
      success: true,
      data: portfolio,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/portfolio/{id}:
 *   get:
 *     summary: Get portfolio property
 *     description: Get a specific property from the portfolio
 *     tags: [Portfolio]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio property
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const portfolio = await portfolioService.getProperty(id);

    if (!portfolio) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    // SECURITY: Verify ownership - prevent IDOR
    if (portfolio.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Cannot access other users portfolio items' });
    }

    res.json({
      success: true,
      data: portfolio,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/portfolio/{id}:
 *   patch:
 *     summary: Update portfolio property
 *     description: Update a property in the portfolio
 *     tags: [Portfolio]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Property updated
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // SECURITY: Verify ownership before update - prevent IDOR
    const existing = await portfolioService.getProperty(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Cannot modify other users portfolio items' });
    }

    const portfolio = await portfolioService.updateProperty(id, updates);

    res.json({
      success: true,
      data: portfolio,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/portfolio/{id}:
 *   delete:
 *     summary: Remove from portfolio
 *     description: Remove a property from the portfolio
 *     tags: [Portfolio]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Property removed
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // SECURITY: Verify ownership before delete - prevent IDOR
    const existing = await portfolioService.getProperty(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Cannot delete other users portfolio items' });
    }

    await portfolioService.removeProperty(id);

    res.json({
      success: true,
      message: 'Property removed from portfolio',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/portfolio/{id}/valuation:
 *   post:
 *     summary: Update valuation
 *     description: Update the current valuation of a property
 *     tags: [Portfolio]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - value
 *               - source
 *             properties:
 *               value:
 *                 type: number
 *               source:
 *                 type: string
 *                 enum: [zestimate, appraisal, cma, manual]
 *     responses:
 *       200:
 *         description: Valuation updated
 */
router.post('/:id/valuation', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { value, source } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!value || !source) {
      return res
        .status(400)
        .json({ success: false, error: 'value and source are required' });
    }

    // SECURITY: Verify ownership before valuation update - prevent IDOR
    const existing = await portfolioService.getProperty(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Cannot modify other users portfolio items' });
    }

    const portfolio = await portfolioService.updateValuation(
      id,
      value,
      source as ValuationSource
    );

    res.json({
      success: true,
      data: portfolio,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/portfolio/{id}/sell:
 *   post:
 *     summary: Mark as sold
 *     description: Mark a property as sold
 *     tags: [Portfolio]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - soldPrice
 *             properties:
 *               soldPrice:
 *                 type: number
 *               sellingCosts:
 *                 type: number
 *     responses:
 *       200:
 *         description: Property marked as sold
 */
router.post('/:id/sell', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { soldPrice, sellingCosts } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!soldPrice) {
      return res.status(400).json({ success: false, error: 'soldPrice is required' });
    }

    // SECURITY: Verify ownership before marking as sold - prevent IDOR
    const existing = await portfolioService.getProperty(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Cannot modify other users portfolio items' });
    }

    const portfolio = await portfolioService.markAsSold(id, soldPrice, sellingCosts);

    res.json({
      success: true,
      data: portfolio,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/portfolio/summary:
 *   get:
 *     summary: Get portfolio summary
 *     description: Get summary statistics for the user's portfolio
 *     tags: [Portfolio]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio summary
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    // SECURITY: Only use authenticated user's ID - never trust query params
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const summary = await portfolioService.getPortfolioSummary(userId);

    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/portfolio/performance:
 *   get:
 *     summary: Get performance metrics
 *     description: Get performance metrics for the user's portfolio
 *     tags: [Portfolio]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Performance metrics
 */
router.get('/performance', async (req: Request, res: Response) => {
  try {
    // SECURITY: Only use authenticated user's ID - never trust query params
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const metrics = await portfolioService.getPerformanceMetrics(userId);

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/portfolio/cash-flow:
 *   get:
 *     summary: Get cash flow summary
 *     description: Get cash flow summary for rental properties
 *     tags: [Portfolio]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cash flow summary
 */
router.get('/cash-flow', async (req: Request, res: Response) => {
  try {
    // SECURITY: Only use authenticated user's ID - never trust query params
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const cashFlow = await portfolioService.getCashFlowSummary(userId);

    res.json({
      success: true,
      data: cashFlow,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/portfolio/value:
 *   get:
 *     summary: Get total portfolio value
 *     description: Get the total value of the user's portfolio
 *     tags: [Portfolio]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Total portfolio value
 */
router.get('/value', async (req: Request, res: Response) => {
  try {
    // SECURITY: Only use authenticated user's ID - never trust query params
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const value = await portfolioService.getTotalValue(userId);

    res.json({
      success: true,
      data: value,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/portfolio/sold:
 *   get:
 *     summary: Get sold properties
 *     description: Get sold properties with profit analysis
 *     tags: [Portfolio]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sold properties analysis
 */
router.get('/sold', async (req: Request, res: Response) => {
  try {
    // SECURITY: Only use authenticated user's ID - never trust query params
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const soldAnalysis = await portfolioService.getSoldProperties(userId);

    res.json({
      success: true,
      data: soldAnalysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// EXPORT
// ============================================================================

/**
 * @swagger
 * /api/portfolio/export:
 *   get:
 *     summary: Export portfolio to CSV
 *     description: Export user's portfolio as CSV file
 *     tags: [Portfolio]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *           default: csv
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio export file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/json:
 *             schema:
 *               type: array
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    // SECURITY: Only use authenticated user's ID - never trust query params
    const userId = req.user?.id;
    const { format = 'csv', status } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await portfolioService.getUserPortfolio(userId, {
      status: status as PortfolioStatus,
      limit: 10000,
    });

    const portfolio = result.items;

    if (format === 'json') {
      res.json({
        success: true,
        data: portfolio,
        exportedAt: new Date().toISOString(),
      });
      return;
    }

    // Generate CSV
    const headers = [
      'Address',
      'City',
      'State',
      'Property Type',
      'Status',
      'Acquisition Date',
      'Acquisition Price',
      'Current Value',
      'Equity',
      'Total Invested',
      'Rehab Cost',
      'Monthly Rent',
      'Monthly Expenses',
      'Cash Flow',
      'ROI %',
      'Sold Price',
      'Sold At',
    ];

    // Sanitize CSV values to prevent formula injection attacks
    // Values starting with =, +, -, @, tab, or carriage return can trigger formula execution
    const sanitizeCsvValue = (value: unknown): string => {
      const str = String(value ?? '');
      const escaped = str.replace(/"/g, '""');
      // Prefix dangerous characters with single quote to prevent formula execution
      if (/^[=+\-@\t\r]/.test(escaped)) {
        return `"'${escaped}"`;
      }
      return `"${escaped}"`;
    };

    const rows = portfolio.map((item: any) => {
      return [
        item.address,
        item.city,
        item.state,
        item.propertyType,
        item.status,
        item.acquisitionDate ? new Date(item.acquisitionDate).toLocaleDateString() : '',
        item.acquisitionPrice || '',
        item.currentValue || '',
        item.equity || '',
        item.totalInvested || '',
        item.rehabCost || '',
        item.monthlyRent || '',
        item.monthlyExpenses || '',
        item.cashFlow || '',
        item.roi ? (item.roi * 100).toFixed(2) : '',
        item.soldPrice || '',
        item.soldAt ? new Date(item.soldAt).toLocaleDateString() : '',
      ].map(sanitizeCsvValue).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="portfolio-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
