/**
 * Public API Routes
 *
 * External API endpoints authenticated via API keys.
 * Base path: /api/v1
 *
 * Authentication: All routes require an API key via:
 * - Authorization: Bearer sk_live_xxx
 * - X-API-Key: sk_live_xxx
 */

import { Router } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/apiKeyAuth';
import * as publicApi from '../controllers/publicApiController';

const router = Router();

// All routes require API key authentication
router.use(apiKeyAuth);

// ============================================================================
// SPRITES
// ============================================================================

/**
 * @swagger
 * /api/v1/sprites:
 *   get:
 *     summary: List all sprites
 *     description: Get all sprites for your organization with optional filtering
 *     tags: [Public API - Sprites]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [creating, initializing, running, hibernating, stopped, error]
 *         description: Filter by sprite status
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of sprites
 */
router.get('/sprites', requireScope('sprites:read', '*'), publicApi.listSprites);

/**
 * @swagger
 * /api/v1/sprites/{id}:
 *   get:
 *     summary: Get a sprite
 *     description: Get details of a specific sprite
 *     tags: [Public API - Sprites]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sprite details
 *       404:
 *         description: Sprite not found
 */
router.get('/sprites/:id', requireScope('sprites:read', '*'), publicApi.getSprite);

/**
 * @swagger
 * /api/v1/sprites:
 *   post:
 *     summary: Create a sprite
 *     description: Create a new sprite for a project
 *     tags: [Public API - Sprites]
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectId, repoUrl]
 *             properties:
 *               projectId:
 *                 type: string
 *               repoUrl:
 *                 type: string
 *               branch:
 *                 type: string
 *                 default: main
 *               startupCommand:
 *                 type: string
 *     responses:
 *       201:
 *         description: Sprite created
 */
router.post('/sprites', requireScope('sprites:write', '*'), publicApi.createSprite);

/**
 * @swagger
 * /api/v1/sprites/{id}/resume:
 *   post:
 *     summary: Resume a sprite
 *     description: Resume a stopped or hibernating sprite
 *     tags: [Public API - Sprites]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sprite resumed
 */
router.post('/sprites/:id/resume', requireScope('sprites:write', '*'), publicApi.resumeSprite);

/**
 * @swagger
 * /api/v1/sprites/{id}/stop:
 *   post:
 *     summary: Stop a sprite
 *     description: Stop a running sprite
 *     tags: [Public API - Sprites]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sprite stopped
 */
router.post('/sprites/:id/stop', requireScope('sprites:write', '*'), publicApi.stopSprite);

/**
 * @swagger
 * /api/v1/sprites/{id}/settings:
 *   patch:
 *     summary: Update sprite settings
 *     description: Update sprite configuration
 *     tags: [Public API - Sprites]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startupCommand:
 *                 type: string
 *               lastShellDirectory:
 *                 type: string
 *               autoShutdownAfterTask:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.patch('/sprites/:id/settings', requireScope('sprites:write', '*'), publicApi.updateSpriteSettings);

// ============================================================================
// EXECUTE COMMANDS
// ============================================================================

/**
 * @swagger
 * /api/v1/sprites/{id}/execute:
 *   post:
 *     summary: Execute a shell command
 *     description: Execute a shell command on a sprite and get the output
 *     tags: [Public API - Execute]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [command]
 *             properties:
 *               command:
 *                 type: string
 *                 description: Shell command to execute
 *               timeout:
 *                 type: integer
 *                 default: 30000
 *                 description: Timeout in milliseconds (max 120000)
 *     responses:
 *       200:
 *         description: Command output
 */
router.post('/sprites/:id/execute', requireScope('sprites:execute', '*'), publicApi.executeCommand);

// ============================================================================
// FILE SYSTEM
// ============================================================================

/**
 * @swagger
 * /api/v1/sprites/{id}/files:
 *   get:
 *     summary: List files
 *     description: List files in a directory on a sprite
 *     tags: [Public API - Files]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: path
 *         schema:
 *           type: string
 *           default: /home/sprite/project
 *     responses:
 *       200:
 *         description: List of files
 */
router.get('/sprites/:id/files', requireScope('files:read', '*'), publicApi.listFiles);

/**
 * @swagger
 * /api/v1/sprites/{id}/files/read:
 *   get:
 *     summary: Read a file
 *     description: Read the contents of a file on a sprite
 *     tags: [Public API - Files]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File contents
 */
router.get('/sprites/:id/files/read', requireScope('files:read', '*'), publicApi.readFile);

/**
 * @swagger
 * /api/v1/sprites/{id}/files/write:
 *   post:
 *     summary: Write a file
 *     description: Write contents to a file on a sprite
 *     tags: [Public API - Files]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [path, content]
 *             properties:
 *               path:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: File written
 */
router.post('/sprites/:id/files/write', requireScope('files:write', '*'), publicApi.writeFile);

/**
 * @swagger
 * /api/v1/sprites/{id}/files/delete:
 *   delete:
 *     summary: Delete a file
 *     description: Delete a file on a sprite
 *     tags: [Public API - Files]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File deleted
 */
router.delete('/sprites/:id/files/delete', requireScope('files:write', '*'), publicApi.deleteFile);

// ============================================================================
// TASKS
// ============================================================================

/**
 * @swagger
 * /api/v1/tasks:
 *   get:
 *     summary: List tasks
 *     description: List coding tasks with optional filtering
 *     tags: [Public API - Tasks]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: query
 *         name: spriteId
 *         schema:
 *           type: string
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, assigned, in_progress, pr_created, completed, failed, cancelled]
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
 *     responses:
 *       200:
 *         description: List of tasks
 */
router.get('/tasks', requireScope('tasks:read', '*'), publicApi.listTasks);

/**
 * @swagger
 * /api/v1/tasks/{id}:
 *   get:
 *     summary: Get a task
 *     description: Get details of a specific task
 *     tags: [Public API - Tasks]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task details
 */
router.get('/tasks/:id', requireScope('tasks:read', '*'), publicApi.getTask);

/**
 * @swagger
 * /api/v1/tasks:
 *   post:
 *     summary: Create a task
 *     description: Create a new coding task for Claude to work on
 *     tags: [Public API - Tasks]
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [spriteId, projectId, title, description]
 *             properties:
 *               spriteId:
 *                 type: string
 *               projectId:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 default: medium
 *     responses:
 *       201:
 *         description: Task created
 */
router.post('/tasks', requireScope('tasks:write', '*'), publicApi.createTask);

/**
 * @swagger
 * /api/v1/tasks/{id}/cancel:
 *   post:
 *     summary: Cancel a task
 *     description: Cancel a pending or in-progress task
 *     tags: [Public API - Tasks]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task cancelled
 */
router.post('/tasks/:id/cancel', requireScope('tasks:write', '*'), publicApi.cancelTask);

// ============================================================================
// CHAT
// ============================================================================

/**
 * @swagger
 * /api/v1/sprites/{id}/chat:
 *   post:
 *     summary: Send a chat message
 *     description: Send a message to Claude on a sprite
 *     tags: [Public API - Chat]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *               conversationId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Claude's response
 */
router.post('/sprites/:id/chat', requireScope('chat:write', '*'), publicApi.sendChatMessage);

/**
 * @swagger
 * /api/v1/sprites/{id}/chat/history:
 *   get:
 *     summary: Get chat history
 *     description: Get conversation history for a sprite
 *     tags: [Public API - Chat]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: conversationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Chat history
 */
router.get('/sprites/:id/chat/history', requireScope('chat:read', '*'), publicApi.getChatHistory);

// ============================================================================
// PROJECTS
// ============================================================================

/**
 * @swagger
 * /api/v1/projects:
 *   get:
 *     summary: List projects
 *     description: List all projects for your organization
 *     tags: [Public API - Projects]
 *     security:
 *       - apiKey: []
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
 *     responses:
 *       200:
 *         description: List of projects
 */
router.get('/projects', requireScope('projects:read', '*'), publicApi.listProjects);

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   get:
 *     summary: Get a project
 *     description: Get details of a specific project
 *     tags: [Public API - Projects]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project details
 */
router.get('/projects/:id', requireScope('projects:read', '*'), publicApi.getProject);

export default router;
