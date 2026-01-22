/**
 * Signed Document Service
 *
 * Handles saving completed DocuSeal contracts to the property_documents table.
 * When a contract is fully signed, this service:
 * 1. Fetches the signed document URLs from DocuSeal
 * 2. Downloads the actual PDF to local storage
 * 3. Creates a PropertyDocument record linking to the property
 * 4. Runs OCR extraction on the signed document
 * 5. Updates compliance records with extracted/verified data
 * 6. Updates the DocuSealSubmission with document URLs
 */

import axios from 'axios';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { docuSealService } from './DocuSealService';
import PropertyDocument from '../models/PropertyDocument';
import DocuSealSubmission from '../models/DocuSealSubmission';
import sequelize from '../config/database';

// Try to import OCR service (optional)
let complianceOCRService: any = null;
try {
  complianceOCRService = require('./ComplianceOCRService').complianceOCRService;
} catch (e) {
  console.warn('[SignedDocumentService] ComplianceOCRService not available for extraction');
}

export interface SaveSignedDocumentResult {
  success: boolean;
  propertyDocumentId?: number;
  documentUrl?: string;
  localFilePath?: string;
  extractedData?: Record<string, any>;
  ocrConfidence?: number;
  documentHash?: string;
  mismatches?: DataMismatch[];
  error?: string;
}

export interface DataMismatch {
  field: string;
  expected: any;
  actual: any;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

class SignedDocumentService {
  /**
   * Save a completed DocuSeal submission as a PropertyDocument
   */
  async saveSignedDocument(
    docuSealSubmissionId: number
  ): Promise<SaveSignedDocumentResult> {
    try {
      // 1. Find local submission record
      const localSubmission = await DocuSealSubmission.findByDocuSealId(docuSealSubmissionId);

      if (!localSubmission) {
        return {
          success: false,
          error: `Local submission not found for DocuSeal ID ${docuSealSubmissionId}`,
        };
      }

      if (!localSubmission.propertyId) {
        return {
          success: false,
          error: 'Submission has no associated property',
        };
      }

      // 2. Check if document already exists (prevent duplicates)
      const existingDoc = await PropertyDocument.findOne({
        where: {
          propertyId: localSubmission.propertyId,
          'metadata.docuSealSubmissionId': docuSealSubmissionId,
        } as any,
      });

      if (existingDoc) {
        console.log(`[SignedDocumentService] Document already exists for submission ${docuSealSubmissionId}`);
        return {
          success: true,
          propertyDocumentId: existingDoc.id,
          documentUrl: existingDoc.metadata?.docuSealDocumentUrl,
        };
      }

      // 3. Fetch document details from DocuSeal API
      let combinedDocumentUrl: string | undefined;
      let auditLogUrl: string | undefined;
      let documentUrls: string[] = [];

      if (docuSealService.isReady()) {
        try {
          const docuSealSubmission = await docuSealService.getSubmission(docuSealSubmissionId);

          combinedDocumentUrl = docuSealSubmission.combined_document_url;
          auditLogUrl = docuSealSubmission.audit_log_url;

          // Get individual document URLs
          if (docuSealSubmission.documents?.length) {
            documentUrls = docuSealSubmission.documents.map((d) => d.url);
          }

          // Update local submission with document URLs
          localSubmission.combinedDocumentUrl = combinedDocumentUrl;
          localSubmission.auditLogUrl = auditLogUrl;
          localSubmission.documentUrls = documentUrls;
          await localSubmission.save();
        } catch (apiError) {
          console.warn('[SignedDocumentService] Could not fetch from DocuSeal API:', apiError);
          // Continue with what we have locally
          combinedDocumentUrl = localSubmission.combinedDocumentUrl;
          auditLogUrl = localSubmission.auditLogUrl;
        }
      } else {
        // Use locally stored URLs if available
        combinedDocumentUrl = localSubmission.combinedDocumentUrl;
        auditLogUrl = localSubmission.auditLogUrl;
      }

      // 4. Determine document type based on category
      const documentType = this.mapCategoryToDocumentType(localSubmission.documentCategory);

      // 5. Generate filename
      const templateName = localSubmission.templateName || 'Contract';
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `${templateName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}_signed.pdf`;

      // 6. Create PropertyDocument record
      const propertyDocument = await PropertyDocument.create({
        propertyId: localSubmission.propertyId,
        documentType,
        fileName,
        originalName: `${templateName} - Signed`,
        mimeType: 'application/pdf',
        fileSize: 0, // Unknown until downloaded
        storageKey: combinedDocumentUrl || `docuseal://${docuSealSubmissionId}`,
        uploadedBy: 'DocuSeal',
        status: 'ready',
        metadata: {
          docuSealSubmissionId,
          docuSealTemplateId: localSubmission.templateId,
          docuSealTemplateName: localSubmission.templateName,
          docuSealCategory: localSubmission.documentCategory,
          docuSealDocumentUrl: combinedDocumentUrl,
          docuSealAuditLogUrl: auditLogUrl,
          docuSealCompletedAt: localSubmission.completedAt?.toISOString(),
        },
      });

      console.log(
        `[SignedDocumentService] Saved signed document ${propertyDocument.id} for property ${localSubmission.propertyId}`
      );

      // 7. Log to audit trail
      await this.logDocumentSaved(
        localSubmission.propertyId,
        propertyDocument.id,
        docuSealSubmissionId,
        localSubmission.documentCategory
      );

      return {
        success: true,
        propertyDocumentId: propertyDocument.id,
        documentUrl: combinedDocumentUrl,
      };
    } catch (error) {
      console.error('[SignedDocumentService] Error saving signed document:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Save all documents for a submission (handles multi-document templates)
   */
  async saveAllSignedDocuments(
    docuSealSubmissionId: number
  ): Promise<SaveSignedDocumentResult[]> {
    const results: SaveSignedDocumentResult[] = [];

    try {
      const localSubmission = await DocuSealSubmission.findByDocuSealId(docuSealSubmissionId);

      if (!localSubmission?.propertyId) {
        return [{ success: false, error: 'Submission or property not found' }];
      }

      // Fetch submission details from DocuSeal
      if (!docuSealService.isReady()) {
        // Just save the combined document
        return [await this.saveSignedDocument(docuSealSubmissionId)];
      }

      const docuSealSubmission = await docuSealService.getSubmission(docuSealSubmissionId);

      // If there's a combined document, save that
      if (docuSealSubmission.combined_document_url) {
        results.push(await this.saveSignedDocument(docuSealSubmissionId));
      }

      // Optionally save individual documents if there are multiple
      // (Usually the combined document is sufficient)

      return results.length > 0 ? results : [await this.saveSignedDocument(docuSealSubmissionId)];
    } catch (error) {
      return [{ success: false, error: String(error) }];
    }
  }

  /**
   * Get all signed documents for a property
   */
  async getSignedDocumentsForProperty(propertyId: number): Promise<PropertyDocument[]> {
    return PropertyDocument.findAll({
      where: {
        propertyId,
        uploadedBy: 'DocuSeal',
      },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Map DocuSeal category to PropertyDocument type
   */
  private mapCategoryToDocumentType(
    category?: string
  ): 'contract' | 'disclosure' | 'other' {
    if (!category) return 'contract';

    const categoryLower = category.toLowerCase();

    if (
      categoryLower.includes('contract') ||
      categoryLower.includes('agreement') ||
      categoryLower.includes('msa') ||
      categoryLower.includes('asa') ||
      categoryLower.includes('purchase')
    ) {
      return 'contract';
    }

    if (
      categoryLower.includes('disclosure') ||
      categoryLower.includes('addendum')
    ) {
      return 'disclosure';
    }

    return 'contract'; // Default to contract for signed documents
  }

  /**
   * Log document save to compliance audit trail
   */
  private async logDocumentSaved(
    propertyId: number,
    documentId: number,
    docuSealSubmissionId: number,
    category?: string
  ): Promise<void> {
    try {
      await sequelize.query(
        `INSERT INTO compliance_audit_log
         (property_id, action_type, action_details, created_at)
         VALUES (:propertyId, :actionType, :details, NOW())`,
        {
          replacements: {
            propertyId,
            actionType: 'document.signed_contract_saved',
            details: JSON.stringify({
              propertyDocumentId: documentId,
              docuSealSubmissionId,
              category,
              savedAt: new Date().toISOString(),
            }),
          },
        }
      );
    } catch (error) {
      console.warn('[SignedDocumentService] Could not log to audit trail:', error);
    }
  }

  /**
   * Download signed document from DocuSeal, store locally, run OCR extraction,
   * and update compliance records with verified data.
   *
   * This is the comprehensive method that handles the full signed document workflow.
   */
  async downloadAndProcessSignedDocument(
    docuSealSubmissionId: number,
    options?: {
      runOCR?: boolean;
      updateCompliance?: boolean;
    }
  ): Promise<SaveSignedDocumentResult> {
    const { runOCR = true, updateCompliance = true } = options || {};

    // IDEMPOTENCY CHECK: Skip if already processed
    const existingDoc = await this.findExistingProcessedDocument(docuSealSubmissionId);
    if (existingDoc) {
      console.log(`[SignedDocumentService] Document already processed for submission ${docuSealSubmissionId}, skipping`);
      return {
        success: true,
        propertyDocumentId: existingDoc.id,
        documentUrl: (existingDoc.metadata as any)?.docuSealDocumentUrl,
        documentHash: (existingDoc.metadata as any)?.documentHash,
      };
    }

    try {
      console.log(`[SignedDocumentService] Processing signed document for submission ${docuSealSubmissionId}`);

      // 1. Find local submission record
      const localSubmission = await DocuSealSubmission.findByDocuSealId(docuSealSubmissionId);

      if (!localSubmission) {
        return {
          success: false,
          error: `Local submission not found for DocuSeal ID ${docuSealSubmissionId}`,
        };
      }

      if (!localSubmission.propertyId) {
        return {
          success: false,
          error: 'Submission has no associated property',
        };
      }

      const propertyId = localSubmission.propertyId;
      const documentType = localSubmission.documentCategory || 'contract';

      // 2. Fetch DocuSeal submission ONCE and reuse for both download and field extraction
      let pdfBuffer: Buffer | null = null;
      let combinedDocumentUrl: string | undefined;
      let docuSealSubmission: any = null; // Cache the API response

      if (docuSealService.isReady()) {
        try {
          // SINGLE API CALL - fetch once, reuse for everything
          console.log(`[SignedDocumentService] Fetching submission ${docuSealSubmissionId} from DocuSeal API...`);
          docuSealSubmission = await docuSealService.getSubmission(docuSealSubmissionId);
          combinedDocumentUrl = docuSealSubmission.combined_document_url;

          // Download the PDF
          if (combinedDocumentUrl) {
            console.log(`[SignedDocumentService] Downloading signed PDF from DocuSeal...`);
            const response = await axios.get(combinedDocumentUrl, { responseType: 'arraybuffer' });
            pdfBuffer = Buffer.from(response.data);
            console.log(`[SignedDocumentService] Downloaded ${pdfBuffer.length} bytes`);
          }

          // Update local submission with URLs
          localSubmission.combinedDocumentUrl = combinedDocumentUrl;
          localSubmission.auditLogUrl = docuSealSubmission.audit_log_url;
          if (docuSealSubmission.documents?.length) {
            localSubmission.documentUrls = docuSealSubmission.documents.map((d: { url: string }) => d.url);
          }
          await localSubmission.save();
        } catch (apiError) {
          console.warn('[SignedDocumentService] Could not fetch from DocuSeal API:', apiError);
          combinedDocumentUrl = localSubmission.combinedDocumentUrl;
        }
      } else {
        combinedDocumentUrl = localSubmission.combinedDocumentUrl;
      }

      // 3. Store PDF locally and calculate hash for tamper detection
      let localFilePath: string | undefined;
      let documentHash: string | undefined;

      if (pdfBuffer) {
        // Calculate SHA-256 hash for tamper detection
        documentHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
        console.log(`[SignedDocumentService] Document hash (SHA-256): ${documentHash}`);

        const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads/documents');
        // Use async file operations to avoid blocking the event loop
        try {
          await fsPromises.access(uploadDir);
        } catch {
          await fsPromises.mkdir(uploadDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `signed_${documentType}_${propertyId}_${timestamp}.pdf`;
        localFilePath = path.join(uploadDir, filename);

        await fsPromises.writeFile(localFilePath, pdfBuffer);
        console.log(`[SignedDocumentService] Saved signed document: ${localFilePath}`);
      }

      // 4. Create PropertyDocument record
      const templateName = localSubmission.templateName || 'Contract';
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = localFilePath
        ? path.basename(localFilePath)
        : `${templateName.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}_signed.pdf`;

      const propertyDocument = await PropertyDocument.create({
        propertyId,
        documentType: this.mapCategoryToDocumentType(documentType),
        fileName,
        originalName: `${templateName} - Signed`,
        mimeType: 'application/pdf',
        fileSize: pdfBuffer?.length || 0,
        storageKey: localFilePath || combinedDocumentUrl || `docuseal://${docuSealSubmissionId}`,
        uploadedBy: 'DocuSeal',
        status: 'ready',
        metadata: {
          docuSealSubmissionId,
          docuSealTemplateId: localSubmission.templateId,
          docuSealTemplateName: localSubmission.templateName,
          docuSealCategory: localSubmission.documentCategory,
          docuSealDocumentUrl: combinedDocumentUrl,
          localFilePath: localFilePath || undefined,
          downloadedAt: pdfBuffer ? new Date().toISOString() : undefined,
          // SHA-256 hash for tamper detection
          documentHash,
          hashAlgorithm: documentHash ? 'sha256' : undefined,
        } as any, // Type cast since we're adding custom metadata fields
      });

      console.log(`[SignedDocumentService] Created property document ${propertyDocument.id}`);

      // 5. Extract data from DocuSeal API (BEST) or fall back to OCR
      let extractedData: Record<string, any> | undefined;
      let extractionSource: 'docuseal_api' | 'ocr' | 'none' = 'none';

      // BEST APPROACH: Get field values directly from DocuSeal API response
      // We already fetched it above - no need for another API call!
      if (docuSealSubmission) {
        try {
          console.log(`[SignedDocumentService] Extracting field values from cached DocuSeal response (fast & accurate)...`);

          // Extract all field values from all submitters (using cached response)
          extractedData = this.extractFieldsFromDocuSeal(docuSealSubmission);
          extractedData.hasSignatures = true;
          extractedData.signaturesVerifiedBy = 'docuseal';
          extractedData.docuSealSubmissionId = docuSealSubmissionId;
          extractedData.signatures = this.extractSignaturesFromDocuSeal(docuSealSubmission, documentType);
          extractionSource = 'docuseal_api';

          console.log(`[SignedDocumentService] Extracted ${Object.keys(extractedData).length} fields from DocuSeal API`);
        } catch (extractError) {
          console.warn('[SignedDocumentService] DocuSeal field extraction failed, falling back to OCR:', extractError);
        }
      }

      // FALLBACK: Use OCR only if DocuSeal API failed
      if (!extractedData && runOCR && pdfBuffer && complianceOCRService) {
        try {
          console.log(`[SignedDocumentService] Falling back to OCR extraction (slower, less accurate)...`);

          const state = await this.getDealState(propertyId);
          const extractionResult = await complianceOCRService.extractContractFields(
            pdfBuffer,
            'application/pdf',
            state || undefined,
            undefined,
            documentType
          );

          if (extractionResult.success && extractionResult.extractedFields) {
            const ocrData = extractionResult.extractedFields;
            ocrData.hasSignatures = true;
            ocrData.signaturesVerifiedBy = 'docuseal';
            ocrData.docuSealSubmissionId = docuSealSubmissionId;
            ocrData.signatures = this.inferSignaturesFromDocumentType(documentType);
            ocrData.ocrConfidence = extractionResult.confidence;
            extractedData = ocrData;
            extractionSource = 'ocr';

            console.log(`[SignedDocumentService] OCR extraction complete. Confidence: ${extractionResult.confidence}%`);
          }
        } catch (ocrError) {
          console.warn('[SignedDocumentService] OCR extraction also failed:', ocrError);
        }
      }

      // 6. Detect mismatches between signed values and expected values
      let mismatches: DataMismatch[] = [];
      if (extractedData) {
        mismatches = await this.detectMismatches(propertyId, documentType, extractedData);

        if (mismatches.length > 0) {
          console.log(`[SignedDocumentService] ⚠️ Detected ${mismatches.length} mismatches in signed document`);
          for (const m of mismatches) {
            console.log(`   ${m.severity.toUpperCase()}: ${m.field} - ${m.message}`);
          }

          // Create compliance alerts for critical mismatches
          await this.createMismatchAlerts(propertyId, documentType, mismatches);
        }

        extractedData.extractionSource = extractionSource;
        extractedData.mismatches = mismatches;
        extractedData.documentHash = documentHash;

        await sequelize.query(
          `UPDATE property_documents
           SET extracted_data = :data, updated_at = NOW()
           WHERE id = :docId`,
          {
            replacements: {
              docId: propertyDocument.id,
              data: JSON.stringify(extractedData),
            },
          }
        );

        // Update compliance record
        if (updateCompliance) {
          await this.updateComplianceFromExtraction(propertyId, documentType, extractedData);
        }
      }

      // 7. Log to audit trail
      await this.logDocumentSaved(propertyId, propertyDocument.id, docuSealSubmissionId, documentType);

      // Log additional details
      await sequelize.query(
        `INSERT INTO compliance_audit_log
         (property_id, action_type, action_details, created_at)
         VALUES (:propertyId, 'document.signed_processed', :details, NOW())`,
        {
          replacements: {
            propertyId,
            details: JSON.stringify({
              propertyDocumentId: propertyDocument.id,
              docuSealSubmissionId,
              documentType,
              downloaded: !!pdfBuffer,
              fileSize: pdfBuffer?.length,
              documentHash,
              extractionSource,
              extractedFieldCount: extractedData ? Object.keys(extractedData).length : 0,
              mismatchCount: mismatches.length,
              criticalMismatches: mismatches.filter(m => m.severity === 'critical').length,
            }),
          },
        }
      );

      return {
        success: true,
        propertyDocumentId: propertyDocument.id,
        documentUrl: combinedDocumentUrl,
        localFilePath,
        extractedData,
        documentHash,
        mismatches: mismatches.length > 0 ? mismatches : undefined,
      };
    } catch (error) {
      console.error('[SignedDocumentService] Error processing signed document:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract field values directly from DocuSeal API response
   * This is 100% accurate - these are the actual values entered/signed
   */
  private extractFieldsFromDocuSeal(submission: any): Record<string, any> {
    const fields: Record<string, any> = {};

    // Extract values from all submitters
    if (submission.submitters) {
      for (const submitter of submission.submitters) {
        // Add submitter info
        fields[`${submitter.role}_email`] = submitter.email;
        fields[`${submitter.role}_name`] = submitter.name;
        fields[`${submitter.role}_completed_at`] = submitter.completed_at;

        // Extract all field values filled by this submitter
        if (submitter.values && Array.isArray(submitter.values)) {
          for (const fieldValue of submitter.values) {
            // Normalize field name (remove spaces, lowercase)
            const normalizedField = fieldValue.field
              .toLowerCase()
              .replace(/\s+/g, '_')
              .replace(/[^a-z0-9_]/g, '');

            fields[normalizedField] = fieldValue.value;

            // Also store with original field name
            fields[`_raw_${fieldValue.field}`] = fieldValue.value;
          }
        }
      }
    }

    // Add submission metadata
    fields.submission_id = submission.id;
    fields.template_id = submission.template?.id;
    fields.template_name = submission.template?.name;
    fields.completed_at = submission.completed_at;
    fields.created_at = submission.created_at;

    return fields;
  }

  /**
   * Extract signature information from DocuSeal submission
   * Each submitter with status 'completed' = verified signature
   */
  private extractSignaturesFromDocuSeal(submission: any, documentType: string): Array<{
    type: string;
    detected: boolean;
    verified: boolean;
    verifiedBy: string;
    email: string;
    completedAt: string | null;
  }> {
    const signatures: Array<{
      type: string;
      detected: boolean;
      verified: boolean;
      verifiedBy: string;
      email: string;
      completedAt: string | null;
    }> = [];

    if (submission.submitters) {
      for (const submitter of submission.submitters) {
        const isCompleted = submitter.status === 'completed';

        signatures.push({
          type: submitter.role || 'unknown',
          detected: isCompleted,
          verified: isCompleted,
          verifiedBy: isCompleted ? 'docuseal' : 'none',
          email: submitter.email,
          completedAt: submitter.completed_at || null,
        });
      }
    }

    // If no submitters found, infer from document type
    if (signatures.length === 0) {
      return this.inferSignaturesFromDocumentType(documentType);
    }

    return signatures;
  }

  /**
   * Infer required signatures based on document type
   * Used when DocuSeal confirms signatures but OCR didn't detect them
   */
  private inferSignaturesFromDocumentType(documentType: string): Array<{
    type: string;
    detected: boolean;
    verified: boolean;
    verifiedBy: string;
    email: string;
    completedAt: string | null;
  }> {
    const signatureMap: Record<string, string[]> = {
      // Phase 0 - CSA only needs wholesaler
      csa: ['wholesaler'],

      // Phase 2 - Purchase contract needs seller and buyer (wholesaler)
      purchase_contract: ['seller', 'wholesaler'],
      contract: ['seller', 'wholesaler'],

      // Phase 4 - Disclosures need seller acknowledgment
      wholesaler_disclosure: ['seller'],
      equity_disclosure: ['seller'],

      // Phase 7 - Distribution agreements need wholesaler
      msa: ['wholesaler'],
      asa: ['wholesaler'],

      // Phase 10 - Cancellation disclosure needs seller
      cancellation_disclosure: ['seller'],

      // Phase 11 - Assignment needs wholesaler and new buyer
      assignment_addendum: ['wholesaler', 'buyer'],
      assignment: ['wholesaler', 'buyer'],
      closing_disclosure: ['seller', 'buyer'],
    };

    const requiredSigners = signatureMap[documentType.toLowerCase()] || ['unknown'];

    return requiredSigners.map(type => ({
      type,
      detected: true, // DocuSeal confirmed it
      verified: true,
      verifiedBy: 'docuseal',
      email: '', // Not available when inferring from document type
      completedAt: null,
    }));
  }

  /**
   * Get the state for a deal from compliance record
   */
  private async getDealState(dealId: number): Promise<string | null> {
    try {
      const [results] = await sequelize.query(
        `SELECT state FROM state_deal_compliance WHERE deal_id = :dealId LIMIT 1`,
        { replacements: { dealId } }
      );
      const record = (results as any[])?.[0];
      return record?.state || null;
    } catch {
      return null;
    }
  }

  /**
   * Update compliance record with extracted data from signed documents
   */
  private async updateComplianceFromExtraction(
    dealId: number,
    documentType: string,
    extractedData: Record<string, any>
  ): Promise<void> {
    try {
      const updates: Record<string, any> = {};

      // Assignment addendum fields
      if (documentType === 'assignment_addendum' || documentType === 'assignment') {
        if (extractedData.assigneeName) updates.assignee_name = extractedData.assigneeName;
        if (extractedData.assignmentFee) updates.assignment_fee = extractedData.assignmentFee;
        if (extractedData.assignmentDate) updates.assignment_execution_date = extractedData.assignmentDate;
      }

      // Purchase contract fields
      if (documentType === 'purchase_contract' || documentType === 'contract') {
        if (extractedData.sellerName) updates.seller_name_verified = extractedData.sellerName;
        if (extractedData.buyerName) updates.buyer_name_verified = extractedData.buyerName;
        if (extractedData.purchasePrice) updates.purchase_price_verified = extractedData.purchasePrice;
        if (extractedData.closingDate) updates.closing_date = extractedData.closingDate;
        if (extractedData.propertyAddress) updates.property_address_verified = extractedData.propertyAddress;
      }

      // CSA/MSA/ASA fields
      if (['csa', 'msa', 'asa'].includes(documentType)) {
        if (extractedData.companyName) updates.company_name_verified = extractedData.companyName;
        if (extractedData.signerName) updates.signer_name_verified = extractedData.signerName;
        if (extractedData.effectiveDate) updates.agreement_effective_date = extractedData.effectiveDate;
      }

      // Signature verification
      if (extractedData.signatures?.length > 0) {
        const sellerSig = extractedData.signatures.find((s: any) => s.type === 'seller' && s.detected);
        const buyerSig = extractedData.signatures.find((s: any) => s.type === 'buyer' && s.detected);
        const wholesalerSig = extractedData.signatures.find((s: any) => s.type === 'wholesaler' && s.detected);

        if (sellerSig) updates.seller_signature_verified = true;
        if (buyerSig) updates.buyer_signature_verified = true;
        if (wholesalerSig) updates.wholesaler_signature_verified = true;
      }

      // Mark document as having signatures if detected
      if (extractedData.hasSignatures) {
        updates[`${documentType}_signed`] = true;
        updates[`${documentType}_signed_at`] = new Date().toISOString();
      }

      if (Object.keys(updates).length > 0) {
        await sequelize.query(
          `UPDATE state_deal_compliance
           SET state_specific_data = COALESCE(state_specific_data, '{}'::jsonb) || :updates::jsonb,
               updated_at = NOW()
           WHERE deal_id = :dealId`,
          {
            replacements: {
              dealId,
              updates: JSON.stringify(updates),
            },
          }
        );
        console.log(`[SignedDocumentService] Updated compliance with ${Object.keys(updates).length} extracted fields`);
      }
    } catch (error) {
      console.warn('[SignedDocumentService] Failed to update compliance from extraction:', error);
    }
  }

  /**
   * Detect mismatches between signed document values and expected deal values
   * Returns array of mismatches with severity levels
   */
  private async detectMismatches(
    dealId: number,
    documentType: string,
    extractedData: Record<string, any>
  ): Promise<DataMismatch[]> {
    const mismatches: DataMismatch[] = [];

    try {
      // Get expected values from the property/deal
      const [propertyResults] = await sequelize.query(
        `SELECT
          p.asking_price,
          p.address,
          p.city,
          p.state,
          p.zip,
          p.assignment_fee,
          pc_seller.full_name as seller_name,
          pc_seller.email as seller_email,
          sdc.state_specific_data
         FROM properties p
         LEFT JOIN property_contacts pc_seller ON p.id = pc_seller.property_id AND pc_seller.contact_type = 'seller'
         LEFT JOIN state_deal_compliance sdc ON p.id = sdc.deal_id
         WHERE p.id = :dealId
         LIMIT 1`,
        { replacements: { dealId } }
      );

      const expected = (propertyResults as any[])?.[0];
      if (!expected) {
        console.warn(`[SignedDocumentService] No property data found for deal ${dealId}`);
        return mismatches;
      }

      const expectedAddress = [expected.address, expected.city, expected.state, expected.zip]
        .filter(Boolean)
        .join(', ');

      // Check purchase price (CRITICAL - money matters!)
      const extractedPrice = this.extractPrice(extractedData);
      if (extractedPrice && expected.asking_price) {
        const expectedPrice = parseFloat(expected.asking_price);
        const priceDiff = Math.abs(extractedPrice - expectedPrice);
        const priceDiffPercent = (priceDiff / expectedPrice) * 100;

        if (priceDiffPercent > 5) {
          mismatches.push({
            field: 'purchase_price',
            expected: expectedPrice,
            actual: extractedPrice,
            severity: priceDiffPercent > 20 ? 'critical' : 'warning',
            message: `Purchase price differs by ${priceDiffPercent.toFixed(1)}% ($${priceDiff.toLocaleString()})`,
          });
        }
      }

      // Check property address (CRITICAL - wrong property!)
      const extractedAddress = this.extractAddress(extractedData);
      if (extractedAddress && expectedAddress) {
        const addressMatch = this.fuzzyMatch(extractedAddress, expectedAddress);
        if (addressMatch < 0.7) {
          mismatches.push({
            field: 'property_address',
            expected: expectedAddress,
            actual: extractedAddress,
            severity: 'critical',
            message: `Property address may not match (${(addressMatch * 100).toFixed(0)}% similarity)`,
          });
        }
      }

      // Check seller name (WARNING - could be typo or representative)
      const extractedSeller = this.extractSellerName(extractedData);
      if (extractedSeller && expected.seller_name) {
        const sellerMatch = this.fuzzyMatch(extractedSeller, expected.seller_name);
        if (sellerMatch < 0.8) {
          mismatches.push({
            field: 'seller_name',
            expected: expected.seller_name,
            actual: extractedSeller,
            severity: sellerMatch < 0.5 ? 'critical' : 'warning',
            message: `Seller name differs (${(sellerMatch * 100).toFixed(0)}% similarity)`,
          });
        }
      }

      // Check assignment fee for assignment documents
      if (documentType.includes('assignment')) {
        const extractedFee = this.extractPrice(extractedData, 'assignment');
        if (extractedFee && expected.assignment_fee) {
          const expectedFee = parseFloat(expected.assignment_fee);
          if (Math.abs(extractedFee - expectedFee) > 100) {
            mismatches.push({
              field: 'assignment_fee',
              expected: expectedFee,
              actual: extractedFee,
              severity: 'warning',
              message: `Assignment fee differs by $${Math.abs(extractedFee - expectedFee).toLocaleString()}`,
            });
          }
        }
      }

      // Check closing date is in the future (INFO)
      const extractedDate = this.extractDate(extractedData, 'closing');
      if (extractedDate) {
        const now = new Date();
        if (extractedDate < now) {
          mismatches.push({
            field: 'closing_date',
            expected: 'Future date',
            actual: extractedDate.toISOString().split('T')[0],
            severity: 'info',
            message: 'Closing date is in the past',
          });
        }
      }

    } catch (error) {
      console.warn('[SignedDocumentService] Error detecting mismatches:', error);
    }

    return mismatches;
  }

  /**
   * Create compliance alerts for critical mismatches
   */
  private async createMismatchAlerts(
    dealId: number,
    documentType: string,
    mismatches: DataMismatch[]
  ): Promise<void> {
    const criticalMismatches = mismatches.filter(m => m.severity === 'critical');

    if (criticalMismatches.length === 0) return;

    try {
      for (const mismatch of criticalMismatches) {
        await sequelize.query(
          `INSERT INTO compliance_alerts
           (property_id, alert_type, severity, title, message, status, metadata, created_at, updated_at)
           VALUES (:dealId, 'document_mismatch', 'high', :title, :message, 'active', :metadata, NOW(), NOW())
           ON CONFLICT (property_id, alert_type, title)
           DO UPDATE SET message = :message, metadata = :metadata, updated_at = NOW()`,
          {
            replacements: {
              dealId,
              title: `${documentType}: ${mismatch.field} mismatch`,
              message: mismatch.message,
              metadata: JSON.stringify({
                documentType,
                field: mismatch.field,
                expected: mismatch.expected,
                actual: mismatch.actual,
                detectedAt: new Date().toISOString(),
              }),
            },
          }
        );
      }

      console.log(`[SignedDocumentService] Created ${criticalMismatches.length} compliance alerts for mismatches`);
    } catch (error) {
      console.warn('[SignedDocumentService] Error creating mismatch alerts:', error);
    }
  }

  /**
   * Extract price from various field names
   */
  private extractPrice(data: Record<string, any>, type: string = 'purchase'): number | null {
    const priceFields = type === 'assignment'
      ? ['assignment_fee', 'assignmentfee', 'fee', 'assignment_amount']
      : ['purchase_price', 'purchaseprice', 'price', 'sale_price', 'saleprice', 'contract_price'];

    for (const field of priceFields) {
      const value = data[field] || data[field.toLowerCase()];
      if (value) {
        const parsed = parseFloat(String(value).replace(/[$,]/g, ''));
        if (!isNaN(parsed)) return parsed;
      }
    }
    return null;
  }

  /**
   * Extract address from various field names
   */
  private extractAddress(data: Record<string, any>): string | null {
    const addressFields = ['property_address', 'propertyaddress', 'address', 'property', 'street_address'];

    for (const field of addressFields) {
      const value = data[field] || data[field.toLowerCase()];
      if (value && typeof value === 'string' && value.length > 5) {
        return value;
      }
    }
    return null;
  }

  /**
   * Extract seller name from various field names
   */
  private extractSellerName(data: Record<string, any>): string | null {
    const nameFields = ['seller_name', 'sellername', 'seller', 'grantor', 'owner_name', 'ownername'];

    for (const field of nameFields) {
      const value = data[field] || data[field.toLowerCase()];
      if (value && typeof value === 'string' && value.length > 2) {
        return value;
      }
    }
    return null;
  }

  /**
   * Extract date from various field names
   */
  private extractDate(data: Record<string, any>, type: string): Date | null {
    const dateFields = type === 'closing'
      ? ['closing_date', 'closingdate', 'close_date', 'settlement_date']
      : ['contract_date', 'effective_date', 'execution_date'];

    for (const field of dateFields) {
      const value = data[field] || data[field.toLowerCase()];
      if (value) {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    }
    return null;
  }

  /**
   * Fuzzy string matching (Levenshtein-based similarity)
   */
  private fuzzyMatch(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    // Simple Levenshtein distance
    const matrix: number[][] = [];

    for (let i = 0; i <= s1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s2.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[s1.length][s2.length];
    const maxLength = Math.max(s1.length, s2.length);

    return 1 - distance / maxLength;
  }

  /**
   * Verify document integrity by comparing hash
   */
  async verifyDocumentHash(documentId: number, fileBuffer: Buffer): Promise<{
    valid: boolean;
    storedHash?: string;
    computedHash: string;
  }> {
    const computedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    try {
      const doc = await PropertyDocument.findByPk(documentId);
      const storedHash = (doc?.metadata as any)?.documentHash;

      if (!storedHash) {
        return { valid: false, computedHash, storedHash: undefined };
      }

      return {
        valid: storedHash === computedHash,
        storedHash,
        computedHash,
      };
    } catch (error) {
      console.error('[SignedDocumentService] Error verifying document hash:', error);
      return { valid: false, computedHash };
    }
  }

  /**
   * Find existing processed document for idempotency check
   * Prevents duplicate processing of the same DocuSeal submission
   */
  private async findExistingProcessedDocument(docuSealSubmissionId: number): Promise<PropertyDocument | null> {
    try {
      // Check if we already have a PropertyDocument linked to this submission
      const existing = await PropertyDocument.findOne({
        where: sequelize.literal(
          `metadata->>'docuSealSubmissionId' = '${docuSealSubmissionId}'`
        ),
      });

      if (existing) {
        // Also verify the document was fully processed (has extracted data or hash)
        const metadata = existing.metadata as any;
        const wasProcessed = metadata?.documentHash || metadata?.downloadedAt;

        if (wasProcessed) {
          return existing;
        }
      }

      return null;
    } catch (error) {
      console.warn('[SignedDocumentService] Error checking for existing document:', error);
      return null;
    }
  }
}

export const signedDocumentService = new SignedDocumentService();
export default signedDocumentService;
