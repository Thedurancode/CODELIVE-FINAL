'use client';

/**
 * PermissionGate Component
 *
 * A component that conditionally renders children based on user permissions.
 * Supports single permission, any permission, or all permissions checks.
 */

import React, { ReactNode } from 'react';
import { usePermissionCheck, ResourceType, ActionType } from '@/hooks/use-permissions';

interface PermissionGateProps {
  /** Single permission to check */
  permission?: string;
  /** Multiple permissions - user needs at least one (unless requireAll is true) */
  permissions?: string[];
  /** If true, user must have ALL permissions in the array */
  requireAll?: boolean;
  /** Resource type for resource:action style permission */
  resource?: ResourceType;
  /** Action type for resource:action style permission */
  action?: ActionType;
  /** Content to render when permission is granted */
  children: ReactNode;
  /** Content to render when permission is denied (optional) */
  fallback?: ReactNode;
  /** If true, shows a loading indicator while checking permissions */
  showLoading?: boolean;
  /** Custom loading component */
  loadingComponent?: ReactNode;
}

/**
 * PermissionGate - Conditionally renders children based on permissions
 *
 * @example
 * // Single permission
 * <PermissionGate permission="deal:view">
 *   <DealList />
 * </PermissionGate>
 *
 * @example
 * // Multiple permissions (any)
 * <PermissionGate permissions={['deal:view', 'deal:manage']}>
 *   <DealList />
 * </PermissionGate>
 *
 * @example
 * // Multiple permissions (all required)
 * <PermissionGate permissions={['deal:view', 'deal:edit']} requireAll>
 *   <DealEditor />
 * </PermissionGate>
 *
 * @example
 * // Resource and action
 * <PermissionGate resource="deal" action="view">
 *   <DealList />
 * </PermissionGate>
 *
 * @example
 * // With fallback
 * <PermissionGate permission="admin:view" fallback={<AccessDenied />}>
 *   <AdminPanel />
 * </PermissionGate>
 */
export function PermissionGate({
  permission,
  permissions,
  requireAll = false,
  resource,
  action,
  children,
  fallback = null,
  showLoading = false,
  loadingComponent,
}: PermissionGateProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, canPerform, isLoading } =
    usePermissionCheck();

  // Show loading state if requested
  if (isLoading && showLoading) {
    return loadingComponent ? <>{loadingComponent}</> : <LoadingSpinner />;
  }

  // Skip permission check during loading
  if (isLoading) {
    return null;
  }

  let hasAccess = false;

  // Check resource:action permission
  if (resource && action) {
    hasAccess = canPerform(resource, action);
  }
  // Check single permission
  else if (permission) {
    hasAccess = hasPermission(permission);
  }
  // Check multiple permissions
  else if (permissions && permissions.length > 0) {
    hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  }
  // No permission specified - allow access
  else {
    hasAccess = true;
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * Simple loading spinner for permission checks
 */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-4">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

/**
 * RequirePermission - Wrapper that shows access denied message
 *
 * @example
 * <RequirePermission permission="admin:view" message="Admin access required">
 *   <AdminPanel />
 * </RequirePermission>
 */
export function RequirePermission({
  permission,
  permissions,
  requireAll = false,
  resource,
  action,
  children,
  message = 'You do not have permission to access this content.',
}: Omit<PermissionGateProps, 'fallback' | 'showLoading' | 'loadingComponent'> & {
  message?: string;
}) {
  return (
    <PermissionGate
      permission={permission}
      permissions={permissions}
      requireAll={requireAll}
      resource={resource}
      action={action}
      fallback={<AccessDeniedMessage message={message} />}
      showLoading
    >
      {children}
    </PermissionGate>
  );
}

/**
 * Default access denied message component
 */
function AccessDeniedMessage({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 rounded-full bg-destructive/10 p-3">
        <svg
          className="h-8 w-8 text-destructive"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">Access Denied</h3>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/**
 * Hook version for programmatic permission checks
 * @deprecated Use usePermissionCheck() directly instead
 */
export { usePermissionCheck };

export default PermissionGate;
