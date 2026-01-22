/**
 * Simple script to import state compliance configs
 * Usage: node scripts/importCompliance.js compliance-specs/oklahoma-all.json
 */

const fs = require('fs');
const path = require('path');

async function importConfig(filePath) {
  try {
    // Read the JSON file
    const fullPath = path.resolve(filePath);
    console.log(`📄 Reading ${fullPath}...`);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

    // Load database
    const { default: sequelize } = require('../dist/config/database.js');

    // Insert or update
    const [existing] = await sequelize.query(
      'SELECT id FROM state_compliance_configs WHERE state = :state LIMIT 1',
      {
        replacements: { state: data.state },
      }
    );

    if (existing && existing.length > 0) {
      console.log(`✏️  Updating existing config for ${data.state}...`);
      await sequelize.query(
        `UPDATE state_compliance_configs SET
          county = :county,
          version = :version,
          contacts = :contacts::jsonb,
          documents = :documents::jsonb,
          rules = :rules::jsonb,
          disclosures = :disclosures::jsonb,
          "timingRules" = :timingRules::jsonb,
          "extractionProfiles" = :extractionProfiles::jsonb,
          "scoringRules" = :scoringRules::jsonb,
          "blockingGates" = :blockingGates::jsonb,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE state = :state`,
        {
          replacements: {
            state: data.state,
            county: data.county || 'ALL',
            version: data.version || '1.0.0',
            contacts: JSON.stringify(data.contacts || []),
            documents: JSON.stringify(data.documents || []),
            rules: JSON.stringify(data.rules || []),
            disclosures: JSON.stringify(data.disclosures || []),
            timingRules: JSON.stringify(data.timingRules || []),
            extractionProfiles: JSON.stringify(data.extractionProfiles || []),
            scoringRules: JSON.stringify(data.scoringRules || {}),
            blockingGates: JSON.stringify(data.blockingGates || []),
          },
        }
      );
    } else {
      console.log(`➕ Inserting new config for ${data.state}...`);
      await sequelize.query(
        `INSERT INTO state_compliance_configs (
          state, county, version, contacts, documents, rules, disclosures,
          "timingRules", "extractionProfiles", "scoringRules", "blockingGates",
          "isActive", "createdAt", "updatedAt"
        ) VALUES (
          :state, :county, :version, :contacts::jsonb, :documents::jsonb, :rules::jsonb, :disclosures::jsonb,
          :timingRules::jsonb, :extractionProfiles::jsonb, :scoringRules::jsonb, :blockingGates::jsonb,
          true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`,
        {
          replacements: {
            state: data.state,
            county: data.county || 'ALL',
            version: data.version || '1.0.0',
            contacts: JSON.stringify(data.contacts || []),
            documents: JSON.stringify(data.documents || []),
            rules: JSON.stringify(data.rules || []),
            disclosures: JSON.stringify(data.disclosures || []),
            timingRules: JSON.stringify(data.timingRules || []),
            extractionProfiles: JSON.stringify(data.extractionProfiles || []),
            scoringRules: JSON.stringify(data.scoringRules || {}),
            blockingGates: JSON.stringify(data.blockingGates || []),
          },
        }
      );
    }

    console.log(`✅ Successfully imported ${data.state} compliance config`);
    console.log(`   - ${data.contacts?.length || 0} contacts`);
    console.log(`   - ${data.documents?.length || 0} documents`);
    console.log(`   - ${data.rules?.length || 0} rules`);
    console.log(`   - ${data.disclosures?.length || 0} disclosures`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error importing config:', error.message);
    process.exit(1);
  }
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/importCompliance.js <path-to-json-file>');
  process.exit(1);
}

importConfig(filePath);
