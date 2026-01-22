#!/bin/bash

echo "=== Dispotree API Test Script ==="
echo ""

# Check if we can build the TypeScript code
echo "1. Building TypeScript..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ TypeScript build successful"
else
    echo "❌ TypeScript build failed"
    exit 1
fi

echo ""
echo "2. Testing basic API functionality without database..."

# Create a simple test without database connection
cat > test-db-connection.js << 'EOF'
const { Sequelize } = require('sequelize');

// Test basic functionality without connecting to database
console.log('Testing Sequelize installation...');
console.log('Sequelize version:', require('sequelize/package.json').version);

// Test other dependencies
console.log('Testing other dependencies...');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const joi = require('joi');

console.log('✅ Express version:', require('express/package.json').version);
console.log('✅ All dependencies loaded successfully');

console.log('\nAPI setup is ready!');
console.log('To run with database, ensure:');
console.log('1. PostgreSQL is running');
console.log('2. Database "dispotree_db" exists');
console.log('3. User "dispotree_user" exists with proper permissions');
console.log('4. Update DB_PASSWORD in .env file');
console.log('5. Run: npm run dev');
EOF

node test-db-connection.js

# Clean up
rm test-db-connection.js

echo ""
echo "3. Checking if we can start the API (dry run)..."

# Check the TypeScript configuration
echo "TypeScript configuration:"
npx tsc --noEmit

if [ $? -eq 0 ]; then
    echo "✅ TypeScript configuration is valid"
else
    echo "❌ TypeScript configuration has errors"
fi

echo ""
echo "=== API Test Complete ==="
echo ""
echo "Next steps to run the API:"
echo "1. Create database: createdb dispotree_db"
echo "2. Create user: CREATE USER dispotree_user WITH PASSWORD 'your_password';"
echo "3. Grant permissions: GRANT ALL PRIVILEGES ON DATABASE dispotree_db TO dispotree_user;"
echo "4. Update .env with actual database password"
echo "5. Run migrations: npm run migrate"
echo "6. Start API: npm run dev"