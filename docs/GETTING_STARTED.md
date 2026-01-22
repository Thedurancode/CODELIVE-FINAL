# Getting Started with Dispotree

Welcome to Dispotree! This guide will help you get your development environment set up quickly.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (5 minutes)](#quick-start-5-minutes)
3. [Project Structure](#project-structure)
4. [Running the Application](#running-the-application)
5. [Running Tests](#running-tests)
6. [Development Workflow](#development-workflow)
7. [Common Tasks](#common-tasks)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Docker Desktop** ([Download](https://www.docker.com/products/docker-desktop/))
- **Git** ([Download](https://git-scm.com/))
- **VS Code** (recommended) ([Download](https://code.visualstudio.com/))

### Recommended VS Code Extensions

Install these extensions for the best development experience:

- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)
- TypeScript (`ms-vscode.vscode-typescript-next`)
- Tailwind CSS IntelliSense (`bradlc.vscode-tailwindcss`)

---

## Quick Start (5 minutes)

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/Dispotree.git
cd Dispotree
```

### 2. Set Up Environment Variables

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend (if needed)
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env` with your configuration. At minimum, you'll need:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dispotree

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key-change-this-in-production

# OpenAI (for AI features)
OPENAI_API_KEY=your-openai-api-key
```

### 3. Start Infrastructure with Docker

```bash
# Start PostgreSQL and Redis
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379

### 4. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 5. Run Database Migrations

```bash
cd backend
npm run migrate
```

### 6. Start the Development Servers

Open two terminal windows:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### 7. Open the Application

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **API Documentation:** http://localhost:3001/api-docs

---

## Project Structure

```
Dispotree/
├── backend/                 # Express.js API server
│   ├── src/
│   │   ├── controllers/     # Route handlers
│   │   ├── models/          # Sequelize models
│   │   ├── services/        # Business logic
│   │   ├── routes/          # API route definitions
│   │   ├── middleware/      # Express middleware
│   │   ├── plugins/         # Deal source plugins
│   │   ├── utils/           # Utility functions
│   │   ├── errors/          # Custom error classes
│   │   └── tests/           # Test files
│   ├── migrations/          # Database migrations
│   └── seeds/               # Seed data
│
├── frontend/                # Next.js application
│   ├── src/
│   │   ├── app/             # App router pages
│   │   ├── components/      # React components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── stores/          # State management
│   │   └── lib/             # Utilities
│
├── docs/                    # Documentation
└── docker-compose.yaml      # Infrastructure setup
```

---

## Running the Application

### Development Mode

```bash
# Backend with hot reload
cd backend && npm run dev

# Frontend with hot reload
cd frontend && npm run dev
```

### Production Mode

```bash
# Build and start backend
cd backend
npm run build
npm start

# Build and start frontend
cd frontend
npm run build
npm start
```

---

## Running Tests

### Backend Tests

```bash
cd backend

# Run all tests with coverage
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Watch mode for TDD
npm run test:watch
```

### Frontend Tests

```bash
cd frontend

# Run tests
npm test

# Watch mode
npm run test:watch
```

---

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

- Write code following existing patterns
- Add tests for new functionality
- Update documentation if needed

### 3. Pre-commit Checks

When you commit, the following checks run automatically:
- ESLint (code style)
- Prettier (formatting)
- TypeScript type checking
- Related unit tests

### 4. Submit a Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a PR on GitHub with:
- Clear description of changes
- Related issue numbers
- Screenshots (if UI changes)

---

## Common Tasks

### Adding a New API Endpoint

1. **Create/update the route** in `backend/src/routes/`
2. **Add controller logic** in `backend/src/controllers/`
3. **Add service logic** in `backend/src/services/`
4. **Add validation** using Zod schemas in the route
5. **Add tests** in `backend/src/tests/`

### Adding a New Model

1. Create migration: `npx sequelize-cli migration:generate --name add-your-model`
2. Define model in `backend/src/models/`
3. Add associations in `backend/src/models/index.ts`
4. Run migration: `npm run migrate`

### Adding a New Frontend Page

1. Create page in `frontend/src/app/your-page/page.tsx`
2. Add components in `frontend/src/components/`
3. Add API calls using hooks

### Using the Logger

```typescript
import { logger } from '../services/LoggerService';

// Log levels: debug, info, warn, error, fatal
logger.info('Operation completed', { userId: user.id, action: 'create' });
logger.error('Operation failed', { userId: user.id }, error);

// Create a child logger with preset context
const serviceLogger = logger.child({ service: 'PaymentService' });
serviceLogger.info('Payment processed', { amount: 100 });
```

### Handling Errors

```typescript
import { NotFoundError, ValidationError } from '../errors';

// Throw typed errors
if (!user) {
  throw new NotFoundError('User', userId);
}

if (!isValid) {
  throw new ValidationError('Invalid email format', 'email');
}
```

### Using Validation

```typescript
import { z } from 'zod';
import { validateBody, commonSchemas } from '../middleware/validation';

const createUserSchema = z.object({
  email: commonSchemas.email,
  name: z.string().min(2).max(100),
});

router.post('/users', validateBody(createUserSchema), async (req, res) => {
  const validated = req.validated!.body;
  // validated is typed and safe to use
});
```

---

## Troubleshooting

### Database Connection Failed

```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart PostgreSQL
docker-compose restart postgres

# Check logs
docker-compose logs postgres
```

### Redis Connection Failed

```bash
# Check if Redis is running
docker-compose ps

# Restart Redis
docker-compose restart redis
```

### Port Already in Use

```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>
```

### Missing Environment Variables

Check that all required variables are set in your `.env` file. The backend will log warnings for missing optional services (like Stripe, DocuSeal, etc.).

### TypeScript Errors After Pulling Changes

```bash
# Reinstall dependencies
npm ci

# Clean and rebuild
rm -rf dist
npm run build
```

---

## Health Check Endpoints

Monitor your application health:

- **Basic health:** `GET /api/health`
- **Liveness probe:** `GET /api/health/live`
- **Readiness probe:** `GET /api/health/ready`
- **Detailed status:** `GET /api/health/detailed`

---

## Additional Resources

- [API Documentation](http://localhost:3001/api-docs) - Swagger UI
- [CLAUDE.md](../CLAUDE.md) - AI assistant guidelines
- [IMPROVEMENT_RECOMMENDATIONS.md](./IMPROVEMENT_RECOMMENDATIONS.md) - Code improvement guide

---

## Getting Help

- Check existing documentation in the `/docs` folder
- Review code comments and inline documentation
- Ask questions in the team Slack channel
- Open a GitHub issue for bugs or feature requests

Happy coding! 🚀
