'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add last_shell_directory column
    await queryInterface.addColumn('project_sprites', 'last_shell_directory', {
      type: Sequelize.STRING(512),
      allowNull: true,
      comment: 'Last working directory in the shell session',
    });

    // Add startup_command column
    await queryInterface.addColumn('project_sprites', 'startup_command', {
      type: Sequelize.STRING(1024),
      allowNull: true,
      comment: 'Command to run when terminal connects (e.g., npm run dev)',
    });

    // Add tmux_session_name column for persistent terminal sessions
    await queryInterface.addColumn('project_sprites', 'tmux_session_name', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Name of the tmux session for persistent terminal',
    });

    // Change current_session_id to STRING type (from UUID) if needed
    // This stores the Sprites.dev session ID which is not a UUID
    await queryInterface.changeColumn('project_sprites', 'current_session_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Currently active terminal session ID from Sprites.dev',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('project_sprites', 'last_shell_directory');
    await queryInterface.removeColumn('project_sprites', 'startup_command');
    await queryInterface.removeColumn('project_sprites', 'tmux_session_name');
    // Note: Not reverting current_session_id type change as it may cause data loss
  },
};
