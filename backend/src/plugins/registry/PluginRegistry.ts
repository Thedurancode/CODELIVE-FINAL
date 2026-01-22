/**
 * Plugin Registry - Central registry for all extensible plugins
 *
 * This registry manages:
 * - Deal Source plugins
 * - Scoring plugins
 * - Automation plugins
 *
 * Plugins can be registered at runtime, enabling hot-loading of new integrations.
 */

import {
  IDealSourcePlugin,
  DealSourceType,
  DealSourceConfig,
  ValidationResult,
} from '../types';

class PluginRegistry {
  private static instance: PluginRegistry;
  private dealSourcePlugins: Map<DealSourceType, IDealSourcePlugin> = new Map();
  private activeSources: Map<string, { plugin: IDealSourcePlugin; config: DealSourceConfig }> = new Map();
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  // ============================================================================
  // DEAL SOURCE PLUGIN MANAGEMENT
  // ============================================================================

  /**
   * Register a deal source plugin
   */
  public registerDealSourcePlugin(plugin: IDealSourcePlugin): void {
    if (this.dealSourcePlugins.has(plugin.type)) {
      console.warn(`Plugin type '${plugin.type}' is already registered. Overwriting.`);
    }
    this.dealSourcePlugins.set(plugin.type, plugin);
    console.log(`✅ Registered deal source plugin: ${plugin.name} (${plugin.type})`);
  }

  /**
   * Unregister a deal source plugin
   */
  public unregisterDealSourcePlugin(type: DealSourceType): void {
    this.dealSourcePlugins.delete(type);
    console.log(`🗑️ Unregistered deal source plugin: ${type}`);
  }

  /**
   * Get a registered plugin by type
   */
  public getDealSourcePlugin(type: DealSourceType): IDealSourcePlugin | undefined {
    return this.dealSourcePlugins.get(type);
  }

  /**
   * Get all registered plugin types
   */
  public getRegisteredDealSourceTypes(): DealSourceType[] {
    return Array.from(this.dealSourcePlugins.keys());
  }

  /**
   * Get all registered plugins with their metadata
   */
  public getAllDealSourcePlugins(): Array<{
    type: DealSourceType;
    name: string;
    version: string;
    description: string;
    configSchema: any;
  }> {
    return Array.from(this.dealSourcePlugins.values()).map((plugin) => ({
      type: plugin.type,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      configSchema: plugin.configSchema,
    }));
  }

  // ============================================================================
  // ACTIVE SOURCE MANAGEMENT
  // ============================================================================

  /**
   * Activate a deal source with configuration
   */
  public async activateDealSource(config: DealSourceConfig): Promise<ValidationResult> {
    const plugin = this.dealSourcePlugins.get(config.type);

    if (!plugin) {
      return {
        valid: false,
        errors: [`No plugin registered for type: ${config.type}`],
      };
    }

    // Validate configuration
    const validation = await plugin.validateConfig(config);
    if (!validation.valid) {
      return validation;
    }

    // Initialize the plugin
    try {
      await plugin.initialize(config);
      this.activeSources.set(config.id, { plugin, config });
      console.log(`✅ Activated deal source: ${config.name} (${config.id})`);
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to initialize plugin: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Deactivate a deal source
   */
  public async deactivateDealSource(sourceId: string): Promise<void> {
    const source = this.activeSources.get(sourceId);
    if (source) {
      await source.plugin.dispose();
      this.activeSources.delete(sourceId);
      console.log(`🛑 Deactivated deal source: ${sourceId}`);
    }
  }

  /**
   * Get an active source by ID
   */
  public getActiveSource(sourceId: string): { plugin: IDealSourcePlugin; config: DealSourceConfig } | undefined {
    return this.activeSources.get(sourceId);
  }

  /**
   * Get all active sources
   */
  public getAllActiveSources(): Array<{ id: string; config: DealSourceConfig }> {
    return Array.from(this.activeSources.entries()).map(([id, source]) => ({
      id,
      config: source.config,
    }));
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Initialize the registry with default plugins
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Import and register built-in plugins
    const { CSVDealSourcePlugin } = await import('../sources/CSVDealSourcePlugin');
    const { APIDealSourcePlugin } = await import('../sources/APIDealSourcePlugin');
    const { EmailDealSourcePlugin } = await import('../sources/EmailDealSourcePlugin');
    const { WebhookDealSourcePlugin } = await import('../sources/WebhookDealSourcePlugin');
    const { ManualDealSourcePlugin } = await import('../sources/ManualDealSourcePlugin');
    const { FirecrawlDealSourcePlugin } = await import('../sources/FirecrawlDealSourcePlugin');
    const { PDFDealSourcePlugin } = await import('../sources/PDFDealSourcePlugin');

    this.registerDealSourcePlugin(new CSVDealSourcePlugin());
    this.registerDealSourcePlugin(new APIDealSourcePlugin());
    this.registerDealSourcePlugin(new EmailDealSourcePlugin());
    this.registerDealSourcePlugin(new WebhookDealSourcePlugin());
    this.registerDealSourcePlugin(new ManualDealSourcePlugin());
    this.registerDealSourcePlugin(new FirecrawlDealSourcePlugin());
    this.registerDealSourcePlugin(new PDFDealSourcePlugin());

    this.initialized = true;
    console.log('📦 Plugin Registry initialized with default plugins');
  }

  /**
   * Shutdown all active sources
   */
  public async shutdown(): Promise<void> {
    for (const [sourceId] of this.activeSources) {
      await this.deactivateDealSource(sourceId);
    }
    console.log('🛑 Plugin Registry shutdown complete');
  }
}

export const pluginRegistry = PluginRegistry.getInstance();
export default pluginRegistry;
