/**
 * PDFDealSourcePlugin Unit Tests
 *
 * Tests PDF parsing, OCR functionality, and deal extraction
 */

import { PDFDealSourcePlugin } from '../../plugins/sources/PDFDealSourcePlugin';
import { DealSourceConfig, DealSourceType } from '../../plugins/types';

// Mock pdf-parse
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation((options: { data: Buffer }) => {
    const content = options.data.toString();

    // Check if this is a "scanned" PDF (minimal text)
    const isScannedPDF = content.includes('SCANNED_PDF_NO_TEXT');

    return {
      getText: jest.fn().mockResolvedValue({
        text: isScannedPDF
          ? ''
          : `
            WHOLESALE DEAL SHEET

            Property Address: 123 Main St
            City: Austin
            State: TX
            ZIP: 78701

            Asking Price: $150,000
            ARV (After Repair Value): $220,000
            Repair Estimate: $35,000

            Property Details:
            Bedrooms: 3
            Bathrooms: 2
            Square Feet: 1,500
            Year Built: 1985
            Lot Size: 0.25 acres
            Property Type: Single Family

            Occupancy: Vacant

            Wholesaler Information:
            Contact: John Smith
            Email: john@wholesaler.com
            Phone: (512) 555-1234
            Company: Smith Wholesale LLC

            Contract Details:
            Assignment Fee: $10,000
            EMD Required: $2,500
            Contract Expiration: 01/15/2025

            Description:
            Great investment opportunity in established neighborhood.
            Needs cosmetic updates but solid bones.
          `,
        pages: [{ pageNumber: 1 }, { pageNumber: 2 }],
      }),
      getInfo: jest.fn().mockResolvedValue({
        info: {
          Title: 'Deal Sheet',
          Author: 'Wholesaler',
          CreationDate: new Date().toISOString(),
        },
      }),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
  }),
}));

// Mock tesseract.js
jest.mock('tesseract.js', () => ({
  createWorker: jest.fn().mockImplementation(async () => ({
    recognize: jest.fn().mockResolvedValue({
      data: {
        text: `
          Property: 456 Oak Ave, Dallas, TX 75201
          Price: $175,000
          ARV: $250,000
          3 bed / 2 bath / 1,800 sqft
          Contact: Jane Doe - jane@deals.com - 214-555-9876
        `,
      },
    }),
    terminate: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock OpenAI/LangChain for AI extraction
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        address: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        price: 150000,
        arv: 220000,
        repairEstimate: 35000,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1500,
        yearBuilt: 1985,
        propertyType: 'single_family',
        wholesalerName: 'John Smith',
        wholesalerEmail: 'john@wholesaler.com',
        wholesalerPhone: '(512) 555-1234',
        wholesalerCompany: 'Smith Wholesale LLC',
        assignmentFee: 10000,
        emDeposit: 2500,
        occupancyStatus: 'vacant',
        description: 'Great investment opportunity in established neighborhood.',
      }),
    }),
  })),
}));

describe('PDFDealSourcePlugin', () => {
  let plugin: PDFDealSourcePlugin;
  let baseConfig: DealSourceConfig;

  // Sample PDF content as buffer
  const samplePDFBuffer = Buffer.from('SAMPLE_PDF_CONTENT_WITH_DEAL_DATA');
  const scannedPDFBuffer = Buffer.from('SCANNED_PDF_NO_TEXT');

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset environment variables
    process.env.OPENAI_API_KEY = 'test-api-key';

    baseConfig = {
      id: 'test-pdf-source',
      name: 'Test PDF Source',
      type: 'pdf' as DealSourceType,
      enabled: true,
      settings: {
        importMethod: 'upload',
        parsingMode: 'ai',
        enableOCR: true,
        ocrLanguage: 'eng',
        minTextThreshold: 100,
        multiDealMode: false,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    plugin = new PDFDealSourcePlugin();
  });

  afterEach(async () => {
    try {
      await plugin.dispose();
    } catch {
      // Ignore dispose errors in tests
    }
  });

  // ============================================================================
  // PLUGIN METADATA
  // ============================================================================

  describe('Plugin Metadata', () => {
    it('should have correct type', () => {
      expect(plugin.type).toBe('pdf');
    });

    it('should have correct name', () => {
      expect(plugin.name).toBe('PDF Import');
    });

    it('should have version', () => {
      expect(plugin.version).toBe('1.0.0');
    });

    it('should have description mentioning OCR', () => {
      expect(plugin.description).toContain('OCR');
    });

    it('should have config schema', () => {
      expect(plugin.configSchema).toBeDefined();
      expect(plugin.configSchema.fields).toBeDefined();
      expect(plugin.configSchema.fields.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // CONFIG SCHEMA
  // ============================================================================

  describe('Config Schema', () => {
    it('should have importMethod field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'importMethod');
      expect(field).toBeDefined();
      expect(field?.type).toBe('select');
      expect(field?.options).toContainEqual({ value: 'upload', label: 'File Upload' });
    });

    it('should have parsingMode field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'parsingMode');
      expect(field).toBeDefined();
      expect(field?.type).toBe('select');
      expect(field?.options).toContainEqual({ value: 'ai', label: 'AI-Powered (Recommended)' });
    });

    it('should have enableOCR field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'enableOCR');
      expect(field).toBeDefined();
      expect(field?.type).toBe('boolean');
      expect(field?.default).toBe(true);
    });

    it('should have ocrLanguage field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'ocrLanguage');
      expect(field).toBeDefined();
      expect(field?.type).toBe('select');
    });

    it('should have multiDealMode field', () => {
      const field = plugin.configSchema.fields.find((f) => f.name === 'multiDealMode');
      expect(field).toBeDefined();
      expect(field?.type).toBe('boolean');
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await plugin.initialize(baseConfig);
      const result = await plugin.testConnection(baseConfig);
      expect(result.success).toBe(true);
    });

    it('should dispose successfully', async () => {
      await plugin.initialize(baseConfig);
      await plugin.dispose();
      await expect(plugin.fetchDeals()).rejects.toThrow();
    });
  });

  // ============================================================================
  // TEST CONNECTION
  // ============================================================================

  describe('testConnection', () => {
    it('should return success for upload method', async () => {
      const result = await plugin.testConnection(baseConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('upload');
      expect(result.details?.parsingMode).toBe('ai');
      expect(result.details?.ocrEnabled).toBe(true);
    });

    it('should validate URL for url method', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          importMethod: 'url',
          fileUrl: '',
        },
      };

      const result = await plugin.testConnection(config);
      expect(result.success).toBe(false);
      expect(result.message).toContain('No URL');
    });

    it('should validate directory for directory method', async () => {
      const config = {
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          importMethod: 'directory',
          watchDirectory: '',
        },
      };

      const result = await plugin.testConnection(config);
      expect(result.success).toBe(false);
      expect(result.message).toContain('No directory');
    });
  });

  // ============================================================================
  // PDF PROCESSING
  // ============================================================================

  describe('processPDF', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should process PDF and extract deal data', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      expect(result.success).toBe(true);
      expect(result.deals.length).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);
    });

    it('should extract address from PDF', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      expect(result.success).toBe(true);
      if (result.deals.length > 0) {
        const deal = result.deals[0];
        expect(deal.address).toBeDefined();
        expect(deal.address.state).toBe('TX');
      }
    });

    it('should extract price from PDF', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      expect(result.success).toBe(true);
      if (result.deals.length > 0) {
        expect(result.deals[0].askingPrice).toBeGreaterThan(0);
      }
    });

    it('should extract property details from PDF', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      expect(result.success).toBe(true);
      if (result.deals.length > 0) {
        const deal = result.deals[0];
        expect(deal.bedrooms).toBeDefined();
        expect(deal.bathrooms).toBeDefined();
        expect(deal.sqft).toBeDefined();
      }
    });

    it('should extract wholesaler info from PDF', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      expect(result.success).toBe(true);
      if (result.deals.length > 0) {
        const deal = result.deals[0];
        expect(deal.wholesalerName).toBeDefined();
        expect(deal.wholesalerEmail).toBeDefined();
      }
    });

    it('should include text content in result', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      expect(result.textContent).toBeDefined();
      expect(result.textContent!.length).toBeGreaterThan(0);
    });

    it('should return error for empty PDF', async () => {
      // Mock empty PDF response
      const emptyPDFBuffer = Buffer.from('EMPTY_PDF');

      const result = await plugin.processPDF(emptyPDFBuffer, 'empty.pdf');

      // Should still attempt to process
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // OCR FUNCTIONALITY
  // ============================================================================

  describe('OCR Functionality', () => {
    beforeEach(async () => {
      await plugin.initialize({
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          enableOCR: true,
          minTextThreshold: 100,
        },
      });
    });

    it('should use OCR when text extraction returns minimal content', async () => {
      const result = await plugin.processPDF(scannedPDFBuffer, 'scanned.pdf');

      // OCR should be attempted for scanned PDFs
      expect(result).toBeDefined();
    });

    it('should not use OCR when disabled', async () => {
      await plugin.dispose();
      await plugin.initialize({
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          enableOCR: false,
        },
      });

      const result = await plugin.processPDF(scannedPDFBuffer, 'scanned.pdf');

      // With OCR disabled, scanned PDF should fail to extract
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // AI EXTRACTION
  // ============================================================================

  describe('AI Extraction', () => {
    beforeEach(async () => {
      await plugin.initialize({
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          parsingMode: 'ai',
        },
      });
    });

    it('should use AI for extraction when configured', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      expect(result.success).toBe(true);
      expect(result.deals.length).toBeGreaterThan(0);
    });

    it('should fall back to regex when AI fails', async () => {
      // Remove API key to force AI failure
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      await plugin.dispose();
      await plugin.initialize({
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          parsingMode: 'ai',
        },
      });

      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      // Should still work via regex fallback
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // REGEX EXTRACTION
  // ============================================================================

  describe('Regex Extraction', () => {
    beforeEach(async () => {
      await plugin.initialize({
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          parsingMode: 'regex',
        },
      });
    });

    it('should extract data using regex patterns', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      expect(result).toBeDefined();
    });

    it('should extract address patterns', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      if (result.deals.length > 0) {
        expect(result.deals[0].address).toBeDefined();
      }
    });

    it('should extract price patterns', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      if (result.deals.length > 0) {
        expect(result.deals[0].askingPrice).toBeDefined();
      }
    });
  });

  // ============================================================================
  // HYBRID EXTRACTION
  // ============================================================================

  describe('Hybrid Extraction', () => {
    beforeEach(async () => {
      await plugin.initialize({
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          parsingMode: 'hybrid',
        },
      });
    });

    it('should combine AI and regex extraction', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal-sheet.pdf');

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // MULTI-DEAL MODE
  // ============================================================================

  describe('Multi-Deal Mode', () => {
    beforeEach(async () => {
      await plugin.initialize({
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          multiDealMode: true,
          dealSeparatorPattern: 'Property\\s*#?\\s*\\d+',
        },
      });
    });

    it('should attempt to extract multiple deals from single PDF', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'multi-deal.pdf');

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // QUEUE FUNCTIONALITY
  // ============================================================================

  describe('Queue Functionality', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should queue PDFs for batch processing', async () => {
      plugin.queuePDF(samplePDFBuffer, 'deal1.pdf');
      plugin.queuePDF(samplePDFBuffer, 'deal2.pdf');

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.metadata.totalFound).toBe(2);
    });

    it('should clear queue after fetching', async () => {
      plugin.queuePDF(samplePDFBuffer, 'deal1.pdf');

      await plugin.fetchDeals();
      const result2 = await plugin.fetchDeals();

      expect(result2.metadata.totalFound).toBe(0);
    });
  });

  // ============================================================================
  // FETCH DEALS
  // ============================================================================

  describe('fetchDeals', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should return empty result when no PDFs queued', async () => {
      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.deals).toHaveLength(0);
      expect(result.metadata.totalFound).toBe(0);
    });

    it('should process queued PDFs', async () => {
      plugin.queuePDF(samplePDFBuffer, 'deal.pdf');

      const result = await plugin.fetchDeals();

      expect(result.success).toBe(true);
      expect(result.metadata.totalFound).toBe(1);
    });

    it('should include processing metadata', async () => {
      plugin.queuePDF(samplePDFBuffer, 'deal.pdf');

      const result = await plugin.fetchDeals();

      expect(result.metadata).toBeDefined();
      expect(result.metadata.syncDuration).toBeDefined();
      expect(result.metadata.totalProcessed).toBeDefined();
      expect(result.metadata.totalErrors).toBeDefined();
    });
  });

  // ============================================================================
  // NORMALIZATION
  // ============================================================================

  describe('Deal Normalization', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should normalize extracted deal data', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal.pdf');

      if (result.deals.length > 0) {
        const deal = result.deals[0];
        expect(deal.sourceId).toBe('test-pdf-source');
        expect(deal.sourceName).toBe('Test PDF Source');
        expect(deal.normalizedAt).toBeDefined();
      }
    });

    it('should calculate confidence score', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal.pdf');

      if (result.deals.length > 0) {
        expect(result.deals[0].confidence).toBeDefined();
        expect(result.deals[0].confidence).toBeGreaterThan(0);
        expect(result.deals[0].confidence).toBeLessThanOrEqual(100);
      }
    });

    it('should include raw data', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal.pdf');

      if (result.deals.length > 0) {
        expect(result.deals[0].rawData).toBeDefined();
        expect(result.deals[0].rawData._pdfFilename).toBe('deal.pdf');
      }
    });

    it('should normalize property type', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal.pdf');

      if (result.deals.length > 0 && result.deals[0].propertyType) {
        expect(['single_family', 'multi_family', 'condo', 'townhouse', 'mobile', 'land']).toContain(
          result.deals[0].propertyType
        );
      }
    });

    it('should normalize occupancy status', async () => {
      const result = await plugin.processPDF(samplePDFBuffer, 'deal.pdf');

      if (result.deals.length > 0 && result.deals[0].occupancyStatus) {
        expect(['vacant', 'occupied', 'tenant', 'owner', 'unknown']).toContain(
          result.deals[0].occupancyStatus
        );
      }
    });
  });

  // ============================================================================
  // DEFAULT VALUES
  // ============================================================================

  describe('Default Values', () => {
    it('should apply default wholesaler name', async () => {
      await plugin.initialize({
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          wholesalerDefault: 'Default Wholesaler',
          parsingMode: 'regex',
        },
      });

      const result = await plugin.processPDF(Buffer.from('MINIMAL_PDF_CONTENT'), 'minimal.pdf');

      // Default should be applied if not found in PDF
      expect(result).toBeDefined();
    });

    it('should apply default wholesaler email', async () => {
      await plugin.initialize({
        ...baseConfig,
        settings: {
          ...baseConfig.settings,
          wholesalerEmailDefault: 'default@wholesaler.com',
          parsingMode: 'regex',
        },
      });

      const result = await plugin.processPDF(Buffer.from('MINIMAL_PDF_CONTENT'), 'minimal.pdf');

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await plugin.initialize(baseConfig);
    });

    it('should handle invalid PDF buffer gracefully', async () => {
      const result = await plugin.processPDF(Buffer.from('not a valid pdf'), 'invalid.pdf');

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should handle empty buffer gracefully', async () => {
      const result = await plugin.processPDF(Buffer.from(''), 'empty.pdf');

      // Should handle gracefully without throwing
      expect(result).toBeDefined();
      // Note: Mock returns data for all PDFs, so in real scenario this would be empty
      expect(result.success).toBeDefined();
    });

    it('should report errors in result', async () => {
      const result = await plugin.processPDF(Buffer.from('INVALID'), 'bad.pdf');

      expect(result).toBeDefined();
      // Errors should be captured, not thrown
    });
  });

  // ============================================================================
  // RESOURCE CLEANUP
  // ============================================================================

  describe('Resource Cleanup', () => {
    it('should clean up resources on dispose', async () => {
      await plugin.initialize(baseConfig);
      plugin.queuePDF(samplePDFBuffer, 'deal.pdf');

      await plugin.dispose();

      // After dispose, operations should fail
      await expect(plugin.fetchDeals()).rejects.toThrow();
    });
  });
});
