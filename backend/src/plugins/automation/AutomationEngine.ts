/**
 * Automation Engine - Event-Driven Workflow Automation
 *
 * A powerful automation system that responds to events and executes actions.
 * Supports:
 * - Event-driven triggers
 * - Conditional logic
 * - Multiple action types
 * - Rate limiting and cooldowns
 * - Audit logging
 */

import {
  Automation,
  AutomationTrigger,
  AutomationTriggerType,
  AutomationCondition,
  AutomationAction,
  AutomationActionType,
  AutomationExecutionResult,
  ActionExecutionResult,
  SystemEvent,
  EventType,
  EventHandler,
  NormalizedDeal,
  CriterionOperator,
} from '../types';
import AutomationModel from '../../models/Automation';
import AutomationExecution, { ExecutionStatus, TriggeredBy } from '../../models/AutomationExecution';
import DeadLetterQueue, { DeadLetterStatus } from '../../models/DeadLetterQueue';
import { docuSealService } from '../../services/DocuSealService';
import Property from '../../models/Property';
import { propertyService } from '../../services/propertyService';
import { scoringEngine } from '../scoring/ScoringEngine';
import { marketDataService } from '../../services/MarketDataService';
import { complianceService } from '../../services/ComplianceService';
import { validateUrl, createLimitedMap } from '../../utils/security';
import { activityFeedService } from '../../services/ActivityFeedService';
import { Resend } from 'resend';
import Twilio from 'twilio';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

// Initialize email service (Resend)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Initialize SMS service (Twilio)
const twilioClient = process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN
  ? Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Custom function registry for custom_function action
const customFunctionRegistry = new Map<string, (params: any, context: any) => Promise<any>>();

// SECURITY: Allowed webhook domains for SSRF protection
const ALLOWED_WEBHOOK_DOMAINS = [
  'hooks.slack.com',
  'discord.com',
  'discordapp.com',
  'api.hubapi.com',
  'api.salesforce.com',
  // Add more trusted domains as needed
];

// Add custom webhook domains from environment
if (process.env.ALLOWED_WEBHOOK_DOMAINS) {
  const envDomains = process.env.ALLOWED_WEBHOOK_DOMAINS.split(',').map(d => d.trim());
  ALLOWED_WEBHOOK_DOMAINS.push(...envDomains);
}

// Register a custom function
export function registerCustomFunction(name: string, fn: (params: any, context: any) => Promise<any>): void {
  customFunctionRegistry.set(name, fn);
  console.log(`✅ Registered custom function: ${name}`);
}

export interface IActionHandler {
  type: AutomationActionType;
  execute(action: AutomationAction, context: ActionContext): Promise<ActionExecutionResult>;
}

export interface ActionContext {
  event: SystemEvent;
  deal?: NormalizedDeal;
  automation: Automation;
  previousResults: ActionExecutionResult[];
  variables: Record<string, any>;
}

interface FailedAction {
  id: string;
  automationId: string;
  action: AutomationAction;
  context: ActionContext;
  error: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: Date;
  createdAt: Date;
}

export class AutomationEngine {
  private automations: Map<string, Automation> = new Map();
  private actionHandlers: Map<AutomationActionType, IActionHandler> = new Map();
  private eventHandlers: EventHandler[] = [];
  private executionHistory: Map<string, Date[]> = new Map();
  private auditLog: Array<{
    timestamp: Date;
    automationId: string;
    event: string;
    result: string;
    details?: any;
  }> = [];

  // Retry queue for failed actions (SECURITY: limited size to prevent memory exhaustion)
  private retryQueue = createLimitedMap<string, FailedAction>({
    maxSize: 1000, // Max 1000 pending retries
    ttlMs: 24 * 60 * 60 * 1000, // Expire after 24 hours
    onEvict: (key, value) => {
      console.warn(`⚠️ Retry ${key} evicted (action: ${value.action.type})`);
    },
  });
  private retryIntervalId: NodeJS.Timeout | null = null;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY_MS = 60000; // 1 minute base delay

  constructor() {
    this.registerDefaultActionHandlers();
    this.startRetryProcessor();
  }

  /**
   * Start the retry queue processor
   */
  private startRetryProcessor(): void {
    // Process retry queue every 30 seconds
    this.retryIntervalId = setInterval(() => {
      this.processRetryQueue().catch(err =>
        console.error('Error processing retry queue:', err)
      );
    }, 30000);
  }

  /**
   * Stop the retry queue processor
   */
  public stopRetryProcessor(): void {
    if (this.retryIntervalId) {
      clearInterval(this.retryIntervalId);
      this.retryIntervalId = null;
    }
  }

  /**
   * Add a failed action to the retry queue
   */
  private addToRetryQueue(
    automationId: string,
    action: AutomationAction,
    context: ActionContext,
    error: string,
    attemptCount: number = 1,
    firstFailedAt?: Date
  ): void {
    if (attemptCount >= this.MAX_RETRY_ATTEMPTS) {
      console.log(`💀 Action ${action.id} exceeded max retries, moving to dead letter`);

      // Persist to database for visibility and recovery
      this.persistToDeadLetterQueue(automationId, action, context, error, attemptCount, firstFailedAt || new Date())
        .catch((err) => console.error('Failed to persist to dead letter queue:', err));

      this.logAudit(automationId, 'retry_exhausted', 'dead_letter', {
        actionId: action.id,
        actionType: action.type,
        error,
        attempts: attemptCount,
      });
      return;
    }

    const id = `retry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const delayMs = this.RETRY_DELAY_MS * Math.pow(2, attemptCount - 1); // Exponential backoff

    this.retryQueue.set(id, {
      id,
      automationId,
      action,
      context,
      error,
      attemptCount,
      maxAttempts: this.MAX_RETRY_ATTEMPTS,
      nextRetryAt: new Date(Date.now() + delayMs),
      createdAt: new Date(),
    });

    console.log(`🔄 Added action ${action.id} to retry queue (attempt ${attemptCount}/${this.MAX_RETRY_ATTEMPTS}, retry in ${delayMs/1000}s)`);
  }

  /**
   * Process the retry queue
   */
  private async processRetryQueue(): Promise<void> {
    const now = new Date();
    const toRetry: FailedAction[] = [];

    for (const [id, failedAction] of this.retryQueue.entries()) {
      if (failedAction.nextRetryAt <= now) {
        toRetry.push(failedAction);
        this.retryQueue.delete(id);
      }
    }

    for (const failedAction of toRetry) {
      console.log(`🔁 Retrying action ${failedAction.action.id} (attempt ${failedAction.attemptCount + 1})`);

      const handler = this.actionHandlers.get(failedAction.action.type);
      if (!handler) {
        console.error(`No handler for action type: ${failedAction.action.type}`);
        continue;
      }

      try {
        const result = await handler.execute(failedAction.action, failedAction.context);

        if (result.success) {
          console.log(`✅ Retry successful for action ${failedAction.action.id}`);
          this.logAudit(failedAction.automationId, 'retry_success', 'success', {
            actionId: failedAction.action.id,
            attempts: failedAction.attemptCount + 1,
          });
        } else {
          // Still failed, add back to queue
          this.addToRetryQueue(
            failedAction.automationId,
            failedAction.action,
            failedAction.context,
            result.error || 'Unknown error',
            failedAction.attemptCount + 1
          );
        }
      } catch (error) {
        // Exception during retry, add back to queue
        this.addToRetryQueue(
          failedAction.automationId,
          failedAction.action,
          failedAction.context,
          error instanceof Error ? error.message : String(error),
          failedAction.attemptCount + 1
        );
      }
    }
  }

  /**
   * Get pending retries
   */
  public getPendingRetries(): FailedAction[] {
    return Array.from(this.retryQueue.values());
  }

  /**
   * Clear the retry queue
   */
  public clearRetryQueue(): void {
    this.retryQueue.clear();
  }

  // ============================================================================
  // DEAD LETTER QUEUE MANAGEMENT
  // ============================================================================

  /**
   * Persist a failed action to the dead letter queue
   */
  private async persistToDeadLetterQueue(
    automationId: string,
    action: AutomationAction,
    context: ActionContext,
    error: string,
    attempts: number,
    firstFailedAt: Date
  ): Promise<void> {
    try {
      // Get automation name
      const automation = this.automations.get(automationId);
      const automationName = automation?.name || 'Unknown Automation';

      // Sanitize context to avoid storing sensitive data
      const sanitizedContext = this.sanitizePayload(context as Record<string, any>);

      await DeadLetterQueue.create({
        automationId,
        automationName,
        actionId: action.id,
        actionType: action.type,
        actionConfig: action as object,
        context: sanitizedContext,
        error,
        attempts,
        firstFailedAt,
        lastFailedAt: new Date(),
        status: 'pending_review',
      });

      console.log(`📥 Persisted dead letter for action ${action.id} (${action.type})`);

      // Emit event for alerting (can be picked up by notification service)
      this.emitEvent({
        id: `dead_letter_${Date.now()}`,
        type: 'automation.dead_letter' as EventType,
        timestamp: new Date(),
        payload: {
          automationId,
          automationName,
          actionId: action.id,
          actionType: action.type,
          error,
          attempts,
        },
        metadata: {
          sourceId: 'automation_engine',
          automationId,
        },
      });
    } catch (dbError) {
      console.error('Failed to persist dead letter to database:', dbError);
      // Still logged to audit log even if DB persistence fails
    }
  }

  /**
   * Get dead letters with optional filters
   */
  public async getDeadLetters(options: {
    status?: DeadLetterStatus;
    actionType?: string;
    automationId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: DeadLetterQueue[]; total: number }> {
    const where: any = {};

    if (options.status) where.status = options.status;
    if (options.actionType) where.actionType = options.actionType;
    if (options.automationId) where.automationId = options.automationId;

    const { rows, count } = await DeadLetterQueue.findAndCountAll({
      where,
      order: [['lastFailedAt', 'DESC']],
      limit: options.limit || 50,
      offset: options.offset || 0,
    });

    return { items: rows, total: count };
  }

  /**
   * Get dead letter statistics
   */
  public async getDeadLetterStats(): Promise<{
    total: number;
    byStatus: Record<DeadLetterStatus, number>;
    byActionType: Record<string, number>;
    oldestPending: Date | null;
    last24Hours: number;
    last7Days: number;
  }> {
    return DeadLetterQueue.getStats();
  }

  /**
   * Manually retry a dead letter
   */
  public async retryDeadLetter(deadLetterId: string): Promise<{ success: boolean; error?: string }> {
    const deadLetter = await DeadLetterQueue.findByPk(deadLetterId);

    if (!deadLetter) {
      return { success: false, error: 'Dead letter not found' };
    }

    if (!deadLetter.canRetry()) {
      return { success: false, error: `Cannot retry dead letter with status: ${deadLetter.status}` };
    }

    // Mark as retrying
    await deadLetter.markRetrying();

    // Reconstruct the action and context
    const action = deadLetter.actionConfig as AutomationAction;
    const context = deadLetter.context as ActionContext;

    const handler = this.actionHandlers.get(action.type);
    if (!handler) {
      await deadLetter.markAbandoned('No handler found for action type');
      return { success: false, error: `No handler for action type: ${action.type}` };
    }

    try {
      const result = await handler.execute(action, context);

      if (result.success) {
        await deadLetter.markResolved('system', 'Manual retry successful');
        this.logAudit(deadLetter.automationId, 'dead_letter_retry_success', 'success', {
          deadLetterId,
          actionId: action.id,
        });
        return { success: true };
      } else {
        // Still failed - keep in pending_review state
        deadLetter.status = 'pending_review';
        deadLetter.error = result.error || 'Retry failed';
        deadLetter.lastFailedAt = new Date();
        deadLetter.attempts += 1;
        await deadLetter.save();
        return { success: false, error: result.error || 'Retry failed' };
      }
    } catch (error) {
      // Exception during retry
      deadLetter.status = 'pending_review';
      deadLetter.error = error instanceof Error ? error.message : String(error);
      deadLetter.lastFailedAt = new Date();
      deadLetter.attempts += 1;
      await deadLetter.save();
      return { success: false, error: deadLetter.error };
    }
  }

  /**
   * Resolve a dead letter (mark as handled/ignored)
   */
  public async resolveDeadLetter(
    deadLetterId: string,
    resolvedBy: string,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const deadLetter = await DeadLetterQueue.findByPk(deadLetterId);

    if (!deadLetter) {
      return { success: false, error: 'Dead letter not found' };
    }

    await deadLetter.markResolved(resolvedBy, notes);
    this.logAudit(deadLetter.automationId, 'dead_letter_resolved', 'resolved', {
      deadLetterId,
      resolvedBy,
      notes,
    });

    return { success: true };
  }

  /**
   * Abandon a dead letter (give up permanently)
   */
  public async abandonDeadLetter(
    deadLetterId: string,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const deadLetter = await DeadLetterQueue.findByPk(deadLetterId);

    if (!deadLetter) {
      return { success: false, error: 'Dead letter not found' };
    }

    await deadLetter.markAbandoned(notes);
    this.logAudit(deadLetter.automationId, 'dead_letter_abandoned', 'abandoned', {
      deadLetterId,
      notes,
    });

    return { success: true };
  }

  /**
   * Delete a dead letter entry
   */
  public async deleteDeadLetter(deadLetterId: string): Promise<{ success: boolean; error?: string }> {
    const result = await DeadLetterQueue.destroy({ where: { id: deadLetterId } });
    return { success: result > 0, error: result === 0 ? 'Dead letter not found' : undefined };
  }

  /**
   * Cleanup old resolved dead letters
   */
  public async cleanupDeadLetters(retentionDays: number = 30): Promise<number> {
    return DeadLetterQueue.cleanupOld(retentionDays);
  }

  // ============================================================================
  // AUTOMATION MANAGEMENT
  // ============================================================================

  /**
   * Register an automation
   */
  public registerAutomation(automation: Automation): void {
    this.automations.set(automation.id, automation);
    console.log(`✅ Registered automation: ${automation.name} (${automation.id})`);
  }

  /**
   * Update an automation
   */
  public updateAutomation(automation: Automation): void {
    if (!this.automations.has(automation.id)) {
      throw new Error(`Automation not found: ${automation.id}`);
    }
    this.automations.set(automation.id, { ...automation, updatedAt: new Date() });
  }

  /**
   * Remove an automation
   */
  public removeAutomation(automationId: string): void {
    this.automations.delete(automationId);
  }

  /**
   * Remove an automation (with database persistence)
   */
  public async deleteAutomation(automationId: string): Promise<void> {
    this.automations.delete(automationId);
    try {
      await AutomationModel.destroy({ where: { id: automationId } });
      console.log(`🗑️ Deleted automation from database: ${automationId}`);
    } catch (error: any) {
      console.error('❌ Failed to delete automation from database:', error?.message || error);
    }
  }

  /**
   * Get all automations
   */
  public getAllAutomations(): Automation[] {
    return Array.from(this.automations.values());
  }

  /**
   * Get a single automation by ID
   */
  public getAutomation(automationId: string): Automation | undefined {
    return this.automations.get(automationId);
  }

  // ============================================================================
  // DATABASE PERSISTENCE
  // ============================================================================

  /**
   * Load automations from database into memory
   */
  public async loadFromDatabase(): Promise<void> {
    try {
      const dbAutomations = await AutomationModel.findAll();
      this.automations.clear();
      for (const dbAutomation of dbAutomations) {
        const automation = dbAutomation.toAutomation();
        this.automations.set(automation.id, automation);
      }
      console.log(`✅ Loaded ${dbAutomations.length} automations from database`);
    } catch (error: any) {
      // Handle case where table doesn't exist yet
      if (error?.original?.code === '42P01') {
        console.log('⚠️ Automations table does not exist yet, will be created on first use');
      } else {
        console.error('❌ Failed to load automations from database:', error?.message || error);
      }
    }
  }

  /**
   * Save an automation to database (creates or updates)
   */
  public async saveAutomation(automation: Automation): Promise<void> {
    // Update in-memory cache
    this.automations.set(automation.id, automation);
    console.log(`✅ Registered automation: ${automation.name} (${automation.id})`);

    // Persist to database
    try {
      await AutomationModel.upsert({
        id: automation.id,
        name: automation.name,
        description: automation.description,
        enabled: automation.enabled,
        trigger: automation.trigger,
        conditions: automation.conditions,
        actions: automation.actions,
        cooldown: automation.cooldown,
        maxExecutionsPerHour: automation.maxExecutionsPerHour,
        lastExecutedAt: automation.lastExecutedAt,
        executionCount: automation.executionCount,
      });
      console.log(`💾 Saved automation to database: ${automation.name}`);
    } catch (error: any) {
      console.error('❌ Failed to save automation to database:', error?.message || error);
    }
  }

  /**
   * Update automation execution stats in database
   */
  private async updateExecutionStats(automationId: string): Promise<void> {
    const automation = this.automations.get(automationId);
    if (!automation) return;

    try {
      await AutomationModel.update(
        {
          lastExecutedAt: automation.lastExecutedAt,
          executionCount: automation.executionCount,
        },
        { where: { id: automationId } }
      );
    } catch (error: any) {
      // Non-critical, just log
      console.warn('⚠️ Failed to update automation stats:', error?.message || error);
    }
  }

  /**
   * Persist execution result to database for analytics and debugging
   */
  private async persistExecution(
    automation: Automation,
    event: SystemEvent,
    result: AutomationExecutionResult,
    triggeredBy: TriggeredBy = 'event'
  ): Promise<void> {
    try {
      // Determine execution status
      let status: ExecutionStatus;
      if (result.actionsExecuted.length === 0 && result.success) {
        status = 'skipped';
      } else if (result.success) {
        status = 'success';
      } else if (result.actionsExecuted.some(a => a.success)) {
        status = 'partial';
      } else {
        status = 'failed';
      }

      const failedCount = result.actionsExecuted.filter(a => !a.success).length;

      // Sanitize payload to avoid storing sensitive data
      const sanitizedPayload = this.sanitizePayload(event.payload);

      await AutomationExecution.create({
        automationId: automation.id,
        automationName: automation.name,
        status,
        triggeredBy,
        eventType: event.type,
        eventPayload: sanitizedPayload,
        results: {
          actions: result.actionsExecuted.map(a => ({
            actionId: a.actionId,
            actionType: a.actionType,
            success: a.success,
            durationMs: a.durationMs,
            error: a.error,
            // Only include non-sensitive result summaries
            resultSummary: a.result ? this.summarizeResult(a.result) : undefined,
          })),
        },
        actionsExecuted: result.actionsExecuted.length,
        actionsFailed: failedCount,
        error: result.error,
        duration: result.durationMs,
        executedAt: result.startedAt,
      });

      console.log(`📊 Execution persisted: ${automation.name} [${status}] - ${result.actionsExecuted.length} actions in ${result.durationMs}ms`);
    } catch (error: any) {
      // Non-critical - log but don't fail the automation
      console.warn('⚠️ Failed to persist execution:', error?.message || error);
    }
  }

  /**
   * Sanitize event payload to remove sensitive data before storing
   */
  private sanitizePayload(payload: Record<string, any>): Record<string, any> {
    const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization', 'auth'];
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(payload)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizePayload(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Create a summary of action result for storage (avoid storing large objects)
   */
  private summarizeResult(result: any): Record<string, any> {
    if (typeof result !== 'object' || result === null) {
      return { value: result };
    }

    const summary: Record<string, any> = {};
    const maxKeys = 10;
    let keyCount = 0;

    for (const [key, value] of Object.entries(result)) {
      if (keyCount >= maxKeys) {
        summary._truncated = true;
        break;
      }

      // Summarize nested objects
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          summary[key] = `[Array: ${value.length} items]`;
        } else {
          summary[key] = `[Object: ${Object.keys(value).length} keys]`;
        }
      } else if (typeof value === 'string' && value.length > 100) {
        summary[key] = value.substring(0, 100) + '...';
      } else {
        summary[key] = value;
      }
      keyCount++;
    }

    return summary;
  }

  /**
   * Get automations for a specific trigger type
   */
  public getAutomationsForTrigger(triggerType: AutomationTriggerType): Automation[] {
    return Array.from(this.automations.values()).filter(
      (a) => a.enabled && a.trigger.type === triggerType
    );
  }

  // ============================================================================
  // ACTION HANDLERS
  // ============================================================================

  /**
   * Register a custom action handler
   */
  public registerActionHandler(handler: IActionHandler): void {
    this.actionHandlers.set(handler.type, handler);
    console.log(`✅ Registered action handler: ${handler.type}`);
  }

  /**
   * Find property by id or externalId
   * Tries id first (for newly created properties), then falls back to externalId
   */
  private async findPropertyByIdOrExternalId(dealId: string): Promise<typeof Property.prototype | null> {
    // Try by primary key id first
    let property = await Property.findByPk(dealId);
    if (property) {
      return property;
    }
    // Fall back to externalId lookup
    property = await Property.findOne({ where: { externalId: dealId } });
    return property;
  }

  /**
   * Register default action handlers
   */
  private registerDefaultActionHandlers(): void {
    // Send Email Action (using Resend)
    this.registerActionHandler({
      type: 'send_email',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { to, subject, template, html, text, from } = action.config;
          const deal = context.deal;

          if (!resend) {
            throw new Error('Email service not configured. Set RESEND_API_KEY environment variable.');
          }

          // Process template variables
          const processedSubject = this.processTemplate(subject, { deal, ...context.variables });
          const processedHtml = html ? this.processTemplate(html, { deal, ...context.variables }) : undefined;
          const processedText = text ? this.processTemplate(text, { deal, ...context.variables }) : undefined;

          // Generate HTML from template if provided
          let emailHtml = processedHtml;
          if (template && !emailHtml) {
            emailHtml = this.generateEmailFromTemplate(template, { deal, ...context.variables });
          }

          // Send via Resend
          const emailPayload: any = {
            from: from || process.env.RESEND_FROM_EMAIL || 'Dispotree <noreply@dispotree.com>',
            to: Array.isArray(to) ? to : [to],
            subject: processedSubject,
          };
          if (emailHtml) emailPayload.html = emailHtml;
          if (processedText) emailPayload.text = processedText;

          const { data, error } = await resend.emails.send(emailPayload);

          if (error) {
            throw new Error(error.message);
          }

          console.log(`📧 Email sent to ${to}: ${processedSubject} (ID: ${data?.id})`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: { emailSent: true, to, subject: processedSubject, emailId: data?.id },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`📧 Email failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Send Webhook Action (with SSRF protection)
    this.registerActionHandler({
      type: 'send_webhook',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { url, method, headers, body } = action.config;

          // SECURITY: Validate URL to prevent SSRF attacks
          const validatedUrl = validateUrl(url, {
            allowedDomains: ALLOWED_WEBHOOK_DOMAINS,
            requireHttps: process.env.NODE_ENV === 'production',
          });

          if (!validatedUrl) {
            throw new Error(`Invalid or blocked webhook URL: ${url}. Add domain to ALLOWED_WEBHOOK_DOMAINS.`);
          }

          const response = await fetch(validatedUrl.toString(), {
            method: method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            body: JSON.stringify(this.interpolateVariables(body, context)),
          });

          return {
            actionId: action.id,
            actionType: action.type,
            success: response.ok,
            result: { statusCode: response.status },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Update Deal Action (persists to database)
    this.registerActionHandler({
      type: 'update_deal',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { updates } = action.config;
          const deal = context.deal;
          const dealId = context.event.metadata.dealId || deal?.externalId;

          if (!dealId) {
            throw new Error('No deal ID in context');
          }

          // Find the property in database (by id or externalId)
          const property = await this.findPropertyByIdOrExternalId(dealId);

          if (!property) {
            throw new Error(`Property not found: ${dealId}`);
          }

          // Process updates with variable interpolation
          const processedUpdates: Record<string, any> = {};
          for (const [key, value] of Object.entries(updates)) {
            processedUpdates[key] = this.interpolateVariables(value, context);
          }

          // Update property in database
          await property.update(processedUpdates);

          console.log(`📝 Deal updated ${dealId}:`, processedUpdates);

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: { dealId, updates: processedUpdates },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`📝 Update deal failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Add Tag Action (persists to database)
    this.registerActionHandler({
      type: 'add_tag',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { tag } = action.config;
          const deal = context.deal;
          const dealId = context.event.metadata.dealId || deal?.externalId;

          if (!dealId || !tag) {
            throw new Error('Deal ID and tag are required');
          }

          // Find property and add tag (by id or externalId)
          const property = await this.findPropertyByIdOrExternalId(dealId);

          if (!property) {
            throw new Error(`Property not found: ${dealId}`);
          }

          // Add tag if not already present
          const currentTags = property.tags || [];
          if (!currentTags.includes(tag)) {
            await property.update({
              tags: [...currentTags, tag],
            });
            console.log(`🏷️ Tag "${tag}" added to deal ${dealId}`);
          } else {
            console.log(`🏷️ Tag "${tag}" already exists on deal ${dealId}`);
          }

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: { tag, dealId, tags: [...currentTags, tag] },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`🏷️ Add tag failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Remove Tag Action (persists to database)
    this.registerActionHandler({
      type: 'remove_tag',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { tag } = action.config;
          const deal = context.deal;
          const dealId = context.event.metadata.dealId || deal?.externalId;

          if (!dealId || !tag) {
            throw new Error('Deal ID and tag are required');
          }

          // Find property and remove tag (by id or externalId)
          const property = await this.findPropertyByIdOrExternalId(dealId);

          if (!property) {
            throw new Error(`Property not found: ${dealId}`);
          }

          // Remove tag if present
          const currentTags = property.tags || [];
          const newTags = currentTags.filter(t => t !== tag);

          if (newTags.length < currentTags.length) {
            await property.update({ tags: newTags });
            console.log(`🏷️ Tag "${tag}" removed from deal ${dealId}`);
          } else {
            console.log(`🏷️ Tag "${tag}" not found on deal ${dealId}`);
          }

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: { tag, dealId, tags: newTags },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`🏷️ Remove tag failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Send Notification Action
    this.registerActionHandler({
      type: 'send_notification',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { channel, message, priority } = action.config;
          console.log(`🔔 Notification [${channel}] (${priority}): ${message}`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: { channel, message, priority },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Log Event Action
    this.registerActionHandler({
      type: 'log_event',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { level, message, data } = action.config;
          const logEntry = {
            level: level || 'info',
            message: this.interpolateVariables(message, context),
            data: this.interpolateVariables(data, context),
            timestamp: new Date(),
            automationId: context.automation.id,
          };

          console.log(`📝 [${logEntry.level.toUpperCase()}] ${logEntry.message}`, logEntry.data || '');

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: logEntry,
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Score Against Buy Box Action
    this.registerActionHandler({
      type: 'score_against_buybox',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { buyBoxId } = action.config;
          const deal = context.deal;

          if (!deal) {
            throw new Error('No deal in context');
          }

          let scoringResults;

          if (buyBoxId) {
            // Score against specific buy box
            const buyBox = scoringEngine.getBuyBox(buyBoxId);
            if (!buyBox) {
              throw new Error(`Buy box not found: ${buyBoxId}`);
            }
            const result = await scoringEngine.scoreDealAgainstBuyBox(deal, buyBox);
            scoringResults = [result];
          } else {
            // Score against all buy boxes
            scoringResults = await scoringEngine.scoreDealAgainstAllBuyBoxes(deal);
          }

          console.log(`📊 Deal ${deal.externalId} scored against ${scoringResults.length} buy box(es)`);

          // Store results in context for subsequent actions
          context.variables.scoringResults = scoringResults;
          context.variables.bestMatch = scoringResults.reduce((best, current) =>
            current.percentage > (best?.percentage || 0) ? current : best, null as any
          );

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: {
              dealId: deal.externalId,
              scoringResults,
              bestMatch: context.variables.bestMatch,
            },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`📊 Scoring failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Run Compliance Check Action (uses state-specific rules from ComplianceService)
    this.registerActionHandler({
      type: 'run_compliance_check',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const deal = context.deal;
          const dealId = context.event.metadata.dealId || deal?.externalId;

          if (!dealId) {
            throw new Error('No deal ID in context');
          }

          // Find property (by id or externalId)
          const property = await this.findPropertyByIdOrExternalId(dealId);

          if (!property) {
            throw new Error(`Property not found: ${dealId}`);
          }

          // Run state-specific compliance checks using ComplianceService
          const complianceResult = await complianceService.checkProperty(property);

          // Update property with compliance results
          await property.update({
            status: complianceResult.status,
            complianceNotes: complianceResult.issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`),
          });

          console.log(`✅ Compliance check for ${dealId} (${complianceResult.state}): ${complianceResult.status} (${complianceResult.failedRules} issues, ${complianceResult.passedRules} passed)`);

          // Store in context for use in subsequent actions
          context.variables.complianceResult = {
            status: complianceResult.status,
            state: complianceResult.state,
            issues: complianceResult.issues,
            passedChecks: complianceResult.passedChecks,
            totalRules: complianceResult.totalRules,
            passedRules: complianceResult.passedRules,
            failedRules: complianceResult.failedRules,
          };

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: {
              dealId,
              state: complianceResult.state,
              status: complianceResult.status,
              issues: complianceResult.issues,
              passedChecks: complianceResult.passedChecks,
              summary: `${complianceResult.passedRules}/${complianceResult.totalRules} rules passed`,
            },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`✅ Compliance check failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Enrich Deal Action (uses propertyService)
    this.registerActionHandler({
      type: 'enrich_deal',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const deal = context.deal;
          const dealId = context.event.metadata.dealId || deal?.externalId;

          if (!dealId) {
            throw new Error('No deal ID in context');
          }

          // Find property (by id or externalId)
          const property = await this.findPropertyByIdOrExternalId(dealId);

          if (!property) {
            throw new Error(`Property not found: ${dealId}`);
          }

          // Call enrichment service
          const enrichmentResult = await propertyService.enrichProperty(property);

          console.log(`🔍 Deal ${dealId} enriched: ${enrichmentResult.success ? 'success' : 'no data'}`);

          // Store in context
          context.variables.enrichmentResult = enrichmentResult;

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: {
              dealId,
              enriched: enrichmentResult.success,
              data: enrichmentResult.data,
            },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`🔍 Enrichment failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Submit to Marketplace Action
    this.registerActionHandler({
      type: 'submit_to_marketplace',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { marketplace, options } = action.config;
          const deal = context.deal;
          const dealId = context.event.metadata.dealId || deal?.externalId;

          if (!dealId) {
            throw new Error('No deal ID in context');
          }

          // Find property (by id or externalId)
          const property = await this.findPropertyByIdOrExternalId(dealId);

          if (!property) {
            throw new Error(`Property not found: ${dealId}`);
          }

          // Record submission in listing history
          const listingEntry = {
            siteId: marketplace,
            siteName: marketplace,
            submittedAt: new Date(),
            status: 'pending' as const,
          };

          const currentHistory = property.listingHistory || [];
          const currentListings = property.currentListings || [];

          await property.update({
            listingHistory: [...currentHistory, listingEntry],
            currentListings: [...new Set([...currentListings, marketplace])],
            lastSubmittedAt: new Date(),
            lastSubmittedTo: marketplace,
          });

          console.log(`📤 Deal ${dealId} submitted to ${marketplace}`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: { dealId, marketplace, submitted: true, listingEntry },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`📤 Marketplace submission failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Custom Function Action (uses function registry)
    this.registerActionHandler({
      type: 'custom_function',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { functionName, params } = action.config;

          // Look up function in registry
          const customFn = customFunctionRegistry.get(functionName);
          if (!customFn) {
            throw new Error(`Custom function not registered: ${functionName}`);
          }

          // Execute the custom function
          const result = await customFn(params, context);

          console.log(`⚡ Custom function executed: ${functionName}`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: { functionName, executed: true, output: result },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`⚡ Custom function failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // =========================================================================
    // NEW ACTION HANDLERS
    // =========================================================================

    // Send SMS Action (using Twilio)
    this.registerActionHandler({
      type: 'send_sms',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { to, message } = action.config;
          const deal = context.deal;

          if (!twilioClient) {
            throw new Error('SMS service not configured. Set TWILIO_SID and TWILIO_AUTH_TOKEN environment variables.');
          }

          const twilioFromNumber = process.env.TWILIO_FROM_NUMBER;
          if (!twilioFromNumber) {
            throw new Error('TWILIO_FROM_NUMBER environment variable not set.');
          }

          // Validate message template
          if (!message) {
            throw new Error('No message template provided for SMS');
          }

          // Replace template variables
          const processedMessage = this.processTemplate(message, { deal, ...context.variables });
          const phoneNumber = to || deal?.wholesalerPhone;

          if (!phoneNumber) {
            throw new Error('No phone number provided');
          }

          // Send via Twilio
          const twilioMessage = await twilioClient.messages.create({
            to: phoneNumber,
            from: twilioFromNumber,
            body: processedMessage,
          });

          // Safely truncate message for logging (handle potential null/empty)
          const truncatedMessage = processedMessage ? processedMessage.substring(0, 50) : '';
          console.log(`📱 SMS sent to ${phoneNumber}: ${truncatedMessage}${processedMessage && processedMessage.length > 50 ? '...' : ''} (SID: ${twilioMessage.sid})`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: { to: phoneNumber, message: processedMessage, messageSid: twilioMessage.sid },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`📱 SMS failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Send Slack Action (with SSRF protection)
    this.registerActionHandler({
      type: 'send_slack',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { channel, message, webhookUrl } = action.config;
          const deal = context.deal;

          const processedMessage = this.processTemplate(message, { deal, ...context.variables });
          const slackWebhook = webhookUrl || process.env.SLACK_WEBHOOK_URL;

          if (!slackWebhook) {
            throw new Error('No Slack webhook URL configured');
          }

          // SECURITY: Validate Slack webhook URL
          const validatedUrl = validateUrl(slackWebhook, {
            allowedDomains: ['hooks.slack.com'],
            requireHttps: true,
          });

          if (!validatedUrl) {
            throw new Error('Invalid Slack webhook URL. Must be hooks.slack.com');
          }

          // Send to Slack
          const response = await fetch(validatedUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel,
              text: processedMessage,
              attachments: deal ? [{
                color: '#36a64f',
                title: `${deal.address?.street}, ${deal.address?.city}, ${deal.address?.state}`,
                fields: [
                  { title: 'Price', value: `$${deal.askingPrice?.toLocaleString()}`, short: true },
                  { title: 'ARV', value: deal.arv ? `$${deal.arv.toLocaleString()}` : 'N/A', short: true },
                ],
              }] : undefined,
            }),
          });

          console.log(`💬 Slack message sent to ${channel || 'default'}`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: response.ok,
            result: { channel, messageSent: true },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Send Discord Action (with SSRF protection)
    this.registerActionHandler({
      type: 'send_discord',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { message, webhookUrl, username, avatarUrl } = action.config;
          const deal = context.deal;

          const processedMessage = this.processTemplate(message, { deal, ...context.variables });
          const discordWebhook = webhookUrl || process.env.DISCORD_WEBHOOK_URL;

          if (!discordWebhook) {
            throw new Error('No Discord webhook URL configured');
          }

          // SECURITY: Validate Discord webhook URL
          const validatedUrl = validateUrl(discordWebhook, {
            allowedDomains: ['discord.com', 'discordapp.com'],
            requireHttps: true,
          });

          if (!validatedUrl) {
            throw new Error('Invalid Discord webhook URL. Must be discord.com or discordapp.com');
          }

          // Build Discord embed for rich deal display
          const formatPrice = (val: any): string => {
            if (!val) return 'N/A';
            const num = typeof val === 'string' ? parseFloat(val) : val;
            return isNaN(num) ? 'N/A' : `$${num.toLocaleString()}`;
          };

          const embed = deal ? {
            title: `${deal.address?.street || ''}, ${deal.address?.city || ''}, ${deal.address?.state || ''}`.replace(/^, |, $/g, '') || 'New Property',
            color: 0x36a64f, // Green
            fields: [
              { name: 'Price', value: formatPrice(deal.askingPrice), inline: true },
              { name: 'ARV', value: formatPrice(deal.arv), inline: true },
              { name: 'Property Type', value: deal.propertyType || 'N/A', inline: true },
              { name: 'Beds/Baths', value: `${deal.bedrooms ?? 'N/A'} / ${deal.bathrooms ?? 'N/A'}`, inline: true },
              { name: 'Sq Ft', value: deal.sqft != null ? Number(deal.sqft).toLocaleString() : 'N/A', inline: true },
            ],
            timestamp: new Date().toISOString(),
          } : undefined;

          // Send to Discord
          const response = await fetch(validatedUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: processedMessage,
              username: username || 'Dispotree Bot',
              avatar_url: avatarUrl,
              embeds: embed ? [embed] : undefined,
            }),
          });

          console.log(`🎮 Discord message sent`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: response.ok,
            result: { messageSent: true },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Calculate MAO (Max Allowable Offer) Action
    this.registerActionHandler({
      type: 'calculate_mao',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { profitMargin = 0.3, repairBuffer = 1.1 } = action.config;
          const deal = context.deal;

          if (!deal?.arv) {
            throw new Error('ARV required to calculate MAO');
          }

          const arv = deal.arv;
          const repairCost = (deal.repairEstimate || 0) * repairBuffer;
          const wholesaleFee = deal.assignmentFee || 5000;
          const closingCosts = arv * 0.03; // ~3% closing costs
          const holdingCosts = arv * 0.02; // ~2% holding costs

          // MAO = ARV * (1 - profit margin) - repairs - fees - costs
          const mao = (arv * (1 - profitMargin)) - repairCost - wholesaleFee - closingCosts - holdingCosts;
          const roundedMao = Math.floor(mao / 1000) * 1000; // Round down to nearest $1000

          console.log(`🧮 MAO calculated: $${roundedMao.toLocaleString()} (ARV: $${arv.toLocaleString()}, ${(profitMargin * 100)}% margin)`);

          // Store in context for subsequent actions
          context.variables.calculatedMao = roundedMao;
          context.variables.maoDetails = {
            arv,
            repairCost,
            wholesaleFee,
            closingCosts,
            holdingCosts,
            profitMargin,
            mao: roundedMao,
          };

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: {
              mao: roundedMao,
              arv,
              repairCost,
              profitMargin: `${(profitMargin * 100)}%`,
              spreadToAsking: deal.askingPrice ? roundedMao - deal.askingPrice : null,
            },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Generate Offer Letter Action
    this.registerActionHandler({
      type: 'generate_offer_letter',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { template = 'standard', offerAmount, buyerName, buyerCompany } = action.config;
          const deal = context.deal;

          if (!deal) {
            throw new Error('Deal context required for offer letter');
          }

          const amount = offerAmount || context.variables.calculatedMao || deal.askingPrice;
          const earnestMoney = Math.min(amount * 0.01, 5000);
          const closingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

          // Generate offer letter content
          const offerLetter = {
            id: `offer-${Date.now()}`,
            template,
            propertyAddress: `${deal.address?.street}, ${deal.address?.city}, ${deal.address?.state} ${deal.address?.zip}`,
            offerAmount: amount,
            earnestMoney,
            closingDate: closingDate.toISOString().split('T')[0],
            contingencies: ['inspection', 'financing', 'appraisal'],
            expiresAt: expiresAt.toISOString(),
            generatedAt: new Date().toISOString(),
          };

          // Ensure uploads directory exists
          const uploadsDir = path.join(process.cwd(), 'uploads', 'offers');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }

          // Generate PDF using PDFKit
          const pdfPath = path.join(uploadsDir, `${offerLetter.id}.pdf`);
          const doc = new PDFDocument({ margin: 50 });
          const writeStream = fs.createWriteStream(pdfPath);
          doc.pipe(writeStream);

          // Header
          doc.fontSize(20).font('Helvetica-Bold').text('LETTER OF INTENT TO PURCHASE', { align: 'center' });
          doc.moveDown();
          doc.fontSize(12).font('Helvetica').text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
          doc.moveDown(2);

          // Property Details
          doc.font('Helvetica-Bold').text('PROPERTY:');
          doc.font('Helvetica').text(offerLetter.propertyAddress);
          doc.moveDown();

          // Buyer Info
          doc.font('Helvetica-Bold').text('BUYER:');
          doc.font('Helvetica').text(buyerCompany || process.env.COMPANY_NAME || 'Dispotree Investments LLC');
          if (buyerName) doc.text(`Attention: ${buyerName}`);
          doc.moveDown();

          // Seller Info
          doc.font('Helvetica-Bold').text('SELLER:');
          doc.font('Helvetica').text(deal.wholesalerName || deal.wholesalerCompany || 'Seller');
          doc.moveDown(2);

          // Offer Terms
          doc.font('Helvetica-Bold').text('OFFER TERMS:', { underline: true });
          doc.moveDown();
          doc.font('Helvetica')
            .text(`Purchase Price: $${amount.toLocaleString()}`)
            .text(`Earnest Money Deposit: $${earnestMoney.toLocaleString()}`)
            .text(`Proposed Closing Date: ${closingDate.toLocaleDateString()}`)
            .text(`Offer Expires: ${expiresAt.toLocaleDateString()} at 5:00 PM`);
          doc.moveDown();

          // Contingencies
          doc.font('Helvetica-Bold').text('CONTINGENCIES:');
          doc.font('Helvetica')
            .text('• Inspection contingency (10 business days)')
            .text('• Financing contingency (21 days)')
            .text('• Clear title and marketable deed');
          doc.moveDown(2);

          // Signature Section
          doc.text('This letter of intent is non-binding and subject to execution of a formal purchase agreement.');
          doc.moveDown(2);
          doc.text('Buyer Signature: _________________________    Date: ___________');
          doc.moveDown();
          doc.text('Seller Signature: _________________________    Date: ___________');

          doc.end();

          // Wait for PDF to finish writing
          await new Promise<void>((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
          });

          console.log(`📄 Offer letter PDF generated: ${pdfPath}`);

          // Store in context
          context.variables.offerLetter = {
            ...offerLetter,
            pdfPath,
            pdfUrl: `/uploads/offers/${offerLetter.id}.pdf`,
          };

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: { ...offerLetter, pdfPath, pdfUrl: `/uploads/offers/${offerLetter.id}.pdf` },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`📄 Offer letter generation failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Create Follow-up Action (stores in Settings as pending tasks)
    this.registerActionHandler({
      type: 'create_followup',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { daysFromNow = 7, title, description, priority = 'medium', assignTo } = action.config;
          const deal = context.deal;
          const dealId = context.event.metadata.dealId || deal?.externalId;

          const followUp = {
            id: `followup-${Date.now()}`,
            dealId,
            propertyAddress: deal ? `${deal.address?.street}, ${deal.address?.city}` : 'Unknown',
            title: this.processTemplate(title || 'Follow up on deal', { deal, ...context.variables }),
            description: this.processTemplate(description || 'Check status of deal', { deal, ...context.variables }),
            dueDate: new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString(),
            priority,
            assignTo,
            status: 'pending',
            createdAt: new Date().toISOString(),
            automationId: context.automation.id,
          };

          // Store follow-up in property notes or a dedicated field
          if (dealId) {
            const property = await this.findPropertyByIdOrExternalId(dealId);

            if (property) {
              const currentNotes = property.complianceNotes || [];
              await property.update({
                complianceNotes: [...currentNotes, `📅 Follow-up: ${followUp.title} - Due: ${new Date(followUp.dueDate).toLocaleDateString()}`],
              });
            }
          }

          console.log(`📅 Follow-up created: "${followUp.title}" due ${followUp.dueDate}`);

          // Store in context for potential email/notification actions
          context.variables.followUp = followUp;

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: followUp,
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`📅 Follow-up creation failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Run Comps Analysis Action (uses MarketDataService)
    this.registerActionHandler({
      type: 'run_comps_analysis',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { radius = 0.5, maxAge = 180, limit = 10 } = action.config;
          const deal = context.deal;

          if (!deal?.address) {
            throw new Error('Deal address required for comps analysis');
          }

          const fullAddress = `${deal.address.street}, ${deal.address.city}, ${deal.address.state} ${deal.address.zip}`;
          console.log(`🏘️ Running comps analysis for ${fullAddress}`);

          // Try to use MarketDataService for real comps (requires ZPID)
          let compsResult: any;

          // Find property to get ZPID if available (by id or externalId)
          const dealId = context.event.metadata.dealId || deal?.externalId;
          let property: any = null;
          if (dealId) {
            property = await this.findPropertyByIdOrExternalId(dealId);
          }

          if (property?.zpid) {
            try {
              const compsData = await marketDataService.getComparableHomes(
                { address: fullAddress },
                property.zpid
              );
              if (compsData && compsData.comparables) {
                // Calculate average from actual comps
                const prices = compsData.comparables.map(c => c.price || c.zestimate || 0).filter(p => p > 0);
                const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
                const medPrice = prices.length > 0 ? prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)] : 0;

                compsResult = {
                  address: fullAddress,
                  searchRadius: radius,
                  maxAgeDays: maxAge,
                  comparables: compsData.comparables,
                  averageSoldPrice: avgPrice,
                  medianSoldPrice: medPrice,
                  pricePerSqFt: null,
                  analyzedAt: new Date().toISOString(),
                  source: 'marketDataService',
                };
              }
            } catch (marketError) {
              console.log(`📊 MarketDataService error, using estimates`);
            }
          }

          // Fallback to property-based estimate
          if (!compsResult) {
            compsResult = {
              address: fullAddress,
              searchRadius: radius,
              maxAgeDays: maxAge,
              comparables: [],
              averageSoldPrice: deal.arv || (deal.askingPrice ? deal.askingPrice * 1.2 : 0),
              medianSoldPrice: deal.arv || (deal.askingPrice ? deal.askingPrice * 1.15 : 0),
              pricePerSqFt: deal.sqft && deal.arv ? Math.round(deal.arv / deal.sqft) : null,
              analyzedAt: new Date().toISOString(),
              source: 'estimate',
            };
          }

          // Store in context and update property
          context.variables.compsAnalysis = compsResult;

          // Update property with comps data (reuse existing property lookup)
          if (property && compsResult.averageSoldPrice) {
            await property.update({
              comparablesCount: compsResult.comparables?.length || 0,
              comparablesAvgPrice: compsResult.averageSoldPrice,
            });
          }

          console.log(`🏘️ Comps analysis complete: ${compsResult.comparables?.length || 0} comps found, avg price: $${compsResult.averageSoldPrice?.toLocaleString() || 'N/A'}`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: compsResult,
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`🏘️ Comps analysis failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Export to CRM Action (HubSpot/Salesforce integration)
    this.registerActionHandler({
      type: 'export_to_crm',
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          const { provider = 'hubspot' } = action.config;
          const deal = context.deal;

          if (!deal) {
            throw new Error('Deal context required for CRM export');
          }

          const crmData = {
            properties: {
              address: `${deal.address?.street}, ${deal.address?.city}, ${deal.address?.state} ${deal.address?.zip}`,
              deal_value: deal.askingPrice,
              arv: deal.arv,
              property_type: deal.propertyType,
              bedrooms: deal.bedrooms,
              bathrooms: deal.bathrooms,
              sqft: deal.sqft,
              wholesaler_name: deal.wholesalerName,
              wholesaler_email: deal.wholesalerEmail,
              source: deal.sourceName,
            },
          };

          let result;

          if (provider === 'hubspot') {
            const hubspotApiKey = process.env.HUBSPOT_API_KEY;
            if (!hubspotApiKey) {
              throw new Error('HUBSPOT_API_KEY environment variable not set');
            }

            // Create deal in HubSpot
            const response = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${hubspotApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                properties: {
                  dealname: `${deal.address?.street}, ${deal.address?.city}`,
                  amount: String(deal.askingPrice || 0),
                  pipeline: 'default',
                  dealstage: 'appointmentscheduled',
                  description: `ARV: $${deal.arv?.toLocaleString() || 'N/A'}\nBeds: ${deal.bedrooms || 'N/A'}\nBaths: ${deal.bathrooms || 'N/A'}\nSqFt: ${deal.sqft || 'N/A'}`,
                },
              }),
            });

            if (!response.ok) {
              const error = await response.text();
              throw new Error(`HubSpot API error: ${error}`);
            }

            result = await response.json();
            console.log(`📤 Deal exported to HubSpot: ${result.id}`);
          } else if (provider === 'salesforce') {
            // Salesforce integration would go here
            throw new Error('Salesforce integration not yet implemented');
          } else {
            // Generic webhook export (with SSRF protection)
            const webhookUrl = process.env.CRM_WEBHOOK_URL;
            if (webhookUrl) {
              const validatedUrl = validateUrl(webhookUrl, {
                allowedDomains: ALLOWED_WEBHOOK_DOMAINS,
                requireHttps: process.env.NODE_ENV === 'production',
              });

              if (!validatedUrl) {
                throw new Error('Invalid CRM webhook URL. Add domain to ALLOWED_WEBHOOK_DOMAINS.');
              }

              await fetch(validatedUrl.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(crmData),
              });
              result = { webhook: true };
            } else {
              throw new Error(`Unknown CRM provider: ${provider}`);
            }
          }

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: { provider, exported: true, data: crmData, crmResponse: result },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`📤 CRM export failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // =========================================================================
    // DOCUSEAL E-SIGNATURE ACTIONS
    // =========================================================================

    // Create DocuSeal Submission (Send Contract for Signing)
    this.registerActionHandler({
      type: 'create_docuseal_submission' as AutomationActionType,
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          if (!docuSealService.isReady()) {
            throw new Error('DocuSeal service not configured');
          }

          const { templateId, sendEmail = true, expireInDays = 7 } = action.config;
          const deal = context.deal;

          if (!deal) {
            throw new Error('Deal context required for DocuSeal submission');
          }

          // Extract deal data for contract
          const dealData = {
            propertyAddress: deal.address?.street || '',
            city: deal.address?.city || '',
            state: deal.address?.state || '',
            zip: deal.address?.zip || '',
            purchasePrice: deal.askingPrice || 0,
            sellerName: deal.wholesalerName || 'Seller',
            sellerEmail: deal.wholesalerEmail || '',
            closingDate: action.config.closingDate ? new Date(action.config.closingDate) : undefined,
          };

          if (!dealData.sellerEmail) {
            throw new Error('Seller email required for DocuSeal submission');
          }

          const submission = await docuSealService.createDealSubmission(templateId, dealData, {
            sendEmail,
            expireInDays,
            metadata: {
              dealId: deal.externalId,
              automationId: context.automation.id,
              pipelineId: context.variables.pipelineId,
            },
          });

          console.log(`📝 DocuSeal submission created: ${submission.id} for deal ${deal.externalId}`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: {
              submissionId: submission.id,
              status: submission.status,
              submitters: submission.submitters.map(s => ({
                email: s.email,
                role: s.role,
                status: s.status,
                embedUrl: s.embed_src,
              })),
              dealId: deal.externalId,
            },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Get DocuSeal Submission Status
    this.registerActionHandler({
      type: 'get_docuseal_status' as AutomationActionType,
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          if (!docuSealService.isReady()) {
            throw new Error('DocuSeal service not configured');
          }

          const { submissionId } = action.config;

          if (!submissionId) {
            throw new Error('submissionId required');
          }

          const submission = await docuSealService.getSubmission(submissionId);

          console.log(`📋 DocuSeal status for ${submissionId}: ${submission.status}`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: {
              submissionId: submission.id,
              status: submission.status,
              completedAt: submission.completed_at,
              submitters: submission.submitters.map(s => ({
                email: s.email,
                role: s.role,
                status: s.status,
                completedAt: s.completed_at,
              })),
            },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Download Signed Documents
    this.registerActionHandler({
      type: 'download_docuseal_documents' as AutomationActionType,
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          if (!docuSealService.isReady()) {
            throw new Error('DocuSeal service not configured');
          }

          const { submissionId } = action.config;

          if (!submissionId) {
            throw new Error('submissionId required');
          }

          const documents = await docuSealService.getSubmissionDocuments(submissionId);

          console.log(`📄 Retrieved ${documents.length} signed documents for submission ${submissionId}`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: {
              submissionId,
              documents: documents.map(d => ({
                name: d.name,
                url: d.url,
              })),
              count: documents.length,
            },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // Resend DocuSeal Signing Request
    this.registerActionHandler({
      type: 'resend_docuseal_email' as AutomationActionType,
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          if (!docuSealService.isReady()) {
            throw new Error('DocuSeal service not configured');
          }

          const { submitterId } = action.config;

          if (!submitterId) {
            throw new Error('submitterId required');
          }

          const submitter = await docuSealService.resendEmail(submitterId);

          console.log(`📧 Resent DocuSeal signing request to ${submitter.email}`);

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: {
              submitterId: submitter.id,
              email: submitter.email,
              status: submitter.status,
              resentAt: new Date().toISOString(),
            },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // =========================================================================
    // STATE-SPECIFIC DOCUMENT AUTOMATION
    // =========================================================================

    // Send Document Action (auto-sends state-specific compliance documents)
    this.registerActionHandler({
      type: 'send_document' as AutomationActionType,
      execute: async (action, context) => {
        const startTime = Date.now();
        try {
          if (!docuSealService.isReady()) {
            throw new Error('DocuSeal service not configured');
          }

          const { category, templateId, signerEmail, signerName, additionalFields } = action.config;
          const deal = context.deal;
          const dealId = context.event.metadata.dealId || deal?.externalId;

          if (!dealId && !templateId) {
            throw new Error('Either dealId or templateId required');
          }

          // Find property (by id or externalId)
          let property: any = null;
          if (dealId) {
            property = await this.findPropertyByIdOrExternalId(dealId);
          }

          if (!property && !templateId) {
            throw new Error(`Property not found: ${dealId}`);
          }

          // Get state from property or deal
          const state = property?.state || deal?.address?.state;
          if (!state && !templateId) {
            throw new Error('Property state required to determine document template');
          }

          // Import StateDocumentTemplate model
          const { default: StateDocumentTemplate } = await import('../../models/StateDocumentTemplate');

          // Find the appropriate template
          let template: any = null;
          if (templateId) {
            template = await StateDocumentTemplate.findByPk(templateId);
          } else if (category && state) {
            template = await StateDocumentTemplate.findOne({
              where: {
                state,
                category,
                enabled: true,
              },
            });
          }

          if (!template) {
            throw new Error(`No template found for state ${state}, category ${category}`);
          }

          // Build field values from property data
          const fieldValues = this.buildDocumentFields(property, template.fieldMappings, additionalFields);

          // Determine signer
          const recipientEmail = signerEmail || property?.wholesalerEmail || property?.llcOwnerEmail || deal?.wholesalerEmail;
          const recipientName = signerName || property?.wholesalerLlcName || property?.llcOwnerName || deal?.wholesalerName || 'Signer';

          if (!recipientEmail) {
            throw new Error('No signer email found');
          }

          // Create DocuSeal submission
          const submission = await docuSealService.createSubmission({
            templateId: template.docusealTemplateId,
            submitters: [
              {
                email: recipientEmail,
                name: recipientName,
                role: 'Signer',
                fields: fieldValues,
              },
            ],
            sendEmail: true,
          });

          console.log(`📄 Document sent: ${template.name} to ${recipientEmail} (submission: ${submission.id})`);

          // Update property documentStatus
          if (property) {
            const currentStatus = property.documentStatus || {};
            currentStatus[category || template.category] = {
              status: 'sent',
              submissionId: submission.id,
              sentAt: new Date().toISOString(),
              templateId: template.id,
              templateName: template.name,
              signers: [{
                email: recipientEmail,
                status: 'pending',
              }],
            };

            await property.update({ documentStatus: currentStatus });
          }

          // Store in context
          context.variables.documentSubmission = {
            submissionId: submission.id,
            templateId: template.id,
            templateName: template.name,
            category: template.category,
            recipientEmail,
            state,
          };

          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: {
              submissionId: submission.id,
              templateId: template.id,
              templateName: template.name,
              category: template.category,
              recipientEmail,
              state,
              dealId,
            },
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          console.error(`📄 Send document failed:`, error);
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          };
        }
      },
    });

    // ========================================================================
    // CONDITIONAL BRANCHING ACTION
    // ========================================================================

    /**
     * Conditional action handler - enables IF/ELSE IF/ELSE branching
     *
     * Config structure:
     * {
     *   branches: [
     *     { name: "high-score", conditions: [...], actions: [...] },
     *     { name: "medium-score", conditions: [...], actions: [...] },
     *     { name: "else", conditions: [], actions: [...] }  // Empty conditions = ELSE
     *   ]
     * }
     */
    this.registerActionHandler({
      type: 'conditional' as AutomationActionType,
      execute: async (action, context) => {
        const startTime = Date.now();
        const { branches } = action.config;

        if (!branches || !Array.isArray(branches) || branches.length === 0) {
          return {
            actionId: action.id,
            actionType: action.type,
            success: false,
            error: 'No branches defined in conditional action',
            durationMs: Date.now() - startTime,
          };
        }

        // Find first matching branch
        let matchedBranch: any = null;
        let branchIndex = -1;

        for (let i = 0; i < branches.length; i++) {
          const branch = branches[i];

          // Empty conditions = ELSE branch (always matches)
          if (!branch.conditions || branch.conditions.length === 0) {
            matchedBranch = branch;
            branchIndex = i;
            console.log(`🔀 Conditional: matched ELSE branch "${branch.name || `branch_${i}`}"`);
            break;
          }

          // Evaluate branch conditions using existing evaluateConditions
          if (this.evaluateConditions(branch.conditions, context)) {
            matchedBranch = branch;
            branchIndex = i;
            console.log(`🔀 Conditional: matched branch "${branch.name || `branch_${i}`}"`);
            break;
          }
        }

        // No branch matched
        if (!matchedBranch) {
          console.log(`🔀 Conditional: no branch matched, skipping`);
          return {
            actionId: action.id,
            actionType: action.type,
            success: true,
            result: { matched: false, message: 'No branch conditions matched' },
            durationMs: Date.now() - startTime,
          };
        }

        // Execute matched branch actions
        const branchResults: ActionExecutionResult[] = [];
        const branchActions = matchedBranch.actions || [];

        // Sort branch actions by order
        const sortedBranchActions = [...branchActions].sort(
          (a: AutomationAction, b: AutomationAction) => (a.order || 0) - (b.order || 0)
        );

        for (const branchAction of sortedBranchActions) {
          const handler = this.actionHandlers.get(branchAction.type);

          if (!handler) {
            console.warn(`🔀 Conditional: no handler for action type: ${branchAction.type}`);
            continue;
          }

          // Update context with results so far (including branch results)
          context.previousResults = [...context.previousResults, ...branchResults];

          try {
            const result = await handler.execute(branchAction, context);
            branchResults.push(result);

            // Stop on failure unless continueOnError is set
            if (!result.success && !branchAction.continueOnError) {
              console.log(`🔀 Conditional: branch action "${branchAction.type}" failed, stopping branch`);
              break;
            }
          } catch (error) {
            const errorResult: ActionExecutionResult = {
              actionId: branchAction.id,
              actionType: branchAction.type,
              success: false,
              error: error instanceof Error ? error.message : String(error),
              durationMs: 0,
            };
            branchResults.push(errorResult);

            if (!branchAction.continueOnError) {
              break;
            }
          }
        }

        // Determine overall success
        const allSuccess = branchResults.length === 0 || branchResults.every(r => r.success);
        const someSuccess = branchResults.some(r => r.success);

        return {
          actionId: action.id,
          actionType: action.type,
          success: allSuccess,
          result: {
            matchedBranch: matchedBranch.name || `branch_${branchIndex}`,
            branchIndex,
            actionsExecuted: branchResults.length,
            actionsSucceeded: branchResults.filter(r => r.success).length,
            actionsFailed: branchResults.filter(r => !r.success).length,
            branchResults,
          },
          durationMs: Date.now() - startTime,
        };
      },
    });
  }

  /**
   * Build document fields from property data using field mappings
   */
  private buildDocumentFields(
    property: any,
    fieldMappings: Record<string, string> = {},
    additionalFields: Record<string, any> = {}
  ): Array<{ name: string; default_value: string }> {
    // Default field mappings (property field -> DocuSeal field)
    const defaultMappings: Record<string, string> = {
      // Address fields
      property_address: '_full_address',
      property_street: 'address.houseNumber+address.street',
      city: 'city',
      state: 'state',
      zip: 'zip',
      county: 'county',
      full_address: '_full_address',

      // Financial fields
      purchase_price: 'purchaseContractPrice',
      asking_price: 'reservePrice',
      arv: 'arv',
      rehab_cost: 'rehabCost',
      renovation_budget: 'renovationBudget',
      earnest_money: '_earnest_money',
      assignment_fee: '_assignment_fee',

      // Seller/Wholesaler fields
      seller_name: 'wholesalerLlcName',
      seller_company: 'wholesalerLlcName',
      seller_email: 'llcOwnerEmail',
      seller_address: 'llcBusinessAddress',
      owner_name: 'llcOwnerName',

      // Property details
      bedrooms: 'bedroomCount',
      bathrooms: 'bathroomCount',
      sqft: 'livingSpaceSqFt',
      lot_size: 'lotSizeSqFt',
      year_built: 'yearBuilt',
      property_type: 'propertyType',

      // Agent fields
      agent_name: '_agent_full_name',
      agent_email: 'agentEmail',
      agent_phone: 'agentPhoneNumber',
      agent_license: 'agentLicenseNumber',

      // Dates
      contract_date: '_today',
      closing_date: '_closing_date',
      expiration_date: 'purchaseContractExpiration',

      // Occupancy
      occupancy_status: 'occupancyStatus',
      monthly_rent: 'monthlyRent',
    };

    // Merge with custom mappings
    const allMappings = { ...defaultMappings, ...fieldMappings };

    const fields: Array<{ name: string; default_value: string }> = [];

    for (const [docusealField, propertyPath] of Object.entries(allMappings)) {
      let value: any;

      // Handle special computed fields
      if (propertyPath.startsWith('_')) {
        value = this.getComputedFieldValue(propertyPath, property);
      } else if (propertyPath.includes('+')) {
        // Concatenation
        const parts = propertyPath.split('+');
        value = parts.map(p => this.getValueByPath(property, p.trim())).filter(Boolean).join(' ');
      } else {
        value = this.getValueByPath(property, propertyPath);
      }

      if (value !== undefined && value !== null && value !== '') {
        fields.push({
          name: docusealField,
          default_value: String(value),
        });
      }
    }

    // Add additional fields
    for (const [name, value] of Object.entries(additionalFields)) {
      if (value !== undefined && value !== null) {
        fields.push({
          name,
          default_value: String(value),
        });
      }
    }

    return fields;
  }

  /**
   * Get computed field values
   */
  private getComputedFieldValue(fieldName: string, property: any): string | undefined {
    switch (fieldName) {
      case '_full_address':
        const addr = property?.address || {};
        return `${addr.houseNumber || ''} ${addr.street || ''}, ${property?.city || ''}, ${property?.state || ''} ${property?.zip || ''}`.trim();

      case '_agent_full_name':
        return [property?.agentFirstName, property?.agentLastName].filter(Boolean).join(' ') || undefined;

      case '_today':
        return new Date().toLocaleDateString('en-US');

      case '_closing_date':
        // Default to 30 days from now
        const closing = new Date();
        closing.setDate(closing.getDate() + 30);
        return closing.toLocaleDateString('en-US');

      case '_earnest_money':
        const price = property?.purchaseContractPrice || property?.reservePrice || 0;
        return price > 0 ? String(Math.min(price * 0.01, 5000)) : undefined;

      case '_assignment_fee':
        // Default $5000 assignment fee
        return '5000';

      default:
        return undefined;
    }
  }

  /**
   * Process template strings with variable substitution
   */
  private processTemplate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const value = this.getValueByPath(variables, path);
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Generate HTML email from template name
   */
  private generateEmailFromTemplate(template: string, variables: Record<string, any>): string {
    const deal = variables.deal;

    const templates: Record<string, string> = {
      'new_deal': `
        <h2>New Deal Available</h2>
        <p><strong>Property:</strong> ${deal?.address?.street || 'N/A'}, ${deal?.city || 'N/A'}, ${deal?.state || 'N/A'} ${deal?.zip || ''}</p>
        <p><strong>Asking Price:</strong> $${deal?.askingPrice?.toLocaleString() || 'N/A'}</p>
        <p><strong>ARV:</strong> $${deal?.arv?.toLocaleString() || 'N/A'}</p>
        <p><strong>Beds/Baths:</strong> ${deal?.bedrooms || 'N/A'} / ${deal?.bathrooms || 'N/A'}</p>
        <p><strong>Sq Ft:</strong> ${deal?.sqft?.toLocaleString() || 'N/A'}</p>
        <hr>
        <p>Sent by Dispotree Automation</p>
      `,
      'score_alert': `
        <h2>High Score Deal Alert</h2>
        <p><strong>Property:</strong> ${deal?.address?.street || 'N/A'}, ${deal?.city || 'N/A'}, ${deal?.state || 'N/A'}</p>
        <p><strong>Score:</strong> ${variables.scoringResults?.[0]?.percentage || 'N/A'}%</p>
        <p><strong>Buy Box:</strong> ${variables.scoringResults?.[0]?.buyBoxName || 'N/A'}</p>
        <p><strong>Asking Price:</strong> $${deal?.askingPrice?.toLocaleString() || 'N/A'}</p>
        <hr>
        <p>Sent by Dispotree Automation</p>
      `,
      'offer_submitted': `
        <h2>Offer Letter Generated</h2>
        <p><strong>Property:</strong> ${variables.offerLetter?.propertyAddress || 'N/A'}</p>
        <p><strong>Offer Amount:</strong> $${variables.offerLetter?.offerAmount?.toLocaleString() || 'N/A'}</p>
        <p><strong>Expires:</strong> ${variables.offerLetter?.expiresAt ? new Date(variables.offerLetter.expiresAt).toLocaleDateString() : 'N/A'}</p>
        <hr>
        <p>Sent by Dispotree Automation</p>
      `,
      'compliance_alert': `
        <h2>Compliance Check Results</h2>
        <p><strong>Property:</strong> ${deal?.address?.street || 'N/A'}, ${deal?.city || 'N/A'}, ${deal?.state || 'N/A'}</p>
        <p><strong>Status:</strong> ${variables.complianceResult?.status || 'N/A'}</p>
        <p><strong>Issues:</strong></p>
        <ul>${(variables.complianceResult?.issues || []).map((i: string) => `<li>${i}</li>`).join('')}</ul>
        <hr>
        <p>Sent by Dispotree Automation</p>
      `,
      'standard': `
        <h2>Deal Update</h2>
        <p><strong>Property:</strong> ${deal?.address?.street || 'N/A'}, ${deal?.city || 'N/A'}, ${deal?.state || 'N/A'} ${deal?.zip || ''}</p>
        <p><strong>Asking Price:</strong> $${deal?.askingPrice?.toLocaleString() || 'N/A'}</p>
        <p><strong>ARV:</strong> $${deal?.arv?.toLocaleString() || 'N/A'}</p>
        <hr>
        <p>Sent by Dispotree Automation</p>
      `,
    };

    return templates[template] || templates['standard'];
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  /**
   * Emit a system event
   */
  public async emitEvent(event: SystemEvent): Promise<void> {
    console.log(`📡 Event emitted: ${event.type}`, event.metadata);

    // Find automations triggered by this event
    const triggerType = this.mapEventToTrigger(event.type);
    if (!triggerType) return;

    const automations = this.getAutomationsForTrigger(triggerType);

    for (const automation of automations) {
      // Check if automation can execute (rate limits, cooldowns)
      if (!this.canExecute(automation)) {
        console.log(`⏸️ Automation ${automation.name} skipped (rate limited)`);
        continue;
      }

      // Execute automation
      try {
        await this.executeAutomation(automation, event);
      } catch (error) {
        console.error(`❌ Automation ${automation.name} failed:`, error);
        this.logAudit(automation.id, event.type, 'error', { error: String(error) });
      }
    }

    // Notify event handlers
    for (const handler of this.eventHandlers) {
      const eventTypes = Array.isArray(handler.eventType) ? handler.eventType : [handler.eventType];
      if (eventTypes.includes(event.type)) {
        try {
          await handler.handler(event);
        } catch (error) {
          console.error(`Event handler error:`, error);
        }
      }
    }
  }

  /**
   * Register an event handler
   */
  public onEvent(eventType: EventType | EventType[], handler: (event: SystemEvent) => Promise<void>): void {
    this.eventHandlers.push({ eventType, handler });
  }

  /**
   * Safely emit an event with retry logic (fire-and-forget with reliability)
   * Use this for background event emissions where you don't need to await the result
   * but want reliability through retries and dead letter queue
   */
  public safeEmitEvent(event: SystemEvent, maxRetries: number = 3): void {
    const attemptEmit = async (attempt: number): Promise<void> => {
      try {
        await this.emitEvent(event);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to emit ${event.type} event (attempt ${attempt}/${maxRetries}):`, errorMessage);

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          setTimeout(() => attemptEmit(attempt + 1), delay);
        } else {
          // All retries exhausted, log to dead letter queue
          console.error(`Event ${event.type} failed after ${maxRetries} attempts, logging to dead letter queue`);
          try {
            await DeadLetterQueue.create({
              automationId: 'system-event',
              automationName: 'System Event Emission',
              actionId: event.id,
              actionType: 'emit_event',
              actionConfig: { eventType: event.type },
              context: { event, metadata: event.metadata },
              error: errorMessage,
              attempts: maxRetries,
              firstFailedAt: new Date(),
              lastFailedAt: new Date(),
            });
          } catch (dlqError) {
            console.error('Failed to log to dead letter queue:', dlqError);
          }
        }
      }
    };

    // Start the first attempt without blocking
    attemptEmit(1).catch(err => console.error('Unexpected error in safeEmitEvent:', err));
  }

  // ============================================================================
  // AUTOMATION EXECUTION
  // ============================================================================

  /**
   * Execute an automation
   */
  public async executeAutomation(automation: Automation, event: SystemEvent): Promise<AutomationExecutionResult> {
    const startTime = Date.now();
    const actionsExecuted: ActionExecutionResult[] = [];

    console.log(`🤖 Executing automation: ${automation.name}`);

    try {
      // Extract deal from event if available
      const deal = event.payload.deal as NormalizedDeal | undefined;

      // Create execution context
      const context: ActionContext = {
        event,
        deal,
        automation,
        previousResults: [],
        variables: {
          ...event.payload,
          eventType: event.type,
          timestamp: event.timestamp,
        },
      };

      // Evaluate conditions
      if (automation.conditions.length > 0) {
        const conditionsMet = this.evaluateConditions(automation.conditions, context);
        if (!conditionsMet) {
          console.log(`⏭️ Automation ${automation.name} conditions not met, skipping`);
          this.logAudit(automation.id, event.type, 'skipped', { reason: 'conditions not met' });

          const skippedResult: AutomationExecutionResult = {
            automationId: automation.id,
            triggerId: event.id,
            success: true,
            startedAt: new Date(startTime),
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            actionsExecuted: [],
          };

          // Persist skipped execution to database
          this.persistExecution(automation, event, skippedResult, 'event').catch(err => {
            console.error(`[AutomationEngine] Failed to persist skipped execution:`, err);
          });

          return skippedResult;
        }
      }

      // Sort actions by order
      const sortedActions = [...automation.actions].sort((a, b) => a.order - b.order);

      // Execute actions sequentially
      for (const action of sortedActions) {
        const handler = this.actionHandlers.get(action.type);

        if (!handler) {
          console.warn(`No handler for action type: ${action.type}`);
          continue;
        }

        context.previousResults = [...actionsExecuted];

        const result = await handler.execute(action, context);
        actionsExecuted.push(result);

        // Queue failed actions for retry
        if (!result.success) {
          this.addToRetryQueue(
            automation.id,
            action,
            context,
            result.error || 'Unknown error',
            1
          );

          // Stop execution if continueOnError is false
          if (!action.continueOnError) {
            console.error(`❌ Action ${action.type} failed, stopping automation`);
            break;
          }
        }
      }

      // Update automation stats
      this.recordExecution(automation.id);
      automation.lastExecutedAt = new Date();
      automation.executionCount = (automation.executionCount || 0) + 1;

      // Persist stats to database (fire and forget, but log errors)
      this.updateExecutionStats(automation.id).catch(err => {
        console.error(`[AutomationEngine] Failed to update execution stats for ${automation.id}:`, err);
      });

      const success = actionsExecuted.every((r) => r.success);
      this.logAudit(automation.id, event.type, success ? 'success' : 'partial', {
        actionsExecuted: actionsExecuted.length,
        actionsFailed: actionsExecuted.filter((r) => !r.success).length,
      });

      const executionResult: AutomationExecutionResult = {
        automationId: automation.id,
        triggerId: event.id,
        success,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        actionsExecuted,
      };

      // Persist execution to database for analytics
      const triggeredBy: TriggeredBy = event.type === 'automation.triggered' ? 'manual' : 'event';
      this.persistExecution(automation, event, executionResult, triggeredBy).catch(err => {
        console.error(`[AutomationEngine] Failed to persist execution for ${automation.id}:`, err);
      });

      // Log activity feed
      activityFeedService.createActivity({
        eventType: 'system_event',
        actor: {
          type: 'automation',
          id: automation.id,
          name: automation.name,
        },
        resource: {
          type: 'system',
          id: automation.id,
          name: automation.name,
        },
        action: success ? 'completed' : 'partially failed',
        summary: `Automation "${automation.name}" ${success ? 'executed successfully' : 'partially failed'}`,
        details: {
          trigger: event.type,
          actionsExecuted: actionsExecuted.length,
          actionsFailed: actionsExecuted.filter((r) => !r.success).length,
          durationMs: executionResult.durationMs,
        },
        importance: success ? 'low' : 'high',
      }).catch(() => {}); // Non-blocking

      return executionResult;
    } catch (error) {
      this.logAudit(automation.id, event.type, 'error', { error: String(error) });

      const errorResult: AutomationExecutionResult = {
        automationId: automation.id,
        triggerId: event.id,
        success: false,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        actionsExecuted,
        error: error instanceof Error ? error.message : String(error),
      };

      // Persist failed execution to database
      this.persistExecution(automation, event, errorResult, 'event').catch(err => {
        console.error(`[AutomationEngine] Failed to persist error execution for ${automation.id}:`, err);
      });

      // Log activity feed for error
      activityFeedService.createActivity({
        eventType: 'system_event',
        actor: {
          type: 'automation',
          id: automation.id,
          name: automation.name,
        },
        resource: {
          type: 'system',
          id: automation.id,
          name: automation.name,
        },
        action: 'failed',
        summary: `Automation "${automation.name}" failed: ${errorResult.error}`,
        details: {
          trigger: event.type,
          error: errorResult.error,
        },
        importance: 'critical',
      }).catch(() => {}); // Non-blocking

      return errorResult;
    }
  }

  /**
   * Manually trigger an automation
   */
  public async triggerAutomation(automationId: string, payload: Record<string, any> = {}): Promise<AutomationExecutionResult> {
    const automation = this.automations.get(automationId);
    if (!automation) {
      throw new Error(`Automation not found: ${automationId}`);
    }

    const event: SystemEvent = {
      id: `manual-${Date.now()}`,
      type: 'automation.triggered',
      timestamp: new Date(),
      payload,
      metadata: {
        automationId,
      },
    };

    return this.executeAutomation(automation, event);
  }

  // ============================================================================
  // CONDITION EVALUATION
  // ============================================================================

  private evaluateConditions(conditions: AutomationCondition[], context: ActionContext): boolean {
    if (conditions.length === 0) return true;

    let result = true;
    let currentOperator: 'and' | 'or' = 'and';

    for (const condition of conditions) {
      const conditionResult = this.evaluateCondition(condition, context);

      if (currentOperator === 'and') {
        result = result && conditionResult;
      } else {
        result = result || conditionResult;
      }

      currentOperator = condition.logicalOperator || 'and';
    }

    return result;
  }

  private evaluateCondition(condition: AutomationCondition, context: ActionContext): boolean {
    const value = this.getValueByPath(context.variables, condition.field) ?? this.getValueByPath(context.deal || {}, condition.field);

    return this.evaluateOperator(value, condition.operator, condition.value);
  }

  private evaluateOperator(value: any, operator: CriterionOperator, target: any): boolean {
    switch (operator) {
      case 'equals':
        return value === target;
      case 'not_equals':
        return value !== target;
      case 'greater_than':
        return Number(value) > Number(target);
      case 'less_than':
        return Number(value) < Number(target);
      case 'greater_or_equal':
        return Number(value) >= Number(target);
      case 'less_or_equal':
        return Number(value) <= Number(target);
      case 'contains':
        return String(value).toLowerCase().includes(String(target).toLowerCase());
      case 'not_contains':
        return !String(value).toLowerCase().includes(String(target).toLowerCase());
      case 'in':
        return Array.isArray(target) && target.includes(value);
      case 'not_in':
        return Array.isArray(target) && !target.includes(value);
      case 'regex':
        try {
          // Limit regex pattern length to prevent ReDoS
          const pattern = String(target);
          if (pattern.length > 500) {
            console.warn('[AutomationEngine] Regex pattern too long, skipping');
            return false;
          }
          return new RegExp(pattern).test(String(value));
        } catch (regexError) {
          console.warn('[AutomationEngine] Invalid regex pattern:', regexError);
          return false;
        }
      case 'exists':
        return value !== undefined && value !== null;
      case 'not_exists':
        return value === undefined || value === null;
      default:
        return false;
    }
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  private canExecute(automation: Automation): boolean {
    const history = this.executionHistory.get(automation.id) || [];
    const now = Date.now();

    // Check cooldown
    if (automation.cooldown && history.length > 0) {
      const lastExecution = history[history.length - 1].getTime();
      if (now - lastExecution < automation.cooldown) {
        return false;
      }
    }

    // Check max executions per hour
    if (automation.maxExecutionsPerHour) {
      const oneHourAgo = now - 60 * 60 * 1000;
      const recentExecutions = history.filter((d) => d.getTime() > oneHourAgo);
      if (recentExecutions.length >= automation.maxExecutionsPerHour) {
        return false;
      }
    }

    return true;
  }

  private recordExecution(automationId: string): void {
    let history = this.executionHistory.get(automationId) || [];
    history.push(new Date());

    // Keep only last 1000 executions
    if (history.length > 1000) {
      history = history.slice(-1000);
    }

    this.executionHistory.set(automationId, history);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private mapEventToTrigger(eventType: EventType): AutomationTriggerType | null {
    const mapping: Record<EventType, AutomationTriggerType> = {
      'deal.received': 'deal_received',
      'deal.normalized': 'deal_received',
      'deal.created': 'deal_received',
      'deal.processing_started': 'deal_received',
      'deal.updated': 'deal_updated',
      'deal.deleted': 'deal_updated',
      'deal.enriched': 'deal_enriched',
      'deal.analyzed': 'deal_analyzed',
      'deal.scored': 'deal_scored',
      'deal.scoring_completed': 'deal_scored',
      'deal.matched': 'deal_matched',
      'deal.submitted': 'deal_matched',
      'deal.ready': 'deal_matched',
      'deal.approved': 'pipeline_stage_changed',
      'deal.rejected': 'pipeline_stage_changed',
      'deal.blocked': 'pipeline_stage_changed',
      'deal.compliance_completed': 'compliance_checked',
      'compliance.started': 'compliance_checked',
      'compliance.completed': 'compliance_checked',
      'source.synced': 'deal_received',
      'source.error': 'deal_received',
      'automation.triggered': 'manual',
      'automation.completed': 'manual',
      'automation.error': 'manual',
      // New event mappings
      'deal.price_dropped': 'price_dropped',
      'deal.stale': 'deal_stale',
      'offer.received': 'offer_received',
      'offer.accepted': 'offer_accepted',
      'offer.rejected': 'offer_rejected',
      'pipeline.stage_changed': 'pipeline_stage_changed',
      'buybox.threshold_met': 'buybox_threshold_met',
      'market.comps_updated': 'market_comps_updated',
      'schedule.daily': 'schedule_daily',
      'schedule.weekly': 'schedule_weekly',
    };

    return mapping[eventType] || null;
  }

  private getValueByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value && value[part] !== undefined) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  private interpolateVariables(template: any, context: ActionContext): any {
    if (typeof template === 'string') {
      return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const value = this.getValueByPath(context.variables, path.trim()) ?? this.getValueByPath(context.deal || {}, path.trim());
        return value !== undefined ? String(value) : match;
      });
    }

    if (Array.isArray(template)) {
      return template.map((item) => this.interpolateVariables(item, context));
    }

    if (typeof template === 'object' && template !== null) {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(template)) {
        result[key] = this.interpolateVariables(value, context);
      }
      return result;
    }

    return template;
  }

  private logAudit(automationId: string, event: string, result: string, details?: any): void {
    this.auditLog.push({
      timestamp: new Date(),
      automationId,
      event,
      result,
      details,
    });

    // Keep only last 10000 entries
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }
  }

  /**
   * Get audit log
   */
  public getAuditLog(automationId?: string, limit: number = 100): typeof this.auditLog {
    let log = this.auditLog;
    if (automationId) {
      log = log.filter((entry) => entry.automationId === automationId);
    }
    return log.slice(-limit);
  }

  // ============================================================================
  // EXECUTION ANALYTICS
  // ============================================================================

  /**
   * Get execution history from database with filtering
   */
  public async getExecutionHistory(options: {
    automationId?: string;
    status?: ExecutionStatus;
    triggeredBy?: TriggeredBy;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ executions: any[]; total: number }> {
    const { Op } = await import('sequelize');
    const { automationId, status, triggeredBy, startDate, endDate, limit = 50, offset = 0 } = options;

    const where: any = {};

    if (automationId) {
      where.automationId = automationId;
    }

    if (status) {
      where.status = status;
    }

    if (triggeredBy) {
      where.triggeredBy = triggeredBy;
    }

    if (startDate || endDate) {
      where.executedAt = {};
      if (startDate) where.executedAt[Op.gte] = startDate;
      if (endDate) where.executedAt[Op.lte] = endDate;
    }

    const { count, rows } = await AutomationExecution.findAndCountAll({
      where,
      order: [['executedAt', 'DESC']],
      limit: Math.min(limit, 200),
      offset,
    });

    return { executions: rows, total: count };
  }

  /**
   * Get aggregated execution statistics
   */
  public async getExecutionStats(options: {
    automationId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    totalExecutions: number;
    successCount: number;
    failedCount: number;
    partialCount: number;
    skippedCount: number;
    successRate: number;
    avgDuration: number;
    totalActions: number;
    failedActions: number;
    byAutomation: Array<{
      automationId: string;
      automationName: string;
      executions: number;
      successRate: number;
      avgDuration: number;
    }>;
    byEventType: Record<string, number>;
    recentFailures: Array<{
      automationId: string;
      automationName: string;
      error: string;
      executedAt: Date;
    }>;
  }> {
    const { Op, fn, col, literal } = await import('sequelize');
    const { automationId, startDate, endDate } = options;

    const where: any = {};

    if (automationId) {
      where.automationId = automationId;
    }

    if (startDate || endDate) {
      where.executedAt = {};
      if (startDate) where.executedAt[Op.gte] = startDate;
      if (endDate) where.executedAt[Op.lte] = endDate;
    }

    // Get overall stats
    const executions = await AutomationExecution.findAll({ where });

    const totalExecutions = executions.length;
    const successCount = executions.filter(e => e.status === 'success').length;
    const failedCount = executions.filter(e => e.status === 'failed').length;
    const partialCount = executions.filter(e => e.status === 'partial').length;
    const skippedCount = executions.filter(e => e.status === 'skipped').length;
    const successRate = totalExecutions > 0 ? (successCount / totalExecutions) * 100 : 0;
    const avgDuration = totalExecutions > 0
      ? executions.reduce((sum, e) => sum + e.duration, 0) / totalExecutions
      : 0;
    const totalActions = executions.reduce((sum, e) => sum + e.actionsExecuted, 0);
    const failedActions = executions.reduce((sum, e) => sum + e.actionsFailed, 0);

    // Group by automation
    const automationStats = new Map<string, {
      automationId: string;
      automationName: string;
      executions: number;
      successes: number;
      totalDuration: number;
    }>();

    for (const exec of executions) {
      const key = exec.automationId;
      if (!automationStats.has(key)) {
        automationStats.set(key, {
          automationId: exec.automationId,
          automationName: exec.automationName,
          executions: 0,
          successes: 0,
          totalDuration: 0,
        });
      }
      const stats = automationStats.get(key)!;
      stats.executions++;
      if (exec.status === 'success') stats.successes++;
      stats.totalDuration += exec.duration;
    }

    const byAutomation = Array.from(automationStats.values()).map(s => ({
      automationId: s.automationId,
      automationName: s.automationName,
      executions: s.executions,
      successRate: s.executions > 0 ? (s.successes / s.executions) * 100 : 0,
      avgDuration: s.executions > 0 ? s.totalDuration / s.executions : 0,
    })).sort((a, b) => b.executions - a.executions);

    // Group by event type
    const byEventType: Record<string, number> = {};
    for (const exec of executions) {
      byEventType[exec.eventType] = (byEventType[exec.eventType] || 0) + 1;
    }

    // Get recent failures
    const recentFailures = executions
      .filter(e => e.status === 'failed' || e.status === 'partial')
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
      .slice(0, 10)
      .map(e => ({
        automationId: e.automationId,
        automationName: e.automationName,
        error: e.error || 'Unknown error',
        executedAt: e.executedAt,
      }));

    return {
      totalExecutions,
      successCount,
      failedCount,
      partialCount,
      skippedCount,
      successRate: Math.round(successRate * 100) / 100,
      avgDuration: Math.round(avgDuration),
      totalActions,
      failedActions,
      byAutomation,
      byEventType,
      recentFailures,
    };
  }

  /**
   * Clean up old execution records
   */
  public async cleanupOldExecutions(retentionDays: number = 30): Promise<number> {
    const { Op } = await import('sequelize');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleted = await AutomationExecution.destroy({
      where: {
        executedAt: { [Op.lt]: cutoffDate },
      },
    });

    console.log(`🧹 Cleaned up ${deleted} old automation executions (older than ${retentionDays} days)`);
    return deleted;
  }
}

// Export singleton instance
export const automationEngine = new AutomationEngine();
export default automationEngine;
