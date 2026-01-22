/**
 * Webhook Service
 *
 * Manages webhook subscriptions, delivery, and retry logic.
 * Provides a unified interface for sending webhook events across the platform.
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import {
  Webhook,
  WebhookDelivery,
  WebhookEventType,
  ALL_EVENT_TYPES,
  EVENT_CATEGORIES,
} from '../models/Webhook';

// =============================================================================
// TYPES
// =============================================================================

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: Date;
  source: string;
  resourceType: 'deal' | 'offer' | 'compliance' | 'system' | 'agent';
  resourceId: string | number;
  userId?: string;
  organizationId?: string;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface WebhookDeliveryResult {
  webhookId: string;
  eventId: string;
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  retryCount: number;
  deliveredAt: Date;
}

export interface WebhookStats {
  totalEvents: number;
  deliveredEvents: number;
  failedEvents: number;
  pendingRetries: number;
  activeWebhooks: number;
  lastEventAt: Date | null;
}

// =============================================================================
// WEBHOOK SERVICE
// =============================================================================

class WebhookService extends EventEmitter {
  private deliveryQueue: Array<{
    event: WebhookEvent;
    webhook: Webhook;
    retryCount: number;
  }> = [];
  private processing: boolean = false;
  private stats: WebhookStats;
  private maxRetries: number = 3;
  private retryDelays: number[] = [1000, 5000, 30000]; // 1s, 5s, 30s
  private deliveryProcessorIntervalId: NodeJS.Timeout | null = null;
  private retryProcessorIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(100);

    this.stats = {
      totalEvents: 0,
      deliveredEvents: 0,
      failedEvents: 0,
      pendingRetries: 0,
      activeWebhooks: 0,
      lastEventAt: null,
    };

    // Start processors
    this.startDeliveryProcessor();
    this.startRetryProcessor();

    console.log('✅ WebhookService initialized');
  }

  // =============================================================================
  // EVENT EMISSION
  // =============================================================================

  /**
   * Dispatch a webhook event to all matching subscribers
   */
  async dispatchEvent(event: WebhookEvent): Promise<void> {
    // Update stats
    this.stats.totalEvents++;
    this.stats.lastEventAt = new Date();

    // Emit to internal listeners
    super.emit(event.type, event);
    super.emit('*', event);

    // Queue webhook deliveries
    await this.queueDeliveries(event);

    console.log(`📡 Webhook Event: ${event.type} (${event.resourceType}:${event.resourceId})`);
  }

  /**
   * Emit a deal event
   */
  async emitDealEvent(
    type: WebhookEventType,
    dealId: number | string,
    data: Record<string, any>,
    options?: { userId?: string; organizationId?: string }
  ): Promise<void> {
    const event: WebhookEvent = {
      id: this.generateEventId(),
      type,
      timestamp: new Date(),
      source: 'system',
      resourceType: 'deal',
      resourceId: dealId,
      userId: options?.userId,
      organizationId: options?.organizationId,
      data,
    };

    await this.dispatchEvent(event);
  }

  /**
   * Emit an offer event
   */
  async emitOfferEvent(
    type: WebhookEventType,
    offerId: number | string,
    data: Record<string, any>,
    options?: { userId?: string; organizationId?: string; dealId?: number }
  ): Promise<void> {
    const event: WebhookEvent = {
      id: this.generateEventId(),
      type,
      timestamp: new Date(),
      source: 'system',
      resourceType: 'offer',
      resourceId: offerId,
      userId: options?.userId,
      organizationId: options?.organizationId,
      data: {
        ...data,
        dealId: options?.dealId,
      },
    };

    await this.dispatchEvent(event);
  }

  /**
   * Emit a compliance event
   */
  async emitComplianceEvent(
    type: WebhookEventType,
    resourceId: number | string,
    data: Record<string, any>,
    options?: { userId?: string; organizationId?: string }
  ): Promise<void> {
    const event: WebhookEvent = {
      id: this.generateEventId(),
      type,
      timestamp: new Date(),
      source: 'system',
      resourceType: 'compliance',
      resourceId,
      userId: options?.userId,
      organizationId: options?.organizationId,
      data,
    };

    await this.dispatchEvent(event);
  }

  // =============================================================================
  // WEBHOOK MANAGEMENT
  // =============================================================================

  /**
   * Create a new webhook subscription
   */
  async createWebhook(params: {
    userId: string;
    organizationId?: string;
    name: string;
    description?: string;
    url: string;
    events: WebhookEventType[];
    headers?: Record<string, string>;
    retryEnabled?: boolean;
    maxRetries?: number;
    timeoutMs?: number;
  }): Promise<Webhook> {
    const webhook = await Webhook.create({
      userId: params.userId,
      organizationId: params.organizationId,
      name: params.name,
      description: params.description,
      url: params.url,
      secret: Webhook.generateSecret(),
      events: params.events,
      headers: params.headers,
      retryEnabled: params.retryEnabled ?? true,
      maxRetries: params.maxRetries ?? 3,
      timeoutMs: params.timeoutMs ?? 30000,
    });

    console.log(`📡 Webhook created: ${webhook.id} -> ${params.url}`);
    return webhook;
  }

  /**
   * Update a webhook
   */
  async updateWebhook(
    webhookId: string,
    userId: string,
    updates: {
      name?: string;
      description?: string;
      url?: string;
      events?: WebhookEventType[];
      headers?: Record<string, string>;
      active?: boolean;
      retryEnabled?: boolean;
      maxRetries?: number;
      timeoutMs?: number;
    }
  ): Promise<Webhook | null> {
    const webhook = await Webhook.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) return null;

    // Apply updates
    if (updates.name !== undefined) webhook.name = updates.name;
    if (updates.description !== undefined) webhook.description = updates.description;
    if (updates.url !== undefined) webhook.url = updates.url;
    if (updates.events !== undefined) webhook.events = updates.events;
    if (updates.headers !== undefined) webhook.headers = updates.headers;
    if (updates.active !== undefined) webhook.active = updates.active;
    if (updates.retryEnabled !== undefined) webhook.retryEnabled = updates.retryEnabled;
    if (updates.maxRetries !== undefined) webhook.maxRetries = updates.maxRetries;
    if (updates.timeoutMs !== undefined) webhook.timeoutMs = updates.timeoutMs;

    await webhook.save();
    return webhook;
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string, userId: string): Promise<boolean> {
    const result = await Webhook.destroy({
      where: { id: webhookId, userId },
    });
    return result > 0;
  }

  /**
   * Get a webhook by ID
   */
  async getWebhook(webhookId: string, userId: string): Promise<Webhook | null> {
    return Webhook.findOne({
      where: { id: webhookId, userId },
    });
  }

  /**
   * List user's webhooks
   */
  async listWebhooks(
    userId: string,
    options?: { includeInactive?: boolean }
  ): Promise<Webhook[]> {
    return Webhook.getByUser(userId, options);
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateSecret(webhookId: string, userId: string): Promise<string | null> {
    const webhook = await Webhook.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) return null;
    return webhook.regenerateSecret();
  }

  /**
   * Reset webhook failures and re-enable
   */
  async resetWebhook(webhookId: string, userId: string): Promise<Webhook | null> {
    const webhook = await Webhook.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) return null;
    await webhook.resetFailures();
    return webhook;
  }

  /**
   * Test webhook by sending a test event
   */
  async testWebhook(webhookId: string, userId: string): Promise<WebhookDeliveryResult> {
    const webhook = await Webhook.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const testEvent: WebhookEvent = {
      id: this.generateEventId(),
      type: 'deal.created' as WebhookEventType,
      timestamp: new Date(),
      source: 'test',
      resourceType: 'system',
      resourceId: 'test',
      data: {
        test: true,
        message: 'This is a test webhook delivery from Dispotree',
      },
    };

    return this.deliverWebhook(testEvent, webhook, 0);
  }

  // =============================================================================
  // DELIVERY LOGS
  // =============================================================================

  /**
   * Get delivery logs for a webhook
   */
  async getDeliveryLogs(
    webhookId: string,
    userId: string,
    options?: { limit?: number; offset?: number; successOnly?: boolean }
  ): Promise<{ deliveries: WebhookDelivery[]; total: number } | null> {
    // Verify ownership
    const webhook = await Webhook.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) return null;

    return WebhookDelivery.getByWebhook(webhookId, options);
  }

  /**
   * Get delivery statistics for a webhook
   */
  async getDeliveryStats(
    webhookId: string,
    userId: string
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    pendingRetries: number;
    averageResponseTime: number;
  } | null> {
    // Verify ownership
    const webhook = await Webhook.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) return null;

    return WebhookDelivery.getStats(webhookId);
  }

  /**
   * Retry a failed delivery
   */
  async retryDelivery(
    deliveryId: number,
    webhookId: string,
    userId: string
  ): Promise<WebhookDeliveryResult | null> {
    // Verify ownership
    const webhook = await Webhook.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) return null;

    const delivery = await WebhookDelivery.findOne({
      where: { id: deliveryId, webhookId },
    });

    if (!delivery) return null;

    // Recreate the event from the delivery
    const event: WebhookEvent = {
      id: delivery.eventId,
      type: delivery.eventType as WebhookEventType,
      timestamp: new Date(),
      source: 'retry',
      resourceType: 'system',
      resourceId: 'retry',
      data: delivery.payload,
    };

    return this.deliverWebhook(event, webhook, delivery.retryCount);
  }

  // =============================================================================
  // DELIVERY PROCESSING
  // =============================================================================

  /**
   * Queue webhook deliveries for an event
   */
  private async queueDeliveries(event: WebhookEvent): Promise<void> {
    try {
      const webhooks = await Webhook.getActiveForEvent(event.type);

      for (const webhook of webhooks) {
        // Check if webhook user/org matches event user/org (if applicable)
        if (event.organizationId && webhook.organizationId !== event.organizationId) {
          // Skip organization-scoped webhooks that don't match
          continue;
        }

        this.deliveryQueue.push({
          event,
          webhook,
          retryCount: 0,
        });
      }

      this.stats.activeWebhooks = webhooks.length;
    } catch (error) {
      console.error('Failed to queue webhook deliveries:', error);
    }
  }

  /**
   * Start the delivery processor
   */
  private startDeliveryProcessor(): void {
    this.deliveryProcessorIntervalId = setInterval(() => this.processDeliveryQueue(), 100);
  }

  /**
   * Start the retry processor
   */
  private startRetryProcessor(): void {
    // Check for pending retries every 10 seconds
    this.retryProcessorIntervalId = setInterval(() => this.processPendingRetries(), 10000);
  }

  /**
   * Process the delivery queue
   */
  private async processDeliveryQueue(): Promise<void> {
    if (this.processing || this.deliveryQueue.length === 0) return;

    this.processing = true;

    try {
      // Process up to 10 deliveries at a time
      const batch = this.deliveryQueue.splice(0, 10);

      await Promise.all(
        batch.map(({ event, webhook, retryCount }) =>
          this.deliverWebhook(event, webhook, retryCount)
        )
      );
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process pending retries from database
   */
  private async processPendingRetries(): Promise<void> {
    try {
      const pendingDeliveries = await WebhookDelivery.getPendingRetries();
      this.stats.pendingRetries = pendingDeliveries.length;

      for (const delivery of pendingDeliveries) {
        const webhook = await Webhook.findByPk(delivery.webhookId);
        if (!webhook || !webhook.active) {
          // Clear retry if webhook is disabled or deleted
          delivery.nextRetryAt = null;
          await delivery.save();
          continue;
        }

        // Recreate event from delivery
        const event: WebhookEvent = {
          id: delivery.eventId,
          type: delivery.eventType as WebhookEventType,
          timestamp: new Date(),
          source: 'retry',
          resourceType: 'system',
          resourceId: 'retry',
          data: delivery.payload,
        };

        // Queue for delivery
        this.deliveryQueue.push({
          event,
          webhook,
          retryCount: delivery.retryCount,
        });
      }
    } catch (error) {
      console.error('Failed to process pending retries:', error);
    }
  }

  /**
   * Deliver webhook to subscriber
   */
  private async deliverWebhook(
    event: WebhookEvent,
    webhook: Webhook,
    retryCount: number
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    const payload = JSON.stringify({
      event: event.type,
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      data: event,
    });

    // Generate signature
    const signature = Webhook.generateSignature(payload, webhook.secret);

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event.type,
      'X-Webhook-Signature': `sha256=${signature}`,
      'X-Webhook-Timestamp': event.timestamp.toISOString(),
      'X-Webhook-Id': webhook.id,
      'User-Agent': 'Dispotree-Webhook/1.0',
      ...(webhook.headers || {}),
    };

    let result: WebhookDeliveryResult;
    let responseBody: string | null = null;
    let statusCode: number | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), webhook.timeoutMs);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      statusCode = response.status;

      try {
        responseBody = await response.text();
        // Truncate response body to prevent DB bloat
        if (responseBody.length > 1000) {
          responseBody = responseBody.substring(0, 1000) + '... (truncated)';
        }
      } catch {
        responseBody = null;
      }

      result = {
        webhookId: webhook.id,
        eventId: event.id,
        success: response.ok,
        statusCode: response.status,
        responseTime: Date.now() - startTime,
        retryCount,
        deliveredAt: new Date(),
      };

      if (response.ok) {
        await webhook.recordSuccess();
        this.stats.deliveredEvents++;
      } else {
        result.error = `HTTP ${response.status}`;
        await this.handleDeliveryFailure(event, webhook, retryCount, result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result = {
        webhookId: webhook.id,
        eventId: event.id,
        success: false,
        responseTime: Date.now() - startTime,
        error: errorMessage,
        retryCount,
        deliveredAt: new Date(),
      };

      await this.handleDeliveryFailure(event, webhook, retryCount, errorMessage);
    }

    // Log the delivery
    try {
      await WebhookDelivery.create({
        webhookId: webhook.id,
        eventId: event.id,
        eventType: event.type,
        payload: event.data,
        statusCode,
        responseTime: result.responseTime || null,
        responseBody,
        success: result.success,
        error: result.error || null,
        retryCount,
        nextRetryAt: result.success ? null : this.getNextRetryTime(retryCount, webhook),
        deliveredAt: result.deliveredAt,
      });
    } catch (logError) {
      console.error('Failed to log webhook delivery:', logError);
    }

    return result;
  }

  /**
   * Handle failed webhook delivery
   */
  private async handleDeliveryFailure(
    event: WebhookEvent,
    webhook: Webhook,
    retryCount: number,
    error: string
  ): Promise<void> {
    await webhook.recordFailure(error);
    this.stats.failedEvents++;

    console.warn(
      `⚠️ Webhook delivery failed: ${webhook.id} (attempt ${retryCount + 1}): ${error}`
    );

    // Check if we should retry
    if (webhook.retryEnabled && retryCount < webhook.maxRetries) {
      const delay = this.retryDelays[retryCount] || 30000;
      console.log(`   Scheduled retry in ${delay / 1000}s`);
    } else if (retryCount >= webhook.maxRetries) {
      console.error(`❌ Webhook delivery permanently failed: ${webhook.id}`);
    }
  }

  /**
   * Get the next retry time for a failed delivery
   */
  private getNextRetryTime(retryCount: number, webhook: Webhook): Date | null {
    if (!webhook.retryEnabled || retryCount >= webhook.maxRetries) {
      return null;
    }

    const delay = this.retryDelays[retryCount] || 30000;
    return new Date(Date.now() + delay);
  }

  // =============================================================================
  // UTILITIES
  // =============================================================================

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Get service statistics
   */
  getStats(): WebhookStats {
    return { ...this.stats };
  }

  /**
   * Get available event types
   */
  getEventTypes(): { all: WebhookEventType[]; categories: typeof EVENT_CATEGORIES } {
    return {
      all: ALL_EVENT_TYPES,
      categories: EVENT_CATEGORIES,
    };
  }

  /**
   * Cleanup old delivery logs
   */
  async cleanupLogs(retentionDays: number = 30): Promise<number> {
    return WebhookDelivery.cleanup(retentionDays);
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.deliveryProcessorIntervalId) {
      clearInterval(this.deliveryProcessorIntervalId);
      this.deliveryProcessorIntervalId = null;
    }
    if (this.retryProcessorIntervalId) {
      clearInterval(this.retryProcessorIntervalId);
      this.retryProcessorIntervalId = null;
    }
    this.removeAllListeners();
    console.log('🛑 WebhookService shut down');
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const webhookService = new WebhookService();
export default webhookService;
