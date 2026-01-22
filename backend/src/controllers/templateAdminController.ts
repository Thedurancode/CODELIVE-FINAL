/**
 * Template Admin Controller
 *
 * Admin endpoints for managing StateDocumentTemplates and syncing with DocuSeal.
 */

import { Request, Response } from 'express';
import StateDocumentTemplate, { DocumentCategory, TriggerOn, SignerRole } from '../models/StateDocumentTemplate';
import { docuSealService } from '../services/DocuSealService';
import sequelize from '../config/database';

// ============================================================================
// LIST & GET TEMPLATES
// ============================================================================

/**
 * List all state document templates with optional filtering
 */
export async function listTemplates(req: Request, res: Response) {
  try {
    const { state, category, phase, enabled } = req.query;

    const where: any = {};
    if (state) where.state = (state as string).toUpperCase();
    if (category) where.category = category;
    if (phase !== undefined) where.phase = parseInt(phase as string);
    if (enabled !== undefined) where.enabled = enabled === 'true';

    const templates = await StateDocumentTemplate.findAll({
      where,
      order: [['state', 'ASC'], ['phase', 'ASC'], ['priority', 'DESC']],
    });

    res.json({
      success: true,
      data: templates,
      count: templates.length,
    });
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list templates',
    });
  }
}

/**
 * Get a single template by ID
 */
export async function getTemplate(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const template = await StateDocumentTemplate.findByPk(parseInt(id));

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error getting template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get template',
    });
  }
}

// ============================================================================
// CREATE & UPDATE TEMPLATES
// ============================================================================

/**
 * Create a new state document template
 */
export async function createTemplate(req: Request, res: Response) {
  try {
    const {
      state,
      category,
      name,
      description,
      docuSealTemplateId,
      docuSealTemplateName,
      requiredFor,
      fieldMappings,
      enabled = true,
      priority = 50,
      phase,
      triggerOn = 'manual',
      autoSend = false,
      signerRoles = ['wholesaler'],
      conditionalOn,
      expiresInDays = 30,
    } = req.body;

    // Validate required fields
    if (!state || !category || !name) {
      return res.status(400).json({
        success: false,
        error: 'state, category, and name are required',
      });
    }

    // Check for duplicate
    const existing = await StateDocumentTemplate.findOne({
      where: { state: state.toUpperCase(), category, phase: phase ?? null },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Template already exists for ${state}/${category}/phase ${phase}`,
        existingId: existing.id,
      });
    }

    const template = await StateDocumentTemplate.create({
      state: state.toUpperCase(),
      category,
      name,
      description,
      docuSealTemplateId: docuSealTemplateId || 0,
      docuSealTemplateName,
      requiredFor,
      fieldMappings,
      enabled,
      priority,
      phase,
      triggerOn,
      autoSend,
      signerRoles,
      conditionalOn,
      expiresInDays,
    } as any);

    res.status(201).json({
      success: true,
      data: template,
      message: `Template "${name}" created successfully`,
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create template',
    });
  }
}

/**
 * Update an existing template
 */
export async function updateTemplate(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const updates = req.body;

    const template = await StateDocumentTemplate.findByPk(parseInt(id));

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Don't allow changing state/category/phase combo to avoid duplicates
    if (updates.state) updates.state = updates.state.toUpperCase();

    await template.update(updates);

    res.json({
      success: true,
      data: template,
      message: `Template "${template.name}" updated successfully`,
    });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update template',
    });
  }
}

/**
 * Delete a template
 */
export async function deleteTemplate(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const template = await StateDocumentTemplate.findByPk(parseInt(id));

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    const name = template.name;
    await template.destroy();

    res.json({
      success: true,
      message: `Template "${name}" deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete template',
    });
  }
}

// ============================================================================
// DOCUSEAL SYNC
// ============================================================================

/**
 * List all templates from DocuSeal
 */
export async function listDocuSealTemplates(req: Request, res: Response) {
  try {
    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
      });
    }

    const templates = await docuSealService.listTemplates({ limit: 100 });

    res.json({
      success: true,
      data: templates.map((t: any) => ({
        id: t.id,
        name: t.name,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        folderName: t.folder_name,
        fieldsCount: t.fields?.length || 0,
        fields: t.fields?.map((f: any) => ({
          name: f.name || '(unnamed)',
          type: f.type || 'text',
          required: f.required || false,
        })) || [],
      })),
      count: templates.length,
    });
  } catch (error) {
    console.error('Error listing DocuSeal templates:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch DocuSeal templates',
    });
  }
}

/**
 * Get details of a specific DocuSeal template
 */
export async function getDocuSealTemplate(req: Request, res: Response) {
  try {
    const { templateId } = req.params;

    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
      });
    }

    const template = await docuSealService.getTemplate(parseInt(templateId));

    res.json({
      success: true,
      data: {
        id: template.id,
        name: template.name,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
        folderName: template.folder_name,
        fields: template.fields?.map((f: any) => ({
          name: f.name || '(unnamed)',
          type: f.type || 'text',
          required: f.required || false,
          submitterUuid: f.submitter_uuid,
        })) || [],
      },
    });
  } catch (error) {
    console.error('Error getting DocuSeal template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch DocuSeal template',
    });
  }
}

/**
 * Assign a DocuSeal template to a state document template
 */
export async function assignDocuSealTemplate(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { docuSealTemplateId } = req.body;

    if (!docuSealTemplateId) {
      return res.status(400).json({
        success: false,
        error: 'docuSealTemplateId is required',
      });
    }

    const template = await StateDocumentTemplate.findByPk(parseInt(id));

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Optionally fetch the DocuSeal template name
    let docuSealTemplateName = undefined;
    if (docuSealService.isReady()) {
      try {
        const dsTemplate = await docuSealService.getTemplate(docuSealTemplateId);
        docuSealTemplateName = dsTemplate.name;
      } catch (e) {
        // Ignore - just won't set the name
      }
    }

    await template.update({
      docuSealTemplateId,
      docuSealTemplateName,
    });

    res.json({
      success: true,
      data: template,
      message: `Assigned DocuSeal template ${docuSealTemplateId} to "${template.name}"`,
    });
  } catch (error) {
    console.error('Error assigning DocuSeal template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to assign template',
    });
  }
}

// ============================================================================
// FIELD MAPPINGS
// ============================================================================

/**
 * Get default field mappings
 */
export async function getDefaultFieldMappings(req: Request, res: Response) {
  const defaultMappings = {
    property_address: { source: 'computed', field: '_full_address', description: 'Full property address' },
    street_address: { source: 'property', field: 'address', description: 'Street address only' },
    city: { source: 'property', field: 'city', description: 'City' },
    state: { source: 'property', field: 'state', description: 'State' },
    zip: { source: 'property', field: 'zip_code', description: 'ZIP code' },
    county: { source: 'property', field: 'county', description: 'County' },
    purchase_price: { source: 'property', field: 'purchase_contract_price', description: 'Contract price' },
    asking_price: { source: 'property', field: 'asking_price', description: 'Asking price' },
    arv: { source: 'property', field: 'arv', description: 'After repair value' },
    earnest_money: { source: 'property', field: 'earnest_money', description: 'Earnest money deposit' },
    closing_date: { source: 'property', field: 'purchase_contract_expiration', description: 'Closing date' },
    contract_date: { source: 'property', field: 'created_at', description: 'Contract creation date' },
    today_date: { source: 'computed', field: '_today', description: 'Current date' },
    llc_name: { source: 'llcProfile', field: 'legal_name', description: 'LLC legal name' },
    llc_ein: { source: 'llcProfile', field: 'ein', description: 'LLC EIN' },
    wholesaler_name: { source: 'computed', field: '_wholesaler_full_name', description: 'Wholesaler full name' },
    wholesaler_email: { source: 'property', field: 'wholesaler_email', description: 'Wholesaler email' },
    buyer_name: { source: 'llcProfile', field: 'legal_name', description: 'Buyer/LLC name' },
    seller_name: { source: 'contacts', field: 'seller_name', description: 'Seller name' },
    seller_email: { source: 'contacts', field: 'seller_email', description: 'Seller email' },
    seller_phone: { source: 'contacts', field: 'seller_phone', description: 'Seller phone' },
    assignee_name: { source: 'computed', field: '_assignee_name', description: 'End buyer/assignee name' },
    assignee_email: { source: 'computed', field: '_assignee_email', description: 'End buyer/assignee email' },
    assignment_fee: { source: 'property', field: 'assignment_fee', description: 'Assignment fee' },
  };

  const transforms = [
    { name: 'currency', description: 'Format as currency ($250,000)', example: '250000 → $250,000' },
    { name: 'date', description: 'Format as long date', example: '2026-01-19 → January 19, 2026' },
    { name: 'date_short', description: 'Format as short date', example: '2026-01-19 → 1/19/2026' },
    { name: 'uppercase', description: 'Convert to uppercase', example: 'john doe → JOHN DOE' },
    { name: 'lowercase', description: 'Convert to lowercase', example: 'JOHN DOE → john doe' },
    { name: 'phone', description: 'Format as phone number', example: '5551234567 → (555) 123-4567' },
  ];

  const sources = [
    { name: 'property', description: 'Property/deal fields' },
    { name: 'llcProfile', description: 'LLC/company profile' },
    { name: 'contacts', description: 'Property contacts (seller, buyer, etc.)' },
    { name: 'pipeline', description: 'Pipeline/deal flow data' },
    { name: 'compliance', description: 'Compliance record data' },
    { name: 'ocrData', description: 'OCR-extracted document data' },
    { name: 'computed', description: 'Computed/special fields (prefixed with _)' },
  ];

  res.json({
    success: true,
    data: {
      defaultMappings,
      transforms,
      sources,
    },
  });
}

/**
 * Update field mappings for a template
 */
export async function updateFieldMappings(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { fieldMappings } = req.body;

    const template = await StateDocumentTemplate.findByPk(parseInt(id));

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    await template.update({ fieldMappings });

    res.json({
      success: true,
      data: template,
      message: 'Field mappings updated successfully',
    });
  } catch (error) {
    console.error('Error updating field mappings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update field mappings',
    });
  }
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk update DocuSeal template IDs
 */
export async function bulkAssignTemplates(req: Request, res: Response) {
  try {
    const { assignments } = req.body;

    if (!Array.isArray(assignments)) {
      return res.status(400).json({
        success: false,
        error: 'assignments must be an array of { id, docuSealTemplateId }',
      });
    }

    const results: any[] = [];

    for (const { id, docuSealTemplateId } of assignments) {
      try {
        const template = await StateDocumentTemplate.findByPk(id);
        if (template) {
          await template.update({ docuSealTemplateId });
          results.push({ id, success: true, name: template.name });
        } else {
          results.push({ id, success: false, error: 'Not found' });
        }
      } catch (e) {
        results.push({ id, success: false, error: (e as Error).message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      data: results,
      message: `Updated ${successCount} of ${assignments.length} templates`,
    });
  } catch (error) {
    console.error('Error bulk assigning templates:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to bulk assign templates',
    });
  }
}

/**
 * Get template summary by state
 */
export async function getTemplateSummary(req: Request, res: Response) {
  try {
    const [results] = await sequelize.query(`
      SELECT
        state,
        COUNT(*) as total,
        COUNT(CASE WHEN docu_seal_template_id > 0 THEN 1 END) as configured,
        COUNT(CASE WHEN enabled = true THEN 1 END) as enabled,
        COUNT(CASE WHEN auto_send = true THEN 1 END) as auto_send,
        array_agg(DISTINCT phase ORDER BY phase) as phases
      FROM state_document_templates
      GROUP BY state
      ORDER BY state
    `);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Error getting template summary:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get summary',
    });
  }
}

// ============================================================================
// CATEGORIES & ENUMS
// ============================================================================

/**
 * Get available categories, triggers, and signer roles
 */
export async function getTemplateOptions(req: Request, res: Response) {
  const categories: { value: DocumentCategory; label: string; description: string }[] = [
    { value: 'csa', label: 'CSA', description: 'Client Services Agreement' },
    { value: 'msa', label: 'MSA', description: 'Marketing Services Agreement' },
    { value: 'asa', label: 'ASA', description: 'Auction Services Agreement' },
    { value: 'purchase_contract', label: 'Purchase Contract', description: 'Purchase & Sale Agreement' },
    { value: 'assignment_addendum', label: 'Assignment Addendum', description: 'Assignment of Contract' },
    { value: 'seller_disclosure', label: 'Seller Disclosure', description: 'Seller Property Disclosure' },
    { value: 'wholesaler_disclosure', label: 'Wholesaler Disclosure', description: 'Wholesaler Position Disclosure' },
    { value: 'equity_disclosure', label: 'Equity Disclosure', description: 'Equity Position Disclosure' },
    { value: 'seller_acknowledgment', label: 'Seller Acknowledgment', description: 'Seller Assignment Acknowledgment' },
    { value: 'cancellation_disclosure', label: 'Cancellation Disclosure', description: '3-Day Cancellation Rights' },
    { value: 'double_close_psa', label: 'Double Close PSA', description: 'PSA for Double Closing' },
    { value: 'settlement_statement', label: 'Settlement Statement', description: 'Settlement/Closing Statement' },
    { value: 'lead_paint', label: 'Lead Paint', description: 'Lead-Based Paint Disclosure' },
    { value: 'hoa_disclosure', label: 'HOA Disclosure', description: 'HOA Disclosure' },
    { value: 'proof_of_funds', label: 'Proof of Funds', description: 'POF Letter' },
    { value: 'offer_letter', label: 'Offer Letter', description: 'Letter of Intent' },
    { value: 'jv_agreement', label: 'JV Agreement', description: 'Joint Venture Agreement' },
    { value: 'other', label: 'Other', description: 'Other document type' },
  ];

  const triggers: { value: TriggerOn; label: string; description: string }[] = [
    { value: 'phase_enter', label: 'Phase Enter', description: 'Send when entering the phase' },
    { value: 'phase_complete', label: 'Phase Complete', description: 'Send when completing the phase' },
    { value: 'manual', label: 'Manual', description: 'Only send manually' },
  ];

  const signerRoles: { value: SignerRole; label: string; description: string }[] = [
    { value: 'seller', label: 'Seller', description: 'Property seller' },
    { value: 'buyer', label: 'Buyer', description: 'End buyer/assignee' },
    { value: 'wholesaler', label: 'Wholesaler', description: 'Your company/LLC' },
    { value: 'broker', label: 'Broker', description: 'Real estate broker' },
  ];

  const phases = [
    { value: 0, label: 'Phase 0', description: 'Account Setup & Entity Verification' },
    { value: 1, label: 'Phase 1', description: 'Property Submission' },
    { value: 2, label: 'Phase 2', description: 'Compliance Review & Approval' },
    { value: 3, label: 'Phase 3', description: 'Approved / Pre-Distribution' },
    { value: 4, label: 'Phase 4', description: 'Offer Accepted (3-Day Hold)' },
    { value: 5, label: 'Phase 5', description: 'Buyer Contract Execution' },
    { value: 6, label: 'Phase 6', description: 'Title, Closing & Settlement' },
  ];

  res.json({
    success: true,
    data: {
      categories,
      triggers,
      signerRoles,
      phases,
    },
  });
}

// ============================================================================
// PREVIEW & TEST
// ============================================================================

/**
 * Sample data for template preview
 */
const SAMPLE_DATA = {
  property: {
    address: '123 Main Street',
    city: 'Oklahoma City',
    state: 'OK',
    zip_code: '73101',
    county: 'Oklahoma',
    purchase_contract_price: 175000,
    asking_price: 195000,
    arv: 250000,
    earnest_money: 2500,
    assignment_fee: 20000,
    purchase_contract_expiration: '2026-02-28',
    created_at: '2026-01-15',
    wholesaler_email: 'deals@example.com',
    seller_name: 'John & Jane Doe',
    seller_email: 'seller@example.com',
    seller_phone: '(405) 555-1234',
  },
  llcProfile: {
    legal_name: 'ABC Investments LLC',
    ein: '12-3456789',
    state_of_formation: 'Oklahoma',
    authorized_signer_name: 'Michael Johnson',
    authorized_signer_email: 'michael@abcinvestments.com',
  },
  contacts: {
    seller_name: 'John & Jane Doe',
    seller_email: 'seller@example.com',
    seller_phone: '(405) 555-1234',
  },
  pipeline: {
    _assignee_name: 'Buyer Corp LLC',
    _assignee_email: 'buyer@buyercorp.com',
  },
  compliance: {
    contract_acceptance_date: '2026-01-20',
    cancellation_deadline: '2026-01-23',
  },
  computed: {
    _full_address: '123 Main Street, Oklahoma City, OK 73101',
    _today: new Date().toISOString().split('T')[0],
    _wholesaler_full_name: 'Michael Johnson',
    _assignee_name: 'Buyer Corp LLC',
    _assignee_email: 'buyer@buyercorp.com',
  },
};

/**
 * Apply transforms to a value
 */
function applyTransform(value: any, transform?: string): string {
  if (value === null || value === undefined) return '';

  switch (transform) {
    case 'currency':
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value));
    case 'date':
      return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    case 'date_short':
      return new Date(value).toLocaleDateString('en-US');
    case 'uppercase':
      return String(value).toUpperCase();
    case 'lowercase':
      return String(value).toLowerCase();
    case 'phone':
      const digits = String(value).replace(/\D/g, '');
      if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      }
      return String(value);
    default:
      return String(value);
  }
}

/**
 * Get default mapping for common field names
 */
function getDefaultMappingForField(fieldName: string): { source: string; field: string; transform?: string } | null {
  const normalizedName = fieldName.toLowerCase().replace(/[_\s-]/g, '');

  const defaults: Record<string, { source: string; field: string; transform?: string }> = {
    propertyaddress: { source: 'computed', field: '_full_address' },
    address: { source: 'property', field: 'address' },
    streetaddress: { source: 'property', field: 'address' },
    city: { source: 'property', field: 'city' },
    state: { source: 'property', field: 'state' },
    zip: { source: 'property', field: 'zip_code' },
    zipcode: { source: 'property', field: 'zip_code' },
    county: { source: 'property', field: 'county' },
    purchaseprice: { source: 'property', field: 'purchase_contract_price', transform: 'currency' },
    askingprice: { source: 'property', field: 'asking_price', transform: 'currency' },
    arv: { source: 'property', field: 'arv', transform: 'currency' },
    earnestmoney: { source: 'property', field: 'earnest_money', transform: 'currency' },
    assignmentfee: { source: 'property', field: 'assignment_fee', transform: 'currency' },
    closingdate: { source: 'property', field: 'purchase_contract_expiration', transform: 'date' },
    todaydate: { source: 'computed', field: '_today', transform: 'date' },
    today: { source: 'computed', field: '_today', transform: 'date' },
    date: { source: 'computed', field: '_today', transform: 'date' },
    llcname: { source: 'llcProfile', field: 'legal_name' },
    companyname: { source: 'llcProfile', field: 'legal_name' },
    buyername: { source: 'llcProfile', field: 'legal_name' },
    wholesalername: { source: 'computed', field: '_wholesaler_full_name' },
    sellername: { source: 'contacts', field: 'seller_name' },
    selleremail: { source: 'contacts', field: 'seller_email' },
    sellerphone: { source: 'contacts', field: 'seller_phone', transform: 'phone' },
    assigneename: { source: 'computed', field: '_assignee_name' },
    assigneeemail: { source: 'computed', field: '_assignee_email' },
  };

  return defaults[normalizedName] || null;
}

/**
 * Resolve a field value from sample data
 */
function resolveFieldValue(source: string, field: string, transform?: string): string {
  const sourceData = (SAMPLE_DATA as any)[source];
  if (!sourceData) return `[Unknown source: ${source}]`;

  const value = sourceData[field];
  if (value === undefined) return `[Unknown field: ${source}.${field}]`;

  return applyTransform(value, transform);
}

/**
 * Generate preview data for a template
 */
export async function previewTemplate(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const template = await StateDocumentTemplate.findByPk(parseInt(id));

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Get DocuSeal template fields if assigned
    let docuSealFields: Array<{ name: string; type: string; required: boolean }> = [];
    if (template.docuSealTemplateId && docuSealService.isReady()) {
      try {
        const dsTemplate = await docuSealService.getTemplate(template.docuSealTemplateId);
        docuSealFields = dsTemplate.fields?.map((f: any) => ({
          name: f.name || '',
          type: f.type || 'text',
          required: f.required || false,
        })) || [];
      } catch (e) {
        // Ignore - just won't have fields
      }
    }

    // Build preview data
    const fieldMappings = template.fieldMappings || {};
    const previewData: Record<string, { value: string; mapped: boolean; source?: string; field?: string }> = {};
    const unmappedFields: Array<{ name: string; type: string; required: boolean }> = [];
    const mappingWarnings: string[] = [];

    for (const dsField of docuSealFields) {
      const fieldName = dsField.name;
      if (!fieldName) continue;

      const mapping = fieldMappings[fieldName];

      if (mapping) {
        // Has custom mapping
        const source = typeof mapping === 'string' ? 'auto' : mapping.source;
        const field = typeof mapping === 'string' ? mapping : mapping.field;
        const transform = typeof mapping === 'object' ? mapping.transform : undefined;

        const value = resolveFieldValue(source === 'auto' ? 'computed' : source, field, transform);
        previewData[fieldName] = {
          value,
          mapped: true,
          source,
          field,
        };
      } else {
        // No mapping - check defaults
        const defaultMapping = getDefaultMappingForField(fieldName);
        if (defaultMapping) {
          const value = resolveFieldValue(defaultMapping.source, defaultMapping.field, defaultMapping.transform);
          previewData[fieldName] = {
            value,
            mapped: true,
            source: defaultMapping.source,
            field: defaultMapping.field,
          };
        } else {
          previewData[fieldName] = {
            value: '',
            mapped: false,
          };
          unmappedFields.push(dsField);
          if (dsField.required) {
            mappingWarnings.push(`Required field "${fieldName}" has no mapping configured`);
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        template: {
          id: template.id,
          name: template.name,
          category: template.category,
          docuSealTemplateId: template.docuSealTemplateId,
        },
        preview: previewData,
        unmappedFields,
        warnings: mappingWarnings,
        sampleData: SAMPLE_DATA,
      },
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate preview',
    });
  }
}

/**
 * Send a test contract with sample data
 */
export async function testSendTemplate(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { recipientEmail } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({
        success: false,
        error: 'recipientEmail is required',
      });
    }

    const template = await StateDocumentTemplate.findByPk(parseInt(id));

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    if (!template.docuSealTemplateId) {
      return res.status(400).json({
        success: false,
        error: 'No DocuSeal template assigned',
      });
    }

    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
      });
    }

    // Build field values from sample data
    const fieldMappings = template.fieldMappings || {};
    const values: Record<string, string> = {};

    // Get DocuSeal template fields
    const dsTemplate = await docuSealService.getTemplate(template.docuSealTemplateId);
    const docuSealFields = dsTemplate.fields || [];

    for (const dsField of docuSealFields) {
      const fieldName = dsField.name;
      if (!fieldName) continue;

      const mapping = fieldMappings[fieldName];

      if (mapping) {
        const source = typeof mapping === 'string' ? 'auto' : mapping.source;
        const field = typeof mapping === 'string' ? mapping : mapping.field;
        const transform = typeof mapping === 'object' ? mapping.transform : undefined;

        values[fieldName] = resolveFieldValue(source === 'auto' ? 'computed' : source, field, transform);
      } else {
        const defaultMapping = getDefaultMappingForField(fieldName);
        if (defaultMapping) {
          values[fieldName] = resolveFieldValue(defaultMapping.source, defaultMapping.field, defaultMapping.transform);
        } else {
          values[fieldName] = `[TEST: ${fieldName}]`;
        }
      }
    }

    // Create test submission
    const submission = await docuSealService.createSubmissionFromTemplate(template.docuSealTemplateId, {
      submitters: [
        {
          email: recipientEmail,
          role: 'Test Recipient',
          fields: Object.entries(values).map(([name, value]) => ({
            name,
            default_value: value,
          })),
        },
      ],
      send_email: true,
      message: `[TEST] This is a test submission for template "${template.name}". This document is for testing purposes only and has no legal effect.`,
    });

    res.json({
      success: true,
      data: {
        submissionId: submission.id,
        templateId: template.id,
        templateName: template.name,
        recipientEmail,
        fieldValues: values,
      },
      message: `Test contract sent to ${recipientEmail}`,
    });
  } catch (error) {
    console.error('Error sending test contract:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test contract',
    });
  }
}

/**
 * Validate field mappings for a template
 */
export async function validateMappings(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const template = await StateDocumentTemplate.findByPk(parseInt(id));

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    const warnings: Array<{ level: 'error' | 'warning' | 'info'; field?: string; message: string }> = [];

    // Check if DocuSeal template is assigned
    if (!template.docuSealTemplateId) {
      warnings.push({
        level: 'error',
        message: 'No DocuSeal template assigned',
      });
      return res.json({ success: true, data: { valid: false, warnings } });
    }

    // Get DocuSeal template fields
    if (!docuSealService.isReady()) {
      warnings.push({
        level: 'warning',
        message: 'DocuSeal service not available - cannot validate field mappings',
      });
      return res.json({ success: true, data: { valid: true, warnings } });
    }

    let docuSealFields: Array<{ name: string; type: string; required: boolean }> = [];
    try {
      const dsTemplate = await docuSealService.getTemplate(template.docuSealTemplateId);
      docuSealFields = dsTemplate.fields?.map((f: any) => ({
        name: f.name || '',
        type: f.type || 'text',
        required: f.required || false,
      })) || [];
    } catch (e) {
      warnings.push({
        level: 'warning',
        message: `Could not fetch DocuSeal template: ${(e as Error).message}`,
      });
      return res.json({ success: true, data: { valid: true, warnings } });
    }

    const fieldMappings = template.fieldMappings || {};

    // Check each DocuSeal field
    for (const dsField of docuSealFields) {
      const fieldName = dsField.name;
      if (!fieldName) continue;

      const mapping = fieldMappings[fieldName];
      const defaultMapping = getDefaultMappingForField(fieldName);

      if (!mapping && !defaultMapping) {
        if (dsField.required) {
          warnings.push({
            level: 'error',
            field: fieldName,
            message: `Required field "${fieldName}" has no mapping`,
          });
        } else {
          warnings.push({
            level: 'warning',
            field: fieldName,
            message: `Optional field "${fieldName}" has no mapping`,
          });
        }
      }

      // Check for signature fields
      if (dsField.type === 'signature' && (mapping || defaultMapping)) {
        warnings.push({
          level: 'info',
          field: fieldName,
          message: `Signature field "${fieldName}" will be signed by the recipient`,
        });
      }
    }

    // Check for mappings to fields that don't exist
    for (const mappedField of Object.keys(fieldMappings)) {
      const exists = docuSealFields.some(f => f.name === mappedField);
      if (!exists) {
        warnings.push({
          level: 'warning',
          field: mappedField,
          message: `Mapping exists for "${mappedField}" but field not found in DocuSeal template`,
        });
      }
    }

    const hasErrors = warnings.some(w => w.level === 'error');

    res.json({
      success: true,
      data: {
        valid: !hasErrors,
        warnings,
        summary: {
          total: docuSealFields.length,
          mapped: docuSealFields.filter(f => fieldMappings[f.name || ''] || getDefaultMappingForField(f.name || '')).length,
          required: docuSealFields.filter(f => f.required).length,
          errors: warnings.filter(w => w.level === 'error').length,
          warnings: warnings.filter(w => w.level === 'warning').length,
        },
      },
    });
  } catch (error) {
    console.error('Error validating mappings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate mappings',
    });
  }
}

/**
 * Get template document preview (PDF URL)
 */
export async function getTemplateDocument(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const template = await StateDocumentTemplate.findByPk(parseInt(id));

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    if (!template.docuSealTemplateId) {
      return res.status(400).json({
        success: false,
        error: 'No DocuSeal template assigned',
      });
    }

    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
      });
    }

    // Get the DocuSeal template with documents
    const dsTemplate = await docuSealService.getTemplateDocuments(template.docuSealTemplateId);
    const baseUrl = docuSealService.getBaseUrl();

    res.json({
      success: true,
      data: {
        templateId: template.id,
        docuSealTemplateId: template.docuSealTemplateId,
        name: template.name,
        documents: dsTemplate.documents,
        // Build editor URL for direct access
        editorUrl: `${baseUrl}/templates/${template.docuSealTemplateId}`,
      },
    });
  } catch (error) {
    console.error('Error getting template document:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get template document',
    });
  }
}

export default {
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
};
