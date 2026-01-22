/**
 * Classification Controller
 *
 * Handles document classification requests and management.
 */

import { Request, Response } from 'express';
import PropertyDocument, { DocumentType } from '../models/PropertyDocument';
import storageService from '../services/StorageService';
import { documentClassificationService, ClassificationResult } from '../services/DocumentClassificationService';
import { safeParseInt } from '../utils/security';
import { complianceTriggerService } from '../services/ComplianceTriggerService';

/**
 * @swagger
 * /api/documents/{documentId}/classify:
 *   post:
 *     summary: Classify a document
 *     description: Run ML classification on a document to determine its type
 *     tags: [Documents, Classification]
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Document ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               autoApply:
 *                 type: boolean
 *                 description: Whether to automatically apply the classification if confidence is high
 *               confidenceThreshold:
 *                 type: number
 *                 description: Minimum confidence (0-1) to auto-apply classification
 *     responses:
 *       200:
 *         description: Classification result
 *       404:
 *         description: Document not found
 */
export const classifyDocument = async (req: Request, res: Response) => {
  try {
    const documentId = safeParseInt(req.params.documentId, { min: 1 });
    if (documentId === null) {
      return res.status(400).json({ success: false, error: 'Invalid document ID' });
    }

    const { autoApply = true, confidenceThreshold = 0.7 } = req.body;

    // Get document
    const document = await PropertyDocument.findByPk(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    // Download document from storage
    const downloadResult = await storageService.download(document.storageKey);
    if (!downloadResult.exists || !downloadResult.data) {
      return res.status(404).json({
        success: false,
        error: 'Document file not found in storage',
      });
    }

    // Update status to classifying
    document.status = 'classifying';
    await document.save();

    // Initialize classification service if needed
    await documentClassificationService.initialize();

    // Run classification
    const classificationResult = await documentClassificationService.classifyDocument(
      downloadResult.data,
      document.mimeType,
      document.originalName
    );

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
      wasAutoApplied: false,
    };

    // Determine if we should auto-apply the classification
    const shouldAutoApply =
      autoApply &&
      classificationResult.success &&
      classificationResult.confidence >= confidenceThreshold;

    if (shouldAutoApply) {
      // Auto-apply the classification
      classificationMeta.wasAutoApplied = true;

      // Map classification type to document type
      const newType = mapClassificationToDocumentType(classificationResult.documentType);

      // Only update if type changed
      if (document.documentType !== newType) {
        document.documentType = newType;
      }
    }

    // Update document metadata with classification result
    document.metadata = {
      ...document.metadata,
      classification: classificationMeta as any,
    };

    // Update status back to ready
    document.status = 'ready';
    await document.save();

    // Fire classification event for workflow routing (non-blocking)
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

    res.json({
      success: true,
      data: {
        classification: classificationMeta,
        document: {
          id: document.id,
          documentType: document.documentType,
          status: document.status,
        },
        wasAutoApplied: classificationMeta.wasAutoApplied,
      },
    });
  } catch (error) {
    console.error('Error classifying document:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/documents/{documentId}/classification:
 *   get:
 *     summary: Get classification result for a document
 *     description: Get the stored classification result for a document
 *     tags: [Documents, Classification]
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Classification result
 *       404:
 *         description: Document not found or not classified
 */
export const getClassification = async (req: Request, res: Response) => {
  try {
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

    const classification = document.metadata?.classification;
    if (!classification) {
      return res.status(404).json({
        success: false,
        error: 'Document has not been classified',
      });
    }

    res.json({
      success: true,
      data: {
        classification,
        document: {
          id: document.id,
          documentType: document.documentType,
          originalName: document.originalName,
        },
      },
    });
  } catch (error) {
    console.error('Error getting classification:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/documents/{documentId}/classification/override:
 *   post:
 *     summary: Override document classification
 *     description: Manually override the auto-classification for a document
 *     tags: [Documents, Classification]
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
 *             required:
 *               - documentType
 *             properties:
 *               documentType:
 *                 type: string
 *                 enum: [contract, photo, inspection, appraisal, disclosure, title, other]
 *     responses:
 *       200:
 *         description: Classification overridden
 *       400:
 *         description: Invalid document type
 *       404:
 *         description: Document not found
 */
export const overrideClassification = async (req: Request, res: Response) => {
  try {
    const documentId = safeParseInt(req.params.documentId, { min: 1 });
    if (documentId === null) {
      return res.status(400).json({ success: false, error: 'Invalid document ID' });
    }

    const { documentType } = req.body;

    // Validate document type
    const validTypes: DocumentType[] = [
      'contract',
      'photo',
      'inspection',
      'appraisal',
      'disclosure',
      'title',
      'other',
    ];
    if (!documentType || !validTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid document type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const document = await PropertyDocument.findByPk(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    const previousType = document.documentType;
    const previousClassification = document.metadata?.classification;

    // Update document type
    document.documentType = documentType;

    // Update classification metadata with override info
    document.metadata = {
      ...document.metadata,
      classification: {
        ...previousClassification,
        success: true,
        classifiedType: documentType,
        source: 'manual',
        wasAutoApplied: false,
        userOverride: {
          previousType,
          overriddenAt: new Date().toISOString(),
          overriddenBy: (req as any).user?.id || 'unknown',
        },
      } as any,
    };

    await document.save();

    // Fire override event for workflow routing (non-blocking)
    complianceTriggerService
      .handlePropertyEvent('document.classification.overridden', document.propertyId, {
        documentId: document.id,
        previousType,
        newType: documentType,
        overriddenBy: (req as any).user?.id,
      })
      .catch((err) => console.warn('Override trigger failed:', err.message));

    res.json({
      success: true,
      data: {
        document: {
          id: document.id,
          documentType: document.documentType,
          originalName: document.originalName,
        },
        override: {
          previousType,
          newType: documentType,
        },
      },
    });
  } catch (error) {
    console.error('Error overriding classification:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/listings/{id}/documents/classify-all:
 *   post:
 *     summary: Classify all documents for a property
 *     description: Run classification on all unclassified documents for a property
 *     tags: [Documents, Classification]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forceReclassify:
 *                 type: boolean
 *                 description: Whether to reclassify already classified documents
 *               autoApply:
 *                 type: boolean
 *                 description: Whether to auto-apply classifications
 *               confidenceThreshold:
 *                 type: number
 *                 description: Minimum confidence to auto-apply
 *     responses:
 *       200:
 *         description: Batch classification results
 *       404:
 *         description: Property not found
 */
export const classifyAllPropertyDocuments = async (req: Request, res: Response) => {
  try {
    const propertyId = safeParseInt(req.params.id, { min: 1 });
    if (propertyId === null) {
      return res.status(400).json({ success: false, error: 'Invalid property ID' });
    }

    const {
      forceReclassify = false,
      autoApply = true,
      confidenceThreshold = 0.7,
    } = req.body;

    // Get all documents for property
    const documents = await PropertyDocument.findAll({
      where: { propertyId },
      order: [['createdAt', 'DESC']],
    });

    if (documents.length === 0) {
      return res.json({
        success: true,
        data: {
          results: [],
          summary: {
            total: 0,
            classified: 0,
            skipped: 0,
            failed: 0,
          },
        },
      });
    }

    // Initialize classification service
    await documentClassificationService.initialize();

    const results: Array<{
      documentId: number;
      originalName: string;
      status: 'classified' | 'skipped' | 'failed';
      classification?: any;
      error?: string;
    }> = [];

    let classified = 0;
    let skipped = 0;
    let failed = 0;

    for (const document of documents) {
      // Skip if already classified and not forcing reclassify
      if (document.metadata?.classification && !forceReclassify) {
        results.push({
          documentId: document.id,
          originalName: document.originalName,
          status: 'skipped',
        });
        skipped++;
        continue;
      }

      try {
        // Download document
        const downloadResult = await storageService.download(document.storageKey);
        if (!downloadResult.exists || !downloadResult.data) {
          results.push({
            documentId: document.id,
            originalName: document.originalName,
            status: 'failed',
            error: 'File not found in storage',
          });
          failed++;
          continue;
        }

        // Run classification
        const classificationResult = await documentClassificationService.classifyDocument(
          downloadResult.data,
          document.mimeType,
          document.originalName
        );

        // Determine if we should auto-apply
        const shouldAutoApply =
          autoApply &&
          classificationResult.success &&
          classificationResult.confidence >= confidenceThreshold;

        const classificationMeta = {
          success: classificationResult.success,
          classifiedType: classificationResult.documentType,
          confidence: classificationResult.confidence,
          allScores: classificationResult.allScores,
          source: classificationResult.source,
          extractedFields: classificationResult.extractedFields,
          suggestedWorkflow: classificationResult.suggestedWorkflow,
          classifiedAt: new Date().toISOString(),
          processingTimeMs: classificationResult.processingTimeMs,
          wasAutoApplied: shouldAutoApply,
        };

        // Update document
        if (shouldAutoApply) {
          const newType = mapClassificationToDocumentType(classificationResult.documentType);
          if (document.documentType !== newType) {
            document.documentType = newType;
          }
        }

        document.metadata = {
          ...document.metadata,
          classification: classificationMeta as any,
        };
        await document.save();

        results.push({
          documentId: document.id,
          originalName: document.originalName,
          status: 'classified',
          classification: classificationMeta,
        });
        classified++;
      } catch (error) {
        results.push({
          documentId: document.id,
          originalName: document.originalName,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Classification failed',
        });
        failed++;
      }
    }

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: documents.length,
          classified,
          skipped,
          failed,
        },
      },
    });
  } catch (error) {
    console.error('Error classifying property documents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/classification/types:
 *   get:
 *     summary: Get available document types
 *     description: Get all document types and their workflow mappings
 *     tags: [Classification]
 *     responses:
 *       200:
 *         description: Document types and workflows
 */
export const getDocumentTypes = async (_req: Request, res: Response) => {
  try {
    await documentClassificationService.initialize();

    const workflows = documentClassificationService.getDocumentTypeWorkflows();

    const types = Object.entries(workflows).map(([type, workflow]) => ({
      type,
      workflow,
      label: formatDocumentTypeLabel(type),
    }));

    res.json({
      success: true,
      data: {
        types,
      },
    });
  } catch (error) {
    console.error('Error getting document types:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

// Helper: Map classification type to PropertyDocument DocumentType
function mapClassificationToDocumentType(classifiedType: string): DocumentType {
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

// Helper: Format document type for display
function formatDocumentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    contract: 'Contract',
    inspection: 'Inspection Report',
    appraisal: 'Appraisal',
    disclosure: 'Disclosure',
    title: 'Title Document',
    photo: 'Photo',
    other: 'Other',
  };
  return labels[type] || type.charAt(0).toUpperCase() + type.slice(1);
}
