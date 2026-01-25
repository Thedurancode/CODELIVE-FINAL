'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if the table already exists
    const tableExists = await queryInterface.sequelize.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sprite_sessions');`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (tableExists[0].exists) {
      console.log('Table sprite_sessions already exists, skipping creation');
      return;
    }

    // Create ENUM types first
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE session_start_reason AS ENUM ('created', 'resumed', 'restored', 'restarted');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE session_end_reason AS ENUM ('stopped', 'hibernated', 'error', 'deleted', 'checkpointed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.createTable('sprite_sessions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      sprite_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'project_sprites',
          key: 'id',
        },
        onDelete: 'CASCADE',
        comment: 'Reference to the project sprite',
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id',
        },
        onDelete: 'CASCADE',
        comment: 'Project this session belongs to',
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'Organization (denormalized for query efficiency)',
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'When the sprite session started',
      },
      ended_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the sprite session ended (NULL if still active)',
      },
      duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Calculated duration in seconds',
      },
      start_reason: {
        type: Sequelize.ENUM('created', 'resumed', 'restored', 'restarted'),
        allowNull: false,
        defaultValue: 'created',
        comment: 'Why the session started',
      },
      end_reason: {
        type: Sequelize.ENUM('stopped', 'hibernated', 'error', 'deleted', 'checkpointed'),
        allowNull: true,
        comment: 'Why the session ended',
      },
      started_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        comment: 'User who started this session',
      },
      ended_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        comment: 'User who ended this session',
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional session metadata',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Add indexes
    await queryInterface.addIndex('sprite_sessions', ['sprite_id'], {
      name: 'idx_sprite_sessions_sprite_id',
    });
    await queryInterface.addIndex('sprite_sessions', ['project_id'], {
      name: 'idx_sprite_sessions_project_id',
    });
    await queryInterface.addIndex('sprite_sessions', ['organization_id'], {
      name: 'idx_sprite_sessions_organization_id',
    });
    await queryInterface.addIndex('sprite_sessions', ['started_at'], {
      name: 'idx_sprite_sessions_started_at',
    });
    await queryInterface.addIndex('sprite_sessions', ['ended_at'], {
      name: 'idx_sprite_sessions_ended_at',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sprite_sessions');

    // Drop ENUM types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS session_start_reason;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS session_end_reason;');
  },
};
