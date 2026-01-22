'use strict';

/**
 * Migration: Create emails table
 *
 * Stores emails for inbox and outbox functionality.
 * Supports IMAP sync for received emails and tracks sent emails.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create enums
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_emails_folder') THEN
          CREATE TYPE "enum_emails_folder" AS ENUM ('inbox', 'sent', 'drafts', 'trash', 'archive');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_emails_status') THEN
          CREATE TYPE "enum_emails_status" AS ENUM ('unread', 'read', 'replied', 'forwarded');
        END IF;
      END
      $$;
    `);

    await queryInterface.createTable('emails', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
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
      message_id: {
        type: Sequelize.STRING(500),
        allowNull: false,
        unique: true,
      },
      thread_id: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      in_reply_to: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      references: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
      },
      folder: {
        type: Sequelize.ENUM('inbox', 'sent', 'drafts', 'trash', 'archive'),
        allowNull: false,
        defaultValue: 'inbox',
      },
      status: {
        type: Sequelize.ENUM('unread', 'read', 'replied', 'forwarded'),
        allowNull: false,
        defaultValue: 'unread',
      },
      starred: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      important: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      from: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      to: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      cc: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      bcc: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      reply_to: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      subject: {
        type: Sequelize.STRING(1000),
        allowNull: false,
        defaultValue: '(No Subject)',
      },
      body_text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      body_html: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      snippet: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      attachments: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
      },
      has_attachments: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      labels: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
      },
      headers: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      received_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
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
    await queryInterface.addIndex('emails', ['user_id'], { name: 'idx_emails_user_id' });
    await queryInterface.addIndex('emails', ['account_email'], { name: 'idx_emails_account_email' });
    await queryInterface.addIndex('emails', ['folder'], { name: 'idx_emails_folder' });
    await queryInterface.addIndex('emails', ['status'], { name: 'idx_emails_status' });
    await queryInterface.addIndex('emails', ['starred'], { name: 'idx_emails_starred' });
    await queryInterface.addIndex('emails', ['received_at'], { name: 'idx_emails_received_at' });
    await queryInterface.addIndex('emails', ['thread_id'], { name: 'idx_emails_thread_id' });
    await queryInterface.addIndex('emails', ['deleted_at'], { name: 'idx_emails_deleted_at' });
    await queryInterface.addIndex('emails', ['user_id', 'folder'], { name: 'idx_emails_user_folder' });
    await queryInterface.addIndex('emails', ['user_id', 'account_email'], { name: 'idx_emails_user_account' });

    console.log('Created emails table');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('emails');

    // Drop enum types
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_emails_folder";
      DROP TYPE IF EXISTS "enum_emails_status";
    `);

    console.log('Dropped emails table');
  }
};
