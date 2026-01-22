/**
 * Permission Components
 *
 * Export all permission-related components for easy imports.
 */

export { PermissionGate, RequirePermission, usePermissionCheck } from './PermissionGate';
export {
  useMyPermissions,
  useCheckPermissions,
  usePermissionCheck as usePermissions,
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
} from '@/hooks/use-permissions';

export type {
  Permission,
  Role,
  UserPermissions,
  PermissionCheckResult,
  ResourceType,
  ActionType,
} from '@/hooks/use-permissions';
