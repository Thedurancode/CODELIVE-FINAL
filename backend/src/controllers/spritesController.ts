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
 * Syncs status with Sprites.dev API to show accurate status
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

    const { includeDeleted, syncStatus } = req.query;
    const sprites = await ProjectSprite.getByOrganization(
      organizationId,
      includeDeleted === 'true'
    );

    // Optionally sync status with Sprites.dev API (default: true)
    if (syncStatus !== 'false') {
      try {
        // Fetch actual sprites from Sprites.dev API
        const apiSprites = await spritesService.listSpritesFromApi(organizationId);
        const apiStatusMap = new Map<string, string>();

        for (const apiSprite of apiSprites.sprites) {
          // Get detailed status for each sprite
          try {
            const details = await spritesService.getSpriteDetails(organizationId, apiSprite.name);
            apiStatusMap.set(apiSprite.name, details.status);
          } catch {
            // Sprite might not exist anymore
            apiStatusMap.set(apiSprite.name, 'unknown');
          }
        }

        // Update local status based on API status
        for (const sprite of sprites) {
          const apiStatus = apiStatusMap.get(sprite.spriteName);
          if (apiStatus) {
            let newStatus = sprite.status;
            if (apiStatus === 'warm' || apiStatus === 'cold') {
              newStatus = 'hibernating';
            } else if (apiStatus === 'running' || apiStatus === 'hot') {
              newStatus = 'running';
            }

            // Don't overwrite user-requested statuses: error, deleted, stopped
            const protectedStatuses = ['error', 'deleted', 'stopped'];
            if (newStatus !== sprite.status && !protectedStatuses.includes(sprite.status)) {
              await sprite.update({ status: newStatus });
            }
          }
        }

        // Reload sprites to get updated status
        const updatedSprites = await ProjectSprite.getByOrganization(
          organizationId,
          includeDeleted === 'true'
        );

        return res.json({
          success: true,
          data: updatedSprites,
          timestamp: new Date().toISOString(),
        });
      } catch (syncError) {
        console.warn('[listSprites] Failed to sync with Sprites API:', syncError);
        // Fall through to return local data
      }
    }

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

    // Verify project exists (shared workspace - all authenticated users can access all projects)
    const project = await Project.findByPk(projectId);

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
    const userOrgId = (req as any).user?.organizationId;

    const { projectId, branch, initScript, cpus, memoryMb } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Verify project exists (shared workspace - all authenticated users can access all projects)
    const project = await Project.findByPk(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Use project's organization_id, or user's organizationId, or fail
    const organizationId = (project as any).organization_id || userOrgId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required. Please ensure you belong to an organization.',
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

    // Check if project already has a sprite
    const existingSprite = await ProjectSprite.getByProject(projectId);

    if (existingSprite) {
      // If sprite is active, return it
      if (existingSprite.isActive()) {
        return res.status(400).json({
          success: false,
          error: 'Project already has an active Sprite',
          data: existingSprite,
          timestamp: new Date().toISOString(),
        });
      }

      // If sprite exists but is stopped/hibernated, resume it instead of creating new
      if (existingSprite.status === 'stopped' || existingSprite.status === 'hibernated') {
        console.log(`[createSprite] Resuming existing sprite ${existingSprite.id} instead of creating new`);
        const resumedSprite = await spritesService.resumeSprite(existingSprite.id);
        return res.status(200).json({
          success: true,
          data: resumedSprite,
          message: 'Resumed existing sprite',
          timestamp: new Date().toISOString(),
        });
      }

      // If sprite is in error state, delete it and create new
      if (existingSprite.status === 'error') {
        console.log(`[createSprite] Deleting errored sprite ${existingSprite.id} before creating new`);
        try {
          await spritesService.deleteSprite(existingSprite.id);
        } catch (err) {
          console.warn('[createSprite] Failed to delete errored sprite:', err);
        }
      }
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

    // Handle rate limit errors specifically
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Too many requests') || errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      return res.status(429).json({
        success: false,
        error: 'Rate limited by Sprites.dev API. Please wait a few minutes and try again.',
        retryAfter: 60, // Suggest retry after 60 seconds
        timestamp: new Date().toISOString(),
      });
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
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
    const quick = req.query.quick === 'true' || req.body?.quick === true;

    // Shared workspace - all authenticated users can stop sprites
    const sprite = await ProjectSprite.findByPk(id);

    if (!sprite) {
      return res.status(404).json({
        success: false,
        error: 'Sprite not found',
        timestamp: new Date().toISOString(),
      });
    }

    await spritesService.stopSprite(id, { quick });

    // Refresh sprite data
    await sprite.reload();

    res.json({
      success: true,
      data: sprite,
      message: quick ? 'Sprite quick stopped (will auto-hibernate)' : 'Sprite stopped successfully',
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
    const userId = (req as any).user?.id;

    // Shared workspace - all authenticated users can resume sprites
    const sprite = await ProjectSprite.findByPk(id);

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

/**
 * Initialize or re-initialize a sprite (clone repo, setup Claude)
 */
export const initializeSprite = async (req: Request, res: Response) => {
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

    // Update status to initializing
    await sprite.update({
      status: 'initializing',
      statusMessage: 'Running initialization (cloning repo, setting up Claude)...',
      lastAccessedAt: new Date(),
      lastAccessedById: userId,
    });

    // Run initialization (this clones the repo and sets up Claude)
    await spritesService.initializeSprite(id);

    // Reload to get updated status
    await sprite.reload();

    res.json({
      success: true,
      data: sprite,
      message: 'Sprite initialized successfully',
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
// DEV SERVER
// ============================================================================

/**
 * Start the dev server on a sprite
 */
export const startDevServer = async (req: Request, res: Response) => {
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

    await spritesService.startDevServer(id);
    await sprite.reload();

    res.json({
      success: true,
      data: sprite,
      message: `Dev server started on port ${sprite.devServerPort}`,
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
 * Stop the dev server on a sprite
 */
export const stopDevServer = async (req: Request, res: Response) => {
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

    await spritesService.stopDevServer(id);
    await sprite.reload();

    res.json({
      success: true,
      data: sprite,
      message: 'Dev server stopped',
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
 * Restart the dev server on a sprite
 */
export const restartDevServer = async (req: Request, res: Response) => {
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

    await spritesService.restartDevServer(id);
    await sprite.reload();

    res.json({
      success: true,
      data: sprite,
      message: `Dev server restarted on port ${sprite.devServerPort}`,
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
 * Kill an exec session with streaming events
 */
export const killSession = async (req: Request, res: Response) => {
  try {
    const { id, sessionId } = req.params;
    const { signal, timeout } = req.query;
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

    const events = await spritesService.killExecSession(id, sessionId, {
      signal: signal as string,
      timeout: timeout as string,
    });

    res.json({
      success: true,
      data: {
        events,
        sessionId,
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

/**
 * Update URL settings for a sprite (public/private access)
 */
export const updateUrlSettings = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { auth } = req.body;

    if (!auth || !['sprite', 'public'].includes(auth)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid auth value. Must be "sprite" or "public"',
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

    await spritesService.updateUrlSettings(id, { auth });

    // Reload to get updated settings
    await sprite.reload();

    res.json({
      success: true,
      data: sprite,
      message: `URL access set to ${auth === 'public' ? 'public' : 'private'}`,
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

// ============================================================================
// GITHUB TOKEN CONFIGURATION
// ============================================================================

/**
 * Get GitHub configuration status for organization
 */
export const getGitHubConfig = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    const hasToken = await spritesService.hasGitHubToken(organizationId);
    const tokenPrefix = await spritesService.getGitHubTokenPrefix(organizationId);

    res.json({
      success: true,
      data: {
        configured: hasToken,
        tokenPrefix: tokenPrefix,
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
 * Set GitHub Personal Access Token for organization
 * This token is used to authenticate git operations in sprites
 * Required scopes: repo, workflow (for PR creation and pushing)
 */
export const setGitHubToken = async (req: Request, res: Response) => {
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
        error: 'GitHub token is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Basic validation: GitHub PATs start with 'ghp_' (classic) or 'github_pat_' (fine-grained)
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid GitHub token format. Token should start with "ghp_" (classic) or "github_pat_" (fine-grained)',
        timestamp: new Date().toISOString(),
      });
    }

    await spritesService.setGitHubToken(organizationId, token);

    res.json({
      success: true,
      message: 'GitHub token configured successfully. New sprites will be authenticated with GitHub.',
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
 * Remove GitHub token for organization
 */
export const removeGitHubToken = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    await spritesService.removeGitHubToken(organizationId);

    res.json({
      success: true,
      message: 'GitHub token removed. New sprites will not have GitHub authentication.',
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
// ANTHROPIC API KEY MANAGEMENT (Z.AI)
// ============================================================================

/**
 * Get Anthropic API key status for organization
 */
export const getAnthropicApiKeyStatus = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    const hasKey = await spritesService.hasAnthropicApiKey(organizationId);
    const keyPrefix = hasKey ? await spritesService.getAnthropicApiKeyPrefix(organizationId) : null;

    res.json({
      success: true,
      data: {
        configured: hasKey,
        keyPrefix: keyPrefix,
        provider: 'z.ai',
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
 * Set Anthropic API key for organization (Z.AI)
 * This key is used to configure Claude CLI in sprites
 */
export const setAnthropicApiKey = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { apiKey } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required',
        timestamp: new Date().toISOString(),
      });
    }

    await spritesService.setAnthropicApiKey(organizationId, apiKey);

    res.json({
      success: true,
      message: 'Anthropic API key configured successfully. New sprites will use Z.AI for Claude.',
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
 * Remove Anthropic API key for organization
 */
export const removeAnthropicApiKey = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    await spritesService.removeAnthropicApiKey(organizationId);

    res.json({
      success: true,
      message: 'Anthropic API key removed. New sprites will not have Claude configured.',
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
// SPRITE SETTINGS
// ============================================================================

/**
 * Update sprite settings (e.g., autoShutdownAfterTask, shell persistence)
 */
export const updateSpriteSettings = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { autoShutdownAfterTask, startupCommand, lastShellDirectory } = req.body;

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

    // Build updates object with only provided fields
    const updates: Partial<{
      autoShutdownAfterTask: boolean;
      startupCommand: string | null;
      lastShellDirectory: string | null;
    }> = {};

    if (typeof autoShutdownAfterTask === 'boolean') {
      updates.autoShutdownAfterTask = autoShutdownAfterTask;
    }

    // Shell persistence settings
    if (startupCommand !== undefined) {
      // Allow setting to null/empty to clear
      updates.startupCommand = startupCommand || null;
    }

    if (lastShellDirectory !== undefined) {
      // Allow setting to null/empty to clear
      updates.lastShellDirectory = lastShellDirectory || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid settings provided to update',
        timestamp: new Date().toISOString(),
      });
    }

    await sprite.update(updates);

    res.json({
      success: true,
      data: sprite,
      message: 'Sprite settings updated successfully',
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
// FILESYSTEM API
// ============================================================================

/**
 * Read file contents from sprite filesystem
 */
export const readFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { path, workingDir } = req.query;

    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'Path is required',
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

    const content = await spritesService.readFile(
      id,
      path as string,
      (workingDir as string) || '/home/sprite'
    );

    // Set content type and return raw bytes
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(content);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Read file contents as text from sprite filesystem
 */
export const readFileText = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { path, workingDir } = req.query;

    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'Path is required',
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

    const content = await spritesService.readFileText(
      id,
      path as string,
      (workingDir as string) || '/home/sprite'
    );

    res.json({
      success: true,
      data: {
        path,
        content,
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
 * Write file contents to sprite filesystem
 */
export const writeFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { path, workingDir, mode, mkdir } = req.query;
    const content = req.body;

    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'Path is required',
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

    await spritesService.writeFile(id, path as string, content, {
      workingDir: (workingDir as string) || '/home/sprite',
      mode: mode as string,
      mkdir: mkdir === 'true',
    });

    res.json({
      success: true,
      message: 'File written successfully',
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
 * List directory contents
 */
export const listDirectory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { path, workingDir } = req.query;

    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'Path is required',
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

    const entries = await spritesService.listDirectory(
      id,
      path as string,
      (workingDir as string) || '/home/sprite'
    );

    res.json({
      success: true,
      data: {
        path,
        entries,
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
 * Delete file or directory
 */
export const deleteFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { path, workingDir, recursive, asRoot } = req.body;

    if (!path || !workingDir) {
      return res.status(400).json({
        success: false,
        error: 'Path and workingDir are required',
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

    await spritesService.deleteFile(id, {
      path,
      workingDir,
      recursive: recursive ?? false,
      asRoot: asRoot ?? false,
    });

    res.json({
      success: true,
      message: 'File/directory deleted successfully',
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
 * Rename or move file/directory
 */
export const renameFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { source, dest, workingDir, asRoot } = req.body;

    if (!source || !dest || !workingDir) {
      return res.status(400).json({
        success: false,
        error: 'Source, dest, and workingDir are required',
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

    await spritesService.renameFile(id, {
      source,
      dest,
      workingDir,
      asRoot: asRoot ?? false,
    });

    res.json({
      success: true,
      message: 'File/directory renamed successfully',
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
 * Copy file or directory
 */
export const copyFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { source, dest, workingDir, recursive, preserveAttrs, asRoot } = req.body;

    if (!source || !dest || !workingDir) {
      return res.status(400).json({
        success: false,
        error: 'Source, dest, and workingDir are required',
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

    await spritesService.copyFile(id, {
      source,
      dest,
      workingDir,
      recursive: recursive ?? false,
      preserveAttrs: preserveAttrs ?? false,
      asRoot: asRoot ?? false,
    });

    res.json({
      success: true,
      message: 'File/directory copied successfully',
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
 * Change file permissions (chmod)
 */
export const chmod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { path, workingDir, mode, recursive, asRoot } = req.body;

    if (!path || !workingDir || !mode) {
      return res.status(400).json({
        success: false,
        error: 'Path, workingDir, and mode are required',
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

    await spritesService.chmod(id, {
      path,
      workingDir,
      mode,
      recursive: recursive ?? false,
      asRoot: asRoot ?? false,
    });

    res.json({
      success: true,
      message: 'File permissions changed successfully',
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
 * Change file ownership (chown)
 */
export const chown = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { path, workingDir, uid, gid, recursive, asRoot } = req.body;

    if (!path || !workingDir || uid === undefined || gid === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Path, workingDir, uid, and gid are required',
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

    await spritesService.chown(id, {
      path,
      workingDir,
      uid,
      gid,
      recursive: recursive ?? false,
      asRoot: asRoot ?? false,
    });

    res.json({
      success: true,
      message: 'File ownership changed successfully',
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
 * Execute a command in a sprite (non-interactive)
 * POST /api/sprites/:id/exec
 */
export const execCommand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { command, workDir, timeout } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'Command is required',
        timestamp: new Date().toISOString(),
      });
    }

    const organizationId = (req as any).user?.organizationId;

    // Validate sprite exists and belongs to user's org
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

    // Check sprite is running
    if (sprite.status !== 'running') {
      return res.status(400).json({
        success: false,
        error: `Sprite is not running (status: ${sprite.status})`,
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.spriteName) {
      return res.status(400).json({
        success: false,
        error: 'Sprite has no API name assigned',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spritesService.execCommand(
      sprite.organizationId,
      sprite.spriteName,
      command,
      { workDir, timeout }
    );

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
 * Get WebSocket info for filesystem watch
 */
export const getFilesystemWatchInfo = async (req: Request, res: Response) => {
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

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: 'Sprite is not active',
        timestamp: new Date().toISOString(),
      });
    }

    const wsInfo = await spritesService.getFilesystemWatchInfo(id);

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
// SERVICES API
// ============================================================================

/**
 * List all services for a sprite
 */
export const listServices = async (req: Request, res: Response) => {
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

    const services = await spritesService.listServices(id);

    res.json({
      success: true,
      data: services,
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
 * Get a specific service
 */
export const getService = async (req: Request, res: Response) => {
  try {
    const { id, serviceId } = req.params;
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

    const service = await spritesService.getService(id, serviceId);

    res.json({
      success: true,
      data: service,
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
 * Create a new service
 */
export const createService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { name, command, args, workingDir, env, autoStart, port } = req.body;

    if (!name || !command) {
      return res.status(400).json({
        success: false,
        error: 'Name and command are required',
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
        error: 'Sprite must be running to create services',
        timestamp: new Date().toISOString(),
      });
    }

    const service = await spritesService.createService(id, {
      name,
      command,
      args,
      workingDir,
      env,
      autoStart,
      port,
    });

    res.status(201).json({
      success: true,
      data: service,
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
 * Start a service
 */
export const startService = async (req: Request, res: Response) => {
  try {
    const { id, serviceId } = req.params;
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

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: 'Sprite must be running to start services',
        timestamp: new Date().toISOString(),
      });
    }

    const service = await spritesService.startService(id, serviceId);

    res.json({
      success: true,
      data: service,
      message: 'Service started successfully',
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
 * Stop a service
 */
export const stopService = async (req: Request, res: Response) => {
  try {
    const { id, serviceId } = req.params;
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

    const service = await spritesService.stopService(id, serviceId);

    res.json({
      success: true,
      data: service,
      message: 'Service stopped successfully',
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
 * Restart a service
 */
export const restartService = async (req: Request, res: Response) => {
  try {
    const { id, serviceId } = req.params;
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

    if (!sprite.isActive()) {
      return res.status(400).json({
        success: false,
        error: 'Sprite must be running to restart services',
        timestamp: new Date().toISOString(),
      });
    }

    const service = await spritesService.restartService(id, serviceId);

    res.json({
      success: true,
      data: service,
      message: 'Service restarted successfully',
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
 * Delete a service
 */
export const deleteService = async (req: Request, res: Response) => {
  try {
    const { id, serviceId } = req.params;
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

    await spritesService.deleteService(id, serviceId);

    res.json({
      success: true,
      message: 'Service deleted successfully',
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
 * Get service logs
 */
export const getServiceLogs = async (req: Request, res: Response) => {
  try {
    const { id, serviceId } = req.params;
    const { tail, since } = req.query;
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

    const logs = await spritesService.getServiceLogs(id, serviceId, {
      tail: tail ? parseInt(tail as string, 10) : undefined,
      since: since as string,
    });

    res.json({
      success: true,
      data: logs,
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
// GIT & PULL REQUEST
// ============================================================================

/**
 * Get branch status for a sprite
 */
export const getBranchStatus = async (req: Request, res: Response) => {
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

    if (!sprite.spriteName) {
      return res.status(400).json({
        success: false,
        error: 'Sprite not initialized',
        timestamp: new Date().toISOString(),
      });
    }

    const status = await spritesService.getBranchStatus(id);

    res.json({
      success: true,
      data: status,
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
 * Push local commits to remote
 */
export const pushChanges = async (req: Request, res: Response) => {
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

    if (!sprite.githubConfigured) {
      return res.status(400).json({
        success: false,
        error: 'GitHub is not configured for this sprite',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await spritesService.pushChanges(id);

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
 * Get existing pull request for sprite
 */
export const getPullRequest = async (req: Request, res: Response) => {
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

    const pr = await spritesService.getPullRequest(id);

    res.json({
      success: true,
      data: pr,
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
 * Create a pull request from sprite
 */
export const createPullRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { title, body, draft } = req.body;

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

    if (!sprite.featureBranch) {
      return res.status(400).json({
        success: false,
        error: 'No feature branch configured for this sprite',
        timestamp: new Date().toISOString(),
      });
    }

    if (!sprite.githubConfigured) {
      return res.status(400).json({
        success: false,
        error: 'GitHub is not configured for this sprite',
        timestamp: new Date().toISOString(),
      });
    }

    const pr = await spritesService.createPullRequest(id, {
      title,
      body,
      draft: draft ?? false,
    });

    res.status(201).json({
      success: true,
      data: pr,
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
