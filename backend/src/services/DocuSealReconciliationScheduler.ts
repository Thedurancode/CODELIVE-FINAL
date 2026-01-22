/**
 * DocuSeal Reconciliation Scheduler
 *
 * Polls DocuSeal API to reconcile local submission status with actual status.
 * Handles cases where webhooks fail to arrive.
 *
 * FIX 5: Ensures submissions don't get stuck if webhooks fail.
 */

import cron from 'node-cron';
import { Op } from 'sequelize';
import DocuSealSubmission from '../models/DocuSealSubmission';
import { docuSealService } from './DocuSealService';
import { signedDocumentService } from './SignedDocumentService';

interface ReconciliationConfig {
  // How often to check for stale submissions (cron expression)
  checkInterval: string;
  // Hours after which a submission is considered stale
  staleThresholdHours: number;
  // Maximum submissions to process per run
  batchSize: number;
  // Whether to automatically process completed submissions
  autoProcessCompleted: boolean;
}

interface ReconciliationResult {
  checked: number;
  updated: number;
  completed: number;
  errors: string[];
}

class DocuSealReconciliationScheduler {
  private task: cron.ScheduledTask | null = null;
  private running: boolean = false;
  private lastRun: Date | null = null;
  private config: ReconciliationConfig;

  constructor() {
    this.config = {
      checkInterval: '0 */4 * * *', // Every 4 hours
      staleThresholdHours: 24,
      batchSize: 50,
      autoProcessCompleted: true,
    };
  }

  /**
   * Start the scheduler
   */
  start(cronExpression?: string): void {
    if (this.task) {
      console.log('[DocuSealReconciliation] Already running');
      return;
    }

    const expression = cronExpression || this.config.checkInterval;

    this.task = cron.schedule(expression, async () => {
      await this.reconcileSubmissions();
    });

    this.running = true;
    console.log(`[DocuSealReconciliation] Started (${expression})`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.running = false;
      console.log('[DocuSealReconciliation] Stopped');
    }
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Main reconciliation process
   */
  async reconcileSubmissions(): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
      checked: 0,
      updated: 0,
      completed: 0,
      errors: [],
    };

    if (!docuSealService.isReady()) {
      console.log('[DocuSealReconciliation] DocuSeal service not ready, skipping');
      return result;
    }

    try {
      console.log('[DocuSealReconciliation] Starting reconciliation...');

      const staleThreshold = new Date(
        Date.now() - this.config.staleThresholdHours * 60 * 60 * 1000
      );

      // Find submissions that might be stale
      const staleSubmissions = await DocuSealSubmission.findAll({
        where: {
          status: { [Op.in]: ['pending', 'sent', 'opened', 'partially_completed'] },
          createdAt: { [Op.lt]: staleThreshold },
        },
        limit: this.config.batchSize,
        order: [['createdAt', 'ASC']], // Process oldest first
      });

      console.log(`[DocuSealReconciliation] Found ${staleSubmissions.length} stale submissions to check`);

      for (const submission of staleSubmissions) {
        result.checked++;

        try {
          await this.reconcileSubmission(submission, result);
        } catch (error) {
          const errorMsg = `Submission ${submission.id}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          console.warn(`[DocuSealReconciliation] ${errorMsg}`);
        }
      }

      this.lastRun = new Date();

      console.log(
        `[DocuSealReconciliation] Complete: ${result.checked} checked, ${result.updated} updated, ${result.completed} completed`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMsg);
      console.error('[DocuSealReconciliation] Error:', errorMsg);
    }

    return result;
  }

  /**
   * Reconcile a single submission
   */
  private async reconcileSubmission(
    submission: DocuSealSubmission,
    result: ReconciliationResult
  ): Promise<void> {
    // Poll DocuSeal API for real status
    const docuSealData = await docuSealService.getSubmission(submission.docuSealSubmissionId);

    if (!docuSealData) {
      console.warn(`[DocuSealReconciliation] Could not fetch submission ${submission.docuSealSubmissionId} from DocuSeal`);
      return;
    }

    // Map DocuSeal status to our status
    const realStatus = this.mapDocuSealStatus(docuSealData.status);

    // Check if status differs
    if (realStatus !== submission.status) {
      console.log(
        `[DocuSealReconciliation] Submission ${submission.id}: ${submission.status} -> ${realStatus}`
      );

      // Update local status
      const updates: Record<string, any> = {
        status: realStatus,
      };

      // Update URLs if available
      if (docuSealData.combined_document_url) {
        updates.combinedDocumentUrl = docuSealData.combined_document_url;
      }
      if (docuSealData.audit_log_url) {
        updates.auditLogUrl = docuSealData.audit_log_url;
      }
      if (docuSealData.documents?.length) {
        updates.documentUrls = docuSealData.documents.map((d: any) => d.url);
      }

      // If completed, set completedAt
      if (realStatus === 'completed' && !submission.completedAt) {
        updates.completedAt = docuSealData.completed_at
          ? new Date(docuSealData.completed_at)
          : new Date();
      }

      await submission.update(updates);
      result.updated++;

      // If now completed, trigger document processing
      if (realStatus === 'completed' && this.config.autoProcessCompleted) {
        try {
          console.log(`[DocuSealReconciliation] Processing completed submission ${submission.docuSealSubmissionId}`);
          await signedDocumentService.downloadAndProcessSignedDocument(submission.docuSealSubmissionId, {
            runOCR: true,
            updateCompliance: true,
          });
          result.completed++;
        } catch (processError) {
          console.warn(
            `[DocuSealReconciliation] Failed to process submission ${submission.docuSealSubmissionId}:`,
            processError
          );
        }
      }
    }
  }

  /**
   * Map DocuSeal API status to our internal status
   */
  private mapDocuSealStatus(docuSealStatus: string): string {
    const statusMap: Record<string, string> = {
      pending: 'pending',
      awaiting: 'sent',
      opened: 'opened',
      partially_completed: 'partially_completed',
      completed: 'completed',
      declined: 'declined',
      expired: 'expired',
      archived: 'archived',
    };

    return statusMap[docuSealStatus] || docuSealStatus;
  }

  /**
   * Manually trigger reconciliation
   */
  async runNow(): Promise<ReconciliationResult> {
    return this.reconcileSubmissions();
  }

  /**
   * Get status of scheduler
   */
  getStatus(): {
    running: boolean;
    lastRun: Date | null;
    config: ReconciliationConfig;
  } {
    return {
      running: this.running,
      lastRun: this.lastRun,
      config: this.config,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ReconciliationConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[DocuSealReconciliation] Config updated:', this.config);
  }

  /**
   * Reconcile a specific submission by ID (for manual use)
   */
  async reconcileById(submissionId: number): Promise<{
    success: boolean;
    previousStatus?: string;
    newStatus?: string;
    error?: string;
  }> {
    if (!docuSealService.isReady()) {
      return { success: false, error: 'DocuSeal service not ready' };
    }

    const submission = await DocuSealSubmission.findByPk(submissionId);
    if (!submission) {
      return { success: false, error: 'Submission not found' };
    }

    try {
      const previousStatus = submission.status;
      const result: ReconciliationResult = { checked: 0, updated: 0, completed: 0, errors: [] };

      await this.reconcileSubmission(submission, result);

      await submission.reload();

      return {
        success: true,
        previousStatus,
        newStatus: submission.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const docuSealReconciliationScheduler = new DocuSealReconciliationScheduler();
export default docuSealReconciliationScheduler;
