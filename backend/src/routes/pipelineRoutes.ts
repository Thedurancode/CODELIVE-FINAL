/**
 * Pipeline Routes
 *
 * API endpoints for deal pipeline management
 *
 * SECURITY:
 * - All routes require authentication
 * - Users can only access their own pipeline deals
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { pipelineService } from '../services/PipelineService';
import { PipelineStage, PipelineOutcome } from '../models/DealPipeline';
import { authenticate } from '../middleware/auth';
import { safeParseInt } from '../utils/security';

const router = Router();

// Rate limit for pipeline operations
const pipelineLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: 'Too many requests.' },
});

// Apply authentication to ALL pipeline routes
router.use(authenticate);
router.use(pipelineLimiter);

/**
 * @swagger
 * tags:
 *   name: Pipeline
 *   description: Deal pipeline management
 */

/**
 * @swagger
 * /api/pipeline:
 *   get:
 *     summary: Get user's pipeline
 *     description: Get all deals in the user's pipeline
 *     tags: [Pipeline]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *           enum: [new, analyzing, due_diligence, offered, negotiating, under_contract, closed_won, closed_lost]
 *       - in: query
 *         name: includeCompleted
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: User's pipeline
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // SECURITY: Only use authenticated user's ID - never trust query params
    const userId = req.user?.id;
    const { stage, includeCompleted, limit, offset } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await pipelineService.getUserPipeline(userId as string, {
      stage: stage as PipelineStage,
      includeCompleted: includeCompleted === 'true',
      limit: safeParseInt(limit, { min: 1, max: 100 }) || undefined,
      offset: safeParseInt(offset, { min: 0 }) || undefined,
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/pipeline:
 *   post:
 *     summary: Add deal to pipeline
 *     description: Add a new deal to the user's pipeline
 *     tags: [Pipeline]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - dealId
 *             properties:
 *               userId:
 *                 type: string
 *               dealId:
 *                 type: string
 *               stage:
 *                 type: string
 *               propertyId:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Deal added to pipeline
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, dealId, stage, propertyId, snapshot, notes, triggeredBy } =
      req.body;

    if (!userId || !dealId) {
      return res
        .status(400)
        .json({ success: false, error: 'userId and dealId are required' });
    }

    const pipeline = await pipelineService.addToPipeline(userId, dealId, {
      stage,
      propertyId,
      snapshot,
      notes,
      triggeredBy,
    });

    res.status(201).json({
      success: true,
      data: pipeline,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/pipeline/{id}:
 *   get:
 *     summary: Get pipeline item
 *     description: Get a specific pipeline item by ID
 *     tags: [Pipeline]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pipeline item
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pipeline = await pipelineService.getPipelineItem(id);

    if (!pipeline) {
      return res.status(404).json({ success: false, error: 'Pipeline item not found' });
    }

    res.json({
      success: true,
      data: pipeline,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/pipeline/{id}/stage:
 *   patch:
 *     summary: Update pipeline stage
 *     description: Move a deal to a new stage in the pipeline
 *     tags: [Pipeline]
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
 *               - stage
 *             properties:
 *               stage:
 *                 type: string
 *                 enum: [new, analyzing, due_diligence, offered, negotiating, under_contract, closed_won, closed_lost]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Stage updated
 */
router.patch('/:id/stage', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { stage, notes, triggeredBy } = req.body;

    if (!stage) {
      return res.status(400).json({ success: false, error: 'stage is required' });
    }

    const pipeline = await pipelineService.updateStage(id, stage, {
      notes,
      triggeredBy,
    });

    res.json({
      success: true,
      data: pipeline,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/pipeline/{id}/close:
 *   post:
 *     summary: Close a deal
 *     description: Mark a deal as closed (won, lost, or withdrawn)
 *     tags: [Pipeline]
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
 *               - outcome
 *             properties:
 *               outcome:
 *                 type: string
 *                 enum: [won, lost, withdrawn]
 *               closePrice:
 *                 type: number
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Deal closed
 */
router.post('/:id/close', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { outcome, closePrice, reason } = req.body;

    if (!outcome) {
      return res.status(400).json({ success: false, error: 'outcome is required' });
    }

    const pipeline = await pipelineService.markAsClosed(
      id,
      outcome as PipelineOutcome,
      { closePrice, reason }
    );

    res.json({
      success: true,
      data: pipeline,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/pipeline/{id}/to-portfolio:
 *   post:
 *     summary: Move to portfolio
 *     description: Move a closed won deal to the user's portfolio
 *     tags: [Pipeline]
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
 *               - acquisitionPrice
 *             properties:
 *               acquisitionPrice:
 *                 type: number
 *               closingCosts:
 *                 type: number
 *               rehabCost:
 *                 type: number
 *               monthlyRent:
 *                 type: number
 *               monthlyExpenses:
 *                 type: number
 *               status:
 *                 type: string
 *                 enum: [holding, renting, renovating]
 *     responses:
 *       201:
 *         description: Property added to portfolio
 */
router.post('/:id/to-portfolio', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const acquisitionDetails = req.body;

    if (!acquisitionDetails.acquisitionPrice) {
      return res
        .status(400)
        .json({ success: false, error: 'acquisitionPrice is required' });
    }

    const portfolio = await pipelineService.moveToPortfolio(id, acquisitionDetails);

    res.status(201).json({
      success: true,
      data: portfolio,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/pipeline/{id}:
 *   delete:
 *     summary: Remove from pipeline
 *     description: Remove a deal from the pipeline
 *     tags: [Pipeline]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deal removed from pipeline
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pipelineService.removeFromPipeline(id);

    res.json({
      success: true,
      message: 'Deal removed from pipeline',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/pipeline/stats:
 *   get:
 *     summary: Get pipeline statistics
 *     description: Get pipeline statistics for a user
 *     tags: [Pipeline]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pipeline statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    const stats = await pipelineService.getPipelineStats(userId as string);

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/pipeline/conversion-rates:
 *   get:
 *     summary: Get conversion rates
 *     description: Get conversion rates between pipeline stages
 *     tags: [Pipeline]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversion rates
 */
router.get('/conversion-rates', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    const rates = await pipelineService.getConversionRates(userId as string);

    res.json({
      success: true,
      data: rates,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/pipeline/stage-timings:
 *   get:
 *     summary: Get stage timings
 *     description: Get average time spent in each stage
 *     tags: [Pipeline]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Stage timings
 */
router.get('/stage-timings', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    const timings = await pipelineService.getAverageTimeByStage(userId as string);

    res.json({
      success: true,
      data: timings,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// BULK ACTIONS
// ============================================================================

/**
 * @swagger
 * /api/pipeline/bulk/stage:
 *   patch:
 *     summary: Bulk update pipeline stages
 *     description: Move multiple deals to a new stage at once
 *     tags: [Pipeline]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *               - stage
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               stage:
 *                 type: string
 *                 enum: [new, analyzing, due_diligence, offered, negotiating, under_contract, closed_won, closed_lost]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bulk update results
 */
router.patch('/bulk/stage', async (req: Request, res: Response) => {
  try {
    const { ids, stage, notes, triggeredBy = 'user' } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids array is required' });
    }

    if (!stage) {
      return res.status(400).json({ success: false, error: 'stage is required' });
    }

    const results = await Promise.allSettled(
      ids.map(id => pipelineService.updateStage(id, stage, { notes, triggeredBy }))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    res.json({
      success: true,
      data: {
        total: ids.length,
        succeeded,
        failed,
        results: results.map((r, i) => ({
          id: ids[i],
          success: r.status === 'fulfilled',
          error: r.status === 'rejected' ? (r.reason as Error).message : undefined,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/pipeline/bulk/close:
 *   post:
 *     summary: Bulk close deals
 *     description: Close multiple deals at once
 *     tags: [Pipeline]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *               - outcome
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               outcome:
 *                 type: string
 *                 enum: [won, lost, withdrawn]
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bulk close results
 */
router.post('/bulk/close', async (req: Request, res: Response) => {
  try {
    const { ids, outcome, reason } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids array is required' });
    }

    if (!outcome) {
      return res.status(400).json({ success: false, error: 'outcome is required' });
    }

    const results = await Promise.allSettled(
      ids.map(id => pipelineService.markAsClosed(id, outcome as PipelineOutcome, { reason }))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    res.json({
      success: true,
      data: {
        total: ids.length,
        succeeded,
        failed,
        results: results.map((r, i) => ({
          id: ids[i],
          success: r.status === 'fulfilled',
          error: r.status === 'rejected' ? (r.reason as Error).message : undefined,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/pipeline/bulk/delete:
 *   delete:
 *     summary: Bulk delete from pipeline
 *     description: Remove multiple deals from pipeline at once
 *     tags: [Pipeline]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Bulk delete results
 */
router.delete('/bulk/delete', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids array is required' });
    }

    const results = await Promise.allSettled(
      ids.map(id => pipelineService.removeFromPipeline(id))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    res.json({
      success: true,
      data: {
        total: ids.length,
        succeeded,
        failed,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// EXPORT
// ============================================================================

/**
 * @swagger
 * /api/pipeline/export:
 *   get:
 *     summary: Export pipeline to CSV
 *     description: Export user's pipeline as CSV file
 *     tags: [Pipeline]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *           default: csv
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pipeline export file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/json:
 *             schema:
 *               type: array
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { userId, format = 'csv', stage } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const result = await pipelineService.getUserPipeline(userId as string, {
      stage: stage as PipelineStage,
      includeCompleted: true,
      limit: 10000,
    });

    const pipeline = result.items;

    if (format === 'json') {
      res.json({
        success: true,
        data: pipeline,
        exportedAt: new Date().toISOString(),
      });
      return;
    }

    // Generate CSV
    const headers = [
      'Deal ID',
      'Address',
      'City',
      'State',
      'Stage',
      'Outcome',
      'Price',
      'ARV',
      'Equity %',
      'Days in Pipeline',
      'Close Price',
      'Created At',
      'Updated At',
    ];

    const rows = pipeline.map((item: any) => {
      const snapshot = item.entrySnapshot || {};
      const equity = snapshot.arv && snapshot.price
        ? Math.round((1 - snapshot.price / snapshot.arv) * 100)
        : '';
      return [
        item.dealId,
        snapshot.address || '',
        snapshot.city || '',
        snapshot.state || '',
        item.stage,
        item.outcome || '',
        snapshot.price || '',
        snapshot.arv || '',
        equity,
        item.daysInPipeline || '',
        item.closePrice || '',
        item.createdAt,
        item.updatedAt,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="pipeline-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
