/**
 * Xome Routes
 * API endpoints for Xome marketplace integration
 *
 * SECURITY:
 * - All routes require authentication
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getPropertiesForXome,
  submitToXome
} from '../controllers/xomeController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limit
const xomeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many requests.' },
});

// Apply authentication
router.use(authenticate);
router.use(xomeLimiter);

/**
 * @swagger
 * /api/xome/properties:
 *   get:
 *     summary: Get properties ready for Xome submission
 *     description: Retrieve properties that meet Xome marketplace criteria
 *     tags: [Xome Integration]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ready, submitted, listed, sold]
 *         description: Filter by Xome submission status
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Filter by state
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum listing price
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum listing price
 *     responses:
 *       200:
 *         description: List of properties eligible for Xome
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
 *                       property:
 *                         $ref: '#/components/schemas/Property'
 *                       xomeStatus:
 *                         type: string
 *                         enum: [ready, submitted, listed, sold, rejected]
 *                       xomeListingId:
 *                         type: string
 *                       eligibilityScore:
 *                         type: number
 *                 total:
 *                   type: integer
 *       500:
 *         description: Server error
 */
router.get('/properties', getPropertiesForXome);

/**
 * @swagger
 * /api/xome/submit/{propertyId}:
 *   post:
 *     summary: Submit property to Xome
 *     description: Submit a property to the Xome marketplace for listing
 *     tags: [Xome Integration]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID to submit
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               listingPrice:
 *                 type: number
 *                 description: Override listing price (optional)
 *               auctionStartPrice:
 *                 type: number
 *                 description: Starting price for auction
 *               reservePrice:
 *                 type: number
 *                 description: Reserve price for auction
 *               listingType:
 *                 type: string
 *                 enum: [auction, buy_now, hybrid]
 *                 default: auction
 *               auctionDuration:
 *                 type: integer
 *                 description: Auction duration in days
 *                 default: 7
 *               description:
 *                 type: string
 *                 description: Custom listing description
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Photo URLs to include
 *     responses:
 *       200:
 *         description: Property submitted successfully
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
 *                     submissionId:
 *                       type: string
 *                     xomeListingId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, approved, rejected]
 *                     listingUrl:
 *                       type: string
 *                       description: URL to the Xome listing (if approved)
 *                     estimatedGoLiveDate:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Property not eligible for Xome
 *       404:
 *         description: Property not found
 *       500:
 *         description: Server error
 */
router.post('/submit/:propertyId', submitToXome);

export default router;
