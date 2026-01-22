/**
 * Escalation Service
 *
 * Handles configurable escalation policies for compliance events.
 * Supports multi-channel notifications (email, SMS, Slack, PagerDuty, webhooks).
 */

import { Resend } from 'resend';
import { complianceEventStream, ComplianceEvent } from './ComplianceEventStream';
import EscalationPolicy, { EscalationAction, EscalationExecution } from '../models/EscalationPolicy';
import ComplianceEventModel from '../models/ComplianceEvent';

interface NotificationResult {
  success: boolean;
  channel: string;
  error?: string;
  responseTime?: number;
}

class EscalationService {
  private resend: Resend | null = null;
  private twilioClient: any = null;
  private scheduledActions: Map<string, NodeJS.Timeout> = new Map();
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Initialize Resend for email
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
      console.log('✅ EscalationService: Email (Resend) configured');
    }

    // Initialize Twilio for SMS
    if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const twilio = await import('twilio');
        this.twilioClient = twilio.default(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
        console.log('✅ EscalationService: SMS (Twilio) configured');
      } catch {
        console.warn('⚠️ EscalationService: Twilio module not available');
      }
    }

    // Subscribe to compliance events
    this.subscribeToEvents();

    // Start action processor
    this.startActionProcessor();

    this.initialized = true;
    console.log('✅ EscalationService initialized');
  }

  /**
   * Subscribe to all compliance events
   */
  private subscribeToEvents(): void {
    complianceEventStream.on('*', async (event: ComplianceEvent) => {
      try {
        await this.evaluateEscalation(event);
      } catch (error) {
        console.error('❌ EscalationService: Failed to evaluate escalation:', error);
      }
    });
  }

  /**
   * Evaluate if any escalation policies match the event
   */
  async evaluateEscalation(event: ComplianceEvent): Promise<void> {
    const policies = await EscalationPolicy.getEnabled();

    for (const policy of policies) {
      if (!policy.matchesEvent({
        type: event.type,
        severity: event.metadata?.severity,
        state: event.metadata?.state,
        resourceType: event.resourceType,
        propertyId: typeof event.resourceId === 'number' ? event.resourceId : undefined,
      })) {
        continue;
      }

      // Check cooldown
      if (policy.isOnCooldown()) {
        console.log(`⏳ Escalation policy ${policy.name} is on cooldown`);
        continue;
      }

      // Check rate limit
      if (await policy.hasExceededRateLimit()) {
        console.log(`🚫 Escalation policy ${policy.name} exceeded rate limit`);
        continue;
      }

      // Execute escalation
      await this.executeEscalation(event, policy);
    }
  }

  /**
   * Execute an escalation policy
   */
  async executeEscalation(event: ComplianceEvent, policy: EscalationPolicy): Promise<void> {
    console.log(`🚨 Triggering escalation: ${policy.name} for event ${event.id}`);

    const actions = policy.getSortedActions();
    if (actions.length === 0) {
      console.warn(`⚠️ Escalation policy ${policy.name} has no enabled actions`);
      return;
    }

    // Create execution record
    const execution = await EscalationExecution.create({
      policyId: policy.id,
      eventId: event.id,
      triggeredAt: new Date(),
      actions: actions.map(a => ({
        type: a.type,
        status: 'pending' as const,
        scheduledFor: new Date(Date.now() + a.delayMinutes * 60 * 1000),
      })),
      status: 'pending',
    });

    // Record policy trigger
    await policy.recordTrigger();

    // Schedule actions
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const delayMs = action.delayMinutes * 60 * 1000;

      if (delayMs === 0) {
        // Execute immediately
        await this.executeAction(execution, i, action, event, policy);
      } else {
        // Schedule for later
        const timeoutId = setTimeout(async () => {
          await this.executeAction(execution, i, action, event, policy);
          this.scheduledActions.delete(`${execution.id}-${i}`);
        }, delayMs);

        this.scheduledActions.set(`${execution.id}-${i}`, timeoutId);
      }
    }

    // Emit escalation event
    complianceEventStream.publish(
      'compliance.escalation.triggered',
      event.resourceType,
      event.resourceId,
      {
        policyId: policy.id,
        policyName: policy.name,
        executionId: execution.id,
        actionCount: actions.length,
        originalEvent: event.type,
      },
      {
        source: 'escalation',
        metadata: { severity: 'warning' },
      }
    );
  }

  /**
   * Execute a single escalation action
   */
  private async executeAction(
    execution: EscalationExecution,
    actionIndex: number,
    action: EscalationAction,
    event: ComplianceEvent,
    policy: EscalationPolicy
  ): Promise<void> {
    const startTime = Date.now();
    let result: NotificationResult;

    try {
      const message = this.formatMessage(action.config.messageTemplate, event, policy);
      const subject = action.config.subject || `Compliance Alert: ${event.type}`;

      switch (action.type) {
        case 'email':
          result = await this.sendEmail(action.config.recipients || [], subject, message);
          break;
        case 'sms':
          result = await this.sendSms(action.config.recipients || [], message);
          break;
        case 'slack':
          result = await this.sendSlack(action.config.slackWebhook || '', message, event);
          break;
        case 'pagerduty':
          result = await this.triggerPagerDuty(
            action.config.pagerDutyRoutingKey || '',
            event,
            action.config.pagerDutySeverity
          );
          break;
        case 'webhook':
          result = await this.callWebhook(
            action.config.webhookUrl || '',
            event,
            action.config.webhookHeaders
          );
          break;
        default:
          result = { success: false, channel: action.type, error: 'Unknown action type' };
      }

      result.responseTime = Date.now() - startTime;

      // Update execution
      await execution.updateAction(
        actionIndex,
        result.success ? 'sent' : 'failed',
        { error: result.error, response: result }
      );

      if (result.success) {
        console.log(`✅ Escalation action ${action.type} sent successfully`);
      } else {
        console.error(`❌ Escalation action ${action.type} failed:`, result.error);
      }
    } catch (error) {
      await execution.updateAction(actionIndex, 'failed', { error: (error as Error).message });
      console.error(`❌ Escalation action ${action.type} error:`, error);
    }
  }

  /**
   * Format message with template variables
   */
  private formatMessage(template: string | undefined, event: ComplianceEvent, policy: EscalationPolicy): string {
    const defaultTemplate = `
Compliance Alert: {{eventType}}

Resource: {{resourceType}} {{resourceId}}
Severity: {{severity}}
Time: {{timestamp}}
Policy: {{policyName}}

{{data}}
    `.trim();

    let message = template || defaultTemplate;

    const replacements: Record<string, string> = {
      '{{eventType}}': event.type,
      '{{resourceType}}': event.resourceType,
      '{{resourceId}}': String(event.resourceId),
      '{{severity}}': event.metadata?.severity || 'unknown',
      '{{timestamp}}': event.timestamp.toISOString(),
      '{{policyName}}': policy.name,
      '{{data}}': JSON.stringify(event.data, null, 2),
      '{{state}}': event.metadata?.state || '',
    };

    for (const [key, value] of Object.entries(replacements)) {
      message = message.replace(new RegExp(key, 'g'), value);
    }

    return message;
  }

  /**
   * Send email notification
   */
  private async sendEmail(
    recipients: string[],
    subject: string,
    message: string
  ): Promise<NotificationResult> {
    if (!this.resend) {
      return { success: false, channel: 'email', error: 'Email not configured' };
    }

    if (recipients.length === 0) {
      return { success: false, channel: 'email', error: 'No recipients specified' };
    }

    try {
      await this.resend.emails.send({
        from: process.env.EMAIL_FROM || 'compliance@dispotree.com',
        to: recipients,
        subject,
        text: message,
        html: `<pre style="font-family: monospace; white-space: pre-wrap;">${message}</pre>`,
      });

      return { success: true, channel: 'email' };
    } catch (error) {
      return { success: false, channel: 'email', error: (error as Error).message };
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSms(recipients: string[], message: string): Promise<NotificationResult> {
    if (!this.twilioClient) {
      return { success: false, channel: 'sms', error: 'SMS not configured' };
    }

    if (recipients.length === 0) {
      return { success: false, channel: 'sms', error: 'No recipients specified' };
    }

    try {
      const fromNumber = process.env.TWILIO_FROM_NUMBER;
      if (!fromNumber) {
        return { success: false, channel: 'sms', error: 'TWILIO_FROM_NUMBER not set' };
      }

      // Truncate message for SMS
      const smsMessage = message.substring(0, 1600);

      for (const phone of recipients) {
        await this.twilioClient.messages.create({
          body: smsMessage,
          from: fromNumber,
          to: phone,
        });
      }

      return { success: true, channel: 'sms' };
    } catch (error) {
      return { success: false, channel: 'sms', error: (error as Error).message };
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlack(
    webhookUrl: string,
    message: string,
    event: ComplianceEvent
  ): Promise<NotificationResult> {
    if (!webhookUrl) {
      return { success: false, channel: 'slack', error: 'Slack webhook URL not configured' };
    }

    try {
      const payload = {
        text: `🚨 Compliance Alert: ${event.type}`,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `🚨 ${event.type}` },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Resource:*\n${event.resourceType} ${event.resourceId}` },
              { type: 'mrkdwn', text: `*Severity:*\n${event.metadata?.severity || 'unknown'}` },
            ],
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `\`\`\`${message.substring(0, 2900)}\`\`\`` },
          },
        ],
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return { success: false, channel: 'slack', error: `HTTP ${response.status}` };
      }

      return { success: true, channel: 'slack' };
    } catch (error) {
      return { success: false, channel: 'slack', error: (error as Error).message };
    }
  }

  /**
   * Trigger PagerDuty incident
   */
  private async triggerPagerDuty(
    routingKey: string,
    event: ComplianceEvent,
    severity?: 'critical' | 'error' | 'warning' | 'info'
  ): Promise<NotificationResult> {
    if (!routingKey) {
      return { success: false, channel: 'pagerduty', error: 'PagerDuty routing key not configured' };
    }

    try {
      const payload = {
        routing_key: routingKey,
        event_action: 'trigger',
        dedup_key: `dispotree-${event.id}`,
        payload: {
          summary: `Compliance Alert: ${event.type}`,
          severity: severity || 'warning',
          source: 'dispotree-compliance',
          timestamp: event.timestamp.toISOString(),
          custom_details: {
            event_type: event.type,
            resource_type: event.resourceType,
            resource_id: event.resourceId,
            state: event.metadata?.state,
            data: event.data,
          },
        },
      };

      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return { success: false, channel: 'pagerduty', error: `HTTP ${response.status}` };
      }

      return { success: true, channel: 'pagerduty' };
    } catch (error) {
      return { success: false, channel: 'pagerduty', error: (error as Error).message };
    }
  }

  /**
   * Call custom webhook
   */
  private async callWebhook(
    url: string,
    event: ComplianceEvent,
    headers?: Record<string, string>
  ): Promise<NotificationResult> {
    if (!url) {
      return { success: false, channel: 'webhook', error: 'Webhook URL not configured' };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dispotree-Event': event.type,
          ...headers,
        },
        body: JSON.stringify({
          event: event.type,
          id: event.id,
          timestamp: event.timestamp.toISOString(),
          data: event,
        }),
      });

      if (!response.ok) {
        return { success: false, channel: 'webhook', error: `HTTP ${response.status}` };
      }

      return { success: true, channel: 'webhook' };
    } catch (error) {
      return { success: false, channel: 'webhook', error: (error as Error).message };
    }
  }

  /**
   * Start the action processor for delayed actions
   */
  private startActionProcessor(): void {
    // Process pending executions every minute
    setInterval(async () => {
      try {
        const pendingExecutions = await EscalationExecution.getPendingActions();

        for (const execution of pendingExecutions) {
          const now = new Date();
          for (let i = 0; i < execution.actions.length; i++) {
            const action = execution.actions[i];
            if (action.status === 'pending' && new Date(action.scheduledFor) <= now) {
              // Action is due but wasn't executed (server restart scenario)
              const policy = await EscalationPolicy.findByPk(execution.policyId);
              if (policy) {
                const policyAction = policy.actions[i];
                if (policyAction) {
                  // Reconstruct event from database
                  const event = await ComplianceEventModel.findByPk(execution.eventId);
                  if (event) {
                    await this.executeAction(
                      execution,
                      i,
                      policyAction,
                      event as any,
                      policy
                    );
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('❌ EscalationService: Action processor error:', error);
      }
    }, 60000); // Every minute
  }

  /**
   * Cancel pending escalation
   */
  async cancelEscalation(executionId: number): Promise<void> {
    const execution = await EscalationExecution.findByPk(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    // Cancel scheduled timeouts
    for (let i = 0; i < execution.actions.length; i++) {
      const key = `${executionId}-${i}`;
      const timeout = this.scheduledActions.get(key);
      if (timeout) {
        clearTimeout(timeout);
        this.scheduledActions.delete(key);
      }
    }

    await execution.cancel();
  }

  /**
   * Get escalation history
   */
  async getHistory(options?: {
    policyId?: number;
    status?: string;
    limit?: number;
  }): Promise<EscalationExecution[]> {
    const where: any = {};
    if (options?.policyId) {
      where.policyId = options.policyId;
    }
    if (options?.status) {
      where.status = options.status;
    }

    return EscalationExecution.findAll({
      where,
      order: [['triggeredAt', 'DESC']],
      limit: options?.limit || 50,
      include: [{ model: EscalationPolicy, as: 'policy' }],
    });
  }

  /**
   * Test an escalation policy
   */
  async testPolicy(policyId: number): Promise<{ success: boolean; results: NotificationResult[] }> {
    const policy = await EscalationPolicy.findByPk(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const testEvent: ComplianceEvent = {
      id: `test_${Date.now()}`,
      type: 'compliance.check.warning',
      timestamp: new Date(),
      source: 'system',
      resourceType: 'property',
      resourceId: 'test',
      data: { test: true, message: 'This is a test escalation' },
      metadata: { severity: 'info' },
    };

    const results: NotificationResult[] = [];
    const actions = policy.getSortedActions().filter(a => a.delayMinutes === 0); // Only immediate actions

    for (const action of actions) {
      const message = this.formatMessage(action.config.messageTemplate, testEvent, policy);
      const subject = `[TEST] ${action.config.subject || 'Compliance Alert'}`;

      let result: NotificationResult;
      switch (action.type) {
        case 'email':
          result = await this.sendEmail(action.config.recipients || [], subject, message);
          break;
        case 'sms':
          result = await this.sendSms(action.config.recipients || [], `[TEST] ${message}`);
          break;
        case 'slack':
          result = await this.sendSlack(action.config.slackWebhook || '', `[TEST]\n${message}`, testEvent);
          break;
        default:
          result = { success: false, channel: action.type, error: 'Test not supported for this channel' };
      }

      results.push(result);
    }

    return {
      success: results.every(r => r.success),
      results,
    };
  }
}

export const escalationService = new EscalationService();
export default escalationService;
