'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if the column already exists
    const tableInfo = await queryInterface.describeTable('marketplace_users');

    if (!tableInfo.organization_id) {
      await queryInterface.addColumn('marketplace_users', 'organization_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id',
        },
        onDelete: 'SET NULL',
        comment: 'Organization the user belongs to',
      });

      // Add index for performance
      await queryInterface.addIndex('marketplace_users', ['organization_id'], {
        name: 'idx_marketplace_users_organization_id',
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('marketplace_users', 'idx_marketplace_users_organization_id');
    await queryInterface.removeColumn('marketplace_users', 'organization_id');
  },
};
