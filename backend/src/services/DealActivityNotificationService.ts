/**
 * Deal Activity Notification Service
 *
 * Sends notifications to team members assigned to a deal when activity occurs.
 * Integrates with DealTeamMember model and existing notification infrastructure.
 */

import DealTeamMember from '../models/DealTeamMember';
import MarketplaceUser from '../models/MarketplaceUser';
import Property from '../models/Property';
import NotificationQueue from '../models/NotificationQueue';
import { Resend } from 'resend';
import { notificationService } from './NotificationService';
import { activityFeedService } from './ActivityFeedService';
import { logger } from './LoggerService';

type DealActivityType = 'offer' | 'message' | 'statusChange' | 'document' | 'note';

interface DealActivityNotification {
  propertyId: number;
  organizationId: string;
  activityType: DealActivityType;
  title: string;
  message: string;
  actorId?: string;
  actorName: string;
  metadata?: Record<string, any>;
}

interface TeamMemberWithUser extends DealTeamMember {
  user?: MarketplaceUser;
}

class DealActivityNotificationService {
  private resend: Resend | null = null;
  private initialized = false;

  constructor() {
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    logger.info('Deal Activity Notification Service initialized');
  }

  /**
   * Notify team members of deal activity
   */
  async notifyTeamOfActivity(notification: DealActivityNotification): Promise<{
    notified: number;
    skipped: number;
    errors: string[];
  }> {
    const result = { notified: 0, skipped: 0, errors: [] as string[] };

    try {
      // Get team members who should be notified for this activity type
      const teamMembers = await DealTeamMember.getForNotification(
        notification.propertyId,
        notification.organizationId,
        notification.activityType
      );

      if (teamMembers.length === 0) {
        logger.debug('No team members to notify for activity', {
          propertyId: notification.propertyId,
          activityType: notification.activityType,
        });
        return result;
      }

      // Get property details for the notification
      const property = await Property.findByPk(notification.propertyId);
      const propertyAddress = property
        ? (typeof property.address === 'string'
            ? property.address
            : `${property.address?.houseNumber || ''} ${property.address?.street || ''}`.trim() || `Property #${notification.propertyId}`)
        : `Property #${notification.propertyId}`;

      // Get full user details for each team member
      const userIds = teamMembers.map(tm => tm.userId);
      const users = await MarketplaceUser.findAll({
        where: { id: userIds },
      });
      const userMap = new Map(users.map(u => [u.id, u]));

      // Send notifications to each team member
      for (const teamMember of teamMembers) {
        // Skip notifying the actor themselves
        if (notification.actorId && teamMember.userId === notification.actorId) {
          result.skipped++;
          continue;
        }

        const user = userMap.get(teamMember.userId);
        if (!user) {
          result.skipped++;
          continue;
        }

        try {
          // Send via multiple channels based on user preferences
          const channels: string[] = [];

          // Email notification
          if (user.notifyEmail) {
            await this.sendEmailNotification(user, notification, propertyAddress, property);
            channels.push('email');
          }

          // SMS notification for high-priority events
          if (user.notifySms && user.phone && notification.activityType === 'offer') {
            await this.sendSmsNotification(user, notification, propertyAddress);
            channels.push('sms');
          }

          // In-app notification
          if (notificationService) {
            this.sendInAppNotification(user.id, notification, propertyAddress);
            channels.push('in_app');
          }

          if (channels.length > 0) {
            result.notified++;
            logger.debug('Notified team member', {
              userId: user.id,
              channels,
              activityType: notification.activityType,
            });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to notify ${user.email}: ${errorMsg}`);
          logger.error('Failed to notify team member', { userId: user.id }, error);
        }
      }

      logger.info('Deal activity notification complete', {
        propertyId: notification.propertyId,
        activityType: notification.activityType,
        notified: result.notified,
        skipped: result.skipped,
      });

      return result;
    } catch (error) {
      logger.error('Failed to process deal activity notification', { notification }, error);
      throw error;
    }
  }

  /**
   * Send email notification to team member
   */
  private async sendEmailNotification(
    user: MarketplaceUser,
    notification: DealActivityNotification,
    propertyAddress: string,
    property?: Property | null
  ): Promise<void> {
    if (!this.resend) {
      logger.debug('Email service not configured, skipping');
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Dispotree <noreply@dispotree.com>';

    const activityIcons: Record<DealActivityType, string> = {
      offer: '💰',
      message: '💬',
      statusChange: '📊',
      document: '📄',
      note: '📝',
    };

    const activityColors: Record<DealActivityType, string> = {
      offer: '#22c55e',
      message: '#3b82f6',
      statusChange: '#f59e0b',
      document: '#8b5cf6',
      note: '#6b7280',
    };

    const icon = activityIcons[notification.activityType];
    const color = activityColors[notification.activityType];

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, ${color} 0%, ${color}cc 100%); padding: 30px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: white; margin-bottom: 10px;">
            🌳 DISPOTREE
          </div>
          <h1 style="color: white; margin: 0; font-size: 24px;">${icon} ${notification.title}</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <p style="font-size: 16px; color: #374151;">Hi ${user.name},</p>
          <p style="font-size: 16px; color: #374151;">${notification.message}</p>

          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
            <h3 style="margin: 0 0 15px 0; color: #111827;">${propertyAddress}</h3>
            ${property ? `
            <table style="width: 100%; border-collapse: collapse;">
              ${property.city ? `<tr><td style="padding: 6px 0; color: #6b7280;">Location:</td><td style="padding: 6px 0; color: #111827;">${property.city}, ${property.state}</td></tr>` : ''}
              ${(property.reservePrice || property.buyItNowPrice) ? `<tr><td style="padding: 6px 0; color: #6b7280;">Price:</td><td style="padding: 6px 0; color: #111827; font-weight: bold;">$${(property.reservePrice || property.buyItNowPrice || 0).toLocaleString()}</td></tr>` : ''}
              ${property.propertyType ? `<tr><td style="padding: 6px 0; color: #6b7280;">Type:</td><td style="padding: 6px 0; color: #111827;">${property.propertyType}</td></tr>` : ''}
            </table>
            ` : ''}
          </div>

          <div style="background: #f3f4f6; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">
              <strong>Activity by:</strong> ${notification.actorName}
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${frontendUrl}/deals/${notification.propertyId}" style="background: ${color}; color: white; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">View Deal</a>
          </div>
        </div>
        <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
          <p>Dispotree - Real Estate Deal Management</p>
          <p>You're receiving this because you're assigned to this deal.</p>
          <p><a href="${frontendUrl}/settings" style="color: #9ca3af;">Manage notification preferences</a></p>
        </div>
      </div>
    `;

    await this.resend.emails.send({
      from: fromEmail,
      to: [user.email],
      subject: `${icon} ${notification.title} - ${propertyAddress}`,
      html,
    });

    logger.debug('Email sent to team member', {
      userId: user.id,
      email: user.email,
      activityType: notification.activityType,
    });
  }

  /**
   * Send SMS notification to team member
   */
  private async sendSmsNotification(
    user: MarketplaceUser,
    notification: DealActivityNotification,
    propertyAddress: string
  ): Promise<void> {
    const twilioSid = process.env.TWILIO_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_FROM_NUMBER;

    if (!twilioSid || !twilioToken || !twilioFrom || !user.phone) {
      logger.debug('SMS service not configured or no phone, skipping');
      return;
    }

    const twilio = await import('twilio');
    const client = twilio.default(twilioSid, twilioToken);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const dealUrl = `${frontendUrl}/deals/${notification.propertyId}`;

    const body = `🏠 Dispotree: ${notification.title} on ${propertyAddress}. ${notification.actorName}. View: ${dealUrl}`;

    await client.messages.create({
      body: body.substring(0, 160), // SMS character limit
      from: twilioFrom,
      to: user.phone,
    });

    logger.debug('SMS sent to team member', {
      userId: user.id,
      phone: user.phone,
      activityType: notification.activityType,
    });
  }

  /**
   * Send in-app notification via WebSocket
   */
  private sendInAppNotification(
    userId: string,
    notification: DealActivityNotification,
    propertyAddress: string
  ): void {
    if (!notificationService) return;

    // Map activity types to notification types
    const typeMap: Record<DealActivityType, 'offer_received' | 'team_message' | 'pipeline_update' | 'system'> = {
      offer: 'offer_received',
      message: 'team_message',
      statusChange: 'pipeline_update',
      document: 'system',
      note: 'system',
    };

    notificationService.sendToUser(userId, {
      type: typeMap[notification.activityType],
      title: notification.title,
      message: notification.message,
      priority: notification.activityType === 'offer' ? 'high' : 'normal',
      data: {
        propertyId: notification.propertyId,
        propertyAddress,
        activityType: notification.activityType,
        actorName: notification.actorName,
        ...notification.metadata,
      },
      createdAt: new Date(),
    });
  }

  // ============================================================================
  // CONVENIENCE METHODS FOR SPECIFIC ACTIVITY TYPES
  // ============================================================================

  /**
   * Notify team when a new offer is received
   */
  async notifyOfNewOffer(
    propertyId: number,
    organizationId: string,
    offer: {
      amount: number;
      buyerName: string;
      buyerCompany?: string;
    },
    actorId?: string
  ): Promise<void> {
    await this.notifyTeamOfActivity({
      propertyId,
      organizationId,
      activityType: 'offer',
      title: 'New Offer Received',
      message: `${offer.buyerName}${offer.buyerCompany ? ` (${offer.buyerCompany})` : ''} submitted an offer of $${offer.amount.toLocaleString()}.`,
      actorId,
      actorName: offer.buyerName,
      metadata: { offerAmount: offer.amount, buyerName: offer.buyerName },
    });

    // Also log to activity feed
    activityFeedService.logOfferActivity(
      'offer_made',
      `offer-${propertyId}-${Date.now()}`,
      `Property #${propertyId}`,
      { id: actorId, name: offer.buyerName, type: 'user' },
      organizationId,
      { amount: offer.amount }
    ).catch(err => logger.warn('Activity feed logging failed', {}, err));
  }

  /**
   * Notify team when offer status changes
   */
  async notifyOfOfferUpdate(
    propertyId: number,
    organizationId: string,
    offer: {
      amount: number;
      buyerName: string;
      newStatus: string;
      updatedBy: string;
    },
    actorId?: string
  ): Promise<void> {
    const statusMessages: Record<string, string> = {
      accepted: `The offer of $${offer.amount.toLocaleString()} from ${offer.buyerName} has been ACCEPTED!`,
      rejected: `The offer of $${offer.amount.toLocaleString()} from ${offer.buyerName} has been rejected.`,
      countered: `A counter-offer has been made to ${offer.buyerName}.`,
      withdrawn: `${offer.buyerName} has withdrawn their offer of $${offer.amount.toLocaleString()}.`,
      expired: `The offer from ${offer.buyerName} has expired.`,
    };

    await this.notifyTeamOfActivity({
      propertyId,
      organizationId,
      activityType: 'offer',
      title: `Offer ${offer.newStatus.charAt(0).toUpperCase() + offer.newStatus.slice(1)}`,
      message: statusMessages[offer.newStatus] || `Offer status changed to ${offer.newStatus}.`,
      actorId,
      actorName: offer.updatedBy,
      metadata: { offerAmount: offer.amount, newStatus: offer.newStatus },
    });
  }

  /**
   * Notify team when a message is added to the deal
   */
  async notifyOfNewMessage(
    propertyId: number,
    organizationId: string,
    message: {
      senderName: string;
      preview: string;
      isFromBuyer?: boolean;
    },
    actorId?: string
  ): Promise<void> {
    await this.notifyTeamOfActivity({
      propertyId,
      organizationId,
      activityType: 'message',
      title: 'New Message',
      message: `${message.senderName} sent a message: "${message.preview.substring(0, 100)}${message.preview.length > 100 ? '...' : ''}"`,
      actorId,
      actorName: message.senderName,
      metadata: { isFromBuyer: message.isFromBuyer },
    });
  }

  /**
   * Notify team when deal status changes
   */
  async notifyOfStatusChange(
    propertyId: number,
    organizationId: string,
    status: {
      previousStatus: string;
      newStatus: string;
      updatedBy: string;
    },
    actorId?: string
  ): Promise<void> {
    await this.notifyTeamOfActivity({
      propertyId,
      organizationId,
      activityType: 'statusChange',
      title: 'Deal Status Updated',
      message: `Deal moved from "${status.previousStatus}" to "${status.newStatus}" by ${status.updatedBy}.`,
      actorId,
      actorName: status.updatedBy,
      metadata: { previousStatus: status.previousStatus, newStatus: status.newStatus },
    });

    // Log to activity feed
    activityFeedService.logDealActivity(
      'deal_updated',
      String(propertyId),
      `Property #${propertyId}`,
      { id: actorId, name: status.updatedBy, type: 'user' },
      organizationId,
      { statusChange: { from: status.previousStatus, to: status.newStatus } }
    ).catch(err => logger.warn('Activity feed logging failed', {}, err));
  }

  /**
   * Notify team when a document is uploaded
   */
  async notifyOfNewDocument(
    propertyId: number,
    organizationId: string,
    document: {
      fileName: string;
      documentType: string;
      uploadedBy: string;
    },
    actorId?: string
  ): Promise<void> {
    await this.notifyTeamOfActivity({
      propertyId,
      organizationId,
      activityType: 'document',
      title: 'New Document Uploaded',
      message: `${document.uploadedBy} uploaded "${document.fileName}" (${document.documentType}).`,
      actorId,
      actorName: document.uploadedBy,
      metadata: { fileName: document.fileName, documentType: document.documentType },
    });
  }

  /**
   * Notify team when a note is added
   */
  async notifyOfNewNote(
    propertyId: number,
    organizationId: string,
    note: {
      authorName: string;
      preview: string;
      subject?: string;
    },
    actorId?: string
  ): Promise<void> {
    await this.notifyTeamOfActivity({
      propertyId,
      organizationId,
      activityType: 'note',
      title: note.subject ? `New Note: ${note.subject}` : 'New Note Added',
      message: `${note.authorName} added a note: "${note.preview.substring(0, 100)}${note.preview.length > 100 ? '...' : ''}"`,
      actorId,
      actorName: note.authorName,
      metadata: { subject: note.subject },
    });
  }

  /**
   * Notify team when a team member is assigned/removed
   */
  async notifyOfTeamChange(
    propertyId: number,
    organizationId: string,
    change: {
      memberName: string;
      action: 'assigned' | 'removed';
      role?: string;
      changedBy: string;
    },
    actorId?: string
  ): Promise<void> {
    const message = change.action === 'assigned'
      ? `${change.memberName} has been assigned to this deal${change.role ? ` as ${change.role}` : ''}.`
      : `${change.memberName} has been removed from this deal.`;

    await this.notifyTeamOfActivity({
      propertyId,
      organizationId,
      activityType: 'statusChange',
      title: `Team ${change.action === 'assigned' ? 'Member Added' : 'Member Removed'}`,
      message,
      actorId,
      actorName: change.changedBy,
      metadata: { memberName: change.memberName, action: change.action, role: change.role },
    });

    // Log to activity feed
    activityFeedService.logTeamActivity(
      change.action === 'assigned' ? 'team_member_added' : 'team_member_removed',
      String(propertyId),
      change.memberName,
      { id: actorId, name: change.changedBy, type: 'user' },
      organizationId,
      { role: change.role }
    ).catch(err => logger.warn('Activity feed logging failed', {}, err));
  }
}

export const dealActivityNotificationService = new DealActivityNotificationService();
export default dealActivityNotificationService;
