/**
 * API Key Management Controller
 *
 * Handles creation, listing, and management of API keys.
 * These endpoints use JWT auth (internal dashboard), not API key auth.
 */

import { Request, Response } from 'express';
import { apiKeyService } from '../services/ApiKeyService';
import { ApiKeyScope } from '../models/ApiKey';

// Valid scopes that can be assigned to API keys
const VALID_SCOPES: ApiKeyScope[] = [
  'sprites:read',
  'sprites:write',
  'sprites:execute',
  'tasks:read',
  'tasks:write',
  'files:read',
  'files:write',
  'chat:read',
  'chat:write',
  'projects:read',
  'projects:write',
  '*',
];

/**
 * List all API keys for the organization
 */
export const listApiKeys = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization not found',
        timestamp: new Date().toISOString(),
      });
    }

    const keys = await apiKeyService.getKeysByOrganization(organizationId);

    res.json({
      success: true,
      data: keys,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get a specific API key
 */
export const getApiKey = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization not found',
        timestamp: new Date().toISOString(),
      });
    }

    const key = await apiKeyService.getKeyById(id, organizationId);

    if (!key) {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: key,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Create a new API key
 */
export const createApiKey = async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    const { name, description, scopes = ['sprites:read'], expiresAt, rateLimit } = req.body;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'name is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Validate scopes
    const validatedScopes: ApiKeyScope[] = [];
    for (const scope of scopes) {
      if (!VALID_SCOPES.includes(scope)) {
        return res.status(400).json({
          success: false,
          error: `Invalid scope: ${scope}. Valid scopes: ${VALID_SCOPES.join(', ')}`,
          timestamp: new Date().toISOString(),
        });
      }
      validatedScopes.push(scope);
    }

    // Parse expiration date if provided
    let parsedExpiresAt: Date | undefined;
    if (expiresAt) {
      parsedExpiresAt = new Date(expiresAt);
      if (isNaN(parsedExpiresAt.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid expiresAt date format',
          timestamp: new Date().toISOString(),
        });
      }
    }

    const result = await apiKeyService.createKey({
      organizationId,
      name: name.trim(),
      description: description?.trim() || undefined,
      scopes: validatedScopes,
      expiresAt: parsedExpiresAt,
      createdById: userId,
      rateLimit: rateLimit ? Math.max(1, Math.min(1000, Number(rateLimit))) : undefined,
    });

    // Return the full key ONCE - it won't be retrievable again
    res.status(201).json({
      success: true,
      data: {
        id: result.apiKey.id,
        name: result.apiKey.name,
        description: result.apiKey.description,
        keyPrefix: result.apiKey.keyPrefix,
        scopes: result.apiKey.scopes,
        rateLimit: result.apiKey.rateLimit,
        expiresAt: result.apiKey.expiresAt,
        createdAt: result.apiKey.createdAt,
        // IMPORTANT: This is the only time the full key is returned
        key: result.fullKey,
      },
      message: 'Store this key securely - it will not be shown again',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Update an API key
 */
export const updateApiKey = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    const { name, description, scopes, rateLimit, expiresAt } = req.body;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization not found',
        timestamp: new Date().toISOString(),
      });
    }

    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'name must be a non-empty string',
          timestamp: new Date().toISOString(),
        });
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    if (scopes !== undefined) {
      const validatedScopes: ApiKeyScope[] = [];
      for (const scope of scopes) {
        if (!VALID_SCOPES.includes(scope)) {
          return res.status(400).json({
            success: false,
            error: `Invalid scope: ${scope}`,
            timestamp: new Date().toISOString(),
          });
        }
        validatedScopes.push(scope);
      }
      updates.scopes = validatedScopes;
    }

    if (rateLimit !== undefined) {
      updates.rateLimit = Math.max(1, Math.min(1000, Number(rateLimit)));
    }

    if (expiresAt !== undefined) {
      if (expiresAt === null) {
        updates.expiresAt = null;
      } else {
        const parsed = new Date(expiresAt);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'Invalid expiresAt date format',
            timestamp: new Date().toISOString(),
          });
        }
        updates.expiresAt = parsed;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid updates provided',
        timestamp: new Date().toISOString(),
      });
    }

    const key = await apiKeyService.updateKey(id, organizationId, updates as any);

    if (!key) {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: key,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Revoke (deactivate) an API key
 */
export const revokeApiKey = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization not found',
        timestamp: new Date().toISOString(),
      });
    }

    const success = await apiKeyService.revokeKey(id, organizationId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'API key revoked',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Delete an API key permanently
 */
export const deleteApiKey = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization not found',
        timestamp: new Date().toISOString(),
      });
    }

    const success = await apiKeyService.deleteKey(id, organizationId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'API key deleted',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Rotate an API key (create new, deactivate old)
 */
export const rotateApiKey = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization not found',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await apiKeyService.rotateKey(id, organizationId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        id: result.apiKey.id,
        name: result.apiKey.name,
        keyPrefix: result.apiKey.keyPrefix,
        scopes: result.apiKey.scopes,
        rateLimit: result.apiKey.rateLimit,
        createdAt: result.apiKey.createdAt,
        // IMPORTANT: This is the only time the full key is returned
        key: result.fullKey,
      },
      message: 'API key rotated. Old key has been deactivated. Store this new key securely.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get usage statistics for an API key
 */
export const getApiKeyStats = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization not found',
        timestamp: new Date().toISOString(),
      });
    }

    const stats = await apiKeyService.getKeyStats(id, organizationId);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get available scopes for API keys
 */
export const getAvailableScopes = async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      scopes: VALID_SCOPES.map((scope) => ({
        value: scope,
        description: getScopeDescription(scope),
      })),
    },
    timestamp: new Date().toISOString(),
  });
};

function getScopeDescription(scope: ApiKeyScope): string {
  const descriptions: Record<ApiKeyScope, string> = {
    'sprites:read': 'Read sprite information and status',
    'sprites:write': 'Create, update, resume, and stop sprites',
    'sprites:execute': 'Execute shell commands on sprites',
    'tasks:read': 'Read task information and status',
    'tasks:write': 'Create and cancel tasks',
    'files:read': 'Read files from sprites',
    'files:write': 'Write and delete files on sprites',
    'chat:read': 'Read chat history',
    'chat:write': 'Send chat messages to Claude',
    'projects:read': 'Read project information',
    'projects:write': 'Create and update projects',
    '*': 'Full access to all resources',
  };
  return descriptions[scope] || scope;
}
