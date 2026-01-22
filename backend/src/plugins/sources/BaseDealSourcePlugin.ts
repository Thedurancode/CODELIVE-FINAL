/**
 * Base Deal Source Plugin
 *
 * Abstract base class that provides common functionality for all deal source plugins.
 * Extend this class to create new deal source integrations.
 */

import {
  IDealSourcePlugin,
  DealSourceType,
  DealSourceConfig,
  DealSourceResult,
  RawDeal,
  NormalizedDeal,
  ValidationResult,
  ConnectionTestResult,
  FetchOptions,
  PluginConfigSchema,
} from '../types';

export abstract class BaseDealSourcePlugin implements IDealSourcePlugin {
  abstract readonly type: DealSourceType;
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly description: string;
  abstract readonly configSchema: PluginConfigSchema;

  protected config: DealSourceConfig | null = null;
  protected isInitialized: boolean = false;

  /**
   * Initialize the plugin with configuration
   */
  async initialize(config: DealSourceConfig): Promise<void> {
    const validation = await this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }
    this.config = config;
    await this.onInitialize();
    this.isInitialized = true;
  }

  /**
   * Hook for subclasses to perform initialization logic
   */
  protected async onInitialize(): Promise<void> {
    // Override in subclass if needed
  }

  /**
   * Validate the configuration against the schema
   */
  async validateConfig(config: DealSourceConfig): Promise<ValidationResult> {
    const errors: string[] = [];

    for (const field of this.configSchema.fields) {
      const value = config.settings[field.name];

      // Check required fields
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`Field '${field.label}' is required`);
        continue;
      }

      // Skip validation if value is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      switch (field.type) {
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`Field '${field.label}' must be a number`);
          } else {
            if (field.validation?.min !== undefined && value < field.validation.min) {
              errors.push(`Field '${field.label}' must be at least ${field.validation.min}`);
            }
            if (field.validation?.max !== undefined && value > field.validation.max) {
              errors.push(`Field '${field.label}' must be at most ${field.validation.max}`);
            }
          }
          break;

        case 'string':
        case 'password':
        case 'textarea':
          if (typeof value !== 'string') {
            errors.push(`Field '${field.label}' must be a string`);
          } else if (field.validation?.pattern) {
            try {
              // Limit pattern length to prevent ReDoS attacks
              if (field.validation.pattern.length > 500) {
                errors.push(`Field '${field.label}' validation pattern too complex`);
              } else {
                const regex = new RegExp(field.validation.pattern);
                if (!regex.test(value)) {
                  errors.push(`Field '${field.label}' does not match required pattern`);
                }
              }
            } catch {
              errors.push(`Field '${field.label}' has invalid validation pattern`);
            }
          }
          break;

        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`Field '${field.label}' must be a boolean`);
          }
          break;

        case 'select':
          if (field.options && !field.options.some((opt) => opt.value === value)) {
            errors.push(`Field '${field.label}' must be one of: ${field.options.map((o) => o.value).join(', ')}`);
          }
          break;

        case 'json':
          if (typeof value !== 'object') {
            errors.push(`Field '${field.label}' must be a valid JSON object`);
          }
          break;
      }
    }

    // Run custom validation
    const customErrors = await this.customValidation(config);
    errors.push(...customErrors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Override to add custom validation logic
   */
  protected async customValidation(config: DealSourceConfig): Promise<string[]> {
    return [];
  }

  /**
   * Test connection to the data source
   */
  abstract testConnection(config: DealSourceConfig): Promise<ConnectionTestResult>;

  /**
   * Fetch deals from the source - must be implemented by subclass
   */
  abstract fetchDeals(options?: FetchOptions): Promise<DealSourceResult>;

  /**
   * Normalize a raw deal to standard format
   */
  async normalizeDeal(rawDeal: RawDeal): Promise<NormalizedDeal> {
    const data = rawDeal.rawData;

    // Default normalization logic - override in subclass for source-specific mapping
    const normalized: NormalizedDeal = {
      externalId: this.extractField(data, ['id', 'external_id', 'property_id', 'deal_id']),
      sourceId: rawDeal.sourceId,
      sourceName: rawDeal.sourceName,

      address: this.extractAddress(data),

      propertyType: this.extractField(data, ['property_type', 'propertyType', 'type']),

      bedrooms: this.extractNumber(data, ['bedrooms', 'beds', 'bed', 'bedroom_count']),
      bathrooms: this.extractNumber(data, ['bathrooms', 'baths', 'bath', 'bathroom_count']),
      sqft: this.extractNumber(data, ['sqft', 'square_feet', 'living_area', 'sq_ft', 'squareFeet']),
      lotSize: this.extractNumber(data, ['lot_size', 'lotSize', 'lot_sqft', 'lot_area']),
      yearBuilt: this.extractNumber(data, ['year_built', 'yearBuilt', 'built_year']),

      askingPrice: this.extractNumber(data, ['price', 'asking_price', 'askingPrice', 'contract_price', 'purchase_price']) || 0,
      arv: this.extractNumber(data, ['arv', 'after_repair_value', 'afterRepairValue', 'estimated_value']),
      repairEstimate: this.extractNumber(data, ['repair_estimate', 'repairs', 'rehab_cost', 'repairEstimate']),
      monthlyRent: this.extractNumber(data, ['rent', 'monthly_rent', 'monthlyRent', 'rental_estimate']),

      wholesalerName: this.extractField(data, ['wholesaler', 'wholesaler_name', 'seller_name', 'contact_name']),
      wholesalerEmail: this.extractField(data, ['email', 'wholesaler_email', 'contact_email']),
      wholesalerPhone: this.extractField(data, ['phone', 'wholesaler_phone', 'contact_phone']),
      wholesalerCompany: this.extractField(data, ['company', 'wholesaler_company', 'llc_name']),

      contractExpiration: this.extractDate(data, ['expiration', 'contract_expiration', 'expires', 'close_date']),
      assignmentFee: this.extractNumber(data, ['assignment_fee', 'fee', 'profit']),
      emDeposit: this.extractNumber(data, ['emd', 'earnest_money', 'deposit']),

      occupancyStatus: this.normalizeOccupancy(this.extractField(data, ['occupancy', 'occupancy_status', 'occupied'])),

      description: this.extractField(data, ['description', 'notes', 'comments', 'property_description']),
      photos: this.extractArray(data, ['photos', 'images', 'photo_urls', 'pictures']),
      documents: this.extractArray(data, ['documents', 'files', 'attachments']),

      rawData: data,
      normalizedAt: new Date(),
      confidence: this.calculateConfidence(data),
    };

    // Run source-specific normalization
    return this.customNormalization(normalized, rawDeal);
  }

  /**
   * Override to add source-specific normalization logic
   */
  protected async customNormalization(normalized: NormalizedDeal, rawDeal: RawDeal): Promise<NormalizedDeal> {
    return normalized;
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    await this.onDispose();
    this.config = null;
    this.isInitialized = false;
  }

  /**
   * Hook for subclasses to perform cleanup
   */
  protected async onDispose(): Promise<void> {
    // Override in subclass if needed
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Extract a field value by trying multiple possible field names
   */
  protected extractField(data: Record<string, any>, fieldNames: string[]): string | undefined {
    for (const fieldName of fieldNames) {
      // Try direct access
      if (data[fieldName] !== undefined && data[fieldName] !== null && data[fieldName] !== '') {
        return String(data[fieldName]);
      }
      // Try lowercase
      const lowerKey = Object.keys(data).find((k) => k.toLowerCase() === fieldName.toLowerCase());
      if (lowerKey && data[lowerKey] !== undefined && data[lowerKey] !== null && data[lowerKey] !== '') {
        return String(data[lowerKey]);
      }
    }
    return undefined;
  }

  /**
   * Extract address field - handles both string and object formats
   */
  protected extractAddress(data: Record<string, any>): NormalizedDeal['address'] {
    const result: NormalizedDeal['address'] = {
      street: '',
      city: '',
      state: '',
      zip: '',
    };

    // Check if address is an object (common from Firecrawl)
    const addressField = data.address || data.fullAddress;
    if (addressField && typeof addressField === 'object') {
      result.street = addressField.street || addressField.streetAddress || '';
      result.city = addressField.city || '';
      result.state = addressField.state || '';
      result.zip = addressField.zip || addressField.zipCode || addressField.postalCode || '';
      result.county = addressField.county;
      return result;
    }

    // Fall back to string address or individual fields
    result.street = this.extractField(data, ['street', 'street_address', 'property_address']) || '';
    result.city = this.extractField(data, ['city']) || '';
    result.state = this.extractField(data, ['state', 'st']) || '';
    result.zip = this.extractField(data, ['zip', 'zipcode', 'zip_code', 'postal_code']) || '';
    result.county = this.extractField(data, ['county']);

    // If street is still empty but we have a string address, use it
    if (!result.street && addressField && typeof addressField === 'string') {
      result.street = addressField;
    }

    return result;
  }

  /**
   * Extract a numeric field
   */
  protected extractNumber(data: Record<string, any>, fieldNames: string[]): number | undefined {
    const value = this.extractField(data, fieldNames);
    if (value === undefined) return undefined;

    // Clean and parse number
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
  }

  /**
   * Extract a date field
   */
  protected extractDate(data: Record<string, any>, fieldNames: string[]): Date | undefined {
    const value = this.extractField(data, fieldNames);
    if (value === undefined) return undefined;

    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }

  /**
   * Extract an array field
   */
  protected extractArray(data: Record<string, any>, fieldNames: string[]): string[] {
    for (const fieldName of fieldNames) {
      const value = data[fieldName];
      if (Array.isArray(value)) {
        return value.map(String);
      }
      if (typeof value === 'string' && value.includes(',')) {
        return value.split(',').map((s) => s.trim());
      }
    }
    return [];
  }

  /**
   * Normalize occupancy status to standard format
   */
  protected normalizeOccupancy(value: string | undefined): NormalizedDeal['occupancyStatus'] {
    if (!value) return 'unknown';
    const lower = value.toLowerCase();
    if (lower.includes('vacant') || lower === 'v') return 'vacant';
    if (lower.includes('tenant') || lower === 't') return 'tenant';
    if (lower.includes('owner') || lower === 'o') return 'owner';
    if (lower.includes('occupied')) return 'occupied';
    return 'unknown';
  }

  /**
   * Calculate confidence score based on data completeness
   */
  protected calculateConfidence(data: Record<string, any>): number {
    const criticalFields = ['address', 'street', 'city', 'state', 'zip', 'price', 'asking_price'];
    const importantFields = ['bedrooms', 'bathrooms', 'sqft', 'year_built', 'property_type'];
    const bonusFields = ['arv', 'rent', 'photos', 'description'];

    let score = 0;
    const keys = Object.keys(data).map((k) => k.toLowerCase());

    // Critical fields (up to 50 points)
    for (const field of criticalFields) {
      if (keys.some((k) => k.includes(field))) score += 50 / criticalFields.length;
    }

    // Important fields (up to 30 points)
    for (const field of importantFields) {
      if (keys.some((k) => k.includes(field))) score += 30 / importantFields.length;
    }

    // Bonus fields (up to 20 points)
    for (const field of bonusFields) {
      if (keys.some((k) => k.includes(field))) score += 20 / bonusFields.length;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Ensure plugin is initialized before operations
   */
  protected ensureInitialized(): void {
    if (!this.isInitialized || !this.config) {
      throw new Error(`Plugin ${this.name} is not initialized. Call initialize() first.`);
    }
  }
}
