/**
 * Inquiry Routes
 *
 * API endpoints for the buyer-seller inquiry system.
 *
 * Buyer endpoints:
 * - GET /api/inquiries/mine - Get my inquiries
 * - DELETE /api/inquiries/:id - Cancel my inquiry
 *
 * Admin/Seller endpoints:
 * - GET /api/inquiries - Get all pending inquiries
 * - GET /api/inquiries/property/:propertyId - Get inquiries for a property
 * - GET /api/inquiries/:id - Get specific inquiry
 * - POST /api/inquiries/:id/answer - Answer an inquiry
 * - GET /api/inquiries/stats - Get inquiry statistics
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../middleware/auth';
import { inquiryController } from '../controllers/inquiryController';

// Roles that can manage inquiries (view all, answer)
const INQUIRY_MANAGER_ROLES = ['admin', 'super_admin', 'seller', 'broker'];

const router = Router();

// Rate limiter for answer endpoint
const answerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 answers per minute
  message: { success: false, error: 'Too many requests. Please slow down.' },
});

/**
 * @swagger
 * tags:
 *   name: Inquiries
 *   description: Buyer-seller inquiry management
 */

// ============================================================================
// BUYER ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/inquiries/mine:
 *   get:
 *     summary: Get my inquiries
 *     description: Get all inquiries submitted by the authenticated buyer
 *     tags: [Inquiries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, answered, expired, cancelled]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of inquiries
 */
router.get('/mine', authenticate, inquiryController.getMyInquiries);

/**
 * @swagger
 * /api/inquiries/{id}/cancel:
 *   delete:
 *     summary: Cancel my inquiry
 *     description: Cancel a pending inquiry (buyer can only cancel their own)
 *     tags: [Inquiries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Inquiry cancelled
 */
router.delete('/:id/cancel', authenticate, inquiryController.cancelInquiry);

// ============================================================================
// ADMIN/SELLER ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/inquiries/stats:
 *   get:
 *     summary: Get inquiry statistics
 *     description: Get statistics about inquiries (admin)
 *     tags: [Inquiries]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inquiry statistics
 *       403:
 *         description: Forbidden - requires admin/seller role
 */
router.get('/stats', authenticate, authorize(...INQUIRY_MANAGER_ROLES), inquiryController.getStats);

/**
 * @swagger
 * /api/inquiries:
 *   get:
 *     summary: Get all pending inquiries
 *     description: Get all pending inquiries for admin/seller review
 *     tags: [Inquiries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, normal, high, urgent]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [seller_motivation, property_condition, property_history, closing_terms, inclusions, pricing, other]
 *     responses:
 *       200:
 *         description: List of pending inquiries
 *       403:
 *         description: Forbidden - requires admin/seller role
 */
router.get('/', authenticate, authorize(...INQUIRY_MANAGER_ROLES), inquiryController.getPendingInquiries);

/**
 * @swagger
 * /api/inquiries/property/{propertyId}:
 *   get:
 *     summary: Get inquiries for a property
 *     description: Get all pending inquiries for a specific property
 *     tags: [Inquiries]
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
 *         description: List of inquiries for the property
 *       403:
 *         description: Forbidden - requires admin/seller role
 */
router.get('/property/:propertyId', authenticate, authorize(...INQUIRY_MANAGER_ROLES), inquiryController.getPropertyInquiries);

/**
 * @swagger
 * /api/inquiries/{id}:
 *   get:
 *     summary: Get a specific inquiry
 *     description: Get details of a specific inquiry
 *     tags: [Inquiries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Inquiry details
 *       403:
 *         description: Forbidden - requires admin/seller role
 *       404:
 *         description: Inquiry not found
 */
router.get('/:id', authenticate, authorize(...INQUIRY_MANAGER_ROLES), inquiryController.getInquiry);

/**
 * @swagger
 * /api/inquiries/{id}/answer:
 *   post:
 *     summary: Answer an inquiry
 *     description: Seller/admin answers a buyer's inquiry. The response is automatically injected into the buyer's conversation and they are notified.
 *     tags: [Inquiries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
 *                 description: The answer to the buyer's question
 *                 example: "The seller is relocating for work and needs to close within 45 days."
 *               role:
 *                 type: string
 *                 enum: [seller, admin, broker]
 *                 default: admin
 *                 description: Role of the person answering
 *     responses:
 *       200:
 *         description: Inquiry answered successfully
 *       400:
 *         description: Invalid request or inquiry not pending
 *       403:
 *         description: Forbidden - requires admin/seller role
 */
router.post('/:id/answer', authenticate, authorize(...INQUIRY_MANAGER_ROLES), answerLimiter, inquiryController.answerInquiry);

// ============================================================================
// BULK ACTIONS (Admin only)
// ============================================================================

/**
 * @swagger
 * /api/inquiries/bulk/answer:
 *   post:
 *     summary: Bulk answer inquiries
 *     description: Answer multiple inquiries with the same response (for common questions)
 *     tags: [Inquiries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inquiryIds
 *               - response
 *             properties:
 *               inquiryIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               response:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bulk answer result
 */
router.post('/bulk/answer', authenticate, authorize('admin', 'super_admin'), inquiryController.bulkAnswerInquiries);

/**
 * @swagger
 * /api/inquiries/bulk/cancel:
 *   post:
 *     summary: Bulk cancel inquiries
 *     description: Cancel multiple pending inquiries (admin only)
 *     tags: [Inquiries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inquiryIds
 *             properties:
 *               inquiryIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Bulk cancel result
 */
router.post('/bulk/cancel', authenticate, authorize('admin', 'super_admin'), inquiryController.bulkCancelInquiries);

// ============================================================================
// ANALYTICS (Admin only)
// ============================================================================

/**
 * @swagger
 * /api/inquiries/analytics:
 *   get:
 *     summary: Get inquiry analytics
 *     description: Get detailed analytics about inquiries
 *     tags: [Inquiries]
 *     security:
 *       - bearerAuth: []
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
 *         description: Analytics data
 */
router.get('/analytics', authenticate, authorize('admin', 'super_admin'), inquiryController.getAnalytics);

export default router;
