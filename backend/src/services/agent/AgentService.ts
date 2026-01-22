/**
 * Agent Service
 *
 * Main orchestrator for the modular AI agent system.
 * Coordinates between conversation management, safeguards, tools, and tracing.
 */

import { createAgent, HumanMessage, AIMessage, SystemMessage } from 'langchain';
import type { BaseMessage } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { logger } from '../LoggerService';
import { memoryService } from '../MemoryService';
import { knowledgeService } from '../knowledge';
import { safeguardsManager } from './SafeguardsManager';
import { conversationManager } from './ConversationManager';
import { tracingService } from './TracingService';
import { toolRegistry, initializeTools, isToolsInitialized } from './tools';
import { ToolResultCache } from './ToolResultCache';
import { SYSTEM_PROMPT, TOOL_DESCRIPTIONS } from './prompts';
import { personaService } from './PersonaService';
import type { AgentHealthStatus, ToolContext, StreamEvent } from './types';

/**
 * Main AI Agent Service
 *
 * Orchestrates all agent subsystems for chat interactions.
 */
class AgentService {
  private agent: any = null;
  private modelName: string = '';
  private provider: 'openrouter' | 'openai' | 'none' = 'none';
  private initialized = false;

  private log = logger.child({ service: 'agent' });

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  /**
   * Initialize the agent with all subsystems
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const openAIKey = process.env.OPENAI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (!openAIKey && !openRouterKey) {
      this.log.warn('No API key set (OPENROUTER_API_KEY or OPENAI_API_KEY) - Agent service disabled');
      return;
    }

    try {
      // Initialize subsystems in parallel where possible
      await Promise.all([
        tracingService.initialize(),
        conversationManager.initialize(),
        personaService.initialize(),
        knowledgeService.isReady() ? Promise.resolve() : knowledgeService.initialize(),
      ]);

      // Initialize tool registry
      if (!isToolsInitialized()) {
        initializeTools();
      }

      // Create ChatOpenAI model based on provider
      let chatModel: ChatOpenAI;

      if (openAIKey) {
        this.provider = 'openai';
        this.modelName = process.env.AGENT_MODEL || 'gpt-4o-mini';

        chatModel = new ChatOpenAI({
          model: this.modelName,
          apiKey: openAIKey,
        });
      } else {
        this.provider = 'openrouter';
        this.modelName = process.env.AGENT_MODEL || 'deepseek/deepseek-chat-v3-0324';

        chatModel = new ChatOpenAI({
          model: this.modelName,
          apiKey: openRouterKey,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
              'X-Title': 'Dispotree',
            },
          },
        });
      }

      // Create LangChain tools with context
      const dummyContext: ToolContext = {
        sessionId: 'init',
        requestId: 'init',
      };
      const tools = toolRegistry.createLangChainTools(dummyContext);

      // Create the agent
      this.agent = createAgent({
        model: chatModel,
        tools,
        systemPrompt: SYSTEM_PROMPT,
      });

      this.initialized = true;
      this.log.info('Agent service initialized', {
        provider: this.provider,
        model: this.modelName,
        toolCount: toolRegistry.getToolCount(),
      });
    } catch (error) {
      this.log.error('Failed to initialize agent service', {}, error);
    }
  }

  /**
   * Check if agent is ready
   */
  isReady(): boolean {
    return this.initialized && this.agent !== null;
  }

  /**
   * Get the current model name
   */
  getModelName(): string {
    return this.modelName;
  }

  // =============================================================================
  // CHAT (Non-Streaming)
  // =============================================================================

  /**
   * Process a chat message and return the response
   */
  async chat(sessionId: string, message: string, userId?: string): Promise<string> {
    const startTime = Date.now();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Check agent readiness
    if (!this.agent) {
      return 'Agent not initialized. Please set OPENROUTER_API_KEY or OPENAI_API_KEY environment variable.';
    }

    // Check safeguards
    if (safeguardsManager.isCircuitOpen()) {
      this.log.warn('Circuit breaker rejected request', { sessionId, userId, requestId });
      return 'The AI service is temporarily unavailable. Please try again in a minute.';
    }

    if (safeguardsManager.isTokenLimitExceeded()) {
      this.log.warn('Token limit exceeded', { sessionId, userId, requestId });
      return 'Daily usage limit reached. Please try again tomorrow.';
    }

    // Acquire request slot
    const releaseSlot = safeguardsManager.tryAcquireRequestSlot(sessionId);
    if (!releaseSlot) {
      this.log.warn('Concurrent request rejected', { sessionId, userId, requestId });
      return 'You already have an active request. Please wait for it to complete.';
    }

    // Acquire cache lock
    const releaseLock = await conversationManager.acquireCacheLock(sessionId);

    // Start tracing
    const traceId = tracingService.startTrace('chat', {
      sessionId,
      userId,
      requestId,
      messageLength: message.length,
    });

    try {
      this.log.info('Chat started', { sessionId, userId, requestId, messageLength: message.length });

      // Create tool context
      const toolContext: ToolContext = {
        sessionId,
        userId,
        requestId,
        traceId,
      };

      // Create cache for this session
      const toolCache = new ToolResultCache(sessionId);

      // Get tools with proper context
      const tools = toolRegistry.createLangChainTools(toolContext, toolCache);

      // Build personalized system prompt with persona context
      const personaSpanId = tracingService.startSpan(traceId, 'build_persona');
      const systemPrompt = await this.buildPersonalizedPrompt(userId);
      tracingService.endSpan(traceId, personaSpanId, 'success');

      // Rebuild agent with context-aware tools for this request
      const contextAgent = createAgent({
        model: this.createChatModel(),
        tools,
        systemPrompt,
      });

      // Load optimized conversation history
      const historySpanId = tracingService.startSpan(traceId, 'load_history');
      const optimizedHistory = await conversationManager.getOptimizedHistory(sessionId);
      tracingService.endSpan(traceId, historySpanId, 'success', { messageCount: optimizedHistory.length });

      // Fetch memory context
      let memoryContext: BaseMessage[] = [];
      if (userId && memoryService.isReady()) {
        const memorySpanId = tracingService.startSpan(traceId, 'fetch_memory');
        try {
          const relevantContext = await memoryService.getRelevantContext(userId, message);
          if (relevantContext) {
            memoryContext = [new SystemMessage(relevantContext)];
          }
          tracingService.endSpan(traceId, memorySpanId, 'success');
        } catch (error) {
          tracingService.endSpan(traceId, memorySpanId, 'error');
          this.log.warn('Failed to fetch memory context', { requestId }, error);
        }
      }

      // Invoke the agent
      const llmSpanId = tracingService.startSpan(traceId, 'llm_invoke');
      const result = await safeguardsManager.withTimeout(
        contextAgent.invoke({
          messages: [...memoryContext, ...optimizedHistory, new HumanMessage(message)],
        }),
        undefined,
        'LLM agent invocation'
      ) as { messages: BaseMessage[] };
      tracingService.endSpan(traceId, llmSpanId, 'success');

      // Extract response
      if (!result.messages || result.messages.length === 0) {
        return 'Sorry, I received an empty response. Please try again.';
      }

      const lastMessage = result.messages[result.messages.length - 1];
      const responseText =
        typeof lastMessage.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage.content);

      // Save messages to history (pass userId to create Conversation record)
      await conversationManager.saveMessage(sessionId, 'user', message, userId);
      await conversationManager.saveMessage(sessionId, 'assistant', responseText, userId);

      // Extract and store memories asynchronously
      if (userId && memoryService.isReady()) {
        this.extractAndStoreMemories(userId, sessionId, message, responseText).catch((err) => {
          this.log.warn('Memory extraction failed', { requestId }, err);
        });
      }

      // Record success
      safeguardsManager.recordSuccess();

      // Track token usage (estimated)
      const estimatedInputTokens = Math.ceil(message.length / 4);
      const estimatedOutputTokens = Math.ceil(responseText.length / 4);
      safeguardsManager.trackTokenUsage(estimatedInputTokens, estimatedOutputTokens);

      // Log completion
      const duration = Date.now() - startTime;
      this.log.info('Chat completed', {
        sessionId,
        userId,
        requestId,
        duration,
        responseLength: responseText.length,
      });

      tracingService.endTrace(traceId, 'success', { responseLength: responseText.length, duration });

      return responseText;
    } catch (error) {
      // Record failure
      safeguardsManager.recordFailure();

      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('timed out');

      this.log.error('Chat failed', { sessionId, userId, requestId, duration, isTimeout }, error);
      tracingService.endTrace(traceId, 'error', { error: errorMessage, duration });

      return this.sanitizeErrorForUser(errorMessage, isTimeout);
    } finally {
      releaseLock();
      releaseSlot();
    }
  }

  // =============================================================================
  // CHAT STREAMING
  // =============================================================================

  /**
   * Stream chat response with tool execution events
   */
  async *chatStream(
    sessionId: string,
    message: string,
    includeToolEvents: boolean = true,
    userId?: string
  ): AsyncGenerator<string, void, unknown> {
    const startTime = Date.now();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Check agent readiness
    if (!this.agent) {
      yield 'Agent not initialized. Please set OPENROUTER_API_KEY or OPENAI_API_KEY environment variable.';
      return;
    }

    // Check safeguards
    if (safeguardsManager.isCircuitOpen()) {
      yield 'The AI service is temporarily unavailable. Please try again in a minute.';
      return;
    }

    if (safeguardsManager.isTokenLimitExceeded()) {
      yield 'Daily usage limit reached. Please try again tomorrow.';
      return;
    }

    // Acquire request slot
    const releaseSlot = safeguardsManager.tryAcquireRequestSlot(sessionId);
    if (!releaseSlot) {
      yield 'You already have an active request. Please wait for it to complete.';
      return;
    }

    // Acquire cache lock
    const releaseLock = await conversationManager.acquireCacheLock(sessionId);

    // Start tracing
    const traceId = tracingService.startTrace('chat_stream', {
      sessionId,
      userId,
      requestId,
      messageLength: message.length,
    });

    try {
      this.log.info('Stream started', { sessionId, userId, requestId, messageLength: message.length });

      // Create tool context
      const toolContext: ToolContext = {
        sessionId,
        userId,
        requestId,
        traceId,
      };

      // Create cache for this session
      const toolCache = new ToolResultCache(sessionId);

      // Get tools with proper context
      const tools = toolRegistry.createLangChainTools(toolContext, toolCache);

      // Build personalized system prompt with persona context
      const systemPrompt = await this.buildPersonalizedPrompt(userId);

      // Rebuild agent with context-aware tools for this request
      const contextAgent = createAgent({
        model: this.createChatModel(),
        tools,
        systemPrompt,
      });

      // Load optimized conversation history
      const optimizedHistory = await conversationManager.getOptimizedHistory(sessionId);

      // Fetch memory context
      let memoryContext: BaseMessage[] = [];
      if (userId && memoryService.isReady()) {
        try {
          const relevantContext = await memoryService.getRelevantContext(userId, message);
          if (relevantContext) {
            memoryContext = [new SystemMessage(relevantContext)];
          }
        } catch (error) {
          this.log.warn('Failed to fetch memory context', { requestId }, error);
        }
      }

      // Save user message immediately (pass userId to create Conversation record)
      await conversationManager.saveMessage(sessionId, 'user', message, userId);

      let fullResponse = '';
      const activeTools: Set<string> = new Set();

      // Stream the agent response
      const stream = await contextAgent.stream({
        messages: [...memoryContext, ...optimizedHistory, new HumanMessage(message)],
      });

      for await (const chunk of stream) {
        const chunkData = chunk as any;

        // Handle tool events
        if (chunkData.tool_calls && Array.isArray(chunkData.tool_calls) && includeToolEvents) {
          for (const toolCall of chunkData.tool_calls) {
            if (toolCall.name && !activeTools.has(toolCall.name)) {
              activeTools.add(toolCall.name);
              const description = TOOL_DESCRIPTIONS[toolCall.name];
              if (description) {
                yield this.formatStreamEvent({
                  type: 'tool_start',
                  tool: toolCall.name,
                  message: description.start,
                });
              }
            }
          }
        }

        // Handle tool results
        if (chunkData.tool_results && Array.isArray(chunkData.tool_results) && includeToolEvents) {
          for (const result of chunkData.tool_results) {
            if (result.name && activeTools.has(result.name)) {
              activeTools.delete(result.name);
              const description = TOOL_DESCRIPTIONS[result.name];
              if (description) {
                yield this.formatStreamEvent({
                  type: 'tool_end',
                  tool: result.name,
                  message: description.end,
                });
              }
            }
          }
        }

        // Handle text content
        if (chunkData.content && typeof chunkData.content === 'string') {
          fullResponse += chunkData.content;
          yield chunkData.content;
        } else if (chunkData.messages && Array.isArray(chunkData.messages)) {
          // Handle final message format
          for (const msg of chunkData.messages) {
            if (msg.content && typeof msg.content === 'string') {
              // Only yield if this is new content
              const newContent = msg.content.slice(fullResponse.length);
              if (newContent) {
                fullResponse += newContent;
                yield newContent;
              }
            }
          }
        }
      }

      // Save assistant response (pass userId to update Conversation record)
      if (fullResponse) {
        await conversationManager.saveMessage(sessionId, 'assistant', fullResponse, userId);
      }

      // Extract and store memories asynchronously
      if (userId && memoryService.isReady() && fullResponse) {
        this.extractAndStoreMemories(userId, sessionId, message, fullResponse).catch((err) => {
          this.log.warn('Memory extraction failed', { requestId }, err);
        });
      }

      // Record success
      safeguardsManager.recordSuccess();

      // Track token usage
      const estimatedInputTokens = Math.ceil(message.length / 4);
      const estimatedOutputTokens = Math.ceil(fullResponse.length / 4);
      safeguardsManager.trackTokenUsage(estimatedInputTokens, estimatedOutputTokens);

      const duration = Date.now() - startTime;
      this.log.info('Stream completed', {
        sessionId,
        userId,
        requestId,
        duration,
        responseLength: fullResponse.length,
      });

      tracingService.endTrace(traceId, 'success', { responseLength: fullResponse.length, duration });
    } catch (error) {
      safeguardsManager.recordFailure();

      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('timed out');

      this.log.error('Stream failed', { sessionId, userId, requestId, duration, isTimeout }, error);
      tracingService.endTrace(traceId, 'error', { error: errorMessage, duration });

      yield this.sanitizeErrorForUser(errorMessage, isTimeout);
    } finally {
      releaseLock();
      releaseSlot();
    }
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Build personalized system prompt with persona context
   */
  private async buildPersonalizedPrompt(userId?: string): Promise<string> {
    if (!userId || !personaService.isReady()) {
      return SYSTEM_PROMPT;
    }

    try {
      const personaPrompt = await personaService.getPersonaPrompt(userId);
      return `${SYSTEM_PROMPT}\n\n${personaPrompt}`;
    } catch (error) {
      this.log.warn('Failed to build personalized prompt, using default', { userId }, error);
      return SYSTEM_PROMPT;
    }
  }

  /**
   * Create ChatOpenAI model instance
   */
  private createChatModel(): ChatOpenAI {
    const openAIKey = process.env.OPENAI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (openAIKey) {
      return new ChatOpenAI({
        model: this.modelName,
        apiKey: openAIKey,
      });
    }

    if (openRouterKey) {
      return new ChatOpenAI({
        model: this.modelName,
        apiKey: openRouterKey,
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
            'X-Title': 'Dispotree',
          },
        },
      });
    }

    return new ChatOpenAI({
      model: this.modelName,
      apiKey: openAIKey,
    });
  }

  /**
   * Format a stream event as JSON
   */
  private formatStreamEvent(event: StreamEvent): string {
    return `\n[TOOL_EVENT]${JSON.stringify(event)}[/TOOL_EVENT]\n`;
  }

  /**
   * Sanitize error message for user display
   */
  private sanitizeErrorForUser(error: string, isTimeout: boolean): string {
    if (isTimeout) {
      return 'Sorry, the request took too long. Please try a simpler query or try again later.';
    }

    // Don't expose internal errors
    const sensitivePatterns = [
      /connection refused/i,
      /econnrefused/i,
      /database/i,
      /sequelize/i,
      /redis/i,
      /api key/i,
      /unauthorized/i,
      /forbidden/i,
      /internal server/i,
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(error)) {
        return 'Sorry, I encountered an error. Please try again.';
      }
    }

    return 'Sorry, I encountered an error. Please try again.';
  }

  /**
   * Extract and store memories from a conversation exchange
   */
  private async extractAndStoreMemories(
    userId: string,
    sessionId: string,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    try {
      // Record conversation for persona relationship tracking
      if (personaService.isReady()) {
        personaService.recordConversation(userId).catch((err) => {
          this.log.warn('Failed to record conversation for persona', { userId }, err);
        });
      }

      const memories = await memoryService.extractMemoriesFromConversation(userId, sessionId, [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: assistantResponse },
      ]);

      if (memories.length > 0) {
        await memoryService.storeMemories(memories);
        this.log.debug('Stored memories', { userId, count: memories.length });
      }
    } catch (error) {
      this.log.error('Error extracting memories', { userId }, error);
    }
  }

  // =============================================================================
  // HEALTH & STATUS
  // =============================================================================

  /**
   * Get comprehensive health status
   */
  getHealthStatus(): AgentHealthStatus {
    const safeguardStatus = safeguardsManager.getStatus();

    return {
      ...safeguardStatus,
      ready: this.isReady(),
      model: this.modelName,
      provider: this.provider,
      toolCount: toolRegistry.getToolCount(),
    };
  }

  /**
   * Clear conversation history for a session
   */
  async clearHistory(sessionId: string): Promise<void> {
    await conversationManager.clearHistory(sessionId);
  }

  /**
   * Get conversation history for a session
   */
  async getHistory(
    sessionId: string
  ): Promise<Array<{ role: string; content: string; type: string }>> {
    return conversationManager.getFormattedHistory(sessionId);
  }

  /**
   * Get active session count
   */
  getActiveSessions(): string[] {
    return conversationManager.getActiveSessions();
  }

  /**
   * Reset circuit breaker (emergency recovery)
   */
  resetCircuitBreaker(): void {
    safeguardsManager.resetCircuitBreaker();
  }

  /**
   * Shutdown the agent service
   */
  shutdown(): void {
    conversationManager.shutdown();
    this.agent = null;
    this.initialized = false;
    this.log.info('Agent service shutdown');
  }
}

// Export singleton instance
export const agentService = new AgentService();
export default agentService;
