/**
 * FollowUpScheduler
 *
 * Cron-based scheduler that processes due follow-up chain executions.
 * Runs every 15 minutes to check for and execute due steps.
 */

import cron from 'node-cron';
import { followUpService } from './FollowUpService';
import FollowUpExecution from '../models/FollowUpExecution';

class FollowUpScheduler {
  private job: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private lastRunAt: Date | null = null;
  private stats = {
    totalRuns: 0,
    totalProcessed: 0,
    totalErrors: 0,
  };

  /**
   * Start the scheduler
   * Runs every 15 minutes by default
   */
  start(cronExpression: string = '*/15 * * * *'): void {
    if (this.job) {
      console.log('FollowUpScheduler is already running');
      return;
    }

    this.job = cron.schedule(cronExpression, async () => {
      await this.run();
    });

    console.log(`📅 FollowUpScheduler started (${cronExpression})`);

    // Run immediately on start
    this.run().catch(err => console.error('Initial follow-up run failed:', err));
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('📅 FollowUpScheduler stopped');
    }
  }

  /**
   * Manual run
   */
  async run(): Promise<{ processed: number; errors: number }> {
    if (this.isRunning) {
      console.log('FollowUpScheduler is already processing');
      return { processed: 0, errors: 0 };
    }

    this.isRunning = true;
    this.lastRunAt = new Date();
    this.stats.totalRuns++;

    try {
      const result = await followUpService.processDueFollowUps();
      this.stats.totalProcessed += result.processed;
      this.stats.totalErrors += result.errors;
      return result;
    } catch (error) {
      console.error('FollowUpScheduler run failed:', error);
      this.stats.totalErrors++;
      return { processed: 0, errors: 1 };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    processing: boolean;
    lastRunAt: Date | null;
    stats: { totalRuns: number; totalProcessed: number; totalErrors: number };
  } {
    return {
      running: this.job !== null,
      processing: this.isRunning,
      lastRunAt: this.lastRunAt,
      stats: { ...this.stats },
    };
  }

  /**
   * Get pending execution count
   */
  async getPendingCount(): Promise<number> {
    const stats = await FollowUpExecution.getStats();
    return stats.dueNow;
  }

  /**
   * Cleanup old executions
   */
  async cleanup(retentionDays: number = 30): Promise<number> {
    return FollowUpExecution.cleanup(retentionDays);
  }
}

export const followUpScheduler = new FollowUpScheduler();
export default followUpScheduler;
