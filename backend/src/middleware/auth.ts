/**
 * Authentication Middleware
 *
 * Supabase token validation and role-based access control.
 * Supports local mode (USE_LOCAL_AUTH=true) for development without Supabase.
 */

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import MarketplaceUser from '../models/MarketplaceUser';
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const USE_LOCAL_AUTH = process.env.USE_LOCAL_AUTH === 'true';

/**
 * Decode JWT payload without verification (for local dev mode)
 */
const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

type MarketplaceRole =
  | 'buyer'
  | 'investor'
  | 'wholesaler'
  | 'agent'
  | 'broker'
  | 'broker_assistant'
  | 'transaction_coordinator'
  | 'team_member'
  | 'admin'
  | 'super_admin'
  | 'client';

const DEFAULT_ROLE: MarketplaceRole = 'buyer';
const ALLOWED_ROLES = new Set<MarketplaceRole>([
  'buyer',
  'investor',
  'wholesaler',
  'agent',
  'broker',
  'broker_assistant',
  'transaction_coordinator',
  'team_member',
  'admin',
  'super_admin',
  'client',
]);

const resolveRoleFromAppMetadata = (user: { app_metadata?: Record<string, unknown> | null }): MarketplaceRole => {
  const role = user.app_metadata?.role;
  if (typeof role === 'string' && ALLOWED_ROLES.has(role as MarketplaceRole)) {
    return role as MarketplaceRole;
  }
  return DEFAULT_ROLE;
};

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        organizationId?: string;
      };
    }
  }
}

/**
 * Authentication middleware - validates JWT token
 * Uses local decoding when USE_LOCAL_AUTH=true, otherwise validates with Supabase
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'No token provided',
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    let userId: string;
    let userEmail: string;
    let userName: string;
    let userCompany: string | undefined;
    let userPhone: string | undefined;
    let userRole: MarketplaceRole = DEFAULT_ROLE;

    if (USE_LOCAL_AUTH) {
      // Local mode: decode JWT without Supabase verification
      const payload = decodeJwtPayload(token);
      if (!payload || !payload.sub) {
        res.status(401).json({
          success: false,
          error: 'Authentication failed',
          message: 'Invalid token format',
        });
        return;
      }

      userId = payload.sub as string;
      userEmail = (payload.email as string) || '';
      const userMetadata = payload.user_metadata as Record<string, unknown> | undefined;
      userName = (userMetadata?.name as string) || userEmail.split('@')[0];
      userCompany = userMetadata?.company as string | undefined;
      userPhone = userMetadata?.phone as string | undefined;

      const appMetadata = payload.app_metadata as Record<string, unknown> | undefined;
      if (appMetadata?.role && ALLOWED_ROLES.has(appMetadata.role as MarketplaceRole)) {
        userRole = appMetadata.role as MarketplaceRole;
      }
    } else {
      // Production mode: verify token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        res.status(401).json({
          success: false,
          error: 'Authentication failed',
          message: error?.message || 'Invalid token',
        });
        return;
      }

      userId = user.id;
      userEmail = user.email!;
      userName = user.user_metadata?.name || user.email!.split('@')[0];
      userCompany = user.user_metadata?.company;
      userPhone = user.user_metadata?.phone;
      userRole = resolveRoleFromAppMetadata(user);
    }

    // Get user from database with explicit attributes to avoid missing column errors
    let dbUser = await MarketplaceUser.findByPk(userId, {
      attributes: ['id', 'email', 'name', 'company', 'phone', 'role', 'organizationId'],
    });

    // If user doesn't exist, create using raw SQL to avoid model default issues
    if (!dbUser) {
      await sequelize.query(
        `INSERT INTO marketplace_users (id, email, name, company, phone, role, verified, "createdAt", "updatedAt", "lastActiveAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        {
          bind: [userId, userEmail, userName, userCompany || null, userPhone || null, userRole, true],
          type: QueryTypes.INSERT,
        }
      );
      // Fetch the user after creation
      dbUser = await MarketplaceUser.findByPk(userId, {
        attributes: ['id', 'email', 'name', 'company', 'phone', 'role', 'organizationId'],
      });
    }

    if (!dbUser) {
      res.status(401).json({
        success: false,
        error: 'Authentication failed',
        message: 'Could not find or create user',
      });
      return;
    }

    // Auto-generate organizationId if not set (use user's own ID as their org)
    let userOrgId = dbUser.organizationId;
    if (!userOrgId) {
      userOrgId = dbUser.id;
      await sequelize.query(
        `UPDATE marketplace_users SET organization_id = $1 WHERE id = $2`,
        { bind: [userOrgId, dbUser.id], type: QueryTypes.UPDATE }
      );
      console.log(`Auto-set organizationId=${userOrgId} for user ${dbUser.id}`);
    }

    // Attach user to request
    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      organizationId: userOrgId,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Invalid token',
    });
  }
};

/**
 * Optional authentication - attaches user if token present, continues if not
 * Uses local decoding when USE_LOCAL_AUTH=true, otherwise validates with Supabase
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.split(' ')[1];

    let userId: string | null = null;
    let userEmail: string = '';
    let userName: string = '';
    let userRole: MarketplaceRole = DEFAULT_ROLE;

    if (USE_LOCAL_AUTH) {
      // Local mode: decode JWT without Supabase verification
      const payload = decodeJwtPayload(token);
      if (payload && payload.sub) {
        userId = payload.sub as string;
        userEmail = (payload.email as string) || '';
        const userMetadata = payload.user_metadata as Record<string, unknown> | undefined;
        userName = (userMetadata?.name as string) || userEmail.split('@')[0];

        const appMetadata = payload.app_metadata as Record<string, unknown> | undefined;
        if (appMetadata?.role && ALLOWED_ROLES.has(appMetadata.role as MarketplaceRole)) {
          userRole = appMetadata.role as MarketplaceRole;
        }
      }
    } else {
      // Production mode: verify token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
        userEmail = user.email!;
        userName = user.user_metadata?.name || user.email!.split('@')[0];
        userRole = resolveRoleFromAppMetadata(user);
      }
    }

    if (userId) {
      // Get user with explicit attributes to avoid missing column errors
      let dbUser = await MarketplaceUser.findByPk(userId, {
        attributes: ['id', 'email', 'name', 'company', 'phone', 'role', 'organizationId'],
      });

      // If user doesn't exist, create using raw SQL
      if (!dbUser) {
        await sequelize.query(
          `INSERT INTO marketplace_users (id, email, name, role, verified, "createdAt", "updatedAt", "lastActiveAt")
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          {
            bind: [userId, userEmail, userName, userRole, true],
            type: QueryTypes.INSERT,
          }
        );
        dbUser = await MarketplaceUser.findByPk(userId, {
          attributes: ['id', 'email', 'name', 'company', 'phone', 'role', 'organizationId'],
        });
      }

      if (dbUser) {
        req.user = {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
          organizationId: dbUser.organizationId,
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
export const authorize = (...allowedRoles: string[]) => {
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
export const authorizeOwner = (getOwnerId: (req: Request) => string | Promise<string>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Admins and super admins can access any resource
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
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
 * Require admin or super admin role
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin access required',
    });
    return;
  }

  next();
};

/**
 * Require super admin role only
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (req.user.role !== 'super_admin') {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Super admin access required',
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
  requireSuperAdmin,
};
