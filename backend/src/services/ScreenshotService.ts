/**
 * Screenshot Service
 *
 * Captures website screenshots using the Browserless API.
 * Uses direct data URLs for simplicity (no external storage required).
 */

// Browserless API configuration
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'https://production-sfo.browserless.io';

interface ScreenshotOptions {
  fullPage?: boolean;
  width?: number;
  height?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  delay?: number; // milliseconds to wait after page load
}

interface ScreenshotResult {
  success: boolean;
  url?: string;
  storagePath?: string;
  error?: string;
}

class ScreenshotService {
  private isConfigured(): boolean {
    return !!BROWSERLESS_API_KEY;
  }

  /**
   * Capture a screenshot of a URL using Browserless API
   */
  async captureScreenshot(
    targetUrl: string,
    options: ScreenshotOptions = {}
  ): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Browserless API key not configured' };
    }

    const {
      fullPage = false,
      width = 1280,
      height = 800,
      waitUntil = 'networkidle2',
      delay = 1000,
    } = options;

    try {
      // Validate URL
      const url = new URL(targetUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { success: false, error: 'Invalid URL protocol' };
      }

      // Browserless screenshot API endpoint
      const screenshotUrl = `${BROWSERLESS_URL}/chrome/screenshot?token=${BROWSERLESS_API_KEY}`;

      const response = await fetch(screenshotUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({
          url: targetUrl,
          gotoOptions: {
            waitUntil,
            timeout: 30000,
          },
          options: {
            fullPage,
            type: 'png',
          },
          viewport: {
            width,
            height,
          },
          waitForTimeout: delay,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ScreenshotService] Browserless API error:', response.status, errorText);
        return { success: false, error: `Browserless API error: ${response.status} - ${errorText}` };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return { success: true, buffer };
    } catch (error) {
      console.error('[ScreenshotService] Error capturing screenshot:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Capture a screenshot and return as data URL (no external storage needed)
   */
  async captureAndStore(
    targetUrl: string,
    projectId: string,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotResult> {
    // Capture the screenshot
    const captureResult = await this.captureScreenshot(targetUrl, options);

    if (!captureResult.success || !captureResult.buffer) {
      return { success: false, error: captureResult.error || 'Failed to capture screenshot' };
    }

    try {
      // Convert buffer to base64 data URL (stored directly in database)
      const base64 = captureResult.buffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      return {
        success: true,
        url: dataUrl,
        storagePath: `inline-${projectId}-${Date.now()}`,
      };
    } catch (error) {
      console.error('[ScreenshotService] Error processing screenshot:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Delete a stored screenshot (no-op for data URLs)
   */
  async deleteScreenshot(_storagePath: string): Promise<boolean> {
    // Data URLs are stored inline, nothing to delete externally
    return true;
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.isConfigured();
  }
}

export const screenshotService = new ScreenshotService();
export default screenshotService;
