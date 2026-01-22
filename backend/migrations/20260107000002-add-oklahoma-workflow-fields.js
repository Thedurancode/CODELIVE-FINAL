/**
 * Oklahoma Workflow Fields Migration
 *
 * Adds fields for Phase 1 (transaction type), Phase 6 (distribution channels),
 * Phase 8 (broker review), and Phase 9 (distribution status) to support
 * the full Oklahoma wholesale deal submission workflow.
 */

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Adding Oklahoma workflow fields to state_deal_compliance...');

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

    // Check if state_deal_compliance table exists
    if (!(await tableExists('state_deal_compliance'))) {
      console.log('state_deal_compliance table does not exist, skipping migration');
      return;
    }

    // ========================================================================
    // PHASE 1: Transaction Type
    // ========================================================================
    if (!(await columnExists('state_deal_compliance', 'transaction_type'))) {
      await queryInterface.addColumn('state_deal_compliance', 'transaction_type', {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Transaction type: wholesale, novation, double_closing',
      });
      console.log('  Added transaction_type column');
    }

    // ========================================================================
    // PHASE 8: Broker Review Fields
    // ========================================================================
    if (!(await columnExists('state_deal_compliance', 'broker_reviewed'))) {
      await queryInterface.addColumn('state_deal_compliance', 'broker_reviewed', {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: 'Whether broker has reviewed the deal',
      });
      console.log('  Added broker_reviewed column');
    }

    if (!(await columnExists('state_deal_compliance', 'broker_reviewed_by'))) {
      await queryInterface.addColumn('state_deal_compliance', 'broker_reviewed_by', {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Name of broker who reviewed',
      });
      console.log('  Added broker_reviewed_by column');
    }

    if (!(await columnExists('state_deal_compliance', 'broker_reviewed_at'))) {
      await queryInterface.addColumn('state_deal_compliance', 'broker_reviewed_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Timestamp of broker review',
      });
      console.log('  Added broker_reviewed_at column');
    }

    if (!(await columnExists('state_deal_compliance', 'broker_decision'))) {
      await queryInterface.addColumn('state_deal_compliance', 'broker_decision', {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Broker decision: pending, approved, rejected, needs_info',
      });
      console.log('  Added broker_decision column');
    }

    if (!(await columnExists('state_deal_compliance', 'broker_notes'))) {
      await queryInterface.addColumn('state_deal_compliance', 'broker_notes', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Broker review notes/comments',
      });
      console.log('  Added broker_notes column');
    }

    // ========================================================================
    // PHASE 9: Distribution Status Fields
    // ========================================================================
    if (!(await columnExists('state_deal_compliance', 'distribution_started_at'))) {
      await queryInterface.addColumn('state_deal_compliance', 'distribution_started_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When distribution began',
      });
      console.log('  Added distribution_started_at column');
    }

    if (!(await columnExists('state_deal_compliance', 'distribution_status'))) {
      await queryInterface.addColumn('state_deal_compliance', 'distribution_status', {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Distribution status: pending, in_progress, completed, failed',
      });
      console.log('  Added distribution_status column');
    }

    if (!(await columnExists('state_deal_compliance', 'distribution_notes'))) {
      await queryInterface.addColumn('state_deal_compliance', 'distribution_notes', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Distribution notes and details',
      });
      console.log('  Added distribution_notes column');
    }

    // ========================================================================
    // Add indexes for new columns
    // ========================================================================
    try {
      await queryInterface.addIndex('state_deal_compliance', ['transaction_type'], {
        name: 'state_deal_compliance_transaction_type_idx',
      });
      console.log('  Added index on transaction_type');
    } catch (e) {
      console.log('  Index on transaction_type may already exist, skipping');
    }

    try {
      await queryInterface.addIndex('state_deal_compliance', ['broker_decision'], {
        name: 'state_deal_compliance_broker_decision_idx',
      });
      console.log('  Added index on broker_decision');
    } catch (e) {
      console.log('  Index on broker_decision may already exist, skipping');
    }

    try {
      await queryInterface.addIndex('state_deal_compliance', ['distribution_status'], {
        name: 'state_deal_compliance_distribution_status_idx',
      });
      console.log('  Added index on distribution_status');
    } catch (e) {
      console.log('  Index on distribution_status may already exist, skipping');
    }

    console.log('Oklahoma workflow fields added successfully');
  },

  async down(queryInterface, Sequelize) {
    console.log('Removing Oklahoma workflow fields from state_deal_compliance...');

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
        return false;
      }
    };

    // Remove indexes
    try {
      await queryInterface.removeIndex(
        'state_deal_compliance',
        'state_deal_compliance_distribution_status_idx'
      );
    } catch (e) {
      console.log('Index distribution_status may not exist, skipping');
    }

    try {
      await queryInterface.removeIndex(
        'state_deal_compliance',
        'state_deal_compliance_broker_decision_idx'
      );
    } catch (e) {
      console.log('Index broker_decision may not exist, skipping');
    }

    try {
      await queryInterface.removeIndex(
        'state_deal_compliance',
        'state_deal_compliance_transaction_type_idx'
      );
    } catch (e) {
      console.log('Index transaction_type may not exist, skipping');
    }

    // Remove columns in reverse order
    const columnsToRemove = [
      'distribution_notes',
      'distribution_status',
      'distribution_started_at',
      'broker_notes',
      'broker_decision',
      'broker_reviewed_at',
      'broker_reviewed_by',
      'broker_reviewed',
      'transaction_type',
    ];

    for (const column of columnsToRemove) {
      if (await columnExists('state_deal_compliance', column)) {
        await queryInterface.removeColumn('state_deal_compliance', column);
        console.log(`  Removed ${column} column`);
      }
    }

    console.log('Oklahoma workflow fields removed successfully');
  },
};
