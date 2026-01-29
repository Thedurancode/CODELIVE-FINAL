/**
 * Home Assistant Service
 *
 * REST and WebSocket client for Home Assistant integration.
 * Enables smart home device control from the iPad remote.
 *
 * Features:
 * - REST API for state queries and service calls
 * - WebSocket for real-time state updates
 * - Multi-instance support (multiple HA configurations)
 * - Credential encryption and secure storage
 */

import WebSocket from 'ws';
import * as crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface HAEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
  context: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
}

export interface HAServiceCall {
  domain: string;
  service: string;
  target?: {
    entity_id?: string | string[];
    device_id?: string | string[];
    area_id?: string | string[];
  };
  service_data?: Record<string, any>;
}

export interface HAConfig {
  version: string;
  config_dir: string;
  location_name: string;
  time_zone: string;
  components: string[];
  unit_system: {
    length: string;
    mass: string;
    temperature: string;
    volume: string;
  };
}

export interface HAArea {
  area_id: string;
  name: string;
  picture?: string;
}

export interface HADevice {
  id: string;
  name: string;
  area_id?: string;
  manufacturer?: string;
  model?: string;
}

export type HADeviceDomain =
  | 'light'
  | 'switch'
  | 'climate'
  | 'media_player'
  | 'cover'
  | 'fan'
  | 'scene'
  | 'script'
  | 'automation'
  | 'sensor'
  | 'binary_sensor'
  | 'camera'
  | 'lock'
  | 'vacuum'
  | 'input_boolean'
  | 'input_number'
  | 'input_select';

// Configuration stored in database
export interface HomeAssistantConfiguration {
  id: string;
  name: string;
  url: string;
  token: string; // Decrypted token
  userId?: string;
  organizationId?: string;
  isDefault: boolean;
}

// WebSocket message types from HA
interface HAWSMessage {
  id?: number;
  type: string;
  success?: boolean;
  result?: any;
  event?: {
    event_type: string;
    data: any;
    origin: string;
    time_fired: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

// Internal WebSocket connection tracking
interface HAWebSocketConnection {
  ws: WebSocket;
  configId: string;
  messageId: number;
  authenticated: boolean;
  subscriptionId?: number;
  pendingMessages: Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>;
  stateChangeCallbacks: Set<(state: HAEntityState) => void>;
  reconnectAttempts: number;
  reconnectTimeout?: NodeJS.Timeout;
}

// ============================================================================
// SERVICE
// ============================================================================

class HomeAssistantService {
  private initialized = false;
  private configurations: Map<string, HomeAssistantConfiguration> = new Map();
  private wsConnections: Map<string, HAWebSocketConnection> = new Map();
  private stateCache: Map<string, Map<string, HAEntityState>> = new Map(); // configId -> entity_id -> state

  private readonly REQUEST_TIMEOUT = 10000; // 10 seconds
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_BASE_DELAY = 3000; // 3 seconds

  // Encryption key for tokens (derived from JWT_SECRET)
  private encryptionKey: Buffer | null = null;

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Initialize the Home Assistant service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Derive encryption key from JWT_SECRET
    const secret = process.env.JWT_SECRET || 'default-secret-change-me';
    this.encryptionKey = crypto.scryptSync(secret, 'ha-salt', 32);

    // Load default configuration from environment if provided
    const defaultUrl = process.env.HOME_ASSISTANT_URL;
    const defaultToken = process.env.HOME_ASSISTANT_TOKEN;

    if (defaultUrl && defaultToken) {
      const defaultConfig: HomeAssistantConfiguration = {
        id: 'default',
        name: 'Default Home Assistant',
        url: defaultUrl.replace(/\/$/, ''),
        token: defaultToken,
        isDefault: true,
      };
      this.configurations.set('default', defaultConfig);
      console.log('✅ Home Assistant Service initialized with default config from env');
    }

    // Load configurations from database
    await this.loadConfigsFromDatabase();

    if (this.configurations.size === 0) {
      console.log('⚠️ Home Assistant Service initialized (no configs - configure via API)');
    }

    this.initialized = true;
  }

  /**
   * Load Home Assistant configurations from database
   */
  private async loadConfigsFromDatabase(): Promise<void> {
    try {
      // Dynamic import to avoid circular dependency
      const { default: HomeAssistantConfig } = await import('../models/HomeAssistantConfig');

      const configs = await HomeAssistantConfig.findAll({
        where: { isActive: true },
      });

      for (const config of configs) {
        try {
          const token = this.decryptToken(config.encryptedToken);
          this.configurations.set(config.id, {
            id: config.id,
            name: config.name,
            url: config.url,
            token,
            userId: config.userId || undefined,
            isDefault: config.isDefault,
          });
          console.log(`📋 Loaded HA config: ${config.name}`);
        } catch (err) {
          console.error(`Failed to load HA config ${config.name}:`, err);
        }
      }

      if (configs.length > 0) {
        console.log(`✅ Loaded ${configs.length} Home Assistant configuration(s) from database`);
      }
    } catch (error) {
      // Database might not be connected yet, that's OK
      console.log('⚠️ Could not load HA configs from database (DB may not be ready)');
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    // Close all WebSocket connections
    for (const [configId, connection] of this.wsConnections) {
      if (connection.reconnectTimeout) {
        clearTimeout(connection.reconnectTimeout);
      }
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close(1000, 'Service shutting down');
      }
    }
    this.wsConnections.clear();
    this.configurations.clear();
    this.stateCache.clear();
    this.initialized = false;
    console.log('🏠 Home Assistant Service shut down');
  }

  // ============================================================================
  // CONFIGURATION MANAGEMENT
  // ============================================================================

  /**
   * Add a Home Assistant configuration
   */
  addConfiguration(config: Omit<HomeAssistantConfiguration, 'id'> & { id?: string }): HomeAssistantConfiguration {
    const id = config.id || crypto.randomUUID();
    const fullConfig: HomeAssistantConfiguration = {
      ...config,
      id,
      url: config.url.replace(/\/$/, ''), // Remove trailing slash
    };
    this.configurations.set(id, fullConfig);
    return fullConfig;
  }

  /**
   * Update a configuration
   */
  updateConfiguration(id: string, updates: Partial<HomeAssistantConfiguration>): HomeAssistantConfiguration | null {
    const existing = this.configurations.get(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      url: updates.url ? updates.url.replace(/\/$/, '') : existing.url,
    };
    this.configurations.set(id, updated);

    // Reconnect WebSocket if URL or token changed
    if (updates.url || updates.token) {
      this.disconnectWebSocket(id);
    }

    return updated;
  }

  /**
   * Remove a configuration
   */
  removeConfiguration(id: string): boolean {
    this.disconnectWebSocket(id);
    this.stateCache.delete(id);
    return this.configurations.delete(id);
  }

  /**
   * Get all configurations for a user
   */
  getConfigurations(userId?: string): HomeAssistantConfiguration[] {
    const configs = Array.from(this.configurations.values());
    if (userId) {
      return configs.filter(c => c.userId === userId || !c.userId);
    }
    return configs;
  }

  /**
   * Get a specific configuration
   */
  getConfiguration(id: string): HomeAssistantConfiguration | null {
    return this.configurations.get(id) || null;
  }

  /**
   * Get default configuration for a user
   */
  getDefaultConfiguration(userId?: string): HomeAssistantConfiguration | null {
    const configs = this.getConfigurations(userId);
    return configs.find(c => c.isDefault) || configs[0] || null;
  }

  /**
   * Test connection to a Home Assistant instance
   */
  async testConnection(url: string, token: string): Promise<{ success: boolean; version?: string; error?: string }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

      const response = await fetch(`${url.replace(/\/$/, '')}/api/`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Invalid access token' };
        }
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json();
      return { success: true, version: data.version };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'Connection timed out' };
      }
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // REST API
  // ============================================================================

  /**
   * Make a REST API request to Home Assistant
   */
  private async request<T>(
    configId: string,
    method: 'GET' | 'POST',
    endpoint: string,
    body?: any
  ): Promise<T> {
    const config = this.configurations.get(configId);
    if (!config) {
      throw new Error(`Home Assistant configuration '${configId}' not found`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

    try {
      const url = `${config.url}/api${endpoint}`;
      const options: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      };

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid Home Assistant access token');
        }
        const errorText = await response.text();
        console.error(`[HA] API error on ${method} ${endpoint}: ${response.status} - ${errorText}`);
        throw new Error(`Home Assistant API error (${response.status}): ${errorText}`);
      }

      // Some endpoints return empty response
      const text = await response.text();
      if (!text) return {} as T;

      return JSON.parse(text);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Home Assistant request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get Home Assistant configuration info
   */
  async getConfig(configId: string): Promise<HAConfig> {
    return this.request<HAConfig>(configId, 'GET', '/config');
  }

  /**
   * Get all entity states
   */
  async getStates(configId: string): Promise<HAEntityState[]> {
    const states = await this.request<HAEntityState[]>(configId, 'GET', '/states');

    // Update cache
    if (!this.stateCache.has(configId)) {
      this.stateCache.set(configId, new Map());
    }
    const cache = this.stateCache.get(configId)!;
    for (const state of states) {
      cache.set(state.entity_id, state);
    }

    return states;
  }

  /**
   * Get a specific entity state
   */
  async getState(configId: string, entityId: string): Promise<HAEntityState> {
    const state = await this.request<HAEntityState>(configId, 'GET', `/states/${entityId}`);

    // Update cache
    if (!this.stateCache.has(configId)) {
      this.stateCache.set(configId, new Map());
    }
    this.stateCache.get(configId)!.set(entityId, state);

    return state;
  }

  /**
   * Call a Home Assistant service
   */
  async callService(configId: string, call: HAServiceCall): Promise<HAEntityState[]> {
    const body: any = {};

    if (call.target) {
      if (call.target.entity_id) body.entity_id = call.target.entity_id;
      if (call.target.device_id) body.device_id = call.target.device_id;
      if (call.target.area_id) body.area_id = call.target.area_id;
    }

    if (call.service_data) {
      Object.assign(body, call.service_data);
    }

    return this.request<HAEntityState[]>(
      configId,
      'POST',
      `/services/${call.domain}/${call.service}`,
      body
    );
  }

  // ============================================================================
  // ENTITY HELPERS
  // ============================================================================

  /**
   * Get entities filtered by domain
   */
  async getEntitiesByDomain(configId: string, domain: HADeviceDomain): Promise<HAEntityState[]> {
    const states = await this.getStates(configId);
    return states.filter(s => s.entity_id.startsWith(`${domain}.`));
  }

  /**
   * Get all lights
   */
  async getLights(configId: string): Promise<HAEntityState[]> {
    return this.getEntitiesByDomain(configId, 'light');
  }

  /**
   * Get all switches
   */
  async getSwitches(configId: string): Promise<HAEntityState[]> {
    return this.getEntitiesByDomain(configId, 'switch');
  }

  /**
   * Get all media players
   */
  async getMediaPlayers(configId: string): Promise<HAEntityState[]> {
    return this.getEntitiesByDomain(configId, 'media_player');
  }

  /**
   * Get all climate devices
   */
  async getClimateDevices(configId: string): Promise<HAEntityState[]> {
    return this.getEntitiesByDomain(configId, 'climate');
  }

  /**
   * Get all scenes
   */
  async getScenes(configId: string): Promise<HAEntityState[]> {
    return this.getEntitiesByDomain(configId, 'scene');
  }

  /**
   * Get all areas
   */
  async getAreas(configId: string): Promise<HAArea[]> {
    // Areas require WebSocket API, use registry endpoint
    const config = this.configurations.get(configId);
    if (!config) throw new Error(`Configuration '${configId}' not found`);

    // Try to get areas via WebSocket
    await this.ensureWebSocketConnected(configId);
    const connection = this.wsConnections.get(configId);
    if (connection?.authenticated) {
      return this.sendWebSocketCommand<{ result: HAArea[] }>(connection, 'config/area_registry/list')
        .then(r => r.result || [])
        .catch(() => []);
    }
    return [];
  }

  // ============================================================================
  // COMMON ACTIONS
  // ============================================================================

  /**
   * Turn on an entity
   */
  async turnOn(configId: string, entityId: string, options?: Record<string, any>): Promise<void> {
    const domain = entityId.split('.')[0];
    await this.callService(configId, {
      domain,
      service: 'turn_on',
      target: { entity_id: entityId },
      service_data: options,
    });
  }

  /**
   * Turn off an entity
   */
  async turnOff(configId: string, entityId: string): Promise<void> {
    const domain = entityId.split('.')[0];
    await this.callService(configId, {
      domain,
      service: 'turn_off',
      target: { entity_id: entityId },
    });
  }

  /**
   * Toggle an entity
   */
  async toggle(configId: string, entityId: string): Promise<void> {
    const domain = entityId.split('.')[0];
    await this.callService(configId, {
      domain,
      service: 'toggle',
      target: { entity_id: entityId },
    });
  }

  /**
   * Play/pause media player
   */
  async mediaPlayPause(configId: string, entityId: string): Promise<void> {
    await this.callService(configId, {
      domain: 'media_player',
      service: 'media_play_pause',
      target: { entity_id: entityId },
    });
  }

  /**
   * Set light brightness (0-255)
   */
  async setLightBrightness(configId: string, entityId: string, brightness: number): Promise<void> {
    await this.callService(configId, {
      domain: 'light',
      service: 'turn_on',
      target: { entity_id: entityId },
      service_data: { brightness: Math.max(0, Math.min(255, brightness)) },
    });
  }

  /**
   * Set light color
   */
  async setLightColor(
    configId: string,
    entityId: string,
    color: { r: number; g: number; b: number } | string
  ): Promise<void> {
    let serviceData: Record<string, any>;

    if (typeof color === 'string') {
      // Hex color
      const hex = color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      serviceData = { rgb_color: [r, g, b] };
    } else {
      serviceData = { rgb_color: [color.r, color.g, color.b] };
    }

    await this.callService(configId, {
      domain: 'light',
      service: 'turn_on',
      target: { entity_id: entityId },
      service_data: serviceData,
    });
  }

  /**
   * Set climate temperature
   */
  async setClimateTemperature(configId: string, entityId: string, temperature: number): Promise<void> {
    await this.callService(configId, {
      domain: 'climate',
      service: 'set_temperature',
      target: { entity_id: entityId },
      service_data: { temperature },
    });
  }

  /**
   * Set climate HVAC mode
   */
  async setClimateMode(configId: string, entityId: string, mode: string): Promise<void> {
    await this.callService(configId, {
      domain: 'climate',
      service: 'set_hvac_mode',
      target: { entity_id: entityId },
      service_data: { hvac_mode: mode },
    });
  }

  /**
   * Activate a scene
   */
  async activateScene(configId: string, sceneId: string): Promise<void> {
    await this.callService(configId, {
      domain: 'scene',
      service: 'turn_on',
      target: { entity_id: sceneId },
    });
  }

  /**
   * Run a script
   */
  async runScript(configId: string, scriptId: string, variables?: Record<string, any>): Promise<void> {
    await this.callService(configId, {
      domain: 'script',
      service: scriptId.replace('script.', ''),
      service_data: variables,
    });
  }

  // ============================================================================
  // WEBSOCKET (REAL-TIME STATE UPDATES)
  // ============================================================================

  /**
   * Ensure WebSocket is connected for a configuration
   */
  private async ensureWebSocketConnected(configId: string): Promise<void> {
    const existing = this.wsConnections.get(configId);
    if (existing && existing.ws.readyState === WebSocket.OPEN && existing.authenticated) {
      return;
    }

    await this.connectWebSocket(configId);
  }

  /**
   * Connect WebSocket to Home Assistant
   */
  private async connectWebSocket(configId: string): Promise<void> {
    const config = this.configurations.get(configId);
    if (!config) {
      throw new Error(`Configuration '${configId}' not found`);
    }

    // Disconnect existing connection
    this.disconnectWebSocket(configId);

    return new Promise((resolve, reject) => {
      const wsUrl = config.url.replace(/^http/, 'ws') + '/api/websocket';
      const ws = new WebSocket(wsUrl);

      const connection: HAWebSocketConnection = {
        ws,
        configId,
        messageId: 1,
        authenticated: false,
        pendingMessages: new Map(),
        stateChangeCallbacks: new Set(),
        reconnectAttempts: 0,
      };

      this.wsConnections.set(configId, connection);

      ws.on('open', () => {
        console.log(`[HA] WebSocket connected to ${config.name}`);
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message: HAWSMessage = JSON.parse(data.toString());
          this.handleWebSocketMessage(connection, message, resolve, reject);
        } catch (error) {
          console.error('[HA] Failed to parse WebSocket message:', error);
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`[HA] WebSocket closed for ${config.name}: ${code} ${reason}`);
        connection.authenticated = false;

        // Reject pending messages
        for (const [, pending] of connection.pendingMessages) {
          pending.reject(new Error('WebSocket closed'));
        }
        connection.pendingMessages.clear();

        // Attempt reconnection
        this.scheduleReconnect(configId);
      });

      ws.on('error', (error) => {
        console.error(`[HA] WebSocket error for ${config.name}:`, error.message);
        reject(error);
      });
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleWebSocketMessage(
    connection: HAWebSocketConnection,
    message: HAWSMessage,
    resolveConnect?: (value: void) => void,
    rejectConnect?: (error: Error) => void
  ): void {
    // Authentication flow
    if (message.type === 'auth_required') {
      const config = this.configurations.get(connection.configId);
      if (config) {
        connection.ws.send(JSON.stringify({
          type: 'auth',
          access_token: config.token,
        }));
      }
      return;
    }

    if (message.type === 'auth_ok') {
      connection.authenticated = true;
      connection.reconnectAttempts = 0;
      console.log(`[HA] Authenticated with ${connection.configId}`);

      // Subscribe to state changes
      this.subscribeToStateChanges(connection);

      resolveConnect?.();
      return;
    }

    if (message.type === 'auth_invalid') {
      const error = new Error(`Home Assistant authentication failed: ${message.error?.message || 'Invalid token'}`);
      rejectConnect?.(error);
      return;
    }

    // Handle result for pending messages
    if (message.id && connection.pendingMessages.has(message.id)) {
      const pending = connection.pendingMessages.get(message.id)!;
      connection.pendingMessages.delete(message.id);

      if (message.success) {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(message.error?.message || 'Unknown error'));
      }
      return;
    }

    // Handle state change events
    if (message.type === 'event' && message.event?.event_type === 'state_changed') {
      const newState: HAEntityState = message.event.data.new_state;
      if (newState) {
        console.log(`[HA] State changed: ${newState.entity_id} -> ${newState.state} (${connection.stateChangeCallbacks.size} callbacks)`);

        // Update cache
        if (!this.stateCache.has(connection.configId)) {
          this.stateCache.set(connection.configId, new Map());
        }
        this.stateCache.get(connection.configId)!.set(newState.entity_id, newState);

        // Notify callbacks
        for (const callback of connection.stateChangeCallbacks) {
          try {
            callback(newState);
          } catch (error) {
            console.error('[HA] State change callback error:', error);
          }
        }
      }
    }
  }

  /**
   * Subscribe to state changes via WebSocket
   */
  private subscribeToStateChanges(connection: HAWebSocketConnection): void {
    const id = connection.messageId++;
    connection.subscriptionId = id;

    connection.ws.send(JSON.stringify({
      id,
      type: 'subscribe_events',
      event_type: 'state_changed',
    }));
  }

  /**
   * Send a command via WebSocket and wait for response
   */
  private sendWebSocketCommand<T>(
    connection: HAWebSocketConnection,
    type: string,
    data?: Record<string, any>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (connection.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = connection.messageId++;
      connection.pendingMessages.set(id, { resolve: resolve as any, reject });

      connection.ws.send(JSON.stringify({
        id,
        type,
        ...data,
      }));

      // Timeout
      setTimeout(() => {
        if (connection.pendingMessages.has(id)) {
          connection.pendingMessages.delete(id);
          reject(new Error('WebSocket command timed out'));
        }
      }, this.REQUEST_TIMEOUT);
    });
  }

  /**
   * Disconnect WebSocket for a configuration
   */
  private disconnectWebSocket(configId: string): void {
    const connection = this.wsConnections.get(configId);
    if (connection) {
      if (connection.reconnectTimeout) {
        clearTimeout(connection.reconnectTimeout);
      }
      if (connection.ws.readyState === WebSocket.OPEN || connection.ws.readyState === WebSocket.CONNECTING) {
        connection.ws.close(1000, 'Disconnecting');
      }
      this.wsConnections.delete(configId);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(configId: string): void {
    const connection = this.wsConnections.get(configId);
    if (!connection || connection.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.log(`[HA] Max reconnection attempts reached for ${configId}`);
      return;
    }

    const delay = this.RECONNECT_BASE_DELAY * Math.pow(2, connection.reconnectAttempts);
    connection.reconnectAttempts++;

    console.log(`[HA] Scheduling reconnect for ${configId} in ${delay}ms (attempt ${connection.reconnectAttempts})`);

    connection.reconnectTimeout = setTimeout(() => {
      this.connectWebSocket(configId).catch(error => {
        console.error(`[HA] Reconnection failed for ${configId}:`, error.message);
      });
    }, delay);
  }

  /**
   * Register a callback for state changes
   */
  onStateChange(configId: string, callback: (state: HAEntityState) => void): () => void {
    this.ensureWebSocketConnected(configId).catch(() => {});

    const connection = this.wsConnections.get(configId);
    if (connection) {
      connection.stateChangeCallbacks.add(callback);
      return () => {
        connection.stateChangeCallbacks.delete(callback);
      };
    }

    // Return no-op unsubscribe if not connected
    return () => {};
  }

  // ============================================================================
  // STATE CACHE
  // ============================================================================

  /**
   * Get cached state for an entity
   */
  getCachedState(configId: string, entityId: string): HAEntityState | null {
    return this.stateCache.get(configId)?.get(entityId) || null;
  }

  /**
   * Get all cached states for a configuration
   */
  getCachedStates(configId: string): HAEntityState[] {
    const cache = this.stateCache.get(configId);
    return cache ? Array.from(cache.values()) : [];
  }

  // ============================================================================
  // ENCRYPTION HELPERS
  // ============================================================================

  /**
   * Encrypt a token for storage
   */
  encryptToken(token: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  /**
   * Decrypt a stored token
   */
  decryptToken(encryptedToken: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }
    const data = Buffer.from(encryptedToken, 'base64');
    const iv = data.subarray(0, 16);
    const authTag = data.subarray(16, 32);
    const encrypted = data.subarray(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }
}

export const homeAssistantService = new HomeAssistantService();
export default homeAssistantService;
