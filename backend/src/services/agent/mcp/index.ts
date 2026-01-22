/**
 * MCP Client Module
 *
 * Provides Model Context Protocol client capabilities for the agent system.
 */

// Main service
export { mcpClientService, default } from './MCPClientService';

// Schema converter
export { jsonSchemaToZod, mcpToolSchemaToZod } from './schemaConverter';

// Types
export type {
  MCPTransportType,
  MCPConnectionStatus,
  MCPServerConfig,
  MCPToolDefinition,
  MCPResourceDefinition,
  MCPServerState,
  MCPServerHealthStatus,
  MCPClientHealthStatus,
} from './types';

export { MCPServerConfigSchema, MCP_SETTINGS, MCP_DEFAULTS } from './types';
