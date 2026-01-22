# ==============================================================================
# Dispotree Backend - Production Dockerfile
# ==============================================================================
# Multi-stage build for optimized production image
# Includes TensorFlow.js and Playwright support
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Dependencies
# ------------------------------------------------------------------------------
FROM node:20-slim AS deps

WORKDIR /app

# Install build dependencies for native modules (TensorFlow, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for building)
RUN npm ci

# ------------------------------------------------------------------------------
# Stage 2: Builder
# ------------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source files
COPY . .

# Build the TypeScript application with increased memory
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build || (echo "Build failed, trying with tsc directly..." && npx tsc --skipLibCheck)

# Prune dev dependencies
RUN npm prune --production

# ------------------------------------------------------------------------------
# Stage 3: Production Runner
# ------------------------------------------------------------------------------
FROM node:20-slim AS runner

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    # Playwright browser dependencies (for web scraping)
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home dispotree

# Copy built application
COPY --from=builder --chown=dispotree:nodejs /app/dist ./dist
COPY --from=builder --chown=dispotree:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=dispotree:nodejs /app/package*.json ./

# Create directories for runtime data
RUN mkdir -p uploads knowledge logs \
    && chown -R dispotree:nodejs uploads knowledge logs

# Switch to non-root user
USER dispotree

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose the API port
EXPOSE 3001

# Railway handles health checks via railway.toml, no Docker HEALTHCHECK needed

# Start the application
CMD ["node", "dist/index.js"]
