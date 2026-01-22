/**
 * Notification Queue Service
 *
 * Manages notification delivery respecting user preferences:
 * - Delivery frequency (real_time, daily, weekly)
 * - Delivery channels (email, sms, in_app, push)
 *
 * Provides batching for daily/weekly digests and immediate delivery for real-time.
 */

import NotificationQueue from '../models/NotificationQueue';
import MarketplaceUser from '../models/MarketplaceUser';
import UserBuyBox from '../models/UserBuyBox';
import Property from '../models/Property';
import MagicLinkToken from '../models/MagicLinkToken';
import { Resend } from 'resend';
import { notificationService } from './NotificationService';
import { activityFeedService } from './ActivityFeedService';

type NotificationType = 'deal_match' | 'deal_alert' | 'offer_received' | 'offer_update' | 'system';
type DeliveryChannel = 'email' | 'sms' | 'in_app' | 'push';
type DeliveryFrequency = 'real_time' | 'daily' | 'weekly';

interface DealMatchNotification {
  userId: string;
  dealId: string;
  buyBoxId: string;
  buyBoxName: string;
  matchScore: number;
  deal: {
    address: string;
    city: string;
    state: string;
    price: number;
    arv?: number;
    equity?: number;
    propertyType: string;
    bedrooms?: number;
    bathrooms?: number;
  };
}

interface UserNotificationPreferences {
  userId: string;
  email: string;
  phone?: string;
  name: string;
  // Global user preferences
  notifyEmail: boolean;
  notifySms: boolean;
  notifyPush: boolean;
  dealAlerts: boolean;
  instantAlerts: boolean;
  // Buy box specific preferences
  deliveryFrequency: DeliveryFrequency;
  deliveryChannels: DeliveryChannel[];
}

class NotificationQueueService {
  private resend: Resend | null = null;
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor() {
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
  }

  /**
   * Initialize the service and start background processing
   */
  async initialize(): Promise<void> {
    console.log('📬 NotificationQueueService initialized');

    // Process real-time notifications every 10 seconds
    this.processingInterval = setInterval(() => {
      this.processRealTimeNotifications().catch(console.error);
    }, 10000);
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
  }

  /**
   * Get user's notification preferences for a specific buy box
   */
  async getUserPreferences(userId: string, buyBoxId?: string): Promise<UserNotificationPreferences | null> {
    const user = await MarketplaceUser.findByPk(userId);
    if (!user) return null;

    // Default preferences from user settings
    let deliveryFrequency: DeliveryFrequency = 'daily';
    let deliveryChannels: DeliveryChannel[] = ['email', 'in_app'];

    // If buy box specified, use its preferences
    if (buyBoxId) {
      const buyBox = await UserBuyBox.findByPk(buyBoxId);
      if (buyBox) {
        deliveryFrequency = buyBox.deliveryFrequency as DeliveryFrequency;
        deliveryChannels = buyBox.deliveryChannels as DeliveryChannel[];
      }
    }

    // Filter channels based on user global preferences
    const activeChannels = deliveryChannels.filter(channel => {
      switch (channel) {
        case 'email':
          return user.notifyEmail && user.dealAlerts;
        case 'sms':
          return user.notifySms && user.dealAlerts;
        case 'push':
          return user.notifyPush && user.dealAlerts;
        case 'in_app':
          return user.dealAlerts;
        default:
          return false;
      }
    });

    // Override to real_time if user has instant alerts enabled
    if (user.instantAlerts) {
      deliveryFrequency = 'real_time';
    }

    return {
      userId: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      notifyEmail: user.notifyEmail,
      notifySms: user.notifySms,
      notifyPush: user.notifyPush,
      dealAlerts: user.dealAlerts,
      instantAlerts: user.instantAlerts,
      deliveryFrequency,
      deliveryChannels: activeChannels,
    };
  }

  /**
   * Queue a deal match notification
   */
  async queueDealMatchNotification(notification: DealMatchNotification): Promise<void> {
    const prefs = await this.getUserPreferences(notification.userId, notification.buyBoxId);
    if (!prefs || prefs.deliveryChannels.length === 0) {
      console.log(`📭 No active channels for user ${notification.userId}, skipping notification`);
      return;
    }

    const title = 'New Deal Match!';
    const message = `A property at ${notification.deal.address} matches your "${notification.buyBoxName}" criteria with ${notification.matchScore}% score.`;

    const priority = notification.matchScore >= 90 ? 'high' : notification.matchScore >= 75 ? 'normal' : 'low';

    // Queue notification for each active channel
    for (const channel of prefs.deliveryChannels) {
      const scheduledFor = NotificationQueue.calculateScheduledTime(prefs.deliveryFrequency);

      await NotificationQueue.create({
        userId: notification.userId,
        type: 'deal_match',
        title,
        message,
        data: {
          deal: notification.deal,
          buyBoxId: notification.buyBoxId,
          buyBoxName: notification.buyBoxName,
          matchScore: notification.matchScore,
        },
        channel,
        frequency: prefs.deliveryFrequency,
        priority: priority as 'low' | 'normal' | 'high',
        scheduledFor,
        dealId: notification.dealId,
        buyBoxId: notification.buyBoxId,
        matchScore: notification.matchScore,
      });
    }

    console.log(
      `📬 Queued deal match notification for user ${notification.userId}: ` +
        `${prefs.deliveryChannels.join(', ')} (${prefs.deliveryFrequency})`
    );

    // If real-time, process immediately
    if (prefs.deliveryFrequency === 'real_time') {
      await this.processUserNotifications(notification.userId, 'real_time');
    }
  }

  /**
   * Process real-time notifications
   */
  async processRealTimeNotifications(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pending = await NotificationQueue.getPendingForDelivery(undefined, 50);

      for (const notification of pending) {
        if (notification.frequency === 'real_time') {
          await this.sendNotification(notification);
        }
      }
    } catch (error) {
      console.error('Error processing real-time notifications:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process daily digest for all users
   * Should be called by a scheduled job at 8 AM
   */
  async processDailyDigest(): Promise<number> {
    console.log('📬 Processing daily digest notifications...');
    let processed = 0;

    try {
      // Get users with pending daily notifications
      const userIds = await NotificationQueue.getUsersWithPendingBatch('daily', 'email');

      for (const userId of userIds) {
        const sent = await this.sendDigestEmail(userId, 'daily');
        if (sent) processed++;
      }

      // Also process in-app notifications
      const inAppUserIds = await NotificationQueue.getUsersWithPendingBatch('daily', 'in_app');
      for (const userId of inAppUserIds) {
        await this.processUserNotifications(userId, 'daily', 'in_app');
      }

      console.log(`📬 Daily digest complete: ${processed} emails sent`);
    } catch (error) {
      console.error('Error processing daily digest:', error);
    }

    return processed;
  }

  /**
   * Process weekly digest for all users
   * Should be called by a scheduled job on Monday at 8 AM
   */
  async processWeeklyDigest(): Promise<number> {
    console.log('📬 Processing weekly digest notifications...');
    let processed = 0;

    try {
      const userIds = await NotificationQueue.getUsersWithPendingBatch('weekly', 'email');

      for (const userId of userIds) {
        const sent = await this.sendDigestEmail(userId, 'weekly');
        if (sent) processed++;
      }

      console.log(`📬 Weekly digest complete: ${processed} emails sent`);
    } catch (error) {
      console.error('Error processing weekly digest:', error);
    }

    return processed;
  }

  /**
   * Process all pending notifications for a user
   */
  private async processUserNotifications(
    userId: string,
    frequency: DeliveryFrequency,
    channel?: DeliveryChannel
  ): Promise<void> {
    const notifications = await NotificationQueue.getPendingForUser(userId, frequency, channel);

    for (const notification of notifications) {
      await this.sendNotification(notification);
    }
  }

  /**
   * Send a single notification
   */
  private async sendNotification(notification: NotificationQueue): Promise<boolean> {
    try {
      switch (notification.channel) {
        case 'email':
          await this.sendEmailNotification(notification);
          break;
        case 'sms':
          await this.sendSmsNotification(notification);
          break;
        case 'in_app':
          await this.sendInAppNotification(notification);
          break;
        case 'push':
          await this.sendPushNotification(notification);
          break;
      }

      await notification.markSent();
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await notification.markFailed(errorMessage);

      // Retry up to 3 times
      if (notification.retryCount < 3) {
        await notification.resetForRetry(5 * (notification.retryCount + 1));
      }

      return false;
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notification: NotificationQueue): Promise<void> {
    if (!this.resend) {
      console.log('📧 Email service not configured, skipping:', notification.title);
      return;
    }

    const user = await MarketplaceUser.findByPk(notification.userId);
    if (!user) throw new Error('User not found');

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Dispotree <noreply@dispotree.com>';

    const dealData = notification.data.deal || {};
    const matchScore = notification.matchScore || notification.data.matchScore || 0;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: white; margin-bottom: 10px;">
            🌳 DISPOTREE
          </div>
          <h1 style="color: white; margin: 0; font-size: 24px;">🎯 ${notification.title}</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <p style="font-size: 16px; color: #374151;">Hi ${user.name},</p>
          <p style="font-size: 16px; color: #374151;">${notification.message}</p>

          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <h3 style="margin: 0; color: #111827;">${dealData.address || 'Property Details'}</h3>
              <span style="background: ${matchScore >= 90 ? '#22c55e' : matchScore >= 75 ? '#eab308' : '#94a3b8'}; color: white; padding: 4px 12px; border-radius: 12px; font-weight: bold;">${matchScore}% Match</span>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              ${dealData.city ? `<tr><td style="padding: 6px 0; color: #6b7280;">Location:</td><td style="padding: 6px 0; color: #111827;">${dealData.city}, ${dealData.state}</td></tr>` : ''}
              ${dealData.price ? `<tr><td style="padding: 6px 0; color: #6b7280;">Price:</td><td style="padding: 6px 0; color: #111827; font-weight: bold;">$${dealData.price.toLocaleString()}</td></tr>` : ''}
              ${dealData.arv ? `<tr><td style="padding: 6px 0; color: #6b7280;">ARV:</td><td style="padding: 6px 0; color: #111827;">$${dealData.arv.toLocaleString()}</td></tr>` : ''}
              ${dealData.equity ? `<tr><td style="padding: 6px 0; color: #6b7280;">Equity:</td><td style="padding: 6px 0; color: #22c55e; font-weight: bold;">${dealData.equity}%</td></tr>` : ''}
              ${dealData.propertyType ? `<tr><td style="padding: 6px 0; color: #6b7280;">Type:</td><td style="padding: 6px 0; color: #111827;">${dealData.propertyType}</td></tr>` : ''}
              ${dealData.bedrooms ? `<tr><td style="padding: 6px 0; color: #6b7280;">Beds/Baths:</td><td style="padding: 6px 0; color: #111827;">${dealData.bedrooms} bd / ${dealData.bathrooms || '?'} ba</td></tr>` : ''}
            </table>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${frontendUrl}/deals/${notification.dealId}" style="background: #22c55e; color: white; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">View Deal</a>
          </div>
        </div>
        <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
          <p>Dispotree - Real Estate Deal Management</p>
          <p><a href="${frontendUrl}/settings" style="color: #9ca3af;">Manage notification preferences</a></p>
        </div>
      </div>
    `;

    await this.resend.emails.send({
      from: fromEmail,
      to: [user.email],
      subject: `🎯 ${notification.title} - ${dealData.address || 'New Match'}`,
      html,
    });

    // Log activity feed event
    activityFeedService.logActivity({
      eventType: 'email_sent',
      entityType: 'communication',
      entityId: notification.id,
      entityName: notification.title,
      actor: {
        id: 'system',
        name: 'System',
        type: 'system',
      },
      metadata: {
        userId: notification.userId,
        email: user.email,
        dealId: notification.dealId,
        matchScore: notification.matchScore,
        type: notification.type,
      },
    }).catch(err => console.warn('Activity logging failed:', err.message));

    console.log(`📧 Email sent to ${user.email}: ${notification.title}`);
  }

  /**
   * Send digest email with multiple notifications
   */
  private async sendDigestEmail(userId: string, frequency: 'daily' | 'weekly'): Promise<boolean> {
    if (!this.resend) return false;

    const user = await MarketplaceUser.findByPk(userId);
    if (!user) return false;

    const notifications = await NotificationQueue.getPendingForUser(userId, frequency, 'email');
    if (notifications.length === 0) return false;

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Dispotree <noreply@dispotree.com>';

    // Group by type
    const dealMatches = notifications.filter(n => n.type === 'deal_match');

    const periodLabel = frequency === 'daily' ? 'Today' : 'This Week';

    const dealsHtml = dealMatches
      .map(n => {
        const deal = n.data.deal || {};
        const score = n.matchScore || 0;
        return `
          <div style="background: white; border-radius: 8px; padding: 15px; margin: 10px 0; border: 1px solid #e5e7eb;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="color: #111827;">${deal.address || 'Property'}</strong>
                <div style="color: #6b7280; font-size: 14px;">${deal.city || ''}, ${deal.state || ''}</div>
              </div>
              <div style="text-align: right;">
                <div style="background: ${score >= 90 ? '#22c55e' : '#eab308'}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">${score}%</div>
                <div style="color: #111827; font-weight: bold;">$${(deal.price || 0).toLocaleString()}</div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: white; margin-bottom: 10px;">🌳 DISPOTREE</div>
          <h1 style="color: white; margin: 0; font-size: 24px;">📊 Your ${frequency === 'daily' ? 'Daily' : 'Weekly'} Digest</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <p style="font-size: 16px; color: #374151;">Hi ${user.name},</p>
          <p style="font-size: 16px; color: #374151;">${periodLabel} you have <strong>${dealMatches.length} new deal match${dealMatches.length !== 1 ? 'es' : ''}</strong>!</p>

          ${dealMatches.length > 0 ? `<h3 style="color: #111827; margin-top: 25px;">🎯 Deal Matches</h3>${dealsHtml}` : ''}

          <div style="text-align: center; margin-top: 30px;">
            <a href="${frontendUrl}/marketplace" style="background: #22c55e; color: white; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: bold;">View All Deals</a>
          </div>
        </div>
        <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
          <p><a href="${frontendUrl}/settings" style="color: #9ca3af;">Manage notification preferences</a></p>
        </div>
      </div>
    `;

    try {
      await this.resend.emails.send({
        from: fromEmail,
        to: [user.email],
        subject: `📊 Your ${frequency === 'daily' ? 'Daily' : 'Weekly'} Dispotree Digest - ${dealMatches.length} New Match${dealMatches.length !== 1 ? 'es' : ''}`,
        html,
      });

      // Mark all as sent
      for (const n of notifications) {
        await n.markSent();
      }

      console.log(`📧 ${frequency} digest sent to ${user.email}: ${notifications.length} notifications`);
      return true;
    } catch (error) {
      console.error(`Failed to send ${frequency} digest to ${user.email}:`, error);
      return false;
    }
  }

  /**
   * Send SMS notification with magic link for passwordless access
   */
  private async sendSmsNotification(notification: NotificationQueue): Promise<void> {
    const twilioSid = process.env.TWILIO_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_FROM_NUMBER;

    if (!twilioSid || !twilioToken || !twilioFrom) {
      console.log('📱 SMS service not configured, skipping:', notification.title);
      return;
    }

    const user = await MarketplaceUser.findByPk(notification.userId);
    if (!user?.phone) throw new Error('User phone not found');

    // Generate magic link token for passwordless access (24 hour expiry)
    const magicToken = await MagicLinkToken.generateToken({
      email: user.email,
      expiresInHours: 24,
    });

    const twilio = await import('twilio');
    const client = twilio.default(twilioSid, twilioToken);

    const dealData = notification.data.deal || {};
    const score = notification.matchScore || 0;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Create magic link URL that goes directly to matches
    const magicLinkUrl = `${frontendUrl}/matches?token=${magicToken.token}`;

    const body = `🎯 Dispotree: ${score}% match at ${dealData.address || 'new property'}! $${(dealData.price || 0).toLocaleString()}. Tap to view: ${magicLinkUrl}`;

    await client.messages.create({
      body,
      from: twilioFrom,
      to: user.phone,
    });

    // Log activity feed event
    activityFeedService.logActivity({
      eventType: 'sms_sent',
      entityType: 'communication',
      entityId: notification.id,
      entityName: notification.title,
      actor: {
        id: 'system',
        name: 'System',
        type: 'system',
      },
      metadata: {
        userId: notification.userId,
        phone: user.phone,
        dealId: notification.dealId,
        matchScore: notification.matchScore,
        type: notification.type,
      },
    }).catch(err => console.warn('Activity logging failed:', err.message));

    console.log(`📱 SMS with magic link sent to ${user.phone}: ${notification.title}`);
  }

  /**
   * Send in-app notification via WebSocket
   */
  private async sendInAppNotification(notification: NotificationQueue): Promise<void> {
    // Use the existing NotificationService for WebSocket delivery
    if (notificationService) {
      notificationService.sendToUser(notification.userId, {
        type: notification.type as any,
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        data: {
          ...notification.data,
          dealId: notification.dealId,
          buyBoxId: notification.buyBoxId,
          matchScore: notification.matchScore,
        },
        createdAt: notification.createdAt,
      });
    }

    console.log(`🔔 In-app notification sent to ${notification.userId}: ${notification.title}`);
  }

  /**
   * Send push notification (placeholder - needs mobile app integration)
   */
  private async sendPushNotification(notification: NotificationQueue): Promise<void> {
    // TODO: Implement push notifications when mobile app is ready
    console.log(`📲 Push notification (placeholder) for ${notification.userId}: ${notification.title}`);
  }

  /**
   * Get notification stats for a user
   */
  async getStats(userId: string): Promise<{
    pending: number;
    sent: number;
    failed: number;
    byChannel: Record<string, number>;
  }> {
    const pending = await NotificationQueue.count({ where: { userId, status: 'pending' } });
    const sent = await NotificationQueue.count({ where: { userId, status: 'sent' } });
    const failed = await NotificationQueue.count({ where: { userId, status: 'failed' } });

    // Count by channel
    const channels = ['email', 'sms', 'in_app', 'push'];
    const byChannel: Record<string, number> = {};
    for (const channel of channels) {
      byChannel[channel] = await NotificationQueue.count({
        where: { userId, channel, status: 'pending' },
      });
    }

    return { pending, sent, failed, byChannel };
  }
}

export const notificationQueueService = new NotificationQueueService();
export default NotificationQueueService;
export type { DealMatchNotification, UserNotificationPreferences, DeliveryChannel, DeliveryFrequency };
