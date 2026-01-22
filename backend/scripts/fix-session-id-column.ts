/**
 * Migration: Fix session_id column type
 *
 * Changes session_id from VARCHAR(100) to TEXT to handle longer session IDs.
 *
 * Run with: npx ts-node scripts/fix-session-id-column.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import sequelize from '../src/config/database';

async function runMigration() {
  console.log('Starting migration: Fix session_id column type...\n');

  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Check current column type
    const [columns] = await sequelize.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'conversation_history'
      AND column_name = 'session_id'
    `);

    if (columns.length === 0) {
      console.log('⚠️  Table conversation_history does not exist yet. Will be created with correct schema on next sync.');
      process.exit(0);
    }

    const column = columns[0] as any;
    console.log(`Current column type: ${column.data_type}${column.character_maximum_length ? `(${column.character_maximum_length})` : ''}`);

    if (column.data_type === 'text') {
      console.log('✅ Column is already TEXT type. No migration needed.');
      process.exit(0);
    }

    // Alter the column
    console.log('\nAltering session_id column to TEXT...');
    await sequelize.query(`
      ALTER TABLE conversation_history
      ALTER COLUMN session_id TYPE TEXT
    `);

    console.log('✅ Column altered successfully');

    // Verify the change
    const [verifyColumns] = await sequelize.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'conversation_history'
      AND column_name = 'session_id'
    `);

    const verifyColumn = verifyColumns[0] as any;
    console.log(`\nNew column type: ${verifyColumn.data_type}`);

    console.log('\n🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
