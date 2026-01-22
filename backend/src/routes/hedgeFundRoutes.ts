/**
 * Hedge Fund Routes
 * API endpoints for hedge fund property submissions and buy box matching
 *
 * SECURITY:
 * - All routes require authentication
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import {
  getPropertiesForHedgeFunds,
  generateHedgeFundCSV,
  submitToHedgeFund,
  getHedgeFundBuyBoxes,
  matchPropertiesToBuyBoxes
} from '../controllers/hedgeFundController';
import { authenticate } from '../middleware/auth';
import { buyBoxImportService } from '../services/BuyBoxImportService';

const router = Router();

// File upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PNG, JPG, WEBP, GIF, PDF'));
    }
  },
});

// Rate limit
const hedgeFundLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many requests.' },
});

// Apply authentication
router.use(authenticate);
router.use(hedgeFundLimiter);

/**
 * @swagger
 * /api/hedgefunds/properties:
 *   get:
 *     summary: Get properties ready for hedge fund submission
 *     description: Retrieve properties that meet hedge fund criteria and are ready for submission
 *     tags: [Hedge Funds]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ready, submitted, rejected, pending]
 *         description: Filter by submission status
 *       - in: query
 *         name: hedgeFundId
 *         schema:
 *           type: string
 *         description: Filter by specific hedge fund
 *       - in: query
 *         name: minScore
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         description: Minimum buy box match score
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Filter by state
 *     responses:
 *       200:
 *         description: List of properties for hedge fund submission
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
 *                       matchScore:
 *                         type: number
 *                       matchedBuyBoxes:
 *                         type: array
 *                         items:
 *                           type: string
 *                       submissionStatus:
 *                         type: string
 *       500:
 *         description: Server error
 */
router.get('/properties', getPropertiesForHedgeFunds);

/**
 * @swagger
 * /api/hedgefunds/csv:
 *   post:
 *     summary: Generate CSV for hedge fund submission
 *     description: Generate a formatted CSV file containing properties for hedge fund submission
 *     tags: [Hedge Funds]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hedgeFundId
 *             properties:
 *               hedgeFundId:
 *                 type: string
 *                 description: Target hedge fund ID
 *                 example: hf-abc-investments
 *               propertyIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Specific property IDs to include (optional, defaults to all matching)
 *               format:
 *                 type: string
 *                 enum: [standard, custom]
 *                 default: standard
 *                 description: CSV format template
 *               includeFields:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Specific fields to include in CSV
 *     responses:
 *       200:
 *         description: CSV generated successfully
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
 *                     downloadUrl:
 *                       type: string
 *                       description: URL to download the CSV
 *                     propertyCount:
 *                       type: integer
 *                     hedgeFundName:
 *                       type: string
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
router.post('/csv', generateHedgeFundCSV);

/**
 * @swagger
 * /api/hedgefunds/submit:
 *   post:
 *     summary: Submit properties to hedge fund
 *     description: Submit one or more properties to a hedge fund for review/purchase
 *     tags: [Hedge Funds]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hedgeFundId
 *               - propertyIds
 *             properties:
 *               hedgeFundId:
 *                 type: string
 *                 description: Target hedge fund ID
 *                 example: hf-abc-investments
 *               propertyIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Property IDs to submit
 *                 example: [PROP-001, PROP-002]
 *               priority:
 *                 type: string
 *                 enum: [normal, high, urgent]
 *                 default: normal
 *               notes:
 *                 type: string
 *                 description: Additional notes for the submission
 *               contactEmail:
 *                 type: string
 *                 format: email
 *                 description: Contact email for this submission
 *     responses:
 *       200:
 *         description: Properties submitted successfully
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
 *                     propertiesSubmitted:
 *                       type: integer
 *                     hedgeFundName:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, received, under_review]
 *       400:
 *         description: Invalid submission data
 *       404:
 *         description: Hedge fund or properties not found
 *       500:
 *         description: Server error
 */
router.post('/submit', submitToHedgeFund);

/**
 * @swagger
 * /api/hedgefunds/buyboxes:
 *   get:
 *     summary: Get available hedge fund buy boxes
 *     description: Retrieve all configured hedge fund buy box criteria
 *     tags: [Hedge Funds]
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Filter buy boxes that accept properties in this state
 *     responses:
 *       200:
 *         description: List of hedge fund buy boxes
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
 *                         type: string
 *                       name:
 *                         type: string
 *                         example: ABC Investments - Texas SFR
 *                       fundName:
 *                         type: string
 *                         example: ABC Investments
 *                       active:
 *                         type: boolean
 *                       criteria:
 *                         type: object
 *                         properties:
 *                           states:
 *                             type: array
 *                             items:
 *                               type: string
 *                           minPrice:
 *                             type: number
 *                           maxPrice:
 *                             type: number
 *                           propertyTypes:
 *                             type: array
 *                             items:
 *                               type: string
 *                           minBedrooms:
 *                             type: integer
 *                           maxYearBuilt:
 *                             type: integer
 *                       contactEmail:
 *                         type: string
 *       500:
 *         description: Server error
 */
router.get('/buyboxes', getHedgeFundBuyBoxes);

/**
 * @swagger
 * /api/hedgefunds/match/{propertyId}:
 *   get:
 *     summary: Match property to buy boxes
 *     description: Find all hedge fund buy boxes that match a specific property
 *     tags: [Hedge Funds]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID to match
 *     responses:
 *       200:
 *         description: Matching buy boxes with scores
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
 *                           buyBoxId:
 *                             type: string
 *                           buyBoxName:
 *                             type: string
 *                           fundName:
 *                             type: string
 *                           score:
 *                             type: number
 *                             minimum: 0
 *                             maximum: 100
 *                           matchType:
 *                             type: string
 *                             enum: [strong, moderate, weak, no_match]
 *                           breakdown:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 criterion:
 *                                   type: string
 *                                 passed:
 *                                   type: boolean
 *                                 details:
 *                                   type: string
 *       404:
 *         description: Property not found
 *       500:
 *         description: Server error
 */
router.get('/match/:propertyId', matchPropertiesToBuyBoxes);

/**
 * @swagger
 * /api/hedgefunds/buybox/import:
 *   post:
 *     summary: Import buy box from document
 *     description: Upload a document (PDF, image) and extract buy box criteria using AI
 *     tags: [Hedge Funds]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - document
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *                 description: Buy box document (PNG, JPG, PDF)
 *     responses:
 *       200:
 *         description: Buy box imported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 action:
 *                   type: string
 *                   enum: [created, updated]
 *                 buyBoxId:
 *                   type: string
 *                 buyBoxName:
 *                   type: string
 *                 extracted:
 *                   type: object
 *                   properties:
 *                     fundName:
 *                       type: string
 *                     confidence:
 *                       type: number
 *                     extractedFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Invalid file or extraction failed
 *       500:
 *         description: Server error
 */
router.post('/buybox/import', upload.single('document'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No document uploaded',
      });
    }

    const result = await buyBoxImportService.importFromDocument(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
        extracted: result.extracted,
      });
    }

    return res.json({
      success: true,
      action: result.action,
      buyBoxId: result.buyBoxId,
      buyBoxName: result.buyBoxName,
      message: result.message,
      extracted: {
        fundName: result.extracted.fundName,
        fundType: result.extracted.fundType,
        confidence: result.extracted.confidence,
        extractedFields: result.extracted.extractedFields,
        warnings: result.extracted.warnings,
        contactsFound: result.extracted.marketContacts?.length || 0,
        criteriaFields: Object.keys(result.extracted.criteria),
      },
    });
  } catch (error: any) {
    console.error('Buy box import error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to import buy box',
    });
  }
});

export default router;
