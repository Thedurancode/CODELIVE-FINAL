'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create ENUM type for status
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE project_client_status AS ENUM ('pending', 'active', 'revoked');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.createTable('project_clients', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      client_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        comment: 'Linked MarketplaceUser with client role (null until accepted)',
      },
      invite_token: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
        comment: 'Unique token for invite link',
      },
      invited_by_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      invited_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      accepted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('pending', 'active', 'revoked'),
        allowNull: false,
        defaultValue: 'pending',
      },
      client_email: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Email the invite was intended for',
      },
      client_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Optional expiration for the invite',
      },
      last_accessed_at: {
        type: Sequelize.DATE,
        allowNull: true,
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

    // Add indexes
    await queryInterface.addIndex('project_clients', ['project_id']);
    await queryInterface.addIndex('project_clients', ['client_user_id']);
    await queryInterface.addIndex('project_clients', ['invite_token'], { unique: true });
    await queryInterface.addIndex('project_clients', ['invited_by_user_id']);
    await queryInterface.addIndex('project_clients', ['status']);
    await queryInterface.addIndex('project_clients', ['project_id', 'client_user_id'], {
      unique: true,
      where: { client_user_id: { [Sequelize.Op.ne]: null } }
    });
    await queryInterface.addIndex('project_clients', ['expires_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('project_clients');
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS project_client_status;`);
  },
};
