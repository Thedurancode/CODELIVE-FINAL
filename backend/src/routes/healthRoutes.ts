/**
 * Health Check Routes
 *
 * Provides standardized health check endpoints for:
 * - Basic liveness checks (is the server running?)
 * - Readiness checks (is the server ready to handle requests?)
 * - Detailed health checks (status of all dependencies)
 *
 * Kubernetes-ready health endpoints following best practices.
 */

import { Router, Request, Response } from 'express';
import { sequelize } from '../models';
import { redisService } from '../services/RedisService';
import { logger } from '../services/LoggerService';

const router = Router();

interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  message?: string;
  details?: Record<string, unknown>;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks?: Record<string, HealthCheck>;
}

// Server start time for uptime calculation
const startTime = Date.now();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Basic health check
 *     description: Returns basic server status - use for load balancer health checks
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is running
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/health/live:
 *   get:
 *     summary: Liveness probe
 *     description: Kubernetes liveness probe - returns 200 if process is alive
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is alive
 */
router.get('/live', (_req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/health/ready:
 *   get:
 *     summary: Readiness probe
 *     description: Kubernetes readiness probe - checks if server can handle requests
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is ready to handle requests
 *       503:
 *         description: Server is not ready
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const checks: HealthCheck[] = [];

  // Check database connection
  const dbCheck = await checkDatabase();
  checks.push(dbCheck);

  // Check Redis connection
  const redisCheck = await checkRedis();
  checks.push(redisCheck);

  // Determine overall status
  const hasUnhealthy = checks.some(c => c.status === 'unhealthy');
  const hasDegraded = checks.some(c => c.status === 'degraded');

  const status = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'ok';
  const httpStatus = hasUnhealthy ? 503 : 200;

  const response: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '2.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: checks.reduce((acc, check) => {
      acc[check.name] = check;
      return acc;
    }, {} as Record<string, HealthCheck>),
  };

  res.status(httpStatus).json(response);
});

/**
 * @swagger
 * /api/health/detailed:
 *   get:
 *     summary: Detailed health check
 *     description: Returns detailed health status of all services and dependencies
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed health information
 */
router.get('/detailed', async (_req: Request, res: Response) => {
  const checks: HealthCheck[] = [];

  // Run all checks in parallel
  const [dbCheck, redisCheck, memoryCheck, vercelCheck, flyCheck, openaiCheck, pineconeCheck] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkMemory(),
    checkVercel(),
    checkFly(),
    checkOpenAI(),
    checkPinecone(),
  ]);

  checks.push(dbCheck, redisCheck, memoryCheck, vercelCheck, flyCheck, openaiCheck, pineconeCheck);

  // Determine overall status
  const hasUnhealthy = checks.some(c => c.status === 'unhealthy');
  const hasDegraded = checks.some(c => c.status === 'degraded');

  const status = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'ok';

  const response: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '2.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: checks.reduce((acc, check) => {
      acc[check.name] = check;
      return acc;
    }, {} as Record<string, HealthCheck>),
  };

  // Add system info in non-production
  if (process.env.NODE_ENV !== 'production') {
    (response as any).system = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      env: process.env.NODE_ENV,
    };
  }

  res.json(response);
});

// =============================================================================
// HEALTH CHECK FUNCTIONS
// =============================================================================

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await sequelize.authenticate();
    // Run a simple query to verify database is operational
    await sequelize.query('SELECT 1');
    const latency = Date.now() - start;

    return {
      name: 'database',
      status: latency > 1000 ? 'degraded' : 'healthy',
      latency,
      message: 'PostgreSQL connection OK',
    };
  } catch (error) {
    logger.error('Database health check failed', {}, error);
    return {
      name: 'database',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const stats = await redisService.getStats();
    const latency = Date.now() - start;

    if (!stats.connected) {
      return {
        name: 'redis',
        status: 'degraded',
        latency,
        message: 'Redis not connected, using in-memory fallback',
        details: { connected: false },
      };
    }

    return {
      name: 'redis',
      status: latency > 100 ? 'degraded' : 'healthy',
      latency,
      message: 'Redis connection OK',
      details: {
        connected: true,
        keys: stats.keys,
        memory: stats.memory,
      },
    };
  } catch (error) {
    logger.error('Redis health check failed', {}, error);
    return {
      name: 'redis',
      status: 'degraded', // Redis is not critical, degraded not unhealthy
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'Redis check failed',
    };
  }
}

async function checkMemory(): Promise<HealthCheck> {
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const heapPercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

  // Consider degraded if heap usage is > 85%
  const status = heapPercent > 95 ? 'unhealthy' : heapPercent > 85 ? 'degraded' : 'healthy';

  return {
    name: 'memory',
    status,
    message: `Heap usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapPercent}%)`,
    details: {
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      heapPercent,
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
    },
  };
}

async function checkVercel(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { vercelService } = await import('../services/VercelService');
    if (!vercelService.isConfigured()) {
      return {
        name: 'vercel',
        status: 'degraded',
        latency: Date.now() - start,
        message: 'Not configured (no VERCEL_TOKEN)',
      };
    }
    const status = await vercelService.getStatus();
    const latency = Date.now() - start;
    return {
      name: 'vercel',
      status: 'healthy',
      latency,
      message: `Connected${status.user ? ` as ${status.user.username}` : ''}`,
      details: { configured: true, user: status.user?.username, teamId: status.teamId },
    };
  } catch (error) {
    return {
      name: 'vercel',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'Vercel check failed',
    };
  }
}

async function checkFly(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { flyService } = await import('../services/FlyService');
    if (!flyService.isConfigured()) {
      return {
        name: 'fly',
        status: 'degraded',
        latency: Date.now() - start,
        message: 'Not configured (no FLY_API_TOKEN)',
      };
    }
    const status = await flyService.getStatus();
    const latency = Date.now() - start;
    return {
      name: 'fly',
      status: status.configured ? 'healthy' : 'unhealthy',
      latency,
      message: status.configured ? 'Connected' : 'Token invalid',
      details: { configured: status.configured },
    };
  } catch (error) {
    return {
      name: 'fly',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'Fly.io check failed',
    };
  }
}

async function checkOpenAI(): Promise<HealthCheck> {
  const start = Date.now();
  const key = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!key) {
    return {
      name: 'openai',
      status: 'degraded',
      latency: Date.now() - start,
      message: 'Not configured (no OPENAI_API_KEY or OPENROUTER_API_KEY)',
    };
  }

  try {
    // Quick models list to verify API key works
    const isOpenRouter = !process.env.OPENAI_API_KEY && !!process.env.OPENROUTER_API_KEY;
    const baseUrl = isOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${key}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (res.ok) {
      return {
        name: 'openai',
        status: 'healthy',
        latency,
        message: `Connected via ${isOpenRouter ? 'OpenRouter' : 'OpenAI'}`,
        details: { provider: isOpenRouter ? 'openrouter' : 'openai' },
      };
    }
    return {
      name: 'openai',
      status: 'unhealthy',
      latency,
      message: `API returned ${res.status}`,
    };
  } catch (error) {
    return {
      name: 'openai',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'OpenAI check failed',
    };
  }
}

async function checkPinecone(): Promise<HealthCheck> {
  const start = Date.now();
  const key = process.env.PINECONE_API_KEY;
  if (!key) {
    return {
      name: 'pinecone',
      status: 'degraded',
      latency: Date.now() - start,
      message: 'Not configured (no PINECONE_API_KEY)',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.pinecone.io/indexes', {
      headers: { 'Api-Key': key },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (res.ok) {
      const data = await res.json();
      const indexCount = Array.isArray(data.indexes) ? data.indexes.length : 0;
      return {
        name: 'pinecone',
        status: 'healthy',
        latency,
        message: `Connected (${indexCount} index${indexCount !== 1 ? 'es' : ''})`,
        details: { indexCount },
      };
    }
    return {
      name: 'pinecone',
      status: 'unhealthy',
      latency,
      message: `API returned ${res.status}`,
    };
  } catch (error) {
    return {
      name: 'pinecone',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'Pinecone check failed',
    };
  }
}

export default router;
