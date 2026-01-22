-- Create additional database extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create indexes for better performance (will be created by Sequelize but can be optimized here)
-- These are optional as Sequelize handles most indexing automatically