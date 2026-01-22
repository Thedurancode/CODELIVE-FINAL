/**
 * Duplicate Detection Service
 *
 * Detects potential duplicate records when importing data
 * Uses fuzzy matching and configurable matching rules
 */

import { Op } from 'sequelize';
import {
  ImportType,
  DuplicateMatch,
  DuplicateDetectionResult,
  DuplicateAction,
} from '../types/import';
import Property from '../models/Property';
import Buyer from '../models/Buyer';

// Levenshtein distance for fuzzy string matching
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[s1.length][s2.length];
}

// Calculate string similarity as percentage (0-100)
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1.toLowerCase() === str2.toLowerCase()) return 100;

  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  return Math.round((1 - distance / maxLength) * 100);
}

// Normalize address for comparison
function normalizeAddress(address: string | { houseNumber?: string; street?: string; address2?: string } | null): string {
  if (!address) return '';

  let str: string;
  if (typeof address === 'object') {
    str = [address.houseNumber, address.street, address.address2].filter(Boolean).join(' ');
  } else {
    str = address;
  }

  return str
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way|place|pl)\b/g, (match) => {
      const abbrevs: Record<string, string> = {
        street: 'st', avenue: 'ave', road: 'rd', drive: 'dr',
        lane: 'ln', court: 'ct', boulevard: 'blvd', way: 'way', place: 'pl'
      };
      return abbrevs[match] || match;
    })
    .replace(/\b(north|n|south|s|east|e|west|w)\b/g, (match) => {
      const abbrevs: Record<string, string> = { north: 'n', south: 's', east: 'e', west: 'w' };
      return abbrevs[match] || match;
    })
    .trim();
}

// Normalize ZIP code
function normalizeZip(zip: string | null): string {
  if (!zip) return '';
  return zip.replace(/\D/g, '').slice(0, 5);
}

class DuplicateDetectionService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('✅ DuplicateDetectionService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Detect duplicates for a batch of import data
   */
  async detectDuplicates(
    importType: ImportType,
    importData: Record<string, unknown>[],
    startRowNumber: number = 1
  ): Promise<DuplicateDetectionResult> {
    const matches: DuplicateMatch[] = [];

    if (importType === 'deals') {
      await this.detectDealDuplicates(importData, matches, startRowNumber);
    } else {
      await this.detectBuyerDuplicates(importData, matches, startRowNumber);
    }

    return {
      totalChecked: importData.length,
      duplicatesFound: matches.length,
      matches,
      uniqueRecords: importData.length - matches.length,
    };
  }

  /**
   * Detect duplicate deals/properties
   */
  private async detectDealDuplicates(
    importData: Record<string, unknown>[],
    matches: DuplicateMatch[],
    startRowNumber: number
  ): Promise<void> {
    // Get all addresses and zips for batch lookup
    const addressSearches: { row: number; address: string; city: string; state: string; zip: string }[] = [];

    for (let i = 0; i < importData.length; i++) {
      const row = importData[i];
      const address = row.address as { houseNumber?: string; street?: string } | string | undefined;
      const normalizedAddr = normalizeAddress(address);
      const city = (row.city as string || '').toLowerCase();
      const state = (row.state as string || '').toUpperCase();
      const zip = normalizeZip(row.zip as string);

      if (normalizedAddr || zip) {
        addressSearches.push({
          row: startRowNumber + i,
          address: normalizedAddr,
          city,
          state,
          zip,
        });
      }
    }

    // Batch lookup existing properties
    for (const search of addressSearches) {
      // Build search criteria
      const whereConditions: any[] = [];

      if (search.zip) {
        whereConditions.push({ zip: search.zip });
      }

      if (search.state) {
        whereConditions.push({ state: search.state });
      }

      if (whereConditions.length === 0) continue;

      const existingProperties = await Property.findAll({
        where: {
          [Op.and]: whereConditions,
        },
        limit: 50, // Limit for performance
      });

      // Check each property for similarity
      for (const prop of existingProperties) {
        const propAddress = normalizeAddress(prop.address);
        const propCity = (prop.city || '').toLowerCase();

        const addressSimilarity = stringSimilarity(search.address, propAddress);
        const citySimilarity = stringSimilarity(search.city, propCity);
        const zipMatch = normalizeZip(prop.zip) === search.zip;

        // Calculate overall confidence
        let confidence = 0;
        const matchedFields: string[] = [];

        if (addressSimilarity >= 85) {
          confidence += 50;
          matchedFields.push('address');
        } else if (addressSimilarity >= 70) {
          confidence += 30;
          matchedFields.push('address (partial)');
        }

        if (zipMatch) {
          confidence += 30;
          matchedFields.push('zip');
        }

        if (citySimilarity >= 90) {
          confidence += 20;
          matchedFields.push('city');
        }

        // Only report as duplicate if confidence is high enough
        if (confidence >= 70) {
          const importRow = importData[search.row - startRowNumber];

          matches.push({
            rowNumber: search.row,
            importData: importRow,
            existingRecord: {
              id: String(prop.id),
              data: {
                id: prop.id,
                address: prop.address,
                city: prop.city,
                state: prop.state,
                zip: prop.zip,
                propertyType: prop.propertyType,
                purchaseContractPrice: prop.purchaseContractPrice,
                createdAt: prop.createdAt,
              },
            },
            matchedFields,
            confidence,
            suggestedAction: confidence >= 90 ? 'skip' : 'create_new',
          });

          break; // Only match with first found duplicate
        }
      }
    }
  }

  /**
   * Detect duplicate buyers
   */
  private async detectBuyerDuplicates(
    importData: Record<string, unknown>[],
    matches: DuplicateMatch[],
    startRowNumber: number
  ): Promise<void> {
    for (let i = 0; i < importData.length; i++) {
      const row = importData[i];
      const rowNumber = startRowNumber + i;
      const name = (row.name as string || '').trim();
      const address = (row.address as string || '').trim();

      if (!name) continue;

      // Search for similar buyers
      const existingBuyers = await Buyer.findAll({
        where: {
          [Op.or]: [
            { name: { [Op.iLike]: `%${name.slice(0, 20)}%` } },
            ...(address ? [{ address: { [Op.iLike]: `%${address.slice(0, 20)}%` } }] : []),
          ],
        },
        limit: 20,
      });

      for (const buyer of existingBuyers) {
        const nameSimilarity = stringSimilarity(name, buyer.name);
        const addressSimilarity = address && buyer.address
          ? stringSimilarity(normalizeAddress(address), normalizeAddress(buyer.address))
          : 0;

        // Calculate confidence
        let confidence = 0;
        const matchedFields: string[] = [];

        if (nameSimilarity >= 95) {
          confidence += 70;
          matchedFields.push('name');
        } else if (nameSimilarity >= 85) {
          confidence += 50;
          matchedFields.push('name (similar)');
        }

        if (addressSimilarity >= 85) {
          confidence += 30;
          matchedFields.push('address');
        }

        // Check for duplicate if confidence is high enough
        if (confidence >= 70) {
          matches.push({
            rowNumber,
            importData: row,
            existingRecord: {
              id: buyer.id,
              data: {
                id: buyer.id,
                name: buyer.name,
                address: buyer.address,
                city: buyer.city,
                state: buyer.state,
                zip: buyer.zip,
                buyingCounties: buyer.buyingCounties,
                purchases6Month: buyer.purchases6Month,
                createdAt: buyer.createdAt,
              },
            },
            matchedFields,
            confidence,
            suggestedAction: confidence >= 90 ? 'skip' : 'create_new',
          });

          break; // Only match with first found duplicate
        }
      }
    }
  }

  /**
   * Get suggested action based on duplicate match
   */
  getSuggestedAction(match: DuplicateMatch): DuplicateAction {
    if (match.confidence >= 95) {
      return 'skip';
    } else if (match.confidence >= 80) {
      return 'update';
    }
    return 'create_new';
  }
}

export const duplicateDetectionService = new DuplicateDetectionService();
export default duplicateDetectionService;
