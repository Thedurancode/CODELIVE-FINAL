/**
 * Template Admin Routes
 *
 * Admin routes for managing StateDocumentTemplates and DocuSeal integration.
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listDocuSealTemplates,
  getDocuSealTemplate,
  assignDocuSealTemplate,
  getDefaultFieldMappings,
  updateFieldMappings,
  bulkAssignTemplates,
  getTemplateSummary,
  getTemplateOptions,
  previewTemplate,
  testSendTemplate,
  validateMappings,
  getTemplateDocument,
} from '../controllers/templateAdminController';

const router = Router();

// Async handler wrapper
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ============================================================================
// TEMPLATE OPTIONS & METADATA
// ============================================================================

/**
 * @swagger
 * /api/admin/templates/options:
 *   get:
 *     summary: Get available template options (categories, triggers, roles, phases)
 *     tags: [Template Admin]
 *     responses:
 *       200:
 *         description: Template configuration options
 */
router.get('/options', asyncHandler(getTemplateOptions));

/**
 * @swagger
 * /api/admin/templates/field-mappings:
 *   get:
 *     summary: Get default field mappings and available transforms
 *     tags: [Template Admin]
 *     responses:
 *       200:
 *         description: Field mapping configuration
 */
router.get('/field-mappings', asyncHandler(getDefaultFieldMappings));

/**
 * @swagger
 * /api/admin/templates/summary:
 *   get:
 *     summary: Get template summary by state
 *     tags: [Template Admin]
 *     responses:
 *       200:
 *         description: Summary of templates per state
 */
router.get('/summary', asyncHandler(getTemplateSummary));

// ============================================================================
// DOCUSEAL INTEGRATION
// ============================================================================

/**
 * @swagger
 * /api/admin/templates/docuseal:
 *   get:
 *     summary: List all templates from DocuSeal
 *     tags: [Template Admin]
 *     responses:
 *       200:
 *         description: List of DocuSeal templates
 */
router.get('/docuseal', asyncHandler(listDocuSealTemplates));

/**
 * @swagger
 * /api/admin/templates/docuseal/{templateId}:
 *   get:
 *     summary: Get details of a DocuSeal template
 *     tags: [Template Admin]
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: DocuSeal template details
 */
router.get('/docuseal/:templateId', asyncHandler(getDocuSealTemplate));

// ============================================================================
// STATE DOCUMENT TEMPLATES CRUD
// ============================================================================

/**
 * @swagger
 * /api/admin/templates:
 *   get:
 *     summary: List all state document templates
 *     tags: [Template Admin]
 *     parameters:
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: phase
 *         schema:
 *           type: integer
 *       - in: query
 *         name: enabled
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of templates
 */
router.get('/', asyncHandler(listTemplates));

/**
 * @swagger
 * /api/admin/templates:
 *   post:
 *     summary: Create a new state document template
 *     tags: [Template Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - state
 *               - category
 *               - name
 *             properties:
 *               state:
 *                 type: string
 *               category:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               docuSealTemplateId:
 *                 type: integer
 *               phase:
 *                 type: integer
 *               triggerOn:
 *                 type: string
 *                 enum: [phase_enter, phase_complete, manual]
 *               autoSend:
 *                 type: boolean
 *               signerRoles:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Template created
 */
router.post('/', asyncHandler(createTemplate));

/**
 * @swagger
 * /api/admin/templates/bulk-assign:
 *   post:
 *     summary: Bulk assign DocuSeal template IDs
 *     tags: [Template Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assignments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     docuSealTemplateId:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Bulk assignment results
 */
router.post('/bulk-assign', asyncHandler(bulkAssignTemplates));

/**
 * @swagger
 * /api/admin/templates/{id}:
 *   get:
 *     summary: Get a specific template
 *     tags: [Template Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Template details
 */
router.get('/:id', asyncHandler(getTemplate));

/**
 * @swagger
 * /api/admin/templates/{id}:
 *   put:
 *     summary: Update a template
 *     tags: [Template Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Template updated
 */
router.put('/:id', asyncHandler(updateTemplate));

/**
 * @swagger
 * /api/admin/templates/{id}:
 *   delete:
 *     summary: Delete a template
 *     tags: [Template Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Template deleted
 */
router.delete('/:id', asyncHandler(deleteTemplate));

/**
 * @swagger
 * /api/admin/templates/{id}/assign:
 *   post:
 *     summary: Assign a DocuSeal template to this template
 *     tags: [Template Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               docuSealTemplateId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: DocuSeal template assigned
 */
router.post('/:id/assign', asyncHandler(assignDocuSealTemplate));

/**
 * @swagger
 * /api/admin/templates/{id}/field-mappings:
 *   put:
 *     summary: Update field mappings for a template
 *     tags: [Template Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fieldMappings:
 *                 type: object
 *     responses:
 *       200:
 *         description: Field mappings updated
 */
router.put('/:id/field-mappings', asyncHandler(updateFieldMappings));

/**
 * @swagger
 * /api/admin/templates/{id}/preview:
 *   get:
 *     summary: Generate preview data for a template with sample values
 *     tags: [Template Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Preview data showing how fields will be populated
 */
router.get('/:id/preview', asyncHandler(previewTemplate));

/**
 * @swagger
 * /api/admin/templates/{id}/validate:
 *   get:
 *     summary: Validate field mappings for a template
 *     tags: [Template Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Validation results with warnings
 */
router.get('/:id/validate', asyncHandler(validateMappings));

/**
 * @swagger
 * /api/admin/templates/{id}/test-send:
 *   post:
 *     summary: Send a test contract with sample data
 *     tags: [Template Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipientEmail
 *             properties:
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Test contract sent
 */
router.post('/:id/test-send', asyncHandler(testSendTemplate));

/**
 * @swagger
 * /api/admin/templates/{id}/document:
 *   get:
 *     summary: Get template document URLs for preview
 *     tags: [Template Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Template document URLs
 */
router.get('/:id/document', asyncHandler(getTemplateDocument));

export default router;
