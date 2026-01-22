'use strict';

/**
 * Migration: Add linkedUserId field to contacts
 *
 * Links Contact records to MarketplaceUser accounts.
 * When a user signs up, a Contact is automatically created and linked.
 * This allows admins to see signups in their contacts list and promote them to team members.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add linkedUserId column
    await queryInterface.addColumn('contacts', 'linked_user_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      comment: 'Link to MarketplaceUser if this contact is a platform user',
    });

    // Add index for faster lookups
    await queryInterface.addIndex('contacts', ['linked_user_id'], {
      name: 'idx_contacts_linked_user_id',
    });

    console.log('Added linked_user_id column to contacts table');
  },

  async down(queryInterface, Sequelize) {
    // Remove index first
    await queryInterface.removeIndex('contacts', 'idx_contacts_linked_user_id');

    // Remove column
    await queryInterface.removeColumn('contacts', 'linked_user_id');

    console.log('Removed linked_user_id column from contacts table');
  }
};
