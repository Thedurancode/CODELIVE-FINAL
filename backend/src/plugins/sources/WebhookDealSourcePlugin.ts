/**
 * Webhook Deal Source Plugin
 *
 * Receive deals via incoming webhooks - supports:
 * - Multiple webhook formats
 * - Signature verification
 * - Rate limiting
 * - Deduplication
 */

import { BaseDealSourcePlugin } from './BaseDealSourcePlugin';
import {
  DealSourceType,
  DealSourceConfig,
  DealSourceResult,
  RawDeal,
  NormalizedDeal,
  ConnectionTestResult,
  FetchOptions,
  PluginConfigSchema,
  DealSourceError,
} from '../types';
import * as crypto from 'crypto';

export class WebhookDealSourcePlugin extends BaseDealSourcePlugin {
  readonly type: DealSourceType = 'webhook';
  readonly name = 'Webhook Receiver';
  readonly version = '1.0.0';
  readonly description = 'Receive deals via incoming webhooks with signature verification and deduplication.';

  readonly configSchema: PluginConfigSchema = {
    fields: [
      {
        name: 'webhookPath',
        label: 'Webhook Path',
        type: 'string',
        required: false,
        default: '/webhook',
        description: 'Custom path for this webhook endpoint',
      },
      {
        name: 'secretKey',
        label: 'Webhook Secret',
        type: 'password',
        required: false,
        description: 'Secret key for signature verification',
      },
      {
        name: 'signatureHeader',
        label: 'Signature Header',
        type: 'string',
        required: false,
        default: 'X-Webhook-Signature',
        description: 'Header name containing the webhook signature',
      },
      {
        name: 'signatureAlgorithm',
        label: 'Signature Algorithm',
        type: 'select',
        required: false,
        default: 'sha256',
        options: [
          { value: 'sha256', label: 'HMAC-SHA256' },
          { value: 'sha1', label: 'HMAC-SHA1' },
          { value: 'md5', label: 'HMAC-MD5' },
        ],
      },
      {
        name: 'payloadFormat',
        label: 'Payload Format',
        type: 'select',
        required: false,
        default: 'json',
        options: [
          { value: 'json', label: 'JSON' },
          { value: 'form', label: 'Form Data' },
          { value: 'xml', label: 'XML' },
        ],
      },
      {
        name: 'dataPath',
        label: 'Data Path',
        type: 'string',
        required: false,
        description: 'JSON path to deal data in payload (e.g., "data.deal")',
      },
      {
        name: 'batchSupport',
        label: 'Batch Support',
        type: 'boolean',
        required: false,
        default: true,
        description: 'Allow receiving multiple deals in one webhook call',
      },
      {
        name: 'batchPath',
        label: 'Batch Array Path',
        type: 'string',
        required: false,
        default: 'deals',
        description: 'JSON path to array of deals for batch processing',
      },
      {
        name: 'deduplicationField',
        label: 'Deduplication Field',
        type: 'string',
        required: false,
        default: 'id',
        description: 'Field to use for deduplication (prevents duplicate deals)',
      },
      {
        name: 'deduplicationWindow',
        label: 'Deduplication Window (hours)',
        type: 'number',
        required: false,
        default: 24,
        validation: { min: 1, max: 720 },
        description: 'Time window for deduplication checks',
      },
      {
        name: 'rateLimit',
        label: 'Rate Limit (per minute)',
        type: 'number',
        required: false,
        default: 100,
        validation: { min: 1, max: 10000 },
      },
      {
        name: 'fieldMapping',
        label: 'Field Mapping',
        type: 'json',
        required: false,
        description: 'Map webhook fields to deal fields (JSON object)',
      },
      {
        name: 'wholesalerName',
        label: 'Wholesaler Name',
        type: 'string',
        required: false,
        description: 'Default wholesaler name for this webhook',
      },
      {
        name: 'allowedIPs',
        label: 'Allowed IP Addresses',
        type: 'textarea',
        required: false,
        description: 'Comma-separated list of allowed sender IPs (empty for all)',
      },
    ],
  };

  // Queue for received webhooks
  private webhookQueue: Array<{ payload: any; receivedAt: Date; headers: Record<string, string> }> = [];

  // Deduplication cache
  private seenIds: Map<string, Date> = new Map();

  // Rate limiting
  private requestCounts: Map<string, number[]> = new Map();

  async testConnection(config: DealSourceConfig): Promise<ConnectionTestResult> {
    const webhookUrl = `/api/sources/${config.id}${config.settings.webhookPath || '/webhook'}`;

    return {
      success: true,
      message: 'Webhook endpoint ready to receive data',
      details: {
        webhookUrl,
        signatureRequired: !!config.settings.secretKey,
        batchSupport: config.settings.batchSupport !== false,
        rateLimit: config.settings.rateLimit || 100,
      },
    };
  }

  /**
   * Handle incoming webhook request
   * @param payload - The parsed payload object
   * @param headers - Request headers
   * @param rawBody - Optional raw body string for signature verification (required if secretKey is configured)
   */
  async handleWebhook(payload: any, headers: Record<string, string>, rawBody?: string): Promise<DealSourceResult> {
    this.ensureInitialized();
    const startTime = Date.now();

    try {
      // Verify signature if configured
      if (this.config!.settings.secretKey) {
        const isValid = this.verifySignature(rawBody || payload, headers);
        if (!isValid) {
          return {
            success: false,
            deals: [],
            errors: [{ error: 'Invalid webhook signature' }],
            metadata: {
              totalFound: 0,
              totalProcessed: 0,
              totalErrors: 1,
              syncDuration: Date.now() - startTime,
            },
          };
        }
      }

      // Check rate limit
      const clientId = headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown';
      if (!this.checkRateLimit(clientId)) {
        return {
          success: false,
          deals: [],
          errors: [{ error: 'Rate limit exceeded' }],
          metadata: {
            totalFound: 0,
            totalProcessed: 0,
            totalErrors: 1,
            syncDuration: Date.now() - startTime,
          },
        };
      }

      // Check IP allowlist
      if (this.config!.settings.allowedIPs) {
        const allowedIPs = this.config!.settings.allowedIPs.split(',').map((ip: string) => ip.trim());
        if (!allowedIPs.includes(clientId) && clientId !== 'unknown') {
          return {
            success: false,
            deals: [],
            errors: [{ error: 'IP address not allowed' }],
            metadata: {
              totalFound: 0,
              totalProcessed: 0,
              totalErrors: 1,
              syncDuration: Date.now() - startTime,
            },
          };
        }
      }

      // Extract deals from payload
      const rawDeals = this.extractDealsFromPayload(payload);

      const deals: NormalizedDeal[] = [];
      const errors: DealSourceError[] = [];

      for (const rawData of rawDeals) {
        // Check deduplication
        const dedupField = this.config!.settings.deduplicationField || 'id';
        const dedupId = rawData[dedupField];

        if (dedupId && this.isDuplicate(String(dedupId))) {
          errors.push({
            externalId: dedupId,
            error: 'Duplicate deal (already received)',
            rawData,
          });
          continue;
        }

        try {
          const rawDeal: RawDeal = {
            sourceId: this.config!.id,
            sourceName: this.config!.name,
            externalId: dedupId,
            rawData,
            receivedAt: new Date(),
          };

          const normalized = await this.normalizeDeal(rawDeal);
          deals.push(normalized);

          // Mark as seen for deduplication
          if (dedupId) {
            this.markAsSeen(String(dedupId));
          }
        } catch (error) {
          errors.push({
            externalId: dedupId,
            error: error instanceof Error ? error.message : String(error),
            rawData,
          });
        }
      }

      return {
        success: true,
        deals,
        errors,
        metadata: {
          totalFound: rawDeals.length,
          totalProcessed: deals.length,
          totalErrors: errors.length,
          syncDuration: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        deals: [],
        errors: [{ error: error instanceof Error ? error.message : String(error) }],
        metadata: {
          totalFound: 0,
          totalProcessed: 0,
          totalErrors: 1,
          syncDuration: Date.now() - startTime,
        },
      };
    }
  }

  async fetchDeals(options?: FetchOptions): Promise<DealSourceResult> {
    this.ensureInitialized();
    const startTime = Date.now();

    // Process any queued webhooks
    const queued = [...this.webhookQueue];
    this.webhookQueue = [];

    const allDeals: NormalizedDeal[] = [];
    const allErrors: DealSourceError[] = [];

    for (const item of queued) {
      const result = await this.handleWebhook(item.payload, item.headers);
      allDeals.push(...result.deals);
      allErrors.push(...result.errors);
    }

    return {
      success: true,
      deals: allDeals,
      errors: allErrors,
      metadata: {
        totalFound: queued.length,
        totalProcessed: allDeals.length,
        totalErrors: allErrors.length,
        syncDuration: Date.now() - startTime,
      },
    };
  }

  private verifySignature(payload: any, headers: Record<string, string>): boolean {
    const signatureHeader = this.config!.settings.signatureHeader || 'X-Webhook-Signature';
    const algorithm = this.config!.settings.signatureAlgorithm || 'sha256';
    const secret = this.config!.settings.secretKey;

    const receivedSignature = headers[signatureHeader.toLowerCase()];
    if (!receivedSignature) {
      return false;
    }

    // Use raw body string if provided, otherwise fall back to JSON.stringify (less reliable)
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSignature = crypto.createHmac(algorithm, secret).update(payloadString).digest('hex');

    // Support both raw signature and prefixed (e.g., "sha256=...")
    const cleanReceived = receivedSignature.includes('=') ? receivedSignature.split('=')[1] : receivedSignature;

    // Fix: timingSafeEqual throws if lengths differ - check first
    const receivedBuffer = Buffer.from(cleanReceived || '');
    const expectedBuffer = Buffer.from(expectedSignature);

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  private extractDealsFromPayload(payload: any): any[] {
    const dataPath = this.config!.settings.dataPath;
    const batchSupport = this.config!.settings.batchSupport !== false;
    const batchPath = this.config!.settings.batchPath || 'deals';

    let data = payload;

    // Navigate to data path if specified
    if (dataPath) {
      const parts = dataPath.split('.');
      for (const part of parts) {
        if (data && data[part] !== undefined) {
          data = data[part];
        } else {
          data = null;
          break;
        }
      }
    }

    // Check for batch array
    if (batchSupport && data && data[batchPath] && Array.isArray(data[batchPath])) {
      return data[batchPath];
    }

    // Check if data itself is an array
    if (Array.isArray(data)) {
      return data;
    }

    // Single deal
    if (data && typeof data === 'object') {
      return [data];
    }

    // Fallback to original payload
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return [payload];
    }

    return [];
  }

  private checkRateLimit(clientId: string): boolean {
    const limit = this.config!.settings.rateLimit || 100;
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute

    let requests = this.requestCounts.get(clientId) || [];

    // Remove old requests outside the window
    requests = requests.filter((timestamp) => now - timestamp < windowMs);

    if (requests.length >= limit) {
      return false;
    }

    requests.push(now);
    this.requestCounts.set(clientId, requests);
    return true;
  }

  private isDuplicate(id: string): boolean {
    const windowHours = this.config!.settings.deduplicationWindow || 24;
    const windowMs = windowHours * 60 * 60 * 1000;

    const seenAt = this.seenIds.get(id);
    if (seenAt && Date.now() - seenAt.getTime() < windowMs) {
      return true;
    }

    return false;
  }

  private markAsSeen(id: string): void {
    this.seenIds.set(id, new Date());

    // Cleanup old entries periodically
    if (this.seenIds.size > 10000) {
      const windowHours = this.config!.settings.deduplicationWindow || 24;
      const windowMs = windowHours * 60 * 60 * 1000;
      const now = Date.now();

      for (const [key, date] of this.seenIds.entries()) {
        if (now - date.getTime() > windowMs) {
          this.seenIds.delete(key);
        }
      }
    }
  }

  protected async customNormalization(normalized: NormalizedDeal, rawDeal: RawDeal): Promise<NormalizedDeal> {
    const fieldMapping = this.config?.settings.fieldMapping || {};

    // Apply custom field mapping
    for (const [webhookField, dealField] of Object.entries(fieldMapping)) {
      const value = this.getNestedValue(rawDeal.rawData, webhookField);
      if (value !== undefined) {
        this.setNestedValue(normalized, dealField as string, value);
      }
    }

    // Set default wholesaler name
    if (this.config?.settings.wholesalerName && !normalized.wholesalerName) {
      normalized.wholesalerName = this.config.settings.wholesalerName;
    }

    return normalized;
  }

  private getNestedValue(obj: any, path: string): any {
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

  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  protected async onDispose(): Promise<void> {
    // Clear caches
    this.webhookQueue = [];
    this.seenIds.clear();
    this.requestCounts.clear();
  }
}
