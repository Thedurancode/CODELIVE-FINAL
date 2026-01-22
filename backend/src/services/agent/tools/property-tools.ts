/**
 * Property Tools
 *
 * Tools for searching, creating, and managing properties.
 */

import { z } from 'zod';
import { Op } from 'sequelize';
import { toolRegistry, success, failure, defineTool } from './registry';
import Property from '../../../models/Property';
import { propertyService } from '../../propertyService';
import { dealIntakeService } from '../../DealIntakeService';
import { dealProcessingService } from '../../../plugins';
import { dealNoteService } from '../../DealNoteService';
import Firecrawl from '@mendable/firecrawl-js';
import type { ToolContext } from '../types';
import {
  propertiesToListComponent,
  propertyToCardComponent,
  type PropertyCardData,
} from '../ui-components';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatPropertySummary(p: any) {
  return {
    propertyId: p.propertyId,
    address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state} ${p.zip}`.trim(),
    price: p.mlsListingPrice || p.buyItNowPrice,
    bedrooms: p.bedroomCount,
    bathrooms: p.bathroomCount,
    sqft: p.livingSpaceSqFt,
    propertyType: p.propertyType,
    arv: p.arv,
    createdAt: p.createdAt,
  };
}

function formatPropertyDetails(p: any) {
  return {
    propertyId: p.propertyId,
    address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state} ${p.zip}`.trim(),
    price: p.mlsListingPrice || p.buyItNowPrice,
    arv: p.arv,
    rehabCost: p.rehabCost,
    bedrooms: p.bedroomCount,
    bathrooms: p.bathroomCount,
    sqft: p.livingSpaceSqFt,
    lotSize: p.lotSizeSqFt,
    yearBuilt: p.yearBuilt,
    propertyType: p.propertyType,
    occupancy: p.occupancyStatus,
    owner: p.llcOwnerName,
    ownerEmail: p.llcOwnerEmail,
    ownerPhone: p.llcOwnerPhone,
    currentListings: p.currentListings,
    listingHistory: p.listingHistory,
    ownerHistory: p.ownerHistory,
    source: p.dealSource,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const searchProperties = defineTool({
  name: 'search_properties',
  description: 'Search for properties in the database with flexible filtering. Can filter by city, state, price range, bedrooms, property type.',
  category: 'property',
  cacheable: true,
  cacheTTL: 15 * 60, // 15 minutes
  schema: z.object({
    city: z.string().optional().describe('City name to filter by'),
    state: z.string().optional().describe('State code (e.g., TX, FL, CA)'),
    minPrice: z.number().optional().describe('Minimum price'),
    maxPrice: z.number().optional().describe('Maximum price'),
    minBedrooms: z.number().optional().describe('Minimum number of bedrooms'),
    maxBedrooms: z.number().optional().describe('Maximum number of bedrooms'),
    propertyType: z.string().optional().describe('Property type (Single Family, Condo, Townhouse, etc.)'),
    limit: z.number().optional().default(10).describe('Maximum number of results (default 10)'),
  }),
  handler: async (input, context) => {
    const where: any = {};
    if (input.city) where.city = { [Op.iLike]: `%${input.city}%` };
    if (input.state) where.state = { [Op.iLike]: input.state };
    if (input.minPrice) where.mlsListingPrice = { ...where.mlsListingPrice, [Op.gte]: input.minPrice };
    if (input.maxPrice) where.mlsListingPrice = { ...where.mlsListingPrice, [Op.lte]: input.maxPrice };
    if (input.minBedrooms) where.bedroomCount = { ...where.bedroomCount, [Op.gte]: input.minBedrooms };
    if (input.maxBedrooms) where.bedroomCount = { ...where.bedroomCount, [Op.lte]: input.maxBedrooms };
    if (input.propertyType) where.propertyType = { [Op.iLike]: `%${input.propertyType}%` };

    const properties = await Property.findAll({
      where,
      limit: input.limit || 10,
      order: [['createdAt', 'DESC']],
    });

    if (properties.length === 0) {
      return success([], 'No properties found matching the criteria.');
    }

    // Build filter description for title
    const filters = [];
    if (input.city) filters.push(input.city);
    if (input.state) filters.push(input.state);
    if (input.maxPrice) filters.push(`under $${(input.maxPrice / 1000).toFixed(0)}K`);
    const title = filters.length > 0 ? `Properties in ${filters.join(', ')}` : 'Search Results';

    // Generate UI component for rich rendering
    const uiComponent = propertiesToListComponent(properties, { title, showCount: true });

    return success(
      properties.map((p: any) => formatPropertySummary(p)),
      `Found ${properties.length} properties`,
      { uiComponents: [uiComponent] }
    );
  },
});

const getPropertyDetails = defineTool({
  name: 'get_property_details',
  description: 'Get complete details about a specific property by its ID, including owner info, listing history, and financials',
  category: 'property',
  cacheable: true,
  cacheTTL: 30 * 60, // 30 minutes
  schema: z.object({
    propertyId: z.string().describe('The property ID to look up'),
  }),
  handler: async (input, context) => {
    const property = await Property.findOne({ where: { propertyId: input.propertyId } });

    if (!property) {
      return failure(`Property ${input.propertyId} not found.`);
    }

    // Generate UI component for rich rendering
    const uiComponent = propertyToCardComponent(property);

    return success(
      formatPropertyDetails(property as any),
      undefined,
      { uiComponents: [uiComponent] }
    );
  },
});

const getPropertyCount = defineTool({
  name: 'get_property_count',
  description: 'Get the total count of properties, optionally filtered by state or city',
  category: 'property',
  cacheable: true,
  cacheTTL: 15 * 60,
  schema: z.object({
    state: z.string().optional().describe('Filter by state'),
    city: z.string().optional().describe('Filter by city'),
  }),
  handler: async (input, context) => {
    const where: any = {};
    if (input.state) where.state = { [Op.iLike]: input.state };
    if (input.city) where.city = { [Op.iLike]: `%${input.city}%` };

    const count = await Property.count({ where });
    const filters = [];
    if (input.state) filters.push(`state: ${input.state}`);
    if (input.city) filters.push(`city: ${input.city}`);

    return success({
      count,
      filters: filters.length ? filters.join(', ') : 'none',
    });
  },
});

const getRecentDeals = defineTool({
  name: 'get_recent_deals',
  description: 'Get the most recently added properties/deals in the system',
  category: 'property',
  cacheable: true,
  cacheTTL: 5 * 60, // 5 minutes - changes frequently
  schema: z.object({
    limit: z.number().optional().default(5).describe('Number of recent deals to return'),
    state: z.string().optional().describe('Filter by state'),
  }),
  handler: async (input, context) => {
    const where: any = {};
    if (input.state) where.state = { [Op.iLike]: input.state };

    const properties = await Property.findAll({
      where,
      limit: input.limit || 5,
      order: [['createdAt', 'DESC']],
    });

    return success({
      count: properties.length,
      deals: properties.map((p: any) => ({
        propertyId: p.propertyId,
        address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state}`.trim(),
        price: p.mlsListingPrice || p.buyItNowPrice,
        bedrooms: p.bedroomCount,
        sqft: p.livingSpaceSqFt,
        addedAt: p.createdAt,
        source: p.dealSource || 'Unknown',
      })),
      message: properties.length === 0 ? 'No recent properties found.' : undefined,
    });
  },
});

const findSimilarProperties = defineTool({
  name: 'find_similar_properties',
  description: 'Find properties similar to a given property based on price, bedrooms, and location',
  category: 'property',
  cacheable: true,
  schema: z.object({
    propertyId: z.string().describe('The property ID to find similar properties for'),
    priceRange: z.number().optional().default(50000).describe('Price tolerance (+/-)'),
    bedroomRange: z.number().optional().default(1).describe('Bedroom tolerance (+/-)'),
    sameState: z.boolean().optional().default(true).describe('Only search in same state'),
    limit: z.number().optional().default(5).describe('Max number of results'),
  }),
  handler: async (input, context) => {
    const sourceProperty = await Property.findOne({ where: { propertyId: input.propertyId } });

    if (!sourceProperty) {
      return failure(`Property ${input.propertyId} not found.`);
    }

    const p = sourceProperty as any;
    const price = p.mlsListingPrice || p.buyItNowPrice || 200000;
    const bedrooms = p.bedroomCount || 3;
    const priceTolerance = input.priceRange || 50000;
    const bedroomTolerance = input.bedroomRange || 1;

    const where: any = {
      propertyId: { [Op.ne]: input.propertyId },
      mlsListingPrice: {
        [Op.between]: [price - priceTolerance, price + priceTolerance],
      },
      bedroomCount: {
        [Op.between]: [bedrooms - bedroomTolerance, bedrooms + bedroomTolerance],
      },
    };

    if (input.sameState !== false) {
      where.state = { [Op.iLike]: p.state };
    }

    const similar = await Property.findAll({
      where,
      limit: input.limit || 5,
      order: [['createdAt', 'DESC']],
    });

    if (similar.length === 0) {
      return success({
        sourceProperty: { propertyId: input.propertyId, address: `${p.city}, ${p.state}`, price, bedrooms },
        similarProperties: [],
        message: 'No similar properties found.',
      });
    }

    return success({
      sourceProperty: { propertyId: input.propertyId, address: `${p.city}, ${p.state}`, price, bedrooms },
      similarProperties: similar.map((s: any) => ({
        propertyId: s.propertyId,
        address: `${s.address?.houseNumber || ''} ${s.address?.street || ''}, ${s.city}, ${s.state}`.trim(),
        price: s.mlsListingPrice || s.buyItNowPrice,
        bedrooms: s.bedroomCount,
        sqft: s.livingSpaceSqFt,
        priceDiff: (s.mlsListingPrice || s.buyItNowPrice || 0) - price,
      })),
    });
  },
});

const compareDeals = defineTool({
  name: 'compare_deals',
  description: 'Compare multiple properties side-by-side with calculated metrics (ROI, MAO, profit potential)',
  category: 'property',
  cacheable: false, // Calculations should be fresh
  schema: z.object({
    propertyIds: z.array(z.string()).describe('Array of property IDs to compare'),
  }),
  handler: async (input, context) => {
    const properties = await Property.findAll({
      where: { propertyId: { [Op.in]: input.propertyIds } },
    });

    if (properties.length === 0) {
      return failure('No properties found with the provided IDs.');
    }

    const comparisons = properties.map((p: any) => {
      const price = p.mlsListingPrice || p.buyItNowPrice || 0;
      const arv = p.arv || price * 1.3;
      const rehab = p.rehabCost || price * 0.1;
      const mao = arv * 0.7 - rehab;
      const profit = arv - price - rehab;
      const roi = price > 0 ? ((profit / price) * 100).toFixed(1) : '0';
      const sqft = p.livingSpaceSqFt || 0;
      const pricePerSqft = sqft > 0 ? Math.round(price / sqft) : 0;

      return {
        propertyId: p.propertyId,
        address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city}, ${p.state}`.trim(),
        price,
        arv,
        rehabCost: rehab,
        maxAllowableOffer: Math.round(mao),
        potentialProfit: Math.round(profit),
        roi: `${roi}%`,
        pricePerSqft: `$${pricePerSqft}`,
        bedrooms: p.bedroomCount,
        bathrooms: p.bathroomCount,
        sqft,
        yearBuilt: p.yearBuilt,
        recommendation: profit > 0 ? (price <= mao ? 'STRONG BUY' : 'NEGOTIATE') : 'PASS',
      };
    });

    // Sort by ROI descending
    comparisons.sort((a, b) => parseFloat(b.roi) - parseFloat(a.roi));

    return success({
      comparison: comparisons,
      bestDeal: comparisons[0]?.propertyId,
      summary: `Compared ${comparisons.length} properties. Best ROI: ${comparisons[0]?.roi || 'N/A'}`,
    });
  },
});

const createProperty = defineTool({
  name: 'create_property',
  description: 'Create a new property in the database, automatically enrich with Zillow market data (Zestimate, owner info), and score against all buy boxes. IMPORTANT: You MUST provide the city and state - these are required fields. If the user provides a full address like "123 Main St, Austin, TX 78701", extract the city (Austin) and state (TX) from it.',
  category: 'property',
  cacheable: false,
  schema: z.object({
    street: z.string().min(1).describe('Street address (e.g., "123 Main St")'),
    city: z.string().min(1).describe('City name - REQUIRED (e.g., "Austin", "Dallas", "Houston")'),
    state: z.string().min(2).max(2).describe('Two-letter state code - REQUIRED (e.g., "TX", "FL", "CA")'),
    zip: z.string().min(5).describe('ZIP code (e.g., "78701")'),
    price: z.number().describe('Listing price'),
    bedrooms: z.number().optional().describe('Number of bedrooms'),
    bathrooms: z.number().optional().describe('Number of bathrooms'),
    sqft: z.number().optional().describe('Square footage'),
    propertyType: z.string().optional().default('Single Family').describe('Property type'),
    arv: z.number().optional().describe('After Repair Value'),
    rehabCost: z.number().optional().describe('Estimated repair cost'),
    runPipeline: z.boolean().optional().default(true).describe('Run through scoring pipeline automatically'),
    enrichWithMarketData: z.boolean().optional().default(true).describe('Auto-enrich with Zillow data'),
  }),
  handler: async (input, context) => {
    // Validate required fields
    if (!input.city || input.city.trim() === '') {
      return failure('City is required. Please provide the city name (e.g., "Austin", "Dallas").');
    }
    if (!input.state || input.state.trim() === '' || input.state.trim().length !== 2) {
      return failure('State is required. Please provide the two-letter state code (e.g., "TX", "FL", "CA").');
    }
    if (!input.street || input.street.trim() === '') {
      return failure('Street address is required.');
    }

    // Normalize state to uppercase
    const normalizedState = input.state.trim().toUpperCase();
    const normalizedCity = input.city.trim();

    const deal: any = {
      sourceId: 'agent',
      sourceName: 'AI Agent',
      address: {
        street: input.street.trim(),
        city: normalizedCity,
        state: normalizedState,
        zip: input.zip.trim()
      },
      askingPrice: input.price,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      sqft: input.sqft,
      propertyType: input.propertyType || 'Single Family',
      arv: input.arv,
      repairEstimate: input.rehabCost,
      normalizedAt: new Date(),
      confidence: 1.0,
      rawData: {},
    };

    const result = await dealIntakeService.ingestDeal(deal, {
      enrichWithMarketData: input.enrichWithMarketData !== false,
      queueProcessing: input.runPipeline !== false,
    });

    if (!result.success) {
      return failure(`Failed to create property: ${result.error}`);
    }

    const response: any = {
      propertyId: result.propertyId,
      action: result.action,
    };

    // Add status message based on action
    if (result.action === 'duplicate') {
      response.status = 'DUPLICATE_FOUND';
      response.message = `This property already exists as ${result.propertyId}.`;
    } else if (result.action === 'updated') {
      response.status = 'EXISTING_UPDATED';
      response.message = `Property ${result.propertyId} has been updated.`;
    } else {
      response.status = 'NEW_CREATED';
      response.message = `New property ${result.propertyId} created successfully.`;
    }

    // Include enrichment data or error
    if (result.enriched && result.enrichmentData) {
      response.enrichment = {
        enriched: true,
        zestimate: result.enrichmentData.zestimate,
        rentZestimate: result.enrichmentData.rentZestimate,
        ownerName: result.enrichmentData.ownerName,
      };
    } else if (result.enrichmentError) {
      response.enrichment = {
        enriched: false,
        error: result.enrichmentError,
      };
    } else {
      response.enrichment = {
        enriched: false,
        error: 'Enrichment did not run or returned no data',
      };
    }

    // Run scoring if requested
    if (input.runPipeline !== false) {
      const scoringResults = await dealProcessingService.scoreDeal(deal);
      const matches = scoringResults
        .filter((r: any) => r.percentage >= 50)
        .map((r: any) => `${r.buyBoxName}: ${r.percentage}%`)
        .join(', ');

      response.pipeline = {
        scored: true,
        matchingBuyBoxes: matches || 'None',
      };
    }

    return success(response);
  },
});

const importFromUrl = defineTool({
  name: 'import_from_url',
  description: 'Import a property from any listing URL (Zillow, Redfin, Realtor, etc). Automatically extracts and saves property data.',
  category: 'property',
  cacheable: false,
  schema: z.object({
    url: z.string().describe('The listing URL to import from'),
  }),
  handler: async (input, context) => {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      return failure('Firecrawl API key not configured. Cannot scrape listing URL.');
    }

    const firecrawl = new Firecrawl({ apiKey: firecrawlKey });
    const result = await firecrawl.scrapeUrl(input.url, { formats: ['markdown'] });

    if (!result.success) {
      return failure(`Failed to scrape URL: ${(result as any).error || 'Unknown error'}`);
    }

    const content = result.markdown || '';

    // Extract property data using patterns
    const extractNumber = (patterns: RegExp[]): number | undefined => {
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          const num = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(num)) return num;
        }
      }
      return undefined;
    };

    const price = extractNumber([
      /\$([0-9,]+(?:\.[0-9]+)?)\s*(?:asking|list|sale)/i,
      /(?:price|asking|list).*?\$([0-9,]+)/i,
      /\$([0-9,]+)/,
    ]);

    const bedrooms = extractNumber([/(\d+)\s*(?:bed|bedroom|br|bd)/i]);
    const bathrooms = extractNumber([/(\d+(?:\.\d+)?)\s*(?:bath|bathroom|ba)/i]);
    const sqft = extractNumber([/([0-9,]+)\s*(?:sq\.?\s*ft|sqft|square feet)/i]);

    const addressMatch = content.match(
      /(\d+\s+[^,\n]+),?\s*([A-Za-z\s]+),?\s*([A-Z]{2})\s*(\d{5})/i
    );

    const extractedData = {
      url: input.url,
      street: addressMatch?.[1] || 'Unknown',
      city: addressMatch?.[2] || 'Unknown',
      state: addressMatch?.[3] || 'XX',
      zip: addressMatch?.[4] || '00000',
      price: price || 0,
      bedrooms: bedrooms || 0,
      bathrooms: bathrooms || 0,
      sqft: sqft || 0,
      source: new URL(input.url).hostname,
    };

    if (extractedData.price > 0 && extractedData.street !== 'Unknown') {
      const saveResult = await dealIntakeService.ingestDeal({
        sourceId: 'url-import',
        sourceName: `URL Import (${extractedData.source})`,
        address: {
          street: extractedData.street,
          city: extractedData.city,
          state: extractedData.state,
          zip: extractedData.zip,
        },
        askingPrice: extractedData.price,
        bedrooms: extractedData.bedrooms,
        bathrooms: extractedData.bathrooms,
        sqft: extractedData.sqft,
        propertyType: 'Single Family',
        normalizedAt: new Date(),
        confidence: 0.8,
        rawData: { sourceUrl: input.url },
      }, { queueProcessing: true });

      return success({
        extracted: extractedData,
        saved: saveResult.success,
        propertyId: saveResult.propertyId,
        action: saveResult.action,
      });
    }

    return success({
      extracted: extractedData,
      saved: false,
      reason: 'Incomplete data - review and use create_property to save',
    });
  },
});

// =============================================================================
// NOTE TOOLS
// =============================================================================

const addPropertyNote = defineTool({
  name: 'add_property_note',
  description: 'Add a note to a property/deal. Notes are saved with the current user as author and can include an optional subject line.',
  category: 'property',
  cacheable: false,
  schema: z.object({
    propertyId: z.string().describe('The property ID to add the note to'),
    content: z.string().min(1).describe('The note content/text'),
    subject: z.string().optional().describe('Optional subject line for the note'),
  }),
  handler: async (input, context) => {
    // First verify the property exists
    const property = await Property.findOne({ where: { propertyId: input.propertyId } });
    if (!property) {
      return failure(`Property ${input.propertyId} not found.`);
    }

    // Get user context
    const userId = context?.userId || 'system';
    const organizationId = context?.organizationId || 'default';

    try {
      const note = await dealNoteService.createNote({
        propertyId: (property as any).id,
        userId,
        organizationId,
        content: input.content,
        subject: input.subject,
      });

      return success({
        noteId: note.id,
        propertyId: input.propertyId,
        subject: note.subject,
        content: note.content,
        author: note.author.name,
        createdAt: note.createdAt,
        message: `Note added to property ${input.propertyId} successfully.`,
      });
    } catch (error) {
      return failure(`Failed to add note: ${(error as Error).message}`);
    }
  },
});

const getPropertyNotes = defineTool({
  name: 'get_property_notes',
  description: 'Get all notes for a property/deal, ordered by most recent first.',
  category: 'property',
  cacheable: true,
  cacheTTL: 5 * 60, // 5 minutes
  schema: z.object({
    propertyId: z.string().describe('The property ID to get notes for'),
  }),
  handler: async (input, context) => {
    // First verify the property exists and get internal ID
    const property = await Property.findOne({ where: { propertyId: input.propertyId } });
    if (!property) {
      return failure(`Property ${input.propertyId} not found.`);
    }

    const organizationId = context?.organizationId || 'default';

    try {
      const notes = await dealNoteService.getNotesForProperty(
        (property as any).id,
        organizationId
      );

      if (notes.length === 0) {
        return success({
          propertyId: input.propertyId,
          notes: [],
          count: 0,
          message: 'No notes found for this property.',
        });
      }

      return success({
        propertyId: input.propertyId,
        notes: notes.map(note => ({
          id: note.id,
          subject: note.subject,
          content: note.content,
          author: note.author.name,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        })),
        count: notes.length,
      });
    } catch (error) {
      return failure(`Failed to get notes: ${(error as Error).message}`);
    }
  },
});

const deletePropertyNote = defineTool({
  name: 'delete_property_note',
  description: 'Delete a note from a property. Only the author of the note can delete it.',
  category: 'property',
  cacheable: false,
  schema: z.object({
    noteId: z.number().describe('The note ID to delete'),
  }),
  handler: async (input, context) => {
    const userId = context?.userId || 'system';
    const organizationId = context?.organizationId || 'default';

    try {
      const deleted = await dealNoteService.deleteNote(
        input.noteId,
        userId,
        organizationId
      );

      if (!deleted) {
        return failure(`Note ${input.noteId} not found.`);
      }

      return success({
        noteId: input.noteId,
        deleted: true,
        message: `Note ${input.noteId} deleted successfully.`,
      });
    } catch (error) {
      return failure(`Failed to delete note: ${(error as Error).message}`);
    }
  },
});

// =============================================================================
// REGISTRATION
// =============================================================================

export function registerPropertyTools(): void {
  toolRegistry.registerAll([
    searchProperties,
    getPropertyDetails,
    getPropertyCount,
    getRecentDeals,
    findSimilarProperties,
    compareDeals,
    createProperty,
    importFromUrl,
    addPropertyNote,
    getPropertyNotes,
    deletePropertyNote,
  ]);
}
