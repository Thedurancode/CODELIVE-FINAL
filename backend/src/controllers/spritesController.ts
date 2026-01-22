/**
 * Sprites Controller
 *
 * API endpoints for Sprites integration:
 * - Sprite lifecycle management (create, stop, resume, delete)
 * - Checkpoint management
 * - Session listing
 * - Organization token configuration
 */

import { Request, Response } from 'express';
import { spritesService } from '../services/SpritesService';
import ProjectSprite from '../models/ProjectSprite';
import Project from '../models/Project';

// ============================================================================
// SPRITES CRUD
// ============================================================================

/**
 * List all sprites for the organization
 */
export const listSprites = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    const { includeDeleted } = req.query;
    const sprites = await ProjectSprite.getByOrganization(
      organizationId,
      includeDeleted === 'true'
    );

    res.json({
      success: true,
      data: sprites,
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
 * Get sprite for a specific project
 */
export const getSpriteByProject = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const organizationId = (req as any).user?.organizationId;

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

    const sprite = await spritesService.getSpriteByProject(projectId);

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
 * Create a new sprite for a project
 */
export const createSprite = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    const { projectId, branch, initScript, cpus, memoryMb } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Verify project belongs to organization and has a GitHub URL
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

    if (!project.githubUrl) {
      return res.status(400).json({
        success: false,
        error: 'Project must have a GitHub URL to create a Sprite',
        timestamp: new Date().toISOString(),
      });
    }

    // Check if project already has an active sprite
    const existingSprite = await ProjectSprite.getByProject(projectId);
    if (existingSprite && existingSprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: 'Project already has an active Sprite',
        data: existingSprite,
        timestamp: new Date().toISOString(),
      });
    }

    // Create the sprite
    const sprite = await spritesService.createSprite({
      projectId,
      organizationId,
      repoUrl: project.githubUrl,
      branch,
      createdById: userId,
    });

    res.status(201).json({
      success: true,
      data: sprite,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[createSprite] Error:', error);
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
    const organizationId = (req as any).user?.organizationId;

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

    // Get details from Sprites API if running
    let spriteDetails = null;
    if (sprite.isActive() && sprite.spriteName) {
      try {
        spriteDetails = await spritesService.getSpriteDetails(
          organizationId,
          sprite.spriteName
        );
      } catch (err) {
        console.warn('[getSprite] Failed to get sprite details from API:', err);
      }
    }

    res.json({
      success: true,
      data: {
        ...sprite.toJSON(),
        apiDetails: spriteDetails,
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
 * Delete a sprite
 */
export const deleteSprite = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

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

    await spritesService.deleteSprite(id);

    res.json({
      success: true,
      message: 'Sprite deleted successfully',
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
 * Stop a sprite
 */
export const stopSprite = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

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

    await spritesService.stopSprite(id);

    // Refresh sprite data
    await sprite.reload();

    res.json({
      success: true,
      data: sprite,
      message: 'Sprite stopped successfully',
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
 * Resume a stopped or hibernating sprite
 */
export const resumeSprite = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;

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

    const resumedSprite = await spritesService.resumeSprite(id);

    // Update access tracking
    await sprite.update({
      lastAccessedAt: new Date(),
      lastAccessedById: userId,
    });

    res.json({
      success: true,
      data: resumedSprite,
      message: 'Sprite resumed successfully',
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
// CHECKPOINTS
// ============================================================================

/**
 * Create a checkpoint for a sprite
 */
export const createCheckpoint = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { comment } = req.body;

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
        error: 'Cannot create checkpoint for inactive sprite',
        timestamp: new Date().toISOString(),
      });
    }

    const checkpoint = await spritesService.createCheckpoint(id, comment);

    res.status(201).json({
      success: true,
      data: checkpoint,
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
 * List checkpoints for a sprite
 */
export const listCheckpoints = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

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

    const checkpoints = await spritesService.listCheckpoints(id);

    res.json({
      success: true,
      data: checkpoints,
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
 * Restore a checkpoint
 */
export const restoreCheckpoint = async (req: Request, res: Response) => {
  try {
    const { id, checkpointId } = req.params;
    const organizationId = (req as any).user?.organizationId;

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

    await spritesService.restoreCheckpoint(id, checkpointId);

    // Refresh sprite data
    await sprite.reload();

    res.json({
      success: true,
      data: sprite,
      message: 'Checkpoint restored successfully',
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
// SESSIONS
// ============================================================================

/**
 * List exec sessions for a sprite
 */
export const listSessions = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

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

    const sessions = await spritesService.listExecSessions(id);

    res.json({
      success: true,
      data: sessions,
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
 * Get WebSocket connection info for a sprite terminal
 */
export const getTerminalInfo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    const { cols, rows, sessionId } = req.query;

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
        error: 'Sprite is not active',
        timestamp: new Date().toISOString(),
      });
    }

    const wsInfo = await spritesService.getExecWebSocketInfo(id, {
      tty: true,
    });

    // Update access tracking
    await sprite.update({
      lastAccessedAt: new Date(),
      lastAccessedById: userId,
    });

    res.json({
      success: true,
      data: wsInfo,
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
// ORGANIZATION CONFIGURATION
// ============================================================================

/**
 * Check if organization has Sprites configured
 */
export const getSpritesConfig = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    const hasToken = await spritesService.hasOrgToken(organizationId);
    const activeSprites = await ProjectSprite.getActiveSprites(organizationId);

    res.json({
      success: true,
      data: {
        configured: hasToken,
        activeSpritesCount: activeSprites.length,
        serviceReady: spritesService.isReady(),
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
 * Set Sprites API token for organization
 */
export const setSpritesToken = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { token } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'API token is required',
        timestamp: new Date().toISOString(),
      });
    }

    await spritesService.setOrgToken(organizationId, token);

    res.json({
      success: true,
      message: 'Sprites API token configured successfully',
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
 * Remove Sprites API token for organization
 */
export const removeSpritesToken = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    await spritesService.removeOrgToken(organizationId);

    res.json({
      success: true,
      message: 'Sprites API token removed',
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
