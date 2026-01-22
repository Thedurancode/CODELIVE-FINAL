/**
 * Scoring Queue Service
 *
 * Provides async/non-blocking scoring operations using a simple
 * in-memory queue with Redis-backed persistence for reliability.
 *
 * This prevents ML scoring from blocking the main request thread
 * and allows for better scalability under load.
 */

import { EventEmitter } from 'events';
import { redisService } from './RedisService';
import { NormalizedDeal, BuyBox, ScoringResult } from '../plugins/types';

// Queue configuration
const QUEUE_CONFIG = {
  MAX_CONCURRENT: parseInt(process.env.SCORING_QUEUE_CONCURRENCY || '5', 10),
  JOB_TIMEOUT_MS: parseInt(process.env.SCORING_JOB_TIMEOUT || '30000', 10),
  RESULT_TTL_SECONDS: 60 * 60, // 1 hour
};

// Job status enum
export enum ScoringJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// Job interface
export interface ScoringJob {
  id: string;
  deal: NormalizedDeal;
  buyBoxId?: string; // If undefined, score against all buy boxes
  status: ScoringJobStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: ScoringResult | ScoringResult[];
  error?: string;
}

// Job result callback type
type JobCallback = (job: ScoringJob) => void;

class ScoringQueueService extends EventEmitter {
  private queue: ScoringJob[] = [];
  private processing: Map<string, ScoringJob> = new Map();
  private callbacks: Map<string, JobCallback[]> = new Map();
  private isProcessing: boolean = false;
  private scoringFunction?: (deal: NormalizedDeal, buyBox?: BuyBox) => Promise<ScoringResult | ScoringResult[]>;
  private enqueueLock: Promise<void> = Promise.resolve();

  constructor() {
    super();
    this.setMaxListeners(100); // Allow many concurrent listeners
  }

  /**
   * Set the scoring function to use for processing jobs
   * This allows dependency injection of the actual scoring logic
   */
  setScoringFunction(fn: (deal: NormalizedDeal, buyBox?: BuyBox) => Promise<ScoringResult | ScoringResult[]>): void {
    this.scoringFunction = fn;
  }

  /**
   * Enqueue a scoring job and return immediately
   * Returns a job ID that can be used to check status or get results
   * Uses a lock to prevent race conditions in job deduplication
   */
  async enqueue(deal: NormalizedDeal, buyBoxId?: string): Promise<string> {
    const jobId = this.generateJobId(deal, buyBoxId);

    // Use lock to ensure atomic check-and-set for deduplication
    let resolveLock: () => void;
    const currentLock = this.enqueueLock;
    this.enqueueLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });

    try {
      // Wait for any previous enqueue operation to complete
      await currentLock;

      // Check if job already exists (deduplication) - now atomic
      const existingJob = this.queue.find(j => j.id === jobId) ||
        this.processing.get(jobId);

      if (existingJob) {
        return jobId; // Return existing job ID
      }

      const job: ScoringJob = {
        id: jobId,
        deal,
        buyBoxId,
        status: ScoringJobStatus.PENDING,
        createdAt: new Date(),
      };

      this.queue.push(job);
      this.emit('job:enqueued', job);

      // Start processing if not already running
      this.processQueue();

      return jobId;
    } finally {
      resolveLock!();
    }
  }

  /**
   * Enqueue and wait for result (blocking)
   * Use this when you need the result immediately
   */
  async enqueueAndWait(deal: NormalizedDeal, buyBoxId?: string, timeoutMs?: number): Promise<ScoringResult | ScoringResult[]> {
    const jobId = await this.enqueue(deal, buyBoxId);
    return this.waitForJob(jobId, timeoutMs || QUEUE_CONFIG.JOB_TIMEOUT_MS);
  }

  /**
   * Wait for a job to complete
   */
  async waitForJob(jobId: string, timeoutMs: number = QUEUE_CONFIG.JOB_TIMEOUT_MS): Promise<ScoringResult | ScoringResult[]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeCallback(jobId, callback);
        reject(new Error(`Scoring job ${jobId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const callback: JobCallback = (job: ScoringJob) => {
        clearTimeout(timeout);

        if (job.status === ScoringJobStatus.COMPLETED && job.result) {
          resolve(job.result);
        } else if (job.status === ScoringJobStatus.FAILED) {
          reject(new Error(job.error || 'Scoring job failed'));
        }
      };

      // Check if job is already completed
      const completed = this.getCompletedJob(jobId);
      if (completed) {
        clearTimeout(timeout);
        if (completed.result) {
          resolve(completed.result);
        } else {
          reject(new Error(completed.error || 'Scoring job failed'));
        }
        return;
      }

      this.addCallback(jobId, callback);
    });
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): ScoringJobStatus | null {
    const queuedJob = this.queue.find(j => j.id === jobId);
    if (queuedJob) return queuedJob.status;

    const processingJob = this.processing.get(jobId);
    if (processingJob) return processingJob.status;

    return null;
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    pending: number;
    processing: number;
    maxConcurrent: number;
  } {
    return {
      pending: this.queue.length,
      processing: this.processing.size,
      maxConcurrent: QUEUE_CONFIG.MAX_CONCURRENT,
    };
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.processing.size < QUEUE_CONFIG.MAX_CONCURRENT) {
        const job = this.queue.shift();
        if (!job) break;

        // Move to processing
        job.status = ScoringJobStatus.PROCESSING;
        job.startedAt = new Date();
        this.processing.set(job.id, job);

        // Process job (don't await - run concurrently)
        this.processJob(job).catch(error => {
          console.error(`[ScoringQueue] Job ${job.id} failed:`, error);
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: ScoringJob): Promise<void> {
    try {
      if (!this.scoringFunction) {
        throw new Error('Scoring function not set. Call setScoringFunction() first.');
      }

      // Execute scoring
      const result = await this.scoringFunction(job.deal, undefined);

      // Mark as completed
      job.status = ScoringJobStatus.COMPLETED;
      job.completedAt = new Date();
      job.result = result;

      // Cache result in Redis
      await this.cacheJobResult(job);

      // Notify listeners
      this.notifyCallbacks(job.id, job);
      this.emit('job:completed', job);
    } catch (error) {
      job.status = ScoringJobStatus.FAILED;
      job.completedAt = new Date();
      job.error = error instanceof Error ? error.message : 'Unknown error';

      this.notifyCallbacks(job.id, job);
      this.emit('job:failed', job);
    } finally {
      // Remove from processing
      this.processing.delete(job.id);

      // Continue processing queue
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Generate a unique job ID based on deal and buy box
   */
  private generateJobId(deal: NormalizedDeal, buyBoxId?: string): string {
    const dealKey = deal.externalId ||
      deal.sourceId ||
      `${deal.address.street}-${deal.address.city}-${deal.address.state}`.toLowerCase().replace(/[^a-z0-9]/g, '');

    return buyBoxId
      ? `score:${dealKey}:${buyBoxId}`
      : `score:${dealKey}:all`;
  }

  /**
   * Cache job result in Redis
   */
  private async cacheJobResult(job: ScoringJob): Promise<void> {
    if (!job.result) return;

    try {
      await redisService.set(
        `scoring:result:${job.id}`,
        {
          status: job.status,
          result: job.result,
          completedAt: job.completedAt,
        },
        QUEUE_CONFIG.RESULT_TTL_SECONDS
      );
    } catch (error) {
      console.warn('[ScoringQueue] Failed to cache result:', error);
    }
  }

  /**
   * Get completed job from cache
   */
  private getCompletedJob(jobId: string): ScoringJob | null {
    // This is synchronous - for async cache lookup, use getJobResult
    return null;
  }

  /**
   * Get job result from cache
   */
  async getJobResult(jobId: string): Promise<ScoringResult | ScoringResult[] | null> {
    try {
      const cached = await redisService.get<{
        status: ScoringJobStatus;
        result: ScoringResult | ScoringResult[];
        completedAt: Date;
      }>(`scoring:result:${jobId}`);

      return cached?.result || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Add callback for job completion
   */
  private addCallback(jobId: string, callback: JobCallback): void {
    const callbacks = this.callbacks.get(jobId) || [];
    callbacks.push(callback);
    this.callbacks.set(jobId, callbacks);
  }

  /**
   * Remove callback
   */
  private removeCallback(jobId: string, callback: JobCallback): void {
    const callbacks = this.callbacks.get(jobId) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
    if (callbacks.length === 0) {
      this.callbacks.delete(jobId);
    } else {
      this.callbacks.set(jobId, callbacks);
    }
  }

  /**
   * Notify all callbacks for a job
   */
  private notifyCallbacks(jobId: string, job: ScoringJob): void {
    const callbacks = this.callbacks.get(jobId) || [];
    for (const callback of callbacks) {
      try {
        callback(job);
      } catch (error) {
        console.error('[ScoringQueue] Callback error:', error);
      }
    }
    this.callbacks.delete(jobId);
  }

  /**
   * Clear the queue (for testing/shutdown)
   */
  clear(): void {
    this.queue = [];
    this.processing.clear();
    this.callbacks.clear();
  }
}

// Export singleton instance
export const scoringQueueService = new ScoringQueueService();

// Export class for testing
export { ScoringQueueService };
