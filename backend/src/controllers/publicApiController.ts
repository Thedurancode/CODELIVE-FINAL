/**
 * Public API Controller
 *
 * Handles external API requests authenticated via API keys.
 * Provides access to sprites, tasks, files, and chat functionality.
 */

import { Request, Response } from 'express';
import ProjectSprite from '../models/ProjectSprite';
import SpriteTask from '../models/SpriteTask';
import Project from '../models/Project';
import { spritesService } from '../services/SpritesService';
import { spriteMcpService } from '../services/SpriteMcpService';
import { mcpRegistryService } from '../services/McpRegistryService';

// ============================================================================
// SPRITES
// ============================================================================

/**
 * List all sprites for the organization
 */
export const listSprites = async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiKeyOrganizationId;
    const { status, projectId, limit = 50, offset = 0 } = req.query;

    const where: Record<string, unknown> = { organizationId };
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;

    const sprites = await ProjectSprite.findAndCountAll({
      where,
      limit: Math.min(Number(limit), 100),
      offset: Number(offset),
      order: [['updatedAt', 'DESC']],
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'title', 'githubUrl'],
        },
      ],
    });

    res.json({
      success: true,
      data: sprites.rows,
      pagination: {
        total: sprites.count,
        limit: Number(limit),
        offset: Number(offset),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get a specific sprite by ID
 */
export const getSprite = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'title', 'githubUrl'],
        },
      ],
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: sprite,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Create a new sprite
 */
export const createSprite = async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiKeyOrganizationId!;
    const { projectId, repoUrl, branch = 'main' } = req.body;

    if (!projectId || !repoUrl) {
      return res.status(400).json({
        success: false,
        error: 'projectId and repoUrl are required',
        timestamp: new Date().toISOString(),
      });
    }

    // Verify project belongs to organization
    const project = await Project.findOne({
      where: { id: projectId, organizationId },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    const sprite = await spritesService.createSprite({
      projectId,
      organizationId,
      repoUrl,
      branch,
    });

    res.status(201).json({
      success: true,
      data: sprite,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Resume a stopped/hibernating sprite
 */
export const resumeSprite = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.canResume()) {
      return res.status(400).json({
        success: false,
        error: `Cannot resume sprite in ${sprite.status} status`,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spritesService.resumeSprite(sprite.id);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Stop a running sprite
 */
export const stopSprite = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spritesService.stopSprite(sprite.id);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Update sprite settings
 */
export const updateSpriteSettings = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const { startupCommand, lastShellDirectory, autoShutdownAfterTask } = req.body;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    const updates: Record<string, unknown> = {};
    if (startupCommand !== undefined) updates.startupCommand = startupCommand || null;
    if (lastShellDirectory !== undefined) updates.lastShellDirectory = lastShellDirectory || null;
    if (typeof autoShutdownAfterTask === 'boolean') updates.autoShutdownAfterTask = autoShutdownAfterTask;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid settings provided',
        timestamp: new Date().toISOString(),
      });
    }

    await sprite.update(updates);

    res.json({
      success: true,
      data: sprite,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// EXECUTE COMMANDS
// ============================================================================

/**
 * Execute a shell command on a sprite
 */
export const executeCommand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const { command, timeout = 30000 } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'command is required',
        timestamp: new Date().toISOString(),
      });
    }

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spritesService.execCommand(sprite.organizationId, sprite.spriteName, command);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// FILE SYSTEM
// ============================================================================

/**
 * List files in a directory
 */
export const listFiles = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const path = (req.query.path as string) || '/home/sprite/project';

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    const files = await spritesService.listDirectory(sprite.id, path);

    res.json({
      success: true,
      data: { path, files },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Read a file
 */
export const readFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const path = req.query.path as string;

    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'path query parameter is required',
        timestamp: new Date().toISOString(),
      });
    }

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    const content = await spritesService.readFile(sprite.id, path);

    res.json({
      success: true,
      data: { path, content },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Write a file
 */
export const writeFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const { path, content } = req.body;

    if (!path || content === undefined) {
      return res.status(400).json({
        success: false,
        error: 'path and content are required',
        timestamp: new Date().toISOString(),
      });
    }

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    await spritesService.writeFile(sprite.id, path, content);

    res.json({
      success: true,
      data: { path, written: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Delete a file
 */
export const deleteFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const path = req.query.path as string;

    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'path query parameter is required',
        timestamp: new Date().toISOString(),
      });
    }

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    await spritesService.deleteFile(sprite.id, {
      path,
      workingDir: sprite.workingDirectory || '/home/sprite',
      recursive: req.body.recursive === true,
    });

    res.json({
      success: true,
      data: { path, deleted: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// TASKS
// ============================================================================

/**
 * List tasks for a sprite
 */
export const listTasks = async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiKeyOrganizationId;
    const { spriteId, projectId, status, limit = 50, offset = 0 } = req.query;

    const where: Record<string, unknown> = { organizationId };
    if (spriteId) where.spriteId = spriteId;
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;

    const tasks = await SpriteTask.findAndCountAll({
      where,
      limit: Math.min(Number(limit), 100),
      offset: Number(offset),
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      data: tasks.rows,
      pagination: {
        total: tasks.count,
        limit: Number(limit),
        offset: Number(offset),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get a specific task
 */
export const getTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const task = await SpriteTask.findOne({
      where: { id, organizationId },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Create a new task
 */
export const createTask = async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiKeyOrganizationId!;
    const { spriteId, projectId, title, description, priority = 'medium' } = req.body;

    if (!spriteId || !projectId || !title || !description) {
      return res.status(400).json({
        success: false,
        error: 'spriteId, projectId, title, and description are required',
        timestamp: new Date().toISOString(),
      });
    }

    // Verify sprite belongs to organization
    const sprite = await ProjectSprite.findOne({
      where: { id: spriteId, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    const task = await SpriteTask.create({
      spriteId,
      projectId,
      organizationId,
      title,
      description,
      priority,
      status: 'pending',
    });

    res.status(201).json({
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Cancel a task
 */
export const cancelTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const task = await SpriteTask.findOne({
      where: { id, organizationId },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (['completed', 'cancelled', 'failed'].includes(task.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel task in ${task.status} status`,
        timestamp: new Date().toISOString(),
      });
    }

    await task.update({ status: 'cancelled' });

    res.json({
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// CHAT
// ============================================================================

/**
 * Send a chat message to Claude on a sprite
 */
export const sendChatMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const { message, conversationId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required',
        timestamp: new Date().toISOString(),
      });
    }

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    // Chat functionality not yet implemented in public API
    // TODO: Implement chat integration via Claude Code streaming
    res.status(501).json({
      success: false,
      error: 'Chat functionality not yet implemented in public API. Use WebSocket streaming instead.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get chat history for a sprite
 */
export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const { conversationId, limit = 50 } = req.query;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Chat history functionality not yet implemented in public API
    // TODO: Implement chat history retrieval
    res.status(501).json({
      success: false,
      error: 'Chat history functionality not yet implemented in public API.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// PROJECTS
// ============================================================================

/**
 * List projects for the organization
 */
export const listProjects = async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiKeyOrganizationId;
    const { limit = 50, offset = 0 } = req.query;

    const projects = await Project.findAndCountAll({
      where: { organizationId },
      limit: Math.min(Number(limit), 100),
      offset: Number(offset),
      order: [['updatedAt', 'DESC']],
    });

    res.json({
      success: true,
      data: projects.rows,
      pagination: {
        total: projects.count,
        limit: Number(limit),
        offset: Number(offset),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get a specific project
 */
export const getProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const project = await Project.findOne({
      where: { id, organizationId },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: project,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// MCP (Model Context Protocol)
// ============================================================================

/**
 * Install/start MCP server on a sprite
 */
export const installMcpServer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spriteMcpService.installMcpServer(sprite.id);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to install MCP server',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: { mcpInstalled: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Check MCP server health
 */
export const getMcpHealth = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    const health = await spriteMcpService.checkMcpHealth(sprite.id);

    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get available MCP tools
 */
export const getMcpTools = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    const tools = await spriteMcpService.getTools(sprite.id);

    res.json({
      success: true,
      data: { tools },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Call an MCP tool
 */
export const callMcpTool = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const { tool, arguments: args = {} } = req.body;

    if (!tool) {
      return res.status(400).json({
        success: false,
        error: 'tool is required',
        timestamp: new Date().toISOString(),
      });
    }

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spriteMcpService.callTool(sprite.id, tool, args);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Tool call failed',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: result.result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// MCP REGISTRY
// ============================================================================

/**
 * Search MCP servers in the registry
 */
export const searchMcpRegistry = async (req: Request, res: Response) => {
  try {
    const { search, limit, cursor, category } = req.query;

    const result = await mcpRegistryService.searchServers({
      search: search as string,
      limit: limit ? Number(limit) : undefined,
      cursor: cursor as string,
      category: category as string,
    });

    res.json({
      success: true,
      data: result.servers,
      metadata: result.metadata,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get details for a specific MCP server from registry
 */
export const getMcpRegistryServer = async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { version } = req.query;

    const server = await mcpRegistryService.getServerDetails(
      name,
      (version as string) || 'latest'
    );

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in registry',
        timestamp: new Date().toISOString(),
      });
    }

    // Add install/run commands
    const installCommand = mcpRegistryService.getInstallCommand(server);
    const runCommand = mcpRegistryService.getRunCommand(server);

    res.json({
      success: true,
      data: {
        ...server,
        installCommand,
        runCommand,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get popular MCP servers
 */
export const getPopularMcpServers = async (_req: Request, res: Response) => {
  try {
    const servers = await mcpRegistryService.getPopularServers();

    res.json({
      success: true,
      data: servers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Install an MCP server from registry onto a sprite
 */
export const installMcpFromRegistry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const { serverName, version } = req.body;

    if (!serverName) {
      return res.status(400).json({
        success: false,
        error: 'serverName is required',
        timestamp: new Date().toISOString(),
      });
    }

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    // Get server details from registry
    const server = await mcpRegistryService.getServerDetails(serverName, version || 'latest');
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in registry',
        timestamp: new Date().toISOString(),
      });
    }

    const installCommand = mcpRegistryService.getInstallCommand(server);
    if (!installCommand) {
      return res.status(400).json({
        success: false,
        error: 'Server has no installable package',
        timestamp: new Date().toISOString(),
      });
    }

    // Execute install command on sprite
    const result = await spritesService.execCommand(
      sprite.organizationId,
      sprite.spriteName,
      installCommand,
      { timeout: 120000 }
    );

    if (result.exitCode !== 0) {
      return res.status(500).json({
        success: false,
        error: `Installation failed: ${result.output}`,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        installed: true,
        serverName: server.name,
        version: server.version,
        installCommand,
        runCommand: mcpRegistryService.getRunCommand(server),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// MCP SERVER CONFIGURATION MANAGEMENT
// ============================================================================

/**
 * Get all installed MCP servers for a sprite
 */
export const getMcpServers = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    const servers = await spriteMcpService.getInstalledServers(id);

    res.json({
      success: true,
      data: servers.map((s) => ({
        id: s.id,
        serverName: s.serverName,
        displayName: s.displayName,
        description: s.description,
        registry: s.registry,
        packageName: s.packageName,
        packageVersion: s.packageVersion,
        status: s.status,
        autoStart: s.autoStart,
        startOrder: s.startOrder,
        tools: s.tools,
        installedAt: s.installedAt,
        lastStartedAt: s.lastStartedAt,
        lastStoppedAt: s.lastStoppedAt,
        errorMessage: s.errorMessage,
        hasEnvConfig: !!s.envConfig?.variables?.length,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get a specific MCP server configuration
 */
export const getMcpServer = async (req: Request, res: Response) => {
  try {
    const { id, serverName } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    const server = await spriteMcpService.getServerByName(id, serverName);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Get env vars with secrets masked
    const envVars = await spriteMcpService.getServerEnvVars(id, serverName);

    // Check required env vars
    const envStatus = await spriteMcpService.hasRequiredEnvVars(id, serverName);

    res.json({
      success: true,
      data: {
        id: server.id,
        serverName: server.serverName,
        displayName: server.displayName,
        description: server.description,
        registry: server.registry,
        packageName: server.packageName,
        packageVersion: server.packageVersion,
        installCommand: server.installCommand,
        runCommand: server.runCommand,
        status: server.status,
        autoStart: server.autoStart,
        startOrder: server.startOrder,
        tools: server.tools,
        envVars,
        envStatus,
        installedAt: server.installedAt,
        lastStartedAt: server.lastStartedAt,
        lastStoppedAt: server.lastStoppedAt,
        errorMessage: server.errorMessage,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Install MCP server from registry with configuration
 */
export const installMcpServerWithConfig = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const { serverName, version, envVars, autoStart } = req.body;

    if (!serverName) {
      return res.status(400).json({
        success: false,
        error: 'serverName is required',
        timestamp: new Date().toISOString(),
      });
    }

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    const server = await spriteMcpService.installFromRegistry(id, serverName, {
      version,
      envVars,
      autoStart,
    });

    res.json({
      success: true,
      data: {
        id: server.id,
        serverName: server.serverName,
        displayName: server.displayName,
        status: server.status,
        autoStart: server.autoStart,
        installedAt: server.installedAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Update MCP server configuration
 */
export const updateMcpServerConfig = async (req: Request, res: Response) => {
  try {
    const { id, serverName } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const { displayName, autoStart, startOrder, envVars } = req.body;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    const server = await spriteMcpService.updateServerConfig(id, serverName, {
      displayName,
      autoStart,
      startOrder,
      envVars,
    });

    res.json({
      success: true,
      data: {
        id: server.id,
        serverName: server.serverName,
        displayName: server.displayName,
        autoStart: server.autoStart,
        startOrder: server.startOrder,
        hasEnvConfig: !!server.envConfig?.variables?.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Start an MCP server
 */
export const startMcpServer = async (req: Request, res: Response) => {
  try {
    const { id, serverName } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    const server = await spriteMcpService.startServer(id, serverName);

    res.json({
      success: true,
      data: {
        serverName: server.serverName,
        status: server.status,
        lastStartedAt: server.lastStartedAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Stop an MCP server
 */
export const stopMcpServerNamed = async (req: Request, res: Response) => {
  try {
    const { id, serverName } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    const server = await spriteMcpService.stopServer(id, serverName);

    res.json({
      success: true,
      data: {
        serverName: server.serverName,
        status: server.status,
        lastStoppedAt: server.lastStoppedAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Uninstall an MCP server
 */
export const uninstallMcpServerNamed = async (req: Request, res: Response) => {
  try {
    const { id, serverName } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    await spriteMcpService.uninstallServer(id, serverName);

    res.json({
      success: true,
      data: {
        serverName,
        uninstalled: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get auto-start configuration for a sprite
 */
export const getMcpAutoStartConfig = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    const servers = await spriteMcpService.getAutoStartConfig(id);

    res.json({
      success: true,
      data: servers.map((s) => ({
        serverName: s.serverName,
        displayName: s.displayName,
        autoStart: s.autoStart,
        startOrder: s.startOrder,
        status: s.status,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Update auto-start order for MCP servers
 */
export const updateMcpAutoStartOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;
    const { serverOrder } = req.body;

    if (!Array.isArray(serverOrder)) {
      return res.status(400).json({
        success: false,
        error: 'serverOrder must be an array of server names',
        timestamp: new Date().toISOString(),
      });
    }

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    await spriteMcpService.reorderAutoStartServers(id, serverOrder);

    res.json({
      success: true,
      data: {
        serverOrder,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Start all auto-start servers for a sprite
 */
export const startAutoStartServers = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spriteMcpService.startAutoStartServers(id);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get required environment variables for a server from the registry
 */
export const getMcpServerRequiredEnvVars = async (req: Request, res: Response) => {
  try {
    const { serverName } = req.params;

    const required = await spriteMcpService.getRequiredEnvVars(serverName);

    res.json({
      success: true,
      data: {
        serverName,
        requiredEnvVars: required,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// MCP SERVER UPDATES
// ============================================================================

/**
 * Check for updates for a single MCP server
 */
export const checkMcpServerForUpdate = async (req: Request, res: Response) => {
  try {
    const { id, serverName } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spriteMcpService.checkServerForUpdate(id, serverName);

    res.json({
      success: true,
      data: {
        serverName,
        ...result,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Check for updates for all installed MCP servers on a sprite
 */
export const checkAllMcpServersForUpdates = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spriteMcpService.checkAllServersForUpdates(id);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Update a single MCP server to the latest version
 */
export const updateMcpServer = async (req: Request, res: Response) => {
  try {
    const { id, serverName } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spriteMcpService.updateServer(id, serverName);

    res.json({
      success: true,
      data: {
        server: result.server,
        previousVersion: result.previousVersion,
        newVersion: result.newVersion,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Update all MCP servers with available updates
 */
export const updateAllMcpServers = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.apiKeyOrganizationId;

    const sprite = await ProjectSprite.findOne({
      where: { id, organizationId },
    });

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: `Sprite is not active (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spriteMcpService.updateAllServers(id);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};
