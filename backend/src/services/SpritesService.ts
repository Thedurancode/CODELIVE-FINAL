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
import SpriteSession from '../models/SpriteSession';
import type { SessionStartReason, SessionEndReason } from '../models/SpriteSession';
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

// Kill session streaming event types
export type KillSessionEventType = 'signal' | 'timeout' | 'exited' | 'killed' | 'error' | 'complete';

export interface KillSessionEvent {
  type: KillSessionEventType;
  message?: string;
  signal?: string; // e.g., 'SIGTERM', 'SIGKILL'
  pid?: number;
  exit_code?: number;
}

// ============================================================================
// FILESYSTEM API TYPES
// ============================================================================

// File/directory entry from list operation
export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mode: string; // Octal permissions e.g., '0644'
  modTime: string; // ISO timestamp
  uid: number;
  gid: number;
}

// List directory response
export interface ListDirectoryResponse {
  entries: FileEntry[];
  path: string;
}

// Delete options
export interface DeleteOptions {
  path: string;
  workingDir: string;
  recursive: boolean;
  asRoot?: boolean;
}

// Rename/move options
export interface RenameOptions {
  source: string;
  dest: string;
  workingDir: string;
  asRoot?: boolean;
}

// Copy options
export interface CopyOptions {
  source: string;
  dest: string;
  workingDir: string;
  recursive?: boolean;
  preserveAttrs?: boolean;
  asRoot?: boolean;
}

// Chmod options
export interface ChmodOptions {
  path: string;
  workingDir: string;
  mode: string; // Octal e.g., '0755'
  recursive?: boolean;
  asRoot?: boolean;
}

// Chown options
export interface ChownOptions {
  path: string;
  workingDir: string;
  uid: number | string;
  gid: number | string;
  recursive?: boolean;
  asRoot?: boolean;
}

// Watch event from filesystem WebSocket
export type WatchEventType = 'create' | 'modify' | 'delete' | 'rename' | 'chmod';

export interface WatchEvent {
  type: 'event' | 'error' | 'subscribed' | 'unsubscribed';
  path?: string;
  event?: WatchEventType;
  timestamp?: string;
  size?: number;
  isDir?: boolean;
  message?: string;
}

// Watch subscription request
export interface WatchRequest {
  type: 'subscribe' | 'unsubscribe';
  paths: string[];
  recursive?: boolean;
  workingDir: string;
}

// ============================================================================
// SERVICES API TYPES
// ============================================================================

// Service status
export type ServiceStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error';

// Service definition
export interface SpriteService {
  id: string;
  name: string;
  command: string;
  args?: string[];
  workingDir?: string;
  env?: Record<string, string>;
  status: ServiceStatus;
  pid?: number;
  port?: number;
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
  exitCode?: number;
  error?: string;
}

// Create service options
export interface CreateServiceOptions {
  name: string;
  command: string;
  args?: string[];
  workingDir?: string;
  env?: Record<string, string>;
  autoStart?: boolean;
  port?: number;
}

// Service log entry
export interface ServiceLogEntry {
  timestamp: string;
  stream: 'stdout' | 'stderr';
  data: string;
}

// Service logs response
export interface ServiceLogsResponse {
  serviceId: string;
  logs: ServiceLogEntry[];
  hasMore: boolean;
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

    if (credential) {
      // Cache for 5 minutes
      this.tokenCache.set(organizationId, {
        token: credential.password,
        expiresAt: Date.now() + 300000,
      });
      return credential.password;
    }

    // Fallback to environment variable for local development
    const envToken = process.env.SPRITES_API_TOKEN;
    if (envToken && envToken !== 'your_token_here') {
      console.log('[SpritesService] Using SPRITES_API_TOKEN from environment');
      // Cache env token too
      this.tokenCache.set(organizationId, {
        token: envToken,
        expiresAt: Date.now() + 300000,
      });
      return envToken;
    }

    throw new Error('Sprites API token not configured. Set SPRITES_API_TOKEN in .env or configure in Settings.');
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
  // GITHUB TOKEN MANAGEMENT
  // ============================================================================

  /**
   * Get GitHub token for organization from secure storage
   * Used to authenticate git operations in sprites (push, PR creation, etc.)
   */
  async getGitHubToken(organizationId: string): Promise<string | null> {
    // Check cache first
    const cacheKey = `github:${organizationId}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    // Retrieve from SecureCredentialStore
    const credentialStore = getCredentialStore();
    const credential = await credentialStore.getCredential(`github:org:${organizationId}`);

    if (credential) {
      // Cache for 5 minutes
      this.tokenCache.set(cacheKey, {
        token: credential.password,
        expiresAt: Date.now() + 300000,
      });
      return credential.password;
    }

    // Fallback to environment variable for local development
    const envToken = process.env.GITHUB_TOKEN;
    if (envToken && envToken !== 'your_token_here') {
      console.log('[SpritesService] Using GITHUB_TOKEN from environment');
      this.tokenCache.set(cacheKey, {
        token: envToken,
        expiresAt: Date.now() + 300000,
      });
      return envToken;
    }

    return null;
  }

  /**
   * Store GitHub token for organization
   */
  async setGitHubToken(organizationId: string, token: string): Promise<void> {
    const credentialStore = getCredentialStore();
    await credentialStore.setCredential(
      `github:org:${organizationId}`,
      'github_pat',
      token,
      { type: 'github', organizationId }
    );

    // Update cache
    const cacheKey = `github:${organizationId}`;
    this.tokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + 300000,
    });

    console.log(`🔐 GitHub token stored for organization: ${organizationId}`);
  }

  /**
   * Remove GitHub token for organization
   */
  async removeGitHubToken(organizationId: string): Promise<boolean> {
    const credentialStore = getCredentialStore();
    const deleted = await credentialStore.deleteCredential(`github:org:${organizationId}`);
    this.tokenCache.delete(`github:${organizationId}`);
    return deleted;
  }

  /**
   * Check if organization has GitHub token configured
   */
  async hasGitHubToken(organizationId: string): Promise<boolean> {
    const token = await this.getGitHubToken(organizationId);
    return token !== null;
  }

  /**
   * Get GitHub token prefix for display (first 8 chars)
   */
  async getGitHubTokenPrefix(organizationId: string): Promise<string | null> {
    const token = await this.getGitHubToken(organizationId);
    return token ? token.substring(0, 8) : null;
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

  /**
   * Parse a command string into an array of arguments, respecting quotes.
   * Handles: simple commands, quoted strings, escaped characters.
   * Examples:
   *   "echo hello" -> ["echo", "hello"]
   *   "git clone https://github.com/foo/bar.git" -> ["git", "clone", "https://github.com/foo/bar.git"]
   *   'echo "hello world"' -> ["echo", "hello world"]
   */
  private parseCommandString(command: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuote: string | null = null;
    let escaped = false;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (inQuote) {
        if (char === inQuote) {
          inQuote = null;
        } else {
          current += char;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inQuote = char;
        continue;
      }

      if (char === ' ' || char === '\t') {
        if (current) {
          parts.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (current) {
      parts.push(current);
    }

    return parts;
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

      // Start tracking session when sprite is created
      await this.startSession(sprite.id, 'created', options.createdById);

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
   * Can be called manually to re-run initialization if it failed
   *
   * When GitHub is configured, automatically creates a feature branch for the sprite
   * to work on. This allows Claude to make commits and create PRs without touching main.
   */
  async initializeSprite(spriteId: string): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    try {
      // Wait for sprite to be ready
      await this.waitForSpriteReady(sprite.organizationId, sprite.spriteName);

      // Get GitHub token for the organization (if configured)
      const githubToken = await this.getGitHubToken(sprite.organizationId);
      let githubConfigured = false;

      // Generate feature branch name for this sprite
      // Format: sprite/{spriteName} - unique per sprite, easy to identify
      const featureBranch = `sprite/${sprite.spriteName}`;

      // Build initialization commands
      const commands: string[] = [];

      // Configure GitHub authentication first (if token available)
      if (githubToken) {
        commands.push(
          // Configure git credential helper to use the token
          `git config --global credential.helper store`,
          // Store credentials for GitHub (token as password, 'x-access-token' as username for PAT)
          `echo "https://x-access-token:${githubToken}@github.com" > ~/.git-credentials`,
          `chmod 600 ~/.git-credentials`,
          // Install GitHub CLI if not present
          `which gh || (curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt-get update && sudo apt-get install gh -y)`,
          // Authenticate gh CLI with the token
          `echo "${githubToken}" | gh auth login --with-token`,
          // Configure git to use gh for authentication (backup method)
          `gh auth setup-git`,
          // Verify gh auth status
          `gh auth status`
        );
      }

      // Clone repository only if not already cloned (check for .git directory)
      // Use authenticated URL for private repos
      let cloneUrl = sprite.repoUrl;
      if (githubToken && sprite.repoUrl.includes('github.com')) {
        // Convert https://github.com/owner/repo to https://x-access-token:TOKEN@github.com/owner/repo
        cloneUrl = sprite.repoUrl.replace(
          'https://github.com/',
          `https://x-access-token:${githubToken}@github.com/`
        );
      }
      commands.push(
        // Only clone if .git directory doesn't exist (repo not yet cloned)
        `[ -d "${sprite.workingDirectory}/.git" ] || git clone ${cloneUrl} ${sprite.workingDirectory}`,
        // Checkout base branch if not main (only if not already on it)
        sprite.branch !== 'main' ? `cd ${sprite.workingDirectory} && git checkout ${sprite.branch} 2>/dev/null || true` : null,
        // Create working directory if it doesn't exist (empty project case)
        `mkdir -p ${sprite.workingDirectory}`,
        // Configure git user for commits (use a default, can be overridden)
        `git config --global user.email "sprite@dispotree.com"`,
        `git config --global user.name "Dispotree Sprite"`,
        // Set the remote URL back to the clean URL (without token) for safety
        githubToken ? `cd ${sprite.workingDirectory} && git remote set-url origin ${sprite.repoUrl} 2>/dev/null || true` : null
      );

      // Create and push feature branch (only if GitHub is configured)
      if (githubToken) {
        commands.push(
          // Create the feature branch only if it doesn't already exist locally
          `cd ${sprite.workingDirectory} && git rev-parse --verify ${featureBranch} 2>/dev/null || git checkout -b ${featureBranch}`,
          // Switch to feature branch if not already on it
          `cd ${sprite.workingDirectory} && git checkout ${featureBranch} 2>/dev/null || true`,
          // Push the feature branch (will succeed if already pushed, or push new)
          `cd ${sprite.workingDirectory} && git push -u origin ${featureBranch} 2>/dev/null || true`
        );
      }

      // Install Claude CLI
      commands.push(
        // Install Claude CLI if not present
        `which claude || npm install -g @anthropic-ai/claude-code`,
        // Verify Claude
        `claude --version`
      );

      // Filter out null commands
      const filteredCommands = commands.filter(Boolean) as string[];

      let claudeConfigured = false;
      let featureBranchCreated = false;

      for (const command of filteredCommands) {
        try {
          const result = await this.execCommand(sprite.organizationId, sprite.spriteName, command);
          if (command.includes('claude --version') && result.exitCode === 0) {
            claudeConfigured = true;
          }
          if (command.includes('gh auth status') && result.exitCode === 0) {
            githubConfigured = true;
          }
          if (command.includes(`git push -u origin ${featureBranch}`) && result.exitCode === 0) {
            featureBranchCreated = true;
          }
        } catch (error) {
          console.warn(`Command failed (continuing): ${command}`, error);
        }
      }

      // Determine the active branch - feature branch if created, otherwise base branch
      const activeBranch = featureBranchCreated ? featureBranch : sprite.branch;

      await sprite.update({
        status: 'running',
        statusMessage: 'Ready',
        claudeConfigured,
        githubConfigured,
        featureBranch: featureBranchCreated ? featureBranch : null,
        lastAccessedAt: new Date(),
      });

      console.log(`✅ Sprite initialized: ${sprite.spriteName}`);
      console.log(`   GitHub: ${githubConfigured ? 'yes' : 'no'}`);
      console.log(`   Feature branch: ${featureBranchCreated ? featureBranch : 'none (working on ' + sprite.branch + ')'}`);
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
   * Stop a sprite by creating a checkpoint (forces hibernate) and setting URL to private
   */
  async stopSprite(spriteId: string): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    // Store the previous auth setting so we can restore it on resume
    const previousAuth = sprite.urlSettings?.auth || 'sprite';

    // Stop all running MCP servers first
    // Import dynamically to avoid circular dependency
    try {
      const { spriteMcpService } = await import('./SpriteMcpService');
      const stoppedCount = await spriteMcpService.stopAllServers(sprite.id);
      if (stoppedCount > 0) {
        console.log(`[SpritesService] Stopped ${stoppedCount} MCP servers on sprite ${sprite.id}`);
      }
    } catch (error) {
      // Don't fail the stop if MCP server stop fails
      console.error(`[SpritesService] Error stopping MCP servers:`, error);
    }

    // Update status to show we're stopping
    await sprite.update({
      status: 'checkpointing',
      statusMessage: 'Stopping and saving state...',
    });

    // Create a checkpoint to save state and force hibernate
    try {
      const response = await this.request<Response>(
        sprite.organizationId,
        'POST',
        `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/checkpoint`,
        { comment: 'Stopped by user' },
        { stream: true, timeout: 120000 }
      );

      // Process streaming response
      const messages = await this.processStream(response as unknown as Response);
      const completeMsg = messages.find((m) => m.type === 'complete');

      if (!completeMsg) {
        const errorMsg = messages.find((m) => m.type === 'error');
        console.warn('Checkpoint during stop may have issues:', errorMsg?.error);
        // Continue anyway - we still want to mark as stopped
      }

      // Update checkpoint info
      const checkpoints = await this.listCheckpoints(spriteId);
      const latestCheckpoint = checkpoints[0];
      if (latestCheckpoint) {
        await sprite.update({
          lastCheckpointId: latestCheckpoint.id,
          lastCheckpointAt: new Date(),
          checkpointCount: checkpoints.length,
        });
      }
    } catch (error) {
      console.warn('Checkpoint during stop failed:', error);
      // Continue anyway - sprite may auto-hibernate, but we still mark as stopped
    }

    // Set URL to private (requires auth) so public link won't work
    try {
      await this.request<void>(
        sprite.organizationId,
        'PUT',
        `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/url`,
        { auth: 'sprite' } // Require authentication
      );
    } catch (error) {
      console.warn('Failed to set sprite URL to private:', error);
    }

    // End the current session
    await this.endSession(sprite.id, 'checkpointed');

    await sprite.update({
      status: 'stopped',
      statusMessage: 'Stopped by user',
      currentSessionId: null, // Clear session ID - shell processes are terminated during checkpoint
      urlSettings: {
        ...sprite.urlSettings,
        auth: 'sprite',
        previousAuth, // Store previous setting for resume
      },
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

    // If we have a checkpoint, restore from it to ensure file persistence
    if (sprite.lastCheckpointId) {
      console.log(`[SpritesService] Restoring sprite ${spriteId} from checkpoint ${sprite.lastCheckpointId}`);

      await sprite.update({ status: 'restoring', statusMessage: 'Restoring from checkpoint...' });

      try {
        const response = await this.request<Response>(
          sprite.organizationId,
          'POST',
          `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/checkpoints/${sprite.lastCheckpointId}/restore`,
          undefined,
          { stream: true, timeout: 120000 }
        );

        // Process streaming response
        const messages = await this.processStream(response as unknown as Response);
        const completeMsg = messages.find((m) => m.type === 'complete');

        if (!completeMsg) {
          const errorMsg = messages.find((m) => m.type === 'error');
          console.warn('Checkpoint restore may have issues:', errorMsg?.error);
          // Continue anyway - sprite might still work
        }
      } catch (error) {
        console.warn('Failed to restore from checkpoint, waking sprite without restore:', error);
        // Fall through to regular wake-up
      }
    } else {
      // No checkpoint - just wake the sprite
      console.log(`[SpritesService] Waking sprite ${spriteId} (no checkpoint to restore)`);
      try {
        await this.getSpriteDetails(sprite.organizationId, sprite.spriteName);
      } catch (error) {
        throw new Error(`Failed to wake sprite: ${(error as Error).message}`);
      }
    }

    // Restore previous URL auth setting if it was public before
    const previousAuth = (sprite.urlSettings as any)?.previousAuth;
    if (previousAuth === 'public') {
      try {
        await this.request<void>(
          sprite.organizationId,
          'PUT',
          `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/url`,
          { auth: 'public' }
        );
      } catch (error) {
        console.warn('Failed to restore sprite URL to public:', error);
      }
    }

    // Start a new session for the resumed sprite
    await this.startSession(sprite.id, 'resumed');

    await sprite.update({
      status: 'running',
      statusMessage: 'Resumed from checkpoint',
      lastAccessedAt: new Date(),
      urlSettings: {
        ...sprite.urlSettings,
        auth: previousAuth || sprite.urlSettings?.auth || 'sprite',
      },
    });

    // Auto-start MCP servers that were configured to auto-start
    // Import dynamically to avoid circular dependency
    const { spriteMcpService } = await import('./SpriteMcpService');
    try {
      const autoStartResult = await spriteMcpService.startAutoStartServers(sprite.id);
      if (autoStartResult.started.length > 0) {
        console.log(`[SpritesService] Auto-started ${autoStartResult.started.length} MCP servers on sprite ${sprite.id}`);
      }
      if (autoStartResult.failed.length > 0) {
        console.warn(`[SpritesService] Failed to auto-start ${autoStartResult.failed.length} MCP servers:`, autoStartResult.failed);
      }
    } catch (error) {
      // Don't fail the resume if MCP auto-start fails
      console.error(`[SpritesService] Error auto-starting MCP servers:`, error);
    }

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

      // Start a new session for the restored sprite
      await this.startSession(sprite.id, 'restored');

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

      // Sprites API requires repeated 'cmd' params for command + args
      // Detect shell operators that require wrapping in sh -c
      const shellOperators = ['||', '&&', '|', '>', '<', ';', '`', '$', '(', ')', '{', '}'];
      const needsShell = shellOperators.some((op) => command.includes(op));

      if (needsShell) {
        // Wrap in sh -c for shell interpretation
        params.append('cmd', 'sh');
        params.append('cmd', '-c');
        params.append('cmd', command);
      } else {
        // Simple command - parse and pass as separate args
        const parts = this.parseCommandString(command);
        for (const part of parts) {
          params.append('cmd', part);
        }
      }

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
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

        // Check for binary stream protocol: 0x01=stdout, 0x02=stderr, 0x03=exit
        if (buf.length > 1) {
          const streamId = buf[0];
          if (streamId === 0x01 || streamId === 0x02) {
            // stdout or stderr - append payload
            output += buf.slice(1).toString('utf8');
            return;
          }
          if (streamId === 0x03) {
            // exit code
            exitCode = buf.length > 1 ? buf[1] : 0;
            return;
          }
        }

        // Try parsing as JSON (for session_info, exit messages)
        try {
          const msg = JSON.parse(buf.toString('utf8'));
          if (msg.type === 'session_info') {
            sessionId = msg.session_id?.toString();
          } else if (msg.type === 'exit') {
            exitCode = msg.exit_code ?? 0;
          }
        } catch {
          // Not JSON, treat as raw output
          output += buf.toString('utf8');
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
    const isTty = options.tty !== false;
    // Default to tty mode for terminal
    params.append('tty', isTty ? 'true' : 'false');

    // Build command: Start Claude Code
    let command = options.command;
    if (!command && isTty) {
      command = 'claude';
    }

    if (command) {
      params.append('cmd', command);
      console.log(`[SpritesService] Command: ${command}`);
    } else {
      throw new Error('No command specified for exec');
    }

    // Always pass cols/rows for proper terminal sizing
    params.append('cols', (options.cols || 80).toString());
    params.append('rows', (options.rows || 24).toString());
    // Note: sessionId might be used for reconnecting to existing sessions

    const wsUrl = `wss://api.sprites.dev/v1/sprites/${encodeURIComponent(sprite.spriteName)}/exec?${params.toString()}`;
    console.log(`[SpritesService] Built WebSocket URL: ${wsUrl}`);

    // Check actual sprite status from Sprites API and wake if needed
    try {
      const spriteStatus = await this.request<{ status: string }>(
        sprite.organizationId,
        'GET',
        `/v1/sprites/${encodeURIComponent(sprite.spriteName)}`
      );
      console.log(`[SpritesService] Sprite actual status on Sprites.dev: ${spriteStatus.status}`);

      if (spriteStatus.status === 'warm' || spriteStatus.status === 'cold') {
        console.log(`[SpritesService] Sprite is ${spriteStatus.status}, waking up and waiting...`);
        // Update local status
        await sprite.update({ status: 'initializing', statusMessage: 'Waking up sprite...' });

        // Wait for sprite to be ready (poll until status is 'running' or 'hot')
        const maxWaitMs = 30000; // 30 seconds
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
          try {
            const checkStatus = await this.request<{ status: string }>(
              sprite.organizationId,
              'GET',
              `/v1/sprites/${encodeURIComponent(sprite.spriteName)}`
            );
            console.log(`[SpritesService] Sprite wake check: ${checkStatus.status}`);
            if (checkStatus.status === 'running' || checkStatus.status === 'hot') {
              console.log(`[SpritesService] Sprite is now running!`);
              await sprite.update({ status: 'running', statusMessage: null });
              break;
            }
          } catch (pollError) {
            console.warn(`[SpritesService] Error polling sprite status:`, pollError);
          }
        }
      }
    } catch (statusError) {
      console.warn(`[SpritesService] Could not check sprite status:`, statusError);
    }

    // Update last accessed
    await sprite.update({
      lastAccessedAt: new Date(),
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
   * Kill session streaming event types
   */
  // Defined inline to avoid circular dependencies

  /**
   * Kill an exec session with streaming events
   * Returns an array of streaming events from the kill operation
   */
  async killExecSession(
    spriteId: string,
    sessionId: string | number,
    options: { signal?: string; timeout?: string } = {}
  ): Promise<KillSessionEvent[]> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    // Build query params
    const params = new URLSearchParams();
    if (options.signal) params.append('signal', options.signal);
    if (options.timeout) params.append('timeout', options.timeout);

    const queryString = params.toString();
    const path = `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/exec/${sessionId}/kill${queryString ? `?${queryString}` : ''}`;

    const response = await this.request<Response>(
      sprite.organizationId,
      'POST',
      path,
      undefined,
      { stream: true }
    );

    // Process streaming NDJSON response
    const events = await this.processKillStream(response as unknown as Response);
    return events;
  }

  /**
   * Process streaming NDJSON response from kill endpoint
   */
  private async processKillStream(response: Response): Promise<KillSessionEvent[]> {
    const events: KillSessionEvent[] = [];
    const reader = response.body?.getReader();
    if (!reader) return events;

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
              const event = JSON.parse(line) as KillSessionEvent;
              events.push(event);
              console.log(`[SpritesService] Kill event:`, event);
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return events;
  }

  // ============================================================================
  // FILESYSTEM API
  // ============================================================================

  /**
   * Read file contents from sprite filesystem
   * Returns raw file bytes as Buffer
   */
  async readFile(
    spriteId: string,
    path: string,
    workingDir: string = '/home/sprite'
  ): Promise<Buffer> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    const token = await this.getOrgToken(sprite.organizationId);
    const params = new URLSearchParams({
      path,
      workingDir,
    });

    const url = `${this.config.baseUrl}/v1/sprites/${encodeURIComponent(sprite.spriteName)}/fs/read?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to read file (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Read file contents as string (convenience method)
   */
  async readFileText(
    spriteId: string,
    path: string,
    workingDir: string = '/home/sprite'
  ): Promise<string> {
    const buffer = await this.readFile(spriteId, path, workingDir);
    return buffer.toString('utf8');
  }

  /**
   * Write file contents to sprite filesystem
   */
  async writeFile(
    spriteId: string,
    path: string,
    content: Buffer | string,
    options: {
      workingDir?: string;
      mode?: string; // Octal e.g., '0644'
      mkdir?: boolean; // Create parent directories
    } = {}
  ): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    const token = await this.getOrgToken(sprite.organizationId);
    const params = new URLSearchParams({
      path,
      workingDir: options.workingDir || '/home/sprite',
    });

    if (options.mode) params.append('mode', options.mode);
    if (options.mkdir) params.append('mkdir', 'true');

    const url = `${this.config.baseUrl}/v1/sprites/${encodeURIComponent(sprite.spriteName)}/fs/write?${params.toString()}`;

    const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to write file (${response.status}): ${errorText}`);
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(
    spriteId: string,
    path: string,
    workingDir: string = '/home/sprite'
  ): Promise<FileEntry[]> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    const token = await this.getOrgToken(sprite.organizationId);
    const params = new URLSearchParams({
      path,
      workingDir,
    });

    const url = `${this.config.baseUrl}/v1/sprites/${encodeURIComponent(sprite.spriteName)}/fs/list?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list directory (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.entries || data || [];
  }

  /**
   * Delete file or directory
   */
  async deleteFile(spriteId: string, options: DeleteOptions): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    await this.request<void>(
      sprite.organizationId,
      'DELETE',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/fs/delete`,
      {
        path: options.path,
        workingDir: options.workingDir,
        recursive: options.recursive,
        asRoot: options.asRoot || false,
      }
    );
  }

  /**
   * Rename or move file/directory
   */
  async renameFile(spriteId: string, options: RenameOptions): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    await this.request<void>(
      sprite.organizationId,
      'POST',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/fs/rename`,
      {
        source: options.source,
        dest: options.dest,
        workingDir: options.workingDir,
        asRoot: options.asRoot || false,
      }
    );
  }

  /**
   * Copy file or directory
   */
  async copyFile(spriteId: string, options: CopyOptions): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    await this.request<void>(
      sprite.organizationId,
      'POST',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/fs/copy`,
      {
        source: options.source,
        dest: options.dest,
        workingDir: options.workingDir,
        recursive: options.recursive ?? false,
        preserveAttrs: options.preserveAttrs ?? false,
        asRoot: options.asRoot || false,
      }
    );
  }

  /**
   * Change file permissions (chmod)
   */
  async chmod(spriteId: string, options: ChmodOptions): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    await this.request<void>(
      sprite.organizationId,
      'POST',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/fs/chmod`,
      {
        path: options.path,
        workingDir: options.workingDir,
        mode: options.mode,
        recursive: options.recursive ?? false,
        asRoot: options.asRoot || false,
      }
    );
  }

  /**
   * Change file ownership (chown)
   */
  async chown(spriteId: string, options: ChownOptions): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    await this.request<void>(
      sprite.organizationId,
      'POST',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/fs/chown`,
      {
        path: options.path,
        workingDir: options.workingDir,
        uid: options.uid,
        gid: options.gid,
        recursive: options.recursive ?? false,
        asRoot: options.asRoot || false,
      }
    );
  }

  /**
   * Get WebSocket URL for filesystem watch endpoint
   * Used to watch for real-time file changes
   */
  async getFilesystemWatchInfo(spriteId: string): Promise<{ wsUrl: string; token: string }> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    const token = await this.getOrgToken(sprite.organizationId);
    const wsUrl = `wss://api.sprites.dev/v1/sprites/${encodeURIComponent(sprite.spriteName)}/fs/watch`;

    return { wsUrl, token };
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

  /**
   * Execute Claude Code in streaming mode for chat interface.
   * Uses `claude -p "prompt" --output-format stream-json` for structured output.
   * Yields parsed events as they arrive via WebSocket.
   */
  async *execClaudeChatStream(
    spriteId: string,
    prompt: string,
    options: {
      continueSession?: boolean;
      workDir?: string;
      timeout?: number;
    } = {}
  ): AsyncGenerator<
    { type: 'text' | 'tool_start' | 'tool_end' | 'error' | 'done' | 'init'; data?: string; error?: string; sessionId?: string },
    void,
    unknown
  > {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      yield { type: 'error', error: 'Sprite not found' };
      return;
    }

    if (!sprite.spriteName) {
      yield { type: 'error', error: 'Sprite not initialized' };
      return;
    }

    if (sprite.status !== 'running') {
      yield { type: 'error', error: `Sprite is not running (status: ${sprite.status})` };
      return;
    }

    const token = await this.getOrgToken(sprite.organizationId);
    const params = new URLSearchParams();

    // Escape the prompt for shell
    const escapedPrompt = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');

    // Build claude command with stream-json output
    // Note: --verbose is required when using --output-format=stream-json with -p
    let command = `claude -p "${escapedPrompt}" --output-format stream-json --verbose`;
    if (options.continueSession) {
      command += ' --continue';
    }

    // Use sh -c to handle the complex command
    params.append('cmd', 'sh');
    params.append('cmd', '-c');
    params.append('cmd', command);
    params.append('tty', 'false');

    if (options.workDir || sprite.workingDirectory) {
      params.append('dir', options.workDir || sprite.workingDirectory);
    }

    const wsUrl = `wss://api.sprites.dev/v1/sprites/${encodeURIComponent(sprite.spriteName)}/exec?${params.toString()}`;

    // Create a promise-based async iterator for WebSocket events
    const WebSocket = require('ws');
    const ws = new WebSocket(wsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Queue to hold events until they're consumed
    const eventQueue: Array<{ type: string; data?: string; error?: string; sessionId?: string }> = [];
    let resolveNext: ((value: IteratorResult<any, void>) => void) | null = null;
    let isDone = false;
    let accumulatedText = '';
    let sessionId: string | undefined;

    const pushEvent = (event: { type: string; data?: string; error?: string; sessionId?: string }) => {
      if (resolveNext) {
        resolveNext({ value: event, done: false });
        resolveNext = null;
      } else {
        eventQueue.push(event);
      }
    };

    const timeout = setTimeout(() => {
      ws.close();
      pushEvent({ type: 'error', error: 'Command execution timeout' });
      isDone = true;
    }, options.timeout || this.config.initTimeout);

    ws.on('open', () => {
      pushEvent({ type: 'init', data: 'Connected to sprite', sessionId });
    });

    ws.on('message', (data: Buffer) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

      // Check for binary stream protocol
      if (buf.length > 1) {
        const streamId = buf[0];
        if (streamId === 0x01 || streamId === 0x02) {
          // stdout or stderr
          const text = buf.slice(1).toString('utf8');
          accumulatedText += text;

          // Try to parse complete JSON lines from accumulated text
          const lines = accumulatedText.split('\n');
          accumulatedText = lines.pop() || ''; // Keep incomplete line

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              // Parse Claude's stream-json format
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                pushEvent({ type: 'text', data: event.delta.text });
              } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                pushEvent({
                  type: 'tool_start',
                  data: JSON.stringify({
                    name: event.content_block.name,
                    id: event.content_block.id,
                  }),
                });
              } else if (event.type === 'content_block_stop') {
                // Could indicate tool_end, but we'll keep it simple for now
              } else if (event.type === 'message_stop') {
                pushEvent({ type: 'done' });
              } else if (event.type === 'error') {
                pushEvent({ type: 'error', error: event.error?.message || 'Unknown error' });
              }
            } catch {
              // Not JSON or parse error, emit as raw text
              pushEvent({ type: 'text', data: line });
            }
          }
          return;
        }
        if (streamId === 0x03) {
          // exit code - stream is ending
          return;
        }
      }

      // Try parsing as JSON (for session_info)
      try {
        const msg = JSON.parse(buf.toString('utf8'));
        if (msg.type === 'session_info') {
          sessionId = msg.session_id?.toString();
          pushEvent({ type: 'init', sessionId });
        }
      } catch {
        // Not JSON, treat as raw output
        const text = buf.toString('utf8');
        if (text.trim()) {
          pushEvent({ type: 'text', data: text });
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      // Process any remaining accumulated text
      if (accumulatedText.trim()) {
        try {
          const event = JSON.parse(accumulatedText);
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            pushEvent({ type: 'text', data: event.delta.text });
          }
        } catch {
          pushEvent({ type: 'text', data: accumulatedText });
        }
      }
      pushEvent({ type: 'done' });
      isDone = true;
      if (resolveNext) {
        resolveNext({ value: undefined, done: true });
        resolveNext = null;
      }
    });

    ws.on('error', (error: Error) => {
      clearTimeout(timeout);
      pushEvent({ type: 'error', error: error.message });
      isDone = true;
    });

    // Async iterator implementation
    while (!isDone || eventQueue.length > 0) {
      if (eventQueue.length > 0) {
        const event = eventQueue.shift()!;
        yield event as any;
        if (event.type === 'done' || event.type === 'error') {
          break;
        }
      } else if (!isDone) {
        // Wait for next event
        const event = await new Promise<IteratorResult<any, void>>((resolve) => {
          resolveNext = resolve;
        });
        if (event.done) break;
        yield event.value;
        if (event.value.type === 'done' || event.value.type === 'error') {
          break;
        }
      }
    }

    // Clean up
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }

  // ============================================================================
  // SERVICES API
  // ============================================================================

  /**
   * List all services for a sprite
   */
  async listServices(spriteId: string): Promise<SpriteService[]> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName) {
      throw new Error('Sprite not initialized');
    }

    const response = await this.request<{ services: SpriteService[] }>(
      sprite.organizationId,
      'GET',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/services`
    );

    return response.services || [];
  }

  /**
   * Get a specific service by ID
   */
  async getService(spriteId: string, serviceId: string): Promise<SpriteService> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName) {
      throw new Error('Sprite not initialized');
    }

    return this.request<SpriteService>(
      sprite.organizationId,
      'GET',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/services/${encodeURIComponent(serviceId)}`
    );
  }

  /**
   * Create a new service
   */
  async createService(spriteId: string, options: CreateServiceOptions): Promise<SpriteService> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName) {
      throw new Error('Sprite not initialized');
    }

    if (!sprite.isActive()) {
      throw new Error('Sprite must be running to create services');
    }

    return this.request<SpriteService>(
      sprite.organizationId,
      'POST',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/services`,
      options
    );
  }

  /**
   * Start a service
   */
  async startService(spriteId: string, serviceId: string): Promise<SpriteService> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName) {
      throw new Error('Sprite not initialized');
    }

    if (!sprite.isActive()) {
      throw new Error('Sprite must be running to start services');
    }

    return this.request<SpriteService>(
      sprite.organizationId,
      'POST',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/services/${encodeURIComponent(serviceId)}/start`
    );
  }

  /**
   * Stop a service
   */
  async stopService(spriteId: string, serviceId: string): Promise<SpriteService> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName) {
      throw new Error('Sprite not initialized');
    }

    return this.request<SpriteService>(
      sprite.organizationId,
      'POST',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/services/${encodeURIComponent(serviceId)}/stop`
    );
  }

  /**
   * Delete a service
   */
  async deleteService(spriteId: string, serviceId: string): Promise<void> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName) {
      throw new Error('Sprite not initialized');
    }

    await this.request<void>(
      sprite.organizationId,
      'DELETE',
      `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/services/${encodeURIComponent(serviceId)}`
    );
  }

  /**
   * Get service logs
   */
  async getServiceLogs(
    spriteId: string,
    serviceId: string,
    options: { tail?: number; since?: string; follow?: boolean } = {}
  ): Promise<ServiceLogsResponse> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName) {
      throw new Error('Sprite not initialized');
    }

    const params = new URLSearchParams();
    if (options.tail !== undefined) {
      params.append('tail', options.tail.toString());
    }
    if (options.since) {
      params.append('since', options.since);
    }

    const queryString = params.toString();
    const path = `/v1/sprites/${encodeURIComponent(sprite.spriteName)}/services/${encodeURIComponent(serviceId)}/logs${queryString ? `?${queryString}` : ''}`;

    return this.request<ServiceLogsResponse>(sprite.organizationId, 'GET', path);
  }

  /**
   * Restart a service (stop + start)
   */
  async restartService(spriteId: string, serviceId: string): Promise<SpriteService> {
    await this.stopService(spriteId, serviceId);
    // Brief delay to ensure clean shutdown
    await new Promise((resolve) => setTimeout(resolve, 500));
    return this.startService(spriteId, serviceId);
  }

  // ============================================================================
  // SESSION TRACKING
  // ============================================================================

  /**
   * Start a new session for a sprite.
   * Automatically ends any existing active session first.
   */
  async startSession(
    spriteId: string,
    reason: SessionStartReason = 'created',
    userId?: string
  ): Promise<SpriteSession> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    // End any existing active session first
    if (sprite.currentSessionId) {
      await this.endSession(spriteId, 'stopped', userId);
    }

    // Create new session
    const session = await SpriteSession.startSession(
      spriteId,
      sprite.projectId,
      sprite.organizationId,
      reason,
      userId
    );

    // Update sprite with session info
    await sprite.update({
      currentSessionId: session.id,
      lastStartedAt: session.startedAt,
      sessionCount: (sprite.sessionCount || 0) + 1,
    });

    console.log(`✅ Started session ${session.id} for sprite ${sprite.spriteName} (reason: ${reason})`);
    return session;
  }

  /**
   * End the current session for a sprite.
   * Updates sprite's total runtime with the session duration.
   */
  async endSession(
    spriteId: string,
    reason: SessionEndReason = 'stopped',
    userId?: string
  ): Promise<SpriteSession | null> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    if (!sprite.currentSessionId) {
      console.warn(`No active session for sprite ${sprite.spriteName}`);
      return null;
    }

    // Get and end the current session
    const session = await SpriteSession.findByPk(sprite.currentSessionId);
    if (!session) {
      console.warn(`Session ${sprite.currentSessionId} not found`);
      await sprite.update({ currentSessionId: null });
      return null;
    }

    await session.endSession(reason, userId);

    // Update sprite's total runtime
    const newTotalRuntime = (sprite.totalRuntimeSeconds || 0) + (session.durationSeconds || 0);
    await sprite.update({
      currentSessionId: null,
      totalRuntimeSeconds: newTotalRuntime,
    });

    console.log(`✅ Ended session ${session.id} for sprite ${sprite.spriteName} (duration: ${session.durationSeconds}s, reason: ${reason})`);
    return session;
  }

  /**
   * Get session history for a sprite
   */
  async getSessionHistory(
    spriteId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<SpriteSession[]> {
    return SpriteSession.getSessionsForSprite(spriteId, options);
  }

  /**
   * Get total runtime for a sprite (in seconds)
   * Includes current active session if any
   */
  async getTotalRuntime(spriteId: string): Promise<number> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    return sprite.getTotalRuntimeWithCurrent();
  }

  /**
   * Get runtime stats for a sprite
   */
  async getRuntimeStats(spriteId: string): Promise<{
    totalRuntimeSeconds: number;
    sessionCount: number;
    averageSessionDuration: number;
    lastSessionAt: Date | null;
    isCurrentlyActive: boolean;
    currentSessionDuration: number;
    formattedRuntime: string;
  }> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) throw new Error('Sprite not found');

    const totalRuntime = sprite.getTotalRuntimeWithCurrent();
    const currentSessionDuration = sprite.getCurrentSessionRuntime();
    const averageSessionDuration =
      sprite.sessionCount > 0
        ? Math.floor((sprite.totalRuntimeSeconds || 0) / sprite.sessionCount)
        : 0;

    return {
      totalRuntimeSeconds: totalRuntime,
      sessionCount: sprite.sessionCount || 0,
      averageSessionDuration,
      lastSessionAt: sprite.lastStartedAt,
      isCurrentlyActive: !!sprite.currentSessionId,
      currentSessionDuration,
      formattedRuntime: sprite.getFormattedRuntime(),
    };
  }

  /**
   * Get organization-wide runtime statistics
   */
  async getOrganizationRuntimeStats(
    organizationId: string,
    options: { startDate?: Date; endDate?: Date } = {}
  ): Promise<{
    totalRuntimeSeconds: number;
    sessionCount: number;
    activeSpriteCount: number;
    formattedRuntime: string;
  }> {
    const totalRuntimeSeconds = await SpriteSession.getOrganizationTotalRuntime(
      organizationId,
      options
    );

    // Get session count
    const sessions = await SpriteSession.getSessionsForOrganization(organizationId, options);
    const sessionCount = sessions.length;

    // Get active sprite count
    const activeSprites = await ProjectSprite.getActiveSprites(organizationId);
    const activeSpriteCount = activeSprites.length;

    // Format runtime
    const seconds = totalRuntimeSeconds;
    let formattedRuntime: string;
    if (seconds < 60) {
      formattedRuntime = `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      formattedRuntime = `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      formattedRuntime = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }

    return {
      totalRuntimeSeconds,
      sessionCount,
      activeSpriteCount,
      formattedRuntime,
    };
  }

  // ============================================================================
  // PULL REQUEST MANAGEMENT
  // ============================================================================

  /**
   * Create a pull request from the sprite's feature branch to the base branch.
   * Uses gh CLI which is authenticated during sprite initialization.
   */
  async createPullRequest(
    spriteId: string,
    options: {
      title?: string;
      body?: string;
      draft?: boolean;
    } = {}
  ): Promise<{
    url: string;
    number: number;
    title: string;
    state: string;
    headBranch: string;
    baseBranch: string;
  }> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName) {
      throw new Error('Sprite not initialized');
    }

    if (!sprite.featureBranch) {
      throw new Error('No feature branch configured for this sprite');
    }

    if (!sprite.githubConfigured) {
      throw new Error('GitHub is not configured for this sprite');
    }

    // Default title based on feature branch name
    const defaultTitle = `Changes from sprite: ${sprite.spriteName}`;
    const title = options.title || defaultTitle;

    // Default body
    const defaultBody = `## Summary
This PR contains changes made by Claude Code in sprite \`${sprite.spriteName}\`.

### Branch
- **From:** \`${sprite.featureBranch}\`
- **To:** \`${sprite.branch}\`

---
*Created automatically via Dispotree Sprites*`;

    const body = options.body || defaultBody;

    // Build gh pr create command
    const ghCommand = [
      'gh pr create',
      `--title "${title.replace(/"/g, '\\"')}"`,
      `--body "${body.replace(/"/g, '\\"')}"`,
      `--base "${sprite.branch}"`,
      `--head "${sprite.featureBranch}"`,
      options.draft ? '--draft' : '',
      '--json url,number,title,state,headRefName,baseRefName',
    ]
      .filter(Boolean)
      .join(' ');

    try {
      // Execute gh pr create in the working directory
      const result = await this.execCommand(
        sprite.organizationId,
        sprite.spriteName,
        `cd ${sprite.workingDirectory} && ${ghCommand}`
      );

      if (result.exitCode !== 0) {
        // Check if PR already exists
        if (result.stderr?.includes('already exists')) {
          // Get existing PR info
          const existingPr = await this.getPullRequest(spriteId);
          if (existingPr) {
            return existingPr;
          }
        }
        throw new Error(result.stderr || 'Failed to create pull request');
      }

      // Parse the JSON output
      const prData = JSON.parse(result.stdout.trim());

      return {
        url: prData.url,
        number: prData.number,
        title: prData.title,
        state: prData.state,
        headBranch: prData.headRefName,
        baseBranch: prData.baseRefName,
      };
    } catch (error) {
      if ((error as Error).message.includes('already exists')) {
        // PR already exists, try to get its info
        const existingPr = await this.getPullRequest(spriteId);
        if (existingPr) {
          return existingPr;
        }
      }
      throw new Error(`Failed to create PR: ${(error as Error).message}`);
    }
  }

  /**
   * Get the existing pull request for a sprite's feature branch.
   */
  async getPullRequest(spriteId: string): Promise<{
    url: string;
    number: number;
    title: string;
    state: string;
    headBranch: string;
    baseBranch: string;
  } | null> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName || !sprite.featureBranch) {
      return null;
    }

    try {
      // Use gh pr view to get PR info for the feature branch
      const result = await this.execCommand(
        sprite.organizationId,
        sprite.spriteName,
        `cd ${sprite.workingDirectory} && gh pr view "${sprite.featureBranch}" --json url,number,title,state,headRefName,baseRefName 2>/dev/null`
      );

      if (result.exitCode !== 0 || !result.stdout.trim()) {
        return null;
      }

      const prData = JSON.parse(result.stdout.trim());

      return {
        url: prData.url,
        number: prData.number,
        title: prData.title,
        state: prData.state,
        headBranch: prData.headRefName,
        baseBranch: prData.baseRefName,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get the status of commits on the feature branch vs base branch.
   * Returns info about how many commits ahead/behind the feature branch is.
   */
  async getBranchStatus(spriteId: string): Promise<{
    featureBranch: string;
    baseBranch: string;
    ahead: number;
    behind: number;
    hasUncommittedChanges: boolean;
    lastCommitMessage: string | null;
    lastCommitAuthor: string | null;
    lastCommitDate: string | null;
  }> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName) {
      throw new Error('Sprite not initialized');
    }

    const featureBranch = sprite.featureBranch || sprite.branch;
    const baseBranch = sprite.branch;

    // Fetch latest from remote
    await this.execCommand(
      sprite.organizationId,
      sprite.spriteName,
      `cd ${sprite.workingDirectory} && git fetch origin 2>/dev/null || true`
    );

    // Get ahead/behind count
    const revListResult = await this.execCommand(
      sprite.organizationId,
      sprite.spriteName,
      `cd ${sprite.workingDirectory} && git rev-list --left-right --count origin/${baseBranch}...${featureBranch} 2>/dev/null || echo "0 0"`
    );

    const [behind, ahead] = revListResult.stdout.trim().split(/\s+/).map(Number);

    // Check for uncommitted changes
    const statusResult = await this.execCommand(
      sprite.organizationId,
      sprite.spriteName,
      `cd ${sprite.workingDirectory} && git status --porcelain`
    );
    const hasUncommittedChanges = statusResult.stdout.trim().length > 0;

    // Get last commit info
    const logResult = await this.execCommand(
      sprite.organizationId,
      sprite.spriteName,
      `cd ${sprite.workingDirectory} && git log -1 --format="%s|||%an|||%aI" 2>/dev/null || echo ""`
    );

    let lastCommitMessage: string | null = null;
    let lastCommitAuthor: string | null = null;
    let lastCommitDate: string | null = null;

    if (logResult.stdout.trim()) {
      const [message, author, date] = logResult.stdout.trim().split('|||');
      lastCommitMessage = message || null;
      lastCommitAuthor = author || null;
      lastCommitDate = date || null;
    }

    return {
      featureBranch,
      baseBranch,
      ahead: ahead || 0,
      behind: behind || 0,
      hasUncommittedChanges,
      lastCommitMessage,
      lastCommitAuthor,
      lastCommitDate,
    };
  }

  /**
   * Push any local commits to the remote feature branch.
   */
  async pushChanges(spriteId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const sprite = await ProjectSprite.findByPk(spriteId);
    if (!sprite) {
      throw new Error('Sprite not found');
    }

    if (!sprite.spriteName) {
      throw new Error('Sprite not initialized');
    }

    if (!sprite.githubConfigured) {
      throw new Error('GitHub is not configured for this sprite');
    }

    const branch = sprite.featureBranch || sprite.branch;

    try {
      const result = await this.execCommand(
        sprite.organizationId,
        sprite.spriteName,
        `cd ${sprite.workingDirectory} && git push origin ${branch}`
      );

      if (result.exitCode !== 0) {
        return {
          success: false,
          message: result.stderr || 'Push failed',
        };
      }

      return {
        success: true,
        message: `Successfully pushed to ${branch}`,
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
      };
    }
  }
}

export const spritesService = new SpritesService();
export default spritesService;
