/**
 * Push Notification Routes
 *
 * Handles Web Push subscription management and VAPID key retrieval.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import PushSubscription from '../models/PushSubscription';
import { pushNotificationService } from '../services/PushNotificationService';

const router = Router();

/**
 * @swagger
 * /api/push/vapid-public-key:
 *   get:
 *     summary: Get VAPID public key
 *     description: Retrieve the VAPID public key needed for push subscription
 *     tags: [Push Notifications]
 *     responses:
 *       200:
 *         description: VAPID public key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 key:
 *                   type: string
 *                   description: Base64-encoded VAPID public key
 */
router.get('/vapid-public-key', (req: Request, res: Response) => {
  const key = pushNotificationService.getVapidPublicKey();

  if (!key) {
    return res.status(503).json({
      success: false,
      error: 'Push notifications not configured',
    });
  }

  res.json({ key });
});

/**
 * @swagger
 * /api/push/subscribe:
 *   post:
 *     summary: Subscribe to push notifications
 *     description: Register a push subscription for the current user
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *               - keys
 *             properties:
 *               endpoint:
 *                 type: string
 *                 description: Push service endpoint URL
 *               keys:
 *                 type: object
 *                 properties:
 *                   p256dh:
 *                     type: string
 *                   auth:
 *                     type: string
 *               expirationTime:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Subscription saved successfully
 *       400:
 *         description: Invalid subscription data
 */
router.post('/subscribe', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { endpoint, keys, expirationTime } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription data: endpoint and keys required',
      });
    }

    const subscription = await PushSubscription.upsertSubscription(
      userId,
      { endpoint, keys, expirationTime },
      req.headers['user-agent']
    );

    console.log(`📱 Push subscription saved for user ${userId}`);

    res.json({
      success: true,
      subscriptionId: subscription.id,
    });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/push/unsubscribe:
 *   delete:
 *     summary: Unsubscribe from push notifications
 *     description: Remove a push subscription
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *             properties:
 *               endpoint:
 *                 type: string
 *                 description: Push service endpoint URL to unsubscribe
 *     responses:
 *       200:
 *         description: Subscription removed
 *       404:
 *         description: Subscription not found
 */
router.delete('/unsubscribe', authenticate, async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Endpoint required',
      });
    }

    const removed = await PushSubscription.removeByEndpoint(endpoint);

    if (removed) {
      console.log(`📱 Push subscription removed: ${endpoint.substring(0, 50)}...`);
      res.json({ success: true });
    } else {
      res.status(404).json({
        success: false,
        error: 'Subscription not found',
      });
    }
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/push/subscriptions:
 *   get:
 *     summary: Get user's push subscriptions
 *     description: List all push subscriptions for the current user
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of subscriptions
 */
router.get('/subscriptions', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const subscriptions = await PushSubscription.findByUserId(userId);

    res.json({
      success: true,
      data: subscriptions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
      })),
      count: subscriptions.length,
    });
  } catch (error) {
    console.error('Error fetching push subscriptions:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/push/test:
 *   post:
 *     summary: Send a test push notification
 *     description: Send a test push notification to the current user (for testing)
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test notification sent
 */
router.post('/test', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    if (!pushNotificationService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Push notifications not configured',
      });
    }

    const results = await pushNotificationService.sendToUser(userId, {
      title: 'Test Notification',
      body: 'This is a test push notification from Dispotree!',
      tag: 'test',
      data: {
        type: 'test',
        url: '/',
      },
    });

    const successCount = results.filter((r) => r.success).length;

    res.json({
      success: true,
      sent: successCount,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error('Error sending test push:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
