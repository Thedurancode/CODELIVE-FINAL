/**
 * Home Assistant Controller
 *
 * Handles API requests for Home Assistant integration.
 */

import { Request, Response } from 'express';
import { homeAssistantService } from '../services/HomeAssistantService';
import HomeAssistantConfig from '../models/HomeAssistantConfig';

export const homeAssistantController = {
  // ============================================================================
  // CONFIGURATION MANAGEMENT
  // ============================================================================

  /**
   * List all Home Assistant configurations for the user
   */
  async listConfigs(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;

      // Build where clause - if no userId, get all active configs (for setup mode)
      const whereClause: any = { isActive: true };
      if (userId) {
        whereClause.userId = userId;
      }

      const configs = await HomeAssistantConfig.findAll({
        where: whereClause,
        attributes: ['id', 'name', 'url', 'isDefault', 'lastConnected', 'lastError', 'createdAt'],
        order: [['isDefault', 'DESC'], ['name', 'ASC']],
      });

      res.json({ success: true, data: configs });
    } catch (error) {
      console.error('[HA Controller] List configs error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Get a specific configuration
   */
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;

      const config = await HomeAssistantConfig.findOne({
        where: { id, userId },
        attributes: ['id', 'name', 'url', 'isDefault', 'lastConnected', 'lastError', 'metadata', 'createdAt'],
      });

      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      res.json({ success: true, data: config });
    } catch (error) {
      console.error('[HA Controller] Get config error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Create a new Home Assistant configuration
   */
  async createConfig(req: Request, res: Response): Promise<void> {
    try {
      const { name, url, token, isDefault } = req.body;
      const userId = (req as any).user?.id;

      if (!name || !url || !token) {
        res.status(400).json({ success: false, error: 'Name, URL, and token are required' });
        return;
      }

      // Test connection first
      const testResult = await homeAssistantService.testConnection(url, token);
      if (!testResult.success) {
        res.status(400).json({ success: false, error: `Connection failed: ${testResult.error}` });
        return;
      }

      // If setting as default, unset other defaults
      if (isDefault) {
        const updateWhere: any = { isDefault: true };
        if (userId) {
          updateWhere.userId = userId;
        }
        await HomeAssistantConfig.update(
          { isDefault: false },
          { where: updateWhere }
        );
      }

      // Encrypt token
      const encryptedToken = homeAssistantService.encryptToken(token);

      const config = await HomeAssistantConfig.create({
        name,
        url: url.replace(/\/$/, ''),
        encryptedToken,
        userId: userId || null,
        isDefault: isDefault || false,
        metadata: { version: testResult.version },
      });

      // Register with service
      homeAssistantService.addConfiguration({
        name,
        url: url.replace(/\/$/, ''),
        token,
        userId: userId || undefined,
        isDefault: isDefault || false,
      });

      res.status(201).json({
        success: true,
        data: {
          id: config.id,
          name: config.name,
          url: config.url,
          isDefault: config.isDefault,
          version: testResult.version,
        },
      });
    } catch (error) {
      console.error('[HA Controller] Create config error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Update a configuration
   */
  async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, url, token, isDefault } = req.body;
      const userId = (req as any).user?.id;

      const config = await HomeAssistantConfig.findOne({ where: { id, userId } });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      const updates: any = {};

      if (name) updates.name = name;
      if (url) updates.url = url.replace(/\/$/, '');

      if (token) {
        // Test new token
        const testResult = await homeAssistantService.testConnection(url || config.url, token);
        if (!testResult.success) {
          res.status(400).json({ success: false, error: `Connection failed: ${testResult.error}` });
          return;
        }
        updates.encryptedToken = homeAssistantService.encryptToken(token);
        updates.metadata = { ...config.metadata, version: testResult.version };
      }

      if (isDefault !== undefined) {
        if (isDefault) {
          await HomeAssistantConfig.update(
            { isDefault: false },
            { where: { userId, isDefault: true } }
          );
        }
        updates.isDefault = isDefault;
      }

      await config.update(updates);

      res.json({
        success: true,
        data: {
          id: config.id,
          name: config.name,
          url: config.url,
          isDefault: config.isDefault,
        },
      });
    } catch (error) {
      console.error('[HA Controller] Update config error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Delete a configuration
   */
  async deleteConfig(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;

      const config = await HomeAssistantConfig.findOne({ where: { id, userId } });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      // Soft delete
      await config.update({ isActive: false });
      homeAssistantService.removeConfiguration(id);

      res.json({ success: true });
    } catch (error) {
      console.error('[HA Controller] Delete config error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Test a connection without saving
   */
  async testConnection(req: Request, res: Response): Promise<void> {
    try {
      const { url, token } = req.body;

      if (!url || !token) {
        res.status(400).json({ success: false, error: 'URL and token are required' });
        return;
      }

      const result = await homeAssistantService.testConnection(url, token);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('[HA Controller] Test connection error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  // ============================================================================
  // STATE & ENTITY QUERIES
  // ============================================================================

  /**
   * Get all entity states
   */
  async getStates(req: Request, res: Response): Promise<void> {
    try {
      const { configId } = req.params;
      const userId = (req as any).user?.id;

      // Verify config exists (optionally owned by user if authenticated)
      const whereClause: any = { id: configId };
      if (userId) {
        whereClause.userId = userId;
      }
      const config = await HomeAssistantConfig.findOne({ where: whereClause });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      // Ensure config is loaded in service
      await ensureConfigLoaded(config);

      const states = await homeAssistantService.getStates(configId);
      res.json({ success: true, data: states });
    } catch (error) {
      console.error('[HA Controller] Get states error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Get a specific entity state
   */
  async getState(req: Request, res: Response): Promise<void> {
    try {
      const { configId, entityId } = req.params;
      const userId = (req as any).user?.id;

      const config = await HomeAssistantConfig.findOne({ where: { id: configId, userId } });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      await ensureConfigLoaded(config);

      const state = await homeAssistantService.getState(configId, entityId);
      res.json({ success: true, data: state });
    } catch (error) {
      console.error('[HA Controller] Get state error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Get entities by domain
   */
  async getEntitiesByDomain(req: Request, res: Response): Promise<void> {
    try {
      const { configId, domain } = req.params;
      const userId = (req as any).user?.id;

      const config = await HomeAssistantConfig.findOne({ where: { id: configId, userId } });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      await ensureConfigLoaded(config);

      const entities = await homeAssistantService.getEntitiesByDomain(configId, domain as any);
      res.json({ success: true, data: entities });
    } catch (error) {
      console.error('[HA Controller] Get entities error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  // ============================================================================
  // SERVICE CALLS
  // ============================================================================

  /**
   * Call any Home Assistant service
   */
  async callService(req: Request, res: Response): Promise<void> {
    try {
      const { configId, domain, service } = req.params;
      const userId = (req as any).user?.id;
      const { entity_id, ...serviceData } = req.body;

      const config = await HomeAssistantConfig.findOne({ where: { id: configId, userId } });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      await ensureConfigLoaded(config);

      const result = await homeAssistantService.callService(configId, {
        domain,
        service,
        target: entity_id ? { entity_id } : undefined,
        service_data: Object.keys(serviceData).length > 0 ? serviceData : undefined,
      });

      // Update last connected
      await config.update({ lastConnected: new Date(), lastError: null });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('[HA Controller] Call service error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  // ============================================================================
  // CONVENIENCE ENDPOINTS
  // ============================================================================

  /**
   * Turn on an entity
   */
  async turnOn(req: Request, res: Response): Promise<void> {
    try {
      const { configId, entityId } = req.params;
      const userId = (req as any).user?.id;
      const options = req.body;

      const whereClause: any = { id: configId };
      if (userId) whereClause.userId = userId;
      const config = await HomeAssistantConfig.findOne({ where: whereClause });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      await ensureConfigLoaded(config);
      await homeAssistantService.turnOn(configId, entityId, options);
      await config.update({ lastConnected: new Date(), lastError: null });

      res.json({ success: true });
    } catch (error) {
      console.error('[HA Controller] Turn on error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Turn off an entity
   */
  async turnOff(req: Request, res: Response): Promise<void> {
    try {
      const { configId, entityId } = req.params;
      const userId = (req as any).user?.id;

      const whereClause: any = { id: configId };
      if (userId) whereClause.userId = userId;
      const config = await HomeAssistantConfig.findOne({ where: whereClause });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      await ensureConfigLoaded(config);
      await homeAssistantService.turnOff(configId, entityId);
      await config.update({ lastConnected: new Date(), lastError: null });

      res.json({ success: true });
    } catch (error) {
      console.error('[HA Controller] Turn off error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Toggle an entity
   */
  async toggle(req: Request, res: Response): Promise<void> {
    try {
      const { configId, entityId } = req.params;
      const userId = (req as any).user?.id;

      const whereClause: any = { id: configId };
      if (userId) whereClause.userId = userId;
      const config = await HomeAssistantConfig.findOne({ where: whereClause });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      await ensureConfigLoaded(config);
      await homeAssistantService.toggle(configId, entityId);
      await config.update({ lastConnected: new Date(), lastError: null });

      res.json({ success: true });
    } catch (error) {
      console.error('[HA Controller] Toggle error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Set light brightness
   */
  async setBrightness(req: Request, res: Response): Promise<void> {
    try {
      const { configId, entityId } = req.params;
      const { brightness } = req.body;
      const userId = (req as any).user?.id;

      if (brightness === undefined || brightness < 0 || brightness > 255) {
        res.status(400).json({ success: false, error: 'Brightness must be 0-255' });
        return;
      }

      const config = await HomeAssistantConfig.findOne({ where: { id: configId, userId } });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      await ensureConfigLoaded(config);
      await homeAssistantService.setLightBrightness(configId, entityId, brightness);
      await config.update({ lastConnected: new Date(), lastError: null });

      res.json({ success: true });
    } catch (error) {
      console.error('[HA Controller] Set brightness error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Set light color
   */
  async setColor(req: Request, res: Response): Promise<void> {
    try {
      const { configId, entityId } = req.params;
      const { rgb_color, hex_color } = req.body;
      const userId = (req as any).user?.id;

      const color = hex_color || (rgb_color ? { r: rgb_color[0], g: rgb_color[1], b: rgb_color[2] } : null);
      if (!color) {
        res.status(400).json({ success: false, error: 'rgb_color or hex_color is required' });
        return;
      }

      const config = await HomeAssistantConfig.findOne({ where: { id: configId, userId } });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      await ensureConfigLoaded(config);
      await homeAssistantService.setLightColor(configId, entityId, color);
      await config.update({ lastConnected: new Date(), lastError: null });

      res.json({ success: true });
    } catch (error) {
      console.error('[HA Controller] Set color error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Set climate temperature
   */
  async setTemperature(req: Request, res: Response): Promise<void> {
    try {
      const { configId, entityId } = req.params;
      const { temperature } = req.body;
      const userId = (req as any).user?.id;

      if (temperature === undefined) {
        res.status(400).json({ success: false, error: 'Temperature is required' });
        return;
      }

      const config = await HomeAssistantConfig.findOne({ where: { id: configId, userId } });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      await ensureConfigLoaded(config);
      await homeAssistantService.setClimateTemperature(configId, entityId, temperature);
      await config.update({ lastConnected: new Date(), lastError: null });

      res.json({ success: true });
    } catch (error) {
      console.error('[HA Controller] Set temperature error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  /**
   * Activate a scene
   */
  async activateScene(req: Request, res: Response): Promise<void> {
    try {
      const { configId, entityId } = req.params;
      const userId = (req as any).user?.id;

      const config = await HomeAssistantConfig.findOne({ where: { id: configId, userId } });
      if (!config) {
        res.status(404).json({ success: false, error: 'Configuration not found' });
        return;
      }

      await ensureConfigLoaded(config);
      await homeAssistantService.activateScene(configId, entityId);
      await config.update({ lastConnected: new Date(), lastError: null });

      res.json({ success: true });
    } catch (error) {
      console.error('[HA Controller] Activate scene error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },
};

/**
 * Helper to ensure config is loaded in service
 */
async function ensureConfigLoaded(config: HomeAssistantConfig): Promise<void> {
  const existing = homeAssistantService.getConfiguration(config.id);
  if (!existing) {
    const token = homeAssistantService.decryptToken(config.encryptedToken);
    homeAssistantService.addConfiguration({
      id: config.id,  // Use database config ID
      name: config.name,
      url: config.url,
      token,
      userId: config.userId || undefined,
      isDefault: config.isDefault,
    });
  }
}

export default homeAssistantController;
