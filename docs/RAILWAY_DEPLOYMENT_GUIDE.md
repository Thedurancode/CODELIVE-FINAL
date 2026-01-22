# Railway Deployment Guide for Dispotree

This guide documents the steps to deploy the Dispotree monorepo (Next.js frontend + Express.js backend) to Railway.

## Prerequisites

- Railway account with billing enabled
- GitHub repository connected to Railway
- Supabase project (for database and auth)

## Project Structure

```
Dispotree/
├── backend/          # Express.js API
│   ├── Dockerfile
│   ├── railway.toml
│   └── src/
├── frontend/         # Next.js app
│   ├── Dockerfile
│   ├── railway.toml
│   ├── .env.example
│   └── src/
└── start.sh          # Root script (NOT used for Railway)
```

---

## Step 1: Create Railway Services

1. Go to Railway Dashboard
2. Create a new project or use existing
3. Create two services connected to your GitHub repo:
   - `backend` service
   - `frontend` service

**Important:** Each service must have its **Root Directory** configured:
- Backend service → Root Directory: `backend`
- Frontend service → Root Directory: `frontend`

---

## Step 2: Backend Configuration

### backend/railway.toml
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

### backend/Dockerfile
```dockerfile
# Stage 1: Dependencies
FROM node:20-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# Stage 2: Builder
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --production

# Stage 3: Runner
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    # Playwright dependencies (if using browser automation)
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home dispotree

COPY --from=builder --chown=dispotree:nodejs /app/dist ./dist
COPY --from=builder --chown=dispotree:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=dispotree:nodejs /app/package*.json ./

RUN mkdir -p uploads knowledge logs \
    && chown -R dispotree:nodejs uploads knowledge logs

USER dispotree

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

### Backend Environment Variables (set in Railway Dashboard)

```
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=your_jwt_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key (optional)
DB_SSL_REJECT_UNAUTHORIZED=false  # Required for Supabase SSL
```

---

## Step 3: Frontend Configuration

### frontend/railway.toml
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

### frontend/Dockerfile
```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_KEY}

RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### frontend/.env.example (required for build)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your_google_maps_key
```

### frontend/next.config.ts (must have standalone output)
```typescript
const nextConfig: NextConfig = {
  output: 'standalone',  // Required for Docker deployment
  // ... other config
};
```

### Frontend Environment Variables (set in Railway Dashboard)

```
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your_google_maps_key
```

---

## Step 4: Code Fixes for Production

### 1. Health Endpoint (must be before authenticated routes)

In `backend/src/index.ts`, place health check BEFORE other routes:
```typescript
app.use(express.urlencoded({ extended: true }));

// Health check - MUST be before authenticated routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes (after health check)
app.use('/api/auth', authRoutes);
// ... other routes
```

### 2. Fix PORT type for TypeScript
```typescript
const PORT = parseInt(process.env.PORT || '3001', 10);
```

### 3. Use /tmp for writable directories in Docker

Any service that creates directories must use `/tmp`:
```typescript
// Instead of:
this.modelsDir = path.join(process.cwd(), 'ml_models');

// Use:
this.modelsDir = path.join('/tmp', 'ml_models');
```

### 4. Disable TensorFlow (if causing native binding issues)

Replace ML services with stub implementations that return default values.

---

## Step 5: Set Root Directories in Railway

This is **critical** for monorepos:

1. Go to Railway Dashboard → Your Project
2. Click on **backend** service → Settings → Source
3. Set **Root Directory** to: `backend`
4. Click on **frontend** service → Settings → Source
5. Set **Root Directory** to: `frontend`

---

## Step 6: Deploy

Push to your main branch. Railway will automatically:
1. Detect the Dockerfile in each service's root directory
2. Build using the multi-stage Dockerfile
3. Run health checks
4. Route traffic to healthy containers

---

## Troubleshooting

### 502 Application Failed to Respond
- Check that health endpoint is accessible without auth
- Verify PORT environment variable is being used correctly
- Check Railway logs for startup errors

### Build Fails with Permission Denied
- Use `/tmp` for any directories the app needs to create
- Ensure Dockerfile creates necessary directories with correct ownership

### SSL Certificate Errors (Supabase)
- Set `DB_SSL_REJECT_UNAUTHORIZED=false` in environment variables

### Frontend Shows Old Deployment
- Verify Root Directory is set correctly in Railway Dashboard
- Check that railway.toml specifies `builder = "dockerfile"`

### Missing .env.example Error
- Create `.env.example` in frontend directory
- Force add with `git add -f frontend/.env.example` if gitignored

---

## Final URLs

After successful deployment:
- **Backend API**: `https://backend-production-xxxx.up.railway.app`
- **Frontend**: `https://frontend-production-xxxx.up.railway.app`
- **API Docs**: `https://backend-production-xxxx.up.railway.app/api-docs`
