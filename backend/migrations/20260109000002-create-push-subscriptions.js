'use strict';

/**
 * Migration: Create push_subscriptions table
 *
 * Stores Web Push API subscriptions for sending push notifications
 * when users are offline or have the app in the background.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('push_subscriptions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        field: 'user_id',
      },
      endpoint: {
        type: Sequelize.TEXT,
        allowNull: false,
        unique: true,
      },
      keys: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Web Push encryption keys (p256dh and auth)',
      },
      expirationTime: {
        type: Sequelize.BIGINT,
        allowNull: true,
        field: 'expiration_time',
      },
      userAgent: {
        type: Sequelize.STRING(500),
        allowNull: true,
        field: 'user_agent',
      },
      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
        field: 'created_at',
      },
      updatedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
        field: 'updated_at',
      },
    });

    // Add indexes
    await queryInterface.addIndex('push_subscriptions', ['user_id'], {
      name: 'idx_push_subscriptions_user_id',
    });

    console.log('✅ Created push_subscriptions table');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('push_subscriptions');
    console.log('✅ Dropped push_subscriptions table');
  },
};
