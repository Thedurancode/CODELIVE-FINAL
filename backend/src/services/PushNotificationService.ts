/**
 * Push Notification Service
 *
 * Handles sending Web Push notifications to users who are offline
 * or have the app in the background.
 *
 * Requires VAPID keys to be configured:
 * - VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - VAPID_SUBJECT (e.g., mailto:support@dispotree.com)
 *
 * Generate keys with: npx web-push generate-vapid-keys
 */

import PushSubscription from '../models/PushSubscription';

// Dynamic import for web-push (optional dependency)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let webpush: any = null;

interface PushNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  icon?: string;
  badge?: string;
  renotify?: boolean;
  silent?: boolean;
}

interface SendResult {
  success: boolean;
  endpoint: string;
  error?: string;
}

class PushNotificationService {
  private initialized = false;
  private vapidPublicKey: string | null = null;

  /**
   * Initialize the service with VAPID credentials
   */
  async initialize(): Promise<void> {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@dispotree.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn('⚠️ VAPID keys not configured - push notifications disabled');
      console.warn('   Generate keys with: npx web-push generate-vapid-keys');
      return;
    }

    try {
      // Dynamically import web-push
      const webpushModule = await import('web-push');
      webpush = webpushModule.default || webpushModule;
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

      this.vapidPublicKey = vapidPublicKey;
      this.initialized = true;
      console.log('✅ Push Notification Service initialized');
    } catch (error) {
      console.warn('⚠️ web-push module not installed - push notifications disabled');
      console.warn('   Install with: npm install web-push');
    }
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return this.initialized && webpush !== null;
  }

  /**
   * Get the VAPID public key (for frontend subscription)
   */
  getVapidPublicKey(): string | null {
    return this.vapidPublicKey;
  }

  /**
   * Send a push notification to a specific user
   * Sends to all of the user's registered devices
   */
  async sendToUser(
    userId: string,
    notification: PushNotificationPayload
  ): Promise<SendResult[]> {
    if (!this.isReady()) {
      console.debug('Push notifications not available');
      return [];
    }

    const subscriptions = await PushSubscription.findByUserId(userId);

    if (subscriptions.length === 0) {
      console.debug(`No push subscriptions found for user ${userId}`);
      return [];
    }

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      tag: notification.tag || 'dispotree',
      data: notification.data,
      requireInteraction: notification.requireInteraction || false,
      actions: notification.actions || [],
      icon: notification.icon || '/icon-192.png',
      badge: notification.badge || '/badge-72.png',
      renotify: notification.renotify || false,
      silent: notification.silent || false,
      timestamp: Date.now(),
    });

    const results: SendResult[] = [];

    for (const subscription of subscriptions) {
      try {
        await webpush!.sendNotification(subscription.toWebPushFormat(), payload);

        results.push({
          success: true,
          endpoint: subscription.endpoint,
        });

        console.log(`📱 Push sent to user ${userId} (${subscription.userAgent || 'unknown device'})`);
      } catch (error: any) {
        const statusCode = error.statusCode;
        const errorMessage = error.message || 'Unknown error';

        results.push({
          success: false,
          endpoint: subscription.endpoint,
          error: errorMessage,
        });

        // Handle expired/invalid subscriptions
        if (statusCode === 404 || statusCode === 410) {
          console.log(`🗑️ Removing invalid subscription for user ${userId}`);
          await subscription.destroy();
        } else {
          console.error(`Failed to send push to user ${userId}:`, errorMessage);
        }
      }
    }

    return results;
  }

  /**
   * Send a push notification to multiple users
   */
  async sendToUsers(
    userIds: string[],
    notification: PushNotificationPayload
  ): Promise<Map<string, SendResult[]>> {
    const results = new Map<string, SendResult[]>();

    // Send in parallel with limited concurrency
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((userId) => this.sendToUser(userId, notification))
      );

      batch.forEach((userId, index) => {
        results.set(userId, batchResults[index]);
      });
    }

    return results;
  }

  /**
   * Send a team chat message notification
   */
  async sendTeamChatNotification(
    userId: string,
    options: {
      conversationId: string;
      messageId: string;
      senderName: string;
      content: string;
      isMention?: boolean;
    }
  ): Promise<SendResult[]> {
    const { conversationId, messageId, senderName, content, isMention } = options;

    return this.sendToUser(userId, {
      title: isMention
        ? `${senderName} mentioned you`
        : `New message from ${senderName}`,
      body: content.length > 100 ? content.substring(0, 100) + '...' : content,
      tag: `team-chat-${conversationId}`,
      data: {
        type: 'team_message',
        url: `/team-chat?conversation=${conversationId}&message=${messageId}`,
        conversationId,
        messageId,
        senderName,
      },
      requireInteraction: isMention, // Mentions require explicit dismissal
      renotify: true, // Always notify even if same tag
    });
  }

  /**
   * Send a deal notification
   */
  async sendDealNotification(
    userId: string,
    options: {
      dealId: string;
      title: string;
      body: string;
      type: 'new_deal' | 'deal_update' | 'deal_offer' | 'deal_match';
    }
  ): Promise<SendResult[]> {
    const { dealId, title, body, type } = options;

    return this.sendToUser(userId, {
      title,
      body,
      tag: `deal-${dealId}`,
      data: {
        type,
        url: `/deals/${dealId}`,
        dealId,
      },
    });
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();
export default PushNotificationService;
