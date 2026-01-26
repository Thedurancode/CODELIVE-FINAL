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

// ============================================================================
// MCP (Model Context Protocol)
// ============================================================================

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/install:
 *   post:
 *     summary: Install MCP server
 *     description: Install and start the MCP server on a sprite
 *     tags: [Public API - MCP]
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
 *         description: MCP server installed
 */
router.post('/sprites/:id/mcp/install', requireScope('sprites:write', '*'), publicApi.installMcpServer);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/health:
 *   get:
 *     summary: Check MCP health
 *     description: Check if the MCP server is running and healthy
 *     tags: [Public API - MCP]
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
 *         description: MCP health status
 */
router.get('/sprites/:id/mcp/health', requireScope('sprites:read', '*'), publicApi.getMcpHealth);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/tools:
 *   get:
 *     summary: List MCP tools
 *     description: Get all available MCP tools on a sprite
 *     tags: [Public API - MCP]
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
 *         description: List of MCP tools
 */
router.get('/sprites/:id/mcp/tools', requireScope('sprites:read', '*'), publicApi.getMcpTools);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/call:
 *   post:
 *     summary: Call an MCP tool
 *     description: Execute an MCP tool on a sprite
 *     tags: [Public API - MCP]
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
 *             required: [tool, arguments]
 *             properties:
 *               tool:
 *                 type: string
 *                 description: Name of the MCP tool to call
 *               arguments:
 *                 type: object
 *                 description: Arguments to pass to the tool
 *     responses:
 *       200:
 *         description: Tool execution result
 */
router.post('/sprites/:id/mcp/call', requireScope('sprites:execute', '*'), publicApi.callMcpTool);

// ============================================================================
// MCP Registry
// ============================================================================

/**
 * @swagger
 * /api/v1/mcp-registry/servers:
 *   get:
 *     summary: Search MCP servers
 *     description: Search the MCP registry for available servers
 *     tags: [Public API - MCP Registry]
 *     security:
 *       - apiKey: []
 *     parameters:
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
 *         description: Number of results
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor
 *     responses:
 *       200:
 *         description: List of MCP servers
 */
router.get('/mcp-registry/servers', requireScope('sprites:read', '*'), publicApi.searchMcpRegistry);

/**
 * @swagger
 * /api/v1/mcp-registry/servers/popular:
 *   get:
 *     summary: Get popular MCP servers
 *     description: Get a list of popular MCP servers from the registry
 *     tags: [Public API - MCP Registry]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: List of popular MCP servers
 */
router.get('/mcp-registry/servers/popular', requireScope('sprites:read', '*'), publicApi.getPopularMcpServers);

/**
 * @swagger
 * /api/v1/mcp-registry/servers/{name}:
 *   get:
 *     summary: Get MCP server details
 *     description: Get details for a specific MCP server from the registry
 *     tags: [Public API - MCP Registry]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Server name
 *       - in: query
 *         name: version
 *         schema:
 *           type: string
 *           default: latest
 *         description: Server version
 *     responses:
 *       200:
 *         description: MCP server details
 */
router.get('/mcp-registry/servers/:name', requireScope('sprites:read', '*'), publicApi.getMcpRegistryServer);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/install-from-registry:
 *   post:
 *     summary: Install MCP server from registry
 *     description: Install an MCP server from the registry onto a sprite
 *     tags: [Public API - MCP Registry]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serverName]
 *             properties:
 *               serverName:
 *                 type: string
 *                 description: Name of the MCP server to install
 *               version:
 *                 type: string
 *                 description: Version to install (default: latest)
 *     responses:
 *       200:
 *         description: Server installed successfully
 */
router.post('/sprites/:id/mcp/install-from-registry', requireScope('sprites:write', '*'), publicApi.installMcpFromRegistry);

// ============================================================================
// MCP Server Configuration Management
// ============================================================================

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/servers:
 *   get:
 *     summary: Get all installed MCP servers for a sprite
 *     tags: [MCP Configuration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *     responses:
 *       200:
 *         description: List of installed MCP servers
 */
router.get('/sprites/:id/mcp/servers', requireScope('sprites:read', '*'), publicApi.getMcpServers);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/servers/{serverName}:
 *   get:
 *     summary: Get a specific MCP server configuration
 *     tags: [MCP Configuration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *       - in: path
 *         name: serverName
 *         required: true
 *         schema:
 *           type: string
 *         description: Server name
 *     responses:
 *       200:
 *         description: Server configuration
 */
router.get('/sprites/:id/mcp/servers/:serverName', requireScope('sprites:read', '*'), publicApi.getMcpServer);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/servers:
 *   post:
 *     summary: Install MCP server with configuration
 *     tags: [MCP Configuration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - serverName
 *             properties:
 *               serverName:
 *                 type: string
 *               version:
 *                 type: string
 *               envVars:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key:
 *                       type: string
 *                     value:
 *                       type: string
 *                     isSecret:
 *                       type: boolean
 *               autoStart:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Server installed successfully
 */
router.post('/sprites/:id/mcp/servers', requireScope('sprites:write', '*'), publicApi.installMcpServerWithConfig);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/servers/{serverName}:
 *   put:
 *     summary: Update MCP server configuration
 *     tags: [MCP Configuration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: serverName
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *               autoStart:
 *                 type: boolean
 *               startOrder:
 *                 type: integer
 *               envVars:
 *                 type: array
 *     responses:
 *       200:
 *         description: Configuration updated
 */
router.put('/sprites/:id/mcp/servers/:serverName', requireScope('sprites:write', '*'), publicApi.updateMcpServerConfig);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/servers/{serverName}/start:
 *   post:
 *     summary: Start an MCP server
 *     tags: [MCP Configuration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: serverName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Server started
 */
router.post('/sprites/:id/mcp/servers/:serverName/start', requireScope('sprites:execute', '*'), publicApi.startMcpServer);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/servers/{serverName}/stop:
 *   post:
 *     summary: Stop an MCP server
 *     tags: [MCP Configuration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: serverName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Server stopped
 */
router.post('/sprites/:id/mcp/servers/:serverName/stop', requireScope('sprites:execute', '*'), publicApi.stopMcpServerNamed);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/servers/{serverName}:
 *   delete:
 *     summary: Uninstall an MCP server
 *     tags: [MCP Configuration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: serverName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Server uninstalled
 */
router.delete('/sprites/:id/mcp/servers/:serverName', requireScope('sprites:write', '*'), publicApi.uninstallMcpServerNamed);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/auto-start:
 *   get:
 *     summary: Get auto-start configuration
 *     tags: [MCP Configuration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Auto-start configuration
 */
router.get('/sprites/:id/mcp/auto-start', requireScope('sprites:read', '*'), publicApi.getMcpAutoStartConfig);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/auto-start/order:
 *   put:
 *     summary: Update auto-start order
 *     tags: [MCP Configuration]
 *     security:
 *       - BearerAuth: []
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
 *             required:
 *               - serverOrder
 *             properties:
 *               serverOrder:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Order updated
 */
router.put('/sprites/:id/mcp/auto-start/order', requireScope('sprites:write', '*'), publicApi.updateMcpAutoStartOrder);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/auto-start/start:
 *   post:
 *     summary: Start all auto-start servers
 *     tags: [MCP Configuration]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Servers started
 */
router.post('/sprites/:id/mcp/auto-start/start', requireScope('sprites:execute', '*'), publicApi.startAutoStartServers);

/**
 * @swagger
 * /api/v1/mcp-registry/servers/{serverName}/required-env:
 *   get:
 *     summary: Get required environment variables for a server
 *     tags: [MCP Registry]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: serverName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Required environment variables
 */
router.get('/mcp-registry/servers/:serverName/required-env', requireScope('sprites:read', '*'), publicApi.getMcpServerRequiredEnvVars);

// ============================================================================
// MCP SERVER UPDATES
// ============================================================================

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/check-updates:
 *   get:
 *     summary: Check for updates for all MCP servers
 *     description: Check for available updates for all installed MCP servers on a sprite
 *     tags: [Public API - MCP Servers]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *     responses:
 *       200:
 *         description: Update check results
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
 *                     servers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           serverName:
 *                             type: string
 *                           hasUpdate:
 *                             type: boolean
 *                           currentVersion:
 *                             type: string
 *                           latestVersion:
 *                             type: string
 *                           changelogUrl:
 *                             type: string
 *                     updatesAvailable:
 *                       type: integer
 *                     checkedAt:
 *                       type: string
 *                       format: date-time
 */
router.get('/sprites/:id/mcp/check-updates', requireScope('sprites:read', '*'), publicApi.checkAllMcpServersForUpdates);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/{serverName}/check-update:
 *   get:
 *     summary: Check for update for a single MCP server
 *     description: Check if an update is available for a specific installed MCP server
 *     tags: [Public API - MCP Servers]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *       - in: path
 *         name: serverName
 *         required: true
 *         schema:
 *           type: string
 *         description: MCP server name
 *     responses:
 *       200:
 *         description: Update check result
 */
router.get('/sprites/:id/mcp/:serverName/check-update', requireScope('sprites:read', '*'), publicApi.checkMcpServerForUpdate);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/{serverName}/update:
 *   post:
 *     summary: Update a single MCP server
 *     description: Update an installed MCP server to the latest version (preserves config)
 *     tags: [Public API - MCP Servers]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *       - in: path
 *         name: serverName
 *         required: true
 *         schema:
 *           type: string
 *         description: MCP server name
 *     responses:
 *       200:
 *         description: Update result
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
 *                     server:
 *                       type: object
 *                     previousVersion:
 *                       type: string
 *                     newVersion:
 *                       type: string
 */
router.post('/sprites/:id/mcp/:serverName/update', requireScope('sprites:write', '*'), publicApi.updateMcpServer);

/**
 * @swagger
 * /api/v1/sprites/{id}/mcp/update-all:
 *   post:
 *     summary: Update all MCP servers with available updates
 *     description: Update all installed MCP servers that have newer versions available
 *     tags: [Public API - MCP Servers]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sprite ID
 *     responses:
 *       200:
 *         description: Bulk update results
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
 *                     updated:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           serverName:
 *                             type: string
 *                           previousVersion:
 *                             type: string
 *                           newVersion:
 *                             type: string
 *                     failed:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           serverName:
 *                             type: string
 *                           error:
 *                             type: string
 */
router.post('/sprites/:id/mcp/update-all', requireScope('sprites:write', '*'), publicApi.updateAllMcpServers);

export default router;
