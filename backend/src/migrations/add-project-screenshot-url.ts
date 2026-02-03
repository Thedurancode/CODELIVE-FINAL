/**
 * Migration: Add 'screenshot_url' column to projects table
 * Run with: npx ts-node src/migrations/add-project-screenshot-url.ts
 */

import sequelize from '../config/database';

async function addProjectScreenshotUrlColumn() {
  try {
    console.log('🔧 Adding screenshot_url column to projects table...');

    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Check if column already exists
    const [results] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'projects'
      AND column_name = 'screenshot_url'
    `);

    if ((results as any[]).length > 0) {
      console.log('⏭️  Column "screenshot_url" already exists, skipping');
      await sequelize.close();
      process.exit(0);
    }

    // Add the screenshot_url column
    await sequelize.query(`
      ALTER TABLE projects
      ADD COLUMN screenshot_url VARCHAR(2048) NULL
    `);

    // Add comment
    await sequelize.query(`
      COMMENT ON COLUMN projects.screenshot_url IS 'Screenshot image URL of the live deployment'
    `);

    console.log('✅ Successfully added screenshot_url column to projects table');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addProjectScreenshotUrlColumn();
