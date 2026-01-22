/**
 * MCP (Model Context Protocol) Client Types
 *
 * Type definitions for MCP server configurations and client state.
 */

import { z } from 'zod';

// =============================================================================
// TRANSPORT TYPES
// =============================================================================

/**
 * Transport types supported by MCP
 */
export type MCPTransportType = 'stdio' | 'http';

/**
 * Connection status for an MCP server
 */
export type MCPConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'reconnecting';

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

/**
 * Configuration for a single MCP server
 */
export interface MCPServerConfig {
  /** Unique identifier for this server */
  id: string;
  /** Display name */
  name: string;
  /** Whether this server is enabled */
  enabled: boolean;
  /** Transport type (stdio for local, http for remote) */
  transport: MCPTransportType;

  // Stdio transport options
  /** Command to execute (e.g., "npx", "node") */
  command?: string;
  /** Arguments for the command */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;

  // HTTP transport options
  /** Server URL */
  url?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Additional headers */
  headers?: Record<string, string>;

  // Common options
  /** Connection timeout in ms (default: 30000) */
  timeout?: number;
  /** Max reconnection attempts (default: 3) */
  retryAttempts?: number;
  /** Delay between retries in ms (default: 5000) */
  retryDelayMs?: number;
  /** Prefix for tool names to avoid conflicts */
  toolPrefix?: string;
}

/**
 * Zod schema for validating MCP server config from settings
 */
export const MCPServerConfigSchema = z.object({
  id: z.string().min(1, 'Server ID is required'),
  name: z.string().min(1, 'Server name is required'),
  enabled: z.boolean().default(true),
  transport: z.enum(['stdio', 'http']),

  // Stdio transport
  command: z.string().optional(),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string()).optional().default({}),
  cwd: z.string().optional(),

  // HTTP transport
  url: z.string().url().optional(),
  apiKey: z.string().optional(),
  headers: z.record(z.string()).optional().default({}),

  // Common
  timeout: z.number().positive().default(30000),
  retryAttempts: z.number().int().min(0).default(3),
  retryDelayMs: z.number().positive().default(5000),
  toolPrefix: z.string().optional(),
});

// =============================================================================
// MCP TOOL DEFINITIONS
// =============================================================================

/**
 * MCP tool definition as received from server
 */
export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
}

/**
 * MCP resource definition
 */
export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// =============================================================================
// SERVER STATE
// =============================================================================

/**
 * Runtime state for a connected MCP server
 */
export interface MCPServerState {
  /** Server configuration */
  config: MCPServerConfig;
  /** Current connection status */
  status: MCPConnectionStatus;
  /** Last error message if status is 'error' */
  lastError?: string;
  /** Timestamp of last successful connection */
  lastConnected?: Date;
  /** Tools discovered from this server */
  tools: MCPToolDefinition[];
  /** Resources available from this server */
  resources: MCPResourceDefinition[];
  /** Number of reconnection attempts made */
  reconnectAttempts: number;
}

// =============================================================================
// HEALTH STATUS
// =============================================================================

/**
 * Health status for a single MCP server
 */
export interface MCPServerHealthStatus {
  id: string;
  name: string;
  status: MCPConnectionStatus;
  toolCount: number;
  resourceCount: number;
  lastError?: string;
  lastConnected?: string;
}

/**
 * Overall MCP client service health status
 */
export interface MCPClientHealthStatus {
  /** Whether the service has been initialized */
  initialized: boolean;
  /** Whether MCP is globally enabled */
  enabled: boolean;
  /** Total number of configured servers */
  serverCount: number;
  /** Number of currently connected servers */
  connectedCount: number;
  /** Total number of registered MCP tools */
  toolCount: number;
  /** Per-server status */
  servers: MCPServerHealthStatus[];
}

// =============================================================================
// SETTINGS KEYS
// =============================================================================

export const MCP_SETTINGS = {
  SERVERS: 'mcp.servers',
  ENABLED: 'mcp.enabled',
} as const;

// =============================================================================
// CONSTANTS
// =============================================================================

export const MCP_DEFAULTS = {
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 5000,
  SETTINGS_WATCH_INTERVAL_MS: 30000,
} as const;
