/**
 * Marketplace Routes
 * API routes for the deal marketplace (swipe-based interface)
 */

import { Router } from 'express';
import * as marketplaceController from '../controllers/marketplaceController';
import { authenticate, optionalAuth, authorize } from '../middleware/auth';

const router = Router();

// ============================================================================
// USERS
// ============================================================================

/**
 * @swagger
 * /api/marketplace/users:
 *   post:
 *     summary: Create a new marketplace user
 *     description: Register a new user with preferences and buy box criteria
 *     tags: [Marketplace - Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - name
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: investor@example.com
 *               name:
 *                 type: string
 *                 example: John Smith
 *               company:
 *                 type: string
 *                 example: ABC Investments
 *               phone:
 *                 type: string
 *                 example: (555) 123-4567
 *               role:
 *                 type: string
 *                 enum: [buyer, investor, wholesaler, agent]
 *                 example: investor
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MarketplaceUser'
 *       500:
 *         description: Server error
 */
router.post('/users', marketplaceController.createUser);

/**
 * @swagger
 * /api/marketplace/users/{userId}:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieve a marketplace user's profile and preferences
 *     tags: [Marketplace - Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MarketplaceUser'
 *       404:
 *         description: User not found
 */
router.get('/users/:userId', authenticate, marketplaceController.getUser);

// ============================================================================
// BUY BOXES
// ============================================================================

/**
 * @swagger
 * /api/marketplace/users/{userId}/buyboxes:
 *   post:
 *     summary: Create a buy box for user
 *     description: Create a new buy box with investment criteria for deal matching
 *     tags: [Marketplace - Buy Boxes]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - criteria
 *             properties:
 *               name:
 *                 type: string
 *                 example: Texas Single Family
 *               criteria:
 *                 type: object
 *                 properties:
 *                   states:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: [TX, FL, GA]
 *                   cities:
 *                     type: array
 *                     items:
 *                       type: string
 *                   minPrice:
 *                     type: number
 *                     example: 50000
 *                   maxPrice:
 *                     type: number
 *                     example: 300000
 *                   propertyTypes:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: [single_family, townhouse, condo, multi_family, duplex, triplex, fourplex, land, commercial]
 *                     example: [single_family, townhouse]
 *                   minBedrooms:
 *                     type: number
 *                     example: 2
 *                   maxBedrooms:
 *                     type: number
 *                     example: 5
 *                   minBathrooms:
 *                     type: number
 *                     example: 1
 *                   maxBathrooms:
 *                     type: number
 *                   minSqft:
 *                     type: number
 *                     example: 1000
 *                   maxSqft:
 *                     type: number
 *                   minYearBuilt:
 *                     type: number
 *                     example: 1950
 *                   acceptedConditions:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: [turnkey, light_rehab, moderate_rehab, heavy_rehab, tear_down]
 *                   maxRehabCost:
 *                     type: number
 *               priority:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 10
 *                 example: 5
 *     responses:
 *       201:
 *         description: Buy box created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/UserBuyBox'
 */
router.post('/users/:userId/buyboxes', authenticate, marketplaceController.createBuyBox);

/**
 * @swagger
 * /api/marketplace/users/{userId}/buyboxes:
 *   get:
 *     summary: Get user's buy boxes
 *     description: Retrieve all buy boxes for a user
 *     tags: [Marketplace - Buy Boxes]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
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
 *                     $ref: '#/components/schemas/UserBuyBox'
 */
router.get('/users/:userId/buyboxes', authenticate, marketplaceController.getUserBuyBoxes);

/**
 * @swagger
 * /api/marketplace/buyboxes/{buyBoxId}:
 *   put:
 *     summary: Update a buy box
 *     description: Update buy box criteria and preferences
 *     tags: [Marketplace - Buy Boxes]
 *     parameters:
 *       - in: path
 *         name: buyBoxId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               criteria:
 *                 type: object
 *               active:
 *                 type: boolean
 *               priority:
 *                 type: number
 *     responses:
 *       200:
 *         description: Buy box updated
 */
router.put('/buyboxes/:buyBoxId', authenticate, marketplaceController.updateBuyBox);

// ============================================================================
// DEAL FEED
// ============================================================================

/**
 * @swagger
 * /api/marketplace/users/{userId}/feed:
 *   get:
 *     summary: Get personalized deal feed
 *     description: |
 *       Returns deals matched to user's buy box criteria, sorted by match score.
 *       Supports pagination, filtering, and sorting options.
 *     tags: [Marketplace - Feed]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Deals per page
 *       - in: query
 *         name: buyBoxId
 *         schema:
 *           type: string
 *         description: Filter by specific buy box
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [match_score, newest, price_low, price_high, ending_soon]
 *           default: match_score
 *         description: Sort order
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price filter
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price filter
 *       - in: query
 *         name: states
 *         schema:
 *           type: string
 *         description: Comma-separated state codes
 *       - in: query
 *         name: propertyTypes
 *         schema:
 *           type: string
 *         description: Comma-separated property types
 *     responses:
 *       200:
 *         description: Personalized deal feed
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
 *                     deals:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/MarketplaceDeal'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         hasMore:
 *                           type: boolean
 */
router.get('/users/:userId/feed', authenticate, marketplaceController.getFeed);

// ============================================================================
// SWIPE ACTIONS
// ============================================================================

/**
 * @swagger
 * /api/marketplace/users/{userId}/deals/{dealId}/swipe:
 *   post:
 *     summary: Record a swipe action (like/pass)
 *     description: |
 *       Record a user's swipe action on a deal. Passing provides optional feedback
 *       that improves future matching. View duration is tracked for analytics.
 *     tags: [Marketplace - Swipes]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dealId
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
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [like, pass]
 *                 description: Swipe action
 *               passReason:
 *                 type: string
 *                 enum: [price_too_high, location_not_ideal, property_condition, not_enough_equity, wrong_property_type, too_small, too_large, bad_neighborhood, title_issues, already_have_similar, over_budget, other]
 *                 description: Reason for passing (optional)
 *               passReasonCustom:
 *                 type: string
 *                 description: Custom reason if "other" is selected
 *               viewDuration:
 *                 type: integer
 *                 description: Time spent viewing in milliseconds
 *     responses:
 *       200:
 *         description: Swipe recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid action
 */
router.post('/users/:userId/deals/:dealId/swipe', authenticate, marketplaceController.swipeDeal);

/**
 * @swagger
 * /api/marketplace/users/{userId}/deals/{dealId}/view:
 *   post:
 *     summary: Record a deal view
 *     description: Track when a user views a deal card (for analytics)
 *     tags: [Marketplace - Swipes]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               duration:
 *                 type: integer
 *                 description: View duration in milliseconds
 *     responses:
 *       200:
 *         description: View recorded
 */
router.post('/users/:userId/deals/:dealId/view', authenticate, marketplaceController.recordView);

/**
 * @swagger
 * /api/marketplace/pass-reasons:
 *   get:
 *     summary: Get available pass reasons
 *     description: Returns the list of predefined reasons for passing on a deal
 *     tags: [Marketplace - Swipes]
 *     responses:
 *       200:
 *         description: List of pass reasons
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
 *                       value:
 *                         type: string
 *                       label:
 *                         type: string
 */
router.get('/pass-reasons', marketplaceController.getPassReasons);

// ============================================================================
// OFFERS
// ============================================================================

/**
 * @swagger
 * /api/marketplace/users/{userId}/deals/{dealId}/offers:
 *   post:
 *     summary: Submit an offer on a deal
 *     description: Create a new offer on a liked deal
 *     tags: [Marketplace - Offers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dealId
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
 *               - offerAmount
 *               - closingDays
 *               - financeType
 *             properties:
 *               offerAmount:
 *                 type: number
 *                 example: 250000
 *               earnestMoney:
 *                 type: number
 *                 example: 5000
 *               closingDays:
 *                 type: integer
 *                 example: 14
 *               contingencies:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [inspection, financing]
 *               notes:
 *                 type: string
 *                 example: Flexible on closing date
 *               financeType:
 *                 type: string
 *                 enum: [cash, hard_money, conventional, other]
 *                 example: cash
 *               proofOfFunds:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Offer submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/DealOffer'
 */
router.post('/users/:userId/deals/:dealId/offers', authenticate, marketplaceController.createOffer);

/**
 * @swagger
 * /api/marketplace/users/{userId}/offers:
 *   get:
 *     summary: Get user's offers
 *     description: Retrieve all offers submitted by a user
 *     tags: [Marketplace - Offers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, viewed, countered, accepted, rejected, expired, withdrawn]
 *         description: Filter by offer status
 *     responses:
 *       200:
 *         description: List of offers
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
 *                     $ref: '#/components/schemas/DealOffer'
 */
router.get('/users/:userId/offers', authenticate, marketplaceController.getUserOffers);

/**
 * @swagger
 * /api/marketplace/offers/{offerId}/respond:
 *   post:
 *     summary: Respond to an offer
 *     description: Accept, reject, or counter an offer (for sellers/wholesalers)
 *     tags: [Marketplace - Offers]
 *     parameters:
 *       - in: path
 *         name: offerId
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
 *               - response
 *             properties:
 *               response:
 *                 type: string
 *                 enum: [accepted, rejected, countered]
 *               counterOffer:
 *                 type: object
 *                 description: Required if response is "countered"
 *                 properties:
 *                   amount:
 *                     type: number
 *                     example: 260000
 *                   closingDays:
 *                     type: integer
 *                     example: 10
 *                   notes:
 *                     type: string
 *     responses:
 *       200:
 *         description: Response recorded
 *       404:
 *         description: Offer not found
 */
router.post('/offers/:offerId/respond', authenticate, marketplaceController.respondToOffer);

/**
 * @swagger
 * /api/marketplace/deals/{dealId}/offers:
 *   get:
 *     summary: Get all offers for a deal
 *     description: Retrieve all offers submitted on a specific deal (for sellers/wholesalers)
 *     tags: [Marketplace - Offers]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, viewed, countered, accepted, rejected, expired, withdrawn]
 *         description: Filter by offer status
 *     responses:
 *       200:
 *         description: List of offers
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
 *                     $ref: '#/components/schemas/DealOffer'
 *       404:
 *         description: Deal not found
 */
router.get('/deals/:dealId/offers', authenticate, marketplaceController.getDealOffers);

// ============================================================================
// PREDICTIONS & ANALYTICS
// ============================================================================

/**
 * @swagger
 * /api/marketplace/users/{userId}/profile:
 *   get:
 *     summary: Get user behavior profile
 *     description: |
 *       Returns ML-derived insights about user preferences based on their
 *       swipe history, including implicit preferences and engagement patterns.
 *     tags: [Marketplace - Analytics]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User behavior profile
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
 *                     implicitPreferences:
 *                       type: object
 *                       properties:
 *                         avgLikedPrice:
 *                           type: number
 *                         avgPassedPrice:
 *                           type: number
 *                         preferredPriceRange:
 *                           type: object
 *                         likedStates:
 *                           type: object
 *                         likedPropertyTypes:
 *                           type: object
 *                     topPassReasons:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           reason:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           percentage:
 *                             type: number
 *                     likeRate:
 *                       type: number
 *                       description: Likes / Views ratio
 *                     offerRate:
 *                       type: number
 *                       description: Offers / Likes ratio
 *                     predictedInterests:
 *                       type: object
 */
router.get('/users/:userId/profile', authenticate, marketplaceController.getUserBehaviorProfile);

/**
 * @swagger
 * /api/marketplace/users/{userId}/deals/{dealId}/predict:
 *   get:
 *     summary: Predict user interest in a deal
 *     description: Uses ML to predict whether a user will like or pass on a specific deal
 *     tags: [Marketplace - Analytics]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Prediction result
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
 *                     predictedAction:
 *                       type: string
 *                       enum: [like, pass]
 *                     confidence:
 *                       type: number
 *                       minimum: 0
 *                       maximum: 100
 *                     factors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           factor:
 *                             type: string
 *                           impact:
 *                             type: string
 *                             enum: [positive, negative]
 *                           weight:
 *                             type: number
 */
router.get('/users/:userId/deals/:dealId/predict', authenticate, marketplaceController.predictDealInterest);

/**
 * @swagger
 * /api/marketplace/analytics/pass-reasons:
 *   get:
 *     summary: Get pass reason analytics
 *     description: Aggregate analytics on why deals are being passed
 *     tags: [Marketplace - Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by specific user (optional)
 *     responses:
 *       200:
 *         description: Pass reason analytics
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
 *                       reason:
 *                         type: string
 *                       count:
 *                         type: integer
 *                       percentage:
 *                         type: number
 */
router.get('/analytics/pass-reasons', marketplaceController.getPassReasonAnalytics);

/**
 * @swagger
 * /api/marketplace/deals/{dealId}/analytics:
 *   get:
 *     summary: Get deal engagement analytics
 *     description: View and engagement metrics for a specific deal
 *     tags: [Marketplace - Analytics]
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deal analytics
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
 *                     views:
 *                       type: integer
 *                     likes:
 *                       type: integer
 *                     passes:
 *                       type: integer
 *                     offers:
 *                       type: integer
 *                     avgViewDuration:
 *                       type: number
 *                     likeRate:
 *                       type: number
 *                     topPassReasons:
 *                       type: array
 */
router.get('/deals/:dealId/analytics', marketplaceController.getDealAnalytics);

// ============================================================================
// DEAL COMPARISON
// ============================================================================

/**
 * @swagger
 * /api/marketplace/compare:
 *   post:
 *     summary: Compare multiple deals side-by-side
 *     description: |
 *       Performs comprehensive comparison of 2-5 deals including:
 *       - Financial metrics (ROI, equity, profit margins)
 *       - Property features comparison
 *       - Market analysis
 *       - Engagement metrics
 *       - Pros/cons analysis
 *       - Winner determination with weighted scoring
 *     tags: [Marketplace - Comparison]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dealIds
 *             properties:
 *               dealIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 2
 *                 maxItems: 5
 *                 example: [deal-001, deal-002, deal-003]
 *               weights:
 *                 type: object
 *                 description: Custom weights for scoring (0-1, must sum to 1)
 *                 properties:
 *                   financial:
 *                     type: number
 *                     example: 0.35
 *                   property:
 *                     type: number
 *                     example: 0.20
 *                   location:
 *                     type: number
 *                     example: 0.15
 *                   market:
 *                     type: number
 *                     example: 0.15
 *                   competition:
 *                     type: number
 *                     example: 0.15
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Optional user ID for personalized comparison
 *     responses:
 *       200:
 *         description: Deal comparison results
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
 *                     deals:
 *                       type: array
 *                       description: Detailed comparison for each deal
 *                     summary:
 *                       type: object
 *                       description: Summary with best in each category
 *                     winner:
 *                       type: object
 *                       description: Overall winner with reasons
 */
router.post('/compare', marketplaceController.compareDeals);

/**
 * @swagger
 * /api/marketplace/compare/quick:
 *   post:
 *     summary: Quick financial comparison of deals
 *     description: Returns just the key financial metrics for rapid comparison
 *     tags: [Marketplace - Comparison]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dealIds
 *             properties:
 *               dealIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [deal-001, deal-002]
 *     responses:
 *       200:
 *         description: Quick comparison results
 */
router.post('/compare/quick', marketplaceController.quickCompareDeals);

// ============================================================================
// HIGH-SIGNAL ACTIONS
// ============================================================================

/**
 * @swagger
 * /api/marketplace/users/{userId}/deals/{dealId}/save:
 *   post:
 *     summary: Save a deal to favorites
 *     description: Track when user saves/favorites a deal (high-signal action)
 *     tags: [Marketplace - Actions]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Save tracked
 */
router.post('/users/:userId/deals/:dealId/save', authenticate, marketplaceController.trackSave);

/**
 * @swagger
 * /api/marketplace/users/{userId}/deals/{dealId}/share:
 *   post:
 *     summary: Track deal share
 *     description: Track when user shares a deal (high-signal action)
 *     tags: [Marketplace - Actions]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Share tracked
 */
router.post('/users/:userId/deals/:dealId/share', authenticate, marketplaceController.trackShare);

/**
 * @swagger
 * /api/marketplace/users/{userId}/deals/{dealId}/request-info:
 *   post:
 *     summary: Track info request
 *     description: Track when user requests more information (high-signal action)
 *     tags: [Marketplace - Actions]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Request tracked
 */
router.post('/users/:userId/deals/:dealId/request-info', authenticate, marketplaceController.trackRequestInfo);

/**
 * @swagger
 * /api/marketplace/users/{userId}/filters:
 *   post:
 *     summary: Track filter usage
 *     description: Track what filters user applies (for preference learning)
 *     tags: [Marketplace - Actions]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filters:
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
 *                   propertyTypes:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       200:
 *         description: Filters tracked
 */
router.post('/users/:userId/filters', authenticate, marketplaceController.trackFilterUsage);

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * @swagger
 * /api/marketplace/notifications/stats:
 *   get:
 *     summary: Get notification service stats
 *     description: Returns WebSocket connection stats and queue information
 *     tags: [Marketplace - Notifications]
 *     responses:
 *       200:
 *         description: Notification service stats
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
 *                     connections:
 *                       type: integer
 *                       description: Active WebSocket connections
 *                     users:
 *                       type: integer
 *                       description: Unique connected users
 *                     queuedNotifications:
 *                       type: integer
 *                       description: Notifications pending delivery
 */
router.get('/notifications/stats', marketplaceController.getNotificationStats);

/**
 * @swagger
 * /api/marketplace/users/{userId}/notifications/test:
 *   post:
 *     summary: Send a test notification
 *     description: Send a test notification to a user (for development/testing)
 *     tags: [Marketplace - Notifications]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: Test Notification
 *               message:
 *                 type: string
 *                 example: This is a test message
 *               type:
 *                 type: string
 *                 enum: [deal_match, offer_received, offer_status, deal_expiring, price_drop, new_deal, system]
 *               priority:
 *                 type: string
 *                 enum: [low, normal, high, urgent]
 *     responses:
 *       200:
 *         description: Notification sent
 */
router.post('/users/:userId/notifications/test', marketplaceController.sendTestNotification);

// ============================================================================
// MAGIC LINK MATCHES (Public - No Auth Required)
// ============================================================================

/**
 * @swagger
 * /api/marketplace/matches:
 *   get:
 *     summary: Get user matches via magic link token
 *     description: Retrieve matched deals using a magic link token from SMS. No authentication required.
 *     tags: [Marketplace - Magic Link]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Magic link token from SMS notification
 *     responses:
 *       200:
 *         description: Successfully retrieved matches
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
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                     matches:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           matchType:
 *                             type: string
 *                           matchScore:
 *                             type: number
 *                           deal:
 *                             type: object
 *                     total:
 *                       type: number
 *       400:
 *         description: Missing token
 *       401:
 *         description: Invalid or expired magic link
 *       404:
 *         description: User not found
 */
router.get('/matches', marketplaceController.getMatchesViaMagicLink);

// ============================================================================
// MAYBE PILE
// ============================================================================

/**
 * @swagger
 * /api/marketplace/users/{userId}/maybe:
 *   get:
 *     summary: Get user's maybe pile
 *     tags: [Marketplace - Maybe]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Maybe deals retrieved
 */
router.get('/users/:userId/maybe', authenticate, marketplaceController.getMaybeDeals);

/**
 * @swagger
 * /api/marketplace/users/{userId}/maybe/{dealId}:
 *   patch:
 *     summary: Update notes for a maybe deal
 *     tags: [Marketplace - Maybe]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/users/:userId/maybe/:dealId', authenticate, marketplaceController.updateMaybeNotes);

/**
 * @swagger
 * /api/marketplace/users/{userId}/maybe/{dealId}/resolve:
 *   post:
 *     summary: Resolve a maybe deal (like or pass)
 *     tags: [Marketplace - Maybe]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users/:userId/maybe/:dealId/resolve', authenticate, marketplaceController.resolveMaybeDeal);

// ============================================================================
// TEAM COLLABORATION
// ============================================================================

/**
 * @swagger
 * /api/marketplace/users/{userId}/team:
 *   get:
 *     summary: Get team members for assignment
 *     tags: [Marketplace - Team]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users/:userId/team', authenticate, marketplaceController.getTeamMembers);

/**
 * @swagger
 * /api/marketplace/users/{userId}/assignments:
 *   get:
 *     summary: Get assignments for user
 *     tags: [Marketplace - Team]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users/:userId/assignments', authenticate, marketplaceController.getAssignments);

/**
 * @swagger
 * /api/marketplace/users/{userId}/assignments:
 *   post:
 *     summary: Assign a deal to a team member
 *     tags: [Marketplace - Team]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users/:userId/assignments', authenticate, marketplaceController.assignDeal);

/**
 * @swagger
 * /api/marketplace/users/{userId}/assignments/{assignmentId}:
 *   patch:
 *     summary: Respond to an assignment
 *     tags: [Marketplace - Team]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/users/:userId/assignments/:assignmentId', authenticate, marketplaceController.respondToAssignment);

// ============================================================================
// EXPORT (CSV/PDF)
// ============================================================================

/**
 * @swagger
 * /api/marketplace/users/{userId}/export/email:
 *   post:
 *     summary: Email liked deals as CSV and PDF
 *     description: Sends an email with all liked deals as CSV and a nicely formatted PDF attachment
 *     tags: [Marketplace - Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Export email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: User not found or no liked deals
 */
router.post('/users/:userId/export/email', authenticate, marketplaceController.exportLikedDeals);

/**
 * @swagger
 * /api/marketplace/users/{userId}/export/csv:
 *   get:
 *     summary: Download liked deals as CSV
 *     description: Returns a CSV file download of all liked deals
 *     tags: [Marketplace - Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: User not found or no liked deals
 */
router.get('/users/:userId/export/csv', authenticate, marketplaceController.downloadDealsCSV);

// ============================================================================
// VIEW TRACKING
// ============================================================================

/**
 * @swagger
 * /api/marketplace/deals/{dealId}/viewers:
 *   get:
 *     summary: Get all users who viewed a deal
 *     description: Returns a paginated list of users who have viewed this deal, with their engagement data
 *     tags: [Marketplace - View Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *         description: The deal ID
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
 *         name: includeAllActions
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include users who took any action (like, pass, offer) not just views
 *     responses:
 *       200:
 *         description: List of viewers
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
 *                     viewers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           user:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *                               company:
 *                                 type: string
 *                           viewCount:
 *                             type: integer
 *                           totalViewDuration:
 *                             type: integer
 *                           firstViewedAt:
 *                             type: string
 *                             format: date-time
 *                           lastViewedAt:
 *                             type: string
 *                             format: date-time
 *                           actions:
 *                             type: array
 *                             items:
 *                               type: string
 *                     total:
 *                       type: integer
 *                     pagination:
 *                       type: object
 */
router.get('/deals/:dealId/viewers', authenticate, marketplaceController.getDealViewers);

/**
 * @swagger
 * /api/marketplace/users/{userId}/history:
 *   get:
 *     summary: Get user's deal view history
 *     description: Returns a paginated list of all deals the user has viewed or interacted with
 *     tags: [Marketplace - View Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
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
 *     responses:
 *       200:
 *         description: User's view history
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
 *                     history:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           dealId:
 *                             type: string
 *                           deal:
 *                             type: object
 *                           viewCount:
 *                             type: integer
 *                           totalViewDuration:
 *                             type: integer
 *                           firstViewedAt:
 *                             type: string
 *                             format: date-time
 *                           lastViewedAt:
 *                             type: string
 *                             format: date-time
 *                           actions:
 *                             type: array
 *                             items:
 *                               type: string
 *                           liked:
 *                             type: boolean
 *                           passed:
 *                             type: boolean
 *                           offered:
 *                             type: boolean
 *                     total:
 *                       type: integer
 *                     pagination:
 *                       type: object
 *       403:
 *         description: Unauthorized - can only view own history
 */
router.get('/users/:userId/history', authenticate, marketplaceController.getUserViewHistory);

// ============================================================================
// FORWARD TRACKING
// ============================================================================

/**
 * @swagger
 * /api/marketplace/users/{userId}/deals/{dealId}/forward:
 *   post:
 *     summary: Forward a deal to a recipient
 *     description: Record when a user forwards/shares a deal to someone, with full recipient tracking
 *     tags: [Marketplace - Forward Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dealId
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
 *               - method
 *             properties:
 *               method:
 *                 type: string
 *                 enum: [email, sms, internal, link, whatsapp, other]
 *               recipientEmail:
 *                 type: string
 *               recipientPhone:
 *                 type: string
 *               recipientUserId:
 *                 type: string
 *               recipientName:
 *                 type: string
 *               recipientCompany:
 *                 type: string
 *               message:
 *                 type: string
 *               subject:
 *                 type: string
 *     responses:
 *       201:
 *         description: Forward recorded
 */
router.post('/users/:userId/deals/:dealId/forward', authenticate, marketplaceController.forwardDeal);

/**
 * @swagger
 * /api/marketplace/deals/{dealId}/forwards:
 *   get:
 *     summary: Get all forwards for a deal (admin)
 *     description: Returns a paginated list of all users who forwarded this deal and to whom
 *     tags: [Marketplace - Forward Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
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
 *     responses:
 *       200:
 *         description: List of forwards
 */
router.get('/deals/:dealId/forwards', authenticate, marketplaceController.getDealForwards);

/**
 * @swagger
 * /api/marketplace/users/{userId}/forwards:
 *   get:
 *     summary: Get all forwards by a user
 *     description: Returns a paginated list of all deals a user has forwarded
 *     tags: [Marketplace - Forward Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
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
 *     responses:
 *       200:
 *         description: List of forwards
 */
router.get('/users/:userId/forwards', authenticate, marketplaceController.getUserForwards);

/**
 * @swagger
 * /api/marketplace/forward/{token}/click:
 *   get:
 *     summary: Track a forward link click
 *     description: Public endpoint to track when a forwarded deal link is clicked
 *     tags: [Marketplace - Forward Tracking]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Tracking token from the forwarded link
 *     responses:
 *       200:
 *         description: Click tracked
 *       404:
 *         description: Invalid tracking token
 */
router.get('/forward/:token/click', marketplaceController.trackForwardClick);

/**
 * @swagger
 * /api/marketplace/analytics/forwards:
 *   get:
 *     summary: Get forward analytics
 *     description: Returns analytics about deal forwarding activity
 *     tags: [Marketplace - Forward Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dealId
 *         schema:
 *           type: string
 *         description: Optional - filter analytics to a specific deal
 *     responses:
 *       200:
 *         description: Forward analytics
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
 *                     totalForwards:
 *                       type: integer
 *                     byMethod:
 *                       type: object
 *                     byStatus:
 *                       type: object
 *                     clickRate:
 *                       type: number
 *                     topForwarders:
 *                       type: array
 */
router.get('/analytics/forwards', authenticate, marketplaceController.getForwardAnalytics);

// ============================================================================
// RESEND WEBHOOKS (Email Tracking)
// ============================================================================

/**
 * @swagger
 * /api/marketplace/webhooks/resend:
 *   post:
 *     summary: Handle Resend email webhook events
 *     description: |
 *       Webhook endpoint for Resend email tracking events.
 *       Configure this URL in your Resend dashboard webhook settings.
 *       Tracks email lifecycle events: sent, delivered, opened, clicked, bounced.
 *     tags: [Marketplace - Email Tracking]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained]
 *               created_at:
 *                 type: string
 *                 format: date-time
 *               data:
 *                 type: object
 *                 properties:
 *                   email_id:
 *                     type: string
 *                   from:
 *                     type: string
 *                   to:
 *                     type: array
 *                     items:
 *                       type: string
 *                   subject:
 *                     type: string
 *     responses:
 *       200:
 *         description: Webhook event processed
 *       401:
 *         description: Invalid webhook signature
 */
router.post('/webhooks/resend', marketplaceController.handleResendWebhook);

/**
 * @swagger
 * /api/marketplace/analytics/email-tracking:
 *   get:
 *     summary: Get email tracking statistics
 *     description: Returns aggregate statistics for email delivery and engagement
 *     tags: [Marketplace - Email Tracking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Email tracking statistics
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
 *                     total:
 *                       type: integer
 *                       description: Total emails sent
 *                     sent:
 *                       type: integer
 *                       description: Emails confirmed sent
 *                     delivered:
 *                       type: integer
 *                       description: Emails delivered
 *                     opened:
 *                       type: integer
 *                       description: Emails opened
 *                     clicked:
 *                       type: integer
 *                       description: Emails with link clicks
 *                     failed:
 *                       type: integer
 *                       description: Emails that failed
 *                     openRate:
 *                       type: number
 *                       description: Open rate percentage
 *                     clickRate:
 *                       type: number
 *                       description: Click-through rate percentage
 */
router.get('/analytics/email-tracking', authenticate, marketplaceController.getEmailTrackingStats);

export default router;
