/**
 * Realtime Agent Bridge
 *
 * Bridges the OpenAI Realtime API to the full agent tool registry.
 * This allows voice conversations to access ALL 100+ agent tools,
 * not just a hardcoded subset.
 */

import { toolRegistry, isToolsInitialized, initializeTools } from './agent/tools';
import type { ToolContext, ToolDefinition, ToolCategory } from './agent/types';
import { logger } from './LoggerService';

const log = logger.child({ service: 'realtime-bridge' });

// Voice-optimized instructions for key tool categories
const VOICE_CATEGORY_INSTRUCTIONS: Record<string, string> = {
  property: 'Property and deal management - search, create, update properties',
  analysis: 'Deal analysis - scoring, pricing strategy, fund matching',
  buybox: 'Buy box management - list, create, update fund criteria',
  'market-data': 'Market data - Zillow lookups, skip trace, rental trends',
  pipeline: 'Pipeline management - stages, portfolio, closing deals',
  knowledge: 'Knowledge base - search documents, recall memories',
  automation: 'Automations - list, create, toggle workflow rules',
  contract: 'Contracts - send for e-signature, check status',
  scheduling: 'Scheduling - reminders, scheduled reports and actions',
  communication: 'Communication - send emails, SMS, make calls',
  offer: 'Offers - create and manage purchase offers',
  voice: 'Voice settings - agent profiles, call preferences',
  calendar: 'Calendar - schedule showings, follow-ups, deadlines, find available times',
};

// Tools that are particularly useful for voice interactions
const VOICE_PRIORITY_TOOLS = [
  // Property
  'search_properties',
  'get_property_details',
  'create_property',
  'get_recent_deals',

  // Analysis
  'analyze_deal',
  'quick_deal_score',
  'get_deal_intelligence',
  'find_best_funds',

  // Pipeline
  'get_my_pipeline',
  'add_to_pipeline',
  'update_pipeline_stage',

  // Contacts & Communication
  'search_contacts',
  'create_contact',
  'get_last_contact_activity_by_name',
  'send_email',
  'send_sms',

  // Scheduling
  'schedule_reminder',
  'list_scheduled_tasks',

  // Buy Box
  'list_buyboxes',
  'get_buybox_details',

  // Market Data
  'lookup_market_data',
  'skip_trace_property',

  // Knowledge
  'search_knowledge',
  'remember_preference',

  // Calendar
  'schedule_showing',
  'schedule_follow_up',
  'create_deadline',
  'list_calendar_events',
  'find_available_times',
  'reschedule_event',
  'cancel_calendar_event',
];

// Tools to exclude from voice (too complex or require file input)
const VOICE_EXCLUDED_TOOLS = [
  'upload_file',
  'analyze_uploaded_file',
  'batch_process_deals', // Too long for voice
  'map_website', // Complex output
];

/**
 * Convert agent tool definitions to OpenAI Realtime API format
 */
function convertToolToRealtimeFormat(tool: ToolDefinition): object {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.schema ? zodToJsonSchema(tool.schema) : { type: 'object', properties: {} },
  };
}

/**
 * Convert Zod schema to JSON Schema (simplified)
 */
function zodToJsonSchema(schema: any): object {
  // Zod schemas have a _def property with shape for objects
  if (!schema || !schema._def) {
    return { type: 'object', properties: {} };
  }

  const def = schema._def;

  // Handle ZodObject
  if (def.typeName === 'ZodObject') {
    const shape = def.shape?.();
    if (!shape) return { type: 'object', properties: {} };

    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldDef = (value as any)?._def;
      if (!fieldDef) continue;

      const prop: any = {};

      // Get the base type (unwrap optional)
      let baseDef = fieldDef;
      let isOptional = false;
      if (fieldDef.typeName === 'ZodOptional') {
        isOptional = true;
        baseDef = fieldDef.innerType?._def;
      }
      if (fieldDef.typeName === 'ZodDefault') {
        isOptional = true;
        baseDef = fieldDef.innerType?._def;
      }

      if (!baseDef) continue;

      // Map Zod types to JSON Schema types
      switch (baseDef.typeName) {
        case 'ZodString':
          prop.type = 'string';
          break;
        case 'ZodNumber':
          prop.type = 'number';
          break;
        case 'ZodBoolean':
          prop.type = 'boolean';
          break;
        case 'ZodArray':
          prop.type = 'array';
          if (baseDef.type?._def?.typeName === 'ZodString') {
            prop.items = { type: 'string' };
          } else if (baseDef.type?._def?.typeName === 'ZodNumber') {
            prop.items = { type: 'number' };
          } else {
            prop.items = { type: 'object' };
          }
          break;
        case 'ZodEnum':
          prop.type = 'string';
          prop.enum = baseDef.values;
          break;
        case 'ZodLiteral':
          prop.type = typeof baseDef.value;
          prop.const = baseDef.value;
          break;
        case 'ZodRecord':
          prop.type = 'object';
          prop.additionalProperties = true;
          break;
        case 'ZodAny':
          // Don't specify type for any
          break;
        default:
          prop.type = 'string'; // Default fallback
      }

      // Get description
      if (baseDef.description) {
        prop.description = baseDef.description;
      } else if (fieldDef.description) {
        prop.description = fieldDef.description;
      }

      properties[key] = prop;

      if (!isOptional) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return { type: 'object', properties: {} };
}

/**
 * Realtime Agent Bridge
 *
 * Provides access to the full agent tool registry for voice interactions.
 */
class RealtimeAgentBridge {
  private initialized = false;

  /**
   * Initialize the bridge (ensures tools are loaded)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!isToolsInitialized()) {
      initializeTools();
    }

    this.initialized = true;
    log.info('RealtimeAgentBridge initialized', {
      totalTools: toolRegistry.getToolCount(),
      voicePriorityTools: VOICE_PRIORITY_TOOLS.length,
    });
  }

  /**
   * Get all tool definitions formatted for OpenAI Realtime API
   */
  getRealtimeToolDefinitions(options: {
    priorityOnly?: boolean;
    categories?: ToolCategory[];
  } = {}): object[] {
    if (!this.initialized) {
      log.warn('Bridge not initialized, returning empty tools');
      return [];
    }

    // Get all tool names and build list
    const toolNames = toolRegistry.getToolNames();
    const allTools: ToolDefinition[] = [];
    for (const name of toolNames) {
      const tool = toolRegistry.get(name);
      if (tool) {
        allTools.push(tool);
      }
    }

    let filteredTools = allTools;

    // Filter by priority if requested
    if (options.priorityOnly) {
      filteredTools = allTools.filter((t: ToolDefinition) => VOICE_PRIORITY_TOOLS.includes(t.name));
    }

    // Filter by categories if specified
    if (options.categories?.length) {
      filteredTools = filteredTools.filter((t: ToolDefinition) =>
        options.categories!.includes(t.category)
      );
    }

    // Exclude voice-unfriendly tools
    filteredTools = filteredTools.filter((t: ToolDefinition) =>
      !VOICE_EXCLUDED_TOOLS.includes(t.name)
    );

    // Sort: priority tools first, then alphabetically
    filteredTools.sort((a: ToolDefinition, b: ToolDefinition) => {
      const aPriority = VOICE_PRIORITY_TOOLS.includes(a.name);
      const bPriority = VOICE_PRIORITY_TOOLS.includes(b.name);
      if (aPriority && !bPriority) return -1;
      if (!aPriority && bPriority) return 1;
      return a.name.localeCompare(b.name);
    });

    return filteredTools.map(convertToolToRealtimeFormat);
  }

  /**
   * Execute a tool by name with the given arguments
   */
  async executeTool(
    toolName: string,
    args: Record<string, any>,
    context: {
      sessionId: string;
      userId?: string;
      requestId?: string;
    }
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.initialized) {
      return { success: false, error: 'Bridge not initialized' };
    }

    const tool = toolRegistry.get(toolName);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    const toolContext: ToolContext = {
      sessionId: context.sessionId,
      userId: context.userId,
      requestId: context.requestId || `voice-${Date.now()}`,
    };

    try {
      log.info('Executing voice tool', { tool: toolName, args });

      // Validate arguments against schema
      if (tool.schema) {
        const parseResult = tool.schema.safeParse(args);
        if (!parseResult.success) {
          return {
            success: false,
            error: `Invalid arguments: ${parseResult.error.message}`,
          };
        }
      }

      // Execute the tool (caching is handled by the registry wrapper if needed)
      const result = await tool.handler(args, toolContext);

      log.info('Voice tool completed', {
        tool: toolName,
        success: result.success,
        hasData: !!result.data,
      });

      return result;
    } catch (error) {
      log.error('Voice tool execution failed', { tool: toolName }, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
  }

  /**
   * Get the system prompt optimized for voice interactions
   * @param userContext - Optional pre-loaded user context
   */
  getVoiceSystemPrompt(userContext?: string): string {
    const categories = Object.entries(VOICE_CATEGORY_INSTRUCTIONS)
      .map(([cat, desc]) => `- **${cat}**: ${desc}`)
      .join('\n');

    const contextSection = userContext
      ? `
## User's Current State
${userContext}

Use this context to give proactive, relevant responses. Reference their pipeline, tasks, and preferences naturally.
`
      : '';

    return `You are DispoBot, an AI assistant for Dispotree - a real estate wholesale deal management platform.
You're having a voice conversation, so keep responses concise and conversational.
${contextSection}
## Your Capabilities
${categories}

## Voice Guidelines
- Keep responses brief - this is voice, not text
- Use natural language, avoid technical jargon
- Confirm important actions before executing
- When listing items, limit to 3-5 most relevant
- Summarize data instead of reading long lists
- Ask clarifying questions if the request is ambiguous

## Smart Behaviors
- Greet users with a brief status update if you have context about their work
- When users mention a property address, offer to search or create it
- When users ask "who would buy this", use find_best_funds
- When users say "add a note" or "remind me", use appropriate tools
- Proactively suggest next steps after completing actions
- If tasks or reminders are due, mention them when appropriate

## Context Awareness
- Remember what was discussed earlier in the conversation
- Reference previous properties or contacts by name
- Offer relevant follow-up actions based on context
- Use the user's preferences to filter and prioritize results

Be helpful, efficient, and proactive. Focus on getting things done quickly.`;
  }

  /**
   * Get tool count for health checks
   */
  getToolCount(): number {
    return toolRegistry.getToolCount();
  }

  /**
   * Check if bridge is ready
   */
  isReady(): boolean {
    return this.initialized && isToolsInitialized();
  }
}

export const realtimeAgentBridge = new RealtimeAgentBridge();
export default realtimeAgentBridge;
