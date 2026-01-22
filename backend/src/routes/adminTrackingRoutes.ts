/**
 * Admin Tracking Routes
 * API routes for search tracking and session analytics
 */

import { Router } from 'express';
import * as adminTrackingController from '../controllers/adminTrackingController';
import { authenticate } from '../middleware/auth';

const router = Router();

// ============================================================================
// SEARCH TRACKING
// ============================================================================

/**
 * @swagger
 * /api/admin/tracking/search/{userId}:
 *   post:
 *     summary: Log a search query
 *     description: Track when a user performs a search
 *     tags: [Admin - Search Tracking]
 *     security:
 *       - bearerAuth: []
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
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The search query
 *               filters:
 *                 type: object
 *                 description: Applied filters
 *               resultsCount:
 *                 type: integer
 *                 description: Number of results returned
 *               searchDuration:
 *                 type: integer
 *                 description: Time to perform search in ms
 *               source:
 *                 type: string
 *                 enum: [marketplace, deals, buyers, contacts, global]
 *     responses:
 *       201:
 *         description: Search logged
 */
router.post('/search/:userId', authenticate, adminTrackingController.logSearch);

/**
 * @swagger
 * /api/admin/tracking/search/{searchId}/click:
 *   post:
 *     summary: Track a search result click
 *     description: Track when a user clicks on a search result
 *     tags: [Admin - Search Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: searchId
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
 *               - resultId
 *             properties:
 *               resultId:
 *                 type: string
 *               position:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Click tracked
 */
router.post('/search/:searchId/click', authenticate, adminTrackingController.trackSearchClick);

/**
 * @swagger
 * /api/admin/tracking/search/analytics:
 *   get:
 *     summary: Get search analytics
 *     description: Get comprehensive search analytics
 *     tags: [Admin - Search Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Search analytics
 */
router.get('/search/analytics', authenticate, adminTrackingController.getSearchAnalytics);

/**
 * @swagger
 * /api/admin/tracking/search/popular:
 *   get:
 *     summary: Get popular searches
 *     description: Get most popular search terms
 *     tags: [Admin - Search Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Popular searches
 */
router.get('/search/popular', authenticate, adminTrackingController.getPopularSearches);

/**
 * @swagger
 * /api/admin/tracking/search/zero-results:
 *   get:
 *     summary: Get zero-result searches
 *     description: Get searches that returned no results
 *     tags: [Admin - Search Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Zero-result searches
 */
router.get('/search/zero-results', authenticate, adminTrackingController.getZeroResultSearches);

/**
 * @swagger
 * /api/admin/tracking/search/users/{userId}/history:
 *   get:
 *     summary: Get user's search history
 *     description: Get a user's search history
 *     tags: [Admin - Search Tracking]
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
 *           default: 50
 *     responses:
 *       200:
 *         description: User search history
 */
router.get('/search/users/:userId/history', authenticate, adminTrackingController.getUserSearchHistory);

// ============================================================================
// SESSION TRACKING
// ============================================================================

/**
 * @swagger
 * /api/admin/tracking/sessions/{userId}/start:
 *   post:
 *     summary: Start a session
 *     description: Track session start on login
 *     tags: [Admin - Session Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Session started
 */
router.post('/sessions/:userId/start', authenticate, adminTrackingController.startSession);

/**
 * @swagger
 * /api/admin/tracking/sessions/{sessionId}/end:
 *   post:
 *     summary: End a session
 *     description: Track session end on logout
 *     tags: [Admin - Session Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [logout, timeout, forced, token_expired]
 *     responses:
 *       200:
 *         description: Session ended
 */
router.post('/sessions/:sessionId/end', authenticate, adminTrackingController.endSession);

/**
 * @swagger
 * /api/admin/tracking/sessions/{sessionId}/activity:
 *   post:
 *     summary: Update session activity
 *     description: Heartbeat to track session activity
 *     tags: [Admin - Session Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               incrementPages:
 *                 type: boolean
 *               incrementActions:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Activity updated
 */
router.post('/sessions/:sessionId/activity', authenticate, adminTrackingController.updateSessionActivity);

/**
 * @swagger
 * /api/admin/tracking/sessions/analytics:
 *   get:
 *     summary: Get session analytics
 *     description: Get comprehensive session analytics
 *     tags: [Admin - Session Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Session analytics
 */
router.get('/sessions/analytics', authenticate, adminTrackingController.getSessionAnalytics);

/**
 * @swagger
 * /api/admin/tracking/sessions/active:
 *   get:
 *     summary: Get active sessions
 *     description: Get all currently active sessions
 *     tags: [Admin - Session Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *     responses:
 *       200:
 *         description: Active sessions
 */
router.get('/sessions/active', authenticate, adminTrackingController.getActiveSessions);

/**
 * @swagger
 * /api/admin/tracking/sessions/users/{userId}/history:
 *   get:
 *     summary: Get user's session history
 *     description: Get a user's session history
 *     tags: [Admin - Session Analytics]
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
 *           default: 50
 *     responses:
 *       200:
 *         description: User session history
 */
router.get('/sessions/users/:userId/history', authenticate, adminTrackingController.getUserSessionHistory);

/**
 * @swagger
 * /api/admin/tracking/sessions/users/{userId}/force-end:
 *   post:
 *     summary: Force end all user sessions
 *     description: Force end all active sessions for a user (security action)
 *     tags: [Admin - Session Analytics]
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
 *         description: Sessions ended
 */
router.post('/sessions/users/:userId/force-end', authenticate, adminTrackingController.forceEndUserSessions);

/**
 * @swagger
 * /api/admin/tracking/sessions/timeout:
 *   post:
 *     summary: Timeout inactive sessions
 *     description: Maintenance endpoint to timeout inactive sessions
 *     tags: [Admin - Session Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: minutes
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Timeout threshold in minutes
 *     responses:
 *       200:
 *         description: Sessions timed out
 */
router.post('/sessions/timeout', authenticate, adminTrackingController.timeoutInactiveSessions);

// ============================================================================
// COMBINED DASHBOARD
// ============================================================================

/**
 * @swagger
 * /api/admin/tracking/dashboard:
 *   get:
 *     summary: Get admin tracking dashboard
 *     description: Get combined search and session analytics for admin dashboard
 *     tags: [Admin - Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Dashboard data
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
 *                     search:
 *                       type: object
 *                       properties:
 *                         totalSearches:
 *                           type: integer
 *                         uniqueUsers:
 *                           type: integer
 *                         zeroResultRate:
 *                           type: number
 *                         popularSearches:
 *                           type: array
 *                     sessions:
 *                       type: object
 *                       properties:
 *                         totalSessions:
 *                           type: integer
 *                         activeSessions:
 *                           type: integer
 *                         avgSessionDuration:
 *                           type: integer
 *                         peakHours:
 *                           type: array
 */
router.get('/dashboard', authenticate, adminTrackingController.getDashboard);

export default router;
