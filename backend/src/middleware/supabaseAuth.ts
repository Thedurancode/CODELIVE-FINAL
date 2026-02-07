/**
 * Supabase Auth Middleware
 *
 * Token-based authentication middleware using Supabase Auth.
 * Validates JWT tokens from Authorization: Bearer header.
 */

import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import MarketplaceUser from '../models/MarketplaceUser';

// Valid roles for the application
export const VALID_ROLES = ['admin', 'team_member', 'client', 'contact'] as const;
export type Role = (typeof VALID_ROLES)[number];

// Extend Express Request to include user and session
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        userId: string; // Alias for id (backward compatibility)
        email: string;
        name: string;
        role: Role;
        supabaseUserId?: string;
        organizationId?: string; // Deprecated: kept for backward compatibility
      };
      session?: {
        id: string;
        userId: string;
        expiresAt: Date;
      };
    }
  }
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Get or create MarketplaceUser linked to Supabase user
 */
async function getOrCreateMarketplaceUser(
  supabaseUserId: string,
  email: string,
  name: string
): Promise<MarketplaceUser> {
  // First try to find by Supabase user ID
  let dbUser = await MarketplaceUser.findOne({
    where: { supabaseUserId },
    attributes: ['id', 'email', 'name', 'role', 'supabaseUserId', 'organizationId'],
  });

  if (dbUser) {
    return dbUser;
  }

  // Try to find by email (existing user before migration)
  dbUser = await MarketplaceUser.findOne({
    where: { email },
    attributes: ['id', 'email', 'name', 'role', 'supabaseUserId', 'organizationId'],
  });

  if (dbUser) {
    // Link existing user to Supabase
    await dbUser.update({ supabaseUserId });
    return dbUser;
  }

  // Create new user
  dbUser = await MarketplaceUser.create({
    supabaseUserId,
    email,
    name: name || email.split('@')[0],
    role: 'team_member',
    verified: true,
  });

  return dbUser;
}

/**
 * Authentication middleware - requires valid Supabase session
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'No authorization token provided',
      });
      return;
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: error?.message || 'Invalid or expired token',
      });
      return;
    }

    // Get or create MarketplaceUser
    const dbUser = await getOrCreateMarketplaceUser(
      user.id,
      user.email || '',
      user.user_metadata?.name || user.user_metadata?.full_name || ''
    );

    // Attach user to request
    req.user = {
      id: dbUser.id,
      userId: dbUser.id, // Alias for backward compatibility
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as Role,
      supabaseUserId: user.id,
      organizationId: dbUser.organizationId || undefined,
    };

    req.session = {
      id: user.id,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Invalid session',
    });
  }
};

/**
 * Optional authentication - attaches user if token present, continues if not
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractBearerToken(req);

    if (token) {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (user && !error) {
        const dbUser = await getOrCreateMarketplaceUser(
          user.id,
          user.email || '',
          user.user_metadata?.name || user.user_metadata?.full_name || ''
        );

        req.user = {
          id: dbUser.id,
          userId: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role as Role,
          supabaseUserId: user.id,
          organizationId: dbUser.organizationId || undefined,
        };

        req.session = {
          id: user.id,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };
      }
    }

    next();
  } catch (error) {
    // Token invalid but that's okay for optional auth
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Required role: ${allowedRoles.join(' or ')}`,
      });
      return;
    }

    next();
  };
};

/**
 * Resource ownership check - ensures user owns the resource or is admin
 */
export const authorizeOwner = (
  getOwnerId: (req: Request) => string | Promise<string>
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Admins can access any resource
    if (req.user.role === 'admin') {
      next();
      return;
    }

    try {
      const ownerId = await getOwnerId(req);
      if (ownerId !== req.user.id) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You do not have access to this resource',
        });
        return;
      }
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
      });
    }
  };
};

/**
 * Require admin role
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin access required',
    });
    return;
  }

  next();
};

export default {
  authenticate,
  optionalAuth,
  authorize,
  authorizeOwner,
  requireAdmin,
};
