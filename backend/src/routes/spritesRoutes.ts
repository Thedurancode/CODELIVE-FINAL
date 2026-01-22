/**
 * Sprites Routes
 *
 * API routes for Sprites integration (persistent Linux environments).
 * Provides endpoints for sprite lifecycle, checkpoints, sessions, and configuration.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as spritesController from '../controllers/spritesController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limiting for sprite operations (more restrictive due to resource usage)
const spritesLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Lower limit due to external API calls
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication and rate limiting to all routes
router.use(authenticate);
router.use(spritesLimiter);

// ============================================================================
// SWAGGER DOCUMENTATION
// ============================================================================

/**
 * @swagger
 * tags:
 *   name: Sprites
 *   description: Sprites integration - persistent Linux environments with Claude Code
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Sprite:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         projectId:
 *           type: string
 *           format: uuid
 *         organizationId:
 *           type: string
 *           format: uuid
 *         spriteName:
 *           type: string
 *         spriteId:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [creating, initializing, running, hibernating, stopped, checkpointing, restoring, error, deleted]
 *         statusMessage:
 *           type: string
 *           nullable: true
 *         repoUrl:
 *           type: string
 *         branch:
 *           type: string
 *         workingDirectory:
 *           type: string
 *         claudeConfigured:
 *           type: boolean
 *         urlSettings:
 *           type: object
 *           nullable: true
 *         lastCheckpointId:
 *           type: string
 *           nullable: true
 *         lastCheckpointAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         checkpointCount:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     Checkpoint:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         comment:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *     ExecSession:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         status:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 */

// ============================================================================
// CONFIGURATION (must come before /:id routes to avoid matching)
// ============================================================================

/**
 * @swagger
 * /api/sprites/config:
 *   get:
 *     summary: Get Sprites configuration status
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration status
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
 *                     configured:
 *                       type: boolean
 *                       description: Whether API token is set
 *                     activeSpritesCount:
 *                       type: integer
 *                     serviceReady:
 *                       type: boolean
 */
router.get('/config', spritesController.getSpritesConfig);

/**
 * @swagger
 * /api/sprites/config/token:
 *   post:
 *     summary: Set Sprites API token
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Sprites API token
 *     responses:
 *       200:
 *         description: Token configured
 *       400:
 *         description: Token required
 */
router.post('/config/token', spritesController.setSpritesToken);

/**
 * @swagger
 * /api/sprites/config/token:
 *   delete:
 *     summary: Remove Sprites API token
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token removed
 */
router.delete('/config/token', spritesController.removeSpritesToken);

// ============================================================================
// SPRITES CRUD
// ============================================================================

/**
 * @swagger
 * /api/sprites:
 *   get:
 *     summary: List all sprites for the organization
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include deleted sprites
 *     responses:
 *       200:
 *         description: List of sprites
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
 *                     $ref: '#/components/schemas/Sprite'
 */
router.get('/', spritesController.listSprites);

/**
 * @swagger
 * /api/sprites/project/{projectId}:
 *   get:
 *     summary: Get sprite for a specific project
 *     tags: [Sprites]
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
 *         description: Sprite for project (null if none)
 *       404:
 *         description: Project not found
 */
router.get('/project/:projectId', spritesController.getSpriteByProject);

/**
 * @swagger
 * /api/sprites:
 *   post:
 *     summary: Create a new sprite for a project
 *     tags: [Sprites]
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
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *               branch:
 *                 type: string
 *                 default: main
 *               initScript:
 *                 type: string
 *                 description: Custom initialization script
 *               cpus:
 *                 type: integer
 *                 default: 2
 *               memoryMb:
 *                 type: integer
 *                 default: 4096
 *     responses:
 *       201:
 *         description: Sprite created
 *       400:
 *         description: Project already has active sprite or no GitHub URL
 *       404:
 *         description: Project not found
 */
router.post('/', spritesController.createSprite);

/**
 * @swagger
 * /api/sprites/{id}:
 *   get:
 *     summary: Get a specific sprite by ID
 *     tags: [Sprites]
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
 *         description: Sprite details
 *       404:
 *         description: Sprite not found
 */
router.get('/:id', spritesController.getSprite);

/**
 * @swagger
 * /api/sprites/{id}:
 *   delete:
 *     summary: Delete a sprite
 *     tags: [Sprites]
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
 *         description: Sprite deleted
 *       404:
 *         description: Sprite not found
 */
router.delete('/:id', spritesController.deleteSprite);

/**
 * @swagger
 * /api/sprites/{id}/stop:
 *   post:
 *     summary: Stop a running sprite
 *     tags: [Sprites]
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
 *         description: Sprite stopped
 *       404:
 *         description: Sprite not found
 */
router.post('/:id/stop', spritesController.stopSprite);

/**
 * @swagger
 * /api/sprites/{id}/resume:
 *   post:
 *     summary: Resume a stopped or hibernating sprite
 *     tags: [Sprites]
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
 *         description: Sprite resumed
 *       400:
 *         description: Sprite cannot be resumed
 *       404:
 *         description: Sprite not found
 */
router.post('/:id/resume', spritesController.resumeSprite);

// ============================================================================
// CHECKPOINTS
// ============================================================================

/**
 * @swagger
 * /api/sprites/{id}/checkpoints:
 *   post:
 *     summary: Create a checkpoint for a sprite
 *     tags: [Sprites]
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
 *               comment:
 *                 type: string
 *                 description: Optional description for the checkpoint
 *     responses:
 *       201:
 *         description: Checkpoint created
 *       400:
 *         description: Sprite not active
 *       404:
 *         description: Sprite not found
 */
router.post('/:id/checkpoints', spritesController.createCheckpoint);

/**
 * @swagger
 * /api/sprites/{id}/checkpoints:
 *   get:
 *     summary: List checkpoints for a sprite
 *     tags: [Sprites]
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
 *         description: List of checkpoints
 *       404:
 *         description: Sprite not found
 */
router.get('/:id/checkpoints', spritesController.listCheckpoints);

/**
 * @swagger
 * /api/sprites/{id}/checkpoints/{checkpointId}/restore:
 *   post:
 *     summary: Restore a sprite from checkpoint
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: checkpointId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Checkpoint restored
 *       404:
 *         description: Sprite or checkpoint not found
 */
router.post('/:id/checkpoints/:checkpointId/restore', spritesController.restoreCheckpoint);

// ============================================================================
// SESSIONS
// ============================================================================

/**
 * @swagger
 * /api/sprites/{id}/sessions:
 *   get:
 *     summary: List exec sessions for a sprite
 *     tags: [Sprites]
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
 *         description: List of sessions
 *       404:
 *         description: Sprite not found
 */
router.get('/:id/sessions', spritesController.listSessions);

/**
 * @swagger
 * /api/sprites/{id}/terminal:
 *   get:
 *     summary: Get WebSocket connection info for terminal
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: cols
 *         schema:
 *           type: integer
 *           default: 80
 *       - in: query
 *         name: rows
 *         schema:
 *           type: integer
 *           default: 24
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *         description: Optional session ID to resume
 *     responses:
 *       200:
 *         description: WebSocket connection info
 *       400:
 *         description: Sprite not active
 *       404:
 *         description: Sprite not found
 */
router.get('/:id/terminal', spritesController.getTerminalInfo);

export default router;
