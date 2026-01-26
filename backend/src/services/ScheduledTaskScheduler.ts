/**
 * ScheduledTaskScheduler
 *
 * Cron-based scheduler that polls for and executes due scheduled tasks.
 * Follows the same pattern as FollowUpScheduler.
 */

import * as cron from 'node-cron';
import { scheduledTaskService } from './agent/ScheduledTaskService';
import { logger } from '../utils/logger';

class ScheduledTaskScheduler {
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;
  private cleanupTask: cron.ScheduledTask | null = null;

  // Stats
  private stats = {
    totalRuns: 0,
    tasksExecuted: 0,
    tasksFailed: 0,
    lastRunAt: null as Date | null,
  };

  /**
   * Start the scheduler
   */
  start(cronExpression: string = '* * * * *'): void {
    if (this.task) {
      logger.warn('ScheduledTaskScheduler already running');
      return;
    }

    // Main task execution - every minute
    this.task = cron.schedule(cronExpression, async () => {
      await this.processScheduledTasks();
    });

    // Cleanup task - daily at 3 AM
    this.cleanupTask = cron.schedule('0 3 * * *', async () => {
      await this.runCleanup();
    });

    logger.info({ cronExpression }, 'ScheduledTaskScheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
    }
    logger.info('ScheduledTaskScheduler stopped');
  }

  /**
   * Process due scheduled tasks
   */
  private async processScheduledTasks(): Promise<void> {
    if (this.isRunning) {
      logger.debug('ScheduledTaskScheduler already processing, skipping');
      return;
    }

    this.isRunning = true;
    this.stats.totalRuns++;
    this.stats.lastRunAt = new Date();

    try {
      // Get due tasks
      const dueTasks = await scheduledTaskService.getDueTasks(10);

      if (dueTasks.length === 0) {
        return;
      }

      logger.info({ count: dueTasks.length }, 'Processing due scheduled tasks');

      // Execute each task
      for (const task of dueTasks) {
        try {
          const result = await scheduledTaskService.executeTask(task);

          if (result.success) {
            await scheduledTaskService.markCompleted(task, { result });
            this.stats.tasksExecuted++;
            logger.info({ taskId: task.id, type: task.type }, 'Scheduled task executed successfully');
          } else {
            await scheduledTaskService.markFailed(task, result.error || 'Unknown error');
            this.stats.tasksFailed++;
            logger.warn({ taskId: task.id, error: result.error }, 'Scheduled task execution failed');
          }
        } catch (error) {
          await scheduledTaskService.markFailed(task, String(error));
          this.stats.tasksFailed++;
          logger.error({ error, taskId: task.id }, 'Error executing scheduled task');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error in ScheduledTaskScheduler.processScheduledTasks');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run cleanup of old tasks
   */
  private async runCleanup(): Promise<void> {
    try {
      const cleaned = await scheduledTaskService.cleanupOldTasks(30);
      if (cleaned > 0) {
        logger.info({ count: cleaned }, 'Cleaned up old scheduled tasks');
      }
    } catch (error) {
      logger.error({ error }, 'Error cleaning up old scheduled tasks');
    }
  }

  /**
   * Get scheduler stats
   */
  getStats(): typeof this.stats & { isRunning: boolean } {
    return {
      ...this.stats,
      isRunning: this.isRunning,
    };
  }

  /**
   * Force process tasks immediately (for testing)
   */
  async processNow(): Promise<void> {
    await this.processScheduledTasks();
  }
}

export const scheduledTaskScheduler = new ScheduledTaskScheduler();
export default ScheduledTaskScheduler;
