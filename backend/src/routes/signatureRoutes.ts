import { Router } from 'express';
import multer from 'multer';
import { signatureController } from '../controllers/signatureController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Configure multer for memory storage (file stored in buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// ===========================================================================
// PUBLIC ROUTES (no auth required - token-based)
// ===========================================================================

/**
 * @swagger
 * /api/signatures/request/{token}:
 *   get:
 *     summary: Get signature request details by token
 *     description: Public endpoint to validate and get details of a signature request
 *     tags: [Signatures]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The signature request token
 *     responses:
 *       200:
 *         description: Request details
 *       404:
 *         description: Invalid or expired token
 */
router.get('/request/:token', signatureController.getRequestByToken);

/**
 * @swagger
 * /api/signatures/upload/{token}:
 *   post:
 *     summary: Upload and process signature
 *     description: Public endpoint to upload a signature image for processing
 *     tags: [Signatures]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The signature request token
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The signature image file
 *               cleanupStrength:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Background removal strength (0-100, default 50)
 *     responses:
 *       200:
 *         description: Signature processed successfully
 *       400:
 *         description: Invalid request or processing failed
 */
router.post('/upload/:token', upload.single('file'), signatureController.uploadSignature);

// ===========================================================================
// PROTECTED ROUTES (auth required)
// These are mounted under /api/contacts/:id in the main app
// ===========================================================================

// Note: These routes are added to contactRoutes.ts instead of here
// to keep contact-related operations together

export default router;

// ===========================================================================
// ADDITIONAL EXPORTS FOR USE IN contactRoutes.ts
// ===========================================================================

export const signatureContactRoutes = {
  /**
   * Request a signature from a contact
   * POST /api/contacts/:id/request-signature
   */
  requestSignature: signatureController.requestSignature,

  /**
   * Get a contact's signature
   * GET /api/contacts/:id/signature
   */
  getContactSignature: signatureController.getContactSignature,

  /**
   * Delete a contact's signature
   * DELETE /api/contacts/:id/signature
   */
  deleteContactSignature: signatureController.deleteContactSignature,

  /**
   * Get pending signature request
   * GET /api/contacts/:id/signature-request
   */
  getPendingRequest: signatureController.getPendingRequest,
};
