/**
 * Auction Submission Plugin
 *
 * Browser automation plugin for submitting deals to auction sites.
 * Supports multiple auction platforms with site-specific adapters.
 */

import { Page } from 'playwright';
import {
  BrowserAutomationService,
  browserAutomation,
  FormField,
  FormSubmitResult,
} from './BrowserAutomationService';
import { NormalizedDeal } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  includeScreenshot?: boolean;
}

export interface AuctionSiteConfig {
  id: string;
  name: string;
  type: 'xome' | 'hubzu' | 'auction_com' | 'zillow' | 'custom';
  baseUrl: string;
  loginUrl: string;
  submitUrl: string;
  enabled: boolean;
  credentials: {
    username: string;
    password: string;
  };
  selectors: AuctionSiteSelectors;
  fieldMapping: Record<string, string>;
  webhook?: WebhookConfig;
}

export interface AuctionSiteSelectors {
  // Login
  usernameInput: string;
  passwordInput: string;
  loginButton: string;
  loginSuccessIndicator: string;

  // Submit form
  addressInput?: string;
  cityInput?: string;
  stateInput?: string;
  zipInput?: string;
  priceInput?: string;
  bedroomsInput?: string;
  bathroomsInput?: string;
  sqftInput?: string;
  descriptionInput?: string;
  photoUpload?: string;
  submitButton: string;

  // Confirmation
  confirmationContainer?: string;
  confirmationNumber?: string;
  errorMessage?: string;
}

export interface SubmissionResult {
  success: boolean;
  siteId: string;
  siteName: string;
  dealId: string;
  confirmationNumber?: string;
  confirmationText?: string;
  submittedAt: Date;
  screenshot?: string;
  error?: string;
  errorScreenshot?: string;
}

export interface SubmissionJob {
  id: string;
  deal: NormalizedDeal;
  siteIds: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  results: SubmissionResult[];
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================================
// DEFAULT SITE CONFIGURATIONS
// ============================================================================

const DEFAULT_SITE_CONFIGS: Partial<Record<string, Partial<AuctionSiteConfig>>> = {
  xome: {
    name: 'Xome',
    type: 'xome',
    baseUrl: 'https://www.xome.com',
    loginUrl: 'https://www.xome.com/login',
    submitUrl: 'https://www.xome.com/seller/submit',
    selectors: {
      usernameInput: 'input[name="email"], input[type="email"]',
      passwordInput: 'input[name="password"], input[type="password"]',
      loginButton: 'button[type="submit"], input[type="submit"]',
      loginSuccessIndicator: '.dashboard, .user-menu, [data-testid="user-menu"]',
      addressInput: 'input[name="address"], input[placeholder*="address"]',
      cityInput: 'input[name="city"]',
      stateInput: 'select[name="state"], input[name="state"]',
      zipInput: 'input[name="zip"], input[name="zipCode"]',
      priceInput: 'input[name="price"], input[name="listPrice"]',
      bedroomsInput: 'input[name="bedrooms"], select[name="bedrooms"]',
      bathroomsInput: 'input[name="bathrooms"], select[name="bathrooms"]',
      sqftInput: 'input[name="sqft"], input[name="squareFeet"]',
      descriptionInput: 'textarea[name="description"]',
      photoUpload: 'input[type="file"]',
      submitButton: 'button[type="submit"]:has-text("Submit"), button:has-text("List Property")',
      confirmationContainer: '.confirmation, .success-message',
      confirmationNumber: '.confirmation-number, .reference-id',
      errorMessage: '.error, .alert-danger',
    },
  },
  hubzu: {
    name: 'Hubzu',
    type: 'hubzu',
    baseUrl: 'https://www.hubzu.com',
    loginUrl: 'https://www.hubzu.com/login',
    submitUrl: 'https://www.hubzu.com/seller/list-property',
    selectors: {
      usernameInput: 'input[name="email"], #email',
      passwordInput: 'input[name="password"], #password',
      loginButton: 'button[type="submit"], .login-btn',
      loginSuccessIndicator: '.dashboard, .my-account',
      addressInput: 'input[name="streetAddress"]',
      cityInput: 'input[name="city"]',
      stateInput: 'select[name="state"]',
      zipInput: 'input[name="zipCode"]',
      priceInput: 'input[name="reservePrice"]',
      bedroomsInput: 'input[name="beds"]',
      bathroomsInput: 'input[name="baths"]',
      sqftInput: 'input[name="sqft"]',
      descriptionInput: 'textarea[name="propertyDescription"]',
      photoUpload: 'input[type="file"][accept*="image"]',
      submitButton: 'button:has-text("Submit"), button:has-text("Create Listing")',
      confirmationContainer: '.listing-created, .success',
      confirmationNumber: '.listing-id',
      errorMessage: '.error-message, .form-error',
    },
  },
  auction_com: {
    name: 'Auction.com',
    type: 'auction_com',
    baseUrl: 'https://www.auction.com',
    loginUrl: 'https://www.auction.com/login',
    submitUrl: 'https://www.auction.com/seller/submit-property',
    selectors: {
      usernameInput: 'input[name="username"], input[name="email"]',
      passwordInput: 'input[name="password"]',
      loginButton: 'button[type="submit"]',
      loginSuccessIndicator: '.seller-dashboard, .user-profile',
      addressInput: 'input[name="propertyAddress"]',
      cityInput: 'input[name="city"]',
      stateInput: 'select[name="state"]',
      zipInput: 'input[name="zip"]',
      priceInput: 'input[name="startingBid"]',
      bedroomsInput: 'select[name="bedrooms"]',
      bathroomsInput: 'select[name="bathrooms"]',
      sqftInput: 'input[name="livingArea"]',
      descriptionInput: 'textarea[name="description"]',
      photoUpload: 'input[type="file"]',
      submitButton: 'button:has-text("Submit Property")',
      confirmationContainer: '.submission-confirmation',
      confirmationNumber: '.auction-id, .property-id',
      errorMessage: '.submission-error',
    },
  },
  zillow: {
    name: 'Zillow',
    type: 'zillow',
    baseUrl: 'https://www.zillow.com',
    loginUrl: 'https://www.zillow.com/user/acct/login',
    submitUrl: 'https://www.zillow.com/rental-manager/properties/add',
    selectors: {
      usernameInput: 'input[name="email"], input[type="email"], #email',
      passwordInput: 'input[name="password"], input[type="password"], #password',
      loginButton: 'button[type="submit"], #login-btn',
      loginSuccessIndicator: '[data-testid="user-menu"], .user-avatar, .account-menu',
      addressInput: 'input[name="address"], input[placeholder*="address"], #address-input',
      cityInput: 'input[name="city"]',
      stateInput: 'select[name="state"]',
      zipInput: 'input[name="zip"], input[name="zipcode"]',
      priceInput: 'input[name="price"], input[name="rent"]',
      bedroomsInput: 'select[name="bedrooms"], input[name="beds"]',
      bathroomsInput: 'select[name="bathrooms"], input[name="baths"]',
      sqftInput: 'input[name="sqft"], input[name="livingArea"]',
      descriptionInput: 'textarea[name="description"]',
      photoUpload: 'input[type="file"]',
      submitButton: 'button:has-text("Post"), button:has-text("Submit"), button:has-text("List")',
      confirmationContainer: '.success, .confirmation, [data-testid="success"]',
      confirmationNumber: '.listing-id, .confirmation-number',
      errorMessage: '.error, .alert-error, [data-testid="error"]',
    },
  },
};

// ============================================================================
// AUCTION SUBMISSION PLUGIN
// ============================================================================

export class AuctionSubmissionPlugin {
  private browserService: BrowserAutomationService;
  private sites: Map<string, AuctionSiteConfig> = new Map();
  private jobs: Map<string, SubmissionJob> = new Map();

  constructor(browserService?: BrowserAutomationService) {
    this.browserService = browserService || browserAutomation;
    this.loadDefaultSites();
  }

  private loadDefaultSites(): void {
    // Load default site templates (credentials need to be added)
    for (const [key, config] of Object.entries(DEFAULT_SITE_CONFIGS)) {
      if (config) {
        this.sites.set(key, {
          id: key,
          enabled: false,
          credentials: { username: '', password: '' },
          fieldMapping: {},
          ...config,
        } as AuctionSiteConfig);
      }
    }
  }

  // ============================================================================
  // SITE MANAGEMENT
  // ============================================================================

  /**
   * Register or update an auction site configuration
   */
  registerSite(config: AuctionSiteConfig): void {
    // Merge with default if type matches
    const defaultConfig = DEFAULT_SITE_CONFIGS[config.type];
    if (defaultConfig) {
      config = {
        ...defaultConfig,
        ...config,
        selectors: {
          ...defaultConfig.selectors,
          ...config.selectors,
        },
      } as AuctionSiteConfig;
    }

    this.sites.set(config.id, config);
    console.log(`✅ Registered auction site: ${config.name} (${config.id})`);
  }

  /**
   * Get a site configuration
   */
  getSite(siteId: string): AuctionSiteConfig | undefined {
    return this.sites.get(siteId);
  }

  /**
   * Get all registered sites
   */
  getAllSites(): AuctionSiteConfig[] {
    return Array.from(this.sites.values());
  }

  /**
   * Get enabled sites
   */
  getEnabledSites(): AuctionSiteConfig[] {
    return this.getAllSites().filter((s) => s.enabled);
  }

  /**
   * Remove a site
   */
  removeSite(siteId: string): void {
    this.sites.delete(siteId);
  }

  /**
   * Update site credentials
   */
  updateCredentials(siteId: string, username: string, password: string): void {
    const site = this.sites.get(siteId);
    if (site) {
      site.credentials = { username, password };
      site.enabled = true;
      console.log(`🔐 Updated credentials for: ${site.name}`);
    }
  }

  // ============================================================================
  // SUBMISSION
  // ============================================================================

  /**
   * Submit a deal to a specific auction site
   */
  async submitDeal(deal: NormalizedDeal, siteId: string): Promise<SubmissionResult> {
    const site = this.sites.get(siteId);
    if (!site) {
      return {
        success: false,
        siteId,
        siteName: 'Unknown',
        dealId: deal.externalId || `deal-${Date.now()}`,
        submittedAt: new Date(),
        error: `Site not found: ${siteId}`,
      };
    }

    if (!site.enabled) {
      return {
        success: false,
        siteId,
        siteName: site.name,
        dealId: deal.externalId || `deal-${Date.now()}`,
        submittedAt: new Date(),
        error: `Site not enabled: ${site.name}`,
      };
    }

    console.log(`📤 Submitting deal to ${site.name}...`);

    try {
      // Get or create page for this site
      const page = await this.browserService.newPage(`auction-${siteId}`);

      // Login if needed
      const loginResult = await this.browserService.login(page, {
        url: site.loginUrl,
        usernameSelector: site.selectors.usernameInput,
        passwordSelector: site.selectors.passwordInput,
        submitSelector: site.selectors.loginButton,
        username: site.credentials.username,
        password: site.credentials.password,
        successIndicator: site.selectors.loginSuccessIndicator,
      });

      if (!loginResult.success) {
        await page.close();
        return {
          success: false,
          siteId,
          siteName: site.name,
          dealId: deal.externalId || `deal-${Date.now()}`,
          submittedAt: new Date(),
          error: `Login failed: ${loginResult.error}`,
        };
      }

      // Navigate to submission page
      const navResult = await this.browserService.navigate(page, site.submitUrl);
      if (!navResult.success) {
        await page.close();
        return {
          success: false,
          siteId,
          siteName: site.name,
          dealId: deal.externalId || `deal-${Date.now()}`,
          submittedAt: new Date(),
          error: `Navigation failed: ${navResult.error}`,
          errorScreenshot: navResult.screenshot,
        };
      }

      // Build form fields from deal
      const fields = this.buildFormFields(deal, site);

      // Fill the form
      await this.browserService.fillForm(page, fields);

      // Submit the form
      const submitResult = await this.browserService.submitForm(page, site.selectors.submitButton, {
        waitForSelector: site.selectors.confirmationContainer,
        confirmationSelector: site.selectors.confirmationNumber,
        confirmationNumberPattern: /([A-Z0-9-]+)/i,
      });

      // Check for errors
      if (!submitResult.success) {
        // Try to get error message
        let errorMessage = submitResult.error;
        if (site.selectors.errorMessage) {
          const errorText = await this.browserService.getText(page, site.selectors.errorMessage);
          if (errorText) {
            errorMessage = errorText;
          }
        }

        await page.close();
        return {
          success: false,
          siteId,
          siteName: site.name,
          dealId: deal.externalId || `deal-${Date.now()}`,
          submittedAt: new Date(),
          error: errorMessage,
          errorScreenshot: submitResult.errorScreenshot,
        };
      }

      await page.close();

      const result: SubmissionResult = {
        success: true,
        siteId,
        siteName: site.name,
        dealId: deal.externalId || `deal-${Date.now()}`,
        confirmationNumber: submitResult.confirmationNumber,
        confirmationText: submitResult.confirmationText,
        submittedAt: new Date(),
        screenshot: submitResult.screenshot,
      };

      // Send webhook notification on success
      if (site.webhook) {
        await this.sendWebhook(site.webhook, result, deal);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        siteId,
        siteName: site.name,
        dealId: deal.externalId || `deal-${Date.now()}`,
        submittedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Submit a deal to multiple sites
   */
  async submitToMultipleSites(deal: NormalizedDeal, siteIds: string[]): Promise<SubmissionJob> {
    const jobId = `job-${Date.now()}`;
    const job: SubmissionJob = {
      id: jobId,
      deal,
      siteIds,
      status: 'in_progress',
      results: [],
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);

    console.log(`🚀 Starting submission job ${jobId} to ${siteIds.length} sites`);

    for (const siteId of siteIds) {
      const result = await this.submitDeal(deal, siteId);
      job.results.push(result);
    }

    job.status = job.results.every((r) => r.success) ? 'completed' : 'failed';
    job.completedAt = new Date();

    console.log(`✅ Submission job ${jobId} completed: ${job.status}`);

    return job;
  }

  /**
   * Submit to all enabled sites
   */
  async submitToAllEnabled(deal: NormalizedDeal): Promise<SubmissionJob> {
    const enabledSites = this.getEnabledSites();
    return this.submitToMultipleSites(
      deal,
      enabledSites.map((s) => s.id)
    );
  }

  // ============================================================================
  // FORM BUILDING
  // ============================================================================

  /**
   * Build form fields from deal data
   */
  private buildFormFields(deal: NormalizedDeal, site: AuctionSiteConfig): FormField[] {
    const fields: FormField[] = [];
    const selectors = site.selectors;

    // Address
    if (selectors.addressInput && deal.address?.street) {
      fields.push({
        selector: selectors.addressInput,
        value: deal.address.street,
        type: 'text',
      });
    }

    if (selectors.cityInput && deal.address?.city) {
      fields.push({
        selector: selectors.cityInput,
        value: deal.address.city,
        type: 'text',
      });
    }

    if (selectors.stateInput && deal.address?.state) {
      fields.push({
        selector: selectors.stateInput,
        value: deal.address.state,
        type: selectors.stateInput.includes('select') ? 'select' : 'text',
      });
    }

    if (selectors.zipInput && deal.address?.zip) {
      fields.push({
        selector: selectors.zipInput,
        value: deal.address.zip,
        type: 'text',
      });
    }

    // Price
    if (selectors.priceInput && deal.askingPrice) {
      fields.push({
        selector: selectors.priceInput,
        value: String(deal.askingPrice),
        type: 'text',
      });
    }

    // Property details
    if (selectors.bedroomsInput && deal.bedrooms) {
      fields.push({
        selector: selectors.bedroomsInput,
        value: String(deal.bedrooms),
        type: selectors.bedroomsInput.includes('select') ? 'select' : 'text',
      });
    }

    if (selectors.bathroomsInput && deal.bathrooms) {
      fields.push({
        selector: selectors.bathroomsInput,
        value: String(deal.bathrooms),
        type: selectors.bathroomsInput.includes('select') ? 'select' : 'text',
      });
    }

    if (selectors.sqftInput && deal.sqft) {
      fields.push({
        selector: selectors.sqftInput,
        value: String(deal.sqft),
        type: 'text',
      });
    }

    // Description
    if (selectors.descriptionInput && deal.description) {
      fields.push({
        selector: selectors.descriptionInput,
        value: deal.description,
        type: 'textarea',
      });
    }

    // Apply custom field mappings
    for (const [dealField, selector] of Object.entries(site.fieldMapping)) {
      const value = this.getNestedValue(deal, dealField);
      if (value !== undefined && value !== null) {
        fields.push({
          selector,
          value: String(value),
          type: 'text',
        });
      }
    }

    return fields;
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // ============================================================================
  // WEBHOOK NOTIFICATIONS
  // ============================================================================

  /**
   * Send webhook notification on successful submission
   */
  private async sendWebhook(
    webhook: WebhookConfig,
    result: SubmissionResult,
    deal: NormalizedDeal
  ): Promise<void> {
    try {
      console.log(`📡 Sending webhook to: ${webhook.url}`);

      const payload: any = {
        event: 'submission.success',
        timestamp: new Date().toISOString(),
        site: {
          id: result.siteId,
          name: result.siteName,
        },
        submission: {
          dealId: result.dealId,
          confirmationNumber: result.confirmationNumber,
          confirmationText: result.confirmationText,
          submittedAt: result.submittedAt,
        },
        deal: {
          address: deal.address,
          askingPrice: deal.askingPrice,
          bedrooms: deal.bedrooms,
          bathrooms: deal.bathrooms,
          sqft: deal.sqft,
          propertyType: deal.propertyType,
        },
      };

      // Include screenshot as base64 if configured
      if (webhook.includeScreenshot && result.screenshot) {
        const fs = await import('fs');
        if (fs.existsSync(result.screenshot)) {
          const screenshotBuffer = fs.readFileSync(result.screenshot);
          payload.screenshot = screenshotBuffer.toString('base64');
        }
      }

      const response = await fetch(webhook.url, {
        method: webhook.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...webhook.headers,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`✅ Webhook sent successfully: ${response.status}`);
      } else {
        console.error(`❌ Webhook failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Webhook error:', error instanceof Error ? error.message : error);
    }
  }

  // ============================================================================
  // JOB MANAGEMENT
  // ============================================================================

  /**
   * Get a submission job
   */
  getJob(jobId: string): SubmissionJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): SubmissionJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get recent jobs
   */
  getRecentJobs(limit: number = 10): SubmissionJob[] {
    return this.getAllJobs()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // ============================================================================
  // TESTING
  // ============================================================================

  /**
   * Test login to a site
   */
  async testLogin(siteId: string): Promise<{ success: boolean; error?: string }> {
    const site = this.sites.get(siteId);
    if (!site) {
      return { success: false, error: `Site not found: ${siteId}` };
    }

    try {
      const page = await this.browserService.newPage(`test-${siteId}`);

      const result = await this.browserService.login(page, {
        url: site.loginUrl,
        usernameSelector: site.selectors.usernameInput,
        passwordSelector: site.selectors.passwordInput,
        submitSelector: site.selectors.loginButton,
        username: site.credentials.username,
        password: site.credentials.password,
        successIndicator: site.selectors.loginSuccessIndicator,
      });

      await page.close();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    await this.browserService.close();
  }
}

// Export singleton instance
export const auctionSubmission = new AuctionSubmissionPlugin();
