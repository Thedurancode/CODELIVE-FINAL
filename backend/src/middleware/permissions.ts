/**
 * Permission Middleware
 *
 * Fine-grained permission checking middleware for Express routes.
 * Integrates with the new permission system while maintaining backward
 * compatibility with existing role-based checks.
 */

import { Request, Response, NextFunction } from 'express';
import { permissionService } from '../services/PermissionService';
import { ResourceType, ActionType, PermissionCode } from '../models/Permission';

/**
 * Middleware to require specific permission(s)
 *
 * @example
 * // Single permission
 * router.get('/deals', authenticate, requirePermission('deal:view'), getDealController);
 *
 * // Multiple permissions (any)
 * router.get('/deals', authenticate, requireAnyPermission(['deal:view', 'deal:manage']), getDealController);
 */
export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please log in to access this resource',
      });
      return;
    }

    try {
      // Get organization from user or request
      const organizationId = (req.user as any).organizationId || req.params.organizationId;

      const result = await permissionService.checkPermission(
        req.user.id,
        permission,
        organizationId
      );

      if (!result.allowed) {
        res.status(403).json({
          success: false,
          error: 'Permission denied',
          message: `You do not have permission to perform this action. Required: ${permission}`,
          requiredPermission: permission,
        });
        return;
      }

      // Attach permissions to request for use in controllers
      (req as any).userPermissions = result.permissions;

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        message: 'An error occurred while checking permissions',
      });
    }
  };
};

/**
 * Middleware to require any of the specified permissions
 */
export const requireAnyPermission = (permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please log in to access this resource',
      });
      return;
    }

    try {
      const organizationId = (req.user as any).organizationId || req.params.organizationId;

      const hasPermission = await permissionService.hasAnyPermission(
        req.user.id,
        permissions,
        organizationId
      );

      if (!hasPermission) {
        res.status(403).json({
          success: false,
          error: 'Permission denied',
          message: `You do not have any of the required permissions: ${permissions.join(', ')}`,
          requiredPermissions: permissions,
        });
        return;
      }

      const userPerms = await permissionService.getUserPermissions(req.user.id, organizationId);
      (req as any).userPermissions = userPerms.permissions;

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        message: 'An error occurred while checking permissions',
      });
    }
  };
};

/**
 * Middleware to require all of the specified permissions
 */
export const requireAllPermissions = (permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please log in to access this resource',
      });
      return;
    }

    try {
      const organizationId = (req.user as any).organizationId || req.params.organizationId;

      const hasAllPermissions = await permissionService.hasAllPermissions(
        req.user.id,
        permissions,
        organizationId
      );

      if (!hasAllPermissions) {
        res.status(403).json({
          success: false,
          error: 'Permission denied',
          message: `You must have all of these permissions: ${permissions.join(', ')}`,
          requiredPermissions: permissions,
        });
        return;
      }

      const userPerms = await permissionService.getUserPermissions(req.user.id, organizationId);
      (req as any).userPermissions = userPerms.permissions;

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        message: 'An error occurred while checking permissions',
      });
    }
  };
};

/**
 * Middleware to check resource-action permission
 *
 * @example
 * router.post('/deals', authenticate, requireResourceAction('deal', 'create'), createDealController);
 */
export const requireResourceAction = (resource: ResourceType, action: ActionType) => {
  return requirePermission(`${resource}:${action}` as PermissionCode);
};

/**
 * Middleware that attaches user permissions to request without blocking
 * Useful for controllers that need to check permissions conditionally
 */
export const attachPermissions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.user) {
    try {
      const organizationId = (req.user as any).organizationId;
      const userPerms = await permissionService.getUserPermissions(req.user.id, organizationId);
      (req as any).userPermissions = userPerms.permissions;
      (req as any).userRoles = userPerms.roles;
    } catch (error) {
      console.error('Failed to attach permissions:', error);
      // Don't block the request, just continue without permissions
    }
  }
  next();
};

/**
 * Higher-order function to create permission checks for specific resource types
 *
 * @example
 * const dealPermissions = createResourcePermissionChecks('deal');
 * router.get('/deals', authenticate, dealPermissions.view(), getDeals);
 * router.post('/deals', authenticate, dealPermissions.create(), createDeal);
 */
export const createResourcePermissionChecks = (resource: ResourceType) => {
  return {
    view: () => requireResourceAction(resource, 'view'),
    create: () => requireResourceAction(resource, 'create'),
    edit: () => requireResourceAction(resource, 'edit'),
    delete: () => requireResourceAction(resource, 'delete'),
    approve: () => requireResourceAction(resource, 'approve'),
    export: () => requireResourceAction(resource, 'export'),
    manage: () => requireResourceAction(resource, 'manage'),
  };
};

// Pre-configured permission checks for common resources
export const propertyPermissions = createResourcePermissionChecks('property');
export const dealPermissions = createResourcePermissionChecks('deal');
export const contactPermissions = createResourcePermissionChecks('contact');
export const documentPermissions = createResourcePermissionChecks('document');
export const compliancePermissions = createResourcePermissionChecks('compliance');
export const pipelinePermissions = createResourcePermissionChecks('pipeline');
export const portfolioPermissions = createResourcePermissionChecks('portfolio');
export const userPermissions = createResourcePermissionChecks('user');
export const organizationPermissions = createResourcePermissionChecks('organization');
export const settingsPermissions = createResourcePermissionChecks('settings');
export const analyticsPermissions = createResourcePermissionChecks('analytics');
export const brokerPermissions = createResourcePermissionChecks('broker');
export const contractPermissions = createResourcePermissionChecks('contract');
export const inquiryPermissions = createResourcePermissionChecks('inquiry');
export const notificationPermissions = createResourcePermissionChecks('notification');

/**
 * Express Request extension to include permissions
 */
declare global {
  namespace Express {
    interface Request {
      userPermissions?: string[];
      userRoles?: string[];
    }
  }
}

export default {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireResourceAction,
  attachPermissions,
  createResourcePermissionChecks,
  propertyPermissions,
  dealPermissions,
  contactPermissions,
  documentPermissions,
  compliancePermissions,
  pipelinePermissions,
  portfolioPermissions,
  userPermissions,
  organizationPermissions,
  settingsPermissions,
  analyticsPermissions,
  brokerPermissions,
  contractPermissions,
  inquiryPermissions,
  notificationPermissions,
};
