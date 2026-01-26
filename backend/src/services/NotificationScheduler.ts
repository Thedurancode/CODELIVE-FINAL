/**
 * Notification Scheduler
 *
 * Handles scheduled processing of daily and weekly notification digests.
 * Uses node-cron for scheduling.
 */

import cron from 'node-cron';
import { notificationQueueService } from './NotificationQueueService';

class NotificationScheduler {
  private dailyJob: cron.ScheduledTask | null = null;
  private weeklyJob: cron.ScheduledTask | null = null;
  private cleanupJob: cron.ScheduledTask | null = null;
  private initialized = false;

  /**
   * Initialize the scheduler with cron jobs
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize the notification queue service
    await notificationQueueService.initialize();

    // Daily digest at 8:00 AM local time
    this.dailyJob = cron.schedule('0 8 * * *', async () => {
      console.log('⏰ Running daily notification digest...');
      try {
        const count = await notificationQueueService.processDailyDigest();
        console.log(`⏰ Daily digest complete: ${count} users notified`);
      } catch (error) {
        console.error('⏰ Daily digest failed:', error);
      }
    }, {
      timezone: process.env.TZ || 'America/New_York',
    });

    // Weekly digest on Monday at 8:00 AM local time
    this.weeklyJob = cron.schedule('0 8 * * 1', async () => {
      console.log('⏰ Running weekly notification digest...');
      try {
        const count = await notificationQueueService.processWeeklyDigest();
        console.log(`⏰ Weekly digest complete: ${count} users notified`);
      } catch (error) {
        console.error('⏰ Weekly digest failed:', error);
      }
    }, {
      timezone: process.env.TZ || 'America/New_York',
    });

    // Cleanup old sent/failed notifications daily at 2 AM
    this.cleanupJob = cron.schedule('0 2 * * *', async () => {
      console.log('🧹 Cleaning up old notifications...');
      try {
        const { NotificationQueue } = await import('../models');
        const { Op } = await import('sequelize');

        // Delete sent notifications older than 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const deleted = await NotificationQueue.destroy({
          where: {
            status: { [Op.in]: ['sent', 'skipped'] },
            updatedAt: { [Op.lt]: thirtyDaysAgo },
          },
        });

        console.log(`🧹 Cleaned up ${deleted} old notifications`);
      } catch (error) {
        console.error('🧹 Cleanup failed:', error);
      }
    }, {
      timezone: process.env.TZ || 'America/New_York',
    });

    this.initialized = true;
    console.log('⏰ NotificationScheduler initialized with cron jobs:');
    console.log('   - Daily digest: 8:00 AM');
    console.log('   - Weekly digest: Monday 8:00 AM');
    console.log('   - Cleanup: 2:00 AM');
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    this.dailyJob?.stop();
    this.weeklyJob?.stop();
    this.cleanupJob?.stop();
    console.log('⏰ NotificationScheduler stopped');
  }

  /**
   * Manually trigger daily digest (useful for testing)
   */
  async triggerDailyDigest(): Promise<number> {
    return notificationQueueService.processDailyDigest();
  }

  /**
   * Manually trigger weekly digest (useful for testing)
   */
  async triggerWeeklyDigest(): Promise<number> {
    return notificationQueueService.processWeeklyDigest();
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.initialized;
  }
}

export const notificationScheduler = new NotificationScheduler();
export default NotificationScheduler;
