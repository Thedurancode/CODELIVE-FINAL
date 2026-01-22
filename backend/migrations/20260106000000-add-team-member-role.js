'use strict';

/**
 * Migration: Add team_member role to marketplace_users
 *
 * Adds the 'team_member' value to the role enum for MarketplaceUser.
 * team_member is a mini super_admin role that can chat and see all conversations.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add team_member to the enum_marketplace_users_role enum
    // PostgreSQL requires ALTER TYPE to add new enum values
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        -- Check if the enum value already exists
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'team_member'
          AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'enum_marketplace_users_role'
          )
        ) THEN
          -- Add the new enum value
          ALTER TYPE "enum_marketplace_users_role" ADD VALUE 'team_member';
        END IF;
      END
      $$;
    `);

    console.log('Added team_member role to marketplace_users enum');
  },

  async down(queryInterface, Sequelize) {
    // Note: PostgreSQL doesn't support removing enum values directly
    // To fully revert, you would need to:
    // 1. Create a new enum without the value
    // 2. Update all rows using that value
    // 3. Drop the old enum and rename the new one
    // For safety, we'll just log a warning
    console.log('Warning: Cannot remove enum value team_member. Manual intervention required if needed.');
  }
};
