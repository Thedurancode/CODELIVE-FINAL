/**
 * Property Service - Handles saving crawled deals to the database
 *
 * Maps NormalizedDeal objects from Firecrawl and other sources to Property model
 * Includes deduplication by address and owner change tracking
 * Supports automatic market data enrichment via Zillow/RapidAPI
 */

import { Op, Transaction } from 'sequelize';
import Property from '../models/Property';
import { NormalizedDeal } from '../plugins/types';
import { v4 as uuidv4 } from 'uuid';
import { MarketDataService } from './MarketDataService';
import sequelize from '../config/database';
import { complianceTriggerService } from './ComplianceTriggerService';

export interface SavePropertyResult {
  success: boolean;
  property?: Property;
  propertyId?: string;
  error?: string;
  action: 'created' | 'updated' | 'skipped' | 'duplicate';
  duplicateOf?: string;
  ownerChanged?: boolean;
  previousOwner?: string;
  enriched?: boolean;
  enrichmentError?: string;
  enrichmentData?: {
    zestimate?: number;
    rentZestimate?: number;
    ownerName?: string;
    comparablesCount?: number;
  };
}

export interface OwnerChangeRecord {
  previousOwner: string;
  newOwner: string;
  changedAt: Date;
  source: string;
}

export interface BulkSaveResult {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  duplicates: number;
  ownerChanges: number;
  errors: Array<{ deal: NormalizedDeal; error: string }>;
  properties: Property[];
  duplicateProperties: Array<{ deal: NormalizedDeal; existingPropertyId: string }>;
  ownerChangeRecords: Array<{ propertyId: string; previousOwner: string; newOwner: string }>;
}

class PropertyService {
  /**
   * Normalize address for comparison (remove extra spaces, lowercase, etc.)
   */
  private normalizeAddress(street: string): string {
    return street
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,#]/g, '')
      .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd)\b/g, (match) => {
        const abbrevs: Record<string, string> = {
          street: 'st', avenue: 'ave', road: 'rd', drive: 'dr',
          lane: 'ln', court: 'ct', boulevard: 'blvd',
          st: 'st', ave: 'ave', rd: 'rd', dr: 'dr', ln: 'ln', ct: 'ct', blvd: 'blvd'
        };
        return abbrevs[match] || match;
      })
      .trim();
  }

  /**
   * Find existing property by address (full address match)
   * @param street - Street address to match
   * @param city - City name
   * @param state - State code
   * @param zip - Optional ZIP code
   * @param transaction - Optional Sequelize transaction for atomic operations
   */
  async findByAddress(
    street: string,
    city: string,
    state: string,
    zip?: string,
    transaction?: Transaction
  ): Promise<Property | null> {
    const normalizedStreet = this.normalizeAddress(street);

    // Get all properties in the same city/state
    const candidates = await Property.findAll({
      where: {
        city: { [Op.iLike]: city.trim() },
        state: { [Op.iLike]: state.trim() },
        ...(zip ? { zip: zip.trim() } : {}),
      },
      ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
    });

    // Find match by normalized address
    for (const property of candidates) {
      // Access data via dataValues for Sequelize compatibility
      const dataValues = (property as any).dataValues || property;
      const addrData = dataValues?.address;

      // Safely extract address components with null checks
      const houseNumber = addrData?.houseNumber ?? '';
      const street = addrData?.street ?? '';
      const propStreet = `${houseNumber} ${street}`.trim();
      const normalizedProp = this.normalizeAddress(propStreet);

      if (normalizedProp === normalizedStreet) {
        return property;
      }
    }

    return null;
  }

  /**
   * Check if property is a duplicate
   * Detection priority: externalId > address
   *
   * NOTE: Phone/email matching was removed to prevent false positives.
   * A wholesaler with multiple properties shares the same phone/email across all deals,
   * which would incorrectly mark different properties as duplicates of each other.
   * Phone/email should only be used for owner/contact lookup, not property deduplication.
   *
   * @param deal - The deal to check for duplicates
   * @param transaction - Optional Sequelize transaction for atomic operations
   */
  async checkDuplicate(deal: NormalizedDeal, transaction?: Transaction): Promise<{
    isDuplicate: boolean;
    existingProperty?: Property;
    matchedBy?: 'externalId' | 'address';
  }> {
    // First check by external ID (most reliable)
    if (deal.externalId) {
      const byId = await Property.findOne({
        where: { propertyId: deal.externalId },
        ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
      });
      if (byId) {
        return { isDuplicate: true, existingProperty: byId, matchedBy: 'externalId' };
      }
    }

    // Then check by full address (primary deduplication method)
    if (deal.address.street && deal.address.city && deal.address.state) {
      const byAddress = await this.findByAddress(
        deal.address.street,
        deal.address.city,
        deal.address.state,
        deal.address.zip,
        transaction
      );
      if (byAddress) {
        return { isDuplicate: true, existingProperty: byAddress, matchedBy: 'address' };
      }
    }

    // Phone/email matching removed - causes false positives when the same wholesaler
    // submits multiple different properties (they all share the same contact info)

    return { isDuplicate: false };
  }

  /**
   * Extract phone numbers from a deal
   */
  private extractPhones(deal: NormalizedDeal): string[] {
    const phones: string[] = [];
    if ((deal as any).wholesalerPhone) phones.push(this.normalizePhone((deal as any).wholesalerPhone));
    if ((deal as any).ownerPhone) phones.push(this.normalizePhone((deal as any).ownerPhone));
    if ((deal as any).contactPhone) phones.push(this.normalizePhone((deal as any).contactPhone));
    return phones.filter(p => p.length >= 10);
  }

  /**
   * Extract emails from a deal
   */
  private extractEmails(deal: NormalizedDeal): string[] {
    const emails: string[] = [];
    if (deal.wholesalerEmail) emails.push(deal.wholesalerEmail.toLowerCase().trim());
    if ((deal as any).ownerEmail) emails.push((deal as any).ownerEmail.toLowerCase().trim());
    if ((deal as any).contactEmail) emails.push((deal as any).contactEmail.toLowerCase().trim());
    return emails.filter(e => e.includes('@'));
  }

  /**
   * Normalize phone number for comparison
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').slice(-10); // Last 10 digits
  }

  /**
   * Find property by phone number match
   */
  async findByPhone(phones: string[]): Promise<Property | null> {
    if (phones.length === 0) return null;

    // Search in ownerPhones array
    const properties = await Property.findAll({
      where: {
        ownerPhones: { [Op.overlap]: phones }
      },
      limit: 1
    });

    return properties[0] || null;
  }

  /**
   * Find property by email match
   */
  async findByEmail(emails: string[]): Promise<Property | null> {
    if (emails.length === 0) return null;

    // Search in ownerEmails array (case-insensitive)
    const lowerEmails = emails.map(e => e.toLowerCase());
    const properties = await Property.findAll({
      where: {
        ownerEmails: { [Op.overlap]: lowerEmails }
      },
      limit: 1
    });

    return properties[0] || null;
  }

  /**
   * Save a single normalized deal to the database
   * - Uses transaction with row locking to prevent race conditions
   * - Prevents duplicates by checking full address
   * - Tracks owner changes
   * - Optionally enriches with Zillow market data
   * - Returns detailed result
   */
  async saveDealToDatabase(deal: NormalizedDeal, options: {
    allowUpdate?: boolean;
    enrichWithMarketData?: boolean;
    onBeforeCommit?: (property: Property, action: SavePropertyResult['action'], transaction: Transaction) => Promise<void>;
  } = {}): Promise<SavePropertyResult> {
    const { allowUpdate = true, onBeforeCommit } = options;
    let enrichWithMarketData = options.enrichWithMarketData;

    // If enrichWithMarketData not explicitly set, check global settings
    if (enrichWithMarketData === undefined) {
      try {
        const { settingsService } = await import('./settingsService');
        enrichWithMarketData = await settingsService.isEnabled('enrichment.enabled');
      } catch {
        // Settings not available, default to true for automatic enrichment
        enrichWithMarketData = true;
      }
    }

    // Use transaction with row locking to prevent race conditions
    // when multiple identical deals arrive simultaneously
    const transaction = await sequelize.transaction();

    try {
      // Check for existing property (with row lock to prevent race conditions)
      const { isDuplicate, existingProperty } = await this.checkDuplicate(deal, transaction);

      if (isDuplicate && existingProperty) {
        if (!allowUpdate) {
          // Return as duplicate without updating
          await transaction.commit();
          console.log(`⚠️ Duplicate property found: ${existingProperty.propertyId} - ${deal.address.street}`);
          return {
            success: true,
            property: existingProperty,
            propertyId: existingProperty.propertyId,
            action: 'duplicate',
            duplicateOf: existingProperty.propertyId,
          };
        }

        // Check for owner change
        const newOwner = deal.wholesalerName || deal.wholesalerCompany;
        const currentOwner = existingProperty.llcOwnerName || existingProperty.wholesalerLlcName;
        let ownerChanged = false;
        let previousOwner: string | undefined;

        // Generate propertyId for mapping
        const propertyId = existingProperty.propertyId;
        const propertyData = this.mapDealToProperty(deal, propertyId);

        if (newOwner && currentOwner && newOwner !== currentOwner) {
          ownerChanged = true;
          previousOwner = currentOwner;
          console.log(`👤 Owner change detected for ${existingProperty.propertyId}: ${currentOwner} → ${newOwner}`);

          // Update owner history - close out previous owner and add new one
          const ownerHistory = (existingProperty.ownerHistory || []) as any[];
          const now = new Date();

          // Close out the previous owner's record
          if (ownerHistory.length > 0) {
            const lastOwner = ownerHistory[ownerHistory.length - 1];
            if (!lastOwner.endDate) {
              lastOwner.endDate = now;
            }
          }

          // Add new owner record
          ownerHistory.push({
            ownerName: newOwner,
            ownerEmail: deal.wholesalerEmail,
            ownerCompany: deal.wholesalerCompany,
            startDate: now,
            endDate: null,
            source: deal.sourceName || 'unknown',
          });

          (propertyData as any).ownerHistory = ownerHistory;
        }

        // Update existing property within transaction
        await existingProperty.update(propertyData as any, { transaction });

        if (onBeforeCommit) {
          await onBeforeCommit(existingProperty, 'updated', transaction);
        }

        await transaction.commit();

        // Fire compliance triggers for property update (non-blocking)
        if (ownerChanged && previousOwner) {
          complianceTriggerService.handlePropertyEvent('property.seller_changed', existingProperty.id, {
            previousSeller: previousOwner,
            newSeller: newOwner,
            source: deal.sourceName || 'external',
          }).catch(err => console.warn('Compliance trigger failed:', err.message));
        }

        // Enrich with market data if requested (outside transaction)
        let enrichmentResult;
        if (enrichWithMarketData) {
          enrichmentResult = await this.enrichProperty(existingProperty);
        }

        return {
          success: true,
          property: existingProperty,
          propertyId: existingProperty.propertyId,
          action: 'updated',
          ownerChanged,
          previousOwner,
          enriched: enrichmentResult?.success,
          enrichmentError: enrichmentResult?.error,
          enrichmentData: enrichmentResult?.data,
        };
      }

      // Create new property within transaction
      const propertyId = deal.externalId || `prop_${uuidv4()}`;
      const propertyData = this.mapDealToProperty(deal, propertyId);
      const newProperty = await Property.create(propertyData as any, { transaction });

      if (onBeforeCommit) {
        await onBeforeCommit(newProperty, 'created', transaction);
      }

      await transaction.commit();

      console.log(`✅ New property created: ${propertyId} - ${deal.address.street}, ${deal.address.city}`);

      // Fire compliance trigger for property creation (non-blocking)
      complianceTriggerService.handlePropertyEvent('property.created', newProperty.id, {
        state: newProperty.state,
        propertyType: newProperty.propertyType,
        source: deal.sourceName || 'external',
      }).catch(err => console.warn('Compliance trigger failed:', err.message));

      // Enrich with market data if requested (outside transaction)
      let enrichmentResult;
      if (enrichWithMarketData) {
        enrichmentResult = await this.enrichProperty(newProperty);
      }

      return {
        success: true,
        property: newProperty,
        propertyId: newProperty.propertyId,
        action: 'created',
        enriched: enrichmentResult?.success,
        enrichmentError: enrichmentResult?.error,
        enrichmentData: enrichmentResult?.data,
      };
    } catch (error) {
      await transaction.rollback();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        action: 'skipped',
      };
    }
  }

  /**
   * Save multiple deals to the database
   * Options:
   * - allowUpdate: If true (default), updates existing properties. If false, marks as duplicate.
   * - skipDuplicates: If true, skip duplicate properties entirely. Default false.
   */
  async bulkSaveDeals(
    deals: NormalizedDeal[],
    options: {
      allowUpdate?: boolean;
      skipDuplicates?: boolean;
      enrichWithMarketData?: boolean;
      onBeforeCommit?: (
        deal: NormalizedDeal,
        property: Property,
        action: SavePropertyResult['action'],
        transaction: Transaction
      ) => Promise<void>;
    } = {}
  ): Promise<BulkSaveResult> {
    const { allowUpdate = true, skipDuplicates = false, enrichWithMarketData, onBeforeCommit } = options;

    const result: BulkSaveResult = {
      success: true,
      total: deals.length,
      created: 0,
      updated: 0,
      skipped: 0,
      duplicates: 0,
      ownerChanges: 0,
      errors: [],
      properties: [],
      duplicateProperties: [],
      ownerChangeRecords: [],
    };

    for (const deal of deals) {
      // If skipDuplicates is true, check for duplicate first
      if (skipDuplicates) {
        const { isDuplicate, existingProperty } = await this.checkDuplicate(deal);
        if (isDuplicate && existingProperty) {
          result.duplicates++;
          result.duplicateProperties.push({
            deal,
            existingPropertyId: existingProperty.propertyId,
          });
          console.log(`⏭️ Skipping duplicate: ${deal.address.street} (exists as ${existingProperty.propertyId})`);
          continue;
        }
      }

      const saveResult = await this.saveDealToDatabase(deal, {
        allowUpdate,
        enrichWithMarketData,
        onBeforeCommit: onBeforeCommit
          ? (property, action, transaction) => onBeforeCommit(deal, property, action, transaction)
          : undefined,
      });

      if (saveResult.success && saveResult.property) {
        result.properties.push(saveResult.property);

        switch (saveResult.action) {
          case 'created':
            result.created++;
            break;
          case 'updated':
            result.updated++;
            if (saveResult.ownerChanged && saveResult.previousOwner && saveResult.propertyId) {
              result.ownerChanges++;
              result.ownerChangeRecords.push({
                propertyId: saveResult.propertyId,
                previousOwner: saveResult.previousOwner,
                newOwner: deal.wholesalerName || deal.wholesalerCompany || 'Unknown',
              });
            }
            break;
          case 'duplicate':
            result.duplicates++;
            if (saveResult.duplicateOf) {
              result.duplicateProperties.push({
                deal,
                existingPropertyId: saveResult.duplicateOf,
              });
            }
            break;
        }
      } else {
        result.skipped++;
        result.errors.push({ deal, error: saveResult.error || 'Unknown error' });
      }
    }

    result.success = result.errors.length === 0;

    // Log summary
    console.log(`📊 Bulk save complete: ${result.created} created, ${result.updated} updated, ${result.duplicates} duplicates, ${result.skipped} skipped`);
    if (result.ownerChanges > 0) {
      console.log(`👤 Owner changes detected: ${result.ownerChanges}`);
    }

    return result;
  }

  /**
   * Map a NormalizedDeal to Property model attributes
   */
  private mapDealToProperty(deal: NormalizedDeal, propertyId: string): Partial<Property> {
    // Parse street address into components
    const addressParts = this.parseStreetAddress(deal.address.street);

    // Map occupancy status
    const occupancyMap: Record<string, string> = {
      vacant: 'Vacant',
      occupied: 'Occupied',
      tenant: 'Tenant Occupied',
      owner: 'Owner Occupied',
      unknown: 'Unknown',
    };

    return {
      propertyId,
      liveOnHubzu: false,
      propertyOwnership: 'Unknown',
      propertyType: deal.propertyType || 'Single Family',

      // Address
      address: {
        houseNumber: addressParts.houseNumber,
        street: addressParts.street,
      },
      city: deal.address.city || 'Unknown',
      state: deal.address.state || 'Unknown',
      zip: deal.address.zip || '00000',
      county: deal.address.county || 'Unknown',
      country: 'USA',

      // Property Details
      bedroomCount: deal.bedrooms || 0,
      bathroomCount: deal.bathrooms || 0,
      livingSpaceSqFt: deal.sqft ? Math.round(deal.sqft) : undefined,
      // Convert lot size from acres to sqft if it appears to be in acres (< 100)
      lotSizeSqFt: deal.lotSize
        ? deal.lotSize < 100
          ? Math.round(deal.lotSize * 43560)  // Convert acres to sqft
          : Math.round(deal.lotSize)
        : undefined,
      yearBuilt: deal.yearBuilt,

      // Financial
      mlsListingPrice: deal.askingPrice,
      buyItNowPrice: deal.askingPrice,
      arv: deal.arv,
      rehabCost: deal.repairEstimate,
      monthlyRent: deal.monthlyRent,

      // MLS & Marketing
      syndication: [],
      listedOnMLS: false,
      photoLinks: deal.photos || [],
      propertyListingDescription: deal.description,

      // Occupancy
      occupancyStatus: occupancyMap[deal.occupancyStatus || 'unknown'] || 'Unknown',

      // Wholesaler Info
      wholesalerLlcName: deal.wholesalerCompany,
      llcOwnerName: deal.wholesalerName,
      llcOwnerEmail: deal.wholesalerEmail,
      purchaseContractExpiration: deal.contractExpiration,
      purchaseContractPrice: deal.askingPrice,

      // HOA
      hoa: false,

      // Compliance
      assignable: true,
    } as any;
  }

  /**
   * Parse a street address into house number and street name
   */
  private parseStreetAddress(fullAddress: string): { houseNumber: string; street: string } {
    if (!fullAddress) {
      return { houseNumber: '', street: '' };
    }

    // Try to extract house number from the beginning
    const match = fullAddress.match(/^(\d+[\w-]*)\s+(.+)$/);
    if (match) {
      return {
        houseNumber: match[1],
        street: match[2],
      };
    }

    // If no house number found, return full address as street
    return {
      houseNumber: '',
      street: fullAddress,
    };
  }

  /**
   * Get all properties from database with pagination
   */
  async getProperties(options: { limit?: number; offset?: number; filters?: Record<string, any> } = {}): Promise<{
    properties: Property[];
    total: number;
  }> {
    const { limit = 50, offset = 0, filters = {} } = options;

    const where: Record<string, any> = {};

    // Apply filters
    if (filters.city) where.city = filters.city;
    if (filters.state) where.state = filters.state;
    if (filters.zip) where.zip = filters.zip;
    if (filters.propertyType) where.propertyType = filters.propertyType;

    const { rows: properties, count: total } = await Property.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    return { properties, total };
  }

  /**
   * Delete a property by propertyId
   */
  async deleteProperty(propertyId: string): Promise<boolean> {
    const deleted = await Property.destroy({ where: { propertyId } });
    return deleted > 0;
  }

  /**
   * Enrich a property with market data from Zillow/RapidAPI
   * Fetches Zestimate, skip trace, and comparables based on options
   * Updates the property record with enriched data
   */
  async enrichProperty(
    property: Property,
    options?: {
      enabled?: boolean;
      fetchZestimate?: boolean;
      fetchPriceHistory?: boolean;
      fetchTaxHistory?: boolean;
      fetchSkipTrace?: boolean;
      fetchPropertyImages?: boolean;
      fetchComparables?: boolean;
    }
  ): Promise<{
    success: boolean;
    data?: {
      zestimate?: number;
      rentZestimate?: number;
      ownerName?: string;
      comparablesCount?: number;
      enrichedFields?: string[];
    };
    error?: string;
  }> {
    let existingEnrichment: any = {};
    let startedAt = new Date();

    try {
      const p = property as any;
      const fullAddress = `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state} ${p.zip}`.trim();

      // Default all options to true if not specified
      const enrichOptions = {
        fetchZestimate: options?.fetchZestimate !== false,
        fetchPriceHistory: options?.fetchPriceHistory !== false,
        fetchTaxHistory: options?.fetchTaxHistory !== false,
        fetchSkipTrace: options?.fetchSkipTrace !== false,
        fetchPropertyImages: options?.fetchPropertyImages !== false,
        fetchComparables: options?.fetchComparables !== false,
      };
      existingEnrichment = (property.get('marketDataEnrichment') as any) || {};
      startedAt = existingEnrichment.startedAt || new Date();

      try {
        await property.update({
          marketDataEnrichment: {
            ...existingEnrichment,
            status: 'processing',
            startedAt,
            enabledOptions: enrichOptions,
          },
        } as any);
      } catch (updateError) {
        console.warn('⚠️ Failed to persist enrichment start state:', updateError);
      }

      // Log which enrichment options are enabled
      const enabledOptions = Object.entries(enrichOptions)
        .filter(([_, v]) => v)
        .map(([k]) => k);
      console.log(`🔍 Enriching property ${property.propertyId}: ${fullAddress}`);
      console.log(`   Enabled options: ${enabledOptions.join(', ')}`);

      const marketDataService = MarketDataService.getInstance();

      // Check if API key is configured
      if (!process.env.RAPIDAPI_KEY) {
        console.log('⚠️ RAPIDAPI_KEY not configured, skipping enrichment');
        try {
          await property.update({
            marketDataEnrichment: {
              ...existingEnrichment,
              status: 'failed',
              error: 'RAPIDAPI_KEY not configured',
              failedAt: new Date(),
              startedAt,
              enabledOptions: enrichOptions,
            },
            enrichedAt: new Date(),
            enrichmentSource: 'rapidapi-zillow',
          } as any);
        } catch (updateError) {
          console.warn('⚠️ Failed to persist enrichment error state:', updateError);
        }
        return { success: false, error: 'RAPIDAPI_KEY not configured' };
      }

      // Fetch full property lookup with conditional options
      const lookupResult = await marketDataService.getFullPropertyLookup(
        {
          address: fullAddress,
          city: p.city,
          state: p.state,
          zip: p.zip,
        },
        {
          includeImages: enrichOptions.fetchPropertyImages,
          includePriceHistory: enrichOptions.fetchPriceHistory,
          includeTaxHistory: enrichOptions.fetchTaxHistory,
          includeSkipTrace: enrichOptions.fetchSkipTrace,
          includeComparables: enrichOptions.fetchComparables,
        }
      );

      // Build enrichment data based on options
      const enrichmentData: any = {
        enrichedAt: new Date(),
        enrichmentSource: 'rapidapi-zillow',
      };
      const enrichedFields: string[] = [];

      // Add Zestimate data if enabled
      if (enrichOptions.fetchZestimate && lookupResult.property) {
        enrichmentData.zpid = lookupResult.property.zpid;
        enrichmentData.zestimate = lookupResult.property.zestimate;
        enrichmentData.zestimateRangeLow = lookupResult.property.zestimateRangeLow;
        enrichmentData.zestimateRangeHigh = lookupResult.property.zestimateRangeHigh;
        enrichmentData.rentZestimate = lookupResult.property.rentZestimate;
        if (lookupResult.property.zestimate) enrichedFields.push('zestimate');
        if (lookupResult.property.rentZestimate) enrichedFields.push('rentZestimate');
      }

      // Add price history data if enabled
      if (enrichOptions.fetchPriceHistory && lookupResult.property) {
        enrichmentData.lastSoldPrice = lookupResult.property.lastSoldPrice;
        enrichmentData.lastSoldDate = lookupResult.property.lastSoldDate ? new Date(lookupResult.property.lastSoldDate) : undefined;
        if (lookupResult.property.lastSoldPrice) enrichedFields.push('priceHistory');
      }

      // Add tax history data if enabled
      if (enrichOptions.fetchTaxHistory && lookupResult.property) {
        enrichmentData.taxAssessedValue = lookupResult.property.taxAssessedValue;
        if (lookupResult.property.taxAssessedValue) enrichedFields.push('taxHistory');
      }

      // Add skip trace data if enabled and available
      if (enrichOptions.fetchSkipTrace && lookupResult.skipTrace?.owners && lookupResult.skipTrace.owners.length > 0) {
        const firstOwner = lookupResult.skipTrace.owners[0];
        enrichmentData.ownerName = firstOwner?.name;
        enrichmentData.ownerPhones = firstOwner?.phones?.map(p => p.number) || [];
        enrichmentData.ownerEmails = firstOwner?.emails || [];

        if (lookupResult.skipTrace.mailingAddress) {
          const ma = lookupResult.skipTrace.mailingAddress;
          enrichmentData.ownerMailingAddress = `${ma.street}, ${ma.city}, ${ma.state} ${ma.zip}`;
        }
        if (firstOwner?.name) enrichedFields.push('skipTrace');
      }

      // Add property images if enabled and available
      if (enrichOptions.fetchPropertyImages && lookupResult.images?.photos?.length) {
        enrichmentData.photoLinks = lookupResult.images.photos.map((img: any) =>
          typeof img === 'string' ? img : img.jpegUrl || img.url || img.href
        ).filter(Boolean);
        if (enrichmentData.photoLinks.length > 0) enrichedFields.push('images');
      }

      // Add comparables summary if enabled
      if (enrichOptions.fetchComparables && lookupResult.comparables?.comparables?.length) {
        const comps = lookupResult.comparables.comparables;
        enrichmentData.comparablesCount = comps.length;
        if (comps.length > 0) {
          enrichmentData.comparablesAvgPrice = Math.round(
            comps.reduce((sum, c) => sum + (c.price || 0), 0) / comps.length
          );
          enrichedFields.push('comparables');
        }
      }

      // Store full enrichment data as JSONB
      enrichmentData.marketDataEnrichment = {
        status: 'success',
        property: enrichOptions.fetchZestimate ? lookupResult.property : undefined,
        skipTrace: enrichOptions.fetchSkipTrace ? lookupResult.skipTrace : undefined,
        priceHistory: enrichOptions.fetchPriceHistory ? lookupResult.priceHistory : undefined,
        comparables: enrichOptions.fetchComparables ? lookupResult.comparables : undefined,
        images: enrichOptions.fetchPropertyImages ? lookupResult.images : undefined,
        fetchedAt: new Date(),
        startedAt,
        enabledOptions: enrichOptions,
      };

      // Update property with enriched data
      await property.update(enrichmentData);

      console.log(`✅ Property enriched: Zestimate $${enrichmentData.zestimate?.toLocaleString() || 'N/A'}, Owner: ${enrichmentData.ownerName || 'N/A'}`);
      console.log(`   Enriched fields: ${enrichedFields.join(', ') || 'none'}`);

      return {
        success: true,
        data: {
          zestimate: enrichmentData.zestimate,
          rentZestimate: enrichmentData.rentZestimate,
          ownerName: enrichmentData.ownerName,
          comparablesCount: enrichmentData.comparablesCount,
          enrichedFields,
        },
      };
    } catch (error) {
      console.error(`❌ Enrichment failed for ${property.propertyId}:`, error);
      try {
        const fallbackOptions = {
          fetchZestimate: options?.fetchZestimate !== false,
          fetchPriceHistory: options?.fetchPriceHistory !== false,
          fetchTaxHistory: options?.fetchTaxHistory !== false,
          fetchSkipTrace: options?.fetchSkipTrace !== false,
          fetchPropertyImages: options?.fetchPropertyImages !== false,
          fetchComparables: options?.fetchComparables !== false,
        };
        await property.update({
          marketDataEnrichment: {
            ...existingEnrichment,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            failedAt: new Date(),
            startedAt,
            enabledOptions: fallbackOptions,
          },
          enrichedAt: new Date(),
          enrichmentSource: 'rapidapi-zillow',
        } as any);
      } catch (updateError) {
        console.warn('⚠️ Failed to persist enrichment error state:', updateError);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Enrich a property by propertyId
   */
  async enrichPropertyById(propertyId: string): Promise<{
    success: boolean;
    data?: {
      zestimate?: number;
      rentZestimate?: number;
      ownerName?: string;
      comparablesCount?: number;
    };
    error?: string;
  }> {
    const property = await Property.findOne({ where: { propertyId } });
    if (!property) {
      return { success: false, error: `Property ${propertyId} not found` };
    }
    return this.enrichProperty(property);
  }
}

export const propertyService = new PropertyService();
export default propertyService;
