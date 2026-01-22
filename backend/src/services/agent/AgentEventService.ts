/**
 * AgentEventService
 *
 * Emits agent events to the webhook system for external integrations.
 * Events are dispatched via the existing WebhookService.
 */

import { logger } from '../../utils/logger';
import { webhookService } from '../WebhookService';
import type { ToolContext, ToolResult } from './types';

// Agent event types
export type AgentEventType =
  | 'agent.tool.completed'
  | 'agent.tool.failed'
  | 'agent.task.scheduled'
  | 'agent.task.executed'
  | 'agent.approval.requested'
  | 'agent.approval.received'
  | 'agent.batch.completed'
  | 'agent.session.started'
  | 'agent.session.ended';

interface AgentEventData {
  type: AgentEventType;
  userId?: string;
  sessionId: string;
  requestId?: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

class AgentEventService {
  private initialized = false;
  private eventQueue: AgentEventData[] = [];
  private isProcessing = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    logger.info('AgentEventService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Emit a tool completion event
   */
  async emitToolCompleted(
    context: ToolContext,
    toolName: string,
    result: ToolResult,
    durationMs: number
  ): Promise<void> {
    await this.emit({
      type: 'agent.tool.completed',
      userId: context.userId,
      sessionId: context.sessionId,
      requestId: context.requestId,
      timestamp: new Date(),
      data: {
        toolName,
        success: result.success,
        cached: result.cached || false,
        durationMs,
        hasData: !!result.data,
      },
    });
  }

  /**
   * Emit a tool failure event
   */
  async emitToolFailed(
    context: ToolContext,
    toolName: string,
    error: string,
    durationMs: number
  ): Promise<void> {
    await this.emit({
      type: 'agent.tool.failed',
      userId: context.userId,
      sessionId: context.sessionId,
      requestId: context.requestId,
      timestamp: new Date(),
      data: {
        toolName,
        error,
        durationMs,
      },
    });
  }

  /**
   * Emit a scheduled task creation event
   */
  async emitTaskScheduled(
    userId: string,
    sessionId: string,
    taskId: string,
    taskType: string,
    scheduledFor: Date
  ): Promise<void> {
    await this.emit({
      type: 'agent.task.scheduled',
      userId,
      sessionId,
      timestamp: new Date(),
      data: {
        taskId,
        taskType,
        scheduledFor: scheduledFor.toISOString(),
      },
    });
  }

  /**
   * Emit a task execution event
   */
  async emitTaskExecuted(
    userId: string,
    taskId: string,
    taskType: string,
    success: boolean,
    result?: unknown
  ): Promise<void> {
    await this.emit({
      type: 'agent.task.executed',
      userId,
      sessionId: '', // Task execution may not have session context
      timestamp: new Date(),
      data: {
        taskId,
        taskType,
        success,
        hasResult: !!result,
      },
    });
  }

  /**
   * Emit an approval request event
   */
  async emitApprovalRequested(
    userId: string,
    sessionId: string,
    approvalId: string,
    toolName: string,
    reason: string
  ): Promise<void> {
    await this.emit({
      type: 'agent.approval.requested',
      userId,
      sessionId,
      timestamp: new Date(),
      data: {
        approvalId,
        toolName,
        reason,
      },
    });
  }

  /**
   * Emit an approval response event
   */
  async emitApprovalReceived(
    userId: string,
    sessionId: string,
    approvalId: string,
    toolName: string,
    approved: boolean,
    reason?: string
  ): Promise<void> {
    await this.emit({
      type: 'agent.approval.received',
      userId,
      sessionId,
      timestamp: new Date(),
      data: {
        approvalId,
        toolName,
        approved,
        reason,
      },
    });
  }

  /**
   * Emit a batch operation completion event
   */
  async emitBatchCompleted(
    context: ToolContext,
    toolName: string,
    totalItems: number,
    successCount: number,
    failureCount: number,
    durationMs: number
  ): Promise<void> {
    await this.emit({
      type: 'agent.batch.completed',
      userId: context.userId,
      sessionId: context.sessionId,
      requestId: context.requestId,
      timestamp: new Date(),
      data: {
        toolName,
        totalItems,
        successCount,
        failureCount,
        durationMs,
      },
    });
  }

  /**
   * Emit a session start event
   */
  async emitSessionStarted(userId: string | undefined, sessionId: string): Promise<void> {
    await this.emit({
      type: 'agent.session.started',
      userId,
      sessionId,
      timestamp: new Date(),
      data: {},
    });
  }

  /**
   * Emit a session end event
   */
  async emitSessionEnded(
    userId: string | undefined,
    sessionId: string,
    messageCount: number,
    durationMs: number
  ): Promise<void> {
    await this.emit({
      type: 'agent.session.ended',
      userId,
      sessionId,
      timestamp: new Date(),
      data: {
        messageCount,
        durationMs,
      },
    });
  }

  /**
   * Core emit function - queues and dispatches events
   */
  private async emit(event: AgentEventData): Promise<void> {
    // Add to queue
    this.eventQueue.push(event);

    // Process queue if not already processing
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  /**
   * Process the event queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift()!;

        try {
          // Dispatch to webhook service
          await webhookService.dispatchEvent({
            id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: event.type,
            timestamp: event.timestamp,
            source: 'agent',
            resourceType: 'agent',
            resourceId: event.sessionId,
            userId: event.userId,
            data: event.data,
          });
        } catch (error) {
          // Log but don't fail - webhook delivery is best-effort
          logger.warn({ error, eventType: event.type }, 'Failed to dispatch agent event');
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export const agentEventService = new AgentEventService();
export default AgentEventService;
