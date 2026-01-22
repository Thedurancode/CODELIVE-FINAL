/**
 * Migration Script: Local Filesystem to Supabase Storage
 *
 * This script migrates existing documents from local ./uploads/documents/
 * to Supabase Storage, updating database records with new storage keys.
 *
 * Usage:
 *   npx ts-node src/scripts/migrateToSupabaseStorage.ts
 *
 * Options:
 *   --dry-run     Preview what would be migrated without making changes
 *   --verbose     Show detailed progress for each file
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import sequelize from '../config/database';
import PropertyDocument from '../models/PropertyDocument';
import { supabaseStorageService } from '../services/SupabaseStorageService';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

// =============================================================================
// CONFIGURATION
// =============================================================================

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'documents');
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// =============================================================================
// MIGRATION RESULTS
// =============================================================================

interface MigrationResult {
  documentId: number;
  originalName: string;
  oldStorageKey: string;
  newStorageKey: string;
  success: boolean;
  error?: string;
}

// =============================================================================
// MAIN MIGRATION FUNCTION
// =============================================================================

async function migrateToSupabaseStorage(): Promise<void> {
  console.log('');
  console.log('='.repeat(70));
  console.log('  MIGRATION: Local Filesystem → Supabase Storage');
  console.log('='.repeat(70));
  console.log('');

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Initialize database connection
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }

  // Check if local uploads directory exists
  if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
    console.log(`📁 Local uploads directory not found: ${LOCAL_UPLOADS_DIR}`);
    console.log('   Nothing to migrate.\n');
    process.exit(0);
  }

  // Get all documents from database
  const documents = await PropertyDocument.findAll({
    order: [['propertyId', 'ASC'], ['createdAt', 'ASC']],
  });

  console.log(`📄 Found ${documents.length} document records in database\n`);

  if (documents.length === 0) {
    console.log('   Nothing to migrate.\n');
    process.exit(0);
  }

  // Migration results
  const results: MigrationResult[] = [];
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  // Process each document
  for (const doc of documents) {
    const result: MigrationResult = {
      documentId: doc.id,
      originalName: doc.originalName,
      oldStorageKey: doc.storageKey,
      newStorageKey: '',
      success: false,
    };

    try {
      // Check if already migrated (storageKey starts with 'documents/')
      if (doc.storageKey.startsWith('documents/')) {
        if (VERBOSE) {
          console.log(`⏭️  Skipping ${doc.id}: Already migrated (${doc.storageKey})`);
        }
        skipped++;
        continue;
      }

      // Build local file path
      const localPath = path.join(LOCAL_UPLOADS_DIR, doc.storageKey);

      // Check if local file exists
      if (!fs.existsSync(localPath)) {
        result.error = `Local file not found: ${localPath}`;
        console.log(`⚠️  Document ${doc.id}: File not found - ${doc.originalName}`);
        failed++;
        results.push(result);
        continue;
      }

      // Get file stats
      const fileStats = await stat(localPath);
      if (VERBOSE) {
        console.log(`📄 Document ${doc.id}: ${doc.originalName} (${formatBytes(fileStats.size)})`);
      }

      if (DRY_RUN) {
        console.log(`   [DRY RUN] Would migrate: ${doc.storageKey}`);
        migrated++;
        continue;
      }

      // Read file
      const buffer = await readFile(localPath);

      // Upload to Supabase
      const uploadResult = await supabaseStorageService.uploadDocument(
        buffer,
        doc.propertyId,
        doc.originalName,
        doc.mimeType
      );

      if (!uploadResult.success) {
        result.error = uploadResult.error || 'Upload failed';
        console.log(`❌ Document ${doc.id}: Upload failed - ${result.error}`);
        failed++;
        results.push(result);
        continue;
      }

      result.newStorageKey = uploadResult.path;
      result.success = true;

      // Update database record with new storage key
      await doc.update({ storageKey: uploadResult.path });

      if (VERBOSE) {
        console.log(`   ✅ Migrated: ${doc.storageKey} → ${uploadResult.path}`);
      }

      migrated++;
      results.push(result);

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      console.log(`❌ Document ${doc.id}: Exception - ${result.error}`);
      failed++;
      results.push(result);
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('  MIGRATION SUMMARY');
  console.log('='.repeat(70));
  console.log('');
  console.log(`   Total documents:  ${documents.length}`);
  console.log(`   ✅ Migrated:      ${migrated}`);
  console.log(`   ⏭️  Skipped:       ${skipped}`);
  console.log(`   ❌ Failed:        ${failed}`);
  console.log('');

  if (failed > 0) {
    console.log('Failed documents:');
    results
      .filter(r => !r.success && r.error)
      .forEach(r => {
        console.log(`   - Document ${r.documentId} (${r.originalName}): ${r.error}`);
      });
    console.log('');
  }

  if (DRY_RUN) {
    console.log('ℹ️  This was a dry run. Run without --dry-run to perform actual migration.\n');
  } else if (migrated > 0) {
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('⚠️  IMPORTANT: Local files in ./uploads/documents/ have been preserved.');
    console.log('   You can delete them manually after verifying the migration:\n');
    console.log(`   rm -rf ${LOCAL_UPLOADS_DIR}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// =============================================================================
// RUN MIGRATION
// =============================================================================

migrateToSupabaseStorage().catch(error => {
  console.error('Migration failed with error:', error);
  process.exit(1);
});
