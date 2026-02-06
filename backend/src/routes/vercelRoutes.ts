/**
 * Vercel Routes
 *
 * API endpoints for Vercel project management:
 * - Project CRUD
 * - Environment variable management
 * - Deployment listing and triggering
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import vercelController from '../controllers/vercelController';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Vercel
 *   description: Vercel project and deployment management
 */

// ============================================================================
// STATUS
// ============================================================================

/**
 * @swagger
 * /api/vercel/status:
 *   get:
 *     summary: Get Vercel integration status
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Integration status
 */
router.get('/status', vercelController.getStatus);

// ============================================================================
// PROJECTS
// ============================================================================

/**
 * @swagger
 * /api/vercel/projects:
 *   get:
 *     summary: List Vercel projects
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of projects
 */
router.get('/projects', vercelController.listProjects);

/**
 * @swagger
 * /api/vercel/projects:
 *   post:
 *     summary: Create a new Vercel project
 *     tags: [Vercel]
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
 *             properties:
 *               name:
 *                 type: string
 *               framework:
 *                 type: string
 *                 enum: [nextjs, react, vue, nuxtjs, svelte, gatsby, angular, remix, astro, hugo]
 *               gitRepository:
 *                 type: object
 *                 properties:
 *                   repo:
 *                     type: string
 *                     description: "GitHub repo in format owner/repo"
 *                   type:
 *                     type: string
 *                     default: github
 *               buildCommand:
 *                 type: string
 *               installCommand:
 *                 type: string
 *               rootDirectory:
 *                 type: string
 *     responses:
 *       200:
 *         description: Created project
 */
router.post('/projects', vercelController.createProject);

/**
 * @swagger
 * /api/vercel/projects/{idOrName}:
 *   get:
 *     summary: Get a Vercel project
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project details
 */
router.get('/projects/:idOrName', vercelController.getProject);

/**
 * @swagger
 * /api/vercel/projects/{idOrName}:
 *   delete:
 *     summary: Delete a Vercel project
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project deleted
 */
router.delete('/projects/:idOrName', vercelController.deleteProject);

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

/**
 * @swagger
 * /api/vercel/projects/{idOrName}/env:
 *   get:
 *     summary: List environment variables for a project
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Environment variables
 */
router.get('/projects/:idOrName/env', vercelController.getEnvVars);

/**
 * @swagger
 * /api/vercel/projects/{idOrName}/env:
 *   post:
 *     summary: Create an environment variable
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
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
 *               - key
 *               - value
 *               - target
 *             properties:
 *               key:
 *                 type: string
 *               value:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [plain, encrypted, secret, sensitive]
 *                 default: encrypted
 *               target:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [production, preview, development]
 *               gitBranch:
 *                 type: string
 *     responses:
 *       200:
 *         description: Created environment variable
 */
router.post('/projects/:idOrName/env', vercelController.createEnvVar);

/**
 * @swagger
 * /api/vercel/projects/{idOrName}/env/{envId}:
 *   patch:
 *     summary: Update an environment variable
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: envId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated environment variable
 */
router.patch('/projects/:idOrName/env/:envId', vercelController.updateEnvVar);

/**
 * @swagger
 * /api/vercel/projects/{idOrName}/env/{envId}:
 *   delete:
 *     summary: Delete an environment variable
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: envId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Environment variable deleted
 */
router.delete('/projects/:idOrName/env/:envId', vercelController.deleteEnvVar);

// ============================================================================
// DEPLOYMENTS
// ============================================================================

/**
 * @swagger
 * /api/vercel/projects/{idOrName}/deployments:
 *   get:
 *     summary: List deployments for a project
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
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
 *         description: List of deployments
 */
router.get('/projects/:idOrName/deployments', vercelController.listDeployments);

/**
 * @swagger
 * /api/vercel/projects/{idOrName}/deployments:
 *   post:
 *     summary: Create a new deployment
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               target:
 *                 type: string
 *                 enum: [production, preview]
 *                 default: production
 *               gitBranch:
 *                 type: string
 *                 default: main
 *     responses:
 *       200:
 *         description: Deployment created
 */
router.post('/projects/:idOrName/deployments', vercelController.createDeployment);

// ============================================================================
// DOMAINS
// ============================================================================

/**
 * @swagger
 * /api/vercel/projects/{idOrName}/domains:
 *   get:
 *     summary: List domains for a project
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of domains
 */
router.get('/projects/:idOrName/domains', vercelController.getDomains);

/**
 * @swagger
 * /api/vercel/projects/{idOrName}/domains:
 *   post:
 *     summary: Add a domain to a project
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Domain name (e.g. example.com)
 *               gitBranch:
 *                 type: string
 *               redirect:
 *                 type: string
 *               redirectStatusCode:
 *                 type: integer
 *                 enum: [301, 302, 307, 308]
 *     responses:
 *       200:
 *         description: Domain added
 */
router.post('/projects/:idOrName/domains', vercelController.addDomain);

/**
 * @swagger
 * /api/vercel/projects/{idOrName}/domains/{domain}:
 *   get:
 *     summary: Get domain details
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Domain details
 */
router.get('/projects/:idOrName/domains/:domain', vercelController.getDomain);

/**
 * @swagger
 * /api/vercel/projects/{idOrName}/domains/{domain}:
 *   delete:
 *     summary: Remove a domain from a project
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Domain removed
 */
router.delete('/projects/:idOrName/domains/:domain', vercelController.removeDomain);

/**
 * @swagger
 * /api/vercel/projects/{idOrName}/domains/{domain}/verify:
 *   post:
 *     summary: Verify a domain
 *     tags: [Vercel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Domain verification result
 */
router.post('/projects/:idOrName/domains/:domain/verify', vercelController.verifyDomain);

export default router;
