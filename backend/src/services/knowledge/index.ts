/**
 * Knowledge Module
 *
 * Exports all knowledge-related services:
 * - DocumentProcessor: Extract text from various file types
 * - KnowledgeService: Vector storage and semantic search
 * - FileWatcher: Automatic folder monitoring
 */

export { DocumentProcessor, type ProcessedDocument, type ChunkedDocument, type DocumentChunk } from './DocumentProcessor';
export { knowledgeService, type KnowledgeDocument, type SearchResult, type KnowledgeStats } from './KnowledgeService';
export { fileWatcher, type WatcherStats, type WatcherEvent } from './FileWatcher';

// Convenience function to start the knowledge system
export async function initializeKnowledgeSystem(watchFolder?: string, loadDefaults: boolean = true): Promise<void> {
  const { knowledgeService } = await import('./KnowledgeService');
  const { fileWatcher } = await import('./FileWatcher');

  // Initialize knowledge service
  await knowledgeService.initialize();

  if (!knowledgeService.isReady()) {
    console.warn('  Knowledge service not ready - skipping file watcher');
    return;
  }

  // Load default documents if enabled
  if (loadDefaults) {
    await knowledgeService.loadDefaultDocuments();
  }

  // Start file watcher for auto-sync
  if (watchFolder) {
    await fileWatcher.start(watchFolder);
    console.log(`  Auto-sync enabled for: ${watchFolder}`);
    console.log(`  Drop files in this folder to automatically index them`);
  }
}
