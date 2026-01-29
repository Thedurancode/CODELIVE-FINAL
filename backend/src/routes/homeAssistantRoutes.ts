/**
 * Home Assistant Routes
 *
 * API endpoints for Home Assistant integration.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { homeAssistantController } from '../controllers/homeAssistantController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limiting - higher limit for device control
const haLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  message: { success: false, error: 'Too many requests. Please slow down.' },
});

// Apply rate limiting to all routes
router.use(haLimiter);

// Public routes (no auth required for initial setup and device control)
router.post('/configs/test', homeAssistantController.testConnection);
router.post('/configs', homeAssistantController.createConfig);
router.get('/configs', homeAssistantController.listConfigs);
router.get('/configs/:configId/states', homeAssistantController.getStates);
router.post('/configs/:configId/entities/:entityId/toggle', homeAssistantController.toggle);
router.post('/configs/:configId/entities/:entityId/turn_on', homeAssistantController.turnOn);
router.post('/configs/:configId/entities/:entityId/turn_off', homeAssistantController.turnOff);

// Protected routes require authentication
router.use(authenticate);

// ============================================================================
// CONFIGURATION MANAGEMENT (protected routes)
// ============================================================================

/**
 * @swagger
 * /api/home-assistant/configs/{id}:
 *   get:
 *     summary: Get a specific configuration
 *     tags: [Home Assistant]
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
 *         description: Configuration details
 */
router.get('/configs/:id', homeAssistantController.getConfig);

/**
 * @swagger
 * /api/home-assistant/configs/{id}:
 *   put:
 *     summary: Update a configuration
 *     tags: [Home Assistant]
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
 *         description: Configuration updated
 */
router.put('/configs/:id', homeAssistantController.updateConfig);

/**
 * @swagger
 * /api/home-assistant/configs/{id}:
 *   delete:
 *     summary: Delete a configuration
 *     tags: [Home Assistant]
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
 *         description: Configuration deleted
 */
router.delete('/configs/:id', homeAssistantController.deleteConfig);

// ============================================================================
// STATE & ENTITY QUERIES
// ============================================================================

/**
 * @swagger
 * /api/home-assistant/configs/{configId}/states:
 *   get:
 *     summary: Get all entity states
 *     tags: [Home Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All entity states
 */
router.get('/configs/:configId/states', homeAssistantController.getStates);

/**
 * @swagger
 * /api/home-assistant/configs/{configId}/states/{entityId}:
 *   get:
 *     summary: Get a specific entity state
 *     tags: [Home Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Entity state
 */
router.get('/configs/:configId/states/:entityId', homeAssistantController.getState);

/**
 * @swagger
 * /api/home-assistant/configs/{configId}/entities/{domain}:
 *   get:
 *     summary: Get entities by domain
 *     tags: [Home Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *           enum: [light, switch, climate, media_player, cover, fan, scene, script, automation, sensor, binary_sensor, camera, lock]
 *     responses:
 *       200:
 *         description: Entities of the specified domain
 */
router.get('/configs/:configId/entities/:domain', homeAssistantController.getEntitiesByDomain);

// ============================================================================
// SERVICE CALLS
// ============================================================================

/**
 * @swagger
 * /api/home-assistant/configs/{configId}/services/{domain}/{service}:
 *   post:
 *     summary: Call a Home Assistant service
 *     tags: [Home Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: service
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entity_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Service called successfully
 */
router.post('/configs/:configId/services/:domain/:service', homeAssistantController.callService);

// ============================================================================
// CONVENIENCE ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/home-assistant/configs/{configId}/entities/{entityId}/turn_on:
 *   post:
 *     summary: Turn on an entity
 *     tags: [Home Assistant]
 *     security:
 *       - bearerAuth: []
 */
router.post('/configs/:configId/entities/:entityId/turn_on', homeAssistantController.turnOn);

/**
 * @swagger
 * /api/home-assistant/configs/{configId}/entities/{entityId}/turn_off:
 *   post:
 *     summary: Turn off an entity
 *     tags: [Home Assistant]
 *     security:
 *       - bearerAuth: []
 */
router.post('/configs/:configId/entities/:entityId/turn_off', homeAssistantController.turnOff);

/**
 * @swagger
 * /api/home-assistant/configs/{configId}/entities/{entityId}/toggle:
 *   post:
 *     summary: Toggle an entity
 *     tags: [Home Assistant]
 *     security:
 *       - bearerAuth: []
 */
router.post('/configs/:configId/entities/:entityId/toggle', homeAssistantController.toggle);

/**
 * @swagger
 * /api/home-assistant/configs/{configId}/lights/{entityId}/brightness:
 *   post:
 *     summary: Set light brightness
 *     tags: [Home Assistant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - brightness
 *             properties:
 *               brightness:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 255
 */
router.post('/configs/:configId/lights/:entityId/brightness', homeAssistantController.setBrightness);

/**
 * @swagger
 * /api/home-assistant/configs/{configId}/lights/{entityId}/color:
 *   post:
 *     summary: Set light color
 *     tags: [Home Assistant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rgb_color:
 *                 type: array
 *                 items:
 *                   type: number
 *               hex_color:
 *                 type: string
 */
router.post('/configs/:configId/lights/:entityId/color', homeAssistantController.setColor);

/**
 * @swagger
 * /api/home-assistant/configs/{configId}/climate/{entityId}/temperature:
 *   post:
 *     summary: Set climate temperature
 *     tags: [Home Assistant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - temperature
 *             properties:
 *               temperature:
 *                 type: number
 */
router.post('/configs/:configId/climate/:entityId/temperature', homeAssistantController.setTemperature);

/**
 * @swagger
 * /api/home-assistant/configs/{configId}/scenes/{entityId}/activate:
 *   post:
 *     summary: Activate a scene
 *     tags: [Home Assistant]
 *     security:
 *       - bearerAuth: []
 */
router.post('/configs/:configId/scenes/:entityId/activate', homeAssistantController.activateScene);

export default router;
