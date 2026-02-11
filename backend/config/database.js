require('dotenv').config();

// Build connection parameters from environment
const getDbConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  // If DATABASE_URL is provided, parse it
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    // Supabase pooler requires SSL
    const isSupabase = url.hostname.includes('supabase');
    return {
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      host: url.hostname,
      port: url.port || 5432,
      dialect: 'postgres',
      dialectOptions: (isProduction || isSupabase) ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
        connectTimeout: 30000,
      } : undefined,
      retry: {
        max: 3,
        backoffBase: 3000,
        backoffExponent: 1.5,
      },
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
