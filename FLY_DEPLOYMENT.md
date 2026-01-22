# Fly.io Deployment Guide for Dispotree

This guide walks you through deploying Dispotree to Fly.io.

## Prerequisites

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login to Fly.io**
   ```bash
   fly auth login
   ```

## Quick Start

### 1. Initial Setup (First Time Only)

Run the setup script to create all Fly.io resources:

```bash
./fly-deploy.sh setup
```

This creates:
- `dispotree-api` - Backend API app
- `dispotree-web` - Frontend app
- `dispotree-db` - PostgreSQL database
- `dispotree-redis` - Redis cache
- `dispotree_data` - Persistent volume for uploads

### 2. Set Secrets

Configure your environment variables:

```bash
./fly-deploy.sh secrets
```

Or manually set secrets:

```bash
# Required
fly secrets set JWT_SECRET="your-secret-key" --app dispotree-api

# AI/ML (required for agent features)
fly secrets set OPENAI_API_KEY="sk-..." --app dispotree-api
fly secrets set OPENROUTER_API_KEY="..." --app dispotree-api
fly secrets set PINECONE_API_KEY="..." --app dispotree-api

# Market Data
fly secrets set RAPIDAPI_KEY="..." --app dispotree-api

# E-Signatures
fly secrets set DOCUSEAL_API_KEY="..." --app dispotree-api
fly secrets set DOCUSEAL_API_URL="https://api.docuseal.com" --app dispotree-api

# Voice (Twilio)
fly secrets set TWILIO_ACCOUNT_SID="..." --app dispotree-api
fly secrets set TWILIO_AUTH_TOKEN="..." --app dispotree-api
fly secrets set TWILIO_NUMBER="+1..." --app dispotree-api
fly secrets set PUBLIC_BASE_URL="https://dispotree-api.fly.dev" --app dispotree-api

# Email
fly secrets set RESEND_API_KEY="..." --app dispotree-api

# Payments
fly secrets set STRIPE_SECRET_KEY="sk_..." --app dispotree-api
fly secrets set STRIPE_WEBHOOK_SECRET="whsec_..." --app dispotree-api
```

Frontend secrets (build-time variables):

```bash
fly secrets set NEXT_PUBLIC_SUPABASE_URL="..." --app dispotree-web
fly secrets set NEXT_PUBLIC_SUPABASE_ANON_KEY="..." --app dispotree-web
fly secrets set NEXT_PUBLIC_GOOGLE_MAPS_KEY="..." --app dispotree-web
fly secrets set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_..." --app dispotree-web
```

### 3. Deploy

Deploy both services:

```bash
./fly-deploy.sh all
```

Or deploy individually:

```bash
./fly-deploy.sh backend   # Backend only
./fly-deploy.sh frontend  # Frontend only
```

## URLs

After deployment, your apps will be available at:

- **Frontend**: https://dispotree-web.fly.dev
- **Backend API**: https://dispotree-api.fly.dev
- **API Docs**: https://dispotree-api.fly.dev/api-docs

## Manual Deployment

If you prefer manual deployment:

### Backend

```bash
cd backend
fly deploy
```

### Frontend

```bash
cd frontend
fly deploy --build-arg NEXT_PUBLIC_API_URL=https://dispotree-api.fly.dev
```

## Database Management

### Connect to Database

```bash
fly postgres connect --app dispotree-db
```

### Run Migrations

SSH into the backend and run migrations:

```bash
fly ssh console --app dispotree-api
cd /app
node dist/migrate.js  # If you have a migration script
```

Or use the Fly proxy:

```bash
fly proxy 5433:5432 --app dispotree-db
# Then connect with your local tools on localhost:5433
```

## Monitoring

### View Logs

```bash
fly logs --app dispotree-api
fly logs --app dispotree-web
```

### Check Status

```bash
fly status --app dispotree-api
fly status --app dispotree-web
```

### SSH into App

```bash
fly ssh console --app dispotree-api
```

## Scaling

### Scale Machines

```bash
# Backend - more memory for ML/AI
fly scale memory 2048 --app dispotree-api

# Add more machines
fly scale count 2 --app dispotree-api
```

### Scale Database

```bash
fly postgres scale --app dispotree-db --vm-size shared-cpu-2x
```

## Custom Domain

### Add Custom Domain

```bash
# Frontend
fly certs add yourdomain.com --app dispotree-web

# Backend API
fly certs add api.yourdomain.com --app dispotree-api
```

Then update your DNS to point to Fly.io.

## Troubleshooting

### App Won't Start

Check logs:
```bash
fly logs --app dispotree-api
```

Check health:
```bash
curl https://dispotree-api.fly.dev/api/health
```

### Database Connection Issues

Verify database is attached:
```bash
fly secrets list --app dispotree-api | grep DATABASE_URL
```

Re-attach if needed:
```bash
fly postgres attach dispotree-db --app dispotree-api
```

### Memory Issues

The backend needs enough memory for TensorFlow.js:
```bash
fly scale memory 1024 --app dispotree-api
```

### Redis Connection

Get Redis connection string:
```bash
fly redis status dispotree-redis
```

Set it as a secret:
```bash
fly secrets set REDIS_URL="redis://..." --app dispotree-api
```

## Cost Optimization

Fly.io pricing (approximate):
- Shared CPU machines: ~$1.94/month per machine
- PostgreSQL (Development): ~$1.94/month + storage
- Redis: ~$1.94/month
- Volume storage: $0.15/GB/month

To minimize costs:
- Use `auto_stop_machines = true` (already configured)
- Start with 1 machine per service
- Use shared-cpu instances

## Environment Variables Reference

### Backend (Required)
| Variable | Description |
|----------|-------------|
| DATABASE_URL | Auto-set when attaching Postgres |
| JWT_SECRET | JWT signing key |

### Backend (Optional - Feature-specific)
| Variable | Description |
|----------|-------------|
| OPENAI_API_KEY | OpenAI API for agents |
| OPENROUTER_API_KEY | Alternative LLM provider |
| PINECONE_API_KEY | Vector DB for RAG |
| RAPIDAPI_KEY | Zillow market data |
| REDIS_URL | Redis cache |
| DOCUSEAL_API_KEY | E-signature service |
| TWILIO_* | Voice calling |
| RESEND_API_KEY | Email service |
| STRIPE_* | Payment processing |

### Frontend (Build-time)
| Variable | Description |
|----------|-------------|
| NEXT_PUBLIC_API_URL | Backend API URL |
| NEXT_PUBLIC_SUPABASE_URL | Supabase URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key |
| NEXT_PUBLIC_GOOGLE_MAPS_KEY | Google Maps API |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | Stripe public key |
