/**
 * Dead Letter Queue Routes
 *
 * API endpoints for managing failed automation actions that have exhausted retries.
 * Provides visibility into failures and manual recovery options.
 *
 * @swagger
 * tags:
 *   - name: Dead Letters
 *     description: Dead letter queue management for failed automations
 */

import { Router, Request, Response } from 'express';
import { automationEngine } from '../plugins/automation/AutomationEngine';
import DeadLetterQueue, { DeadLetterStatus } from '../models/DeadLetterQueue';

const router = Router();

/**
 * @swagger
 * /api/dead-letters:
 *   get:
 *     summary: List dead letters
 *     description: List dead letters with optional filters
 *     tags: [Dead Letters]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: actionType
 *         schema:
 *           type: string
 *       - in: query
 *         name: automationId
 *         schema:
 *           type: string
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
 *         description: List of dead letters with pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status,
      actionType,
      automationId,
      limit = '50',
      offset = '0',
    } = req.query;

    const result = await automationEngine.getDeadLetters({
      status: status as DeadLetterStatus | undefined,
      actionType: actionType as string | undefined,
      automationId: automationId as string | undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({
      success: true,
      data: result.items,
      pagination: {
        total: result.total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        hasMore: parseInt(offset as string, 10) + result.items.length < result.total,
      },
    });
  } catch (error) {
    console.error('Error fetching dead letters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dead letters',
    });
  }
});

/**
 * @swagger
 * /api/dead-letters/stats:
 *   get:
 *     summary: Get dead letter statistics
 *     description: Get aggregated statistics about the dead letter queue
 *     tags: [Dead Letters]
 *     responses:
 *       200:
 *         description: Queue statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await automationEngine.getDeadLetterStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching dead letter stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dead letter stats',
    });
  }
});

/**
 * GET /api/dead-letters/:id
 * Get a single dead letter by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deadLetter = await DeadLetterQueue.findByPk(id);

    if (!deadLetter) {
      return res.status(404).json({
        success: false,
        error: 'Dead letter not found',
      });
    }

    res.json({
      success: true,
      data: deadLetter,
    });
  } catch (error) {
    console.error('Error fetching dead letter:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dead letter',
    });
  }
});

/**
 * @swagger
 * /api/dead-letters/{id}/retry:
 *   post:
 *     summary: Retry a dead letter
 *     description: Manually retry a failed dead letter action
 *     tags: [Dead Letters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dead letter retried successfully
 *       400:
 *         description: Retry failed
 */
router.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await automationEngine.retryDeadLetter(id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Dead letter action retried successfully',
    });
  } catch (error) {
    console.error('Error retrying dead letter:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry dead letter',
    });
  }
});

/**
 * PATCH /api/dead-letters/:id/resolve
 * Mark a dead letter as resolved
 */
router.patch('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolvedBy, notes } = req.body;

    if (!resolvedBy) {
      return res.status(400).json({
        success: false,
        error: 'resolvedBy is required',
      });
    }

    const result = await automationEngine.resolveDeadLetter(id, resolvedBy, notes);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Dead letter marked as resolved',
    });
  } catch (error) {
    console.error('Error resolving dead letter:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve dead letter',
    });
  }
});

/**
 * PATCH /api/dead-letters/:id/abandon
 * Mark a dead letter as abandoned (give up permanently)
 */
router.patch('/:id/abandon', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await automationEngine.abandonDeadLetter(id, notes);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Dead letter marked as abandoned',
    });
  } catch (error) {
    console.error('Error abandoning dead letter:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to abandon dead letter',
    });
  }
});

/**
 * DELETE /api/dead-letters/:id
 * Delete a dead letter entry
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await automationEngine.deleteDeadLetter(id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Dead letter deleted',
    });
  } catch (error) {
    console.error('Error deleting dead letter:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete dead letter',
    });
  }
});

/**
 * POST /api/dead-letters/cleanup
 * Cleanup old resolved dead letters
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const { retentionDays = 30 } = req.body;

    const deletedCount = await automationEngine.cleanupDeadLetters(retentionDays);

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old dead letters`,
      deletedCount,
    });
  } catch (error) {
    console.error('Error cleaning up dead letters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup dead letters',
    });
  }
});

/**
 * POST /api/dead-letters/bulk-retry
 * Retry multiple dead letters at once
 */
router.post('/bulk-retry', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ids array is required',
      });
    }

    const results = await Promise.all(
      ids.map(async (id: string) => {
        const result = await automationEngine.retryDeadLetter(id);
        return { id, ...result };
      })
    );

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Retried ${succeeded} dead letters, ${failed} failed`,
      results,
    });
  } catch (error) {
    console.error('Error bulk retrying dead letters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk retry dead letters',
    });
  }
});

/**
 * POST /api/dead-letters/bulk-resolve
 * Resolve multiple dead letters at once
 */
router.post('/bulk-resolve', async (req: Request, res: Response) => {
  try {
    const { ids, resolvedBy, notes } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ids array is required',
      });
    }

    if (!resolvedBy) {
      return res.status(400).json({
        success: false,
        error: 'resolvedBy is required',
      });
    }

    const results = await Promise.all(
      ids.map(async (id: string) => {
        const result = await automationEngine.resolveDeadLetter(id, resolvedBy, notes);
        return { id, ...result };
      })
    );

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Resolved ${succeeded} dead letters, ${failed} failed`,
      results,
    });
  } catch (error) {
    console.error('Error bulk resolving dead letters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk resolve dead letters',
    });
  }
});

export default router;
