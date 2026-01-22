/**
 * Validation Middleware
 *
 * Provides Zod-based request validation for consistent input validation
 * across all API endpoints. Supports body, query, and params validation.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors';

// Extend Express Request to include validated data
declare global {
  namespace Express {
    interface Request {
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

interface ValidationOptions {
  /**
   * If true, strips unknown keys from the validated object
   * Default: true
   */
  stripUnknown?: boolean;

  /**
   * If true, allows partial validation (all fields optional)
   * Default: false
   */
  partial?: boolean;
}

/**
 * Format Zod error into a user-friendly structure
 */
function formatZodError(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
  }));
}

/**
 * Create validation middleware for request body
 */
export function validateBody<T extends ZodSchema>(
  schema: T,
  options: ValidationOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const { stripUnknown = true, partial = false } = options;

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      let effectiveSchema = schema;

      if (partial && 'partial' in effectiveSchema) {
        effectiveSchema = (effectiveSchema as any).partial();
      }

      if (stripUnknown && 'strip' in effectiveSchema) {
        effectiveSchema = (effectiveSchema as any).strip();
      }

      const result = effectiveSchema.parse(req.body);

      // Store validated data on request
      req.validated = req.validated || {};
      req.validated.body = result;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = formatZodError(error);
        next(new ValidationError('Request body validation failed', undefined, errors));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Create validation middleware for query parameters
 */
export function validateQuery<T extends ZodSchema>(
  schema: T,
  options: ValidationOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const { stripUnknown = true } = options;

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      let effectiveSchema = schema;

      if (stripUnknown && 'strip' in effectiveSchema) {
        effectiveSchema = (effectiveSchema as any).strip();
      }

      const result = effectiveSchema.parse(req.query);

      // Store validated data on request
      req.validated = req.validated || {};
      req.validated.query = result;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = formatZodError(error);
        next(new ValidationError('Query parameter validation failed', undefined, errors));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Create validation middleware for route parameters
 */
export function validateParams<T extends ZodSchema>(
  schema: T
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const result = schema.parse(req.params);

      // Store validated data on request
      req.validated = req.validated || {};
      req.validated.params = result;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = formatZodError(error);
        next(new ValidationError('Route parameter validation failed', undefined, errors));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Combined validation for body, query, and params
 */
export function validate<
  TBody extends ZodSchema = ZodSchema,
  TQuery extends ZodSchema = ZodSchema,
  TParams extends ZodSchema = ZodSchema
>(schemas: {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
}): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.validated = {};

      if (schemas.body) {
        req.validated.body = schemas.body.parse(req.body);
      }

      if (schemas.query) {
        req.validated.query = schemas.query.parse(req.query);
      }

      if (schemas.params) {
        req.validated.params = schemas.params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = formatZodError(error);
        next(new ValidationError('Request validation failed', undefined, errors));
      } else {
        next(error);
      }
    }
  };
}

// =============================================================================
// COMMON SCHEMA HELPERS
// =============================================================================

/**
 * Common validation schemas for reuse across the application
 */
export const commonSchemas = {
  // ID validation (UUID or numeric)
  id: z.string().uuid().or(z.string().regex(/^\d+$/).transform(Number)),

  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),

  // Date range
  dateRange: z.object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }),

  // Sort options
  sort: z.object({
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  // Email
  email: z.string().email().toLowerCase().trim(),

  // Phone (basic US format)
  phone: z.string().regex(/^[\d\s\-\(\)\.]+$/, 'Invalid phone number format'),

  // US State (2-letter code)
  state: z.string().length(2).toUpperCase(),

  // US Zip code
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid zip code format'),

  // Currency amount (in cents)
  currencyAmount: z.coerce.number().int().min(0),

  // Percentage (0-100)
  percentage: z.coerce.number().min(0).max(100),

  // Boolean from string
  booleanString: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1'),
  ]),
};

/**
 * Property-related schemas
 */
export const propertySchemas = {
  address: z.object({
    street: z.string().min(5).max(200),
    city: z.string().min(2).max(100),
    state: commonSchemas.state,
    zipCode: commonSchemas.zipCode,
  }),

  propertyType: z.enum([
    'SFH', 'MFH', 'CONDO', 'TOWNHOUSE', 'LAND', 'COMMERCIAL', 'MANUFACTURED', 'OTHER'
  ]),

  priceRange: z.object({
    min: z.coerce.number().positive().optional(),
    max: z.coerce.number().positive().optional(),
  }).refine(
    data => !data.min || !data.max || data.min <= data.max,
    'Minimum price must be less than or equal to maximum price'
  ),
};

export default {
  validateBody,
  validateQuery,
  validateParams,
  validate,
  commonSchemas,
  propertySchemas,
};
