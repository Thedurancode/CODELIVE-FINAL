/**
 * Tool Result Cache
 *
 * 2-tier caching for tool results:
 * - L1: In-memory cache (fast, per-instance)
 * - L2: Redis cache (shared across instances)
 */

import * as crypto from 'crypto';
import { logger } from '../LoggerService';
import { redisService, CACHE_PREFIX } from '../RedisService';
import { TOOL_CACHE_TTLS } from './types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Cache for tool execution results
 */
export class ToolResultCache {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private readonly maxMemoryEntries = 500;
  private readonly defaultTTL = 5 * 60; // 5 minutes default

  private log = logger.child({ service: 'tool-cache' });

  constructor(private sessionId: string) {}

  /**
   * Generate a cache key from tool name and input
   */
  private generateKey(toolName: string, input: any): string {
    const inputHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex')
      .substring(0, 16);
    return `${CACHE_PREFIX.AGENT}tool:${toolName}:${inputHash}`;
  }

  /**
   * Get a cached result
   */
  async get<T>(toolName: string, input: any): Promise<T | null> {
    const key = this.generateKey(toolName, input);

    // L1: Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (memEntry && Date.now() < memEntry.timestamp + memEntry.ttl * 1000) {
      this.log.debug('Memory cache hit', { tool: toolName });
      return memEntry.data as T;
    }

    // L2: Check Redis cache
    try {
      const redisEntry = await redisService.get<CacheEntry<T>>(key);
      if (redisEntry && Date.now() < redisEntry.timestamp + redisEntry.ttl * 1000) {
        // Promote to L1
        this.setMemory(key, redisEntry);
        this.log.debug('Redis cache hit', { tool: toolName });
        return redisEntry.data;
      }
    } catch (error) {
      this.log.warn('Redis cache get error', { tool: toolName }, error);
    }

    return null;
  }

  /**
   * Cache a tool result
   */
  async set<T>(
    toolName: string,
    input: any,
    result: T,
    customTTL?: number
  ): Promise<void> {
    const key = this.generateKey(toolName, input);
    const ttl = customTTL || TOOL_CACHE_TTLS[toolName] || this.defaultTTL;

    const entry: CacheEntry<T> = {
      data: result,
      timestamp: Date.now(),
      ttl,
    };

    // L1: Memory cache
    this.setMemory(key, entry);

    // L2: Redis cache (async, fire-and-forget)
    redisService.set(key, entry, ttl).catch((err) =>
      this.log.warn('Redis cache set error', { tool: toolName }, err)
    );
  }

  /**
   * Set entry in memory cache with LRU eviction
   */
  private setMemory(key: string, entry: CacheEntry<any>): void {
    // Evict oldest if at capacity
    if (this.memoryCache.size >= this.maxMemoryEntries) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }
    this.memoryCache.set(key, entry);
  }

  /**
   * Clear all cached entries for this session
   */
  clear(): void {
    this.memoryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { memoryEntries: number; maxEntries: number } {
    return {
      memoryEntries: this.memoryCache.size,
      maxEntries: this.maxMemoryEntries,
    };
  }
}

export default ToolResultCache;
