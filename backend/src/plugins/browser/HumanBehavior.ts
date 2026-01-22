/**
 * Human Behavior Simulation for Browser Automation
 *
 * Simulates human-like interactions to avoid bot detection:
 * - Realistic typing with variable speed and occasional pauses
 * - Natural mouse movement with bezier curves
 * - Random scrolling patterns
 * - Human-like delays between actions
 */

import { Page, ElementHandle } from 'playwright';

export interface TypingConfig {
  minDelay: number; // Minimum ms between keystrokes
  maxDelay: number; // Maximum ms between keystrokes
  mistakeRate: number; // Probability of making a typo (0-1)
  thinkingPauseRate: number; // Probability of pausing to "think"
  thinkingPauseMin: number; // Minimum thinking pause ms
  thinkingPauseMax: number; // Maximum thinking pause ms
}

export interface MouseConfig {
  movementSteps: { min: number; max: number }; // Steps in mouse movement
  stepDelay: { min: number; max: number }; // Delay between steps
  overshootRate: number; // Probability of overshooting target
}

export interface ScrollConfig {
  minScrolls: number;
  maxScrolls: number;
  minDelta: number;
  maxDelta: number;
  delayBetween: { min: number; max: number };
}

const DEFAULT_TYPING_CONFIG: TypingConfig = {
  minDelay: 50,
  maxDelay: 150,
  mistakeRate: 0.02, // 2% chance of typo
  thinkingPauseRate: 0.05, // 5% chance of pause
  thinkingPauseMin: 200,
  thinkingPauseMax: 800,
};

const DEFAULT_MOUSE_CONFIG: MouseConfig = {
  movementSteps: { min: 10, max: 25 },
  stepDelay: { min: 5, max: 20 },
  overshootRate: 0.1, // 10% chance of overshooting
};

const DEFAULT_SCROLL_CONFIG: ScrollConfig = {
  minScrolls: 1,
  maxScrolls: 4,
  minDelta: 100,
  maxDelta: 400,
  delayBetween: { min: 300, max: 1000 },
};

export class HumanBehavior {
  private typingConfig: TypingConfig;
  private mouseConfig: MouseConfig;
  private scrollConfig: ScrollConfig;

  constructor(
    typingConfig: Partial<TypingConfig> = {},
    mouseConfig: Partial<MouseConfig> = {},
    scrollConfig: Partial<ScrollConfig> = {}
  ) {
    this.typingConfig = { ...DEFAULT_TYPING_CONFIG, ...typingConfig };
    this.mouseConfig = { ...DEFAULT_MOUSE_CONFIG, ...mouseConfig };
    this.scrollConfig = { ...DEFAULT_SCROLL_CONFIG, ...scrollConfig };
  }

  // ============================================================================
  // TYPING
  // ============================================================================

  /**
   * Type text like a human with variable speed, occasional mistakes, and pauses
   */
  async humanType(
    page: Page,
    selector: string,
    text: string,
    options: { clearFirst?: boolean; pressEnter?: boolean } = {}
  ): Promise<void> {
    // Click to focus
    await this.humanClick(page, selector);

    // Clear existing text if requested
    if (options.clearFirst) {
      await page.keyboard.press('Control+a');
      await this.randomDelay(50, 100);
      await page.keyboard.press('Backspace');
      await this.randomDelay(100, 200);
    }

    // Type each character
    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Simulate occasional typo
      if (Math.random() < this.typingConfig.mistakeRate && i > 0) {
        // Type wrong character
        const wrongChar = this.getAdjacentKey(char);
        await page.keyboard.type(wrongChar, {
          delay: this.randomInt(this.typingConfig.minDelay, this.typingConfig.maxDelay),
        });

        // Pause to "notice" mistake
        await this.randomDelay(150, 400);

        // Delete wrong character
        await page.keyboard.press('Backspace');
        await this.randomDelay(50, 150);
      }

      // Type the correct character
      const delay = this.randomInt(this.typingConfig.minDelay, this.typingConfig.maxDelay);
      await page.keyboard.type(char, { delay });

      // Occasional thinking pause
      if (Math.random() < this.typingConfig.thinkingPauseRate) {
        await this.randomDelay(
          this.typingConfig.thinkingPauseMin,
          this.typingConfig.thinkingPauseMax
        );
      }

      // Longer pause after punctuation
      if (['.', ',', '!', '?', ';', ':'].includes(char)) {
        await this.randomDelay(100, 300);
      }

      // Pause at word boundaries
      if (char === ' ' && Math.random() < 0.2) {
        await this.randomDelay(50, 200);
      }
    }

    if (options.pressEnter) {
      await this.randomDelay(100, 300);
      await page.keyboard.press('Enter');
    }
  }

  /**
   * Get an adjacent key on QWERTY keyboard for typo simulation
   */
  private getAdjacentKey(char: string): string {
    const keyboard: Record<string, string[]> = {
      q: ['w', 'a'],
      w: ['q', 'e', 's'],
      e: ['w', 'r', 'd'],
      r: ['e', 't', 'f'],
      t: ['r', 'y', 'g'],
      y: ['t', 'u', 'h'],
      u: ['y', 'i', 'j'],
      i: ['u', 'o', 'k'],
      o: ['i', 'p', 'l'],
      p: ['o', 'l'],
      a: ['q', 's', 'z'],
      s: ['a', 'd', 'w', 'x'],
      d: ['s', 'f', 'e', 'c'],
      f: ['d', 'g', 'r', 'v'],
      g: ['f', 'h', 't', 'b'],
      h: ['g', 'j', 'y', 'n'],
      j: ['h', 'k', 'u', 'm'],
      k: ['j', 'l', 'i'],
      l: ['k', 'o', 'p'],
      z: ['a', 'x'],
      x: ['z', 'c', 's'],
      c: ['x', 'v', 'd'],
      v: ['c', 'b', 'f'],
      b: ['v', 'n', 'g'],
      n: ['b', 'm', 'h'],
      m: ['n', 'j'],
      '1': ['2', 'q'],
      '2': ['1', '3', 'w'],
      '3': ['2', '4', 'e'],
      '4': ['3', '5', 'r'],
      '5': ['4', '6', 't'],
      '6': ['5', '7', 'y'],
      '7': ['6', '8', 'u'],
      '8': ['7', '9', 'i'],
      '9': ['8', '0', 'o'],
      '0': ['9', 'p'],
    };

    const lowerChar = char.toLowerCase();
    const adjacents = keyboard[lowerChar];

    if (adjacents && adjacents.length > 0) {
      const wrongKey = adjacents[Math.floor(Math.random() * adjacents.length)];
      return char === char.toUpperCase() ? wrongKey.toUpperCase() : wrongKey;
    }

    return char; // Return original if no adjacent found
  }

  // ============================================================================
  // MOUSE MOVEMENT
  // ============================================================================

  /**
   * Click on an element with human-like mouse movement
   */
  async humanClick(
    page: Page,
    selector: string,
    options: { doubleClick?: boolean; rightClick?: boolean } = {}
  ): Promise<void> {
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const box = await element.boundingBox();
    if (!box) {
      throw new Error(`Element has no bounding box: ${selector}`);
    }

    // Calculate target point (random position within element)
    const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
    const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

    // Move mouse naturally
    await this.humanMouseMove(page, targetX, targetY);

    // Small delay before click
    await this.randomDelay(50, 150);

    // Click
    if (options.doubleClick) {
      await page.mouse.dblclick(targetX, targetY);
    } else if (options.rightClick) {
      await page.mouse.click(targetX, targetY, { button: 'right' });
    } else {
      await page.mouse.click(targetX, targetY);
    }

    // Small delay after click
    await this.randomDelay(100, 200);
  }

  /**
   * Move mouse in a natural curve to target position
   */
  async humanMouseMove(page: Page, targetX: number, targetY: number): Promise<void> {
    // Get current mouse position (or start from random edge)
    const viewport = page.viewportSize() || { width: 1920, height: 1080 };
    const startX = Math.random() * viewport.width;
    const startY = Math.random() * viewport.height;

    const steps = this.randomInt(
      this.mouseConfig.movementSteps.min,
      this.mouseConfig.movementSteps.max
    );

    // Generate control points for bezier curve
    const controlX = startX + (targetX - startX) * 0.5 + (Math.random() - 0.5) * 100;
    const controlY = startY + (targetY - startY) * 0.5 + (Math.random() - 0.5) * 100;

    // Handle overshoot
    let finalX = targetX;
    let finalY = targetY;
    const shouldOvershoot = Math.random() < this.mouseConfig.overshootRate;

    if (shouldOvershoot) {
      finalX += (Math.random() - 0.5) * 30;
      finalY += (Math.random() - 0.5) * 30;
    }

    // Move along bezier curve
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = this.bezierPoint(startX, controlX, finalX, t);
      const y = this.bezierPoint(startY, controlY, finalY, t);

      await page.mouse.move(x, y);

      const delay = this.randomInt(
        this.mouseConfig.stepDelay.min,
        this.mouseConfig.stepDelay.max
      );
      await this.sleep(delay);
    }

    // Correct overshoot
    if (shouldOvershoot) {
      await this.sleep(50);
      await page.mouse.move(targetX, targetY);
    }
  }

  /**
   * Calculate point on quadratic bezier curve
   */
  private bezierPoint(start: number, control: number, end: number, t: number): number {
    const invT = 1 - t;
    return invT * invT * start + 2 * invT * t * control + t * t * end;
  }

  // ============================================================================
  // SCROLLING
  // ============================================================================

  /**
   * Scroll page like a human (variable speed, pauses to read)
   */
  async humanScroll(
    page: Page,
    options: { direction?: 'down' | 'up'; scrollToElement?: string } = {}
  ): Promise<void> {
    const direction = options.direction || 'down';

    if (options.scrollToElement) {
      // Scroll to specific element
      const element = await page.$(options.scrollToElement);
      if (element) {
        await element.scrollIntoViewIfNeeded();
        await this.randomDelay(200, 500);
      }
      return;
    }

    // Random number of scrolls
    const scrollCount = this.randomInt(
      this.scrollConfig.minScrolls,
      this.scrollConfig.maxScrolls
    );

    for (let i = 0; i < scrollCount; i++) {
      const delta = this.randomInt(this.scrollConfig.minDelta, this.scrollConfig.maxDelta);
      const scrollDelta = direction === 'down' ? delta : -delta;

      await page.mouse.wheel(0, scrollDelta);

      // Pause to "read" content
      const pauseDuration = this.randomInt(
        this.scrollConfig.delayBetween.min,
        this.scrollConfig.delayBetween.max
      );
      await this.sleep(pauseDuration);
    }
  }

  /**
   * Scroll to bottom of page gradually
   */
  async scrollToBottom(page: Page): Promise<void> {
    let previousHeight = 0;
    let currentHeight = await page.evaluate(() => document.body.scrollHeight);

    while (previousHeight !== currentHeight) {
      previousHeight = currentHeight;
      await this.humanScroll(page, { direction: 'down' });
      await this.randomDelay(500, 1000);
      currentHeight = await page.evaluate(() => document.body.scrollHeight);
    }
  }

  // ============================================================================
  // RANDOM DELAYS
  // ============================================================================

  /**
   * Add a random delay between actions
   */
  async randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = this.randomInt(minMs, maxMs);
    await this.sleep(delay);
  }

  /**
   * Wait for a random time simulating reading/thinking
   */
  async thinkingPause(): Promise<void> {
    await this.randomDelay(500, 2000);
  }

  /**
   * Wait after page load simulating reading
   */
  async readingPause(): Promise<void> {
    await this.randomDelay(1000, 3000);
  }

  /**
   * Short pause between form fields
   */
  async betweenFieldsPause(): Promise<void> {
    await this.randomDelay(200, 600);
  }

  // ============================================================================
  // FORM INTERACTION
  // ============================================================================

  /**
   * Fill a form field like a human
   */
  async fillField(
    page: Page,
    selector: string,
    value: string,
    options: { clearFirst?: boolean } = {}
  ): Promise<void> {
    await this.humanClick(page, selector);
    await this.randomDelay(100, 200);
    await this.humanType(page, selector, value, { clearFirst: options.clearFirst });
  }

  /**
   * Select option from dropdown like a human
   */
  async selectOption(page: Page, selector: string, value: string): Promise<void> {
    await this.humanClick(page, selector);
    await this.randomDelay(150, 300);

    // Try to find and click option, or use selectOption
    try {
      const optionSelector = `${selector} option[value="${value}"]`;
      const option = await page.$(optionSelector);
      if (option) {
        await page.selectOption(selector, value);
      }
    } catch {
      await page.selectOption(selector, value);
    }

    await this.randomDelay(100, 200);
  }

  /**
   * Check/uncheck checkbox like a human
   */
  async toggleCheckbox(page: Page, selector: string, shouldBeChecked: boolean): Promise<void> {
    const isChecked = await page.isChecked(selector);

    if (isChecked !== shouldBeChecked) {
      await this.humanClick(page, selector);
    }

    await this.randomDelay(100, 200);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance with default config
export const humanBehavior = new HumanBehavior();
export default humanBehavior;
