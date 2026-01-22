/**
 * Permission Hooks
 *
 * React hooks for managing and checking user permissions in the frontend.
 * Integrates with the backend permission system.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Permission types from backend
export type ResourceType =
  | 'property'
  | 'deal'
  | 'contact'
  | 'document'
  | 'compliance'
  | 'pipeline'
  | 'portfolio'
  | 'user'
  | 'organization'
  | 'settings'
  | 'analytics'
  | 'broker'
  | 'contract'
  | 'inquiry'
  | 'notification';

export type ActionType = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'manage';

export interface Permission {
  id: string;
  code: string;
  name: string;
  description?: string;
  resourceType: ResourceType;
  action: ActionType;
  isSystem: boolean;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;
  permissions: string[];
  permissionCount?: number;
  isSystem: boolean;
  isDefault: boolean;
  priority: number;
  createdAt: string;
}

export interface UserPermissions {
  userId: string;
  organizationId?: string;
  permissions: string[];
  roles: {
    id: string;
    name: string;
    description?: string;
    isSystem: boolean;
  }[];
  cachedAt: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  checkedPermissions: string[];
  mode: 'any' | 'all';
}

// =============================================================================
// USER PERMISSIONS HOOKS
// =============================================================================

/**
 * Get current user's permissions
 */
export function useMyPermissions() {
  return useQuery({
    queryKey: ['permissions', 'me'],
    queryFn: () => api.get<UserPermissions>('/api/permissions/me'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

/**
 * Check if current user has specific permissions
 */
export function useCheckPermissions(permissions: string[], mode: 'any' | 'all' = 'any') {
  return useQuery({
    queryKey: ['permissions', 'check', permissions, mode],
    queryFn: () =>
      api.post<PermissionCheckResult>('/api/permissions/check', { permissions, mode }),
    enabled: permissions.length > 0,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to check permissions imperatively
 * Returns a function that checks if user has permission
 */
export function usePermissionCheck() {
  const { data: userPerms, isLoading } = useMyPermissions();

  const hasPermission = (permission: string): boolean => {
    if (!userPerms?.permissions) return false;
    return userPerms.permissions.includes(permission);
  };

  const hasAnyPermission = (permissions: string[]): boolean => {
    if (!userPerms?.permissions) return false;
    return permissions.some((p) => userPerms.permissions.includes(p));
  };

  const hasAllPermissions = (permissions: string[]): boolean => {
    if (!userPerms?.permissions) return false;
    return permissions.every((p) => userPerms.permissions.includes(p));
  };

  const canPerform = (resource: ResourceType, action: ActionType): boolean => {
    return hasPermission(`${resource}:${action}`);
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canPerform,
    permissions: userPerms?.permissions || [],
    roles: userPerms?.roles || [],
    isLoading,
  };
}

// =============================================================================
// ALL PERMISSIONS & ROLES HOOKS
// =============================================================================

/**
 * Get all available permissions
 */
export function useAllPermissions() {
  return useQuery({
    queryKey: ['permissions', 'all'],
    queryFn: () =>
      api.get<{
        permissions: Permission[];
        grouped: Record<string, Permission[]>;
        codes: Record<string, string>;
      }>('/api/permissions'),
    staleTime: 30 * 60 * 1000, // 30 minutes - permissions rarely change
  });
}

/**
 * Get all roles
 */
export function useRoles(organizationId?: string) {
  return useQuery({
    queryKey: ['permissions', 'roles', organizationId],
    queryFn: () =>
      api.get<Role[]>(`/api/permissions/roles${organizationId ? `?organizationId=${organizationId}` : ''}`),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get a specific role
 */
export function useRole(roleId: string) {
  return useQuery({
    queryKey: ['permissions', 'roles', roleId],
    queryFn: () => api.get<Role & { assignedUsers: number }>(`/api/permissions/roles/${roleId}`),
    enabled: !!roleId,
  });
}

// =============================================================================
// ROLE MANAGEMENT MUTATIONS
// =============================================================================

/**
 * Create a new role
 */
export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      permissions: string[];
      isDefault?: boolean;
      priority?: number;
    }) => api.post<Role>('/api/permissions/roles', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', 'roles'] });
    },
  });
}

/**
 * Update a role
 */
export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      roleId,
      data,
    }: {
      roleId: string;
      data: {
        name?: string;
        description?: string;
        permissions?: string[];
        isDefault?: boolean;
        priority?: number;
      };
    }) => api.put<Role>(`/api/permissions/roles/${roleId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['permissions', 'roles'] });
      queryClient.invalidateQueries({ queryKey: ['permissions', 'roles', variables.roleId] });
    },
  });
}

/**
 * Delete a role
 */
export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roleId: string) => api.delete(`/api/permissions/roles/${roleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', 'roles'] });
    },
  });
}

// =============================================================================
// USER ROLE ASSIGNMENT MUTATIONS
// =============================================================================

/**
 * Get a user's permissions (admin only)
 */
export function useUserPermissions(userId: string) {
  return useQuery({
    queryKey: ['permissions', 'users', userId],
    queryFn: () => api.get<UserPermissions>(`/api/permissions/users/${userId}`),
    enabled: !!userId,
  });
}

/**
 * Assign a role to a user
 */
export function useAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      roleId,
      roleName,
      expiresAt,
    }: {
      userId: string;
      roleId?: string;
      roleName?: string;
      expiresAt?: string;
    }) =>
      api.post(`/api/permissions/users/${userId}/roles`, {
        roleId,
        roleName,
        expiresAt,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['permissions', 'users', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['permissions', 'me'] });
    },
  });
}

/**
 * Revoke a role from a user
 */
export function useRevokeRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api.delete(`/api/permissions/users/${userId}/roles/${roleId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['permissions', 'users', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['permissions', 'me'] });
    },
  });
}

/**
 * Get users assigned to a role
 */
export function useRoleUsers(roleId: string) {
  return useQuery({
    queryKey: ['permissions', 'roles', roleId, 'users'],
    queryFn: () =>
      api.get<
        {
          userId: string;
          assignedAt: string;
          expiresAt?: string;
          isActive: boolean;
        }[]
      >(`/api/permissions/roles/${roleId}/users`),
    enabled: !!roleId,
  });
}

// =============================================================================
// PERMISSION CONSTANTS (for frontend use)
// =============================================================================

export const PERMISSION_CODES = {
  // Property permissions
  PROPERTY_VIEW: 'property:view',
  PROPERTY_CREATE: 'property:create',
  PROPERTY_EDIT: 'property:edit',
  PROPERTY_DELETE: 'property:delete',
  PROPERTY_APPROVE: 'property:approve',
  PROPERTY_EXPORT: 'property:export',

  // Deal permissions
  DEAL_VIEW: 'deal:view',
  DEAL_CREATE: 'deal:create',
  DEAL_EDIT: 'deal:edit',
  DEAL_DELETE: 'deal:delete',
  DEAL_APPROVE: 'deal:approve',
  DEAL_MANAGE: 'deal:manage',

  // Contact permissions
  CONTACT_VIEW: 'contact:view',
  CONTACT_CREATE: 'contact:create',
  CONTACT_EDIT: 'contact:edit',
  CONTACT_DELETE: 'contact:delete',
  CONTACT_EXPORT: 'contact:export',

  // Document permissions
  DOCUMENT_VIEW: 'document:view',
  DOCUMENT_CREATE: 'document:create',
  DOCUMENT_EDIT: 'document:edit',
  DOCUMENT_DELETE: 'document:delete',
  DOCUMENT_APPROVE: 'document:approve',

  // Compliance permissions
  COMPLIANCE_VIEW: 'compliance:view',
  COMPLIANCE_CREATE: 'compliance:create',
  COMPLIANCE_EDIT: 'compliance:edit',
  COMPLIANCE_DELETE: 'compliance:delete',
  COMPLIANCE_APPROVE: 'compliance:approve',
  COMPLIANCE_MANAGE: 'compliance:manage',

  // User management
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_EDIT: 'user:edit',
  USER_DELETE: 'user:delete',
  USER_MANAGE: 'user:manage',

  // Analytics
  ANALYTICS_VIEW: 'analytics:view',
  ANALYTICS_EXPORT: 'analytics:export',
  ANALYTICS_MANAGE: 'analytics:manage',

  // Settings
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_EDIT: 'settings:edit',
  SETTINGS_MANAGE: 'settings:manage',
} as const;

export default {
  useMyPermissions,
  useCheckPermissions,
  usePermissionCheck,
  useAllPermissions,
  useRoles,
  useRole,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useUserPermissions,
  useAssignRole,
  useRevokeRole,
  useRoleUsers,
  PERMISSION_CODES,
};
