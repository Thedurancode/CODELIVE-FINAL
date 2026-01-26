/**
 * Compliance Event Stream Service
 *
 * Real-time event streaming for compliance-related actions.
 * Provides:
 * - Event emission for compliance workflows
 * - Webhook subscriptions for external integrations
 * - WebSocket streaming for real-time updates
 * - Event history and replay capabilities
 *
 * Events:
 * - compliance.check.passed - Property passed compliance check
 * - compliance.check.failed - Property failed compliance check
 * - compliance.check.warning - Property has compliance warnings
 * - compliance.rule.created - New compliance rule added
 * - compliance.rule.updated - Compliance rule modified
 * - compliance.rule.deleted - Compliance rule removed
 * - compliance.document.sent - Document sent for signature
 * - compliance.document.signed - Document signed
 * - compliance.document.expired - Document signature expired
 * - compliance.broker.approved - Deal approved by broker
 * - compliance.broker.rejected - Deal rejected by broker
 * - compliance.license.expiring - Broker license expiring soon
 * - compliance.license.expired - Broker license expired
 * - compliance.alert.created - New compliance alert
 * - compliance.alert.resolved - Compliance alert resolved
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { notificationService } from './NotificationService';
import ComplianceEventModel from '../models/ComplianceEvent';
import { webhookService } from './WebhookService';

// Event types
export type ComplianceEventType =
  | 'compliance.check.passed'
  | 'compliance.check.failed'
  | 'compliance.check.warning'
  | 'compliance.rule.created'
  | 'compliance.rule.updated'
  | 'compliance.rule.deleted'
  | 'compliance.document.sent'
  | 'compliance.document.signed'
  | 'compliance.document.expired'
  | 'compliance.broker.approved'
  | 'compliance.broker.rejected'
  | 'compliance.broker.changes_requested'
  | 'compliance.license.expiring'
  | 'compliance.license.expired'
  | 'compliance.alert.created'
  | 'compliance.alert.resolved'
  | 'compliance.watchdog.run'
  | 'compliance.sanctions.match_found'
  | 'compliance.sanctions.cleared'
  | 'compliance.escalation.triggered'
  | 'compliance.escalation.resolved'
  | 'compliance.verification.api_failure'
  | 'compliance.fraud.high_risk_detected';

// Event payload structure
export interface ComplianceEvent {
  id: string;
  type: ComplianceEventType;
  timestamp: Date;
  source: 'system' | 'user' | 'webhook' | 'scheduler' | 'broker' | 'escalation' | 'anonymous';
  resourceType: 'property' | 'broker' | 'document' | 'rule' | 'alert' | 'screening' | 'system';
  resourceId: string | number;
  userId?: string;
  data: Record<string, any>;
  metadata?: {
    state?: string;
    severity?: string;
    previousValue?: any;
    newValue?: any;
  };
}

// Webhook subscription
export interface WebhookSubscription {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: ComplianceEventType[] | ['*']; // '*' means all events
  active: boolean;
  createdAt: Date;
  lastDeliveryAt?: Date;
  lastDeliveryStatus?: 'success' | 'failed';
  failureCount: number;
  metadata?: Record<string, any>;
}

// Webhook delivery result
export interface WebhookDeliveryResult {
  subscriptionId: string;
  eventId: string;
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  retryCount: number;
  deliveredAt: Date;
}

// Event filter for subscriptions
export interface EventFilter {
  types?: ComplianceEventType[];
  resourceTypes?: string[];
  states?: string[];
  minSeverity?: 'info' | 'warning' | 'critical';
}

// Event stream stats
interface StreamStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  webhookDeliveries: number;
  webhookFailures: number;
  activeSubscriptions: number;
  lastEventAt: Date | null;
}

class ComplianceEventStream extends EventEmitter {
  private subscriptions: Map<string, WebhookSubscription> = new Map();
  private eventHistory: ComplianceEvent[] = [];
  private deliveryQueue: Array<{ event: ComplianceEvent; subscription: WebhookSubscription }> = [];
  private persistQueue: ComplianceEvent[] = [];
  private processing: boolean = false;
  private stats: StreamStats;
  private maxHistorySize: number = 100; // Reduced since we persist to DB
  private maxRetries: number = 3;
  private retryDelays: number[] = [1000, 5000, 30000]; // 1s, 5s, 30s
  private persistBatchSize: number = 50;
  private persistEnabled: boolean = true;
  private deliveryProcessorIntervalId: NodeJS.Timeout | null = null;
  private persistenceProcessorIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(100);

    this.stats = {
      totalEvents: 0,
      eventsByType: {},
      webhookDeliveries: 0,
      webhookFailures: 0,
      activeSubscriptions: 0,
      lastEventAt: null,
    };

    // Start delivery processor
    this.startDeliveryProcessor();

    // Start persistence processor
    this.startPersistenceProcessor();

    console.log('✅ ComplianceEventStream initialized with database persistence');
  }

  /**
   * Emit a compliance event
   */
  emit(event: ComplianceEventType | string, payload?: Partial<ComplianceEvent>): boolean {
    // If just a string event type, create full event
    if (typeof event === 'string' && !payload) {
      return super.emit(event);
    }

    const fullEvent: ComplianceEvent = {
      id: this.generateEventId(),
      type: event as ComplianceEventType,
      timestamp: new Date(),
      source: 'system',
      resourceType: 'property',
      resourceId: '',
      data: {},
      ...payload,
    };

    // Store in history
    this.addToHistory(fullEvent);

    // Update stats
    this.stats.totalEvents++;
    this.stats.eventsByType[event] = (this.stats.eventsByType[event] || 0) + 1;
    this.stats.lastEventAt = new Date();

    // Emit to local listeners
    super.emit(event, fullEvent);
    super.emit('*', fullEvent); // Wildcard listener

    // Queue webhook deliveries (legacy in-memory system)
    this.queueWebhookDeliveries(fullEvent);

    // Emit to webhook service for persistent webhook delivery
    this.emitToWebhookService(fullEvent);

    // Broadcast via WebSocket
    this.broadcastWebSocket(fullEvent);

    console.log(`📡 Compliance Event: ${event} (${fullEvent.resourceType}:${fullEvent.resourceId})`);

    return true;
  }

  /**
   * Publish a compliance event (alias for emit with full payload)
   */
  publish(
    type: ComplianceEventType,
    resourceType: 'property' | 'broker' | 'document' | 'rule' | 'alert',
    resourceId: string | number,
    data: Record<string, any>,
    options?: {
      source?: 'system' | 'user' | 'webhook' | 'scheduler' | 'broker';
      userId?: string;
      metadata?: Record<string, any>;
    }
  ): ComplianceEvent {
    const event: ComplianceEvent = {
      id: this.generateEventId(),
      type,
      timestamp: new Date(),
      source: options?.source || 'system',
      resourceType,
      resourceId,
      userId: options?.userId,
      data,
      metadata: options?.metadata,
    };

    this.emit(type, event);
    return event;
  }

  // ============================================================================
  // WEBHOOK SUBSCRIPTION MANAGEMENT
  // ============================================================================

  /**
   * Subscribe to compliance events via webhook
   */
  subscribe(
    userId: string,
    url: string,
    events: ComplianceEventType[] | ['*'],
    metadata?: Record<string, any>
  ): WebhookSubscription {
    const subscription: WebhookSubscription = {
      id: this.generateSubscriptionId(),
      userId,
      url,
      secret: this.generateWebhookSecret(),
      events,
      active: true,
      createdAt: new Date(),
      failureCount: 0,
      metadata,
    };

    this.subscriptions.set(subscription.id, subscription);
    this.stats.activeSubscriptions = this.getActiveSubscriptionCount();

    console.log(`📡 Webhook subscription created: ${subscription.id} -> ${url}`);
    return subscription;
  }

  /**
   * Unsubscribe from webhook
   */
  unsubscribe(subscriptionId: string): boolean {
    const deleted = this.subscriptions.delete(subscriptionId);
    if (deleted) {
      this.stats.activeSubscriptions = this.getActiveSubscriptionCount();
      console.log(`📡 Webhook subscription removed: ${subscriptionId}`);
    }
    return deleted;
  }

  /**
   * Update subscription
   */
  updateSubscription(
    subscriptionId: string,
    updates: Partial<Pick<WebhookSubscription, 'url' | 'events' | 'active' | 'metadata'>>
  ): WebhookSubscription | null {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return null;

    Object.assign(subscription, updates);
    this.stats.activeSubscriptions = this.getActiveSubscriptionCount();
    return subscription;
  }

  /**
   * Get subscription by ID
   */
  getSubscription(subscriptionId: string): WebhookSubscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Get all subscriptions for a user
   */
  getUserSubscriptions(userId: string): WebhookSubscription[] {
    return Array.from(this.subscriptions.values()).filter(s => s.userId === userId);
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): WebhookSubscription[] {
    return Array.from(this.subscriptions.values()).filter(s => s.active);
  }

  /**
   * Regenerate webhook secret
   */
  regenerateSecret(subscriptionId: string): string | null {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return null;

    subscription.secret = this.generateWebhookSecret();
    return subscription.secret;
  }

  // ============================================================================
  // WEBHOOK DELIVERY
  // ============================================================================

  /**
   * Queue webhook deliveries for an event
   */
  private queueWebhookDeliveries(event: ComplianceEvent): void {
    for (const subscription of this.subscriptions.values()) {
      if (!subscription.active) continue;
      if (subscription.failureCount >= 10) continue; // Too many failures

      // Check if subscription matches event
      if (this.subscriptionMatchesEvent(subscription, event)) {
        this.deliveryQueue.push({ event, subscription });
      }
    }
  }

  /**
   * Check if subscription should receive event
   */
  private subscriptionMatchesEvent(
    subscription: WebhookSubscription,
    event: ComplianceEvent
  ): boolean {
    // Wildcard matches all
    const events = subscription.events as (ComplianceEventType | '*')[];
    if (events.includes('*')) return true;

    // Check specific event types
    return events.includes(event.type);
  }

  /**
   * Start the delivery processor
   */
  private startDeliveryProcessor(): void {
    this.deliveryProcessorIntervalId = setInterval(() => this.processDeliveryQueue(), 100);
  }

  /**
   * Process queued webhook deliveries
   */
  private async processDeliveryQueue(): Promise<void> {
    if (this.processing || this.deliveryQueue.length === 0) return;

    this.processing = true;

    try {
      // Process up to 10 deliveries at a time
      const batch = this.deliveryQueue.splice(0, 10);

      await Promise.all(
        batch.map(({ event, subscription }) => this.deliverWebhook(event, subscription))
      );
    } finally {
      this.processing = false;
    }
  }

  /**
   * Deliver webhook to subscriber
   */
  private async deliverWebhook(
    event: ComplianceEvent,
    subscription: WebhookSubscription,
    retryCount: number = 0
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    const payload = JSON.stringify({
      event: event.type,
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      data: event,
    });

    // Generate signature
    const signature = this.generateSignature(payload, subscription.secret);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Compliance-Event': event.type,
          'X-Compliance-Signature': `sha256=${signature}`,
          'X-Compliance-Timestamp': event.timestamp.toISOString(),
          'X-Webhook-Id': subscription.id,
          'User-Agent': 'Dispotree-Compliance-Webhook/1.0',
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const result: WebhookDeliveryResult = {
        subscriptionId: subscription.id,
        eventId: event.id,
        success: response.ok,
        statusCode: response.status,
        responseTime: Date.now() - startTime,
        retryCount,
        deliveredAt: new Date(),
      };

      if (response.ok) {
        subscription.lastDeliveryAt = new Date();
        subscription.lastDeliveryStatus = 'success';
        subscription.failureCount = 0;
        this.stats.webhookDeliveries++;
      } else {
        result.error = `HTTP ${response.status}`;
        await this.handleDeliveryFailure(event, subscription, retryCount, result.error);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const result: WebhookDeliveryResult = {
        subscriptionId: subscription.id,
        eventId: event.id,
        success: false,
        responseTime: Date.now() - startTime,
        error: errorMessage,
        retryCount,
        deliveredAt: new Date(),
      };

      await this.handleDeliveryFailure(event, subscription, retryCount, errorMessage);
      return result;
    }
  }

  /**
   * Handle failed webhook delivery
   */
  private async handleDeliveryFailure(
    event: ComplianceEvent,
    subscription: WebhookSubscription,
    retryCount: number,
    error: string
  ): Promise<void> {
    subscription.lastDeliveryStatus = 'failed';
    subscription.failureCount++;
    this.stats.webhookFailures++;

    console.warn(
      `⚠️ Webhook delivery failed: ${subscription.id} (attempt ${retryCount + 1}): ${error}`
    );

    // Retry if under max retries
    if (retryCount < this.maxRetries) {
      const delay = this.retryDelays[retryCount] || 30000;
      setTimeout(() => {
        this.deliverWebhook(event, subscription, retryCount + 1);
      }, delay);
    } else {
      console.error(`❌ Webhook delivery permanently failed: ${subscription.id}`);

      // Disable subscription if too many failures
      if (subscription.failureCount >= 10) {
        subscription.active = false;
        console.error(`❌ Webhook subscription disabled due to failures: ${subscription.id}`);
      }
    }
  }

  // ============================================================================
  // PERSISTENT WEBHOOK SERVICE INTEGRATION
  // ============================================================================

  /**
   * Emit event to persistent webhook service for external integrations
   * This is separate from the legacy in-memory webhook system
   */
  private emitToWebhookService(event: ComplianceEvent): void {
    try {
      // Map compliance event types to webhook service event types
      const webhookEventMap: Record<string, string> = {
        'compliance.check.passed': 'compliance.check.passed',
        'compliance.check.failed': 'compliance.check.failed',
        'compliance.check.warning': 'compliance.check.warning',
        'compliance.document.sent': 'compliance.document.sent',
        'compliance.document.signed': 'compliance.document.signed',
        'compliance.document.expired': 'compliance.document.expired',
        'compliance.broker.approved': 'compliance.broker.approved',
        'compliance.broker.rejected': 'compliance.broker.rejected',
        'compliance.alert.created': 'compliance.alert.created',
        'compliance.alert.resolved': 'compliance.alert.resolved',
        'compliance.issue.created': 'compliance.issue.created',
        'compliance.issue.resolved': 'compliance.issue.resolved',
      };

      const webhookEventType = webhookEventMap[event.type];
      if (webhookEventType) {
        webhookService.emitComplianceEvent(
          webhookEventType as any,
          event.resourceId,
          {
            eventId: event.id,
            eventType: event.type,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            timestamp: event.timestamp.toISOString(),
            ...event.data,
          },
          { userId: event.userId }
        ).catch(err => {
          console.warn(`[ComplianceEventStream] Webhook emission failed for ${event.type}:`, err.message);
        });
      }
    } catch (error) {
      console.warn('Failed to emit compliance event to webhook service:', error);
    }
  }

  // ============================================================================
  // WEBSOCKET STREAMING
  // ============================================================================

  /**
   * Broadcast event via WebSocket
   */
  private broadcastWebSocket(event: ComplianceEvent): void {
    try {
      if (notificationService && typeof notificationService.broadcast === 'function') {
        notificationService.broadcast({
          type: 'compliance_event',
          title: this.getEventTitle(event),
          message: this.getEventMessage(event),
          data: {
            eventId: event.id,
            eventType: event.type,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            timestamp: event.timestamp.toISOString(),
            ...event.data,
          },
        });
      }
    } catch (error) {
      console.warn('Failed to broadcast compliance event via WebSocket:', error);
    }
  }

  /**
   * Get human-readable event title
   */
  private getEventTitle(event: ComplianceEvent): string {
    const titles: Record<ComplianceEventType, string> = {
      'compliance.check.passed': 'Compliance Check Passed',
      'compliance.check.failed': 'Compliance Check Failed',
      'compliance.check.warning': 'Compliance Warning',
      'compliance.rule.created': 'Compliance Rule Created',
      'compliance.rule.updated': 'Compliance Rule Updated',
      'compliance.rule.deleted': 'Compliance Rule Deleted',
      'compliance.document.sent': 'Document Sent for Signature',
      'compliance.document.signed': 'Document Signed',
      'compliance.document.expired': 'Document Signature Expired',
      'compliance.broker.approved': 'Deal Approved by Broker',
      'compliance.broker.rejected': 'Deal Rejected by Broker',
      'compliance.broker.changes_requested': 'Changes Requested by Broker',
      'compliance.license.expiring': 'Broker License Expiring',
      'compliance.license.expired': 'Broker License Expired',
      'compliance.alert.created': 'New Compliance Alert',
      'compliance.alert.resolved': 'Compliance Alert Resolved',
      'compliance.watchdog.run': 'Compliance Watchdog Run',
      'compliance.sanctions.match_found': 'Sanctions Match Found',
      'compliance.sanctions.cleared': 'Sanctions Check Cleared',
      'compliance.escalation.triggered': 'Compliance Escalation Triggered',
      'compliance.escalation.resolved': 'Compliance Escalation Resolved',
      'compliance.verification.api_failure': 'Verification API Failure',
      'compliance.fraud.high_risk_detected': 'High Risk Fraud Detected',
    };
    return titles[event.type] || event.type;
  }

  /**
   * Get human-readable event message
   */
  private getEventMessage(event: ComplianceEvent): string {
    const resourceInfo = `${event.resourceType} ${event.resourceId}`;
    return `${this.getEventTitle(event)} for ${resourceInfo}`;
  }

  // ============================================================================
  // EVENT HISTORY
  // ============================================================================

  /**
   * Add event to history and persist queue
   */
  private addToHistory(event: ComplianceEvent): void {
    // Add to in-memory buffer for fast access
    this.eventHistory.push(event);

    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Queue for database persistence
    if (this.persistEnabled) {
      this.persistQueue.push(event);
    }
  }

  /**
   * Start persistence processor for database storage
   */
  private startPersistenceProcessor(): void {
    this.persistenceProcessorIntervalId = setInterval(() => this.flushPersistQueue(), 5000); // Every 5 seconds
  }

  /**
   * Cleanup resources on shutdown
   */
  shutdown(): void {
    if (this.deliveryProcessorIntervalId) {
      clearInterval(this.deliveryProcessorIntervalId);
      this.deliveryProcessorIntervalId = null;
    }
    if (this.persistenceProcessorIntervalId) {
      clearInterval(this.persistenceProcessorIntervalId);
      this.persistenceProcessorIntervalId = null;
    }
    this.removeAllListeners();
    console.log('🛑 ComplianceEventStream shut down');
  }

  /**
   * Flush events to database
   */
  private async flushPersistQueue(): Promise<void> {
    if (this.persistQueue.length === 0) return;

    const batch = this.persistQueue.splice(0, this.persistBatchSize);

    try {
      // Transform to database format
      const dbEvents = batch.map(event => ({
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        source: event.source,
        resourceType: event.resourceType,
        resourceId: String(event.resourceId),
        userId: event.userId,
        data: event.data,
        metadata: event.metadata,
        state: event.metadata?.state,
        severity: event.metadata?.severity as 'info' | 'warning' | 'critical' | undefined,
        propertyId: typeof event.resourceId === 'number' && event.resourceType === 'property'
          ? event.resourceId
          : undefined,
        processed: true,
      }));

      await ComplianceEventModel.bulkCreate(dbEvents as any, { ignoreDuplicates: true });
      console.log(`📋 Persisted ${dbEvents.length} compliance events to database`);
    } catch (error) {
      console.error('❌ Failed to persist compliance events:', (error as Error).message);
      // Put failed events back in queue for retry
      this.persistQueue.unshift(...batch);
    }
  }

  /**
   * Get events from database (for historical queries)
   */
  async getHistoryFromDB(options: {
    types?: ComplianceEventType[];
    resourceType?: string;
    resourceId?: string | number;
    propertyId?: number;
    state?: string;
    since?: Date;
    until?: Date;
    limit?: number;
  }): Promise<ComplianceEvent[]> {
    try {
      const dbEvents = await ComplianceEventModel.query({
        types: options.types,
        resourceType: options.resourceType,
        resourceId: options.resourceId ? String(options.resourceId) : undefined,
        propertyId: options.propertyId,
        state: options.state,
        since: options.since,
        until: options.until,
        limit: options.limit || 100,
      });

      return dbEvents.map(e => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        source: e.source,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        userId: e.userId,
        data: e.data as Record<string, any>,
        metadata: e.metadata as Record<string, any>,
      }));
    } catch (error) {
      console.warn('⚠️ Failed to query events from database:', (error as Error).message);
      return [];
    }
  }

  /**
   * Enable/disable database persistence
   */
  setPersistenceEnabled(enabled: boolean): void {
    this.persistEnabled = enabled;
    console.log(`📋 Event persistence ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get event history
   */
  getHistory(options?: {
    types?: ComplianceEventType[];
    resourceType?: string;
    resourceId?: string | number;
    since?: Date;
    limit?: number;
  }): ComplianceEvent[] {
    let events = [...this.eventHistory];

    if (options?.types?.length) {
      events = events.filter(e => options.types!.includes(e.type));
    }
    if (options?.resourceType) {
      events = events.filter(e => e.resourceType === options.resourceType);
    }
    if (options?.resourceId) {
      events = events.filter(e => String(e.resourceId) === String(options.resourceId));
    }
    if (options?.since) {
      events = events.filter(e => e.timestamp >= options.since!);
    }

    // Sort by timestamp descending (newest first)
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options?.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  /**
   * Get event by ID
   */
  getEvent(eventId: string): ComplianceEvent | undefined {
    return this.eventHistory.find(e => e.id === eventId);
  }

  /**
   * Replay events to a subscriber
   */
  async replayEvents(
    subscriptionId: string,
    options?: {
      since?: Date;
      types?: ComplianceEventType[];
      limit?: number;
    }
  ): Promise<{ delivered: number; failed: number }> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const events = this.getHistory({
      types: options?.types,
      since: options?.since,
      limit: options?.limit || 100,
    });

    let delivered = 0;
    let failed = 0;

    for (const event of events) {
      if (this.subscriptionMatchesEvent(subscription, event)) {
        const result = await this.deliverWebhook(event, subscription);
        if (result.success) {
          delivered++;
        } else {
          failed++;
        }
      }
    }

    return { delivered, failed };
  }

  // ============================================================================
  // STATS & UTILITIES
  // ============================================================================

  /**
   * Get stream statistics
   */
  getStats(): StreamStats {
    return {
      ...this.stats,
      activeSubscriptions: this.getActiveSubscriptionCount(),
    };
  }

  /**
   * Get active subscription count
   */
  private getActiveSubscriptionCount(): number {
    return Array.from(this.subscriptions.values()).filter(s => s.active).length;
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub_${crypto.randomBytes(12).toString('hex')}`;
  }

  /**
   * Generate webhook secret
   */
  private generateWebhookSecret(): string {
    return `whsec_${crypto.randomBytes(24).toString('hex')}`;
  }

  /**
   * Generate HMAC signature for webhook payload
   */
  private generateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verify webhook signature (for incoming webhooks)
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = this.generateSignature(payload, secret);
    const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature;

    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    } catch {
      return false;
    }
  }

  /**
   * Get available event types
   */
  getEventTypes(): ComplianceEventType[] {
    return [
      'compliance.check.passed',
      'compliance.check.failed',
      'compliance.check.warning',
      'compliance.rule.created',
      'compliance.rule.updated',
      'compliance.rule.deleted',
      'compliance.document.sent',
      'compliance.document.signed',
      'compliance.document.expired',
      'compliance.broker.approved',
      'compliance.broker.rejected',
      'compliance.broker.changes_requested',
      'compliance.license.expiring',
      'compliance.license.expired',
      'compliance.alert.created',
      'compliance.alert.resolved',
      'compliance.watchdog.run',
    ];
  }

  /**
   * Test webhook endpoint
   */
  async testWebhook(subscriptionId: string): Promise<WebhookDeliveryResult> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const testEvent: ComplianceEvent = {
      id: this.generateEventId(),
      type: 'compliance.check.passed',
      timestamp: new Date(),
      source: 'system',
      resourceType: 'property',
      resourceId: 'test',
      data: {
        test: true,
        message: 'This is a test webhook delivery',
      },
    };

    return this.deliverWebhook(testEvent, subscription);
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalEvents: 0,
      eventsByType: {},
      webhookDeliveries: 0,
      webhookFailures: 0,
      activeSubscriptions: this.getActiveSubscriptionCount(),
      lastEventAt: null,
    };
  }
}

// Export singleton instance
export const complianceEventStream = new ComplianceEventStream();
export default complianceEventStream;
