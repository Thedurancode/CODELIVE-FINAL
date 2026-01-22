/**
 * Firecrawl Deal Source Plugin
 *
 * Web crawler and scraper plugin powered by Firecrawl API:
 * - Multi-site configuration for crawling different real estate sources
 * - AI-powered data extraction with custom schemas
 * - Multiple crawl modes: scrape, batch, crawl, map_then_scrape
 * - Scheduled crawls via automation engine integration
 */

import Firecrawl from '@mendable/firecrawl-js';
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

// ============================================================================
// TYPES
// ============================================================================

export interface FirecrawlSiteConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  crawlMode: 'scrape' | 'batch' | 'crawl' | 'map_then_scrape';
  urlPatterns?: string[];
  extractionSchema?: Record<string, any>;
  customPrompt?: string;
  maxPages?: number;
  schedule?: string; // Cron expression
  lastCrawlAt?: Date;
  lastCrawlStatus?: 'success' | 'failed' | 'running';
  lastCrawlDealsCount?: number;
}

export interface FirecrawlExtractedProperty {
  address?: string | { street?: string; city?: string; state?: string; zip?: string };
  fullAddress?: string | { street?: string; city?: string; state?: string; zip?: string };
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  lotSize?: number;
  yearBuilt?: number;
  propertyType?: string;
  description?: string;
  photos?: string[];
  listingUrl?: string;
  mlsNumber?: string;
  daysOnMarket?: number;
  arv?: number;
  repairEstimate?: number;
  wholesalerName?: string;
  wholesalerPhone?: string;
  wholesalerEmail?: string;
}

// Default property extraction schema for Firecrawl's AI
const DEFAULT_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    address: { type: 'string', description: 'Full property address' },
    street: { type: 'string', description: 'Street address' },
    city: { type: 'string', description: 'City name' },
    state: { type: 'string', description: 'State abbreviation (e.g., TX, FL)' },
    zip: { type: 'string', description: 'ZIP/Postal code' },
    price: { type: 'number', description: 'Listing price or asking price in dollars' },
    bedrooms: { type: 'number', description: 'Number of bedrooms' },
    bathrooms: { type: 'number', description: 'Number of bathrooms' },
    sqft: { type: 'number', description: 'Square footage of living space' },
    lotSize: { type: 'number', description: 'Lot size in square feet or acres' },
    yearBuilt: { type: 'number', description: 'Year the property was built' },
    propertyType: { type: 'string', description: 'Type of property (single_family, multi_family, condo, townhouse, land, commercial)' },
    description: { type: 'string', description: 'Property description' },
    photos: { type: 'array', items: { type: 'string' }, description: 'Array of photo URLs' },
    listingUrl: { type: 'string', description: 'URL to the listing page' },
    mlsNumber: { type: 'string', description: 'MLS listing number if available' },
    daysOnMarket: { type: 'number', description: 'Days on market' },
    arv: { type: 'number', description: 'After Repair Value estimate if mentioned' },
    repairEstimate: { type: 'number', description: 'Repair/rehab cost estimate if mentioned' },
    wholesalerName: { type: 'string', description: 'Wholesaler or seller name' },
    wholesalerPhone: { type: 'string', description: 'Contact phone number' },
    wholesalerEmail: { type: 'string', description: 'Contact email address' },
  },
};

const DEFAULT_EXTRACTION_PROMPT = `Extract all real estate property listings from this page.
For each property, extract:
- Full address (street, city, state, zip)
- Price/asking price
- Bedrooms and bathrooms
- Square footage
- Property type
- Any photos or images
- Contact information for the seller/wholesaler
- Any financial details like ARV, repair estimates
Focus on investment properties, wholesale deals, and distressed properties if present.`;

// ============================================================================
// PLUGIN CLASS
// ============================================================================

export class FirecrawlDealSourcePlugin extends BaseDealSourcePlugin {
  readonly type: DealSourceType = 'firecrawl';
  readonly name = 'Firecrawl Web Crawler';
  readonly version = '1.0.0';
  readonly description = 'AI-powered web crawler for extracting real estate deals from multiple sites using Firecrawl.';

  private firecrawl: Firecrawl | null = null;
  private siteConfigs: Map<string, FirecrawlSiteConfig> = new Map();

  readonly configSchema: PluginConfigSchema = {
    fields: [
      {
        name: 'apiUrl',
        label: 'Firecrawl API URL',
        type: 'string',
        required: false,
        default: 'https://api.firecrawl.dev',
        description: 'API URL for self-hosted Firecrawl (e.g., http://localhost:3002). Leave default for cloud.',
      },
      {
        name: 'apiKey',
        label: 'Firecrawl API Key',
        type: 'password',
        required: false,
        description: 'Your Firecrawl API key (optional for self-hosted without auth)',
      },
      {
        name: 'sites',
        label: 'Crawl Sites Configuration',
        type: 'json',
        required: false,
        default: [],
        description: 'Array of site configurations to crawl. Each site needs: id, name, url, enabled, crawlMode',
      },
      {
        name: 'defaultCrawlMode',
        label: 'Default Crawl Mode',
        type: 'select',
        required: false,
        default: 'scrape',
        options: [
          { value: 'scrape', label: 'Single Page Scrape' },
          { value: 'batch', label: 'Batch Scrape (Multiple URLs)' },
          { value: 'crawl', label: 'Full Site Crawl' },
          { value: 'map_then_scrape', label: 'Map URLs then Scrape' },
        ],
        description: 'Default mode for crawling sites',
      },
      {
        name: 'maxPagesPerSite',
        label: 'Max Pages Per Site',
        type: 'number',
        required: false,
        default: 50,
        validation: { min: 1, max: 1000 },
        description: 'Maximum number of pages to crawl per site',
      },
      {
        name: 'pollInterval',
        label: 'Crawl Status Poll Interval (seconds)',
        type: 'number',
        required: false,
        default: 5,
        validation: { min: 1, max: 60 },
        description: 'How often to check crawl job status',
      },
      {
        name: 'extractionPrompt',
        label: 'Default Extraction Prompt',
        type: 'textarea',
        required: false,
        default: DEFAULT_EXTRACTION_PROMPT,
        description: 'AI prompt for extracting property data from pages',
      },
      {
        name: 'extractionSchema',
        label: 'Default Extraction Schema',
        type: 'json',
        required: false,
        default: DEFAULT_EXTRACTION_SCHEMA,
        description: 'JSON schema for structured data extraction',
      },
    ],
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    const apiUrl = this.config?.settings.apiUrl || 'https://api.firecrawl.dev';
    const apiKey = this.config?.settings.apiKey;

    // Initialize Firecrawl with custom URL for self-hosted instances
    this.firecrawl = new Firecrawl({
      apiKey: apiKey || null,
      apiUrl: apiUrl,
    });

    console.log(`🔥 Firecrawl initialized with API URL: ${apiUrl}`);

    // Load site configurations
    const sites = this.config?.settings.sites || [];
    for (const site of sites) {
      this.siteConfigs.set(site.id, site);
    }
  }

  protected async onDispose(): Promise<void> {
    this.firecrawl = null;
    this.siteConfigs.clear();
  }

  // ============================================================================
  // CONNECTION TEST
  // ============================================================================

  async testConnection(config: DealSourceConfig): Promise<ConnectionTestResult> {
    try {
      const apiUrl = config.settings.apiUrl || 'https://api.firecrawl.dev';
      const apiKey = config.settings.apiKey;

      const testFirecrawl = new Firecrawl({
        apiKey: apiKey || null,
        apiUrl: apiUrl,
      });

      // Test with a simple scrape of a known page
      const result = await testFirecrawl.scrapeUrl('https://example.com', {
        formats: ['markdown'],
      });

      if (result.success) {
        return {
          success: true,
          message: `Firecrawl API connection successful (${apiUrl})`,
          details: {
            apiUrl,
            creditsRemaining: (result as any).creditsRemaining,
          },
        };
      } else {
        return {
          success: false,
          message: `Firecrawl test failed: ${(result as any).error || 'Unknown error'}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ============================================================================
  // SITE MANAGEMENT
  // ============================================================================

  getSites(): FirecrawlSiteConfig[] {
    return Array.from(this.siteConfigs.values());
  }

  getSite(siteId: string): FirecrawlSiteConfig | undefined {
    return this.siteConfigs.get(siteId);
  }

  addSite(site: FirecrawlSiteConfig): void {
    this.siteConfigs.set(site.id, site);
    this.saveSitesToConfig();
  }

  updateSite(siteId: string, updates: Partial<FirecrawlSiteConfig>): FirecrawlSiteConfig | undefined {
    const existing = this.siteConfigs.get(siteId);
    if (!existing) return undefined;

    const updated = { ...existing, ...updates };
    this.siteConfigs.set(siteId, updated);
    this.saveSitesToConfig();
    return updated;
  }

  removeSite(siteId: string): boolean {
    const result = this.siteConfigs.delete(siteId);
    this.saveSitesToConfig();
    return result;
  }

  private saveSitesToConfig(): void {
    if (this.config) {
      this.config.settings.sites = Array.from(this.siteConfigs.values());
    }
  }

  // ============================================================================
  // FETCH DEALS (Main Entry Point)
  // ============================================================================

  async fetchDeals(options?: FetchOptions): Promise<DealSourceResult> {
    this.ensureInitialized();
    const startTime = Date.now();
    const allDeals: NormalizedDeal[] = [];
    const allErrors: DealSourceError[] = [];

    // Get sites to process
    const sites = options?.filters?.siteId
      ? [this.siteConfigs.get(options.filters.siteId as string)].filter(Boolean)
      : Array.from(this.siteConfigs.values()).filter((s) => s.enabled);

    if (sites.length === 0) {
      return {
        success: true,
        deals: [],
        errors: [],
        metadata: {
          totalFound: 0,
          totalProcessed: 0,
          totalErrors: 0,
          syncDuration: Date.now() - startTime,
        },
      };
    }

    // Process each site
    for (const site of sites) {
      if (!site) continue;

      try {
        // Update site status
        site.lastCrawlStatus = 'running';
        site.lastCrawlAt = new Date();

        const result = await this.crawlSite(site, options);
        allDeals.push(...result.deals);
        allErrors.push(...result.errors);

        // Update site status
        site.lastCrawlStatus = 'success';
        site.lastCrawlDealsCount = result.deals.length;
      } catch (error) {
        site.lastCrawlStatus = 'failed';
        allErrors.push({
          error: `Site ${site.name} failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return {
      success: allErrors.length === 0,
      deals: allDeals,
      errors: allErrors,
      metadata: {
        totalFound: allDeals.length,
        totalProcessed: allDeals.length,
        totalErrors: allErrors.length,
        syncDuration: Date.now() - startTime,
      },
    };
  }

  // ============================================================================
  // CRAWL METHODS
  // ============================================================================

  private async crawlSite(
    site: FirecrawlSiteConfig,
    options?: FetchOptions
  ): Promise<{ deals: NormalizedDeal[]; errors: DealSourceError[] }> {
    const crawlMode = site.crawlMode || this.config?.settings.defaultCrawlMode || 'scrape';

    switch (crawlMode) {
      case 'scrape':
        return this.scrapeSingleUrl(site);
      case 'batch':
        return this.batchScrapeUrls(site);
      case 'crawl':
        return this.fullSiteCrawl(site);
      case 'map_then_scrape':
        return this.mapAndScrape(site);
      default:
        return this.scrapeSingleUrl(site);
    }
  }

  /**
   * Scrape a single URL
   */
  async scrapeSingleUrl(
    site: FirecrawlSiteConfig
  ): Promise<{ deals: NormalizedDeal[]; errors: DealSourceError[] }> {
    if (!this.firecrawl) throw new Error('Firecrawl not initialized');

    const deals: NormalizedDeal[] = [];
    const errors: DealSourceError[] = [];

    try {
      const schema = site.extractionSchema || this.config?.settings.extractionSchema;
      const prompt = site.customPrompt || this.config?.settings.extractionPrompt || DEFAULT_EXTRACTION_PROMPT;

      // Build extract config - schema is cast to any to satisfy TypeScript (SDK accepts plain objects)
      const extractConfig: { prompt: string; schema?: any } = { prompt };
      if (schema) {
        extractConfig.schema = schema as any;
      }

      const result = await this.firecrawl.scrapeUrl(site.url, {
        formats: ['markdown', 'extract'],
        extract: extractConfig,
      });

      if (result.success && result.extract) {
        const extractedDeals = await this.processExtractedData(result.extract, site, result.metadata?.sourceURL || site.url);
        deals.push(...extractedDeals);
      } else {
        errors.push({
          error: `Scrape failed for ${site.url}: ${(result as any).error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      errors.push({
        error: `Error scraping ${site.url}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { deals, errors };
  }

  /**
   * Scrape multiple URLs in a batch
   */
  async batchScrapeUrls(
    site: FirecrawlSiteConfig,
    urls?: string[]
  ): Promise<{ deals: NormalizedDeal[]; errors: DealSourceError[] }> {
    if (!this.firecrawl) throw new Error('Firecrawl not initialized');

    const deals: NormalizedDeal[] = [];
    const errors: DealSourceError[] = [];

    // If no URLs provided, first map the site to get URLs
    const urlsToScrape = urls || (await this.getUrlsFromSite(site));

    if (urlsToScrape.length === 0) {
      return { deals, errors: [{ error: `No URLs found to scrape for site ${site.name}` }] };
    }

    const schema = site.extractionSchema || this.config?.settings.extractionSchema;
    const prompt = site.customPrompt || this.config?.settings.extractionPrompt || DEFAULT_EXTRACTION_PROMPT;

    // Build extract config - schema is cast to any to satisfy TypeScript (SDK accepts plain objects)
    const extractConfig: { prompt: string; schema?: any } = { prompt };
    if (schema) {
      extractConfig.schema = schema as any;
    }

    try {
      const batchResult = await this.firecrawl.batchScrapeUrls(urlsToScrape, {
        formats: ['markdown', 'extract'],
        extract: extractConfig,
      } as any);

      if (batchResult.success && batchResult.data) {
        for (const pageData of batchResult.data) {
          if (pageData.extract) {
            const extractedDeals = await this.processExtractedData(
              pageData.extract,
              site,
              pageData.metadata?.sourceURL || 'unknown'
            );
            deals.push(...extractedDeals);
          }
        }
      }
    } catch (error) {
      errors.push({
        error: `Batch scrape failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { deals, errors };
  }

  /**
   * Full site crawl with AI extraction
   * Note: Crawl mode collects URLs, then we batch scrape with extract for deal data
   */
  async fullSiteCrawl(
    site: FirecrawlSiteConfig
  ): Promise<{ deals: NormalizedDeal[]; errors: DealSourceError[] }> {
    if (!this.firecrawl) throw new Error('Firecrawl not initialized');

    const deals: NormalizedDeal[] = [];
    const errors: DealSourceError[] = [];
    const maxPages = site.maxPages || this.config?.settings.maxPagesPerSite || 50;

    try {
      // Start async crawl to get all URLs (without extract, which isn't supported in crawl scrapeOptions)
      const crawlResponse = await this.firecrawl.asyncCrawlUrl(site.url, {
        limit: maxPages,
        scrapeOptions: {
          formats: ['markdown'],
        },
      });

      if (!crawlResponse.success || !crawlResponse.id) {
        errors.push({ error: `Failed to start crawl: ${(crawlResponse as any).error}` });
        return { deals, errors };
      }

      // Poll for completion
      const pollInterval = (this.config?.settings.pollInterval || 5) * 1000;
      let completed = false;
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes with 5s interval
      const collectedUrls: string[] = [];

      while (!completed && attempts < maxAttempts) {
        await this.sleep(pollInterval);
        attempts++;

        const status = await this.firecrawl.checkCrawlStatus(crawlResponse.id);

        // Type guard for successful response
        if (!status.success) {
          errors.push({ error: `Crawl status check failed: ${(status as any).error || 'Unknown error'}` });
          break;
        }

        if (status.status === 'completed') {
          completed = true;

          // Collect URLs from crawled pages
          if (status.data) {
            for (const pageData of status.data) {
              if (pageData.metadata?.sourceURL) {
                collectedUrls.push(pageData.metadata.sourceURL);
              }
            }
          }
        } else if (status.status === 'failed') {
          errors.push({ error: 'Crawl failed' });
          break;
        }
      }

      if (!completed && attempts >= maxAttempts) {
        errors.push({ error: 'Crawl timed out after 10 minutes' });
      }

      // Now batch scrape the collected URLs with extract
      if (collectedUrls.length > 0) {
        const batchResult = await this.batchScrapeUrls(site, collectedUrls);
        deals.push(...batchResult.deals);
        errors.push(...batchResult.errors);
      }
    } catch (error) {
      errors.push({
        error: `Crawl error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { deals, errors };
  }

  /**
   * Map site URLs then batch scrape matching patterns
   */
  async mapAndScrape(
    site: FirecrawlSiteConfig
  ): Promise<{ deals: NormalizedDeal[]; errors: DealSourceError[] }> {
    if (!this.firecrawl) throw new Error('Firecrawl not initialized');

    const errors: DealSourceError[] = [];

    try {
      // Get URLs from site
      const urls = await this.getUrlsFromSite(site);

      if (urls.length === 0) {
        return { deals: [], errors: [{ error: `No matching URLs found for site ${site.name}` }] };
      }

      // Limit URLs
      const maxPages = site.maxPages || this.config?.settings.maxPagesPerSite || 50;
      const limitedUrls = urls.slice(0, maxPages);

      // Batch scrape the URLs
      return this.batchScrapeUrls(site, limitedUrls);
    } catch (error) {
      errors.push({
        error: `Map and scrape failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      return { deals: [], errors };
    }
  }

  /**
   * Get URLs from a site using the map endpoint
   */
  private async getUrlsFromSite(site: FirecrawlSiteConfig): Promise<string[]> {
    if (!this.firecrawl) throw new Error('Firecrawl not initialized');

    try {
      const mapResult = await this.firecrawl.mapUrl(site.url, {
        search: site.urlPatterns?.join(' OR '),
      });

      if (mapResult.success && mapResult.links) {
        // Filter by patterns if provided
        if (site.urlPatterns && site.urlPatterns.length > 0) {
          return mapResult.links.filter((url: string) => {
            return site.urlPatterns!.some((pattern) => {
              const regex = new RegExp(pattern.replace(/\*/g, '.*'));
              return regex.test(url);
            });
          });
        }
        return mapResult.links;
      }
    } catch (error) {
      console.error(`Failed to map URLs for site ${site.name}:`, error);
    }

    return [];
  }

  /**
   * Preview extraction from a URL (for testing)
   */
  async previewExtraction(
    url: string,
    schema?: Record<string, any>,
    prompt?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.firecrawl) {
      return { success: false, error: 'Firecrawl not initialized' };
    }

    try {
      // Use prompt-based extraction (schema is optional and may need Zod conversion)
      const extractConfig: { prompt: string; schema?: any } = {
        prompt: prompt || DEFAULT_EXTRACTION_PROMPT,
      };

      // Only add schema if provided (Firecrawl accepts plain objects for schema)
      if (schema) {
        extractConfig.schema = schema as any;
      }

      const result = await this.firecrawl.scrapeUrl(url, {
        formats: ['markdown', 'extract'],
        extract: extractConfig,
      });

      if (result.success) {
        return {
          success: true,
          data: {
            extract: result.extract,
            markdown: result.markdown?.substring(0, 1000),
            metadata: result.metadata,
          },
        };
      } else {
        return { success: false, error: (result as any).error || 'Extraction failed' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================================================
  // DATA PROCESSING
  // ============================================================================

  private async processExtractedData(
    extractedData: any,
    site: FirecrawlSiteConfig,
    sourceUrl: string
  ): Promise<NormalizedDeal[]> {
    const deals: NormalizedDeal[] = [];

    // Handle array of properties or single property
    const properties = Array.isArray(extractedData)
      ? extractedData
      : extractedData.properties
        ? extractedData.properties
        : [extractedData];

    for (const property of properties) {
      if (!property || !this.hasMinimumData(property)) continue;

      try {
        const rawDeal: RawDeal = {
          sourceId: this.config!.id,
          sourceName: `${this.config!.name} - ${site.name}`,
          externalId: this.generateExternalId(property, sourceUrl),
          rawData: {
            ...property,
            _sourceUrl: sourceUrl,
            _siteId: site.id,
            _siteName: site.name,
          },
          receivedAt: new Date(),
        };

        const normalized = await this.normalizeDeal(rawDeal);
        deals.push(normalized);
      } catch (error) {
        console.error('Failed to normalize extracted property:', error);
      }
    }

    return deals;
  }

  private hasMinimumData(property: any): boolean {
    // Must have at least an address or price
    return !!(
      property.address ||
      property.street ||
      property.price ||
      (property.city && property.state)
    );
  }

  private generateExternalId(property: any, sourceUrl: string): string {
    // Generate a unique ID from property data
    const components = [
      property.mlsNumber,
      property.address,
      property.street,
      property.zip,
      sourceUrl,
    ].filter(Boolean);

    const hash = components.join('|').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
    return `fc_${hash}_${Date.now()}`;
  }

  protected async customNormalization(
    normalized: NormalizedDeal,
    rawDeal: RawDeal
  ): Promise<NormalizedDeal> {
    const data = rawDeal.rawData as FirecrawlExtractedProperty & {
      _sourceUrl?: string;
      _siteId?: string;
      _siteName?: string;
    };

    // Handle address field - can be string or object
    if (data.address && !normalized.address.street) {
      if (typeof data.address === 'object') {
        // Address is already parsed as object
        const addr = data.address as { street?: string; city?: string; state?: string; zip?: string };
        if (addr.street) normalized.address.street = addr.street;
        if (addr.city) normalized.address.city = addr.city;
        if (addr.state) normalized.address.state = addr.state;
        if (addr.zip) normalized.address.zip = addr.zip;
      } else if (typeof data.address === 'string') {
        // Address is a string, parse it
        const parsed = this.parseAddress(data.address);
        normalized.address = { ...normalized.address, ...parsed };
      }
    }

    // Handle fullAddress field (alternate format from Firecrawl)
    if (data.fullAddress && !normalized.address.street) {
      if (typeof data.fullAddress === 'object') {
        const addr = data.fullAddress as { street?: string; city?: string; state?: string; zip?: string };
        if (addr.street) normalized.address.street = addr.street;
        if (addr.city) normalized.address.city = addr.city;
        if (addr.state) normalized.address.state = addr.state;
        if (addr.zip) normalized.address.zip = addr.zip;
      } else if (typeof data.fullAddress === 'string') {
        const parsed = this.parseAddress(data.fullAddress);
        normalized.address = { ...normalized.address, ...parsed };
      }
    }

    // Use extracted fields directly if available (overrides)
    if (data.street) normalized.address.street = data.street;
    if (data.city) normalized.address.city = data.city;
    if (data.state) normalized.address.state = data.state;
    if (data.zip) normalized.address.zip = data.zip;

    // Financial
    if (data.price && !normalized.askingPrice) {
      normalized.askingPrice = data.price;
    }
    if (data.arv) normalized.arv = data.arv;
    if (data.repairEstimate) normalized.repairEstimate = data.repairEstimate;

    // Property details
    if (data.propertyType) normalized.propertyType = this.normalizePropertyType(data.propertyType);
    if (data.photos) normalized.photos = data.photos;

    // Wholesaler info
    if (data.wholesalerName) normalized.wholesalerName = data.wholesalerName;
    if (data.wholesalerPhone) normalized.wholesalerPhone = data.wholesalerPhone;
    if (data.wholesalerEmail) normalized.wholesalerEmail = data.wholesalerEmail;

    // Add source URL to raw data for reference
    if (data._sourceUrl) {
      normalized.rawData._listingUrl = data._sourceUrl;
    }

    return normalized;
  }

  private parseAddress(address: string): Partial<NormalizedDeal['address']> {
    // Simple address parsing - can be enhanced with a dedicated library
    const result: Partial<NormalizedDeal['address']> = {};

    // Try to extract ZIP code
    const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (zipMatch) {
      result.zip = zipMatch[1];
    }

    // Try to extract state (2-letter abbreviation)
    const stateMatch = address.match(/\b([A-Z]{2})\b(?:\s+\d{5})?/);
    if (stateMatch) {
      result.state = stateMatch[1];
    }

    // The rest is harder without a proper parser
    // For now, store the full address as street
    result.street = address;

    return result;
  }

  private normalizePropertyType(type: string): string {
    const lower = type.toLowerCase();
    if (lower.includes('single') || lower.includes('sfr') || lower.includes('house')) {
      return 'single_family';
    }
    if (lower.includes('multi') || lower.includes('duplex') || lower.includes('triplex') || lower.includes('quad')) {
      return 'multi_family';
    }
    if (lower.includes('condo')) return 'condo';
    if (lower.includes('town')) return 'townhouse';
    if (lower.includes('land') || lower.includes('lot')) return 'land';
    if (lower.includes('commercial')) return 'commercial';
    return type;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
