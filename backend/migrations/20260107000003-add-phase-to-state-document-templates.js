'use strict';

/**
 * Migration: Add phase-related fields to state_document_templates
 *
 * Enables automatic contract sending based on compliance phase transitions.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add phase field - which compliance phase (0-11) this template belongs to
    await queryInterface.addColumn('state_document_templates', 'phase', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Compliance phase number (0-11) this document is required for',
    });

    // Add triggerOn field - when to send the contract
    await queryInterface.addColumn('state_document_templates', 'trigger_on', {
      type: Sequelize.ENUM('phase_enter', 'phase_complete', 'manual'),
      allowNull: true,
      defaultValue: 'manual',
      comment: 'When to trigger sending: phase_enter, phase_complete, or manual',
    });

    // Add autoSend field - whether to automatically send when trigger fires
    await queryInterface.addColumn('state_document_templates', 'auto_send', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether to automatically send this contract when trigger fires',
    });

    // Add signerRoles field - who needs to sign this document
    await queryInterface.addColumn('state_document_templates', 'signer_roles', {
      type: Sequelize.ARRAY(Sequelize.STRING),
      allowNull: true,
      defaultValue: [],
      comment: 'Roles that need to sign: seller, buyer, wholesaler, broker',
    });

    // Add conditionalOn field - for documents only sent in certain conditions
    await queryInterface.addColumn('state_document_templates', 'conditional_on', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Conditions for when this document is required (e.g., {"distributionChannels": ["auction"]})',
    });

    // Add expiresInDays field - how long until contract expires
    await queryInterface.addColumn('state_document_templates', 'expires_in_days', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 30,
      comment: 'Number of days until the sent contract expires',
    });

    // Add index for phase lookups
    await queryInterface.addIndex('state_document_templates', ['state', 'phase'], {
      name: 'idx_state_document_templates_state_phase',
    });

    // Add index for auto-send lookups
    await queryInterface.addIndex('state_document_templates', ['state', 'phase', 'auto_send'], {
      name: 'idx_state_document_templates_auto_send',
      where: { auto_send: true },
    });

    console.log('Added phase-related fields to state_document_templates');
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes
    await queryInterface.removeIndex(
      'state_document_templates',
      'idx_state_document_templates_auto_send'
    );
    await queryInterface.removeIndex(
      'state_document_templates',
      'idx_state_document_templates_state_phase'
    );

    // Remove columns
    await queryInterface.removeColumn('state_document_templates', 'expires_in_days');
    await queryInterface.removeColumn('state_document_templates', 'conditional_on');
    await queryInterface.removeColumn('state_document_templates', 'signer_roles');
    await queryInterface.removeColumn('state_document_templates', 'auto_send');
    await queryInterface.removeColumn('state_document_templates', 'trigger_on');
    await queryInterface.removeColumn('state_document_templates', 'phase');

    // Remove the enum type
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_state_document_templates_trigger_on";');

    console.log('Removed phase-related fields from state_document_templates');
  },
};
