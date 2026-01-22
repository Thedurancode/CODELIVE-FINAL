/**
 * HumanBehavior Unit Tests
 */

import { HumanBehavior, TypingConfig, MouseConfig, ScrollConfig } from '../../plugins/browser/HumanBehavior';

// Mock Playwright Page
const createMockPage = () => ({
  $: jest.fn(),
  keyboard: {
    type: jest.fn(),
    press: jest.fn(),
  },
  mouse: {
    move: jest.fn(),
    click: jest.fn(),
    dblclick: jest.fn(),
    wheel: jest.fn(),
  },
  viewportSize: jest.fn().mockReturnValue({ width: 1920, height: 1080 }),
  evaluate: jest.fn(),
  isChecked: jest.fn(),
  selectOption: jest.fn(),
});

describe('HumanBehavior', () => {
  let humanBehavior: HumanBehavior;

  beforeEach(() => {
    jest.clearAllMocks();
    // Use fast timing for tests
    humanBehavior = new HumanBehavior(
      { minDelay: 1, maxDelay: 2, mistakeRate: 0, thinkingPauseRate: 0 },
      { movementSteps: { min: 2, max: 3 }, stepDelay: { min: 1, max: 2 }, overshootRate: 0 },
      { minScrolls: 1, maxScrolls: 2, minDelta: 50, maxDelta: 100, delayBetween: { min: 1, max: 2 } }
    );
  });

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  describe('Constructor', () => {
    it('should use default config when not provided', () => {
      const hb = new HumanBehavior();
      expect(hb).toBeDefined();
    });

    it('should merge provided config with defaults', () => {
      const customConfig: Partial<TypingConfig> = { minDelay: 10 };
      const hb = new HumanBehavior(customConfig);
      expect(hb).toBeDefined();
    });
  });

  // ============================================================================
  // TYPING
  // ============================================================================

  describe('Typing', () => {
    describe('humanType', () => {
      it('should type text character by character', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 }),
        };
        mockPage.$.mockResolvedValue(mockElement);

        await humanBehavior.humanType(mockPage as any, '#input', 'hello');

        // Should type each character
        expect(mockPage.keyboard.type).toHaveBeenCalled();
      }, 60000);

      it('should clear field when clearFirst is true', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 }),
        };
        mockPage.$.mockResolvedValue(mockElement);

        await humanBehavior.humanType(mockPage as any, '#input', 'test', { clearFirst: true });

        expect(mockPage.keyboard.press).toHaveBeenCalledWith('Control+a');
        expect(mockPage.keyboard.press).toHaveBeenCalledWith('Backspace');
      });

      it('should press enter when pressEnter is true', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 }),
        };
        mockPage.$.mockResolvedValue(mockElement);

        await humanBehavior.humanType(mockPage as any, '#input', 'test', { pressEnter: true });

        expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter');
      });
    });
  });

  // ============================================================================
  // MOUSE MOVEMENT
  // ============================================================================

  describe('Mouse Movement', () => {
    describe('humanClick', () => {
      it('should click on element', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 }),
        };
        mockPage.$.mockResolvedValue(mockElement);

        await humanBehavior.humanClick(mockPage as any, '#button');

        expect(mockPage.mouse.click).toHaveBeenCalled();
      });

      it('should throw error when element not found', async () => {
        const mockPage = createMockPage();
        mockPage.$.mockResolvedValue(null);

        await expect(
          humanBehavior.humanClick(mockPage as any, '#nonexistent')
        ).rejects.toThrow('Element not found');
      });

      it('should throw error when element has no bounding box', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          boundingBox: jest.fn().mockResolvedValue(null),
        };
        mockPage.$.mockResolvedValue(mockElement);

        await expect(
          humanBehavior.humanClick(mockPage as any, '#hidden')
        ).rejects.toThrow('Element has no bounding box');
      });

      it('should double click when doubleClick option is true', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 }),
        };
        mockPage.$.mockResolvedValue(mockElement);

        await humanBehavior.humanClick(mockPage as any, '#button', { doubleClick: true });

        expect(mockPage.mouse.dblclick).toHaveBeenCalled();
      });

      it('should right click when rightClick option is true', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 }),
        };
        mockPage.$.mockResolvedValue(mockElement);

        await humanBehavior.humanClick(mockPage as any, '#button', { rightClick: true });

        expect(mockPage.mouse.click).toHaveBeenCalledWith(
          expect.any(Number),
          expect.any(Number),
          { button: 'right' }
        );
      });
    });

    describe('humanMouseMove', () => {
      it('should move mouse to target position', async () => {
        const mockPage = createMockPage();

        await humanBehavior.humanMouseMove(mockPage as any, 500, 300);

        expect(mockPage.mouse.move).toHaveBeenCalled();
      });

      it('should use bezier curve for movement', async () => {
        const mockPage = createMockPage();

        await humanBehavior.humanMouseMove(mockPage as any, 500, 300);

        // Should have multiple move calls for smooth movement
        const moveCallCount = mockPage.mouse.move.mock.calls.length;
        expect(moveCallCount).toBeGreaterThan(1);
      });
    });
  });

  // ============================================================================
  // SCROLLING
  // ============================================================================

  describe('Scrolling', () => {
    describe('humanScroll', () => {
      it('should scroll down by default', async () => {
        const mockPage = createMockPage();

        await humanBehavior.humanScroll(mockPage as any);

        expect(mockPage.mouse.wheel).toHaveBeenCalledWith(
          0,
          expect.any(Number)
        );

        // Delta should be positive for scrolling down
        const wheelCall = mockPage.mouse.wheel.mock.calls[0];
        expect(wheelCall[1]).toBeGreaterThan(0);
      });

      it('should scroll up when direction is up', async () => {
        const mockPage = createMockPage();

        await humanBehavior.humanScroll(mockPage as any, { direction: 'up' });

        expect(mockPage.mouse.wheel).toHaveBeenCalledWith(
          0,
          expect.any(Number)
        );

        // Delta should be negative for scrolling up
        const wheelCall = mockPage.mouse.wheel.mock.calls[0];
        expect(wheelCall[1]).toBeLessThan(0);
      });

      it('should scroll to element when specified', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          scrollIntoViewIfNeeded: jest.fn(),
        };
        mockPage.$.mockResolvedValue(mockElement);

        await humanBehavior.humanScroll(mockPage as any, { scrollToElement: '#target' });

        expect(mockElement.scrollIntoViewIfNeeded).toHaveBeenCalled();
      });

      it('should handle missing scroll element gracefully', async () => {
        const mockPage = createMockPage();
        mockPage.$.mockResolvedValue(null);

        // Should not throw
        await humanBehavior.humanScroll(mockPage as any, { scrollToElement: '#nonexistent' });
      });
    });

    describe('scrollToBottom', () => {
      it('should scroll until bottom is reached', async () => {
        const mockPage = createMockPage();
        let callCount = 0;
        mockPage.evaluate.mockImplementation(() => {
          callCount++;
          return callCount < 3 ? 1000 + callCount * 500 : 2000;
        });

        await humanBehavior.scrollToBottom(mockPage as any);

        expect(mockPage.mouse.wheel).toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // DELAYS
  // ============================================================================

  describe('Delays', () => {
    describe('randomDelay', () => {
      it('should delay execution', async () => {
        const start = Date.now();
        await humanBehavior.randomDelay(10, 20);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(9); // Allow for timing variance
      });
    });

    describe('thinkingPause', () => {
      it('should add a longer pause', async () => {
        // Create instance with custom timing for testing
        const hb = new HumanBehavior();

        // Just verify it doesn't throw
        const start = Date.now();
        await hb.thinkingPause();
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(400); // At least 500ms - some tolerance
      });
    });

    describe('readingPause', () => {
      it('should add reading pause', async () => {
        const hb = new HumanBehavior();

        const start = Date.now();
        await hb.readingPause();
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(900); // At least 1000ms - some tolerance
      });
    });

    describe('betweenFieldsPause', () => {
      it('should add short pause', async () => {
        const start = Date.now();
        await humanBehavior.betweenFieldsPause();
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ============================================================================
  // FORM INTERACTION
  // ============================================================================

  describe('Form Interaction', () => {
    describe('fillField', () => {
      it('should click and type in field', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 }),
        };
        mockPage.$.mockResolvedValue(mockElement);

        await humanBehavior.fillField(mockPage as any, '#name', 'John Doe');

        expect(mockPage.mouse.click).toHaveBeenCalled();
        expect(mockPage.keyboard.type).toHaveBeenCalled();
      });

      it('should clear field first when specified', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 }),
        };
        mockPage.$.mockResolvedValue(mockElement);

        await humanBehavior.fillField(mockPage as any, '#name', 'New Value', { clearFirst: true });

        expect(mockPage.keyboard.press).toHaveBeenCalledWith('Control+a');
      });
    });

    describe('selectOption', () => {
      it('should click and select option', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 }),
        };
        mockPage.$.mockResolvedValue(mockElement);

        await humanBehavior.selectOption(mockPage as any, '#country', 'US');

        expect(mockPage.selectOption).toHaveBeenCalledWith('#country', 'US');
      });
    });

    describe('toggleCheckbox', () => {
      it('should click checkbox when state needs to change', async () => {
        const mockPage = createMockPage();
        const mockElement = {
          boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 20, height: 20 }),
        };
        mockPage.$.mockResolvedValue(mockElement);
        mockPage.isChecked.mockResolvedValue(false);

        await humanBehavior.toggleCheckbox(mockPage as any, '#agree', true);

        expect(mockPage.mouse.click).toHaveBeenCalled();
      });

      it('should not click checkbox when already in desired state', async () => {
        const mockPage = createMockPage();
        mockPage.isChecked.mockResolvedValue(true);

        await humanBehavior.toggleCheckbox(mockPage as any, '#agree', true);

        // Should not click since already checked
        expect(mockPage.mouse.click).not.toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // TYPO SIMULATION
  // ============================================================================

  describe('Typo Simulation', () => {
    it('should occasionally make typing mistakes when enabled', async () => {
      // Create instance with high mistake rate for testing
      const hbWithMistakes = new HumanBehavior(
        { minDelay: 1, maxDelay: 2, mistakeRate: 1.0, thinkingPauseRate: 0 }, // 100% mistake rate
        { movementSteps: { min: 2, max: 3 }, stepDelay: { min: 1, max: 2 }, overshootRate: 0 }
      );

      const mockPage = createMockPage();
      const mockElement = {
        boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 }),
      };
      mockPage.$.mockResolvedValue(mockElement);

      await hbWithMistakes.humanType(mockPage as any, '#input', 'test');

      // With 100% mistake rate, should have backspace presses
      const backspaceCalls = mockPage.keyboard.press.mock.calls.filter(
        (call: any[]) => call[0] === 'Backspace'
      );
      expect(backspaceCalls.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // CONFIG
  // ============================================================================

  describe('Configuration', () => {
    it('should accept custom typing config', () => {
      const customTyping: Partial<TypingConfig> = {
        minDelay: 100,
        maxDelay: 200,
        mistakeRate: 0.1,
      };

      const hb = new HumanBehavior(customTyping);
      expect(hb).toBeDefined();
    });

    it('should accept custom mouse config', () => {
      const customMouse: Partial<MouseConfig> = {
        movementSteps: { min: 5, max: 10 },
        overshootRate: 0.2,
      };

      const hb = new HumanBehavior({}, customMouse);
      expect(hb).toBeDefined();
    });

    it('should accept custom scroll config', () => {
      const customScroll: Partial<ScrollConfig> = {
        minScrolls: 2,
        maxScrolls: 6,
      };

      const hb = new HumanBehavior({}, {}, customScroll);
      expect(hb).toBeDefined();
    });
  });
});
