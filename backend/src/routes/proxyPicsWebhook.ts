/**
 * ProxyPics Webhook Handler
 *
 * Receives callbacks when photo orders are completed.
 * Updates property with photos and emits events.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { proxyPicsService } from '../services/ProxyPicsService';
import Property from '../models/Property';
import { automationEngine } from '../plugins/automation/AutomationEngine';

const router = Router();

/**
 * Verify ProxyPics webhook signature
 */
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  if (!secret) {
    console.warn('⚠️  ProxyPics webhook secret not configured - skipping signature verification');
    return true; // Allow webhook if secret not configured (backward compatibility)
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
}

/**
 * POST /api/webhooks/proxypics
 * Webhook callback for ProxyPics photo delivery
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('📸 ProxyPics webhook received:', JSON.stringify(req.body).substring(0, 200));

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.PROXYPICS_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-proxypics-signature'] as string;

      if (!signature) {
        console.error('Missing ProxyPics webhook signature');
        return res.status(401).json({
          success: false,
          error: 'Missing webhook signature',
        });
      }

      const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const isValid = verifyWebhookSignature(payload, signature, webhookSecret);

      if (!isValid) {
        console.error('Invalid ProxyPics webhook signature');
        return res.status(401).json({
          success: false,
          error: 'Invalid webhook signature',
        });
      }

      console.log('✅ ProxyPics webhook signature verified');
    }

    const result = await proxyPicsService.handleWebhook(req.body);

    if (!result.success) {
      return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
    }

    const { orderId, status, eventName, downloadPhotosUrl, downloadReportUrl, externalId } = result;

    // Extract propertyId from externalId if it was set as "property-{id}"
    let propertyId: string | null = null;
    if (externalId && externalId.startsWith('property-')) {
      propertyId = externalId.replace('property-', '');
    }

    // If photos were delivered, update the property
    const isCompleted = status === 'completed' || status === 'fulfilled' ||
                        eventName?.includes('Completed') || eventName?.includes('ReportGenerated');

    if (isCompleted && propertyId) {
      const property = await Property.findByPk(propertyId);

      if (property) {
        // Build photo URLs array from download URLs
        const photoUrls: string[] = [];
        if (downloadPhotosUrl) photoUrls.push(downloadPhotosUrl);

        // Update property with photo info
        await property.update({
          marketDataEnrichment: {
            ...((property.get('marketDataEnrichment') as any) || {}),
            proxyPicsOrderStatus: 'completed',
            proxyPicsCompletedAt: new Date().toISOString(),
            proxyPicsDownloadUrl: downloadPhotosUrl,
            proxyPicsReportUrl: downloadReportUrl,
          },
        });

        console.log(`✅ Updated property ${propertyId} with ProxyPics photos (order #${orderId})`);

        // Emit event for any automations listening
        automationEngine.emitEvent({
          id: `proxypics-${Date.now()}-${orderId || 'unknown'}`,
          type: 'photos_received' as any,
          payload: {
            propertyId,
            orderId,
            downloadPhotosUrl,
            downloadReportUrl,
            source: 'proxypics',
          },
          timestamp: new Date(),
          metadata: {
            dealId: propertyId,
            sourceId: 'proxypics_webhook',
          },
        });
      }
    } else if (status === 'canceled' || status === 'expired') {
      // Update status on property
      if (propertyId) {
        const property = await Property.findByPk(propertyId);
        if (property) {
          await property.update({
            marketDataEnrichment: {
              ...((property.get('marketDataEnrichment') as any) || {}),
              proxyPicsOrderStatus: status,
              proxyPicsFailedAt: new Date().toISOString(),
            },
          });
        }
      }
    }

    res.json({ success: true, received: true });
  } catch (error) {
    console.error('ProxyPics webhook error:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

export default router;
