'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create call_direction enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE call_direction AS ENUM ('inbound', 'outbound');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. Create call_status enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE call_status AS ENUM (
          'initiated',
          'ringing',
          'in-progress',
          'completed',
          'busy',
          'no-answer',
          'failed',
          'canceled'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 3. Create call_event_type enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE call_event_type AS ENUM (
          'transcript',
          'tool_call',
          'tool_result',
          'error',
          'state',
          'audio',
          'dtmf'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 4. Create calls table
    await queryInterface.createTable('calls', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      call_sid: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
        comment: 'Twilio Call SID',
      },
      direction: {
        type: Sequelize.ENUM('inbound', 'outbound'),
        allowNull: false,
      },
      from_number: {
        type: Sequelize.STRING,
        allowNull: false,
        field: 'from_number',
        comment: 'Caller phone number',
      },
      to_number: {
        type: Sequelize.STRING,
        allowNull: false,
        field: 'to_number',
        comment: 'Recipient phone number',
      },
      deal_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'properties',
          key: 'id',
        },
        onDelete: 'SET NULL',
        comment: 'Associated deal/property',
      },
      contact_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'contacts',
          key: 'id',
        },
        onDelete: 'SET NULL',
        comment: 'Associated contact',
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id',
        },
        onDelete: 'CASCADE',
        comment: 'Organization that owns this call',
      },
      initiated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        comment: 'User who initiated the call (for outbound)',
      },
      agent_profile: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'sales',
        comment: 'AI agent profile: sales, support, collections',
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the call was answered',
      },
      ended_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the call ended',
      },
      duration_sec: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Call duration in seconds',
      },
      recording_url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'URL to call recording',
      },
      recording_sid: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Twilio Recording SID',
      },
      status: {
        type: Sequelize.ENUM(
          'initiated',
          'ringing',
          'in-progress',
          'completed',
          'busy',
          'no-answer',
          'failed',
          'canceled'
        ),
        allowNull: false,
        defaultValue: 'initiated',
      },
      summary: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'AI-generated call summary',
      },
      outcome: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Call outcome: no_answer, left_voicemail, follow_up, hot_lead, not_interested, wrong_number, resolved, escalate',
      },
      sentiment: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true,
        comment: 'Sentiment score 0.00 to 1.00',
      },
      extracted: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Extracted data: name, intent, next_step, callback_time, objections, budget',
      },
      action_items: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Action items from the call',
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional metadata',
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    // 5. Create call_events table
    await queryInterface.createTable('call_events', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      call_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'calls',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      ts: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: 'Event timestamp',
      },
      type: {
        type: Sequelize.ENUM(
          'transcript',
          'tool_call',
          'tool_result',
          'error',
          'state',
          'audio',
          'dtmf'
        ),
        allowNull: false,
      },
      speaker: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Who spoke: user, assistant, system',
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Event payload data',
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    // 6. Add indexes
    // calls table indexes
    await queryInterface.addIndex('calls', ['call_sid'], {
      unique: true,
      name: 'calls_call_sid_unique',
      where: { call_sid: { [Sequelize.Op.ne]: null } },
    });
    await queryInterface.addIndex('calls', ['deal_id'], { name: 'calls_deal_id' });
    await queryInterface.addIndex('calls', ['contact_id'], { name: 'calls_contact_id' });
    await queryInterface.addIndex('calls', ['organization_id'], { name: 'calls_organization_id' });
    await queryInterface.addIndex('calls', ['status'], { name: 'calls_status' });
    await queryInterface.addIndex('calls', ['direction'], { name: 'calls_direction' });
    await queryInterface.addIndex('calls', ['created_at'], { name: 'calls_created_at' });
    await queryInterface.addIndex('calls', ['organization_id', 'created_at'], { name: 'calls_org_created' });

    // call_events table indexes
    await queryInterface.addIndex('call_events', ['call_id'], { name: 'call_events_call_id' });
    await queryInterface.addIndex('call_events', ['call_id', 'ts'], { name: 'call_events_call_id_ts' });
    await queryInterface.addIndex('call_events', ['type'], { name: 'call_events_type' });

    console.log('✅ Voice calling tables (calls, call_events) created successfully');
  },

  async down(queryInterface, Sequelize) {
    // Drop indexes first
    await queryInterface.removeIndex('call_events', 'call_events_call_id');
    await queryInterface.removeIndex('call_events', 'call_events_call_id_ts');
    await queryInterface.removeIndex('call_events', 'call_events_type');

    await queryInterface.removeIndex('calls', 'calls_call_sid_unique');
    await queryInterface.removeIndex('calls', 'calls_deal_id');
    await queryInterface.removeIndex('calls', 'calls_contact_id');
    await queryInterface.removeIndex('calls', 'calls_organization_id');
    await queryInterface.removeIndex('calls', 'calls_status');
    await queryInterface.removeIndex('calls', 'calls_direction');
    await queryInterface.removeIndex('calls', 'calls_created_at');
    await queryInterface.removeIndex('calls', 'calls_org_created');

    // Drop tables
    await queryInterface.dropTable('call_events');
    await queryInterface.dropTable('calls');

    // Drop enums
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS call_event_type;`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS call_status;`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS call_direction;`);

    console.log('✅ Voice calling tables dropped successfully');
  },
};
