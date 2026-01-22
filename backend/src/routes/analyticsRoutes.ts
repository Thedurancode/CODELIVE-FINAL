/**
 * Analytics Routes
 *
 * Provides endpoints for dashboard analytics and reporting.
 *
 * SECURITY:
 * - All routes require authentication
 * - Digest send operation is admin-only
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getOverview,
  getSourcePerformance,
  getConversionFunnel,
  getDealAnalytics,
  getOfferAnalytics,
} from '../controllers/analyticsController';
import { winLossService } from '../services/WinLossService';
import { agentMetricsService } from '../services/AgentMetricsService';
import { digestService } from '../services/DigestService';
import { velocityService } from '../services/VelocityService';
import { authenticate, authorize } from '../middleware/auth';
import { safeParseInt } from '../utils/security';

const router = Router();

// Rate limit for analytics endpoints
const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: { success: false, error: 'Too many analytics requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication to ALL analytics routes
router.use(authenticate);
router.use(analyticsLimiter);

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Dashboard analytics and reporting endpoints
 */

// GET /api/analytics/overview - Dashboard summary stats
router.get('/overview', getOverview);

// GET /api/analytics/sources - Source performance metrics
router.get('/sources', getSourcePerformance);

// GET /api/analytics/conversions - Conversion funnel rates
router.get('/conversions', getConversionFunnel);

// GET /api/analytics/deals - Deal analytics by dimensions
router.get('/deals', getDealAnalytics);

// GET /api/analytics/offers - Offer analytics
router.get('/offers', getOfferAnalytics);

// ============================================================================
// WIN/LOSS ANALYTICS
// ============================================================================

/**
 * @swagger
 * /api/analytics/win-loss/stats:
 *   get:
 *     summary: Get win/loss statistics
 *     description: Get win/loss statistics for deal submissions
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: buyBoxId
 *         schema:
 *           type: string
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
 *         description: Win/loss statistics
 */
router.get('/win-loss/stats', async (req: Request, res: Response) => {
  try {
    const { buyBoxId, startDate, endDate } = req.query;

    const stats = await winLossService.getWinLossStats({
      buyBoxId: buyBoxId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: stats,
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
 * /api/analytics/win-loss/patterns/loss:
 *   get:
 *     summary: Get loss patterns
 *     description: Analyze patterns in lost deals
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: buyBoxId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Loss patterns
 */
router.get('/win-loss/patterns/loss', async (req: Request, res: Response) => {
  try {
    const { buyBoxId, startDate, endDate } = req.query;

    const patterns = await winLossService.getLossPatterns({
      buyBoxId: buyBoxId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: patterns,
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
 * /api/analytics/win-loss/patterns/win:
 *   get:
 *     summary: Get win patterns
 *     description: Analyze patterns in won deals
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: buyBoxId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Win patterns
 */
router.get('/win-loss/patterns/win', async (req: Request, res: Response) => {
  try {
    const { buyBoxId, startDate, endDate } = req.query;

    const patterns = await winLossService.getWinPatterns({
      buyBoxId: buyBoxId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: patterns,
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
 * /api/analytics/win-loss/accuracy:
 *   get:
 *     summary: Get scoring accuracy
 *     description: Get accuracy metrics for deal scoring
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: buyBoxId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Accuracy metrics
 */
router.get('/win-loss/accuracy', async (req: Request, res: Response) => {
  try {
    const { buyBoxId, startDate, endDate } = req.query;

    const accuracy = await winLossService.getScoringAccuracy({
      buyBoxId: buyBoxId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: accuracy,
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
 * /api/analytics/win-loss/insights:
 *   get:
 *     summary: Get win/loss insights
 *     description: Get AI-generated insights from win/loss data
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: buyBoxId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Insights
 */
router.get('/win-loss/insights', async (req: Request, res: Response) => {
  try {
    const { buyBoxId } = req.query;

    const insights = await winLossService.generateInsights({
      buyBoxId: buyBoxId as string,
    });

    res.json({
      success: true,
      data: insights,
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
 * /api/analytics/win-loss/{feedbackId}/outcome:
 *   post:
 *     summary: Record deal outcome
 *     description: Record the outcome of a deal submission
 *     tags: [Analytics]
 *     parameters:
 *       - in: path
 *         name: feedbackId
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
 *               - outcome
 *             properties:
 *               outcome:
 *                 type: string
 *                 enum: [won, lost]
 *               lossCategory:
 *                 type: string
 *                 enum: [price, condition, location, competition, timing, financing, other]
 *               winFactors:
 *                 type: array
 *                 items:
 *                   type: string
 *               lessonsLearned:
 *                 type: string
 *               applyToFutureBuyBox:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Outcome recorded
 */
router.post('/win-loss/:feedbackId/outcome', async (req: Request, res: Response) => {
  try {
    const { feedbackId } = req.params;
    const { outcome, lossCategory, winFactors, lessonsLearned, applyToFutureBuyBox } =
      req.body;

    if (!outcome || !['won', 'lost'].includes(outcome)) {
      return res
        .status(400)
        .json({ success: false, error: 'Valid outcome (won/lost) is required' });
    }

    const feedback = await winLossService.recordOutcome(feedbackId, outcome, {
      lossCategory,
      winFactors,
      lessonsLearned,
      applyToFutureBuyBox,
    });

    res.json({
      success: true,
      data: feedback,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// AGENT METRICS
// ============================================================================

/**
 * @swagger
 * /api/analytics/agent/tools:
 *   get:
 *     summary: Get tool usage statistics
 *     description: Get statistics on agent tool usage
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
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
 *         description: Tool usage statistics
 */
router.get('/agent/tools', async (req: Request, res: Response) => {
  try {
    const { userId, startDate, endDate, limit } = req.query;

    const stats = await agentMetricsService.getToolUsageStats({
      userId: userId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: safeParseInt(limit, { min: 1, max: 500 }) || undefined,
    });

    res.json({
      success: true,
      data: stats,
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
 * /api/analytics/agent/accuracy:
 *   get:
 *     summary: Get agent accuracy metrics
 *     description: Get accuracy metrics for agent recommendations
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Accuracy metrics
 */
router.get('/agent/accuracy', async (req: Request, res: Response) => {
  try {
    const { userId, startDate, endDate } = req.query;

    const metrics = await agentMetricsService.getAccuracyMetrics({
      userId: userId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

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
 * /api/analytics/agent/performance:
 *   get:
 *     summary: Get agent performance trend
 *     description: Get performance metrics over time
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: days
 *         schema:
 *           type: number
 *           default: 30
 *     responses:
 *       200:
 *         description: Performance trend
 */
router.get('/agent/performance', async (req: Request, res: Response) => {
  try {
    const { userId, days } = req.query;

    const trend = await agentMetricsService.getPerformanceTrend({
      userId: userId as string,
      days: safeParseInt(days, { min: 1, max: 365 }) || undefined,
    });

    res.json({
      success: true,
      data: trend,
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
 * /api/analytics/agent/errors:
 *   get:
 *     summary: Get error patterns
 *     description: Get patterns in agent errors
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Error patterns
 */
router.get('/agent/errors', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, limit } = req.query;

    const patterns = await agentMetricsService.getErrorPatterns({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: safeParseInt(limit, { min: 1, max: 500 }) || undefined,
    });

    res.json({
      success: true,
      data: patterns,
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
 * /api/analytics/agent/stats:
 *   get:
 *     summary: Get overall agent stats
 *     description: Get overall statistics for the agent
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Overall stats
 */
router.get('/agent/stats', async (req: Request, res: Response) => {
  try {
    const { userId, startDate, endDate } = req.query;

    const stats = await agentMetricsService.getOverallStats({
      userId: userId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: stats,
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
 * /api/analytics/agent/feedback:
 *   post:
 *     summary: Record user feedback
 *     description: Record user feedback for a session
 *     tags: [Analytics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - rating
 *             properties:
 *               sessionId:
 *                 type: string
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               feedback:
 *                 type: string
 *     responses:
 *       200:
 *         description: Feedback recorded
 */
router.post('/agent/feedback', async (req: Request, res: Response) => {
  try {
    const { sessionId, rating, feedback } = req.body;

    if (!sessionId || rating == null) {
      return res
        .status(400)
        .json({ success: false, error: 'sessionId and rating are required' });
    }

    await agentMetricsService.recordFeedback(sessionId, rating, feedback);

    res.json({
      success: true,
      message: 'Feedback recorded',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// DAILY DIGEST
// ============================================================================

/**
 * @swagger
 * /api/analytics/digest/preview:
 *   get:
 *     summary: Preview daily digest
 *     description: Get a preview of the daily digest without sending
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Digest preview
 */
router.get('/digest/preview', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    const preview = await digestService.getDigestPreview(userId as string);

    res.json({
      success: true,
      data: preview.data,
      html: preview.html,
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
 * /api/analytics/digest/send:
 *   post:
 *     summary: Send daily digest
 *     description: Manually trigger the daily digest email
 *     tags: [Analytics]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Digest sent
 */
router.post('/digest/send', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { userId, recipients } = req.body;

    if (!digestService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Digest email service not configured. Set SMTP_* environment variables.',
      });
    }

    const result = await digestService.sendDigest(userId, recipients);

    if (result.success) {
      res.json({
        success: true,
        message: 'Daily digest sent successfully',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/analytics/digest/status:
 *   get:
 *     summary: Get digest service status
 *     description: Check if digest service is configured
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Service status
 */
router.get('/digest/status', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      configured: digestService.isConfigured(),
      schedule: process.env.DIGEST_SCHEDULE || '0 8 * * *',
      recipients: process.env.DIGEST_RECIPIENTS?.split(',').length || 0,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// PIPELINE VELOCITY & HEALTH
// ============================================================================

/**
 * @swagger
 * /api/analytics/velocity:
 *   get:
 *     summary: Get full velocity metrics
 *     description: Get comprehensive pipeline velocity and health metrics
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: days
 *         schema:
 *           type: number
 *           default: 30
 *     responses:
 *       200:
 *         description: Velocity metrics including health score, inflow/outflow, bottlenecks
 */
router.get('/velocity', async (req: Request, res: Response) => {
  try {
    const { userId, days } = req.query;
    const daysNum = safeParseInt(days, { min: 1, max: 90 }) || 30;

    const metrics = await velocityService.getVelocityMetrics(
      userId as string | undefined,
      daysNum
    );

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
 * /api/analytics/velocity/health:
 *   get:
 *     summary: Get pipeline health score
 *     description: Get lightweight health score (0-100) for pipeline
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Health score and status
 */
router.get('/velocity/health', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    const health = await velocityService.getHealthScore(userId as string | undefined);

    res.json({
      success: true,
      data: health,
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
 * /api/analytics/velocity/stuck:
 *   get:
 *     summary: Get stuck deals
 *     description: Get list of deals that have exceeded stage thresholds
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: thresholdDays
 *         schema:
 *           type: number
 *           default: 7
 *     responses:
 *       200:
 *         description: List of stuck deals
 */
router.get('/velocity/stuck', async (req: Request, res: Response) => {
  try {
    const { userId, thresholdDays } = req.query;
    const threshold = safeParseInt(thresholdDays, { min: 1, max: 90 }) || 7;

    const stuckDeals = await velocityService.getStuckDeals(
      userId as string | undefined,
      threshold
    );

    res.json({
      success: true,
      data: stuckDeals,
      count: stuckDeals.length,
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
 * /api/analytics/velocity/trend:
 *   get:
 *     summary: Get velocity trend
 *     description: Get historical velocity trend over specified days
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: days
 *         schema:
 *           type: number
 *           default: 7
 *     responses:
 *       200:
 *         description: Daily velocity trend
 */
router.get('/velocity/trend', async (req: Request, res: Response) => {
  try {
    const { userId, days } = req.query;
    const daysNum = safeParseInt(days, { min: 1, max: 90 }) || 7;

    const trend = await velocityService.getVelocityTrend(
      userId as string | undefined,
      daysNum
    );

    res.json({
      success: true,
      data: trend,
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
 * /api/analytics/velocity/stages:
 *   get:
 *     summary: Get stage health
 *     description: Get health status of each pipeline stage
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Per-stage health metrics
 */
router.get('/velocity/stages', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    const stageHealth = await velocityService.getStageHealth(userId as string | undefined);

    res.json({
      success: true,
      data: stageHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
