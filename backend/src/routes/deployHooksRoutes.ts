/**
 * Deploy Hooks Routes
 *
 * API routes for managing Vercel/Netlify/custom deploy hooks.
 */

import { Router } from 'express';
import deployHooksController from '../controllers/deployHooksController';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Deploy Hooks
 *   description: Vercel/Netlify/custom deployment hook management
 */

// ============================================================================
// HOOK CRUD
// ============================================================================

/**
 * @swagger
 * /api/deploy-hooks:
 *   post:
 *     summary: Create a new deploy hook
 *     description: |
 *       Create a deploy hook for automatic deployments when tasks complete or PRs are merged.
 *
 *       Supported providers:
 *       - **vercel**: Vercel Deploy Hooks (paste from Project Settings > Git > Deploy Hooks)
 *       - **netlify**: Netlify Build Hooks (paste from Site Settings > Build & Deploy > Build hooks)
 *       - **custom**: Any webhook URL that accepts POST requests
 *     tags: [Deploy Hooks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - name
 *               - provider
 *               - webhookUrl
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *               name:
 *                 type: string
 *                 description: Display name for the hook
 *                 example: "Production Deploy"
 *               provider:
 *                 type: string
 *                 enum: [vercel, netlify, custom]
 *               webhookUrl:
 *                 type: string
 *                 description: The deploy hook URL from your provider
 *               environment:
 *                 type: string
 *                 enum: [preview, production]
 *                 default: preview
 *               triggers:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [task_completed, pr_merged, manual]
 *                 default: [task_completed]
 *                 description: Events that trigger this hook
 *               branchFilter:
 *                 type: string
 *                 description: Only trigger for branches matching this pattern (glob)
 *                 example: "feature/*"
 *               labelFilter:
 *                 type: string
 *                 description: Only trigger when task has this label
 *                 example: "deploy"
 *               providerConfig:
 *                 type: object
 *                 description: Provider-specific configuration
 *                 properties:
 *                   customMethod:
 *                     type: string
 *                     enum: [GET, POST, PUT]
 *                     default: POST
 *                   customHeaders:
 *                     type: object
 *                     additionalProperties:
 *                       type: string
 *     responses:
 *       200:
 *         description: Hook created
 *       400:
 *         description: Invalid input
 */
router.post('/', deployHooksController.createHook);

/**
 * @swagger
 * /api/deploy-hooks:
 *   get:
 *     summary: Get all deploy hooks
 *     tags: [Deploy Hooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project
 *     responses:
 *       200:
 *         description: List of hooks
 */
router.get('/', deployHooksController.getHooks);

/**
 * @swagger
 * /api/deploy-hooks/{id}:
 *   get:
 *     summary: Get a single hook
 *     tags: [Deploy Hooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Hook details
 *       404:
 *         description: Hook not found
 */
router.get('/:id', deployHooksController.getHook);

/**
 * @swagger
 * /api/deploy-hooks/{id}:
 *   put:
 *     summary: Update a hook
 *     tags: [Deploy Hooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               webhookUrl:
 *                 type: string
 *               environment:
 *                 type: string
 *                 enum: [preview, production]
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *               triggers:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [task_completed, pr_merged, manual]
 *               branchFilter:
 *                 type: string
 *                 nullable: true
 *               labelFilter:
 *                 type: string
 *                 nullable: true
 *               providerConfig:
 *                 type: object
 *     responses:
 *       200:
 *         description: Hook updated
 *       404:
 *         description: Hook not found
 */
router.put('/:id', deployHooksController.updateHook);

/**
 * @swagger
 * /api/deploy-hooks/{id}:
 *   delete:
 *     summary: Delete a hook
 *     tags: [Deploy Hooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Hook deleted
 *       404:
 *         description: Hook not found
 */
router.delete('/:id', deployHooksController.deleteHook);

// ============================================================================
// HOOK ACTIONS
// ============================================================================

/**
 * @swagger
 * /api/deploy-hooks/{id}/toggle:
 *   post:
 *     summary: Toggle hook status (active/inactive)
 *     description: |
 *       Toggle a hook between active and inactive states.
 *       Also resets consecutive failure count when re-enabling.
 *     tags: [Deploy Hooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Hook toggled
 *       404:
 *         description: Hook not found
 */
router.post('/:id/toggle', deployHooksController.toggleHook);

/**
 * @swagger
 * /api/deploy-hooks/{id}/trigger:
 *   post:
 *     summary: Manually trigger a deployment
 *     description: |
 *       Manually trigger a deployment via this hook.
 *       Returns the deployment result from the provider.
 *     tags: [Deploy Hooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deployment triggered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 deploymentId:
 *                   type: string
 *                 deploymentUrl:
 *                   type: string
 *                 error:
 *                   type: string
 *                 provider:
 *                   type: string
 *                   enum: [vercel, netlify, custom]
 */
router.post('/:id/trigger', deployHooksController.triggerHook);

/**
 * @swagger
 * /api/deploy-hooks/{id}/test:
 *   post:
 *     summary: Test hook connection
 *     description: |
 *       Test if the webhook URL is reachable without triggering an actual deployment.
 *       Uses a HEAD request to check endpoint availability.
 *     tags: [Deploy Hooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.post('/:id/test', deployHooksController.testHook);

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * @swagger
 * /api/deploy-hooks/stats/{projectId}:
 *   get:
 *     summary: Get deployment statistics for a project
 *     description: |
 *       Returns aggregated deployment statistics across all hooks for a project.
 *       Includes total deploys, success rate, and active hook count.
 *     tags: [Deploy Hooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalHooks:
 *                   type: integer
 *                 activeHooks:
 *                   type: integer
 *                 totalDeploys:
 *                   type: integer
 *                 successfulDeploys:
 *                   type: integer
 *                 failedDeploys:
 *                   type: integer
 *                 overallSuccessRate:
 *                   type: number
 *                   description: Percentage (0-100)
 */
router.get('/stats/:projectId', deployHooksController.getProjectStats);

export default router;
