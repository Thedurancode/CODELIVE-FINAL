'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create sprite_mcp_servers table to track installed MCP servers per sprite
    await queryInterface.createTable('sprite_mcp_servers', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      sprite_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'project_sprites',
          key: 'id',
        },
        onDelete: 'CASCADE',
        comment: 'Reference to the project sprite',
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'organizations',
          key: 'id',
        },
        onDelete: 'CASCADE',
        comment: 'Organization (denormalized for query efficiency)',
      },

      // Server identification
      server_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Name of the MCP server from registry (e.g., "github", "filesystem")',
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Optional custom display name',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Description of the server',
      },

      // Package info
      registry: {
        type: Sequelize.ENUM('npm', 'pypi', 'cargo', 'docker', 'custom'),
        allowNull: false,
        defaultValue: 'npm',
        comment: 'Package registry type',
      },
      package_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Package name (e.g., "@modelcontextprotocol/server-github")',
      },
      package_version: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Installed package version',
      },

      // Installation info
      install_command: {
        type: Sequelize.STRING(1024),
        allowNull: true,
        comment: 'Command used to install this server',
      },
      run_command: {
        type: Sequelize.STRING(1024),
        allowNull: true,
        comment: 'Command used to run this server',
      },

      // Configuration (encrypted environment variables)
      env_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Environment variable configuration (values encrypted)',
      },

      // Status
      status: {
        type: Sequelize.ENUM('pending', 'installed', 'running', 'stopped', 'error', 'uninstalled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Current status of this MCP server',
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Last error message if status is error',
      },

      // Auto-start settings
      auto_start: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether to auto-start this server when sprite resumes',
      },
      start_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Order in which to start servers (lower = first)',
      },

      // Tools info (cached from registry)
      tools: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'List of tools this server provides',
      },

      // Timestamps
      installed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When this server was installed',
      },
      last_started_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When this server was last started',
      },
      last_stopped_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When this server was last stopped',
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
    await queryInterface.addIndex('sprite_mcp_servers', ['sprite_id']);
    await queryInterface.addIndex('sprite_mcp_servers', ['organization_id']);
    await queryInterface.addIndex('sprite_mcp_servers', ['server_name']);
    await queryInterface.addIndex('sprite_mcp_servers', ['status']);
    await queryInterface.addIndex('sprite_mcp_servers', ['sprite_id', 'server_name'], {
      unique: true,
      name: 'sprite_mcp_servers_sprite_server_unique',
    });
    await queryInterface.addIndex('sprite_mcp_servers', ['sprite_id', 'auto_start'], {
      name: 'sprite_mcp_servers_sprite_autostart',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sprite_mcp_servers');
  },
};
