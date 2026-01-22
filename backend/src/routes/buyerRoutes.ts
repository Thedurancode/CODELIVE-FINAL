/**
 * Buyer Routes
 * API endpoints for buyer management and property matching
 *
 * SECURITY:
 * - Authentication required for all endpoints
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as buyerController from '../controllers/buyerController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limiting
const buyerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication and rate limiting to ALL buyer routes
router.use(authenticate);
router.use(buyerLimiter);

// ============================================================================
// CRUD ROUTES
// ============================================================================

/**
 * @swagger
 * /api/buyers:
 *   get:
 *     summary: Get all buyers
 *     description: Retrieve all buyers with filtering and pagination
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: county
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *       - in: query
 *         name: zip
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, archived]
 *       - in: query
 *         name: hotOnly
 *         schema:
 *           type: boolean
 *         description: Only return hot buyers (>10 purchases in 6 months)
 *     responses:
 *       200:
 *         description: List of buyers with pagination
 */
router.get('/', buyerController.getBuyers);

/**
 * @swagger
 * /api/buyers/stats:
 *   get:
 *     summary: Get buyer statistics
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Buyer statistics
 */
router.get('/stats', buyerController.getBuyerStats);

/**
 * @swagger
 * /api/buyers/search:
 *   get:
 *     summary: Search buyers
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', buyerController.searchBuyers);

/**
 * @swagger
 * /api/buyers/hot:
 *   get:
 *     summary: Get hot potential buyers
 *     description: Returns buyers with >10 purchases in last 6 months
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Filter by state (e.g., NJ)
 *     responses:
 *       200:
 *         description: List of hot buyers
 */
router.get('/hot', buyerController.getHotBuyers);

/**
 * @swagger
 * /api/buyers/county/{state}/{county}:
 *   get:
 *     summary: Get buyers by county
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: county
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of buyers in county
 */
router.get('/county/:state/:county', buyerController.getBuyersByCounty);

/**
 * @swagger
 * /api/buyers/zip/{zip}:
 *   get:
 *     summary: Get buyers by zipcode
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: zip
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of buyers in zipcode
 */
router.get('/zip/:zip', buyerController.getBuyersByZip);

/**
 * @swagger
 * /api/buyers/match/{propertyId}:
 *   get:
 *     summary: Get matched buyers for a property
 *     description: Returns buyers matched by zipcode or county, sorted by priority (hot first, then zipcode match, then county match)
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of matched buyers with priority scoring
 */
router.get('/match/:propertyId', buyerController.getMatchedBuyers);

/**
 * @swagger
 * /api/buyers/match/advanced/{propertyId}:
 *   get:
 *     summary: Get ML-powered advanced matched buyers for a property
 *     description: Returns buyers matched using ML-powered matching based on historical behavior, buy box criteria, and engagement patterns
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of matched buyers to return
 *       - in: query
 *         name: minScore
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Minimum match score (0-100) to include in results
 *       - in: query
 *         name: minConfidence
 *         schema:
 *           type: string
 *           enum: [high, medium, low]
 *           default: low
 *         description: Minimum confidence level
 *       - in: query
 *         name: includeEngagement
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include engagement score analysis
 *       - in: query
 *         name: includeBehavior
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include full behavior profile in response
 *       - in: query
 *         name: includeML
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include ML prediction score
 *       - in: query
 *         name: rankBy
 *         schema:
 *           type: string
 *           enum: [matchScore, engagement, recent]
 *           default: matchScore
 *         description: How to rank the results
 *     responses:
 *       200:
 *         description: ML-powered matched buyers with scoring details
 */
router.get('/match/advanced/:propertyId', buyerController.getAdvancedMatchedBuyers);

/**
 * @swagger
 * /api/buyers/{id}:
 *   get:
 *     summary: Get buyer by ID
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Buyer details with contacts
 *       404:
 *         description: Buyer not found
 */
router.get('/:id', buyerController.getBuyer);

/**
 * @swagger
 * /api/buyers:
 *   post:
 *     summary: Create a new buyer
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - county
 *               - state
 *             properties:
 *               name:
 *                 type: string
 *               county:
 *                 type: string
 *               state:
 *                 type: string
 *               fips:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               zip:
 *                 type: string
 *               purchases6Month:
 *                 type: integer
 *               notes:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Buyer created successfully
 */
router.post('/', buyerController.createBuyer);

/**
 * @swagger
 * /api/buyers/import:
 *   post:
 *     summary: Import buyers from CSV file
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - filePath
 *             properties:
 *               filePath:
 *                 type: string
 *                 description: Path to the CSV file
 *     responses:
 *       200:
 *         description: Import results
 */
router.post('/import', buyerController.importBuyersFromCSV);

/**
 * @swagger
 * /api/buyers/{id}:
 *   patch:
 *     summary: Update a buyer
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
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
 *         description: Buyer updated successfully
 *       404:
 *         description: Buyer not found
 */
router.patch('/:id', buyerController.updateBuyer);

/**
 * @swagger
 * /api/buyers/{id}:
 *   delete:
 *     summary: Delete a buyer
 *     tags: [Buyers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Buyer deleted successfully
 *       404:
 *         description: Buyer not found
 */
router.delete('/:id', buyerController.deleteBuyer);

export default router;
