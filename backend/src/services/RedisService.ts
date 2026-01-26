/**
 * Redis Service
 *
 * Provides centralized Redis connection and caching utilities for:
 * - Market data caching (Zillow API responses)
 * - Agent conversation history
 * - Session management
 * - Rate limiting counters
 * - Property lookup caching
 */

import Redis from 'ioredis';

// Cache TTL defaults (in seconds)
export const CACHE_TTL = {
  MARKET_DATA: 60 * 60 * 24, // 24 hours - property valuations don't change often
  PROPERTY_DETAILS: 60 * 60 * 6, // 6 hours
  CONVERSATION_HISTORY: 60 * 60 * 24 * 7, // 7 days
  SESSION: 60 * 60 * 24, // 24 hours
  RATE_LIMIT: 60, // 1 minute
  BUY_BOX_SCORES: 60 * 60, // 1 hour
  SEARCH_RESULTS: 60 * 15, // 15 minutes
};

// Cache key prefixes for organization
export const CACHE_PREFIX = {
  MARKET_DATA: 'market:',
  PROPERTY: 'property:',
  CONVERSATION: 'conv:',
  SESSION: 'session:',
  RATE_LIMIT: 'rate:',
  BUY_BOX: 'buybox:',
  SEARCH: 'search:',
  AGENT: 'agent:',
};

interface CacheOptions {
  ttl?: number;
  prefix?: string;
}

class RedisService {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private fallbackCache: Map<string, { value: string; expiry: number; lastAccess: number }> = new Map();
  private readonly MAX_FALLBACK_CACHE_SIZE = 5000; // Maximum entries to prevent unbounded growth
  private readonly CLEANUP_BATCH_SIZE = 500; // Number of entries to evict when limit is reached

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    return this.connectionPromise;
  }

  private async _connect(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      console.log('  Redis: No REDIS_URL configured, using in-memory fallback cache');
      this.isConnected = false;
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            console.warn('  Redis: Max retries reached, falling back to in-memory cache');
            return null;
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });

      this.client.on('error', (err) => {
        console.error('  Redis connection error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('  Redis: Connected successfully');
        this.isConnected = true;
      });

      this.client.on('close', () => {
        console.log('  Redis: Connection closed');
        this.isConnected = false;
      });

      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      console.warn('  Redis: Connection failed, using in-memory fallback');
      console.warn('  Error:', (error as Error).message);
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = key;

    if (this.isReady() && this.client) {
      try {
        const value = await this.client.get(fullKey);
        if (value) {
          return JSON.parse(value) as T;
        }
      } catch (error) {
        console.warn('Redis get error:', (error as Error).message);
      }
    }

    // Fallback to in-memory cache
    const cached = this.fallbackCache.get(fullKey);
    if (cached && cached.expiry > Date.now()) {
      // Update last access time for LRU-like eviction
      cached.lastAccess = Date.now();
      return JSON.parse(cached.value) as T;
    }
    this.fallbackCache.delete(fullKey);
    return null;
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const fullKey = key;
    const serialized = JSON.stringify(value);
    const ttl = ttlSeconds || CACHE_TTL.PROPERTY_DETAILS;

    if (this.isReady() && this.client) {
      try {
        await this.client.setex(fullKey, ttl, serialized);
        return;
      } catch (error) {
        console.warn('Redis set error:', (error as Error).message);
      }
    }

    // Fallback to in-memory cache
    const now = Date.now();
    this.fallbackCache.set(fullKey, {
      value: serialized,
      expiry: now + ttl * 1000,
      lastAccess: now,
    });

    // Enforce size limit and clean up expired entries
    if (this.fallbackCache.size > this.MAX_FALLBACK_CACHE_SIZE) {
      this.enforceCacheSizeLimit();
    } else if (this.fallbackCache.size > 1000 && this.fallbackCache.size % 100 === 0) {
      // Periodically clean expired entries
      this.cleanupFallbackCache();
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    if (this.isReady() && this.client) {
      try {
        await this.client.del(key);
      } catch (error) {
        console.warn('Redis del error:', (error as Error).message);
      }
    }
    this.fallbackCache.delete(key);
  }

  /**
   * Delete all keys matching a pattern
   */
  async delPattern(pattern: string): Promise<number> {
    let deleted = 0;

    if (this.isReady() && this.client) {
      try {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          deleted = await this.client.del(...keys);
        }
      } catch (error) {
        console.warn('Redis delPattern error:', (error as Error).message);
      }
    }

    // Also clean fallback cache
    for (const key of this.fallbackCache.keys()) {
      if (this.matchPattern(key, pattern)) {
        this.fallbackCache.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (this.isReady() && this.client) {
      try {
        return (await this.client.exists(key)) === 1;
      } catch (error) {
        console.warn('Redis exists error:', (error as Error).message);
      }
    }

    const cached = this.fallbackCache.get(key);
    return cached !== undefined && cached.expiry > Date.now();
  }

  /**
   * Increment a counter (for rate limiting)
   */
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (this.isReady() && this.client) {
      try {
        const value = await this.client.incr(key);
        if (ttlSeconds && value === 1) {
          await this.client.expire(key, ttlSeconds);
        }
        return value;
      } catch (error) {
        console.warn('Redis incr error:', (error as Error).message);
      }
    }

    // Fallback
    const now = Date.now();
    const cached = this.fallbackCache.get(key);
    let count = 1;
    if (cached && cached.expiry > now) {
      count = parseInt(cached.value, 10) + 1;
    }
    this.fallbackCache.set(key, {
      value: count.toString(),
      expiry: now + (ttlSeconds || 60) * 1000,
      lastAccess: now,
    });
    return count;
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string): Promise<number> {
    if (this.isReady() && this.client) {
      try {
        return await this.client.ttl(key);
      } catch (error) {
        console.warn('Redis ttl error:', (error as Error).message);
      }
    }

    const cached = this.fallbackCache.get(key);
    if (cached) {
      return Math.max(0, Math.floor((cached.expiry - Date.now()) / 1000));
    }
    return -2;
  }

  // ============================================================================
  // SPECIALIZED CACHE METHODS
  // ============================================================================

  /**
   * Cache market data for an address
   */
  async cacheMarketData(address: string, data: any): Promise<void> {
    const key = `${CACHE_PREFIX.MARKET_DATA}${this.normalizeAddress(address)}`;
    await this.set(key, data, CACHE_TTL.MARKET_DATA);
  }

  /**
   * Get cached market data for an address
   */
  async getMarketData<T>(address: string): Promise<T | null> {
    const key = `${CACHE_PREFIX.MARKET_DATA}${this.normalizeAddress(address)}`;
    return this.get<T>(key);
  }

  /**
   * Cache conversation history
   */
  async cacheConversation(sessionId: string, messages: any[]): Promise<void> {
    const key = `${CACHE_PREFIX.CONVERSATION}${sessionId}`;
    await this.set(key, messages, CACHE_TTL.CONVERSATION_HISTORY);
  }

  /**
   * Get cached conversation history
   */
  async getConversation<T>(sessionId: string): Promise<T | null> {
    const key = `${CACHE_PREFIX.CONVERSATION}${sessionId}`;
    return this.get<T>(key);
  }

  /**
   * Cache buy box scores for a property
   */
  async cacheBuyBoxScores(propertyId: string, scores: any[]): Promise<void> {
    const key = `${CACHE_PREFIX.BUY_BOX}${propertyId}`;
    await this.set(key, scores, CACHE_TTL.BUY_BOX_SCORES);
  }

  /**
   * Get cached buy box scores
   */
  async getBuyBoxScores<T>(propertyId: string): Promise<T | null> {
    const key = `${CACHE_PREFIX.BUY_BOX}${propertyId}`;
    return this.get<T>(key);
  }

  /**
   * Invalidate all caches for a property
   */
  async invalidateProperty(propertyId: string): Promise<void> {
    await this.del(`${CACHE_PREFIX.PROPERTY}${propertyId}`);
    await this.del(`${CACHE_PREFIX.BUY_BOX}${propertyId}`);
  }

  /**
   * Invalidate all cached scores related to a buy box
   * Called when buy box criteria are updated or buy box is deleted
   */
  async invalidateBuyBoxCache(buyBoxId: string): Promise<void> {
    // Delete all cached scores that might reference this buy box
    // Pattern matches: buybox:* (all property scores contain buy box results)
    const deleted = await this.delPattern(`${CACHE_PREFIX.BUY_BOX}*`);
    if (deleted > 0) {
      console.log(`🗑️ Invalidated ${deleted} cached scores for buy box ${buyBoxId}`);
    }
  }

  /**
   * Check rate limit
   */
  async checkRateLimit(
    identifier: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    const key = `${CACHE_PREFIX.RATE_LIMIT}${identifier}`;
    const count = await this.incr(key, windowSeconds);
    const ttl = await this.ttl(key);

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetIn: ttl > 0 ? ttl : windowSeconds,
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Normalize address for consistent cache keys
   */
  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 100);
  }

  /**
   * Match key against a glob pattern
   */
  private matchPattern(key: string, pattern: string): boolean {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(key);
  }

  /**
   * Clean up expired entries from fallback cache
   */
  private cleanupFallbackCache(): void {
    const now = Date.now();
    for (const [key, value] of this.fallbackCache.entries()) {
      if (value.expiry <= now) {
        this.fallbackCache.delete(key);
      }
    }
  }

  /**
   * Enforce maximum cache size by evicting least recently used entries
   */
  private enforceCacheSizeLimit(): void {
    const now = Date.now();

    // First, remove all expired entries
    for (const [key, value] of this.fallbackCache.entries()) {
      if (value.expiry <= now) {
        this.fallbackCache.delete(key);
      }
    }

    // If still over limit, evict oldest entries by last access time
    if (this.fallbackCache.size > this.MAX_FALLBACK_CACHE_SIZE) {
      const entries = Array.from(this.fallbackCache.entries())
        .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

      const entriesToRemove = entries.slice(0, this.CLEANUP_BATCH_SIZE);
      for (const [key] of entriesToRemove) {
        this.fallbackCache.delete(key);
      }

      console.warn(`RedisService: Evicted ${entriesToRemove.length} entries from fallback cache (size: ${this.fallbackCache.size})`);
    }
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{
    connected: boolean;
    type: 'redis' | 'memory';
    keys?: number;
    memory?: string;
  }> {
    if (this.isReady() && this.client) {
      try {
        const info = await this.client.info('memory');
        const dbSize = await this.client.dbsize();
        const memMatch = info.match(/used_memory_human:(\S+)/);

        return {
          connected: true,
          type: 'redis',
          keys: dbSize,
          memory: memMatch ? memMatch[1] : 'unknown',
        };
      } catch (error) {
        // Fall through to memory stats
      }
    }

    return {
      connected: false,
      type: 'memory',
      keys: this.fallbackCache.size,
    };
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
    }
  }
}

// Export singleton instance
export const redisService = new RedisService();

// Export class for testing
export { RedisService };
