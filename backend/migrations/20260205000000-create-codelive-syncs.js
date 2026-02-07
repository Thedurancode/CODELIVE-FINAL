'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create enum type for sync status
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_codelive_syncs_status" AS ENUM('pending', 'synced', 'running', 'completed', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.createTable('codelive_syncs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      taskId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'tasks',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      codeliveFeatureId: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      projectPath: {
        type: Sequelize.STRING(1024),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('pending', 'synced', 'running', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      codeliveStatus: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      agentOutput: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      lastSyncedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Add indexes
    await queryInterface.addIndex('codelive_syncs', ['taskId'], { unique: true });
    await queryInterface.addIndex('codelive_syncs', ['codeliveFeatureId']);
    await queryInterface.addIndex('codelive_syncs', ['projectPath']);
    await queryInterface.addIndex('codelive_syncs', ['status']);
    await queryInterface.addIndex('codelive_syncs', ['lastSyncedAt']);

    console.log('✅ codelive_syncs table created successfully');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('codelive_syncs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_codelive_syncs_status";');
  },
};
