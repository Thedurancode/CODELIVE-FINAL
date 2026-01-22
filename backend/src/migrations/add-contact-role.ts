/**
 * Migration: Add 'role' column to contacts table
 * Run with: npx ts-node src/migrations/add-contact-role.ts
 */

import sequelize from '../config/database';

async function addContactRoleColumn() {
  try {
    console.log('🔧 Adding role column to contacts table...');

    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Check if column already exists
    const [results] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'contacts'
      AND column_name = 'role'
    `);

    if (results.length > 0) {
      console.log('⏭️  Column "role" already exists, skipping');
      await sequelize.close();
      process.exit(0);
    }

    // Add the role column
    await sequelize.query(`
      ALTER TABLE contacts
      ADD COLUMN role VARCHAR(255) NULL
    `);

    // Add comment
    await sequelize.query(`
      COMMENT ON COLUMN contacts.role IS 'Specific role (e.g., Seller Attorney, Buyer RE Agent)'
    `);

    console.log('✅ Successfully added role column to contacts table');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addContactRoleColumn();
