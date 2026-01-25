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
    const { projectId, repoUrl, branch = 'main', startupCommand } = req.body;

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
      startupCommand,
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

    const result = await spritesService.executeCommand(sprite.id, command, Math.min(timeout, 120000));

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

    await spritesService.deleteFile(sprite.id, path);

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

    // Use the sprites service to send chat
    const response = await spritesService.sendChatMessage(sprite.id, message, conversationId);

    res.json({
      success: true,
      data: response,
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

    const history = await spritesService.getChatHistory(
      sprite.id,
      conversationId as string,
      Number(limit)
    );

    res.json({
      success: true,
      data: history,
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
