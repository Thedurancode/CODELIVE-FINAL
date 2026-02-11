#!/usr/bin/env node

/**
 * Baseline Migrations Script
 *
 * Run this ONCE on production to tell sequelize-cli that all existing
 * migrations have already been applied. After running this, future
 * `npx sequelize-cli db:migrate` calls will only run NEW migrations.
 *
 * Usage:
 *   node scripts/baseline-migrations.js
 *
 * Or via fly ssh:
 *   fly ssh console -C "node scripts/baseline-migrations.js"
 */

const { Client } = require('pg');

const MIGRATIONS = [
  '20260101000000-create-property-inquiries.js',
  '20260102000000-add-compliance-passport-fields.js',
  '20260105000000-create-team-communication-tables.js',
  '20260106000000-add-team-member-role.js',
  '20260106000000-create-compliance-issue-reviews.js',
  '20260106000001-create-property-field-quality.js',
  '20260107000000-add-contact-linked-user-id.js',
  '20260107000001-create-deal-sources.js',
  '20260107000001-create-universal-state-compliance-tables.js',
  '20260107000002-add-oklahoma-workflow-fields.js',
  '20260107000002-create-user-email-configs.js',
  '20260107000003-add-phase-to-state-document-templates.js',
  '20260107000003-create-emails.js',
  '20260108000000-extend-compliance-alert-enums.js',
  '20260108000001-create-organizations-and-update-contacts.js',
  '20260108000002-create-compliance-spec-tables.js',
  '20260108000003-add-compliance-webhooks.js',
  '20260109000000-create-compliance-extraction-profiles.js',
  '20260109000001-add-delivered-to-messages.js',
  '20260109000002-create-push-subscriptions.js',
  '20260109000002-create-state-compliance-configs.js',
  '20260109000003-add-team-member-contact-type.js',
  '20260110000000-create-public-deal-links.js',
  '20260113000000-create-voice-calling-tables.js',
  '20260116000000-create-tasks-table.js',
  '20260119000000-create-contact-notes.js',
  '20260119000001-create-contact-activities.js',
  '20260121000000-add-github-invite-fields-to-project-contacts.js',
  '20260122000000-add-logo-url-to-projects.js',
  '20260123000000-create-project-clients.js',
  '20260124000000-add-organization-id-to-marketplace-users.js',
  '20260124000001-create-conversation-history.js',
  '20260124000002-create-sprite-sessions.js',
  '20260125000000-add-shell-persistence-to-sprites.js',
  '20260125000000-create-sprite-sessions.js',
  '20260125000001-create-api-keys.js',
  '20260125000002-add-mcp-fields-to-project-sprites.js',
  '20260125000003-create-sprite-mcp-servers.js',
  '20260125000004-add-mcp-server-version-tracking.js',
  '20260205000000-create-codelive-syncs.js',
];

async function baseline() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('Connected to database');

    // Create SequelizeMeta table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
        "name" VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY
      );
    `);
    console.log('SequelizeMeta table ready');

    // Check which migrations are already recorded
    const { rows: existing } = await client.query('SELECT "name" FROM "SequelizeMeta"');
    const existingSet = new Set(existing.map((r) => r.name));

    let inserted = 0;
    let skipped = 0;

    for (const name of MIGRATIONS) {
      if (existingSet.has(name)) {
        skipped++;
      } else {
        await client.query('INSERT INTO "SequelizeMeta" ("name") VALUES ($1)', [name]);
        inserted++;
      }
    }

    console.log(`\nBaseline complete: ${inserted} migrations marked as applied, ${skipped} already recorded`);
    console.log('Total migrations tracked:', MIGRATIONS.length);
  } catch (err) {
    console.error('Baseline failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

baseline();
