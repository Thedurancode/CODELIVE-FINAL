/**
 * Security Utilities
 *
 * Reusable security functions for the entire application.
 */

import { Request, Response as ExpressResponse, NextFunction } from 'express';
import { URL } from 'url';

// Use global fetch Response type
type FetchResponse = Awaited<ReturnType<typeof fetch>>;

// =============================================================================
// ERROR SANITIZATION
// =============================================================================

/**
 * Sanitize error messages for production
 * Prevents leaking internal details to clients
 */
export function sanitizeError(error: unknown, isProduction: boolean = process.env.NODE_ENV === 'production'): string {
  if (!isProduction) {
    return error instanceof Error ? error.message : String(error);
  }

  // In production, return generic messages for common errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Database errors
    if (message.includes('sequelize') || message.includes('database') || message.includes('sql')) {
      return 'Database operation failed';
    }

    // Network errors
    if (message.includes('econnrefused') || message.includes('timeout') || message.includes('network')) {
      return 'Service temporarily unavailable';
    }

    // Auth errors (keep these specific for UX)
    if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('token')) {
      return error.message;
    }

    // Validation errors (keep for UX)
    if (message.includes('required') || message.includes('invalid') || message.includes('must be')) {
      return error.message;
    }
  }

  // Default generic message
  return 'An unexpected error occurred';
}

/**
 * Middleware to sanitize all error responses
 */
export function errorSanitizer(err: Error, req: Request, res: ExpressResponse, next: NextFunction): void {
  const isProduction = process.env.NODE_ENV === 'production';

  // Log full error server-side
  console.error(`[${new Date().toISOString()}] Error:`, err.stack || err.message);

  const statusCode = (err as any).statusCode || 500;
  const sanitizedMessage = sanitizeError(err, isProduction);

  res.status(statusCode).json({
    success: false,
    error: sanitizedMessage,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

// =============================================================================
// SSRF PROTECTION
// =============================================================================

// Private IP ranges that should be blocked
const PRIVATE_IP_RANGES = [
  /^127\./,                    // Loopback
  /^10\./,                     // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
  /^192\.168\./,               // Private Class C
  /^169\.254\./,               // Link-local
  /^0\./,                      // Current network
  /^fc00:/i,                   // IPv6 unique local
  /^fe80:/i,                   // IPv6 link-local
  /^::1$/,                     // IPv6 loopback
  /^localhost$/i,              // Localhost hostname
];

// Allowed domains whitelist (add your trusted domains)
const ALLOWED_DOMAINS = [
  'api.zillow.com',
  'zillow-com1.p.rapidapi.com',
  'api.attomdata.com',
  'api.rentometer.com',
  'api.firecrawl.dev',
  'api.openai.com',
  'openrouter.ai',
  'api.resend.com',
];

/**
 * Check if a hostname is a private/internal address
 */
export function isPrivateAddress(hostname: string): boolean {
  return PRIVATE_IP_RANGES.some(pattern => pattern.test(hostname));
}

/**
 * Validate a URL for SSRF protection
 * Returns null if invalid, or the validated URL object if safe
 */
export function validateUrl(urlString: string, options: {
  allowPrivate?: boolean;
  allowedDomains?: string[];
  requireHttps?: boolean;
} = {}): URL | null {
  const { allowPrivate = false, allowedDomains, requireHttps = false } = options;

  try {
    const url = new URL(urlString);

    // Check protocol
    if (requireHttps && url.protocol !== 'https:') {
      return null;
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    // Check for private addresses (SSRF protection)
    if (!allowPrivate && isPrivateAddress(url.hostname)) {
      console.warn(`⚠️ SSRF attempt blocked: ${url.hostname}`);
      return null;
    }

    // Check domain whitelist if provided
    if (allowedDomains && allowedDomains.length > 0) {
      const isAllowed = allowedDomains.some(domain =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`)
      );
      if (!isAllowed) {
        console.warn(`⚠️ URL blocked - not in allowed domains: ${url.hostname}`);
        return null;
      }
    }

    return url;
  } catch {
    return null;
  }
}

/**
 * Create a safe fetch wrapper with SSRF protection
 */
export async function safeFetch(
  urlString: string,
  options: RequestInit & { allowedDomains?: string[] } = {}
): Promise<FetchResponse> {
  const { allowedDomains = ALLOWED_DOMAINS, ...fetchOptions } = options;

  const validatedUrl = validateUrl(urlString, {
    allowedDomains,
    requireHttps: process.env.NODE_ENV === 'production',
  });

  if (!validatedUrl) {
    throw new Error('Invalid or blocked URL');
  }

  return fetch(validatedUrl.toString(), fetchOptions);
}

// =============================================================================
// INPUT VALIDATION
// =============================================================================

/**
 * Safely parse integer with validation
 */
export function safeParseInt(value: any, options: {
  min?: number;
  max?: number;
  defaultValue?: number;
} = {}): number | null {
  const { min, max, defaultValue } = options;

  if (value === undefined || value === null || value === '') {
    return defaultValue ?? null;
  }

  const parsed = parseInt(String(value), 10);

  if (isNaN(parsed)) {
    return defaultValue ?? null;
  }

  if (min !== undefined && parsed < min) {
    return min;
  }

  if (max !== undefined && parsed > max) {
    return max;
  }

  return parsed;
}

/**
 * Validate pagination parameters
 */
export function validatePagination(query: any, defaults: { page: number; limit: number; maxLimit: number } = {
  page: 1,
  limit: 20,
  maxLimit: 100,
}): { page: number; limit: number; offset: number } {
  const page = safeParseInt(query.page, { min: 1, defaultValue: defaults.page }) || defaults.page;
  const limit = safeParseInt(query.limit, { min: 1, max: defaults.maxLimit, defaultValue: defaults.limit }) || defaults.limit;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

// =============================================================================
// MEMORY LEAK PREVENTION
// =============================================================================

/**
 * Create a Map with automatic size limiting and cleanup
 */
type LimitedMap<K, V> = Map<K, V> & { cleanup(): void };

export function createLimitedMap<K, V>(options: {
  maxSize: number;
  ttlMs?: number;
  onEvict?: (key: K, value: V) => void;
}): LimitedMap<K, V> {
  const { maxSize, ttlMs, onEvict } = options;
  const map = new Map<K, V>();
  const timestamps = new Map<K, number>();

  const limitedMap: LimitedMap<K, V> = {
    ...map,
    set(key: K, value: V): LimitedMap<K, V> {
      // Evict oldest entries if at capacity
      if (map.size >= maxSize && !map.has(key)) {
        const oldestKey = map.keys().next().value;
        if (oldestKey !== undefined) {
          const oldValue = map.get(oldestKey);
          map.delete(oldestKey);
          timestamps.delete(oldestKey);
          if (onEvict && oldValue !== undefined) {
            onEvict(oldestKey, oldValue);
          }
        }
      }

      map.set(key, value);
      if (ttlMs) {
        timestamps.set(key, Date.now());
      }
      return limitedMap;
    },

    get(key: K): V | undefined {
      // Check TTL
      if (ttlMs && timestamps.has(key)) {
        const age = Date.now() - timestamps.get(key)!;
        if (age > ttlMs) {
          const value = map.get(key);
          map.delete(key);
          timestamps.delete(key);
          if (onEvict && value !== undefined) {
            onEvict(key, value);
          }
          return undefined;
        }
      }
      return map.get(key);
    },

    delete(key: K): boolean {
      timestamps.delete(key);
      return map.delete(key);
    },

    cleanup(): void {
      if (!ttlMs) return;

      const now = Date.now();
      for (const [key, timestamp] of timestamps.entries()) {
        if (now - timestamp > ttlMs) {
          const value = map.get(key);
          map.delete(key);
          timestamps.delete(key);
          if (onEvict && value !== undefined) {
            onEvict(key, value);
          }
        }
      }
    },

    get size(): number {
      return map.size;
    },

    has(key: K): boolean {
      return map.has(key);
    },

    clear(): void {
      map.clear();
      timestamps.clear();
    },

    keys(): IterableIterator<K> {
      return map.keys();
    },

    values(): IterableIterator<V> {
      return map.values();
    },

    entries(): IterableIterator<[K, V]> {
      return map.entries();
    },

    forEach(callback: (value: V, key: K, map: Map<K, V>) => void): void {
      map.forEach(callback);
    },
  };

  return limitedMap as any;
}

export default {
  sanitizeError,
  errorSanitizer,
  isPrivateAddress,
  validateUrl,
  safeFetch,
  safeParseInt,
  validatePagination,
  createLimitedMap,
};
