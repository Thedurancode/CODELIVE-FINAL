/**
 * Agent Module
 *
 * Modular AI agent system with:
 * - Conversation management with 3-tier caching
 * - Production safeguards (circuit breaker, rate limiting, token tracking)
 * - Tool result caching
 * - LangSmith tracing integration
 * - 65+ specialized tools for real estate operations
 *
 * @example
 * ```typescript
 * import { agentService, initializeAgentSystem } from './services/agent';
 *
 * // Initialize during app startup
 * await initializeAgentSystem();
 *
 * // Use the agent
 * const response = await agentService.chat(sessionId, message, userId);
 * ```
 */

// Main service
export { agentService, default } from './AgentService';

// Subsystem singletons
export { conversationManager } from './ConversationManager';
export { safeguardsManager } from './SafeguardsManager';
export { tracingService } from './TracingService';
export { personaService } from './PersonaService';

// Tool system
export { toolRegistry, initializeTools, isToolsInitialized } from './tools';
export { ToolResultCache } from './ToolResultCache';

// MCP client
export { mcpClientService } from './mcp';
export type { MCPServerConfig, MCPClientHealthStatus } from './mcp';

// Prompts
export { SYSTEM_PROMPT, TOOL_DESCRIPTIONS } from './prompts';

// Types
export type {
  ToolContext,
  ToolResult,
  ToolCategory,
  ToolDefinition,
  ToolExecutionEvent,
  ConversationEntry,
  CacheEntry,
  CircuitBreakerStateType,
  CircuitBreakerState,
  TokenUsage,
  SafeguardStatus,
  AgentHealthStatus,
  StreamEvent,
  TraceSpan,
} from './types';

// Constants
export {
  CONVERSATION_SETTINGS,
  CACHE_SETTINGS,
  SAFEGUARD_SETTINGS,
  TOKEN_COSTS,
  TOOL_CACHE_TTLS,
} from './types';

// =============================================================================
// INITIALIZATION
// =============================================================================

import { agentService } from './AgentService';
import { mcpClientService } from './mcp';
import { logger } from '../LoggerService';

const log = logger.child({ service: 'agent-module' });

/**
 * Initialize the complete agent system
 *
 * Call this during application startup to initialize all agent subsystems.
 * This is the recommended way to start the agent.
 *
 * @example
 * ```typescript
 * // In your main index.ts
 * import { initializeAgentSystem } from './services/agent';
 *
 * async function startServer() {
 *   await initializeAgentSystem();
 *   // ... rest of server startup
 * }
 * ```
 */
export async function initializeAgentSystem(): Promise<void> {
  const startTime = Date.now();

  try {
    // Initialize core agent service
    await agentService.initialize();

    // Initialize MCP client service (non-blocking - MCP is optional)
    let mcpStatus;
    try {
      await mcpClientService.initialize();
      mcpStatus = await mcpClientService.getHealthStatus();
    } catch (mcpError) {
      log.warn('MCP client initialization failed (non-fatal)', {}, mcpError);
      mcpStatus = { connectedCount: 0, toolCount: 0 };
    }

    const duration = Date.now() - startTime;
    const status = agentService.getHealthStatus();

    log.info('Agent system initialized', {
      duration,
      ready: status.ready,
      provider: status.provider,
      model: status.model,
      toolCount: status.toolCount,
      mcpServers: mcpStatus.connectedCount,
      mcpTools: mcpStatus.toolCount,
    });
  } catch (error) {
    log.error('Failed to initialize agent system', {}, error);
    throw error;
  }
}

/**
 * Shutdown the agent system gracefully
 *
 * Call this during application shutdown to clean up resources.
 */
export async function shutdownAgentSystem(): Promise<void> {
  // Shutdown MCP client first
  try {
    await mcpClientService.shutdown();
  } catch (err) {
    log.warn('MCP client shutdown error', {}, err);
  }

  // Shutdown core agent service
  agentService.shutdown();
  log.info('Agent system shutdown complete');
}
