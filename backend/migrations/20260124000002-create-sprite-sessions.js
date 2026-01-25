'use strict';

/**
 * Migration to create sprite_sessions table
 *
 * Tracks sprite runtime by recording start/stop events.
 * Each session represents a period when the sprite was active.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create sprite_sessions table
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
        references: {
          model: 'organizations',
          key: 'id',
        },
        onDelete: 'CASCADE',
        comment: 'Organization (denormalized for query efficiency)',
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'When the sprite session started (became active)',
      },
      ended_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the sprite session ended (stopped/hibernated). NULL if still active.',
      },
      duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Calculated duration in seconds (populated when session ends)',
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
        comment: 'Additional session metadata (commands run, etc.)',
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

    // Add indexes for efficient queries
    await queryInterface.addIndex('sprite_sessions', ['sprite_id']);
    await queryInterface.addIndex('sprite_sessions', ['project_id']);
    await queryInterface.addIndex('sprite_sessions', ['organization_id']);
    await queryInterface.addIndex('sprite_sessions', ['started_at']);
    await queryInterface.addIndex('sprite_sessions', ['ended_at']);
    await queryInterface.addIndex('sprite_sessions', ['sprite_id', 'ended_at'], {
      name: 'idx_sprite_sessions_active',
      where: { ended_at: null },
    });

    // Add columns to project_sprites for runtime summary
    await queryInterface.addColumn('project_sprites', 'total_runtime_seconds', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Total accumulated runtime in seconds',
    });

    await queryInterface.addColumn('project_sprites', 'session_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Total number of sessions',
    });

    await queryInterface.addColumn('project_sprites', 'last_started_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When the sprite was last started',
    });

    await queryInterface.addColumn('project_sprites', 'current_session_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'sprite_sessions',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'Currently active session (if any)',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove columns from project_sprites
    await queryInterface.removeColumn('project_sprites', 'current_session_id');
    await queryInterface.removeColumn('project_sprites', 'last_started_at');
    await queryInterface.removeColumn('project_sprites', 'session_count');
    await queryInterface.removeColumn('project_sprites', 'total_runtime_seconds');

    // Drop the table
    await queryInterface.dropTable('sprite_sessions');

    // Drop the ENUMs
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_sprite_sessions_start_reason";'
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_sprite_sessions_end_reason";'
    );
  },
};
