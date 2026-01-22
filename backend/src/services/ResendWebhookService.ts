/**
 * Resend Webhook Service
 *
 * Handles webhook events from Resend email provider to track:
 * - Email delivered
 * - Email opened
 * - Link clicked
 * - Email bounced/failed
 */

import crypto from 'crypto';
import DealForward from '../models/DealForward';

// Resend webhook event types
export type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.complained'
  | 'email.bounced'
  | 'email.opened'
  | 'email.clicked';

export interface ResendWebhookEvent {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // For click events
    click?: {
      link: string;
      timestamp: string;
      user_agent: string;
      ip_address: string;
    };
    // For bounce events
    bounce?: {
      message: string;
    };
  };
}

class ResendWebhookService {
  private webhookSecret: string | null = null;

  constructor() {
    this.webhookSecret = process.env.RESEND_WEBHOOK_SECRET || null;
  }

  /**
   * Verify webhook signature from Resend
   */
  verifySignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      console.warn('[ResendWebhook] No webhook secret configured, skipping verification');
      return true; // Allow in development without secret
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('[ResendWebhook] Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Process a webhook event from Resend
   */
  async processEvent(event: ResendWebhookEvent): Promise<{
    success: boolean;
    message: string;
    forwardId?: string;
  }> {
    const { type, data } = event;
    const emailId = data.email_id;

    console.log(`[ResendWebhook] Processing ${type} event for email ${emailId}`);

    // Find the DealForward by resendMessageId
    const forward = await DealForward.findOne({
      where: { resendMessageId: emailId },
    });

    if (!forward) {
      console.log(`[ResendWebhook] No DealForward found for email ${emailId}`);
      return {
        success: true,
        message: 'No matching forward record found',
      };
    }

    switch (type) {
      case 'email.sent':
        await forward.markSent();
        break;

      case 'email.delivered':
        await forward.markDelivered();
        break;

      case 'email.opened':
        await forward.markOpened();
        break;

      case 'email.clicked':
        await forward.recordClick();
        break;

      case 'email.bounced':
        await forward.markFailed(data.bounce?.message || 'Email bounced');
        break;

      case 'email.complained':
        await forward.markFailed('Recipient marked as spam');
        break;

      case 'email.delivery_delayed':
        // Just log, don't change status
        console.log(`[ResendWebhook] Delivery delayed for forward ${forward.id}`);
        break;

      default:
        console.log(`[ResendWebhook] Unknown event type: ${type}`);
    }

    return {
      success: true,
      message: `Processed ${type} event`,
      forwardId: forward.id,
    };
  }

  /**
   * Get stats on email tracking
   */
  async getEmailTrackingStats(): Promise<{
    total: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    failed: number;
    openRate: number;
    clickRate: number;
  }> {
    const forwards = await DealForward.findAll({
      where: { method: 'email' },
    });

    const total = forwards.length;
    const sent = forwards.filter(f => f.sentAt).length;
    const delivered = forwards.filter(f => f.deliveredAt).length;
    const opened = forwards.filter(f => f.openedAt).length;
    const clicked = forwards.filter(f => f.clickedAt || f.clickCount > 0).length;
    const failed = forwards.filter(f => f.failedAt).length;

    return {
      total,
      sent,
      delivered,
      opened,
      clicked,
      failed,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      clickRate: opened > 0 ? (clicked / opened) * 100 : 0,
    };
  }
}

export const resendWebhookService = new ResendWebhookService();
export default resendWebhookService;
