/**
 * Reminder Scheduler
 *
 * Cron-based scheduler for processing due reminders.
 * Handles notification delivery, snooze processing, and recurring reminder creation.
 */

import * as cron from 'node-cron';
import { reminderService } from './ReminderService';
import Reminder from '../models/Reminder';

interface ReminderSchedulerConfig {
  checkInterval: string; // Cron expression
  maxRemindersPerRun: number;
  enableEmailNotifications: boolean;
  enablePushNotifications: boolean;
}

interface ReminderSchedulerStats {
  lastRunAt: Date | null;
  remindersSentTotal: number;
  remindersSnoozedTotal: number;
  errorsTotal: number;
  isRunning: boolean;
}

class ReminderScheduler {
  private isInitialized = false;
  private reminderCheckTask: cron.ScheduledTask | null = null;
  private snoozeCheckTask: cron.ScheduledTask | null = null;
  private config: ReminderSchedulerConfig;
  private stats: ReminderSchedulerStats;

  constructor() {
    this.config = {
      checkInterval: '* * * * *', // Every minute
      maxRemindersPerRun: 100,
      enableEmailNotifications: true,
      enablePushNotifications: true,
    };

    this.stats = {
      lastRunAt: null,
      remindersSentTotal: 0,
      remindersSnoozedTotal: 0,
      errorsTotal: 0,
      isRunning: false,
    };
  }

  /**
   * Initialize and start the scheduler
   */
  async initialize(config?: Partial<ReminderSchedulerConfig>): Promise<void> {
    if (this.isInitialized) {
      console.log('ReminderScheduler already initialized');
      return;
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }

    console.log('ReminderScheduler initialized');
    this.isInitialized = true;
  }

  /**
   * Start the scheduler
   */
  start(cronExpression?: string): void {
    if (!this.isInitialized) {
      console.warn('ReminderScheduler not initialized. Call initialize() first.');
      return;
    }

    const expression = cronExpression || this.config.checkInterval;

    // Stop existing tasks if running
    this.stop();

    // Schedule reminder check task
    this.reminderCheckTask = cron.schedule(expression, async () => {
      await this.processDueReminders();
    });

    // Schedule snooze check task (runs every minute to check for un-snoozed reminders)
    this.snoozeCheckTask = cron.schedule('* * * * *', async () => {
      await this.processSnoozeExpiration();
    });

    console.log(`ReminderScheduler started with schedule: ${expression}`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.reminderCheckTask) {
      this.reminderCheckTask.stop();
      this.reminderCheckTask = null;
    }

    if (this.snoozeCheckTask) {
      this.snoozeCheckTask.stop();
      this.snoozeCheckTask = null;
    }

    console.log('ReminderScheduler stopped');
  }

  /**
   * Process all due reminders
   */
  async processDueReminders(): Promise<void> {
    if (this.stats.isRunning) {
      console.log('ReminderScheduler: Previous run still in progress, skipping...');
      return;
    }

    this.stats.isRunning = true;
    this.stats.lastRunAt = new Date();

    try {
      const dueReminders = await reminderService.getDueReminders();
      const remindersToProcess = dueReminders.slice(0, this.config.maxRemindersPerRun);

      console.log(`ReminderScheduler: Processing ${remindersToProcess.length} due reminders`);

      for (const reminder of remindersToProcess) {
        try {
          await this.processReminder(reminder);
          this.stats.remindersSentTotal++;
        } catch (error) {
          console.error(`ReminderScheduler: Error processing reminder ${reminder.id}:`, error);
          this.stats.errorsTotal++;
        }
      }
    } catch (error) {
      console.error('ReminderScheduler: Error fetching due reminders:', error);
      this.stats.errorsTotal++;
    } finally {
      this.stats.isRunning = false;
    }
  }

  /**
   * Process a single reminder
   */
  private async processReminder(reminder: Reminder): Promise<void> {
    // Send notification
    await this.sendReminderNotification(reminder);

    // Mark as sent
    await reminderService.markAsSent(reminder.id);

    console.log(`ReminderScheduler: Sent reminder ${reminder.id} - "${reminder.title}"`);
  }

  /**
   * Send reminder notification
   */
  private async sendReminderNotification(reminder: Reminder): Promise<void> {
    // Attempt to send via NotificationService if available
    try {
      // Dynamic import to avoid circular dependency
      const { notificationService } = await import('./NotificationService');
      if (notificationService && typeof notificationService.sendToUser === 'function') {
        // Build notification payload matching NotificationService interface
        const notificationData = {
          title: 'Reminder',
          message: reminder.title,
          metadata: {
            type: 'reminder',
            description: reminder.description,
            priority: reminder.priority,
            linkType: reminder.linkType,
            entityId: this.getLinkedEntityId(reminder),
            reminderId: reminder.id,
          },
        };
        await notificationService.sendToUser(reminder.userId, notificationData as any);
      }
    } catch (error) {
      // NotificationService may not be available, log but don't fail
      console.log('ReminderScheduler: NotificationService not available, reminder marked as sent');
    }

    // Send email notification if enabled
    if (this.config.enableEmailNotifications && reminder.priority === 'urgent') {
      try {
        await this.sendEmailNotification(reminder);
      } catch (error) {
        console.error('ReminderScheduler: Failed to send email notification:', error);
      }
    }
  }

  /**
   * Send email notification for a reminder
   */
  private async sendEmailNotification(reminder: Reminder): Promise<void> {
    // This would integrate with your email service
    // For now, just log that we would send an email
    console.log(`ReminderScheduler: Would send email for urgent reminder ${reminder.id}`);
  }

  /**
   * Get the linked entity ID from a reminder
   */
  private getLinkedEntityId(reminder: Reminder): string | number | null {
    switch (reminder.linkType) {
      case 'deal':
        return reminder.propertyId;
      case 'task':
        return reminder.taskId;
      case 'buyer':
        return reminder.buyerId;
      case 'contract':
        return reminder.contractId;
      case 'compliance':
        return reminder.complianceCheckId;
      default:
        return null;
    }
  }

  /**
   * Process snoozed reminders that are ready to become pending again
   */
  async processSnoozeExpiration(): Promise<void> {
    try {
      const count = await reminderService.processUnsnoozedReminders();
      if (count > 0) {
        console.log(`ReminderScheduler: Reactivated ${count} snoozed reminders`);
        this.stats.remindersSnoozedTotal += count;
      }
    } catch (error) {
      console.error('ReminderScheduler: Error processing snooze expiration:', error);
      this.stats.errorsTotal++;
    }
  }

  /**
   * Get scheduler statistics
   */
  getStats(): ReminderSchedulerStats {
    return { ...this.stats };
  }

  /**
   * Get scheduler configuration
   */
  getConfig(): ReminderSchedulerConfig {
    return { ...this.config };
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(config: Partial<ReminderSchedulerConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart if running with new interval
    if (this.reminderCheckTask && config.checkInterval) {
      this.start(config.checkInterval);
    }
  }

  /**
   * Manually trigger reminder processing
   */
  async trigger(): Promise<void> {
    console.log('ReminderScheduler: Manual trigger initiated');
    await this.processDueReminders();
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.reminderCheckTask !== null;
  }
}

export const reminderScheduler = new ReminderScheduler();
export default reminderScheduler;
