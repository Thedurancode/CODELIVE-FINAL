/**
 * AI Routes
 *
 * SECURITY:
 * - All routes require authentication
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

// Import AI agent controllers
import {
  matchPropertyToBuyBoxes,
  getAllBuyBoxes,
  createBuyBox,
  updateBuyBox,
  deactivateBuyBox,
  recordInvestorAction,
  getBuyBoxInsights,
  learnAndApplyWeights,
  getBuyBoxActions
} from '../controllers/aiBuyBoxController';

import {
  checkMessage,
  getFlaggedMessages
} from '../controllers/aiGuardrailController';

import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limit for AI operations
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many AI requests.' },
});

// Apply authentication to ALL AI routes
router.use(authenticate);
router.use(aiLimiter);

// =====================================================
// AI Agent Routes
// Base path: /api/ai
// =====================================================

// -----------------------------------------------------
// Buy Box Matching Agent Routes
// -----------------------------------------------------

/**
 * @swagger
 * /api/ai/buybox/match/{propertyId}:
 *   post:
 *     summary: Match property to buy boxes with probability predictions
 *     description: |
 *       AI-powered matching using weighted scoring algorithm with Twitter-inspired probability predictions.
 *       Returns both traditional scores AND predicted engagement probabilities (probClose, probBid, probSave, probPass).
 *       Probabilities are calibrated using historical investor behavior data.
 *     tags: [AI - Buy Box Agent]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Matching results with scores and probability predictions
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
 *                     propertyId:
 *                       type: string
 *                     matches:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           fundId:
 *                             type: number
 *                           fundName:
 *                             type: string
 *                           score:
 *                             type: number
 *                             description: Traditional weighted score (0-100)
 *                           matchType:
 *                             type: string
 *                             enum: [strong, moderate, weak]
 *                           reasons:
 *                             type: array
 *                             items:
 *                               type: string
 *                           criteriaMatched:
 *                             type: array
 *                             items:
 *                               type: string
 *                           criteriaMissed:
 *                             type: array
 *                             items:
 *                               type: string
 *                           engagement:
 *                             type: object
 *                             description: Twitter-inspired probability predictions
 *                             properties:
 *                               probClose:
 *                                 type: number
 *                                 description: Probability investor will close (0-1)
 *                                 example: 0.12
 *                               probBid:
 *                                 type: number
 *                                 description: Probability investor will bid (0-1)
 *                                 example: 0.35
 *                               probSave:
 *                                 type: number
 *                                 description: Probability investor will save/bookmark (0-1)
 *                                 example: 0.58
 *                               probPass:
 *                                 type: number
 *                                 description: Probability investor will pass (0-1)
 *                                 example: 0.22
 *                               confidence:
 *                                 type: number
 *                                 description: Model confidence in predictions (0-1)
 *                                 example: 0.75
 *                               modelVersion:
 *                                 type: string
 *                                 example: "1.0.0"
 *                               factors:
 *                                 type: array
 *                                 description: Factors that influenced the prediction
 *                                 items:
 *                                   type: object
 *                                   properties:
 *                                     name:
 *                                       type: string
 *                                       example: "price_alignment"
 *                                     contribution:
 *                                       type: number
 *                                       example: 0.35
 *                                     description:
 *                                       type: string
 *                                       example: "Price $250,000 is well within budget"
 */
router.post('/buybox/match/:propertyId', matchPropertyToBuyBoxes);

/**
 * @swagger
 * /api/ai/buybox/list:
 *   get:
 *     summary: Get all active buy boxes
 *     description: Returns all hedge fund buy boxes with their criteria
 *     tags: [AI - Buy Box Agent]
 *     responses:
 *       200:
 *         description: List of buy boxes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                       fund_name:
 *                         type: string
 *                       fund_type:
 *                         type: string
 *                       criteria:
 *                         type: object
 *                       contact_email:
 *                         type: string
 *                       active:
 *                         type: boolean
 */
router.get('/buybox/list', getAllBuyBoxes);

/**
 * @swagger
 * /api/ai/buybox/create:
 *   post:
 *     summary: Create new buy box
 *     description: Add a new hedge fund buy box with criteria
 *     tags: [AI - Buy Box Agent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fund_name
 *               - criteria
 *             properties:
 *               fund_name:
 *                 type: string
 *                 example: New Fund LLC
 *               fund_type:
 *                 type: string
 *                 example: Institutional
 *               criteria:
 *                 type: object
 *                 properties:
 *                   states:
 *                     type: array
 *                     items:
 *                       type: string
 *                   minPrice:
 *                     type: number
 *                   maxPrice:
 *                     type: number
 *                   minBeds:
 *                     type: number
 *                   maxBeds:
 *                     type: number
 *                   propertyTypes:
 *                     type: array
 *                     items:
 *                       type: string
 *               contact_email:
 *                 type: string
 *               contact_phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Buy box created
 */
router.post('/buybox/create', createBuyBox);

/**
 * @swagger
 * /api/ai/buybox/{id}:
 *   put:
 *     summary: Update buy box
 *     description: Update an existing buy box configuration
 *     tags: [AI - Buy Box Agent]
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
 *         description: Buy box updated
 */
router.put('/buybox/:id', updateBuyBox);

/**
 * @swagger
 * /api/ai/buybox/{id}:
 *   delete:
 *     summary: Deactivate buy box
 *     description: Deactivate a buy box (soft delete)
 *     tags: [AI - Buy Box Agent]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Buy box deactivated
 */
router.delete('/buybox/:id', deactivateBuyBox);

// -----------------------------------------------------
// Behavior Learning Routes
// -----------------------------------------------------

/**
 * @swagger
 * /api/ai/buybox/action:
 *   post:
 *     summary: Record investor action
 *     description: Track investor behavior (viewed, bid, closed, passed) for learning optimal weights
 *     tags: [AI - Buy Box Learning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - investorId
 *               - buyBoxId
 *               - propertyId
 *               - action
 *             properties:
 *               investorId:
 *                 type: string
 *               buyBoxId:
 *                 type: string
 *               propertyId:
 *                 type: string
 *               action:
 *                 type: string
 *                 enum: [viewed, saved, requested_info, bid, offer_accepted, closed, passed, rejected, expired, lost_to_competitor]
 *               source:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Action recorded
 */
router.post('/buybox/action', recordInvestorAction);

/**
 * @swagger
 * /api/ai/buybox/{id}/insights:
 *   get:
 *     summary: Get learning insights
 *     description: Get behavior-based learning insights and weight recommendations
 *     tags: [AI - Buy Box Learning]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Learning insights
 */
router.get('/buybox/:id/insights', getBuyBoxInsights);

/**
 * @swagger
 * /api/ai/buybox/{id}/learn:
 *   post:
 *     summary: Learn and apply weights
 *     description: Analyze behavior data and optionally apply learned weights
 *     tags: [AI - Buy Box Learning]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apply:
 *                 type: boolean
 *                 description: Whether to apply the learned weights
 *     responses:
 *       200:
 *         description: Learned weights
 */
router.post('/buybox/:id/learn', learnAndApplyWeights);

/**
 * @swagger
 * /api/ai/buybox/{id}/actions:
 *   get:
 *     summary: Get buy box actions
 *     description: Get recent investor actions for a buy box
 *     tags: [AI - Buy Box Learning]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: outcome
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of actions with stats
 */
router.get('/buybox/:id/actions', getBuyBoxActions);

// -----------------------------------------------------
// Guardrail & Compliance Enforcement Routes
// -----------------------------------------------------

/**
 * @swagger
 * /api/ai/guardrail/check:
 *   post:
 *     summary: Check message for violations
 *     description: Real-time content moderation checking for phone/email sharing, circumvention attempts, harassment, etc.
 *     tags: [AI - Guardrail Agent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Call me at 555-123-4567 to discuss the deal"
 *               context:
 *                 type: object
 *                 properties:
 *                   userId:
 *                     type: string
 *                   propertyId:
 *                     type: string
 *     responses:
 *       200:
 *         description: Moderation results
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
 *                     allowed:
 *                       type: boolean
 *                     violations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             enum: [phone_number_sharing, email_sharing, circumvention_attempt, unlicensed_language, harassment]
 *                           severity:
 *                             type: string
 *                             enum: [low, medium, high]
 *                           action:
 *                             type: string
 *                     redactedMessage:
 *                       type: string
 *                     warningMessage:
 *                       type: string
 *                     escalateToHuman:
 *                       type: boolean
 */
router.post('/guardrail/check', checkMessage);

/**
 * @swagger
 * /api/ai/guardrail/flagged:
 *   get:
 *     summary: Get flagged messages for review
 *     description: Returns messages that were flagged and need human review
 *     tags: [AI - Guardrail Agent]
 *     responses:
 *       200:
 *         description: List of flagged messages
 */
router.get('/guardrail/flagged', getFlaggedMessages);

// -----------------------------------------------------
// Placeholder routes for future agents
// -----------------------------------------------------

/**
 * @swagger
 * /api/ai/underwriting/enrich/{propertyId}:
 *   post:
 *     summary: Enrich property with external data (Coming Soon)
 *     description: AI-powered data enrichment from Zillow, ATTOM, and other sources
 *     tags: [AI - Future Agents]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       501:
 *         description: Not yet implemented
 */
router.post('/underwriting/enrich/:propertyId', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Deal Underwriting Agent not yet implemented',
    message: 'This endpoint will provide AI-powered data enrichment from Zillow, ATTOM, and other sources',
    comingSoon: true
  });
});

/**
 * @swagger
 * /api/ai/offers/rank:
 *   post:
 *     summary: Rank offers by buyer behavior (Coming Soon)
 *     description: AI-powered offer ranking based on buyer behavior and historical data
 *     tags: [AI - Future Agents]
 *     responses:
 *       501:
 *         description: Not yet implemented
 */
router.post('/offers/rank', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Offer Ranking Agent not yet implemented',
    message: 'This endpoint will rank offers based on buyer behavior and historical data',
    comingSoon: true
  });
});

/**
 * @swagger
 * /api/ai/chat/message:
 *   post:
 *     summary: AI buyer communication (Coming Soon)
 *     description: AI-powered buyer communication assistant
 *     tags: [AI - Future Agents]
 *     responses:
 *       501:
 *         description: Not yet implemented
 */
router.post('/chat/message', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Buyer Communication Agent not yet implemented',
    message: 'This endpoint will provide AI-powered buyer communication',
    comingSoon: true
  });
});

/**
 * @swagger
 * /api/ai/workflow/status/{propertyId}:
 *   get:
 *     summary: Get workflow status (Coming Soon)
 *     description: View current workflow status for a property
 *     tags: [AI - Future Agents]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       501:
 *         description: Not yet implemented
 */
router.get('/workflow/status/:propertyId', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Workflow Orchestrator not yet implemented',
    message: 'This endpoint will show the current workflow status for a property',
    comingSoon: true
  });
});

// =====================================================
// Documentation Route
// =====================================================

/**
 * @swagger
 * /api/ai:
 *   get:
 *     summary: AI Agent System overview
 *     description: Returns information about available AI agents and their endpoints
 *     tags: [AI - Overview]
 *     responses:
 *       200:
 *         description: AI system overview
 */
router.get('/', (req, res) => {
  res.json({
    message: 'Dispotree AI Agent System API',
    version: '1.0.0',
    agents: {
      buybox: {
        description: 'Intelligent property-to-fund matching with behavior-based learning',
        endpoints: {
          match: 'POST /api/ai/buybox/match/:propertyId',
          list: 'GET /api/ai/buybox/list',
          create: 'POST /api/ai/buybox/create',
          update: 'PUT /api/ai/buybox/:id',
          delete: 'DELETE /api/ai/buybox/:id',
          recordAction: 'POST /api/ai/buybox/action',
          insights: 'GET /api/ai/buybox/:id/insights',
          learn: 'POST /api/ai/buybox/:id/learn',
          actions: 'GET /api/ai/buybox/:id/actions'
        },
        learning: {
          description: 'Tracks investor behavior to learn optimal scoring weights',
          actions: ['viewed', 'saved', 'requested_info', 'bid', 'offer_accepted', 'closed', 'passed', 'rejected'],
          features: [
            'Automatic weight adjustment based on closed vs passed deals',
            'Feature importance analysis',
            'Confidence-based recommendations'
          ]
        }
      },
      guardrail: {
        description: 'Real-time content moderation',
        endpoints: {
          check: 'POST /api/ai/guardrail/check',
          flagged: 'GET /api/ai/guardrail/flagged'
        }
      },
      underwriting: {
        description: 'AI-powered data enrichment (Coming Soon)',
        status: 'not_implemented'
      },
      offers: {
        description: 'Offer ranking and buyer behavior analysis (Coming Soon)',
        status: 'not_implemented'
      },
      communication: {
        description: 'AI-powered buyer communication (Coming Soon)',
        status: 'not_implemented'
      },
      workflow: {
        description: 'Workflow orchestration (Coming Soon)',
        status: 'not_implemented'
      }
    }
  });
});

export default router;
