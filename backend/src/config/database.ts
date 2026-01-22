import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// =============================================================================
// DATABASE CONFIGURATION
// =============================================================================

const isProduction = process.env.NODE_ENV === 'production';

// SECURITY: Require database credentials in production
if (isProduction) {
  if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
    console.error('╔════════════════════════════════════════════════════════════════╗');
    console.error('║  FATAL: Database credentials required in production            ║');
    console.error('║  Set DATABASE_URL or individual DB_* environment variables     ║');
    console.error('╚════════════════════════════════════════════════════════════════╝');
    process.exit(1);
  }
}

// Build connection URL - never use hardcoded defaults in production
let connectionUrl: string;

if (process.env.DATABASE_URL) {
  connectionUrl = process.env.DATABASE_URL;
} else if (isProduction) {
  // In production, require all params
  const requiredVars = ['DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_NAME'];
  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required database variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  connectionUrl = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;
} else {
  // Development only - use defaults with warning
  console.warn('⚠️  Using default database credentials - for development only');
  connectionUrl = `postgresql://${process.env.DB_USER || 'dispotree_user'}:${process.env.DB_PASSWORD || 'dev_password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'dispotree_db'}`;
}

// SSL configuration
const sslConfig = isProduction
  ? {
      ssl: {
        require: true,
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      },
    }
  : {
      ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : false,
    };

const sequelize = new Sequelize(connectionUrl, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: sslConfig,
});

export default sequelize;
