'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add 'team_member' to the contact type enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "contact_type" ADD VALUE IF NOT EXISTS 'team_member';
    `);

    // Also add to property_contacts role enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_property_contacts_role" ADD VALUE IF NOT EXISTS 'team_member';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Note: PostgreSQL doesn't support removing enum values directly
    // You would need to recreate the enum or migrate existing data
    console.log('Warning: Cannot remove enum value "team_member" without recreating the enum type');
  }
};
