/**
 * External Verification Services Tests
 *
 * Unit tests for:
 * - PropertyVerificationService
 * - TitleVerificationService
 * - ComplianceOCRService
 * - SOC2AuditLogger
 */

import { propertyVerificationService } from '../../services/PropertyVerificationService';
import { titleVerificationService } from '../../services/TitleVerificationService';
import { complianceOCRService } from '../../services/ComplianceOCRService';

// Mock environment without API keys to test mock data fallback
const originalEnv = process.env;

describe('PropertyVerificationService', () => {
  beforeAll(async () => {
    // Ensure no API keys are set for testing mock fallback
    delete process.env.ATTOM_API_KEY;
    delete process.env.CORELOGIC_API_KEY;
    await propertyVerificationService.initialize();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('verifyProperty', () => {
    it('should return mock data when no API keys are configured', async () => {
      const result = await propertyVerificationService.verifyProperty({
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      });

      expect(result.success).toBe(true);
      expect(result.source).toBe('mock');
      expect(result.propertyDetails).toBeDefined();
      expect(result.ownershipVerification).toBeDefined();
      expect(result.taxInfo).toBeDefined();
    });

    it('should verify owner name match', async () => {
      const result = await propertyVerificationService.verifyProperty({
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        expectedOwnerName: 'John Smith',
      });

      expect(result.ownershipVerification?.matchesExpected).toBe(true);
      expect(result.ownershipVerification?.matchScore).toBeGreaterThan(0.8);
    });

    it('should include transaction history', async () => {
      const result = await propertyVerificationService.verifyProperty({
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      });

      expect(result.transactionHistory).toBeDefined();
      expect(Array.isArray(result.transactionHistory)).toBe(true);
    });

    it('should include valuation info', async () => {
      const result = await propertyVerificationService.verifyProperty({
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      });

      expect(result.valuationInfo).toBeDefined();
      expect(result.valuationInfo?.estimatedValue).toBeGreaterThan(0);
      expect(result.valuationInfo?.valueRange).toBeDefined();
    });
  });

  describe('batchVerify', () => {
    it('should process multiple properties', async () => {
      const properties = [
        { propertyAddress: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        { propertyAddress: '456 Oak Ave', city: 'Dallas', state: 'TX', zip: '75201' },
      ];

      const results = await propertyVerificationService.batchVerify(properties);

      expect(results.size).toBe(2);
      for (const [, result] of results) {
        expect(result.success).toBe(true);
      }
    });
  });
});

describe('TitleVerificationService', () => {
  beforeAll(async () => {
    delete process.env.FIRST_AMERICAN_API_KEY;
    delete process.env.QUALIA_API_KEY;
    await titleVerificationService.initialize();
  });

  describe('verifyTitle', () => {
    it('should return mock data when no API keys are configured', async () => {
      const result = await titleVerificationService.verifyTitle({
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      });

      expect(result.success).toBe(true);
      expect(result.source).toBe('mock');
      expect(result.status).toBeDefined();
    });

    it('should include ownership info', async () => {
      const result = await titleVerificationService.verifyTitle({
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        expectedOwnerName: 'John Smith',
      });

      expect(result.ownershipInfo).toBeDefined();
      expect(result.ownershipInfo?.currentOwner).toBeDefined();
      expect(result.ownershipInfo?.vestingType).toBeDefined();
    });

    it('should include liens array', async () => {
      const result = await titleVerificationService.verifyTitle({
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      });

      expect(result.liens).toBeDefined();
      expect(Array.isArray(result.liens)).toBe(true);
    });

    it('should include encumbrances array', async () => {
      const result = await titleVerificationService.verifyTitle({
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      });

      expect(result.encumbrances).toBeDefined();
      expect(Array.isArray(result.encumbrances)).toBe(true);
    });

    it('should include exceptions array', async () => {
      const result = await titleVerificationService.verifyTitle({
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      });

      expect(result.exceptions).toBeDefined();
      expect(Array.isArray(result.exceptions)).toBe(true);
    });

    it('should include insurance quote when purchase price provided', async () => {
      const result = await titleVerificationService.verifyTitle({
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        purchasePrice: 350000,
      });

      expect(result.insuranceQuote).toBeDefined();
      expect(result.insuranceQuote?.ownersPolicyAmount).toBe(350000);
    });

    it('should have expiration date', async () => {
      const result = await titleVerificationService.verifyTitle({
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      });

      expect(result.expiresAt).toBeDefined();
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('requestPayoffLetter', () => {
    it('should return success with request details', async () => {
      const result = await titleVerificationService.requestPayoffLetter(
        'lien-001',
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      );

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
      expect(result.estimatedDelivery).toBeDefined();
    });
  });
});

describe('ComplianceOCRService', () => {
  beforeAll(async () => {
    await complianceOCRService.initialize();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(complianceOCRService.isReady()).toBe(true);
    });
  });

  describe('extractContractFields (unit logic)', () => {
    // Note: Full OCR tests would require actual document buffers
    // These tests verify the service structure and initialization

    it('should be callable', async () => {
      expect(typeof complianceOCRService.extractContractFields).toBe('function');
    });
  });

  describe('verifySellerID (unit logic)', () => {
    it('should be callable', async () => {
      expect(typeof complianceOCRService.verifySellerID).toBe('function');
    });
  });

  describe('parseTitleDocument (unit logic)', () => {
    it('should be callable', async () => {
      expect(typeof complianceOCRService.parseTitleDocument).toBe('function');
    });
  });

  describe('verifyCompliance (unit logic)', () => {
    it('should handle empty request', async () => {
      const result = await complianceOCRService.verifyCompliance({});

      expect(result).toBeDefined();
      expect(result.verifiedAt).toBeDefined();
      expect(result.auditHash).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('should provide recommendations when no documents provided', async () => {
      const result = await complianceOCRService.verifyCompliance({
        expectedSellerName: 'John Smith',
      });

      // Should recommend collecting seller ID and title document
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some(r => r.includes('seller ID') || r.includes('ID'))).toBe(true);
      expect(result.recommendations.some(r => r.includes('title'))).toBe(true);
    });
  });
});

describe('Fuzzy Matching', () => {
  // Test the fuzzy matching logic used across services
  // This is important for owner name verification

  it('should match exact names', async () => {
    const result = await propertyVerificationService.verifyProperty({
      propertyAddress: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      expectedOwnerName: 'John Smith',
    });

    // Mock returns 'John Smith' as owner
    expect(result.ownershipVerification?.matchesExpected).toBe(true);
    expect(result.ownershipVerification?.matchScore).toBeGreaterThanOrEqual(0.9);
  });
});

describe('Caching', () => {
  it('should cache property verification results', async () => {
    const request = {
      propertyAddress: '789 Cache Test St',
      city: 'Houston',
      state: 'TX',
      zip: '77001',
    };

    // First call
    const result1 = await propertyVerificationService.verifyProperty(request);

    // Second call should be cached
    const result2 = await propertyVerificationService.verifyProperty(request);

    // Second result should come from cache (faster source indicator)
    expect(result2.source).toBe('cache');
    expect(result2.cachedAt).toBeDefined();
  });

  it('should respect cache clearing', async () => {
    const request = {
      propertyAddress: '999 Clear Cache St',
      city: 'San Antonio',
      state: 'TX',
      zip: '78201',
    };

    // First call
    await propertyVerificationService.verifyProperty(request);

    // Clear cache
    propertyVerificationService.clearCache(request);

    // Next call should not be cached
    const result = await propertyVerificationService.verifyProperty(request);
    expect(result.source).toBe('mock'); // Not 'cache'
  });
});
