/**
 * Document Controller
 *
 * Handles file upload, download, and management for property documents.
 */

import { Request, Response } from 'express';
import PropertyDocument, { DocumentType } from '../models/PropertyDocument';
import Property from '../models/Property';
import storageService, { UploadedFile } from '../services/StorageService';
import { safeParseInt } from '../utils/security';
import { Op } from 'sequelize';
import { complianceTriggerService } from '../services/ComplianceTriggerService';
import { documentClassificationService } from '../services/DocumentClassificationService';
import { activityFeedService } from '../services/ActivityFeedService';

/**
 * @swagger
 * /api/listings/{id}/documents:
 *   post:
 *     summary: Upload documents to a property
 *     description: Upload one or more documents to a property
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               documentType:
 *                 type: string
 *                 enum: [contract, photo, inspection, appraisal, disclosure, other]
 *     responses:
 *       201:
 *         description: Documents uploaded successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Property not found
 */
export const uploadDocuments = async (req: Request, res: Response) => {
  try {
    // SECURITY: Validate property ID
    const propertyId = safeParseInt(req.params.id, { min: 1 });
    if (propertyId === null) {
      return res.status(400).json({ success: false, error: 'Invalid property ID' });
    }
    const documentType = (req.body.documentType as DocumentType) || 'other';
    const complianceCategory = req.body.complianceCategory as string | undefined;

    // Check if property exists
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    // Check if files were uploaded
    const files = req.files as Express.Multer.File[] | undefined;
    const singleFile = req.file as Express.Multer.File | undefined;

    const uploadedFiles = files || (singleFile ? [singleFile] : []);

    if (uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
    }

    const documents: PropertyDocument[] = [];
    const errors: Array<{ fileName: string; error: string }> = [];

    for (const file of uploadedFiles) {
      try {
        // Upload to storage
        const uploadResult = await storageService.upload(file as UploadedFile, propertyId);

        if (!uploadResult.success) {
          errors.push({
            fileName: file.originalname,
            error: uploadResult.error || 'Upload failed',
          });
          continue;
        }

        // Create document record with initial status
        const document = await PropertyDocument.create({
          propertyId,
          documentType,
          fileName: uploadResult.fileName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          storageKey: uploadResult.storageKey,
          status: 'classifying', // Start with classifying status
          complianceCategory: complianceCategory || undefined,
        });

        // Auto-classify the document (non-blocking for better UX)
        const autoClassify = req.body.autoClassify !== 'false';
        const confidenceThreshold = parseFloat(req.body.confidenceThreshold) || 0.7;

        if (autoClassify) {
          // Run classification asynchronously
          classifyDocumentAsync(
            document,
            file,
            documentType,
            confidenceThreshold
          ).catch(err => {
            console.warn(`[DocumentController] Auto-classification failed for ${file.originalname}:`, err.message);
          });
        } else {
          // If auto-classify is disabled, just set to ready
          document.status = 'ready';
          await document.save();
        }

        documents.push(document);

        // Fire compliance trigger for document upload (non-blocking)
        complianceTriggerService.handlePropertyEvent('document.uploaded', propertyId, {
          documentId: document.id,
          documentType,
          fileName: file.originalname,
        }).catch(err => console.warn('Compliance trigger failed:', err.message));

        // Log activity feed event (non-blocking, fire and forget)
        try {
          activityFeedService.createActivity({
            eventType: 'deal_updated',
            actor: {
              type: 'user',
              id: (req as any).user?.id ? String((req as any).user.id) : undefined,
              name: (req as any).user?.name || 'User',
            },
            resource: {
              type: 'deal',
              id: String(propertyId),
              name: file.originalname,
            },
            action: 'uploaded',
            summary: `Document uploaded: ${file.originalname}`,
            importance: 'low',
          }).catch(() => {});
        } catch {
          // Activity logging is non-critical, ignore errors
        }
      } catch (err) {
        errors.push({
          fileName: file.originalname,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    res.status(201).json({
      success: true,
      data: {
        documents,
        errors,
      },
      metadata: {
        totalUploaded: documents.length,
        totalErrors: errors.length,
      },
    });
  } catch (error) {
    console.error('Error uploading documents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/listings/{id}/documents:
 *   get:
 *     summary: List documents for a property
 *     description: Get all documents attached to a property
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [contract, photo, inspection, appraisal, disclosure, other]
 *         description: Filter by document type
 *     responses:
 *       200:
 *         description: List of documents
 *       404:
 *         description: Property not found
 */
export const listDocuments = async (req: Request, res: Response) => {
  try {
    // SECURITY: Validate property ID
    const propertyId = safeParseInt(req.params.id, { min: 1 });
    if (propertyId === null) {
      return res.status(400).json({ success: false, error: 'Invalid property ID' });
    }
    const documentType = req.query.type as DocumentType | undefined;

    // Check if property exists
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    // Build query
    const where: any = { propertyId };
    if (documentType) {
      where.documentType = documentType;
    }

    const documents = await PropertyDocument.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    // Add signed URLs to documents
    const documentsWithUrls = await Promise.all(
      documents.map(async (doc) => ({
        ...doc.toJSON(),
        url: await storageService.getSignedUrl(doc.storageKey, 3600) || storageService.getUrl(doc.storageKey),
      }))
    );

    res.json({
      success: true,
      data: documentsWithUrls,
      metadata: {
        total: documents.length,
        propertyId,
      },
    });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/documents/{documentId}:
 *   get:
 *     summary: Get document metadata
 *     description: Get metadata for a specific document
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Document metadata
 *       404:
 *         description: Document not found
 */
export const getDocument = async (req: Request, res: Response) => {
  try {
    // SECURITY: Validate document ID
    const documentId = safeParseInt(req.params.documentId, { min: 1 });
    if (documentId === null) {
      return res.status(400).json({ success: false, error: 'Invalid document ID' });
    }

    const document = await PropertyDocument.findByPk(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    // Get signed URL for secure access
    const signedUrl = await storageService.getSignedUrl(document.storageKey, 3600);

    res.json({
      success: true,
      data: {
        ...document.toJSON(),
        url: signedUrl || storageService.getUrl(document.storageKey),
      },
    });
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/documents/{documentId}/download:
 *   get:
 *     summary: Download a document
 *     description: Download the actual file for a document
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Document ID
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Document not found
 */
export const downloadDocument = async (req: Request, res: Response) => {
  try {
    // SECURITY: Validate document ID
    const documentId = safeParseInt(req.params.documentId, { min: 1 });
    if (documentId === null) {
      return res.status(400).json({ success: false, error: 'Invalid document ID' });
    }

    const document = await PropertyDocument.findByPk(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    // Check if file exists in Supabase Storage
    const exists = await storageService.exists(document.storageKey);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'File not found in storage',
      });
    }

    // Get signed URL (valid for 1 hour)
    const signedUrl = await storageService.getSignedUrl(document.storageKey, 3600);

    if (!signedUrl) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate download URL',
      });
    }

    // If urlOnly query param is set, return the signed URL as JSON (for frontend preview)
    // This avoids CORS issues when frontend needs to fetch the file directly
    if (req.query.urlOnly === 'true') {
      return res.json({
        success: true,
        data: {
          url: signedUrl,
          fileName: document.originalName,
          mimeType: document.mimeType,
          expiresIn: 3600,
        },
      });
    }

    // Redirect to Supabase signed URL for download
    res.redirect(signedUrl);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/documents/{documentId}:
 *   patch:
 *     summary: Update document metadata
 *     description: Update document properties like document type
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Document ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               documentType:
 *                 type: string
 *                 enum: [contract, photo, inspection, appraisal, disclosure, other]
 *     responses:
 *       200:
 *         description: Document updated successfully
 *       400:
 *         description: Invalid document type
 *       404:
 *         description: Document not found
 */
export const updateDocument = async (req: Request, res: Response) => {
  try {
    // SECURITY: Validate document ID
    const documentId = safeParseInt(req.params.documentId, { min: 1 });
    if (documentId === null) {
      return res.status(400).json({ success: false, error: 'Invalid document ID' });
    }

    const { documentType, originalName, complianceCategory } = req.body;

    // Validate document type if provided
    const validTypes: DocumentType[] = ['contract', 'photo', 'inspection', 'appraisal', 'disclosure', 'other'];
    if (documentType && !validTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid document type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Validate compliance category if provided
    if (complianceCategory !== undefined && complianceCategory !== null) {
      if (typeof complianceCategory !== 'string' || complianceCategory.length > 50) {
        return res.status(400).json({
          success: false,
          error: 'Invalid compliance category',
        });
      }
    }

    // Validate original name if provided
    if (originalName !== undefined) {
      if (typeof originalName !== 'string' || originalName.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Document name cannot be empty',
        });
      }
      if (originalName.length > 255) {
        return res.status(400).json({
          success: false,
          error: 'Document name is too long (max 255 characters)',
        });
      }
    }

    const document = await PropertyDocument.findByPk(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    // Update fields
    if (documentType) {
      document.documentType = documentType;
    }
    if (originalName) {
      document.originalName = originalName.trim();
    }
    // Allow setting or clearing compliance category
    if (complianceCategory !== undefined) {
      document.complianceCategory = complianceCategory || undefined;
    }

    await document.save();

    res.json({
      success: true,
      data: document.toJSON(),
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/documents/{documentId}:
 *   delete:
 *     summary: Delete a document
 *     description: Delete a document and its file from storage
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       404:
 *         description: Document not found
 */
export const deleteDocument = async (req: Request, res: Response) => {
  try {
    // SECURITY: Validate document ID
    const documentId = safeParseInt(req.params.documentId, { min: 1 });
    if (documentId === null) {
      return res.status(400).json({ success: false, error: 'Invalid document ID' });
    }

    const document = await PropertyDocument.findByPk(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    // Delete from storage
    await storageService.delete(document.storageKey);

    // Delete record
    await document.destroy();

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/documents:
 *   get:
 *     summary: List all documents across all properties
 *     description: Get all documents with optional filtering by type. Includes property info.
 *     tags: [Documents]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [contract, photo, inspection, appraisal, disclosure, other]
 *         description: Filter by document type
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by file name
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of all documents
 */
export const listAllDocuments = async (req: Request, res: Response) => {
  try {
    const documentType = req.query.type as DocumentType | undefined;
    const search = req.query.search as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    // Build query
    const where: any = {};
    if (documentType) {
      where.documentType = documentType;
    }
    if (search) {
      where.originalName = { [Op.iLike]: `%${search}%` };
    }

    const { rows: documents, count: total } = await PropertyDocument.findAndCountAll({
      where,
      include: [{
        model: Property,
        as: 'property',
        attributes: ['id', 'address', 'city', 'state', 'zip'],
      }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    // Add signed URLs
    const documentsWithUrls = await Promise.all(
      documents.map(async (doc) => ({
        ...doc.toJSON(),
        url: await storageService.getSignedUrl(doc.storageKey, 3600) || storageService.getUrl(doc.storageKey),
      }))
    );

    res.json({
      success: true,
      data: documentsWithUrls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing all documents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/documents/send-email:
 *   post:
 *     summary: Send documents via email
 *     description: Send an email with documents attached to a recipient
 *     tags: [Documents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *               - body
 *               - documentIds
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *                 description: Recipient email address
 *               subject:
 *                 type: string
 *                 description: Email subject line
 *               body:
 *                 type: string
 *                 description: Email body text
 *               documentIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of document IDs to attach
 *     responses:
 *       200:
 *         description: Email sent successfully
 *       400:
 *         description: Bad request - missing fields or invalid documents
 *       500:
 *         description: Email sending failed
 */
export const sendDocumentsEmail = async (req: Request, res: Response) => {
  try {
    const { to, subject, body, documentIds } = req.body;

    // Validate required fields
    if (!to || !subject || !body || !documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, subject, body, documentIds',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address',
      });
    }

    // Validate document IDs
    const validDocIds = documentIds
      .map((id: unknown) => safeParseInt(String(id), { min: 1 }))
      .filter((id: number | null): id is number => id !== null);

    if (validDocIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid document IDs provided',
      });
    }

    // Check if Resend is configured
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Email service not configured',
      });
    }

    // Fetch documents
    const documents = await PropertyDocument.findAll({
      where: {
        id: { [Op.in]: validDocIds },
      },
    });

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No documents found with the provided IDs',
      });
    }

    // Download documents and prepare attachments
    const attachments: Array<{ filename: string; content: Buffer }> = [];
    const errors: Array<{ documentId: number; error: string }> = [];

    for (const doc of documents) {
      try {
        const downloadResult = await storageService.download(doc.storageKey);

        if (!downloadResult.exists || !downloadResult.data) {
          errors.push({
            documentId: doc.id,
            error: downloadResult.error || 'File not found in storage',
          });
          continue;
        }

        attachments.push({
          filename: doc.originalName,
          content: downloadResult.data,
        });
      } catch (err) {
        errors.push({
          documentId: doc.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (attachments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No documents could be retrieved for attachment',
        details: errors,
      });
    }

    // Send email with Resend
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Dispotree <noreply@dispotree.com>';

    // Convert plain text body to HTML with proper line breaks
    const htmlBody = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    const response = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <p style="color: #333; font-size: 14px; line-height: 1.6;">
            ${htmlBody}
          </p>
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            This email includes ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}.
          </p>
        </div>
      `,
      attachments: attachments.map(att => ({
        filename: att.filename,
        content: att.content,
      })),
    });

    if (response.error) {
      console.error('[DocumentController] Email send error:', response.error);
      return res.status(500).json({
        success: false,
        error: 'Failed to send email',
        details: response.error,
      });
    }

    res.json({
      success: true,
      message: 'Email sent successfully',
      data: {
        messageId: response.data?.id,
        to,
        attachmentsCount: attachments.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error('Error sending documents email:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Async helper to classify a document after upload.
 * Runs in the background to not block the upload response.
 */
async function classifyDocumentAsync(
  document: PropertyDocument,
  file: Express.Multer.File,
  userProvidedType: DocumentType,
  confidenceThreshold: number
): Promise<void> {
  try {
    // Initialize classification service
    await documentClassificationService.initialize();

    // Download the file from storage for classification
    const downloadResult = await storageService.download(document.storageKey);
    if (!downloadResult.exists || !downloadResult.data) {
      console.warn(`[DocumentController] Cannot classify - file not in storage: ${document.originalName}`);
      document.status = 'ready';
      await document.save();
      return;
    }

    // Run classification
    const classificationResult = await documentClassificationService.classifyDocument(
      downloadResult.data,
      document.mimeType,
      document.originalName
    );

    // Determine if we should auto-apply the classification
    // Only auto-apply if:
    // 1. Classification succeeded
    // 2. Confidence meets threshold
    // 3. User didn't explicitly set a specific type (not 'other')
    const shouldAutoApply =
      classificationResult.success &&
      classificationResult.confidence >= confidenceThreshold &&
      (userProvidedType === 'other' || classificationResult.documentType === userProvidedType);

    // Prepare classification metadata
    const classificationMeta = {
      success: classificationResult.success,
      classifiedType: classificationResult.documentType,
      confidence: classificationResult.confidence,
      allScores: classificationResult.allScores,
      source: classificationResult.source,
      extractedFields: classificationResult.extractedFields,
      suggestedWorkflow: classificationResult.suggestedWorkflow,
      classifiedAt: new Date().toISOString(),
      classificationModel: process.env.DOC_CLASSIFICATION_MODEL || 'gpt-4o-mini',
      processingTimeMs: classificationResult.processingTimeMs,
      wasAutoApplied: shouldAutoApply,
    };

    // Apply classification if appropriate
    if (shouldAutoApply) {
      const newType = mapToDocumentType(classificationResult.documentType);
      if (document.documentType !== newType) {
        document.documentType = newType;
      }
    }

    // Update document with classification metadata
    document.metadata = {
      ...document.metadata,
      classification: classificationMeta as any,
    };
    document.status = 'ready';
    await document.save();

    // Fire classification event for workflow routing
    if (classificationResult.success) {
      complianceTriggerService
        .handlePropertyEvent('document.classified', document.propertyId, {
          documentId: document.id,
          classifiedType: classificationResult.documentType,
          confidence: classificationResult.confidence,
          suggestedWorkflow: classificationResult.suggestedWorkflow,
          wasAutoApplied: classificationMeta.wasAutoApplied,
          extractedFields: classificationResult.extractedFields,
        })
        .catch((err) => console.warn('Classification trigger failed:', err.message));
    }

    console.log(
      `[DocumentController] Classified "${document.originalName}" as ${classificationResult.documentType} ` +
      `(confidence: ${(classificationResult.confidence * 100).toFixed(1)}%, auto-applied: ${shouldAutoApply})`
    );
  } catch (error) {
    console.error(`[DocumentController] Classification error for ${document.originalName}:`, error);
    // Set status to ready even if classification fails - document is still usable
    document.status = 'ready';
    document.metadata = {
      ...document.metadata,
      classification: {
        success: false,
        classifiedType: 'other',
        confidence: 0,
        source: 'text',
        classifiedAt: new Date().toISOString(),
        wasAutoApplied: false,
        error: error instanceof Error ? error.message : 'Classification failed',
      } as any,
    };
    await document.save();
  }
}

/**
 * Map classification type string to DocumentType enum
 */
function mapToDocumentType(classifiedType: string): DocumentType {
  const mapping: Record<string, DocumentType> = {
    contract: 'contract',
    inspection: 'inspection',
    appraisal: 'appraisal',
    disclosure: 'disclosure',
    title: 'title',
    photo: 'photo',
    other: 'other',
  };
  return mapping[classifiedType] || 'other';
}
