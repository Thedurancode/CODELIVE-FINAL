'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create role enum type
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE conversation_role AS ENUM ('user', 'assistant', 'system');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create conversation_history table
    await queryInterface.createTable('conversation_history', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      session_id: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      role: {
        type: Sequelize.ENUM('user', 'assistant', 'system'),
        allowNull: false,
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      tool_calls: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
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

    // Add indexes for efficient querying
    await queryInterface.addIndex('conversation_history', ['session_id'], {
      name: 'conversation_history_session_id_idx',
    });
    await queryInterface.addIndex('conversation_history', ['user_id'], {
      name: 'conversation_history_user_id_idx',
    });
    await queryInterface.addIndex('conversation_history', ['created_at'], {
      name: 'conversation_history_created_at_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('conversation_history');

    // Drop the enum type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS conversation_role;
    `);
  },
};
