/**
 * Tool Registry
 *
 * Central registry for all agent tools with:
 * - Automatic timing and metrics collection
 * - Tool result caching support
 * - Error handling and sanitization
 * - LangChain tool wrapper generation
 */

import { tool } from 'langchain';
import { z } from 'zod';
import { logger } from '../../LoggerService';
import { agentMetricsService } from '../../AgentMetricsService';
import type { ToolDefinition, ToolCategory, ToolContext, ToolResult } from '../types';
import { TOOL_CACHE_TTLS } from '../types';
import type { ToolResultCache } from '../ToolResultCache';

/**
 * Central registry for all agent tools
 */
class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private toolsByCategory: Map<ToolCategory, ToolDefinition[]> = new Map();
  private initialized = false;

  /**
   * Register a tool definition
   */
  register(definition: ToolDefinition): void {
    if (this.tools.has(definition.name)) {
      logger.warn('Tool already registered, overwriting', { tool: definition.name });
    }

    // Apply default cache TTL if cacheable but no TTL specified
    if (definition.cacheable && !definition.cacheTTL) {
      definition.cacheTTL = TOOL_CACHE_TTLS[definition.name] || 5 * 60; // Default 5 min
    }

    this.tools.set(definition.name, definition);

    // Index by category
    const categoryTools = this.toolsByCategory.get(definition.category) || [];
    // Remove existing if re-registering
    const existingIndex = categoryTools.findIndex((t) => t.name === definition.name);
    if (existingIndex >= 0) {
      categoryTools[existingIndex] = definition;
    } else {
      categoryTools.push(definition);
    }
    this.toolsByCategory.set(definition.category, categoryTools);
  }

  /**
   * Register multiple tools at once
   */
  registerAll(definitions: ToolDefinition[]): void {
    definitions.forEach((def) => this.register(def));
  }

  /**
   * Get a tool definition by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools in a category
   */
  getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.toolsByCategory.get(category) || [];
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get total tool count
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Check if registry has been initialized with tools
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Mark registry as initialized
   */
  markInitialized(): void {
    this.initialized = true;
    logger.info('Tool registry initialized', { toolCount: this.tools.size });
  }

  /**
   * Create LangChain-compatible tools with context injection
   */
  createLangChainTools(context: ToolContext, cache?: ToolResultCache): any[] {
    return Array.from(this.tools.values()).map((def) =>
      this.wrapTool(def, context, cache)
    );
  }

  /**
   * Wrap a tool definition with timing, metrics, caching, and error handling
   */
  private wrapTool(
    def: ToolDefinition,
    context: ToolContext,
    cache?: ToolResultCache
  ): any {
    const toolContext = {
      tool: def.name,
      category: def.category,
      requestId: context.requestId,
    };

    return tool(
      async (input: any) => {
        const startTime = Date.now();
        let cached = false;

        try {
          // Check cache first
          if (def.cacheable && cache) {
            const cachedResult = await cache.get<ToolResult>(def.name, input);
            if (cachedResult) {
              cached = true;
              logger.debug('Cache hit', { ...toolContext, inputKeys: Object.keys(input) });

              // Record metrics for cached result
              this.recordMetrics(context, def.name, true, Date.now() - startTime, cached);

              return this.formatResult({ ...cachedResult, cached: true });
            }
          }

          // Execute the tool handler
          const result = await def.handler(input, context);
          const duration = Date.now() - startTime;

          // Record metrics
          this.recordMetrics(context, def.name, result.success, duration, cached);

          // Cache successful results
          if (result.success && def.cacheable && cache) {
            await cache.set(def.name, input, result, def.cacheTTL);
          }

          logger.debug('Tool executed', {
            ...toolContext,
            success: result.success,
            duration,
            cached: false,
          });

          return this.formatResult(result);
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          logger.error('Tool execution failed', { ...toolContext, duration }, error);

          // Record failure metrics
          this.recordMetrics(context, def.name, false, duration, cached, errorMessage);

          // Return sanitized error (don't expose internals)
          return this.formatResult({
            success: false,
            error: this.sanitizeErrorMessage(errorMessage),
          });
        }
      },
      {
        name: def.name,
        description: def.description,
        schema: def.schema,
      }
    );
  }

  /**
   * Record tool execution metrics
   */
  private recordMetrics(
    context: ToolContext,
    toolName: string,
    success: boolean,
    duration: number,
    cached: boolean,
    error?: string
  ): void {
    try {
      // Use the existing AgentMetricsService
      if (context.requestId) {
        agentMetricsService.recordToolExecution?.(
          context.requestId,
          toolName,
          success,
          duration,
          error
        );
      }
    } catch (e) {
      // Don't let metrics recording break the tool
      logger.debug('Metrics recording failed', { tool: toolName, error: String(e) });
    }
  }

  /**
   * Format tool result as JSON string for LangChain
   * If UI components are present, include them in a special format that
   * the LLM can include verbatim in its response for frontend rendering.
   */
  private formatResult(result: ToolResult): string {
    // If there are UI components, add instructions for the LLM to include them
    if (result.uiComponents && result.uiComponents.length > 0) {
      return JSON.stringify({
        ...result,
        _uiInstructions:
          'IMPORTANT: Include the uiComponents markers EXACTLY as-is in your response for rich UI rendering. ' +
          'Place them after your text explanation. The frontend will parse and render them as interactive components.',
      });
    }
    return JSON.stringify(result);
  }

  /**
   * Sanitize error messages for user display
   */
  private sanitizeErrorMessage(error: string): string {
    // Don't expose internal details
    const sensitivePatterns = [
      /connection refused/i,
      /econnrefused/i,
      /timeout/i,
      /database/i,
      /sequelize/i,
      /redis/i,
      /api key/i,
      /unauthorized/i,
      /forbidden/i,
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(error)) {
        return 'A temporary error occurred. Please try again.';
      }
    }

    // Truncate long errors
    if (error.length > 200) {
      return error.substring(0, 200) + '...';
    }

    return error;
  }

  /**
   * Clear all registered tools (for testing)
   */
  clear(): void {
    this.tools.clear();
    this.toolsByCategory.clear();
    this.initialized = false;
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();

// =============================================================================
// HELPER FUNCTIONS FOR TOOL CREATION
// =============================================================================

/**
 * Options for creating a successful tool result
 */
export interface SuccessOptions {
  /** UI component markers for Generative UI rendering */
  uiComponents?: string[];
}

/**
 * Helper to create a successful tool result
 * @param data - The tool result data
 * @param message - Optional human-readable message
 * @param options - Additional options including UI components
 */
export function success<T>(data: T, message?: string, options?: SuccessOptions): ToolResult<T> {
  return {
    success: true,
    data,
    message,
    uiComponents: options?.uiComponents,
  };
}

/**
 * Helper to create a failed tool result
 */
export function failure(error: string): ToolResult {
  return {
    success: false,
    error,
  };
}

/**
 * Helper to create a tool definition with proper typing
 * The TSchema generic extracts the correct input type from the Zod schema
 */
export function defineTool<TSchema extends z.ZodType<any, any, any>, TOutput = any>(
  config: {
    name: string;
    description: string;
    category: ToolCategory;
    schema: TSchema;
    handler: (input: z.infer<TSchema>, context: ToolContext) => Promise<ToolResult<TOutput>>;
    cacheable?: boolean;
    cacheTTL?: number;
    // Human approval configuration
    requiresApproval?: boolean | ((input: z.infer<TSchema>) => boolean);
    approvalReason?: string;
    approvalTimeout?: number;
    // Batch operation support
    supportsProgress?: boolean;
  }
): ToolDefinition<z.infer<TSchema>, TOutput> {
  return config as unknown as ToolDefinition<z.infer<TSchema>, TOutput>;
}

export default toolRegistry;
