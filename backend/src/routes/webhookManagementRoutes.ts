/**
 * Webhook Management Routes
 *
 * API endpoints for managing webhook subscriptions.
 * Includes CRUD operations, delivery logs, and testing.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { webhookService } from '../services/WebhookService';
import { WebhookEventType, ALL_EVENT_TYPES, EVENT_CATEGORIES } from '../models/Webhook';

const router = Router();

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function validateEvents(events: string[]): { valid: boolean; invalid: string[] } {
  const validEvents = new Set([...ALL_EVENT_TYPES, '*']);
  const invalid = events.filter(e => !validEvents.has(e as WebhookEventType));
  return { valid: invalid.length === 0, invalid };
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * @swagger
 * /api/webhooks/manage:
 *   get:
 *     summary: List user's webhooks
 *     description: Returns all webhooks configured by the authenticated user
 *     tags: [Webhook Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *         description: Include inactive/disabled webhooks
 *     responses:
 *       200:
 *         description: List of webhooks
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const webhooks = await webhookService.listWebhooks(req.user!.id, { includeInactive });

    // Include stats for each webhook
    const webhooksWithStats = webhooks.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      url: w.url,
      events: w.events,
      active: w.active,
      lastDeliveryAt: w.lastDeliveryAt,
      lastDeliveryStatus: w.lastDeliveryStatus,
      successCount: w.successCount,
      failureCount: w.failureCount,
      consecutiveFailures: w.consecutiveFailures,
      retryEnabled: w.retryEnabled,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      stats: w.getStats(),
    }));

    res.json({
      success: true,
      data: webhooksWithStats,
      count: webhooksWithStats.length,
    });
  } catch (error) {
    console.error('Failed to list webhooks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list webhooks',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/webhooks/manage:
 *   post:
 *     summary: Create a new webhook
 *     description: Create a new webhook subscription
 *     tags: [Webhook Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - url
 *               - events
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               headers:
 *                 type: object
 *               retryEnabled:
 *                 type: boolean
 *               maxRetries:
 *                 type: integer
 *               timeoutMs:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Webhook created
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      url,
      events,
      headers,
      retryEnabled,
      maxRetries,
      timeoutMs,
    } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Webhook name is required',
      });
    }

    if (!url || !validateUrl(url)) {
      return res.status(400).json({
        success: false,
        error: 'Valid webhook URL is required (http or https)',
      });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one event type is required',
      });
    }

    const eventValidation = validateEvents(events);
    if (!eventValidation.valid) {
      return res.status(400).json({
        success: false,
        error: `Invalid event types: ${eventValidation.invalid.join(', ')}`,
        validEvents: ALL_EVENT_TYPES,
      });
    }

    // Create webhook
    const webhook = await webhookService.createWebhook({
      userId: req.user!.id,
      name: name.trim(),
      description: description?.trim(),
      url,
      events: events as WebhookEventType[],
      headers,
      retryEnabled,
      maxRetries,
      timeoutMs,
    });

    res.status(201).json({
      success: true,
      data: {
        id: webhook.id,
        name: webhook.name,
        description: webhook.description,
        url: webhook.url,
        secret: webhook.secret, // Only shown once on creation
        events: webhook.events,
        active: webhook.active,
        retryEnabled: webhook.retryEnabled,
        maxRetries: webhook.maxRetries,
        timeoutMs: webhook.timeoutMs,
        createdAt: webhook.createdAt,
      },
      message: 'Webhook created successfully. Save the secret - it will not be shown again.',
    });
  } catch (error) {
    console.error('Failed to create webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/webhooks/manage/{id}:
 *   get:
 *     summary: Get webhook details
 *     description: Get detailed information about a specific webhook
 *     tags: [Webhook Management]
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
 *         description: Webhook details
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const webhook = await webhookService.getWebhook(req.params.id, req.user!.id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    // Get delivery stats
    const deliveryStats = await webhookService.getDeliveryStats(webhook.id, req.user!.id);

    res.json({
      success: true,
      data: {
        id: webhook.id,
        name: webhook.name,
        description: webhook.description,
        url: webhook.url,
        events: webhook.events,
        headers: webhook.headers,
        active: webhook.active,
        lastDeliveryAt: webhook.lastDeliveryAt,
        lastDeliveryStatus: webhook.lastDeliveryStatus,
        lastError: webhook.lastError,
        successCount: webhook.successCount,
        failureCount: webhook.failureCount,
        consecutiveFailures: webhook.consecutiveFailures,
        retryEnabled: webhook.retryEnabled,
        maxRetries: webhook.maxRetries,
        timeoutMs: webhook.timeoutMs,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
        stats: webhook.getStats(),
        deliveryStats,
      },
    });
  } catch (error) {
    console.error('Failed to get webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/webhooks/manage/{id}:
 *   put:
 *     summary: Update a webhook
 *     description: Update webhook settings
 *     tags: [Webhook Management]
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
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               url:
 *                 type: string
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               headers:
 *                 type: object
 *               active:
 *                 type: boolean
 *               retryEnabled:
 *                 type: boolean
 *               maxRetries:
 *                 type: integer
 *               timeoutMs:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Webhook updated
 */
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      url,
      events,
      headers,
      active,
      retryEnabled,
      maxRetries,
      timeoutMs,
    } = req.body;

    // Validate URL if provided
    if (url !== undefined && !validateUrl(url)) {
      return res.status(400).json({
        success: false,
        error: 'Valid webhook URL is required (http or https)',
      });
    }

    // Validate events if provided
    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one event type is required',
        });
      }

      const eventValidation = validateEvents(events);
      if (!eventValidation.valid) {
        return res.status(400).json({
          success: false,
          error: `Invalid event types: ${eventValidation.invalid.join(', ')}`,
          validEvents: ALL_EVENT_TYPES,
        });
      }
    }

    const webhook = await webhookService.updateWebhook(req.params.id, req.user!.id, {
      name: name?.trim(),
      description: description?.trim(),
      url,
      events: events as WebhookEventType[] | undefined,
      headers,
      active,
      retryEnabled,
      maxRetries,
      timeoutMs,
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: webhook.id,
        name: webhook.name,
        description: webhook.description,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        retryEnabled: webhook.retryEnabled,
        maxRetries: webhook.maxRetries,
        timeoutMs: webhook.timeoutMs,
        updatedAt: webhook.updatedAt,
      },
      message: 'Webhook updated successfully',
    });
  } catch (error) {
    console.error('Failed to update webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/webhooks/manage/{id}:
 *   delete:
 *     summary: Delete a webhook
 *     description: Permanently delete a webhook subscription
 *     tags: [Webhook Management]
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
 *         description: Webhook deleted
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const deleted = await webhookService.deleteWebhook(req.params.id, req.user!.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    res.json({
      success: true,
      message: 'Webhook deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/webhooks/manage/{id}/secret:
 *   post:
 *     summary: Regenerate webhook secret
 *     description: Generate a new secret for the webhook
 *     tags: [Webhook Management]
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
 *         description: New secret generated
 */
router.post('/:id/secret', authenticate, async (req: Request, res: Response) => {
  try {
    const secret = await webhookService.regenerateSecret(req.params.id, req.user!.id);

    if (!secret) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    res.json({
      success: true,
      data: { secret },
      message: 'Secret regenerated. Save it - it will not be shown again.',
    });
  } catch (error) {
    console.error('Failed to regenerate secret:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate secret',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/webhooks/manage/{id}/reset:
 *   post:
 *     summary: Reset webhook failures
 *     description: Reset failure count and re-enable a disabled webhook
 *     tags: [Webhook Management]
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
 *         description: Webhook reset
 */
router.post('/:id/reset', authenticate, async (req: Request, res: Response) => {
  try {
    const webhook = await webhookService.resetWebhook(req.params.id, req.user!.id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: webhook.id,
        active: webhook.active,
        consecutiveFailures: webhook.consecutiveFailures,
      },
      message: 'Webhook reset and re-enabled successfully',
    });
  } catch (error) {
    console.error('Failed to reset webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/webhooks/manage/{id}/test:
 *   post:
 *     summary: Test a webhook
 *     description: Send a test event to the webhook
 *     tags: [Webhook Management]
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
 *         description: Test result
 */
router.post('/:id/test', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await webhookService.testWebhook(req.params.id, req.user!.id);

    res.json({
      success: true,
      data: {
        delivered: result.success,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        error: result.error,
      },
      message: result.success
        ? 'Test webhook delivered successfully'
        : `Test webhook failed: ${result.error}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Webhook not found') {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    console.error('Failed to test webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/webhooks/manage/{id}/deliveries:
 *   get:
 *     summary: Get delivery logs
 *     description: Get delivery history for a webhook
 *     tags: [Webhook Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
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
 *       - in: query
 *         name: successOnly
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Delivery logs
 */
router.get('/:id/deliveries', authenticate, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const successOnly = req.query.successOnly === 'true' ? true :
                       req.query.successOnly === 'false' ? false : undefined;

    const result = await webhookService.getDeliveryLogs(req.params.id, req.user!.id, {
      limit,
      offset,
      successOnly,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    res.json({
      success: true,
      data: result.deliveries.map(d => ({
        id: d.id,
        eventId: d.eventId,
        eventType: d.eventType,
        statusCode: d.statusCode,
        responseTime: d.responseTime,
        success: d.success,
        error: d.error,
        retryCount: d.retryCount,
        deliveredAt: d.deliveredAt,
      })),
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: offset + limit < result.total,
      },
    });
  } catch (error) {
    console.error('Failed to get delivery logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get delivery logs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/webhooks/manage/{id}/deliveries/{deliveryId}/retry:
 *   post:
 *     summary: Retry a failed delivery
 *     description: Manually retry a failed webhook delivery
 *     tags: [Webhook Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: deliveryId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Retry result
 */
router.post('/:id/deliveries/:deliveryId/retry', authenticate, async (req: Request, res: Response) => {
  try {
    const deliveryId = parseInt(req.params.deliveryId);
    if (isNaN(deliveryId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid delivery ID',
      });
    }

    const result = await webhookService.retryDelivery(deliveryId, req.params.id, req.user!.id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Webhook or delivery not found',
      });
    }

    res.json({
      success: true,
      data: {
        delivered: result.success,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        error: result.error,
      },
      message: result.success
        ? 'Delivery retried successfully'
        : `Retry failed: ${result.error}`,
    });
  } catch (error) {
    console.error('Failed to retry delivery:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry delivery',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/webhooks/manage/events:
 *   get:
 *     summary: Get available event types
 *     description: Get list of all available webhook event types
 *     tags: [Webhook Management]
 *     responses:
 *       200:
 *         description: Event types
 */
router.get('/events/types', async (req: Request, res: Response) => {
  try {
    const eventTypes = webhookService.getEventTypes();

    res.json({
      success: true,
      data: {
        events: eventTypes.all,
        categories: {
          deal: eventTypes.categories.deal,
          offer: eventTypes.categories.offer,
          compliance: eventTypes.categories.compliance,
        },
      },
    });
  } catch (error) {
    console.error('Failed to get event types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get event types',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/webhooks/manage/stats:
 *   get:
 *     summary: Get webhook statistics
 *     description: Get global webhook delivery statistics
 *     tags: [Webhook Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics
 */
router.get('/stats/global', authenticate, async (req: Request, res: Response) => {
  try {
    const serviceStats = webhookService.getStats();

    res.json({
      success: true,
      data: serviceStats,
    });
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
