'use strict';

/**
 * Migration: Create Property Field Quality
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('property_field_quality', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      propertyId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'properties',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      field: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('known', 'unknown', 'inferred'),
        allowNull: false,
        defaultValue: 'known',
      },
      source: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      confidence: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('property_field_quality', ['propertyId']);
    await queryInterface.addIndex('property_field_quality', ['status']);
    await queryInterface.addIndex('property_field_quality', ['propertyId', 'field'], {
      unique: true,
      name: 'idx_property_field_quality_property_field',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('property_field_quality');
  },
};
