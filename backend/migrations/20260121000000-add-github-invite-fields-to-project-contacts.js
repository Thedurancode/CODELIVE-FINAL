'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create enum type for github_invite_status
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_project_contacts_github_invite_status" AS ENUM('none', 'pending', 'accepted', 'declined', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add github_invite_status column
    await queryInterface.addColumn('project_contacts', 'github_invite_status', {
      type: Sequelize.ENUM('none', 'pending', 'accepted', 'declined', 'failed'),
      allowNull: false,
      defaultValue: 'none',
      comment: 'Status of GitHub repository invite',
    });

    // Add github_invite_id column
    await queryInterface.addColumn('project_contacts', 'github_invite_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'GitHub invitation ID for tracking',
    });

    // Add github_invited_at column
    await queryInterface.addColumn('project_contacts', 'github_invited_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When the GitHub invite was sent',
    });

    // Add github_invite_error column
    await queryInterface.addColumn('project_contacts', 'github_invite_error', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Error message if invite failed',
    });

    // Add index on github_invite_status for filtering
    await queryInterface.addIndex('project_contacts', ['github_invite_status'], {
      name: 'project_contacts_github_invite_status_idx',
    });

    console.log('✅ GitHub invite fields added to project_contacts table');
  },

  async down(queryInterface) {
    // Remove index
    await queryInterface.removeIndex('project_contacts', 'project_contacts_github_invite_status_idx');

    // Remove columns
    await queryInterface.removeColumn('project_contacts', 'github_invite_error');
    await queryInterface.removeColumn('project_contacts', 'github_invited_at');
    await queryInterface.removeColumn('project_contacts', 'github_invite_id');
    await queryInterface.removeColumn('project_contacts', 'github_invite_status');

    // Drop enum type
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_project_contacts_github_invite_status";');

    console.log('✅ GitHub invite fields removed from project_contacts table');
  },
};
