/**
 * Migration: Align projects table with Project model
 *
 * The projects table only had: id, user_id, name, description, created_at, updated_at
 * The model expected many more columns. This migration:
 *
 * 1. Renames 'name' -> 'title' (model uses title)
 * 2. Creates enum_projects_status type
 * 3. Adds all missing columns: logo_url, github_url, deployment_url, api_url,
 *    preview_url, status, organization_id, created_by_id, start_date,
 *    target_end_date, actual_end_date, tags, metadata, ai_recap,
 *    ai_recap_updated_at, ai_recap_audio_url, screenshot_url, about_us,
 *    brand_settings
 * 4. Copies user_id to created_by_id for existing rows
 * 5. Adds indexes on organization_id, created_by_id, status, tags
 *
 * Run with: npx ts-node src/migrations/add-project-created-by-id.ts
 * Already applied to production on 2026-02-11 via fly ssh.
 */

import sequelize from '../config/database';

async function migrate() {
  console.log('Starting migration: align projects table with model');

  try {
    await sequelize.authenticate();
    console.log('Database connected');

    const [results] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'projects'
    `);
    const existing = (results as any[]).map(r => r.column_name);
    console.log('Existing columns:', existing.join(', '));

    // 1. Rename 'name' to 'title' if needed
    if (existing.includes('name') && !existing.includes('title')) {
      await sequelize.query('ALTER TABLE projects RENAME COLUMN name TO title');
      console.log('Renamed name -> title');
    }

    // 2. Create status enum
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_projects_status AS ENUM ('in_talks', 'now_coding', 'needs_review', 'completed', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // 3. Add missing columns
    const columns = [
      { name: 'logo_url', sql: 'VARCHAR(2048)' },
      { name: 'github_url', sql: 'VARCHAR(2048)' },
      { name: 'deployment_url', sql: 'VARCHAR(2048)' },
      { name: 'api_url', sql: 'VARCHAR(2048)' },
      { name: 'preview_url', sql: 'VARCHAR(2048)' },
      { name: 'status', sql: "enum_projects_status NOT NULL DEFAULT 'in_talks'" },
      { name: 'organization_id', sql: 'UUID' },
      { name: 'created_by_id', sql: 'UUID REFERENCES marketplace_users(id) ON DELETE SET NULL' },
      { name: 'start_date', sql: 'TIMESTAMP WITH TIME ZONE' },
      { name: 'target_end_date', sql: 'TIMESTAMP WITH TIME ZONE' },
      { name: 'actual_end_date', sql: 'TIMESTAMP WITH TIME ZONE' },
      { name: 'tags', sql: "VARCHAR(255)[] NOT NULL DEFAULT '{}'" },
      { name: 'metadata', sql: 'JSONB' },
      { name: 'ai_recap', sql: 'TEXT' },
      { name: 'ai_recap_updated_at', sql: 'TIMESTAMP WITH TIME ZONE' },
      { name: 'ai_recap_audio_url', sql: 'VARCHAR(2048)' },
      { name: 'screenshot_url', sql: 'TEXT' },
      { name: 'about_us', sql: 'TEXT' },
      { name: 'brand_settings', sql: 'JSONB' },
    ];

    // Refresh columns after rename
    const [results2] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'projects'
    `);
    const current = (results2 as any[]).map(r => r.column_name);

    for (const col of columns) {
      if (!current.includes(col.name)) {
        await sequelize.query(`ALTER TABLE projects ADD COLUMN ${col.name} ${col.sql}`);
        console.log(`Added: ${col.name}`);
      } else {
        console.log(`Exists: ${col.name}`);
      }
    }

    // 4. Copy user_id to created_by_id for existing rows
    await sequelize.query(`
      UPDATE projects SET created_by_id = user_id
      WHERE created_by_id IS NULL AND user_id IS NOT NULL
    `);
    console.log('Copied user_id -> created_by_id');

    // 5. Add indexes
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_projects_created_by_id ON projects(created_by_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING gin(tags)');
    console.log('Added indexes');

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

migrate();
