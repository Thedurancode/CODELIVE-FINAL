/**
 * API Key Authentication Middleware
 *
 * Authenticates requests using API keys for external application access.
 * Supports both Bearer token and X-API-Key header formats.
 */

import { Request, Response, NextFunction } from 'express';
import { apiKeyService } from '../services/ApiKeyService';
import ApiKey, { ApiKeyScope } from '../models/ApiKey';

// Extend Express Request to include API key context
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      apiKeyOrganizationId?: string;
    }
  }
}

/**
 * Extract API key from request headers
 * Supports:
 * - Authorization: Bearer sk_live_xxx
 * - X-API-Key: sk_live_xxx
 */
function extractApiKey(req: Request): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token.startsWith('sk_live_')) {
      return token;
    }
  }

  // Check X-API-Key header
  const xApiKey = req.headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.startsWith('sk_live_')) {
    return xApiKey;
  }

  return null;
}

/**
 * Basic API key authentication middleware
 * Validates the API key and attaches it to the request
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const key = extractApiKey(req);

  if (!key) {
    res.status(401).json({
      success: false,
      error: 'API key required',
      message: 'Provide an API key via Authorization: Bearer sk_live_xxx or X-API-Key header',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  apiKeyService
    .validateKey(key)
    .then((result) => {
      if (!result.valid || !result.apiKey) {
        res.status(401).json({
          success: false,
          error: result.error || 'Invalid API key',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Attach API key context to request
      req.apiKey = result.apiKey;
      req.apiKeyOrganizationId = result.apiKey.organizationId;

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', result.apiKey.rateLimit);

      next();
    })
    .catch((error) => {
      console.error('[ApiKeyAuth] Error validating key:', error);
      res.status(500).json({
        success: false,
        error: 'Authentication error',
        timestamp: new Date().toISOString(),
      });
    });
}

/**
 * Scope-checking middleware factory
 * Use after apiKeyAuth to check for specific scopes
 */
export function requireScope(...scopes: ApiKeyScope[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({
        success: false,
        error: 'API key required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const hasScope = req.apiKey.hasAnyScope(scopes);
    if (!hasScope) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `This action requires one of the following scopes: ${scopes.join(', ')}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

/**
 * Combined middleware: authenticate and check scope
 */
export function apiKeyAuthWithScope(...scopes: ApiKeyScope[]) {
  return [apiKeyAuth, requireScope(...scopes)];
}

/**
 * Optional API key auth - doesn't fail if no key provided
 * Useful for endpoints that support both authenticated and anonymous access
 */
export function optionalApiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const key = extractApiKey(req);

  if (!key) {
    // No key provided, continue without authentication
    next();
    return;
  }

  // Key provided, validate it
  apiKeyService
    .validateKey(key)
    .then((result) => {
      if (result.valid && result.apiKey) {
        req.apiKey = result.apiKey;
        req.apiKeyOrganizationId = result.apiKey.organizationId;
        res.setHeader('X-RateLimit-Limit', result.apiKey.rateLimit);
      }
      // Continue even if key is invalid (optional auth)
      next();
    })
    .catch((error) => {
      console.error('[ApiKeyAuth] Error validating key:', error);
      next();
    });
}

export default apiKeyAuth;
