/**
 * Permission Controller
 *
 * Handles API requests for managing permissions, roles, and user assignments.
 */

import { Request, Response } from 'express';
import { permissionService } from '../services/PermissionService';
import Permission, { PERMISSION_CODES, ResourceType } from '../models/Permission';
import Role from '../models/Role';
import UserRole from '../models/UserRole';

/**
 * Get all available permissions
 * GET /api/permissions
 */
export const getAllPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const permissions = await permissionService.getAllPermissions();

    // Group by resource type
    const grouped: Record<string, any[]> = {};
    for (const perm of permissions) {
      if (!grouped[perm.resourceType]) {
        grouped[perm.resourceType] = [];
      }
      grouped[perm.resourceType].push({
        id: perm.id,
        code: perm.code,
        name: perm.name,
        description: perm.description,
        action: perm.action,
        isSystem: perm.isSystem,
      });
    }

    res.json({
      success: true,
      data: {
        permissions,
        grouped,
        codes: PERMISSION_CODES,
      },
    });
  } catch (error) {
    console.error('Get all permissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve permissions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get permissions for a specific resource type
 * GET /api/permissions/resource/:resourceType
 */
export const getPermissionsByResource = async (req: Request, res: Response): Promise<void> => {
  try {
    const { resourceType } = req.params;

    const permissions = await Permission.getByResourceType(resourceType as ResourceType);

    res.json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    console.error('Get permissions by resource error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve permissions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get all roles (global and organization-specific)
 * GET /api/permissions/roles
 */
export const getAllRoles = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = (req.user as any)?.organizationId || req.query.organizationId as string;

    const roles = await permissionService.getRoles(organizationId);

    res.json({
      success: true,
      data: roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        organizationId: role.organizationId,
        permissions: role.permissions,
        permissionCount: role.permissions.length,
        isSystem: role.isSystem,
        isDefault: role.isDefault,
        priority: role.priority,
        createdAt: role.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get all roles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve roles',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get a specific role by ID
 * GET /api/permissions/roles/:roleId
 */
export const getRoleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roleId } = req.params;

    const role = await Role.findByPk(roleId);

    if (!role) {
      res.status(404).json({
        success: false,
        error: 'Role not found',
      });
      return;
    }

    // Get users assigned to this role
    const userRoles = await UserRole.getUsersByRole(roleId);

    res.json({
      success: true,
      data: {
        ...role.toJSON(),
        assignedUsers: userRoles.length,
      },
    });
  } catch (error) {
    console.error('Get role by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve role',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Create a new custom role
 * POST /api/permissions/roles
 */
export const createRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, permissions, isDefault, priority } = req.body;
    const organizationId = (req.user as any)?.organizationId || req.body.organizationId;

    if (!name || !permissions || !Array.isArray(permissions)) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Name and permissions array are required',
      });
      return;
    }

    const role = await permissionService.createRole({
      name,
      description,
      permissions,
      organizationId,
      createdBy: req.user?.id,
      isDefault: isDefault || false,
      priority: priority || 0,
    });

    res.status(201).json({
      success: true,
      data: role,
      message: 'Role created successfully',
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create role',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Update a role
 * PUT /api/permissions/roles/:roleId
 */
export const updateRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roleId } = req.params;
    const { name, description, permissions, isDefault, priority } = req.body;

    const role = await Role.findByPk(roleId);

    if (!role) {
      res.status(404).json({
        success: false,
        error: 'Role not found',
      });
      return;
    }

    if (role.isSystem && (name || permissions)) {
      res.status(403).json({
        success: false,
        error: 'Cannot modify system role',
        message: 'System roles cannot have their name or permissions modified',
      });
      return;
    }

    // Update permissions if provided
    if (permissions && Array.isArray(permissions)) {
      await permissionService.updateRolePermissions(roleId, permissions);
    }

    // Update other fields
    const updates: any = {};
    if (name && !role.isSystem) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (isDefault !== undefined) updates.isDefault = isDefault;
    if (priority !== undefined) updates.priority = priority;

    if (Object.keys(updates).length > 0) {
      await role.update(updates);
    }

    const updatedRole = await Role.findByPk(roleId);

    res.json({
      success: true,
      data: updatedRole,
      message: 'Role updated successfully',
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to update role',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Delete a custom role
 * DELETE /api/permissions/roles/:roleId
 */
export const deleteRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roleId } = req.params;

    const deleted = await permissionService.deleteRole(roleId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Role not found or cannot be deleted',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Role deleted successfully',
    });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to delete role',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get current user's permissions
 * GET /api/permissions/me
 */
export const getMyPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const organizationId = (req.user as any)?.organizationId;
    const userPerms = await permissionService.getUserPermissions(req.user.id, organizationId);
    const userRoles = await permissionService.getUserRoles(req.user.id, organizationId);

    res.json({
      success: true,
      data: {
        userId: req.user.id,
        organizationId,
        permissions: userPerms.permissions,
        roles: userRoles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
        })),
        cachedAt: userPerms.cachedAt,
      },
    });
  } catch (error) {
    console.error('Get my permissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve permissions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Check if current user has specific permission(s)
 * POST /api/permissions/check
 */
export const checkPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const { permissions, mode = 'any' } = req.body;

    if (!permissions || !Array.isArray(permissions)) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Permissions array is required',
      });
      return;
    }

    const organizationId = (req.user as any)?.organizationId;
    let hasPermission: boolean;

    if (mode === 'all') {
      hasPermission = await permissionService.hasAllPermissions(
        req.user.id,
        permissions,
        organizationId
      );
    } else {
      hasPermission = await permissionService.hasAnyPermission(
        req.user.id,
        permissions,
        organizationId
      );
    }

    res.json({
      success: true,
      data: {
        allowed: hasPermission,
        checkedPermissions: permissions,
        mode,
      },
    });
  } catch (error) {
    console.error('Check permissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check permissions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get permissions for a specific user (admin only)
 * GET /api/permissions/users/:userId
 */
export const getUserPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const organizationId = req.query.organizationId as string;

    const userPerms = await permissionService.getUserPermissions(userId, organizationId);
    const userRoles = await permissionService.getUserRoles(userId, organizationId);

    res.json({
      success: true,
      data: {
        userId,
        organizationId,
        permissions: userPerms.permissions,
        roles: userRoles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
        })),
      },
    });
  } catch (error) {
    console.error('Get user permissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user permissions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Assign a role to a user
 * POST /api/permissions/users/:userId/roles
 */
export const assignRoleToUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { roleId, roleName, expiresAt } = req.body;
    const organizationId = (req.user as any)?.organizationId || req.body.organizationId;

    if (!roleId && !roleName) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Either roleId or roleName is required',
      });
      return;
    }

    let userRole: UserRole | null;

    if (roleId) {
      userRole = await permissionService.assignRole(
        userId,
        roleId,
        req.user?.id,
        organizationId,
        expiresAt ? new Date(expiresAt) : undefined
      );
    } else {
      userRole = await permissionService.assignRoleByName(
        userId,
        roleName,
        req.user?.id,
        organizationId
      );
    }

    if (!userRole) {
      res.status(404).json({
        success: false,
        error: 'Role not found',
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: userRole,
      message: 'Role assigned successfully',
    });
  } catch (error) {
    console.error('Assign role to user error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to assign role',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Revoke a role from a user
 * DELETE /api/permissions/users/:userId/roles/:roleId
 */
export const revokeRoleFromUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, roleId } = req.params;
    const organizationId = req.query.organizationId as string;

    const revoked = await permissionService.revokeRole(userId, roleId, organizationId);

    if (!revoked) {
      res.status(404).json({
        success: false,
        error: 'Role assignment not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Role revoked successfully',
    });
  } catch (error) {
    console.error('Revoke role from user error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to revoke role',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get users with a specific role
 * GET /api/permissions/roles/:roleId/users
 */
export const getUsersByRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roleId } = req.params;
    const organizationId = req.query.organizationId as string;

    const userRoles = await UserRole.getUsersByRole(roleId, organizationId);

    res.json({
      success: true,
      data: userRoles.map((ur) => ({
        userId: ur.userId,
        assignedAt: ur.createdAt,
        expiresAt: ur.expiresAt,
        isActive: ur.isValid(),
      })),
    });
  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve users',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export default {
  getAllPermissions,
  getPermissionsByResource,
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getMyPermissions,
  checkPermissions,
  getUserPermissions,
  assignRoleToUser,
  revokeRoleFromUser,
  getUsersByRole,
};
