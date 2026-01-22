'use strict';

/**
 * Migration: Add deliveredTo field to team_messages
 *
 * This enables true delivery confirmations where recipients confirm
 * they received the message via realtime, rather than marking as
 * 'delivered' immediately on save.
 *
 * The deliveredTo field tracks which users have received the message:
 * [{ userId: 'uuid', deliveredAt: '2024-01-09T10:00:00Z' }, ...]
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if column already exists
    const tableInfo = await queryInterface.describeTable('team_messages');

    if (!tableInfo.delivered_to) {
      // Add deliveredTo column (JSONB array of delivery receipts)
      await queryInterface.addColumn('team_messages', 'delivered_to', {
        type: Sequelize.JSONB,
        defaultValue: [],
        allowNull: false,
        comment: 'Array of { userId, deliveredAt } tracking delivery confirmations',
      });
    }

    // Add index for querying undelivered messages (if not exists)
    try {
      await queryInterface.addIndex('team_messages', ['deliveryStatus'], {
        name: 'idx_team_messages_delivery_status',
        where: {
          deliveryStatus: 'sent', // Index only undelivered messages
        },
      });
    } catch (error) {
      // Index may already exist
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }

    console.log('✅ Added delivered_to column to team_messages');
  },

  down: async (queryInterface, Sequelize) => {
    // Remove index first
    await queryInterface.removeIndex('team_messages', 'idx_team_messages_delivery_status');

    // Remove column
    await queryInterface.removeColumn('team_messages', 'delivered_to');

    console.log('✅ Removed delivered_to column from team_messages');
  },
};
