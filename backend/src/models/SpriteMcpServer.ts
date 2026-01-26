/**
 * SpriteMcpServer Model
 *
 * Tracks MCP (Model Context Protocol) servers installed on project sprites.
 * Stores configuration including environment variables (encrypted) and auto-start settings.
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';
import crypto from 'crypto';

// Status options for MCP servers
export type McpServerStatus =
  | 'pending' // Installation pending
  | 'installed' // Installed but not running
  | 'running' // Currently running
  | 'stopped' // Stopped by user or system
  | 'error' // Error state
  | 'uninstalled'; // Marked for removal

// Registry types
export type McpServerRegistry = 'npm' | 'pypi' | 'cargo' | 'docker' | 'custom';

// Environment variable configuration
export interface McpEnvVar {
  key: string;
  value: string; // Encrypted when stored
  isSecret: boolean; // If true, value should be masked in UI
  description?: string;
}

export interface McpEnvConfig {
  variables: McpEnvVar[];
}

interface SpriteMcpServerAttributes {
  id: string;
  spriteId: string;
  organizationId: string;

  // Server identification
  serverName: string; // Registry name (e.g., "github", "filesystem")
  displayName: string | null; // Custom name
  description: string | null;

  // Package info
  registry: McpServerRegistry;
  packageName: string | null;
  packageVersion: string | null;

  // Installation commands
  installCommand: string | null;
  runCommand: string | null;

  // Configuration (encrypted env vars)
  envConfig: McpEnvConfig | null;

  // Status
  status: McpServerStatus;
  errorMessage: string | null;

  // Auto-start settings
  autoStart: boolean;
  startOrder: number;

  // Tools
  tools: string[] | null;

  // Timestamps
  installedAt: Date | null;
  lastStartedAt: Date | null;
  lastStoppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // Version tracking
  latestVersion: string | null;
  lastUpdateCheck: Date | null;
  changelogUrl: string | null;
  registryUrl: string | null;
}

interface SpriteMcpServerCreationAttributes
  extends Optional<
    SpriteMcpServerAttributes,
    | 'id'
    | 'displayName'
    | 'description'
    | 'registry'
    | 'packageName'
    | 'packageVersion'
    | 'installCommand'
    | 'runCommand'
    | 'envConfig'
    | 'status'
    | 'errorMessage'
    | 'autoStart'
    | 'startOrder'
    | 'tools'
    | 'installedAt'
    | 'lastStartedAt'
    | 'lastStoppedAt'
    | 'createdAt'
    | 'updatedAt'
    | 'latestVersion'
    | 'lastUpdateCheck'
    | 'changelogUrl'
    | 'registryUrl'
  > {}

// Simple encryption for env var values
// In production, consider using a proper secrets manager
const ENCRYPTION_KEY = process.env.MCP_ENCRYPTION_KEY || 'default-key-change-in-production';

function encrypt(text: string): string {
  try {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch {
    return text;
  }
}

function decrypt(encrypted: string): string {
  try {
    const [ivHex, encryptedText] = encrypted.split(':');
    if (!ivHex || !encryptedText) return encrypted;
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encrypted;
  }
}

class SpriteMcpServer
  extends Model<SpriteMcpServerAttributes, SpriteMcpServerCreationAttributes>
  implements SpriteMcpServerAttributes
{
  declare id: string;
  declare spriteId: string;
  declare organizationId: string;

  declare serverName: string;
  declare displayName: string | null;
  declare description: string | null;

  declare registry: McpServerRegistry;
  declare packageName: string | null;
  declare packageVersion: string | null;

  declare installCommand: string | null;
  declare runCommand: string | null;

  declare envConfig: McpEnvConfig | null;

  declare status: McpServerStatus;
  declare errorMessage: string | null;

  declare autoStart: boolean;
  declare startOrder: number;

  declare tools: string[] | null;

  declare installedAt: Date | null;
  declare lastStartedAt: Date | null;
  declare lastStoppedAt: Date | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Version tracking
  declare latestVersion: string | null;
  declare lastUpdateCheck: Date | null;
  declare changelogUrl: string | null;
  declare registryUrl: string | null;

  /**
   * Get environment variables with decrypted values
   */
  getDecryptedEnvVars(): McpEnvVar[] {
    if (!this.envConfig?.variables) return [];
    return this.envConfig.variables.map((v) => ({
      ...v,
      value: v.isSecret ? decrypt(v.value) : v.value,
    }));
  }

  /**
   * Set environment variables (encrypts secret values)
   */
  async setEnvVars(variables: McpEnvVar[]): Promise<void> {
    const encryptedVars = variables.map((v) => ({
      ...v,
      value: v.isSecret ? encrypt(v.value) : v.value,
    }));
    this.envConfig = { variables: encryptedVars };
    await this.save();
  }

  /**
   * Get environment variables as key-value object for shell export
   */
  getEnvForShell(): Record<string, string> {
    const vars = this.getDecryptedEnvVars();
    const result: Record<string, string> = {};
    for (const v of vars) {
      result[v.key] = v.value;
    }
    return result;
  }

  /**
   * Check if server is in a running state
   */
  isRunning(): boolean {
    return this.status === 'running';
  }

  /**
   * Check if server can be started
   */
  canStart(): boolean {
    return ['installed', 'stopped', 'error'].includes(this.status);
  }

  /**
   * Check if server has required env vars configured
   */
  hasRequiredEnvVars(required: string[]): boolean {
    if (!this.envConfig?.variables) return required.length === 0;
    const configured = new Set(this.envConfig.variables.map((v) => v.key));
    return required.every((key) => configured.has(key));
  }

  /**
   * Check if an update is available
   */
  hasUpdate(): boolean {
    if (!this.packageVersion || !this.latestVersion) return false;
    return this.packageVersion !== this.latestVersion;
  }

  /**
   * Update version info from registry
   */
  async updateVersionInfo(info: {
    latestVersion: string;
    changelogUrl?: string;
    registryUrl?: string;
  }): Promise<SpriteMcpServer> {
    await this.update({
      latestVersion: info.latestVersion,
      lastUpdateCheck: new Date(),
      changelogUrl: info.changelogUrl || this.changelogUrl,
      registryUrl: info.registryUrl || this.registryUrl,
    });
    return this.reload();
  }

  /**
   * Mark server as updated to a new version
   */
  async markUpdated(newVersion: string): Promise<SpriteMcpServer> {
    await this.update({
      packageVersion: newVersion,
      latestVersion: newVersion,
      lastUpdateCheck: new Date(),
      errorMessage: null,
    });
    return this.reload();
  }

  /**
   * Mark server as started
   */
  async markStarted(): Promise<SpriteMcpServer> {
    await this.update({
      status: 'running',
      lastStartedAt: new Date(),
      errorMessage: null,
    });
    return this.reload();
  }

  /**
   * Mark server as stopped
   */
  async markStopped(reason?: string): Promise<SpriteMcpServer> {
    await this.update({
      status: reason ? 'error' : 'stopped',
      lastStoppedAt: new Date(),
      errorMessage: reason || null,
    });
    return this.reload();
  }

  // Static helper methods

  /**
   * Get all MCP servers for a sprite
   */
  static async getBySprite(
    spriteId: string,
    options: { includeUninstalled?: boolean } = {}
  ): Promise<SpriteMcpServer[]> {
    const where: Record<string, unknown> = { spriteId };
    if (!options.includeUninstalled) {
      where.status = { [Op.ne]: 'uninstalled' };
    }
    return this.findAll({
      where,
      order: [['startOrder', 'ASC'], ['serverName', 'ASC']],
    });
  }

  /**
   * Get servers that should auto-start
   */
  static async getAutoStartServers(spriteId: string): Promise<SpriteMcpServer[]> {
    return this.findAll({
      where: {
        spriteId,
        autoStart: true,
        status: { [Op.in]: ['installed', 'stopped', 'error'] },
      },
      order: [['startOrder', 'ASC']],
    });
  }

  /**
   * Get a specific server by sprite and name
   */
  static async getByName(
    spriteId: string,
    serverName: string
  ): Promise<SpriteMcpServer | null> {
    return this.findOne({
      where: { spriteId, serverName },
    });
  }

  /**
   * Install a new MCP server
   */
  static async installServer(
    spriteId: string,
    organizationId: string,
    serverInfo: {
      serverName: string;
      displayName?: string;
      description?: string;
      registry?: McpServerRegistry;
      packageName?: string;
      packageVersion?: string;
      installCommand?: string;
      runCommand?: string;
      tools?: string[];
      autoStart?: boolean;
    }
  ): Promise<SpriteMcpServer> {
    // Get max start order for this sprite
    const maxOrder = await this.max('startOrder', {
      where: { spriteId },
    });

    return this.create({
      spriteId,
      organizationId,
      serverName: serverInfo.serverName,
      displayName: serverInfo.displayName || null,
      description: serverInfo.description || null,
      registry: serverInfo.registry || 'npm',
      packageName: serverInfo.packageName || null,
      packageVersion: serverInfo.packageVersion || null,
      installCommand: serverInfo.installCommand || null,
      runCommand: serverInfo.runCommand || null,
      tools: serverInfo.tools || null,
      autoStart: serverInfo.autoStart ?? true,
      startOrder: ((maxOrder as number) || 0) + 1,
      status: 'pending',
      installedAt: null,
    });
  }

  /**
   * Mark server as installed
   */
  async markInstalled(version?: string): Promise<SpriteMcpServer> {
    await this.update({
      status: 'installed',
      installedAt: new Date(),
      packageVersion: version || this.packageVersion,
      errorMessage: null,
    });
    return this.reload();
  }

  /**
   * Uninstall server (soft delete)
   */
  async uninstall(): Promise<SpriteMcpServer> {
    await this.update({
      status: 'uninstalled',
    });
    return this.reload();
  }

  /**
   * Get running servers for a sprite
   */
  static async getRunningServers(spriteId: string): Promise<SpriteMcpServer[]> {
    return this.findAll({
      where: {
        spriteId,
        status: 'running',
      },
      order: [['startOrder', 'ASC']],
    });
  }

  /**
   * Stop all running servers for a sprite
   */
  static async stopAllServers(spriteId: string): Promise<number> {
    const [affectedCount] = await this.update(
      {
        status: 'stopped',
        lastStoppedAt: new Date(),
      },
      {
        where: {
          spriteId,
          status: 'running',
        },
      }
    );
    return affectedCount;
  }
}

SpriteMcpServer.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    spriteId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'sprite_id',
      references: {
        model: 'project_sprites',
        key: 'id',
      },
      onDelete: 'CASCADE',
      comment: 'Reference to the project sprite',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'CASCADE',
      comment: 'Organization (denormalized for query efficiency)',
    },
    serverName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'server_name',
      comment: 'Name of the MCP server from registry',
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'display_name',
      comment: 'Optional custom display name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Description of the server',
    },
    registry: {
      type: DataTypes.ENUM('npm', 'pypi', 'cargo', 'docker', 'custom'),
      allowNull: false,
      defaultValue: 'npm',
      comment: 'Package registry type',
    },
    packageName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'package_name',
      comment: 'Package name',
    },
    packageVersion: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'package_version',
      comment: 'Installed package version',
    },
    installCommand: {
      type: DataTypes.STRING(1024),
      allowNull: true,
      field: 'install_command',
      comment: 'Command used to install this server',
    },
    runCommand: {
      type: DataTypes.STRING(1024),
      allowNull: true,
      field: 'run_command',
      comment: 'Command used to run this server',
    },
    envConfig: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      field: 'env_config',
      comment: 'Environment variable configuration (values encrypted)',
    },
    status: {
      type: DataTypes.ENUM('pending', 'installed', 'running', 'stopped', 'error', 'uninstalled'),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'Current status of this MCP server',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
      comment: 'Last error message if status is error',
    },
    autoStart: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'auto_start',
      comment: 'Whether to auto-start this server when sprite resumes',
    },
    startOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'start_order',
      comment: 'Order in which to start servers (lower = first)',
    },
    tools: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'List of tools this server provides',
    },
    installedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'installed_at',
      comment: 'When this server was installed',
    },
    lastStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_started_at',
      comment: 'When this server was last started',
    },
    lastStoppedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_stopped_at',
      comment: 'When this server was last stopped',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW,
    },
    // Version tracking fields
    latestVersion: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'latest_version',
      comment: 'Latest available version from registry',
    },
    lastUpdateCheck: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_update_check',
      comment: 'When we last checked for updates',
    },
    changelogUrl: {
      type: DataTypes.STRING(1024),
      allowNull: true,
      field: 'changelog_url',
      comment: 'URL to changelog or release notes',
    },
    registryUrl: {
      type: DataTypes.STRING(1024),
      allowNull: true,
      field: 'registry_url',
      comment: 'URL to package in registry',
    },
  },
  {
    sequelize,
    tableName: 'sprite_mcp_servers',
    modelName: 'SpriteMcpServer',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['sprite_id'] },
      { fields: ['organization_id'] },
      { fields: ['server_name'] },
      { fields: ['status'] },
      { fields: ['sprite_id', 'server_name'], unique: true },
      { fields: ['sprite_id', 'auto_start'] },
    ],
  }
);

export default SpriteMcpServer;
export { SpriteMcpServerAttributes, SpriteMcpServerCreationAttributes };
