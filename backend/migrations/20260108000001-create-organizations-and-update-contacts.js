'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create organization_status enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE organization_status AS ENUM ('active', 'inactive', 'suspended');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. Create organization_plan enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE organization_plan AS ENUM ('free', 'starter', 'professional', 'enterprise');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 3. Create organizations table (if not exists)
    const tableExists = await queryInterface.sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'organizations'
      );
    `);

    if (!tableExists[0][0].exists) {
      await queryInterface.createTable('organizations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      logo: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      website: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      address: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      city: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      state: {
        type: Sequelize.STRING(2),
        allowNull: true,
      },
      zip: {
        type: Sequelize.STRING(10),
        allowNull: true,
      },
      country: {
        type: Sequelize.STRING(2),
        allowNull: false,
        defaultValue: 'US',
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
      },
      plan: {
        type: Sequelize.ENUM('free', 'starter', 'professional', 'enterprise'),
        allowNull: false,
        defaultValue: 'free',
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'marketplace_users',
          key: 'id',
        },
        onDelete: 'SET NULL',
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });
    } // End if (!tableExists)

    // 4. Add indexes to organizations (if not already created by unique: true constraint)
    try {
      await queryInterface.addIndex('organizations', ['status'], { name: 'organizations_status' });
    } catch (e) { /* index may already exist */ }
    try {
      await queryInterface.addIndex('organizations', ['owner_id'], { name: 'organizations_owner_id' });
    } catch (e) { /* index may already exist */ }
    try {
      await queryInterface.addIndex('organizations', ['plan'], { name: 'organizations_plan' });
    } catch (e) { /* index may already exist */ }

    // 5. Create a default organization for existing data (if not exists)
    let defaultOrgId;
    const existingDefault = await queryInterface.sequelize.query(`
      SELECT id FROM organizations WHERE slug = 'default' LIMIT 1;
    `);

    if (existingDefault[0] && existingDefault[0].length > 0) {
      defaultOrgId = existingDefault[0][0].id;
    } else {
      const [defaultOrg] = await queryInterface.sequelize.query(`
        INSERT INTO organizations (id, name, slug, status, plan, "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid(),
          'Default Organization',
          'default',
          'active',
          'professional',
          NOW(),
          NOW()
        )
        RETURNING id;
      `);
      defaultOrgId = defaultOrg[0]?.id;
    }

    // 6. Add organization_id to marketplace_users (if not exists)
    try {
      await queryInterface.addColumn('marketplace_users', 'organization_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id',
        },
        onDelete: 'SET NULL',
      });
    } catch (e) { /* column may already exist */ }

    // 7. Update existing users to belong to the default organization
    if (defaultOrgId) {
      await queryInterface.sequelize.query(`
        UPDATE marketplace_users
        SET organization_id = '${defaultOrgId}'
        WHERE organization_id IS NULL;
      `);

      // Set the first admin user as the owner of the default org
      await queryInterface.sequelize.query(`
        UPDATE organizations
        SET owner_id = (
          SELECT id FROM marketplace_users
          WHERE role IN ('admin', 'super_admin')
          ORDER BY "createdAt" ASC
          LIMIT 1
        )
        WHERE slug = 'default' AND owner_id IS NULL;
      `);
    }

    // 8. Add index on organization_id for marketplace_users
    try {
      await queryInterface.addIndex('marketplace_users', ['organization_id'], { name: 'marketplace_users_organization_id' });
    } catch (e) { /* index may already exist */ }

    // 9. Add organization_id to contacts (if not exists)
    try {
      await queryInterface.addColumn('contacts', 'organization_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id',
        },
        onDelete: 'CASCADE',
      });
    } catch (e) { /* column may already exist */ }

    // 10. Rename userId to created_by_id in contacts (if userId exists)
    const hasUserId = await queryInterface.sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'contacts' AND column_name = 'userId';
    `);
    if (hasUserId[0] && hasUserId[0].length > 0) {
      await queryInterface.renameColumn('contacts', 'userId', 'created_by_id');
    }

    // 11. Remove the CASCADE constraint and make it SET NULL
    await queryInterface.sequelize.query(`
      ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_userId_fkey;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE contacts DROP CONSTRAINT IF EXISTS "contacts_userId_fkey";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_created_by_id_fkey;
    `);

    // 12. Make created_by_id nullable and ensure it's UUID type
    const hasCreatedById = await queryInterface.sequelize.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'contacts' AND column_name = 'created_by_id';
    `);
    if (hasCreatedById[0] && hasCreatedById[0].length > 0) {
      // Check if it's already UUID type
      const colInfo = hasCreatedById[0][0];
      if (colInfo.data_type !== 'uuid') {
        // Column exists but not UUID - need to drop and recreate
        await queryInterface.sequelize.query(`
          ALTER TABLE contacts DROP COLUMN IF EXISTS created_by_id;
        `);
        await queryInterface.addColumn('contacts', 'created_by_id', {
          type: Sequelize.UUID,
          allowNull: true,
        });
      } else {
        // Just make it nullable
        await queryInterface.sequelize.query(`
          ALTER TABLE contacts ALTER COLUMN created_by_id DROP NOT NULL;
        `);
      }

      // 13. Add new foreign key with SET NULL (if not exists)
      await queryInterface.sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'contacts_created_by_id_fkey'
          ) THEN
            ALTER TABLE contacts
            ADD CONSTRAINT contacts_created_by_id_fkey
            FOREIGN KEY (created_by_id)
            REFERENCES marketplace_users(id)
            ON DELETE SET NULL;
          END IF;
        END $$;
      `);
    }

    // 14. Update existing contacts to belong to the default organization
    if (defaultOrgId) {
      await queryInterface.sequelize.query(`
        UPDATE contacts
        SET organization_id = '${defaultOrgId}'
        WHERE organization_id IS NULL;
      `);
    }

    // 15. Add indexes on organization_id for contacts
    try {
      await queryInterface.addIndex('contacts', ['organization_id'], { name: 'contacts_organization_id' });
    } catch (e) { /* index may already exist */ }
    try {
      await queryInterface.addIndex('contacts', ['organization_id', 'type'], { name: 'contacts_organization_id_type' });
    } catch (e) { /* index may already exist */ }
    try {
      await queryInterface.addIndex('contacts', ['organization_id', 'status'], { name: 'contacts_organization_id_status' });
    } catch (e) { /* index may already exist */ }

    console.log('✅ Organizations table created and contacts updated successfully');
  },

  async down(queryInterface, Sequelize) {
    // Reverse the migration

    // 1. Remove indexes
    await queryInterface.removeIndex('contacts', ['organization_id']);
    await queryInterface.removeIndex('contacts', ['organization_id', 'type']);
    await queryInterface.removeIndex('contacts', ['organization_id', 'status']);

    // 2. Remove foreign key constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE contacts
      DROP CONSTRAINT IF EXISTS contacts_created_by_id_fkey;
    `);

    // 3. Rename created_by_id back to userId
    await queryInterface.renameColumn('contacts', 'created_by_id', 'userId');

    // 4. Make userId required again and add CASCADE (UUID type for FK to marketplace_users)
    await queryInterface.changeColumn('contacts', 'userId', {
      type: Sequelize.UUID,
      allowNull: false,
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT "contacts_userId_fkey"
      FOREIGN KEY ("userId")
      REFERENCES marketplace_users(id)
      ON DELETE CASCADE;
    `);

    // 5. Remove organization_id from contacts
    await queryInterface.removeColumn('contacts', 'organization_id');

    // 6. Remove organization_id from marketplace_users
    await queryInterface.removeIndex('marketplace_users', ['organization_id']);
    await queryInterface.removeColumn('marketplace_users', 'organization_id');

    // 7. Drop organizations table
    await queryInterface.dropTable('organizations');

    // 8. Drop enums
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS organization_plan;
      DROP TYPE IF EXISTS organization_status;
    `);

    console.log('✅ Migration rolled back successfully');
  },
};
