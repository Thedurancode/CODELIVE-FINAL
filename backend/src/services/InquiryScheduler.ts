/**
 * InquiryScheduler
 *
 * Cron-based scheduler that:
 * 1. Expires old unanswered inquiries
 * 2. Sends reminder notifications for pending inquiries
 * 3. Escalates urgent inquiries that haven't been answered
 */

import cron from 'node-cron';
import { inquiryService } from './InquiryService';
import PropertyInquiry from '../models/PropertyInquiry';
import Property from '../models/Property';
import { notificationService } from './NotificationService';
import { Op } from 'sequelize';

class InquiryScheduler {
  private expirationJob: cron.ScheduledTask | null = null;
  private reminderJob: cron.ScheduledTask | null = null;
  private escalationJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private stats = {
    totalExpired: 0,
    totalReminders: 0,
    totalEscalations: 0,
    lastRunAt: null as Date | null,
  };

  /**
   * Start all scheduled jobs
   */
  start(): void {
    // Expire old inquiries every hour
    this.expirationJob = cron.schedule('0 * * * *', async () => {
      await this.runExpiration();
    });

    // Send reminders for pending inquiries every 4 hours
    this.reminderJob = cron.schedule('0 */4 * * *', async () => {
      await this.runReminders();
    });

    // Escalate urgent inquiries every 30 minutes
    this.escalationJob = cron.schedule('*/30 * * * *', async () => {
      await this.runEscalation();
    });

    console.log('📅 InquiryScheduler started');

    // Run expiration immediately on start
    this.runExpiration().catch(err => console.error('Initial expiration run failed:', err));
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    this.expirationJob?.stop();
    this.reminderJob?.stop();
    this.escalationJob?.stop();
    this.expirationJob = null;
    this.reminderJob = null;
    this.escalationJob = null;
    console.log('📅 InquiryScheduler stopped');
  }

  /**
   * Expire old unanswered inquiries
   */
  async runExpiration(): Promise<number> {
    if (this.isRunning) return 0;
    this.isRunning = true;
    this.stats.lastRunAt = new Date();

    try {
      const expiredCount = await inquiryService.expireOldInquiries();
      this.stats.totalExpired += expiredCount;

      // Notify buyers about expired inquiries
      if (expiredCount > 0) {
        await this.notifyExpiredInquiries();
      }

      return expiredCount;
    } catch (error) {
      console.error('Expiration run failed:', error);
      return 0;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Notify buyers when their inquiries expire
   */
  private async notifyExpiredInquiries(): Promise<void> {
    const recentlyExpired = await PropertyInquiry.findAll({
      where: {
        status: 'expired',
        updatedAt: {
          [Op.gte]: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
        notifiedBuyer: false,
      },
    });

    for (const inquiry of recentlyExpired) {
      const property = await Property.findByPk(inquiry.propertyId);
      const propertyAddress = property
        ? `${property.getDataValue('address')}, ${property.getDataValue('city')}, ${property.getDataValue('state')}`
        : `Property #${inquiry.propertyId}`;

      // Notify buyer
      notificationService.sendToUser(inquiry.buyerId, {
        type: 'system',
        title: 'Inquiry Expired',
        message: `Your question about ${propertyAddress} expired without a response. Feel free to ask again or try a different question.`,
        priority: 'normal',
        data: {
          inquiryId: inquiry.id,
          propertyId: inquiry.propertyId,
        },
      });

      await inquiry.update({
        notifiedBuyer: true,
        notifiedAt: new Date(),
      });
    }
  }

  /**
   * Send reminders for pending inquiries older than 24 hours
   */
  async runReminders(): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const pendingInquiries = await PropertyInquiry.findAll({
      where: {
        status: 'pending',
        createdAt: {
          [Op.between]: [twoDaysAgo, oneDayAgo],
        },
      },
    });

    let remindersSent = 0;

    for (const inquiry of pendingInquiries) {
      const property = await Property.findByPk(inquiry.propertyId);
      const propertyAddress = property
        ? `${property.getDataValue('address')}, ${property.getDataValue('city')}, ${property.getDataValue('state')}`
        : `Property #${inquiry.propertyId}`;

      // Notify admins of pending inquiry
      notificationService.sendToChannel('admins', {
        type: 'system',
        title: '⏰ Pending Inquiry Reminder',
        message: `An inquiry about ${propertyAddress} has been waiting for over 24 hours.`,
        priority: 'high',
        data: {
          inquiryId: inquiry.id,
          propertyId: inquiry.propertyId,
          question: inquiry.question,
          hoursWaiting: Math.round((Date.now() - new Date(inquiry.createdAt).getTime()) / (1000 * 60 * 60)),
        },
      });

      remindersSent++;
    }

    if (remindersSent > 0) {
      console.log(`⏰ Sent ${remindersSent} pending inquiry reminders`);
      this.stats.totalReminders += remindersSent;
    }

    return remindersSent;
  }

  /**
   * Escalate urgent inquiries that haven't been answered within 2 hours
   */
  async runEscalation(): Promise<number> {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const urgentInquiries = await PropertyInquiry.findAll({
      where: {
        status: 'pending',
        priority: 'urgent',
        createdAt: {
          [Op.lt]: twoHoursAgo,
        },
      },
    });

    let escalationsSent = 0;

    for (const inquiry of urgentInquiries) {
      // Check if we already sent an escalation (via metadata)
      if (inquiry.metadata?.escalated) {
        continue;
      }

      const property = await Property.findByPk(inquiry.propertyId);
      const propertyAddress = property
        ? `${property.getDataValue('address')}, ${property.getDataValue('city')}, ${property.getDataValue('state')}`
        : `Property #${inquiry.propertyId}`;

      // Send escalation notification
      notificationService.sendToChannel('admins', {
        type: 'system',
        title: '🚨 URGENT Inquiry Escalation',
        message: `URGENT inquiry about ${propertyAddress} has been waiting over 2 hours!`,
        priority: 'urgent',
        data: {
          inquiryId: inquiry.id,
          propertyId: inquiry.propertyId,
          question: inquiry.question,
          hoursWaiting: Math.round((Date.now() - new Date(inquiry.createdAt).getTime()) / (1000 * 60 * 60)),
        },
      });

      // Mark as escalated
      await inquiry.update({
        metadata: { ...inquiry.metadata, escalated: true, escalatedAt: new Date() },
      });

      escalationsSent++;
    }

    if (escalationsSent > 0) {
      console.log(`🚨 Escalated ${escalationsSent} urgent inquiries`);
      this.stats.totalEscalations += escalationsSent;
    }

    return escalationsSent;
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    stats: typeof this.stats;
  } {
    return {
      running: this.expirationJob !== null,
      stats: { ...this.stats },
    };
  }
}

export const inquiryScheduler = new InquiryScheduler();
export default inquiryScheduler;
