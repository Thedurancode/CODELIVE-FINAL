'use strict';

/**
 * Migration: Add Compliance Passport Fields
 *
 * Adds property/evidence snapshots and hashes to compliance_checks.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Helper to check if column exists
    const columnExists = async (table, column) => {
      const [results] = await queryInterface.sequelize.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = '${table}' AND column_name = '${column}'
      `);
      return results.length > 0;
    };

    // Helper to check if index exists
    const indexExists = async (indexName) => {
      const [results] = await queryInterface.sequelize.query(`
        SELECT indexname FROM pg_indexes WHERE indexname = '${indexName}'
      `);
      return results.length > 0;
    };

    if (!(await columnExists('compliance_checks', 'propertySnapshot'))) {
      await queryInterface.addColumn('compliance_checks', 'propertySnapshot', {
        type: Sequelize.JSONB,
        allowNull: true,
      });
    }

    if (!(await columnExists('compliance_checks', 'propertySnapshotHash'))) {
      await queryInterface.addColumn('compliance_checks', 'propertySnapshotHash', {
        type: Sequelize.STRING(32),
        allowNull: true,
      });
    }

    if (!(await columnExists('compliance_checks', 'evidenceSnapshot'))) {
      await queryInterface.addColumn('compliance_checks', 'evidenceSnapshot', {
        type: Sequelize.JSONB,
        allowNull: true,
      });
    }

    if (!(await columnExists('compliance_checks', 'evidenceHash'))) {
      await queryInterface.addColumn('compliance_checks', 'evidenceHash', {
        type: Sequelize.STRING(32),
        allowNull: true,
      });
    }

    if (!(await columnExists('compliance_checks', 'compliancePassportHash'))) {
      await queryInterface.addColumn('compliance_checks', 'compliancePassportHash', {
        type: Sequelize.STRING(32),
        allowNull: true,
      });
    }

    if (!(await indexExists('idx_compliance_checks_passport_hash'))) {
      await queryInterface.addIndex('compliance_checks', ['compliancePassportHash'], {
        name: 'idx_compliance_checks_passport_hash',
      });
    }

    if (!(await indexExists('idx_compliance_checks_property_snapshot_hash'))) {
      await queryInterface.addIndex('compliance_checks', ['propertySnapshotHash'], {
        name: 'idx_compliance_checks_property_snapshot_hash',
      });
    }

    if (!(await indexExists('idx_compliance_checks_evidence_hash'))) {
      await queryInterface.addIndex('compliance_checks', ['evidenceHash'], {
        name: 'idx_compliance_checks_evidence_hash',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('compliance_checks', 'idx_compliance_checks_passport_hash');
    await queryInterface.removeIndex('compliance_checks', 'idx_compliance_checks_property_snapshot_hash');
    await queryInterface.removeIndex('compliance_checks', 'idx_compliance_checks_evidence_hash');

    await queryInterface.removeColumn('compliance_checks', 'compliancePassportHash');
    await queryInterface.removeColumn('compliance_checks', 'evidenceHash');
    await queryInterface.removeColumn('compliance_checks', 'evidenceSnapshot');
    await queryInterface.removeColumn('compliance_checks', 'propertySnapshotHash');
    await queryInterface.removeColumn('compliance_checks', 'propertySnapshot');
  },
};
