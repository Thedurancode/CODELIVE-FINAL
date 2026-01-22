/**
 * Manual Deal Source Plugin
 *
 * Handle manually entered deals - supports:
 * - Form submission
 * - Bulk import via UI
 * - Default value templates
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

export class ManualDealSourcePlugin extends BaseDealSourcePlugin {
  readonly type: DealSourceType = 'manual';
  readonly name = 'Manual Entry';
  readonly version = '1.0.0';
  readonly description = 'Manually enter deals via form submission with validation and default values.';

  readonly configSchema: PluginConfigSchema = {
    fields: [
      {
        name: 'defaultWholesaler',
        label: 'Default Wholesaler Name',
        type: 'string',
        required: false,
        description: 'Default wholesaler name for manual entries',
      },
      {
        name: 'defaultWholesalerEmail',
        label: 'Default Wholesaler Email',
        type: 'string',
        required: false,
      },
      {
        name: 'defaultWholesalerPhone',
        label: 'Default Wholesaler Phone',
        type: 'string',
        required: false,
      },
      {
        name: 'requiredFields',
        label: 'Required Fields',
        type: 'textarea',
        required: false,
        default: 'address.street,address.city,address.state,address.zip,askingPrice',
        description: 'Comma-separated list of required fields for manual entry',
      },
      {
        name: 'defaultPropertyType',
        label: 'Default Property Type',
        type: 'select',
        required: false,
        default: 'single_family',
        options: [
          { value: 'single_family', label: 'Single Family' },
          { value: 'townhouse', label: 'Townhouse' },
          { value: 'condo', label: 'Condo' },
          { value: 'multi_family', label: 'Multi-Family' },
          { value: 'land', label: 'Land' },
          { value: 'commercial', label: 'Commercial' },
        ],
      },
      {
        name: 'autoGenerateId',
        label: 'Auto-Generate Deal ID',
        type: 'boolean',
        required: false,
        default: true,
      },
      {
        name: 'idPrefix',
        label: 'Deal ID Prefix',
        type: 'string',
        required: false,
        default: 'MANUAL',
        description: 'Prefix for auto-generated deal IDs',
      },
      {
        name: 'validationRules',
        label: 'Validation Rules',
        type: 'json',
        required: false,
        description: 'Custom validation rules (JSON object)',
      },
      {
        name: 'defaultOccupancy',
        label: 'Default Occupancy Status',
        type: 'select',
        required: false,
        default: 'unknown',
        options: [
          { value: 'vacant', label: 'Vacant' },
          { value: 'occupied', label: 'Occupied' },
          { value: 'tenant', label: 'Tenant Occupied' },
          { value: 'owner', label: 'Owner Occupied' },
          { value: 'unknown', label: 'Unknown' },
        ],
      },
    ],
  };

  // Queue for submitted deals
  private pendingDeals: Array<{ data: Record<string, any>; submittedAt: Date }> = [];

  async testConnection(config: DealSourceConfig): Promise<ConnectionTestResult> {
    return {
      success: true,
      message: 'Manual entry source is ready',
      details: {
        requiredFields: config.settings.requiredFields?.split(',') || [],
        autoGenerateId: config.settings.autoGenerateId !== false,
      },
    };
  }

  /**
   * Submit a deal manually
   */
  public async submitDeal(data: Record<string, any>): Promise<{ success: boolean; deal?: NormalizedDeal; errors: string[] }> {
    this.ensureInitialized();

    // Validate required fields
    const validationErrors = this.validateDealData(data);
    if (validationErrors.length > 0) {
      return { success: false, errors: validationErrors };
    }

    try {
      // Apply defaults
      const enrichedData = this.applyDefaults(data);

      // Generate ID if needed
      if (this.config!.settings.autoGenerateId !== false && !enrichedData.id) {
        const prefix = this.config!.settings.idPrefix || 'MANUAL';
        enrichedData.id = `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }

      const rawDeal: RawDeal = {
        sourceId: this.config!.id,
        sourceName: this.config!.name,
        externalId: enrichedData.id,
        rawData: enrichedData,
        receivedAt: new Date(),
      };

      const normalized = await this.normalizeDeal(rawDeal);
      return { success: true, deal: normalized, errors: [] };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Submit multiple deals in bulk
   */
  public async submitBulk(deals: Record<string, any>[]): Promise<{
    success: boolean;
    processed: NormalizedDeal[];
    errors: Array<{ index: number; errors: string[] }>;
  }> {
    this.ensureInitialized();

    const processed: NormalizedDeal[] = [];
    const errors: Array<{ index: number; errors: string[] }> = [];

    for (let i = 0; i < deals.length; i++) {
      const result = await this.submitDeal(deals[i]);
      if (result.success && result.deal) {
        processed.push(result.deal);
      } else {
        errors.push({ index: i, errors: result.errors });
      }
    }

    return {
      success: errors.length === 0,
      processed,
      errors,
    };
  }

  /**
   * Queue a deal for later processing
   */
  public queueDeal(data: Record<string, any>): void {
    this.pendingDeals.push({ data, submittedAt: new Date() });
  }

  async fetchDeals(options?: FetchOptions): Promise<DealSourceResult> {
    this.ensureInitialized();
    const startTime = Date.now();

    // Process queued deals
    const queued = [...this.pendingDeals];
    this.pendingDeals = [];

    const deals: NormalizedDeal[] = [];
    const errors: DealSourceError[] = [];

    for (const item of queued) {
      const result = await this.submitDeal(item.data);
      if (result.success && result.deal) {
        deals.push(result.deal);
      } else {
        errors.push({
          error: result.errors.join(', '),
          rawData: item.data,
        });
      }
    }

    return {
      success: true,
      deals,
      errors,
      metadata: {
        totalFound: queued.length,
        totalProcessed: deals.length,
        totalErrors: errors.length,
        syncDuration: Date.now() - startTime,
      },
    };
  }

  private validateDealData(data: Record<string, any>): string[] {
    const errors: string[] = [];

    // Check required fields
    const requiredFields = this.config!.settings.requiredFields?.split(',').map((f: string) => f.trim()) || [];

    for (const field of requiredFields) {
      const value = this.getNestedValue(data, field);
      if (value === undefined || value === null || value === '') {
        errors.push(`Field '${field}' is required`);
      }
    }

    // Apply custom validation rules
    const validationRules = this.config!.settings.validationRules || {};
    for (const [field, rules] of Object.entries(validationRules) as [string, any][]) {
      const value = this.getNestedValue(data, field);

      if (rules.type === 'number' && value !== undefined) {
        const num = parseFloat(value);
        if (isNaN(num)) {
          errors.push(`Field '${field}' must be a number`);
        } else {
          if (rules.min !== undefined && num < rules.min) {
            errors.push(`Field '${field}' must be at least ${rules.min}`);
          }
          if (rules.max !== undefined && num > rules.max) {
            errors.push(`Field '${field}' must be at most ${rules.max}`);
          }
        }
      }

      if (rules.type === 'string' && value !== undefined && rules.pattern) {
        try {
          // Limit pattern length to prevent ReDoS attacks
          if (rules.pattern.length > 500) {
            errors.push(`Field '${field}' validation pattern too complex`);
          } else {
            const regex = new RegExp(rules.pattern);
            if (!regex.test(String(value))) {
              errors.push(`Field '${field}' does not match required format`);
            }
          }
        } catch {
          errors.push(`Field '${field}' has invalid validation pattern`);
        }
      }

      if (rules.type === 'enum' && value !== undefined && rules.values) {
        if (!rules.values.includes(value)) {
          errors.push(`Field '${field}' must be one of: ${rules.values.join(', ')}`);
        }
      }
    }

    // Standard validations
    if (data.askingPrice !== undefined) {
      const price = parseFloat(data.askingPrice);
      if (isNaN(price) || price <= 0) {
        errors.push('Asking price must be a positive number');
      }
    }

    if (data.bedrooms !== undefined) {
      const beds = parseInt(data.bedrooms, 10);
      if (isNaN(beds) || beds < 0 || beds > 50) {
        errors.push('Bedrooms must be a valid number between 0 and 50');
      }
    }

    if (data.bathrooms !== undefined) {
      const baths = parseFloat(data.bathrooms);
      if (isNaN(baths) || baths < 0 || baths > 50) {
        errors.push('Bathrooms must be a valid number between 0 and 50');
      }
    }

    if (data.address?.state && !/^[A-Z]{2}$/i.test(data.address.state)) {
      errors.push('State must be a 2-letter code (e.g., TX, CA)');
    }

    if (data.address?.zip && !/^\d{5}(-\d{4})?$/.test(data.address.zip)) {
      errors.push('ZIP code must be in format 12345 or 12345-6789');
    }

    return errors;
  }

  private applyDefaults(data: Record<string, any>): Record<string, any> {
    const enriched = { ...data };

    // Apply wholesaler defaults
    if (!enriched.wholesalerName && this.config!.settings.defaultWholesaler) {
      enriched.wholesalerName = this.config!.settings.defaultWholesaler;
    }
    if (!enriched.wholesalerEmail && this.config!.settings.defaultWholesalerEmail) {
      enriched.wholesalerEmail = this.config!.settings.defaultWholesalerEmail;
    }
    if (!enriched.wholesalerPhone && this.config!.settings.defaultWholesalerPhone) {
      enriched.wholesalerPhone = this.config!.settings.defaultWholesalerPhone;
    }

    // Apply property type default
    if (!enriched.propertyType && this.config!.settings.defaultPropertyType) {
      enriched.propertyType = this.config!.settings.defaultPropertyType;
    }

    // Apply occupancy default
    if (!enriched.occupancyStatus && this.config!.settings.defaultOccupancy) {
      enriched.occupancyStatus = this.config!.settings.defaultOccupancy;
    }

    return enriched;
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

  protected async customNormalization(normalized: NormalizedDeal, rawDeal: RawDeal): Promise<NormalizedDeal> {
    // Set high confidence for manual entries (user-verified data)
    normalized.confidence = 95;
    return normalized;
  }
}
