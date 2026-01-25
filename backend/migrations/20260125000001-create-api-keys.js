'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('api_keys', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'organizations',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Human-readable name for the API key',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional description of what this key is used for',
      },
      key_prefix: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'First 16 chars of the key for identification (sk_live_xxxxxxxx)',
      },
      key_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
        comment: 'SHA-256 hash of the full API key',
      },
      scopes: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: ['sprites:read'],
        comment: 'Array of permission scopes',
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Optional expiration date',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onDelete: 'SET NULL',
      },
      rate_limit: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 60,
        comment: 'Maximum requests per minute',
      },
      usage_count: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of API calls made with this key',
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
    await queryInterface.addIndex('api_keys', ['organization_id']);
    await queryInterface.addIndex('api_keys', ['key_hash'], { unique: true });
    await queryInterface.addIndex('api_keys', ['key_prefix']);
    await queryInterface.addIndex('api_keys', ['is_active']);
    await queryInterface.addIndex('api_keys', ['created_by_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('api_keys');
  },
};
