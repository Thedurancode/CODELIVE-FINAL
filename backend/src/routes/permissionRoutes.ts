/**
 * Permission Routes
 *
 * API routes for managing permissions, roles, and user assignments.
 * Implements fine-grained access control for the permission system itself.
 */

import { Router } from 'express';
import * as permissionController from '../controllers/permissionController';
import { authenticate, requireAdmin } from '../middleware/auth';
import { requirePermission, requireAnyPermission } from '../middleware/permissions';
import { PERMISSION_CODES } from '../models/Permission';

const router = Router();

// =============================================================================
// PERMISSION ROUTES
// =============================================================================

/**
 * @swagger
 * /api/permissions:
 *   get:
 *     summary: Get all available permissions
 *     description: Returns all defined permissions grouped by resource type
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of permissions
 *       401:
 *         description: Authentication required
 */
router.get('/', authenticate, permissionController.getAllPermissions);

/**
 * @swagger
 * /api/permissions/resource/{resourceType}:
 *   get:
 *     summary: Get permissions for a resource type
 *     description: Returns permissions filtered by resource type
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resourceType
 *         required: true
 *         schema:
 *           type: string
 *         description: The resource type (e.g., property, deal, contact)
 *     responses:
 *       200:
 *         description: List of permissions for the resource
 */
router.get('/resource/:resourceType', authenticate, permissionController.getPermissionsByResource);

/**
 * @swagger
 * /api/permissions/me:
 *   get:
 *     summary: Get current user's permissions
 *     description: Returns all permissions and roles for the authenticated user
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's permissions and roles
 *       401:
 *         description: Authentication required
 */
router.get('/me', authenticate, permissionController.getMyPermissions);

/**
 * @swagger
 * /api/permissions/check:
 *   post:
 *     summary: Check if user has specific permissions
 *     description: Checks if the current user has one or more permissions
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *               mode:
 *                 type: string
 *                 enum: [any, all]
 *                 default: any
 *     responses:
 *       200:
 *         description: Permission check result
 */
router.post('/check', authenticate, permissionController.checkPermissions);

// =============================================================================
// ROLE ROUTES
// =============================================================================

/**
 * @swagger
 * /api/permissions/roles:
 *   get:
 *     summary: Get all roles
 *     description: Returns all global and organization-specific roles
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles
 */
router.get('/roles', authenticate, permissionController.getAllRoles);

/**
 * @swagger
 * /api/permissions/roles:
 *   post:
 *     summary: Create a new custom role
 *     description: Creates a new role with specified permissions (admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - permissions
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *               isDefault:
 *                 type: boolean
 *               priority:
 *                 type: number
 *     responses:
 *       201:
 *         description: Role created successfully
 *       400:
 *         description: Invalid request
 *       403:
 *         description: Admin access required
 */
router.post(
  '/roles',
  authenticate,
  requireAnyPermission([PERMISSION_CODES.USER_MANAGE, 'user:manage']),
  permissionController.createRole
);

/**
 * @swagger
 * /api/permissions/roles/{roleId}:
 *   get:
 *     summary: Get a specific role
 *     description: Returns details for a specific role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role details
 *       404:
 *         description: Role not found
 */
router.get('/roles/:roleId', authenticate, permissionController.getRoleById);

/**
 * @swagger
 * /api/permissions/roles/{roleId}:
 *   put:
 *     summary: Update a role
 *     description: Updates a role's properties and permissions (admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       403:
 *         description: Cannot modify system role
 *       404:
 *         description: Role not found
 */
router.put(
  '/roles/:roleId',
  authenticate,
  requireAnyPermission([PERMISSION_CODES.USER_MANAGE, 'user:manage']),
  permissionController.updateRole
);

/**
 * @swagger
 * /api/permissions/roles/{roleId}:
 *   delete:
 *     summary: Delete a custom role
 *     description: Deletes a custom role (admin only, cannot delete system roles)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role deleted successfully
 *       403:
 *         description: Cannot delete system role
 *       404:
 *         description: Role not found
 */
router.delete(
  '/roles/:roleId',
  authenticate,
  requireAnyPermission([PERMISSION_CODES.USER_MANAGE, 'user:manage']),
  permissionController.deleteRole
);

/**
 * @swagger
 * /api/permissions/roles/{roleId}/users:
 *   get:
 *     summary: Get users assigned to a role
 *     description: Returns all users who have been assigned a specific role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of users with the role
 */
router.get(
  '/roles/:roleId/users',
  authenticate,
  requireAnyPermission([PERMISSION_CODES.USER_VIEW, PERMISSION_CODES.USER_MANAGE]),
  permissionController.getUsersByRole
);

// =============================================================================
// USER PERMISSION ROUTES (Admin)
// =============================================================================

/**
 * @swagger
 * /api/permissions/users/{userId}:
 *   get:
 *     summary: Get a user's permissions
 *     description: Returns all permissions and roles for a specific user (admin only)
 *     tags: [User Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User's permissions and roles
 *       403:
 *         description: Admin access required
 */
router.get(
  '/users/:userId',
  authenticate,
  requireAnyPermission([PERMISSION_CODES.USER_VIEW, PERMISSION_CODES.USER_MANAGE]),
  permissionController.getUserPermissions
);

/**
 * @swagger
 * /api/permissions/users/{userId}/roles:
 *   post:
 *     summary: Assign a role to a user
 *     description: Assigns a role to a user (admin only)
 *     tags: [User Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               roleId:
 *                 type: string
 *               roleName:
 *                 type: string
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Role assigned successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Role not found
 */
router.post(
  '/users/:userId/roles',
  authenticate,
  requireAnyPermission([PERMISSION_CODES.USER_MANAGE, 'user:manage']),
  permissionController.assignRoleToUser
);

/**
 * @swagger
 * /api/permissions/users/{userId}/roles/{roleId}:
 *   delete:
 *     summary: Revoke a role from a user
 *     description: Revokes a role assignment from a user (admin only)
 *     tags: [User Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role revoked successfully
 *       404:
 *         description: Role assignment not found
 */
router.delete(
  '/users/:userId/roles/:roleId',
  authenticate,
  requireAnyPermission([PERMISSION_CODES.USER_MANAGE, 'user:manage']),
  permissionController.revokeRoleFromUser
);

export default router;
