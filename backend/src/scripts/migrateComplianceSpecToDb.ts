/**
 * Migrate Compliance Spec JSON to Database
 *
 * This script migrates a JSON-based compliance spec file into the
 * database-driven compliance spec tables.
 *
 * Usage:
 *   npx ts-node src/scripts/migrateComplianceSpecToDb.ts [stateCode]
 *
 * Examples:
 *   npx ts-node src/scripts/migrateComplianceSpecToDb.ts OK
 *   npx ts-node src/scripts/migrateComplianceSpecToDb.ts TX
 */

import fs from 'fs';
import path from 'path';
import sequelize from '../config/database';

interface JsonSpec {
  state: string;
  county: string;
  version: string;
  metadata: {
    legalReferences: string[];
    notes: string;
  };
  contacts: any[];
  documents: any[];
  rules: any[];
  disclosures: any[];
  blockingGates: any[];
}

const DEFAULT_PHASES = [
  { phase: 0, name: 'LLC Setup', shortName: 'LLC', description: 'LLC profile and documents', icon: 'building' },
  { phase: 1, name: 'Deal Intake', shortName: 'Intake', description: 'Basic deal information', icon: 'inbox' },
  { phase: 2, name: 'Contract Upload', shortName: 'Contract', description: 'Purchase contract submission', icon: 'file-upload' },
  { phase: 3, name: 'Contract Validation', shortName: 'Validate', description: 'OCR and field validation', icon: 'check-circle' },
  { phase: 4, name: 'Disclosure Check', shortName: 'Disclosures', description: 'Required disclosure verification', icon: 'clipboard-list' },
  { phase: 5, name: 'Compliance Scoring', shortName: 'Score', description: 'Overall compliance calculation', icon: 'chart-bar' },
  { phase: 6, name: 'Distribution Prep', shortName: 'Dist Prep', description: 'Pre-distribution checks', icon: 'package' },
  { phase: 7, name: 'Distribution Agreements', shortName: 'Agreements', description: 'MSA/ASA execution', icon: 'file-signature' },
  { phase: 8, name: 'Broker Review', shortName: 'Review', description: 'Internal broker approval', icon: 'user-check' },
  { phase: 9, name: 'Live Distribution', shortName: 'Live', description: 'Active on marketplace', icon: 'globe' },
  { phase: 10, name: 'Cancellation', shortName: 'Cancel', description: 'Cancellation disclosure delivery', icon: 'x-circle' },
  { phase: 11, name: 'Assignment', shortName: 'Assign', description: 'Contract assignment execution', icon: 'arrow-right-circle' },
  { phase: 12, name: 'Closed', shortName: 'Closed', description: 'Deal completed', icon: 'check-double' },
];

// State name mapping
const STATE_NAMES: Record<string, string> = {
  OK: 'Oklahoma',
  TX: 'Texas',
  FL: 'Florida',
  AZ: 'Arizona',
  GA: 'Georgia',
  OH: 'Ohio',
  NC: 'North Carolina',
  TN: 'Tennessee',
  NV: 'Nevada',
  IL: 'Illinois',
  CA: 'California',
};

// Map state codes to file names
const STATE_FILE_NAMES: Record<string, string> = {
  OK: 'oklahoma-all.json',
  TX: 'texas-all.json',
  FL: 'florida-all.json',
  AZ: 'arizona-all.json',
  GA: 'georgia-all.json',
};

async function migrateSpec(stateCode: string) {
  const fileName = STATE_FILE_NAMES[stateCode.toUpperCase()] || `${stateCode.toLowerCase()}-all.json`;
  const specPath = path.join(__dirname, '../../compliance-specs', fileName);

  if (!fs.existsSync(specPath)) {
    console.error(`❌ Spec file not found: ${specPath}`);
    process.exit(1);
  }

  console.log(`📂 Reading spec from: ${specPath}`);
  const spec: JsonSpec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));

  const transaction = await sequelize.transaction();

  try {
    // 1. Check if state already exists
    const [existingState] = await sequelize.query(
      `SELECT id FROM compliance_state_specs WHERE state_code = :stateCode`,
      { replacements: { stateCode: stateCode.toUpperCase() }, type: 'SELECT' as any, transaction }
    ) as any[];

    let stateSpecId: string;

    if (existingState) {
      console.log(`⚠️ State ${stateCode} already exists, updating...`);
      stateSpecId = existingState.id;

      // Update existing spec
      await sequelize.query(
        `UPDATE compliance_state_specs SET
          version = :version,
          legal_references = :legalRefs,
          notes = :notes,
          updated_at = NOW()
         WHERE id = :id`,
        {
          replacements: {
            id: stateSpecId,
            version: spec.version,
            legalRefs: JSON.stringify(spec.metadata.legalReferences),
            notes: spec.metadata.notes,
          },
          transaction,
        }
      );

      // Clear existing child records to re-import
      await sequelize.query(`DELETE FROM compliance_phases WHERE state_spec_id = :id`, { replacements: { id: stateSpecId }, transaction });
      await sequelize.query(`DELETE FROM compliance_gates WHERE state_spec_id = :id`, { replacements: { id: stateSpecId }, transaction });
      await sequelize.query(`DELETE FROM compliance_rules WHERE state_spec_id = :id`, { replacements: { id: stateSpecId }, transaction });
      await sequelize.query(`DELETE FROM compliance_disclosures WHERE state_spec_id = :id`, { replacements: { id: stateSpecId }, transaction });
      await sequelize.query(`DELETE FROM compliance_contact_requirements WHERE state_spec_id = :id`, { replacements: { id: stateSpecId }, transaction });
      await sequelize.query(`DELETE FROM compliance_document_requirements WHERE state_spec_id = :id`, { replacements: { id: stateSpecId }, transaction });
    } else {
      // Create new state spec
      const [newState] = await sequelize.query(
        `INSERT INTO compliance_state_specs (
          id, state_code, state_name, version, status, legal_references, notes, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), :stateCode, :stateName, :version, 'active', :legalRefs, :notes, NOW(), NOW()
        ) RETURNING id`,
        {
          replacements: {
            stateCode: stateCode.toUpperCase(),
            stateName: STATE_NAMES[stateCode.toUpperCase()] || stateCode.toUpperCase(),
            version: spec.version,
            legalRefs: JSON.stringify(spec.metadata.legalReferences),
            notes: spec.metadata.notes,
          },
          transaction,
          type: 'SELECT' as any,
        }
      ) as any[];

      stateSpecId = newState.id;
      console.log(`✅ Created state spec: ${stateCode} (${stateSpecId})`);
    }

    // 2. Import phases
    console.log(`📋 Importing ${DEFAULT_PHASES.length} phases...`);
    for (const phase of DEFAULT_PHASES) {
      await sequelize.query(
        `INSERT INTO compliance_phases (
          id, state_spec_id, phase_number, name, short_name, description, icon, is_active, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), :specId, :phase, :name, :shortName, :description, :icon, true, NOW(), NOW()
        )`,
        {
          replacements: {
            specId: stateSpecId,
            phase: phase.phase,
            name: phase.name,
            shortName: phase.shortName,
            description: phase.description,
            icon: phase.icon,
          },
          transaction,
        }
      );
    }

    // 3. Import gates
    if (spec.blockingGates && spec.blockingGates.length > 0) {
      console.log(`🚧 Importing ${spec.blockingGates.length} gates...`);
      for (const gate of spec.blockingGates) {
        await sequelize.query(
          `INSERT INTO compliance_gates (
            id, state_spec_id, gate_code, name, after_phase, blocks_phase,
            condition_description, error_message, is_active, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), :specId, :code, :name, :afterPhase, :blocksPhase,
            :condition, :errorMessage, true, NOW(), NOW()
          )`,
          {
            replacements: {
              specId: stateSpecId,
              code: gate.gateId,
              name: gate.name,
              afterPhase: gate.phase,
              blocksPhase: gate.blocksPhase,
              condition: gate.condition,
              errorMessage: gate.errorMessage,
            },
            transaction,
          }
        );
      }
    }

    // 4. Import rules
    if (spec.rules && spec.rules.length > 0) {
      console.log(`📏 Importing ${spec.rules.length} rules...`);
      for (const rule of spec.rules) {
        // Map validation type
        let validationType = 'custom';
        if (rule.validationType === 'field_present') validationType = 'field_present';
        else if (rule.validationType === 'field_match') validationType = 'field_match';
        else if (rule.validationType === 'boolean_check') validationType = 'boolean_check';
        else if (rule.validationType === 'date_comparison') validationType = 'date_comparison';
        else if (rule.validationType === 'numeric_comparison') validationType = 'numeric_comparison';

        // Map operator
        let operator = null;
        if (rule.validation?.operator) {
          const opMap: Record<string, string> = {
            present: 'present',
            not_present: 'not_present',
            equals: 'equals',
            not_equals: 'not_equals',
            contains: 'contains',
            greater_than: 'greater_than',
            less_than: 'less_than',
          };
          operator = opMap[rule.validation.operator] || null;
        }

        await sequelize.query(
          `INSERT INTO compliance_rules (
            id, state_spec_id, rule_code, phase, name, description,
            validation_type, field_to_check, compare_to_field, operator, expected_value, custom_logic,
            severity, is_blocking, error_message, remediation, is_active, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), :specId, :code, :phase, :name, :description,
            :validationType, :fieldToCheck, :compareToField, :operator, :expectedValue, :customLogic,
            :severity, :isBlocking, :errorMessage, :remediation, true, NOW(), NOW()
          )`,
          {
            replacements: {
              specId: stateSpecId,
              code: rule.ruleId,
              phase: rule.phase,
              name: rule.description.substring(0, 200),
              description: rule.description,
              validationType,
              fieldToCheck: rule.validation?.field1 || null,
              compareToField: rule.validation?.field2 || null,
              operator,
              expectedValue: rule.validation?.expectedValue?.toString() || null,
              customLogic: rule.validation?.customLogic || null,
              severity: rule.severity || 'warning',
              isBlocking: rule.blocking || false,
              errorMessage: rule.errorMessage,
              remediation: rule.remediation || null,
            },
            transaction,
          }
        );
      }
    }

    // 5. Import disclosures
    if (spec.disclosures && spec.disclosures.length > 0) {
      console.log(`📜 Importing ${spec.disclosures.length} disclosures...`);
      for (const disclosure of spec.disclosures) {
        // Convert array to PostgreSQL format: {"a","b","c"}
        const keywords = disclosure.keywords || [];
        const pgKeywords = `{${keywords.map((k: string) => `"${k.replace(/"/g, '\\"')}"`).join(',')}}`;

        await sequelize.query(
          `INSERT INTO compliance_disclosures (
            id, state_spec_id, disclosure_code, name, description, legal_citation,
            is_required, phase, keywords, regex_pattern, is_active, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), :specId, :code, :name, :description, :citation,
            :required, :phase, :keywords, :regex, true, NOW(), NOW()
          )`,
          {
            replacements: {
              specId: stateSpecId,
              code: disclosure.disclosureId,
              name: disclosure.name,
              description: disclosure.description,
              citation: disclosure.legalCitation || null,
              required: disclosure.required || true,
              phase: 4, // Disclosures are typically phase 4
              keywords: pgKeywords,
              regex: disclosure.regexPattern || null,
            },
            transaction,
          }
        );
      }
    }

    // 6. Import contacts
    if (spec.contacts && spec.contacts.length > 0) {
      console.log(`👥 Importing ${spec.contacts.length} contact requirements...`);
      for (const contact of spec.contacts) {
        await sequelize.query(
          `INSERT INTO compliance_contact_requirements (
            id, state_spec_id, contact_type, role, phase, is_required, is_blocking,
            required_fields, is_active, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), :specId, :contactType, :role, :phase, :required, :blocking,
            :requiredFields, true, NOW(), NOW()
          )`,
          {
            replacements: {
              specId: stateSpecId,
              contactType: contact.category,
              role: contact.role,
              phase: contact.phase,
              required: contact.blocking || false,
              blocking: contact.blocking || false,
              requiredFields: JSON.stringify(contact.requiredFields || []),
            },
            transaction,
          }
        );
      }
    }

    // 7. Import documents
    if (spec.documents && spec.documents.length > 0) {
      console.log(`📄 Importing ${spec.documents.length} document requirements...`);
      for (const doc of spec.documents) {
        // Convert array to PostgreSQL format
        const fields = doc.extractionFields || [];
        const pgFields = `{${fields.map((f: string) => `"${f.replace(/"/g, '\\"')}"`).join(',')}}`;

        await sequelize.query(
          `INSERT INTO compliance_document_requirements (
            id, state_spec_id, document_type, official_name, category, phase,
            is_required, extraction_fields, retention_period, is_active, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), :specId, :docType, :name, :category, :phase,
            :required, :extractionFields, :retention, true, NOW(), NOW()
          )`,
          {
            replacements: {
              specId: stateSpecId,
              docType: doc.documentType,
              name: doc.officialName,
              category: doc.category,
              phase: doc.phase,
              required: doc.required || true,
              extractionFields: pgFields,
              retention: doc.retentionPeriod || null,
            },
            transaction,
          }
        );
      }
    }

    // Log version
    await sequelize.query(
      `INSERT INTO compliance_spec_versions (
        id, state_spec_id, version, change_type, table_name, record_id,
        change_description, changed_by, created_at
      ) VALUES (
        gen_random_uuid(), :specId, :version, 'create', 'compliance_state_specs', :specId,
        :description, 'migration-script', NOW()
      )`,
      {
        replacements: {
          specId: stateSpecId,
          version: spec.version,
          description: `Migrated ${stateCode} spec from JSON file`,
        },
        transaction,
      }
    );

    await transaction.commit();

    // Print summary
    console.log(`\n✅ Successfully migrated ${stateCode} to database!`);
    console.log(`   📋 Phases: ${DEFAULT_PHASES.length}`);
    console.log(`   🚧 Gates: ${spec.blockingGates?.length || 0}`);
    console.log(`   📏 Rules: ${spec.rules?.length || 0}`);
    console.log(`   📜 Disclosures: ${spec.disclosures?.length || 0}`);
    console.log(`   👥 Contacts: ${spec.contacts?.length || 0}`);
    console.log(`   📄 Documents: ${spec.documents?.length || 0}`);

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Main
const stateCode = process.argv[2];

if (!stateCode) {
  console.log('Usage: npx ts-node src/scripts/migrateComplianceSpecToDb.ts [stateCode]');
  console.log('Example: npx ts-node src/scripts/migrateComplianceSpecToDb.ts OK');
  process.exit(1);
}

migrateSpec(stateCode.toUpperCase())
  .then(() => {
    console.log('\n🎉 Migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
