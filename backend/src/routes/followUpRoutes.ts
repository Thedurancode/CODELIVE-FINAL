/**
 * Follow-Up Routes
 *
 * API endpoints for managing follow-up chains and executions.
 *
 * @swagger
 * tags:
 *   - name: Follow-Up Chains
 *     description: Manage follow-up chain templates
 *   - name: Follow-Up Executions
 *     description: Manage follow-up chain executions
 */

import { Router, Request, Response } from 'express';
import FollowUpChain from '../models/FollowUpChain';
import FollowUpExecution from '../models/FollowUpExecution';
import { followUpService } from '../services/FollowUpService';
import { followUpScheduler } from '../services/FollowUpScheduler';

const router = Router();

// ============================================================================
// FOLLOW-UP CHAINS
// ============================================================================

/**
 * @swagger
 * /api/follow-up/chains:
 *   get:
 *     summary: List all follow-up chains
 *     tags: [Follow-Up Chains]
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *     responses:
 *       200:
 *         description: List of follow-up chains
 */
router.get('/chains', async (req: Request, res: Response) => {
  try {
    const { active } = req.query;

    const where: any = {};
    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;

    const chains = await FollowUpChain.findAll({
      where,
      order: [['priority', 'ASC'], ['name', 'ASC']],
    });

    res.json({
      success: true,
      data: chains,
    });
  } catch (error) {
    console.error('Error fetching follow-up chains:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch follow-up chains',
    });
  }
});

/**
 * @swagger
 * /api/follow-up/chains/{id}:
 *   get:
 *     summary: Get a single chain
 *     tags: [Follow-Up Chains]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chain details
 *       404:
 *         description: Chain not found
 */
router.get('/chains/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const chain = await FollowUpChain.findByPk(id);

    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'Chain not found',
      });
    }

    res.json({
      success: true,
      data: chain,
    });
  } catch (error) {
    console.error('Error fetching chain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chain',
    });
  }
});

/**
 * @swagger
 * /api/follow-up/chains:
 *   post:
 *     summary: Create a new follow-up chain
 *     tags: [Follow-Up Chains]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, triggerEvent, steps]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               triggerEvent:
 *                 type: string
 *               steps:
 *                 type: array
 *               priority:
 *                 type: number
 *     responses:
 *       201:
 *         description: Chain created
 *       400:
 *         description: Invalid configuration
 */
router.post('/chains', async (req: Request, res: Response) => {
  try {
    const { name, description, triggerEvent, steps, priority, triggerConditions } = req.body;

    if (!name || !triggerEvent || !steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'name, triggerEvent, and steps are required',
      });
    }

    const chain = await FollowUpChain.create({
      name,
      description,
      triggerEvent,
      steps,
      priority: priority || 100,
      triggerConditions,
      isActive: true,
    });

    // Validate the chain
    const validation = chain.validateChain();
    if (!validation.valid) {
      await chain.destroy();
      return res.status(400).json({
        success: false,
        error: 'Invalid chain configuration',
        details: validation.errors,
      });
    }

    res.status(201).json({
      success: true,
      data: chain,
    });
  } catch (error) {
    console.error('Error creating chain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create chain',
    });
  }
});

/**
 * PATCH /api/follow-up/chains/:id
 * Update a chain
 */
router.patch('/chains/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const chain = await FollowUpChain.findByPk(id);
    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'Chain not found',
      });
    }

    await chain.update(updates);

    // Validate after update
    const validation = chain.validateChain();
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid chain configuration after update',
        details: validation.errors,
      });
    }

    res.json({
      success: true,
      data: chain,
    });
  } catch (error) {
    console.error('Error updating chain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update chain',
    });
  }
});

/**
 * DELETE /api/follow-up/chains/:id
 * Delete a chain
 */
router.delete('/chains/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const chain = await FollowUpChain.findByPk(id);
    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'Chain not found',
      });
    }

    // Cancel any active executions for this chain
    await FollowUpExecution.update(
      { status: 'cancelled', cancelReason: 'Chain deleted' },
      { where: { chainId: id, status: 'active' } }
    );

    await chain.destroy();

    res.json({
      success: true,
      message: 'Chain deleted',
    });
  } catch (error) {
    console.error('Error deleting chain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete chain',
    });
  }
});

/**
 * POST /api/follow-up/chains/:id/toggle
 * Toggle chain active status
 */
router.post('/chains/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const chain = await FollowUpChain.findByPk(id);
    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'Chain not found',
      });
    }

    chain.isActive = !chain.isActive;
    await chain.save();

    res.json({
      success: true,
      data: chain,
      message: `Chain ${chain.isActive ? 'activated' : 'deactivated'}`,
    });
  } catch (error) {
    console.error('Error toggling chain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle chain',
    });
  }
});

// ============================================================================
// FOLLOW-UP EXECUTIONS
// ============================================================================

/**
 * GET /api/follow-up/executions
 * List executions with filters
 */
router.get('/executions', async (req: Request, res: Response) => {
  try {
    const {
      status,
      chainId,
      dealId,
      offerId,
      limit = '50',
      offset = '0',
    } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (chainId) where.chainId = chainId;
    if (dealId) where.dealId = dealId;
    if (offerId) where.offerId = offerId;

    const { rows, count } = await FollowUpExecution.findAndCountAll({
      where,
      order: [['nextExecutionAt', 'ASC']],
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
    });
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch executions',
    });
  }
});

/**
 * GET /api/follow-up/executions/:id
 * Get a single execution
 */
router.get('/executions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const execution = await FollowUpExecution.findByPk(id);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found',
      });
    }

    res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    console.error('Error fetching execution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch execution',
    });
  }
});

/**
 * POST /api/follow-up/executions/start
 * Manually start a chain for a deal/offer
 */
router.post('/executions/start', async (req: Request, res: Response) => {
  try {
    const { chainId, dealId, offerId, userId, context } = req.body;

    if (!chainId) {
      return res.status(400).json({
        success: false,
        error: 'chainId is required',
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    const execution = await followUpService.startChain(chainId, {
      dealId,
      offerId,
      userId,
      context,
    });

    res.status(201).json({
      success: true,
      data: execution,
    });
  } catch (error) {
    console.error('Error starting chain:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start chain',
    });
  }
});

/**
 * POST /api/follow-up/executions/:id/cancel
 * Cancel an execution
 */
router.post('/executions/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const execution = await FollowUpExecution.findByPk(id);
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found',
      });
    }

    if (!execution.isActive() && execution.status !== 'paused') {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel execution with status: ' + execution.status,
      });
    }

    execution.markCancelled(reason || 'Manually cancelled');
    await execution.save();

    res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    console.error('Error cancelling execution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel execution',
    });
  }
});

/**
 * POST /api/follow-up/executions/:id/pause
 * Pause an execution
 */
router.post('/executions/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const execution = await FollowUpExecution.findByPk(id);
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found',
      });
    }

    if (!execution.isActive()) {
      return res.status(400).json({
        success: false,
        error: 'Cannot pause execution with status: ' + execution.status,
      });
    }

    execution.pause();
    await execution.save();

    res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    console.error('Error pausing execution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause execution',
    });
  }
});

/**
 * POST /api/follow-up/executions/:id/resume
 * Resume a paused execution
 */
router.post('/executions/:id/resume', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const execution = await FollowUpExecution.findByPk(id);
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found',
      });
    }

    if (execution.status !== 'paused') {
      return res.status(400).json({
        success: false,
        error: 'Cannot resume execution with status: ' + execution.status,
      });
    }

    execution.resume();
    await execution.save();

    res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    console.error('Error resuming execution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume execution',
    });
  }
});

// ============================================================================
// SCHEDULER & STATS
// ============================================================================

/**
 * GET /api/follow-up/stats
 * Get follow-up statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const executionStats = await followUpService.getStats();
    const schedulerStatus = followUpScheduler.getStatus();
    const activeChains = await FollowUpChain.count({ where: { isActive: true } });
    const totalChains = await FollowUpChain.count();

    res.json({
      success: true,
      data: {
        chains: {
          total: totalChains,
          active: activeChains,
        },
        executions: executionStats,
        scheduler: schedulerStatus,
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats',
    });
  }
});

/**
 * POST /api/follow-up/process
 * Manually trigger processing of due follow-ups
 */
router.post('/process', async (req: Request, res: Response) => {
  try {
    const result = await followUpScheduler.run();

    res.json({
      success: true,
      data: result,
      message: `Processed ${result.processed} follow-ups, ${result.errors} errors`,
    });
  } catch (error) {
    console.error('Error processing follow-ups:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process follow-ups',
    });
  }
});

/**
 * POST /api/follow-up/cleanup
 * Cleanup old executions
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const { retentionDays = 30 } = req.body;
    const deleted = await followUpScheduler.cleanup(retentionDays);

    res.json({
      success: true,
      message: `Cleaned up ${deleted} old executions`,
      deleted,
    });
  } catch (error) {
    console.error('Error cleaning up:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup',
    });
  }
});

/**
 * POST /api/follow-up/trigger
 * Manually trigger chains for an event
 */
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { triggerEvent, dealId, offerId, userId, context } = req.body;

    if (!triggerEvent) {
      return res.status(400).json({
        success: false,
        error: 'triggerEvent is required',
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    const executions = await followUpService.triggerChains(triggerEvent, {
      dealId,
      offerId,
      userId,
      context,
    });

    res.json({
      success: true,
      data: executions,
      message: `Started ${executions.length} chain(s)`,
    });
  } catch (error) {
    console.error('Error triggering chains:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger chains',
    });
  }
});

export default router;
