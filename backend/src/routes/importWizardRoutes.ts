/**
 * Import Wizard Routes
 * API endpoints for the data import wizard feature
 *
 * SECURITY:
 * - Authentication required for all endpoints
 * - File upload with multer middleware
 */

import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import rateLimit from 'express-rate-limit';
import * as importWizardController from '../controllers/importWizardController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Ensure upload directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'imports');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `import-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not supported. Allowed types: ${allowedExtensions.join(', ')}`));
    }
  },
});

// Rate limiting
const importLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication and rate limiting to all routes
router.use(authenticate);
router.use(importLimiter);

// ============================================================================
// IMPORT WIZARD ROUTES
// ============================================================================

/**
 * @swagger
 * /api/import-wizard/fields/{importType}:
 *   get:
 *     summary: Get target fields for an import type
 *     tags: [Import Wizard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: importType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [deals, buyers]
 *     responses:
 *       200:
 *         description: List of target fields
 */
router.get('/fields/:importType', importWizardController.getTargetFields);

/**
 * @swagger
 * /api/import-wizard/upload:
 *   post:
 *     summary: Upload and parse a file for import
 *     tags: [Import Wizard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - importType
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               importType:
 *                 type: string
 *                 enum: [deals, buyers]
 *     responses:
 *       200:
 *         description: File parsed successfully
 */
router.post('/upload', upload.single('file'), importWizardController.uploadFile);

/**
 * @swagger
 * /api/import-wizard/session/{sessionId}:
 *   get:
 *     summary: Get current session status and data
 *     tags: [Import Wizard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session data
 *       404:
 *         description: Session not found
 */
router.get('/session/:sessionId', importWizardController.getSession);

/**
 * @swagger
 * /api/import-wizard/session/{sessionId}/mappings:
 *   put:
 *     summary: Update field mappings for a session
 *     tags: [Import Wizard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
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
 *               - mappings
 *             properties:
 *               mappings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     sourceColumn:
 *                       type: string
 *                     targetField:
 *                       type: string
 *     responses:
 *       200:
 *         description: Mappings updated
 */
router.put('/session/:sessionId/mappings', importWizardController.updateMappings);

/**
 * @swagger
 * /api/import-wizard/session/{sessionId}/preview:
 *   get:
 *     summary: Generate preview with validation
 *     tags: [Import Wizard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
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
 *         description: Preview data with validation
 */
router.get('/session/:sessionId/preview', importWizardController.getPreview);

/**
 * @swagger
 * /api/import-wizard/session/{sessionId}/duplicates:
 *   get:
 *     summary: Detect duplicates in import data
 *     tags: [Import Wizard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Duplicate detection results
 */
router.get('/session/:sessionId/duplicates', importWizardController.detectDuplicates);

/**
 * @swagger
 * /api/import-wizard/session/{sessionId}/duplicates:
 *   put:
 *     summary: Update duplicate handling actions
 *     tags: [Import Wizard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
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
 *               - actions
 *             properties:
 *               actions:
 *                 type: object
 *                 description: Map of row numbers to actions (skip, update, create_new)
 *     responses:
 *       200:
 *         description: Actions updated
 */
router.put('/session/:sessionId/duplicates', importWizardController.updateDuplicateActions);

/**
 * @swagger
 * /api/import-wizard/session/{sessionId}/commit:
 *   post:
 *     summary: Commit the import and create records
 *     tags: [Import Wizard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Import completed
 */
router.post('/session/:sessionId/commit', importWizardController.commitImport);

/**
 * @swagger
 * /api/import-wizard/session/{sessionId}:
 *   delete:
 *     summary: Cancel and delete an import session
 *     tags: [Import Wizard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session cancelled
 */
router.delete('/session/:sessionId', importWizardController.cancelImport);

export default router;
