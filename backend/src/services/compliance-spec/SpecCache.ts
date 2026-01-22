/**
 * Compliance Spec Cache
 *
 * Redis-backed cache with in-memory fallback for compliance specs.
 * Provides fast access to frequently-queried spec data.
 */

import { createClient, RedisClientType } from 'redis';

class ComplianceSpecCache {
  private redis: RedisClientType | null = null;
  private memoryCache = new Map<string, { data: any; expiresAt: number }>();
  private prefix = 'compliance:spec:';
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        this.redis = createClient({ url: redisUrl });
        this.redis.on('error', (err) => {
          console.warn('[ComplianceSpecCache] Redis error, falling back to memory:', err.message);
          this.redis = null;
        });
        await this.redis.connect();
        console.log('[ComplianceSpecCache] Connected to Redis');
      } catch (error) {
        console.warn('[ComplianceSpecCache] Redis unavailable, using in-memory cache');
        this.redis = null;
      }
    } else {
      console.log('[ComplianceSpecCache] No REDIS_URL, using in-memory cache');
    }

    this.initialized = true;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      // Lazy init - will use memory cache until Redis connects
      this.initialize().catch(() => {});
    }
  }

  /**
   * Get a cached value
   */
  async get<T = any>(key: string): Promise<T | null> {
    this.ensureInitialized();
    const fullKey = this.prefix + key;

    // Try Redis first
    if (this.redis) {
      try {
        const value = await this.redis.get(fullKey);
        if (value) {
          return JSON.parse(value) as T;
        }
        return null;
      } catch (error) {
        console.warn('[ComplianceSpecCache] Redis get error:', (error as Error).message);
      }
    }

    // Fall back to memory
    const cached = this.memoryCache.get(fullKey);
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        return cached.data as T;
      }
      // Expired
      this.memoryCache.delete(fullKey);
    }

    return null;
  }

  /**
   * Set a cached value with TTL in seconds
   */
  async set(key: string, value: any, ttlSeconds = 300): Promise<void> {
    this.ensureInitialized();
    const fullKey = this.prefix + key;
    const serialized = JSON.stringify(value);

    // Try Redis first
    if (this.redis) {
      try {
        await this.redis.setEx(fullKey, ttlSeconds, serialized);
        return;
      } catch (error) {
        console.warn('[ComplianceSpecCache] Redis set error:', (error as Error).message);
      }
    }

    // Fall back to memory
    this.memoryCache.set(fullKey, {
      data: value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    // Cleanup old entries periodically
    if (this.memoryCache.size > 1000) {
      this.cleanupMemoryCache();
    }
  }

  /**
   * Invalidate all cached data for a state
   */
  async invalidate(stateCode: string): Promise<void> {
    this.ensureInitialized();

    const patterns = [
      `${this.prefix}summary:${stateCode}`,
      `${this.prefix}rules:${stateCode}`,
      `${this.prefix}rules:${stateCode}:*`,
      `${this.prefix}disclosures:${stateCode}`,
      `${this.prefix}gates:${stateCode}`,
      `${this.prefix}contacts:${stateCode}`,
      `${this.prefix}documents:${stateCode}`,
      `${this.prefix}full:${stateCode}`,
    ];

    // Redis invalidation
    if (this.redis) {
      try {
        for (const pattern of patterns) {
          if (pattern.includes('*')) {
            // Scan and delete matching keys
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
              await this.redis.del(keys);
            }
          } else {
            await this.redis.del(pattern);
          }
        }
      } catch (error) {
        console.warn('[ComplianceSpecCache] Redis invalidate error:', (error as Error).message);
      }
    }

    // Memory cache invalidation
    for (const key of this.memoryCache.keys()) {
      if (key.includes(stateCode)) {
        this.memoryCache.delete(key);
      }
    }

    console.log(`[ComplianceSpecCache] Invalidated cache for ${stateCode}`);
  }

  /**
   * Invalidate entire cache
   */
  async invalidateAll(): Promise<void> {
    this.ensureInitialized();

    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${this.prefix}*`);
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
      } catch (error) {
        console.warn('[ComplianceSpecCache] Redis invalidateAll error:', (error as Error).message);
      }
    }

    this.memoryCache.clear();
    console.log('[ComplianceSpecCache] Invalidated all cache');
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ type: string; keys: number; memoryKeys: number }> {
    this.ensureInitialized();

    let redisKeys = 0;
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${this.prefix}*`);
        redisKeys = keys.length;
      } catch (error) {
        // Ignore
      }
    }

    return {
      type: this.redis ? 'redis' : 'memory',
      keys: redisKeys,
      memoryKeys: this.memoryCache.size,
    };
  }

  /**
   * Cleanup expired entries from memory cache
   */
  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.expiresAt < now) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
    this.initialized = false;
  }
}

export const complianceSpecCache = new ComplianceSpecCache();
