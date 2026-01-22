/**
 * Sprites Service
 *
 * API client for Sprites.dev persistent Linux environments.
 * Handles sprite lifecycle: create, start, stop, checkpoint, restore.
 *
 * Features:
 * - Create isolated environments linked to projects
 * - Clone repos and configure Claude Code
 * - Checkpoint and restore sprite state
 * - Execute commands via WebSocket
 */

import { getCredentialStore } from '../plugins/browser/SecureCredentialStore';
import ProjectSprite, { SpriteStatus, SpriteUrlSettings } from '../models/ProjectSprite';
import Project from '../models/Project';

// Types for Sprites API responses
export interface SpritesConfig {
  baseUrl: string;
  defaultTimeout: number; // Timeout for API requests in ms
  initTimeout: number; // Timeout for initialization script in ms
}

export interface SpriteDetails {
  id: string;
  name: string;
  organization: string;
  url: string;
  url_settings?: {
    auth?: 'sprite' | 'public';
  };
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SpritesListResponse {
  sprites: Array<{
    name: string;
    org_slug: string;
    updated_at: string;
  }>;
  has_more: boolean;
  next_continuation_token?: string;
}

export interface CheckpointInfo {
  id: string;
  comment?: string;
  create_time: string;
}

export interface ExecSession {
  id: string | number;
  command: string;
  created: string;
  is_active: boolean;
  tty: boolean;
  workdir?: string;
  last_activity?: string;
  bytes_per_second?: number;
}

export interface CreateSpriteOptions {
  projectId: string;
  organizationId: string;
  createdById: string;
  repoUrl: string;
  branch?: string;
  orgSlug?: string;
}

export interface ExecResult {
  output: string;
  exitCode: number;
  sessionId?: string;
}

// Streaming message types for checkpoints
export interface StreamMessage {
  type: 'info' | 'error' | 'complete';
  data?: string;
  error?: string;
  time: string;
}

class SpritesService {
  private config: SpritesConfig;
  private initialized: boolean = false;

  // Token cache per organization (with TTL)
  private tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

  constructor() {
    this.config = {
      baseUrl: process.env.SPRITES_API_URL || 'https://api.sprites.dev',
      defaultTimeout: parseInt(process.env.SPRITES_DEFAULT_TIMEOUT || '30000', 10),
      initTimeout: parseInt(process.env.SPRITES_INIT_TIMEOUT || '300000', 10), // 5 min
    };
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the Sprites service
   */
  initialize(): void {
    this.initialized = true;
    console.log('✅ Sprites Service initialized');
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // TOKEN MANAGEMENT
  // ============================================================================

  /**
   * Get API token for organization from secure storage
   */
  async getOrgToken(organizationId: string): Promise<string> {
    // Check cache first
    const cached = this.tokenCache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    // Retrieve from SecureCredentialStore
    const credentialStore = getCredentialStore();
    const credential = await credentialStore.getCredential(`sprites:org:${organizationId}`);

    if (!credential) {
      throw new Error('Sprites API token not configured for this organization');
    }

    // Cache for 5 minutes
    this.tokenCache.set(organizationId, {
      token: credential.password,
      expiresAt: Date.now() + 300000,
    });

    return credential.password;
  }

  /**
   * Store API token for organization
   */
  async setOrgToken(organizationId: string, token: string): Promise<void> {
    const credentialStore = getCredentialStore();
    await credentialStore.setCredential(
      `sprites:org:${organizationId}`,
      'api_token',
      token,
      { type: 'sprites', organizationId }
    );

    // Update cache
    this.tokenCache.set(organizationId, {
      token,
      expiresAt: Date.now() + 300000,
    });

    console.log(`🔐 Sprites API token stored for organization: ${organizationId}`);
  }

  /**
   * Remove API token for organization
   */
  async removeOrgToken(organizationId: string): Promise<boolean> {
    const credentialStore = getCredentialStore();
    const deleted = await credentialStore.deleteCredential(`sprites:org:${organizationId}`);
    this.tokenCache.delete(organizationId);
    return deleted;
  }

  /**
   * Check if organization has Sprites token configured
   */
  async hasOrgToken(organizationId: string): Promise<boolean> {
    try {
      await this.getOrgToken(organizationId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get token prefix for display (first 8 chars)
   */
  async getOrgTokenPrefix(organizationId: string): Promise<string | null> {
    try {
      const token = await this.getOrgToken(organizationId);
      return token.substring(0, 8);
    } catch {
      return null;
    }
  }

  // ============================================================================
  // API REQUEST HELPER
  // ============================================================================

  /**
   * Make API request to Sprites
   */
  private async request<T>(
    organizationId: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown>,
    options: { timeout?: number; stream?: boolean } = {}
  ): Promise<T> {
    const token = await this.getOrgToken(organizationId);
    const url = `${this.config.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, options.timeout || this.config.defaultTimeout);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      };

      if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sprites API error (${response.status}): ${errorText}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      // Handle streaming responses (NDJSON)
      if (options.stream) {
        return response as unknown as T;
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Handle streaming NDJSON response
   */
  private async processStream(response: Response): Promise<StreamMessage[]> {
    const messages: StreamMessage[] = [];
    const reader = response.body?.getReader();
    if (!reader) return messages;

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              messages.push(JSON.parse(line));
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return messages;
  }

  // ============================================================================
  // SPRITE LIFECYCLE
  // ============================================================================

  /**
   * Create a new sprite for a project
   */
  async createSprite(options: CreateSpriteOptions): Promise<ProjectSprite> {
    const { projectId, organizationId, createdById, repoUrl, branch, orgSlug } = options;

    // Generate unique sprite name
    const spriteName = ProjectSprite.generateSpriteName(
      projectId,
      orgSlug || organizationId.slice(0, 8)
    );

    // Create DB record first
    const sprite = await ProjectSprite.create({
      projectId,
      organizationId,
      spriteName,
      status: 'creating',
      repoUrl,
      branch: branch || 'main',
      workingDirectory: `/home/sprite/${spriteName}`,
      createdById,
    });

    try {
      // Create sprite via API
      const response = await this.request<SpriteDetails>(
        organizationId,
        'POST',
        '/v1/sprites',
        {
          name: spriteName,
          url_settings: {
            auth: 'sprite', // Require auth by default
          },
        }
      );

      // Update with API response
      const urlSettings: SpriteUrlSettings = {
        url: response.url,
        auth: response.url_settings?.auth || 'sprite',
      };

      await sprite.update({
        spriteId: response.id,
        urlSettings,
        status: 'initializing',
        statusMessage: 'Running initialization script...',
      });

      // Run initialization asynchronously
      this.initializeSprite(sprite.id).catch((error) => {
        console.error(`Sprite initialization failed for ${sprite.id}:`, error);
      });

      return sprite.reload();
    } catch (error) {
      await sprite.update({
        status: 'error',
        errorMessage: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Initialize sprite with repo clone and Claude setup
   */
  private async initializeSprite(spriteId: string): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    try {
      // Wait for sprite to be ready
      await this.waitForSpriteReady(sprite.organizationId, sprite.spriteName);

      // Execute initialization commands
      const commands = [
        // Clone repository
        `git clone --depth 1 ${sprite.repoUrl} ${sprite.workingDirectory}`,
        // Checkout branch if not main
        sprite.branch !== 'main' ? `cd ${sprite.workingDirectory} && git checkout ${sprite.branch}` : null,
        // Create working directory if clone fails (empty project)
        `mkdir -p ${sprite.workingDirectory}`,
        // Install Claude CLI if not present
        `which claude || npm install -g @anthropic-ai/claude-code`,
        // Verify Claude
        `claude --version`,
      ].filter(Boolean) as string[];

      let claudeConfigured = false;

      for (const command of commands) {
        try {
          const result = await this.execCommand(sprite.organizationId, sprite.spriteName, command);
          if (command.includes('claude --version') && result.exitCode === 0) {
            claudeConfigured = true;
          }
        } catch (error) {
          console.warn(`Command failed (continuing): ${command}`, error);
        }
      }

      await sprite.update({
        status: 'running',
        statusMessage: 'Ready',
        claudeConfigured,
        lastAccessedAt: new Date(),
      });

      console.log(`✅ Sprite initialized: ${sprite.spriteName}`);
    } catch (error) {
      await sprite.update({
        status: 'error',
        errorMessage: `Initialization failed: ${(error as Error).message}`,
      });
      throw error;
    }
  }

  /**
   * Wait for sprite to be ready (not cold)
   */
  private async waitForSpriteReady(
    organizationId: string,
    spriteName: string,
    maxWaitMs: number = 60000
  ): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const details = await this.getSpriteDetails(organizationId, spriteName);
        if (details.status !== 'cold') {
          return;
        }
      } catch {
        // Sprite may not be ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error('Timeout waiting for sprite to be ready');
  }

  /**
   * Get sprite details from API
   */
  async getSpriteDetails(organizationId: string, spriteName: string): Promise<SpriteDetails> {
    return this.request<SpriteDetails>(
      organizationId,
      'GET',
      `/v1/sprites/${encodeURIComponent(spriteName)}`
    );
  }

  /**
   * List all sprites for organization from API
   */
  async listSpritesFromApi(organizationId: string): Promise<SpritesListResponse> {
    return this.request<SpritesListResponse>(organizationId, 'GET', '/v1/sprites');
  }

  /**
   * Get sprite by project ID
   */
  async getSpriteByProject(projectId: string): Promise<ProjectSprite | null> {
    return ProjectSprite.getByProject(projectId);
  }

  /**
   * Get all sprites for organization from database
   */
  async getSpritesForOrganization(organizationId: string): Promise<ProjectSprite[]> {
    return ProjectSprite.getByOrganization(organizationId);
  }

  /**
   * Delete a sprite
   */
  async deleteSprite(spriteId: string): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    try {
      await this.request<void>(
        sprite.organizationId,
        'DELETE',
        `/v1/sprites/${encodeURIComponent(sprite.spriteName)}`
      );
    } catch (error) {
      // Sprite may already be deleted on Sprites side
      console.warn(`Delete sprite API call failed (may already be deleted):`, error);
    }

    await sprite.update({ status: 'deleted' });
  }

  /**
   * Stop a sprite (mark as stopped, sprite will hibernate automatically)
   */
  async stopSprite(spriteId: string): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    // Sprites auto-hibernate, so we just update local status
    await sprite.update({
      status: 'stopped',
      statusMessage: 'Stopped by user',
    });
  }

  /**
   * Resume a stopped/hibernating sprite
   */
  async resumeSprite(spriteId: string): Promise<ProjectSprite> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    if (sprite.status === 'deleted') {
      throw new Error('Cannot resume a deleted sprite');
    }

    // Verify sprite exists in API (this wakes it up)
    try {
      await this.getSpriteDetails(sprite.organizationId, sprite.spriteName);
    } catch (error) {
      throw new Error(`Failed to wake sprite: ${(error as Error).message}`);
    }

    await sprite.update({
      status: 'running',
      statusMessage: 'Resumed',
      lastAccessedAt: new Date(),
    });

    return sprite.reload();
  }

  /**
   * Update URL settings for a sprite
   */
  async updateUrlSettings(
    spriteId: string,
    settings: { auth: 'sprite' | 'public' }
  ): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    await this.request<SpriteDetails>(
      sprite.organizationId,
      'PUT',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}`,
      { url_settings: settings }
    );

    await sprite.update({
      urlSettings: { ...sprite.urlSettings, ...settings },
    });
  }

  // ============================================================================
  // CHECKPOINTS
  // ============================================================================

  /**
   * Create a checkpoint
   */
  async createCheckpoint(spriteId: string, comment?: string): Promise<CheckpointInfo> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    await sprite.update({ status: 'checkpointing', statusMessage: 'Creating checkpoint...' });

    try {
      const response = await this.request<Response>(
        sprite.organizationId,
        'POST',
        `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/checkpoint`,
        comment ? { comment } : undefined,
        { stream: true, timeout: 120000 } // 2 min timeout for checkpoint
      );

      // Process streaming response
      const messages = await this.processStream(response as unknown as Response);
      const completeMsg = messages.find((m) => m.type === 'complete');

      if (!completeMsg) {
        const errorMsg = messages.find((m) => m.type === 'error');
        throw new Error(errorMsg?.error || 'Checkpoint creation failed');
      }

      // Get checkpoint info
      const checkpoints = await this.listCheckpoints(spriteId);
      const latestCheckpoint = checkpoints[0];

      await sprite.update({
        status: 'running',
        statusMessage: 'Ready',
        lastCheckpointId: latestCheckpoint?.id || null,
        lastCheckpointAt: new Date(),
        checkpointCount: checkpoints.length,
      });

      return latestCheckpoint;
    } catch (error) {
      await sprite.update({
        status: 'error',
        errorMessage: `Checkpoint failed: ${(error as Error).message}`,
      });
      throw error;
    }
  }

  /**
   * List checkpoints for a sprite
   */
  async listCheckpoints(spriteId: string): Promise<CheckpointInfo[]> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    return this.request<CheckpointInfo[]>(
      sprite.organizationId,
      'GET',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/checkpoints`
    );
  }

  /**
   * Get checkpoint details
   */
  async getCheckpoint(spriteId: string, checkpointId: string): Promise<CheckpointInfo> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    return this.request<CheckpointInfo>(
      sprite.organizationId,
      'GET',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/checkpoints/${checkpointId}`
    );
  }

  /**
   * Restore from checkpoint
   */
  async restoreCheckpoint(spriteId: string, checkpointId: string): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    await sprite.update({ status: 'restoring', statusMessage: 'Restoring from checkpoint...' });

    try {
      const response = await this.request<Response>(
        sprite.organizationId,
        'POST',
        `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/checkpoints/${checkpointId}/restore`,
        undefined,
        { stream: true, timeout: 120000 }
      );

      // Process streaming response
      const messages = await this.processStream(response as unknown as Response);
      const completeMsg = messages.find((m) => m.type === 'complete');

      if (!completeMsg) {
        const errorMsg = messages.find((m) => m.type === 'error');
        throw new Error(errorMsg?.error || 'Restore failed');
      }

      await sprite.update({
        status: 'running',
        statusMessage: 'Restored from checkpoint',
        lastAccessedAt: new Date(),
      });
    } catch (error) {
      await sprite.update({
        status: 'error',
        errorMessage: `Restore failed: ${(error as Error).message}`,
      });
      throw error;
    }
  }

  // ============================================================================
  // COMMAND EXECUTION
  // ============================================================================

  /**
   * Execute a command in the sprite (simple, non-interactive)
   */
  async execCommand(
    organizationId: string,
    spriteName: string,
    command: string,
    options: { timeout?: number; workDir?: string } = {}
  ): Promise<ExecResult> {
    return new Promise(async (resolve, reject) => {
      const token = await this.getOrgToken(organizationId);
      const params = new URLSearchParams();
      params.append('cmd', command);
      if (options.workDir) params.append('dir', options.workDir);

      const wsUrl = `wss://api.sprites.dev/v1/sprites/${encodeURIComponent(spriteName)}/exec?${params.toString()}`;

      // Dynamic import for WebSocket in Node.js
      const WebSocket = require('ws');
      const ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let output = '';
      let exitCode = -1;
      let sessionId: string | undefined;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Command execution timeout'));
      }, options.timeout || this.config.initTimeout);

      ws.on('open', () => {
        // Command is sent via query params, no need to send anything
      });

      ws.on('message', (data: Buffer) => {
        try {
          // Handle binary output
          if (Buffer.isBuffer(data)) {
            // First byte might be channel indicator (0=stdout, 1=stderr)
            const text = data.toString('utf8');
            output += text;
          } else {
            // JSON message
            const msg = JSON.parse(data.toString());
            if (msg.type === 'session_info') {
              sessionId = msg.session_id?.toString();
            } else if (msg.type === 'exit') {
              exitCode = msg.exit_code || 0;
            } else if (msg.stdout) {
              output += msg.stdout;
            } else if (msg.stderr) {
              output += msg.stderr;
            }
          }
        } catch {
          // Binary data, add to output
          output += data.toString();
        }
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        resolve({ output, exitCode: exitCode >= 0 ? exitCode : 0, sessionId });
      });

      ws.on('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Get WebSocket URL for exec endpoint (for real-time streaming to frontend)
   */
  async getExecWebSocketInfo(
    spriteId: string,
    options: {
      tty?: boolean;
      command?: string;
      cols?: number;
      rows?: number;
      sessionId?: string;
    } = {}
  ): Promise<{ wsUrl: string; token: string }> {
    console.log(`[SpritesService] getExecWebSocketInfo called for sprite: ${spriteId}`);

    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      console.error(`[SpritesService] Sprite not found: ${spriteId}`);
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName) {
      console.error(`[SpritesService] Sprite has no spriteName: ${spriteId}`);
      throw new Error('Sprite not initialized - missing spriteName');
    }

    console.log(`[SpritesService] Found sprite: ${sprite.spriteName}, status: ${sprite.status}`);

    const token = await this.getOrgToken(sprite.organizationId);
    console.log(`[SpritesService] Got org token for: ${sprite.organizationId}`);

    const params = new URLSearchParams();
    // Default to tty mode for terminal
    params.append('tty', options.tty !== false ? 'true' : 'false');
    if (options.command) params.append('cmd', options.command);
    if (options.cols) params.append('cols', options.cols.toString());
    if (options.rows) params.append('rows', options.rows.toString());
    // Note: sessionId might be used for reconnecting to existing sessions
    // The Sprites API may or may not support this parameter

    const wsUrl = `wss://api.sprites.dev/v1/sprites/${encodeURIComponent(sprite.spriteName)}/exec?${params.toString()}`;
    console.log(`[SpritesService] Built WebSocket URL: ${wsUrl}`);

    // Update last accessed
    await sprite.update({
      lastAccessedAt: new Date(),
      status: 'running',
    });

    return { wsUrl, token };
  }

  /**
   * List active exec sessions
   */
  async listExecSessions(spriteId: string): Promise<ExecSession[]> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    return this.request<ExecSession[]>(
      sprite.organizationId,
      'GET',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/exec`
    );
  }

  /**
   * Kill an exec session
   */
  async killExecSession(spriteId: string, sessionId: string | number): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    const response = await this.request<Response>(
      sprite.organizationId,
      'POST',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/exec/${sessionId}/kill`,
      undefined,
      { stream: true }
    );

    // Process streaming response
    await this.processStream(response as unknown as Response);
  }

  // ============================================================================
  // SYNC UTILITIES
  // ============================================================================

  /**
   * Sync local sprite status with Sprites API
   */
  async syncSpriteStatus(spriteId: string): Promise<ProjectSprite> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    if (sprite.status === 'deleted') {
      return sprite;
    }

    try {
      const details = await this.getSpriteDetails(sprite.organizationId, sprite.spriteName);

      // Map API status to local status
      let status: SpriteStatus = sprite.status;
      if (details.status === 'cold') {
        status = 'hibernating';
      } else if (details.status === 'running') {
        status = 'running';
      }

      await sprite.update({
        status,
        urlSettings: {
          url: details.url,
          auth: details.url_settings?.auth,
        },
      });

      return sprite.reload();
    } catch (error) {
      // Sprite may have been deleted externally
      if ((error as Error).message.includes('404')) {
        await sprite.update({ status: 'deleted' });
      }
      return sprite.reload();
    }
  }
}

export const spritesService = new SpritesService();
export default spritesService;
