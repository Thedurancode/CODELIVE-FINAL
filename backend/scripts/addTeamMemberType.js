/**
 * Add team_member to contact type enums
 */

require('dotenv').config();

async function addTeamMemberType() {
  try {
    const { default: sequelize } = require('../dist/config/database.js');

    console.log('📝 Adding team_member to contact type enums...');

    // Add to contacts type enum
    await sequelize.query(`
      ALTER TYPE contact_type ADD VALUE IF NOT EXISTS 'team_member';
    `);
    console.log('✅ Added team_member to contact_type enum');

    // Add to property_contacts role enum
    await sequelize.query(`
      ALTER TYPE enum_property_contacts_role ADD VALUE IF NOT EXISTS 'team_member';
    `);
    console.log('✅ Added team_member to enum_property_contacts_role enum');

    console.log('🎉 Successfully added team_member type!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addTeamMemberType();
