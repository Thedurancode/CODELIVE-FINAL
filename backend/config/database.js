require('dotenv').config();

// Build connection parameters from environment
// Matches src/config/database.ts as closely as possible
const getDbConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  // If DATABASE_URL is provided, pass it as a connection string (preserves query params like sslmode)
  if (process.env.DATABASE_URL) {
    return {
      use_env_variable: 'DATABASE_URL',
      dialect: 'postgres',
      dialectOptions: isProduction ? {
        ssl: {
          require: true,
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
        },
      } : undefined,
    };
  }

  // Otherwise use individual env vars
  return {
    username: process.env.DB_USER || 'dispotree_user',
    password: process.env.DB_PASSWORD || 'dev_password',
    database: process.env.DB_NAME || 'dispotree_db',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    dialectOptions: isProduction ? {
      ssl: {
        require: true,
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      },
    } : undefined,
  };
};

const config = getDbConfig();

module.exports = {
  development: config,
  test: config,
  production: config,
};
