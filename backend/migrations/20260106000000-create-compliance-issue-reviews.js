'use strict';

/**
 * Migration: Create Compliance Issue Reviews
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('compliance_issue_reviews', {
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
      checkId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'compliance_checks',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      issueId: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      ruleId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      decision: {
        type: Sequelize.ENUM('confirmed', 'dismissed', 'overridden'),
        allowNull: false,
      },
      reviewerId: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      reviewerEmail: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      overrideSeverity: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      overrideMessage: {
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

    await queryInterface.addIndex('compliance_issue_reviews', ['propertyId']);
    await queryInterface.addIndex('compliance_issue_reviews', ['checkId']);
    await queryInterface.addIndex('compliance_issue_reviews', ['issueId']);
    await queryInterface.addIndex('compliance_issue_reviews', ['checkId', 'issueId'], {
      unique: true,
      name: 'idx_compliance_issue_reviews_check_issue',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('compliance_issue_reviews');
  },
};
