'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'compliance_webhooks'
      );
    `);

    if (tableExists[0][0].exists) {
      console.log('compliance_webhooks table already exists, skipping...');
      return;
    }

    // Create compliance_webhooks table
    await queryInterface.createTable('compliance_webhooks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Human-readable webhook name',
      },
      webhook_url: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'URL to send notifications to',
      },
      events: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '[]',
        comment: 'Array of event types to subscribe to',
      },
      secret: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Secret for signing webhook payloads',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      last_triggered_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      failure_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
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

    await queryInterface.addIndex('compliance_webhooks', ['is_active'], {
      name: 'idx_compliance_webhooks_active',
    });

    console.log('Created compliance_webhooks table');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('compliance_webhooks');
  },
};
