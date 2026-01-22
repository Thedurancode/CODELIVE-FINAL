/**
 * CAPTCHA Solver Integration
 *
 * Integrates with third-party CAPTCHA solving services:
 * - 2Captcha
 * - Anti-Captcha
 * - CapSolver
 *
 * Supports:
 * - reCAPTCHA v2/v3
 * - hCaptcha
 * - Image CAPTCHA
 * - FunCaptcha
 */

import { Page, ElementHandle } from 'playwright';

export type CaptchaProvider = '2captcha' | 'anticaptcha' | 'capsolver';

export interface CaptchaSolverConfig {
  provider: CaptchaProvider;
  apiKey: string;
  timeout: number; // ms to wait for solution
  pollingInterval: number; // ms between status checks
}

export type CaptchaType = 'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha' | 'image' | 'funcaptcha';

export interface DetectedCaptcha {
  type: CaptchaType;
  sitekey?: string;
  pageUrl: string;
  element?: ElementHandle;
  data?: {
    action?: string; // for reCAPTCHA v3
    minScore?: number; // for reCAPTCHA v3
    imageBase64?: string; // for image CAPTCHA
  };
}

export interface CaptchaSolution {
  success: boolean;
  token?: string;
  error?: string;
  cost?: number;
  solveTime?: number;
}

const DEFAULT_CONFIG: Partial<CaptchaSolverConfig> = {
  timeout: 120000, // 2 minutes
  pollingInterval: 5000, // 5 seconds
};

// Provider API endpoints
const PROVIDER_ENDPOINTS = {
  '2captcha': {
    submit: 'https://2captcha.com/in.php',
    result: 'https://2captcha.com/res.php',
  },
  anticaptcha: {
    submit: 'https://api.anti-captcha.com/createTask',
    result: 'https://api.anti-captcha.com/getTaskResult',
  },
  capsolver: {
    submit: 'https://api.capsolver.com/createTask',
    result: 'https://api.capsolver.com/getTaskResult',
  },
};

export class CaptchaSolver {
  private config: CaptchaSolverConfig;

  constructor(config: Partial<CaptchaSolverConfig> & { provider: CaptchaProvider; apiKey: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config } as CaptchaSolverConfig;
  }

  // ============================================================================
  // DETECTION
  // ============================================================================

  /**
   * Detect any CAPTCHA on the page
   */
  async detectCaptcha(page: Page): Promise<DetectedCaptcha | null> {
    const pageUrl = page.url();

    // Check for reCAPTCHA v2
    const recaptchaV2 = await this.detectRecaptchaV2(page);
    if (recaptchaV2) {
      return { ...recaptchaV2, pageUrl } as DetectedCaptcha;
    }

    // Check for reCAPTCHA v3
    const recaptchaV3 = await this.detectRecaptchaV3(page);
    if (recaptchaV3) {
      return { ...recaptchaV3, pageUrl } as DetectedCaptcha;
    }

    // Check for hCaptcha
    const hcaptcha = await this.detectHCaptcha(page);
    if (hcaptcha) {
      return { ...hcaptcha, pageUrl } as DetectedCaptcha;
    }

    // Check for image CAPTCHA
    const imageCaptcha = await this.detectImageCaptcha(page);
    if (imageCaptcha) {
      return { ...imageCaptcha, pageUrl } as DetectedCaptcha;
    }

    return null;
  }

  private async detectRecaptchaV2(page: Page): Promise<Partial<DetectedCaptcha> | null> {
    const element = await page.$('.g-recaptcha, [data-sitekey]:not([data-action])');
    if (!element) return null;

    const sitekey = await element.getAttribute('data-sitekey');
    if (!sitekey) return null;

    return {
      type: 'recaptcha_v2',
      sitekey,
      element,
    };
  }

  private async detectRecaptchaV3(page: Page): Promise<Partial<DetectedCaptcha> | null> {
    // reCAPTCHA v3 is often loaded via script
    const hasV3 = await page.evaluate(() => {
      return !!(window as any).grecaptcha?.execute;
    });

    if (!hasV3) return null;

    // Try to find sitekey in scripts
    const sitekey = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[src*="recaptcha"]');
      for (const script of scripts) {
        const src = script.getAttribute('src') || '';
        const match = src.match(/render=([^&]+)/);
        if (match) return match[1];
      }
      return null;
    });

    if (!sitekey || sitekey === 'explicit') return null;

    return {
      type: 'recaptcha_v3',
      sitekey,
      data: {
        action: 'submit',
        minScore: 0.5,
      },
    };
  }

  private async detectHCaptcha(page: Page): Promise<Partial<DetectedCaptcha> | null> {
    const element = await page.$('.h-captcha, [data-hcaptcha-sitekey]');
    if (!element) return null;

    const sitekey =
      (await element.getAttribute('data-sitekey')) ||
      (await element.getAttribute('data-hcaptcha-sitekey'));

    if (!sitekey) return null;

    return {
      type: 'hcaptcha',
      sitekey,
      element,
    };
  }

  private async detectImageCaptcha(page: Page): Promise<Partial<DetectedCaptcha> | null> {
    const imageSelectors = [
      'img[src*="captcha"]',
      'img[alt*="captcha"]',
      'img[id*="captcha"]',
      '.captcha-image img',
      '#captcha img',
    ];

    for (const selector of imageSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Get image as base64
        const imageBase64 = await page.evaluate((el) => {
          const img = el as HTMLImageElement;
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        }, element);

        return {
          type: 'image',
          element,
          data: { imageBase64 },
        };
      }
    }

    return null;
  }

  // ============================================================================
  // SOLVING
  // ============================================================================

  /**
   * Solve a detected CAPTCHA
   */
  async solve(page: Page, captcha: DetectedCaptcha): Promise<CaptchaSolution> {
    console.log(`🔓 Solving ${captcha.type} CAPTCHA...`);
    const startTime = Date.now();

    try {
      let token: string | undefined;

      switch (captcha.type) {
        case 'recaptcha_v2':
          token = await this.solveRecaptchaV2(captcha);
          break;
        case 'recaptcha_v3':
          token = await this.solveRecaptchaV3(captcha);
          break;
        case 'hcaptcha':
          token = await this.solveHCaptcha(captcha);
          break;
        case 'image':
          token = await this.solveImageCaptcha(captcha);
          break;
        default:
          return { success: false, error: `Unsupported CAPTCHA type: ${captcha.type}` };
      }

      if (!token) {
        return { success: false, error: 'No solution received' };
      }

      // Inject token into page
      await this.injectToken(page, captcha, token);

      const solveTime = Date.now() - startTime;
      console.log(`✅ CAPTCHA solved in ${(solveTime / 1000).toFixed(1)}s`);

      return {
        success: true,
        token,
        solveTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        solveTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Detect and solve CAPTCHA if present
   */
  async detectAndSolve(page: Page): Promise<CaptchaSolution | null> {
    const captcha = await this.detectCaptcha(page);
    if (!captcha) {
      return null; // No CAPTCHA detected
    }

    return this.solve(page, captcha);
  }

  // ============================================================================
  // PROVIDER-SPECIFIC SOLVING
  // ============================================================================

  private async solveRecaptchaV2(captcha: DetectedCaptcha): Promise<string | undefined> {
    switch (this.config.provider) {
      case '2captcha':
        return this.solve2CaptchaRecaptcha(captcha);
      case 'anticaptcha':
        return this.solveAntiCaptchaRecaptcha(captcha);
      case 'capsolver':
        return this.solveCapsolverRecaptcha(captcha);
    }
  }

  private async solveRecaptchaV3(captcha: DetectedCaptcha): Promise<string | undefined> {
    // Similar to v2 but with action and minScore
    return this.solveRecaptchaV2(captcha);
  }

  private async solveHCaptcha(captcha: DetectedCaptcha): Promise<string | undefined> {
    switch (this.config.provider) {
      case '2captcha':
        return this.solve2CaptchaHCaptcha(captcha);
      case 'anticaptcha':
        return this.solveAntiCaptchaHCaptcha(captcha);
      case 'capsolver':
        return this.solveCapsolverHCaptcha(captcha);
    }
  }

  private async solveImageCaptcha(captcha: DetectedCaptcha): Promise<string | undefined> {
    if (!captcha.data?.imageBase64) {
      throw new Error('No image data for CAPTCHA');
    }

    switch (this.config.provider) {
      case '2captcha':
        return this.solve2CaptchaImage(captcha.data.imageBase64);
      case 'anticaptcha':
        return this.solveAntiCaptchaImage(captcha.data.imageBase64);
      case 'capsolver':
        return this.solveCapsolverImage(captcha.data.imageBase64);
    }
  }

  // ============================================================================
  // 2CAPTCHA IMPLEMENTATION
  // ============================================================================

  private async solve2CaptchaRecaptcha(captcha: DetectedCaptcha): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS['2captcha'];

    // Submit task
    const submitUrl = new URL(endpoint.submit);
    submitUrl.searchParams.set('key', this.config.apiKey);
    submitUrl.searchParams.set('method', 'userrecaptcha');
    submitUrl.searchParams.set('googlekey', captcha.sitekey!);
    submitUrl.searchParams.set('pageurl', captcha.pageUrl);
    submitUrl.searchParams.set('json', '1');

    if (captcha.type === 'recaptcha_v3') {
      submitUrl.searchParams.set('version', 'v3');
      submitUrl.searchParams.set('action', captcha.data?.action || 'submit');
      submitUrl.searchParams.set('min_score', String(captcha.data?.minScore || 0.5));
    }

    const submitResponse = await fetch(submitUrl.toString());
    const submitResult = await submitResponse.json();

    if (submitResult.status !== 1) {
      throw new Error(`2Captcha submit error: ${submitResult.request}`);
    }

    const taskId = submitResult.request;
    console.log(`📝 2Captcha task submitted: ${taskId}`);

    // Poll for result
    return this.poll2CaptchaResult(taskId);
  }

  private async solve2CaptchaHCaptcha(captcha: DetectedCaptcha): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS['2captcha'];

    const submitUrl = new URL(endpoint.submit);
    submitUrl.searchParams.set('key', this.config.apiKey);
    submitUrl.searchParams.set('method', 'hcaptcha');
    submitUrl.searchParams.set('sitekey', captcha.sitekey!);
    submitUrl.searchParams.set('pageurl', captcha.pageUrl);
    submitUrl.searchParams.set('json', '1');

    const submitResponse = await fetch(submitUrl.toString());
    const submitResult = await submitResponse.json();

    if (submitResult.status !== 1) {
      throw new Error(`2Captcha submit error: ${submitResult.request}`);
    }

    return this.poll2CaptchaResult(submitResult.request);
  }

  private async solve2CaptchaImage(imageBase64: string): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS['2captcha'];

    const submitUrl = new URL(endpoint.submit);
    submitUrl.searchParams.set('key', this.config.apiKey);
    submitUrl.searchParams.set('method', 'base64');
    submitUrl.searchParams.set('body', imageBase64);
    submitUrl.searchParams.set('json', '1');

    const submitResponse = await fetch(submitUrl.toString());
    const submitResult = await submitResponse.json();

    if (submitResult.status !== 1) {
      throw new Error(`2Captcha submit error: ${submitResult.request}`);
    }

    return this.poll2CaptchaResult(submitResult.request);
  }

  private async poll2CaptchaResult(taskId: string): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS['2captcha'];
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.timeout) {
      await this.sleep(this.config.pollingInterval);

      const resultUrl = new URL(endpoint.result);
      resultUrl.searchParams.set('key', this.config.apiKey);
      resultUrl.searchParams.set('action', 'get');
      resultUrl.searchParams.set('id', taskId);
      resultUrl.searchParams.set('json', '1');

      const resultResponse = await fetch(resultUrl.toString());
      const result = await resultResponse.json();

      if (result.status === 1) {
        return result.request;
      }

      if (result.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2Captcha error: ${result.request}`);
      }

      console.log('⏳ Waiting for CAPTCHA solution...');
    }

    throw new Error('CAPTCHA solving timeout');
  }

  // ============================================================================
  // ANTI-CAPTCHA IMPLEMENTATION
  // ============================================================================

  private async solveAntiCaptchaRecaptcha(captcha: DetectedCaptcha): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS.anticaptcha;

    const taskType =
      captcha.type === 'recaptcha_v3' ? 'RecaptchaV3TaskProxyless' : 'RecaptchaV2TaskProxyless';

    const submitResponse = await fetch(endpoint.submit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: this.config.apiKey,
        task: {
          type: taskType,
          websiteURL: captcha.pageUrl,
          websiteKey: captcha.sitekey,
          ...(captcha.type === 'recaptcha_v3' && {
            minScore: captcha.data?.minScore || 0.5,
            pageAction: captcha.data?.action || 'submit',
          }),
        },
      }),
    });

    const submitResult = await submitResponse.json();

    if (submitResult.errorId !== 0) {
      throw new Error(`Anti-Captcha error: ${submitResult.errorDescription}`);
    }

    return this.pollAntiCaptchaResult(submitResult.taskId);
  }

  private async solveAntiCaptchaHCaptcha(captcha: DetectedCaptcha): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS.anticaptcha;

    const submitResponse = await fetch(endpoint.submit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: this.config.apiKey,
        task: {
          type: 'HCaptchaTaskProxyless',
          websiteURL: captcha.pageUrl,
          websiteKey: captcha.sitekey,
        },
      }),
    });

    const submitResult = await submitResponse.json();

    if (submitResult.errorId !== 0) {
      throw new Error(`Anti-Captcha error: ${submitResult.errorDescription}`);
    }

    return this.pollAntiCaptchaResult(submitResult.taskId);
  }

  private async solveAntiCaptchaImage(imageBase64: string): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS.anticaptcha;

    const submitResponse = await fetch(endpoint.submit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: this.config.apiKey,
        task: {
          type: 'ImageToTextTask',
          body: imageBase64,
        },
      }),
    });

    const submitResult = await submitResponse.json();

    if (submitResult.errorId !== 0) {
      throw new Error(`Anti-Captcha error: ${submitResult.errorDescription}`);
    }

    return this.pollAntiCaptchaResult(submitResult.taskId);
  }

  private async pollAntiCaptchaResult(taskId: string): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS.anticaptcha;
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.timeout) {
      await this.sleep(this.config.pollingInterval);

      const resultResponse = await fetch(endpoint.result, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: this.config.apiKey,
          taskId,
        }),
      });

      const result = await resultResponse.json();

      if (result.status === 'ready') {
        return result.solution.gRecaptchaResponse || result.solution.token || result.solution.text;
      }

      if (result.errorId !== 0) {
        throw new Error(`Anti-Captcha error: ${result.errorDescription}`);
      }

      console.log('⏳ Waiting for CAPTCHA solution...');
    }

    throw new Error('CAPTCHA solving timeout');
  }

  // ============================================================================
  // CAPSOLVER IMPLEMENTATION
  // ============================================================================

  private async solveCapsolverRecaptcha(captcha: DetectedCaptcha): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS.capsolver;

    const taskType =
      captcha.type === 'recaptcha_v3' ? 'ReCaptchaV3TaskProxyLess' : 'ReCaptchaV2TaskProxyLess';

    const submitResponse = await fetch(endpoint.submit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: this.config.apiKey,
        task: {
          type: taskType,
          websiteURL: captcha.pageUrl,
          websiteKey: captcha.sitekey,
          ...(captcha.type === 'recaptcha_v3' && {
            pageAction: captcha.data?.action || 'submit',
            minScore: captcha.data?.minScore || 0.5,
          }),
        },
      }),
    });

    const submitResult = await submitResponse.json();

    if (submitResult.errorId !== 0) {
      throw new Error(`CapSolver error: ${submitResult.errorDescription}`);
    }

    return this.pollCapsolverResult(submitResult.taskId);
  }

  private async solveCapsolverHCaptcha(captcha: DetectedCaptcha): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS.capsolver;

    const submitResponse = await fetch(endpoint.submit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: this.config.apiKey,
        task: {
          type: 'HCaptchaTaskProxyLess',
          websiteURL: captcha.pageUrl,
          websiteKey: captcha.sitekey,
        },
      }),
    });

    const submitResult = await submitResponse.json();

    if (submitResult.errorId !== 0) {
      throw new Error(`CapSolver error: ${submitResult.errorDescription}`);
    }

    return this.pollCapsolverResult(submitResult.taskId);
  }

  private async solveCapsolverImage(imageBase64: string): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS.capsolver;

    const submitResponse = await fetch(endpoint.submit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: this.config.apiKey,
        task: {
          type: 'ImageToTextTask',
          body: imageBase64,
        },
      }),
    });

    const submitResult = await submitResponse.json();

    if (submitResult.errorId !== 0) {
      throw new Error(`CapSolver error: ${submitResult.errorDescription}`);
    }

    return this.pollCapsolverResult(submitResult.taskId);
  }

  private async pollCapsolverResult(taskId: string): Promise<string | undefined> {
    const endpoint = PROVIDER_ENDPOINTS.capsolver;
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.timeout) {
      await this.sleep(this.config.pollingInterval);

      const resultResponse = await fetch(endpoint.result, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: this.config.apiKey,
          taskId,
        }),
      });

      const result = await resultResponse.json();

      if (result.status === 'ready') {
        return result.solution.gRecaptchaResponse || result.solution.token || result.solution.text;
      }

      if (result.errorId !== 0) {
        throw new Error(`CapSolver error: ${result.errorDescription}`);
      }

      console.log('⏳ Waiting for CAPTCHA solution...');
    }

    throw new Error('CAPTCHA solving timeout');
  }

  // ============================================================================
  // TOKEN INJECTION
  // ============================================================================

  /**
   * Inject solved CAPTCHA token into page
   */
  private async injectToken(page: Page, captcha: DetectedCaptcha, token: string): Promise<void> {
    switch (captcha.type) {
      case 'recaptcha_v2':
      case 'recaptcha_v3':
        await page.evaluate((token) => {
          // Set response in textarea
          const textarea = document.querySelector('#g-recaptcha-response') as HTMLTextAreaElement;
          if (textarea) {
            textarea.value = token;
            textarea.style.display = 'block'; // Make visible for some sites
          }

          // Also set in any hidden inputs
          const hiddenInputs = document.querySelectorAll(
            'input[name="g-recaptcha-response"]'
          ) as NodeListOf<HTMLInputElement>;
          hiddenInputs.forEach((input) => {
            input.value = token;
          });

          // Try to call callback if exists
          const callback = (window as any).___grecaptcha_cfg?.clients?.[0]?.callback;
          if (typeof callback === 'function') {
            callback(token);
          }
        }, token);
        break;

      case 'hcaptcha':
        await page.evaluate((token) => {
          const textarea = document.querySelector(
            '[name="h-captcha-response"], [name="g-recaptcha-response"]'
          ) as HTMLTextAreaElement;
          if (textarea) {
            textarea.value = token;
          }

          // Try callback
          const iframe = document.querySelector('iframe[src*="hcaptcha"]') as HTMLIFrameElement;
          if (iframe) {
            const callback = (window as any).hcaptcha?.callbacks?.onSuccess;
            if (typeof callback === 'function') {
              callback(token);
            }
          }
        }, token);
        break;

      case 'image':
        // For image CAPTCHA, we need to type the solution into an input field
        const inputSelectors = [
          'input[name*="captcha"]',
          'input[id*="captcha"]',
          'input.captcha-input',
          '#captcha-input',
        ];

        for (const selector of inputSelectors) {
          const input = await page.$(selector);
          if (input) {
            await input.fill(token);
            break;
          }
        }
        break;
    }

    console.log('💉 CAPTCHA token injected');
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Factory function to create solver from environment variables
export function createCaptchaSolver(): CaptchaSolver | null {
  const provider = process.env.CAPTCHA_PROVIDER as CaptchaProvider;
  const apiKey = process.env.CAPTCHA_API_KEY;

  if (!provider || !apiKey) {
    console.log('⚠️ CAPTCHA solver not configured (set CAPTCHA_PROVIDER and CAPTCHA_API_KEY)');
    return null;
  }

  return new CaptchaSolver({
    provider,
    apiKey,
  });
}

export default CaptchaSolver;
