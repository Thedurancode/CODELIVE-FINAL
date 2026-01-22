/**
 * Custom Error Classes
 *
 * Provides a standardized error hierarchy for consistent error handling
 * across the entire application. All errors extend ApplicationError which
 * provides structured error responses.
 */

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class ApplicationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public isOperational: boolean = true,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

// =============================================================================
// 4xx CLIENT ERRORS
// =============================================================================

/**
 * 400 Bad Request - Invalid input or malformed request
 */
export class BadRequestError extends ApplicationError {
  constructor(message: string = 'Bad request', details?: Record<string, unknown>) {
    super(message, 400, 'BAD_REQUEST', true, details);
  }
}

/**
 * 400 Validation Error - Input validation failed
 */
export class ValidationError extends ApplicationError {
  constructor(
    message: string = 'Validation failed',
    public field?: string,
    public errors?: Array<{ field: string; message: string }>
  ) {
    super(message, 400, 'VALIDATION_ERROR', true, { field, errors });
  }
}

/**
 * 401 Unauthorized - Authentication required or failed
 */
export class UnauthorizedError extends ApplicationError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED', true);
  }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export class ForbiddenError extends ApplicationError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN', true);
  }
}

/**
 * 404 Not Found - Resource does not exist
 */
export class NotFoundError extends ApplicationError {
  constructor(resource: string = 'Resource', id?: string | number) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', true, { resource, id });
  }
}

/**
 * 409 Conflict - Resource state conflict
 */
export class ConflictError extends ApplicationError {
  constructor(message: string = 'Resource conflict', resource?: string) {
    super(message, 409, 'CONFLICT', true, { resource });
  }
}

/**
 * 422 Unprocessable Entity - Semantic validation error
 */
export class UnprocessableEntityError extends ApplicationError {
  constructor(message: string = 'Unprocessable entity', details?: Record<string, unknown>) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', true, details);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends ApplicationError {
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true, { retryAfter });
  }
}

// =============================================================================
// 5xx SERVER ERRORS
// =============================================================================

/**
 * 500 Internal Server Error - Generic server error
 */
export class InternalServerError extends ApplicationError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR', false);
  }
}

/**
 * 501 Not Implemented - Feature not yet available
 */
export class NotImplementedError extends ApplicationError {
  constructor(feature: string = 'Feature') {
    super(`${feature} is not yet implemented`, 501, 'NOT_IMPLEMENTED', true, { feature });
  }
}

/**
 * 502 Bad Gateway - External service error
 */
export class BadGatewayError extends ApplicationError {
  constructor(service: string = 'External service') {
    super(`${service} returned an error`, 502, 'BAD_GATEWAY', true, { service });
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export class ServiceUnavailableError extends ApplicationError {
  constructor(service: string = 'Service', retryAfter?: number) {
    super(`${service} is temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE', true, { service, retryAfter });
  }
}

/**
 * 504 Gateway Timeout - External service timeout
 */
export class GatewayTimeoutError extends ApplicationError {
  constructor(service: string = 'External service') {
    super(`${service} request timed out`, 504, 'GATEWAY_TIMEOUT', true, { service });
  }
}

// =============================================================================
// DOMAIN-SPECIFIC ERRORS
// =============================================================================

/**
 * Database operation error
 */
export class DatabaseError extends ApplicationError {
  constructor(message: string = 'Database operation failed', operation?: string) {
    super(message, 500, 'DATABASE_ERROR', false, { operation });
  }
}

/**
 * External API error
 */
export class ExternalApiError extends ApplicationError {
  constructor(
    service: string,
    message: string = 'External API request failed',
    statusCode: number = 502
  ) {
    super(message, statusCode, 'EXTERNAL_API_ERROR', true, { service });
  }
}

/**
 * Configuration error - Missing or invalid config
 */
export class ConfigurationError extends ApplicationError {
  constructor(message: string = 'Configuration error', configKey?: string) {
    super(message, 500, 'CONFIGURATION_ERROR', false, { configKey });
  }
}

/**
 * Compliance error - Compliance check failed
 */
export class ComplianceError extends ApplicationError {
  constructor(
    message: string = 'Compliance check failed',
    checkType?: string,
    violations?: string[]
  ) {
    super(message, 400, 'COMPLIANCE_ERROR', true, { checkType, violations });
  }
}

/**
 * Payment error - Payment processing failed
 */
export class PaymentError extends ApplicationError {
  constructor(message: string = 'Payment processing failed', details?: Record<string, unknown>) {
    super(message, 400, 'PAYMENT_ERROR', true, details);
  }
}

// =============================================================================
// ERROR TYPE GUARDS
// =============================================================================

/**
 * Check if an error is an ApplicationError
 */
export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}

/**
 * Check if an error is operational (expected) vs programming error
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof ApplicationError) {
    return error.isOperational;
  }
  return false;
}

// =============================================================================
// ERROR FACTORY
// =============================================================================

/**
 * Create an ApplicationError from a generic error
 */
export function createApplicationError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (error instanceof Error) {
    // Try to identify error type from message
    const message = error.message.toLowerCase();

    if (message.includes('not found')) {
      return new NotFoundError('Resource');
    }

    if (message.includes('unauthorized') || message.includes('authentication')) {
      return new UnauthorizedError(error.message);
    }

    if (message.includes('forbidden') || message.includes('permission')) {
      return new ForbiddenError(error.message);
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return new ValidationError(error.message);
    }

    if (message.includes('timeout')) {
      return new GatewayTimeoutError();
    }

    if (message.includes('database') || message.includes('sequelize')) {
      return new DatabaseError(error.message);
    }

    return new InternalServerError(error.message);
  }

  return new InternalServerError(String(error));
}

export default {
  ApplicationError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  RateLimitError,
  InternalServerError,
  NotImplementedError,
  BadGatewayError,
  ServiceUnavailableError,
  GatewayTimeoutError,
  DatabaseError,
  ExternalApiError,
  ConfigurationError,
  ComplianceError,
  PaymentError,
  isApplicationError,
  isOperationalError,
  createApplicationError,
};
