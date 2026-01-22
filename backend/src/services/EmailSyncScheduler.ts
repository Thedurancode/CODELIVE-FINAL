/**
 * Email Sync Scheduler
 *
 * Automatically syncs emails from IMAP servers for all active user email configurations.
 * Configurable interval via EMAIL_SYNC_INTERVAL_MINUTES environment variable.
 */

import * as cron from 'node-cron';
import { emailClientFactory } from './EmailClientService';
import UserEmailConfig from '../models/UserEmailConfig';

interface EmailSyncSchedulerConfig {
  intervalMinutes: number;
  maxEmailsPerSync: number;
  concurrentSyncs: number;
}

interface EmailSyncSchedulerStats {
  lastRunAt: Date | null;
  totalSyncs: number;
  totalEmailsSynced: number;
  totalErrors: number;
  isRunning: boolean;
}

interface SyncResult {
  userId: string;
  accountEmail: string;
  synced: number;
  skipped: number;
  errors: number;
  success: boolean;
  error?: string;
}

class EmailSyncScheduler {
  private isInitialized = false;
  private task: cron.ScheduledTask | null = null;
  private config: EmailSyncSchedulerConfig;
  private stats: EmailSyncSchedulerStats;

  constructor() {
    this.config = {
      intervalMinutes: parseInt(process.env.EMAIL_SYNC_INTERVAL_MINUTES || '10', 10),
      maxEmailsPerSync: parseInt(process.env.EMAIL_SYNC_MAX_EMAILS || '100', 10),
      concurrentSyncs: parseInt(process.env.EMAIL_SYNC_CONCURRENT || '3', 10),
    };

    this.stats = {
      lastRunAt: null,
      totalSyncs: 0,
      totalEmailsSynced: 0,
      totalErrors: 0,
      isRunning: false,
    };
  }

  /**
   * Initialize the scheduler
   */
  initialize(config?: Partial<EmailSyncSchedulerConfig>): void {
    if (this.isInitialized) {
      console.log('[EmailSyncScheduler] Already initialized');
      return;
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }

    console.log(`[EmailSyncScheduler] Initialized (interval: ${this.config.intervalMinutes} minutes)`);
    this.isInitialized = true;
  }

  /**
   * Start the scheduler
   */
  start(cronExpression?: string): void {
    if (!this.isInitialized) {
      this.initialize();
    }

    // Stop existing task if running
    this.stop();

    // Default: run every X minutes based on config
    const expression = cronExpression || `*/${this.config.intervalMinutes} * * * *`;

    this.task = cron.schedule(expression, async () => {
      await this.runSync();
    });

    console.log(`[EmailSyncScheduler] Started with schedule: ${expression}`);

    // Run initial sync after 30 seconds
    setTimeout(() => {
      console.log('[EmailSyncScheduler] Running initial sync...');
      this.runSync();
    }, 30000);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[EmailSyncScheduler] Stopped');
    }
  }

  /**
   * Run email sync for all active configurations
   */
  async runSync(): Promise<SyncResult[]> {
    if (this.stats.isRunning) {
      console.log('[EmailSyncScheduler] Sync already in progress, skipping');
      return [];
    }

    this.stats.isRunning = true;
    this.stats.lastRunAt = new Date();
    const results: SyncResult[] = [];

    try {
      // Get all active email configurations
      const configs = await UserEmailConfig.findAll({
        where: { isActive: true },
      });

      if (configs.length === 0) {
        console.log('[EmailSyncScheduler] No active email configurations found');
        return results;
      }

      console.log(`[EmailSyncScheduler] Syncing ${configs.length} email account(s)...`);

      // Process in batches based on concurrency setting
      for (let i = 0; i < configs.length; i += this.config.concurrentSyncs) {
        const batch = configs.slice(i, i + this.config.concurrentSyncs);
        const batchResults = await Promise.allSettled(
          batch.map(config => this.syncUserEmail(config))
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (result.value.success) {
              this.stats.totalEmailsSynced += result.value.synced;
            } else {
              this.stats.totalErrors++;
            }
          } else {
            this.stats.totalErrors++;
            console.error('[EmailSyncScheduler] Batch sync error:', result.reason);
          }
        }
      }

      this.stats.totalSyncs++;
      console.log(`[EmailSyncScheduler] Sync complete. Results:`,
        results.map(r => `${r.accountEmail}: ${r.synced} synced, ${r.errors} errors`).join('; ')
      );

    } catch (error) {
      console.error('[EmailSyncScheduler] Error during sync run:', error);
      this.stats.totalErrors++;
    } finally {
      this.stats.isRunning = false;
    }

    return results;
  }

  /**
   * Sync emails for a single user configuration
   */
  private async syncUserEmail(config: UserEmailConfig): Promise<SyncResult> {
    // Access values through get() to handle Sequelize field mapping
    const userId = config.get('userId') as string;
    const accountEmail = config.get('accountEmail') as string;

    const result: SyncResult = {
      userId,
      accountEmail,
      synced: 0,
      skipped: 0,
      errors: 0,
      success: false,
    };

    try {
      // Update sync status
      await config.updateSyncStatus('syncing');

      // Create email client for this user
      const emailClient = await emailClientFactory.createForUser(userId);

      if (!emailClient) {
        throw new Error('Failed to create email client');
      }

      // Sync inbox
      const syncResult = await emailClient.syncInbox({
        limit: this.config.maxEmailsPerSync,
      });

      result.synced = syncResult.synced;
      result.skipped = syncResult.skipped;
      result.errors = syncResult.errors;
      result.success = true;

      // Update sync status to idle
      await config.updateSyncStatus('idle');

      if (syncResult.synced > 0) {
        console.log(`[EmailSyncScheduler] ${accountEmail}: Synced ${syncResult.synced} new emails`);
      }

    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Unknown error';

      // Update sync status to error
      await config.updateSyncStatus('error', result.error);

      console.error(`[EmailSyncScheduler] Error syncing ${accountEmail}:`, result.error);
    }

    return result;
  }

  /**
   * Manually trigger a sync for a specific user
   */
  async syncUser(userId: string): Promise<SyncResult | null> {
    const config = await UserEmailConfig.findOne({
      where: { userId, isActive: true },
    });

    if (!config) {
      return null;
    }

    return this.syncUserEmail(config);
  }

  /**
   * Get scheduler statistics
   */
  getStats(): EmailSyncSchedulerStats & { config: EmailSyncSchedulerConfig } {
    return {
      ...this.stats,
      config: this.config,
    };
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.task !== null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EmailSyncSchedulerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[EmailSyncScheduler] Config updated:', this.config);
  }
}

export const emailSyncScheduler = new EmailSyncScheduler();
export default emailSyncScheduler;
