/**
 * Compliance Service
 *
 * Evaluates properties against state-specific compliance rules.
 * Supports configurable rules stored in database.
 */

import { createHash } from 'crypto';
import { Op } from 'sequelize';
import StateComplianceRule, {
  ComplianceSeverity,
  SeverityOverride,
} from '../models/StateComplianceRule';
import Property from '../models/Property';
import ComplianceCheck, { RuleSnapshot } from '../models/ComplianceCheck';
import PropertyContact from '../models/PropertyContact';
import Contact from '../models/Contact';
import PropertyDocument, { DocumentMetadata } from '../models/PropertyDocument';
import PropertyFieldQuality, { FieldQualityStatus } from '../models/PropertyFieldQuality';
import ComplianceAlert from '../models/ComplianceAlert';
import StateDocumentTemplate from '../models/StateDocumentTemplate';
import DocuSealSubmission from '../models/DocuSealSubmission';
import sequelize from '../config/database';
import { buildPropertyFields } from '../utils/documentFields';
import { complianceEventStream } from './ComplianceEventStream';
import { complianceOCRService, type ContractExtractionResult } from './ComplianceOCRService';
import { dealApprovalService } from './DealApprovalService';
import { docuSealService } from './DocuSealService';
import { propertyContactService } from './PropertyContactService';
import storageService from './StorageService';
import { activityFeedService } from './ActivityFeedService';

/**
 * Enhanced property data that includes assigned contacts for compliance checks
 */
interface EnhancedPropertyData {
  property: Property;
  contacts: {
    broker?: Contact;
    attorney?: Contact;
    seller?: Contact;
    agent?: Contact;
    wholesaler?: Contact;
    re_agent?: Contact;
    buyer?: Contact;
  };
  documents: Array<{
    id: number;
    documentType: string;
    status: string;
    mimeType: string;
    fileSize: number;
    storageKey?: string;
    metadata?: DocumentMetadata;
    createdAt?: Date;
    updatedAt?: Date;
  }>;
  contractOcr?: ContractOcrSummary | null;
  fieldOverrides?: Record<string, any>;
  // Virtual fields derived from contacts
  hasBrokerAssigned: boolean;
  hasAttorneyAssigned: boolean;
  hasSellerAssigned: boolean;
  brokerLicenseFromContact?: string | null;
  brokerCompanyFromContact?: string | null;
  brokerEmailFromContact?: string | null;
  attorneyName?: string | null;
  attorneyEmail?: string | null;
  sellerName?: string | null;
  sellerEmail?: string | null;
}

interface ContractOcrSummary {
  success: boolean;
  confidence: number;
  extractedFields: ContractExtractionResult['extractedFields'];
  fieldEvidence?: ContractExtractionResult['fieldEvidence'];
  pageCount?: number;
  processedAt: Date;
  documentId?: number;
  documentUpdatedAt?: Date;
  source: 'cache' | 'vision' | 'tesseract';
  model?: string;
  error?: string;
}

type ComplianceValueSource = 'property' | 'contact' | 'ocr' | 'document' | 'evidence' | 'system';

interface FieldValueSourceDetail {
  role?: string;
  contactId?: number;
  documentId?: number;
  templateId?: number;
  docuSealTemplateId?: number;
  submissionId?: number;
}

interface FieldValueResolution {
  value: any;
  source: ComplianceValueSource;
  sourceDetail?: FieldValueSourceDetail;
}

interface FieldQualityInfo {
  status: FieldQualityStatus;
  source?: string | null;
  confidence?: number | null;
  updatedAt?: Date;
}

export interface ComplianceCheckResult {
  status: 'Green' | 'Yellow' | 'Red';
  state: string;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  issues: ComplianceIssue[];
  passedChecks: string[];
  checkedAt: Date;
  propertySnapshot?: Record<string, any>;
  evidenceSnapshot?: Record<string, any>;
  ruleSnapshot?: RuleSnapshot[];
  remediationPlan?: ComplianceRemediationPlan;
  checkId?: number;
  ruleVersionHash?: string;
  freshness?: ComplianceFreshness;
}

export interface ComplianceIssue {
  issueId?: string;
  ruleId: number;
  ruleName: string;
  category: string;
  field: string;
  severity: ComplianceSeverity;
  baseSeverity?: ComplianceSeverity;
  message: string;
  currentValue?: any;
  expectedValue?: string;
  evidenceRequirements?: StateComplianceRule['evidenceRequirements'];
  missingEvidence?: StateComplianceRule['evidenceRequirements'];
  valueSource?: ComplianceValueSource;
  sourceDetail?: FieldValueSourceDetail;
  links?: Record<string, string>;
  dataQuality?: FieldQualityInfo;
}

interface ComplianceContext {
  transactionType: 'wholesaling' | 'retail' | 'all';
  dealStage: string;
  brokerStatus: string;
  priorViolations?: number;
}

export interface ComplianceRemediationAction {
  ruleId: number;
  field: string;
  severity: ComplianceSeverity;
  action: 'provide_field' | 'update_field' | 'attach_document' | 'assign_contact' | 'extend_date' | 'set_true' | 'set_false' | 'update_list';
  message: string;
  evidenceRequirements?: StateComplianceRule['evidenceRequirements'];
  autoInitiated?: boolean;
  autoStatus?: 'sent' | 'assigned' | 'skipped' | 'failed';
  autoMessage?: string;
}

export interface ComplianceRemediationPlan {
  actions: ComplianceRemediationAction[];
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
}

export interface ComplianceFreshness {
  hasCheck: boolean;
  isStale: boolean;
  lastCheckId?: number;
  lastCheckedAt?: Date;
  lastRuleVersionHash?: string;
  currentRuleVersionHash?: string;
}

export interface ComplianceRecheckSummary {
  state: string;
  checked: number;
  passed: number;
  failed: number;
  limited: boolean;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  reason?: string;
  requestedBy?: string;
}

export interface ComplianceRecheckOptions {
  batchSize?: number;
  maxProperties?: number;
  reason?: string;
  requestedBy?: string;
  autoRemediate?: boolean;
}

class ComplianceService {
  private recheckInProgress: Set<string> = new Set();

  /**
   * Load assigned contacts for a property and create enhanced data
   */
  private async loadEnhancedPropertyData(
    property: Property,
    rules: StateComplianceRule[] = []
  ): Promise<EnhancedPropertyData> {
    const contacts: EnhancedPropertyData['contacts'] = {};
    let documents: EnhancedPropertyData['documents'] = [];
    const shouldRunOcr = this.shouldRunContractOcr(rules);

    try {
      // Load all contacts assigned to this property
      const propertyContacts = await PropertyContact.findAll({
        where: { propertyId: property.id },
        include: [{
          model: Contact,
          as: 'contact',
        }],
      });

      // Map contacts by role (take the primary one if multiple exist)
      for (const pc of propertyContacts) {
        const contact = (pc as any).contact as Contact | undefined;
        if (contact) {
          const role = pc.role as keyof typeof contacts;
          // Prefer primary contact, otherwise first one found
          if (!contacts[role] || pc.isPrimary) {
            contacts[role] = contact;
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load contacts for property ${property.id}:`, (error as Error).message);
    }

    try {
      const docs = await PropertyDocument.findAll({
        where: { propertyId: property.id },
        attributes: [
          'id',
          'documentType',
          'status',
          'mimeType',
          'fileSize',
          'storageKey',
          'metadata',
          'createdAt',
          'updatedAt',
        ],
        order: [['updatedAt', 'DESC']],
      });
      documents = docs.map(doc => ({
        id: doc.id,
        documentType: doc.documentType,
        status: doc.status,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        storageKey: doc.storageKey,
        metadata: doc.metadata,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));
    } catch (error) {
      console.warn(`⚠️ Failed to load documents for property ${property.id}:`, (error as Error).message);
    }

    const contractOcr = await this.loadContractOcr(property, shouldRunOcr);
    const fieldOverrides = this.buildContractOcrOverrides(contractOcr);

    return {
      property,
      contacts,
      documents,
      contractOcr,
      fieldOverrides,
      // Virtual fields for compliance checks
      hasBrokerAssigned: !!contacts.broker,
      hasAttorneyAssigned: !!contacts.attorney,
      hasSellerAssigned: !!contacts.seller,
      brokerLicenseFromContact: contacts.broker?.metadata?.licenseNumber as string | undefined,
      brokerCompanyFromContact: contacts.broker?.company,
      brokerEmailFromContact: contacts.broker?.email,
      attorneyName: contacts.attorney?.name,
      attorneyEmail: contacts.attorney?.email,
      sellerName: contacts.seller?.name,
      sellerEmail: contacts.seller?.email,
    };
  }

  private async loadFieldQuality(
    property: Property,
    rules: StateComplianceRule[]
  ): Promise<Record<string, FieldQualityInfo>> {
    if (!property.id) {
      return {};
    }

    const fields = Array.from(new Set(rules.map(rule => rule.field))).filter(Boolean);
    if (fields.length === 0) {
      return {};
    }

    try {
      const records = await PropertyFieldQuality.findAll({
        where: {
          propertyId: property.id,
          field: { [Op.in]: fields },
        },
      });

      return records.reduce<Record<string, FieldQualityInfo>>((acc, record) => {
        acc[record.field] = {
          status: record.status,
          source: record.source,
          confidence: record.confidence,
          updatedAt: record.updatedAt,
        };
        return acc;
      }, {});
    } catch (error) {
      console.warn(`⚠️ Failed to load field quality for property ${property.id}:`, (error as Error).message);
      return {};
    }
  }

  private hasValue(value: any): boolean {
    return value !== null && value !== undefined && value !== '';
  }

  private shouldRunContractOcr(rules: StateComplianceRule[]): boolean {
    const ocrFields = new Set(['assignable', 'marketingClauseFound']);
    const compareEnabled = process.env.COMPLIANCE_OCR_COMPARE !== 'false';
    return compareEnabled || rules.some(rule => ocrFields.has(rule.field));
  }

  private getOcrConfig(): {
    enabled: boolean;
    minConfidence: number;
    maxBytes: number;
    nameMatchScore: number;
    addressMatchScore: number;
    priceTolerance: number;
    dateToleranceDays: number;
  } {
    const enabled = process.env.COMPLIANCE_OCR_ENABLED !== 'false';
    const minConfidenceRaw = Number(process.env.COMPLIANCE_OCR_MIN_CONFIDENCE ?? 0.6);
    const maxBytesRaw = Number(process.env.COMPLIANCE_OCR_MAX_BYTES ?? 15 * 1024 * 1024);
    const nameMatchRaw = Number(process.env.COMPLIANCE_OCR_NAME_MATCH_SCORE ?? 0.8);
    const addressMatchRaw = Number(process.env.COMPLIANCE_OCR_ADDRESS_MATCH_SCORE ?? 0.7);
    const priceToleranceRaw = Number(process.env.COMPLIANCE_OCR_PRICE_TOLERANCE ?? 500);
    const dateToleranceRaw = Number(process.env.COMPLIANCE_OCR_DATE_TOLERANCE_DAYS ?? 2);

    const minConfidence = Number.isFinite(minConfidenceRaw)
      ? Math.min(Math.max(minConfidenceRaw, 0), 1)
      : 0.6;
    const maxBytes = Number.isFinite(maxBytesRaw) ? Math.max(maxBytesRaw, 0) : 0;
    const nameMatchScore = Number.isFinite(nameMatchRaw)
      ? Math.min(Math.max(nameMatchRaw, 0), 1)
      : 0.8;
    const addressMatchScore = Number.isFinite(addressMatchRaw)
      ? Math.min(Math.max(addressMatchRaw, 0), 1)
      : 0.7;
    const priceTolerance = Number.isFinite(priceToleranceRaw)
      ? Math.max(priceToleranceRaw, 0)
      : 500;
    const dateToleranceDays = Number.isFinite(dateToleranceRaw)
      ? Math.max(dateToleranceRaw, 0)
      : 2;

    return { enabled, minConfidence, maxBytes, nameMatchScore, addressMatchScore, priceTolerance, dateToleranceDays };
  }

  private buildContractOcrOverrides(contractOcr: ContractOcrSummary | null): Record<string, any> {
    const overrides: Record<string, any> = {};
    if (!contractOcr || !contractOcr.success) {
      return overrides;
    }

    const { minConfidence } = this.getOcrConfig();
    if (contractOcr.confidence < minConfidence) {
      return overrides;
    }

    if (contractOcr.extractedFields.assignable === true) {
      overrides.assignable = true;
    }

    if (contractOcr.extractedFields.marketingClauseFound === true) {
      overrides.marketingClauseFound = true;
    }

    return overrides;
  }

  private readContractOcrMetadata(
    metadata: DocumentMetadata['complianceOcr'] | undefined,
    documentUpdatedAt: string | undefined,
    documentId: number
  ): ContractOcrSummary | null {
    if (!metadata) {
      return null;
    }

    if (documentUpdatedAt) {
      if (!metadata.documentUpdatedAt || metadata.documentUpdatedAt !== documentUpdatedAt) {
        return null;
      }
    }

    return {
      success: metadata.success,
      confidence: Number(metadata.confidence || 0),
      extractedFields: (metadata.extractedFields || {}) as ContractExtractionResult['extractedFields'],
      fieldEvidence: (metadata.fieldEvidence || {}) as ContractExtractionResult['fieldEvidence'],
      pageCount: typeof metadata.pageCount === 'number' ? metadata.pageCount : undefined,
      processedAt: metadata.processedAt ? new Date(metadata.processedAt) : new Date(),
      documentId,
      documentUpdatedAt: metadata.documentUpdatedAt ? new Date(metadata.documentUpdatedAt) : undefined,
      source: metadata.source || 'cache',
      model: metadata.model,
      error: metadata.error,
    };
  }

  private buildContractOcrMetadata(summary: ContractOcrSummary): NonNullable<DocumentMetadata['complianceOcr']> {
    return {
      success: summary.success,
      confidence: summary.confidence,
      extractedFields: this.normalizeSnapshotValue(summary.extractedFields),
      fieldEvidence: this.normalizeSnapshotValue(summary.fieldEvidence || {}),
      pageCount: summary.pageCount,
      processedAt: summary.processedAt.toISOString(),
      documentUpdatedAt: summary.documentUpdatedAt?.toISOString(),
      source: summary.source === 'cache' ? undefined : summary.source,
      model: summary.model,
      error: summary.error,
    };
  }

  private async loadContractOcr(
    property: Property,
    shouldRunOcr: boolean
  ): Promise<ContractOcrSummary | null> {
    if (!shouldRunOcr || !property.id) {
      return null;
    }

    const { enabled, maxBytes } = this.getOcrConfig();
    if (!enabled) {
      return null;
    }

    let contractDoc: PropertyDocument | null = null;

    try {
      contractDoc = await PropertyDocument.findOne({
        where: {
          propertyId: property.id,
          documentType: 'contract',
          status: 'ready',
        },
        order: [['updatedAt', 'DESC']],
      });
    } catch (error) {
      console.warn(`⚠️ Failed to load contract document for property ${property.id}:`, (error as Error).message);
      return null;
    }

    if (!contractDoc) {
      return null;
    }

    if (maxBytes > 0 && contractDoc.fileSize > maxBytes) {
      console.warn(`⚠️ Contract document ${contractDoc.id} exceeds OCR size limit (${maxBytes} bytes)`);
      return null;
    }

    const documentUpdatedAt = contractDoc.updatedAt ? contractDoc.updatedAt.toISOString() : undefined;
    const cached = this.readContractOcrMetadata(contractDoc.metadata?.complianceOcr, documentUpdatedAt, contractDoc.id);
    if (cached) {
      return cached;
    }

    if (!contractDoc.storageKey) {
      return null;
    }

    let buffer: Buffer;
    try {
      const download = await storageService.download(contractDoc.storageKey);
      if (!download.exists) {
        console.warn(`⚠️ Contract document ${contractDoc.id} missing in storage`);
        return null;
      }
      buffer = download.data;
    } catch (error) {
      console.warn(`⚠️ Failed to download contract document ${contractDoc.id}:`, (error as Error).message);
      return null;
    }

    try {
      if (!complianceOCRService.isReady()) {
        await complianceOCRService.initialize();
      }
      const extraction = await complianceOCRService.extractContractFields(buffer, contractDoc.mimeType);

      const summary: ContractOcrSummary = {
        success: extraction.success,
        confidence: extraction.confidence,
        extractedFields: extraction.extractedFields,
        fieldEvidence: extraction.fieldEvidence,
        pageCount: extraction.pageCount,
        processedAt: new Date(),
        documentId: contractDoc.id,
        documentUpdatedAt: contractDoc.updatedAt,
        source: extraction.source || 'tesseract',
        model: extraction.source === 'vision'
          ? (process.env.COMPLIANCE_OCR_VISION_MODEL || 'gpt-4o-mini')
          : undefined,
      };

      const metadata = contractDoc.metadata ? { ...contractDoc.metadata } : {};
      try {
        await contractDoc.update({
          metadata: {
            ...metadata,
            complianceOcr: this.buildContractOcrMetadata(summary),
          },
        });
      } catch (updateError) {
        console.warn(`⚠️ Failed to store OCR metadata for contract ${contractDoc.id}:`, (updateError as Error).message);
      }

      return summary;
    } catch (error) {
      console.warn(`⚠️ OCR extraction failed for contract ${contractDoc.id}:`, (error as Error).message);

      const summary: ContractOcrSummary = {
        success: false,
        confidence: 0,
        extractedFields: {},
        fieldEvidence: {},
        processedAt: new Date(),
        documentId: contractDoc.id,
        documentUpdatedAt: contractDoc.updatedAt,
        source: 'tesseract',
        error: (error as Error).message,
      };

      const metadata = contractDoc.metadata ? { ...contractDoc.metadata } : {};
      try {
        await contractDoc.update({
          metadata: {
            ...metadata,
            complianceOcr: this.buildContractOcrMetadata(summary),
          },
        });
      } catch (updateError) {
        console.warn(`⚠️ Failed to store OCR metadata for contract ${contractDoc.id}:`, (updateError as Error).message);
      }

      return summary;
    }
  }

  private normalizeMatchValue(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private stringSimilarity(str1: string, str2: string): number {
    const s1 = this.normalizeMatchValue(str1);
    const s2 = this.normalizeMatchValue(str2);

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = [];
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  }

  private formatPropertyAddress(property: Property): string {
    const address = (property as any).address;
    if (address && typeof address === 'object') {
      const houseNumber = address.houseNumber || '';
      const street = address.street || '';
      const address2 = address.address2 ? ` ${address.address2}` : '';
      return `${houseNumber} ${street}${address2}, ${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim();
    }
    if (typeof address === 'string') {
      return address;
    }
    return `${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim();
  }

  private buildContractOcrIssues(
    property: Property,
    enhancedData?: EnhancedPropertyData
  ): ComplianceIssue[] {
    const contractOcr = enhancedData?.contractOcr;
    if (!contractOcr) {
      return [];
    }

    const issues: ComplianceIssue[] = [];
    const { minConfidence, nameMatchScore, addressMatchScore, priceTolerance, dateToleranceDays } = this.getOcrConfig();
    const sourceDetail: FieldValueSourceDetail = {
      documentId: contractOcr.documentId,
    };

    const addIssue = (issue: ComplianceIssue) => {
      issue.valueSource = 'ocr';
      issue.sourceDetail = sourceDetail;
      issues.push(this.finalizeIssue(issue, property, sourceDetail));
    };

    if (!contractOcr.success) {
      addIssue({
        ruleId: 0,
        ruleName: 'Contract OCR Failed',
        category: 'contract',
        field: 'contractOcr',
        severity: 'warning',
        message: 'Contract OCR failed. Review contract manually.',
        currentValue: 'failed',
        expectedValue: 'success',
      });
      return issues;
    }

    if (contractOcr.confidence < minConfidence) {
      addIssue({
        ruleId: 0,
        ruleName: 'Contract OCR Low Confidence',
        category: 'contract',
        field: 'contractOcr',
        severity: 'warning',
        message: `Contract OCR confidence ${Math.round(contractOcr.confidence * 100)}% is below ${Math.round(minConfidence * 100)}%. Review contract manually.`,
        currentValue: contractOcr.confidence,
        expectedValue: `>= ${minConfidence}`,
      });
    }

    if (contractOcr.confidence < minConfidence) {
      return issues;
    }

    const extracted = contractOcr.extractedFields || {};
    const expectedSeller = enhancedData?.sellerName || property.ownerName;
    if (expectedSeller && extracted.sellerName) {
      const score = this.stringSimilarity(expectedSeller, extracted.sellerName);
      if (score < nameMatchScore) {
        addIssue({
          ruleId: 0,
          ruleName: 'Contract Seller Mismatch',
          category: 'contract',
          field: 'sellerName',
          severity: 'warning',
          message: 'Seller name in contract does not match the deal record. Review required.',
          currentValue: extracted.sellerName,
          expectedValue: expectedSeller,
        });
      }
    }

    const expectedBuyer = property.wholesalerLlcName || property.llcOwnerName;
    if (expectedBuyer && extracted.buyerName) {
      const score = this.stringSimilarity(expectedBuyer, extracted.buyerName);
      if (score < nameMatchScore) {
        addIssue({
          ruleId: 0,
          ruleName: 'Contract Buyer Mismatch',
          category: 'contract',
          field: 'buyerName',
          severity: 'warning',
          message: 'Buyer entity in contract does not match the deal record. Review required.',
          currentValue: extracted.buyerName,
          expectedValue: expectedBuyer,
        });
      }
    }

    const expectedPrice = property.purchaseContractPrice;
    if (expectedPrice && extracted.purchasePrice) {
      const diff = Math.abs(Number(extracted.purchasePrice) - Number(expectedPrice));
      if (diff > priceTolerance) {
        addIssue({
          ruleId: 0,
          ruleName: 'Contract Price Mismatch',
          category: 'contract',
          field: 'purchaseContractPrice',
          severity: 'warning',
          message: 'Purchase price in contract does not match the deal record. Review required.',
          currentValue: extracted.purchasePrice,
          expectedValue: String(expectedPrice),
        });
      }
    }

    const expectedAddress = this.formatPropertyAddress(property);
    if (expectedAddress && extracted.propertyAddress) {
      const score = this.stringSimilarity(expectedAddress, extracted.propertyAddress);
      if (score < addressMatchScore) {
        addIssue({
          ruleId: 0,
          ruleName: 'Contract Address Mismatch',
          category: 'contract',
          field: 'propertyAddress',
          severity: 'warning',
          message: 'Property address in contract does not match the deal record. Review required.',
          currentValue: extracted.propertyAddress,
          expectedValue: expectedAddress,
        });
      }
    }

    const expectedExpiration = property.purchaseContractExpiration;
    if (expectedExpiration && extracted.contractExpirationDate) {
      const expectedTime = new Date(expectedExpiration).getTime();
      const extractedTime = new Date(extracted.contractExpirationDate).getTime();
      if (!isNaN(expectedTime) && !isNaN(extractedTime)) {
        const diffDays = Math.abs(expectedTime - extractedTime) / (1000 * 60 * 60 * 24);
        if (diffDays > dateToleranceDays) {
          addIssue({
            ruleId: 0,
            ruleName: 'Contract Expiration Date Mismatch',
            category: 'contract',
            field: 'purchaseContractExpiration',
            severity: 'warning',
            message: 'Contract expiration date does not match the deal record. Review required.',
            currentValue: extracted.contractExpirationDate,
            expectedValue: String(expectedExpiration),
          });
        }
      }
    }

    return issues;
  }

  private async syncContractOcrReviewAlert(
    property: Property,
    ocrIssues: ComplianceIssue[],
    checkId?: number,
    contractOcr?: ContractOcrSummary | null
  ): Promise<void> {
    if (!property.id) {
      return;
    }

    const alertKey = `contract-ocr-review-${property.id}`;
    const existing = await ComplianceAlert.findOne({ where: { alertKey } });

    if (ocrIssues.length === 0) {
      if (existing && existing.status !== 'resolved') {
        await existing.update({
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: 'system',
          resolutionNotes: 'OCR review no longer required.',
        });
      }
      return;
    }

    const severity = ocrIssues.some(issue => issue.severity === 'critical')
      ? 'critical'
      : ocrIssues.some(issue => issue.severity === 'warning')
        ? 'warning'
        : 'info';

    const address = this.formatPropertyAddress(property);
    const alertPayload = {
      alertKey,
      type: 'review_required' as const,
      severity,
      title: 'Review Required: Contract OCR',
      message: `Contract OCR flagged ${ocrIssues.length} issue(s)${address ? ` for ${address}` : ''}.`,
      resourceType: 'property' as const,
      resourceId: String(property.id),
      daysUntilExpiration: null,
      metadata: {
        propertyId: property.propertyId,
        checkId,
        issues: ocrIssues,
        contractOcr: contractOcr
          ? {
              confidence: contractOcr.confidence,
              extractedFields: contractOcr.extractedFields,
              fieldEvidence: contractOcr.fieldEvidence,
              pageCount: contractOcr.pageCount,
              source: contractOcr.source,
              model: contractOcr.model,
            }
          : null,
      },
    };

    if (!existing) {
      await ComplianceAlert.create({
        ...alertPayload,
        status: 'active',
      });
      return;
    }

    if (existing.status === 'resolved') {
      await existing.update({
        ...alertPayload,
        status: 'active',
        resolvedAt: null,
        resolvedBy: null,
        resolutionNotes: null,
      });
      return;
    }

    await existing.update({
      severity: alertPayload.severity,
      title: alertPayload.title,
      message: alertPayload.message,
      metadata: alertPayload.metadata,
      daysUntilExpiration: alertPayload.daysUntilExpiration,
    });
  }

  /**
   * Run compliance check for a property
   * Now includes assigned contacts in the evaluation
   */
  async checkProperty(
    property: Property,
    options: {
      asOf?: Date;
      transactionType?: 'wholesaling' | 'retail' | 'all' | string;
      dealStage?: string;
      brokerStatus?: string;
      priorViolations?: number;
      autoRemediate?: boolean;
      includeEvidence?: boolean;
    } = {}
  ): Promise<ComplianceCheckResult> {
    const evaluatedAt = options.asOf ? new Date(options.asOf) : new Date();
    const state = (property.state || 'ALL').toUpperCase();

    // Get applicable rules (state-specific + universal + overlays)
    const rules = await StateComplianceRule.getRulesForState(state, {
      asOf: evaluatedAt,
      county: property.county || undefined,
    });

    if (rules.length === 0) {
      console.log(`📋 No compliance rules found for state: ${state}`);
    }

    const context = await this.buildComplianceContext(property, options, rules);

    // Load enhanced property data with assigned contacts
    const enhancedData = await this.loadEnhancedPropertyData(property, rules);
    const fieldQuality = await this.loadFieldQuality(property, rules);

    const issues: ComplianceIssue[] = [];
    const passedChecks: string[] = [];

    // Evaluate each rule using enhanced data
    for (const rule of rules) {
      const result = this.evaluateRule(rule, property, enhancedData, evaluatedAt);
      const severity = this.resolveSeverity(rule.severity, rule.severityOverrides, context);
      const quality = fieldQuality[rule.field];

      if (result.passed) {
        passedChecks.push(rule.name);
      } else {
        const issue: ComplianceIssue = {
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          field: rule.field,
          severity,
          baseSeverity: rule.severity,
          message: rule.message,
          currentValue: result.currentValue,
          expectedValue: rule.value,
          valueSource: result.valueSource,
          sourceDetail: result.sourceDetail,
          dataQuality: quality,
        };
        issues.push(this.finalizeIssue(issue, property, result.sourceDetail));
      }

      const missingEvidence = this.getMissingEvidence(rule, enhancedData);
      if (missingEvidence.length > 0 && result.passed) {
        const evidenceSeverity = this.resolveSeverity(rule.evidenceSeverity || rule.severity, rule.severityOverrides, context);
        const issue: ComplianceIssue = {
          ruleId: rule.id,
          ruleName: `${rule.name} (evidence)`,
          category: rule.category,
          field: rule.field,
          severity: evidenceSeverity,
          baseSeverity: rule.evidenceSeverity || rule.severity,
          message: `Missing required evidence: ${missingEvidence.map(req => this.describeEvidenceRequirement(req)).join(', ')}`,
          currentValue: null,
          expectedValue: 'evidence',
          evidenceRequirements: rule.evidenceRequirements,
          missingEvidence,
          valueSource: 'evidence',
          sourceDetail: result.sourceDetail,
          dataQuality: quality,
        };
        issues.push(this.finalizeIssue(issue, property, result.sourceDetail));
      }
    }

    const documentIssues = await this.getDocumentComplianceIssues(property, context.transactionType);
    if (documentIssues.length > 0) {
      issues.push(...documentIssues);
    }

    const ocrIssues = this.buildContractOcrIssues(property, enhancedData);
    if (ocrIssues.length > 0) {
      issues.push(...ocrIssues);
    }

    // Determine overall status
    let status: 'Green' | 'Yellow' | 'Red' = 'Green';
    if (issues.some(i => i.severity === 'critical')) {
      status = 'Red';
    } else if (issues.some(i => i.severity === 'warning')) {
      status = 'Yellow';
    }

    console.log(`📋 Compliance check for ${state}: ${status} (${issues.length} issues, ${passedChecks.length} passed)`);

    const ruleSnapshot = this.createRuleSnapshot(rules);
    const ruleVersionHash = this.generateRuleVersionHash(ruleSnapshot);
    const propertySnapshot = this.createPropertySnapshot(property, rules, enhancedData);
    const evidenceSnapshot = this.createEvidenceSnapshot(enhancedData, fieldQuality);
    const includeEvidence = options.includeEvidence === true;

    const result: ComplianceCheckResult = {
      status,
      state,
      totalRules: rules.length,
      passedRules: passedChecks.length,
      failedRules: issues.length,
      issues,
      passedChecks,
      checkedAt: evaluatedAt,
      ruleVersionHash,
      propertySnapshot: includeEvidence ? propertySnapshot : undefined,
      evidenceSnapshot: includeEvidence ? evidenceSnapshot : undefined,
      ruleSnapshot: includeEvidence ? ruleSnapshot : undefined,
    };

    result.remediationPlan = this.buildRemediationPlan(result.issues, rules);
    const shouldAutoRemediate =
      options.autoRemediate ?? process.env.COMPLIANCE_AUTO_REMEDIATE !== 'false';
    if (shouldAutoRemediate && result.remediationPlan.actions.length > 0) {
      await this.executeRemediationPlan(property, result.remediationPlan, context, enhancedData);
    }
    const checkId = await this.saveCheckResult(property, result, rules, enhancedData, {
      ruleSnapshot,
      ruleVersionHash,
      propertySnapshot,
      evidenceSnapshot,
    });
    if (checkId) {
      result.checkId = checkId;
    }
    try {
      await this.syncContractOcrReviewAlert(property, ocrIssues, result.checkId, enhancedData.contractOcr || null);
    } catch (error) {
      console.warn(`⚠️ Failed to sync OCR review alert for property ${property.id}:`, (error as Error).message);
    }
    result.freshness = {
      hasCheck: !!checkId,
      isStale: !checkId,
      lastCheckId: checkId,
      lastCheckedAt: result.checkedAt,
      lastRuleVersionHash: ruleVersionHash,
      currentRuleVersionHash: ruleVersionHash,
    };

    // Emit compliance event
    const eventType =
      result.status === 'Green'
        ? 'compliance.check.passed'
        : result.status === 'Yellow'
          ? 'compliance.check.warning'
          : 'compliance.check.failed';

    complianceEventStream.publish(
      eventType,
      'property',
      property.id,
      {
        status: result.status,
        state: result.state,
        totalRules: result.totalRules,
        passedRules: result.passedRules,
        failedRules: result.failedRules,
        issueCount: result.issues.length,
        criticalIssues: result.issues.filter(i => i.severity === 'critical').length,
        checkId: result.checkId,
      },
      {
        source: 'system',
        metadata: {
          state: result.state,
          severity: result.status === 'Red' ? 'critical' : result.status === 'Yellow' ? 'warning' : 'info',
        },
      }
    );

    // Auto-queue for broker approval if compliance passes (Green)
    if (result.status === 'Green' && property.id) {
      try {
        // Only queue if in draft status or no approval status yet
        const currentApprovalStatus = property.approvalStatus;
        if (!currentApprovalStatus || currentApprovalStatus === 'draft') {
          await dealApprovalService.queueForApproval(property.id);
          console.log(`📋 Property ${property.id} auto-queued for broker approval after passing compliance`);
        }
      } catch (queueError) {
        // Don't fail the compliance check if queuing fails
        console.warn(`⚠️ Failed to auto-queue property ${property.id} for approval:`, (queueError as Error).message);
      }
    }

    return result;
  }

  private async buildComplianceContext(
    property: Property,
    options: {
      asOf?: Date;
      transactionType?: 'wholesaling' | 'retail' | 'all' | string;
      dealStage?: string;
      brokerStatus?: string;
      priorViolations?: number;
    },
    rules: StateComplianceRule[]
  ): Promise<ComplianceContext> {
    const transactionType = this.normalizeTransactionType(
      options.transactionType || property.workflowType || property.conveyanceType
    );
    const dealStage = options.dealStage || property.processingState || property.approvalStatus || 'unknown';
    const brokerStatus = options.brokerStatus ||
      property.approvalStatus ||
      (property.brokerOnFile ? 'on_file' : 'missing');

    let priorViolations = options.priorViolations;
    const needsPriorViolations = rules.some(rule =>
      rule.severityOverrides?.some(override => override.when?.priorViolations !== undefined)
    );

    if (priorViolations === undefined && needsPriorViolations && property.id) {
      priorViolations = await ComplianceCheck.count({
        where: {
          propertyId: property.id,
          status: 'Red',
        },
      });
    }

    return {
      transactionType,
      dealStage,
      brokerStatus,
      priorViolations,
    };
  }

  private normalizeTransactionType(value?: string): 'wholesaling' | 'retail' | 'all' {
    const normalized = (value || '').toLowerCase();
    if (normalized === 'wholesale') return 'wholesaling';
    if (normalized === 'retail') return 'retail';
    if (normalized === 'all') return 'all';
    return 'wholesaling';
  }

  private resolveSeverity(
    baseSeverity: ComplianceSeverity,
    overrides: SeverityOverride[] | undefined,
    context: ComplianceContext
  ): ComplianceSeverity {
    if (!overrides || overrides.length === 0) {
      return baseSeverity;
    }

    let effective = baseSeverity;
    for (const override of overrides) {
      if (this.matchesSeverityOverride(override, context)) {
        effective = override.severity;
      }
    }

    return effective;
  }

  private matchesSeverityOverride(override: SeverityOverride, context: ComplianceContext): boolean {
    const conditions = override.when;
    if (!conditions || Object.keys(conditions).length === 0) {
      return true;
    }

    if (conditions.transactionType && !this.matchesContextValue(context.transactionType, conditions.transactionType)) {
      return false;
    }
    if (conditions.dealStage && !this.matchesContextValue(context.dealStage, conditions.dealStage)) {
      return false;
    }
    if (conditions.brokerStatus && !this.matchesContextValue(context.brokerStatus, conditions.brokerStatus)) {
      return false;
    }
    if (conditions.priorViolations !== undefined) {
      if (context.priorViolations === undefined) return false;
      if (typeof conditions.priorViolations === 'number') {
        if (context.priorViolations < conditions.priorViolations) return false;
      } else {
        if (conditions.priorViolations.min !== undefined && context.priorViolations < conditions.priorViolations.min) {
          return false;
        }
        if (conditions.priorViolations.max !== undefined && context.priorViolations > conditions.priorViolations.max) {
          return false;
        }
      }
    }

    return true;
  }

  private matchesContextValue(value: string, allowed: string | string[]): boolean {
    const allowedList = Array.isArray(allowed) ? allowed : [allowed];
    return allowedList.some(entry => {
      const normalized = entry.toLowerCase();
      return normalized === 'all' || normalized === value.toLowerCase();
    });
  }

  private async executeRemediationPlan(
    property: Property,
    plan: ComplianceRemediationPlan,
    context: ComplianceContext,
    enhancedData?: EnhancedPropertyData
  ): Promise<void> {
    for (const action of plan.actions) {
      if (action.action === 'attach_document') {
        const category = this.extractDocumentCategory(action.field);
        if (!category) {
          action.autoInitiated = false;
          action.autoStatus = 'skipped';
          action.autoMessage = 'No document category found';
          continue;
        }

        const result = await this.tryAutoSendDocument(property, category, context.transactionType, enhancedData);
        action.autoInitiated = result.initiated;
        action.autoStatus = result.status;
        action.autoMessage = result.message;
        continue;
      }

      if (action.action === 'assign_contact') {
        const role = this.extractContactRole(action.field);
        if (!role) {
          action.autoInitiated = false;
          action.autoStatus = 'skipped';
          action.autoMessage = 'No contact role found';
          continue;
        }

        const result = await this.tryAutoAssignContact(property, role, enhancedData);
        action.autoInitiated = result.initiated;
        action.autoStatus = result.status;
        action.autoMessage = result.message;
      }
    }
  }

  private extractDocumentCategory(field: string): string | null {
    if (!field.startsWith('document:')) return null;
    const [, category] = field.split(':');
    return category?.trim() || null;
  }

  private extractContactRole(field: string): string | null {
    if (!field.startsWith('contact:')) return null;
    const [, role] = field.split(':');
    const normalizedRole = role?.trim();
    if (!normalizedRole) return null;
    const allowedRoles = new Set(['agent', 'broker', 'seller', 'wholesaler', 'attorney', 're_agent', 'buyer', 'other']);
    if (!allowedRoles.has(normalizedRole)) {
      return null;
    }
    return normalizedRole;
  }

  private async tryAutoSendDocument(
    property: Property,
    category: string,
    transactionType: 'wholesaling' | 'retail' | 'all',
    enhancedData?: EnhancedPropertyData
  ): Promise<{ initiated: boolean; status: 'sent' | 'skipped' | 'failed'; message: string }> {
    if (!property.id) {
      return { initiated: false, status: 'skipped', message: 'Property missing ID' };
    }
    if (typeof (property as any).update !== 'function') {
      return { initiated: false, status: 'skipped', message: 'Property not persisted' };
    }

    if (!docuSealService.isReady()) {
      return { initiated: false, status: 'skipped', message: 'DocuSeal not configured' };
    }

    const state = property.state?.toUpperCase() || 'ALL';
    const templates = await StateDocumentTemplate.getRequiredTemplates(state, transactionType);
    const template = templates.find(t => t.category === category);
    if (!template) {
      return { initiated: false, status: 'skipped', message: 'No matching template for category' };
    }

    const docCheck = await this.checkDocumentRequirements(property, transactionType);
    const requirement = docCheck.requirements.find(req => req.category === category);
    if (requirement && ['pending', 'completed'].includes(requirement.status)) {
      return { initiated: false, status: 'skipped', message: `Document is ${requirement.status}` };
    }

    const existingStatus = (property as any).documentStatus?.[category]?.status;
    if (existingStatus && ['sending', 'sent', 'viewed', 'signed', 'declined', 'expired'].includes(existingStatus)) {
      return { initiated: false, status: 'skipped', message: `Document already ${existingStatus}` };
    }

    const sellerEmail = enhancedData?.sellerEmail || property.llcOwnerEmail;
    if (!sellerEmail) {
      return { initiated: false, status: 'skipped', message: 'Missing seller email' };
    }

    const sellerName = enhancedData?.sellerName || property.wholesalerLlcName || 'Seller';
    const fields = buildPropertyFields(property, template.fieldMappings);

    const transaction = await sequelize.transaction();
    try {
      const documentStatus = (property as any).documentStatus || {};
      documentStatus[template.category] = {
        status: 'sending',
        sentAt: new Date().toISOString(),
        templateId: template.id,
        templateName: template.name,
      };
      await property.update({ documentStatus } as any, { transaction });

      const submission = await docuSealService.createSubmission({
        templateId: template.docuSealTemplateId,
        submitters: [
          {
            email: sellerEmail,
            name: sellerName,
            role: 'Seller',
            send_email: true,
            fields: Object.entries(fields).map(([name, value]) => ({
              name,
              default_value: String(value ?? ''),
            })),
          },
        ],
        sendEmail: true,
        expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        metadata: {
          propertyId: property.id,
          templateId: template.id,
          state: property.state,
          category: template.category,
          source: 'compliance_remediation',
        },
      });

      documentStatus[template.category] = {
        status: 'sent',
        submissionId: submission.id,
        sentAt: new Date().toISOString(),
        templateId: template.id,
        templateName: template.name,
      };
      await property.update({ documentStatus } as any, { transaction });
      await transaction.commit();

      return { initiated: true, status: 'sent', message: 'DocuSeal submission sent' };
    } catch (error) {
      await transaction.rollback();
      return { initiated: false, status: 'failed', message: (error as Error).message };
    }
  }

  private async tryAutoAssignContact(
    property: Property,
    role: string,
    enhancedData?: EnhancedPropertyData
  ): Promise<{ initiated: boolean; status: 'assigned' | 'skipped' | 'failed'; message: string }> {
    if (!property.id) {
      return { initiated: false, status: 'skipped', message: 'Property missing ID' };
    }
    if (typeof (property as any).update !== 'function') {
      return { initiated: false, status: 'skipped', message: 'Property not persisted' };
    }

    const existing = enhancedData?.contacts?.[role as keyof EnhancedPropertyData['contacts']];
    if (existing) {
      return { initiated: false, status: 'skipped', message: 'Contact already assigned' };
    }

    let contact: Contact | null = null;
    if (role === 'broker' && property.assignedBrokerId) {
      contact = await Contact.findOne({ where: { linkedUserId: property.assignedBrokerId } });
    }

    if (!contact) {
      const email = this.getContactEmailForRole(role, property, enhancedData);
      if (email) {
        contact = await Contact.findOne({ where: { email } });
      }
    }

    if (!contact) {
      return { initiated: false, status: 'skipped', message: 'No matching contact found' };
    }

    try {
      await propertyContactService.assignContact({
        propertyId: property.id,
        contactId: contact.id,
        role: role as any,
        isPrimary: true,
        notes: 'Auto-assigned by compliance remediation',
      });
      return { initiated: true, status: 'assigned', message: 'Contact assigned' };
    } catch (error) {
      return { initiated: false, status: 'failed', message: (error as Error).message };
    }
  }

  private getContactEmailForRole(
    role: string,
    property: Property,
    enhancedData?: EnhancedPropertyData
  ): string | undefined {
    switch (role) {
      case 'seller':
        return enhancedData?.sellerEmail || property.llcOwnerEmail || undefined;
      case 'agent':
        return property.agentEmail || undefined;
      case 'broker':
        return enhancedData?.brokerEmailFromContact || undefined;
      case 'wholesaler':
        return property.llcOwnerEmail || undefined;
      default:
        return undefined;
    }
  }

  private mapFieldToContactRole(field: string): string | null {
    const normalized = field.toLowerCase();
    const roleMap: Record<string, string> = {
      brokeronfile: 'broker',
      hasbrokerassigned: 'broker',
      brokerlicensenumber: 'broker',
      brokeremail: 'broker',
      hasattorney: 'attorney',
      attorneyonfile: 'attorney',
      attorneyemail: 'attorney',
      hassellercontact: 'seller',
      selleronfile: 'seller',
      selleremail: 'seller',
      agentlicensenumber: 'agent',
      agentemail: 'agent',
      agentname: 'agent',
      wholesalerllcname: 'wholesaler',
    };

    const key = normalized.replace(/[^a-z]/g, '');
    return roleMap[key] || null;
  }

  /**
   * Check if latest compliance result is stale relative to current rules.
   */
  async getComplianceFreshness(
    property: Property,
    options: { asOf?: Date } = {}
  ): Promise<ComplianceFreshness> {
    if (!property.id) {
      return { hasCheck: false, isStale: true };
    }

    const lastCheck = await ComplianceCheck.findOne({
      where: { propertyId: property.id },
      order: [['checkedAt', 'DESC']],
    });

    const evaluatedAt = options.asOf ? new Date(options.asOf) : new Date();
    const state = property.state?.toUpperCase() || 'ALL';

    const rules = await StateComplianceRule.getRulesForState(state, {
      asOf: evaluatedAt,
      county: property.county || undefined,
    });

    const currentRuleVersionHash = this.generateRuleVersionHash(this.createRuleSnapshot(rules));

    if (!lastCheck || !lastCheck.ruleVersionHash) {
      return {
        hasCheck: false,
        isStale: true,
        currentRuleVersionHash,
      };
    }

    return {
      hasCheck: true,
      isStale: lastCheck.ruleVersionHash !== currentRuleVersionHash,
      lastCheckId: lastCheck.id,
      lastCheckedAt: lastCheck.checkedAt,
      lastRuleVersionHash: lastCheck.ruleVersionHash,
      currentRuleVersionHash,
    };
  }

  /**
   * Schedule a background recheck of properties after rule changes.
   */
  scheduleRecheckPropertiesForState(state: string, options: ComplianceRecheckOptions = {}): void {
    const normalizedState = state?.toUpperCase() || 'ALL';

    setTimeout(() => {
      if (this.recheckInProgress.has(normalizedState)) {
        console.log(`ℹ️ Compliance recheck already running for ${normalizedState}, skipping schedule`);
        return;
      }

      this.recheckInProgress.add(normalizedState);

      this.recheckPropertiesForState(normalizedState, options)
        .catch(error => {
          console.warn(`⚠️ Compliance recheck failed for ${normalizedState}:`, (error as Error).message);
        })
        .finally(() => {
          this.recheckInProgress.delete(normalizedState);
        });
    }, 0);
  }

  /**
   * Recheck properties for a specific state (or all states).
   */
  async recheckPropertiesForState(
    state: string,
    options: ComplianceRecheckOptions = {}
  ): Promise<ComplianceRecheckSummary> {
    const normalizedState = state?.toUpperCase() || 'ALL';
    const batchSize = options.batchSize ?? 50;
    const maxProperties = options.maxProperties ?? 0;
    const where: Record<string, any> = {};

    if (normalizedState !== 'ALL') {
      where.state = { [Op.iLike]: normalizedState };
    }

    const summary: ComplianceRecheckSummary = {
      state: normalizedState,
      checked: 0,
      passed: 0,
      failed: 0,
      limited: false,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
      reason: options.reason,
      requestedBy: options.requestedBy,
    };

    console.log(`📋 Compliance recheck started for ${normalizedState} (reason: ${options.reason || 'unspecified'})`);

    let lastId = 0;

    while (true) {
      const batch = await Property.findAll({
        where: {
          ...where,
          id: { [Op.gt]: lastId },
        },
        limit: batchSize,
        order: [['id', 'ASC']],
      });

      if (batch.length === 0) {
        break;
      }

      for (const property of batch) {
        try {
          const checkResult = await this.checkProperty(property, {
            autoRemediate: options.autoRemediate ?? false,
          });
          await property.update({
            status: checkResult.status,
            complianceNotes: checkResult.issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`),
          });

          if (checkResult.status === 'Green') {
            summary.passed += 1;
          } else {
            summary.failed += 1;
          }
        } catch (error) {
          summary.failed += 1;
          console.warn(`⚠️ Compliance recheck failed for property ${property.id}:`, (error as Error).message);
        }

        summary.checked += 1;
        lastId = property.id;

        if (maxProperties > 0 && summary.checked >= maxProperties) {
          summary.limited = true;
          break;
        }
      }

      if (summary.limited) {
        break;
      }
    }

    summary.completedAt = new Date();
    summary.durationMs = summary.completedAt.getTime() - summary.startedAt.getTime();

    console.log(
      `📋 Compliance recheck completed for ${normalizedState}: ${summary.checked} checked (${summary.passed} passed, ${summary.failed} issues)${summary.limited ? ' [limited]' : ''}`
    );

    return summary;
  }

  /**
   * Evaluate a single rule against a property
   * Now considers both property fields AND assigned contacts
   */
  private evaluateRule(
    rule: StateComplianceRule,
    property: Property,
    enhancedData?: EnhancedPropertyData,
    referenceDate?: Date
  ): { passed: boolean; currentValue?: any; valueSource?: ComplianceValueSource; sourceDetail?: FieldValueSourceDetail } {
    const resolved = this.getFieldValueWithSource(property, rule.field, enhancedData);
    const fieldValue = resolved.value;
    const ruleValue = rule.value;

    switch (rule.operator) {
      case 'required':
        return {
          passed: fieldValue !== null && fieldValue !== undefined && fieldValue !== '',
          currentValue: fieldValue,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      case 'equals':
        return {
          passed: String(fieldValue) === ruleValue,
          currentValue: fieldValue,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      case 'not_equals':
        return {
          passed: String(fieldValue) !== ruleValue,
          currentValue: fieldValue,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      case 'contains':
        return {
          passed: String(fieldValue || '').toLowerCase().includes((ruleValue || '').toLowerCase()),
          currentValue: fieldValue,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      case 'min_value':
        return {
          passed: Number(fieldValue) >= Number(ruleValue),
          currentValue: fieldValue,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      case 'max_value':
        return {
          passed: Number(fieldValue) <= Number(ruleValue),
          currentValue: fieldValue,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      case 'min_days_until':
        if (!fieldValue) {
          return {
            passed: true,
            currentValue: null,
            valueSource: resolved.source,
            sourceDetail: resolved.sourceDetail,
          }; // No date = no check needed
        }
        const daysUntil = this.getDaysUntil(fieldValue, referenceDate);
        return {
          passed: daysUntil >= Number(ruleValue),
          currentValue: `${daysUntil} days`,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      case 'max_days_until':
        if (!fieldValue) {
          return {
            passed: true,
            currentValue: null,
            valueSource: resolved.source,
            sourceDetail: resolved.sourceDetail,
          };
        }
        const maxDays = this.getDaysUntil(fieldValue, referenceDate);
        return {
          passed: maxDays <= Number(ruleValue),
          currentValue: `${maxDays} days`,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      case 'regex':
        try {
          const pattern = ruleValue || '';
          // Limit pattern length to prevent ReDoS attacks
          if (pattern.length > 500) {
            console.warn('[ComplianceService] Regex pattern too long, failing check');
            return {
              passed: false,
              currentValue: fieldValue,
              valueSource: resolved.source,
              sourceDetail: resolved.sourceDetail,
            };
          }
          const regex = new RegExp(pattern);
          return {
            passed: regex.test(String(fieldValue || '')),
            currentValue: fieldValue,
            valueSource: resolved.source,
            sourceDetail: resolved.sourceDetail,
          };
        } catch {
          return {
            passed: false,
            currentValue: fieldValue,
            valueSource: resolved.source,
            sourceDetail: resolved.sourceDetail,
          };
        }

      case 'in_list':
        const allowedValues = (ruleValue || '').split(',').map(v => v.trim().toLowerCase());
        return {
          passed: allowedValues.includes(String(fieldValue || '').toLowerCase()),
          currentValue: fieldValue,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      case 'not_in_list':
        const disallowedValues = (ruleValue || '').split(',').map(v => v.trim().toLowerCase());
        return {
          passed: !disallowedValues.includes(String(fieldValue || '').toLowerCase()),
          currentValue: fieldValue,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      case 'is_true':
        return {
          passed: fieldValue === true || fieldValue === 'true' || fieldValue === 1,
          currentValue: fieldValue,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      case 'is_false':
        return {
          passed: fieldValue === false || fieldValue === 'false' || fieldValue === 0,
          currentValue: fieldValue,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };

      default:
        console.warn(`Unknown compliance operator: ${rule.operator}`);
        return {
          passed: true,
          currentValue: fieldValue,
          valueSource: resolved.source,
          sourceDetail: resolved.sourceDetail,
        };
    }
  }

  /**
   * Get field value from property using dot notation
   * Also checks assigned contacts for certain fields
   */
  private getFieldValue(property: Property, field: string, enhancedData?: EnhancedPropertyData): any {
    return this.getFieldValueWithSource(property, field, enhancedData).value;
  }

  /**
   * Get field value from assigned contacts
   * Maps property fields to contact data when appropriate
   */
  private getContactFieldValue(field: string, enhancedData: EnhancedPropertyData): any {
    const resolution = this.getContactFieldValueWithSource(field, enhancedData);
    return resolution ? resolution.value : null;
  }

  private getFieldValueWithSource(
    property: Property,
    field: string,
    enhancedData?: EnhancedPropertyData
  ): FieldValueResolution {
    if (enhancedData?.fieldOverrides && Object.prototype.hasOwnProperty.call(enhancedData.fieldOverrides, field)) {
      return {
        value: enhancedData.fieldOverrides[field],
        source: 'ocr',
        sourceDetail: {
          documentId: enhancedData.contractOcr?.documentId,
        },
      };
    }

    if (enhancedData) {
      const contactResolution = this.getContactFieldValueWithSource(field, enhancedData);
      if (contactResolution && this.hasValue(contactResolution.value)) {
        return contactResolution;
      }
    }

    return {
      value: this.getPropertyFieldValue(property, field),
      source: 'property',
    };
  }

  private getPropertyFieldValue(property: Property, field: string): any {
    if (!field) {
      return null;
    }
    const parts = field.split('.');
    let value: any = property;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return null;
      }
      value = value.dataValues?.[part] ?? value[part];
    }

    return value;
  }

  private getContactFieldValueWithSource(
    field: string,
    enhancedData: EnhancedPropertyData
  ): FieldValueResolution | null {
    const { contacts, hasBrokerAssigned, hasAttorneyAssigned, hasSellerAssigned } = enhancedData;

    switch (field) {
      case 'brokerOnFile':
        return {
          value: hasBrokerAssigned,
          source: 'contact',
          sourceDetail: {
            role: 'broker',
            contactId: contacts.broker?.id,
          },
        };
      case 'brokerCompany':
        return {
          value: contacts.broker?.company || enhancedData.brokerCompanyFromContact,
          source: 'contact',
          sourceDetail: {
            role: 'broker',
            contactId: contacts.broker?.id,
          },
        };
      case 'brokerLicenseNumber':
        return {
          value: contacts.broker?.licenseNumber,
          source: 'contact',
          sourceDetail: {
            role: 'broker',
            contactId: contacts.broker?.id,
          },
        };
      case 'brokerEmail':
        return {
          value: contacts.broker?.email,
          source: 'contact',
          sourceDetail: {
            role: 'broker',
            contactId: contacts.broker?.id,
          },
        };
      case 'brokerPhone':
        return {
          value: contacts.broker?.phone,
          source: 'contact',
          sourceDetail: {
            role: 'broker',
            contactId: contacts.broker?.id,
          },
        };
      case 'hasAttorney':
      case 'attorneyOnFile':
        return {
          value: hasAttorneyAssigned,
          source: 'contact',
          sourceDetail: {
            role: 'attorney',
            contactId: contacts.attorney?.id,
          },
        };
      case 'attorneyName':
        return {
          value: contacts.attorney?.name,
          source: 'contact',
          sourceDetail: {
            role: 'attorney',
            contactId: contacts.attorney?.id,
          },
        };
      case 'attorneyEmail':
        return {
          value: contacts.attorney?.email,
          source: 'contact',
          sourceDetail: {
            role: 'attorney',
            contactId: contacts.attorney?.id,
          },
        };
      case 'hasSellerContact':
      case 'sellerOnFile':
        return {
          value: hasSellerAssigned,
          source: 'contact',
          sourceDetail: {
            role: 'seller',
            contactId: contacts.seller?.id,
          },
        };
      case 'sellerName':
        return {
          value: contacts.seller?.name,
          source: 'contact',
          sourceDetail: {
            role: 'seller',
            contactId: contacts.seller?.id,
          },
        };
      case 'sellerEmail':
        return {
          value: contacts.seller?.email,
          source: 'contact',
          sourceDetail: {
            role: 'seller',
            contactId: contacts.seller?.id,
          },
        };
      case 'agentLicenseNumber':
        return {
          value: contacts.agent?.licenseNumber || contacts.re_agent?.licenseNumber,
          source: 'contact',
          sourceDetail: {
            role: contacts.agent ? 'agent' : 're_agent',
            contactId: contacts.agent?.id || contacts.re_agent?.id,
          },
        };
      case 'agentEmail':
        return {
          value: contacts.agent?.email || contacts.re_agent?.email,
          source: 'contact',
          sourceDetail: {
            role: contacts.agent ? 'agent' : 're_agent',
            contactId: contacts.agent?.id || contacts.re_agent?.id,
          },
        };
      case 'agentName':
        return {
          value: contacts.agent?.name || contacts.re_agent?.name,
          source: 'contact',
          sourceDetail: {
            role: contacts.agent ? 'agent' : 're_agent',
            contactId: contacts.agent?.id || contacts.re_agent?.id,
          },
        };
      case 'wholesalerLlcName':
        return {
          value: contacts.wholesaler?.company,
          source: 'contact',
          sourceDetail: {
            role: 'wholesaler',
            contactId: contacts.wholesaler?.id,
          },
        };
      case 'llcOwnerEmail':
        return {
          value: contacts.wholesaler?.email,
          source: 'contact',
          sourceDetail: {
            role: 'wholesaler',
            contactId: contacts.wholesaler?.id,
          },
        };
      case 'buyerName':
        return {
          value: contacts.buyer?.name,
          source: 'contact',
          sourceDetail: {
            role: 'buyer',
            contactId: contacts.buyer?.id,
          },
        };
      case 'buyerEmail':
        return {
          value: contacts.buyer?.email,
          source: 'contact',
          sourceDetail: {
            role: 'buyer',
            contactId: contacts.buyer?.id,
          },
        };
      case 'buyerPhone':
        return {
          value: contacts.buyer?.phone,
          source: 'contact',
          sourceDetail: {
            role: 'buyer',
            contactId: contacts.buyer?.id,
          },
        };
      default:
        return null;
    }
  }

  private getMissingEvidence(
    rule: StateComplianceRule,
    enhancedData?: EnhancedPropertyData
  ): NonNullable<StateComplianceRule['evidenceRequirements']> {
    const requirements = rule.evidenceRequirements || [];
    if (requirements.length === 0 || !enhancedData) {
      return [];
    }

    const missing: NonNullable<StateComplianceRule['evidenceRequirements']> = [];

    for (const requirement of requirements) {
      if (requirement.type === 'document') {
        const requiredStatus = requirement.status;
        const matches = enhancedData.documents.some((doc) => {
          if (doc.documentType !== requirement.documentType) return false;
          if (requiredStatus && doc.status !== requiredStatus) return false;
          return true;
        });
        if (!matches) {
          missing.push(requirement);
        }
        continue;
      }

      if (requirement.type === 'contact') {
        const role = requirement.role as keyof EnhancedPropertyData['contacts'];
        const contact = enhancedData.contacts[role];
        if (!contact) {
          missing.push(requirement);
          continue;
        }
        if (requirement.field) {
          const fieldValue = (contact as any)[requirement.field] ?? contact.metadata?.[requirement.field];
          if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
            missing.push(requirement);
          }
        }
      }
    }

    return missing;
  }

  private describeEvidenceRequirement(
    requirement: NonNullable<StateComplianceRule['evidenceRequirements']>[number]
  ): string {
    if (requirement.type === 'document') {
      return requirement.status
        ? `document:${requirement.documentType} (${requirement.status})`
        : `document:${requirement.documentType}`;
    }

    if (requirement.type === 'contact') {
      return requirement.field
        ? `contact:${requirement.role}.${requirement.field}`
        : `contact:${requirement.role}`;
    }

    return 'evidence';
  }

  private createIssueId(issue: Pick<ComplianceIssue, 'ruleId' | 'field' | 'message' | 'expectedValue'>): string {
    const base = `${issue.ruleId}|${issue.field}|${issue.message}|${issue.expectedValue || ''}`;
    return createHash('sha256').update(base).digest('hex').substring(0, 16);
  }

  private buildIssueLinks(
    property: Property,
    issue: ComplianceIssue,
    sourceDetail?: FieldValueSourceDetail
  ): Record<string, string> {
    if (!property.id) {
      return {};
    }

    const links: Record<string, string> = {
      property: `/api/listings/${property.id}`,
      documents: `/api/listings/${property.id}/documents`,
      contacts: `/api/listings/${property.id}/contacts`,
    };

    if (issue.field.startsWith('document:')) {
      links.documentRequirements = `/api/compliance/documents/${property.id}/requirements`;
    }

    if (sourceDetail?.contactId) {
      links.contact = `/api/contacts/${sourceDetail.contactId}`;
    }

    if (sourceDetail?.documentId) {
      links.document = `/api/documents/${sourceDetail.documentId}`;
    }

    return links;
  }

  private finalizeIssue(
    issue: ComplianceIssue,
    property: Property,
    sourceDetail?: FieldValueSourceDetail
  ): ComplianceIssue {
    issue.issueId = this.createIssueId(issue);
    issue.links = this.buildIssueLinks(property, issue, sourceDetail);
    return issue;
  }

  private buildRemediationPlan(
    issues: ComplianceIssue[],
    rules: StateComplianceRule[]
  ): ComplianceRemediationPlan {
    const actionsByKey = new Map<string, ComplianceRemediationAction>();

    for (const issue of issues) {
      const rule = rules.find(r => r.id === issue.ruleId);
      const issueActions = this.mapIssueToActions(issue, rule);

      for (const action of issueActions) {
        const key = `${action.action}:${action.field}:${action.message}`;
        const existing = actionsByKey.get(key);
        if (!existing) {
          actionsByKey.set(key, action);
        } else {
          const severityRank = this.getSeverityRank(action.severity);
          if (severityRank > this.getSeverityRank(existing.severity)) {
            actionsByKey.set(key, action);
          }
        }
      }
    }

    const actions = Array.from(actionsByKey.values());
    const summary = actions.reduce(
      (acc, action) => {
        acc.total += 1;
        if (action.severity === 'critical') acc.critical += 1;
        else if (action.severity === 'warning') acc.warning += 1;
        else acc.info += 1;
        return acc;
      },
      { total: 0, critical: 0, warning: 0, info: 0 }
    );

    return { actions, summary };
  }

  private mapIssueToActions(
    issue: ComplianceIssue,
    rule?: StateComplianceRule
  ): ComplianceRemediationAction[] {
    if (issue.category === 'documents' || issue.field.startsWith('document:')) {
      return [
        {
          ruleId: issue.ruleId,
          field: issue.field,
          severity: issue.severity,
          action: 'attach_document',
          message: issue.message,
          evidenceRequirements: issue.evidenceRequirements,
        },
      ];
    }

    if (issue.missingEvidence && issue.missingEvidence.length > 0) {
      return issue.missingEvidence.map((requirement) => {
        if (requirement.type === 'document') {
          return {
            ruleId: issue.ruleId,
            field: `document:${requirement.documentType}`,
            severity: issue.severity,
            action: 'attach_document',
            message: `Upload ${requirement.documentType} document${requirement.status ? ` (${requirement.status})` : ''}`,
            evidenceRequirements: issue.evidenceRequirements,
          };
        }

        return {
          ruleId: issue.ruleId,
          field: `contact:${requirement.role}`,
          severity: issue.severity,
          action: 'assign_contact',
          message: requirement.field
            ? `Provide ${requirement.field} for ${requirement.role}`
            : `Assign ${requirement.role} contact`,
          evidenceRequirements: issue.evidenceRequirements,
        };
      });
    }

    const contactRole = this.mapFieldToContactRole(issue.field);
    if (contactRole) {
      return [
        {
          ruleId: issue.ruleId,
          field: `contact:${contactRole}`,
          severity: issue.severity,
          action: 'assign_contact',
          message: `Assign ${contactRole} contact`,
        },
      ];
    }

    if (!rule) {
      return [
        {
          ruleId: issue.ruleId,
          field: issue.field,
          severity: issue.severity,
          action: 'update_field',
          message: issue.message,
        },
      ];
    }

    switch (rule.operator) {
      case 'required':
        return [
          {
            ruleId: issue.ruleId,
            field: issue.field,
            severity: issue.severity,
            action: 'provide_field',
            message: `Provide ${issue.field}`,
          },
        ];
      case 'is_true':
        return [
          {
            ruleId: issue.ruleId,
            field: issue.field,
            severity: issue.severity,
            action: 'set_true',
            message: `Set ${issue.field} to true`,
          },
        ];
      case 'is_false':
        return [
          {
            ruleId: issue.ruleId,
            field: issue.field,
            severity: issue.severity,
            action: 'set_false',
            message: `Set ${issue.field} to false`,
          },
        ];
      case 'min_days_until':
      case 'max_days_until':
        return [
          {
            ruleId: issue.ruleId,
            field: issue.field,
            severity: issue.severity,
            action: 'extend_date',
            message: `Adjust ${issue.field} date to meet required window`,
          },
        ];
      case 'in_list':
      case 'not_in_list':
        return [
          {
            ruleId: issue.ruleId,
            field: issue.field,
            severity: issue.severity,
            action: 'update_list',
            message: `Update ${issue.field} to meet allowed list`,
          },
        ];
      case 'min_value':
      case 'max_value':
      case 'equals':
      case 'not_equals':
      case 'contains':
      case 'regex':
      default:
        return [
          {
            ruleId: issue.ruleId,
            field: issue.field,
            severity: issue.severity,
            action: 'update_field',
            message: `Update ${issue.field} to satisfy ${rule.operator} rule`,
          },
        ];
    }
  }

  private getSeverityRank(severity: ComplianceSeverity): number {
    switch (severity) {
      case 'critical':
        return 3;
      case 'warning':
        return 2;
      default:
        return 1;
    }
  }

  /**
   * Calculate days until a date
   */
  private getDaysUntil(date: Date | string, referenceDate?: Date): number {
    const targetDate = new Date(date);
    const now = referenceDate ? new Date(referenceDate) : new Date();
    const diffTime = targetDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private normalizeSnapshotValue(value: any): any {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map(item => this.normalizeSnapshotValue(item));
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value).map(([key, val]) => [key, this.normalizeSnapshotValue(val)]);
      return Object.fromEntries(entries);
    }
    return value;
  }

  private createPropertySnapshot(
    property: Property,
    rules: StateComplianceRule[],
    enhancedData?: EnhancedPropertyData
  ): Record<string, any> {
    const baseSnapshot = {
      propertyId: property.id,
      state: property.state,
      address: property.address,
      city: property.city,
      zip: property.zip,
      county: property.county,
      propertyType: property.propertyType,
      bedrooms: property.bedroomCount,
      bathrooms: property.bathroomCount,
      sqft: property.livingSpaceSqFt,
      yearBuilt: property.yearBuilt,
      askingPrice: property.mlsListingPrice || property.reservePrice || property.buyItNowPrice,
      arv: property.arv,
      rehabCost: property.rehabCost,
      assignable: property.assignable,
      marketingClauseFound: property.marketingClauseFound,
      brokerOnFile: property.brokerOnFile,
      purchaseContractExpiration: property.purchaseContractExpiration,
    };

    const ruleInputs: Record<string, any> = {};
    for (const rule of rules) {
      ruleInputs[rule.field] = this.normalizeSnapshotValue(
        this.getFieldValue(property, rule.field, enhancedData)
      );
    }

    const sortedRuleInputs = Object.fromEntries(
      Object.entries(ruleInputs).sort(([a], [b]) => a.localeCompare(b))
    );

    return {
      ...this.normalizeSnapshotValue(baseSnapshot),
      ruleInputs: sortedRuleInputs,
    };
  }

  private createEvidenceSnapshot(
    enhancedData?: EnhancedPropertyData,
    fieldQuality?: Record<string, FieldQualityInfo>
  ): Record<string, any> {
    if (!enhancedData) return {};

    const contactEvidence: Record<string, any> = {};
    for (const [role, contact] of Object.entries(enhancedData.contacts)) {
      if (!contact) continue;
      contactEvidence[role] = {
        id: contact.id,
        licenseNumber: contact.licenseNumber,
        licenseState: contact.licenseState,
        updatedAt: contact.updatedAt,
      };
    }

    const documents = enhancedData.documents.map(doc => ({
      id: doc.id,
      documentType: doc.documentType,
      status: doc.status,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      updatedAt: doc.updatedAt,
    }));

    const snapshot: Record<string, any> = {
      contacts: this.normalizeSnapshotValue(contactEvidence),
      documents: this.normalizeSnapshotValue(documents),
    };

    if (enhancedData.contractOcr) {
      snapshot.contractOcr = this.normalizeSnapshotValue({
        success: enhancedData.contractOcr.success,
        confidence: enhancedData.contractOcr.confidence,
        extractedFields: enhancedData.contractOcr.extractedFields,
        fieldEvidence: enhancedData.contractOcr.fieldEvidence,
        pageCount: enhancedData.contractOcr.pageCount,
        processedAt: enhancedData.contractOcr.processedAt,
        documentId: enhancedData.contractOcr.documentId,
        documentUpdatedAt: enhancedData.contractOcr.documentUpdatedAt,
        source: enhancedData.contractOcr.source,
        model: enhancedData.contractOcr.model,
        error: enhancedData.contractOcr.error,
      });
    }

    if (fieldQuality && Object.keys(fieldQuality).length > 0) {
      snapshot.fieldQuality = this.normalizeSnapshotValue(fieldQuality);
    }

    return snapshot;
  }

  private generateSnapshotHash(snapshot: Record<string, any>): string {
    return createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Create a snapshot of rules for audit trail
   */
  private createRuleSnapshot(rules: StateComplianceRule[]): RuleSnapshot[] {
    return rules.map(r => ({
      id: r.id,
      name: r.name,
      state: r.state,
      category: r.category,
      field: r.field,
      operator: r.operator,
      value: r.value,
      severity: r.severity,
      message: r.message,
      enabled: r.enabled,
      order: r.order,
      evidenceRequirements: r.evidenceRequirements,
      evidenceSeverity: r.evidenceSeverity,
      severityOverrides: r.severityOverrides,
      validFrom: r.validFrom,
      validTo: r.validTo,
      county: r.county,
    }));
  }

  /**
   * Generate a hash of the rule snapshot for quick comparison
   */
  private generateRuleVersionHash(snapshot: RuleSnapshot[]): string {
    return createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Persist compliance check results for audit/history.
   * Now includes rule snapshot for full audit trail.
   */
  private async saveCheckResult(
    property: Property,
    result: ComplianceCheckResult,
    rules?: StateComplianceRule[],
    enhancedData?: EnhancedPropertyData,
    snapshots?: {
      ruleSnapshot?: RuleSnapshot[];
      ruleVersionHash?: string;
      propertySnapshot?: Record<string, any>;
      evidenceSnapshot?: Record<string, any>;
    }
  ): Promise<number | undefined> {
    if (!property.id) {
      return undefined;
    }

    try {
      // Create rule snapshot for audit trail
      const ruleSnapshot = snapshots?.ruleSnapshot || (rules ? this.createRuleSnapshot(rules) : undefined);
      const ruleVersionHash = snapshots?.ruleVersionHash ||
        (ruleSnapshot ? this.generateRuleVersionHash(ruleSnapshot) : undefined);

      const propertySnapshot = snapshots?.propertySnapshot || (rules
        ? this.createPropertySnapshot(property, rules, enhancedData)
        : this.normalizeSnapshotValue({
            propertyId: property.id,
            state: property.state,
          }));
      const propertySnapshotHash = this.generateSnapshotHash(propertySnapshot);
      const evidenceSnapshot = snapshots?.evidenceSnapshot || this.createEvidenceSnapshot(enhancedData);
      const evidenceHash = this.generateSnapshotHash(evidenceSnapshot);
      const compliancePassportHash = this.generateSnapshotHash({
        ruleVersionHash,
        propertySnapshotHash,
        evidenceHash,
        checkedAt: result.checkedAt.toISOString(),
      });

      const saved = await ComplianceCheck.create({
        propertyId: property.id,
        status: result.status,
        state: result.state,
        totalRules: result.totalRules,
        passedRules: result.passedRules,
        failedRules: result.failedRules,
        issues: result.issues,
        passedChecks: result.passedChecks,
        checkedAt: result.checkedAt,
        propertySnapshot,
        propertySnapshotHash,
        evidenceSnapshot,
        evidenceHash,
        compliancePassportHash,
        ruleSnapshot,
        ruleVersionHash,
        rulesEvaluated: rules?.length || result.totalRules,
      });

      console.log(`📋 Compliance check saved (ID: ${saved.id}) with passport hash: ${compliancePassportHash || 'none'}`);

      // Log activity feed event based on result status
      const activityType = result.status === 'Red' ? 'compliance_check_failed' : 'compliance_check_passed';
      activityFeedService.logComplianceActivity(
        activityType,
        String(saved.id),
        property.propertyId || `Property ${property.id}`,
        {
          id: 'system',
          name: 'Compliance System',
          type: 'system',
        },
        {
          propertyId: property.id,
          status: result.status,
          state: result.state,
          totalRules: result.totalRules,
          passedRules: result.passedRules,
          failedRules: result.failedRules,
          issueCount: result.issues.length,
        }
      ).catch(err => console.warn('Activity logging failed:', err.message));

      return saved.id;
    } catch (error) {
      console.warn('Failed to save compliance check:', (error as Error).message);
      return undefined;
    }
  }

  /**
   * Get the rule snapshot from a historical compliance check
   */
  async getRulesAtCheckTime(checkId: number): Promise<RuleSnapshot[]> {
    const check = await ComplianceCheck.findByPk(checkId);
    if (!check) {
      throw new Error(`Compliance check ${checkId} not found`);
    }
    return check.getRulesAtCheckTime();
  }

  /**
   * Verify if rules have changed since a check was performed
   */
  async verifyRulesUnchanged(checkId: number): Promise<{
    unchanged: boolean;
    checkHash?: string;
    currentHash?: string;
  }> {
    const check = await ComplianceCheck.findByPk(checkId);
    if (!check) {
      throw new Error(`Compliance check ${checkId} not found`);
    }

    if (!check.ruleVersionHash) {
      return { unchanged: true };
    }

    const currentRules = await StateComplianceRule.getRulesForState(check.state);
    const currentSnapshot = this.createRuleSnapshot(currentRules);
    const currentHash = this.generateRuleVersionHash(currentSnapshot);

    return {
      unchanged: currentHash === check.ruleVersionHash,
      checkHash: check.ruleVersionHash,
      currentHash,
    };
  }

  /**
   * Get compliance summary for multiple properties
   */
  async getComplianceSummary(
    propertyIds: number[]
  ): Promise<{
    total: number;
    green: number;
    yellow: number;
    red: number;
    byState: Record<string, { green: number; yellow: number; red: number }>;
  }> {
    const properties = await Property.findAll({
      where: { id: propertyIds },
    });

    const summary = {
      total: properties.length,
      green: 0,
      yellow: 0,
      red: 0,
      byState: {} as Record<string, { green: number; yellow: number; red: number }>,
    };

    for (const property of properties) {
      const result = await this.checkProperty(property, { autoRemediate: false });
      const state = property.state || 'Unknown';

      // Update totals
      if (result.status === 'Green') summary.green++;
      else if (result.status === 'Yellow') summary.yellow++;
      else summary.red++;

      // Update by state
      if (!summary.byState[state]) {
        summary.byState[state] = { green: 0, yellow: 0, red: 0 };
      }
      if (result.status === 'Green') summary.byState[state].green++;
      else if (result.status === 'Yellow') summary.byState[state].yellow++;
      else summary.byState[state].red++;
    }

    return summary;
  }

  /**
   * Get all states with configured rules
   */
  async getConfiguredStates(): Promise<string[]> {
    return StateComplianceRule.getStatesWithRules();
  }

  /**
   * Seed default compliance rules
   */
  async seedDefaultRules(): Promise<void> {
    await StateComplianceRule.seedDefaultRules();
  }

  /**
   * Check document requirements for a property
   * Returns required documents and their completion status
   */
  async checkDocumentRequirements(
    property: Property,
    transactionType: 'wholesaling' | 'retail' | 'all' = 'wholesaling'
  ): Promise<{
    requirements: DocumentRequirement[];
    summary: {
      total: number;
      completed: number;
      pending: number;
      missing: number;
    };
    allSatisfied: boolean;
  }> {
    const state = property.state?.toUpperCase() || 'ALL';

    // Get required document templates for this state
    const requiredTemplates = await StateDocumentTemplate.getRequiredTemplates(state, transactionType);

    if (requiredTemplates.length === 0) {
      return {
        requirements: [],
        summary: { total: 0, completed: 0, pending: 0, missing: 0 },
        allSatisfied: true,
      };
    }

    // Get all DocuSeal submissions for this property
    let submissions: DocuSealSubmission[] = [];
    try {
      submissions = await DocuSealSubmission.findByPropertyId(property.id);
    } catch (error) {
      console.warn(
        `⚠️ Failed to load DocuSeal submissions for property ${property.id}:`,
        (error as Error).message
      );
      submissions = [];
    }

    // Map submissions by template ID and document category for quick lookup
    const submissionsByTemplate = new Map<number, DocuSealSubmission>();
    const submissionsByCategory = new Map<string, DocuSealSubmission>();

    for (const submission of submissions) {
      // Track by template ID (most specific)
      if (!submissionsByTemplate.has(submission.templateId) ||
          this.getSubmissionPriority(submission.status) > this.getSubmissionPriority(submissionsByTemplate.get(submission.templateId)!.status)) {
        submissionsByTemplate.set(submission.templateId, submission);
      }
      // Track by document category (fallback)
      if (submission.documentCategory) {
        if (!submissionsByCategory.has(submission.documentCategory) ||
            this.getSubmissionPriority(submission.status) > this.getSubmissionPriority(submissionsByCategory.get(submission.documentCategory)!.status)) {
          submissionsByCategory.set(submission.documentCategory, submission);
        }
      }
    }

    // Build requirements list
    const requirements: DocumentRequirement[] = [];
    let completed = 0;
    let pending = 0;
    let missing = 0;

    for (const template of requiredTemplates) {
      // Check if we have a submission for this template
      const submission = submissionsByTemplate.get(template.docuSealTemplateId) ||
                         submissionsByCategory.get(template.category);

      let status: DocumentRequirementStatus;
      let submissionDetails: DocumentSubmissionDetails | undefined;

      if (submission) {
        submissionDetails = {
          submissionId: submission.docuSealSubmissionId,
          status: submission.status,
          sentAt: submission.sentAt,
          completedAt: submission.completedAt,
          submitters: submission.submitters,
        };

        if (submission.status === 'completed') {
          status = 'completed';
          completed++;
        } else if (['pending', 'sent', 'viewed', 'partially_signed'].includes(submission.status)) {
          status = 'pending';
          pending++;
        } else {
          // declined, expired, archived - treat as needing resend
          status = 'needs_resend';
          missing++;
        }
      } else {
        status = 'missing';
        missing++;
      }

      requirements.push({
        templateId: template.id,
        docuSealTemplateId: template.docuSealTemplateId,
        category: template.category,
        name: template.name,
        description: template.description,
        required: true,
        priority: template.priority,
        status,
        submission: submissionDetails,
      });
    }

    // Sort by priority (highest first) and then by status (missing first)
    requirements.sort((a, b) => {
      const statusOrder = { missing: 0, needs_resend: 1, pending: 2, completed: 3 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return b.priority - a.priority;
    });

    return {
      requirements,
      summary: {
        total: requirements.length,
        completed,
        pending,
        missing,
      },
      allSatisfied: missing === 0 && pending === 0,
    };
  }

  /**
   * Get priority for submission status (higher = better)
   */
  private getSubmissionPriority(status: string): number {
    const priorities: Record<string, number> = {
      completed: 100,
      partially_signed: 80,
      viewed: 60,
      sent: 40,
      pending: 20,
      declined: 5,
      expired: 4,
      archived: 3,
    };
    return priorities[status] || 0;
  }

  /**
   * Add document-related compliance issues to a compliance check
   * Call this from checkProperty to include document requirements
   */
  async getDocumentComplianceIssues(
    property: Property,
    transactionType: 'wholesaling' | 'retail' | 'all' = 'wholesaling'
  ): Promise<ComplianceIssue[]> {
    const docCheck = await this.checkDocumentRequirements(property, transactionType);
    const issues: ComplianceIssue[] = [];

    for (const req of docCheck.requirements) {
      const sourceDetail: FieldValueSourceDetail = {
        templateId: req.templateId,
        docuSealTemplateId: req.docuSealTemplateId,
        submissionId: req.submission?.submissionId,
      };

      if (req.status === 'missing') {
        const issue: ComplianceIssue = {
          ruleId: 0, // Virtual rule for document requirements
          ruleName: `Required Document: ${req.name}`,
          category: 'documents',
          field: `document:${req.category}`,
          severity: 'critical',
          baseSeverity: 'critical',
          message: `Missing required document: ${req.name}`,
          currentValue: null,
          expectedValue: 'signed document',
          valueSource: 'document',
          sourceDetail,
        };
        issues.push(this.finalizeIssue(issue, property, sourceDetail));
      } else if (req.status === 'needs_resend') {
        const issue: ComplianceIssue = {
          ruleId: 0,
          ruleName: `Document Needs Resend: ${req.name}`,
          category: 'documents',
          field: `document:${req.category}`,
          severity: 'critical',
          baseSeverity: 'critical',
          message: `Document "${req.name}" was ${req.submission?.status} and needs to be resent`,
          currentValue: req.submission?.status,
          expectedValue: 'completed',
          valueSource: 'document',
          sourceDetail,
        };
        issues.push(this.finalizeIssue(issue, property, sourceDetail));
      } else if (req.status === 'pending') {
        const issue: ComplianceIssue = {
          ruleId: 0,
          ruleName: `Document Pending: ${req.name}`,
          category: 'documents',
          field: `document:${req.category}`,
          severity: 'critical',
          baseSeverity: 'critical',
          message: `Document "${req.name}" is ${req.submission?.status} - awaiting signature`,
          currentValue: req.submission?.status,
          expectedValue: 'completed',
          valueSource: 'document',
          sourceDetail,
        };
        issues.push(this.finalizeIssue(issue, property, sourceDetail));
      }
    }

    return issues;
  }

  /**
   * Get document requirements for a state (without a specific property)
   * Useful for displaying what documents are needed
   */
  async getDocumentRequirementsForState(
    state: string,
    transactionType: 'wholesaling' | 'retail' | 'all' = 'wholesaling'
  ): Promise<StateDocumentTemplate[]> {
    return StateDocumentTemplate.getRequiredTemplates(state.toUpperCase(), transactionType);
  }
}

// Type definitions for document requirements
export interface DocumentRequirement {
  templateId: number;
  docuSealTemplateId: number;
  category: string;
  name: string;
  description?: string;
  required: boolean;
  priority: number;
  status: DocumentRequirementStatus;
  submission?: DocumentSubmissionDetails;
}

export type DocumentRequirementStatus = 'missing' | 'pending' | 'completed' | 'needs_resend';

export interface DocumentSubmissionDetails {
  submissionId: number;
  status: string;
  sentAt?: Date;
  completedAt?: Date;
  submitters?: Array<{
    email: string;
    name?: string;
    status: string;
    completedAt?: string;
  }>;
}

export const complianceService = new ComplianceService();
export default complianceService;
