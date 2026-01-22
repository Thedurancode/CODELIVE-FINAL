/**
 * Add JSONB Index for documentStatus
 *
 * This script adds a GIN index on the documentStatus JSONB column
 * to improve webhook lookup performance.
 *
 * Run manually with: npx ts-node src/scripts/addDocumentStatusIndex.ts
 * Or it will be auto-applied on server startup.
 */

import sequelize from '../config/database';

export async function addDocumentStatusIndex(): Promise<void> {
  try {
    console.log('🔧 Checking/creating documentStatus index...');

    // Check if index already exists
    const [results] = await sequelize.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'Properties'
        AND indexname = 'idx_properties_document_status_gin'
    `);

    if ((results as any[]).length > 0) {
      console.log('✅ Index idx_properties_document_status_gin already exists');
      return;
    }

    // Create GIN index for JSONB queries on documentStatus
    // This dramatically improves webhook lookups that search for submissionId
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_document_status_gin
      ON "Properties" USING GIN ("documentStatus" jsonb_path_ops)
    `);

    console.log('✅ Created GIN index on Properties.documentStatus');

    // Also create a text-based index for LIKE queries (fallback)
    const [textIndexResults] = await sequelize.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'Properties'
        AND indexname = 'idx_properties_document_status_text'
    `);

    if ((textIndexResults as any[]).length === 0) {
      await sequelize.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_document_status_text
        ON "Properties" USING btree ((("documentStatus")::text))
      `);
      console.log('✅ Created text index on Properties.documentStatus for LIKE queries');
    }

  } catch (error) {
    // CONCURRENTLY requires not being in a transaction, so ignore that specific error
    if ((error as any).message?.includes('cannot run inside a transaction')) {
      console.log('ℹ️ Index creation skipped (requires running outside transaction)');
      console.log('   Run manually: npx ts-node src/scripts/addDocumentStatusIndex.ts');
    } else {
      console.error('❌ Error creating documentStatus index:', error);
    }
  }
}

// Run directly if executed as script
if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      console.log('✅ Database connected');

      await addDocumentStatusIndex();

      console.log('✅ Done');
      process.exit(0);
    } catch (error) {
      console.error('❌ Failed:', error);
      process.exit(1);
    }
  })();
}
