/**
 * ML Routes
 *
 * API endpoints for ML functionality:
 * - Status and insights
 * - Training management
 * - Model management
 * - Feedback recording
 *
 * SECURITY:
 * - All routes require authentication
 * - Training and model operations require admin role
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { mlService } from '../plugins/ml/MLService';
import { trainingService } from '../plugins/ml/TrainingService';
import { modelManager } from '../plugins/ml/ModelManager';
import FundFeedback from '../models/FundFeedback';
import MLPrediction from '../models/MLPrediction';
import TrainingRun from '../models/TrainingRun';
import HedgeFundBuyBox from '../models/HedgeFundBuyBox';
import { MLModelType } from '../models/MLPrediction';
import { safeParseInt } from '../utils/security';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Rate limit for ML operations
const mlLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { success: false, error: 'Too many ML requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// PUBLIC REFERENCE DATA ENDPOINTS (no auth required - static dropdown data)
// ============================================================================

/**
 * @swagger
 * /api/ml/reference/states:
 *   get:
 *     summary: Get list of US states for dropdown
 *     tags: [ML]
 *     responses:
 *       200:
 *         description: List of US states
 */
router.get('/reference/states', (req: Request, res: Response) => {
  const states = [
    { code: 'AL', name: 'Alabama' },
    { code: 'AK', name: 'Alaska' },
    { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' },
    { code: 'CA', name: 'California' },
    { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' },
    { code: 'DE', name: 'Delaware' },
    { code: 'DC', name: 'District of Columbia' },
    { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' },
    { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' },
    { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' },
    { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' },
    { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' },
    { code: 'NV', name: 'Nevada' },
    { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' },
    { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' },
    { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' },
    { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' },
    { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' },
    { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' },
    { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' },
    { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' },
    { code: 'WY', name: 'Wyoming' },
  ];
  res.json({ success: true, data: states });
});

/**
 * @swagger
 * /api/ml/reference/property-types:
 *   get:
 *     summary: Get list of property types for dropdown
 *     tags: [ML]
 */
router.get('/reference/property-types', (req: Request, res: Response) => {
  const propertyTypes = [
    { value: 'single_family', label: 'Single Family' },
    { value: 'condo', label: 'Condo' },
    { value: 'townhouse', label: 'Townhouse' },
    { value: 'multi_family', label: 'Multi-Family' },
    { value: 'duplex', label: 'Duplex' },
    { value: 'triplex', label: 'Triplex' },
    { value: 'quadplex', label: 'Quadplex' },
    { value: 'manufactured', label: 'Manufactured' },
    { value: 'land', label: 'Land' },
    { value: 'other', label: 'Other' },
  ];
  res.json({ success: true, data: propertyTypes });
});

/**
 * @swagger
 * /api/ml/reference/response-types:
 *   get:
 *     summary: Get list of response types for dropdown
 *     tags: [ML]
 */
router.get('/reference/response-types', (req: Request, res: Response) => {
  const responseTypes = [
    { value: 'closed', label: 'Closed (Positive)', category: 'positive' },
    { value: 'offer_accepted', label: 'Offer Accepted (Positive)', category: 'positive' },
    { value: 'offer_made', label: 'Offer Made (Neutral)', category: 'neutral' },
    { value: 'interested', label: 'Interested (Neutral)', category: 'neutral' },
    { value: 'passed', label: 'Passed (Negative)', category: 'negative' },
    { value: 'no_response', label: 'No Response (Negative)', category: 'negative' },
  ];
  res.json({ success: true, data: responseTypes });
});

/**
 * @swagger
 * /api/ml/reference/loss-categories:
 *   get:
 *     summary: Get list of loss categories for dropdown
 *     tags: [ML]
 */
router.get('/reference/loss-categories', (req: Request, res: Response) => {
  const lossCategories = [
    { value: 'price', label: 'Price Too High' },
    { value: 'condition', label: 'Property Condition' },
    { value: 'location', label: 'Location Issues' },
    { value: 'competition', label: 'Lost to Competition' },
    { value: 'timing', label: 'Bad Timing' },
    { value: 'financing', label: 'Financing Issues' },
    { value: 'other', label: 'Other' },
  ];
  res.json({ success: true, data: lossCategories });
});

/**
 * @swagger
 * /api/ml/reference/win-factors:
 *   get:
 *     summary: Get list of win factors for dropdown
 *     tags: [ML]
 */
router.get('/reference/win-factors', (req: Request, res: Response) => {
  const winFactors = [
    { value: 'quick_close', label: 'Quick Close' },
    { value: 'good_comps', label: 'Good Comps' },
    { value: 'below_market_rent', label: 'Below Market Rent' },
    { value: 'tenant_quality', label: 'Quality Tenant' },
    { value: 'newer_build', label: 'Newer Build' },
    { value: 'low_rehab', label: 'Low Rehab Cost' },
    { value: 'good_schools', label: 'Good Schools' },
    { value: 'premium_location', label: 'Premium Location' },
    { value: 'turnkey', label: 'Turnkey Property' },
    { value: 'growing_market', label: 'Growing Market' },
    { value: 'cash_flow', label: 'Strong Cash Flow' },
    { value: 'appreciation', label: 'Appreciation Potential' },
  ];
  res.json({ success: true, data: winFactors });
});

// ============================================================================
// AUTHENTICATED ROUTES (require login)
// ============================================================================

// Apply authentication to remaining ML routes
router.use(authenticate);
router.use(mlLimiter);

// ============================================================================
// STATUS ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/ml/status:
 *   get:
 *     summary: Get ML service status
 *     tags: [ML]
 *     responses:
 *       200:
 *         description: ML service status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await mlService.getStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/ml/readiness:
 *   get:
 *     summary: Get training readiness
 *     tags: [ML]
 *     responses:
 *       200:
 *         description: Training readiness info
 */
router.get('/readiness', async (req: Request, res: Response) => {
  try {
    const readiness = await mlService.getTrainingReadiness();
    res.json({ success: true, data: readiness });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// FEEDBACK ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/ml/feedback:
 *   post:
 *     summary: Record fund feedback
 *     tags: [ML]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dealId
 *               - buyBoxId
 *               - fundName
 *               - responseType
 *               - submissionScore
 *               - dealSnapshot
 *             properties:
 *               dealId:
 *                 type: string
 *               buyBoxId:
 *                 type: string
 *               fundName:
 *                 type: string
 *               responseType:
 *                 type: string
 *                 enum: [interested, passed, offer_made, offer_accepted, closed, no_response]
 *               submissionScore:
 *                 type: number
 *               dealSnapshot:
 *                 type: object
 *     responses:
 *       201:
 *         description: Feedback recorded
 */
router.post('/feedback', async (req: Request, res: Response) => {
  try {
    const feedback = await mlService.recordFeedback(req.body);
    res.status(201).json({ success: true, data: { id: feedback.id } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/ml/feedback/{dealId}:
 *   get:
 *     summary: Get feedback for a deal
 *     tags: [ML]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deal feedback history
 */
router.get('/feedback/:dealId', async (req: Request, res: Response) => {
  try {
    const feedback = await FundFeedback.findAll({
      where: { dealId: req.params.dealId },
      order: [['createdAt', 'DESC']],
    });
    res.json({ success: true, data: feedback });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// TRAINING ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/ml/training/status:
 *   get:
 *     summary: Get training status
 *     tags: [ML]
 *     responses:
 *       200:
 *         description: Training status
 */
router.get('/training/status', async (req: Request, res: Response) => {
  try {
    const modelType = (req.query.modelType as MLModelType) || 'deal_quality';
    const canTrain = await trainingService.canTrain(modelType);
    res.json({ success: true, data: canTrain });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/ml/training/trigger:
 *   post:
 *     summary: Trigger model training
 *     tags: [ML]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               modelType:
 *                 type: string
 *                 enum: [deal_quality, fund_match, close_probability]
 *     responses:
 *       200:
 *         description: Training result
 */
router.post('/training/trigger', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const modelType = (req.body.modelType as MLModelType) || 'deal_quality';
    const result = await mlService.triggerTraining(modelType);
    res.json({ success: result.success, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/ml/training/runs:
 *   get:
 *     summary: Get training run history
 *     tags: [ML]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Training runs
 */
router.get('/training/runs', async (req: Request, res: Response) => {
  try {
    // SECURITY: Safe parseInt with range validation
    const limit = safeParseInt(req.query.limit, { min: 1, max: 100, defaultValue: 10 }) || 10;
    const runs = await mlService.getTrainingHistory(limit);
    res.json({ success: true, data: runs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/ml/training/runs/{runId}:
 *   get:
 *     summary: Get training run details
 *     tags: [ML]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Training run details
 */
router.get('/training/runs/:runId', async (req: Request, res: Response) => {
  try {
    const run = await TrainingRun.findByPk(req.params.runId);
    if (!run) {
      return res.status(404).json({ success: false, error: 'Training run not found' });
    }
    res.json({ success: true, data: run });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// MODEL ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/ml/models:
 *   get:
 *     summary: Get all model versions
 *     tags: [ML]
 *     parameters:
 *       - in: query
 *         name: modelType
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Model versions
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const modelType = req.query.modelType as MLModelType | undefined;
    const versions = await mlService.getModelVersions(modelType);
    res.json({ success: true, data: versions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/ml/models/{modelType}/active:
 *   get:
 *     summary: Get active model for type
 *     tags: [ML]
 *     parameters:
 *       - in: path
 *         name: modelType
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Active model info
 */
router.get('/models/:modelType/active', async (req: Request, res: Response) => {
  try {
    const modelType = req.params.modelType as MLModelType;
    const info = await modelManager.getActiveModelInfo(modelType);
    if (!info) {
      return res.status(404).json({ success: false, error: 'No active model' });
    }
    res.json({ success: true, data: info });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/ml/models/{modelType}/promote/{version}:
 *   post:
 *     summary: Promote model to production
 *     tags: [ML]
 *     parameters:
 *       - in: path
 *         name: modelType
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: version
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Model promoted
 */
router.post('/models/:modelType/promote/:version', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { modelType, version } = req.params;
    await mlService.promoteModel(modelType as MLModelType, version);
    res.json({ success: true, message: `Model ${version} promoted to production` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// INSIGHTS ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/ml/insights/predictions:
 *   get:
 *     summary: Get prediction analytics
 *     tags: [ML]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: Prediction analytics
 */
router.get('/insights/predictions', async (req: Request, res: Response) => {
  try {
    // SECURITY: Safe parseInt with range validation
    const limit = safeParseInt(req.query.limit, { min: 1, max: 500, defaultValue: 100 }) || 100;

    const predictions = await MLPrediction.findAll({
      order: [['createdAt', 'DESC']],
      limit,
    });

    // Calculate accuracy buckets
    const withOutcomes = predictions.filter(p => p.actualOutcome && p.actualOutcome !== 'unknown');
    const buckets = [
      { range: '0-20%', min: 0, max: 0.2, correct: 0, total: 0 },
      { range: '20-40%', min: 0.2, max: 0.4, correct: 0, total: 0 },
      { range: '40-60%', min: 0.4, max: 0.6, correct: 0, total: 0 },
      { range: '60-80%', min: 0.6, max: 0.8, correct: 0, total: 0 },
      { range: '80-100%', min: 0.8, max: 1.0, correct: 0, total: 0 },
    ];

    for (const pred of withOutcomes) {
      const bucket = buckets.find(b => pred.predictedScore >= b.min && pred.predictedScore < b.max);
      if (bucket) {
        bucket.total++;
        const predictedPositive = pred.predictedScore >= 0.5;
        const actualPositive = pred.actualOutcome === 'positive';
        if (predictedPositive === actualPositive) bucket.correct++;
      }
    }

    res.json({
      success: true,
      data: {
        totalPredictions: predictions.length,
        withOutcomes: withOutcomes.length,
        accuracyByBucket: buckets.map(b => ({
          range: b.range,
          accuracy: b.total > 0 ? (b.correct / b.total) * 100 : null,
          count: b.total,
        })),
        overallAccuracy: withOutcomes.length > 0
          ? (buckets.reduce((sum, b) => sum + b.correct, 0) / withOutcomes.length) * 100
          : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/ml/insights/deal/{dealId}:
 *   get:
 *     summary: Get ML predictions for a deal
 *     tags: [ML]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deal ML insights
 */
router.get('/insights/deal/:dealId', async (req: Request, res: Response) => {
  try {
    const predictions = await MLPrediction.findAll({
      where: { dealId: req.params.dealId },
      order: [['createdAt', 'DESC']],
    });

    const feedback = await FundFeedback.findAll({
      where: { dealId: req.params.dealId },
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      data: {
        predictions,
        feedback,
        summary: predictions.length > 0 ? {
          latestScore: predictions[0].predictedScore,
          latestConfidence: predictions[0].confidence,
          avgScore: predictions.reduce((sum, p) => sum + p.predictedScore, 0) / predictions.length,
          predictionCount: predictions.length,
        } : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// AUTHENTICATED REFERENCE DATA (requires DB access)
// ============================================================================

/**
 * @swagger
 * /api/ml/reference/funds:
 *   get:
 *     summary: Get list of funds for dropdown
 *     tags: [ML]
 *     responses:
 *       200:
 *         description: List of fund names
 */
router.get('/reference/funds', async (req: Request, res: Response) => {
  try {
    const buyBoxes = await HedgeFundBuyBox.findAll({
      attributes: ['id', 'name', 'fundName'],
      where: { enabled: true },
      order: [['fundName', 'ASC']],
    });

    // Get unique fund names
    const fundNamesSet = new Set(buyBoxes.map(bb => bb.fundName).filter(Boolean));
    const fundNames = Array.from(fundNamesSet) as string[];

    res.json({
      success: true,
      data: {
        funds: fundNames.sort(),
        buyBoxes: buyBoxes.map(bb => ({
          id: bb.id,
          name: bb.name,
          fundName: bb.fundName,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
