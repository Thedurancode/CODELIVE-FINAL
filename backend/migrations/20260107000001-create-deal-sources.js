'use strict';

/**
 * Migration: Create deal_sources table
 *
 * Persists deal source configurations (email, webhook, API, etc.)
 * so they survive server restarts.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('deal_sources', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      type: {
        type: Sequelize.ENUM('csv', 'api', 'email', 'webhook', 'manual', 'firecrawl', 'pdf'),
        allowNull: false,
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      last_fetch_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_fetch_status: {
        type: Sequelize.ENUM('success', 'failed'),
        allowNull: true,
      },
      last_fetch_error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      total_deals_ingested: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    await queryInterface.addIndex('deal_sources', ['user_id']);
    await queryInterface.addIndex('deal_sources', ['type']);
    await queryInterface.addIndex('deal_sources', ['enabled']);
    await queryInterface.addIndex('deal_sources', ['user_id', 'type']);

    console.log('Created deal_sources table');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('deal_sources');
    console.log('Dropped deal_sources table');
  }
};
