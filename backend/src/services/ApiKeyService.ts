/**
 * API Key Service
 *
 * Manages API keys for external application access.
 * Handles creation, validation, revocation, and rate limiting.
 */

import ApiKey, { ApiKeyScope } from '../models/ApiKey';

interface CreateApiKeyOptions {
  organizationId: string;
  name: string;
  description?: string;
  scopes?: ApiKeyScope[];
  expiresAt?: Date;
  createdById?: string;
  rateLimit?: number;
}

interface CreateApiKeyResult {
  apiKey: ApiKey;
  fullKey: string; // Only returned once at creation time
}

interface ValidateKeyResult {
  valid: boolean;
  apiKey?: ApiKey;
  error?: string;
}

class ApiKeyService {
  // In-memory rate limit tracking (in production, use Redis)
  private rateLimitMap: Map<string, { count: number; resetAt: number }> = new Map();

  /**
   * Create a new API key
   */
  async createKey(options: CreateApiKeyOptions): Promise<CreateApiKeyResult> {
    const { fullKey, prefix, hash } = ApiKey.generateKey();

    const apiKey = await ApiKey.create({
      organizationId: options.organizationId,
      name: options.name,
      description: options.description || null,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: options.scopes || ['sprites:read'],
      expiresAt: options.expiresAt || null,
      createdById: options.createdById || null,
      rateLimit: options.rateLimit || 60,
    });

    return { apiKey, fullKey };
  }

  /**
   * Validate an API key and return the associated record
   */
  async validateKey(key: string): Promise<ValidateKeyResult> {
    if (!key) {
      return { valid: false, error: 'No API key provided' };
    }

    // Check format
    if (!key.startsWith('sk_live_')) {
      return { valid: false, error: 'Invalid API key format' };
    }

    const apiKey = await ApiKey.findByKey(key);

    if (!apiKey) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (!apiKey.isActive) {
      return { valid: false, error: 'API key is deactivated' };
    }

    if (apiKey.isExpired()) {
      return { valid: false, error: 'API key has expired' };
    }

    // Check rate limit
    const rateLimitResult = this.checkRateLimit(apiKey);
    if (!rateLimitResult.allowed) {
      return {
        valid: false,
        error: `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter} seconds`,
      };
    }

    // Record usage (async, don't wait)
    apiKey.recordUsage().catch(console.error);

    return { valid: true, apiKey };
  }

  /**
   * Check rate limit for an API key
   */
  checkRateLimit(apiKey: ApiKey): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const key = apiKey.id;

    let record = this.rateLimitMap.get(key);

    // Reset if window has passed
    if (!record || now >= record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
      this.rateLimitMap.set(key, record);
    }

    // Check limit
    if (record.count >= apiKey.rateLimit) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Increment counter
    record.count++;
    return { allowed: true };
  }

  /**
   * Get all API keys for an organization
   */
  async getKeysByOrganization(organizationId: string): Promise<ApiKey[]> {
    return ApiKey.findAll({
      where: { organizationId },
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['keyHash'] }, // Never expose the hash
    });
  }

  /**
   * Get a specific API key by ID
   */
  async getKeyById(id: string, organizationId: string): Promise<ApiKey | null> {
    return ApiKey.findOne({
      where: { id, organizationId },
      attributes: { exclude: ['keyHash'] },
    });
  }

  /**
   * Update an API key
   */
  async updateKey(
    id: string,
    organizationId: string,
    updates: {
      name?: string;
      description?: string;
      scopes?: ApiKeyScope[];
      rateLimit?: number;
      expiresAt?: Date | null;
    }
  ): Promise<ApiKey | null> {
    const apiKey = await ApiKey.findOne({ where: { id, organizationId } });
    if (!apiKey) return null;

    await apiKey.update(updates);
    return apiKey;
  }

  /**
   * Revoke (deactivate) an API key
   */
  async revokeKey(id: string, organizationId: string): Promise<boolean> {
    const apiKey = await ApiKey.findOne({ where: { id, organizationId } });
    if (!apiKey) return false;

    await apiKey.update({ isActive: false });
    return true;
  }

  /**
   * Delete an API key permanently
   */
  async deleteKey(id: string, organizationId: string): Promise<boolean> {
    const result = await ApiKey.destroy({ where: { id, organizationId } });
    return result > 0;
  }

  /**
   * Rotate an API key (create new, deactivate old)
   */
  async rotateKey(id: string, organizationId: string): Promise<CreateApiKeyResult | null> {
    const oldKey = await ApiKey.findOne({ where: { id, organizationId } });
    if (!oldKey) return null;

    // Create new key with same settings
    const result = await this.createKey({
      organizationId: oldKey.organizationId,
      name: `${oldKey.name} (rotated)`,
      description: oldKey.description || undefined,
      scopes: oldKey.scopes,
      rateLimit: oldKey.rateLimit,
      createdById: oldKey.createdById || undefined,
    });

    // Deactivate old key
    await oldKey.update({ isActive: false });

    return result;
  }

  /**
   * Get usage statistics for an API key
   */
  async getKeyStats(
    id: string,
    organizationId: string
  ): Promise<{
    usageCount: number;
    lastUsedAt: Date | null;
    createdAt: Date;
    isActive: boolean;
    scopes: ApiKeyScope[];
  } | null> {
    const apiKey = await ApiKey.findOne({
      where: { id, organizationId },
      attributes: ['usageCount', 'lastUsedAt', 'createdAt', 'isActive', 'scopes'],
    });

    if (!apiKey) return null;

    return {
      usageCount: apiKey.usageCount,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
      isActive: apiKey.isActive,
      scopes: apiKey.scopes,
    };
  }

  /**
   * Clean up expired rate limit entries (call periodically)
   */
  cleanupRateLimits(): void {
    const now = Date.now();
    for (const [key, record] of this.rateLimitMap.entries()) {
      if (now >= record.resetAt) {
        this.rateLimitMap.delete(key);
      }
    }
  }
}

export const apiKeyService = new ApiKeyService();
export default apiKeyService;
