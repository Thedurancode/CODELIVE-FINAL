/**
 * Force Database Sync Script
 *
 * Drops all tables and recreates them from Sequelize models.
 * Use this for fresh database setup (like a new Supabase instance).
 *
 * WARNING: This will DELETE all existing data!
 */

import '../src/config/database';
import { syncDatabase } from '../src/models';

async function main() {
  console.log('🚀 Starting force database sync...');
  console.log('⚠️  WARNING: This will DROP and recreate all tables!');
  console.log('');

  try {
    // Use force: true to drop and recreate all tables
    await syncDatabase({ force: true });

    console.log('');
    console.log('✅ Database force sync completed successfully!');
    console.log('   All tables have been created.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database force sync failed:', error);
    process.exit(1);
  }
}

main();
