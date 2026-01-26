'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add MCP-related fields to project_sprites table
    await queryInterface.addColumn('project_sprites', 'mcp_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether MCP server is enabled on this sprite',
    });

    await queryInterface.addColumn('project_sprites', 'mcp_port', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Port the MCP server is listening on',
    });

    await queryInterface.addColumn('project_sprites', 'mcp_installed_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When MCP server was installed',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('project_sprites', 'mcp_enabled');
    await queryInterface.removeColumn('project_sprites', 'mcp_port');
    await queryInterface.removeColumn('project_sprites', 'mcp_installed_at');
  },
};
