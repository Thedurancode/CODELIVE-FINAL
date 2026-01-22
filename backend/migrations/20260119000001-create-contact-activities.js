'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create enum types first
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_contact_activities_type" AS ENUM('call', 'email', 'sms', 'note', 'meeting', 'task', 'voicemail');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_contact_activities_direction" AS ENUM('inbound', 'outbound', 'internal');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_contact_activities_status" AS ENUM('pending', 'in_progress', 'completed', 'failed', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.createTable('contact_activities', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      contactId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'contacts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      organizationId: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      type: {
        type: Sequelize.ENUM('call', 'email', 'sms', 'note', 'meeting', 'task', 'voicemail'),
        allowNull: false,
      },
      direction: {
        type: Sequelize.ENUM('inbound', 'outbound', 'internal'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('pending', 'in_progress', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'completed',
      },
      subject: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      summary: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Call fields
      callSid: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      callDuration: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      callRecordingUrl: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      callTranscript: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      callOutcome: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // Email fields
      emailMessageId: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      emailFrom: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      emailTo: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
      },
      emailCc: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
      },
      emailBcc: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
      },
      // SMS fields
      smsSid: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      smsFrom: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      smsTo: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // Related entities
      dealId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      propertyId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      // Timestamps
      scheduledAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      startedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      completedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      // AI analysis
      aiSummary: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      aiSentiment: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      aiNextAction: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Metadata
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Add indexes
    await queryInterface.addIndex('contact_activities', ['contactId']);
    await queryInterface.addIndex('contact_activities', ['type']);
    await queryInterface.addIndex('contact_activities', ['direction']);
    await queryInterface.addIndex('contact_activities', ['status']);
    await queryInterface.addIndex('contact_activities', ['userId']);
    await queryInterface.addIndex('contact_activities', ['organizationId']);
    await queryInterface.addIndex('contact_activities', ['dealId']);
    await queryInterface.addIndex('contact_activities', ['propertyId']);
    await queryInterface.addIndex('contact_activities', ['createdAt']);
    await queryInterface.addIndex('contact_activities', ['contactId', 'type']);
    await queryInterface.addIndex('contact_activities', ['contactId', 'createdAt']);
    await queryInterface.addIndex('contact_activities', ['emailMessageId']);
    await queryInterface.addIndex('contact_activities', ['smsSid']);

    // Unique index for callSid where not null
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX "contact_activities_callSid_unique"
      ON "contact_activities" ("callSid")
      WHERE "callSid" IS NOT NULL;
    `);

    console.log('✅ Contact activities table created successfully');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('contact_activities');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_contact_activities_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_contact_activities_direction";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_contact_activities_status";');
  },
};
