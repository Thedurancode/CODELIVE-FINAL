'use strict';

/**
 * Migration: Add version tracking fields to sprite_mcp_servers table
 *
 * Adds fields for tracking latest available version from registry
 * and when the last update check was performed.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Add latest_version field - stores the latest version from registry
      await queryInterface.addColumn(
        'sprite_mcp_servers',
        'latest_version',
        {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: 'Latest available version from registry',
        },
        { transaction }
      );

      // Add last_update_check field - when we last checked for updates
      await queryInterface.addColumn(
        'sprite_mcp_servers',
        'last_update_check',
        {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'When we last checked for updates',
        },
        { transaction }
      );

      // Add changelog_url field - URL to view changelog/release notes
      await queryInterface.addColumn(
        'sprite_mcp_servers',
        'changelog_url',
        {
          type: Sequelize.STRING(1024),
          allowNull: true,
          comment: 'URL to changelog or release notes',
        },
        { transaction }
      );

      // Add registry_url field - URL to the package in registry
      await queryInterface.addColumn(
        'sprite_mcp_servers',
        'registry_url',
        {
          type: Sequelize.STRING(1024),
          allowNull: true,
          comment: 'URL to package in registry',
        },
        { transaction }
      );

      await transaction.commit();
      console.log('Successfully added version tracking fields to sprite_mcp_servers');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn('sprite_mcp_servers', 'latest_version', { transaction });
      await queryInterface.removeColumn('sprite_mcp_servers', 'last_update_check', { transaction });
      await queryInterface.removeColumn('sprite_mcp_servers', 'changelog_url', { transaction });
      await queryInterface.removeColumn('sprite_mcp_servers', 'registry_url', { transaction });

      await transaction.commit();
      console.log('Successfully removed version tracking fields from sprite_mcp_servers');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
