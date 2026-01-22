'use strict';

/**
 * Migration: Create PropertyInquiries Table
 *
 * This table tracks buyer questions about properties that require seller/admin input.
 * Part of the multi-agent system where the buyer agent escalates questions
 * it cannot answer to sellers, then relays responses back to buyers.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create enum types first
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE inquiry_status AS ENUM ('pending', 'answered', 'expired', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE inquiry_priority AS ENUM ('low', 'normal', 'high', 'urgent');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE inquiry_category AS ENUM (
          'seller_motivation',
          'property_condition',
          'property_history',
          'closing_terms',
          'inclusions',
          'pricing',
          'other'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE answered_by_role AS ENUM ('seller', 'admin', 'broker');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Create the table
    await queryInterface.createTable('property_inquiries', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      property_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'properties',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      buyer_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'MarketplaceUser ID of the buyer asking the question',
      },
      session_id: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Buyer chat session ID for response injection',
      },
      question: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'The buyer question',
      },
      category: {
        type: Sequelize.ENUM(
          'seller_motivation',
          'property_condition',
          'property_history',
          'closing_terms',
          'inclusions',
          'pricing',
          'other'
        ),
        allowNull: false,
        defaultValue: 'other',
        comment: 'Type of question for routing and analytics',
      },
      context: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Additional context from the conversation',
      },
      priority: {
        type: Sequelize.ENUM('low', 'normal', 'high', 'urgent'),
        allowNull: false,
        defaultValue: 'normal',
      },
      status: {
        type: Sequelize.ENUM('pending', 'answered', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      seller_response: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'The seller/admin response to the question',
      },
      answered_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      answered_by: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'MarketplaceUser ID of the responder',
      },
      answered_by_role: {
        type: Sequelize.ENUM('seller', 'admin', 'broker'),
        allowNull: true,
      },
      notified_buyer: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether buyer has been notified of response',
      },
      notified_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the inquiry expires if unanswered',
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Additional metadata',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Create indexes for common queries
    await queryInterface.addIndex('property_inquiries', ['property_id'], {
      name: 'idx_property_inquiries_property_id',
    });

    await queryInterface.addIndex('property_inquiries', ['buyer_id'], {
      name: 'idx_property_inquiries_buyer_id',
    });

    await queryInterface.addIndex('property_inquiries', ['session_id'], {
      name: 'idx_property_inquiries_session_id',
    });

    await queryInterface.addIndex('property_inquiries', ['status'], {
      name: 'idx_property_inquiries_status',
    });

    await queryInterface.addIndex('property_inquiries', ['status', 'notified_buyer'], {
      name: 'idx_property_inquiries_status_notified',
    });

    await queryInterface.addIndex('property_inquiries', ['created_at'], {
      name: 'idx_property_inquiries_created_at',
    });

    await queryInterface.addIndex('property_inquiries', ['expires_at'], {
      name: 'idx_property_inquiries_expires_at',
    });

    console.log('Created property_inquiries table with indexes');
  },

  async down(queryInterface) {
    // Drop table (this will also drop indexes)
    await queryInterface.dropTable('property_inquiries');

    // Drop enum types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS inquiry_status CASCADE;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS inquiry_priority CASCADE;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS inquiry_category CASCADE;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS answered_by_role CASCADE;');

    console.log('Dropped property_inquiries table and enum types');
  },
};
