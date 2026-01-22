'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'enum_compliance_alerts_type'
            AND e.enumlabel = 'configuration'
        ) THEN
          ALTER TYPE "enum_compliance_alerts_type" ADD VALUE 'configuration';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'enum_compliance_alerts_type'
            AND e.enumlabel = 'api_failure'
        ) THEN
          ALTER TYPE "enum_compliance_alerts_type" ADD VALUE 'api_failure';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'enum_compliance_alerts_type'
            AND e.enumlabel = 'fraud_detection'
        ) THEN
          ALTER TYPE "enum_compliance_alerts_type" ADD VALUE 'fraud_detection';
        END IF;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'enum_compliance_alerts_severity'
            AND e.enumlabel = 'high'
        ) THEN
          ALTER TYPE "enum_compliance_alerts_severity" ADD VALUE 'high';
        END IF;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'enum_compliance_alerts_resourceType'
            AND e.enumlabel = 'system'
        ) THEN
          ALTER TYPE "enum_compliance_alerts_resourceType" ADD VALUE 'system';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'enum_compliance_alerts_resourceType'
            AND e.enumlabel = 'screening'
        ) THEN
          ALTER TYPE "enum_compliance_alerts_resourceType" ADD VALUE 'screening';
        END IF;
      END $$;
    `);
  },

  async down() {
    // Enum value removals are not supported safely in Postgres without rebuilding the type.
  },
};
