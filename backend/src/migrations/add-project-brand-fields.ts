/**
 * Migration: Add brand fields to projects table
 *
 * Adds:
 * - about_us: TEXT - Company/project about us description
 * - brand_settings: JSONB - Design preferences (colors, fonts, style, mood)
 *
 * Run with: npx ts-node src/migrations/add-project-brand-fields.ts
 */

import sequelize from '../config/database';

async function migrate() {
  console.log('Starting migration: add-project-brand-fields');

  try {
    await sequelize.authenticate();
    console.log('Database connected');

    // Check if columns already exist
    const [results] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'projects'
      AND column_name IN ('about_us', 'brand_settings')
    `);

    const existingColumns = (results as any[]).map(r => r.column_name);

    // Add about_us column if it doesn't exist
    if (!existingColumns.includes('about_us')) {
      await sequelize.query(`
        ALTER TABLE projects
        ADD COLUMN about_us TEXT
      `);
      console.log('Added about_us column');
    } else {
      console.log('about_us column already exists');
    }

    // Add brand_settings column if it doesn't exist
    if (!existingColumns.includes('brand_settings')) {
      await sequelize.query(`
        ALTER TABLE projects
        ADD COLUMN brand_settings JSONB DEFAULT NULL
      `);
      console.log('Added brand_settings column');
    } else {
      console.log('brand_settings column already exists');
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

migrate();
