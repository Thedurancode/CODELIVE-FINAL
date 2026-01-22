/**
 * Universal State Compliance Tables Migration
 *
 * Creates tables for universal state-based compliance tracking.
 * Works with any state - rules loaded from compliance-specs JSON files.
 */

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Creating universal state compliance tables...');

    // Helper function to check if table exists
    const tableExists = async (tableName) => {
      try {
        const results = await queryInterface.sequelize.query(
          `SELECT table_name FROM information_schema.tables
           WHERE table_name = '${tableName}' AND table_schema = 'public'`,
          { type: queryInterface.sequelize.QueryTypes.SELECT }
        );
        return results && results.length > 0;
      } catch (e) {
        console.log(`Error checking table ${tableName}:`, e.message);
        return false;
      }
    };

    // Helper function to check if column exists
    const columnExists = async (tableName, columnName) => {
      try {
        const results = await queryInterface.sequelize.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = '${tableName}' AND column_name = '${columnName}'`,
          { type: queryInterface.sequelize.QueryTypes.SELECT }
        );
        return results && results.length > 0;
      } catch (e) {
        console.log(`Error checking column ${tableName}.${columnName}:`, e.message);
        return false;
      }
    };

    // ========================================================================
    // 1. STATE DEAL COMPLIANCE TABLE (Universal)
    // ========================================================================
    if (!(await tableExists('state_deal_compliance'))) {
      await queryInterface.createTable('state_deal_compliance', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        deal_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: 'Property/deal ID',
        },
        llc_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: 'LLC submitting this deal',
        },
        state: {
          type: Sequelize.STRING(2),
          allowNull: false,
          comment: 'State code (OK, TX, FL, etc.)',
        },
        county: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'County name (optional)',
        },
        spec_version: {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: 'Version of compliance spec used',
        },

        // Phase 3: Universal Contract Checks
        phase3_status: {
          type: Sequelize.STRING(10),
          allowNull: true,
          comment: 'GREEN, YELLOW, or RED',
        },
        buyer_matches_llc: {
          type: Sequelize.BOOLEAN,
          allowNull: true,
        },
        seller_matches_records: {
          type: Sequelize.BOOLEAN,
          allowNull: true,
        },
        contract_assignable: {
          type: Sequelize.BOOLEAN,
          allowNull: true,
        },
        as_is_language: {
          type: Sequelize.BOOLEAN,
          allowNull: true,
        },
        contract_not_expired: {
          type: Sequelize.BOOLEAN,
          allowNull: true,
        },
        seller_signature_present: {
          type: Sequelize.BOOLEAN,
          allowNull: true,
        },
        phase3_details: {
          type: Sequelize.JSONB,
          allowNull: true,
        },

        // Phase 4: Disclosure Checks
        phase4_status: {
          type: Sequelize.STRING(10),
          allowNull: true,
        },
        disclosure_score: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: 'Number of required disclosures found',
        },
        total_disclosures: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: 'Total required disclosures for this state',
        },
        disclosure_results: {
          type: Sequelize.JSONB,
          allowNull: true,
          comment: 'Map of disclosureId -> boolean',
        },
        disclosure_evidence: {
          type: Sequelize.JSONB,
          allowNull: true,
          comment: 'Map of disclosureId -> evidence text',
        },
        phase4_details: {
          type: Sequelize.JSONB,
          allowNull: true,
        },

        // Phase 5: Overall Compliance
        overall_status: {
          type: Sequelize.STRING(10),
          allowNull: true,
        },

        // Phase 10: Timing Validation
        contract_acceptance_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        cancellation_delivery_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        cancellation_acknowledged: {
          type: Sequelize.BOOLEAN,
          allowNull: true,
        },
        timing_valid: {
          type: Sequelize.BOOLEAN,
          allowNull: true,
        },
        phase10_details: {
          type: Sequelize.JSONB,
          allowNull: true,
        },

        // Phase 11: Assignment Execution
        assignment_execution_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        assignment_fee: {
          type: Sequelize.DECIMAL(12, 2),
          allowNull: true,
        },
        assignee_name: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        assignee_entity_type: {
          type: Sequelize.STRING(50),
          allowNull: true,
        },
        phase11_details: {
          type: Sequelize.JSONB,
          allowNull: true,
        },

        // Permissions
        can_distribute: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        can_execute_assignment: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },

        // State-specific data
        state_specific_data: {
          type: Sequelize.JSONB,
          allowNull: true,
          comment: 'State-specific fields',
        },

        // Remediation
        remediation_attempts: {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: 0,
        },
        last_remediation_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },

        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      });

      await queryInterface.addIndex('state_deal_compliance', ['deal_id', 'state'], {
        unique: true,
        name: 'state_deal_compliance_deal_state_unique',
      });
      await queryInterface.addIndex('state_deal_compliance', ['llc_id']);
      await queryInterface.addIndex('state_deal_compliance', ['state']);
      await queryInterface.addIndex('state_deal_compliance', ['overall_status']);
      await queryInterface.addIndex('state_deal_compliance', ['can_distribute']);
      await queryInterface.addIndex('state_deal_compliance', ['can_execute_assignment']);

      console.log('✅ state_deal_compliance table created');
    } else {
      console.log('ℹ️ state_deal_compliance table already exists, skipping');
    }

    // ========================================================================
    // 2. STATE WORKFLOW STATE TABLE
    // ========================================================================
    if (!(await tableExists('state_workflow_state'))) {
      await queryInterface.createTable('state_workflow_state', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        deal_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        state: {
          type: Sequelize.STRING(2),
          allowNull: false,
        },
        county: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },
        current_phase: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        max_phase: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 11,
        },

        // Phase completions
        phase_completions: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        phase_completed_at: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: {},
        },

        // Blocking
        blocked: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        blocked_reason: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        blocked_at_phase: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        blocked_by_gate: {
          type: Sequelize.STRING(50),
          allowNull: true,
        },

        // Progress
        started_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        last_advanced_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        completed_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },

        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      });

      await queryInterface.addIndex('state_workflow_state', ['deal_id', 'state'], {
        unique: true,
        name: 'state_workflow_state_deal_state_unique',
      });
      await queryInterface.addIndex('state_workflow_state', ['state']);
      await queryInterface.addIndex('state_workflow_state', ['current_phase']);
      await queryInterface.addIndex('state_workflow_state', ['blocked']);

      console.log('✅ state_workflow_state table created');
    } else {
      console.log('ℹ️ state_workflow_state table already exists, skipping');
    }

    // ========================================================================
    // 3. ATTORNEYS TABLE (referenced by compliance specs)
    // ========================================================================
    if (!(await tableExists('attorneys'))) {
      await queryInterface.createTable('attorneys', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'User who added this attorney',
        },
        name: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        bar_number: {
          type: Sequelize.STRING(50),
          allowNull: true,
        },
        bar_state: {
          type: Sequelize.STRING(2),
          allowNull: true,
        },
        law_firm: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        email: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        phone: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        address: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        specializations: {
          type: Sequelize.ARRAY(Sequelize.STRING),
          allowNull: true,
          defaultValue: [],
          comment: 'Areas of practice (real_estate, title, closing, etc.)',
        },
        verified: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      });

      await queryInterface.addIndex('attorneys', ['bar_state']);
      await queryInterface.addIndex('attorneys', ['law_firm']);
      await queryInterface.addIndex('attorneys', ['verified']);
      await queryInterface.addIndex('attorneys', ['active']);

      console.log('✅ attorneys table created');
    } else {
      console.log('ℹ️ attorneys table already exists, skipping');
    }

    // ========================================================================
    // 4. PROPERTY ATTORNEYS JUNCTION TABLE
    // ========================================================================
    if (!(await tableExists('property_attorneys'))) {
      await queryInterface.createTable('property_attorneys', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        property_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'properties',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        attorney_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'attorneys',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        role: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: 'closing',
          comment: 'Role: closing, title, buyer_rep, seller_rep, review',
        },
        assigned_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
      });

      await queryInterface.addIndex(
        'property_attorneys',
        ['property_id', 'attorney_id', 'role'],
        {
          unique: true,
          name: 'property_attorneys_unique_assignment',
        }
      );
      await queryInterface.addIndex('property_attorneys', ['property_id']);
      await queryInterface.addIndex('property_attorneys', ['attorney_id']);

      console.log('✅ property_attorneys table created');
    } else {
      console.log('ℹ️ property_attorneys table already exists, skipping');
    }

    // ========================================================================
    // 5. EXTEND LLC_PROFILES TABLE (if exists)
    // ========================================================================
    if (await tableExists('llc_profiles')) {
      if (!(await columnExists('llc_profiles', 'operating_states'))) {
        await queryInterface.addColumn('llc_profiles', 'operating_states', {
          type: Sequelize.ARRAY(Sequelize.STRING(2)),
          allowNull: true,
          defaultValue: [],
          comment: 'States where LLC is authorized to operate',
        });
        console.log('✅ Added operating_states column to llc_profiles');
      }
    }

    console.log('✅ Universal state compliance tables created successfully');
  },

  async down(queryInterface, Sequelize) {
    console.log('Dropping universal state compliance tables...');

    // Helper to check if table exists
    const tableExists = async (tableName) => {
      try {
        const results = await queryInterface.sequelize.query(
          `SELECT table_name FROM information_schema.tables
           WHERE table_name = '${tableName}' AND table_schema = 'public'`,
          { type: queryInterface.sequelize.QueryTypes.SELECT }
        );
        return results && results.length > 0;
      } catch (e) {
        return false;
      }
    };

    // Remove operating_states column from llc_profiles
    if (await tableExists('llc_profiles')) {
      try {
        await queryInterface.removeColumn('llc_profiles', 'operating_states');
      } catch (e) {
        console.log('Column operating_states may not exist, skipping');
      }
    }

    // Drop tables in reverse order
    await queryInterface.dropTable('property_attorneys').catch(() => {});
    await queryInterface.dropTable('attorneys').catch(() => {});
    await queryInterface.dropTable('state_workflow_state').catch(() => {});
    await queryInterface.dropTable('state_deal_compliance').catch(() => {});

    console.log('✅ Universal state compliance tables dropped');
  },
};
