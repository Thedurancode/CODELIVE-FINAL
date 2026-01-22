'use strict';

/**
 * Migration: Create Database-Driven Compliance Spec Tables
 *
 * Replaces JSON file specs with database tables that are:
 * - AI-friendly (flat, simple, atomic operations)
 * - Versionable (every change tracked, rollback possible)
 * - Admin UI editable (no code deploys needed)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // =====================================================
    // 1. STATE SPECS - Master table for each state
    // =====================================================
    await queryInterface.createTable('compliance_state_specs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      state_code: {
        type: Sequelize.STRING(2),
        allowNull: false,
        unique: true,
        comment: 'Two-letter state code (e.g., OK, TX, FL)',
      },
      state_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Full state name',
      },
      version: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: '1.0.0',
        comment: 'Semantic version of this spec',
      },
      status: {
        type: Sequelize.ENUM('draft', 'active', 'deprecated'),
        defaultValue: 'draft',
        comment: 'Only active specs are used in production',
      },
      effective_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When this spec becomes active',
      },
      legal_references: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Array of legal citation strings',
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Human-readable notes about this state',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User or AI agent that created this',
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    // =====================================================
    // 2. PHASES - The 13 workflow phases
    // =====================================================
    await queryInterface.createTable('compliance_phases', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      state_spec_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'compliance_state_specs', key: 'id' },
        onDelete: 'CASCADE',
      },
      phase_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Phase order (0-12)',
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'e.g., "LLC Setup", "Contract Upload"',
      },
      short_name: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'e.g., "LLC", "Contract"',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'What happens in this phase',
      },
      icon: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Icon identifier for UI',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    // Unique constraint: one phase number per state
    await queryInterface.addIndex('compliance_phases', ['state_spec_id', 'phase_number'], {
      unique: true,
      name: 'idx_compliance_phases_state_phase',
    });

    // =====================================================
    // 3. GATES - Blocking checkpoints between phases
    // =====================================================
    await queryInterface.createTable('compliance_gates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      state_spec_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'compliance_state_specs', key: 'id' },
        onDelete: 'CASCADE',
      },
      gate_code: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'e.g., "OK-GATE-1"',
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'e.g., "LLC Hard Gate"',
      },
      after_phase: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Gate appears after this phase',
      },
      blocks_phase: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Gate blocks entry to this phase',
      },
      condition_description: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Human-readable condition (AI-friendly)',
      },
      condition_logic: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional: JavaScript expression for evaluation',
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Message shown when gate blocks',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('compliance_gates', ['state_spec_id', 'gate_code'], {
      unique: true,
      name: 'idx_compliance_gates_state_code',
    });

    // =====================================================
    // 4. RULES - Individual validation rules
    // =====================================================
    await queryInterface.createTable('compliance_rules', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      state_spec_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'compliance_state_specs', key: 'id' },
        onDelete: 'CASCADE',
      },
      rule_code: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'e.g., "OK-P3-R1"',
      },
      phase: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Which phase this rule applies to',
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: 'Short rule name',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Full description (AI-readable)',
      },
      // Validation config - flat fields for AI manipulation
      validation_type: {
        type: Sequelize.ENUM(
          'field_present',
          'field_match',
          'boolean_check',
          'date_comparison',
          'numeric_comparison',
          'custom'
        ),
        allowNull: false,
      },
      field_to_check: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Primary field being validated',
      },
      compare_to_field: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Field to compare against (for field_match)',
      },
      operator: {
        type: Sequelize.ENUM(
          'present',
          'not_present',
          'equals',
          'not_equals',
          'contains',
          'greater_than',
          'less_than',
          'greater_or_equal',
          'less_or_equal'
        ),
        allowNull: true,
      },
      expected_value: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Expected value for comparison',
      },
      custom_logic: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JavaScript expression for complex rules',
      },
      // Severity and blocking
      severity: {
        type: Sequelize.ENUM('info', 'warning', 'critical'),
        defaultValue: 'warning',
      },
      is_blocking: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'If true, failing this blocks progression',
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Shown when rule fails',
      },
      remediation: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'How to fix when rule fails',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('compliance_rules', ['state_spec_id', 'rule_code'], {
      unique: true,
      name: 'idx_compliance_rules_state_code',
    });

    await queryInterface.addIndex('compliance_rules', ['state_spec_id', 'phase'], {
      name: 'idx_compliance_rules_state_phase',
    });

    // =====================================================
    // 5. DISCLOSURES - Required disclosures per state
    // =====================================================
    await queryInterface.createTable('compliance_disclosures', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      state_spec_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'compliance_state_specs', key: 'id' },
        onDelete: 'CASCADE',
      },
      disclosure_code: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'e.g., "OK-D1"',
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: 'e.g., "Not a Licensed Broker"',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Full description of what must be disclosed',
      },
      legal_citation: {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: 'e.g., "Oklahoma Statutes Title 59 §858-301"',
      },
      is_required: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      phase: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Which phase checks this disclosure',
      },
      // OCR detection config
      keywords: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: [],
        comment: 'Keywords to search for in OCR',
      },
      regex_pattern: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Regex for matching disclosure text',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('compliance_disclosures', ['state_spec_id', 'disclosure_code'], {
      unique: true,
      name: 'idx_compliance_disclosures_state_code',
    });

    // =====================================================
    // 6. CONTACTS - Required contacts per state/phase
    // =====================================================
    await queryInterface.createTable('compliance_contact_requirements', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      state_spec_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'compliance_state_specs', key: 'id' },
        onDelete: 'CASCADE',
      },
      contact_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'e.g., "seller", "attorney", "re_agent"',
      },
      role: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'e.g., "Seller Attorney", "Buyer RE Agent"',
      },
      phase: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'When this contact is needed',
      },
      is_required: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      is_blocking: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'If true, missing contact blocks phase',
      },
      required_fields: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Array of required field definitions',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('compliance_contact_requirements', ['state_spec_id', 'contact_type', 'role'], {
      unique: true,
      name: 'idx_compliance_contacts_state_type_role',
    });

    // =====================================================
    // 7. DOCUMENTS - Required documents per state/phase
    // =====================================================
    await queryInterface.createTable('compliance_document_requirements', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      state_spec_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'compliance_state_specs', key: 'id' },
        onDelete: 'CASCADE',
      },
      document_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'e.g., "purchase_contract", "csa", "msa"',
      },
      official_name: {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: 'e.g., "Client Services Agreement"',
      },
      category: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'e.g., "agreement", "disclosure", "contract"',
      },
      phase: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      is_required: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      extraction_fields: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: [],
        comment: 'Fields to extract via OCR',
      },
      retention_period: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'e.g., "7 years", "Permanent"',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('compliance_document_requirements', ['state_spec_id', 'document_type'], {
      unique: true,
      name: 'idx_compliance_documents_state_type',
    });

    // =====================================================
    // 8. VERSION HISTORY - Track all changes for rollback
    // =====================================================
    await queryInterface.createTable('compliance_spec_versions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      state_spec_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'compliance_state_specs', key: 'id' },
        onDelete: 'CASCADE',
      },
      version: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      change_type: {
        type: Sequelize.ENUM('create', 'update', 'delete', 'rollback'),
        allowNull: false,
      },
      table_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Which table was modified',
      },
      record_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'ID of modified record',
      },
      before_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Data before change',
      },
      after_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Data after change',
      },
      change_description: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Human-readable description (from AI or user)',
      },
      changed_by: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'User ID or "ai-agent"',
      },
      ai_prompt: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'If AI made change, the original prompt',
      },
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Human who approved AI change (if required)',
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('compliance_spec_versions', ['state_spec_id', 'created_at'], {
      name: 'idx_compliance_versions_state_time',
    });

    // =====================================================
    // 9. AI COMMAND LOG - Track AI interactions
    // =====================================================
    await queryInterface.createTable('compliance_ai_commands', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      state_code: {
        type: Sequelize.STRING(2),
        allowNull: true,
        comment: 'Target state (null if general command)',
      },
      raw_command: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Original natural language input',
      },
      parsed_intent: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'e.g., "add_rule", "update_disclosure", "add_state"',
      },
      parsed_params: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Extracted parameters from command',
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'executed', 'rejected', 'failed'),
        defaultValue: 'pending',
      },
      requires_approval: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'If true, human must approve before execution',
      },
      execution_result: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Result of executing the command',
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User who issued the command',
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      executed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex('compliance_ai_commands', ['status', 'created_at'], {
      name: 'idx_compliance_ai_commands_status',
    });

    // 10. Create compliance_webhooks table (for webhook notifications)
    await queryInterface.createTable('compliance_webhooks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Human-readable webhook name',
      },
      webhook_url: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'URL to send notifications to',
      },
      events: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '[]',
        comment: 'Array of event types to subscribe to',
      },
      secret: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Secret for signing webhook payloads',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      last_triggered_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      failure_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('compliance_webhooks', ['is_active'], {
      name: 'idx_compliance_webhooks_active',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('compliance_webhooks');
    await queryInterface.dropTable('compliance_ai_commands');
    await queryInterface.dropTable('compliance_spec_versions');
    await queryInterface.dropTable('compliance_document_requirements');
    await queryInterface.dropTable('compliance_contact_requirements');
    await queryInterface.dropTable('compliance_disclosures');
    await queryInterface.dropTable('compliance_rules');
    await queryInterface.dropTable('compliance_gates');
    await queryInterface.dropTable('compliance_phases');
    await queryInterface.dropTable('compliance_state_specs');
  },
};
