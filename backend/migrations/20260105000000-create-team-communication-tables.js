'use strict';

/**
 * Migration: Create Team Communication Tables
 *
 * Creates the tables for the unified team communication system:
 * - team_conversations: Property-based conversation threads
 * - team_messages: Individual messages (platform, SMS, email)
 * - guest_sessions: Phone-based authentication for external users
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create enum types first
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE team_sender_type AS ENUM ('team', 'buyer', 'guest', 'system');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE team_message_source AS ENUM ('platform', 'sms', 'email');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE team_delivery_status AS ENUM ('pending', 'sent', 'delivered', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Create team_conversations table (camelCase to match Sequelize model)
    await queryInterface.createTable('team_conversations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      propertyId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'properties',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      propertyAddress: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      lastMessageAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lastMessagePreview: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      lastMessageSender: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      lastMessageSource: {
        type: Sequelize.ENUM('platform', 'sms', 'email'),
        allowNull: true,
      },
      participantIds: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: [],
      },
      unreadCounts: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      isArchived: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Create team_messages table
    await queryInterface.createTable('team_messages', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      conversationId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'team_conversations',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      senderId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      senderType: {
        type: Sequelize.ENUM('team', 'buyer', 'guest', 'system'),
        allowNull: false,
        defaultValue: 'team',
      },
      senderName: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      senderPhone: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      senderEmail: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      source: {
        type: Sequelize.ENUM('platform', 'sms', 'email'),
        allowNull: false,
        defaultValue: 'platform',
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      contentHtml: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      attachments: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      mentions: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: [],
      },
      isEdited: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      editedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      readBy: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      deliveryStatus: {
        type: Sequelize.ENUM('pending', 'sent', 'delivered', 'failed'),
        defaultValue: 'pending',
      },
      externalMessageId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      replyToMessageId: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Create guest_sessions table
    await queryInterface.createTable('guest_sessions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      verificationCode: {
        type: Sequelize.STRING(6),
        allowNull: true,
      },
      verificationExpires: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      isVerified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      linkedUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      propertyAccess: {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        defaultValue: [],
      },
      sessionToken: {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true,
      },
      sessionExpires: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lastActiveAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Create indexes for team_conversations
    await queryInterface.addIndex('team_conversations', ['propertyId'], {
      name: 'idx_team_conversations_property_id',
    });

    await queryInterface.addIndex('team_conversations', ['lastMessageAt'], {
      name: 'idx_team_conversations_last_message_at',
    });

    await queryInterface.addIndex('team_conversations', ['isArchived'], {
      name: 'idx_team_conversations_is_archived',
    });

    // Create indexes for team_messages
    await queryInterface.addIndex('team_messages', ['conversationId', 'createdAt'], {
      name: 'idx_team_messages_conversation_created',
    });

    await queryInterface.addIndex('team_messages', ['senderId'], {
      name: 'idx_team_messages_sender_id',
    });

    await queryInterface.addIndex('team_messages', ['source'], {
      name: 'idx_team_messages_source',
    });

    await queryInterface.addIndex('team_messages', ['senderPhone'], {
      name: 'idx_team_messages_sender_phone',
    });

    await queryInterface.addIndex('team_messages', ['senderEmail'], {
      name: 'idx_team_messages_sender_email',
    });

    await queryInterface.addIndex('team_messages', ['externalMessageId'], {
      name: 'idx_team_messages_external_id',
    });

    await queryInterface.addIndex('team_messages', ['createdAt'], {
      name: 'idx_team_messages_created_at',
    });

    // Create indexes for guest_sessions
    await queryInterface.addIndex('guest_sessions', ['phone'], {
      name: 'idx_guest_sessions_phone',
      unique: true,
    });

    await queryInterface.addIndex('guest_sessions', ['sessionToken'], {
      name: 'idx_guest_sessions_session_token',
    });

    await queryInterface.addIndex('guest_sessions', ['linkedUserId'], {
      name: 'idx_guest_sessions_linked_user_id',
    });

    console.log('Created team_conversations, team_messages, and guest_sessions tables with indexes');
  },

  async down(queryInterface) {
    // Drop tables (order matters due to foreign keys)
    await queryInterface.dropTable('team_messages');
    await queryInterface.dropTable('team_conversations');
    await queryInterface.dropTable('guest_sessions');

    // Drop enum types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS team_sender_type CASCADE;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS team_message_source CASCADE;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS team_delivery_status CASCADE;');

    console.log('Dropped team communication tables and enum types');
  },
};
