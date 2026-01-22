#!/bin/bash

# Database initialization script
set -e

echo "🗄️ Initializing Dispotree Database..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
while ! pg_isready -h postgres -p 5432 -U "$DB_USER" -d "$DB_NAME"; do
    echo "Waiting for postgres..."
    sleep 1
done

echo "✅ PostgreSQL is ready!"

# Run migrations
echo "📋 Running database migrations..."

# Create properties table
echo "Creating properties table..."
psql -v ON_ERROR_STOP=1 --host "$DB_HOST" --port "$DB_PORT" --username "$DB_USER" --dbname "$DB_NAME" <<-EOSQL
    \i /docker-entrypoint-initdb.d/migrations/001-create-properties-table.sql
EOSQL

# Create users table
echo "Creating users table..."
psql -v ON_ERROR_STOP=1 --host "$DB_HOST" --port "$DB_PORT" --username "$DB_USER" --dbname "$DB_NAME" <<-EOSQL
    \i /docker-entrypoint-initdb.d/migrations/002-create-users-table.sql
EOSQL

# Insert sample data (only in development)
if [ "$NODE_ENV" = "development" ]; then
    echo "📝 Inserting sample data..."
    psql -v ON_ERROR_STOP=1 --host "$DB_HOST" --port "$DB_PORT" --username "$DB_USER" --dbname "$DB_NAME" <<-EOSQL
        \i /docker-entrypoint-initdb.d/migrations/003-sample-data.sql
EOSQL
fi

echo "✅ Database initialization complete!"