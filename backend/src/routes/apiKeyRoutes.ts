/**
 * API Key Management Routes
 *
 * Routes for managing API keys (create, list, revoke, rotate).
 * These use JWT authentication from the dashboard, not API key auth.
 *
 * Base path: /api/api-keys
 */

import { Router } from 'express';
import * as apiKeyController from '../controllers/apiKeyController';

const router = Router();

// Note: JWT auth middleware should be applied in the main app.ts

/**
 * @swagger
 * /api/api-keys:
 *   get:
 *     summary: List API keys
 *     description: List all API keys for your organization
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       keyPrefix:
 *                         type: string
 *                       scopes:
 *                         type: array
 *                         items:
 *                           type: string
 *                       lastUsedAt:
 *                         type: string
 *                         format: date-time
 *                       isActive:
 *                         type: boolean
 */
router.get('/', apiKeyController.listApiKeys);

/**
 * @swagger
 * /api/api-keys/scopes:
 *   get:
 *     summary: Get available scopes
 *     description: List all available API key scopes
 *     tags: [API Keys]
 *     responses:
 *       200:
 *         description: List of available scopes
 */
router.get('/scopes', apiKeyController.getAvailableScopes);

/**
 * @swagger
 * /api/api-keys/{id}:
 *   get:
 *     summary: Get API key details
 *     description: Get details of a specific API key (not the actual key value)
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key details
 *       404:
 *         description: API key not found
 */
router.get('/:id', apiKeyController.getApiKey);

/**
 * @swagger
 * /api/api-keys/{id}/stats:
 *   get:
 *     summary: Get API key usage stats
 *     description: Get usage statistics for an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usage statistics
 */
router.get('/:id/stats', apiKeyController.getApiKeyStats);

/**
 * @swagger
 * /api/api-keys:
 *   post:
 *     summary: Create API key
 *     description: |
 *       Create a new API key. The full key is only returned once at creation time.
 *       Store it securely as it cannot be retrieved again.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Human-readable name for the key
 *               description:
 *                 type: string
 *                 description: Optional description
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [sprites:read, sprites:write, sprites:execute, tasks:read, tasks:write, files:read, files:write, chat:read, chat:write, projects:read, projects:write, '*']
 *                 default: [sprites:read]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: Optional expiration date
 *               rateLimit:
 *                 type: integer
 *                 default: 60
 *                 description: Requests per minute (1-1000)
 *     responses:
 *       201:
 *         description: API key created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     key:
 *                       type: string
 *                       description: The full API key (only shown once!)
 *                 message:
 *                   type: string
 */
router.post('/', apiKeyController.createApiKey);

/**
 * @swagger
 * /api/api-keys/{id}:
 *   patch:
 *     summary: Update API key
 *     description: Update API key settings (name, scopes, rate limit, expiration)
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *               rateLimit:
 *                 type: integer
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *     responses:
 *       200:
 *         description: API key updated
 *       404:
 *         description: API key not found
 */
router.patch('/:id', apiKeyController.updateApiKey);

/**
 * @swagger
 * /api/api-keys/{id}/revoke:
 *   post:
 *     summary: Revoke API key
 *     description: Deactivate an API key (it can no longer be used)
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key revoked
 *       404:
 *         description: API key not found
 */
router.post('/:id/revoke', apiKeyController.revokeApiKey);

/**
 * @swagger
 * /api/api-keys/{id}/rotate:
 *   post:
 *     summary: Rotate API key
 *     description: |
 *       Create a new API key with the same settings and deactivate the old one.
 *       The new key is only shown once - store it securely.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key rotated - new key returned
 *       404:
 *         description: API key not found
 */
router.post('/:id/rotate', apiKeyController.rotateApiKey);

/**
 * @swagger
 * /api/api-keys/{id}:
 *   delete:
 *     summary: Delete API key
 *     description: Permanently delete an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key deleted
 *       404:
 *         description: API key not found
 */
router.delete('/:id', apiKeyController.deleteApiKey);

export default router;
