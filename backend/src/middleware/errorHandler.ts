/**
 * Centralized Error Handler Middleware
 *
 * Provides consistent error responses across the entire API.
 * Uses the custom error classes for typed error handling.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/LoggerService';
import {
  ApplicationError,
  isApplicationError,
  createApplicationError,
  ValidationError,
} from '../errors';

interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: Record<string, unknown>;
  stack?: string;
  requestId?: string;
}

/**
 * Main error handler middleware
 * Should be registered after all routes
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const requestId = (req as any).requestId || req.headers['x-request-id'];

  // Convert to ApplicationError if not already
  const appError = isApplicationError(err) ? err : createApplicationError(err);

  // Log error with context
  const logContext = {
    requestId,
    userId: (req as any).user?.id,
    path: req.path,
    method: req.method,
    statusCode: appError.statusCode,
    errorCode: appError.code,
  };

  if (appError.isOperational) {
    // Expected errors - log as warning
    logger.warn(appError.message, logContext, err);
  } else {
    // Unexpected errors - log as error with full stack
    logger.error('Unexpected error occurred', logContext, err);
  }

  // Build response
  const response: ErrorResponse = {
    success: false,
    error: isProduction && !appError.isOperational
      ? 'An unexpected error occurred'
      : appError.message,
    code: appError.code,
    requestId,
  };

  // Include details for operational errors (validation, etc.)
  if (appError.isOperational && appError.details) {
    response.details = appError.details;
  }

  // Include stack trace in development
  if (!isProduction) {
    response.stack = err.stack;
  }

  res.status(appError.statusCode).json(response);
}

/**
 * Async route wrapper to catch errors automatically
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<void | Response>
) {
  return (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 * Should be registered after all routes, before error handler
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  // Skip WebSocket paths - they're handled by the upgrade event on the HTTP server
  if (req.path.startsWith('/ws/')) {
    // Don't respond - let the WebSocket upgrade handler take over
    // The connection will timeout if no upgrade handler exists
    return;
  }

  const requestId = (req as any).requestId || req.headers['x-request-id'];

  logger.debug('Route not found', {
    path: req.path,
    method: req.method,
    requestId,
  });

  res.status(404).json({
    success: false,
    error: 'The requested resource was not found',
    code: 'NOT_FOUND',
    requestId,
  });
}

/**
 * Validation error helper for Zod schemas
 */
export function formatZodError(zodError: any): ValidationError {
  const errors = zodError.errors?.map((e: any) => ({
    field: e.path.join('.'),
    message: e.message,
  })) || [];

  return new ValidationError(
    'Validation failed',
    undefined,
    errors
  );
}

export default {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  formatZodError,
};
