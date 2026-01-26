/**
 * Deploy Hooks Controller
 *
 * Handles HTTP requests for deploy hook management.
 */

import { Request, Response } from 'express';
import { deployHookService } from '../services/DeployHookService';

/**
 * Create a new deploy hook
 */
export const createHook = async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = req.user as { organizationId: string; userId: string };
    const {
      projectId,
      name,
      provider,
      webhookUrl,
      environment,
      triggers,
      branchFilter,
      labelFilter,
      providerConfig,
    } = req.body;

    if (!projectId || !name || !provider || !webhookUrl) {
      return res.status(400).json({
        success: false,
        error: 'projectId, name, provider, and webhookUrl are required',
      });
    }

    const hook = await deployHookService.createHook({
      projectId,
      organizationId,
      createdById: userId,
      name,
      provider,
      webhookUrl,
      environment,
      triggers,
      branchFilter,
      labelFilter,
      providerConfig,
    });

    res.json({ success: true, data: hook });
  } catch (error) {
    console.error('[deployHooksController] createHook error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get all hooks for a project
 */
export const getHooks = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user as { organizationId: string };
    const { projectId } = req.query;

    let hooks;
    if (projectId) {
      hooks = await deployHookService.getHooksByProject(projectId as string);
    } else {
      hooks = await deployHookService.getHooksByOrganization(organizationId);
    }

    res.json({ success: true, data: hooks });
  } catch (error) {
    console.error('[deployHooksController] getHooks error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get a single hook
 */
export const getHook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const hook = await deployHookService.getHook(id);
    if (!hook) {
      return res.status(404).json({
        success: false,
        error: 'Hook not found',
      });
    }

    res.json({ success: true, data: hook });
  } catch (error) {
    console.error('[deployHooksController] getHook error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Update a hook
 */
export const updateHook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      webhookUrl,
      environment,
      status,
      triggers,
      branchFilter,
      labelFilter,
      providerConfig,
    } = req.body;

    const hook = await deployHookService.updateHook(id, {
      name,
      webhookUrl,
      environment,
      status,
      triggers,
      branchFilter,
      labelFilter,
      providerConfig,
    });

    if (!hook) {
      return res.status(404).json({
        success: false,
        error: 'Hook not found',
      });
    }

    res.json({ success: true, data: hook });
  } catch (error) {
    console.error('[deployHooksController] updateHook error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Delete a hook
 */
export const deleteHook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await deployHookService.deleteHook(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Hook not found',
      });
    }

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[deployHooksController] deleteHook error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Toggle hook status (active/inactive)
 */
export const toggleHook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const hook = await deployHookService.toggleHook(id);
    if (!hook) {
      return res.status(404).json({
        success: false,
        error: 'Hook not found',
      });
    }

    res.json({ success: true, data: hook });
  } catch (error) {
    console.error('[deployHooksController] toggleHook error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Trigger a hook manually
 */
export const triggerHook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await deployHookService.triggerManually(id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[deployHooksController] triggerHook error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Test hook connection
 */
export const testHook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await deployHookService.testHook(id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[deployHooksController] testHook error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get deployment statistics for a project
 */
export const getProjectStats = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const stats = await deployHookService.getProjectStats(projectId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[deployHooksController] getProjectStats error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

export default {
  createHook,
  getHooks,
  getHook,
  updateHook,
  deleteHook,
  toggleHook,
  triggerHook,
  testHook,
  getProjectStats,
};
