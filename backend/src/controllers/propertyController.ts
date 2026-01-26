import { Request, Response } from 'express';
import { Op, col, fn, literal } from 'sequelize';
import Property from '../models/Property';
import DealAction from '../models/DealAction';
import DealOffer from '../models/DealOffer';
import TeamConversation from '../models/TeamConversation';
import MarketplaceUser from '../models/MarketplaceUser';
import sequelize from '../config/database';
import { PropertyAttributes } from '../types';
import { automationEngine, scoringEngine, dealProcessingService } from '../plugins';
import { NormalizedDeal } from '../plugins/types';
import {
  validateBulkCreate,
  validateBulkUpdate,
  validateBulkDelete,
  validateBulkScore,
} from '../validators/propertyValidator';
import { parsePagination, paginatedResponse, sequelizePagination } from '../utils/pagination';
import { complianceService } from '../services/ComplianceService';
import { dealApprovalService } from '../services/DealApprovalService';
import { dealProcessingQueue } from '../services/DealProcessingQueue';
import { DealProcessingState } from '../types/dealProcessing';
import propertyService from '../services/propertyService';
import { complianceTriggerService } from '../services/ComplianceTriggerService';
import { propertyCreationService } from '../services/PropertyCreationService';
import { activityFeedService } from '../services/ActivityFeedService';

// Auto-run compliance check on property (fire and forget, non-blocking)
// If compliance passes (Green), auto-queue for broker approval
async function autoRunComplianceCheck(property: Property): Promise<void> {
  try {
    const result = await complianceService.checkProperty(property);

    // Determine compliance status
    const hasBlockers = result.issues.some((i: any) => i.severity === 'critical');
    const hasWarnings = result.issues.some((i: any) => i.severity === 'warning');
    const complianceStatus = hasBlockers ? 'Red' : hasWarnings ? 'Yellow' : 'Green';

    await property.update({
      complianceNotes: JSON.stringify(result.issues),
      status: complianceStatus,
    } as any);

    console.log(`✓ Auto-compliance check: Property ${property.id} - ${result.issues.length} issues found (${complianceStatus})`);

    // If compliance passes (Green), queue for broker approval
    if (complianceStatus === 'Green' && property.approvalStatus === 'draft') {
      try {
        await dealApprovalService.queueForApproval(property.id);
      } catch (approvalError) {
        console.warn(`⚠ Could not queue property ${property.id} for broker approval:`, approvalError);
      }
    }
  } catch (error) {
    console.warn(`⚠ Auto-compliance check failed for property ${property.id}:`, error);
  }
}

// Get all properties
/**
 * @swagger
 * /api/listings:
 *   get:
 *     summary: Get all properties
 *     description: Retrieves a list of all properties in the database
 *     tags: [Properties]
 *     responses:
 *       200:
 *         description: Successfully retrieved properties
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Property'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const getAllProperties = async (req: Request, res: Response) => {
  try {
    // Parse pagination parameters (enforces max limit to prevent memory exhaustion)
    const pagination = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });

    // Extract filter and sort parameters
    const {
      state,
      minPrice,
      maxPrice,
      minBeds,
      maxBeds,
      minBaths,
      maxBaths,
      search,
      status,
      approvalStatus,
      sortBy,
      sortOrder,
    } = req.query;

    // Build where clause for filtering
    const where: any = {};

    // State filter (comma-separated list)
    if (state) {
      const states = (state as string).split(',').map(s => s.trim().toUpperCase());
      where.state = { [Op.in]: states };
    }

    // Price range filters
    if (minPrice || maxPrice) {
      where.askingPrice = {};
      if (minPrice) where.askingPrice[Op.gte] = Number(minPrice);
      if (maxPrice) where.askingPrice[Op.lte] = Number(maxPrice);
    }

    // Bedroom filters
    if (minBeds || maxBeds) {
      where.bedroomCount = {};
      if (minBeds) where.bedroomCount[Op.gte] = Number(minBeds);
      if (maxBeds) where.bedroomCount[Op.lte] = Number(maxBeds);
    }

    // Bathroom filters
    if (minBaths || maxBaths) {
      where.bathroomCount = {};
      if (minBaths) where.bathroomCount[Op.gte] = Number(minBaths);
      if (maxBaths) where.bathroomCount[Op.lte] = Number(maxBaths);
    }

    // Status filters
    if (status) where.status = status;
    if (approvalStatus) where.approvalStatus = approvalStatus;

    // Search filter (address, city, state, zip)
    if (search) {
      const searchTerm = `%${search}%`;
      where[Op.or] = [
        { city: { [Op.iLike]: searchTerm } },
        { state: { [Op.iLike]: searchTerm } },
        { zip: { [Op.iLike]: searchTerm } },
        sequelize.where(
          sequelize.cast(sequelize.col('address'), 'TEXT'),
          { [Op.iLike]: searchTerm }
        ),
      ];
    }

    // Dynamic sorting
    const allowedSortFields = ['city', 'state', 'askingPrice', 'bedroomCount', 'bathroomCount', 'createdAt', 'updatedAt', 'yearBuilt', 'livingSpaceSqFt'];
    const orderField = allowedSortFields.includes(sortBy as string) ? (sortBy as string) : 'createdAt';
    const orderDir = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    // Try database first, fall back to mock if not available
    try {
      const { rows: properties, count: total } = await Property.findAndCountAll({
        where,
        order: [[orderField, orderDir]],
        ...sequelizePagination(pagination),
      });

      // Get property IDs for batch fetching related data
      const propertyIds = properties.map(p => p.id);

      // Batch fetch offer counts
      let offerCountMap = new Map<string, number>();
      if (propertyIds.length > 0) {
        try {
          const offerCounts = await DealOffer.findAll({
            attributes: ['dealId', [fn('COUNT', col('id')), 'count']],
            where: { dealId: { [Op.in]: propertyIds.map(String) } },
            group: ['dealId'],
            raw: true,
          });
          offerCountMap = new Map(offerCounts.map((o: any) => [o.dealId, parseInt(o.count, 10)]));
        } catch (err) {
          // Offer counts are optional, continue without them
          console.warn('Failed to fetch offer counts:', err);
        }
      }

      // Batch fetch unread message counts from TeamConversation
      let unreadMap = new Map<number, number>();
      const userId = (req as any).user?.id;
      if (propertyIds.length > 0 && userId) {
        try {
          const conversations = await TeamConversation.findAll({
            where: { propertyId: { [Op.in]: propertyIds } },
            attributes: ['propertyId', 'unreadCounts'],
            raw: true,
          });
          conversations.forEach((c: any) => {
            const counts = c.unreadCounts || {};
            unreadMap.set(c.propertyId, counts[userId] || 0);
          });
        } catch (err) {
          // Unread counts are optional, continue without them
          console.warn('Failed to fetch unread counts:', err);
        }
      }

      // Augment properties with offer counts and unread message counts
      const augmentedProperties = properties.map(p => {
        const unreadCount = unreadMap.get(p.id) || 0;
        return {
          ...p.toJSON(),
          _offerCount: offerCountMap.get(String(p.id)) || 0,
          _unreadMessageCount: unreadCount,
          _hasUnreadMessages: unreadCount > 0,
        };
      });

      // Return paginated response
      res.json(paginatedResponse(augmentedProperties, total, pagination));
    } catch (dbError) {
      // Return mock data when database is not available
      const mockProperties = [
        {
          id: 536,
          propertyId: "PROP-001",
          propertyType: "Single Family",
          propertyOwnership: "Private",
          address: { houseNumber: "123", street: "Main St" },
          city: "Los Angeles",
          state: "CA",
          zip: "90210",
          county: "Los Angeles County",
          bedroomCount: 3,
          bathroomCount: 2,
          livingSpaceSqFt: 1500,
          yearBuilt: 1985,
          createdAt: "2025-12-16T16:41:16.932Z",
          updatedAt: "2025-12-16T16:41:16.932Z",
          _mock: true,
          _offerCount: 0,
          _hasUnreadMessages: false,
          _unreadMessageCount: 0,
        }
      ];
      res.json(paginatedResponse(mockProperties, 1, pagination));
    }
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get property by ID
/**
 * @swagger
 * /api/listings/{id}:
 *   get:
 *     summary: Get property by ID
 *     description: Retrieves a specific property by its ID
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Successfully retrieved property
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       404:
 *         description: Property not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const getPropertyById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Try database first, fall back to mock if not available
    try {
      const property = await Property.findByPk(id);

      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      res.json(property);
    } catch (dbError) {
      // Return mock data when database is not available
      const mockProperty = {
        id: parseInt(id),
        propertyId: "PROP-001",
        propertyType: "Single Family",
        propertyOwnership: "Private",
        address: { houseNumber: "123", street: "Main St" },
        city: "Los Angeles",
        state: "CA",
        zip: "90210",
        county: "Los Angeles County",
        bedroomCount: 3,
        bathroomCount: 2,
        livingSpaceSqFt: 1500,
        yearBuilt: 1985,
        createdAt: "2025-12-16T16:41:16.932Z",
        updatedAt: "2025-12-16T16:41:16.932Z",
        _mock: true
      };
      res.json(mockProperty);
    }
  } catch (error) {
    console.error('Error fetching property:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create new property
/**
 * @swagger
 * /api/listings:
 *   post:
 *     summary: Create a new property
 *     description: Creates a new property listing in the database
 *     tags: [Properties]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Property'
 *     responses:
 *       201:
 *         description: Property created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Helper function to check for duplicate properties
async function findDuplicateProperty(propertyData: PropertyAttributes): Promise<Property | null> {
  // Build address string for comparison
  const streetAddress = propertyData.address
    ? `${propertyData.address.houseNumber || ''} ${propertyData.address.street || ''}`.trim().toLowerCase()
    : '';

  // Check for exact match on address + city + state + zip
  if (streetAddress && propertyData.city && propertyData.state) {
    const whereClause: any = {
      city: { [Op.iLike]: propertyData.city },
      state: { [Op.iLike]: propertyData.state },
    };

    if (propertyData.zip) {
      whereClause.zip = propertyData.zip;
    }

    const potentialDuplicates = await Property.findAll({
      where: whereClause,
      limit: 50,
    });

    // Check address match (normalize for comparison)
    for (const existing of potentialDuplicates) {
      const existingStreet = existing.address
        ? `${existing.address.houseNumber || ''} ${existing.address.street || ''}`.trim().toLowerCase()
        : '';

      // Exact match
      if (existingStreet === streetAddress) {
        return existing;
      }

      // Fuzzy match - remove common variations
      const normalizeAddr = (addr: string) =>
        addr
          .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd)\b/gi, '')
          .replace(/[^a-z0-9]/gi, '')
          .toLowerCase();

      if (normalizeAddr(existingStreet) === normalizeAddr(streetAddress)) {
        return existing;
      }
    }
  }

  return null;
}

export const createProperty = async (req: Request, res: Response) => {
  try {
    // Extract enrichment and automation options before treating rest as PropertyAttributes
    const { enrichmentOptions, runComplianceCheck, scoreAgainstBuyBoxes, ...propertyData } = req.body as PropertyAttributes & {
      enrichmentOptions?: {
        enabled?: boolean;
        fetchZestimate?: boolean;
        fetchPriceHistory?: boolean;
        fetchTaxHistory?: boolean;
        fetchSkipTrace?: boolean;
        fetchPropertyImages?: boolean;
        fetchComparables?: boolean;
      };
      runComplianceCheck?: boolean;
      scoreAgainstBuyBoxes?: boolean;
    };
    const skipDuplicateCheck = req.query.skipDuplicateCheck === 'true';

    // Use centralized property creation service
    const result = await propertyCreationService.createProperty(propertyData, {
      sourceId: 'manual',
      sourceName: 'Manual Entry',
      createdBy: (req as any).user?.id,
      skipDuplicateCheck,
      enqueueForProcessing: true,
      emitAutomationEvents: true,
      fireComplianceTriggers: true,
      enrichmentOptions: enrichmentOptions || { enabled: true },
      runComplianceCheck: runComplianceCheck !== false,
      scoreAgainstBuyBoxes: scoreAgainstBuyBoxes !== false,
    });

    if (!result.success) {
      // Handle duplicate
      if (result.action === 'duplicate' && result.duplicateOf) {
        const duplicate = await Property.findByPk(result.duplicateOf);
        if (duplicate) {
          const streetAddress = duplicate.address
            ? `${duplicate.address.houseNumber || ''} ${duplicate.address.street || ''}`.trim()
            : '';

          return res.status(409).json({
            success: false,
            error: 'Duplicate property detected',
            message: `A property at this address already exists: ${streetAddress}, ${duplicate.city}, ${duplicate.state} ${duplicate.zip || ''}`,
            existingProperty: {
              id: duplicate.id,
              address: duplicate.address,
              city: duplicate.city,
              state: duplicate.state,
              zip: duplicate.zip,
              status: duplicate.status,
              createdAt: duplicate.createdAt,
            },
            hint: 'Use ?skipDuplicateCheck=true to force create, or update the existing property instead.',
          });
        }
      }

      // Handle other errors
      return res.status(500).json({
        success: false,
        error: result.error || 'Property creation failed',
      });
    }

    // Log activity (non-blocking)
    const property = result.property!;
    const dealName = property.address
      ? `${property.address.houseNumber || ''} ${property.address.street || ''}, ${property.city || ''}`
      : `Property ${property.propertyId}`;
    activityFeedService.logDealActivity(
      'deal_created',
      String(property.id),
      dealName.trim(),
      {
        id: (req as any).user?.id,
        name: (req as any).user?.name || 'Unknown User',
        type: 'user',
      },
      undefined,
      {
        propertyId: property.propertyId,
        city: property.city,
        state: property.state,
        price: property.mlsListingPrice || property.buyItNowPrice,
      }
    ).catch(err => console.warn('Activity logging failed:', err.message));

    // Success - return created property
    res.status(201).json({
      ...result.property!.toJSON(),
      _processingQueued: result.processingQueued,
      _processingState: DealProcessingState.CREATED,
    });
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update property
/**
 * @swagger
 * /api/listings/{id}:
 *   put:
 *     summary: Update a property
 *     description: Updates an existing property by ID
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Property'
 *     responses:
 *       200:
 *         description: Property updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       404:
 *         description: Property not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const updateProperty = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates: Partial<PropertyAttributes> = req.body;

    const property = await Property.findByPk(id);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const previousOwner = property.ownerName;
    await property.update(updates);

    // Auto-run compliance check if compliance-relevant fields changed (fire and forget)
    const complianceFields = ['state', 'assignable', 'marketingClauseFound', 'brokerOnFile',
      'agentLicenseNumber', 'brokerLicenseNumber', 'wholesalerLlcName', 'purchaseContractExpiration'];
    const hasComplianceUpdate = complianceFields.some(field => field in updates);
    if (hasComplianceUpdate) {
      autoRunComplianceCheck(property);
    }

    // Fire compliance trigger events based on what changed (non-blocking)
    if ('status' in updates) {
      complianceTriggerService.handlePropertyEvent('property.status_changed', property.id, {
        previousStatus: property.previous('status'),
        newStatus: updates.status,
      }).catch(err => console.warn('Compliance trigger failed:', err.message));
    }

    if ('ownerName' in updates && updates.ownerName !== previousOwner) {
      complianceTriggerService.handlePropertyEvent('property.seller_changed', property.id, {
        previousSeller: previousOwner,
        newSeller: updates.ownerName,
      }).catch(err => console.warn('Compliance trigger failed:', err.message));
    }

    if ('brokerOnFile' in updates || 'brokerId' in updates) {
      complianceTriggerService.handlePropertyEvent('property.broker_assigned', property.id, {
        brokerOnFile: property.brokerOnFile,
        brokerId: (property as any).brokerId,
      }).catch(err => console.warn('Compliance trigger failed:', err.message));
    }

    // Price change detection (for fraud detection)
    const priceFields = ['mlsListingPrice', 'reservePrice', 'purchaseContractPrice', 'arv', 'buyItNowPrice'];
    const priceChanges: Record<string, { previous: number; new: number }> = {};
    for (const field of priceFields) {
      if (field in updates) {
        const previousValue = (property as any).previous(field);
        const newValue = (updates as any)[field];
        if (previousValue !== undefined && previousValue !== newValue) {
          priceChanges[field] = { previous: previousValue as number, new: newValue };
        }
      }
    }
    if (Object.keys(priceChanges).length > 0) {
      complianceTriggerService.handlePropertyEvent('property.price_changed', property.id, {
        priceChanges,
        state: property.state,
      }).catch(err => console.warn('Price changed trigger failed:', err.message));
    }

    // Log activity (non-blocking)
    const dealName = property.address
      ? `${property.address.houseNumber || ''} ${property.address.street || ''}, ${property.city || ''}`
      : `Property ${property.propertyId}`;
    activityFeedService.logDealActivity(
      'deal_updated',
      String(property.id),
      dealName.trim(),
      {
        id: (req as any).user?.id,
        name: (req as any).user?.name || 'Unknown User',
        type: 'user',
      },
      undefined,
      {
        updatedFields: Object.keys(updates),
        priceChanges: Object.keys(priceChanges).length > 0 ? priceChanges : undefined,
      }
    ).catch(err => console.warn('Activity logging failed:', err.message));

    res.json(property);
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Enrich property on demand
export const enrichProperty = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const property = await Property.findByPk(id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const options = (req.body && typeof req.body === 'object' ? (req.body as any).options : undefined) as
      | {
          enabled?: boolean;
          fetchZestimate?: boolean;
          fetchPriceHistory?: boolean;
          fetchTaxHistory?: boolean;
          fetchSkipTrace?: boolean;
          fetchPropertyImages?: boolean;
          fetchComparables?: boolean;
        }
      | undefined;

    const result = await propertyService.enrichProperty(property, options);
    const refreshed = await Property.findByPk(id);

    res.json({
      ...(refreshed ? refreshed.toJSON() : property.toJSON()),
      _enrichment: result,
    });
  } catch (error) {
    console.error('Error enriching property:', error);
    res.status(500).json({ error: 'Failed to enrich property' });
  }
};

// Delete property
/**
 * @swagger
 * /api/listings/{id}:
 *   delete:
 *     summary: Delete a property
 *     description: Deletes a property by ID
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     responses:
 *       204:
 *         description: Property deleted successfully
 *       404:
 *         description: Property not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const deleteProperty = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const property = await Property.findByPk(id);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Capture property info before deletion for activity log
    const dealName = property.address
      ? `${property.address.houseNumber || ''} ${property.address.street || ''}, ${property.city || ''}`
      : `Property ${property.propertyId}`;
    const propertyInfo = {
      propertyId: property.propertyId,
      city: property.city,
      state: property.state,
    };

    // Cleanup orphaned compliance data before deletion
    await cleanupPropertyComplianceData(property.id);

    await property.destroy();

    // Log activity (non-blocking)
    activityFeedService.logDealActivity(
      'deal_deleted',
      String(id),
      dealName.trim(),
      {
        id: (req as any).user?.id,
        name: (req as any).user?.name || 'Unknown User',
        type: 'user',
      },
      undefined,
      propertyInfo
    ).catch(err => console.warn('Activity logging failed:', err.message));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Cleanup orphaned compliance data when a property is deleted
 */
async function cleanupPropertyComplianceData(propertyId: number): Promise<void> {
  try {
    // Import models to avoid circular dependencies
    const ComplianceCheck = (await import('../models/ComplianceCheck')).default;
    const ComplianceAlert = (await import('../models/ComplianceAlert')).default;
    const ComplianceEvent = (await import('../models/ComplianceEvent')).default;
    const FraudSignal = (await import('../models/FraudSignal')).default;
    const SanctionsScreening = (await import('../models/SanctionsScreening')).default;
    const PropertyContact = (await import('../models/PropertyContact')).default;

    // Delete in order (respecting potential foreign keys)
    const deleteCounts = await Promise.all([
      ComplianceCheck.destroy({ where: { propertyId } }),
      ComplianceAlert.destroy({ where: { resourceType: 'property', resourceId: String(propertyId) } }),
      ComplianceEvent.destroy({ where: { propertyId } }),
      FraudSignal.destroy({ where: { propertyId } }),
      SanctionsScreening.destroy({ where: { propertyId } }),
      PropertyContact.destroy({ where: { propertyId } }),
    ]);

    const totalDeleted = deleteCounts.reduce((sum, count) => sum + count, 0);
    if (totalDeleted > 0) {
      console.log(`🧹 Cleaned up ${totalDeleted} orphaned compliance records for property ${propertyId}`);
    }
  } catch (error) {
    // Don't fail the deletion if cleanup fails - log and continue
    console.warn(`⚠️ Compliance cleanup failed for property ${propertyId}:`, error);
  }
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Helper to create normalized deal from property
 */
function createNormalizedDeal(property: Property): Partial<NormalizedDeal> {
  const streetAddress = property.address
    ? `${property.address.houseNumber || ''} ${property.address.street || ''}`.trim()
    : '';

  return {
    externalId: property.id?.toString(),
    sourceId: 'bulk-import',
    sourceName: 'Bulk Import',
    address: {
      street: streetAddress,
      city: property.city || '',
      state: property.state || '',
      zip: property.zip || '',
      county: property.county,
    },
    propertyType: property.propertyType,
    bedrooms: property.bedroomCount,
    bathrooms: property.bathroomCount,
    sqft: property.livingSpaceSqFt,
    yearBuilt: property.yearBuilt,
    askingPrice: property.mlsListingPrice || property.reservePrice || 0,
    arv: property.arv,
    repairEstimate: property.rehabCost,
    normalizedAt: new Date(),
  };
}

/**
 * @swagger
 * /api/listings/bulk:
 *   post:
 *     summary: Bulk create properties
 *     description: Create multiple properties in a single request (max 100)
 *     tags: [Properties]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - properties
 *             properties:
 *               properties:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Property'
 *                 maxItems: 100
 *               options:
 *                 type: object
 *                 properties:
 *                   skipDuplicates:
 *                     type: boolean
 *                     default: false
 *                   emitEvents:
 *                     type: boolean
 *                     default: true
 *     responses:
 *       201:
 *         description: Bulk creation results
 *       400:
 *         description: Validation error
 */
export const bulkCreateProperties = async (req: Request, res: Response) => {
  try {
    // Validate request
    const { error, value } = validateBulkCreate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map((d) => d.message),
      });
    }

    const { properties, options } = value;

    // Use centralized bulk creation service
    const result = await propertyCreationService.bulkCreate(properties, {
      sourceId: 'bulk-import',
      sourceName: 'Bulk Import',
      createdBy: (req as any).user?.id,
      skipDuplicateCheck: !options.skipDuplicates, // Note: inverted logic
      enqueueForProcessing: false, // Bulk imports don't queue by default
      emitAutomationEvents: options.emitEvents ?? true,
      fireComplianceTriggers: true, // Always fire compliance triggers
      useTransaction: options.useTransaction ?? false,
    });

    // Map duplicates to skipped format for backwards compatibility
    const skipped = result.duplicates.map(d => ({
      index: d.index,
      reason: 'Duplicate address found',
      data: d.data,
    }));

    res.status(201).json({
      success: true,
      results: {
        created: result.created,
        skipped,
        errors: result.errors,
      },
      metadata: {
        totalRequested: result.totalRequested,
        totalCreated: result.totalCreated,
        totalSkipped: skipped.length,
        totalErrors: result.errors.length,
        processingTimeMs: result.processingTimeMs,
      },
    });
  } catch (error) {
    console.error('Error in bulk create:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/listings/bulk:
 *   put:
 *     summary: Bulk update properties
 *     description: Update multiple properties in a single request (max 100)
 *     tags: [Properties]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - data
 *                   properties:
 *                     id:
 *                       type: integer
 *                     data:
 *                       $ref: '#/components/schemas/Property'
 *                 maxItems: 100
 *     responses:
 *       200:
 *         description: Bulk update results
 *       400:
 *         description: Validation error
 */
export const bulkUpdateProperties = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Validate request
    const { error, value } = validateBulkUpdate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map((d) => d.message),
      });
    }

    const { updates, options } = value;
    const updated: Property[] = [];
    const notFound: Array<{ index: number; id: number }> = [];
    const errors: Array<{ index: number; id: number; error: string }> = [];

    // Use transaction if requested
    const transaction = options.useTransaction ? await sequelize.transaction() : null;

    try {
      for (let i = 0; i < updates.length; i++) {
        const { id, data } = updates[i];

        try {
          const property = await Property.findByPk(id, { transaction });

          if (!property) {
            notFound.push({ index: i, id });
            continue;
          }

          await property.update(data, { transaction });
          updated.push(property);
        } catch (err) {
          errors.push({
            index: i,
            id,
            error: err instanceof Error ? err.message : String(err),
          });
          // If using transaction, rollback on first error to ensure atomicity
          if (transaction) {
            await transaction.rollback();
            return res.status(500).json({
              success: false,
              error: 'Transaction rolled back due to error',
              results: {
                updated,
                notFound,
                errors,
              },
              metadata: {
                totalRequested: updates.length,
                totalUpdated: updated.length,
                totalNotFound: notFound.length,
                totalErrors: errors.length,
                processingTimeMs: Date.now() - startTime,
              },
            });
          }
        }
      }

      if (transaction) {
        await transaction.commit();
      }
    } catch (err) {
      if (transaction) {
        await transaction.rollback();
      }
      throw err;
    }

    const processingTimeMs = Date.now() - startTime;

    res.json({
      success: true,
      results: {
        updated,
        notFound,
        errors,
      },
      metadata: {
        totalRequested: updates.length,
        totalUpdated: updated.length,
        totalNotFound: notFound.length,
        totalErrors: errors.length,
        processingTimeMs,
      },
    });
  } catch (error) {
    console.error('Error in bulk update:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/listings/bulk:
 *   delete:
 *     summary: Bulk delete properties
 *     description: Delete multiple properties in a single request (max 100)
 *     tags: [Properties]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 maxItems: 100
 *     responses:
 *       200:
 *         description: Bulk delete results
 *       400:
 *         description: Validation error
 */
export const bulkDeleteProperties = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Validate request
    const { error, value } = validateBulkDelete(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map((d) => d.message),
      });
    }

    const { ids, options } = value;
    const deleted: number[] = [];
    const notFound: number[] = [];
    const errors: Array<{ id: number; error: string }> = [];

    // Use transaction if requested
    const transaction = options.useTransaction ? await sequelize.transaction() : null;

    try {
      for (const id of ids) {
        try {
          const property = await Property.findByPk(id, { transaction });

          if (!property) {
            notFound.push(id);
            continue;
          }

          // Cleanup orphaned compliance data before deletion
          await cleanupPropertyComplianceData(property.id);

          await property.destroy({ transaction });
          deleted.push(id);
        } catch (err) {
          errors.push({
            id,
            error: err instanceof Error ? err.message : String(err),
          });
          // If using transaction, rollback on first error to ensure atomicity
          if (transaction) {
            await transaction.rollback();
            return res.status(500).json({
              success: false,
              error: 'Transaction rolled back due to error',
              results: {
                deleted,
                notFound,
                errors,
              },
              metadata: {
                totalRequested: ids.length,
                totalDeleted: deleted.length,
                totalNotFound: notFound.length,
                totalErrors: errors.length,
                processingTimeMs: Date.now() - startTime,
              },
            });
          }
        }
      }

      if (transaction) {
        await transaction.commit();
      }
    } catch (err) {
      if (transaction) {
        await transaction.rollback();
      }
      throw err;
    }

    const processingTimeMs = Date.now() - startTime;

    res.json({
      success: true,
      results: {
        deleted,
        notFound,
        errors,
      },
      metadata: {
        totalRequested: ids.length,
        totalDeleted: deleted.length,
        totalNotFound: notFound.length,
        totalErrors: errors.length,
        processingTimeMs,
      },
    });
  } catch (error) {
    console.error('Error in bulk delete:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/listings/bulk/score:
 *   post:
 *     summary: Bulk score properties against buy boxes
 *     description: Score multiple properties against all buy boxes (max 100)
 *     tags: [Properties]
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
 *               buyBoxIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Bulk scoring results
 *       400:
 *         description: Validation error
 */
export const bulkScoreProperties = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Validate request
    const { error, value } = validateBulkScore(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map((d) => d.message),
      });
    }

    const { propertyIds, buyBoxIds } = value;
    const results: Record<number, any> = {};
    const notFound: number[] = [];
    const errors: Array<{ id: number; error: string }> = [];

    for (const id of propertyIds) {
      try {
        const property = await Property.findByPk(id);

        if (!property) {
          notFound.push(id);
          continue;
        }

        // Create normalized deal for scoring
        const normalizedDeal = createNormalizedDeal(property) as NormalizedDeal;

        // Score against buy boxes
        let scoringResults;
        if (buyBoxIds && buyBoxIds.length > 0) {
          // Score against specific buy boxes
          const allBuyBoxes = scoringEngine.getAllBuyBoxes();
          const targetBuyBoxes = allBuyBoxes.filter((bb) => buyBoxIds.includes(bb.id));
          scoringResults = [];
          for (const buyBox of targetBuyBoxes) {
            const result = await scoringEngine.scoreDealAgainstBuyBox(normalizedDeal, buyBox);
            scoringResults.push(result);
          }
        } else {
          // Score against all buy boxes
          scoringResults = await scoringEngine.scoreDealAgainstAllBuyBoxes(normalizedDeal);
        }

        results[id] = {
          property: {
            id: property.id,
            address: property.address,
            city: property.city,
            state: property.state,
          },
          scores: scoringResults,
          bestMatch: scoringResults.length > 0 ? scoringResults[0] : null,
        };
      } catch (err) {
        errors.push({
          id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const processingTimeMs = Date.now() - startTime;

    res.json({
      success: true,
      results,
      metadata: {
        totalRequested: propertyIds.length,
        totalScored: Object.keys(results).length,
        totalNotFound: notFound.length,
        totalErrors: errors.length,
        processingTimeMs,
      },
      notFound,
      errors,
    });
  } catch (error) {
    console.error('Error in bulk score:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

// ============================================================================
// VIEW TRACKING
// ============================================================================

/**
 * Record a property view
 * POST /api/listings/:id/view
 */
export const recordPropertyView = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Check if property exists
    const property = await Property.findByPk(id);
    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    // Check if user already viewed this property in the last hour (avoid duplicate spam)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existingView = await DealAction.findOne({
      where: {
        userId,
        dealId: String(id),
        actionType: 'view',
        createdAt: { [Op.gte]: oneHourAgo } as any,
      },
    });

    if (existingView) {
      return res.json({ success: true, alreadyViewed: true });
    }

    // Record the view
    // Note: dealId stores the property ID as string; propertyId is UUID type and not used for integer-based properties
    await DealAction.create({
      userId,
      dealId: String(id),
      // propertyId is UUID type in DB, but properties use integer IDs - use dealId for tracking
      actionType: 'view',
    });

    res.json({ success: true, recorded: true });
  } catch (error) {
    console.error('Error recording view:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get property viewers
 * GET /api/listings/:id/viewers
 */
export const getPropertyViewers = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const viewers = await DealAction.findAll({
      where: {
        dealId: String(id),
        actionType: 'view',
      },
      include: [{
        model: MarketplaceUser,
        as: 'user',
        attributes: ['id', 'name', 'email', 'avatar', 'role'],
      }],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    // Group viewers by userId and count views
    const viewerMap = new Map<string, any>();

    viewers.forEach((view: any) => {
      const userId = view.userId;
      const existing = viewerMap.get(userId);

      if (existing) {
        existing.viewCount++;
        // Keep the most recent view date
        if (new Date(view.createdAt) > new Date(existing.viewedAt)) {
          existing.viewedAt = view.createdAt;
        }
      } else {
        viewerMap.set(userId, {
          userId: view.userId,
          userName: view.user?.name || 'Unknown',
          userEmail: view.user?.email,
          userAvatar: view.user?.avatar,
          userRole: view.user?.role,
          viewedAt: view.createdAt,
          viewCount: 1,
        });
      }
    });

    // Convert map to array and sort by view count (descending)
    const uniqueViewers = Array.from(viewerMap.values()).sort((a, b) => b.viewCount - a.viewCount);

    res.json({
      success: true,
      data: uniqueViewers,
      totalViews: viewers.length,
      uniqueViewers: uniqueViewers.length,
    });
  } catch (error) {
    console.error('Error getting viewers:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
