/**
 * Contract Reminder Scheduler
 *
 * Automatically sends reminders to signers before contracts expire.
 * Features:
 * - Configurable reminder intervals
 * - Escalating urgency for near-expiry contracts
 * - Rate limiting to avoid spam
 * - Retry logic for failed reminders
 */

import cron from 'node-cron';
import DocuSealSubmission from '../models/DocuSealSubmission';
import { docuSealService } from './DocuSealService';
import { notificationService } from './NotificationService';

interface ReminderConfig {
  // How often to check for due reminders (cron expression)
  checkInterval: string;
  // Maximum reminders per submission
  maxRemindersPerSubmission: number;
  // Minimum hours between reminders
  minHoursBetweenReminders: number;
  // Hours before expiry to send urgent reminder
  urgentReminderHours: number;
  // Hours before expiry to send final reminder
  finalReminderHours: number;
  // Whether to notify internal users when reminder is sent
  notifyInternalUsers: boolean;
}

interface ReminderResult {
  submissionId: number;
  docuSealSubmissionId: number;
  success: boolean;
  remindedEmails: string[];
  error?: string;
  isUrgent: boolean;
  reminderCount: number;
}

class ContractReminderScheduler {
  private task: cron.ScheduledTask | null = null;
  private running: boolean = false;
  private lastRun: Date | null = null;
  private config: ReminderConfig;

  constructor() {
    this.config = {
      checkInterval: '0 */2 * * *', // Every 2 hours by default
      maxRemindersPerSubmission: 5,
      minHoursBetweenReminders: 12,
      urgentReminderHours: 24,
      finalReminderHours: 6,
      notifyInternalUsers: true,
    };
  }

  /**
   * Start the scheduler
   */
  start(cronExpression?: string): void {
    if (this.task) {
      console.log('⚠️ Contract Reminder Scheduler already running');
      return;
    }

    const expression = cronExpression || this.config.checkInterval;

    this.task = cron.schedule(expression, async () => {
      await this.processReminders();
    });

    this.running = true;
    console.log(`✅ Contract Reminder Scheduler started (${expression})`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    this.running = false;
    console.log('⏹️ Contract Reminder Scheduler stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    lastRun: Date | null;
    config: ReminderConfig;
  } {
    return {
      running: this.running,
      lastRun: this.lastRun,
      config: this.config,
    };
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(newConfig: Partial<ReminderConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart if interval changed and scheduler is running
    if (newConfig.checkInterval && this.task) {
      this.stop();
      this.start(newConfig.checkInterval);
    }
  }

  /**
   * Process all due reminders
   */
  async processReminders(): Promise<{
    processed: number;
    successful: number;
    failed: number;
    results: ReminderResult[];
  }> {
    console.log('🔔 Processing contract reminders...');
    this.lastRun = new Date();

    const results: ReminderResult[] = [];

    // Check if DocuSeal is available
    if (!docuSealService.isReady()) {
      console.log('⚠️ DocuSeal service not available, skipping reminders');
      return { processed: 0, successful: 0, failed: 0, results };
    }

    try {
      // Get submissions due for reminders
      const dueSubmissions = await DocuSealSubmission.findDueForReminder();
      console.log(`   Found ${dueSubmissions.length} submissions due for reminders`);

      // Get submissions expiring soon (for urgent reminders)
      const expiringSoon = await DocuSealSubmission.findExpiringSoon(this.config.urgentReminderHours);
      const expiringIds = new Set(expiringSoon.map(s => s.id));

      // Get submissions about to expire (for final reminders)
      const aboutToExpire = await DocuSealSubmission.findExpiringSoon(this.config.finalReminderHours);
      const aboutToExpireIds = new Set(aboutToExpire.map(s => s.id));

      // Process each submission
      for (const submission of dueSubmissions) {
        // Skip if max reminders reached
        if (submission.reminderCount >= this.config.maxRemindersPerSubmission) {
          console.log(`   Skipping ${submission.id}: max reminders reached (${submission.reminderCount})`);
          continue;
        }

        // Check minimum time between reminders
        if (submission.lastReminderAt) {
          const hoursSinceLastReminder = (Date.now() - submission.lastReminderAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastReminder < this.config.minHoursBetweenReminders) {
            console.log(`   Skipping ${submission.id}: too soon since last reminder (${Math.round(hoursSinceLastReminder)}h)`);
            continue;
          }
        }

        const isUrgent = expiringIds.has(submission.id);
        const isFinal = aboutToExpireIds.has(submission.id);
        const result = await this.sendReminder(submission, isUrgent, isFinal);
        results.push(result);
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log(`✅ Processed ${results.length} reminders: ${successful} successful, ${failed} failed`);

      return {
        processed: results.length,
        successful,
        failed,
        results,
      };
    } catch (error) {
      console.error('Error processing reminders:', error);
      return { processed: 0, successful: 0, failed: 0, results };
    }
  }

  /**
   * Send reminder for a specific submission
   */
  private async sendReminder(
    submission: DocuSealSubmission,
    isUrgent: boolean = false,
    isFinal: boolean = false
  ): Promise<ReminderResult> {
    const result: ReminderResult = {
      submissionId: submission.id,
      docuSealSubmissionId: submission.docuSealSubmissionId,
      success: false,
      remindedEmails: [],
      isUrgent,
      reminderCount: submission.reminderCount + 1,
    };

    try {
      // Find pending submitters
      const pendingSubmitters = submission.submitters.filter(
        s => ['pending', 'sent', 'opened'].includes(s.status)
      );

      if (pendingSubmitters.length === 0) {
        result.success = true;
        return result;
      }

      // Send reminders to each pending submitter
      for (const submitter of pendingSubmitters) {
        try {
          await docuSealService.resendEmail(submitter.id);
          result.remindedEmails.push(submitter.email);
        } catch (e) {
          console.warn(`   Failed to remind ${submitter.email}:`, e);
        }
      }

      // Calculate next reminder time based on urgency
      let nextReminderIn: number;
      if (isFinal) {
        nextReminderIn = 2 * 60 * 60 * 1000; // 2 hours for final
      } else if (isUrgent) {
        nextReminderIn = 6 * 60 * 60 * 1000; // 6 hours for urgent
      } else {
        nextReminderIn = 24 * 60 * 60 * 1000; // 24 hours for normal
      }

      // Record reminder sent
      await submission.recordReminderSent(nextReminderIn);

      result.success = result.remindedEmails.length > 0;

      // Notify internal users if configured
      if (this.config.notifyInternalUsers && result.success) {
        const urgencyLevel = isFinal ? 'FINAL' : isUrgent ? 'URGENT' : '';
        await this.notifyInternal(submission, result.remindedEmails, urgencyLevel);
      }

      console.log(
        `   ${isUrgent ? '⚠️' : '📧'} Sent ${isFinal ? 'FINAL' : isUrgent ? 'URGENT' : ''} reminder for submission ${submission.id} ` +
        `to ${result.remindedEmails.join(', ')} (reminder #${result.reminderCount})`
      );

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`   Failed to send reminder for ${submission.id}:`, error);
      return result;
    }
  }

  /**
   * Notify internal users about sent reminder
   */
  private async notifyInternal(
    submission: DocuSealSubmission,
    remindedEmails: string[],
    urgencyLevel: string
  ): Promise<void> {
    try {
      const title = urgencyLevel
        ? `${urgencyLevel} Contract Reminder Sent`
        : 'Contract Reminder Sent';

      const message = `Reminder #${submission.reminderCount} sent to ${remindedEmails.join(', ')} ` +
        `for "${submission.templateName || 'Contract'}"` +
        (submission.expireAt ? ` (expires ${submission.expireAt.toLocaleDateString()})` : '');

      // Use notification service if available
      if (notificationService && typeof notificationService.broadcast === 'function') {
        notificationService.broadcast({
          type: 'system',
          title,
          message,
          data: {
            category: 'contract_reminder',
            submissionId: submission.id,
            propertyId: submission.propertyId,
            urgencyLevel,
            reminderCount: submission.reminderCount,
            remindedEmails,
            expireAt: submission.expireAt?.toISOString(),
          },
        });
      }
    } catch (e) {
      // Non-critical, just log
      console.warn('Could not notify internal users:', e);
    }
  }

  /**
   * Send reminder for a single submission by ID (manual trigger)
   */
  async sendReminderById(
    submissionId: number,
    options: { isUrgent?: boolean; submitterEmail?: string } = {}
  ): Promise<ReminderResult> {
    const submission = await DocuSealSubmission.findByPk(submissionId);

    if (!submission) {
      return {
        submissionId,
        docuSealSubmissionId: 0,
        success: false,
        remindedEmails: [],
        error: 'Submission not found',
        isUrgent: false,
        reminderCount: 0,
      };
    }

    return this.sendReminder(submission, options.isUrgent);
  }

  /**
   * Check and handle expired submissions
   */
  async processExpiredSubmissions(): Promise<number> {
    let expiredCount = 0;

    try {
      // Find submissions that should be expired
      const submissions = await DocuSealSubmission.findAll({
        where: {
          status: ['pending', 'sent', 'viewed', 'partially_signed'],
          expireAt: {
            $lte: new Date(),
          },
        },
      });

      for (const submission of submissions) {
        submission.status = 'expired';
        await submission.save();
        expiredCount++;

        console.log(`   Marked submission ${submission.id} as expired`);
      }

      if (expiredCount > 0) {
        console.log(`⏰ Marked ${expiredCount} submissions as expired`);
      }

      return expiredCount;
    } catch (error) {
      console.error('Error processing expired submissions:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const contractReminderScheduler = new ContractReminderScheduler();
export default contractReminderScheduler;
