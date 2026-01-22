'use strict';

/**
 * Migration: Create state_compliance_configs table
 *
 * This table stores compliance specifications for each state in JSON format.
 * Each row contains contacts, documents, rules, disclosures, timing rules,
 * extraction profiles, scoring rules, and blocking gates for a specific state.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('state_compliance_configs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      state: {
        type: Sequelize.STRING(2),
        allowNull: false,
        unique: true,
        comment: 'Two-letter state code (e.g., OK, TX, FL)',
      },
      county: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'ALL',
        comment: 'County name or ALL for statewide rules',
      },
      version: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: '1.0.0',
        comment: 'Version of the compliance spec',
      },
      contacts: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of required contact types with validation rules',
      },
      documents: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of required document types with OCR fields',
      },
      rules: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of compliance rules by phase',
      },
      disclosures: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of required disclosure statements',
      },
      timingRules: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of timing validation rules',
      },
      extractionProfiles: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of OCR extraction profiles for documents',
      },
      scoringRules: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Scoring thresholds for green/yellow/red status',
      },
      blockingGates: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of phase gates that block progression',
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether this config is currently active',
      },
      effectiveDate: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date when this config becomes effective',
      },
      expirationDate: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date when this config expires',
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Administrative notes about this config',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Add indexes
    await queryInterface.addIndex('state_compliance_configs', ['state'], {
      name: 'idx_state_compliance_configs_state',
    });

    await queryInterface.addIndex('state_compliance_configs', ['state', 'county'], {
      name: 'idx_state_compliance_configs_state_county',
    });

    await queryInterface.addIndex('state_compliance_configs', ['isActive'], {
      name: 'idx_state_compliance_configs_active',
    });

    console.log('✅ Created state_compliance_configs table');
    console.log('');
    console.log('Next steps:');
    console.log('1. Import Oklahoma compliance:');
    console.log('   npx ts-node src/scripts/importStateCompliance.ts compliance-specs/oklahoma-all.json');
    console.log('');
    console.log('2. Import Texas compliance:');
    console.log('   npx ts-node src/scripts/importStateCompliance.ts compliance-specs/texas-all.json');
    console.log('');
    console.log('3. Import Florida compliance:');
    console.log('   npx ts-node src/scripts/importStateCompliance.ts compliance-specs/florida-all.json');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('state_compliance_configs');
    console.log('✅ Dropped state_compliance_configs table');
  },
};
