/**
 * Settings Service
 *
 * Provides a centralized way to manage app-wide settings.
 * Handles caching, defaults, and typed access to settings.
 */

import Settings, { DEFAULT_SETTINGS, SettingCategory, SettingType } from '../models/Settings';

interface SettingInfo {
  key: string;
  value: any;
  type: SettingType;
  category: SettingCategory;
  description: string;
  updatedAt: Date;
}

interface SettingsByCategory {
  [category: string]: {
    [key: string]: any;
  };
}

class SettingsService {
  private cache: Map<string, any> = new Map();
  private initialized: boolean = false;

  /**
   * Initialize settings service and ensure defaults exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure all default settings exist in database
      for (const setting of DEFAULT_SETTINGS) {
        const existing = await Settings.findByPk(setting.key);
        if (!existing) {
          await Settings.create(setting);
        }
      }

      // Load all settings into cache
      await this.loadCache();
      this.initialized = true;
      console.log('✅ Settings Service initialized with', this.cache.size, 'settings');
    } catch (error) {
      console.error('Failed to initialize settings service:', error);
      // Use defaults from memory if DB fails
      for (const setting of DEFAULT_SETTINGS) {
        this.cache.set(setting.key, setting.value);
      }
      this.initialized = true;
    }
  }

  /**
   * Load all settings into memory cache
   */
  private async loadCache(): Promise<void> {
    const settings = await Settings.findAll();
    this.cache.clear();
    for (const setting of settings) {
      this.cache.set(setting.key, setting.getTypedValue());
    }
  }

  /**
   * Get a setting value by key
   */
  async get<T = any>(key: string): Promise<T | undefined> {
    if (!this.initialized) await this.initialize();

    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    // Try database
    const setting = await Settings.findByPk(key);
    if (setting) {
      const value = setting.getTypedValue();
      this.cache.set(key, value);
      return value as T;
    }

    // Check defaults
    const defaultSetting = DEFAULT_SETTINGS.find(s => s.key === key);
    return defaultSetting?.value as T;
  }

  /**
   * Get a boolean setting (convenience method)
   */
  async isEnabled(key: string): Promise<boolean> {
    const value = await this.get<boolean>(key);
    return value === true;
  }

  /**
   * Get a number setting (convenience method)
   */
  async getNumber(key: string): Promise<number> {
    const value = await this.get<number>(key);
    return typeof value === 'number' ? value : 0;
  }

  /**
   * Set a setting value
   */
  async set(key: string, value: any): Promise<void> {
    if (!this.initialized) await this.initialize();

    const existing = await Settings.findByPk(key);
    if (existing) {
      await existing.update({ value });
      // Reload to get the updated value, then convert to typed value
      await existing.reload();
      this.cache.set(key, existing.getTypedValue());
    } else {
      // Find in defaults to get type and category
      const defaultSetting = DEFAULT_SETTINGS.find(s => s.key === key);
      if (defaultSetting) {
        const created = await Settings.create({
          ...defaultSetting,
          value,
        });
        this.cache.set(key, created.getTypedValue());
      } else {
        throw new Error(`Unknown setting key: ${key}`);
      }
    }
  }

  /**
   * Reset a setting to its default value
   */
  async reset(key: string): Promise<any> {
    if (!this.initialized) await this.initialize();

    const defaultSetting = DEFAULT_SETTINGS.find(s => s.key === key);
    if (!defaultSetting) {
      throw new Error(`Unknown setting key: ${key}`);
    }

    await this.set(key, defaultSetting.value);
    return defaultSetting.value;
  }

  /**
   * Get all settings
   */
  async getAll(): Promise<SettingInfo[]> {
    if (!this.initialized) await this.initialize();

    const settings = await Settings.findAll({
      order: [['category', 'ASC'], ['key', 'ASC']],
    });

    return settings.map(s => ({
      key: s.key,
      value: s.getTypedValue(),
      type: s.type,
      category: s.category,
      description: s.description,
      updatedAt: s.updatedAt,
    }));
  }

  /**
   * Get all settings grouped by category
   */
  async getAllGrouped(): Promise<SettingsByCategory> {
    const all = await this.getAll();
    const grouped: SettingsByCategory = {};

    for (const setting of all) {
      if (!grouped[setting.category]) {
        grouped[setting.category] = {};
      }
      grouped[setting.category][setting.key] = setting.value;
    }

    return grouped;
  }

  /**
   * Get settings by category
   */
  async getByCategory(category: SettingCategory): Promise<SettingInfo[]> {
    if (!this.initialized) await this.initialize();

    const settings = await Settings.findAll({
      where: { category },
      order: [['key', 'ASC']],
    });

    return settings.map(s => ({
      key: s.key,
      value: s.getTypedValue(),
      type: s.type,
      category: s.category,
      description: s.description,
      updatedAt: s.updatedAt,
    }));
  }

  /**
   * Get a single setting with full info
   */
  async getInfo(key: string): Promise<SettingInfo | null> {
    if (!this.initialized) await this.initialize();

    const setting = await Settings.findByPk(key);
    if (!setting) return null;

    return {
      key: setting.key,
      value: setting.getTypedValue(),
      type: setting.type,
      category: setting.category,
      description: setting.description,
      updatedAt: setting.updatedAt,
    };
  }

  /**
   * Check if a setting exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const setting = await Settings.findByPk(key);
    return setting !== null;
  }

  /**
   * Get available setting keys
   */
  getAvailableKeys(): string[] {
    return DEFAULT_SETTINGS.map(s => s.key);
  }

  /**
   * Clear cache (for testing or after bulk updates)
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const settingsService = new SettingsService();
export default settingsService;
