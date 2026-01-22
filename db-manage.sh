#!/bin/bash

# Database management script for Dispotree
set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Default values
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-dispotree_db}
DB_USER=${DB_USER:-dispotree_user}
DB_PASSWORD=${DB_PASSWORD:-your_password}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Show usage
show_usage() {
    echo "Dispotree Database Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  connect       Connect to the database using psql"
    echo "  reset         Reset the database (WARNING: This deletes all data!)"
    echo "  migrate       Run database migrations"
    echo "  seed          Insert sample data"
    echo "  backup        Create a database backup"
    echo "  restore FILE  Restore a database from backup file"
    echo "  status        Show database status"
    echo ""
    echo "Examples:"
    echo "  $0 connect"
    echo "  $0 backup > backup.sql"
    echo "  $0 restore backup.sql"
}

# Connect to database
connect_db() {
    echo "🔌 Connecting to database..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME
}

# Reset database
reset_db() {
    echo "🔄 Resetting database..."
    echo -e "${RED}WARNING: This will delete all data in the database!${NC}"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Drop and recreate database
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;"
        print_success "Database reset successfully"

        # Run migrations
        migrate_db
    else
        echo "Database reset cancelled"
    fi
}

# Run migrations
migrate_db() {
    echo "📋 Running migrations..."

    # Run each migration file in order
    for file in database/migrations/*.sql; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")
            echo "Running migration: $filename"
            PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$file"
            print_success "Migration $filename completed"
        fi
    done

    print_success "All migrations completed"
}

# Seed database with sample data
seed_db() {
    echo "🌱 Seeding database with sample data..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f database/migrations/003-sample-data.sql
    print_success "Database seeded successfully"
}

# Backup database
backup_db() {
    echo "💾 Creating database backup..."
    backup_file="dispotree_backup_$(date +%Y%m%d_%H%M%S).sql"
    PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME > $backup_file
    print_success "Backup created: $backup_file"
}

# Restore database
restore_db() {
    local backup_file=$1
    if [ -z "$backup_file" ]; then
        print_error "Please specify a backup file"
        echo "Usage: $0 restore BACKUP_FILE"
        exit 1
    fi

    if [ ! -f "$backup_file" ]; then
        print_error "Backup file not found: $backup_file"
        exit 1
    fi

    echo "🔄 Restoring database from $backup_file..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < $backup_file
    print_success "Database restored successfully"
}

# Show database status
show_status() {
    echo "📊 Database Status:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Check connection
    if PGPASSWORD=$DB_PASSWORD pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME > /dev/null 2>&1; then
        print_success "Database connection: OK"
    else
        print_error "Database connection: FAILED"
        exit 1
    fi

    # Show tables
    echo ""
    echo "Tables:"
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\dt" -x | grep -E "(Name|Rows)"

    # Show property count
    echo ""
    property_count=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM properties;")
    echo "Properties in database: $property_count"

    # Show user count
    user_count=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM users;")
    echo "Users in database: $user_count"
}

# Main script logic
case "${1:-}" in
    connect)
        connect_db
        ;;
    reset)
        reset_db
        ;;
    migrate)
        migrate_db
        ;;
    seed)
        seed_db
        ;;
    backup)
        backup_db
        ;;
    restore)
        restore_db "$2"
        ;;
    status)
        show_status
        ;;
    *)
        show_usage
        ;;
esac