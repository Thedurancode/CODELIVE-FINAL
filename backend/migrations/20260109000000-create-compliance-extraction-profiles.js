'use strict';

/**
 * Migration: Create Compliance Extraction Profiles
 *
 * Per-state extraction profiles for powerful, state-specific document field extraction.
 * Enables configurable field labels, regex patterns, and vision prompts per state + template.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('compliance_extraction_profiles', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      state: {
        type: Sequelize.STRING(2),
        allowNull: false,
        comment: 'US state code (e.g., TX, FL, CA)',
      },
      docuSealTemplateId: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'DocuSeal template ID (optional, can use category instead)',
      },
      category: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Document category (e.g., purchase_contract, assignment_addendum)',
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Profile name for display (e.g., "Texas Purchase Contract")',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Profile description',
      },
      fieldLabels: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {},
        comment: 'Field label synonyms per state (e.g., {seller: ["Seller", "Grantor", "Vendor"]})',
      },
      regexHints: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {},
        comment: 'Regex patterns for field extraction (e.g., {seller: "/(?:seller|grantor)[:\\s]+([A-Z][a-z]+)/i"})',
      },
      promptOverrides: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'State-specific vision prompt override',
      },
      requiredFields: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of required field names (e.g., ["seller", "buyer", "price"])',
      },
      minConfidence: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.70,
        comment: 'Minimum confidence threshold (0.0-1.0)',
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether this profile is active',
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Profile priority (higher = preferred when multiple match)',
      },
      extractionStats: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Extraction statistics and performance metrics',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // Indexes for fast profile lookup
    await queryInterface.addIndex('compliance_extraction_profiles', ['state']);
    await queryInterface.addIndex('compliance_extraction_profiles', ['docuSealTemplateId']);
    await queryInterface.addIndex('compliance_extraction_profiles', ['category']);
    await queryInterface.addIndex('compliance_extraction_profiles', ['enabled']);

    // Unique constraint: one profile per state + template (or category)
    await queryInterface.addIndex('compliance_extraction_profiles',
      ['state', 'docuSealTemplateId', 'category'],
      {
        unique: true,
        name: 'idx_extraction_profile_state_template',
        where: {
          enabled: true,
        },
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('compliance_extraction_profiles');
  },
};
