/**
 * Document Routes
 * File upload, download, and management for property documents
 *
 * SECURITY:
 * - All routes require authentication
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  uploadDocuments,
  listDocuments,
  listAllDocuments,
  getDocument,
  downloadDocument,
  deleteDocument,
  updateDocument,
  sendDocumentsEmail,
} from '../controllers/documentController';
import {
  classifyDocument,
  getClassification,
  overrideClassification,
  classifyAllPropertyDocuments,
  getDocumentTypes,
} from '../controllers/classificationController';
import { uploadMultiple } from '../middleware/upload';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limit
const documentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many requests.' },
});

// Apply authentication
router.use(authenticate);
router.use(documentLimiter);

// ============================================================================
// PROPERTY DOCUMENT ROUTES (nested under /api/listings/:id/documents)
// ============================================================================

/**
 * @swagger
 * /api/listings/{id}/documents:
 *   post:
 *     summary: Upload documents to a property
 *     tags: [Documents]
 */
router.post('/listings/:id/documents', uploadMultiple, uploadDocuments);

/**
 * @swagger
 * /api/listings/{id}/documents:
 *   get:
 *     summary: List documents for a property
 *     tags: [Documents]
 */
router.get('/listings/:id/documents', listDocuments);

// ============================================================================
// ALL DOCUMENTS ROUTE (list all documents across properties)
// ============================================================================

/**
 * @swagger
 * /api/documents:
 *   get:
 *     summary: List all documents across all properties
 *     tags: [Documents]
 */
router.get('/documents', listAllDocuments);

// ============================================================================
// INDIVIDUAL DOCUMENT ROUTES (under /api/documents/:documentId)
// ============================================================================

/**
 * @swagger
 * /api/documents/{documentId}:
 *   get:
 *     summary: Get document metadata
 *     tags: [Documents]
 */
router.get('/documents/:documentId', getDocument);

/**
 * @swagger
 * /api/documents/{documentId}/download:
 *   get:
 *     summary: Download a document
 *     tags: [Documents]
 */
router.get('/documents/:documentId/download', downloadDocument);

/**
 * @swagger
 * /api/documents/{documentId}:
 *   patch:
 *     summary: Update document metadata (e.g., document type)
 *     tags: [Documents]
 */
router.patch('/documents/:documentId', updateDocument);

/**
 * @swagger
 * /api/documents/{documentId}:
 *   delete:
 *     summary: Delete a document
 *     tags: [Documents]
 */
router.delete('/documents/:documentId', deleteDocument);

// ============================================================================
// EMAIL ROUTES
// ============================================================================

/**
 * @swagger
 * /api/documents/send-email:
 *   post:
 *     summary: Send documents via email
 *     tags: [Documents]
 */
router.post('/documents/send-email', sendDocumentsEmail);

// ============================================================================
// CLASSIFICATION ROUTES
// ============================================================================

/**
 * @swagger
 * /api/classification/types:
 *   get:
 *     summary: Get available document types and workflows
 *     tags: [Classification]
 */
router.get('/classification/types', getDocumentTypes);

/**
 * @swagger
 * /api/documents/{documentId}/classify:
 *   post:
 *     summary: Classify a single document
 *     tags: [Documents, Classification]
 */
router.post('/documents/:documentId/classify', classifyDocument);

/**
 * @swagger
 * /api/documents/{documentId}/classification:
 *   get:
 *     summary: Get classification result for a document
 *     tags: [Documents, Classification]
 */
router.get('/documents/:documentId/classification', getClassification);

/**
 * @swagger
 * /api/documents/{documentId}/classification/override:
 *   post:
 *     summary: Override document classification
 *     tags: [Documents, Classification]
 */
router.post('/documents/:documentId/classification/override', overrideClassification);

/**
 * @swagger
 * /api/listings/{id}/documents/classify-all:
 *   post:
 *     summary: Classify all documents for a property
 *     tags: [Documents, Classification]
 */
router.post('/listings/:id/documents/classify-all', classifyAllPropertyDocuments);

export default router;
