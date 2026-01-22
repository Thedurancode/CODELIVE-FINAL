/**
 * ProxyPics API Routes
 *
 * Manual photo ordering endpoints for ProxyPics integration.
 * All endpoints require authentication.
 *
 * @swagger
 * tags:
 *   - name: ProxyPics
 *     description: Professional property photo ordering via ProxyPics
 *   - name: ProxyPics Webhooks
 *     description: ProxyPics webhook management
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { proxyPicsService } from '../services/ProxyPicsService';
import Property from '../models/Property';
import { automationEngine } from '../plugins/automation/AutomationEngine';

const router = Router();

/**
 * @swagger
 * /api/proxypics/status:
 *   get:
 *     summary: Check ProxyPics service status
 *     description: Check if the ProxyPics service is configured and connected
 *     tags: [ProxyPics]
 *     responses:
 *       200:
 *         description: Service status information
 */
router.get('/status', async (req: Request, res: Response) => {
  const isReady = proxyPicsService.isReady();
  const connected = isReady ? await proxyPicsService.testConnection() : false;

  res.json({
    success: true,
    data: {
      configured: isReady,
      connected,
      baseUrl: process.env.PROXYPICS_BASE_URL || 'https://sandbox.proxypics.com/api/v3',
    },
  });
});

/**
 * @swagger
 * /api/proxypics/webhook-callback:
 *   post:
 *     summary: ProxyPics webhook callback
 *     description: Receive webhook callbacks from ProxyPics for order status updates
 *     tags: [ProxyPics Webhooks]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook received successfully
 *       500:
 *         description: Webhook processing failed
 */
router.post('/webhook-callback', async (req: Request, res: Response) => {
  try {
    console.log('ProxyPics webhook received:', JSON.stringify(req.body, null, 2));

    const { photo_request_id, status, photos, event_type } = req.body;

    // Handle different event types
    if (event_type === 'status_update' || status) {
      // Find property by external_id or photo_request_id
      const externalId = req.body.external_id;

      if (externalId && externalId.startsWith('property-')) {
        const propertyId = externalId.replace('property-', '');
        const property = await Property.findByPk(propertyId);

        if (property) {
          const existingMeta = (property.get('marketDataEnrichment') as any) || {};
          await property.update({
            marketDataEnrichment: {
              ...existingMeta,
              proxyPicsOrderStatus: status,
              proxyPicsLastUpdate: new Date().toISOString(),
              proxyPicsPhotos: photos || existingMeta.proxyPicsPhotos,
            },
          });
          console.log(`Updated property ${propertyId} with ProxyPics status: ${status}`);
        }
      }

      // Emit event if photos are delivered
      if (status === 'delivered' && photos && photos.length > 0) {
        await automationEngine.emitEvent({
          id: `proxypics-${photo_request_id}-${Date.now()}`,
          type: 'deal:updated' as any,
          timestamp: new Date(),
          payload: {
            photoRequestId: photo_request_id,
            photos,
            externalId,
            event: 'photos_delivered',
          },
          metadata: {
            dealId: externalId?.replace('property-', ''),
            sourceId: 'proxypics',
          },
        });
      }
    }

    res.json({ success: true, received: true });
  } catch (error) {
    console.error('Error processing ProxyPics webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
    });
  }
});

// All other routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/proxypics/templates:
 *   get:
 *     summary: Get photo templates
 *     description: Get available photo templates for ordering
 *     tags: [ProxyPics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available photo templates
 *       503:
 *         description: ProxyPics service not configured
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
        message: 'Set PROXYPICS_API_KEY environment variable',
      });
    }

    const templates = await proxyPicsService.getTemplates();

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
    });
  }
});

/**
 * @swagger
 * /api/proxypics/order:
 *   post:
 *     summary: Order photos
 *     description: Create a photo order for a property
 *     tags: [ProxyPics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               propertyId:
 *                 type: integer
 *               address:
 *                 type: object
 *               templateToken:
 *                 type: string
 *               platform:
 *                 type: string
 *     responses:
 *       200:
 *         description: Photo order created
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Property not found
 *       503:
 *         description: ProxyPics service not configured
 */
router.post('/order', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
        message: 'Set PROXYPICS_API_KEY environment variable',
      });
    }

    const {
      propertyId,
      address,
      templateToken,
      platform,
      priceBoost,
      externalId,
      additionalNotes,
      tasks,
      expiresAt,
    } = req.body;

    // Get address from property if propertyId provided
    let orderAddress = address;
    let property = null;

    if (propertyId) {
      property = await Property.findByPk(propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          error: 'Property not found',
        });
      }

      // Build address from property
      const propAddress = property.get('address') as any;
      orderAddress = {
        street: propAddress?.street || `${propAddress?.houseNumber || ''} ${propAddress?.streetName || ''}`.trim(),
        city: property.get('city') as string,
        state: property.get('state') as string,
        zip: property.get('zip') as string,
      };
    }

    if (!orderAddress || (!orderAddress.street && typeof orderAddress !== 'string')) {
      return res.status(400).json({
        success: false,
        error: 'Address is required (street, city, state, zip) or full address string',
      });
    }

    const result = await proxyPicsService.orderPhotos({
      address: orderAddress,
      templateToken,
      platform: platform || 'crowdsource',
      priceBoost,
      externalId: externalId || (propertyId ? `property-${propertyId}` : undefined),
      additionalNotes,
      tasks,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    if (result.success && result.order) {
      // Update property with order info
      if (property) {
        const existingMeta = (property.get('marketDataEnrichment') as any) || {};
        await property.update({
          marketDataEnrichment: {
            ...existingMeta,
            proxyPicsOrderId: result.order.orderId,
            proxyPicsOrderStatus: result.order.status,
            proxyPicsOrderedAt: new Date().toISOString(),
          },
        });
      }

      res.json({
        success: true,
        data: result.order,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error creating photo order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create photo order',
    });
  }
});

/**
 * @swagger
 * /api/proxypics/order/{orderId}:
 *   get:
 *     summary: Get order status
 *     description: Get the status of a specific photo order
 *     tags: [ProxyPics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order status
 *       404:
 *         description: Order not found
 *       503:
 *         description: ProxyPics service not configured
 */
router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
      });
    }

    const { orderId } = req.params;
    const result = await proxyPicsService.getOrderStatus(orderId);

    if (result.success) {
      res.json({
        success: true,
        data: result.order,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error fetching order status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order status',
    });
  }
});

/**
 * @swagger
 * /api/proxypics/orders:
 *   get:
 *     summary: List all orders
 *     description: List all photo orders with pagination
 *     tags: [ProxyPics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of photo orders
 *       503:
 *         description: ProxyPics service not configured
 */
router.get('/orders', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
      });
    }

    const { page, perPage } = req.query;
    const result = await proxyPicsService.listOrders({
      page: page ? parseInt(page as string) : undefined,
      perPage: perPage ? parseInt(perPage as string) : undefined,
    });

    res.json({
      success: true,
      data: result.orders,
      total: result.total,
      page: result.page,
    });
  } catch (error) {
    console.error('Error listing orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list orders',
    });
  }
});

/**
 * @swagger
 * /api/proxypics/order/{orderId}:
 *   delete:
 *     summary: Cancel an order
 *     description: Cancel a photo order (may fail if already in progress)
 *     tags: [ProxyPics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *       400:
 *         description: Failed to cancel order
 *       503:
 *         description: ProxyPics service not configured
 */
router.delete('/order/:orderId', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
      });
    }

    const { orderId } = req.params;
    const success = await proxyPicsService.cancelOrder(orderId);

    if (success) {
      res.json({
        success: true,
        message: 'Order cancelled successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to cancel order (may already be in progress)',
      });
    }
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel order',
    });
  }
});

/**
 * @swagger
 * /api/proxypics/order/{orderId}/extend:
 *   put:
 *     summary: Extend an order
 *     description: Extend an expired order with a new expiration date
 *     tags: [ProxyPics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expiresAt]
 *             properties:
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Order extended successfully
 *       400:
 *         description: Invalid request or failed to extend
 *       503:
 *         description: ProxyPics service not configured
 */
router.put('/order/:orderId/extend', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
      });
    }

    const { orderId } = req.params;
    const { expiresAt } = req.body;

    if (!expiresAt) {
      return res.status(400).json({
        success: false,
        error: 'expiresAt is required (ISO date string)',
      });
    }

    const result = await proxyPicsService.extendOrder(orderId, new Date(expiresAt));

    if (result.success) {
      res.json({
        success: true,
        data: result.order,
        message: 'Order extended successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error extending order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extend order',
    });
  }
});

/**
 * @swagger
 * /api/proxypics/order/{orderId}/messages:
 *   get:
 *     summary: Get order messages
 *     description: Get all messages for a specific photo order
 *     tags: [ProxyPics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of messages
 *       400:
 *         description: Failed to fetch messages
 *       503:
 *         description: ProxyPics service not configured
 */
router.get('/order/:orderId/messages', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
      });
    }

    const { orderId } = req.params;
    const result = await proxyPicsService.listMessages(parseInt(orderId, 10));

    if (result.success) {
      res.json({
        success: true,
        data: result.messages,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages',
    });
  }
});

/**
 * @swagger
 * /api/proxypics/order/{orderId}/messages:
 *   post:
 *     summary: Send message to photographer
 *     description: Send a message to the photographer for a specific order
 *     tags: [ProxyPics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message sent successfully
 *       400:
 *         description: Invalid request or failed to send
 *       503:
 *         description: ProxyPics service not configured
 */
router.post('/order/:orderId/messages', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
      });
    }

    const { orderId } = req.params;
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message text is required',
      });
    }

    const result = await proxyPicsService.sendMessage(parseInt(orderId, 10), text.trim());

    if (result.success) {
      res.json({
        success: true,
        data: result.message,
        message: 'Message sent successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
    });
  }
});

/**
 * GET /api/proxypics/webhooks
 * List all configured webhooks
 */
router.get('/webhooks', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
      });
    }

    const result = await proxyPicsService.listWebhooks();

    if (result.success) {
      res.json({
        success: true,
        data: result.webhooks,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error listing webhooks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list webhooks',
    });
  }
});

/**
 * POST /api/proxypics/webhooks
 * Create a new webhook
 */
router.post('/webhooks', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
      });
    }

    const { url, method, username, password } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Webhook URL is required',
      });
    }

    const result = await proxyPicsService.createWebhook({
      url,
      method: method || 'post',
      username,
      password,
    });

    if (result.success) {
      res.json({
        success: true,
        data: result.webhook,
        message: 'Webhook created successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error creating webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create webhook',
    });
  }
});

/**
 * DELETE /api/proxypics/webhooks/:webhookId
 * Delete a webhook
 */
router.delete('/webhooks/:webhookId', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
      });
    }

    const { webhookId } = req.params;
    const success = await proxyPicsService.deleteWebhook(parseInt(webhookId, 10));

    if (success) {
      res.json({
        success: true,
        message: 'Webhook deleted successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to delete webhook',
      });
    }
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete webhook',
    });
  }
});

/**
 * POST /api/proxypics/webhooks/auto-register
 * Auto-register a webhook for this application
 */
router.post('/webhooks/auto-register', async (req: Request, res: Response) => {
  try {
    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
      });
    }

    const { baseUrl } = req.body;

    if (!baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'baseUrl is required (your application webhook URL)',
      });
    }

    const result = await proxyPicsService.autoRegisterWebhook(baseUrl);

    if (result.success) {
      res.json({
        success: true,
        data: { webhookId: result.webhookId },
        message: 'Webhook auto-registered successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error auto-registering webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to auto-register webhook',
    });
  }
});

export default router;
