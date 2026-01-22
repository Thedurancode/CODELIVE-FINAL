/**
 * Batch Query Utilities
 *
 * Helpers to prevent N+1 query problems by batching database lookups.
 * Use these instead of querying inside loops.
 */

import { Op } from 'sequelize';
import Property from '../models/Property';
import HedgeFundBuyBox from '../models/HedgeFundBuyBox';

// =============================================================================
// TYPES
// =============================================================================

export type PropertyMap = Map<string, any>;
export type BuyBoxMap = Map<string, HedgeFundBuyBox>;

// =============================================================================
// PROPERTY BATCH QUERIES
// =============================================================================

/**
 * Batch fetch properties by IDs
 * Returns a Map for O(1) lookup by propertyId
 *
 * @example
 * const propertyMap = await batchFetchProperties(['prop1', 'prop2', 'prop3']);
 * const prop1 = propertyMap.get('prop1');
 */
export async function batchFetchProperties(propertyIds: string[]): Promise<PropertyMap> {
  if (propertyIds.length === 0) return new Map();

  // Deduplicate IDs
  const uniqueIds = [...new Set(propertyIds)];

  const properties = await Property.findAll({
    where: {
      propertyId: { [Op.in]: uniqueIds },
    },
  });

  const map = new Map<string, any>();
  for (const prop of properties) {
    map.set((prop as any).propertyId, prop);
  }

  return map;
}

/**
 * Batch fetch properties with specific attributes
 * More efficient when you only need certain fields
 */
export async function batchFetchPropertyAttributes(
  propertyIds: string[],
  attributes: string[]
): Promise<PropertyMap> {
  if (propertyIds.length === 0) return new Map();

  const uniqueIds = [...new Set(propertyIds)];

  const properties = await Property.findAll({
    where: {
      propertyId: { [Op.in]: uniqueIds },
    },
    attributes: ['propertyId', ...attributes],
  });

  const map = new Map<string, any>();
  for (const prop of properties) {
    map.set((prop as any).propertyId, prop);
  }

  return map;
}

// =============================================================================
// BUY BOX BATCH QUERIES
// =============================================================================

/**
 * Batch fetch buy boxes by IDs
 * Returns a Map for O(1) lookup by buyBoxId
 *
 * @example
 * const buyBoxMap = await batchFetchBuyBoxes(['bb1', 'bb2', 'bb3']);
 * const bb1 = buyBoxMap.get('bb1');
 */
export async function batchFetchBuyBoxes(buyBoxIds: string[]): Promise<BuyBoxMap> {
  if (buyBoxIds.length === 0) return new Map();

  // Deduplicate IDs
  const uniqueIds = [...new Set(buyBoxIds)];

  const buyBoxes = await HedgeFundBuyBox.findAll({
    where: {
      id: { [Op.in]: uniqueIds },
    },
  });

  const map = new Map<string, HedgeFundBuyBox>();
  for (const bb of buyBoxes) {
    map.set(bb.id, bb);
  }

  return map;
}

/**
 * Batch fetch enabled buy boxes by IDs
 * Only returns enabled buy boxes
 */
export async function batchFetchEnabledBuyBoxes(buyBoxIds: string[]): Promise<BuyBoxMap> {
  if (buyBoxIds.length === 0) return new Map();

  const uniqueIds = [...new Set(buyBoxIds)];

  const buyBoxes = await HedgeFundBuyBox.findAll({
    where: {
      id: { [Op.in]: uniqueIds },
      enabled: true,
    },
  });

  const map = new Map<string, HedgeFundBuyBox>();
  for (const bb of buyBoxes) {
    map.set(bb.id, bb);
  }

  return map;
}

// =============================================================================
// GENERIC BATCH HELPER
// =============================================================================

/**
 * Generic batch fetch helper
 * Fetches records in batches to avoid N+1 queries
 *
 * @example
 * const userMap = await batchFetch(User, 'id', userIds);
 */
export async function batchFetch<T extends { id: string }>(
  model: any,
  idField: string,
  ids: string[],
  additionalWhere?: Record<string, unknown>
): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map();

  const uniqueIds = [...new Set(ids)];

  const records = await model.findAll({
    where: {
      [idField]: { [Op.in]: uniqueIds },
      ...additionalWhere,
    },
  });

  const map = new Map<string, T>();
  for (const record of records) {
    map.set(record[idField], record);
  }

  return map;
}

// =============================================================================
// CHUNKED BATCH QUERIES (for very large datasets)
// =============================================================================

const DEFAULT_CHUNK_SIZE = 1000;

/**
 * Batch fetch in chunks to avoid "too many SQL variables" errors
 * Use for large datasets (1000+ IDs)
 */
export async function batchFetchChunked<T extends { id: string }>(
  model: any,
  idField: string,
  ids: string[],
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map();

  const uniqueIds = [...new Set(ids)];
  const map = new Map<string, T>();

  // Process in chunks
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);

    const records = await model.findAll({
      where: {
        [idField]: { [Op.in]: chunk },
      },
    });

    for (const record of records) {
      map.set(record[idField], record);
    }
  }

  return map;
}

// =============================================================================
// PRELOAD HELPERS
// =============================================================================

/**
 * Extract IDs from an array of objects
 * Useful for preparing batch queries
 *
 * @example
 * const buyBoxIds = extractIds(matches, 'buyBoxId');
 * const buyBoxMap = await batchFetchBuyBoxes(buyBoxIds);
 */
export function extractIds<T>(items: T[], idField: keyof T): string[] {
  return items
    .map((item) => item[idField] as unknown as string)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/**
 * Preload related data for a list of items
 * Modifies items in place to add related data
 *
 * @example
 * await preloadRelation(offers, 'dealId', batchFetchProperties, 'property');
 */
export async function preloadRelation<T, R>(
  items: T[],
  idField: keyof T,
  fetchFn: (ids: string[]) => Promise<Map<string, R>>,
  targetField: string
): Promise<void> {
  const ids = extractIds(items, idField);
  const relatedMap = await fetchFn(ids);

  for (const item of items) {
    const id = item[idField] as unknown as string;
    (item as any)[targetField] = relatedMap.get(id) || null;
  }
}
