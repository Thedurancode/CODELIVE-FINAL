#!/bin/bash

echo "🚀 Starting Dispotree Application..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration before running again"
    exit 1
fi

# Start Docker Compose
echo "🐳 Starting Docker containers..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
echo "🔍 Checking service status..."
docker-compose ps

# Display access URLs
echo ""
echo "✅ Services are ready!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 Frontend:      http://localhost:3000"
echo "🔧 Backend API:   http://localhost:3001"
echo "🗄️  Database:      PostgreSQL on port 5432"
echo "🔍 DB Admin:       http://localhost:8080"
echo "💚 Health Check:   http://localhost:3001/api/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop:      docker-compose down"