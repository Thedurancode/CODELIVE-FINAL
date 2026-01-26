/**
 * Analytics Controller
 *
 * Handles API requests for analytics and dashboard data.
 */

import { Request, Response } from 'express';
import analyticsService, { DateRange } from '../services/AnalyticsService';

/**
 * Parse date range from query parameters
 */
function parseDateRange(query: any): DateRange | undefined {
  const { startDate, endDate } = query;
  if (!startDate && !endDate) return undefined;

  return {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  };
}

/**
 * @swagger
 * /api/analytics/overview:
 *   get:
 *     summary: Get dashboard overview stats
 *     description: Returns summary statistics for the analytics dashboard
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering (ISO 8601)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering (ISO 8601)
 *     responses:
 *       200:
 *         description: Overview statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalProperties:
 *                       type: number
 *                     activeListings:
 *                       type: number
 *                     pendingOffers:
 *                       type: number
 *                     dealsToday:
 *                       type: number
 *                     dealsThisWeek:
 *                       type: number
 *                     dealsThisMonth:
 *                       type: number
 *                     averageDaysOnMarket:
 *                       type: number
 *                     totalOfferValue:
 *                       type: number
 */
export const getOverview = async (req: Request, res: Response) => {
  try {
    const dateRange = parseDateRange(req.query);
    const data = await analyticsService.getOverview(dateRange);

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching overview analytics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/analytics/sources:
 *   get:
 *     summary: Get source performance metrics
 *     description: Returns performance metrics for each deal source
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Source performance data
 */
export const getSourcePerformance = async (req: Request, res: Response) => {
  try {
    const dateRange = parseDateRange(req.query);
    const data = await analyticsService.getSourcePerformance(dateRange);

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching source performance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/analytics/conversions:
 *   get:
 *     summary: Get conversion funnel metrics
 *     description: Returns conversion rates through the deal funnel
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Conversion funnel data
 */
export const getConversionFunnel = async (req: Request, res: Response) => {
  try {
    const dateRange = parseDateRange(req.query);
    const data = await analyticsService.getConversionFunnel(dateRange);

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching conversion funnel:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/analytics/deals:
 *   get:
 *     summary: Get deal analytics
 *     description: Returns deal analytics by state, property type, price range
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Deal analytics data
 */
export const getDealAnalytics = async (req: Request, res: Response) => {
  try {
    const dateRange = parseDateRange(req.query);
    const data = await analyticsService.getDealAnalytics(dateRange);

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching deal analytics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/analytics/offers:
 *   get:
 *     summary: Get offer analytics
 *     description: Returns offer statistics and response times
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Offer analytics data
 */
export const getOfferAnalytics = async (req: Request, res: Response) => {
  try {
    const dateRange = parseDateRange(req.query);
    const data = await analyticsService.getOfferAnalytics(dateRange);

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching offer analytics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};
