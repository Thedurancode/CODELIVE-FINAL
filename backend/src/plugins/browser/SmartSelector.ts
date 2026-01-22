/**
 * Smart Selector - Dynamic Form Detection
 *
 * Intelligently detects form elements when hardcoded selectors fail:
 * - Finds login forms by multiple strategies
 * - Detects property submission forms
 * - Generates stable selectors for found elements
 * - Uses heuristics and scoring to find best matches
 */

import { Page, ElementHandle } from 'playwright';

export interface LoginFormSelectors {
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  formSelector?: string;
}

export interface PropertyFormSelectors {
  addressSelector?: string;
  citySelector?: string;
  stateSelector?: string;
  zipSelector?: string;
  priceSelector?: string;
  bedroomsSelector?: string;
  bathroomsSelector?: string;
  sqftSelector?: string;
  descriptionSelector?: string;
  submitSelector?: string;
  formSelector?: string;
}

interface ScoredElement {
  element: ElementHandle;
  selector: string;
  score: number;
  reason: string;
}

export class SmartSelector {
  // ============================================================================
  // LOGIN FORM DETECTION
  // ============================================================================

  /**
   * Find login form elements using multiple strategies
   */
  async findLoginForm(page: Page): Promise<LoginFormSelectors | null> {
    console.log('🔍 Detecting login form...');

    // Try strategies in order of reliability
    const strategies = [
      () => this.findLoginByFormAction(page),
      () => this.findLoginByInputTypes(page),
      () => this.findLoginByLabels(page),
      () => this.findLoginByPlaceholders(page),
      () => this.findLoginByAriaLabels(page),
      () => this.findLoginByClassNames(page),
    ];

    for (const strategy of strategies) {
      const result = await strategy();
      if (result) {
        console.log('✅ Login form detected');
        return result;
      }
    }

    console.log('❌ Could not detect login form');
    return null;
  }

  private async findLoginByFormAction(page: Page): Promise<LoginFormSelectors | null> {
    const forms = await page.$$('form[action*="login"], form[action*="signin"], form[action*="auth"]');

    for (const form of forms) {
      const usernameInput = await form.$('input[type="email"], input[type="text"][name*="user"], input[type="text"][name*="email"]');
      const passwordInput = await form.$('input[type="password"]');
      const submitButton = await form.$('button[type="submit"], input[type="submit"]');

      if (usernameInput && passwordInput && submitButton) {
        return {
          usernameSelector: await this.generateSelector(usernameInput),
          passwordSelector: await this.generateSelector(passwordInput),
          submitSelector: await this.generateSelector(submitButton),
          formSelector: await this.generateSelector(form),
        };
      }
    }

    return null;
  }

  private async findLoginByInputTypes(page: Page): Promise<LoginFormSelectors | null> {
    // Find password field first (most reliable indicator of login form)
    const passwordInputs = await page.$$('input[type="password"]:visible');

    for (const passwordInput of passwordInputs) {
      // Look for email/username field nearby (in same form or near in DOM)
      const form = await passwordInput.evaluateHandle((el) => el.closest('form'));
      const formElement = form.asElement();

      let usernameInput: ElementHandle | null = null;
      let submitButton: ElementHandle | null = null;

      if (formElement) {
        // Within form
        usernameInput = await formElement.$('input[type="email"], input[type="text"]:not([type="password"])');
        submitButton = await formElement.$('button[type="submit"], input[type="submit"], button:not([type="button"])');
      } else {
        // Look for nearby inputs
        usernameInput = await page.$('input[type="email"]:visible, input[name*="email"]:visible, input[name*="user"]:visible');
        submitButton = await page.$('button[type="submit"]:visible, input[type="submit"]:visible');
      }

      if (usernameInput && submitButton) {
        return {
          usernameSelector: await this.generateSelector(usernameInput),
          passwordSelector: await this.generateSelector(passwordInput),
          submitSelector: await this.generateSelector(submitButton),
          formSelector: formElement ? await this.generateSelector(formElement) : undefined,
        };
      }
    }

    return null;
  }

  private async findLoginByLabels(page: Page): Promise<LoginFormSelectors | null> {
    const labels = await page.$$('label');
    let usernameInput: ElementHandle | null = null;
    let passwordInput: ElementHandle | null = null;

    for (const label of labels) {
      const text = ((await label.textContent()) || '').toLowerCase();
      const forId = await label.getAttribute('for');

      if (!forId) continue;

      if (text.includes('email') || text.includes('username') || text.includes('user')) {
        usernameInput = await page.$(`#${forId}`);
      } else if (text.includes('password')) {
        passwordInput = await page.$(`#${forId}`);
      }
    }

    if (usernameInput && passwordInput) {
      const submitButton = await page.$('button[type="submit"], input[type="submit"]');
      if (submitButton) {
        return {
          usernameSelector: await this.generateSelector(usernameInput),
          passwordSelector: await this.generateSelector(passwordInput),
          submitSelector: await this.generateSelector(submitButton),
        };
      }
    }

    return null;
  }

  private async findLoginByPlaceholders(page: Page): Promise<LoginFormSelectors | null> {
    const usernameInput = await page.$('input[placeholder*="email" i], input[placeholder*="username" i], input[placeholder*="user" i]');
    const passwordInput = await page.$('input[placeholder*="password" i], input[type="password"]');
    const submitButton = await page.$('button[type="submit"], input[type="submit"]');

    if (usernameInput && passwordInput && submitButton) {
      return {
        usernameSelector: await this.generateSelector(usernameInput),
        passwordSelector: await this.generateSelector(passwordInput),
        submitSelector: await this.generateSelector(submitButton),
      };
    }

    return null;
  }

  private async findLoginByAriaLabels(page: Page): Promise<LoginFormSelectors | null> {
    const usernameInput = await page.$('input[aria-label*="email" i], input[aria-label*="username" i]');
    const passwordInput = await page.$('input[aria-label*="password" i]');
    const submitButton = await page.$('button[type="submit"], input[type="submit"]');

    if (usernameInput && passwordInput && submitButton) {
      return {
        usernameSelector: await this.generateSelector(usernameInput),
        passwordSelector: await this.generateSelector(passwordInput),
        submitSelector: await this.generateSelector(submitButton),
      };
    }

    return null;
  }

  private async findLoginByClassNames(page: Page): Promise<LoginFormSelectors | null> {
    // Common class name patterns
    const usernameSelectors = [
      'input.email', 'input.username', 'input.user-email',
      'input[class*="email"]', 'input[class*="username"]',
      '.login-email input', '.login-username input',
    ];

    const passwordSelectors = [
      'input.password', 'input[class*="password"]',
      '.login-password input',
    ];

    let usernameInput: ElementHandle | null = null;
    let passwordInput: ElementHandle | null = null;

    for (const selector of usernameSelectors) {
      usernameInput = await page.$(selector);
      if (usernameInput) break;
    }

    for (const selector of passwordSelectors) {
      passwordInput = await page.$(selector);
      if (passwordInput) break;
    }

    if (usernameInput && passwordInput) {
      const submitButton = await page.$('button[type="submit"], input[type="submit"], .login-button, .btn-login');
      if (submitButton) {
        return {
          usernameSelector: await this.generateSelector(usernameInput),
          passwordSelector: await this.generateSelector(passwordInput),
          submitSelector: await this.generateSelector(submitButton),
        };
      }
    }

    return null;
  }

  // ============================================================================
  // PROPERTY FORM DETECTION
  // ============================================================================

  /**
   * Find property submission form elements
   */
  async findPropertyForm(page: Page): Promise<PropertyFormSelectors | null> {
    console.log('🔍 Detecting property form...');

    const selectors: PropertyFormSelectors = {};

    // Address field
    selectors.addressSelector = await this.findFieldByHeuristics(page, {
      namePatterns: ['address', 'street', 'propertyAddress', 'streetAddress'],
      placeholderPatterns: ['address', 'street'],
      labelPatterns: ['address', 'street', 'property address'],
    });

    // City field
    selectors.citySelector = await this.findFieldByHeuristics(page, {
      namePatterns: ['city'],
      placeholderPatterns: ['city'],
      labelPatterns: ['city'],
    });

    // State field
    selectors.stateSelector = await this.findFieldByHeuristics(page, {
      namePatterns: ['state'],
      placeholderPatterns: ['state'],
      labelPatterns: ['state'],
      tagName: 'select', // States are often dropdowns
    });

    // ZIP field
    selectors.zipSelector = await this.findFieldByHeuristics(page, {
      namePatterns: ['zip', 'zipCode', 'postalCode', 'postal'],
      placeholderPatterns: ['zip', 'postal'],
      labelPatterns: ['zip', 'postal code'],
    });

    // Price field
    selectors.priceSelector = await this.findFieldByHeuristics(page, {
      namePatterns: ['price', 'listPrice', 'askingPrice', 'amount'],
      placeholderPatterns: ['price', 'amount'],
      labelPatterns: ['price', 'list price', 'asking price'],
    });

    // Bedrooms field
    selectors.bedroomsSelector = await this.findFieldByHeuristics(page, {
      namePatterns: ['bedrooms', 'beds', 'bedroom', 'bed'],
      placeholderPatterns: ['bed'],
      labelPatterns: ['bedroom', 'beds'],
    });

    // Bathrooms field
    selectors.bathroomsSelector = await this.findFieldByHeuristics(page, {
      namePatterns: ['bathrooms', 'baths', 'bathroom', 'bath'],
      placeholderPatterns: ['bath'],
      labelPatterns: ['bathroom', 'baths'],
    });

    // Square footage field
    selectors.sqftSelector = await this.findFieldByHeuristics(page, {
      namePatterns: ['sqft', 'squareFeet', 'squareFootage', 'livingArea', 'size'],
      placeholderPatterns: ['sq ft', 'square feet', 'size'],
      labelPatterns: ['square', 'sqft', 'size', 'living area'],
    });

    // Description field
    selectors.descriptionSelector = await this.findFieldByHeuristics(page, {
      namePatterns: ['description', 'propertyDescription', 'details'],
      placeholderPatterns: ['description', 'details'],
      labelPatterns: ['description', 'details', 'about'],
      tagName: 'textarea',
    });

    // Submit button
    const submitButton = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("List")');
    if (submitButton) {
      selectors.submitSelector = await this.generateSelector(submitButton);
    }

    // Check if we found enough fields
    const foundFields = Object.values(selectors).filter(Boolean).length;
    if (foundFields >= 3) {
      console.log(`✅ Property form detected (${foundFields} fields found)`);
      return selectors;
    }

    console.log('❌ Could not detect property form');
    return null;
  }

  private async findFieldByHeuristics(
    page: Page,
    options: {
      namePatterns: string[];
      placeholderPatterns: string[];
      labelPatterns: string[];
      tagName?: string;
    }
  ): Promise<string | undefined> {
    const tagSelector = options.tagName || 'input';
    const candidates: ScoredElement[] = [];

    // Search by name attribute
    for (const pattern of options.namePatterns) {
      const elements = await page.$$(`${tagSelector}[name*="${pattern}" i]`);
      for (const el of elements) {
        candidates.push({
          element: el,
          selector: await this.generateSelector(el),
          score: 10,
          reason: `name contains "${pattern}"`,
        });
      }
    }

    // Search by placeholder
    for (const pattern of options.placeholderPatterns) {
      const elements = await page.$$(`${tagSelector}[placeholder*="${pattern}" i]`);
      for (const el of elements) {
        candidates.push({
          element: el,
          selector: await this.generateSelector(el),
          score: 8,
          reason: `placeholder contains "${pattern}"`,
        });
      }
    }

    // Search by id
    for (const pattern of options.namePatterns) {
      const elements = await page.$$(`${tagSelector}[id*="${pattern}" i]`);
      for (const el of elements) {
        candidates.push({
          element: el,
          selector: await this.generateSelector(el),
          score: 9,
          reason: `id contains "${pattern}"`,
        });
      }
    }

    // Search by associated label
    for (const pattern of options.labelPatterns) {
      const labels = await page.$$(`label`);
      for (const label of labels) {
        const text = ((await label.textContent()) || '').toLowerCase();
        if (text.includes(pattern.toLowerCase())) {
          const forId = await label.getAttribute('for');
          if (forId) {
            const element = await page.$(`#${forId}`);
            if (element) {
              candidates.push({
                element,
                selector: `#${forId}`,
                score: 7,
                reason: `label contains "${pattern}"`,
              });
            }
          }
        }
      }
    }

    // Sort by score and return best match
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.selector;
  }

  // ============================================================================
  // SELECTOR GENERATION
  // ============================================================================

  /**
   * Generate a stable, unique selector for an element
   */
  async generateSelector(element: ElementHandle): Promise<string> {
    return element.evaluate((el: Element) => {
      // Priority 1: ID (most stable)
      if (el.id) {
        return `#${CSS.escape(el.id)}`;
      }

      // Priority 2: Name attribute
      const name = el.getAttribute('name');
      if (name) {
        const tagName = el.tagName.toLowerCase();
        const selector = `${tagName}[name="${CSS.escape(name)}"]`;
        // Verify uniqueness
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }

      // Priority 3: Data attributes
      const dataTestId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
      if (dataTestId) {
        return `[data-testid="${CSS.escape(dataTestId)}"]`;
      }

      // Priority 4: Aria label
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) {
        const selector = `[aria-label="${CSS.escape(ariaLabel)}"]`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }

      // Priority 5: Build CSS path
      const path: string[] = [];
      let current: Element | null = el;

      while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();

        // Add distinguishing class if available
        const classes = Array.from(current.classList)
          .filter((c) => !c.match(/^(ng-|_|js-)/)) // Filter out framework classes
          .slice(0, 2);

        if (classes.length > 0) {
          selector += '.' + classes.map((c) => CSS.escape(c)).join('.');
        }

        // Add nth-child if needed for uniqueness
        const parent: Element | null = current.parentElement;
        if (parent) {
          const currentElement = current;
          const siblings = Array.from(parent.children).filter(
            (child: Element) => child.tagName === currentElement!.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(currentElement) + 1;
            selector += `:nth-of-type(${index})`;
          }
        }

        path.unshift(selector);
        current = parent;

        // Stop if we have a unique selector
        const fullSelector = path.join(' > ');
        if (document.querySelectorAll(fullSelector).length === 1) {
          break;
        }

        // Limit depth
        if (path.length > 5) {
          break;
        }
      }

      return path.join(' > ');
    });
  }

  // ============================================================================
  // ELEMENT VERIFICATION
  // ============================================================================

  /**
   * Verify a selector still works and points to expected element
   */
  async verifySelector(page: Page, selector: string, expectedType?: string): Promise<boolean> {
    try {
      const element = await page.$(selector);
      if (!element) return false;

      if (expectedType) {
        const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
        const type = await element.getAttribute('type');
        return tagName === expectedType || type === expectedType;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find alternative selectors for an element
   */
  async findAlternativeSelectors(page: Page, currentSelector: string): Promise<string[]> {
    const element = await page.$(currentSelector);
    if (!element) return [];

    const alternatives: string[] = [];

    // Generate variations
    const primary = await this.generateSelector(element);
    alternatives.push(primary);

    // Add attribute-based alternatives
    const attributes = await element.evaluate((el) => ({
      id: el.id,
      name: el.getAttribute('name'),
      type: el.getAttribute('type'),
      placeholder: el.getAttribute('placeholder'),
      ariaLabel: el.getAttribute('aria-label'),
      dataTestId: el.getAttribute('data-testid'),
    }));

    if (attributes.id) {
      alternatives.push(`#${attributes.id}`);
    }
    if (attributes.name) {
      alternatives.push(`[name="${attributes.name}"]`);
    }
    if (attributes.dataTestId) {
      alternatives.push(`[data-testid="${attributes.dataTestId}"]`);
    }

    // Remove duplicates
    return [...new Set(alternatives)];
  }
}

// Export singleton instance
export const smartSelector = new SmartSelector();
export default smartSelector;
