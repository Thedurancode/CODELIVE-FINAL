/**
 * Compliance Validators
 *
 * Input validation schemas for compliance-related API endpoints.
 * Uses Joi for schema validation to prevent injection and ensure data integrity.
 */

import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';

// =============================================================================
// COMPLIANCE RULE VALIDATION
// =============================================================================

const validOperators = [
  'required', 'equals', 'not_equals', 'contains',
  'min_value', 'max_value', 'min_days_until', 'max_days_until',
  'regex', 'in_list', 'not_in_list', 'is_true', 'is_false'
];

const validSeverities = ['critical', 'warning', 'info'];
const validCategories = ['contract', 'disclosure', 'licensing', 'general'];
const validReviewDecisions = ['confirmed', 'dismissed', 'overridden'];

// Safe field pattern - alphanumeric with dots for nested fields
const safeFieldPattern = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

const severityOverrideSchema = Joi.object({
  when: Joi.object({
    transactionType: Joi.alternatives()
      .try(Joi.string(), Joi.array().items(Joi.string()))
      .optional(),
    dealStage: Joi.alternatives()
      .try(Joi.string(), Joi.array().items(Joi.string()))
      .optional(),
    brokerStatus: Joi.alternatives()
      .try(Joi.string(), Joi.array().items(Joi.string()))
      .optional(),
    priorViolations: Joi.alternatives()
      .try(
        Joi.number().integer().min(0),
        Joi.object({
          min: Joi.number().integer().min(0).optional(),
          max: Joi.number().integer().min(0).optional(),
        }).min(1)
      )
      .optional(),
  })
    .optional(),
  severity: Joi.string()
    .valid(...validSeverities)
    .required(),
});

/**
 * Schema for creating a compliance rule
 */
export const createRuleSchema = Joi.object({
  state: Joi.string()
    .uppercase()
    .max(10)
    .pattern(/^[A-Z]{2,3}$|^ALL$/)
    .required()
    .messages({
      'string.pattern.base': 'State must be 2-3 letter code or "ALL"',
    }),

  name: Joi.string()
    .min(3)
    .max(200)
    .required()
    .messages({
      'string.min': 'Rule name must be at least 3 characters',
      'string.max': 'Rule name cannot exceed 200 characters',
    }),

  description: Joi.string()
    .max(1000)
    .optional()
    .allow('', null),

  category: Joi.string()
    .valid(...validCategories)
    .required()
    .messages({
      'any.only': `Category must be one of: ${validCategories.join(', ')}`,
    }),

  field: Joi.string()
    .max(100)
    .pattern(safeFieldPattern)
    .required()
    .messages({
      'string.pattern.base': 'Field must be alphanumeric with dots for nesting (e.g., "address.city")',
    }),

  operator: Joi.string()
    .valid(...validOperators)
    .required()
    .messages({
      'any.only': `Operator must be one of: ${validOperators.join(', ')}`,
    }),

  value: Joi.string()
    .max(500)
    .optional()
    .allow('', null)
    .when('operator', {
      is: Joi.valid('regex'),
      then: Joi.string().max(100).messages({
        'string.max': 'Regex patterns cannot exceed 100 characters for security',
      }),
    }),

  severity: Joi.string()
    .valid(...validSeverities)
    .required()
    .messages({
      'any.only': `Severity must be one of: ${validSeverities.join(', ')}`,
    }),

  severityOverrides: Joi.array()
    .items(severityOverrideSchema)
    .optional(),

  message: Joi.string()
    .min(5)
    .max(500)
    .required()
    .messages({
      'string.min': 'Error message must be at least 5 characters',
      'string.max': 'Error message cannot exceed 500 characters',
    }),

  enabled: Joi.boolean()
    .default(true),

  order: Joi.number()
    .integer()
    .min(0)
    .max(10000)
    .default(100),
});

/**
 * Schema for updating a compliance rule (all fields optional)
 */
export const updateRuleSchema = Joi.object({
  state: Joi.string()
    .uppercase()
    .max(10)
    .pattern(/^[A-Z]{2,3}$|^ALL$/),

  name: Joi.string()
    .min(3)
    .max(200),

  description: Joi.string()
    .max(1000)
    .allow('', null),

  category: Joi.string()
    .valid(...validCategories),

  field: Joi.string()
    .max(100)
    .pattern(safeFieldPattern),

  operator: Joi.string()
    .valid(...validOperators),

  value: Joi.string()
    .max(500)
    .allow('', null),

  severity: Joi.string()
    .valid(...validSeverities),

  severityOverrides: Joi.array()
    .items(severityOverrideSchema)
    .optional(),

  message: Joi.string()
    .min(5)
    .max(500),

  enabled: Joi.boolean(),

  order: Joi.number()
    .integer()
    .min(0)
    .max(10000),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

/**
 * Schema for reviewing a compliance issue
 */
export const issueReviewSchema = Joi.object({
  decision: Joi.string()
    .valid(...validReviewDecisions)
    .required(),
  notes: Joi.string()
    .max(2000)
    .allow('', null)
    .optional(),
  overrideSeverity: Joi.string()
    .valid(...validSeverities)
    .allow('', null)
    .optional(),
  overrideMessage: Joi.string()
    .max(1000)
    .allow('', null)
    .optional(),
});

// =============================================================================
// KNOWLEDGE BASE VALIDATION
// =============================================================================

const validKnowledgeTypes = [
  'law', 'regulation', 'legal_requirement', 'form', 'license_info',
  'fee_structure', 'timeline', 'disclosure', 'restriction', 'penalty',
  'case_law', 'best_practice', 'contact', 'link', 'note'
];

/**
 * Schema for creating a knowledge entry
 */
export const createKnowledgeSchema = Joi.object({
  state: Joi.string()
    .uppercase()
    .max(10)
    .pattern(/^[A-Z]{2,3}$|^ALL$/)
    .required(),

  type: Joi.string()
    .valid(...validKnowledgeTypes)
    .required(),

  title: Joi.string()
    .min(3)
    .max(300)
    .required(),

  content: Joi.string()
    .min(10)
    .max(50000)
    .required(),

  summary: Joi.string()
    .max(1000)
    .optional()
    .allow('', null),

  category: Joi.string()
    .max(100)
    .optional(),

  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(20)
    .optional(),

  sourceUrl: Joi.string()
    .uri()
    .max(500)
    .optional()
    .allow('', null),

  sourceName: Joi.string()
    .max(200)
    .optional()
    .allow('', null),

  effectiveDate: Joi.date()
    .iso()
    .optional()
    .allow(null),

  expirationDate: Joi.date()
    .iso()
    .min(Joi.ref('effectiveDate'))
    .optional()
    .allow(null),

  priority: Joi.number()
    .integer()
    .min(0)
    .max(100)
    .default(50),

  enabled: Joi.boolean()
    .default(true),
});

// =============================================================================
// DOCUMENT TEMPLATE VALIDATION
// =============================================================================

const validDocumentCategories = [
  'purchase_contract', 'assignment_addendum', 'seller_disclosure',
  'lead_paint', 'hoa_disclosure', 'inspection_notice', 'financing_addendum',
  'closing_instructions', 'proof_of_funds', 'offer_letter', 'jv_agreement', 'other'
];

/**
 * Schema for creating a document template
 */
export const createDocumentTemplateSchema = Joi.object({
  state: Joi.string()
    .uppercase()
    .max(10)
    .pattern(/^[A-Z]{2,3}$|^ALL$/)
    .required(),

  category: Joi.string()
    .valid(...validDocumentCategories)
    .required(),

  name: Joi.string()
    .min(3)
    .max(200)
    .required(),

  description: Joi.string()
    .max(1000)
    .optional()
    .allow('', null),

  docuSealTemplateId: Joi.number()
    .integer()
    .positive()
    .required(),

  requiredFor: Joi.array()
    .items(Joi.string().valid('wholesaling', 'retail', 'all'))
    .optional(),

  fieldMappings: Joi.object()
    .pattern(
      Joi.string().max(100),
      Joi.string().max(100)
    )
    .optional(),

  priority: Joi.number()
    .integer()
    .min(0)
    .max(100)
    .default(50),
});

// =============================================================================
// BULK OPERATIONS VALIDATION
// =============================================================================

/**
 * Schema for bulk compliance check
 */
export const bulkCheckSchema = Joi.object({
  propertyIds: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.max': 'Maximum 100 properties per bulk check',
      'array.min': 'At least one property ID is required',
    }),
});

/**
 * Schema for compliance check by identifier (external ID or address)
 */
export const checkByIdentifierSchema = Joi.object({
  externalId: Joi.string()
    .max(100)
    .optional(),
  propertyId: Joi.string()
    .max(100)
    .optional(),
  address: Joi.object({
    houseNumber: Joi.string()
      .max(20)
      .optional(),
    street: Joi.string()
      .min(2)
      .max(200)
      .required(),
    address2: Joi.string()
      .max(200)
      .optional()
      .allow('', null),
    city: Joi.string()
      .max(100)
      .optional(),
    state: Joi.string()
      .uppercase()
      .pattern(/^[A-Z]{2,3}$/)
      .required(),
    zip: Joi.string()
      .max(20)
      .optional(),
  })
    .optional(),
  transactionType: Joi.string()
    .valid('wholesaling', 'retail', 'all')
    .optional(),
  dealStage: Joi.string()
    .max(100)
    .optional(),
  brokerStatus: Joi.string()
    .max(100)
    .optional(),
  priorViolations: Joi.number()
    .integer()
    .min(0)
    .optional(),
  autoRemediate: Joi.boolean()
    .optional(),
}).or('externalId', 'propertyId', 'address').messages({
  'object.missing': 'Provide externalId, propertyId, or address',
});

// =============================================================================
// VALIDATION MIDDLEWARE FACTORY
// =============================================================================

/**
 * Create validation middleware from a Joi schema
 */
export function validate(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors, not just first
      stripUnknown: true, // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    // Replace body with validated/sanitized value
    req.body = value;
    next();
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createRuleSchema,
  updateRuleSchema,
  createKnowledgeSchema,
  createDocumentTemplateSchema,
  bulkCheckSchema,
  checkByIdentifierSchema,
  validate,
};
