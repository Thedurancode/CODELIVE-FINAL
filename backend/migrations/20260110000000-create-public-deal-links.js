'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('public_deal_links', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      property_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'properties',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      token: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          showFinancials: true,
          showPropertyDetails: true,
          showOccupancy: true,
          showFeatures: true,
          showDocuments: true,
          showCompliance: true,
          showViewers: true,
          showBuyers: true,
          showOffers: true,
          showSkipTrace: true,
          showContacts: true,
          showDiscussion: true,
          showPhotos: true,
        },
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      view_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
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

    // Add index on token for fast lookups
    await queryInterface.addIndex('public_deal_links', ['token']);

    // Add index on property_id for finding links by property
    await queryInterface.addIndex('public_deal_links', ['property_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('public_deal_links');
  },
};
