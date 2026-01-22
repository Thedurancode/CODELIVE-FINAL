/**
 * File Watcher Service
 *
 * Monitors a folder for new files and automatically indexes them
 * into the knowledge base.
 */

import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { knowledgeService } from './KnowledgeService';
import { DocumentProcessor } from './DocumentProcessor';
import { buyBoxImportService } from '../BuyBoxImportService';

export interface WatcherStats {
  watchPath: string;
  isWatching: boolean;
  filesProcessed: number;
  filesQueued: number;
  lastProcessed?: string;
  lastProcessedAt?: Date;
  errors: number;
}

export interface WatcherEvent {
  type: 'add' | 'change' | 'unlink' | 'error';
  path: string;
  timestamp: Date;
  success?: boolean;
  error?: string;
}

class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private watchPath: string = '';
  private isWatching: boolean = false;
  private processor: DocumentProcessor;
  private processQueue: string[] = [];
  private isProcessing: boolean = false;
  private stats: WatcherStats;
  private eventLog: WatcherEvent[] = [];
  private maxEventLog: number = 100;
  private retryCount: Map<string, number> = new Map();
  private maxRetries: number = 3;
  private processingTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.processor = new DocumentProcessor();
    this.stats = {
      watchPath: '',
      isWatching: false,
      filesProcessed: 0,
      filesQueued: 0,
      errors: 0,
    };
  }

  /**
   * Start watching a folder
   */
  async start(folderPath: string): Promise<void> {
    if (this.isWatching) {
      console.log('File watcher already running');
      return;
    }

    // Resolve and validate the path
    const resolvedPath = path.resolve(folderPath);

    // Create folder if it doesn't exist
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
      console.log(`  Created knowledge folder: ${resolvedPath}`);
    }

    this.watchPath = resolvedPath;
    this.stats.watchPath = resolvedPath;

    // Configure the watcher
    this.watcher = chokidar.watch(resolvedPath, {
      persistent: true,
      ignoreInitial: false, // Process existing files
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles
        /node_modules/,
        /\.tmp$/,
        /~$/,
      ],
    });

    // Set up event handlers
    this.watcher
      .on('add', (filePath) => this.handleFileAdd(filePath))
      .on('change', (filePath) => this.handleFileChange(filePath))
      .on('unlink', (filePath) => this.handleFileRemove(filePath))
      .on('error', (error: unknown) => this.handleError(error))
      .on('ready', () => {
        this.isWatching = true;
        this.stats.isWatching = true;
        console.log(`  File watcher ready: ${resolvedPath}`);
        console.log(`  Supported formats: ${DocumentProcessor.getSupportedExtensions().join(', ')}`);
      });
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      this.stats.isWatching = false;
      // Clear retry count map to prevent memory leak
      this.retryCount.clear();
      // Clear pending timeout to prevent memory leak
      if (this.processingTimeoutId) {
        clearTimeout(this.processingTimeoutId);
        this.processingTimeoutId = null;
      }
      // Clear pending queue
      this.processQueue = [];
      this.stats.filesQueued = 0;
      console.log('  File watcher stopped');
    }
  }

  /**
   * Handle new file added
   */
  private async handleFileAdd(filePath: string): Promise<void> {
    if (!this.processor.isSupported(filePath)) {
      return; // Skip unsupported files
    }

    console.log(`  New file detected: ${path.basename(filePath)}`);
    this.addToQueue(filePath);
    this.logEvent('add', filePath);
  }

  /**
   * Handle file changed
   */
  private async handleFileChange(filePath: string): Promise<void> {
    if (!this.processor.isSupported(filePath)) {
      return;
    }

    console.log(`  File changed: ${path.basename(filePath)}`);
    this.addToQueue(filePath);
    this.logEvent('change', filePath);
  }

  /**
   * Handle file removed
   */
  private async handleFileRemove(filePath: string): Promise<void> {
    if (!this.processor.isSupported(filePath)) {
      return;
    }

    console.log(`  File removed: ${path.basename(filePath)}`);

    try {
      // Find and delete the document from knowledge base
      const docs = knowledgeService.getDocuments();
      const doc = docs.find((d) => d.filepath === filePath);

      if (doc) {
        await knowledgeService.deleteDocument(doc.id);
        this.logEvent('unlink', filePath, true);
      }
    } catch (error: any) {
      this.logEvent('unlink', filePath, false, error.message);
    }
  }

  /**
   * Handle watcher error
   */
  private handleError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('  File watcher error:', error);
    this.stats.errors++;
    this.logEvent('error', '', false, errorMessage);
  }

  /**
   * Add file to processing queue
   */
  private addToQueue(filePath: string): void {
    if (!this.processQueue.includes(filePath)) {
      this.processQueue.push(filePath);
      this.stats.filesQueued = this.processQueue.length;
      this.processNextInQueue();
    }
  }

  /**
   * Process next file in queue
   */
  private async processNextInQueue(): Promise<void> {
    if (this.isProcessing || this.processQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const filePath = this.processQueue.shift();
    if (!filePath) {
      this.isProcessing = false;
      return;
    }
    this.stats.filesQueued = this.processQueue.length;

    try {
      // Wait for knowledge service to be ready
      if (!knowledgeService.isReady()) {
        console.log('  Waiting for knowledge service...');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        if (!knowledgeService.isReady()) {
          const retries = (this.retryCount.get(filePath) || 0) + 1;
          if (retries <= this.maxRetries) {
            console.warn(`  Knowledge service not ready, re-queuing file (attempt ${retries}/${this.maxRetries})`);
            this.retryCount.set(filePath, retries);
            this.processQueue.unshift(filePath);
          } else {
            console.error(`  Knowledge service not ready after ${this.maxRetries} attempts, dropping file: ${path.basename(filePath)}`);
            this.retryCount.delete(filePath);
            this.stats.errors++;
          }
          this.isProcessing = false;
          return;
        }
      }

      // Index the document
      await knowledgeService.indexDocument(filePath);

      // Auto-create buy box if file is in Buyboxes folder (PDF or image)
      const isBuyboxFolder = filePath.toLowerCase().includes('/buybox') ||
                             filePath.toLowerCase().includes('\\buybox');
      const isSupportedForImport = /\.(pdf|png|jpg|jpeg|gif|webp)$/i.test(filePath);

      if (isBuyboxFolder && isSupportedForImport) {
        try {
          console.log(`  📦 Auto-importing buy box from: ${path.basename(filePath)}`);
          const result = await buyBoxImportService.importFromFile(filePath);
          if (result.success) {
            console.log(`  ✅ Buy box ${result.action}: ${result.buyBoxName}`);
            if (result.tagsApplied?.length) {
              console.log(`     Tags applied: ${result.tagsApplied.join(', ')}`);
            }
          } else {
            console.warn(`  ⚠️ Buy box import failed: ${result.message}`);
          }
        } catch (importError: any) {
          console.warn(`  ⚠️ Buy box auto-import failed: ${importError.message}`);
          // Don't fail the overall process - knowledge base indexing succeeded
        }
      }

      // Clear retry count on success
      this.retryCount.delete(filePath);

      this.stats.filesProcessed++;
      this.stats.lastProcessed = path.basename(filePath);
      this.stats.lastProcessedAt = new Date();

      // Update event log
      const event = this.eventLog.find((e) => e.path === filePath && !e.success);
      if (event) {
        event.success = true;
      }
    } catch (error: any) {
      console.error(`  Failed to process ${path.basename(filePath)}:`, error.message);
      this.stats.errors++;

      // Clear retry count on failure to prevent memory leak
      this.retryCount.delete(filePath);

      // Update event log
      const event = this.eventLog.find((e) => e.path === filePath && e.success === undefined);
      if (event) {
        event.success = false;
        event.error = error.message;
      }
    }

    this.isProcessing = false;

    // Process next file if any
    if (this.processQueue.length > 0) {
      this.processingTimeoutId = setTimeout(() => {
        this.processingTimeoutId = null;
        this.processNextInQueue();
      }, 500);
    }
  }

  /**
   * Log an event
   */
  private logEvent(type: WatcherEvent['type'], filePath: string, success?: boolean, error?: string): void {
    const event: WatcherEvent = {
      type,
      path: filePath,
      timestamp: new Date(),
      success,
      error,
    };

    this.eventLog.unshift(event);

    // Keep log size manageable
    if (this.eventLog.length > this.maxEventLog) {
      this.eventLog = this.eventLog.slice(0, this.maxEventLog);
    }
  }

  /**
   * Get watcher statistics
   */
  getStats(): WatcherStats {
    return { ...this.stats };
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 20): WatcherEvent[] {
    return this.eventLog.slice(0, limit);
  }

  /**
   * Manually trigger reindex of all files
   */
  async reindexAll(): Promise<{ processed: number; failed: number }> {
    if (!this.watchPath) {
      throw new Error('No watch path configured');
    }

    let processed = 0;
    let failed = 0;

    const processDir = async (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await processDir(fullPath);
        } else if (entry.isFile() && this.processor.isSupported(fullPath)) {
          try {
            await knowledgeService.indexDocument(fullPath);
            processed++;
          } catch (error) {
            failed++;
          }
        }
      }
    };

    await processDir(this.watchPath);

    return { processed, failed };
  }

  /**
   * Check if watching
   */
  isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Get watch path
   */
  getWatchPath(): string {
    return this.watchPath;
  }
}

export const fileWatcher = new FileWatcher();
export default fileWatcher;
