/**
 * Activity Feed Routes
 *
 * API endpoints for the activity feed feature.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getActivityFeed,
  getActivityById,
  markAsRead,
  getUnreadCount,
  getStatistics,
  getFilterOptions,
  createActivity,
  cleanupActivities,
} from '../controllers/activityFeedController';
import { authenticate, optionalAuth } from '../middleware/auth';

const router = Router();

// Rate limiting for activity feed queries
const queryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: { error: 'Too many requests, please try again later' },
});

// Rate limiting for mutations
const mutationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { error: 'Too many requests, please try again later' },
});

/**
 * @swagger
 * /api/activity-feed:
 *   get:
 *     summary: Get activity feed
 *     description: Retrieve activity feed with optional filters and pagination
 *     tags: [Activity Feed]
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         description: Filter by organization
 *       - in: query
 *         name: eventTypes
 *         schema:
 *           type: string
 *         description: Comma-separated list of event types
 *       - in: query
 *         name: resourceTypes
 *         schema:
 *           type: string
 *         description: Comma-separated list of resource types
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *         description: Filter by actor ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for date range filter
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for date range filter
 *       - in: query
 *         name: importance
 *         schema:
 *           type: string
 *         description: Comma-separated list of importance levels
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: Activity feed retrieved successfully
 */
router.get('/', optionalAuth, queryLimiter, getActivityFeed);

/**
 * @swagger
 * /api/activity-feed/filter-options:
 *   get:
 *     summary: Get filter options
 *     description: Get available filter options for the activity feed
 *     tags: [Activity Feed]
 *     responses:
 *       200:
 *         description: Filter options retrieved successfully
 */
router.get('/filter-options', optionalAuth, queryLimiter, getFilterOptions);

/**
 * @swagger
 * /api/activity-feed/statistics:
 *   get:
 *     summary: Get activity statistics
 *     description: Get aggregated statistics for the activity feed
 *     tags: [Activity Feed]
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         required: true
 *         description: Organization ID
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Number of days to include in statistics
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/statistics', optionalAuth, queryLimiter, getStatistics);

/**
 * @swagger
 * /api/activity-feed/unread-count:
 *   get:
 *     summary: Get unread count
 *     description: Get the number of unread activities for the current user
 *     tags: [Activity Feed]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         required: true
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: Unread count retrieved successfully
 */
router.get('/unread-count', authenticate, queryLimiter, getUnreadCount);

/**
 * @swagger
 * /api/activity-feed/{id}:
 *   get:
 *     summary: Get activity by ID
 *     description: Retrieve a single activity entry by its ID
 *     tags: [Activity Feed]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Activity ID
 *     responses:
 *       200:
 *         description: Activity retrieved successfully
 *       404:
 *         description: Activity not found
 */
router.get('/:id', optionalAuth, queryLimiter, getActivityById);

/**
 * @swagger
 * /api/activity-feed/mark-read:
 *   post:
 *     summary: Mark activities as read
 *     description: Mark one or more activities as read for the current user
 *     tags: [Activity Feed]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               activityIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Activities marked as read
 */
router.post('/mark-read', authenticate, mutationLimiter, markAsRead);

/**
 * @swagger
 * /api/activity-feed:
 *   post:
 *     summary: Create activity
 *     description: Create a new activity entry (internal use)
 *     tags: [Activity Feed]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Activity created successfully
 */
router.post('/', authenticate, mutationLimiter, createActivity);

/**
 * @swagger
 * /api/activity-feed/cleanup:
 *   post:
 *     summary: Cleanup old activities
 *     description: Delete old activity entries (admin only)
 *     tags: [Activity Feed]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               daysToKeep:
 *                 type: integer
 *                 default: 90
 *     responses:
 *       200:
 *         description: Cleanup completed
 */
router.post('/cleanup', authenticate, mutationLimiter, cleanupActivities);

export default router;
