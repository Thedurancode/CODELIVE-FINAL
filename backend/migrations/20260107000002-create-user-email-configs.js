'use strict';

/**
 * Migration: Create user_email_configs table
 *
 * Stores per-user email account configuration for IMAP inbox sync.
 * Each user can have ONE email account configured.
 * Passwords are encrypted using AES-256-GCM.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create enum for sync status
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_user_email_configs_sync_status') THEN
          CREATE TYPE "enum_user_email_configs_sync_status" AS ENUM ('idle', 'syncing', 'error');
        END IF;
      END
      $$;
    `);

    await queryInterface.createTable('user_email_configs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      account_email: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      imap_host: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      imap_port: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 993,
      },
      imap_secure: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      imap_user: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      encrypted_password: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      password_iv: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      password_auth_tag: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      smtp_from: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_sync_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_sync_error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      sync_status: {
        type: Sequelize.ENUM('idle', 'syncing', 'error'),
        allowNull: false,
        defaultValue: 'idle',
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
    await queryInterface.addIndex('user_email_configs', ['user_id'], {
      unique: true,
      name: 'idx_user_email_configs_user_id',
    });
    await queryInterface.addIndex('user_email_configs', ['account_email'], {
      name: 'idx_user_email_configs_account_email',
    });
    await queryInterface.addIndex('user_email_configs', ['is_active'], {
      name: 'idx_user_email_configs_is_active',
    });

    console.log('Created user_email_configs table');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('user_email_configs');

    // Drop enum type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_user_email_configs_sync_status";
    `);

    console.log('Dropped user_email_configs table');
  }
};
