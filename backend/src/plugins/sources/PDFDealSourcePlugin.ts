/**
 * PDF Deal Source Plugin
 *
 * Parse deals from PDF files - supports:
 * - Direct file upload
 * - URL fetch
 * - Text-based PDF extraction (pdf-parse)
 * - OCR for scanned PDFs (tesseract.js)
 * - AI-powered deal extraction (OpenAI/LangChain)
 * - Batch processing of multiple PDFs
 */

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
import * as fs from 'fs';
import * as path from 'path';

// Type definitions for pdf-parse
interface PDFData {
  numpages: number;
  numrender: number;
  info: Record<string, any>;
  metadata: Record<string, any> | null;
  text: string;
  version: string;
}

interface ExtractedDealData {
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  arv?: number;
  repairEstimate?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  yearBuilt?: number;
  lotSize?: number;
  propertyType?: string;
  description?: string;
  photos?: string[];
  wholesalerName?: string;
  wholesalerEmail?: string;
  wholesalerPhone?: string;
  wholesalerCompany?: string;
  contractExpiration?: string;
  assignmentFee?: number;
  emDeposit?: number;
  occupancyStatus?: string;
  [key: string]: any;
}

interface PDFProcessingResult {
  text: string;
  pageCount: number;
  usedOCR: boolean;
  metadata?: Record<string, any>;
}

export class PDFDealSourcePlugin extends BaseDealSourcePlugin {
  readonly type: DealSourceType = 'pdf';
  readonly name = 'PDF Import';
  readonly version = '1.0.0';
  readonly description = 'Import deals from PDF files with text extraction, OCR, and AI-powered parsing.';

  readonly configSchema: PluginConfigSchema = {
    fields: [
      {
        name: 'importMethod',
        label: 'Import Method',
        type: 'select',
        required: true,
        default: 'upload',
        options: [
          { value: 'upload', label: 'File Upload' },
          { value: 'url', label: 'URL Fetch' },
          { value: 'directory', label: 'Watch Directory' },
        ],
        description: 'How to retrieve PDF files',
      },
      {
        name: 'fileUrl',
        label: 'PDF URL',
        type: 'string',
        required: false,
        description: 'URL to the PDF file (for URL method)',
      },
      {
        name: 'watchDirectory',
        label: 'Watch Directory',
        type: 'string',
        required: false,
        description: 'Directory path to watch for new PDFs',
      },
      {
        name: 'parsingMode',
        label: 'Parsing Mode',
        type: 'select',
        required: false,
        default: 'ai',
        options: [
          { value: 'ai', label: 'AI-Powered (Recommended)' },
          { value: 'regex', label: 'Regex Patterns' },
          { value: 'hybrid', label: 'Hybrid (AI + Regex fallback)' },
        ],
        description: 'Method for extracting deal data from PDF text',
      },
      {
        name: 'enableOCR',
        label: 'Enable OCR for Scanned PDFs',
        type: 'boolean',
        required: false,
        default: true,
        description: 'Use OCR when text extraction returns minimal content',
      },
      {
        name: 'ocrLanguage',
        label: 'OCR Language',
        type: 'select',
        required: false,
        default: 'eng',
        options: [
          { value: 'eng', label: 'English' },
          { value: 'spa', label: 'Spanish' },
          { value: 'eng+spa', label: 'English + Spanish' },
        ],
        description: 'Language for OCR processing',
      },
      {
        name: 'minTextThreshold',
        label: 'Min Text Threshold (chars)',
        type: 'number',
        required: false,
        default: 100,
        validation: { min: 10, max: 1000 },
        description: 'Minimum characters before triggering OCR',
      },
      {
        name: 'extractionPatterns',
        label: 'Custom Extraction Patterns',
        type: 'json',
        required: false,
        description: 'Custom regex patterns for field extraction (JSON object)',
      },
      {
        name: 'wholesalerDefault',
        label: 'Default Wholesaler Name',
        type: 'string',
        required: false,
        description: 'Default wholesaler name if not found in PDF',
      },
      {
        name: 'wholesalerEmailDefault',
        label: 'Default Wholesaler Email',
        type: 'string',
        required: false,
        description: 'Default wholesaler email if not found in PDF',
      },
      {
        name: 'multiDealMode',
        label: 'Multi-Deal Mode',
        type: 'boolean',
        required: false,
        default: false,
        description: 'Attempt to extract multiple deals from a single PDF',
      },
      {
        name: 'dealSeparatorPattern',
        label: 'Deal Separator Pattern',
        type: 'string',
        required: false,
        default: '(?:Property|Deal|Listing)\\s*#?\\s*\\d+',
        description: 'Regex pattern to separate multiple deals in one PDF',
      },
    ],
  };

  // Queue for uploaded PDF content
  private pendingPDFs: Array<{
    content: Buffer;
    filename: string;
    uploadedAt: Date;
  }> = [];

  // Default extraction patterns for real estate data
  private defaultPatterns: Record<string, RegExp[]> = {
    address: [
      /(?:property\s*address|address|location)[:\s]*([0-9]+\s+[A-Za-z0-9\s,]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place)[.\s,]*)/i,
      /([0-9]+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place))/i,
    ],
    city: [
      /(?:city)[:\s]*([A-Za-z\s]+)/i,
      /,\s*([A-Za-z\s]+),?\s*[A-Z]{2}\s*\d{5}/,
    ],
    state: [
      /(?:state)[:\s]*([A-Z]{2})/i,
      /,\s*[A-Za-z\s]+,?\s*([A-Z]{2})\s*\d{5}/,
    ],
    zip: [
      /(?:zip|postal)[:\s]*(\d{5}(?:-\d{4})?)/i,
      /[A-Z]{2}\s*(\d{5}(?:-\d{4})?)/,
    ],
    price: [
      /(?:asking\s*price|contract\s*price|purchase\s*price|price)[:\s]*\$?\s*([0-9,]+)/i,
      /\$\s*([0-9,]+(?:\.[0-9]{2})?)\s*(?:asking|contract|purchase)?/i,
    ],
    arv: [
      /(?:arv|after\s*repair\s*value|estimated\s*value|as-is\s*value)[:\s]*\$?\s*([0-9,]+)/i,
    ],
    repairEstimate: [
      /(?:repair|rehab|renovation|repairs\s*needed|repair\s*estimate|repair\s*cost)[:\s]*\$?\s*([0-9,]+)/i,
    ],
    bedrooms: [
      /([0-9]+)\s*(?:bed|br|bedroom|bdrm)/i,
      /(?:bed|bedroom|br|bdrm)[:\s]*([0-9]+)/i,
    ],
    bathrooms: [
      /([0-9.]+)\s*(?:bath|ba|bathroom)/i,
      /(?:bath|bathroom|ba)[:\s]*([0-9.]+)/i,
    ],
    sqft: [
      /([0-9,]+)\s*(?:sq\.?\s*ft|sqft|square\s*feet|sf)/i,
      /(?:sq\.?\s*ft|sqft|living\s*area|heated\s*area)[:\s]*([0-9,]+)/i,
    ],
    yearBuilt: [
      /(?:year\s*built|built\s*in|built|construction\s*year)[:\s]*(\d{4})/i,
      /(\d{4})\s*(?:build|construction)/i,
    ],
    lotSize: [
      /(?:lot\s*size|lot)[:\s]*([0-9,.]+)\s*(?:acres?|sq\.?\s*ft|sqft)?/i,
    ],
    propertyType: [
      /(?:property\s*type|type)[:\s]*(single\s*family|sfr|multi-?family|duplex|triplex|quad|condo|townhouse|townhome|mobile|manufactured|land)/i,
    ],
    wholesalerName: [
      /(?:wholesaler|seller|contact|submitted\s*by|presented\s*by)[:\s]*([A-Za-z\s]+?)(?:\n|,|$)/i,
    ],
    wholesalerPhone: [
      /(?:phone|cell|mobile|tel|call)[:\s]*([0-9\-\(\)\s\.]+)/i,
      /(\(?[0-9]{3}\)?[\s\-\.][0-9]{3}[\s\-\.][0-9]{4})/,
    ],
    wholesalerEmail: [
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
    ],
    assignmentFee: [
      /(?:assignment\s*fee|fee|profit|spread)[:\s]*\$?\s*([0-9,]+)/i,
    ],
    emDeposit: [
      /(?:emd|earnest\s*money|deposit|em\s*deposit)[:\s]*\$?\s*([0-9,]+)/i,
    ],
    contractExpiration: [
      /(?:expir|close\s*date|closing\s*date|contract\s*expires?)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    ],
    occupancyStatus: [
      /(?:occupancy|occupied|status)[:\s]*(vacant|occupied|tenant|owner|renter)/i,
    ],
  };

  /**
   * Add a PDF to the processing queue (for file uploads)
   */
  public queuePDF(content: Buffer, filename: string): void {
    this.pendingPDFs.push({
      content,
      filename,
      uploadedAt: new Date(),
    });
  }

  /**
   * Process a PDF directly and return extracted deal data
   */
  public async processPDF(content: Buffer, filename?: string): Promise<{
    success: boolean;
    deals: NormalizedDeal[];
    errors: string[];
    textContent?: string;
  }> {
    this.ensureInitialized();

    try {
      // Extract text from PDF
      const processingResult = await this.extractTextFromPDF(content);

      if (!processingResult.text || processingResult.text.trim().length < 50) {
        return {
          success: false,
          deals: [],
          errors: ['Could not extract meaningful text from PDF'],
          textContent: processingResult.text,
        };
      }

      // Extract deal data
      const extractedDeals = await this.extractDealsFromText(
        processingResult.text,
        filename || 'uploaded.pdf'
      );

      const normalizedDeals: NormalizedDeal[] = [];
      const errors: string[] = [];

      for (const extractedData of extractedDeals) {
        try {
          const rawDeal: RawDeal = {
            sourceId: this.config!.id,
            sourceName: this.config!.name,
            externalId: `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            rawData: {
              ...extractedData,
              _pdfFilename: filename,
              _usedOCR: processingResult.usedOCR,
              _pageCount: processingResult.pageCount,
            },
            receivedAt: new Date(),
          };

          const normalized = await this.normalizeDeal(rawDeal);

          // Only include if we have minimum required data
          if (normalized.address.street || normalized.askingPrice > 0) {
            normalizedDeals.push(normalized);
          } else {
            errors.push('Extracted data missing required fields (address or price)');
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      return {
        success: normalizedDeals.length > 0,
        deals: normalizedDeals,
        errors,
        textContent: processingResult.text,
      };
    } catch (error) {
      return {
        success: false,
        deals: [],
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  async testConnection(config: DealSourceConfig): Promise<ConnectionTestResult> {
    const method = config.settings.importMethod;

    if (method === 'upload') {
      return {
        success: true,
        message: 'PDF upload method - ready to receive files',
        details: {
          parsingMode: config.settings.parsingMode || 'ai',
          ocrEnabled: config.settings.enableOCR !== false,
        },
      };
    }

    if (method === 'url') {
      const url = config.settings.fileUrl;
      if (!url) {
        return {
          success: false,
          message: 'No URL provided',
        };
      }

      try {
        const response = await fetch(url, { method: 'HEAD' });
        const contentType = response.headers.get('content-type');

        if (response.ok && contentType?.includes('pdf')) {
          return {
            success: true,
            message: 'PDF URL accessible',
            details: {
              contentType,
              contentLength: response.headers.get('content-length'),
            },
          };
        } else if (response.ok) {
          return {
            success: false,
            message: `URL does not appear to be a PDF (Content-Type: ${contentType})`,
          };
        } else {
          return {
            success: false,
            message: `URL returned status ${response.status}`,
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Failed to access URL: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    if (method === 'directory') {
      const dir = config.settings.watchDirectory;
      if (!dir) {
        return {
          success: false,
          message: 'No directory path provided',
        };
      }

      try {
        const stats = await fs.promises.stat(dir);
        if (stats.isDirectory()) {
          const files = await fs.promises.readdir(dir);
          const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
          return {
            success: true,
            message: `Directory accessible with ${pdfFiles.length} PDF files`,
            details: {
              totalFiles: files.length,
              pdfFiles: pdfFiles.length,
            },
          };
        } else {
          return {
            success: false,
            message: 'Path is not a directory',
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Cannot access directory: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return {
      success: true,
      message: 'PDF import ready',
    };
  }

  async fetchDeals(options?: FetchOptions): Promise<DealSourceResult> {
    this.ensureInitialized();
    const startTime = Date.now();
    const deals: NormalizedDeal[] = [];
    const errors: DealSourceError[] = [];

    try {
      const method = this.config!.settings.importMethod;
      let pdfBuffers: Array<{ content: Buffer; filename: string }> = [];

      // Get PDF content based on import method
      if (method === 'upload') {
        // Process queued PDFs
        pdfBuffers = this.pendingPDFs.map(p => ({
          content: p.content,
          filename: p.filename,
        }));
        this.pendingPDFs = [];
      } else if (method === 'url') {
        const url = this.config!.settings.fileUrl;
        if (url) {
          try {
            const response = await fetch(url);
            const buffer = Buffer.from(await response.arrayBuffer());
            const filename = path.basename(new URL(url).pathname) || 'download.pdf';
            pdfBuffers.push({ content: buffer, filename });
          } catch (error) {
            errors.push({
              error: `Failed to fetch PDF from URL: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }
      } else if (method === 'directory') {
        const dir = this.config!.settings.watchDirectory;
        if (dir) {
          try {
            const files = await fs.promises.readdir(dir);
            const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

            // Apply limit
            const limit = options?.limit || 10;
            const filesToProcess = pdfFiles.slice(0, limit);

            for (const filename of filesToProcess) {
              const filePath = path.join(dir, filename);
              const content = await fs.promises.readFile(filePath);
              pdfBuffers.push({ content, filename });
            }
          } catch (error) {
            errors.push({
              error: `Failed to read directory: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }
      }

      // Process each PDF
      for (const { content, filename } of pdfBuffers) {
        const result = await this.processPDF(content, filename);
        deals.push(...result.deals);

        for (const err of result.errors) {
          errors.push({
            error: err,
            rawData: { filename },
          });
        }
      }

      return {
        success: true,
        deals,
        errors,
        metadata: {
          totalFound: pdfBuffers.length,
          totalProcessed: deals.length,
          totalErrors: errors.length,
          syncDuration: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        deals: [],
        errors: [{ error: error instanceof Error ? error.message : String(error) }],
        metadata: {
          totalFound: 0,
          totalProcessed: 0,
          totalErrors: 1,
          syncDuration: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Extract text from PDF using pdf-parse, with OCR fallback
   */
  private async extractTextFromPDF(content: Buffer): Promise<PDFProcessingResult> {
    let text = '';
    let usedOCR = false;
    let pageCount = 0;
    let metadata: Record<string, any> = {};

    try {
      // Try text extraction first using pdf-parse
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: content });

      // Get text from PDF
      const textResult = await parser.getText();
      text = textResult.text || '';
      pageCount = textResult.pages?.length || 0;

      // Get metadata
      try {
        const infoResult = await parser.getInfo();
        metadata = infoResult.info || {};
      } catch {
        // Info extraction is optional
      }

      // Clean up parser
      await parser.destroy();

      // Check if we got meaningful text
      const minThreshold = this.config?.settings.minTextThreshold || 100;
      const cleanText = text.replace(/\s+/g, ' ').trim();

      if (cleanText.length < minThreshold && this.config?.settings.enableOCR !== false) {
        // Text extraction returned minimal content, try OCR
        console.log(`PDF text extraction returned only ${cleanText.length} chars, attempting OCR...`);
        const ocrResult = await this.performOCR(content);
        if (ocrResult && ocrResult.length > cleanText.length) {
          text = ocrResult;
          usedOCR = true;
        }
      }
    } catch (error) {
      console.error('PDF text extraction failed:', error);

      // Try OCR as last resort
      if (this.config?.settings.enableOCR !== false) {
        try {
          text = await this.performOCR(content) || '';
          usedOCR = true;
        } catch (ocrError) {
          console.error('OCR also failed:', ocrError);
        }
      }
    }

    return {
      text,
      pageCount,
      usedOCR,
      metadata,
    };
  }

  /**
   * Perform OCR on PDF using tesseract.js
   */
  private async performOCR(pdfContent: Buffer): Promise<string | null> {
    try {
      const { createWorker } = await import('tesseract.js');
      const language = this.config?.settings.ocrLanguage || 'eng';

      // Create worker
      const worker = await createWorker(language);

      // For PDF OCR, we need to convert PDF pages to images first
      // This is a simplified version - in production, you'd use pdf-to-image library
      // For now, tesseract can work directly with the PDF buffer in some cases

      try {
        const result = await worker.recognize(pdfContent);
        await worker.terminate();
        return result.data.text;
      } catch (recognizeError) {
        await worker.terminate();
        console.log('Direct PDF OCR failed, would need PDF-to-image conversion');
        return null;
      }
    } catch (error) {
      console.error('OCR error:', error);
      return null;
    }
  }

  /**
   * Extract deal data from text content
   */
  private async extractDealsFromText(text: string, filename: string): Promise<ExtractedDealData[]> {
    const parsingMode = this.config?.settings.parsingMode || 'ai';
    const multiDealMode = this.config?.settings.multiDealMode || false;

    // Split into multiple deals if multi-deal mode is enabled
    let textSegments: string[] = [text];

    if (multiDealMode) {
      const separatorPattern = this.config?.settings.dealSeparatorPattern || '(?:Property|Deal|Listing)\\s*#?\\s*\\d+';
      const regex = new RegExp(separatorPattern, 'gi');
      const matches = text.split(regex);

      if (matches.length > 1) {
        textSegments = matches.filter(segment => segment.trim().length > 50);
      }
    }

    const extractedDeals: ExtractedDealData[] = [];

    for (const segment of textSegments) {
      let extractedData: ExtractedDealData;

      switch (parsingMode) {
        case 'ai':
          extractedData = await this.extractWithAI(segment, filename);
          break;
        case 'hybrid':
          extractedData = await this.extractWithAI(segment, filename);
          // Fill in missing fields with regex
          const regexData = this.extractWithPatterns(segment);
          extractedData = { ...regexData, ...extractedData };
          break;
        case 'regex':
        default:
          extractedData = this.extractWithPatterns(segment);
          break;
      }

      // Apply defaults
      if (!extractedData.wholesalerName && this.config?.settings.wholesalerDefault) {
        extractedData.wholesalerName = this.config.settings.wholesalerDefault;
      }
      if (!extractedData.wholesalerEmail && this.config?.settings.wholesalerEmailDefault) {
        extractedData.wholesalerEmail = this.config.settings.wholesalerEmailDefault;
      }

      extractedDeals.push(extractedData);
    }

    return extractedDeals;
  }

  /**
   * Extract deal data using regex patterns
   */
  private extractWithPatterns(text: string): ExtractedDealData {
    const customPatterns = this.config?.settings.extractionPatterns || {};
    const patterns = { ...this.defaultPatterns, ...customPatterns };
    const extracted: ExtractedDealData = {};

    for (const [field, regexes] of Object.entries(patterns)) {
      for (const regex of regexes as RegExp[]) {
        const match = text.match(regex);
        if (match && match[1]) {
          let value: any = match[1].trim();

          // Convert numeric fields
          if (['price', 'arv', 'repairEstimate', 'sqft', 'yearBuilt', 'lotSize', 'assignmentFee', 'emDeposit'].includes(field)) {
            value = parseFloat(value.replace(/[^0-9.]/g, ''));
            if (isNaN(value)) continue;
          }
          if (['bedrooms', 'bathrooms'].includes(field)) {
            value = parseFloat(value);
            if (isNaN(value)) continue;
          }

          extracted[field] = value;
          break;
        }
      }
    }

    return extracted;
  }

  /**
   * Extract deal data using AI (OpenAI/LangChain)
   */
  private async extractWithAI(text: string, filename: string): Promise<ExtractedDealData> {
    try {
      const openAIKey = process.env.OPENAI_API_KEY;
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      const apiKey = openAIKey || openRouterKey;
      const useOpenAI = !!openAIKey;

      if (!apiKey) {
        console.log('No OpenAI key available, falling back to regex extraction');
        return this.extractWithPatterns(text);
      }

      const { ChatOpenAI } = await import('@langchain/openai');

      const model = new ChatOpenAI({
        openAIApiKey: apiKey,
        modelName: useOpenAI ? 'gpt-4o-mini' : 'openai/gpt-4o-mini',
        temperature: 0,
        configuration: useOpenAI ? undefined : {
          baseURL: 'https://openrouter.ai/api/v1',
        },
      });

      const prompt = `Extract real estate deal/property information from this PDF content. This appears to be a wholesaler deal sheet or property listing.

Return a JSON object with these fields (use null if not found):
- address: full street address
- city: city name
- state: 2-letter state code (e.g., TX, FL, CA)
- zip: ZIP code (5 digits)
- price: asking/contract price (number only, no $ or commas)
- arv: after repair value (number only)
- repairEstimate: estimated repair cost (number only)
- bedrooms: number of bedrooms
- bathrooms: number of bathrooms (can be decimal like 2.5)
- sqft: square footage (number only)
- yearBuilt: year built (4 digit year)
- lotSize: lot size in sq ft or acres
- propertyType: type (single_family, multi_family, condo, townhouse, mobile, land)
- description: brief property description
- wholesalerName: name of wholesaler/seller
- wholesalerEmail: contact email
- wholesalerPhone: contact phone
- wholesalerCompany: company name
- assignmentFee: assignment fee amount
- emDeposit: earnest money deposit amount
- contractExpiration: contract expiration date
- occupancyStatus: vacant, occupied, tenant, or owner

PDF Filename: ${filename}

PDF Content:
${text.substring(0, 6000)}

Return ONLY valid JSON, no other text or markdown.`;

      const response = await model.invoke(prompt);
      const content = typeof response.content === 'string' ? response.content : '';

      // Parse the JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Clean null values
        const cleaned: ExtractedDealData = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (value !== null && value !== undefined && value !== '') {
            cleaned[key] = value;
          }
        }

        return cleaned;
      }
    } catch (error) {
      console.log('AI extraction failed, falling back to regex:', error);
    }

    // Fallback to regex extraction
    return this.extractWithPatterns(text);
  }

  protected async customNormalization(normalized: NormalizedDeal, rawDeal: RawDeal): Promise<NormalizedDeal> {
    const data = rawDeal.rawData;

    // Handle address parsing if we got a full address string
    if (data.address && typeof data.address === 'string' && !normalized.address.street) {
      normalized.address.street = data.address;
    }

    // Parse individual address components
    if (data.street) normalized.address.street = data.street;
    if (data.city) normalized.address.city = data.city;
    if (data.state) normalized.address.state = data.state;
    if (data.zip) normalized.address.zip = data.zip;

    // Financial fields
    if (data.arv) normalized.arv = Number(data.arv);
    if (data.repairEstimate) normalized.repairEstimate = Number(data.repairEstimate);
    if (data.assignmentFee) normalized.assignmentFee = Number(data.assignmentFee);
    if (data.emDeposit) normalized.emDeposit = Number(data.emDeposit);

    // Property details
    if (data.propertyType) normalized.propertyType = this.normalizePropertyType(data.propertyType);
    if (data.lotSize) normalized.lotSize = Number(data.lotSize);

    // Wholesaler info
    if (data.wholesalerName) normalized.wholesalerName = data.wholesalerName;
    if (data.wholesalerEmail) normalized.wholesalerEmail = data.wholesalerEmail;
    if (data.wholesalerPhone) normalized.wholesalerPhone = data.wholesalerPhone;
    if (data.wholesalerCompany) normalized.wholesalerCompany = data.wholesalerCompany;

    // Contract details
    if (data.contractExpiration) {
      const date = new Date(data.contractExpiration);
      if (!isNaN(date.getTime())) {
        normalized.contractExpiration = date;
      }
    }

    // Occupancy
    if (data.occupancyStatus) {
      normalized.occupancyStatus = this.normalizeOccupancy(data.occupancyStatus);
    }

    // Set confidence based on parsing method and data completeness
    const usedOCR = data._usedOCR;
    const parsingMode = this.config?.settings.parsingMode || 'regex';

    let confidenceModifier = 0;
    if (parsingMode === 'ai') confidenceModifier += 10;
    if (usedOCR) confidenceModifier -= 10; // OCR is less reliable

    normalized.confidence = Math.max(0, Math.min(100, normalized.confidence + confidenceModifier));

    return normalized;
  }

  private normalizePropertyType(type: string): string {
    const lower = type.toLowerCase().replace(/[_-]/g, ' ');
    if (lower.includes('single') || lower.includes('sfr') || lower.includes('house')) {
      return 'single_family';
    }
    if (lower.includes('multi') || lower.includes('duplex') || lower.includes('triplex') || lower.includes('quad')) {
      return 'multi_family';
    }
    if (lower.includes('condo')) return 'condo';
    if (lower.includes('town')) return 'townhouse';
    if (lower.includes('mobile') || lower.includes('manufactured')) return 'mobile';
    if (lower.includes('land') || lower.includes('lot')) return 'land';
    return type;
  }

  protected async onDispose(): Promise<void> {
    this.pendingPDFs = [];
  }
}
