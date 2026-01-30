/**
 * Settings Routes
 * API routes for managing app-wide settings
 *
 * SECURITY:
 * - All routes require authentication
 * - Write operations require admin role
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { settingsService } from '../services/settingsService';
import { SettingCategory } from '../models/Settings';
import { authenticate, authorize } from '../middleware/auth';
import { mcpClientService } from '../services/agent/mcp';

const router = Router();

// Rate limit for settings
const settingsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many requests.' },
});

// Apply authentication to ALL settings routes
router.use(authenticate);
router.use(settingsLimiter);

// ============================================================================
// SETTINGS ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Get all settings
 *     description: Returns all settings grouped by category
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: All settings grouped by category
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const grouped = req.query.grouped === 'true';

    if (grouped) {
      const settings = await settingsService.getAllGrouped();
      res.json({ success: true, data: settings });
    } else {
      const settings = await settingsService.getAll();
      res.json({ success: true, data: settings });
    }
  } catch (error: any) {
    console.error('Error getting settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/settings/category/{category}:
 *   get:
 *     summary: Get settings by category
 *     description: Returns all settings for a specific category
 *     tags: [Settings]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [enrichment, scoring, notifications, marketplace, api, general]
 *     responses:
 *       200:
 *         description: Settings for the category
 */
router.get('/category/:category', async (req: Request, res: Response) => {
  try {
    const category = req.params.category as SettingCategory;
    const validCategories = ['enrichment', 'scoring', 'notifications', 'marketplace', 'api', 'general', 'docuseal'];

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Valid categories: ${validCategories.join(', ')}`,
      });
    }

    const settings = await settingsService.getByCategory(category);
    res.json({ success: true, data: settings });
  } catch (error: any) {
    console.error('Error getting settings by category:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/settings/keys:
 *   get:
 *     summary: Get available setting keys
 *     description: Returns all available setting keys with their defaults
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: List of available setting keys
 */
router.get('/keys', async (req: Request, res: Response) => {
  try {
    const keys = settingsService.getAvailableKeys();
    res.json({ success: true, data: keys });
  } catch (error: any) {
    console.error('Error getting available keys:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/settings/batch:
 *   put:
 *     summary: Update multiple settings at once
 *     description: Update multiple settings in a single request
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *             example:
 *               enrichment.enabled: true
 *               scoring.autoSubmitThreshold: 85
 *     responses:
 *       200:
 *         description: Settings updated successfully
 */
router.put('/batch', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Request body must be an object with key-value pairs',
      });
    }

    const results: { key: string; success: boolean; error?: string }[] = [];
    const availableKeys = settingsService.getAvailableKeys();

    for (const [key, value] of Object.entries(updates)) {
      try {
        if (!availableKeys.includes(key)) {
          results.push({ key, success: false, error: 'Unknown setting key' });
          continue;
        }
        await settingsService.set(key, value);
        results.push({ key, success: true });
      } catch (error: any) {
        results.push({ key, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    // Trigger instant MCP refresh if MCP settings were updated
    let mcpRefreshResult = null;
    const mcpSettingsUpdated = Object.keys(updates).some(
      key => key === 'mcp.servers' || key === 'mcp.enabled'
    );
    if (mcpSettingsUpdated && successCount > 0) {
      try {
        mcpRefreshResult = await mcpClientService.refreshConnections();
      } catch (err) {
        console.warn('MCP refresh after settings save failed:', err);
      }
    }

    res.json({
      success: failCount === 0,
      message: `Updated ${successCount} setting(s), ${failCount} failed`,
      results,
      mcpRefresh: mcpRefreshResult,
    });
  } catch (error: any) {
    console.error('Error batch updating settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// MCP SERVER MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/settings/mcp/status:
 *   get:
 *     summary: Get MCP servers status
 *     description: Returns the connection status of all configured MCP servers
 *     tags: [Settings, MCP]
 *     responses:
 *       200:
 *         description: MCP server status information
 */
router.get('/mcp/status', async (req: Request, res: Response) => {
  try {
    const status = await mcpClientService.getHealthStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    console.error('Error getting MCP status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/settings/mcp/test:
 *   post:
 *     summary: Test MCP server connection
 *     description: Test connection to an MCP server configuration without saving
 *     tags: [Settings, MCP]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *               transport:
 *                 type: string
 *                 enum: [stdio, http]
 *               command:
 *                 type: string
 *               args:
 *                 type: array
 *                 items:
 *                   type: string
 *               url:
 *                 type: string
 *               apiKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test result with tools discovered
 */
router.post('/mcp/test', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const config = req.body;

    if (!config || !config.transport) {
      return res.status(400).json({
        success: false,
        error: 'Invalid MCP server configuration',
      });
    }

    const result = await mcpClientService.testConnection(config);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error testing MCP connection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/settings/mcp/reconnect/{serverId}:
 *   post:
 *     summary: Reconnect to an MCP server
 *     description: Force reconnection to a specific MCP server
 *     tags: [Settings, MCP]
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reconnection initiated
 */
router.post('/mcp/reconnect/:serverId', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    await mcpClientService.reconnectServer(serverId);
    res.json({
      success: true,
      message: `Reconnection initiated for server ${serverId}`,
    });
  } catch (error: any) {
    console.error('Error reconnecting MCP server:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/settings/{key}:
 *   get:
 *     summary: Get a single setting
 *     description: Returns the value and metadata for a specific setting
 *     tags: [Settings]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         example: enrichment.enabled
 *     responses:
 *       200:
 *         description: Setting value and metadata
 *       404:
 *         description: Setting not found
 */
router.get('/:key(*)', async (req: Request, res: Response) => {
  try {
    const key = req.params.key;
    const info = await settingsService.getInfo(key);

    if (!info) {
      return res.status(404).json({
        success: false,
        error: `Setting "${key}" not found`,
        availableKeys: settingsService.getAvailableKeys(),
      });
    }

    res.json({ success: true, data: info });
  } catch (error: any) {
    console.error('Error getting setting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/settings/{key}:
 *   put:
 *     summary: Update a setting
 *     description: Update the value of a specific setting
 *     tags: [Settings]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         example: enrichment.enabled
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 description: The new value for the setting
 *     responses:
 *       200:
 *         description: Setting updated successfully
 *       400:
 *         description: Invalid key or value
 */
router.put('/:key(*)', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const key = req.params.key;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing "value" in request body',
      });
    }

    // Check if key exists
    const exists = await settingsService.exists(key);
    if (!exists) {
      const availableKeys = settingsService.getAvailableKeys();
      if (!availableKeys.includes(key)) {
        return res.status(400).json({
          success: false,
          error: `Unknown setting key: ${key}`,
          availableKeys,
        });
      }
    }

    await settingsService.set(key, value);
    const updated = await settingsService.getInfo(key);

    // Trigger instant MCP refresh if MCP setting was updated
    let mcpRefresh = null;
    if (key === 'mcp.servers' || key === 'mcp.enabled') {
      try {
        mcpRefresh = await mcpClientService.refreshConnections();
      } catch (err) {
        console.warn('MCP refresh after setting update failed:', err);
      }
    }

    res.json({
      success: true,
      message: `Setting "${key}" updated successfully`,
      data: updated,
      mcpRefresh,
    });
  } catch (error: any) {
    console.error('Error updating setting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/settings/{key}/reset:
 *   post:
 *     summary: Reset a setting to default
 *     description: Reset a setting to its default value
 *     tags: [Settings]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         example: enrichment.enabled
 *     responses:
 *       200:
 *         description: Setting reset successfully
 *       400:
 *         description: Unknown setting key
 */
router.post('/:key(*)/reset', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const key = req.params.key;

    const availableKeys = settingsService.getAvailableKeys();
    if (!availableKeys.includes(key)) {
      return res.status(400).json({
        success: false,
        error: `Unknown setting key: ${key}`,
        availableKeys,
      });
    }

    const defaultValue = await settingsService.reset(key);
    const updated = await settingsService.getInfo(key);

    res.json({
      success: true,
      message: `Setting "${key}" reset to default value`,
      data: updated,
    });
  } catch (error: any) {
    console.error('Error resetting setting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
