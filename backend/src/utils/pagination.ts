/**
 * Pagination Utilities
 *
 * Provides consistent pagination across all list endpoints.
 * Prevents unbounded queries that can cause memory exhaustion.
 */

import { Request } from 'express';

// =============================================================================
// TYPES
// =============================================================================

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
  defaultPage?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_OPTIONS: Required<PaginationOptions> = {
  defaultLimit: 20,
  maxLimit: 100,
  defaultPage: 1,
};

// =============================================================================
// FUNCTIONS
// =============================================================================

/**
 * Parse pagination parameters from request query
 * Enforces maximum limits to prevent memory exhaustion
 */
export function parsePagination(
  req: Request,
  options: PaginationOptions = {}
): PaginationParams {
  const config = { ...DEFAULT_OPTIONS, ...options };

  // Parse page (1-indexed for user-friendly URLs)
  let page = parseInt(req.query.page as string, 10);
  if (isNaN(page) || page < 1) {
    page = config.defaultPage;
  }

  // Parse limit with maximum enforcement
  let limit = parseInt(req.query.limit as string, 10);
  if (isNaN(limit) || limit < 1) {
    limit = config.defaultLimit;
  }
  limit = Math.min(limit, config.maxLimit);

  // Calculate offset (0-indexed for database)
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Create a paginated response from results and total count
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / params.limit);

  return {
    success: true,
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
}

/**
 * Build Sequelize pagination options
 * Returns { limit, offset } for use in findAll/findAndCountAll
 */
export function sequelizePagination(params: PaginationParams): {
  limit: number;
  offset: number;
} {
  return {
    limit: params.limit,
    offset: params.offset,
  };
}

/**
 * Parse cursor-based pagination (for large datasets)
 * Uses an ID or timestamp as cursor instead of offset
 */
export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
  direction: 'next' | 'prev';
}

export function parseCursorPagination(
  req: Request,
  options: PaginationOptions = {}
): CursorPaginationParams {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const cursor = req.query.cursor as string | undefined;
  const direction = (req.query.direction as string) === 'prev' ? 'prev' : 'next';

  let limit = parseInt(req.query.limit as string, 10);
  if (isNaN(limit) || limit < 1) {
    limit = config.defaultLimit;
  }
  limit = Math.min(limit, config.maxLimit);

  return { cursor, limit, direction };
}

/**
 * Create cursor-based paginated response
 */
export interface CursorPaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    nextCursor?: string;
    prevCursor?: string;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function cursorPaginatedResponse<T extends { id: string }>(
  data: T[],
  params: CursorPaginationParams,
  hasMore: boolean
): CursorPaginatedResponse<T> {
  const firstItem = data[0];
  const lastItem = data[data.length - 1];

  return {
    data,
    pagination: {
      limit: params.limit,
      nextCursor: hasMore && lastItem ? lastItem.id : undefined,
      prevCursor: params.cursor && firstItem ? firstItem.id : undefined,
      hasNext: hasMore,
      hasPrev: !!params.cursor,
    },
  };
}

/**
 * Express middleware to add pagination to request
 * Adds req.pagination with parsed params
 */
export function paginationMiddleware(options: PaginationOptions = {}) {
  return (req: Request, _res: any, next: any) => {
    (req as any).pagination = parsePagination(req, options);
    next();
  };
}
