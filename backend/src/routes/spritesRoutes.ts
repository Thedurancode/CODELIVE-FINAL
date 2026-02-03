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
import spriteChatRoutes from './spriteChatRoutes';

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
 *     SpriteService:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         command:
 *           type: string
 *         args:
 *           type: array
 *           items:
 *             type: string
 *         workingDir:
 *           type: string
 *         env:
 *           type: object
 *           additionalProperties:
 *             type: string
 *         status:
 *           type: string
 *           enum: [running, stopped, starting, stopping, error]
 *         pid:
 *           type: integer
 *           nullable: true
 *         port:
 *           type: integer
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         startedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         stoppedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         exitCode:
 *           type: integer
 *           nullable: true
 *         error:
 *           type: string
 *           nullable: true
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
// GITHUB TOKEN CONFIGURATION
// ============================================================================

/**
 * @swagger
 * /api/sprites/config/github:
 *   get:
 *     summary: Get GitHub token configuration status
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: GitHub configuration status
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
 *                       description: Whether GitHub token is set
 *                     tokenPrefix:
 *                       type: string
 *                       nullable: true
 *                       description: First 8 characters of token (for verification)
 */
router.get('/config/github', spritesController.getGitHubConfig);

/**
 * @swagger
 * /api/sprites/config/github:
 *   post:
 *     summary: Set GitHub Personal Access Token
 *     description: |
 *       Configure GitHub authentication for sprites. This allows sprites to:
 *       - Push commits to branches
 *       - Create pull requests
 *       - Access private repositories
 *
 *       Required token scopes: `repo`, `workflow`
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
 *                 description: GitHub Personal Access Token (classic or fine-grained)
 *     responses:
 *       200:
 *         description: Token configured
 *       400:
 *         description: Invalid token format
 */
router.post('/config/github', spritesController.setGitHubToken);

/**
 * @swagger
 * /api/sprites/config/github:
 *   delete:
 *     summary: Remove GitHub token
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token removed
 */
router.delete('/config/github', spritesController.removeGitHubToken);

/**
 * @swagger
 * /api/sprites/config/anthropic:
 *   get:
 *     summary: Check if Anthropic API key (Z.AI) is configured
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key status
 */
router.get('/config/anthropic', spritesController.getAnthropicApiKeyStatus);

/**
 * @swagger
 * /api/sprites/config/anthropic:
 *   post:
 *     summary: Set Anthropic API key (Z.AI) for sprites
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apiKey:
 *                 type: string
 *                 description: Z.AI API key
 *     responses:
 *       200:
 *         description: API key configured
 */
router.post('/config/anthropic', spritesController.setAnthropicApiKey);

/**
 * @swagger
 * /api/sprites/config/anthropic:
 *   delete:
 *     summary: Remove Anthropic API key
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key removed
 */
router.delete('/config/anthropic', spritesController.removeAnthropicApiKey);

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

/**
 * @swagger
 * /api/sprites/{id}/initialize:
 *   post:
 *     summary: Initialize or re-initialize a sprite (clone repo, setup Claude)
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
 *         description: Sprite initialized
 *       404:
 *         description: Sprite not found
 */
router.post('/:id/initialize', spritesController.initializeSprite);

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
 * /api/sprites/{id}/sessions/{sessionId}/kill:
 *   post:
 *     summary: Kill an exec session
 *     description: |
 *       Kill a running exec session. Returns streaming NDJSON with kill progress events:
 *       - `signal`: When signal is sent to process
 *       - `timeout`: When timeout occurs and SIGKILL is sent
 *       - `exited`: Process exited cleanly
 *       - `killed`: Process was killed
 *       - `error`: Error or warning occurred
 *       - `complete`: Kill operation complete with exit code
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
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: signal
 *         schema:
 *           type: string
 *           default: SIGTERM
 *         description: Signal to send (e.g., SIGTERM, SIGKILL)
 *       - in: query
 *         name: timeout
 *         schema:
 *           type: string
 *           default: 10s
 *         description: Timeout waiting for process to exit
 *     responses:
 *       200:
 *         description: Session killed - returns streaming events
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [signal, timeout, exited, killed, error, complete]
 *                   message:
 *                     type: string
 *                   signal:
 *                     type: string
 *                   pid:
 *                     type: integer
 *                   exit_code:
 *                     type: integer
 *       404:
 *         description: Sprite or session not found
 */
router.post('/:id/sessions/:sessionId/kill', spritesController.killSession);

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

/**
 * @swagger
 * /api/sprites/{id}/url-settings:
 *   put:
 *     summary: Update URL settings for a sprite (public/private)
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - auth
 *             properties:
 *               auth:
 *                 type: string
 *                 enum: [sprite, public]
 *                 description: Authentication mode - 'sprite' for private, 'public' for public access
 *     responses:
 *       200:
 *         description: URL settings updated
 *       404:
 *         description: Sprite not found
 */
router.put('/:id/url-settings', spritesController.updateUrlSettings);

// ============================================================================
// SPRITE SETTINGS
// ============================================================================

/**
 * @swagger
 * /api/sprites/{id}/settings:
 *   patch:
 *     summary: Update sprite settings
 *     description: |
 *       Update configurable sprite settings such as auto-shutdown behavior and shell persistence.
 *       Settings:
 *       - **autoShutdownAfterTask**: When true, the sprite will automatically stop after completing a task.
 *         This is useful for cost optimization when you only need the sprite for specific tasks.
 *       - **startupCommand**: Command to run when a terminal connects (e.g., "npm run dev").
 *         This restores your development environment after resuming a sprite.
 *       - **lastShellDirectory**: Last working directory in the shell. The terminal will cd to this
 *         directory when connecting. Typically set automatically by the system.
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               autoShutdownAfterTask:
 *                 type: boolean
 *                 description: Whether to automatically stop the sprite after completing a task
 *               startupCommand:
 *                 type: string
 *                 nullable: true
 *                 description: Command to run when terminal connects (e.g., "npm run dev")
 *                 example: "npm run dev"
 *               lastShellDirectory:
 *                 type: string
 *                 nullable: true
 *                 description: Last working directory in the shell session
 *                 example: "/home/user/project/src"
 *     responses:
 *       200:
 *         description: Settings updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Sprite'
 *                 message:
 *                   type: string
 *       400:
 *         description: No valid settings provided
 *       404:
 *         description: Sprite not found
 */
router.patch('/:id/settings', spritesController.updateSpriteSettings);

// ============================================================================
// FILESYSTEM API
// ============================================================================

/**
 * @swagger
 * /api/sprites/{id}/fs/read:
 *   get:
 *     summary: Read file contents (raw bytes)
 *     description: Read file contents from the sprite filesystem. Returns raw file bytes.
 *     tags: [Sprites - Filesystem]
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
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Path to the file to read
 *       - in: query
 *         name: workingDir
 *         schema:
 *           type: string
 *           default: /home/sprite
 *         description: Working directory for resolving relative paths
 *     responses:
 *       200:
 *         description: File contents (raw bytes)
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Path is required
 *       404:
 *         description: Sprite or file not found
 */
router.get('/:id/fs/read', spritesController.readFile);

/**
 * @swagger
 * /api/sprites/{id}/fs/read-text:
 *   get:
 *     summary: Read file contents as text
 *     description: Read file contents from the sprite filesystem as UTF-8 text.
 *     tags: [Sprites - Filesystem]
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
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Path to the file to read
 *       - in: query
 *         name: workingDir
 *         schema:
 *           type: string
 *           default: /home/sprite
 *         description: Working directory for resolving relative paths
 *     responses:
 *       200:
 *         description: File contents as text
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
 *                     path:
 *                       type: string
 *                     content:
 *                       type: string
 *       400:
 *         description: Path is required
 *       404:
 *         description: Sprite or file not found
 */
router.get('/:id/fs/read-text', spritesController.readFileText);

/**
 * @swagger
 * /api/sprites/{id}/fs/write:
 *   put:
 *     summary: Write file contents
 *     description: Write file contents to the sprite filesystem. Request body contains raw file bytes.
 *     tags: [Sprites - Filesystem]
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
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Path to the file to write
 *       - in: query
 *         name: workingDir
 *         schema:
 *           type: string
 *           default: /home/sprite
 *         description: Working directory for resolving relative paths
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *         description: File permissions in octal (e.g., '0644')
 *       - in: query
 *         name: mkdir
 *         schema:
 *           type: boolean
 *         description: Create parent directories if they don't exist
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: File written successfully
 *       400:
 *         description: Path is required
 *       404:
 *         description: Sprite not found
 */
router.put('/:id/fs/write', spritesController.writeFile);

/**
 * @swagger
 * /api/sprites/{id}/fs/list:
 *   get:
 *     summary: List directory contents
 *     description: List the contents of a directory on the sprite filesystem.
 *     tags: [Sprites - Filesystem]
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
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Path to the directory to list
 *       - in: query
 *         name: workingDir
 *         schema:
 *           type: string
 *           default: /home/sprite
 *         description: Working directory for resolving relative paths
 *     responses:
 *       200:
 *         description: Directory listing
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
 *                     path:
 *                       type: string
 *                     entries:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           path:
 *                             type: string
 *                           isDir:
 *                             type: boolean
 *                           size:
 *                             type: number
 *                           mode:
 *                             type: string
 *                           modTime:
 *                             type: string
 *                           uid:
 *                             type: number
 *                           gid:
 *                             type: number
 *       400:
 *         description: Path is required
 *       404:
 *         description: Sprite or directory not found
 */
router.get('/:id/fs/list', spritesController.listDirectory);

/**
 * @swagger
 * /api/sprites/{id}/fs/delete:
 *   delete:
 *     summary: Delete file or directory
 *     description: Delete a file or directory from the sprite filesystem.
 *     tags: [Sprites - Filesystem]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - path
 *               - workingDir
 *               - recursive
 *             properties:
 *               path:
 *                 type: string
 *                 description: Path to delete
 *               workingDir:
 *                 type: string
 *                 description: Working directory for resolving relative paths
 *               recursive:
 *                 type: boolean
 *                 description: Delete directories recursively
 *               asRoot:
 *                 type: boolean
 *                 description: Execute as root user
 *     responses:
 *       200:
 *         description: File/directory deleted successfully
 *       400:
 *         description: Path and workingDir are required
 *       404:
 *         description: Sprite not found
 */
router.delete('/:id/fs/delete', spritesController.deleteFile);

/**
 * @swagger
 * /api/sprites/{id}/fs/rename:
 *   post:
 *     summary: Rename or move file/directory
 *     description: Rename or move a file or directory on the sprite filesystem.
 *     tags: [Sprites - Filesystem]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - source
 *               - dest
 *               - workingDir
 *             properties:
 *               source:
 *                 type: string
 *                 description: Source path
 *               dest:
 *                 type: string
 *                 description: Destination path
 *               workingDir:
 *                 type: string
 *                 description: Working directory for resolving relative paths
 *               asRoot:
 *                 type: boolean
 *                 description: Execute as root user
 *     responses:
 *       200:
 *         description: File/directory renamed successfully
 *       400:
 *         description: Source, dest, and workingDir are required
 *       404:
 *         description: Sprite not found
 */
router.post('/:id/fs/rename', spritesController.renameFile);

/**
 * @swagger
 * /api/sprites/{id}/fs/copy:
 *   post:
 *     summary: Copy file or directory
 *     description: Copy a file or directory on the sprite filesystem.
 *     tags: [Sprites - Filesystem]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - source
 *               - dest
 *               - workingDir
 *             properties:
 *               source:
 *                 type: string
 *                 description: Source path
 *               dest:
 *                 type: string
 *                 description: Destination path
 *               workingDir:
 *                 type: string
 *                 description: Working directory for resolving relative paths
 *               recursive:
 *                 type: boolean
 *                 description: Copy directories recursively
 *               preserveAttrs:
 *                 type: boolean
 *                 description: Preserve file attributes
 *               asRoot:
 *                 type: boolean
 *                 description: Execute as root user
 *     responses:
 *       200:
 *         description: File/directory copied successfully
 *       400:
 *         description: Source, dest, and workingDir are required
 *       404:
 *         description: Sprite not found
 */
router.post('/:id/fs/copy', spritesController.copyFile);

/**
 * @swagger
 * /api/sprites/{id}/fs/chmod:
 *   post:
 *     summary: Change file permissions
 *     description: Change file or directory permissions on the sprite filesystem.
 *     tags: [Sprites - Filesystem]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - path
 *               - workingDir
 *               - mode
 *             properties:
 *               path:
 *                 type: string
 *                 description: Path to the file/directory
 *               workingDir:
 *                 type: string
 *                 description: Working directory for resolving relative paths
 *               mode:
 *                 type: string
 *                 description: File permissions in octal (e.g., '0755')
 *               recursive:
 *                 type: boolean
 *                 description: Apply recursively to directories
 *               asRoot:
 *                 type: boolean
 *                 description: Execute as root user
 *     responses:
 *       200:
 *         description: Permissions changed successfully
 *       400:
 *         description: Path, workingDir, and mode are required
 *       404:
 *         description: Sprite not found
 */
router.post('/:id/fs/chmod', spritesController.chmod);

/**
 * @swagger
 * /api/sprites/{id}/fs/chown:
 *   post:
 *     summary: Change file ownership
 *     description: Change file or directory ownership on the sprite filesystem.
 *     tags: [Sprites - Filesystem]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - path
 *               - workingDir
 *               - uid
 *               - gid
 *             properties:
 *               path:
 *                 type: string
 *                 description: Path to the file/directory
 *               workingDir:
 *                 type: string
 *                 description: Working directory for resolving relative paths
 *               uid:
 *                 type: integer
 *                 description: User ID
 *               gid:
 *                 type: integer
 *                 description: Group ID
 *               recursive:
 *                 type: boolean
 *                 description: Apply recursively to directories
 *               asRoot:
 *                 type: boolean
 *                 description: Execute as root user
 *     responses:
 *       200:
 *         description: Ownership changed successfully
 *       400:
 *         description: Path, workingDir, uid, and gid are required
 *       404:
 *         description: Sprite not found
 */
router.post('/:id/fs/chown', spritesController.chown);

/**
 * @swagger
 * /api/sprites/{id}/fs/watch:
 *   get:
 *     summary: Get WebSocket info for filesystem watch
 *     description: Get WebSocket connection info to watch for filesystem changes in real-time.
 *     tags: [Sprites - Filesystem]
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
 *         description: WebSocket connection info
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
 *                     wsUrl:
 *                       type: string
 *                       description: WebSocket URL for filesystem watch
 *                     token:
 *                       type: string
 *                       description: Authentication token
 *       400:
 *         description: Sprite not active
 *       404:
 *         description: Sprite not found
 */
router.get('/:id/fs/watch', spritesController.getFilesystemWatchInfo);

// ============================================================================
// COMMAND EXECUTION
// ============================================================================

/**
 * @swagger
 * /api/sprites/{id}/exec:
 *   post:
 *     summary: Execute a command in a sprite
 *     description: Execute a non-interactive command in the sprite environment. Useful for running Claude commands, scripts, or any shell command without opening a terminal WebSocket.
 *     tags: [Sprites - Exec]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - command
 *             properties:
 *               command:
 *                 type: string
 *                 description: The command to execute
 *                 example: "claude --version"
 *               workDir:
 *                 type: string
 *                 description: Working directory for command execution
 *                 example: "/home/user/project"
 *               timeout:
 *                 type: integer
 *                 description: Timeout in milliseconds (default 60000)
 *                 example: 30000
 *     responses:
 *       200:
 *         description: Command executed successfully
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
 *                     output:
 *                       type: string
 *                       description: Command output (stdout + stderr)
 *                     exitCode:
 *                       type: integer
 *                       description: Exit code of the command
 *                     sessionId:
 *                       type: string
 *                       description: Session ID (if provided by API)
 *       400:
 *         description: Command is required or sprite is not running
 *       404:
 *         description: Sprite not found
 *       500:
 *         description: Command execution failed
 */
router.post('/:id/exec', spritesController.execCommand);

// ============================================================================
// SERVICES API
// ============================================================================

/**
 * @swagger
 * /api/sprites/{id}/services:
 *   get:
 *     summary: List all services for a sprite
 *     description: Get a list of all services (background processes) configured for the sprite.
 *     tags: [Sprites - Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *     responses:
 *       200:
 *         description: List of services
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
 *                     $ref: '#/components/schemas/SpriteService'
 *       404:
 *         description: Sprite not found
 */
router.get('/:id/services', spritesController.listServices);

/**
 * @swagger
 * /api/sprites/{id}/services:
 *   post:
 *     summary: Create a new service
 *     description: Create a new background service (dev server, database, etc.) for the sprite.
 *     tags: [Sprites - Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - command
 *             properties:
 *               name:
 *                 type: string
 *                 description: Service name (e.g., "dev-server", "postgres")
 *               command:
 *                 type: string
 *                 description: Command to run (e.g., "npm run dev")
 *               args:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Command arguments
 *               workingDir:
 *                 type: string
 *                 description: Working directory for the service
 *               env:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *                 description: Environment variables
 *               autoStart:
 *                 type: boolean
 *                 description: Start service immediately after creation
 *               port:
 *                 type: integer
 *                 description: Port the service listens on (for auto-discovery)
 *     responses:
 *       201:
 *         description: Service created
 *       400:
 *         description: Name and command required, or sprite not running
 *       404:
 *         description: Sprite not found
 */
router.post('/:id/services', spritesController.createService);

/**
 * @swagger
 * /api/sprites/{id}/services/{serviceId}:
 *   get:
 *     summary: Get a specific service
 *     description: Get details of a specific service by ID.
 *     tags: [Sprites - Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Service details
 *       404:
 *         description: Sprite or service not found
 */
router.get('/:id/services/:serviceId', spritesController.getService);

/**
 * @swagger
 * /api/sprites/{id}/services/{serviceId}:
 *   delete:
 *     summary: Delete a service
 *     description: Delete a service from the sprite. The service will be stopped if running.
 *     tags: [Sprites - Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Service deleted
 *       404:
 *         description: Sprite or service not found
 */
router.delete('/:id/services/:serviceId', spritesController.deleteService);

/**
 * @swagger
 * /api/sprites/{id}/services/{serviceId}/start:
 *   post:
 *     summary: Start a service
 *     description: Start a stopped service.
 *     tags: [Sprites - Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Service started
 *       400:
 *         description: Sprite not running
 *       404:
 *         description: Sprite or service not found
 */
router.post('/:id/services/:serviceId/start', spritesController.startService);

/**
 * @swagger
 * /api/sprites/{id}/services/{serviceId}/stop:
 *   post:
 *     summary: Stop a service
 *     description: Stop a running service.
 *     tags: [Sprites - Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Service stopped
 *       404:
 *         description: Sprite or service not found
 */
router.post('/:id/services/:serviceId/stop', spritesController.stopService);

/**
 * @swagger
 * /api/sprites/{id}/services/{serviceId}/restart:
 *   post:
 *     summary: Restart a service
 *     description: Restart a service (stop + start).
 *     tags: [Sprites - Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Service restarted
 *       400:
 *         description: Sprite not running
 *       404:
 *         description: Sprite or service not found
 */
router.post('/:id/services/:serviceId/restart', spritesController.restartService);

/**
 * @swagger
 * /api/sprites/{id}/services/{serviceId}/logs:
 *   get:
 *     summary: Get service logs
 *     description: Get logs from a service (stdout and stderr).
 *     tags: [Sprites - Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID
 *       - in: query
 *         name: tail
 *         schema:
 *           type: integer
 *         description: Number of lines to return from the end
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Return logs since this timestamp
 *     responses:
 *       200:
 *         description: Service logs
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
 *                     serviceId:
 *                       type: string
 *                     logs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           stream:
 *                             type: string
 *                             enum: [stdout, stderr]
 *                           data:
 *                             type: string
 *                     hasMore:
 *                       type: boolean
 *       404:
 *         description: Sprite or service not found
 */
router.get('/:id/services/:serviceId/logs', spritesController.getServiceLogs);

// ============================================================================
// GIT & PULL REQUEST API
// ============================================================================

/**
 * @swagger
 * /api/sprites/{id}/git/status:
 *   get:
 *     summary: Get branch status for a sprite
 *     description: |
 *       Get the current git branch status including commits ahead/behind,
 *       uncommitted changes, and last commit info.
 *     tags: [Sprites - Git]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *     responses:
 *       200:
 *         description: Branch status
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
 *                     featureBranch:
 *                       type: string
 *                     baseBranch:
 *                       type: string
 *                     ahead:
 *                       type: integer
 *                       description: Commits ahead of base branch
 *                     behind:
 *                       type: integer
 *                       description: Commits behind base branch
 *                     hasUncommittedChanges:
 *                       type: boolean
 *                     lastCommitMessage:
 *                       type: string
 *                       nullable: true
 *                     lastCommitAuthor:
 *                       type: string
 *                       nullable: true
 *                     lastCommitDate:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       400:
 *         description: Sprite not initialized
 *       404:
 *         description: Sprite not found
 */
router.get('/:id/git/status', spritesController.getBranchStatus);

/**
 * @swagger
 * /api/sprites/{id}/git/push:
 *   post:
 *     summary: Push local commits to remote
 *     description: Push any local commits to the remote feature branch.
 *     tags: [Sprites - Git]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *     responses:
 *       200:
 *         description: Push result
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
 *                     success:
 *                       type: boolean
 *                     message:
 *                       type: string
 *       400:
 *         description: GitHub not configured or sprite not initialized
 *       404:
 *         description: Sprite not found
 */
router.post('/:id/git/push', spritesController.pushChanges);

/**
 * @swagger
 * /api/sprites/{id}/pr:
 *   get:
 *     summary: Get existing pull request for sprite
 *     description: Get the existing pull request for the sprite's feature branch, if any.
 *     tags: [Sprites - Git]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *     responses:
 *       200:
 *         description: Pull request info (null if none exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     url:
 *                       type: string
 *                     number:
 *                       type: integer
 *                     title:
 *                       type: string
 *                     state:
 *                       type: string
 *                       enum: [OPEN, CLOSED, MERGED]
 *                     headBranch:
 *                       type: string
 *                     baseBranch:
 *                       type: string
 *       404:
 *         description: Sprite not found
 */
router.get('/:id/pr', spritesController.getPullRequest);

/**
 * @swagger
 * /api/sprites/{id}/pr:
 *   post:
 *     summary: Create a pull request from sprite
 *     description: |
 *       Create a pull request from the sprite's feature branch to the base branch.
 *       If a PR already exists, returns the existing PR info.
 *     tags: [Sprites - Git]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprite ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: PR title (defaults to "Changes from sprite: {spriteName}")
 *               body:
 *                 type: string
 *                 description: PR description (defaults to auto-generated summary)
 *               draft:
 *                 type: boolean
 *                 description: Create as draft PR
 *                 default: false
 *     responses:
 *       201:
 *         description: Pull request created
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
 *                     url:
 *                       type: string
 *                     number:
 *                       type: integer
 *                     title:
 *                       type: string
 *                     state:
 *                       type: string
 *                     headBranch:
 *                       type: string
 *                     baseBranch:
 *                       type: string
 *       400:
 *         description: No feature branch, GitHub not configured, or no commits to create PR
 *       404:
 *         description: Sprite not found
 */
router.post('/:id/pr', spritesController.createPullRequest);

// Mount sprite chat routes
router.use(spriteChatRoutes);

export default router;
