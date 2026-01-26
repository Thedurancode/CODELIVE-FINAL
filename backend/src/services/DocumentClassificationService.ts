/**
 * Document Classification Service
 *
 * ML-powered document classification for automatic document type detection.
 * Uses OpenAI Vision API and text analysis to classify uploaded documents
 * and route them to appropriate workflows.
 *
 * Document Types:
 * - contract: Purchase agreements, assignment contracts
 * - inspection: Property inspection reports
 * - appraisal: Property value appraisals
 * - disclosure: Seller disclosures, property condition reports
 * - title: Title documents, deeds, liens
 * - photo: Property photos
 * - other: Unclassified documents
 */

import OpenAI from 'openai';
import Tesseract from 'tesseract.js';
import * as crypto from 'crypto';

// Document types supported by classification
export type ClassifiableDocumentType =
  | 'contract'
  | 'inspection'
  | 'appraisal'
  | 'disclosure'
  | 'title'
  | 'photo'
  | 'other';

// Classification result with confidence scores
export interface ClassificationResult {
  success: boolean;
  documentType: ClassifiableDocumentType;
  confidence: number;
  allScores: Record<ClassifiableDocumentType, number>;
  extractedFields?: ExtractedDocumentFields;
  suggestedWorkflow?: string;
  processingTimeMs: number;
  source: 'vision' | 'text' | 'filename' | 'mimetype';
  error?: string;
}

// Fields extracted based on document type
export interface ExtractedDocumentFields {
  // Common fields
  documentDate?: Date;
  documentTitle?: string;

  // Contract fields
  sellerName?: string;
  buyerName?: string;
  propertyAddress?: string;
  purchasePrice?: number;
  closingDate?: Date;

  // Inspection fields
  inspectionDate?: Date;
  inspectorName?: string;
  inspectionType?: string;
  majorIssues?: string[];

  // Appraisal fields
  appraisedValue?: number;
  appraisalDate?: Date;
  appraiserName?: string;

  // Disclosure fields
  disclosureType?: string;
  knownDefects?: string[];

  // Title fields
  titleCompany?: string;
  lienAmount?: number;
  encumbrances?: string[];
}

// Document type patterns for text-based classification
const DOCUMENT_TYPE_PATTERNS: Record<ClassifiableDocumentType, {
  keywords: string[];
  negativeKeywords?: string[];
  weight: number;
}> = {
  contract: {
    keywords: [
      'purchase agreement', 'sales contract', 'real estate contract',
      'assignment agreement', 'buyer', 'seller', 'closing date',
      'earnest money', 'purchase price', 'consideration',
      'convey', 'deed', 'parties agree', 'contract price',
      'assignment of contract', 'assignor', 'assignee',
      'wholesale agreement', 'memorandum of agreement'
    ],
    weight: 1.0
  },
  inspection: {
    keywords: [
      'inspection report', 'property inspection', 'home inspection',
      'inspector', 'deficiencies', 'electrical', 'plumbing',
      'hvac', 'roof condition', 'foundation', 'structural',
      'pest inspection', 'termite', 'mold', 'radon',
      'satisfactory', 'unsatisfactory', 'needs repair',
      'recommended repairs', 'immediate attention'
    ],
    weight: 1.0
  },
  appraisal: {
    keywords: [
      'appraisal', 'appraised value', 'market value',
      'comparable sales', 'comps', 'property valuation',
      'fair market', 'assessment', 'appraiser',
      'uniform residential', 'urar', 'as-is value',
      'subject property', 'effective date', 'reconciliation'
    ],
    weight: 1.0
  },
  disclosure: {
    keywords: [
      'disclosure', 'seller disclosure', 'property disclosure',
      'known defects', 'material facts', 'condition report',
      'lead paint', 'hazard', 'environmental',
      'as-is', 'warranty disclaimer', 'hoa disclosure',
      'flood zone', 'natural hazard', 'transfer disclosure'
    ],
    weight: 1.0
  },
  title: {
    keywords: [
      'title', 'deed', 'title insurance', 'title commitment',
      'lien', 'encumbrance', 'easement', 'mortgage',
      'warranty deed', 'quitclaim', 'title search',
      'chain of title', 'title company', 'exceptions',
      'schedule b', 'legal description', 'vested'
    ],
    weight: 1.0
  },
  photo: {
    keywords: [],
    negativeKeywords: ['contract', 'agreement', 'inspection', 'disclosure'],
    weight: 0.5
  },
  other: {
    keywords: [],
    weight: 0.1
  }
};

// Workflow routing based on document type
const DOCUMENT_WORKFLOWS: Record<ClassifiableDocumentType, string> = {
  contract: 'contract_review_workflow',
  inspection: 'inspection_review_workflow',
  appraisal: 'appraisal_review_workflow',
  disclosure: 'disclosure_review_workflow',
  title: 'title_review_workflow',
  photo: 'photo_cataloging_workflow',
  other: 'manual_classification_workflow'
};

class DocumentClassificationService {
  private initialized = false;
  private openai: OpenAI | null = null;
  private visionModel = process.env.DOC_CLASSIFICATION_MODEL || 'gpt-4o-mini';

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.log('[DocumentClassification] Service initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  private getOpenAIClient(): OpenAI | null {
    if (this.openai) return this.openai;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    this.openai = new OpenAI({ apiKey });
    return this.openai;
  }

  /**
   * Main classification entry point
   * Classifies a document and extracts relevant fields
   */
  async classifyDocument(
    buffer: Buffer,
    mimeType: string,
    fileName: string
  ): Promise<ClassificationResult> {
    const startTime = Date.now();

    try {
      // Quick classification for images (photos)
      if (mimeType.startsWith('image/') && !this.isDocumentImage(fileName)) {
        const photoResult = await this.classifyAsPhoto(buffer, mimeType, startTime);
        if (photoResult.confidence > 0.7) {
          return photoResult;
        }
      }

      // Try filename-based classification first (fast)
      const filenameResult = this.classifyByFilename(fileName);
      if (filenameResult.confidence > 0.8) {
        return {
          ...filenameResult,
          processingTimeMs: Date.now() - startTime
        };
      }

      // For PDFs and document images, use vision API if available
      if (this.canUseVision(mimeType)) {
        const visionResult = await this.classifyWithVision(buffer, mimeType);
        if (visionResult.success && visionResult.confidence > 0.6) {
          return {
            ...visionResult,
            processingTimeMs: Date.now() - startTime
          };
        }
      }

      // Fallback to text extraction and analysis
      const textResult = await this.classifyByText(buffer, mimeType);
      return {
        ...textResult,
        processingTimeMs: Date.now() - startTime
      };
    } catch (error) {
      console.error('[DocumentClassification] Classification failed:', error);
      return {
        success: false,
        documentType: 'other',
        confidence: 0,
        allScores: this.getEmptyScores(),
        processingTimeMs: Date.now() - startTime,
        source: 'filename',
        error: error instanceof Error ? error.message : 'Classification failed'
      };
    }
  }

  /**
   * Classify document using OpenAI Vision API
   */
  private async classifyWithVision(
    buffer: Buffer,
    mimeType: string
  ): Promise<Omit<ClassificationResult, 'processingTimeMs'>> {
    const client = this.getOpenAIClient();
    if (!client) {
      return {
        success: false,
        documentType: 'other',
        confidence: 0,
        allScores: this.getEmptyScores(),
        source: 'vision',
        error: 'OpenAI API key not configured'
      };
    }

    try {
      let imageUrl: string;

      if (mimeType === 'application/pdf') {
        // For PDFs, render first page to image
        const imageData = await this.renderPdfFirstPage(buffer);
        if (!imageData) {
          throw new Error('Failed to render PDF');
        }
        imageUrl = imageData;
      } else {
        // For images, use base64 encoding
        const base64 = buffer.toString('base64');
        imageUrl = `data:${mimeType};base64,${base64}`;
      }

      const response = await client.chat.completions.create({
        model: this.visionModel,
        messages: [
          {
            role: 'system',
            content: `You are a document classification expert for real estate documents. Analyze the document image and classify it into one of these categories:
- contract: Purchase agreements, assignment contracts, sales contracts
- inspection: Property inspection reports (home, pest, structural)
- appraisal: Property appraisals and valuations
- disclosure: Seller disclosures, condition reports, hazard disclosures
- title: Title documents, deeds, title commitments, lien documents
- photo: Property photos (not documents)
- other: Documents that don't fit other categories

Return a JSON object with:
{
  "documentType": "category_name",
  "confidence": 0.0-1.0,
  "allScores": { "contract": 0.0, "inspection": 0.0, ... },
  "extractedFields": {
    // Relevant fields based on document type
    "documentTitle": "string or null",
    "documentDate": "YYYY-MM-DD or null",
    // For contracts:
    "sellerName": "string or null",
    "buyerName": "string or null",
    "propertyAddress": "string or null",
    "purchasePrice": number or null,
    // For inspections:
    "inspectorName": "string or null",
    "inspectionType": "string or null",
    // For appraisals:
    "appraisedValue": number or null,
    "appraiserName": "string or null"
    // etc.
  }
}

Be conservative with confidence - only give high scores when certain.
Extract any visible fields relevant to the document type.`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Classify this real estate document:' },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
            ]
          }
        ],
        temperature: 0,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from vision model');
      }

      const parsed = JSON.parse(content);
      const documentType = this.validateDocumentType(parsed.documentType);
      const confidence = typeof parsed.confidence === 'number'
        ? Math.min(Math.max(parsed.confidence, 0), 1)
        : 0.5;

      // Parse extracted fields
      const extractedFields = this.parseExtractedFields(parsed.extractedFields, documentType);

      return {
        success: true,
        documentType,
        confidence,
        allScores: this.normalizeScores(parsed.allScores),
        extractedFields,
        suggestedWorkflow: DOCUMENT_WORKFLOWS[documentType],
        source: 'vision'
      };
    } catch (error) {
      console.warn('[DocumentClassification] Vision classification failed:', error);
      return {
        success: false,
        documentType: 'other',
        confidence: 0,
        allScores: this.getEmptyScores(),
        source: 'vision',
        error: error instanceof Error ? error.message : 'Vision classification failed'
      };
    }
  }

  /**
   * Classify document by extracting and analyzing text
   */
  private async classifyByText(
    buffer: Buffer,
    mimeType: string
  ): Promise<Omit<ClassificationResult, 'processingTimeMs'>> {
    try {
      let text = '';

      if (mimeType === 'application/pdf') {
        text = await this.extractPdfText(buffer);
      } else if (mimeType.startsWith('image/')) {
        const ocrResult = await Tesseract.recognize(buffer, 'eng', {
          logger: () => {}
        });
        text = ocrResult.data.text;
      } else {
        // For text files
        text = buffer.toString('utf-8');
      }

      if (!text || text.length < 50) {
        return {
          success: false,
          documentType: 'other',
          confidence: 0.3,
          allScores: this.getEmptyScores(),
          source: 'text',
          error: 'Insufficient text extracted'
        };
      }

      // Score against all document types
      const scores = this.scoreText(text);
      const sortedTypes = Object.entries(scores)
        .sort(([, a], [, b]) => b - a);

      const [topType, topScore] = sortedTypes[0];
      const documentType = topType as ClassifiableDocumentType;

      // Extract fields based on detected type
      const extractedFields = this.extractFieldsFromText(text, documentType);

      return {
        success: true,
        documentType,
        confidence: topScore,
        allScores: scores,
        extractedFields,
        suggestedWorkflow: DOCUMENT_WORKFLOWS[documentType],
        source: 'text'
      };
    } catch (error) {
      console.warn('[DocumentClassification] Text classification failed:', error);
      return {
        success: false,
        documentType: 'other',
        confidence: 0,
        allScores: this.getEmptyScores(),
        source: 'text',
        error: error instanceof Error ? error.message : 'Text classification failed'
      };
    }
  }

  /**
   * Quick classification by filename patterns
   */
  private classifyByFilename(fileName: string): Omit<ClassificationResult, 'processingTimeMs'> {
    const lowerName = fileName.toLowerCase();

    const patterns: Array<{ regex: RegExp; type: ClassifiableDocumentType; confidence: number }> = [
      // Contract patterns
      { regex: /contract|agreement|purchase.*agreement|assignment/i, type: 'contract', confidence: 0.85 },
      { regex: /psa|pa\d+|assign/i, type: 'contract', confidence: 0.75 },

      // Inspection patterns
      { regex: /inspection|inspect\d*|home.*inspect/i, type: 'inspection', confidence: 0.9 },
      { regex: /pest|termite|radon|mold/i, type: 'inspection', confidence: 0.85 },

      // Appraisal patterns
      { regex: /appraisal|apprais\d*|valuation/i, type: 'appraisal', confidence: 0.9 },
      { regex: /urar|1004/i, type: 'appraisal', confidence: 0.85 },

      // Disclosure patterns
      { regex: /disclosure|disclos\d*|spds|seller.*discl/i, type: 'disclosure', confidence: 0.9 },
      { regex: /lead.*paint|hazard.*discl/i, type: 'disclosure', confidence: 0.85 },

      // Title patterns
      { regex: /title|deed|lien|encumbrance/i, type: 'title', confidence: 0.85 },
      { regex: /commitment|policy|chain.*of.*title/i, type: 'title', confidence: 0.8 },

      // Photo patterns
      { regex: /photo|img|pic|image|dsc|dcim/i, type: 'photo', confidence: 0.7 },
      { regex: /front|back|kitchen|bathroom|bedroom|exterior|interior/i, type: 'photo', confidence: 0.6 }
    ];

    for (const { regex, type, confidence } of patterns) {
      if (regex.test(lowerName)) {
        const scores = this.getEmptyScores();
        scores[type] = confidence;

        return {
          success: true,
          documentType: type,
          confidence,
          allScores: scores,
          suggestedWorkflow: DOCUMENT_WORKFLOWS[type],
          source: 'filename'
        };
      }
    }

    return {
      success: true,
      documentType: 'other',
      confidence: 0.3,
      allScores: this.getEmptyScores(),
      suggestedWorkflow: DOCUMENT_WORKFLOWS.other,
      source: 'filename'
    };
  }

  /**
   * Classify image as photo vs document image
   */
  private async classifyAsPhoto(
    buffer: Buffer,
    mimeType: string,
    startTime: number
  ): Promise<ClassificationResult> {
    const client = this.getOpenAIClient();

    // Quick heuristic: if we have vision API, use it for photo detection
    if (client) {
      try {
        const base64 = buffer.toString('base64');
        const imageUrl = `data:${mimeType};base64,${base64}`;

        const response = await client.chat.completions.create({
          model: this.visionModel,
          messages: [
            {
              role: 'system',
              content: `Determine if this image is:
1. A "photo" - a photograph of a property, room, exterior, or location
2. A "document" - a scanned document, form, or text-heavy image

Return JSON: {"isPhoto": true/false, "confidence": 0.0-1.0}
Only return true for actual photographs, not scanned documents.`
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Is this a photo or a document?' },
                { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } }
              ]
            }
          ],
          temperature: 0,
          max_tokens: 100,
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed.isPhoto) {
            const scores = this.getEmptyScores();
            scores.photo = parsed.confidence || 0.8;

            return {
              success: true,
              documentType: 'photo',
              confidence: parsed.confidence || 0.8,
              allScores: scores,
              suggestedWorkflow: DOCUMENT_WORKFLOWS.photo,
              processingTimeMs: Date.now() - startTime,
              source: 'vision'
            };
          }
        }
      } catch (error) {
        console.warn('[DocumentClassification] Photo detection failed:', error);
      }
    }

    // Fallback: assume it's not a simple photo, let full classification handle it
    return {
      success: false,
      documentType: 'other',
      confidence: 0,
      allScores: this.getEmptyScores(),
      processingTimeMs: Date.now() - startTime,
      source: 'mimetype'
    };
  }

  /**
   * Score text against document type patterns
   */
  private scoreText(text: string): Record<ClassifiableDocumentType, number> {
    const lowerText = text.toLowerCase();
    const scores: Record<ClassifiableDocumentType, number> = this.getEmptyScores();

    for (const [type, config] of Object.entries(DOCUMENT_TYPE_PATTERNS)) {
      const docType = type as ClassifiableDocumentType;
      let score = 0;
      let matchCount = 0;

      // Count keyword matches
      for (const keyword of config.keywords) {
        const regex = new RegExp(keyword.replace(/\s+/g, '\\s+'), 'gi');
        const matches = lowerText.match(regex);
        if (matches) {
          matchCount += matches.length;
          score += config.weight;
        }
      }

      // Penalize for negative keywords
      if (config.negativeKeywords) {
        for (const keyword of config.negativeKeywords) {
          if (lowerText.includes(keyword.toLowerCase())) {
            score *= 0.5;
          }
        }
      }

      // Normalize score based on keyword count and text length
      const keywordCount = config.keywords.length || 1;
      const normalizedScore = Math.min(
        (matchCount / keywordCount) * config.weight,
        1.0
      );

      scores[docType] = normalizedScore;
    }

    // Normalize all scores to sum to 1 (for probability interpretation)
    const total = Object.values(scores).reduce((sum, s) => sum + s, 0);
    if (total > 0) {
      for (const type of Object.keys(scores) as ClassifiableDocumentType[]) {
        scores[type] = scores[type] / total;
      }
    }

    return scores;
  }

  /**
   * Extract document fields from text based on type
   */
  private extractFieldsFromText(
    text: string,
    documentType: ClassifiableDocumentType
  ): ExtractedDocumentFields {
    const fields: ExtractedDocumentFields = {};

    // Common date extraction
    const dateMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
    if (dateMatch) {
      const parsed = new Date(dateMatch[1]);
      if (!isNaN(parsed.getTime())) {
        fields.documentDate = parsed;
      }
    }

    switch (documentType) {
      case 'contract':
        this.extractContractFields(text, fields);
        break;
      case 'inspection':
        this.extractInspectionFields(text, fields);
        break;
      case 'appraisal':
        this.extractAppraisalFields(text, fields);
        break;
      case 'disclosure':
        this.extractDisclosureFields(text, fields);
        break;
      case 'title':
        this.extractTitleFields(text, fields);
        break;
    }

    return fields;
  }

  private extractContractFields(text: string, fields: ExtractedDocumentFields): void {
    // Seller name
    const sellerMatch = text.match(/seller[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    if (sellerMatch) fields.sellerName = sellerMatch[1].trim();

    // Buyer name
    const buyerMatch = text.match(/buyer[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    if (buyerMatch) fields.buyerName = buyerMatch[1].trim();

    // Purchase price
    const priceMatch = text.match(/(?:purchase\s+)?price[:\s]*\$?\s*([\d,]+)/i);
    if (priceMatch) fields.purchasePrice = parseFloat(priceMatch[1].replace(/,/g, ''));

    // Property address
    const addressMatch = text.match(/(?:property|premises)[:\s]+(\d+\s+[A-Za-z0-9\s,]+)/i);
    if (addressMatch) fields.propertyAddress = addressMatch[1].trim();

    // Closing date
    const closingMatch = text.match(/closing[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (closingMatch) {
      const parsed = new Date(closingMatch[1]);
      if (!isNaN(parsed.getTime())) fields.closingDate = parsed;
    }
  }

  private extractInspectionFields(text: string, fields: ExtractedDocumentFields): void {
    // Inspector name
    const inspectorMatch = text.match(/inspector[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (inspectorMatch) fields.inspectorName = inspectorMatch[1].trim();

    // Inspection type
    if (/pest|termite/i.test(text)) fields.inspectionType = 'Pest Inspection';
    else if (/home inspection/i.test(text)) fields.inspectionType = 'Home Inspection';
    else if (/radon/i.test(text)) fields.inspectionType = 'Radon Inspection';
    else if (/mold/i.test(text)) fields.inspectionType = 'Mold Inspection';

    // Inspection date
    const dateMatch = text.match(/inspection\s+date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (dateMatch) {
      const parsed = new Date(dateMatch[1]);
      if (!isNaN(parsed.getTime())) fields.inspectionDate = parsed;
    }
  }

  private extractAppraisalFields(text: string, fields: ExtractedDocumentFields): void {
    // Appraised value
    const valueMatch = text.match(/(?:appraised|market)\s+value[:\s]*\$?\s*([\d,]+)/i);
    if (valueMatch) fields.appraisedValue = parseFloat(valueMatch[1].replace(/,/g, ''));

    // Appraiser name
    const appraiserMatch = text.match(/appraiser[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (appraiserMatch) fields.appraiserName = appraiserMatch[1].trim();

    // Appraisal date
    const dateMatch = text.match(/(?:effective|appraisal)\s+date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (dateMatch) {
      const parsed = new Date(dateMatch[1]);
      if (!isNaN(parsed.getTime())) fields.appraisalDate = parsed;
    }
  }

  private extractDisclosureFields(text: string, fields: ExtractedDocumentFields): void {
    // Disclosure type
    if (/lead.*paint/i.test(text)) fields.disclosureType = 'Lead Paint Disclosure';
    else if (/seller.*disclosure/i.test(text)) fields.disclosureType = 'Seller Property Disclosure';
    else if (/natural.*hazard/i.test(text)) fields.disclosureType = 'Natural Hazard Disclosure';
    else if (/hoa/i.test(text)) fields.disclosureType = 'HOA Disclosure';

    // Known defects (simple extraction)
    const defects: string[] = [];
    const defectPatterns = [
      /roof.*(?:leak|damage|repair)/gi,
      /foundation.*(?:crack|issue|problem)/gi,
      /plumbing.*(?:leak|issue|problem)/gi,
      /electrical.*(?:issue|problem|repair)/gi,
      /hvac.*(?:issue|problem|repair)/gi,
      /water.*damage/gi,
      /mold.*(?:present|found)/gi
    ];

    for (const pattern of defectPatterns) {
      const matches = text.match(pattern);
      if (matches) defects.push(...matches);
    }

    if (defects.length > 0) fields.knownDefects = defects;
  }

  private extractTitleFields(text: string, fields: ExtractedDocumentFields): void {
    // Title company
    const companyMatch = text.match(/(?:title\s+company|underwriter)[:\s]+([A-Za-z\s&]+(?:Title|Insurance))/i);
    if (companyMatch) fields.titleCompany = companyMatch[1].trim();

    // Lien amount
    const lienMatch = text.match(/(?:mortgage|lien)\s+amount[:\s]*\$?\s*([\d,]+)/i);
    if (lienMatch) fields.lienAmount = parseFloat(lienMatch[1].replace(/,/g, ''));

    // Encumbrances (simple extraction)
    const encumbrances: string[] = [];
    const encumbrancePatterns = [
      /easement[^.]+/gi,
      /restriction[^.]+/gi,
      /covenant[^.]+/gi,
      /right\s+of\s+way[^.]+/gi
    ];

    for (const pattern of encumbrancePatterns) {
      const matches = text.match(pattern);
      if (matches) encumbrances.push(...matches.map(m => m.trim()));
    }

    if (encumbrances.length > 0) fields.encumbrances = encumbrances;
  }

  /**
   * Render first page of PDF to image for vision analysis
   */
  private async renderPdfFirstPage(buffer: Buffer): Promise<string | null> {
    try {
      let pdfjsLib: any;
      try {
        const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjsLib = (pdfjsImport as any).default || pdfjsImport;
      } catch (error) {
        console.warn('[DocumentClassification] pdfjs-dist not available');
        return null;
      }

      let createCanvas: ((width: number, height: number) => any) | undefined;
      try {
        const canvasImport = await import('@napi-rs/canvas');
        createCanvas = (canvasImport as any).createCanvas;
      } catch (error) {
        console.warn('[DocumentClassification] @napi-rs/canvas not available');
        return null;
      }

      if (!createCanvas) return null;

      const loadingTask = pdfjsLib.getDocument({ data: buffer, disableWorker: true, useSystemFonts: true });
      const pdf = await loadingTask.promise;

      const page = await pdf.getPage(1);
      const scale = 1.5; // Good balance of quality vs size
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');

      await page.render({ canvasContext: context, viewport }).promise;

      const pngBuffer = canvas.toBuffer('image/png');
      const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

      if (typeof page.cleanup === 'function') page.cleanup();
      if (typeof pdf.cleanup === 'function') await pdf.cleanup();

      return dataUrl;
    } catch (error) {
      console.warn('[DocumentClassification] PDF rendering failed:', error);
      return null;
    }
  }

  /**
   * Extract text from PDF
   */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdf = (pdfjsLib as any).default || pdfjsLib;

      const loadingTask = pdf.getDocument({ data: buffer, disableWorker: true });
      const doc = await loadingTask.promise;

      let fullText = '';
      const maxPages = Math.min(doc.numPages, 5); // Limit to first 5 pages

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';

        if (typeof page.cleanup === 'function') page.cleanup();
      }

      if (typeof doc.cleanup === 'function') await doc.cleanup();

      return fullText;
    } catch (error) {
      console.warn('[DocumentClassification] PDF text extraction failed:', error);
      return '';
    }
  }

  /**
   * Check if image file might be a scanned document
   */
  private isDocumentImage(fileName: string): boolean {
    const documentIndicators = [
      'scan', 'doc', 'contract', 'agreement', 'form',
      'report', 'disclosure', 'title', 'deed', 'appraisal'
    ];
    const lowerName = fileName.toLowerCase();
    return documentIndicators.some(ind => lowerName.includes(ind));
  }

  /**
   * Check if vision API can be used for this mime type
   */
  private canUseVision(mimeType: string): boolean {
    if (!process.env.OPENAI_API_KEY) return false;
    return (
      mimeType === 'application/pdf' ||
      mimeType.startsWith('image/')
    );
  }

  /**
   * Validate and normalize document type
   */
  private validateDocumentType(type: string): ClassifiableDocumentType {
    const validTypes: ClassifiableDocumentType[] = [
      'contract', 'inspection', 'appraisal', 'disclosure', 'title', 'photo', 'other'
    ];
    const normalized = type?.toLowerCase().trim();
    if (validTypes.includes(normalized as ClassifiableDocumentType)) {
      return normalized as ClassifiableDocumentType;
    }
    return 'other';
  }

  /**
   * Get empty scores object
   */
  private getEmptyScores(): Record<ClassifiableDocumentType, number> {
    return {
      contract: 0,
      inspection: 0,
      appraisal: 0,
      disclosure: 0,
      title: 0,
      photo: 0,
      other: 0
    };
  }

  /**
   * Normalize scores from API response
   */
  private normalizeScores(scores: any): Record<ClassifiableDocumentType, number> {
    const normalized = this.getEmptyScores();
    if (scores && typeof scores === 'object') {
      for (const type of Object.keys(normalized) as ClassifiableDocumentType[]) {
        if (typeof scores[type] === 'number') {
          normalized[type] = Math.min(Math.max(scores[type], 0), 1);
        }
      }
    }
    return normalized;
  }

  /**
   * Parse extracted fields from API response
   */
  private parseExtractedFields(
    fields: any,
    documentType: ClassifiableDocumentType
  ): ExtractedDocumentFields | undefined {
    if (!fields || typeof fields !== 'object') return undefined;

    const result: ExtractedDocumentFields = {};

    // Common fields
    if (fields.documentDate) {
      const date = new Date(fields.documentDate);
      if (!isNaN(date.getTime())) result.documentDate = date;
    }
    if (fields.documentTitle) result.documentTitle = String(fields.documentTitle);

    // Type-specific fields
    switch (documentType) {
      case 'contract':
        if (fields.sellerName) result.sellerName = String(fields.sellerName);
        if (fields.buyerName) result.buyerName = String(fields.buyerName);
        if (fields.propertyAddress) result.propertyAddress = String(fields.propertyAddress);
        if (typeof fields.purchasePrice === 'number') result.purchasePrice = fields.purchasePrice;
        if (fields.closingDate) {
          const date = new Date(fields.closingDate);
          if (!isNaN(date.getTime())) result.closingDate = date;
        }
        break;

      case 'inspection':
        if (fields.inspectorName) result.inspectorName = String(fields.inspectorName);
        if (fields.inspectionType) result.inspectionType = String(fields.inspectionType);
        if (fields.inspectionDate) {
          const date = new Date(fields.inspectionDate);
          if (!isNaN(date.getTime())) result.inspectionDate = date;
        }
        if (Array.isArray(fields.majorIssues)) result.majorIssues = fields.majorIssues.map(String);
        break;

      case 'appraisal':
        if (typeof fields.appraisedValue === 'number') result.appraisedValue = fields.appraisedValue;
        if (fields.appraiserName) result.appraiserName = String(fields.appraiserName);
        if (fields.appraisalDate) {
          const date = new Date(fields.appraisalDate);
          if (!isNaN(date.getTime())) result.appraisalDate = date;
        }
        break;

      case 'disclosure':
        if (fields.disclosureType) result.disclosureType = String(fields.disclosureType);
        if (Array.isArray(fields.knownDefects)) result.knownDefects = fields.knownDefects.map(String);
        break;

      case 'title':
        if (fields.titleCompany) result.titleCompany = String(fields.titleCompany);
        if (typeof fields.lienAmount === 'number') result.lienAmount = fields.lienAmount;
        if (Array.isArray(fields.encumbrances)) result.encumbrances = fields.encumbrances.map(String);
        break;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Get suggested workflow for a document type
   */
  getSuggestedWorkflow(documentType: ClassifiableDocumentType): string {
    return DOCUMENT_WORKFLOWS[documentType] || DOCUMENT_WORKFLOWS.other;
  }

  /**
   * Get all supported document types with their workflow mappings
   */
  getDocumentTypeWorkflows(): Record<ClassifiableDocumentType, string> {
    return { ...DOCUMENT_WORKFLOWS };
  }
}

export const documentClassificationService = new DocumentClassificationService();
export default documentClassificationService;
