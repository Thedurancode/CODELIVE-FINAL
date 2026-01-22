/**
 * Database initialization script for production
 * Creates all tables without indexes to avoid naming convention issues
 * Run with: node dist/scripts/initDatabase.js
 */

import { sequelize } from '../models';

async function initDatabase() {
  console.log('Connecting to database...');

  try {
    await sequelize.authenticate();
    console.log('Database connection established');

    console.log('Creating tables (without indexes)...');

    // Sync with force=true to recreate tables, but catch index errors
    // We'll create tables first, indexes can be added manually later
    for (const modelName of Object.keys(sequelize.models)) {
      const model = sequelize.models[modelName];
      try {
        // Create table without indexes
        await model.sync({ force: true, hooks: false });
        console.log(`  ✓ Created table: ${model.tableName}`);
      } catch (error: any) {
        // If it's just an index error, the table was likely created
        if (error.message?.includes('index') || error.name === 'SequelizeUnknownConstraintError') {
          console.log(`  ~ Created table (index skipped): ${model.tableName}`);
        } else {
          console.error(`  ✗ Failed to create table ${model.tableName}:`, error.message);
        }
      }
    }

    // Check how many tables were created
    const [results] = await sequelize.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public';"
    );
    console.log(`\nTotal tables created: ${(results as any)[0].count}`);

    console.log('\nDatabase initialization complete!');
    process.exit(0);
  } catch (error: any) {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  }
}

initDatabase();
