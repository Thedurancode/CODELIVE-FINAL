const fs = require('fs');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Dispotree API',
      version: '1.0.0',
      description: 'Dispotree Property Management System API Documentation',
      contact: {
        name: 'Dispotree Support',
        email: 'support@dispotree.com'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production'
          ? 'https://api.dispotree.com'
          : 'http://localhost:3001',
        description: process.env.NODE_ENV === 'production'
          ? 'Production server'
          : 'Development server'
      }
    ],
    components: {
      schemas: {
        Property: {
          type: 'object',
          required: ['houseNumber', 'street', 'city', 'state', 'zip'],
          properties: {
            id: { type: 'integer', description: 'Property ID' },
            houseNumber: { type: 'string', description: 'House number' },
            street: { type: 'string', description: 'Street name' },
            city: { type: 'string', description: 'City' },
            state: { type: 'string', description: 'State' },
            zip: { type: 'string', description: 'ZIP code' },
            propertyType: {
              type: 'string',
              enum: ['Single Family', 'Multi Family', 'Condo', 'Townhouse', 'Commercial']
            },
            bedroomCount: { type: 'integer', description: 'Number of bedrooms' },
            bathroomCount: { type: 'number', description: 'Number of bathrooms' },
            livingSpaceSqFt: { type: 'integer', description: 'Living space in square feet' },
            lotSizeSqFt: { type: 'integer', description: 'Lot size in square feet' },
            yearBuilt: { type: 'integer', description: 'Year built' },
            listingPrice: { type: 'number', description: 'Listing price' },
            arv: { type: 'number', description: 'After Repair Value' },
            rehabCost: { type: 'number', description: 'Estimated rehabilitation cost' },
            createdAt: { type: 'string', format: 'date-time', description: 'Date created' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Date updated' }
          }
        }
      }
    }
  },
  apis: ['./src/controllers/*.ts', './src/routes/*.ts', './src/index.ts'],
};

try {
  const specs = swaggerJsdoc(options);

  // Ensure docs directory exists
  const docsDir = path.join(__dirname, '../docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Save OpenAPI JSON spec
  fs.writeFileSync(
    path.join(docsDir, 'openapi.json'),
    JSON.stringify(specs, null, 2)
  );

  // Save as YAML for easier reading
  const yaml = require('js-yaml');
  fs.writeFileSync(
    path.join(docsDir, 'openapi.yaml'),
    yaml.dump(specs)
  );

  console.log('✅ API Documentation generated successfully!');
  console.log('📄 OpenAPI JSON: ./docs/openapi.json');
  console.log('📄 OpenAPI YAML: ./docs/openapi.yaml');
  console.log('🌐 Interactive docs: http://localhost:3001/api-docs');
} catch (error) {
  console.error('❌ Error generating documentation:', error);
  process.exit(1);
}