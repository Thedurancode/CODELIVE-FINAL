/**
 * Permission Service
 *
 * Centralized service for managing permissions, roles, and access control.
 * Provides caching, permission checking, and role management.
 */

import Permission, { PermissionCode, PERMISSION_CODES, ResourceType, ActionType } from '../models/Permission';
import Role, { SYSTEM_ROLES } from '../models/Role';
import UserRole from '../models/UserRole';
import MarketplaceUser from '../models/MarketplaceUser';
import { redisService } from './RedisService';

// Cache TTL in seconds
const CACHE_TTL = 300; // 5 minutes

interface UserPermissions {
  userId: string;
  permissions: string[];
  roles: string[];
  organizationId?: string;
  cachedAt: Date;
}

interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  permissions?: string[];
}

class PermissionService {
  private initialized: boolean = false;
  private localCache: Map<string, UserPermissions> = new Map();

  /**
   * Initialize the permission service
   * - Creates default permissions
   * - Creates system roles
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize default permissions
      await Permission.initializeDefaults();
      console.log('✅ Default permissions initialized');

      // Initialize system roles
      await Role.initializeDefaults();
      console.log('✅ System roles initialized');

      this.initialized = true;
      console.log('✅ Permission Service initialized');
    } catch (error) {
      console.error('Failed to initialize permission service:', error);
      throw error;
    }
  }

  /**
   * Get cache key for user permissions
   */
  private getCacheKey(userId: string, organizationId?: string): string {
    return `permissions:${userId}:${organizationId || 'global'}`;
  }

  /**
   * Get all permissions for a user (cached)
   */
  async getUserPermissions(userId: string, organizationId?: string): Promise<UserPermissions> {
    const cacheKey = this.getCacheKey(userId, organizationId);

    // Check Redis cache first
    try {
      const cached = await redisService.get<UserPermissions>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      // Redis unavailable, check local cache
      if (this.localCache.has(cacheKey)) {
        const local = this.localCache.get(cacheKey)!;
        // Check if cache is still valid (5 minutes)
        if (new Date().getTime() - local.cachedAt.getTime() < CACHE_TTL * 1000) {
          return local;
        }
      }
    }

    // Fetch from database
    const userRoles = await UserRole.getActiveForUser(userId, organizationId);

    // Aggregate permissions from all roles
    const permissionsSet = new Set<string>();
    const roleNames: string[] = [];

    for (const userRole of userRoles) {
      const role = await Role.findByPk(userRole.roleId);
      if (role) {
        roleNames.push(role.name);
        role.permissions.forEach((p: string) => permissionsSet.add(p));
      }
    }

    // Also check user's legacy role and map to permissions
    const user = await MarketplaceUser.findByPk(userId);
    if (user) {
      const legacyPermissions = this.getLegacyRolePermissions(user.role);
      legacyPermissions.forEach((p) => permissionsSet.add(p));
    }

    const result: UserPermissions = {
      userId,
      permissions: Array.from(permissionsSet),
      roles: roleNames,
      organizationId,
      cachedAt: new Date(),
    };

    // Cache the result
    try {
      await redisService.set(cacheKey, result, CACHE_TTL);
    } catch (error) {
      // Redis unavailable, use local cache
      this.localCache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Map legacy roles to permissions
   */
  private getLegacyRolePermissions(role: string): string[] {
    const roleMap: Record<string, string[]> = {
      super_admin: [...Object.values(PERMISSION_CODES)] as string[],
      admin: [...Object.values(PERMISSION_CODES)].filter(
        (p) => !p.includes('user:manage') && !p.includes('organization:manage')
      ),
      broker: [...SYSTEM_ROLES.BROKER.permissions] as string[],
      wholesaler: [...SYSTEM_ROLES.WHOLESALER.permissions] as string[],
      agent: [...SYSTEM_ROLES.AGENT.permissions] as string[],
      buyer: [...SYSTEM_ROLES.BUYER.permissions] as string[],
      investor: [...SYSTEM_ROLES.INVESTOR.permissions] as string[],
      team_member: [...SYSTEM_ROLES.TEAM_MEMBER.permissions] as string[],
      broker_assistant: [
        PERMISSION_CODES.PROPERTY_VIEW,
        PERMISSION_CODES.DEAL_VIEW,
        PERMISSION_CODES.DOCUMENT_VIEW,
        PERMISSION_CODES.DOCUMENT_CREATE,
        PERMISSION_CODES.COMPLIANCE_VIEW,
        PERMISSION_CODES.NOTIFICATION_VIEW,
      ],
      transaction_coordinator: [
        PERMISSION_CODES.PROPERTY_VIEW,
        PERMISSION_CODES.DEAL_VIEW,
        PERMISSION_CODES.DEAL_EDIT,
        PERMISSION_CODES.DOCUMENT_VIEW,
        PERMISSION_CODES.DOCUMENT_CREATE,
        PERMISSION_CODES.DOCUMENT_EDIT,
        PERMISSION_CODES.COMPLIANCE_VIEW,
        PERMISSION_CODES.CONTRACT_VIEW,
        PERMISSION_CODES.CONTRACT_CREATE,
        PERMISSION_CODES.NOTIFICATION_VIEW,
      ],
    };

    return roleMap[role] || [...SYSTEM_ROLES.VIEWER.permissions] as string[];
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(
    userId: string,
    permission: string,
    organizationId?: string
  ): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId, organizationId);
    return userPerms.permissions.includes(permission);
  }

  /**
   * Check if user has any of the specified permissions
   */
  async hasAnyPermission(
    userId: string,
    permissions: string[],
    organizationId?: string
  ): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId, organizationId);
    return permissions.some((p) => userPerms.permissions.includes(p));
  }

  /**
   * Check if user has all of the specified permissions
   */
  async hasAllPermissions(
    userId: string,
    permissions: string[],
    organizationId?: string
  ): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId, organizationId);
    return permissions.every((p) => userPerms.permissions.includes(p));
  }

  /**
   * Check permission with detailed result
   */
  async checkPermission(
    userId: string,
    permission: string,
    organizationId?: string
  ): Promise<PermissionCheckResult> {
    const userPerms = await this.getUserPermissions(userId, organizationId);
    const allowed = userPerms.permissions.includes(permission);

    return {
      allowed,
      reason: allowed
        ? `User has permission via roles: ${userPerms.roles.join(', ')}`
        : `User lacks permission: ${permission}`,
      permissions: userPerms.permissions,
    };
  }

  /**
   * Check if user can perform action on resource
   */
  async canPerformAction(
    userId: string,
    resource: ResourceType,
    action: ActionType,
    organizationId?: string
  ): Promise<boolean> {
    const permissionCode = `${resource}:${action}` as PermissionCode;
    return this.hasPermission(userId, permissionCode, organizationId);
  }

  /**
   * Assign a role to a user
   */
  async assignRole(
    userId: string,
    roleId: string,
    assignedBy?: string,
    organizationId?: string,
    expiresAt?: Date
  ): Promise<UserRole> {
    const userRole = await UserRole.assignRole({
      userId,
      roleId,
      organizationId,
      assignedBy,
      expiresAt,
    });

    // Invalidate cache
    await this.invalidateUserCache(userId, organizationId);

    return userRole;
  }

  /**
   * Assign a role by name to a user
   */
  async assignRoleByName(
    userId: string,
    roleName: string,
    assignedBy?: string,
    organizationId?: string
  ): Promise<UserRole | null> {
    const role = await Role.getByName(roleName, organizationId);
    if (!role) return null;

    return this.assignRole(userId, role.id, assignedBy, organizationId);
  }

  /**
   * Revoke a role from a user
   */
  async revokeRole(
    userId: string,
    roleId: string,
    organizationId?: string
  ): Promise<boolean> {
    const result = await UserRole.revokeRole(userId, roleId, organizationId);

    // Invalidate cache
    await this.invalidateUserCache(userId, organizationId);

    return result;
  }

  /**
   * Invalidate user permission cache
   */
  async invalidateUserCache(userId: string, organizationId?: string): Promise<void> {
    const cacheKey = this.getCacheKey(userId, organizationId);

    try {
      await redisService.del(cacheKey);
    } catch (error) {
      // Redis unavailable
    }

    this.localCache.delete(cacheKey);
  }

  /**
   * Create a custom role
   */
  async createRole(data: {
    name: string;
    description?: string;
    permissions: string[];
    organizationId?: string;
    createdBy?: string;
    isDefault?: boolean;
    priority?: number;
  }): Promise<Role> {
    // Validate permissions exist
    for (const perm of data.permissions) {
      const exists = await Permission.getByCode(perm);
      if (!exists && !Object.values(PERMISSION_CODES).includes(perm as PermissionCode)) {
        throw new Error(`Invalid permission code: ${perm}`);
      }
    }

    return Role.create({
      name: data.name,
      description: data.description,
      permissions: data.permissions,
      organizationId: data.organizationId,
      createdBy: data.createdBy,
      isDefault: data.isDefault || false,
      priority: data.priority || 0,
      isSystem: false,
    });
  }

  /**
   * Update a role's permissions
   */
  async updateRolePermissions(
    roleId: string,
    permissions: string[]
  ): Promise<Role | null> {
    const role = await Role.findByPk(roleId);
    if (!role) return null;

    if (role.isSystem) {
      throw new Error('Cannot modify system role permissions');
    }

    // Validate permissions
    for (const perm of permissions) {
      const exists = await Permission.getByCode(perm);
      if (!exists && !Object.values(PERMISSION_CODES).includes(perm as PermissionCode)) {
        throw new Error(`Invalid permission code: ${perm}`);
      }
    }

    await role.update({ permissions });

    // Invalidate cache for all users with this role
    const userRoles = await UserRole.getUsersByRole(roleId);
    for (const userRole of userRoles) {
      await this.invalidateUserCache(userRole.userId, userRole.organizationId);
    }

    return role;
  }

  /**
   * Delete a custom role
   */
  async deleteRole(roleId: string): Promise<boolean> {
    const role = await Role.findByPk(roleId);
    if (!role) return false;

    if (role.isSystem) {
      throw new Error('Cannot delete system role');
    }

    // Get users with this role before deleting
    const userRoles = await UserRole.getUsersByRole(roleId);

    await role.destroy();

    // Invalidate cache for affected users
    for (const userRole of userRoles) {
      await this.invalidateUserCache(userRole.userId, userRole.organizationId);
    }

    return true;
  }

  /**
   * Get all available permissions
   */
  async getAllPermissions(): Promise<Permission[]> {
    return Permission.findAll({
      order: [
        ['resourceType', 'ASC'],
        ['action', 'ASC'],
      ],
    });
  }

  /**
   * Get all roles for an organization
   */
  async getRoles(organizationId?: string): Promise<Role[]> {
    return Role.getByOrganization(organizationId);
  }

  /**
   * Get user's assigned roles
   */
  async getUserRoles(userId: string, organizationId?: string): Promise<Role[]> {
    const userRoles = await UserRole.getActiveForUser(userId, organizationId);
    const roles: Role[] = [];

    for (const userRole of userRoles) {
      const role = await Role.findByPk(userRole.roleId);
      if (role) {
        roles.push(role);
      }
    }

    return roles;
  }

  /**
   * Get permission codes for a resource type
   */
  getPermissionsForResource(resource: ResourceType): string[] {
    return Object.values(PERMISSION_CODES).filter((p) =>
      p.startsWith(`${resource}:`)
    );
  }

  /**
   * Cleanup expired role assignments
   */
  async cleanupExpiredRoles(): Promise<number> {
    return UserRole.cleanupExpired();
  }
}

// Export singleton instance
export const permissionService = new PermissionService();
export default permissionService;
