/**
 * Better Auth Middleware
 *
 * Session-based authentication middleware using Better Auth.
 * Provides authenticate, optionalAuth, and authorize functions.
 */

import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth, VALID_ROLES, type Role } from '../config/auth';
import MarketplaceUser from '../models/MarketplaceUser';

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
        betterAuthUserId?: string;
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
 * Get or create MarketplaceUser linked to Better Auth user
 */
async function getOrCreateMarketplaceUser(
  betterAuthUserId: string,
  email: string,
  name: string
): Promise<MarketplaceUser> {
  // First try to find by Better Auth user ID
  let dbUser = await MarketplaceUser.findOne({
    where: { betterAuthUserId },
    attributes: ['id', 'email', 'name', 'role', 'betterAuthUserId'],
  });

  if (dbUser) {
    return dbUser;
  }

  // Try to find by email (existing user before migration)
  dbUser = await MarketplaceUser.findOne({
    where: { email },
    attributes: ['id', 'email', 'name', 'role', 'betterAuthUserId'],
  });

  if (dbUser) {
    // Link existing user to Better Auth
    await dbUser.update({ betterAuthUserId });
    return dbUser;
  }

  // Create new user
  dbUser = await MarketplaceUser.create({
    betterAuthUserId,
    email,
    name: name || email.split('@')[0],
    role: 'team_member',
    verified: true,
  });

  return dbUser;
}

/**
 * Authentication middleware - requires valid session
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'No valid session found',
      });
      return;
    }

    // Get or create MarketplaceUser
    const dbUser = await getOrCreateMarketplaceUser(
      session.user.id,
      session.user.email,
      session.user.name || ''
    );

    // Attach user to request
    req.user = {
      id: dbUser.id,
      userId: dbUser.id, // Alias for backward compatibility
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as Role,
      betterAuthUserId: session.user.id,
      organizationId: dbUser.id, // Use user ID as org ID for backward compatibility (orgs removed)
    };

    req.session = {
      id: session.session.id,
      userId: session.user.id,
      expiresAt: new Date(session.session.expiresAt),
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
 * Optional authentication - attaches user if session present, continues if not
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session && session.user) {
      const dbUser = await getOrCreateMarketplaceUser(
        session.user.id,
        session.user.email,
        session.user.name || ''
      );

      req.user = {
        id: dbUser.id,
        userId: dbUser.id, // Alias for backward compatibility
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role as Role,
        betterAuthUserId: session.user.id,
        organizationId: dbUser.id, // Use user ID as org ID for backward compatibility (orgs removed)
      };

      req.session = {
        id: session.session.id,
        userId: session.user.id,
        expiresAt: new Date(session.session.expiresAt),
      };
    }

    next();
  } catch (error) {
    // Session invalid but that's okay for optional auth
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
