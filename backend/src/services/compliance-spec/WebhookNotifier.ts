/**
 * Compliance Spec Webhook Notifier
 *
 * Notifies external services when compliance specs change.
 * Supports multiple webhook endpoints with retry logic.
 */

import sequelize from '../../config/database';

export type WebhookEventType =
  | 'rule_added'
  | 'rule_updated'
  | 'rule_deleted'
  | 'rules_toggled'
  | 'disclosure_added'
  | 'disclosure_updated'
  | 'disclosure_deleted'
  | 'state_cloned'
  | 'state_created'
  | 'state_updated'
  | 'spec_imported';

interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret?: string;
  active: boolean;
}

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: any;
}

class ComplianceSpecWebhooks {
  private webhooks: WebhookConfig[] = [];
  private initialized = false;
  private retryQueue: Array<{ url: string; payload: WebhookPayload; attempts: number }> = [];
  private maxRetries = 3;
  private retryDelayMs = 5000;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load webhooks from database
      const results = await sequelize.query(
        `SELECT id, webhook_url as url, events, secret, is_active as active
         FROM compliance_webhooks
         WHERE is_active = true`,
        { type: 'SELECT' as any }
      ) as WebhookConfig[];

      this.webhooks = results.map((r: any) => ({
        ...r,
        events: typeof r.events === 'string' ? JSON.parse(r.events) : r.events,
      }));

      console.log(`[ComplianceWebhooks] Loaded ${this.webhooks.length} webhook(s)`);
    } catch (error) {
      // Table might not exist yet
      console.log('[ComplianceWebhooks] No webhooks configured (table may not exist)');
      this.webhooks = [];
    }

    this.initialized = true;

    // Start retry processor
    this.startRetryProcessor();
  }

  /**
   * Register a webhook programmatically (for testing or dynamic config)
   */
  register(config: Omit<WebhookConfig, 'id'>): string {
    const id = `webhook_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.webhooks.push({ ...config, id });
    return id;
  }

  /**
   * Unregister a webhook
   */
  unregister(id: string): boolean {
    const index = this.webhooks.findIndex((w) => w.id === id);
    if (index >= 0) {
      this.webhooks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Notify all subscribed webhooks of an event
   */
  async notify(event: WebhookEventType, data: any): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    // Find webhooks subscribed to this event
    const subscribers = this.webhooks.filter(
      (w) => w.active && (w.events.includes(event) || w.events.includes('*' as any))
    );

    if (subscribers.length === 0) {
      return;
    }

    console.log(`[ComplianceWebhooks] Notifying ${subscribers.length} webhook(s) of ${event}`);

    // Send to all subscribers (non-blocking)
    for (const webhook of subscribers) {
      this.sendWebhook(webhook, payload).catch((error) => {
        console.warn(`[ComplianceWebhooks] Failed to notify ${webhook.url}:`, (error as Error).message);
        // Add to retry queue
        this.retryQueue.push({ url: webhook.url, payload, attempts: 1 });
      });
    }

    // Log the event
    await this.logEvent(event, data);
  }

  /**
   * Send webhook with signature
   */
  private async sendWebhook(webhook: WebhookConfig, payload: WebhookPayload): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Timestamp': payload.timestamp,
    };

    // Add signature if secret is configured
    if (webhook.secret) {
      const crypto = await import('crypto');
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(body)
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * Log event to database for audit trail
   */
  private async logEvent(event: WebhookEventType, data: any): Promise<void> {
    try {
      await sequelize.query(
        `INSERT INTO compliance_spec_versions (
          id, state_spec_id, version, change_type, table_name, record_id, change_description, changed_by, created_at
        ) VALUES (
          gen_random_uuid(),
          (SELECT id FROM compliance_state_specs WHERE state_code = :stateCode LIMIT 1),
          '1.0.0',
          :changeType,
          'webhook_event',
          NULL,
          :description,
          'system',
          NOW()
        )`,
        {
          replacements: {
            stateCode: data.stateCode || 'SYSTEM',
            changeType: event,
            description: JSON.stringify({ event, data }),
          },
        }
      );
    } catch (error) {
      // Non-critical, just log
      console.warn('[ComplianceWebhooks] Failed to log event:', (error as Error).message);
    }
  }

  /**
   * Process retry queue
   */
  private startRetryProcessor(): void {
    setInterval(async () => {
      if (this.retryQueue.length === 0) return;

      const item = this.retryQueue.shift();
      if (!item) return;

      const webhook = this.webhooks.find((w) => w.url === item.url);
      if (!webhook || !webhook.active) return;

      try {
        await this.sendWebhook(webhook, item.payload);
        console.log(`[ComplianceWebhooks] Retry succeeded for ${item.url}`);
      } catch (error) {
        if (item.attempts < this.maxRetries) {
          item.attempts++;
          this.retryQueue.push(item);
          console.warn(
            `[ComplianceWebhooks] Retry ${item.attempts}/${this.maxRetries} failed for ${item.url}`
          );
        } else {
          console.error(`[ComplianceWebhooks] Max retries exceeded for ${item.url}`);
        }
      }
    }, this.retryDelayMs);
  }

  /**
   * Get webhook statistics
   */
  getStats(): { webhooks: number; pendingRetries: number } {
    return {
      webhooks: this.webhooks.length,
      pendingRetries: this.retryQueue.length,
    };
  }

  /**
   * List all registered webhooks
   */
  list(): WebhookConfig[] {
    return this.webhooks.map((w) => ({ ...w, secret: w.secret ? '***' : undefined }));
  }
}

export const complianceSpecWebhooks = new ComplianceSpecWebhooks();
