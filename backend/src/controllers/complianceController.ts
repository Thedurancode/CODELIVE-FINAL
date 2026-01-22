/**
 * Compliance Controller
 *
 * API endpoints for managing state-specific compliance rules
 * and running compliance checks on properties.
 *
 * SECURITY:
 * - All write operations require admin role (enforced in routes)
 * - All changes are logged to ComplianceAuditLog for audit trail
 * - Input validation prevents mass assignment attacks
 */

import { Request, Response } from 'express';
import { createHash } from 'crypto';
import StateComplianceRule from '../models/StateComplianceRule';
import StateKnowledge from '../models/StateKnowledge';
import StateDocumentTemplate from '../models/StateDocumentTemplate';
import ComplianceAuditLog from '../models/ComplianceAuditLog';
import ComplianceCheck from '../models/ComplianceCheck';
import ComplianceIssueReview from '../models/ComplianceIssueReview';
import ComplianceExtractionProfile from '../models/ComplianceExtractionProfile';
import Property from '../models/Property';
import PropertyDocument, { DocumentType } from '../models/PropertyDocument';
import DocuSealSubmission, { SubmissionStatus, SubmitterRecord } from '../models/DocuSealSubmission';
import { complianceService } from '../services/ComplianceService';
import { docuSealService } from '../services/DocuSealService';
import { supabaseStorageService } from '../services/SupabaseStorageService';
import { soc2AuditLogger } from '../services/SOC2AuditLogger';
import sequelize from '../config/database';
import { buildPropertyFields } from '../utils/documentFields';

function scheduleRuleRecheck(state: string, reason: string, requestedBy?: string) {
  const normalizedState = state?.toUpperCase?.() || 'ALL';
  complianceService.scheduleRecheckPropertiesForState(normalizedState, {
    reason,
    requestedBy,
  });
}

function scheduleRuleRecheckForStates(states: Array<string | undefined>, reason: string, requestedBy?: string) {
  const uniqueStates = new Set(
    states.filter(Boolean).map(state => (state as string).toUpperCase())
  );

  if (uniqueStates.size === 0) {
    uniqueStates.add('ALL');
  }

  uniqueStates.forEach(state => scheduleRuleRecheck(state, reason, requestedBy));
}

function formatContractOcrSummary(ocr: any): null | {
  success: boolean;
  confidence: number;
  extractedFields: Record<string, any>;
  fieldEvidence?: Record<string, any>;
  pageCount?: number;
  processedAt?: string;
  source?: string;
  model?: string;
  error?: string;
} {
  if (!ocr || typeof ocr !== 'object') {
    return null;
  }

  const confidence = typeof ocr.confidence === 'number'
    ? ocr.confidence
    : Number(ocr.confidence || 0);

  return {
    success: !!ocr.success,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    extractedFields: ocr.extractedFields || {},
    fieldEvidence: ocr.fieldEvidence || {},
    pageCount: typeof ocr.pageCount === 'number' ? ocr.pageCount : undefined,
    processedAt: ocr.processedAt,
    source: ocr.source,
    model: ocr.model,
    error: ocr.error,
  };
}

/**
 * @swagger
 * /api/compliance/rules:
 *   get:
 *     summary: Get all compliance rules
 *     tags: [Compliance]
 *     parameters:
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Filter by state code (e.g., TX, CA, FL)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category (contract, disclosure, licensing)
 *       - in: query
 *         name: enabled
 *         schema:
 *           type: boolean
 *         description: Filter by enabled status
 *     responses:
 *       200:
 *         description: List of compliance rules
 */
export async function getRules(req: Request, res: Response) {
  try {
    const { state, category, enabled } = req.query;

    const where: any = {};
    if (state) where.state = String(state).toUpperCase();
    if (category) where.category = category;
    if (enabled !== undefined) where.enabled = enabled === 'true';

    const rules = await StateComplianceRule.findAll({
      where,
      order: [['state', 'ASC'], ['order', 'ASC']],
    });

    res.json({
      success: true,
      data: rules,
      count: rules.length,
    });
  } catch (error) {
    console.error('Error fetching compliance rules:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch rules',
    });
  }
}

/**
 * @swagger
 * /api/compliance/rules/{id}:
 *   get:
 *     summary: Get a specific compliance rule
 *     tags: [Compliance]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Compliance rule details
 */
export async function getRule(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const rule = await StateComplianceRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found',
      });
    }

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('Error fetching compliance rule:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch rule',
    });
  }
}

/**
 * @swagger
 * /api/compliance/rules:
 *   post:
 *     summary: Create a new compliance rule
 *     tags: [Compliance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - state
 *               - name
 *               - category
 *               - field
 *               - operator
 *               - severity
 *               - message
 *             properties:
 *               state:
 *                 type: string
 *                 description: State code (e.g., TX, CA) or ALL for universal
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [contract, disclosure, licensing, general]
 *               field:
 *                 type: string
 *                 description: Property field to check
 *               operator:
 *                 type: string
 *                 enum: [required, equals, not_equals, contains, min_value, max_value, min_days_until, max_days_until, regex, in_list, not_in_list, is_true, is_false]
 *               value:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [critical, warning, info]
 *               message:
 *                 type: string
 *               enabled:
 *                 type: boolean
 *               order:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Rule created
 */
export async function createRule(req: Request, res: Response) {
  try {
    const {
      state,
      name,
      description,
      category,
      field,
      operator,
      value,
      severity,
      severityOverrides,
      message,
      enabled = true,
      order = 100,
    } = req.body;

    // Validate required fields
    if (!state || !name || !category || !field || !operator || !severity || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: state, name, category, field, operator, severity, message',
      });
    }

    const rule = await StateComplianceRule.create({
      state: state.toUpperCase(),
      name,
      description,
      category,
      field,
      operator,
      value,
      severity,
      severityOverrides,
      message,
      enabled,
      order,
    });

    // AUDIT: Log the creation
    if (req.user) {
      await ComplianceAuditLog.logRuleChange(
        String(rule.id),
        'created',
        { id: req.user.id, name: req.user.email, type: 'user' },
        { after: rule.toJSON() }
      );
    }

    scheduleRuleRecheck(rule.state, 'rule_created', req.user?.email);

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('Error creating compliance rule:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create rule',
    });
  }
}

/**
 * @swagger
 * /api/compliance/rules/{id}:
 *   put:
 *     summary: Update a compliance rule
 *     tags: [Compliance]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Rule updated
 */
export async function updateRule(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const rule = await StateComplianceRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found',
      });
    }

    // Capture previous state for audit log
    const previousValue = rule.toJSON();

    const {
      state,
      name,
      description,
      category,
      field,
      operator,
      value,
      severity,
      severityOverrides,
      message,
      enabled,
      order,
    } = req.body;

    // SECURITY: Warn when disabling critical rules
    if (rule.severity === 'critical' && enabled === false) {
      console.warn(`⚠️ CRITICAL RULE BEING DISABLED: ${rule.name} by ${req.user?.email}`);
    }

    await rule.update({
      ...(state && { state: state.toUpperCase() }),
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(category && { category }),
      ...(field && { field }),
      ...(operator && { operator }),
      ...(value !== undefined && { value }),
      ...(severity && { severity }),
      ...(severityOverrides !== undefined && { severityOverrides }),
      ...(message && { message }),
      ...(enabled !== undefined && { enabled }),
      ...(order !== undefined && { order }),
    });

    // AUDIT: Log the update
    if (req.user) {
      await ComplianceAuditLog.logRuleChange(
        String(rule.id),
        'updated',
        { id: req.user.id, name: req.user.email, type: 'user' },
        { before: previousValue, after: rule.toJSON() }
      );
    }

    scheduleRuleRecheckForStates([previousValue.state, rule.state], 'rule_updated', req.user?.email);

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('Error updating compliance rule:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update rule',
    });
  }
}

/**
 * @swagger
 * /api/compliance/rules/{id}:
 *   delete:
 *     summary: Delete a compliance rule
 *     tags: [Compliance]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Rule deleted
 */
export async function deleteRule(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const rule = await StateComplianceRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found',
      });
    }

    // Capture data before deletion for audit log
    const previousValue = rule.toJSON();
    const ruleName = rule.name;
    const ruleId = rule.id;

    // SECURITY: Warn when deleting critical rules
    if (rule.severity === 'critical') {
      console.warn(`⚠️ CRITICAL RULE BEING DELETED: ${rule.name} by ${req.user?.email}`);
    }

    await rule.destroy();

    // AUDIT: Log the deletion
    if (req.user) {
      await ComplianceAuditLog.logRuleChange(
        String(ruleId),
        'deleted',
        { id: req.user.id, name: req.user.email, type: 'user' },
        { before: previousValue }
      );
    }

    scheduleRuleRecheck(previousValue.state, 'rule_deleted', req.user?.email);

    res.json({
      success: true,
      message: 'Rule deleted',
    });
  } catch (error) {
    console.error('Error deleting compliance rule:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete rule',
    });
  }
}

/**
 * @swagger
 * /api/compliance/states:
 *   get:
 *     summary: Get all states with configured rules
 *     tags: [Compliance]
 *     responses:
 *       200:
 *         description: List of state codes
 */
export async function getConfiguredStates(req: Request, res: Response) {
  try {
    const states = await complianceService.getConfiguredStates();

    res.json({
      success: true,
      data: states,
      count: states.length,
    });
  } catch (error) {
    console.error('Error fetching configured states:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch states',
    });
  }
}

/**
 * @swagger
 * /api/compliance/check/{propertyId}:
 *   post:
 *     summary: Run compliance check on a property
 *     tags: [Compliance]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Compliance check results
 */
export async function checkProperty(req: Request, res: Response) {
  try {
    const { propertyId } = req.params;
    const { transactionType, dealStage, brokerStatus, priorViolations, autoRemediate, includeEvidence } = req.body || {};

    const property = await Property.findByPk(propertyId);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    const result = await complianceService.checkProperty(property, {
      transactionType,
      dealStage,
      brokerStatus,
      priorViolations,
      autoRemediate,
      includeEvidence: includeEvidence !== false,
    });

    // Update property with results
    await property.update({
      status: result.status,
      complianceNotes: result.issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error checking property compliance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check compliance',
    });
  }
}

/**
 * @swagger
 * /api/compliance/freshness/{propertyId}:
 *   get:
 *     summary: Check compliance freshness for a property
 *     tags: [Compliance]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Compliance freshness details
 */
export async function getComplianceFreshness(req: Request, res: Response) {
  try {
    const { propertyId } = req.params;
    const property = await Property.findByPk(propertyId);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    const freshness = await complianceService.getComplianceFreshness(property);

    res.json({
      success: true,
      data: freshness,
      property: summarizeProperty(property),
    });
  } catch (error) {
    console.error('Error fetching compliance freshness:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch compliance freshness',
    });
  }
}

/**
 * @swagger
 * /api/compliance/checks/latest/{propertyId}:
 *   get:
 *     summary: Get the latest compliance check for a property
 *     tags: [Compliance]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Latest compliance check summary
 */
export async function getLatestComplianceCheck(req: Request, res: Response) {
  try {
    const { propertyId } = req.params;
    const property = await Property.findByPk(propertyId);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    const latestCheck = await ComplianceCheck.findOne({
      where: { propertyId: property.id },
      order: [['checkedAt', 'DESC']],
    });

    if (!latestCheck) {
      return res.json({
        success: true,
        data: null,
      });
    }

    const contractOcr = formatContractOcrSummary((latestCheck.evidenceSnapshot as any)?.contractOcr);

    res.json({
      success: true,
      data: {
        id: latestCheck.id,
        propertyId: latestCheck.propertyId,
        status: latestCheck.status,
        checkedAt: latestCheck.checkedAt,
        issuesCount: Array.isArray(latestCheck.issues) ? latestCheck.issues.length : 0,
        ruleVersionHash: latestCheck.ruleVersionHash,
        contractOcr,
      },
    });
  } catch (error) {
    console.error('Error fetching latest compliance check:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch latest compliance check',
    });
  }
}

/**
 * @swagger
 * /api/compliance/checks/{checkId}:
 *   get:
 *     summary: Get a compliance check by ID
 *     tags: [Compliance]
 */
export async function getComplianceCheck(req: Request, res: Response) {
  try {
    const { checkId } = req.params;
    const check = await ComplianceCheck.findByPk(checkId);

    if (!check) {
      return res.status(404).json({
        success: false,
        error: 'Compliance check not found',
      });
    }

    const property = await Property.findByPk(check.propertyId);
    const data = check.toJSON() as any;

    if (Array.isArray(data.issues)) {
      data.issues = data.issues.map((issue: any) => {
        if (issue.issueId) return issue;
        return {
          ...issue,
          issueId: buildIssueId(issue),
        };
      });
    }

    res.json({
      success: true,
      data,
      property: property ? summarizeProperty(property) : undefined,
    });
  } catch (error) {
    console.error('Error fetching compliance check:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch compliance check',
    });
  }
}

/**
 * @swagger
 * /api/compliance/checks/{checkId}/reviews:
 *   get:
 *     summary: Get compliance issue reviews for a check
 *     tags: [Compliance]
 */
export async function getComplianceIssueReviews(req: Request, res: Response) {
  try {
    const { checkId } = req.params;
    const reviews = await ComplianceIssueReview.findAll({
      where: { checkId: Number(checkId) },
      order: [['updatedAt', 'DESC']],
    });

    res.json({
      success: true,
      data: reviews,
      count: reviews.length,
    });
  } catch (error) {
    console.error('Error fetching compliance issue reviews:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch compliance issue reviews',
    });
  }
}

/**
 * @swagger
 * /api/compliance/checks/{checkId}/issues/{issueId}/review:
 *   post:
 *     summary: Review a compliance issue
 *     tags: [Compliance]
 */
export async function reviewComplianceIssue(req: Request, res: Response) {
  try {
    const { checkId, issueId } = req.params;
    const { decision, notes, overrideSeverity, overrideMessage } = req.body || {};

    const check = await ComplianceCheck.findByPk(checkId);
    if (!check) {
      return res.status(404).json({
        success: false,
        error: 'Compliance check not found',
      });
    }

    const issues = Array.isArray(check.issues) ? check.issues : [];
    const normalizedIssues = issues.map((issue: any) => ({
      ...issue,
      issueId: issue.issueId || buildIssueId(issue),
    }));
    const matchedIssue = normalizedIssues.find((issue) => issue.issueId === issueId);

    if (!matchedIssue) {
      return res.status(404).json({
        success: false,
        error: 'Issue not found for this compliance check',
      });
    }

    if (decision === 'overridden' && !overrideSeverity && !overrideMessage) {
      return res.status(400).json({
        success: false,
        error: 'overrideSeverity or overrideMessage is required when overriding an issue',
      });
    }

    const [review, created] = await ComplianceIssueReview.findOrCreate({
      where: { checkId: check.id, issueId },
      defaults: {
        propertyId: check.propertyId,
        checkId: check.id,
        issueId,
        ruleId: matchedIssue.ruleId ?? null,
        decision,
        notes,
        overrideSeverity: overrideSeverity || null,
        overrideMessage: overrideMessage || null,
        reviewerId: req.user?.id,
        reviewerEmail: req.user?.email,
      },
    });

    if (!created) {
      await review.update({
        ruleId: matchedIssue.ruleId ?? null,
        decision,
        notes,
        overrideSeverity: overrideSeverity || null,
        overrideMessage: overrideMessage || null,
        reviewerId: req.user?.id,
        reviewerEmail: req.user?.email,
      });
    }

    soc2AuditLogger.logDecision(
      { type: 'compliance_issue', id: `${check.id}:${issueId}` },
      {
        type: 'user',
        id: req.user?.id,
        name: req.user?.email,
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
      },
      decision,
      'success',
      { propertyId: check.propertyId, checkId: check.id, ruleId: matchedIssue.ruleId?.toString() },
      {
        notes: notes || null,
        overrideSeverity: overrideSeverity || null,
        overrideMessage: overrideMessage || null,
      }
    );

    res.json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error('Error reviewing compliance issue:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to review compliance issue',
    });
  }
}

type AddressLookup = {
  houseNumber?: string;
  street: string;
  address2?: string;
  city?: string;
  state: string;
  zip?: string;
};

function normalizeAddressPart(value?: string | null): string {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeStreetAddress(houseNumber?: string | null, street?: string | null): string {
  return normalizeAddressPart(`${houseNumber || ''} ${street || ''}`.trim());
}

function summarizeProperty(property: Property) {
  const address = property.address || {};
  const street = `${address.houseNumber || ''} ${address.street || ''}`.trim();
  return {
    id: property.id,
    propertyId: property.propertyId,
    externalId: property.externalId,
    address: street || `Property ${property.id}`,
    city: property.city,
    state: property.state,
    zip: property.zip,
  };
}

function buildIssueId(issue: { ruleId: number; field: string; message: string; expectedValue?: string }) {
  const base = `${issue.ruleId}|${issue.field}|${issue.message}|${issue.expectedValue || ''}`;
  return createHash('sha256').update(base).digest('hex').substring(0, 16);
}

async function findPropertyByAddress(address: AddressLookup): Promise<Property[]> {
  const where: any = {
    state: address.state.toUpperCase(),
  };

  if (address.city) {
    where.city = address.city;
  }
  if (address.zip) {
    where.zip = address.zip;
  }

  const candidates = await Property.findAll({ where, limit: 25 });
  const normalizedStreet = normalizeAddressPart(address.street);
  const normalizedFull = normalizeStreetAddress(address.houseNumber, address.street);
  const normalizedAddress2 = normalizeAddressPart(address.address2);

  return candidates.filter((property) => {
    const propertyAddress = property.address || {};
    const propertyStreet = normalizeAddressPart(propertyAddress.street);
    const propertyFull = normalizeStreetAddress(propertyAddress.houseNumber, propertyAddress.street);
    const propertyAddress2 = normalizeAddressPart(propertyAddress.address2);

    if (address.houseNumber) {
      if (propertyFull !== normalizedFull) return false;
    } else if (propertyStreet !== normalizedStreet) {
      return false;
    }

    if (address.address2 && propertyAddress2 !== normalizedAddress2) {
      return false;
    }

    return true;
  });
}

/**
 * @swagger
 * /api/compliance/check/by-identifier:
 *   post:
 *     summary: Run compliance check by external ID or address
 *     tags: [Compliance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               externalId:
 *                 type: string
 *               propertyId:
 *                 type: string
 *               address:
 *                 type: object
 *                 properties:
 *                   houseNumber:
 *                     type: string
 *                   street:
 *                     type: string
 *                   address2:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zip:
 *                     type: string
 *     responses:
 *       200:
 *         description: Compliance check results
 */
export async function checkPropertyByIdentifier(req: Request, res: Response) {
  try {
    const { externalId, propertyId, address } = req.body as {
      externalId?: string;
      propertyId?: string;
      address?: AddressLookup;
    };
    const { transactionType, dealStage, brokerStatus, priorViolations, autoRemediate, includeEvidence } = req.body || {};

    let matches: Property[] = [];

    if (externalId) {
      matches = await Property.findAll({ where: { externalId }, limit: 5 });
    }

    if (matches.length === 0 && propertyId) {
      matches = await Property.findAll({ where: { propertyId }, limit: 5 });
    }

    if (matches.length === 0 && address) {
      matches = await findPropertyByAddress(address);
    }

    if (matches.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    if (matches.length > 1) {
      return res.status(409).json({
        success: false,
        error: 'Multiple properties matched. Provide a more specific identifier.',
        matches: matches.map(summarizeProperty),
      });
    }

    const property = matches[0];
    const result = await complianceService.checkProperty(property, {
      transactionType,
      dealStage,
      brokerStatus,
      priorViolations,
      autoRemediate,
      includeEvidence: includeEvidence !== false,
    });

    await property.update({
      status: result.status,
      complianceNotes: result.issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`),
    });

    res.json({
      success: true,
      data: result,
      property: summarizeProperty(property),
    });
  } catch (error) {
    console.error('Error checking property compliance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check compliance',
    });
  }
}

/**
 * @swagger
 * /api/compliance/documents/{propertyId}/requirements:
 *   get:
 *     summary: Get document requirements and status for a property
 *     tags: [Compliance]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *       - in: query
 *         name: transactionType
 *         schema:
 *           type: string
 *           enum: [wholesaling, retail, all]
 *         description: Transaction type to filter requirements
 *     responses:
 *       200:
 *         description: Document requirements with completion status
 */
export async function getPropertyDocumentRequirements(req: Request, res: Response) {
  try {
    const { propertyId } = req.params;
    const transactionType = (req.query.transactionType as 'wholesaling' | 'retail' | 'all') || 'wholesaling';

    const property = await Property.findByPk(propertyId);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    const result = await complianceService.checkDocumentRequirements(property, transactionType);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error checking document requirements:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check document requirements',
    });
  }
}

/**
 * @swagger
 * /api/compliance/documents/requirements/{state}:
 *   get:
 *     summary: Get document requirements for a state (without a specific property)
 *     tags: [Compliance]
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State code (e.g., TX, CA, FL)
 *       - in: query
 *         name: transactionType
 *         schema:
 *           type: string
 *           enum: [wholesaling, retail, all]
 *         description: Transaction type to filter requirements
 *     responses:
 *       200:
 *         description: Required document templates for the state
 */
export async function getStateDocumentRequirements(req: Request, res: Response) {
  try {
    const { state } = req.params;
    const transactionType = (req.query.transactionType as 'wholesaling' | 'retail' | 'all') || 'wholesaling';

    const templates = await complianceService.getDocumentRequirementsForState(state, transactionType);

    res.json({
      success: true,
      data: templates,
      count: templates.length,
    });
  } catch (error) {
    console.error('Error fetching state document requirements:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch document requirements',
    });
  }
}

/**
 * @swagger
 * /api/compliance/check/bulk:
 *   post:
 *     summary: Run compliance check on multiple properties
 *     tags: [Compliance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyIds
 *             properties:
 *               propertyIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 maxItems: 100
 *     responses:
 *       200:
 *         description: Compliance summary
 */
export async function checkBulk(req: Request, res: Response) {
  try {
    const { propertyIds } = req.body;

    // Validate input
    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'propertyIds array is required',
      });
    }

    // SECURITY: Limit array size to prevent DoS
    const MAX_BULK_SIZE = 100;
    if (propertyIds.length > MAX_BULK_SIZE) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${MAX_BULK_SIZE} properties per bulk check. Received: ${propertyIds.length}`,
      });
    }

    // Validate each ID is a positive integer
    const invalidIds = propertyIds.filter(id => typeof id !== 'number' || id <= 0 || !Number.isInteger(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'All propertyIds must be positive integers',
        invalidIds: invalidIds.slice(0, 5), // Show first 5 invalid
      });
    }

    const summary = await complianceService.getComplianceSummary(propertyIds);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error checking bulk compliance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check compliance',
    });
  }
}

/**
 * @swagger
 * /api/compliance/seed:
 *   post:
 *     summary: Seed default compliance rules
 *     tags: [Compliance]
 *     responses:
 *       200:
 *         description: Rules seeded
 */
export async function seedDefaultRules(req: Request, res: Response) {
  try {
    await complianceService.seedDefaultRules();

    const count = await StateComplianceRule.count();

    scheduleRuleRecheck('ALL', 'rules_seeded', req.user?.email);

    res.json({
      success: true,
      message: 'Default rules seeded',
      totalRules: count,
    });
  } catch (error) {
    console.error('Error seeding compliance rules:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to seed rules',
    });
  }
}

// ============================================================================
// KNOWLEDGE BASE ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/compliance/knowledge:
 *   get:
 *     summary: Get knowledge base entries
 *     tags: [Compliance]
 *     parameters:
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Filter by state code
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by type (law, regulation, form, etc.)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title, content, and tags
 *     responses:
 *       200:
 *         description: List of knowledge entries
 */
export async function getKnowledge(req: Request, res: Response) {
  try {
    const { state, type, search } = req.query;

    if (search) {
      const results = await StateKnowledge.search(
        String(search),
        state ? String(state) : undefined
      );
      return res.json({
        success: true,
        data: results,
        count: results.length,
      });
    }

    const where: any = { enabled: true };
    if (state) where.state = [String(state).toUpperCase(), 'ALL'];
    if (type) where.type = type;

    const knowledge = await StateKnowledge.findAll({
      where,
      order: [['priority', 'DESC'], ['type', 'ASC']],
    });

    res.json({
      success: true,
      data: knowledge,
      count: knowledge.length,
    });
  } catch (error) {
    console.error('Error fetching knowledge:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch knowledge',
    });
  }
}

/**
 * @swagger
 * /api/compliance/knowledge/{id}:
 *   get:
 *     summary: Get a specific knowledge entry
 *     tags: [Compliance]
 */
export async function getKnowledgeEntry(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const entry = await StateKnowledge.findByPk(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Knowledge entry not found',
      });
    }

    res.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    console.error('Error fetching knowledge entry:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch entry',
    });
  }
}

/**
 * @swagger
 * /api/compliance/knowledge:
 *   post:
 *     summary: Create a knowledge entry
 *     tags: [Compliance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - state
 *               - type
 *               - title
 *               - content
 *             properties:
 *               state:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [law, regulation, legal_requirement, form, license_info, fee_structure, timeline, disclosure, restriction, penalty, case_law, best_practice, contact, link, note]
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               summary:
 *                 type: string
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               sourceUrl:
 *                 type: string
 *               sourceName:
 *                 type: string
 *               priority:
 *                 type: integer
 */
export async function createKnowledge(req: Request, res: Response) {
  try {
    const {
      state,
      type,
      title,
      content,
      summary,
      category,
      tags,
      sourceUrl,
      sourceName,
      effectiveDate,
      expirationDate,
      priority = 50,
      enabled = true,
    } = req.body;

    if (!state || !type || !title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: state, type, title, content',
      });
    }

    const entry = await StateKnowledge.create({
      state: state.toUpperCase(),
      type,
      title,
      content,
      summary,
      category,
      tags,
      sourceUrl,
      sourceName,
      effectiveDate,
      expirationDate,
      priority,
      enabled,
    });

    res.status(201).json({
      success: true,
      data: entry,
    });
  } catch (error) {
    console.error('Error creating knowledge entry:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create entry',
    });
  }
}

/**
 * @swagger
 * /api/compliance/knowledge/{id}:
 *   put:
 *     summary: Update a knowledge entry
 *     tags: [Compliance]
 */
export async function updateKnowledge(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const entry = await StateKnowledge.findByPk(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Knowledge entry not found',
      });
    }

    // SECURITY: Whitelist allowed fields to prevent mass assignment
    const allowedFields = [
      'state', 'type', 'title', 'content', 'summary', 'category',
      'tags', 'sourceUrl', 'sourceName', 'effectiveDate', 'expirationDate',
      'priority', 'enabled'
    ] as const;

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'state' ? String(req.body[field]).toUpperCase() : req.body[field];
      }
    }

    await entry.update(updates);

    res.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    console.error('Error updating knowledge entry:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update entry',
    });
  }
}

/**
 * @swagger
 * /api/compliance/knowledge/{id}:
 *   delete:
 *     summary: Delete a knowledge entry
 *     tags: [Compliance]
 */
export async function deleteKnowledge(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const entry = await StateKnowledge.findByPk(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Knowledge entry not found',
      });
    }

    await entry.destroy();

    res.json({
      success: true,
      message: 'Knowledge entry deleted',
    });
  } catch (error) {
    console.error('Error deleting knowledge entry:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete entry',
    });
  }
}

/**
 * @swagger
 * /api/compliance/knowledge/context/{state}:
 *   get:
 *     summary: Get formatted knowledge context for AI agent
 *     tags: [Compliance]
 *     description: Returns all knowledge for a state formatted for AI consumption
 */
export async function getKnowledgeContext(req: Request, res: Response) {
  try {
    const { state } = req.params;
    const context = await StateKnowledge.getContextForState(state);

    res.json({
      success: true,
      state: state.toUpperCase(),
      data: context,
    });
  } catch (error) {
    console.error('Error getting knowledge context:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get context',
    });
  }
}

/**
 * @swagger
 * /api/compliance/knowledge/seed:
 *   post:
 *     summary: Seed default knowledge entries
 *     tags: [Compliance]
 */
export async function seedDefaultKnowledge(req: Request, res: Response) {
  try {
    await StateKnowledge.seedDefaultKnowledge();
    const count = await StateKnowledge.count();

    res.json({
      success: true,
      message: 'Default knowledge seeded',
      totalEntries: count,
    });
  } catch (error) {
    console.error('Error seeding knowledge:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to seed knowledge',
    });
  }
}

/**
 * @swagger
 * /api/compliance/templates/required/{state}:
 *   get:
 *     summary: Get all required documents for a state
 *     tags: [Compliance]
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [wholesaling, retail, all]
 */
export async function getRequiredDocuments(req: Request, res: Response) {
  try {
    const { state } = req.params;
    const { type = 'wholesaling' } = req.query;

    const templates = await StateDocumentTemplate.getRequiredTemplates(
      state,
      type as 'wholesaling' | 'retail' | 'all'
    );

    res.json({
      success: true,
      state: state.toUpperCase(),
      transactionType: type,
      data: templates,
      count: templates.length,
    });
  } catch (error) {
    console.error('Error fetching required documents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch documents',
    });
  }
}

// ============================================================================
// AI-POWERED RULE GENERATION
// ============================================================================

/**
 * @swagger
 * /api/compliance/rules/generate:
 *   post:
 *     summary: Generate compliance rules from natural language using AI
 *     tags: [Compliance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *             properties:
 *               description:
 *                 type: string
 *                 description: Natural language description of the rule
 *               state:
 *                 type: string
 *                 description: Optional state to apply to (defaults to ALL)
 *     responses:
 *       200:
 *         description: Generated rules
 */
export async function generateRulesFromAI(req: Request, res: Response) {
  try {
    const { description, state = 'ALL' } = req.body;

    if (!description || typeof description !== 'string' || description.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a description of at least 10 characters',
      });
    }

    // Check if OpenAI/OpenRouter is configured
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: 'AI service not configured. Set OPENAI_API_KEY or OPENROUTER_API_KEY.',
      });
    }

    // Build the prompt for AI
    const systemPrompt = `You are a real estate compliance expert. Your job is to convert natural language descriptions into structured compliance rules for a real estate wholesaling platform.

Available operators:
- "required": Field must exist and be non-empty
- "equals": Field must equal the value
- "not_equals": Field must not equal the value
- "contains": Field must contain the value (string search)
- "min_value": Field must be >= value (for numbers)
- "max_value": Field must be <= value (for numbers)
- "min_days_until": Date field must be at least X days in the future
- "max_days_until": Date field must be at most X days in the future
- "is_true": Boolean field must be true
- "is_false": Boolean field must be false
- "regex": Field must match regex pattern
- "in_list": Field must be one of comma-separated values
- "not_in_list": Field must not be any of comma-separated values

Available property fields:
- Contract: assignable, marketingClauseFound, purchaseContractExpiration, wholesalerLlcName, llcOwnerEmail, ownerOccupied, brokerOnFile
- Licensing: agentLicenseNumber, brokerLicenseNumber, brokerCompany, managingBroker
- Financial: askingPrice, arv, rehabCost, wholesaleFee
- Property: bedroomCount, bathroomCount, livingSpaceSqFt, yearBuilt, propertyType, condition
- Location: state, city, zip, county
- Disclosure: knownMaterialDefects, hoa, hoaDuesAmount

Severity levels:
- "critical": Blocks the transaction (Red)
- "warning": Should be addressed (Yellow)
- "info": Informational only (Green)

Categories:
- "contract": Contract-related rules
- "disclosure": Disclosure requirements
- "licensing": License requirements
- "general": Other rules

Return a JSON array of rule objects. Each rule should have:
- name: A short, descriptive name
- description: Explanation of what this rule checks
- category: One of the categories above
- field: The property field to check
- operator: One of the operators above
- value: The value to compare against (if applicable, omit for required/is_true/is_false)
- severity: critical, warning, or info
- message: The message shown when the rule fails`;

    const userPrompt = `Generate compliance rule(s) for the following requirement. State: ${state}

Description: "${description}"

Return ONLY a JSON array with the rule(s). No explanation, just valid JSON.`;

    // Call the AI API
    let generatedRules;
    try {
      // Prefer OpenAI if available, fallback to OpenRouter
      const useOpenAI = !!process.env.OPENAI_API_KEY;
      const activeApiKey = useOpenAI ? process.env.OPENAI_API_KEY : process.env.OPENROUTER_API_KEY;
      const baseUrl = useOpenAI
        ? 'https://api.openai.com/v1'
        : 'https://openrouter.ai/api/v1';
      const model = useOpenAI
        ? 'gpt-4o-mini'
        : (process.env.AGENT_MODEL || 'openai/gpt-4o-mini');

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeApiKey}`,
          ...(!useOpenAI && { 'HTTP-Referer': 'https://dispotree.com' }),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API error:', response.status, errorText);
        let errorDetail = 'AI service temporarily unavailable';
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.error?.message || errorJson.message || errorDetail;
        } catch {
          // Use default error message
        }
        throw new Error(errorDetail);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Parse the JSON response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('AI returned invalid response format');
      }

      generatedRules = JSON.parse(jsonMatch[0]);
    } catch (aiError: any) {
      console.error('AI generation error:', aiError);
      return res.status(500).json({
        success: false,
        error: aiError?.message || 'Failed to generate rules. Please try rephrasing your description.',
      });
    }

    // Validate and sanitize the generated rules
    const validatedRules = generatedRules.map((rule: any, index: number) => ({
      state: state.toUpperCase(),
      name: String(rule.name || `Generated Rule ${index + 1}`).slice(0, 100),
      description: String(rule.description || '').slice(0, 500),
      category: ['contract', 'disclosure', 'licensing', 'general'].includes(rule.category)
        ? rule.category
        : 'general',
      field: String(rule.field || 'assignable').slice(0, 100),
      operator: [
        'required', 'equals', 'not_equals', 'contains', 'min_value', 'max_value',
        'min_days_until', 'max_days_until', 'regex', 'in_list', 'not_in_list',
        'is_true', 'is_false'
      ].includes(rule.operator) ? rule.operator : 'required',
      value: rule.value !== undefined ? String(rule.value).slice(0, 500) : undefined,
      severity: ['critical', 'warning', 'info'].includes(rule.severity)
        ? rule.severity
        : 'warning',
      message: String(rule.message || 'Compliance check failed').slice(0, 500),
      enabled: true,
      order: 100,
    }));

    res.json({
      success: true,
      data: {
        description,
        state: state.toUpperCase(),
        suggestedRules: validatedRules,
        count: validatedRules.length,
      },
    });
  } catch (error) {
    console.error('Error generating rules:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate rules',
    });
  }
}

/**
 * @swagger
 * /api/compliance/rules/templates:
 *   get:
 *     summary: Get quick rule templates
 *     tags: [Compliance]
 *     responses:
 *       200:
 *         description: List of rule templates
 */
export async function getRuleTemplates(_req: Request, res: Response) {
  const templates = [
    {
      id: 'require-license',
      name: 'Require Agent License',
      description: 'Ensure agent has a valid license number on file',
      rule: {
        name: 'Agent License Required',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Agent license number is required for this state',
      },
    },
    {
      id: 'require-broker',
      name: 'Require Broker on File',
      description: 'Ensure a broker is registered for the transaction',
      rule: {
        name: 'Broker Required',
        category: 'licensing',
        field: 'brokerOnFile',
        operator: 'is_true',
        severity: 'critical',
        message: 'A broker must be on file for this transaction',
      },
    },
    {
      id: 'require-assignable',
      name: 'Contract Must Be Assignable',
      description: 'Verify the contract allows assignment',
      rule: {
        name: 'Assignment Clause Required',
        category: 'contract',
        field: 'assignable',
        operator: 'is_true',
        severity: 'critical',
        message: 'Contract must be assignable for wholesale transactions',
      },
    },
    {
      id: 'require-marketing-clause',
      name: 'Marketing Authorization Required',
      description: 'Verify marketing clause is present in contract',
      rule: {
        name: 'Marketing Clause Required',
        category: 'contract',
        field: 'marketingClauseFound',
        operator: 'is_true',
        severity: 'warning',
        message: 'Marketing authorization clause not found in contract',
      },
    },
    {
      id: 'contract-expiration-14',
      name: 'Contract Expiration Warning (14 days)',
      description: 'Warn when contract expires within 14 days',
      rule: {
        name: 'Contract Expiration Warning',
        category: 'contract',
        field: 'purchaseContractExpiration',
        operator: 'min_days_until',
        value: '14',
        severity: 'warning',
        message: 'Contract expires in less than 14 days',
      },
    },
    {
      id: 'contract-expiration-7',
      name: 'Contract Expiration Critical (7 days)',
      description: 'Critical alert when contract expires within 7 days',
      rule: {
        name: 'Contract Expiration Critical',
        category: 'contract',
        field: 'purchaseContractExpiration',
        operator: 'min_days_until',
        value: '7',
        severity: 'critical',
        message: 'Contract expires in less than 7 days - urgent action required',
      },
    },
    {
      id: 'require-llc',
      name: 'Require Wholesaler LLC',
      description: 'Ensure wholesaler LLC information is on file',
      rule: {
        name: 'Wholesaler LLC Required',
        category: 'licensing',
        field: 'wholesalerLlcName',
        operator: 'required',
        severity: 'warning',
        message: 'Wholesaler LLC name is required',
      },
    },
    {
      id: 'require-disclosure',
      name: 'Property Disclosure Required',
      description: 'Require documentation of known material defects',
      rule: {
        name: 'Property Disclosure Required',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Property disclosure documentation is required',
      },
    },
    {
      id: 'require-hoa-disclosure',
      name: 'HOA Disclosure Required',
      description: 'Require HOA status to be disclosed',
      rule: {
        name: 'HOA Disclosure Required',
        category: 'disclosure',
        field: 'hoa',
        operator: 'required',
        severity: 'warning',
        message: 'HOA status must be disclosed',
      },
    },
    {
      id: 'min-arv',
      name: 'Minimum ARV Threshold',
      description: 'Set a minimum After Repair Value requirement',
      rule: {
        name: 'Minimum ARV Required',
        category: 'general',
        field: 'arv',
        operator: 'min_value',
        value: '100000',
        severity: 'info',
        message: 'Property ARV is below minimum threshold',
      },
    },
    {
      id: 'max-rehab-cost',
      name: 'Maximum Rehab Cost',
      description: 'Set a maximum allowed rehab cost',
      rule: {
        name: 'Maximum Rehab Cost',
        category: 'general',
        field: 'rehabCost',
        operator: 'max_value',
        value: '75000',
        severity: 'warning',
        message: 'Rehab cost exceeds maximum threshold',
      },
    },
    {
      id: 'property-type-restriction',
      name: 'Property Type Restriction',
      description: 'Restrict to specific property types',
      rule: {
        name: 'Allowed Property Types',
        category: 'general',
        field: 'propertyType',
        operator: 'in_list',
        value: 'single_family,townhouse,condo',
        severity: 'warning',
        message: 'Property type not in allowed list',
      },
    },
  ];

  res.json({
    success: true,
    data: templates,
    count: templates.length,
  });
}

/**
 * @swagger
 * /api/compliance/templates/send:
 *   post:
 *     summary: Send a document for signing via DocuSeal
 *     tags: [Compliance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateId
 *               - propertyId
 *             properties:
 *               templateId:
 *                 type: integer
 *                 description: StateDocumentTemplate ID
 *               propertyId:
 *                 type: integer
 *               signers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 */
export async function sendDocument(req: Request, res: Response) {
  try {
    const { templateId, propertyId, signers, additionalFields } = req.body;

    if (!templateId || !propertyId) {
      return res.status(400).json({
        success: false,
        error: 'templateId and propertyId are required',
      });
    }

    // Get template mapping
    const template = await StateDocumentTemplate.findByPk(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Get property data
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
      });
    }

    // Build all available fields from property (auto-mapping)
    const allFields = buildPropertyFields(property, template.fieldMappings, additionalFields);

    // Determine signers
    const sellerEmail = signers?.[0]?.email || property.llcOwnerEmail || '';
    const sellerName = signers?.[0]?.name || property.wholesalerLlcName || 'Seller';

    if (!sellerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Seller email is required. Provide in signers array or ensure property has llcOwnerEmail.',
      });
    }

    // Use a transaction to ensure property is updated atomically with submission creation
    // This prevents race conditions where webhooks arrive before property is updated
    const transaction = await sequelize.transaction();

    let submission: any;
    try {
      // First, mark the document as "sending" to indicate it's in progress
      // This helps with debugging if the process fails partway through
      const documentStatus = (property as any).documentStatus || {};
      documentStatus[template.category] = {
        status: 'sending',
        sentAt: new Date().toISOString(),
        templateId: template.id,
        templateName: template.name,
      };
      await property.update({ documentStatus } as any, { transaction });

      // Create DocuSeal submission with all fields
      submission = await docuSealService.createSubmission({
        templateId: template.docuSealTemplateId,
        submitters: [
          {
            email: sellerEmail,
            name: sellerName,
            role: 'Seller',
            send_email: true,
            fields: Object.entries(allFields).map(([name, value]) => ({
              name,
              default_value: String(value ?? ''),
            })),
          },
          ...(signers?.[1]?.email ? [{
            email: signers[1].email,
            name: signers[1].name || 'Buyer',
            role: 'Buyer',
            send_email: true,
            fields: [
              { name: 'buyer_name', default_value: signers[1].name || '' },
              { name: 'buyer_email', default_value: signers[1].email || '' },
            ],
          }] : []),
        ],
        sendEmail: true,
        expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        metadata: {
          propertyId: property.id,
          templateId: template.id,
          state: property.state,
          category: template.category,
        },
      });

      // Update with actual submission ID now that we have it
      documentStatus[template.category] = {
        status: 'sent',
        submissionId: submission.id,
        sentAt: new Date().toISOString(),
        templateId: template.id,
        templateName: template.name,
      };
      await property.update({ documentStatus } as any, { transaction });

      // Commit the transaction - property is now updated with submission ID
      await transaction.commit();

      console.log(`📄 Document sent: ${template.name} for property ${property.id}, submission: ${submission.id}`);
    } catch (txError) {
      // Rollback on any error
      await transaction.rollback();
      throw txError;
    }

    res.json({
      success: true,
      data: {
        submissionId: submission.id,
        status: submission.status,
        category: template.category,
        fieldsFilled: Object.keys(allFields).length,
        submitters: submission.submitters.map((s: { email: string; role: string; status: string; embed_src: string }) => ({
          email: s.email,
          role: s.role,
          status: s.status,
          signUrl: s.embed_src,
        })),
      },
    });
  } catch (error) {
    console.error('Error sending document:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send document',
    });
  }
}

/**
 * @swagger
 * /api/compliance/docuseal/templates:
 *   get:
 *     summary: List available DocuSeal templates
 *     tags: [Compliance]
 */
export async function listDocuSealTemplates(req: Request, res: Response) {
  try {
    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured. Set DOCUSEAL_API_KEY.',
      });
    }

    const templates = await docuSealService.listTemplates({ limit: 100 });

    res.json({
      success: true,
      data: templates,
      count: templates.length,
    });
  } catch (error) {
    console.error('Error listing DocuSeal templates:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list templates',
    });
  }
}

// ============================================================================
// COMPLIANCE CHECKLIST ENDPOINT
// ============================================================================

/**
 * @swagger
 * /api/compliance/checklist/{propertyId}:
 *   get:
 *     summary: Get comprehensive compliance checklist for a property
 *     tags: [Compliance]
 *     description: Returns a complete checklist showing compliance rules status, required documents, and document signing status
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *       - in: query
 *         name: transactionType
 *         schema:
 *           type: string
 *           enum: [wholesaling, retail, all]
 *           default: wholesaling
 *         description: Type of transaction to check requirements for
 *     responses:
 *       200:
 *         description: Compliance checklist
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     propertyId:
 *                       type: integer
 *                     state:
 *                       type: string
 *                     overallStatus:
 *                       type: string
 *                       enum: [complete, in_progress, pending, issues]
 *                     completionPercentage:
 *                       type: number
 *                     complianceRules:
 *                       type: object
 *                     documents:
 *                       type: object
 *                     summary:
 *                       type: object
 */
export async function getComplianceChecklist(req: Request, res: Response) {
  try {
    const { propertyId } = req.params;
    const { transactionType = 'wholesaling' } = req.query;

    // Get property
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    const state = property.state;
    if (!state) {
      return res.status(400).json({
        success: false,
        error: 'Property state is required for compliance checklist',
      });
    }

    // 1. Run compliance rules check
    const complianceResult = await complianceService.checkProperty(property, {
      transactionType: transactionType as 'wholesaling' | 'retail' | 'all',
      autoRemediate: false,
      includeEvidence: false,
    });

    // 2. Get required documents for this state
    const requiredTemplates = await StateDocumentTemplate.getRequiredTemplates(
      state,
      transactionType as 'wholesaling' | 'retail' | 'all'
    );

    // 3. Check document status from property
    const documentStatus = (property as any).documentStatus || {};

    // Build document checklist
    const documentChecklist = requiredTemplates.map(template => {
      const status = documentStatus[template.category];

      let docStatus: 'not_started' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' = 'not_started';
      let details: any = null;

      if (status) {
        docStatus = status.status || 'sent';
        details = {
          submissionId: status.submissionId,
          sentAt: status.sentAt,
          signedAt: status.signedAt,
          signers: status.signers,
        };
      }

      return {
        category: template.category,
        name: template.name,
        description: template.description,
        required: true,
        status: docStatus,
        isComplete: docStatus === 'signed',
        details,
        templateId: template.id,
        docuSealTemplateId: template.docuSealTemplateId,
      };
    });

    // Add any additional documents that were sent but not in required list
    for (const [cat, status] of Object.entries(documentStatus)) {
      if (!documentChecklist.find(d => d.category === cat)) {
        const docStatus = (status as any);
        documentChecklist.push({
          category: cat as any,
          name: docStatus.templateName || cat,
          description: undefined,
          required: false,
          status: docStatus.status || 'sent',
          isComplete: docStatus.status === 'signed',
          details: {
            submissionId: docStatus.submissionId,
            sentAt: docStatus.sentAt,
            signedAt: docStatus.signedAt,
            signers: docStatus.signers,
          },
          templateId: docStatus.templateId || 0,
          docuSealTemplateId: docStatus.docuSealTemplateId || 0,
        });
      }
    }

    // Calculate completion metrics
    const totalRulesChecks = complianceResult.totalRules;
    const passedRulesChecks = complianceResult.passedRules;
    const totalDocuments = documentChecklist.filter(d => d.required).length;
    const signedDocuments = documentChecklist.filter(d => d.required && d.isComplete).length;
    const pendingDocuments = documentChecklist.filter(d => d.required && d.status === 'sent').length;

    const totalItems = totalRulesChecks + totalDocuments;
    const completedItems = passedRulesChecks + signedDocuments;
    const completionPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // Determine overall status
    let overallStatus: 'complete' | 'in_progress' | 'pending' | 'issues';
    if (complianceResult.status === 'Red') {
      overallStatus = 'issues';
    } else if (completionPercentage === 100) {
      overallStatus = 'complete';
    } else if (pendingDocuments > 0 || complianceResult.status === 'Yellow') {
      overallStatus = 'in_progress';
    } else {
      overallStatus = 'pending';
    }

    // Build response
    const checklist = {
      propertyId: property.id,
      propertyAddress: `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city}, ${state}`.trim(),
      state,
      transactionType,
      overallStatus,
      completionPercentage,

      complianceRules: {
        status: complianceResult.status,
        passed: complianceResult.passedRules,
        failed: complianceResult.failedRules,
        total: complianceResult.totalRules,
        issues: complianceResult.issues.map(i => ({
          rule: i.ruleName,
          severity: i.severity,
          message: i.message,
          field: i.field,
        })),
        passedChecks: complianceResult.passedChecks.map(ruleName => ({
          rule: ruleName,
        })),
      },

      documents: {
        total: totalDocuments,
        signed: signedDocuments,
        pending: pendingDocuments,
        notStarted: totalDocuments - signedDocuments - pendingDocuments,
        items: documentChecklist,
      },

      summary: {
        totalItems,
        completedItems,
        criticalIssues: complianceResult.issues.filter(i => i.severity === 'critical').length,
        warnings: complianceResult.issues.filter(i => i.severity === 'warning').length,
        nextSteps: getNextSteps(complianceResult, documentChecklist),
      },

      lastUpdated: new Date().toISOString(),
    };

    res.json({
      success: true,
      data: checklist,
    });
  } catch (error) {
    console.error('Error getting compliance checklist:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get checklist',
    });
  }
}

/**
 * Helper function to generate next steps based on compliance status
 */
function getNextSteps(
  complianceResult: any,
  documentChecklist: any[]
): string[] {
  const steps: string[] = [];

  // Critical compliance issues first
  const criticalIssues = complianceResult.issues.filter((i: any) => i.severity === 'critical');
  if (criticalIssues.length > 0) {
    steps.push(`Fix ${criticalIssues.length} critical compliance issue(s): ${criticalIssues.map((i: any) => i.ruleName).join(', ')}`);
  }

  // Missing required documents
  const missingDocs = documentChecklist.filter(d => d.required && d.status === 'not_started');
  if (missingDocs.length > 0) {
    steps.push(`Send ${missingDocs.length} required document(s): ${missingDocs.map(d => d.name).join(', ')}`);
  }

  // Pending signatures
  const pendingDocs = documentChecklist.filter(d => d.required && d.status === 'sent');
  if (pendingDocs.length > 0) {
    steps.push(`Await signatures on ${pendingDocs.length} document(s): ${pendingDocs.map(d => d.name).join(', ')}`);
  }

  // Warnings
  const warnings = complianceResult.issues.filter((i: any) => i.severity === 'warning');
  if (warnings.length > 0) {
    steps.push(`Review ${warnings.length} warning(s): ${warnings.map((i: any) => i.ruleName).join(', ')}`);
  }

  // If everything is complete
  if (steps.length === 0) {
    steps.push('All compliance requirements met! Property is ready for transaction.');
  }

  return steps;
}

// ============================================================================
// DOCUSEAL WEBHOOK HANDLERS
// ============================================================================

/**
 * DocuSeal webhook event types
 */
type DocuSealEventType =
  | 'submission.created'
  | 'submission.completed'
  | 'submission.expired'
  | 'submission.archived'
  | 'submitter.opened'
  | 'submitter.sent'
  | 'submitter.completed'
  | 'submitter.declined'
  | 'template.created'
  | 'template.updated'
  | 'form.viewed'
  | 'form.started'
  | 'form.completed'
  | 'form.declined';

interface DocuSealWebhookPayload {
  event_type: DocuSealEventType;
  timestamp: string;
  data: {
    id: number;                    // Submission or Submitter ID
    submission_id?: number;        // For submitter events
    email?: string;
    status?: string;
    completed_at?: string;
    declined_at?: string;
    opened_at?: string;
    sent_at?: string;
    metadata?: Record<string, any>;
    template_id?: number;
    template?: {
      id?: number;
      name?: string;
    };
    combined_document_url?: string;
    audit_log_url?: string;
    documents?: Array<{ url: string }>;
    category?: string;
    submitters?: Array<{
      id: number;
      email: string;
      status: string;
      completed_at?: string;
      role?: string;
    }>;
    [key: string]: any;
  };
}

function resolveDocuSealDocumentType(category?: string, templateName?: string): DocumentType {
  const normalized = category?.toLowerCase?.() || '';
  if (['purchase_contract', 'assignment_addendum'].includes(normalized)) {
    return 'contract';
  }
  if (['seller_disclosure', 'lead_paint', 'hoa_disclosure'].includes(normalized)) {
    return 'disclosure';
  }
  if (normalized === 'inspection_notice') {
    return 'inspection';
  }
  if (templateName && /contract|agreement/i.test(templateName)) {
    return 'contract';
  }
  return 'other';
}

async function attachSignedDocuSealDocument(options: {
  submissionId: number;
  property: Property;
  docuSealSubmission?: DocuSealSubmission | null;
  payload: DocuSealWebhookPayload;
  completedAt?: Date;
}): Promise<boolean> {
  const { submissionId, property, docuSealSubmission, payload, completedAt } = options;

  if (!property?.id) {
    return false;
  }

  const existingDocs = await PropertyDocument.findAll({
    where: { propertyId: property.id },
    order: [['createdAt', 'DESC']],
    limit: 25,
  });
  const alreadyLinked = existingDocs.some(
    doc => doc.metadata?.docuSealSubmissionId === submissionId
  );
  if (alreadyLinked) {
    return false;
  }

  let combinedDocumentUrl = payload.data.combined_document_url || docuSealSubmission?.combinedDocumentUrl;
  let auditLogUrl = payload.data.audit_log_url || docuSealSubmission?.auditLogUrl;
  let fallbackDocUrl: string | undefined;

  if (!combinedDocumentUrl && docuSealService.isReady()) {
    try {
      const submission = await docuSealService.getSubmission(submissionId);
      combinedDocumentUrl = submission.combined_document_url;
      auditLogUrl = auditLogUrl || submission.audit_log_url;
      fallbackDocUrl = submission.documents?.[0]?.url;
    } catch (error) {
      console.warn(`⚠️ Unable to fetch DocuSeal submission ${submissionId} for document download:`, error);
    }
  }

  const downloadUrl = combinedDocumentUrl || payload.data.documents?.[0]?.url || fallbackDocUrl;
  if (!downloadUrl) {
    console.warn(`⚠️ No signed document URL available for DocuSeal submission ${submissionId}`);
    return false;
  }

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download signed document (${response.status})`);
  }

  const mimeType = response.headers.get('content-type') || 'application/pdf';
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length === 0) {
    throw new Error('Downloaded signed document is empty');
  }

  const templateName = docuSealSubmission?.templateName || payload.data.template?.name || 'Signed Document';
  const originalName = `${templateName}-${submissionId}.pdf`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const category =
    docuSealSubmission?.documentCategory ||
    payload.data.metadata?.category ||
    payload.data.category;
  const documentType = resolveDocuSealDocumentType(category, templateName);

  const uploadResult = await supabaseStorageService.uploadDocument(
    buffer,
    property.id,
    originalName,
    mimeType
  );

  if (!uploadResult.success) {
    throw new Error(uploadResult.error || 'Failed to upload signed document');
  }

  const pathParts = uploadResult.path.split('/');
  const fileName = pathParts[pathParts.length - 1] || originalName;

  await PropertyDocument.create({
    propertyId: property.id,
    documentType,
    fileName,
    originalName,
    mimeType,
    fileSize: buffer.length,
    storageKey: uploadResult.path,
    status: 'ready',
    metadata: {
      docuSealSubmissionId: submissionId,
      docuSealTemplateId: docuSealSubmission?.templateId || payload.data.template_id || payload.data.template?.id,
      docuSealTemplateName: templateName,
      docuSealCategory: category,
      docuSealDocumentUrl: combinedDocumentUrl || downloadUrl,
      docuSealAuditLogUrl: auditLogUrl,
      docuSealCompletedAt: completedAt?.toISOString() || payload.data.completed_at,
    },
  });

  console.log(`📎 Linked signed DocuSeal document ${submissionId} to property ${property.id}`);
  return true;
}

/**
 * @swagger
 * /api/compliance/webhooks/docuseal:
 *   post:
 *     summary: DocuSeal webhook receiver
 *     tags: [Compliance]
 *     description: |
 *       Receives webhook events from DocuSeal and updates document status.
 *       Configure in DocuSeal: Settings > Webhooks > Add your endpoint URL.
 *
 *       **Supported events:**
 *
 *       Form events (individual signer actions):
 *       - form.viewed: Signer viewed the form
 *       - form.started: Signer started filling the form
 *       - form.completed: Signer completed signing
 *       - form.declined: Signer declined to sign
 *
 *       Submission events (whole submission):
 *       - submission.created: New submission created
 *       - submission.completed: All signers have signed
 *       - submission.expired: Submission expired
 *       - submission.archived: Submission was archived
 *
 *       Template events (informational):
 *       - template.created: New template created
 *       - template.updated: Template was updated
 *
 *       Legacy submitter events (backwards compatible):
 *       - submitter.completed: Individual signer completed
 *       - submitter.opened: Signer viewed the document
 *       - submitter.declined: Signer declined to sign
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event_type:
 *                 type: string
 *                 enum: [form.viewed, form.started, form.completed, form.declined, submission.created, submission.completed, submission.expired, submission.archived, template.created, template.updated]
 *               timestamp:
 *                 type: string
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
export async function handleDocuSealWebhook(req: Request, res: Response) {
  try {
    const payload = req.body as DocuSealWebhookPayload;

    console.log(`📨 DocuSeal webhook received: ${payload.event_type}`, JSON.stringify(payload.data, null, 2));

    // Handle template events (informational only)
    if (payload.event_type === 'template.created' || payload.event_type === 'template.updated') {
      console.log(`📋 Template ${payload.event_type}: ${payload.data.name || payload.data.id}`);
      return res.json({
        success: true,
        message: `Template event ${payload.event_type} acknowledged`,
        data: { templateId: payload.data.id, name: payload.data.name },
      });
    }

    // Extract submission ID - handle different event structures
    let submissionId: number | undefined;
    if (payload.data.submission_id) {
      submissionId = payload.data.submission_id;
    } else if (payload.event_type.startsWith('submission.')) {
      submissionId = payload.data.id;
    } else if (payload.event_type.startsWith('form.')) {
      // Form events have submission_id in data
      submissionId = payload.data.submission_id || payload.data.id;
    }

    if (!submissionId) {
      console.log('⚠️ No submission ID in webhook');
      return res.json({ success: true, message: 'Event received but no submission ID' });
    }

    // ============================================================================
    // UPDATE DOCUSEAL_SUBMISSION TABLE (PRIMARY)
    // ============================================================================

    let docuSealSubmission = await DocuSealSubmission.findByDocuSealId(submissionId);
    let submissionCreated = false;

    // If submission doesn't exist and it's a submission.created event, create it
    if (!docuSealSubmission && payload.event_type === 'submission.created') {
      docuSealSubmission = await DocuSealSubmission.create({
        docuSealSubmissionId: submissionId,
        templateId: payload.data.template_id || payload.data.template?.id || 0,
        templateName: payload.data.template?.name,
        status: 'sent',
        submitters: (payload.data.submitters || []).map((s: any) => ({
          id: s.id,
          email: s.email,
          name: s.name,
          role: s.role || 'signer',
          status: s.status || 'sent',
          sentAt: s.sent_at,
          embedUrl: s.embed_src,
        })),
        sentAt: payload.data.created_at ? new Date(payload.data.created_at) : new Date(),
        expireAt: payload.data.expire_at ? new Date(payload.data.expire_at) : undefined,
        metadata: payload.data.metadata || {},
        reminderCount: 0,
      });
      submissionCreated = true;
      console.log(`✅ Created DocuSealSubmission record for submission ${submissionId}`);
    }

    // Map event type to status and update data
    let newStatus: SubmissionStatus | undefined;
    let updateData: Partial<DocuSealSubmission> = {};
    let submitterEmail: string | undefined = payload.data.email;

    switch (payload.event_type) {
      // Form events (individual signer actions)
      case 'form.viewed':
        if (!docuSealSubmission?.firstViewedAt) {
          updateData.firstViewedAt = new Date();
        }
        // Update submitter status
        if (submitterEmail && docuSealSubmission) {
          const submitters = [...(docuSealSubmission.submitters || [])];
          const submitterIdx = submitters.findIndex(s => s.email === submitterEmail);
          if (submitterIdx >= 0) {
            submitters[submitterIdx] = {
              ...submitters[submitterIdx],
              status: 'opened',
              openedAt: payload.data.opened_at || new Date().toISOString(),
            };
            updateData.submitters = submitters;
          }
        }
        // Only update main status if not already in a more advanced state
        if (docuSealSubmission && ['pending', 'sent'].includes(docuSealSubmission.status)) {
          newStatus = 'viewed';
        }
        break;

      case 'form.started':
        // Similar to viewed, just track that they started filling
        if (!docuSealSubmission?.firstViewedAt) {
          updateData.firstViewedAt = new Date();
        }
        if (docuSealSubmission && ['pending', 'sent'].includes(docuSealSubmission.status)) {
          newStatus = 'viewed';
        }
        break;

      case 'form.completed':
        // Individual signer completed
        if (submitterEmail && docuSealSubmission) {
          const submitters = [...(docuSealSubmission.submitters || [])];
          const submitterIdx = submitters.findIndex(s => s.email === submitterEmail);
          if (submitterIdx >= 0) {
            submitters[submitterIdx] = {
              ...submitters[submitterIdx],
              status: 'completed',
              completedAt: payload.data.completed_at || new Date().toISOString(),
            };
            updateData.submitters = submitters;

            // Check if all submitters are now completed
            const allCompleted = submitters.every(s => s.status === 'completed');
            if (allCompleted) {
              newStatus = 'completed';
              updateData.completedAt = new Date();
            } else {
              newStatus = 'partially_signed';
            }
          }
        }
        break;

      case 'form.declined':
        if (submitterEmail && docuSealSubmission) {
          const submitters = [...(docuSealSubmission.submitters || [])];
          const submitterIdx = submitters.findIndex(s => s.email === submitterEmail);
          if (submitterIdx >= 0) {
            submitters[submitterIdx] = {
              ...submitters[submitterIdx],
              status: 'declined',
              declinedAt: payload.data.declined_at || new Date().toISOString(),
              declineReason: payload.data.decline_reason,
            };
            updateData.submitters = submitters;
          }
          newStatus = 'declined';
          updateData.declinedAt = new Date();
          updateData.declinedBy = submitterEmail;
          updateData.declineReason = payload.data.decline_reason;
        }
        break;

      // Submission events (whole submission)
      case 'submission.created':
        // Already handled above
        newStatus = 'sent';
        break;

      case 'submission.completed':
        newStatus = 'completed';
        updateData.completedAt = payload.data.completed_at ? new Date(payload.data.completed_at) : new Date();
        // Update all submitters to completed
        if (payload.data.submitters && docuSealSubmission) {
          updateData.submitters = payload.data.submitters.map((s: any) => ({
            id: s.id,
            email: s.email,
            name: s.name,
            role: s.role || 'signer',
            status: 'completed',
            completedAt: s.completed_at,
          }));
        }
        // Get document URLs if available
        if (payload.data.audit_log_url) {
          updateData.auditLogUrl = payload.data.audit_log_url;
        }
        if (payload.data.combined_document_url) {
          updateData.combinedDocumentUrl = payload.data.combined_document_url;
        }
        if (payload.data.documents) {
          updateData.documentUrls = payload.data.documents.map((d: any) => d.url);
        }
        break;

      case 'submission.expired':
        newStatus = 'expired';
        break;

      case 'submission.archived':
        newStatus = 'archived';
        updateData.archivedAt = new Date();
        break;

      // Legacy submitter events (for backwards compatibility)
      case 'submitter.completed':
        if (submitterEmail && docuSealSubmission) {
          const submitters = [...(docuSealSubmission.submitters || [])];
          const submitterIdx = submitters.findIndex(s => s.email === submitterEmail);
          if (submitterIdx >= 0) {
            submitters[submitterIdx] = {
              ...submitters[submitterIdx],
              status: 'completed',
              completedAt: payload.data.completed_at || new Date().toISOString(),
            };
            updateData.submitters = submitters;
            const allCompleted = submitters.every(s => s.status === 'completed');
            newStatus = allCompleted ? 'completed' : 'partially_signed';
            if (allCompleted) updateData.completedAt = new Date();
          }
        }
        break;

      case 'submitter.opened':
        if (!docuSealSubmission?.firstViewedAt) {
          updateData.firstViewedAt = new Date();
        }
        if (docuSealSubmission && ['pending', 'sent'].includes(docuSealSubmission.status)) {
          newStatus = 'viewed';
        }
        break;

      case 'submitter.declined':
        newStatus = 'declined';
        updateData.declinedAt = new Date();
        updateData.declinedBy = submitterEmail;
        break;

      default:
        console.log(`ℹ️ Unhandled DocuSeal event: ${payload.event_type}`);
        return res.json({ success: true, message: 'Event type not processed' });
    }

    // Update the DocuSealSubmission record
    if (docuSealSubmission && (newStatus || Object.keys(updateData).length > 0)) {
      if (newStatus) {
        updateData.status = newStatus;
      }
      await docuSealSubmission.update(updateData);
      console.log(`✅ Updated DocuSealSubmission ${submissionId} to status: ${newStatus || docuSealSubmission.status}`);
    }

    // ============================================================================
    // UPDATE PROPERTY.documentStatus (BACKWARDS COMPATIBILITY)
    // ============================================================================

    // Map to legacy status for Property.documentStatus
    let legacyStatus: 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | undefined;
    let legacyUpdateData: Record<string, any> = {};

    switch (newStatus) {
      case 'completed':
        legacyStatus = 'signed';
        legacyUpdateData.signedAt = updateData.completedAt?.toISOString() || new Date().toISOString();
        break;
      case 'partially_signed':
      case 'viewed':
        legacyStatus = 'viewed';
        legacyUpdateData.viewedAt = updateData.firstViewedAt?.toISOString() || new Date().toISOString();
        break;
      case 'declined':
        legacyStatus = 'declined';
        legacyUpdateData.declinedAt = updateData.declinedAt?.toISOString() || new Date().toISOString();
        break;
      case 'expired':
        legacyStatus = 'expired';
        legacyUpdateData.expiredAt = new Date().toISOString();
        break;
      case 'sent':
        legacyStatus = 'sent';
        break;
    }

    if (!legacyStatus) {
      // If no status change needed, just acknowledge
      return res.json({
        success: true,
        message: submissionCreated ? 'Submission created' : 'Event processed',
        data: {
          submissionId,
          status: docuSealSubmission?.status,
        },
      });
    }

    // Find property with this submission ID in documentStatus using JSONB query
    // This is much more efficient than loading all properties
    const sequelizeDb = (await import('../config/database')).default;

    // Use raw SQL with JSONB containment for efficient lookup
    const properties = await Property.findAll({
      where: sequelizeDb.literal(
        `"documentStatus"::text LIKE '%"submissionId":${Number(submissionId)}%'`
      ),
      limit: 10, // Safety limit - should only ever match one
    });

    // Also try to find by propertyId from our DocuSealSubmission record
    let propertyFromSubmission: Property | null = null;
    if (docuSealSubmission?.propertyId) {
      propertyFromSubmission = await Property.findByPk(docuSealSubmission.propertyId);
    }

    let updatedProperty: Property | null = null;
    let updatedCategory: string | null = null;

    for (const property of properties) {
      const docStatus = (property as any).documentStatus;
      if (!docStatus) continue;

      for (const [category, status] of Object.entries(docStatus)) {
        if ((status as any).submissionId === submissionId) {
          // Update this document's status
          const currentStatus = status as any;

          // Use timestamp-based updates instead of strict ordering
          // This handles out-of-order webhook delivery gracefully
          const webhookTimestamp = payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now();
          const lastUpdateTimestamp = currentStatus.lastWebhookAt ? new Date(currentStatus.lastWebhookAt).getTime() : 0;

          // Terminal states (signed, declined, expired) should not be overwritten by earlier events
          const terminalStates = ['signed', 'declined', 'expired'];
          const isCurrentTerminal = terminalStates.includes(currentStatus.status);
          const isNewTerminal = terminalStates.includes(legacyStatus!);

          // Allow update if:
          // 1. Current state is not terminal, OR
          // 2. New state is terminal (declined/expired can override signed in edge cases), OR
          // 3. Webhook is newer than last update
          const shouldUpdate = !isCurrentTerminal || isNewTerminal || webhookTimestamp > lastUpdateTimestamp;

          if (shouldUpdate) {
            currentStatus.status = legacyStatus;
            currentStatus.lastWebhookAt = payload.timestamp || new Date().toISOString();
            Object.assign(currentStatus, legacyUpdateData);

            // Update signer status if we have email
            if (payload.data.email && currentStatus.signers) {
              const signer = currentStatus.signers.find((s: any) => s.email === payload.data.email);
              if (signer) {
                signer.status = legacyStatus;
                if (legacyUpdateData.signedAt) signer.signedAt = legacyUpdateData.signedAt;
              }
            }

            // Update submitters from webhook data if available
            if (payload.data.submitters) {
              currentStatus.signers = payload.data.submitters.map((s: any) => ({
                email: s.email,
                status: s.status === 'completed' ? 'signed' : s.status,
                signedAt: s.completed_at,
                role: s.role,
              }));
            }

            await property.update({ documentStatus: docStatus } as any);
            updatedProperty = property;
            updatedCategory = category;

            console.log(`✅ Updated Property.documentStatus for property ${property.id}, category: ${category}, status: ${legacyStatus}`);
          } else {
            console.log(`ℹ️ Skipping stale webhook for property ${property.id}, category: ${category} (current: ${currentStatus.status}, received: ${legacyStatus})`);
            updatedProperty = property; // Mark as found even if not updated
            updatedCategory = category;
          }
          break;
        }
      }
      if (updatedProperty) break;
    }

    // If no property found by submissionId, try fallback lookup using metadata or DocuSealSubmission
    if (!updatedProperty) {
      const fallbackPropertyId = payload.data.metadata?.propertyId || docuSealSubmission?.propertyId;

      if (fallbackPropertyId) {
        console.log(`ℹ️ Attempting fallback lookup by propertyId: ${fallbackPropertyId}`);

        const fallbackProperty = propertyFromSubmission || await Property.findByPk(fallbackPropertyId);
        if (fallbackProperty) {
          const docStatus = (fallbackProperty as any).documentStatus || {};
          const category = payload.data.metadata?.category || docuSealSubmission?.documentCategory || 'unknown';

          // Initialize the category if it doesn't exist (race condition case)
          if (!docStatus[category]) {
            docStatus[category] = {
              status: 'sending', // Will be updated below
              templateId: payload.data.metadata?.templateId || docuSealSubmission?.templateId,
            };
          }

          // Update with the new status and submission ID
          docStatus[category] = {
            ...docStatus[category],
            status: legacyStatus,
            submissionId: submissionId,
            lastWebhookAt: payload.timestamp || new Date().toISOString(),
            ...legacyUpdateData,
          };

          await fallbackProperty.update({ documentStatus: docStatus } as any);
          updatedProperty = fallbackProperty;
          updatedCategory = category;

          console.log(`✅ Fallback update successful for property ${fallbackProperty.id}, category: ${category}, status: ${legacyStatus}`);
        }
      }
    }

    if (!updatedProperty) {
      console.log(`ℹ️ No property linked to submission ID: ${submissionId} (DocuSealSubmission still updated)`);
    }

    const complianceTriggerStatuses: Array<SubmissionStatus> = ['completed', 'declined', 'expired', 'archived'];
    const shouldRecheckCompliance =
      ['signed', 'declined', 'expired'].includes(legacyStatus || '') ||
      (newStatus ? complianceTriggerStatuses.includes(newStatus) : false);
    const complianceProperty = updatedProperty || propertyFromSubmission;
    const shouldAttachSignedDocument = newStatus === 'completed' && !!complianceProperty;

    if (shouldAttachSignedDocument || (shouldRecheckCompliance && complianceProperty)) {
      void (async () => {
        if (shouldAttachSignedDocument && complianceProperty) {
          try {
            await attachSignedDocuSealDocument({
              submissionId,
              property: complianceProperty,
              docuSealSubmission,
              payload,
              completedAt: updateData.completedAt || docuSealSubmission?.completedAt,
            });
          } catch (attachError) {
            console.warn(`⚠️ Failed to attach signed document for submission ${submissionId}:`, attachError);
          }
        }

        if (shouldRecheckCompliance && complianceProperty) {
          try {
            const complianceResult = await complianceService.checkProperty(complianceProperty, { includeEvidence: false });
            await complianceProperty.update({
              status: complianceResult.status,
              complianceNotes: complianceResult.issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`),
            });
            console.log(`📋 Compliance recheck after DocuSeal update: property ${complianceProperty.id} (${complianceResult.status})`);
          } catch (checkError) {
            console.warn(`⚠️ Compliance recheck failed for property ${complianceProperty.id}:`, checkError);
          }
        }
      })();
    }

    // Emit event for automation engine
    try {
      const { automationEngine } = await import('../plugins/automation/AutomationEngine');

      await automationEngine.emitEvent({
        id: `docuseal-webhook-${Date.now()}`,
        type: 'deal.updated',
        timestamp: new Date(),
        payload: {
          propertyId: updatedProperty?.id || docuSealSubmission?.propertyId,
          documentCategory: updatedCategory || docuSealSubmission?.documentCategory,
          documentStatus: newStatus,
          submissionId,
          webhookSource: 'docuseal',
          webhookEventType: payload.event_type,
        },
        metadata: {
          sourceId: 'docuseal_webhook',
          dealId: updatedProperty?.externalId,
        },
      });
    } catch (emitError) {
      console.warn('Could not emit automation event:', emitError);
    }

    res.json({
      success: true,
      data: {
        submissionId,
        submissionStatus: docuSealSubmission?.status,
        propertyId: updatedProperty?.id,
        category: updatedCategory,
        legacyStatus,
      },
    });
  } catch (error) {
    console.error('Error processing DocuSeal webhook:', error);
    // Still return 200 to prevent DocuSeal from retrying
    res.status(200).json({
      success: false,
      error: error instanceof Error ? error.message : 'Webhook processing failed',
    });
  }
}

/**
 * @swagger
 * /api/compliance/webhooks/docuseal/test:
 *   post:
 *     summary: Test DocuSeal webhook with mock data
 *     tags: [Compliance]
 *     description: Simulate a DocuSeal webhook for testing purposes
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - submissionId
 *               - eventType
 *             properties:
 *               submissionId:
 *                 type: integer
 *               eventType:
 *                 type: string
 *                 enum: [submission.completed, submitter.completed, submitter.opened, submitter.declined, submission.expired]
 *               email:
 *                 type: string
 */
export async function testDocuSealWebhook(req: Request, res: Response) {
  try {
    const { submissionId, eventType, email } = req.body;

    if (!submissionId || !eventType) {
      return res.status(400).json({
        success: false,
        error: 'submissionId and eventType are required',
      });
    }

    // Create mock webhook payload
    const mockPayload: DocuSealWebhookPayload = {
      event_type: eventType as DocuSealEventType,
      timestamp: new Date().toISOString(),
      data: {
        id: submissionId,
        submission_id: submissionId,
        email: email,
        status: eventType.includes('completed') ? 'completed' : eventType.split('.')[1],
        completed_at: eventType.includes('completed') ? new Date().toISOString() : undefined,
        opened_at: eventType === 'submitter.opened' ? new Date().toISOString() : undefined,
        declined_at: eventType === 'submitter.declined' ? new Date().toISOString() : undefined,
      },
    };

    // Process as if it were a real webhook
    req.body = mockPayload;
    return handleDocuSealWebhook(req, res);
  } catch (error) {
    console.error('Error testing DocuSeal webhook:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Test failed',
    });
  }
}

/**
 * @swagger
 * /api/compliance/documents/{propertyId}/refresh:
 *   post:
 *     summary: Refresh document status from DocuSeal
 *     tags: [Compliance]
 *     description: Manually refresh document status by querying DocuSeal for each submission
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 */
export async function refreshDocumentStatus(req: Request, res: Response) {
  try {
    const { propertyId } = req.params;

    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
      });
    }

    const docStatus = (property as any).documentStatus || {};
    const updates: Array<{ category: string; oldStatus: string; newStatus: string }> = [];

    for (const [category, status] of Object.entries(docStatus)) {
      const currentStatus = status as any;
      if (!currentStatus.submissionId) continue;

      try {
        // Fetch current status from DocuSeal
        const submission = await docuSealService.getSubmission(currentStatus.submissionId);

        // Map DocuSeal status to our status
        let newStatus: string;
        const submissionStatus = submission.status as string;
        if (submissionStatus === 'completed') {
          newStatus = 'signed';
        } else if (submissionStatus === 'expired') {
          newStatus = 'expired';
        } else if (submissionStatus === 'declined') {
          newStatus = 'declined';
        } else if (submission.submitters?.some((s: any) => s.status === 'opened')) {
          newStatus = 'viewed';
        } else {
          newStatus = 'sent';
        }

        if (newStatus !== currentStatus.status) {
          updates.push({
            category,
            oldStatus: currentStatus.status,
            newStatus,
          });

          currentStatus.status = newStatus;

          if (newStatus === 'signed' && submission.completed_at) {
            currentStatus.signedAt = submission.completed_at;
          }

          // Update signers
          if (submission.submitters) {
            currentStatus.signers = submission.submitters.map((s: any) => ({
              email: s.email,
              status: s.status === 'completed' ? 'signed' : s.status,
              signedAt: s.completed_at,
              role: s.role,
            }));
          }
        }
      } catch (fetchError) {
        console.warn(`Could not fetch submission ${currentStatus.submissionId}:`, fetchError);
      }
    }

    if (updates.length > 0) {
      await property.update({ documentStatus: docStatus } as any);
      console.log(`🔄 Refreshed ${updates.length} document status(es) for property ${propertyId}`);
    }

    res.json({
      success: true,
      data: {
        propertyId: property.id,
        updated: updates.length,
        updates,
        documentStatus: docStatus,
      },
    });
  } catch (error) {
    console.error('Error refreshing document status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Refresh failed',
    });
  }
}

// ============================================================================
// COMPLIANCE DASHBOARD & ANALYTICS
// ============================================================================

/**
 * @swagger
 * /api/compliance/dashboard:
 *   get:
 *     summary: Get compliance dashboard statistics
 *     tags: [Compliance]
 *     responses:
 *       200:
 *         description: Dashboard statistics
 */
export async function getDashboardStats(_req: Request, res: Response) {
  try {
    // Get all properties with compliance data
    const properties = await Property.findAll({
      attributes: ['id', 'state', 'complianceNotes', 'createdAt', 'updatedAt'],
    });

    // Get all rules for categorization
    const rules = await StateComplianceRule.findAll({
      where: { enabled: true },
    });

    // Parse compliance status from each property
    const stats = {
      total: properties.length,
      passed: 0,
      failed: 0,
      unchecked: 0,
      criticalIssues: 0,
      warningIssues: 0,
      infoIssues: 0,
    };

    const issuesByState: Record<string, { critical: number; warning: number; info: number; total: number }> = {};
    const issuesByCategory: Record<string, number> = {};
    let recentChecks: Array<{
      propertyId: number;
      state: string;
      status: string;
      issues: number;
      date: string;
      ocr?: ReturnType<typeof formatContractOcrSummary>;
    }> = [];
    const fallbackRecentChecks: Array<{
      propertyId: number;
      state: string;
      status: string;
      issues: number;
      date: string;
    }> = [];

    for (const property of properties) {
      const notes = property.complianceNotes;
      const state = property.state || 'Unknown';

      if (!issuesByState[state]) {
        issuesByState[state] = { critical: 0, warning: 0, info: 0, total: 0 };
      }

      if (!notes || (Array.isArray(notes) && notes.length === 0)) {
        stats.unchecked++;
        continue;
      }

      try {
        // notes can be string[] or JSON string
        let parsed: any[];
        if (Array.isArray(notes)) {
          // If it's already an array, try to parse each item if they're JSON strings
          parsed = notes.length === 1 && typeof notes[0] === 'string' && notes[0].startsWith('[')
            ? JSON.parse(notes[0])
            : notes.map(n => typeof n === 'string' && n.startsWith('{') ? JSON.parse(n) : n);
        } else if (typeof notes === 'string') {
          parsed = JSON.parse(notes);
        } else {
          parsed = [];
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
          stats.unchecked++;
          continue;
        }

        let hasCritical = false;
        let hasWarning = false;
        let issueCount = 0;

        for (const issue of parsed) {
          issueCount++;
          if (issue.severity === 'critical') {
            stats.criticalIssues++;
            issuesByState[state].critical++;
            hasCritical = true;
          } else if (issue.severity === 'warning') {
            stats.warningIssues++;
            issuesByState[state].warning++;
            hasWarning = true;
          } else {
            stats.infoIssues++;
            issuesByState[state].info++;
          }

          // Track by category
          const category = issue.category || 'general';
          issuesByCategory[category] = (issuesByCategory[category] || 0) + 1;
        }

        issuesByState[state].total += issueCount;

        if (hasCritical || hasWarning) {
          stats.failed++;
        } else {
          stats.passed++;
        }

        if (fallbackRecentChecks.length < 10) {
          fallbackRecentChecks.push({
            propertyId: property.id,
            state,
            status: hasCritical ? 'critical' : hasWarning ? 'warning' : 'passed',
            issues: issueCount,
            date: property.updatedAt?.toISOString() || new Date().toISOString(),
          });
        }

      } catch {
        stats.unchecked++;
      }
    }

    // Calculate pass rate
    const checkedCount = stats.passed + stats.failed;
    const passRate = checkedCount > 0 ? Math.round((stats.passed / checkedCount) * 100) : 0;

    // Get rule counts by state
    const rulesByState: Record<string, number> = {};
    for (const rule of rules) {
      rulesByState[rule.state] = (rulesByState[rule.state] || 0) + 1;
    }

    try {
      const recentCheckRows = await ComplianceCheck.findAll({
        order: [['checkedAt', 'DESC']],
        limit: 10,
        attributes: ['propertyId', 'state', 'status', 'issues', 'checkedAt', 'evidenceSnapshot'],
      });

      const mappedChecks = recentCheckRows.map((check) => {
        const contractOcr = formatContractOcrSummary((check.evidenceSnapshot as any)?.contractOcr);
        const status = check.status === 'Green'
          ? 'passed'
          : check.status === 'Yellow'
            ? 'warning'
            : 'critical';
        return {
          propertyId: check.propertyId,
          state: check.state,
          status,
          issues: Array.isArray(check.issues) ? check.issues.length : 0,
          date: check.checkedAt?.toISOString() || new Date().toISOString(),
          ocr: contractOcr ?? undefined,
        };
      });
      if (mappedChecks.length > 0) {
        recentChecks = mappedChecks;
      }
    } catch (recentError) {
      console.warn('⚠️ Failed to load recent compliance checks:', (recentError as Error).message);
    }
    if (recentChecks.length === 0) {
      recentChecks = fallbackRecentChecks;
    }

    res.json({
      success: true,
      data: {
        summary: {
          ...stats,
          passRate,
          totalRules: rules.length,
        },
        issuesByState,
        issuesByCategory,
        rulesByState,
        recentChecks,
      },
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get dashboard stats',
    });
  }
}

/**
 * @swagger
 * /api/compliance/bulk-check:
 *   post:
 *     summary: Run compliance check on all properties or filtered set
 *     tags: [Compliance]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               state:
 *                 type: string
 *                 description: Optional state filter
 *               propertyIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Optional specific property IDs
 *               uncheckedOnly:
 *                 type: boolean
 *                 description: Only check properties without compliance data
 *     responses:
 *       200:
 *         description: Bulk check results
 */
export async function bulkComplianceCheck(req: Request, res: Response) {
  try {
    const { state, propertyIds, uncheckedOnly } = req.body;

    // Build query
    const where: any = {};
    if (state) {
      where.state = state;
    }
    if (propertyIds && Array.isArray(propertyIds) && propertyIds.length > 0) {
      where.id = propertyIds;
    }

    let properties = await Property.findAll({ where });

    // Filter to unchecked only if requested
    if (uncheckedOnly) {
      properties = properties.filter(p => !p.complianceNotes || (Array.isArray(p.complianceNotes) && p.complianceNotes.length === 0));
    }

    if (properties.length === 0) {
      return res.json({
        success: true,
        data: {
          checked: 0,
          passed: 0,
          failed: 0,
          results: [],
        },
      });
    }

    // Limit to prevent timeout (max 100 at once)
    const maxProperties = Math.min(properties.length, 100);
    const propertiesToCheck = properties.slice(0, maxProperties);

    const results: Array<{
      propertyId: number;
      address: string;
      state: string;
      status: 'passed' | 'warning' | 'critical';
      issueCount: number;
      criticalCount: number;
      warningCount: number;
    }> = [];

    let passed = 0;
    let failed = 0;

    for (const property of propertiesToCheck) {
      try {
        // Run compliance check
        const checkResult = await complianceService.checkProperty(property, { autoRemediate: false, includeEvidence: false });

        // Update property with results
        await property.update({
          complianceNotes: JSON.stringify(checkResult.issues),
        } as any);

        const criticalCount = checkResult.issues.filter((i: any) => i.severity === 'critical').length;
        const warningCount = checkResult.issues.filter((i: any) => i.severity === 'warning').length;
        const status = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'passed';

        if (status === 'passed') {
          passed++;
        } else {
          failed++;
        }

        const addressStr = property.address
          ? `${property.address.houseNumber || ''} ${property.address.street || ''}`.trim()
          : `Property ${property.id}`;

        results.push({
          propertyId: property.id,
          address: addressStr || `Property ${property.id}`,
          state: property.state || 'Unknown',
          status,
          issueCount: checkResult.issues.length,
          criticalCount,
          warningCount,
        });
      } catch (err) {
        console.error(`Error checking property ${property.id}:`, err);
        const addressStr = property.address
          ? `${property.address.houseNumber || ''} ${property.address.street || ''}`.trim()
          : `Property ${property.id}`;

        results.push({
          propertyId: property.id,
          address: addressStr || `Property ${property.id}`,
          state: property.state || 'Unknown',
          status: 'critical',
          issueCount: 1,
          criticalCount: 1,
          warningCount: 0,
        });
        failed++;
      }
    }

    res.json({
      success: true,
      data: {
        checked: results.length,
        total: properties.length,
        passed,
        failed,
        limited: properties.length > maxProperties,
        results,
      },
    });
  } catch (error) {
    console.error('Error in bulk compliance check:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Bulk check failed',
    });
  }
}

/**
 * @swagger
 * /api/compliance/rules/{id}/test:
 *   get:
 *     summary: Test a rule against all properties without saving
 *     tags: [Compliance]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Test results showing which properties would pass/fail
 */
export async function testRule(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const rule = await StateComplianceRule.findByPk(id);
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found',
      });
    }

    // Get properties for this state (or all if universal)
    const where: any = {};
    if (rule.state !== 'ALL') {
      where.state = rule.state;
    }

    const properties = await Property.findAll({
      where,
      limit: 100, // Limit for performance
    });

    const results = {
      passed: 0,
      failed: 0,
      properties: [] as Array<{
        id: number;
        address: string;
        state: string;
        wouldPass: boolean;
        fieldValue: any;
        reason?: string;
      }>,
    };

    for (const property of properties) {
      const fieldValue = getNestedValue(property, rule.field);
      const { passed, reason } = evaluateRuleForTest(rule, fieldValue);

      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }

      const addressStr = property.address
        ? `${property.address.houseNumber || ''} ${property.address.street || ''}`.trim()
        : `Property ${property.id}`;

      results.properties.push({
        id: property.id,
        address: addressStr || `Property ${property.id}`,
        state: property.state || 'Unknown',
        wouldPass: passed,
        fieldValue: fieldValue !== undefined ? fieldValue : null,
        reason: passed ? undefined : reason,
      });
    }

    res.json({
      success: true,
      data: {
        rule: {
          id: rule.id,
          name: rule.name,
          state: rule.state,
          field: rule.field,
          operator: rule.operator,
          value: rule.value,
          severity: rule.severity,
        },
        total: properties.length,
        passed: results.passed,
        failed: results.failed,
        passRate: properties.length > 0 ? Math.round((results.passed / properties.length) * 100) : 100,
        properties: results.properties,
      },
    });
  } catch (error) {
    console.error('Error testing rule:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Rule test failed',
    });
  }
}

// Helper function to get nested property value
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Helper function to evaluate a single rule for testing
function evaluateRuleForTest(rule: StateComplianceRule, value: any): { passed: boolean; reason?: string } {
  const { operator, value: ruleValue } = rule;

  switch (operator) {
    case 'required':
      if (value === undefined || value === null || value === '') {
        return { passed: false, reason: 'Field is empty or missing' };
      }
      return { passed: true };

    case 'equals':
      if (String(value) !== String(ruleValue)) {
        return { passed: false, reason: `Expected "${ruleValue}", got "${value}"` };
      }
      return { passed: true };

    case 'not_equals':
      if (String(value) === String(ruleValue)) {
        return { passed: false, reason: `Should not equal "${ruleValue}"` };
      }
      return { passed: true };

    case 'contains':
      if (!String(value || '').toLowerCase().includes(String(ruleValue || '').toLowerCase())) {
        return { passed: false, reason: `Does not contain "${ruleValue}"` };
      }
      return { passed: true };

    case 'min_value':
      const minVal = parseFloat(String(ruleValue));
      const numVal = parseFloat(String(value));
      if (isNaN(numVal) || numVal < minVal) {
        return { passed: false, reason: `Value ${numVal} is less than minimum ${minVal}` };
      }
      return { passed: true };

    case 'max_value':
      const maxVal = parseFloat(String(ruleValue));
      const numVal2 = parseFloat(String(value));
      if (isNaN(numVal2) || numVal2 > maxVal) {
        return { passed: false, reason: `Value ${numVal2} exceeds maximum ${maxVal}` };
      }
      return { passed: true };

    case 'is_true':
      if (value !== true && value !== 'true' && value !== 1) {
        return { passed: false, reason: 'Field is not true' };
      }
      return { passed: true };

    case 'is_false':
      if (value !== false && value !== 'false' && value !== 0) {
        return { passed: false, reason: 'Field is not false' };
      }
      return { passed: true };

    case 'in_list':
      const allowedValues = String(ruleValue || '').split(',').map(v => v.trim().toLowerCase());
      if (!allowedValues.includes(String(value || '').toLowerCase())) {
        return { passed: false, reason: `Value not in allowed list: ${ruleValue}` };
      }
      return { passed: true };

    case 'not_in_list':
      const disallowedValues = String(ruleValue || '').split(',').map(v => v.trim().toLowerCase());
      if (disallowedValues.includes(String(value || '').toLowerCase())) {
        return { passed: false, reason: `Value is in disallowed list: ${ruleValue}` };
      }
      return { passed: true };

    case 'min_days_until':
      if (!value) {
        return { passed: false, reason: 'Date field is missing' };
      }
      const targetDate = new Date(value);
      const today = new Date();
      const daysUntil = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const minDays = parseInt(String(ruleValue), 10);
      if (daysUntil < minDays) {
        return { passed: false, reason: `Only ${daysUntil} days until date, requires ${minDays}` };
      }
      return { passed: true };

    case 'max_days_until':
      if (!value) {
        return { passed: true }; // No date is OK for max
      }
      const targetDate2 = new Date(value);
      const today2 = new Date();
      const daysUntil2 = Math.ceil((targetDate2.getTime() - today2.getTime()) / (1000 * 60 * 60 * 24));
      const maxDays = parseInt(String(ruleValue), 10);
      if (daysUntil2 > maxDays) {
        return { passed: false, reason: `${daysUntil2} days until date, max is ${maxDays}` };
      }
      return { passed: true };

    case 'regex':
      try {
        const regex = new RegExp(String(ruleValue));
        if (!regex.test(String(value || ''))) {
          return { passed: false, reason: `Does not match pattern: ${ruleValue}` };
        }
        return { passed: true };
      } catch {
        return { passed: false, reason: 'Invalid regex pattern' };
      }

    default:
      return { passed: true };
  }
}

// =============================================================================
// DOCUMENT TEMPLATE CRUD
// =============================================================================

/**
 * @swagger
 * /api/compliance/document-templates:
 *   get:
 *     summary: Get all state document templates
 *     tags: [Compliance Document Templates]
 */
export async function getDocumentTemplates(req: Request, res: Response) {
  try {
    const { state, category, enabled } = req.query;

    const where: any = {};
    if (state) where.state = String(state).toUpperCase();
    if (category) where.category = category;
    if (enabled !== undefined) where.enabled = enabled === 'true';

    const templates = await StateDocumentTemplate.findAll({
      where,
      order: [['state', 'ASC'], ['category', 'ASC'], ['priority', 'DESC']],
    });

    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('Failed to get document templates:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * @swagger
 * /api/compliance/document-templates/docuseal:
 *   get:
 *     summary: Get available DocuSeal templates
 *     tags: [Compliance Document Templates]
 */
export async function getDocuSealTemplates(req: Request, res: Response) {
  try {
    if (!docuSealService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'DocuSeal service not configured',
        message: 'Please set DOCUSEAL_API_KEY in environment variables',
      });
    }

    const templates = await docuSealService.listTemplates({ limit: 100 });

    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('Failed to fetch DocuSeal templates:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * @swagger
 * /api/compliance/document-templates/{id}:
 *   get:
 *     summary: Get a specific document template
 *     tags: [Compliance Document Templates]
 */
export async function getDocumentTemplate(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const template = await StateDocumentTemplate.findByPk(id);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Failed to get document template:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * @swagger
 * /api/compliance/document-templates:
 *   post:
 *     summary: Create a new document template
 *     tags: [Compliance Document Templates]
 */
export async function createDocumentTemplate(req: Request, res: Response) {
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
      enabled,
      priority,
    } = req.body;

    // Validate required fields
    if (!state || !category || !name || !docuSealTemplateId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: state, category, name, docuSealTemplateId',
      });
    }

    const template = await StateDocumentTemplate.create({
      state: state.toUpperCase(),
      category,
      name,
      description,
      docuSealTemplateId,
      docuSealTemplateName,
      requiredFor: requiredFor || ['all'],
      fieldMappings: fieldMappings || {},
      enabled: enabled !== false,
      priority: priority || 50,
    });

    // Log the action
    soc2AuditLogger.logModification(
      { type: 'document_template', id: String(template.id) },
      { type: 'user', id: (req as any).user?.id, ip: req.ip || undefined, userAgent: req.get('User-Agent') },
      'create',
      'success',
      { after: template.toJSON() }
    );

    res.status(201).json({ success: true, data: template });
  } catch (error: any) {
    console.error('Failed to create document template:', error);

    // Provide detailed error information
    let errorMessage = 'Failed to create template';
    let errorDetails: Record<string, any> = {};

    if (error.name === 'SequelizeValidationError') {
      errorMessage = 'Validation error';
      errorDetails = {
        errors: error.errors?.map((e: any) => ({
          field: e.path,
          message: e.message,
          value: e.value,
        })),
      };
    } else if (error.name === 'SequelizeDatabaseError') {
      errorMessage = 'Database error';
      errorDetails = {
        message: error.message,
        table: error.table,
        constraint: error.constraint,
      };
    } else if (error.name === 'SequelizeUniqueConstraintError') {
      errorMessage = 'A template with these values already exists';
      errorDetails = {
        fields: error.fields,
      };
    } else {
      errorMessage = error.message || 'Failed to create template';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: errorDetails,
    });
  }
}

/**
 * @swagger
 * /api/compliance/document-templates/{id}:
 *   put:
 *     summary: Update a document template
 *     tags: [Compliance Document Templates]
 */
export async function updateDocumentTemplate(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const template = await StateDocumentTemplate.findByPk(id);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const previousValues = template.toJSON();

    const {
      state,
      category,
      name,
      description,
      docuSealTemplateId,
      docuSealTemplateName,
      requiredFor,
      fieldMappings,
      enabled,
      priority,
    } = req.body;

    await template.update({
      ...(state && { state: state.toUpperCase() }),
      ...(category && { category }),
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(docuSealTemplateId && { docuSealTemplateId }),
      ...(docuSealTemplateName !== undefined && { docuSealTemplateName }),
      ...(requiredFor && { requiredFor }),
      ...(fieldMappings !== undefined && { fieldMappings }),
      ...(enabled !== undefined && { enabled }),
      ...(priority !== undefined && { priority }),
    });

    // Log the action
    soc2AuditLogger.logModification(
      { type: 'document_template', id: String(template.id) },
      { type: 'user', id: (req as any).user?.id, ip: req.ip || undefined, userAgent: req.get('User-Agent') },
      'update',
      'success',
      { before: previousValues, after: template.toJSON() }
    );

    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Failed to update document template:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * @swagger
 * /api/compliance/document-templates/{id}:
 *   delete:
 *     summary: Delete a document template
 *     tags: [Compliance Document Templates]
 */
export async function deleteDocumentTemplate(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const template = await StateDocumentTemplate.findByPk(id);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const templateData = template.toJSON();
    await template.destroy();

    // Log the action
    soc2AuditLogger.logModification(
      { type: 'document_template', id },
      { type: 'user', id: (req as any).user?.id, ip: req.ip || undefined, userAgent: req.get('User-Agent') },
      'delete',
      'success',
      { before: templateData }
    );

    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Failed to delete document template:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

// ============================================================================
// EXTRACTION PROFILE ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/compliance/extraction-profiles:
 *   get:
 *     summary: Get all extraction profiles
 *     tags: [Compliance Extraction Profiles]
 *     parameters:
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Filter by state code (e.g., TX, FL, CA)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category (purchase_contract, assignment_addendum)
 *       - in: query
 *         name: enabled
 *         schema:
 *           type: boolean
 *         description: Filter by enabled status
 */
export async function getExtractionProfiles(req: Request, res: Response) {
  try {
    const { state, category, enabled } = req.query;

    const where: any = {};
    if (state) where.state = (state as string).toUpperCase();
    if (category) where.category = category;
    if (enabled !== undefined) where.enabled = enabled === 'true';

    const profiles = await ComplianceExtractionProfile.findAll({
      where,
      order: [['state', 'ASC'], ['priority', 'DESC'], ['name', 'ASC']],
    });

    res.json({ success: true, data: profiles });
  } catch (error) {
    console.error('Failed to fetch extraction profiles:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * @swagger
 * /api/compliance/extraction-profiles/{id}:
 *   get:
 *     summary: Get a specific extraction profile
 *     tags: [Compliance Extraction Profiles]
 */
export async function getExtractionProfile(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const profile = await ComplianceExtractionProfile.findByPk(id);

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    res.json({ success: true, data: profile });
  } catch (error) {
    console.error('Failed to fetch extraction profile:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * @swagger
 * /api/compliance/extraction-profiles/find-best:
 *   get:
 *     summary: Find the best matching extraction profile
 *     tags: [Compliance Extraction Profiles]
 *     parameters:
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: docuSealTemplateId
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 */
export async function findBestExtractionProfile(req: Request, res: Response) {
  try {
    const { state, docuSealTemplateId, category } = req.query;

    if (!state) {
      return res.status(400).json({ success: false, error: 'State is required' });
    }

    const profile = await ComplianceExtractionProfile.findBestProfile(
      (state as string).toUpperCase(),
      docuSealTemplateId as string | undefined,
      category as string | undefined
    );

    if (!profile) {
      return res.json({ success: true, data: null, message: 'No matching profile found' });
    }

    res.json({ success: true, data: profile });
  } catch (error) {
    console.error('Failed to find extraction profile:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * @swagger
 * /api/compliance/extraction-profiles:
 *   post:
 *     summary: Create a new extraction profile
 *     tags: [Compliance Extraction Profiles]
 */
export async function createExtractionProfile(req: Request, res: Response) {
  try {
    const {
      state,
      docuSealTemplateId,
      category,
      name,
      description,
      fieldLabels,
      regexHints,
      promptOverrides,
      requiredFields,
      minConfidence,
      enabled,
      priority,
    } = req.body;

    if (!state || !name) {
      return res.status(400).json({ success: false, error: 'State and name are required' });
    }

    const profile = await ComplianceExtractionProfile.create({
      state: state.toUpperCase(),
      docuSealTemplateId,
      category,
      name,
      description,
      fieldLabels: fieldLabels || {},
      regexHints: regexHints || {},
      promptOverrides,
      requiredFields: requiredFields || [],
      minConfidence: minConfidence || 0.70,
      enabled: enabled !== undefined ? enabled : true,
      priority: priority || 0,
    });

    // Log the action
    soc2AuditLogger.logModification(
      { type: 'extraction_profile', id: String(profile.id) },
      { type: 'user', id: (req as any).user?.id, ip: req.ip || undefined, userAgent: req.get('User-Agent') },
      'create',
      'success',
      { after: profile.toJSON() }
    );

    res.status(201).json({ success: true, data: profile });
  } catch (error) {
    console.error('Failed to create extraction profile:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * @swagger
 * /api/compliance/extraction-profiles/{id}:
 *   put:
 *     summary: Update an extraction profile
 *     tags: [Compliance Extraction Profiles]
 */
export async function updateExtractionProfile(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const profile = await ComplianceExtractionProfile.findByPk(id);

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const previousValues = profile.toJSON();

    const {
      state,
      docuSealTemplateId,
      category,
      name,
      description,
      fieldLabels,
      regexHints,
      promptOverrides,
      requiredFields,
      minConfidence,
      enabled,
      priority,
    } = req.body;

    await profile.update({
      ...(state && { state: state.toUpperCase() }),
      ...(docuSealTemplateId !== undefined && { docuSealTemplateId }),
      ...(category !== undefined && { category }),
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(fieldLabels && { fieldLabels }),
      ...(regexHints && { regexHints }),
      ...(promptOverrides !== undefined && { promptOverrides }),
      ...(requiredFields && { requiredFields }),
      ...(minConfidence !== undefined && { minConfidence }),
      ...(enabled !== undefined && { enabled }),
      ...(priority !== undefined && { priority }),
    });

    // Log the action
    soc2AuditLogger.logModification(
      { type: 'extraction_profile', id: String(profile.id) },
      { type: 'user', id: (req as any).user?.id, ip: req.ip || undefined, userAgent: req.get('User-Agent') },
      'update',
      'success',
      { before: previousValues, after: profile.toJSON() }
    );

    res.json({ success: true, data: profile });
  } catch (error) {
    console.error('Failed to update extraction profile:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * @swagger
 * /api/compliance/extraction-profiles/{id}:
 *   delete:
 *     summary: Delete an extraction profile
 *     tags: [Compliance Extraction Profiles]
 */
export async function deleteExtractionProfile(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const profile = await ComplianceExtractionProfile.findByPk(id);

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const profileData = profile.toJSON();
    await profile.destroy();

    // Log the action
    soc2AuditLogger.logModification(
      { type: 'extraction_profile', id },
      { type: 'user', id: (req as any).user?.id, ip: req.ip || undefined, userAgent: req.get('User-Agent') },
      'delete',
      'success',
      { before: profileData }
    );

    res.json({ success: true, message: 'Profile deleted' });
  } catch (error) {
    console.error('Failed to delete extraction profile:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

// =============================================================================
// CONTACT REQUIREMENTS CRUD
// =============================================================================

interface ContactRequirement {
  category: string;
  role: string;
  phase: number;
  blocking: boolean;
  storageTable?: string;
  requiredFields?: Array<{
    fieldName: string;
    displayName: string;
    dataType: string;
    required: boolean;
    validation?: string;
  }>;
}

/**
 * Get all contact requirements across all states
 */
export async function getContactRequirements(req: Request, res: Response) {
  try {
    const [results] = await sequelize.query(`
      SELECT state, contacts
      FROM state_compliance_configs
      WHERE "isActive" = true
      ORDER BY state
    `);

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Failed to get contact requirements:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * Get unique contact types with their state assignments
 * This aggregates all contact types and shows which states have each type
 */
export async function getContactRequirementTypes(req: Request, res: Response) {
  try {
    const [results] = await sequelize.query(`
      SELECT state, contacts
      FROM state_compliance_configs
      WHERE "isActive" = true AND contacts IS NOT NULL
      ORDER BY state
    `);

    // Aggregate contact types across states
    const typeMap: Record<string, {
      category: string;
      role: string;
      phase: number;
      blocking: boolean;
      requiredFields: any[];
      states: string[];
    }> = {};

    for (const row of results as any[]) {
      const state = row.state;
      // Handle both array and null/undefined contacts
      let contacts = row.contacts;
      if (!contacts) {
        contacts = [];
      } else if (typeof contacts === 'string') {
        // Handle case where JSON wasn't auto-parsed
        try {
          contacts = JSON.parse(contacts);
        } catch {
          contacts = [];
        }
      }
      if (!Array.isArray(contacts)) {
        contacts = [];
      }

      for (const contact of contacts) {
        // Skip malformed contact entries
        if (!contact || !contact.category) continue;

        const key = contact.category;
        if (!typeMap[key]) {
          typeMap[key] = {
            category: contact.category,
            role: contact.role || contact.category,
            phase: typeof contact.phase === 'number' ? contact.phase : 0,
            blocking: Boolean(contact.blocking),
            requiredFields: Array.isArray(contact.requiredFields) ? contact.requiredFields : [],
            states: [],
          };
        }
        typeMap[key].states.push(state);
      }
    }

    // Convert to array and sort by role name
    const types = Object.values(typeMap).sort((a, b) => a.role.localeCompare(b.role));

    res.json({ success: true, data: types });
  } catch (error) {
    console.error('Failed to get contact requirement types:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * Get contact requirements for a specific state
 */
export async function getContactRequirementsForState(req: Request, res: Response) {
  try {
    const { state } = req.params;
    const normalizedState = state.toUpperCase();

    const [results] = await sequelize.query(`
      SELECT state, contacts
      FROM state_compliance_configs
      WHERE state = :state AND "isActive" = true
      LIMIT 1
    `, { replacements: { state: normalizedState } });

    if (!results || results.length === 0) {
      return res.json({ success: true, data: { state: normalizedState, contacts: [] } });
    }

    res.json({ success: true, data: results[0] });
  } catch (error) {
    console.error('Failed to get contact requirements for state:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * Update contact requirements for a state
 */
export async function updateContactRequirementsForState(req: Request, res: Response) {
  try {
    const { state } = req.params;
    const { contacts } = req.body;
    const normalizedState = state.toUpperCase();

    if (!Array.isArray(contacts)) {
      return res.status(400).json({ success: false, error: 'contacts must be an array' });
    }

    // Check if state config exists
    const [existing] = await sequelize.query(`
      SELECT id FROM state_compliance_configs WHERE state = :state
    `, { replacements: { state: normalizedState } });

    if (existing && (existing as any[]).length > 0) {
      // Update existing
      await sequelize.query(`
        UPDATE state_compliance_configs
        SET contacts = :contacts, "updatedAt" = NOW()
        WHERE state = :state
      `, { replacements: { state: normalizedState, contacts: JSON.stringify(contacts) } });
    } else {
      // Create new
      await sequelize.query(`
        INSERT INTO state_compliance_configs (state, contacts, "isActive", "createdAt", "updatedAt")
        VALUES (:state, :contacts, true, NOW(), NOW())
      `, { replacements: { state: normalizedState, contacts: JSON.stringify(contacts) } });
    }

    // Log the action
    soc2AuditLogger.logModification(
      { type: 'state_compliance_config', id: normalizedState },
      { type: 'user', id: (req as any).user?.id, ip: req.ip || undefined, userAgent: req.get('User-Agent') },
      'update_contact_requirements',
      'success',
      undefined,
      { state: normalizedState, contactCount: contacts.length }
    );

    res.json({ success: true, data: { state: normalizedState, contacts } });
  } catch (error) {
    console.error('Failed to update contact requirements for state:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * Bulk assign a contact requirement to multiple states
 */
export async function bulkAssignContactRequirement(req: Request, res: Response) {
  try {
    const { contactRequirement, states } = req.body;

    if (!contactRequirement || !contactRequirement.category || !contactRequirement.role) {
      return res.status(400).json({ success: false, error: 'contactRequirement with category and role is required' });
    }

    if (!Array.isArray(states) || states.length === 0) {
      return res.status(400).json({ success: false, error: 'states array is required' });
    }

    const results: { state: string; status: string }[] = [];

    for (const state of states) {
      const normalizedState = state.toUpperCase();

      try {
        // Get current contacts for state
        const [existing] = await sequelize.query(`
          SELECT id, contacts FROM state_compliance_configs WHERE state = :state
        `, { replacements: { state: normalizedState } });

        let currentContacts: ContactRequirement[] = [];
        let configExists = false;

        if (existing && (existing as any[]).length > 0) {
          configExists = true;
          currentContacts = (existing as any[])[0].contacts || [];
        }

        // Check if contact already exists for this state
        const existingContact = currentContacts.find(
          (c: any) => c.category === contactRequirement.category
        );

        if (existingContact) {
          results.push({ state: normalizedState, status: 'already_exists' });
          continue;
        }

        // Add the new contact requirement
        currentContacts.push({
          category: contactRequirement.category,
          role: contactRequirement.role,
          phase: contactRequirement.phase ?? 0,
          blocking: contactRequirement.blocking ?? true,
          storageTable: contactRequirement.storageTable,
          requiredFields: contactRequirement.requiredFields || [],
        });

        if (configExists) {
          await sequelize.query(`
            UPDATE state_compliance_configs
            SET contacts = :contacts, "updatedAt" = NOW()
            WHERE state = :state
          `, { replacements: { state: normalizedState, contacts: JSON.stringify(currentContacts) } });
        } else {
          await sequelize.query(`
            INSERT INTO state_compliance_configs (state, contacts, "isActive", "createdAt", "updatedAt")
            VALUES (:state, :contacts, true, NOW(), NOW())
          `, { replacements: { state: normalizedState, contacts: JSON.stringify(currentContacts) } });
        }

        results.push({ state: normalizedState, status: 'added' });
      } catch (err) {
        results.push({ state: normalizedState, status: 'error' });
        console.error(`Error adding contact to ${normalizedState}:`, err);
      }
    }

    // Log the action
    soc2AuditLogger.logModification(
      { type: 'state_compliance_config', id: contactRequirement.category },
      { type: 'user', id: (req as any).user?.id, ip: req.ip || undefined, userAgent: req.get('User-Agent') },
      'bulk_assign_contact_requirements',
      'success',
      undefined,
      { contactRequirement, states, results }
    );

    const addedCount = results.filter(r => r.status === 'added').length;
    const alreadyExistsCount = results.filter(r => r.status === 'already_exists').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    res.json({
      success: true,
      data: {
        results,
        summary: { added: addedCount, alreadyExists: alreadyExistsCount, errors: errorCount },
      },
    });
  } catch (error) {
    console.error('Failed to bulk assign contact requirement:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}

/**
 * Bulk remove a contact requirement from multiple states
 */
export async function bulkRemoveContactRequirement(req: Request, res: Response) {
  try {
    const { category, states } = req.body;

    if (!category) {
      return res.status(400).json({ success: false, error: 'category is required' });
    }

    if (!Array.isArray(states) || states.length === 0) {
      return res.status(400).json({ success: false, error: 'states array is required' });
    }

    const results: { state: string; status: string }[] = [];

    for (const state of states) {
      const normalizedState = state.toUpperCase();

      try {
        // Get current contacts for state
        const [existing] = await sequelize.query(`
          SELECT id, contacts FROM state_compliance_configs WHERE state = :state
        `, { replacements: { state: normalizedState } });

        if (!existing || (existing as any[]).length === 0) {
          results.push({ state: normalizedState, status: 'not_found' });
          continue;
        }

        let currentContacts: ContactRequirement[] = (existing as any[])[0].contacts || [];
        const originalLength = currentContacts.length;

        // Remove the contact requirement
        currentContacts = currentContacts.filter((c: any) => c.category !== category);

        if (currentContacts.length === originalLength) {
          results.push({ state: normalizedState, status: 'not_found' });
          continue;
        }

        await sequelize.query(`
          UPDATE state_compliance_configs
          SET contacts = :contacts, "updatedAt" = NOW()
          WHERE state = :state
        `, { replacements: { state: normalizedState, contacts: JSON.stringify(currentContacts) } });

        results.push({ state: normalizedState, status: 'removed' });
      } catch (err) {
        results.push({ state: normalizedState, status: 'error' });
        console.error(`Error removing contact from ${normalizedState}:`, err);
      }
    }

    // Log the action
    soc2AuditLogger.logModification(
      { type: 'state_compliance_config', id: category },
      { type: 'user', id: (req as any).user?.id, ip: req.ip || undefined, userAgent: req.get('User-Agent') },
      'bulk_remove_contact_requirements',
      'success',
      undefined,
      { category, states, results }
    );

    const removedCount = results.filter(r => r.status === 'removed').length;
    const notFoundCount = results.filter(r => r.status === 'not_found').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    res.json({
      success: true,
      data: {
        results,
        summary: { removed: removedCount, notFound: notFoundCount, errors: errorCount },
      },
    });
  } catch (error) {
    console.error('Failed to bulk remove contact requirement:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}
