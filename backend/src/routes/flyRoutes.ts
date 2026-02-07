/**
 * Fly.io Routes
 *
 * API endpoints for Fly.io management:
 * - App listing and creation
 * - Machine lifecycle management
 * - Certificate (custom domain) management
 * - Secret management
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import flyController from '../controllers/flyController';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Fly.io
 *   description: Fly.io app and machine management
 */

// ============================================================================
// STATUS
// ============================================================================

/**
 * @swagger
 * /api/fly/status:
 *   get:
 *     summary: Get Fly.io integration status
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Integration status
 */
router.get('/status', flyController.getStatus);

// ============================================================================
// APPS
// ============================================================================

/**
 * @swagger
 * /api/fly/apps:
 *   get:
 *     summary: List Fly.io apps
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of apps
 */
router.get('/apps', flyController.listApps);

/**
 * @swagger
 * /api/fly/apps:
 *   post:
 *     summary: Create a new Fly.io app
 *     tags: [Fly.io]
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
 *             properties:
 *               name:
 *                 type: string
 *                 description: App name (must be globally unique)
 *               org:
 *                 type: string
 *                 description: Organization slug (defaults to personal)
 *     responses:
 *       200:
 *         description: Created app
 */
router.post('/apps', flyController.createApp);

/**
 * @swagger
 * /api/fly/apps/{appName}:
 *   get:
 *     summary: Get a Fly.io app
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: App details
 */
router.get('/apps/:appName', flyController.getApp);

// ============================================================================
// MACHINES
// ============================================================================

/**
 * @swagger
 * /api/fly/apps/{appName}/machines:
 *   get:
 *     summary: List machines for an app
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of machines
 */
router.get('/apps/:appName/machines', flyController.listMachines);

/**
 * @swagger
 * /api/fly/apps/{appName}/machines/{machineId}:
 *   get:
 *     summary: Get machine details
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: machineId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Machine details
 */
router.get('/apps/:appName/machines/:machineId', flyController.getMachine);

/**
 * @swagger
 * /api/fly/apps/{appName}/machines/{machineId}/start:
 *   post:
 *     summary: Start a machine
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: machineId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Machine started
 */
router.post('/apps/:appName/machines/:machineId/start', flyController.startMachine);

/**
 * @swagger
 * /api/fly/apps/{appName}/machines/{machineId}/stop:
 *   post:
 *     summary: Stop a machine
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: machineId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Machine stopped
 */
router.post('/apps/:appName/machines/:machineId/stop', flyController.stopMachine);

/**
 * @swagger
 * /api/fly/apps/{appName}/machines/{machineId}/restart:
 *   post:
 *     summary: Restart a machine
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: machineId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Machine restarted
 */
router.post('/apps/:appName/machines/:machineId/restart', flyController.restartMachine);

/**
 * @swagger
 * /api/fly/apps/{appName}/machines/{machineId}:
 *   delete:
 *     summary: Delete a machine
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: machineId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Machine deleted
 */
router.delete('/apps/:appName/machines/:machineId', flyController.deleteMachine);

// ============================================================================
// CERTIFICATES
// ============================================================================

/**
 * @swagger
 * /api/fly/apps/{appName}/certificates:
 *   get:
 *     summary: List certificates for an app
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of certificates
 */
router.get('/apps/:appName/certificates', flyController.listCertificates);

/**
 * @swagger
 * /api/fly/apps/{appName}/certificates:
 *   post:
 *     summary: Add a certificate (custom domain)
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hostname
 *             properties:
 *               hostname:
 *                 type: string
 *                 description: Domain name (e.g. example.com)
 *     responses:
 *       200:
 *         description: Certificate created
 */
router.post('/apps/:appName/certificates', flyController.addCertificate);

/**
 * @swagger
 * /api/fly/apps/{appName}/certificates/{hostname}:
 *   delete:
 *     summary: Delete a certificate
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: hostname
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certificate deleted
 */
router.delete('/apps/:appName/certificates/:hostname', flyController.deleteCertificate);

/**
 * @swagger
 * /api/fly/apps/{appName}/certificates/{hostname}/check:
 *   post:
 *     summary: Check certificate status
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: hostname
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certificate status
 */
router.post('/apps/:appName/certificates/:hostname/check', flyController.checkCertificate);

// ============================================================================
// SECRETS
// ============================================================================

/**
 * @swagger
 * /api/fly/apps/{appName}/secrets:
 *   get:
 *     summary: List secrets for an app
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of secrets (names and digests only)
 */
router.get('/apps/:appName/secrets', flyController.listSecrets);

/**
 * @swagger
 * /api/fly/apps/{appName}/secrets:
 *   post:
 *     summary: Set secrets for an app
 *     tags: [Fly.io]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - secrets
 *             properties:
 *               secrets:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - key
 *                     - value
 *                   properties:
 *                     key:
 *                       type: string
 *                     value:
 *                       type: string
 *     responses:
 *       200:
 *         description: Secrets set
 */
router.post('/apps/:appName/secrets', flyController.setSecrets);

export default router;
