/**
 * Compliance OCR Service
 *
 * Connects document OCR to compliance verification:
 * - Contract field extraction and verification
 * - Signature detection
 * - Seller ID verification (driver's license OCR)
 * - Title document parsing (liens, encumbrances)
 * - Legal description matching
 */

import { DocumentProcessor } from './knowledge/DocumentProcessor';
import OpenAI from 'openai';
import Tesseract from 'tesseract.js';
import * as crypto from 'crypto';
import ComplianceExtractionProfile from '../models/ComplianceExtractionProfile';

export interface ContractExtractionResult {
  success: boolean;
  confidence: number;
  source?: 'vision' | 'tesseract';
  fieldEvidence?: Record<string, ContractFieldEvidence>;
  extractedFields: {
    sellerName?: string;
    buyerName?: string;
    propertyAddress?: string;
    legalDescription?: string;
    purchasePrice?: number;
    earnestMoney?: number;
    closingDate?: Date;
    contractExpirationDate?: Date;
    contingencies?: string[];
    signatures?: SignatureInfo[];
    assignable?: boolean;
    marketingClauseFound?: boolean;
  };
  rawText: string;
  pageCount?: number;
  processingTime: number;
}

export interface ContractFieldEvidence {
  page: number;
  snippet?: string;
  confidence?: number;
}

interface VisionPageResult {
  pageNumber: number;
  confidence: number;
  extractedFields: ContractExtractionResult['extractedFields'];
  fieldEvidence: Record<string, ContractFieldEvidence>;
}

export interface SignatureInfo {
  type: 'seller' | 'buyer' | 'notary' | 'witness' | 'unknown';
  detected: boolean;
  page?: number;
  confidence: number;
  dateDetected?: Date;
}

export interface SellerIDVerificationResult {
  success: boolean;
  confidence: number;
  extractedName?: string;
  nameMatch: boolean;
  matchScore: number;
  idType?: 'drivers_license' | 'passport' | 'state_id' | 'unknown';
  idNumber?: string; // Partially masked for security
  expirationDate?: Date;
  isExpired: boolean;
  addressMatch?: boolean;
  extractedAddress?: string;
  warnings: string[];
}

export interface TitleDocumentResult {
  success: boolean;
  confidence: number;
  documentType: 'preliminary_title' | 'title_commitment' | 'title_policy' | 'deed' | 'unknown';
  propertyAddress?: string;
  legalDescription?: string;
  currentOwner?: string;
  liens: LienInfo[];
  encumbrances: EncumbranceInfo[];
  exceptions: string[];
  effectiveDate?: Date;
  policyAmount?: number;
  warnings: string[];
}

export interface LienInfo {
  type: 'mortgage' | 'tax' | 'mechanic' | 'judgment' | 'hoa' | 'other';
  holder: string;
  amount?: number;
  recordedDate?: Date;
  documentNumber?: string;
  position?: number; // 1st, 2nd, etc.
  status: 'active' | 'released' | 'unknown';
}

export interface EncumbranceInfo {
  type: 'easement' | 'restriction' | 'covenant' | 'right_of_way' | 'other';
  description: string;
  affects?: string;
  recordedDate?: Date;
}

export interface ComplianceVerificationRequest {
  contractBuffer?: Buffer;
  sellerIdBuffer?: Buffer;
  titleDocBuffer?: Buffer;
  expectedSellerName?: string;
  expectedPropertyAddress?: string;
  expectedPurchasePrice?: number;
  propertyId?: number;
}

export interface ComplianceVerificationResult {
  success: boolean;
  overallConfidence: number;
  contractVerification?: ContractExtractionResult & {
    sellerNameMatch: boolean;
    addressMatch: boolean;
    priceMatch: boolean;
  };
  sellerIdVerification?: SellerIDVerificationResult;
  titleVerification?: TitleDocumentResult;
  flags: ComplianceFlag[];
  recommendations: string[];
  auditHash: string;
  verifiedAt: Date;
}

export interface ComplianceFlag {
  severity: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
  field?: string;
}

class ComplianceOCRService {
  private documentProcessor: DocumentProcessor;
  private initialized = false;
  private openai: OpenAI | null = null;
  private visionModel = process.env.COMPLIANCE_OCR_VISION_MODEL || 'gpt-4o-mini';

  constructor() {
    this.documentProcessor = new DocumentProcessor({
      chunkSize: 2000,
      chunkOverlap: 200,
      allowedBasePaths: ['/tmp', process.cwd()],
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.log('[ComplianceOCR] Service initialized');
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

  private shouldUseVision(mimeType?: string): boolean {
    if (process.env.COMPLIANCE_OCR_VISION_ENABLED === 'false') {
      return false;
    }
    if (!mimeType) return false;
    if (!process.env.OPENAI_API_KEY) return false;
    return mimeType.startsWith('image/') || mimeType === 'application/pdf';
  }

  /**
   * Full compliance verification pipeline
   */
  async verifyCompliance(request: ComplianceVerificationRequest): Promise<ComplianceVerificationResult> {
    const startTime = Date.now();
    const flags: ComplianceFlag[] = [];
    const recommendations: string[] = [];
    let overallConfidence = 1.0;

    let contractVerification: ComplianceVerificationResult['contractVerification'];
    let sellerIdVerification: SellerIDVerificationResult | undefined;
    let titleVerification: TitleDocumentResult | undefined;

    // 1. Contract extraction and verification
    if (request.contractBuffer) {
      const contractResult = await this.extractContractFields(request.contractBuffer);

      const sellerNameMatch = request.expectedSellerName
        ? this.fuzzyMatch(contractResult.extractedFields.sellerName || '', request.expectedSellerName) > 0.8
        : true;

      const addressMatch = request.expectedPropertyAddress
        ? this.fuzzyMatch(contractResult.extractedFields.propertyAddress || '', request.expectedPropertyAddress) > 0.7
        : true;

      const priceMatch = request.expectedPurchasePrice
        ? Math.abs((contractResult.extractedFields.purchasePrice || 0) - request.expectedPurchasePrice) < 100
        : true;

      contractVerification = {
        ...contractResult,
        sellerNameMatch,
        addressMatch,
        priceMatch,
      };

      overallConfidence *= contractResult.confidence;

      // Check for missing signatures
      const signatures = contractResult.extractedFields.signatures || [];
      const sellerSigned = signatures.some(s => s.type === 'seller' && s.detected);
      const buyerSigned = signatures.some(s => s.type === 'buyer' && s.detected);

      if (!sellerSigned) {
        flags.push({
          severity: 'critical',
          code: 'MISSING_SELLER_SIGNATURE',
          message: 'Seller signature not detected on contract',
          field: 'signatures',
        });
      }

      if (!buyerSigned) {
        flags.push({
          severity: 'warning',
          code: 'MISSING_BUYER_SIGNATURE',
          message: 'Buyer signature not detected on contract',
          field: 'signatures',
        });
      }

      if (!sellerNameMatch) {
        flags.push({
          severity: 'critical',
          code: 'SELLER_NAME_MISMATCH',
          message: `Seller name in contract doesn't match expected: ${request.expectedSellerName}`,
          field: 'sellerName',
        });
      }

      if (!addressMatch) {
        flags.push({
          severity: 'critical',
          code: 'ADDRESS_MISMATCH',
          message: 'Property address in contract doesn\'t match expected address',
          field: 'propertyAddress',
        });
      }

      if (!priceMatch) {
        flags.push({
          severity: 'warning',
          code: 'PRICE_MISMATCH',
          message: `Purchase price mismatch: contract shows ${contractResult.extractedFields.purchasePrice}, expected ${request.expectedPurchasePrice}`,
          field: 'purchasePrice',
        });
      }
    }

    // 2. Seller ID verification
    if (request.sellerIdBuffer) {
      sellerIdVerification = await this.verifySellerID(
        request.sellerIdBuffer,
        request.expectedSellerName
      );

      overallConfidence *= sellerIdVerification.confidence;

      if (!sellerIdVerification.nameMatch) {
        flags.push({
          severity: 'critical',
          code: 'ID_NAME_MISMATCH',
          message: `Name on ID (${sellerIdVerification.extractedName}) doesn't match seller name`,
          field: 'sellerIdName',
        });
      }

      if (sellerIdVerification.isExpired) {
        flags.push({
          severity: 'critical',
          code: 'ID_EXPIRED',
          message: 'Seller ID has expired',
          field: 'sellerIdExpiration',
        });
      }

      sellerIdVerification.warnings.forEach(warning => {
        flags.push({
          severity: 'warning',
          code: 'ID_WARNING',
          message: warning,
        });
      });
    }

    // 3. Title document verification
    if (request.titleDocBuffer) {
      titleVerification = await this.parseTitleDocument(request.titleDocBuffer);

      overallConfidence *= titleVerification.confidence;

      // Check for active liens
      const activeLiens = titleVerification.liens.filter(l => l.status === 'active');
      if (activeLiens.length > 0) {
        const totalLienAmount = activeLiens.reduce((sum, l) => sum + (l.amount || 0), 0);

        flags.push({
          severity: 'warning',
          code: 'ACTIVE_LIENS',
          message: `${activeLiens.length} active lien(s) totaling $${totalLienAmount.toLocaleString()}`,
          field: 'liens',
        });

        // Check if liens exceed purchase price
        if (request.expectedPurchasePrice && totalLienAmount > request.expectedPurchasePrice) {
          flags.push({
            severity: 'critical',
            code: 'LIENS_EXCEED_PRICE',
            message: 'Total liens exceed purchase price - potential short sale',
            field: 'liens',
          });
        }
      }

      // Check for tax liens specifically
      const taxLiens = activeLiens.filter(l => l.type === 'tax');
      if (taxLiens.length > 0) {
        flags.push({
          severity: 'critical',
          code: 'TAX_LIEN_PRESENT',
          message: 'Property has active tax lien(s)',
          field: 'liens',
        });
      }

      // Check owner matches seller
      if (titleVerification.currentOwner && request.expectedSellerName) {
        const ownerMatch = this.fuzzyMatch(titleVerification.currentOwner, request.expectedSellerName);
        if (ownerMatch < 0.8) {
          flags.push({
            severity: 'critical',
            code: 'OWNER_SELLER_MISMATCH',
            message: `Title owner (${titleVerification.currentOwner}) doesn't match seller (${request.expectedSellerName})`,
            field: 'currentOwner',
          });
        }
      }

      titleVerification.warnings.forEach(warning => {
        flags.push({
          severity: 'warning',
          code: 'TITLE_WARNING',
          message: warning,
        });
      });
    }

    // Generate recommendations
    if (flags.some(f => f.severity === 'critical')) {
      recommendations.push('STOP: Critical compliance issues detected. Do not proceed without resolution.');
    }

    if (flags.some(f => f.code === 'MISSING_SELLER_SIGNATURE')) {
      recommendations.push('Obtain properly executed contract with seller signature before proceeding.');
    }

    if (flags.some(f => f.code === 'ACTIVE_LIENS')) {
      recommendations.push('Verify payoff amounts and ensure sufficient funds at closing for lien satisfaction.');
    }

    if (flags.some(f => f.code === 'ID_EXPIRED')) {
      recommendations.push('Request current, valid government-issued ID from seller.');
    }

    if (!request.sellerIdBuffer) {
      recommendations.push('Consider collecting seller ID for identity verification.');
    }

    if (!request.titleDocBuffer) {
      recommendations.push('Order preliminary title report to verify ownership and liens.');
    }

    // Generate audit hash
    const auditData = {
      contractHash: request.contractBuffer ? this.hashBuffer(request.contractBuffer) : null,
      sellerIdHash: request.sellerIdBuffer ? this.hashBuffer(request.sellerIdBuffer) : null,
      titleDocHash: request.titleDocBuffer ? this.hashBuffer(request.titleDocBuffer) : null,
      expectedSellerName: request.expectedSellerName,
      expectedPropertyAddress: request.expectedPropertyAddress,
      expectedPurchasePrice: request.expectedPurchasePrice,
      flagCount: flags.length,
      timestamp: new Date().toISOString(),
    };

    return {
      success: !flags.some(f => f.severity === 'critical'),
      overallConfidence: Math.round(overallConfidence * 100) / 100,
      contractVerification,
      sellerIdVerification,
      titleVerification,
      flags,
      recommendations,
      auditHash: crypto.createHash('sha256').update(JSON.stringify(auditData)).digest('hex'),
      verifiedAt: new Date(),
    };
  }

  /**
   * Extract fields from a purchase contract with optional profile-based extraction
   */
  async extractContractFields(
    buffer: Buffer,
    mimeType?: string,
    state?: string,
    docuSealTemplateId?: string,
    category?: string
  ): Promise<ContractExtractionResult> {
    const startTime = Date.now();

    try {
      // Load extraction profile if state is provided
      let profile: ComplianceExtractionProfile | null = null;
      if (state) {
        profile = await ComplianceExtractionProfile.findBestProfile(state, docuSealTemplateId, category);
        if (profile) {
          console.log(`[ComplianceOCR] Using profile: ${profile.name} (ID: ${profile.id})`);
        }
      }

      // HYBRID EXTRACTION: Try text extraction first (faster, cheaper)
      let textResult: ContractExtractionResult | null = null;
      try {
        const text = await this.extractTextFromPdf(buffer, mimeType);
        if (text && text.length > 100) {
          console.log('[ComplianceOCR] Attempting text-based extraction first...');
          textResult = await this.extractFromText(text, profile);

          // If text extraction is high-confidence, use it
          if (textResult.confidence >= (profile?.minConfidence || 0.75)) {
            console.log(`[ComplianceOCR] Text extraction succeeded with confidence ${textResult.confidence}`);
            if (profile) {
              await profile.recordExtraction(true, textResult.confidence);
            }
            return {
              ...textResult,
              processingTime: Date.now() - startTime,
            };
          }
        }
      } catch (textError) {
        console.warn('[ComplianceOCR] Text extraction failed:', (textError as Error).message);
      }

      // Fall back to vision if text extraction failed or low confidence
      if (this.shouldUseVision(mimeType)) {
        try {
          console.log('[ComplianceOCR] Attempting vision-based extraction...');
          const visionResult = await this.extractContractFieldsWithVision(
            buffer,
            mimeType || 'application/pdf',
            profile
          );

          if (visionResult.success) {
            // Merge with text results if available
            if (textResult && textResult.confidence > 0.5) {
              console.log('[ComplianceOCR] Merging text and vision results...');
              const merged = this.mergeExtractionResults(textResult, visionResult);
              if (profile) {
                await profile.recordExtraction(true, merged.confidence);
              }
              return {
                ...merged,
                processingTime: Date.now() - startTime,
              };
            }

            if (profile) {
              await profile.recordExtraction(true, visionResult.confidence);
            }
            return {
              ...visionResult,
              processingTime: Date.now() - startTime,
            };
          }
        } catch (visionError) {
          console.warn('[ComplianceOCR] Vision extraction failed:', (visionError as Error).message);
        }
      }

      // Fallback: Use text result if available, otherwise OCR
      if (textResult) {
        if (profile) {
          await profile.recordExtraction(false, textResult.confidence);
        }
        return {
          ...textResult,
          processingTime: Date.now() - startTime,
        };
      }

      // Last resort: Tesseract OCR
      const ocrResult = await Tesseract.recognize(buffer, 'eng', {
        logger: () => {},
      });

      const text = ocrResult.data.text;
      const confidence = ocrResult.data.confidence / 100;
      const extractedFields = this.extractContractFieldsFromText(text, profile);
      extractedFields.signatures = await this.detectSignatures(buffer, text);

      if (profile) {
        await profile.recordExtraction(false, confidence);
      }

      return {
        success: true,
        confidence,
        source: 'tesseract',
        extractedFields,
        fieldEvidence: {},
        rawText: text,
        pageCount: 1,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        source: 'tesseract',
        extractedFields: {},
        fieldEvidence: {},
        rawText: '',
        processingTime: Date.now() - startTime,
      };
    }
  }

  private async extractContractFieldsWithVision(
    buffer: Buffer,
    mimeType: string,
    profile?: ComplianceExtractionProfile | null
  ): Promise<ContractExtractionResult> {
    const client = this.getOpenAIClient();
    if (!client) {
      throw new Error('OpenAI API key not configured');
    }

    if (mimeType === 'application/pdf') {
      const { images, pageCount } = await this.renderPdfToImages(buffer);
      if (images.length === 0) {
        throw new Error('No pages rendered from PDF');
      }

      const pageResults: VisionPageResult[] = [];
      for (const image of images) {
        const pageResult = await this.extractVisionPageResult(client, image.dataUrl, image.pageNumber, profile);
        pageResults.push(pageResult);
      }

      return this.mergeVisionPageResults(pageResults, pageCount);
    }

    const base64 = buffer.toString('base64');
    const imageUrl = `data:${mimeType};base64,${base64}`;
    const pageResult = await this.extractVisionPageResult(client, imageUrl, 1, profile);
    return this.mergeVisionPageResults([pageResult], 1);
  }

  private async extractVisionPageResult(
    client: OpenAI,
    imageUrl: string,
    pageNumber: number,
    profile?: ComplianceExtractionProfile | null
  ): Promise<VisionPageResult> {
    // Use profile's prompt override if available, otherwise use default
    const systemPrompt = profile?.promptOverrides || `You extract structured fields from real estate purchase contracts.

You are given a single page image. Return JSON with this schema:
{
  "confidence": 0.0,
  "sellerName": "string or null",
  "buyerName": "string or null",
  "propertyAddress": "string or null",
  "purchasePrice": number or null,
  "closingDate": "YYYY-MM-DD" or null,
  "contractExpirationDate": "YYYY-MM-DD" or null,
  "assignable": true/false/null,
  "marketingClauseFound": true/false/null,
  "fieldEvidence": {
    "sellerName": { "snippet": "string or null", "confidence": 0.0 },
    "buyerName": { "snippet": "string or null", "confidence": 0.0 },
    "propertyAddress": { "snippet": "string or null", "confidence": 0.0 },
    "purchasePrice": { "snippet": "string or null", "confidence": 0.0 },
    "closingDate": { "snippet": "string or null", "confidence": 0.0 },
    "contractExpirationDate": { "snippet": "string or null", "confidence": 0.0 },
    "assignable": { "snippet": "string or null", "confidence": 0.0 },
    "marketingClauseFound": { "snippet": "string or null", "confidence": 0.0 }
  }
}

Rules:
- confidence is 0-1 based on this page's clarity
- purchasePrice is a number (no $ or commas)
- snippets must quote the exact text from this page
- if unknown, use null and omit fieldEvidence entry
- do not invent values`;

    const response = await client.chat.completions.create({
      model: this.visionModel,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Extract contract fields from page ${pageNumber}.` },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from vision model');
    }

    const parsed = JSON.parse(content);
    const parsedFields = parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : parsed;
    const sellerName = parsedFields.sellerName || parsedFields.seller_name || parsedFields.seller;
    const buyerName = parsedFields.buyerName || parsedFields.buyer_name || parsedFields.buyer;
    const propertyAddress = parsedFields.propertyAddress || parsedFields.property_address || parsedFields.address;
    const purchasePrice = this.parseNumber(parsedFields.purchasePrice ?? parsedFields.purchase_price);
    const closingDate = this.parseDate(parsedFields.closingDate ?? parsedFields.closing_date);
    const contractExpirationDate = this.parseDate(
      parsedFields.contractExpirationDate ?? parsedFields.expirationDate ?? parsedFields.expiration_date
    );
    const assignable = parsedFields.assignable;
    const marketingClauseFound = parsedFields.marketingClauseFound ?? parsedFields.marketing_clause_found;

    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.6;
    const rawEvidence = parsed.fieldEvidence || parsed.evidence || parsedFields.fieldEvidence || {};
    const fieldEvidence: Record<string, ContractFieldEvidence> = {};

    const addEvidence = (field: string, value: unknown) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'string' && value.trim().length === 0) return;
      const entry = rawEvidence && typeof rawEvidence === 'object'
        ? (rawEvidence as Record<string, any>)[field]
        : undefined;
      const snippet = typeof entry?.snippet === 'string' ? entry.snippet.trim() : undefined;
      const entryConfidence = typeof entry?.confidence === 'number' ? entry.confidence : undefined;
      fieldEvidence[field] = {
        page: pageNumber,
        snippet,
        confidence: entryConfidence ?? confidence,
      };
    };

    addEvidence('sellerName', sellerName);
    addEvidence('buyerName', buyerName);
    addEvidence('propertyAddress', propertyAddress);
    addEvidence('purchasePrice', purchasePrice);
    addEvidence('closingDate', closingDate);
    addEvidence('contractExpirationDate', contractExpirationDate);
    addEvidence('assignable', assignable);
    addEvidence('marketingClauseFound', marketingClauseFound);

    return {
      pageNumber,
      confidence,
      extractedFields: {
        sellerName: sellerName || undefined,
        buyerName: buyerName || undefined,
        propertyAddress: propertyAddress || undefined,
        purchasePrice,
        closingDate,
        contractExpirationDate,
        assignable: assignable === true ? true : assignable === false ? false : undefined,
        marketingClauseFound: marketingClauseFound === true ? true : marketingClauseFound === false ? false : undefined,
      },
      fieldEvidence,
    };
  }

  private mergeVisionPageResults(
    pageResults: VisionPageResult[],
    pageCount: number
  ): ContractExtractionResult {
    const extractedFields: ContractExtractionResult['extractedFields'] = {};
    const fieldEvidence: Record<string, ContractFieldEvidence> = {};
    const candidatesByField: Record<string, Array<{ value: any; score: number; evidence: ContractFieldEvidence }>> = {};

    for (const result of pageResults) {
      for (const [field, value] of Object.entries(result.extractedFields)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' && value.trim().length === 0) continue;
        const evidence = result.fieldEvidence[field] || {
          page: result.pageNumber,
          confidence: result.confidence,
        };
        const score = typeof evidence.confidence === 'number' ? evidence.confidence : result.confidence;
        if (!candidatesByField[field]) {
          candidatesByField[field] = [];
        }
        candidatesByField[field].push({ value, score, evidence });
      }
    }

    const chooseBooleanCandidate = (field: string) => {
      const candidates = candidatesByField[field] || [];
      const trueCandidate = candidates
        .filter(c => c.value === true)
        .sort((a, b) => b.score - a.score)[0];
      if (trueCandidate && trueCandidate.score >= 0.5) {
        return trueCandidate;
      }
      const falseCandidate = candidates
        .filter(c => c.value === false)
        .sort((a, b) => b.score - a.score)[0];
      if (falseCandidate && falseCandidate.score >= 0.75) {
        return falseCandidate;
      }
      return candidates.sort((a, b) => b.score - a.score)[0];
    };

    for (const [field, candidates] of Object.entries(candidatesByField)) {
      const chosen = (field === 'assignable' || field === 'marketingClauseFound')
        ? chooseBooleanCandidate(field)
        : candidates.sort((a, b) => b.score - a.score)[0];

      if (!chosen) continue;
      (extractedFields as Record<string, any>)[field] = chosen.value;
      fieldEvidence[field] = chosen.evidence;
    }

    const weights = pageResults.map(result => {
      const fieldCount = Object.values(result.extractedFields).filter(value => {
        if (value === undefined || value === null) return false;
        return !(typeof value === 'string' && value.trim().length === 0);
      }).length;
      return Math.max(fieldCount, 1);
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const weightedConfidence = totalWeight > 0
      ? pageResults.reduce((sum, result, index) => sum + result.confidence * weights[index], 0) / totalWeight
      : 0.6;

    return {
      success: pageResults.length > 0,
      confidence: Number.isFinite(weightedConfidence) ? weightedConfidence : 0.6,
      source: 'vision',
      extractedFields,
      fieldEvidence,
      rawText: '',
      pageCount,
      processingTime: 0,
    };
  }

  private async renderPdfToImages(
    buffer: Buffer
  ): Promise<{ images: Array<{ pageNumber: number; dataUrl: string }>; pageCount: number }> {
    let pdfjsLib: any;
    try {
      const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjsLib = (pdfjsImport as any).default || pdfjsImport;
    } catch (error) {
      throw new Error(`PDF rendering dependency missing (pdfjs-dist): ${(error as Error).message}`);
    }

    let createCanvas: ((width: number, height: number) => any) | undefined;
    try {
      const canvasImport = await import('@napi-rs/canvas');
      createCanvas = (canvasImport as any).createCanvas;
    } catch (error) {
      throw new Error(`Canvas dependency missing (@napi-rs/canvas): ${(error as Error).message}`);
    }

    if (!createCanvas) {
      throw new Error('Canvas createCanvas function not available');
    }

    const { maxPages, scale } = this.getPdfRenderConfig();
    const loadingTask = pdfjsLib.getDocument({ data: buffer, disableWorker: true, useSystemFonts: true });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages || 0;
    const renderCount = Math.min(pageCount, maxPages);
    const images: Array<{ pageNumber: number; dataUrl: string }> = [];

    for (let pageNumber = 1; pageNumber <= renderCount; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;
      const pngBuffer = canvas.toBuffer('image/png');
      images.push({
        pageNumber,
        dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      });
      if (typeof page.cleanup === 'function') {
        page.cleanup();
      }
    }

    if (typeof pdf.cleanup === 'function') {
      await pdf.cleanup();
    }
    return { images, pageCount };
  }

  private getPdfRenderConfig(): { maxPages: number; scale: number } {
    const maxPagesRaw = Number(process.env.COMPLIANCE_OCR_PDF_MAX_PAGES ?? 8);
    const scaleRaw = Number(process.env.COMPLIANCE_OCR_PDF_SCALE ?? 2);
    const maxPages = Number.isFinite(maxPagesRaw) ? Math.max(maxPagesRaw, 1) : 8;
    const scale = Number.isFinite(scaleRaw) ? Math.min(Math.max(scaleRaw, 0.75), 4) : 2;
    return { maxPages, scale };
  }

  private parseNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const cleaned = value.replace(/[^0-9.]/g, '');
      if (!cleaned) return undefined;
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  private parseDate(value: unknown): Date | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return undefined;
  }

  private extractContractFieldsFromText(
    text: string,
    profile?: ComplianceExtractionProfile | null
  ): ContractExtractionResult['extractedFields'] {
    const fields: ContractExtractionResult['extractedFields'] = {};

    // Helper function to build regex from field labels
    const buildRegex = (field: string, defaultPattern: string): RegExp => {
      if (profile) {
        const labels = profile.getFieldLabels(field);
        if (labels.length > 0) {
          // Build regex from labels: (?:label1|label2|label3)
          const labelPattern = labels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
          return new RegExp(`(?:${labelPattern})[:\\s]+([^\\n,]+)`, 'i');
        }
        // Check if profile has a regex hint
        const hint = profile.getRegexHint(field);
        if (hint) {
          try {
            // Parse the regex string (e.g., "/pattern/flags")
            const match = hint.match(/^\/(.+)\/([gimuy]*)$/);
            if (match) {
              return new RegExp(match[1], match[2]);
            }
          } catch (e) {
            console.warn(`[ComplianceOCR] Invalid regex hint for field ${field}:`, e);
          }
        }
      }
      // Fallback to default pattern
      return new RegExp(defaultPattern, 'i');
    };

    const assignmentPatterns = [
      /assign/i,
      /assignable/i,
      /assignee/i,
      /right to assign/i,
      /may assign this contract/i,
    ];
    fields.assignable = assignmentPatterns.some(pattern => pattern.test(text));

    const marketingPatterns = [
      /market/i,
      /advertise/i,
      /list for sale/i,
      /marketing authorization/i,
      /right to market/i,
      /syndicate/i,
    ];
    fields.marketingClauseFound = marketingPatterns.some(pattern => pattern.test(text));

    // Seller name patterns
    const sellerPatterns = [
      /(?:seller|grantor|owner)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /(?:between|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*(?:\(|,|\s+as\s+seller)/i,
      /seller[:\s]*name[:\s]*([A-Za-z\s]+?)(?:\n|,|address)/i,
    ];

    for (const pattern of sellerPatterns) {
      const match = text.match(pattern);
      if (match) {
        fields.sellerName = match[1].trim();
        break;
      }
    }

    // Buyer name patterns
    const buyerPatterns = [
      /(?:buyer|grantee|purchaser)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /(?:buyer|grantee|purchaser)[:\s]+([A-Z][A-Z0-9\s,&.-]+(?:LLC|INC|CORP|L\.L\.C\.|L\.P\.)?)/i,
      /(?:to|and)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*(?:\(|,|\s+as\s+buyer)/i,
      /buyer[:\s]*name[:\s]*([A-Za-z0-9\s,&.-]+?)(?:\n|,|address)/i,
    ];

    for (const pattern of buyerPatterns) {
      const match = text.match(pattern);
      if (match) {
        fields.buyerName = match[1].trim();
        break;
      }
    }

    // Property address patterns
    const addressPatterns = [
      /(?:property|premises|subject\s+property)[:\s]+(\d+\s+[A-Za-z0-9\s,]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane|Way|Ct|Court)[.\s,]*[A-Za-z\s]+,?\s*[A-Z]{2}\s*\d{5})/i,
      /(?:located\s+at|address)[:\s]+(\d+\s+[A-Za-z0-9\s,]+)/i,
    ];

    for (const pattern of addressPatterns) {
      const match = text.match(pattern);
      if (match) {
        fields.propertyAddress = match[1].trim();
        break;
      }
    }

    // Legal description
    const legalDescPatterns = [
      /(?:legal\s+description|legally\s+described)[:\s]+([^.]+(?:Lot|Block|Section|Township|Range|Survey|Addition)[^.]+)/i,
      /(?:Lot\s+\d+[,\s]+Block\s+\d+[^.]+)/i,
    ];

    for (const pattern of legalDescPatterns) {
      const match = text.match(pattern);
      if (match) {
        fields.legalDescription = match[1] ? match[1].trim() : match[0].trim();
        break;
      }
    }

    // Purchase price
    const pricePatterns = [
      /(?:purchase\s+price|sale\s+price|consideration)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:dollars?|purchase|sale)/i,
    ];

    for (const pattern of pricePatterns) {
      const match = text.match(pattern);
      if (match) {
        fields.purchasePrice = parseFloat(match[1].replace(/,/g, ''));
        break;
      }
    }

    // Earnest money
    const earnestPatterns = [
      /(?:earnest\s+money|deposit|emd)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    ];

    for (const pattern of earnestPatterns) {
      const match = text.match(pattern);
      if (match) {
        fields.earnestMoney = parseFloat(match[1].replace(/,/g, ''));
        break;
      }
    }

    // Closing date
    const closingPatterns = [
      /(?:closing\s+date|close\s+on|settlement\s+date)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /(?:on\s+or\s+before)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    ];

    for (const pattern of closingPatterns) {
      const match = text.match(pattern);
      if (match) {
        const dateStr = match[1];
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          fields.closingDate = parsed;
        }
        break;
      }
    }

    // Contract expiration date
    const expirationPatterns = [
      /(?:expiration\s+date|expires?\s+on|contract\s+expiration)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /(?:this\s+contract\s+expires)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    ];

    for (const pattern of expirationPatterns) {
      const match = text.match(pattern);
      if (match) {
        const dateStr = match[1];
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          fields.contractExpirationDate = parsed;
        }
        break;
      }
    }

    // Contingencies
    const contingencies: string[] = [];
    const contingencyPatterns = [
      /(?:subject\s+to|contingent\s+upon)[:\s]+([^.]+)/gi,
      /(?:financing|inspection|appraisal)\s+contingency/gi,
    ];

    for (const pattern of contingencyPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        contingencies.push(match[1] ? match[1].trim() : match[0].trim());
      }
    }

    if (contingencies.length > 0) {
      fields.contingencies = contingencies;
    }

    return fields;
  }

  private async detectSignatures(buffer: Buffer, text: string): Promise<SignatureInfo[]> {
    const signatures: SignatureInfo[] = [];

    // Look for signature line patterns in text
    const signaturePatterns = [
      { pattern: /seller['']?s?\s*signature/i, type: 'seller' as const },
      { pattern: /buyer['']?s?\s*signature/i, type: 'buyer' as const },
      { pattern: /notary/i, type: 'notary' as const },
      { pattern: /witness/i, type: 'witness' as const },
    ];

    for (const { pattern, type } of signaturePatterns) {
      const match = text.match(pattern);
      if (match) {
        // Check if there's content near the signature line (indicating it was signed)
        const index = text.indexOf(match[0]);
        const nearbyText = text.substring(index, index + 200);

        // Look for date near signature (indicates signed)
        const hasDate = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(nearbyText);
        // Look for scribble-like patterns (X's, handwriting indicators)
        const hasMarkings = /[Xx]{2,}|_{5,}.*[A-Za-z]/.test(nearbyText);

        const detected = hasDate || hasMarkings;

        let dateDetected: Date | undefined;
        if (hasDate) {
          const dateMatch = nearbyText.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
          if (dateMatch) {
            const parsed = new Date(dateMatch[1]);
            if (!isNaN(parsed.getTime())) {
              dateDetected = parsed;
            }
          }
        }

        signatures.push({
          type,
          detected,
          confidence: detected ? 0.7 : 0.3,
          dateDetected,
        });
      }
    }

    // If no specific signatures found, add unknown
    if (signatures.length === 0) {
      signatures.push({
        type: 'unknown',
        detected: false,
        confidence: 0.1,
      });
    }

    return signatures;
  }

  /**
   * Verify seller ID document
   */
  async verifySellerID(buffer: Buffer, expectedName?: string): Promise<SellerIDVerificationResult> {
    const warnings: string[] = [];

    try {
      const ocrResult = await Tesseract.recognize(buffer, 'eng', {
        logger: () => {},
      });

      const text = ocrResult.data.text;
      const confidence = ocrResult.data.confidence / 100;

      // Detect ID type
      let idType: SellerIDVerificationResult['idType'] = 'unknown';
      if (/driver['']?s?\s*license|DL|DMV/i.test(text)) {
        idType = 'drivers_license';
      } else if (/passport/i.test(text)) {
        idType = 'passport';
      } else if (/state\s*id|identification\s*card/i.test(text)) {
        idType = 'state_id';
      }

      // Extract name
      let extractedName: string | undefined;
      const namePatterns = [
        /(?:name|nm)[:\s]*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)/i,
        /^([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+)+)/m, // All caps name (common on IDs)
        /(?:first|fn)[:\s]*([A-Za-z]+).*(?:last|ln)[:\s]*([A-Za-z]+)/i,
      ];

      for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match) {
          if (match[2]) {
            extractedName = `${match[1]} ${match[2]}`.trim();
          } else {
            extractedName = match[1].trim();
          }
          break;
        }
      }

      // Extract ID number (partially mask for security)
      let idNumber: string | undefined;
      const idPatterns = [
        /(?:DL|license|id)\s*(?:#|no\.?|number)?[:\s]*([A-Z0-9]{6,})/i,
        /([A-Z]\d{7,})/i, // Common DL format
      ];

      for (const pattern of idPatterns) {
        const match = text.match(pattern);
        if (match) {
          const fullId = match[1];
          // Mask middle characters
          if (fullId.length > 4) {
            idNumber = fullId.substring(0, 2) + '*'.repeat(fullId.length - 4) + fullId.substring(fullId.length - 2);
          } else {
            idNumber = '***' + fullId.substring(fullId.length - 2);
          }
          break;
        }
      }

      // Extract expiration date
      let expirationDate: Date | undefined;
      let isExpired = false;
      const expPatterns = [
        /(?:exp|expires?|expiration)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:exp|expires?)/i,
      ];

      for (const pattern of expPatterns) {
        const match = text.match(pattern);
        if (match) {
          const parsed = new Date(match[1]);
          if (!isNaN(parsed.getTime())) {
            expirationDate = parsed;
            isExpired = parsed < new Date();
          }
          break;
        }
      }

      // Extract address from ID
      let extractedAddress: string | undefined;
      const addressPatterns = [
        /(\d+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane)[^A-Z]*[A-Z]{2}\s*\d{5})/i,
      ];

      for (const pattern of addressPatterns) {
        const match = text.match(pattern);
        if (match) {
          extractedAddress = match[1].trim();
          break;
        }
      }

      // Calculate name match
      let nameMatch = false;
      let matchScore = 0;
      if (extractedName && expectedName) {
        matchScore = this.fuzzyMatch(extractedName, expectedName);
        nameMatch = matchScore > 0.8;

        if (matchScore > 0.6 && matchScore <= 0.8) {
          warnings.push(`Name partially matches (${Math.round(matchScore * 100)}% confidence). Verify manually.`);
        }
      } else if (!extractedName) {
        warnings.push('Could not extract name from ID. Manual verification required.');
      }

      if (idType === 'unknown') {
        warnings.push('Could not determine ID type. Ensure document is a valid government-issued ID.');
      }

      if (!idNumber) {
        warnings.push('Could not extract ID number. Document may be low quality.');
      }

      if (!expirationDate) {
        warnings.push('Could not determine expiration date. Verify ID is current.');
      }

      return {
        success: confidence > 0.5,
        confidence,
        extractedName,
        nameMatch,
        matchScore,
        idType,
        idNumber,
        expirationDate,
        isExpired,
        addressMatch: undefined, // Would need expected address to compare
        extractedAddress,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        nameMatch: false,
        matchScore: 0,
        isExpired: false,
        warnings: ['Failed to process ID document: ' + (error as Error).message],
      };
    }
  }

  /**
   * Parse title document for liens and encumbrances
   */
  async parseTitleDocument(buffer: Buffer): Promise<TitleDocumentResult> {
    const warnings: string[] = [];
    const liens: LienInfo[] = [];
    const encumbrances: EncumbranceInfo[] = [];
    const exceptions: string[] = [];

    try {
      const ocrResult = await Tesseract.recognize(buffer, 'eng', {
        logger: () => {},
      });

      const text = ocrResult.data.text;
      const confidence = ocrResult.data.confidence / 100;

      // Detect document type
      let documentType: TitleDocumentResult['documentType'] = 'unknown';
      if (/preliminary\s+title/i.test(text)) {
        documentType = 'preliminary_title';
      } else if (/title\s+commitment/i.test(text)) {
        documentType = 'title_commitment';
      } else if (/title\s+(?:insurance\s+)?policy/i.test(text)) {
        documentType = 'title_policy';
      } else if (/(?:warranty|quitclaim|grant)\s+deed/i.test(text)) {
        documentType = 'deed';
      }

      // Extract property address
      let propertyAddress: string | undefined;
      const addressMatch = text.match(/(?:property|premises|subject)[:\s]+(\d+\s+[A-Za-z0-9\s,]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive)[^.]*)/i);
      if (addressMatch) {
        propertyAddress = addressMatch[1].trim();
      }

      // Extract legal description
      let legalDescription: string | undefined;
      const legalMatch = text.match(/(?:legal\s+description|legally\s+described)[:\s]+([^.]+(?:Lot|Block|Section)[^.]+)/i);
      if (legalMatch) {
        legalDescription = legalMatch[1].trim();
      }

      // Extract current owner
      let currentOwner: string | undefined;
      const ownerPatterns = [
        /(?:vested\s+in|owner|grantor)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
        /title\s+is\s+vested\s+in[:\s]+([A-Za-z\s]+?)(?:,|\n|as)/i,
      ];
      for (const pattern of ownerPatterns) {
        const match = text.match(pattern);
        if (match) {
          currentOwner = match[1].trim();
          break;
        }
      }

      // Extract liens (mortgages, tax liens, etc.)
      const lienPatterns = [
        { pattern: /(?:mortgage|deed\s+of\s+trust)[^.]*(?:in\s+favor\s+of|to|holder)[:\s]*([^,\n]+)[^.]*\$\s*([\d,]+)/gi, type: 'mortgage' as const },
        { pattern: /(?:tax\s+lien|property\s+tax)[^.]*\$\s*([\d,]+)/gi, type: 'tax' as const },
        { pattern: /(?:mechanic['']?s?\s+lien)[^.]*\$\s*([\d,]+)/gi, type: 'mechanic' as const },
        { pattern: /(?:judgment\s+lien)[^.]*([^,\n]+)[^.]*\$\s*([\d,]+)/gi, type: 'judgment' as const },
        { pattern: /(?:hoa|homeowner['']?s?\s+association)\s+lien[^.]*\$\s*([\d,]+)/gi, type: 'hoa' as const },
      ];

      for (const { pattern, type } of lienPatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const holder = type === 'mortgage' || type === 'judgment' ? match[1]?.trim() : 'Unknown';
          const amount = parseFloat((match[type === 'mortgage' || type === 'judgment' ? 2 : 1] || '0').replace(/,/g, ''));

          liens.push({
            type,
            holder: holder || 'Unknown',
            amount: amount || undefined,
            status: 'active',
          });
        }
      }

      // Extract encumbrances (easements, restrictions, covenants)
      const encumbrancePatterns = [
        { pattern: /(?:easement)[^.]+(?:for|to|in\s+favor)[^.]+/gi, type: 'easement' as const },
        { pattern: /(?:restriction|restrictive\s+covenant)[^.]+/gi, type: 'restriction' as const },
        { pattern: /(?:right\s+of\s+way)[^.]+/gi, type: 'right_of_way' as const },
        { pattern: /(?:covenant)[^.]+/gi, type: 'covenant' as const },
      ];

      for (const { pattern, type } of encumbrancePatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          encumbrances.push({
            type,
            description: match[0].trim(),
          });
        }
      }

      // Extract exceptions (Schedule B items)
      const exceptionMatch = text.match(/(?:schedule\s+b|exceptions)[:\s]*([\s\S]+?)(?:schedule\s+[c-z]|end\s+of|$)/i);
      if (exceptionMatch) {
        const exceptionText = exceptionMatch[1];
        const exceptionItems = exceptionText.split(/\d+\.\s+/).filter(e => e.trim().length > 10);
        exceptions.push(...exceptionItems.map(e => e.trim()));
      }

      // Extract effective date
      let effectiveDate: Date | undefined;
      const dateMatch = text.match(/(?:effective\s+date|dated|as\s+of)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
      if (dateMatch) {
        const parsed = new Date(dateMatch[1]);
        if (!isNaN(parsed.getTime())) {
          effectiveDate = parsed;
        }
      }

      // Extract policy amount
      let policyAmount: number | undefined;
      const policyMatch = text.match(/(?:policy\s+amount|coverage|insured\s+amount)[:\s]*\$\s*([\d,]+)/i);
      if (policyMatch) {
        policyAmount = parseFloat(policyMatch[1].replace(/,/g, ''));
      }

      // Generate warnings
      if (documentType === 'unknown') {
        warnings.push('Could not determine title document type. Manual review recommended.');
      }

      if (!currentOwner) {
        warnings.push('Could not identify current property owner.');
      }

      if (liens.length === 0 && documentType !== 'unknown') {
        // No liens found might indicate OCR issues
        warnings.push('No liens detected. Verify document was processed correctly.');
      }

      if (exceptions.length > 5) {
        warnings.push(`${exceptions.length} title exceptions found. Review carefully.`);
      }

      return {
        success: confidence > 0.5,
        confidence,
        documentType,
        propertyAddress,
        legalDescription,
        currentOwner,
        liens,
        encumbrances,
        exceptions,
        effectiveDate,
        policyAmount,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        documentType: 'unknown',
        liens: [],
        encumbrances: [],
        exceptions: [],
        warnings: ['Failed to process title document: ' + (error as Error).message],
      };
    }
  }

  /**
   * Extract text from PDF without rendering (fast path for readable PDFs)
   */
  private async extractTextFromPdf(buffer: Buffer, mimeType?: string): Promise<string> {
    if (mimeType !== 'application/pdf') {
      return '';
    }

    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdf = (pdfjsLib as any).default || pdfjsLib;
      const loadingTask = pdf.getDocument({ data: buffer, disableWorker: true });
      const doc = await loadingTask.promise;
      const pageCount = doc.numPages || 0;

      let fullText = '';
      for (let pageNum = 1; pageNum <= Math.min(pageCount, 10); pageNum++) {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';

        if (typeof page.cleanup === 'function') {
          page.cleanup();
        }
      }

      if (typeof doc.cleanup === 'function') {
        await doc.cleanup();
      }

      return fullText;
    } catch (error) {
      console.warn('[ComplianceOCR] PDF text extraction failed:', (error as Error).message);
      return '';
    }
  }

  /**
   * Extract fields from text using profile-based patterns
   */
  private async extractFromText(
    text: string,
    profile: ComplianceExtractionProfile | null
  ): Promise<ContractExtractionResult> {
    const extractedFields = this.extractContractFieldsFromText(text, profile);

    // Calculate confidence based on how many required fields were found
    let foundCount = 0;
    let requiredCount = profile?.requiredFields.length || 5;

    const requiredFields = profile?.requiredFields || ['sellerName', 'buyerName', 'propertyAddress', 'purchasePrice', 'closingDate'];

    for (const field of requiredFields) {
      if ((extractedFields as any)[field] !== undefined && (extractedFields as any)[field] !== null) {
        foundCount++;
      }
    }

    const confidence = foundCount / requiredCount;

    return {
      success: confidence > 0.5,
      confidence,
      source: 'vision', // Mark as vision to distinguish from tesseract
      extractedFields,
      fieldEvidence: {},
      rawText: text,
      pageCount: 1,
      processingTime: 0,
    };
  }

  /**
   * Merge results from text and vision extraction
   */
  private mergeExtractionResults(
    textResult: ContractExtractionResult,
    visionResult: ContractExtractionResult
  ): ContractExtractionResult {
    const merged: ContractExtractionResult = {
      success: true,
      confidence: (textResult.confidence + visionResult.confidence) / 2,
      source: 'vision',
      extractedFields: {},
      fieldEvidence: { ...visionResult.fieldEvidence },
      rawText: visionResult.rawText || textResult.rawText,
      pageCount: visionResult.pageCount || textResult.pageCount,
      processingTime: 0,
    };

    // For each field, prefer the result with higher confidence
    const allFields = new Set([
      ...Object.keys(textResult.extractedFields),
      ...Object.keys(visionResult.extractedFields),
    ]);

    for (const field of allFields) {
      const textValue = (textResult.extractedFields as any)[field];
      const visionValue = (visionResult.extractedFields as any)[field];

      const textEvidence = textResult.fieldEvidence?.[field];
      const visionEvidence = visionResult.fieldEvidence?.[field];

      const textConf = textEvidence?.confidence || textResult.confidence;
      const visionConf = visionEvidence?.confidence || visionResult.confidence;

      // Prefer vision if confidence is close, otherwise prefer higher confidence
      if (visionValue !== undefined && visionValue !== null) {
        if (textValue === undefined || textValue === null || visionConf >= textConf) {
          (merged.extractedFields as any)[field] = visionValue;
          if (visionEvidence) {
            merged.fieldEvidence![field] = visionEvidence;
          }
        } else {
          (merged.extractedFields as any)[field] = textValue;
          if (textEvidence) {
            merged.fieldEvidence![field] = textEvidence;
          }
        }
      } else if (textValue !== undefined && textValue !== null) {
        (merged.extractedFields as any)[field] = textValue;
        if (textEvidence) {
          merged.fieldEvidence![field] = textEvidence;
        }
      }
    }

    return merged;
  }

  /**
   * Fuzzy string matching using Levenshtein distance
   */
  private fuzzyMatch(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const len1 = s1.length;
    const len2 = s2.length;

    // Create distance matrix
    const matrix: number[][] = [];
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill in the matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  }

  /**
   * Hash a buffer for audit purposes
   */
  private hashBuffer(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }
}

export const complianceOCRService = new ComplianceOCRService();
export default complianceOCRService;
