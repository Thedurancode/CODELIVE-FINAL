/**
 * Client Portal Routes
 *
 * Routes for client access to project activity (issues, PRs, commits).
 * Clients authenticate with email/password and can only access projects they're invited to.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { clientPortalController } from '../controllers/clientPortalController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: {
    success: false,
    error: 'Too many attempts',
    message: 'Please try again in 15 minutes',
  },
});

// =============================================================================
// PUBLIC ENDPOINTS (No Auth Required)
// =============================================================================

/**
 * @swagger
 * /api/client/invite/{token}:
 *   get:
 *     summary: Get invite details by token
 *     tags: [Client Portal]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite token
 *     responses:
 *       200:
 *         description: Invite details
 *       404:
 *         description: Invite not found
 */
router.get('/invite/:token', clientPortalController.getInviteDetails);

/**
 * @swagger
 * /api/client/invite/{token}/accept:
 *   post:
 *     summary: Accept invite and register as client
 *     tags: [Client Portal]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully registered and logged in
 *       400:
 *         description: Invalid invite or registration failed
 */
router.post('/invite/:token/accept', authLimiter, clientPortalController.acceptInvite);

// =============================================================================
// CLIENT AUTH ENDPOINTS (Authenticated Client Only)
// =============================================================================

/**
 * @swagger
 * /api/client/auth/me:
 *   get:
 *     summary: Get current client profile
 *     tags: [Client Portal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Client profile
 *       401:
 *         description: Not authenticated
 */
router.get('/auth/me', authenticate, clientPortalController.getClientProfile);

// =============================================================================
// CLIENT PORTAL ENDPOINTS (Authenticated Client)
// =============================================================================

/**
 * @swagger
 * /api/client/projects:
 *   get:
 *     summary: List all projects client has access to
 *     tags: [Client Portal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of projects
 *       401:
 *         description: Not authenticated
 */
router.get('/projects', authenticate, clientPortalController.getClientProjects);

/**
 * @swagger
 * /api/client/projects/{id}:
 *   get:
 *     summary: Get project details
 *     tags: [Client Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project details
 *       403:
 *         description: No access to this project
 *       404:
 *         description: Project not found
 */
router.get('/projects/:id', authenticate, clientPortalController.getProject);

/**
 * @swagger
 * /api/client/projects/{id}/issues:
 *   get:
 *     summary: Get project issues
 *     tags: [Client Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *           enum: [open, closed, all]
 *           default: all
 *         description: Filter by issue state
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of issues
 *       403:
 *         description: No access to this project
 */
router.get('/projects/:id/issues', authenticate, clientPortalController.getProjectIssues);

/**
 * @swagger
 * /api/client/projects/{id}/issues/{number}:
 *   get:
 *     summary: Get a single issue
 *     tags: [Client Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *       - in: path
 *         name: number
 *         required: true
 *         schema:
 *           type: integer
 *         description: Issue number
 *     responses:
 *       200:
 *         description: Issue details
 *       403:
 *         description: No access to this project
 *       404:
 *         description: Issue not found
 */
router.get('/projects/:id/issues/:number', authenticate, clientPortalController.getProjectIssue);

/**
 * @swagger
 * /api/client/projects/{id}/issues:
 *   post:
 *     summary: Submit a new issue
 *     tags: [Client Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Issue created
 *       400:
 *         description: Title is required
 *       403:
 *         description: No access to this project
 */
router.post('/projects/:id/issues', authenticate, clientPortalController.submitIssue);

/**
 * @swagger
 * /api/client/projects/{id}/prs:
 *   get:
 *     summary: Get project pull requests
 *     tags: [Client Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *           enum: [open, closed, all]
 *           default: all
 *         description: Filter by PR state
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of pull requests
 *       403:
 *         description: No access to this project
 */
router.get('/projects/:id/prs', authenticate, clientPortalController.getProjectPullRequests);

/**
 * @swagger
 * /api/client/projects/{id}/commits:
 *   get:
 *     summary: Get project commits
 *     tags: [Client Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of commits
 *       403:
 *         description: No access to this project
 */
router.get('/projects/:id/commits', authenticate, clientPortalController.getProjectCommits);

/**
 * @swagger
 * /api/client/projects/{id}/activity:
 *   get:
 *     summary: Get project activity feed
 *     tags: [Client Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum items to return
 *     responses:
 *       200:
 *         description: Activity feed
 *       403:
 *         description: No access to this project
 */
router.get('/projects/:id/activity', authenticate, clientPortalController.getProjectActivity);

export default router;
