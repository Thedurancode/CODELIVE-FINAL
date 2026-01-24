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
// SPRITE SETTINGS
// ============================================================================

/**
 * Update sprite settings (e.g., autoShutdownAfterTask)
 */
export const updateSpriteSettings = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { autoShutdownAfterTask } = req.body;

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
    const updates: Partial<{ autoShutdownAfterTask: boolean }> = {};
    if (typeof autoShutdownAfterTask === 'boolean') {
      updates.autoShutdownAfterTask = autoShutdownAfterTask;
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
