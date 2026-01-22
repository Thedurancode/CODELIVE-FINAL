# Dispotree API Documentation

This directory contains automatically generated API documentation for the Dispotree Property Management System.

## 📖 Accessing Documentation

### Interactive Swagger UI
When the server is running, visit:
- **Development**: http://localhost:3001/api-docs
- **Production**: https://api.dispotree.com/api-docs

### Raw Documentation Files
- [OpenAPI JSON](./openapi.json) - Machine-readable API specification
- [OpenAPI YAML](./openapi.yaml) - Human-readable API specification

## 🔄 Auto-Generation

The API documentation is automatically generated:

1. **On Build**: Every time you run `npm run build`, documentation is generated
2. **Before Commit**: Pre-commit hooks ensure docs are always up-to-date
3. **On Server Start**: Documentation is available at `/api-docs` endpoint

## 📝 Adding Documentation

### Route Documentation
Add JSDoc comments to your route handlers:

```typescript
/**
 * @swagger
 * /api/listings:
 *   get:
 *     summary: Get all properties
 *     tags: [Properties]
 *     responses:
 *       200:
 *         description: List of properties
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Property'
 */
app.get('/api/listings', async (req, res) => {
  // Your code here
});
```

### Schema Documentation
Schemas are automatically documented in `swagger.ts`. Add new schemas to the `components.schemas` section.

### Tags
Use tags to organize endpoints:
- `[Properties]` - Property CRUD operations
- `[Xome]` - Xome integration endpoints
- `[HedgeFunds]` - Hedge fund related endpoints
- `[Health]` - Health check endpoints

## 🛠 Development Commands

```bash
# Generate documentation only
npm run docs:generate

# Start server with documentation
npm run docs:serve

# Build project (includes docs generation)
npm run build
```

## 📚 Documentation Structure

```
docs/
├── API-DOCUMENTATION.md  # This file
├── openapi.json          # OpenAPI 3.0 specification (JSON)
└── openapi.yaml          # OpenAPI 3.0 specification (YAML)
```

## 🚀 Production Deployment

In production, documentation is automatically available at `/api-docs`. Ensure:

1. Environment variable `NODE_ENV=production` is set
2. The production server URL is correctly configured in `swagger.ts`

## 🤖 Automated Updates

- Pre-commit hooks ensure documentation is always up-to-date
- CI/CD pipelines can generate and publish documentation
- The `/api-docs.json` endpoint provides programmatic access to the latest spec

## 🔧 Customization

To customize the documentation:

1. Edit `backend/src/config/swagger.ts` for global settings
2. Add JSDoc comments to controllers for endpoint documentation
3. Update schemas in the `components.schemas` section

## 📋 Best Practices

1. Document all public endpoints
2. Include example requests/responses
3. Use meaningful descriptions
4. Group related endpoints with tags
5. Keep schemas updated with your data models