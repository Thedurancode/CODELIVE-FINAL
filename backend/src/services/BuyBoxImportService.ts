/**
 * Buy Box Import Service
 *
 * Uses GPT-4 Vision to extract buy box criteria from documents (PDFs, images).
 * Automatically creates or updates HedgeFundBuyBox entries.
 */

import OpenAI from 'openai';
import HedgeFundBuyBox from '../models/HedgeFundBuyBox';
import {
  BuyBoxCriteria,
  MarketContact,
  MarketPricing,
  InvestmentStrategy,
  PropertyType,
  ConditionLevel,
} from '../types';
import fs from 'fs';
import path from 'path';
import { knowledgeService } from './knowledge/KnowledgeService';

// =============================================================================
// TYPES
// =============================================================================

interface ExtractedBuyBox {
  fundName: string;
  fundType?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  marketContacts?: MarketContact[];
  criteria: Partial<BuyBoxCriteria>;
  confidence: number;
  extractedFields: string[];
  warnings: string[];
  // Tags extracted from document
  tags?: DocumentTags;
}

interface DocumentTags {
  enable?: boolean;           // #ENABLE or #DISABLE
  priority?: number;          // #PRIORITY:1
  autoSubmit?: boolean;       // #AUTO_SUBMIT or #AUTO_SUBMIT:85
  autoSubmitThreshold?: number;
  notify?: string[];          // #NOTIFY:email@example.com
  replace?: boolean;          // #REPLACE (don't merge, replace entirely)
  testMode?: boolean;         // #TEST_MODE (don't save)
}

interface ImportResult {
  success: boolean;
  action: 'created' | 'updated' | 'test_mode' | 'error';
  buyBoxId?: string;
  buyBoxName?: string;
  extracted: ExtractedBuyBox;
  message: string;
  notificationsSent?: string[];
  tagsApplied?: string[];
}

// =============================================================================
// SERVICE
// =============================================================================

class BuyBoxImportService {
  private openai: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
  }

  /**
   * Import a buy box from a document (image or PDF)
   */
  async importFromDocument(
    fileBuffer: Buffer,
    mimeType: string,
    filename: string
  ): Promise<ImportResult> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
    }

    // Extract data using GPT-4 Vision
    const extracted = await this.extractBuyBoxData(fileBuffer, mimeType, filename);

    if (!extracted.fundName) {
      return {
        success: false,
        action: 'error',
        extracted,
        message: 'Could not extract fund name from document',
      };
    }

    const tags = extracted.tags || {};
    const tagsApplied: string[] = [];

    // Handle #TEST_MODE - don't save, just return what would be extracted
    if (tags.testMode) {
      return {
        success: true,
        action: 'test_mode',
        extracted,
        message: `Test mode: Would ${await this.checkIfExists(extracted.fundName) ? 'update' : 'create'} buy box: ${extracted.fundName}`,
        tagsApplied: ['#TEST_MODE'],
      };
    }

    // Determine enabled status from tags (default true for new, preserve for existing)
    const enabledFromTag = tags.enable !== undefined ? tags.enable : undefined;

    // Determine priority from tags (default 1)
    const priorityFromTag = tags.priority !== undefined ? tags.priority : undefined;

    // Determine auto-submit from tags
    const autoSubmitFromTag = tags.autoSubmit !== undefined ? tags.autoSubmit : undefined;
    const autoSubmitThresholdFromTag = tags.autoSubmitThreshold !== undefined ? tags.autoSubmitThreshold : undefined;

    // Check if buy box already exists
    const existing = await HedgeFundBuyBox.findOne({
      where: { name: extracted.fundName },
    });

    let result: ImportResult;

    if (existing) {
      // Handle #REPLACE tag - replace entirely instead of merging
      let finalCriteria: BuyBoxCriteria;
      let finalContacts: MarketContact[];

      if (tags.replace) {
        finalCriteria = extracted.criteria as BuyBoxCriteria;
        finalContacts = extracted.marketContacts || [];
        tagsApplied.push('#REPLACE');
      } else {
        finalCriteria = this.mergeCriteria(existing.criteria, extracted.criteria);
        finalContacts = this.mergeContacts(
          existing.marketContacts || [],
          extracted.marketContacts || []
        );
      }

      // Build update object
      const updateData: any = {
        description: extracted.description || existing.description,
        fundType: extracted.fundType || existing.fundType,
        contactEmail: extracted.contactEmail || existing.contactEmail,
        contactPhone: extracted.contactPhone || existing.contactPhone,
        marketContacts: finalContacts,
        criteria: finalCriteria,
      };

      // Apply tag overrides
      if (enabledFromTag !== undefined) {
        updateData.enabled = enabledFromTag;
        tagsApplied.push(enabledFromTag ? '#ENABLE' : '#DISABLE');
      }
      if (priorityFromTag !== undefined) {
        updateData.priority = priorityFromTag;
        tagsApplied.push(`#PRIORITY:${priorityFromTag}`);
      }
      if (autoSubmitFromTag !== undefined) {
        updateData.autoSubmit = autoSubmitFromTag;
        tagsApplied.push('#AUTO_SUBMIT');
      }
      if (autoSubmitThresholdFromTag !== undefined) {
        updateData.autoSubmitThreshold = autoSubmitThresholdFromTag;
        tagsApplied.push(`#AUTO_SUBMIT:${autoSubmitThresholdFromTag}`);
      }

      await existing.update(updateData);

      result = {
        success: true,
        action: 'updated',
        buyBoxId: existing.id,
        buyBoxName: existing.name,
        extracted,
        message: `Updated existing buy box: ${existing.name}`,
        tagsApplied,
      };
    } else {
      // Create new buy box
      const newBuyBox = await HedgeFundBuyBox.create({
        name: extracted.fundName,
        fundName: extracted.fundName,
        fundType: extracted.fundType,
        description: extracted.description,
        contactEmail: extracted.contactEmail,
        contactPhone: extracted.contactPhone,
        marketContacts: extracted.marketContacts,
        criteria: extracted.criteria as BuyBoxCriteria,
        priority: (priorityFromTag && priorityFromTag >= 1) ? priorityFromTag : 1,
        enabled: enabledFromTag ?? true,
        autoSubmit: autoSubmitFromTag ?? false,
        autoSubmitThreshold: (autoSubmitThresholdFromTag && autoSubmitThresholdFromTag >= 1) ? autoSubmitThresholdFromTag : 80,
        scoringWeights: {
          geographic: 25,
          price: 20,
          propertyType: 10,
          bedrooms: 5,
          bathrooms: 5,
          yearBuilt: 5,
          occupancy: 5,
          hoa: 5,
          photos: 5,
          condition: 5,
          riskFactors: 5,
          strategyMetrics: 5,
          custom: 0,
        },
      });

      // Track tags applied to new buy box
      if (enabledFromTag !== undefined) tagsApplied.push(enabledFromTag ? '#ENABLE' : '#DISABLE');
      if (priorityFromTag !== undefined) tagsApplied.push(`#PRIORITY:${priorityFromTag}`);
      if (autoSubmitFromTag !== undefined) tagsApplied.push('#AUTO_SUBMIT');
      if (autoSubmitThresholdFromTag !== undefined) tagsApplied.push(`#AUTO_SUBMIT:${autoSubmitThresholdFromTag}`);

      result = {
        success: true,
        action: 'created',
        buyBoxId: newBuyBox.id,
        buyBoxName: newBuyBox.name,
        extracted,
        message: `Created new buy box: ${newBuyBox.name}`,
        tagsApplied,
      };
    }

    // Index buy box in Pinecone for semantic search
    if (result.success && result.buyBoxId) {
      try {
        const buyBoxToIndex = result.action === 'updated'
          ? await HedgeFundBuyBox.findByPk(result.buyBoxId)
          : await HedgeFundBuyBox.findByPk(result.buyBoxId);

        if (buyBoxToIndex) {
          await knowledgeService.indexBuyBox({
            id: buyBoxToIndex.id,
            name: buyBoxToIndex.name,
            fundName: buyBoxToIndex.fundName || buyBoxToIndex.name,
            fundType: buyBoxToIndex.fundType,
            description: buyBoxToIndex.description,
            contactEmail: buyBoxToIndex.contactEmail,
            criteria: buyBoxToIndex.criteria,
            marketContacts: buyBoxToIndex.marketContacts,
          });
          console.log(`📚 Indexed buy box in Pinecone: ${buyBoxToIndex.name}`);
        }
      } catch (indexError) {
        // Don't fail the import if Pinecone indexing fails
        console.warn('Failed to index buy box in Pinecone:', indexError);
      }
    }

    // Handle #NOTIFY tags - send notifications
    if (tags.notify && tags.notify.length > 0) {
      const notificationsSent = await this.sendNotifications(
        tags.notify,
        result.action,
        result.buyBoxName || extracted.fundName,
        extracted
      );
      result.notificationsSent = notificationsSent;
      tagsApplied.push(...tags.notify.map(email => `#NOTIFY:${email}`));
    }

    return result;
  }

  /**
   * Check if a buy box exists by name
   */
  private async checkIfExists(fundName: string): Promise<boolean> {
    const existing = await HedgeFundBuyBox.findOne({ where: { name: fundName } });
    return !!existing;
  }

  /**
   * Send notifications for import actions
   */
  private async sendNotifications(
    emails: string[],
    action: string,
    buyBoxName: string,
    extracted: ExtractedBuyBox
  ): Promise<string[]> {
    const sent: string[] = [];

    for (const email of emails) {
      try {
        // TODO: Integrate with your email service (Resend, etc.)
        console.log(`📧 Notification: Buy box "${buyBoxName}" ${action}`);
        console.log(`   To: ${email}`);
        console.log(`   Confidence: ${(extracted.confidence * 100).toFixed(0)}%`);
        console.log(`   Fields extracted: ${extracted.extractedFields.join(', ')}`);
        sent.push(email);
      } catch (error) {
        console.error(`Failed to notify ${email}:`, error);
      }
    }

    return sent;
  }

  /**
   * Extract buy box data from document using GPT-4 Vision
   */
  private async extractBuyBoxData(
    fileBuffer: Buffer,
    mimeType: string,
    filename: string
  ): Promise<ExtractedBuyBox> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized. Set OPENAI_API_KEY environment variable.');
    }

    const base64Image = fileBuffer.toString('base64');
    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    const systemPrompt = `You are an expert at extracting real estate investment buy box criteria from documents.

FUND NAME IDENTIFICATION:
- Look for "###" prefix to identify the fund name. Example: "###Tricon Residential" means the fund name is "Tricon Residential"
- If no ### prefix is found, look for the company/fund name in the header, title, or first few lines
- The fund name is critical - it's used to match/update existing buy boxes

DOCUMENT TAGS:
Look for these special tags anywhere in the document (usually handwritten or typed near the top/bottom):
- #ENABLE or #DISABLE - Control whether the buy box is active
- #PRIORITY:N - Set priority level (1-100, where 1 is highest)
- #AUTO_SUBMIT or #AUTO_SUBMIT:N - Enable auto-submission (optionally with threshold score)
- #NOTIFY:email@example.com - Send notification to this email when imported
- #REPLACE - Replace existing buy box entirely (don't merge)
- #TEST_MODE - Don't save, just extract and return data

Extract ALL information from the document and return it as JSON matching this structure:

{
  "fundName": "Name of the fund/company (from ### prefix or document header)",
  "fundType": "Type (e.g., Institutional REIT, Private Equity, Family Office)",
  "description": "Brief description of the fund",
  "contactEmail": "Main contact email if shown",
  "contactPhone": "Main contact phone if shown",
  "marketContacts": [
    {
      "name": "Contact person name",
      "email": "their@email.com",
      "phone": "phone if shown",
      "markets": ["Market 1", "Market 2"]
    }
  ],
  "criteria": {
    "investmentStrategies": ["long_term_rental", "fix_and_flip"],
    "states": ["TX", "FL", "GA"],
    "counties": ["Harris", "Dallas", "Fulton"],
    "propertyTypes": ["single_family"],
    "minPrice": 100000,
    "maxPrice": 500000,
    "minBedrooms": 3,
    "maxBedrooms": 5,
    "minBathrooms": 2,
    "minSqft": 1000,
    "maxSqft": 3000,
    "minYearBuilt": 1990,
    "conditionLevels": ["light", "medium"],
    "allowPool": false,
    "allowSolarPanels": false,
    "allowSeptic": false,
    "allowCarport": false,
    "minGarages": 1,
    "allowFloodZone": false,
    "allowStructuralIssues": false,
    "allowFoundationIssues": false,
    "allowFireDamage": false,
    "allowLeasingRestrictions": false,
    "allowAgeRestrictions": false,
    "allowMainRoad": false,
    "minSchoolScore": 3,
    "minGrossYield": 0.08,
    "hardNos": "Text description of absolute deal breakers",
    "marketPrices": {
      "Atlanta, GA": { "maxPrice": 450000, "grossYield": 9.0 },
      "Houston, TX": { "maxPrice": 375000, "grossYield": 10.5 }
    }
  },
  "tags": {
    "enable": true,
    "priority": 1,
    "autoSubmit": true,
    "autoSubmitThreshold": 85,
    "notify": ["email@example.com"],
    "replace": false,
    "testMode": false
  },
  "confidence": 0.95,
  "extractedFields": ["fundName", "states", "price", "bedrooms"],
  "warnings": ["Could not determine bathroom requirements"]
}

Important:
- ALWAYS check for ### prefix first to identify fund name
- Extract ALL document tags found (they may be handwritten or typed)
- Extract state abbreviations (TX, FL, GA, etc.)
- Convert percentages to decimals (8% = 0.08)
- Use snake_case for property types: single_family, condo_townhome, duplex, etc.
- Set boolean restrictions to false when document says "No pools", "No septic", etc.
- Include ALL market-specific pricing if shown
- List ALL contacts with their assigned markets
- Include confidence score (0-1) based on document clarity
- List which fields were successfully extracted
- Add warnings for unclear or missing data`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract the buy box criteria from this document. Filename: ${filename}`,
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from GPT-4 Vision');
    }

    try {
      const parsed = JSON.parse(content);

      // Normalize tags from GPT-4 response
      const tags: DocumentTags = {};
      if (parsed.tags) {
        if (parsed.tags.enable !== undefined) tags.enable = Boolean(parsed.tags.enable);
        if (parsed.tags.disable !== undefined) tags.enable = !Boolean(parsed.tags.disable);
        if (parsed.tags.priority !== undefined) tags.priority = Number(parsed.tags.priority);
        if (parsed.tags.autoSubmit !== undefined) tags.autoSubmit = Boolean(parsed.tags.autoSubmit);
        if (parsed.tags.autoSubmitThreshold !== undefined) tags.autoSubmitThreshold = Number(parsed.tags.autoSubmitThreshold);
        if (parsed.tags.notify) tags.notify = Array.isArray(parsed.tags.notify) ? parsed.tags.notify : [parsed.tags.notify];
        if (parsed.tags.replace !== undefined) tags.replace = Boolean(parsed.tags.replace);
        if (parsed.tags.testMode !== undefined) tags.testMode = Boolean(parsed.tags.testMode);
      }

      return {
        fundName: parsed.fundName || '',
        fundType: parsed.fundType,
        description: parsed.description,
        contactEmail: parsed.contactEmail,
        contactPhone: parsed.contactPhone,
        marketContacts: parsed.marketContacts || [],
        criteria: this.normalizeCriteria(parsed.criteria || {}),
        confidence: parsed.confidence || 0.5,
        extractedFields: parsed.extractedFields || [],
        warnings: parsed.warnings || [],
        tags: Object.keys(tags).length > 0 ? tags : undefined,
      };
    } catch (error) {
      console.error('Failed to parse GPT-4 response:', content);
      throw new Error('Failed to parse extracted data');
    }
  }

  /**
   * Normalize criteria to match our schema
   */
  private normalizeCriteria(raw: any): Partial<BuyBoxCriteria> {
    const criteria: Partial<BuyBoxCriteria> = {};

    // Investment strategies
    if (raw.investmentStrategies) {
      criteria.investmentStrategies = raw.investmentStrategies.filter(
        (s: string) => ['fix_and_flip', 'long_term_rental'].includes(s)
      ) as InvestmentStrategy[];
    }

    // Geographic
    if (raw.states) criteria.states = raw.states;
    if (raw.counties) criteria.counties = raw.counties;
    if (raw.cities) criteria.cities = raw.cities;
    if (raw.zipCodes) criteria.zipCodes = raw.zipCodes;

    // Property types
    if (raw.propertyTypes) {
      criteria.propertyTypes = raw.propertyTypes as PropertyType[];
    }

    // Price
    if (raw.minPrice) criteria.minPrice = Number(raw.minPrice);
    if (raw.maxPrice) criteria.maxPrice = Number(raw.maxPrice);

    // Specs
    if (raw.minBedrooms) criteria.minBedrooms = Number(raw.minBedrooms);
    if (raw.maxBedrooms) criteria.maxBedrooms = Number(raw.maxBedrooms);
    if (raw.minBathrooms) criteria.minBathrooms = Number(raw.minBathrooms);
    if (raw.maxBathrooms) criteria.maxBathrooms = Number(raw.maxBathrooms);
    if (raw.minSqft) criteria.minSqft = Number(raw.minSqft);
    if (raw.maxSqft) criteria.maxSqft = Number(raw.maxSqft);
    if (raw.minYearBuilt) criteria.minYearBuilt = Number(raw.minYearBuilt);

    // Garage
    if (raw.minGarages !== undefined) criteria.minGarages = Number(raw.minGarages);
    if (raw.maxGarages !== undefined) criteria.maxGarages = Number(raw.maxGarages);
    if (raw.allowCarport !== undefined) criteria.allowCarport = Boolean(raw.allowCarport);

    // Condition
    if (raw.conditionLevels) {
      criteria.conditionLevels = raw.conditionLevels as ConditionLevel[];
    }

    // Property features (booleans)
    if (raw.allowPool !== undefined) criteria.allowPool = Boolean(raw.allowPool);
    if (raw.allowSolarPanels !== undefined) criteria.allowSolarPanels = Boolean(raw.allowSolarPanels);
    if (raw.allowSeptic !== undefined) criteria.allowSeptic = Boolean(raw.allowSeptic);
    if (raw.allowWell !== undefined) criteria.allowWell = Boolean(raw.allowWell);

    // Risk preferences
    if (raw.allowFloodZone !== undefined) criteria.allowFloodZone = Boolean(raw.allowFloodZone);
    if (raw.allowStructuralIssues !== undefined) criteria.allowStructuralIssues = Boolean(raw.allowStructuralIssues);
    if (raw.allowFoundationIssues !== undefined) criteria.allowFoundationIssues = Boolean(raw.allowFoundationIssues);
    if (raw.allowFireDamage !== undefined) criteria.allowFireDamage = Boolean(raw.allowFireDamage);
    if (raw.allowCodeViolations !== undefined) criteria.allowCodeViolations = Boolean(raw.allowCodeViolations);
    if (raw.allowOpenPermits !== undefined) criteria.allowOpenPermits = Boolean(raw.allowOpenPermits);

    // HOA
    if (raw.allowHoa !== undefined) criteria.allowHoa = Boolean(raw.allowHoa);
    if (raw.allowLeasingRestrictions !== undefined) criteria.allowLeasingRestrictions = Boolean(raw.allowLeasingRestrictions);
    if (raw.allowAgeRestrictions !== undefined) criteria.allowAgeRestrictions = Boolean(raw.allowAgeRestrictions);
    if (raw.maxHoaMonthly) criteria.maxHoaMonthly = Number(raw.maxHoaMonthly);

    // Location quality
    if (raw.allowMainRoad !== undefined) criteria.allowMainRoad = Boolean(raw.allowMainRoad);
    if (raw.minSchoolScore) criteria.minSchoolScore = Number(raw.minSchoolScore);

    // Rental
    if (raw.minGrossYield) criteria.minGrossYield = Number(raw.minGrossYield);
    if (raw.rentalMinCapRate) criteria.rentalMinCapRate = Number(raw.rentalMinCapRate);

    // Hard nos
    if (raw.hardNos) criteria.hardNos = String(raw.hardNos);

    // Market prices
    if (raw.marketPrices && typeof raw.marketPrices === 'object') {
      criteria.marketPrices = raw.marketPrices as Record<string, MarketPricing>;
    }

    return criteria;
  }

  /**
   * Merge existing criteria with new extracted criteria
   */
  private mergeCriteria(
    existing: BuyBoxCriteria,
    extracted: Partial<BuyBoxCriteria>
  ): BuyBoxCriteria {
    const merged = { ...existing };

    // Merge arrays (dedupe)
    if (extracted.states) {
      merged.states = [...new Set([...(existing.states || []), ...extracted.states])];
    }
    if (extracted.counties) {
      merged.counties = [...new Set([...(existing.counties || []), ...extracted.counties])];
    }
    if (extracted.cities) {
      merged.cities = [...new Set([...(existing.cities || []), ...extracted.cities])];
    }
    if (extracted.propertyTypes) {
      merged.propertyTypes = [...new Set([...(existing.propertyTypes || []), ...extracted.propertyTypes])];
    }

    // For numeric values, prefer extracted if present
    const numericFields = [
      'minPrice', 'maxPrice', 'minBedrooms', 'maxBedrooms',
      'minBathrooms', 'maxBathrooms', 'minSqft', 'maxSqft',
      'minYearBuilt', 'minGarages', 'maxGarages', 'minSchoolScore',
      'minGrossYield', 'rentalMinCapRate', 'maxHoaMonthly',
    ] as const;

    for (const field of numericFields) {
      if (extracted[field] !== undefined) {
        (merged as any)[field] = extracted[field];
      }
    }

    // For boolean values, prefer extracted (more restrictive usually wins)
    const booleanFields = [
      'allowPool', 'allowSolarPanels', 'allowSeptic', 'allowWell',
      'allowCarport', 'allowFloodZone', 'allowStructuralIssues',
      'allowFoundationIssues', 'allowFireDamage', 'allowCodeViolations',
      'allowOpenPermits', 'allowHoa', 'allowLeasingRestrictions',
      'allowAgeRestrictions', 'allowMainRoad',
    ] as const;

    for (const field of booleanFields) {
      if (extracted[field] !== undefined) {
        (merged as any)[field] = extracted[field];
      }
    }

    // Merge market prices
    if (extracted.marketPrices) {
      merged.marketPrices = {
        ...(existing.marketPrices || {}),
        ...extracted.marketPrices,
      };
    }

    // Update hard nos
    if (extracted.hardNos) {
      merged.hardNos = extracted.hardNos;
    }

    return merged;
  }

  /**
   * Merge existing contacts with new extracted contacts
   */
  private mergeContacts(
    existing: MarketContact[],
    extracted: MarketContact[]
  ): MarketContact[] {
    const merged = [...existing];

    for (const newContact of extracted) {
      const existingIndex = merged.findIndex(
        c => c.email.toLowerCase() === newContact.email.toLowerCase()
      );

      if (existingIndex >= 0) {
        // Update existing contact, merge markets
        merged[existingIndex] = {
          ...merged[existingIndex],
          name: newContact.name || merged[existingIndex].name,
          phone: newContact.phone || merged[existingIndex].phone,
          markets: [...new Set([...merged[existingIndex].markets, ...newContact.markets])],
        };
      } else {
        // Add new contact
        merged.push(newContact);
      }
    }

    return merged;
  }

  /**
   * Import from file path (for CLI usage)
   */
  async importFromFile(filePath: string): Promise<ImportResult> {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    const buffer = fs.readFileSync(absolutePath);
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);

    let mimeType: string;
    switch (ext) {
      case '.png':
        mimeType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        mimeType = 'image/jpeg';
        break;
      case '.gif':
        mimeType = 'image/gif';
        break;
      case '.webp':
        mimeType = 'image/webp';
        break;
      case '.pdf':
        mimeType = 'application/pdf';
        break;
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }

    return this.importFromDocument(buffer, mimeType, filename);
  }
}

export const buyBoxImportService = new BuyBoxImportService();
export default buyBoxImportService;
