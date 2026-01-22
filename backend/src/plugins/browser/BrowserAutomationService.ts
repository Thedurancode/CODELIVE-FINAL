/**
 * Browser Automation Service - Production Hardened
 *
 * Core Playwright wrapper for browser automation tasks with:
 * - Anti-detection and stealth measures
 * - Human-like behavior simulation
 * - Proxy rotation support
 * - CAPTCHA solving integration
 * - Retry logic and circuit breaker
 * - Comprehensive metrics and monitoring
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Import production-hardening modules
import {
  StealthConfig,
  DEFAULT_STEALTH_CONFIG,
  STEALTH_BROWSER_ARGS,
  getAntiDetectionScript,
  generateFingerprint,
} from './StealthConfig';
import { HumanBehavior, humanBehavior } from './HumanBehavior';
import { ResilienceLayer, resilienceLayer } from './ResilienceLayer';
import { ProxyManager, proxyManager, Proxy } from './ProxyManager';
import { CaptchaSolver, createCaptchaSolver, DetectedCaptcha } from './CaptchaSolver';
import { SmartSelector, smartSelector } from './SmartSelector';
import { BrowserMetrics, browserMetrics, SubmissionTracker } from './BrowserMetrics';

export interface BrowserConfig {
  headless?: boolean;
  slowMo?: number;
  timeout?: number;
  screenshotDir?: string;
  userDataDir?: string;
  // Production-hardening options
  stealth?: StealthConfig;
  useHumanBehavior?: boolean;
  useProxy?: boolean;
  useCaptchaSolver?: boolean;
  useRetry?: boolean;
  useMetrics?: boolean;
}

export interface SessionConfig {
  name: string;
  cookies?: any[];
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
}

export interface NavigationResult {
  success: boolean;
  url: string;
  title?: string;
  screenshot?: string;
  error?: string;
}

export interface FormField {
  selector: string;
  value: string;
  type: 'text' | 'select' | 'checkbox' | 'radio' | 'file' | 'textarea';
  waitFor?: string;
}

export interface FormSubmitResult {
  success: boolean;
  confirmationText?: string;
  confirmationNumber?: string;
  screenshot?: string;
  error?: string;
  errorScreenshot?: string;
}

const DEFAULT_CONFIG: BrowserConfig = {
  headless: true, // Headless for production
  slowMo: 50,
  timeout: 30000,
  screenshotDir: '/tmp/screenshots',
  stealth: DEFAULT_STEALTH_CONFIG,
  useHumanBehavior: true,
  useProxy: false,
  useCaptchaSolver: true,
  useRetry: true,
  useMetrics: true,
};

export class BrowserAutomationService {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private config: BrowserConfig;
  private sessionDir: string;

  // Production-hardening services
  private humanBehavior: HumanBehavior;
  private resilience: ResilienceLayer;
  private proxyManager: ProxyManager;
  private captchaSolver: CaptchaSolver | null;
  private smartSelector: SmartSelector;
  private metrics: BrowserMetrics;

  constructor(config: BrowserConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionDir = path.join('/tmp', 'browser-sessions');

    // Initialize production services
    this.humanBehavior = humanBehavior;
    this.resilience = resilienceLayer;
    this.proxyManager = proxyManager;
    this.captchaSolver = this.config.useCaptchaSolver ? createCaptchaSolver() : null;
    this.smartSelector = smartSelector;
    this.metrics = browserMetrics;

    // Ensure directories exist (wrapped in try-catch for production environments)
    try {
      if (!fs.existsSync(this.config.screenshotDir!)) {
        fs.mkdirSync(this.config.screenshotDir!, { recursive: true });
      }
      if (!fs.existsSync(this.sessionDir)) {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      }
    } catch (err) {
      console.warn('⚠️ Could not create browser directories:', (err as Error).message);
    }
  }

  // ============================================================================
  // BROWSER LIFECYCLE
  // ============================================================================

  /**
   * Initialize the browser with stealth measures
   */
  async initialize(): Promise<void> {
    if (this.browser) return;

    console.log('🌐 Launching browser with stealth mode...');

    const stealth = this.config.stealth || DEFAULT_STEALTH_CONFIG;

    this.browser = await chromium.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo,
      args: STEALTH_BROWSER_ARGS,
    });

    console.log('✅ Browser launched with anti-detection measures');
  }

  /**
   * Close the browser and all contexts
   */
  async close(): Promise<void> {
    for (const [name, context] of this.contexts) {
      await this.saveSession(name, context);
      await context.close();
    }
    this.contexts.clear();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    console.log('🔒 Browser closed');
  }

  /**
   * Get or create a browser context for a session with stealth
   */
  async getContext(sessionName: string, proxy?: Proxy): Promise<BrowserContext> {
    const contextKey = proxy ? `${sessionName}-${proxy.id}` : sessionName;

    if (this.contexts.has(contextKey)) {
      return this.contexts.get(contextKey)!;
    }

    await this.initialize();

    const stealth = this.config.stealth || DEFAULT_STEALTH_CONFIG;
    const fingerprint = stealth.fingerprint;

    // Try to load existing session
    const sessionPath = path.join(this.sessionDir, `${sessionName}.json`);
    let context: BrowserContext;

    const contextOptions: any = {
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezone,
      deviceScaleFactor: fingerprint.deviceScaleFactor,
      permissions: ['geolocation'],
    };

    // Add proxy if provided
    if (proxy) {
      contextOptions.proxy = {
        server: `${proxy.protocol}://${proxy.host}:${proxy.port}`,
        username: proxy.username,
        password: proxy.password,
      };
    } else if (this.config.useProxy) {
      // Auto-select proxy
      const autoProxy = this.proxyManager.getNextProxy();
      if (autoProxy) {
        contextOptions.proxy = {
          server: `${autoProxy.protocol}://${autoProxy.host}:${autoProxy.port}`,
          username: autoProxy.username,
          password: autoProxy.password,
        };
      }
    }

    if (fs.existsSync(sessionPath)) {
      console.log(`📂 Loading session: ${sessionName}`);
      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      context = await this.browser!.newContext({
        ...contextOptions,
        storageState: sessionData,
      });
    } else {
      console.log(`🆕 Creating new session: ${sessionName}`);
      context = await this.browser!.newContext(contextOptions);
    }

    // Inject anti-detection scripts
    await context.addInitScript(getAntiDetectionScript(stealth.antiDetection));

    context.setDefaultTimeout(this.config.timeout!);
    this.contexts.set(contextKey, context);
    return context;
  }

  /**
   * Save session state to file
   */
  private async saveSession(name: string, context: BrowserContext): Promise<void> {
    const sessionPath = path.join(this.sessionDir, `${name}.json`);
    const state = await context.storageState();
    fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2));
    console.log(`💾 Session saved: ${name}`);
  }

  /**
   * Create a new page in a session
   */
  async newPage(sessionName: string, proxy?: Proxy): Promise<Page> {
    const context = await this.getContext(sessionName, proxy);
    const page = await context.newPage();

    // Inject anti-detection for each new page
    const stealth = this.config.stealth || DEFAULT_STEALTH_CONFIG;
    await page.addInitScript(getAntiDetectionScript(stealth.antiDetection));

    return page;
  }

  // ============================================================================
  // NAVIGATION WITH RETRY
  // ============================================================================

  /**
   * Navigate to a URL with retry and stealth
   */
  async navigate(page: Page, url: string, waitFor?: string): Promise<NavigationResult> {
    const operation = async (): Promise<NavigationResult> => {
      try {
        console.log(`🔗 Navigating to: ${url}`);

        // Add human-like delay before navigation
        if (this.config.useHumanBehavior) {
          await this.humanBehavior.randomDelay(500, 1500);
        }

        await page.goto(url, { waitUntil: 'networkidle' });

        if (waitFor) {
          await page.waitForSelector(waitFor, { timeout: this.config.timeout });
        }

        // Human-like reading pause
        if (this.config.useHumanBehavior) {
          await this.humanBehavior.readingPause();
        }

        // Check for CAPTCHA
        if (this.captchaSolver) {
          const captcha = await this.captchaSolver.detectCaptcha(page);
          if (captcha) {
            console.log('🔓 CAPTCHA detected, solving...');
            await this.captchaSolver.solve(page, captcha);
          }
        }

        const title = await page.title();
        const screenshot = await this.takeScreenshot(page, `nav-${Date.now()}`);

        return {
          success: true,
          url: page.url(),
          title,
          screenshot,
        };
      } catch (error: any) {
        const errorScreenshot = await this.takeScreenshot(page, `error-${Date.now()}`);
        throw {
          message: error?.message || String(error),
          screenshot: errorScreenshot,
          url: page.url()
        };
      }
    };

    if (this.config.useRetry) {
      try {
        return await this.resilience.withRetry(`navigate-${url}`, operation);
      } catch (error: any) {
        return {
          success: false,
          url: error.url || url,
          error: error.message || String(error),
          screenshot: error.screenshot,
        };
      }
    }

    return operation();
  }

  /**
   * Wait for navigation after an action
   */
  async waitForNavigation(page: Page, action: () => Promise<void>): Promise<void> {
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), action()]);
  }

  // ============================================================================
  // LOGIN WITH ALL FEATURES
  // ============================================================================

  /**
   * Perform login with human-like behavior, CAPTCHA solving, and retry
   */
  async login(
    page: Page,
    config: {
      url: string;
      usernameSelector: string;
      passwordSelector: string;
      submitSelector: string;
      username: string;
      password: string;
      successIndicator: string;
      mfaHandler?: () => Promise<string>;
    },
    tracker?: SubmissionTracker
  ): Promise<{ success: boolean; error?: string }> {
    const operation = async (): Promise<{ success: boolean; error?: string }> => {
      try {
        console.log(`🔐 Logging in to: ${config.url}`);
        tracker?.startStep('navigate_to_login');

        // Navigate to login page
        await page.goto(config.url, { waitUntil: 'networkidle' });

        // Human-like pause after page load
        if (this.config.useHumanBehavior) {
          await this.humanBehavior.readingPause();
        }

        tracker?.endStep(true);

        // Check if already logged in
        tracker?.startStep('check_login_status');
        try {
          const alreadyLoggedIn = await Promise.race([
            page.waitForSelector(config.successIndicator, { timeout: 5000 }).then(() => true),
            page.waitForSelector(config.usernameSelector, { timeout: 5000 }).then(() => false),
          ]);

          if (alreadyLoggedIn) {
            console.log('✅ Already logged in (session restored)');
            tracker?.endStep(true);
            return { success: true };
          }
        } catch {
          const hasLoginForm = await page.$(config.usernameSelector);
          if (!hasLoginForm) {
            // Try smart selector detection
            const detected = await this.smartSelector.findLoginForm(page);
            if (detected) {
              config.usernameSelector = detected.usernameSelector;
              config.passwordSelector = detected.passwordSelector;
              config.submitSelector = detected.submitSelector;
            } else {
              console.log('✅ Already logged in (no login form found)');
              tracker?.endStep(true);
              return { success: true };
            }
          }
        }
        tracker?.endStep(true);

        // Check for CAPTCHA before login
        if (this.captchaSolver) {
          const captcha = await this.captchaSolver.detectCaptcha(page);
          if (captcha) {
            tracker?.startStep('solve_captcha');
            const result = await this.captchaSolver.solve(page, captcha);
            tracker?.endStep(result.success, result.error);
            if (result.success) {
              tracker?.setCaptchaSolved();
            }
          }
        }

        // Fill credentials with human-like behavior
        tracker?.startStep('fill_credentials');
        if (this.config.useHumanBehavior) {
          await this.humanBehavior.fillField(page, config.usernameSelector, config.username);
          await this.humanBehavior.betweenFieldsPause();
          await this.humanBehavior.fillField(page, config.passwordSelector, config.password);
          await this.humanBehavior.betweenFieldsPause();
        } else {
          await page.fill(config.usernameSelector, config.username);
          await page.fill(config.passwordSelector, config.password);
        }
        tracker?.endStep(true);

        // Submit and wait for navigation
        tracker?.startStep('submit_login');
        await this.waitForNavigation(page, async () => {
          if (this.config.useHumanBehavior) {
            await this.humanBehavior.humanClick(page, config.submitSelector);
          } else {
            await page.click(config.submitSelector);
          }
        });
        tracker?.endStep(true);

        // Check for MFA
        if (config.mfaHandler) {
          const mfaInput = await page.$(
            'input[name*="mfa"], input[name*="code"], input[name*="otp"]'
          );
          if (mfaInput) {
            tracker?.startStep('handle_mfa');
            console.log('🔢 MFA required');
            const code = await config.mfaHandler();
            await mfaInput.fill(code);
            await page.keyboard.press('Enter');
            await page.waitForNavigation({ waitUntil: 'networkidle' });
            tracker?.endStep(true);
          }
        }

        // Check for post-login CAPTCHA
        if (this.captchaSolver) {
          const postCaptcha = await this.captchaSolver.detectCaptcha(page);
          if (postCaptcha) {
            tracker?.startStep('solve_post_login_captcha');
            const result = await this.captchaSolver.solve(page, postCaptcha);
            tracker?.endStep(result.success, result.error);
            if (result.success) {
              tracker?.setCaptchaSolved();
            }
          }
        }

        // Verify login success
        tracker?.startStep('verify_login');
        await page.waitForSelector(config.successIndicator, { timeout: 10000 });
        console.log('✅ Login successful');
        tracker?.endStep(true);

        return { success: true };
      } catch (error) {
        await this.takeScreenshot(page, `login-error-${Date.now()}`);
        throw error;
      }
    };

    if (this.config.useRetry) {
      try {
        return await this.resilience.withRetry(`login-${config.url}`, operation);
      } catch (error: any) {
        tracker?.endStep(false, error.message);
        return {
          success: false,
          error: error.message || String(error),
        };
      }
    }

    try {
      return await operation();
    } catch (error: any) {
      tracker?.endStep(false, error.message);
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  // ============================================================================
  // FORM HANDLING WITH HUMAN BEHAVIOR
  // ============================================================================

  /**
   * Fill a form with human-like behavior
   */
  async fillForm(page: Page, fields: FormField[], tracker?: SubmissionTracker): Promise<void> {
    tracker?.startStep('fill_form');

    for (const field of fields) {
      console.log(`📝 Filling: ${field.selector}`);

      if (field.waitFor) {
        await page.waitForSelector(field.waitFor);
      }

      if (this.config.useHumanBehavior) {
        switch (field.type) {
          case 'text':
          case 'textarea':
            await this.humanBehavior.fillField(page, field.selector, field.value);
            break;

          case 'select':
            await this.humanBehavior.selectOption(page, field.selector, field.value);
            break;

          case 'checkbox':
            await this.humanBehavior.toggleCheckbox(page, field.selector, field.value === 'true');
            break;

          case 'radio':
            await this.humanBehavior.humanClick(page, field.selector);
            break;

          case 'file':
            await page.setInputFiles(field.selector, field.value);
            break;
        }

        await this.humanBehavior.betweenFieldsPause();
      } else {
        switch (field.type) {
          case 'text':
          case 'textarea':
            await page.fill(field.selector, field.value);
            break;

          case 'select':
            await page.selectOption(field.selector, field.value);
            break;

          case 'checkbox':
            if (field.value === 'true') {
              await page.check(field.selector);
            } else {
              await page.uncheck(field.selector);
            }
            break;

          case 'radio':
            await page.check(field.selector);
            break;

          case 'file':
            await page.setInputFiles(field.selector, field.value);
            break;
        }

        await page.waitForTimeout(100);
      }
    }

    tracker?.endStep(true);
  }

  /**
   * Submit a form with retry and CAPTCHA handling
   */
  async submitForm(
    page: Page,
    submitSelector: string,
    options: {
      waitForSelector?: string;
      waitForUrl?: string | RegExp;
      confirmationSelector?: string;
      confirmationNumberPattern?: RegExp;
    } = {},
    tracker?: SubmissionTracker
  ): Promise<FormSubmitResult> {
    const operation = async (): Promise<FormSubmitResult> => {
      try {
        console.log('📤 Submitting form...');
        tracker?.startStep('submit_form');

        // Pre-submit CAPTCHA check
        if (this.captchaSolver) {
          const captcha = await this.captchaSolver.detectCaptcha(page);
          if (captcha) {
            const result = await this.captchaSolver.solve(page, captcha);
            if (result.success) {
              tracker?.setCaptchaSolved();
            }
          }
        }

        // Take pre-submit screenshot
        await this.takeScreenshot(page, `pre-submit-${Date.now()}`);

        // Click submit with human-like behavior
        if (this.config.useHumanBehavior) {
          await this.humanBehavior.humanClick(page, submitSelector);
        } else {
          await page.click(submitSelector);
        }

        // Wait for result
        if (options.waitForUrl) {
          await page.waitForURL(options.waitForUrl, { timeout: this.config.timeout });
        } else if (options.waitForSelector) {
          await page.waitForSelector(options.waitForSelector, { timeout: this.config.timeout });
        } else {
          await page.waitForLoadState('networkidle');
        }

        tracker?.endStep(true);

        // Post-submit CAPTCHA check
        if (this.captchaSolver) {
          const postCaptcha = await this.captchaSolver.detectCaptcha(page);
          if (postCaptcha) {
            tracker?.startStep('solve_post_submit_captcha');
            const result = await this.captchaSolver.solve(page, postCaptcha);
            tracker?.endStep(result.success, result.error);
            if (result.success) {
              tracker?.setCaptchaSolved();
            }
          }
        }

        // Extract confirmation
        tracker?.startStep('extract_confirmation');
        let confirmationText: string | undefined;
        let confirmationNumber: string | undefined;

        if (options.confirmationSelector) {
          const element = await page.$(options.confirmationSelector);
          if (element) {
            confirmationText = (await element.textContent()) || undefined;
          }
        }

        if (options.confirmationNumberPattern && confirmationText) {
          const match = confirmationText.match(options.confirmationNumberPattern);
          if (match) {
            confirmationNumber = match[1] || match[0];
          }
        }

        const screenshot = await this.takeScreenshot(page, `submit-success-${Date.now()}`);
        tracker?.endStep(true);

        console.log('✅ Form submitted successfully');

        return {
          success: true,
          confirmationText,
          confirmationNumber,
          screenshot,
        };
      } catch (error: any) {
        const errorScreenshot = await this.takeScreenshot(page, `submit-error-${Date.now()}`);
        throw { message: error?.message || String(error), errorScreenshot };
      }
    };

    if (this.config.useRetry) {
      try {
        return await this.resilience.withRetry('form-submit', operation);
      } catch (error: any) {
        tracker?.endStep(false, error.message);
        return {
          success: false,
          error: error.message || String(error),
          errorScreenshot: error.errorScreenshot,
        };
      }
    }

    try {
      return await operation();
    } catch (error: any) {
      tracker?.endStep(false, error.message);
      return {
        success: false,
        error: error.message || String(error),
        errorScreenshot: error.errorScreenshot,
      };
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Take a screenshot
   */
  async takeScreenshot(page: Page, name: string): Promise<string> {
    const filename = `${name}.png`;
    const filepath = path.join(this.config.screenshotDir!, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  }

  /**
   * Get text content from a selector
   */
  async getText(page: Page, selector: string): Promise<string | null> {
    const element = await page.$(selector);
    return element ? element.textContent() : null;
  }

  /**
   * Check if an element exists
   */
  async exists(page: Page, selector: string): Promise<boolean> {
    const element = await page.$(selector);
    return element !== null;
  }

  /**
   * Wait for a selector with custom timeout
   */
  async waitFor(page: Page, selector: string, timeout?: number): Promise<boolean> {
    try {
      await page.waitForSelector(selector, { timeout: timeout || this.config.timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute custom JavaScript in page context
   */
  async evaluate<T>(page: Page, fn: () => T): Promise<T> {
    return page.evaluate(fn);
  }

  /**
   * Get all cookies from a context
   */
  async getCookies(sessionName: string): Promise<any[]> {
    const context = await this.getContext(sessionName);
    return context.cookies();
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.browser !== null;
  }

  // ============================================================================
  // SERVICE ACCESSORS
  // ============================================================================

  /**
   * Get the human behavior service
   */
  getHumanBehavior(): HumanBehavior {
    return this.humanBehavior;
  }

  /**
   * Get the resilience layer
   */
  getResilience(): ResilienceLayer {
    return this.resilience;
  }

  /**
   * Get the proxy manager
   */
  getProxyManager(): ProxyManager {
    return this.proxyManager;
  }

  /**
   * Get the CAPTCHA solver
   */
  getCaptchaSolver(): CaptchaSolver | null {
    return this.captchaSolver;
  }

  /**
   * Get the smart selector
   */
  getSmartSelector(): SmartSelector {
    return this.smartSelector;
  }

  /**
   * Get the metrics service
   */
  getMetrics(): BrowserMetrics {
    return this.metrics;
  }

  /**
   * Start tracking a submission
   */
  startSubmissionTracking(siteId: string, siteName: string, dealId: string): SubmissionTracker {
    return this.metrics.startSubmission(siteId, siteName, dealId);
  }
}

// Export singleton instance
export const browserAutomation = new BrowserAutomationService();
export default browserAutomation;
