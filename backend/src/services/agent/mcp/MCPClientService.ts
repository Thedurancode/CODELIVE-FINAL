/**
 * MCP Client Service
 *
 * Manages connections to MCP (Model Context Protocol) servers,
 * discovers their tools, and registers them with the LangChain tool registry.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { logger } from '../../LoggerService';
import { settingsService } from '../../settingsService';
import { toolRegistry, defineTool, success, failure } from '../tools/registry';
import { mcpToolSchemaToZod } from './schemaConverter';
import type {
  MCPServerConfig,
  MCPServerState,
  MCPToolDefinition,
  MCPClientHealthStatus,
  MCPConnectionStatus,
} from './types';
import { MCPServerConfigSchema, MCP_SETTINGS, MCP_DEFAULTS } from './types';
import type { ToolContext, ToolCategory } from '../types';

// Tool category for MCP tools
const MCP_TOOL_CATEGORY: ToolCategory = 'mcp';

/**
 * MCP Client Service
 *
 * Singleton service that manages MCP server connections and tool registration.
 */
class MCPClientService {
  /** Map of server ID to server state */
  private servers: Map<string, MCPServerState> = new Map();

  /** Map of server ID to MCP client instance */
  private clients: Map<string, Client> = new Map();

  /** Whether the service has been initialized */
  private initialized = false;

  /** Promise for ongoing initialization */
  private initPromise: Promise<void> | null = null;

  /** Interval for watching settings changes */
  private settingsWatchInterval: NodeJS.Timeout | null = null;

  /** Hash of last known settings for change detection */
  private lastSettingsHash: string = '';

  /** Set of registered tool names (for cleanup tracking) */
  private registeredTools: Set<string> = new Set();

  /** Logger instance */
  private log = logger.child({ service: 'mcp-client' });

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize the MCP client service
   * Connects to all configured and enabled MCP servers
   */
  async initialize(): Promise<void> {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  /**
   * Internal initialization logic
   */
  private async _initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.log.info('Initializing MCP client service');

    try {
      // Check if MCP is globally enabled
      const enabled = await settingsService.isEnabled(MCP_SETTINGS.ENABLED);
      if (!enabled) {
        this.log.info('MCP integration is disabled in settings');
        this.initialized = true;
        return;
      }

      // Load server configurations from settings
      const configs = await this.loadServerConfigs();

      if (configs.length === 0) {
        this.log.info('No MCP servers configured');
        this.initialized = true;
        this.startSettingsWatch();
        return;
      }

      // Connect to each enabled server (in parallel with error isolation)
      const connectionPromises = configs
        .filter((config) => config.enabled)
        .map((config) =>
          this.connectServer(config).catch((err) => {
            this.log.warn('Failed to connect to MCP server', {
              serverId: config.id,
              name: config.name,
              error: err instanceof Error ? err.message : String(err),
            });
          })
        );

      await Promise.allSettled(connectionPromises);

      // Start watching for settings changes
      this.startSettingsWatch();

      this.initialized = true;
      this.log.info('MCP client service initialized', {
        serverCount: this.servers.size,
        connectedCount: this.getConnectedCount(),
        toolCount: this.registeredTools.size,
      });
    } catch (error) {
      this.log.error('Failed to initialize MCP client service', {}, error);
      // Don't throw - MCP is optional, agent should work without it
      this.initialized = true;
    }
  }

  // ===========================================================================
  // CONFIGURATION LOADING
  // ===========================================================================

  /**
   * Load MCP server configurations from settings
   */
  private async loadServerConfigs(): Promise<MCPServerConfig[]> {
    try {
      const serversJson = await settingsService.get<MCPServerConfig[]>(MCP_SETTINGS.SERVERS);

      if (!serversJson || !Array.isArray(serversJson)) {
        return [];
      }

      // Validate each config
      const validConfigs: MCPServerConfig[] = [];
      for (const config of serversJson) {
        const result = MCPServerConfigSchema.safeParse(config);
        if (result.success) {
          validConfigs.push(result.data);
        } else {
          this.log.warn('Invalid MCP server config', {
            configId: config?.id,
            errors: result.error.errors.map((e) => e.message),
          });
        }
      }

      return validConfigs;
    } catch (error) {
      this.log.error('Failed to load MCP server configs', {}, error);
      return [];
    }
  }

  // ===========================================================================
  // SERVER CONNECTION
  // ===========================================================================

  /**
   * Connect to an MCP server
   */
  async connectServer(config: MCPServerConfig): Promise<void> {
    const serverId = config.id;

    // Initialize server state
    const state: MCPServerState = {
      config,
      status: 'connecting',
      tools: [],
      resources: [],
      reconnectAttempts: 0,
    };
    this.servers.set(serverId, state);

    this.log.info('Connecting to MCP server', {
      serverId,
      name: config.name,
      transport: config.transport,
    });

    try {
      // Create MCP client
      const client = new Client(
        {
          name: `dispotree-agent`,
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
            resources: {},
          },
        }
      );

      // Create transport based on type
      let transport;
      if (config.transport === 'stdio') {
        if (!config.command) {
          throw new Error('Stdio transport requires command');
        }
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: { ...process.env, ...(config.env || {}) } as Record<string, string>,
        });
      } else if (config.transport === 'http') {
        if (!config.url) {
          throw new Error('HTTP transport requires url');
        }
        // Use SSE transport for HTTP connections
        const url = new URL(config.url);
        transport = new SSEClientTransport(url);
      } else {
        throw new Error(`Unknown transport type: ${config.transport}`);
      }

      // Connect with timeout
      const timeout = config.timeout || MCP_DEFAULTS.TIMEOUT;
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), timeout)
        ),
      ]);

      // Store client
      this.clients.set(serverId, client);

      // Discover and register tools
      await this.discoverAndRegisterTools(serverId, client, config);

      // Update state
      state.status = 'connected';
      state.lastConnected = new Date();
      state.lastError = undefined;
      state.reconnectAttempts = 0;

      this.log.info('Connected to MCP server', {
        serverId,
        name: config.name,
        toolCount: state.tools.length,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      state.status = 'error';
      state.lastError = errorMsg;

      this.log.error('Failed to connect to MCP server', {
        serverId,
        name: config.name,
        error: errorMsg,
      });

      // Schedule reconnection if configured
      this.scheduleReconnection(config);
    }
  }

  // ===========================================================================
  // TOOL DISCOVERY AND REGISTRATION
  // ===========================================================================

  /**
   * Discover tools from an MCP server and register them
   */
  private async discoverAndRegisterTools(
    serverId: string,
    client: Client,
    config: MCPServerConfig
  ): Promise<void> {
    const state = this.servers.get(serverId);
    if (!state) return;

    try {
      // List available tools
      const toolsResult = await client.listTools();
      const tools = (toolsResult.tools || []) as MCPToolDefinition[];

      this.log.debug('Discovered MCP tools', {
        serverId,
        toolCount: tools.length,
        toolNames: tools.map((t) => t.name),
      });

      state.tools = tools;

      // Register each tool with the tool registry
      for (const mcpTool of tools) {
        this.registerMCPTool(serverId, client, mcpTool, config);
      }
    } catch (error) {
      this.log.error('Failed to discover tools from MCP server', { serverId }, error);
      throw error;
    }
  }

  /**
   * Register an MCP tool with the LangChain tool registry
   */
  private registerMCPTool(
    serverId: string,
    client: Client,
    mcpTool: MCPToolDefinition,
    config: MCPServerConfig
  ): void {
    // Generate tool name with prefix to avoid conflicts
    const toolName = config.toolPrefix
      ? `${config.toolPrefix}_${mcpTool.name}`
      : `mcp_${serverId}_${mcpTool.name}`;

    // Convert JSON Schema to Zod schema
    const zodSchema = mcpToolSchemaToZod(mcpTool.inputSchema);

    // Build description
    const description =
      mcpTool.description || `MCP tool: ${mcpTool.name} from ${config.name}`;

    // Create tool definition
    const toolDef = defineTool({
      name: toolName,
      description,
      category: MCP_TOOL_CATEGORY,
      schema: zodSchema,
      cacheable: false, // MCP tools are not cached by default
      handler: async (input: any, context: ToolContext) => {
        return this.executeMCPTool(serverId, mcpTool.name, input, context);
      },
    });

    // Register with tool registry
    toolRegistry.register(toolDef);
    this.registeredTools.add(toolName);

    this.log.debug('Registered MCP tool', {
      serverId,
      originalName: mcpTool.name,
      registeredName: toolName,
    });
  }

  /**
   * Execute an MCP tool
   */
  private async executeMCPTool(
    serverId: string,
    toolName: string,
    input: any,
    context: ToolContext
  ): Promise<any> {
    const client = this.clients.get(serverId);
    const state = this.servers.get(serverId);

    if (!client || state?.status !== 'connected') {
      return failure(`MCP server ${serverId} is not connected`);
    }

    const startTime = Date.now();

    try {
      this.log.debug('Executing MCP tool', {
        serverId,
        toolName,
        requestId: context.requestId,
      });

      const result = await client.callTool({
        name: toolName,
        arguments: input,
      });

      const duration = Date.now() - startTime;
      this.log.debug('MCP tool executed', {
        serverId,
        toolName,
        duration,
        isError: result.isError,
      });

      // Extract result content
      if (result.content && Array.isArray(result.content)) {
        // Combine all text content
        const textContent = result.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');

        if (result.isError) {
          return failure(textContent || 'MCP tool execution failed');
        }

        // Try to parse as JSON if possible
        try {
          const parsed = JSON.parse(textContent);
          return success(parsed);
        } catch {
          // Return as plain text result
          return success({ result: textContent });
        }
      }

      // Return raw result if no content array
      return success(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;

      this.log.error('MCP tool execution failed', {
        serverId,
        toolName,
        duration,
        error: errorMsg,
      });

      // Check if connection was lost
      if (this.isConnectionError(error)) {
        state!.status = 'error';
        state!.lastError = errorMsg;
        this.scheduleReconnection(state!.config);
      }

      return failure(`MCP tool error: ${errorMsg}`);
    }
  }

  // ===========================================================================
  // RECONNECTION LOGIC
  // ===========================================================================

  /**
   * Schedule reconnection attempt for a failed server
   */
  private scheduleReconnection(config: MCPServerConfig): void {
    const state = this.servers.get(config.id);
    if (!state) return;

    const maxAttempts = config.retryAttempts ?? MCP_DEFAULTS.RETRY_ATTEMPTS;
    if (state.reconnectAttempts >= maxAttempts) {
      this.log.warn('Max reconnection attempts reached for MCP server', {
        serverId: config.id,
        attempts: state.reconnectAttempts,
      });
      return;
    }

    state.status = 'reconnecting';
    state.reconnectAttempts++;

    const delay =
      (config.retryDelayMs ?? MCP_DEFAULTS.RETRY_DELAY_MS) * state.reconnectAttempts;

    this.log.info('Scheduling MCP server reconnection', {
      serverId: config.id,
      attempt: state.reconnectAttempts,
      delayMs: delay,
    });

    setTimeout(async () => {
      // Clean up old client
      await this.disconnectServer(config.id, false);
      // Reconnect
      await this.connectServer(config);
    }, delay);
  }

  /**
   * Check if an error indicates connection failure
   */
  private isConnectionError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('connection') ||
        msg.includes('timeout') ||
        msg.includes('disconnected') ||
        msg.includes('econnrefused') ||
        msg.includes('enotfound') ||
        msg.includes('socket')
      );
    }
    return false;
  }

  // ===========================================================================
  // SETTINGS WATCH
  // ===========================================================================

  /**
   * Start watching for settings changes
   */
  private startSettingsWatch(): void {
    // Store initial hash
    this.loadServerConfigs().then((configs) => {
      this.lastSettingsHash = this.hashConfigs(configs);
    });

    // Check settings periodically for changes
    this.settingsWatchInterval = setInterval(async () => {
      await this.checkSettingsChanges();
    }, MCP_DEFAULTS.SETTINGS_WATCH_INTERVAL_MS);
  }

  /**
   * Check if settings have changed and update connections
   */
  private async checkSettingsChanges(): Promise<void> {
    try {
      // Check if globally enabled/disabled
      const enabled = await settingsService.isEnabled(MCP_SETTINGS.ENABLED);
      if (!enabled && this.servers.size > 0) {
        this.log.info('MCP disabled, disconnecting all servers');
        await this.disconnectAllServers();
        return;
      }

      const configs = await this.loadServerConfigs();
      const currentHash = this.hashConfigs(configs);

      if (currentHash !== this.lastSettingsHash) {
        this.log.info('MCP settings changed, updating connections');
        await this.reconcileConnections(configs);
        this.lastSettingsHash = currentHash;
      }
    } catch (error) {
      this.log.warn('Failed to check MCP settings changes', {}, error);
    }
  }

  /**
   * Generate hash of configs for change detection
   */
  private hashConfigs(configs: MCPServerConfig[]): string {
    return JSON.stringify(
      configs.map((c) => ({
        id: c.id,
        enabled: c.enabled,
        transport: c.transport,
        command: c.command,
        args: c.args,
        url: c.url,
        toolPrefix: c.toolPrefix,
      }))
    );
  }

  /**
   * Reconcile current connections with new config
   */
  private async reconcileConnections(configs: MCPServerConfig[]): Promise<void> {
    const configMap = new Map(configs.map((c) => [c.id, c]));

    // Disconnect removed or disabled servers
    for (const [serverId, state] of this.servers) {
      const config = configMap.get(serverId);
      if (!config || !config.enabled) {
        await this.disconnectServer(serverId);
      }
    }

    // Connect new or re-enabled servers
    for (const config of configs) {
      if (config.enabled && !this.servers.has(config.id)) {
        await this.connectServer(config).catch((err) => {
          this.log.warn('Failed to connect new MCP server', {
            serverId: config.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }
  }

  // ===========================================================================
  // DISCONNECTION
  // ===========================================================================

  /**
   * Disconnect from an MCP server
   */
  async disconnectServer(serverId: string, removeFromRegistry = true): Promise<void> {
    const client = this.clients.get(serverId);
    const state = this.servers.get(serverId);

    if (client) {
      try {
        await client.close();
      } catch (error) {
        this.log.warn('Error closing MCP client', { serverId }, error);
      }
      this.clients.delete(serverId);
    }

    if (removeFromRegistry && state) {
      // Note: Current tool registry doesn't support unregister
      // Tools will remain but fail gracefully when called
      this.servers.delete(serverId);
    }

    this.log.info('Disconnected from MCP server', { serverId });
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAllServers(): Promise<void> {
    const serverIds = Array.from(this.servers.keys());
    await Promise.allSettled(serverIds.map((id) => this.disconnectServer(id)));
  }

  // ===========================================================================
  // HEALTH & STATUS
  // ===========================================================================

  /**
   * Get health status of MCP client service
   */
  async getHealthStatus(): Promise<MCPClientHealthStatus> {
    const enabled = await settingsService.isEnabled(MCP_SETTINGS.ENABLED);

    const servers = Array.from(this.servers.values()).map((state) => ({
      id: state.config.id,
      name: state.config.name,
      status: state.status,
      toolCount: state.tools.length,
      resourceCount: state.resources.length,
      lastError: state.lastError,
      lastConnected: state.lastConnected?.toISOString(),
    }));

    return {
      initialized: this.initialized,
      enabled,
      serverCount: this.servers.size,
      connectedCount: this.getConnectedCount(),
      toolCount: this.registeredTools.size,
      servers,
    };
  }

  /**
   * Get count of connected servers
   */
  private getConnectedCount(): number {
    return Array.from(this.servers.values()).filter((s) => s.status === 'connected')
      .length;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  // ===========================================================================
  // MANUAL SERVER MANAGEMENT
  // ===========================================================================

  /**
   * Manually test connection to a server config
   * Used by the settings UI to validate configurations
   */
  async testConnection(config: MCPServerConfig): Promise<{ success: boolean; error?: string; tools?: string[] }> {
    try {
      // Validate config
      const result = MCPServerConfigSchema.safeParse(config);
      if (!result.success) {
        return {
          success: false,
          error: result.error.errors.map((e) => e.message).join(', '),
        };
      }

      // Create temporary client
      const client = new Client(
        { name: 'dispotree-test', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );

      let transport;
      if (config.transport === 'stdio') {
        if (!config.command) {
          return { success: false, error: 'Command is required for stdio transport' };
        }
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: { ...process.env, ...(config.env || {}) } as Record<string, string>,
        });
      } else {
        if (!config.url) {
          return { success: false, error: 'URL is required for HTTP transport' };
        }
        transport = new SSEClientTransport(new URL(config.url));
      }

      // Connect with short timeout
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000)),
      ]);

      // List tools
      const toolsResult = await client.listTools();
      const tools = (toolsResult.tools || []).map((t: any) => t.name);

      // Close connection
      await client.close();

      return { success: true, tools };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Force reconnect to a specific server
   */
  async reconnectServer(serverId: string): Promise<void> {
    const state = this.servers.get(serverId);
    if (!state) {
      throw new Error(`Server ${serverId} not found`);
    }

    state.reconnectAttempts = 0;
    await this.disconnectServer(serverId, false);
    await this.connectServer(state.config);
  }

  // ===========================================================================
  // INSTANT REFRESH
  // ===========================================================================

  /**
   * Refresh connections immediately (called when settings are saved)
   * This bypasses the 30-second polling interval for instant updates
   */
  async refreshConnections(): Promise<{ added: number; removed: number; total: number }> {
    this.log.info('Refreshing MCP connections (triggered by settings save)');

    const beforeCount = this.servers.size;

    // Check if globally enabled/disabled
    const enabled = await settingsService.isEnabled(MCP_SETTINGS.ENABLED);
    if (!enabled) {
      const removedCount = this.servers.size;
      await this.disconnectAllServers();
      this.lastSettingsHash = '';
      return { added: 0, removed: removedCount, total: 0 };
    }

    const configs = await this.loadServerConfigs();
    await this.reconcileConnections(configs);
    this.lastSettingsHash = this.hashConfigs(configs);

    const afterCount = this.servers.size;
    const added = Math.max(0, afterCount - beforeCount);
    const removed = Math.max(0, beforeCount - afterCount);

    this.log.info('MCP connections refreshed', {
      added,
      removed,
      total: afterCount,
      toolCount: this.registeredTools.size,
    });

    return { added, removed, total: afterCount };
  }

  // ===========================================================================
  // SHUTDOWN
  // ===========================================================================

  /**
   * Shutdown the MCP client service
   */
  async shutdown(): Promise<void> {
    this.log.info('Shutting down MCP client service');

    // Stop settings watch
    if (this.settingsWatchInterval) {
      clearInterval(this.settingsWatchInterval);
      this.settingsWatchInterval = null;
    }

    // Disconnect all servers
    await this.disconnectAllServers();

    // Clear state
    this.servers.clear();
    this.clients.clear();
    this.registeredTools.clear();
    this.initialized = false;
    this.initPromise = null;

    this.log.info('MCP client service shutdown complete');
  }
}

// Export singleton
export const mcpClientService = new MCPClientService();
export default mcpClientService;
