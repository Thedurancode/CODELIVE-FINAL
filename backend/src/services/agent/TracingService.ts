/**
 * Tracing Service
 *
 * Observability and tracing for the AI agent with optional LangSmith integration.
 * Provides span tracking, timing, and structured logging for debugging.
 */

import { logger } from '../LoggerService';
import type { TraceSpan } from './types';

// LangSmith client (dynamically imported if available)
let langSmithClient: any = null;

/**
 * Service for distributed tracing and observability
 */
class TracingService {
  private traces: Map<string, TraceSpan> = new Map();
  private langSmithEnabled = false;
  private initialized = false;

  private logContext = { service: 'tracing' };

  /**
   * Initialize the tracing service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const langSmithKey = process.env.LANGSMITH_API_KEY;
    const langSmithProject = process.env.LANGSMITH_PROJECT || 'dispotree-agent';

    if (langSmithKey) {
      try {
        // Dynamic import to avoid dependency if not used
        const { Client } = await import('langsmith');
        langSmithClient = new Client({
          apiKey: langSmithKey,
        });
        this.langSmithEnabled = true;
        logger.info('LangSmith tracing enabled', { ...this.logContext, project: langSmithProject });
      } catch (error) {
        logger.warn('LangSmith initialization failed - tracing disabled', this.logContext, error);
      }
    } else {
      logger.info('LangSmith API key not set - local tracing only', this.logContext);
    }

    this.initialized = true;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Check if LangSmith is enabled
   */
  isLangSmithEnabled(): boolean {
    return this.langSmithEnabled;
  }

  /**
   * Start a new trace
   */
  startTrace(name: string, metadata?: Record<string, any>): string {
    const traceId = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const span: TraceSpan = {
      id: traceId,
      name,
      startTime: Date.now(),
      metadata,
      children: [],
      status: 'running',
    };

    this.traces.set(traceId, span);

    // Send to LangSmith if enabled
    if (this.langSmithEnabled && langSmithClient) {
      langSmithClient
        .createRun({
          name,
          run_type: 'chain',
          inputs: metadata,
          start_time: new Date(),
          project_name: process.env.LANGSMITH_PROJECT || 'dispotree-agent',
        })
        .catch((e: any) => logger.debug('LangSmith createRun failed', { ...this.logContext, error: String(e) }));
    }

    logger.debug('Trace started', { ...this.logContext, traceId, name });
    return traceId;
  }

  /**
   * Start a child span within a trace
   */
  startSpan(traceId: string, name: string, metadata?: Record<string, any>): string {
    const parentTrace = this.traces.get(traceId);
    if (!parentTrace) {
      logger.warn('Cannot start span - parent trace not found', { ...this.logContext, traceId });
      return '';
    }

    const spanId = `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const span: TraceSpan = {
      id: spanId,
      name,
      startTime: Date.now(),
      metadata,
      children: [],
      status: 'running',
    };

    parentTrace.children.push(span);
    return spanId;
  }

  /**
   * End a span
   */
  endSpan(
    traceId: string,
    spanId: string,
    status: 'success' | 'error',
    metadata?: Record<string, any>
  ): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    const span = this.findSpan(trace, spanId);
    if (span) {
      span.endTime = Date.now();
      span.status = status;
      if (metadata) {
        span.metadata = { ...span.metadata, ...metadata };
      }
    }
  }

  /**
   * End a trace
   */
  endTrace(
    traceId: string,
    status: 'success' | 'error',
    output?: any
  ): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      logger.warn('Cannot end trace - trace not found', { ...this.logContext, traceId });
      return;
    }

    trace.endTime = Date.now();
    trace.status = status;
    const duration = trace.endTime - trace.startTime;

    // Log summary
    logger.info('Trace completed', {
      ...this.logContext,
      traceId,
      name: trace.name,
      status,
      duration,
      spanCount: this.countSpans(trace),
    });

    // Send to LangSmith
    if (this.langSmithEnabled && langSmithClient) {
      langSmithClient
        .updateRun(traceId, {
          end_time: new Date(),
          outputs: output,
          status: status === 'success' ? 'completed' : 'error',
        })
        .catch((e: any) => logger.debug('LangSmith updateRun failed', { ...this.logContext, error: String(e) }));
    }

    // Clean up after delay
    setTimeout(() => {
      this.traces.delete(traceId);
    }, 60000);
  }

  /**
   * Get trace details (for debugging)
   */
  getTrace(traceId: string): TraceSpan | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Get active trace count
   */
  getActiveTraceCount(): number {
    return this.traces.size;
  }

  /**
   * Find a span by ID within a trace tree
   */
  private findSpan(trace: TraceSpan, spanId: string): TraceSpan | null {
    if (trace.id === spanId) return trace;
    for (const child of trace.children) {
      const found = this.findSpan(child, spanId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Count total spans in a trace
   */
  private countSpans(trace: TraceSpan): number {
    return 1 + trace.children.reduce((sum, child) => sum + this.countSpans(child), 0);
  }
}

// Export singleton instance
export const tracingService = new TracingService();
export default tracingService;
