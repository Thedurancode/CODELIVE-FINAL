/**
 * Market Data Tools
 *
 * Tools for market data lookup, skip tracing, and rental trends.
 */

import { z } from 'zod';
import { Op } from 'sequelize';
import { toolRegistry, success, failure, defineTool } from './registry';
import { MarketDataService } from '../../MarketDataService';
import { propertyCreationService } from '../../PropertyCreationService';
import { Property, Contact, PropertyContact, MarketplaceUser } from '../../../models';
import { createMarketData, createChart, MarketDataCardData } from '../ui-components';

/**
 * Get organization ID for a user
 */
async function getOrganizationIdForUser(userId: string): Promise<string | null> {
  const user = await MarketplaceUser.findByPk(userId, { attributes: ['organizationId'] });
  return user?.organizationId || null;
}

/**
 * Register all market data tools with the registry
 */
export function registerMarketDataTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // LOOKUP MARKET DATA
    // =========================================================================
    defineTool({
      name: 'lookup_market_data',
      description:
        'Look up comprehensive market data for a property including Zestimate valuation, property details, comparable homes, price history, and optionally owner/skip trace info. Uses cached data when available to save API calls.',
      category: 'market_data',
      schema: z.object({
        address: z
          .string()
          .describe('Full property address (e.g., "123 Main St, Austin, TX 78701")'),
        city: z.string().optional().describe('City name'),
        state: z.string().optional().describe('State code (e.g., TX)'),
        zip: z.string().optional().describe('ZIP code'),
        includeComparables: z.boolean().optional().default(true).describe('Include comparable homes'),
        includeSkipTrace: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include owner/contact info (skip trace)'),
      }),
      handler: async (input, context) => {
        try {
          const service = MarketDataService.getInstance();
          const result = await service.getMarketData({
            address: input.address,
            city: input.city,
            state: input.state,
            zip: input.zip,
          }) as any;

          if (!result) {
            return failure(`No market data found for address: ${input.address}`);
          }

          // Build response summary
          const summary: any = {
            property: {
              address: result.address,
              city: result.city,
              state: result.state,
              zip: result.zip,
            },
            valuation: {
              zestimate: result.zestimate,
              rentZestimate: result.rentZestimate,
              lastSalePrice: result.lastSalePrice,
              lastSaleDate: result.lastSaleDate,
            },
            details: {
              bedrooms: result.bedrooms,
              bathrooms: result.bathrooms,
              sqft: result.sqft,
              yearBuilt: result.yearBuilt,
              propertyType: result.propertyType,
              lotSize: result.lotSize,
            },
            dataSource: result.dataSource || 'zillow',
            cached: result.cached || false,
          };

          // Include comparables if requested
          if (input.includeComparables && result.comparables) {
            summary.comparables = result.comparables.slice(0, 5).map((comp: any) => ({
              address: comp.address,
              price: comp.price,
              bedrooms: comp.bedrooms,
              bathrooms: comp.bathrooms,
              sqft: comp.sqft,
              distance: comp.distance,
            }));
          }

          // Include skip trace if requested
          if (input.includeSkipTrace && result.owner) {
            summary.owner = {
              name: result.owner.name,
              occupancy: result.ownerOccupied ? 'Owner Occupied' : 'Non-Owner Occupied',
              equity: result.equity,
            };
          }

          // Create UI components for visualization
          const uiComponents: string[] = [];

          // Market data card
          const marketDataCard: MarketDataCardData = {
            location: `${result.address}, ${result.city}, ${result.state}`,
            medianPrice: result.zestimate || 0,
            priceChange: result.priceChange,
            daysOnMarket: result.daysOnMarket,
            inventory: result.activeListings,
          };

          // Add comparables if available
          if (input.includeComparables && result.comparables) {
            marketDataCard.comparables = result.comparables.slice(0, 3).map((comp: any) => ({
              address: comp.address,
              price: comp.price,
              soldDate: comp.soldDate,
            }));
          }

          uiComponents.push(createMarketData(marketDataCard));

          return success(summary, `Market data for ${result.address}`, { uiComponents });
        } catch (error) {
          return failure(`Error looking up market data: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 6 * 60 * 60, // 6 hours
    }),

    // =========================================================================
    // SKIP TRACE PROPERTY
    // =========================================================================
    defineTool({
      name: 'skip_trace_property',
      description:
        'Get owner/contact information for a property (skip trace). Returns owner name, phone numbers, emails, mailing address, and equity info.',
      category: 'market_data',
      schema: z.object({
        address: z.string().describe('Property address'),
        city: z.string().optional().describe('City'),
        state: z.string().optional().describe('State'),
        zip: z.string().optional().describe('ZIP code'),
      }),
      handler: async (input, context) => {
        try {
          const service = MarketDataService.getInstance();
          const result = await service.getSkipTrace({
            address: input.address,
            city: input.city,
            state: input.state,
            zip: input.zip,
          });

          if (!result) {
            return success({
              found: false,
              message: 'No skip trace data found for this property.',
            });
          }

          const firstOwner = result.owners?.[0];

          return success({
            found: true,
            owner: {
              name: firstOwner?.name,
              occupancy: result.ownerOccupied ? 'Owner Occupied' : 'Non-Owner Occupied',
              ownershipType: result.ownershipType,
            },
            contact: {
              phones:
                firstOwner?.phones?.map((p: any) => ({ number: p.number, type: p.type })) || [],
              emails: firstOwner?.emails || [],
              mailingAddress: result.mailingAddress,
            },
            confidence: result.confidence,
            dataSource: result.dataSource,
          });
        } catch (error) {
          return failure(`Error getting skip trace: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 24 * 60 * 60, // 24 hours
    }),

    // =========================================================================
    // SKIP TRACE AND ADD TO DATABASE
    // =========================================================================
    defineTool({
      name: 'skip_trace_and_add',
      description: `Skip trace an address and automatically add the property and all owner contacts to your database.

This is the best tool to use when a user says:
- "Skip trace 123 Main St and add it"
- "Look up the owner of 456 Oak Ave and save their info"
- "Find who owns this property and add them as contacts"

What it does:
1. Performs skip trace to find owner information
2. Creates the property in your database (if not already there)
3. Creates contacts for all owners found (name, phones, emails)
4. Links the contacts to the property as "seller" role

Returns all created records so you can follow up with calls or emails.`,
      category: 'market_data',
      schema: z.object({
        address: z.string().describe('Street address (e.g., "123 Main St")'),
        city: z.string().optional().describe('City name'),
        state: z.string().optional().describe('State code (e.g., TX, NY)'),
        zip: z.string().optional().describe('ZIP code'),
        addPropertyIfNotExists: z.boolean().optional().default(true)
          .describe('Create property in database if not found'),
        addContacts: z.boolean().optional().default(true)
          .describe('Create contacts from skip trace results'),
        contactRole: z.enum(['seller', 'buyer', 'wholesaler', 'other']).optional().default('seller')
          .describe('Role to assign to created contacts'),
        additionalTags: z.array(z.string()).optional().default([])
          .describe('Additional tags to add (skip-traced is always included automatically)'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required to add properties and contacts.');
          }

          const organizationId = await getOrganizationIdForUser(context.userId);
          if (!organizationId) {
            return failure('Unable to determine organization for user.');
          }

          const service = MarketDataService.getInstance();

          // Step 1: Perform skip trace
          const skipTraceResult = await service.getSkipTrace({
            address: input.address,
            city: input.city,
            state: input.state,
            zip: input.zip,
          });

          if (!skipTraceResult) {
            return success({
              found: false,
              message: `No skip trace data found for address: ${input.address}`,
              property: null,
              contacts: [],
            });
          }

          // Also get market data for property details
          const marketData = await service.getMarketData({
            address: input.address,
            city: input.city,
            state: input.state,
            zip: input.zip,
          });

          // Step 2: Check if property exists
          let property: Property | null = null;
          let propertyCreated = false;

          // Parse address into components
          const addressParts = input.address.match(/^(\d+)\s+(.+)$/);
          const houseNumber = addressParts?.[1] || '';
          const street = addressParts?.[2] || input.address;
          const city = input.city || marketData?.city || '';
          const state = input.state || marketData?.state || '';
          const zip = input.zip || marketData?.zip || '';

          // Search for existing property
          const existingProperty = await Property.findOne({
            where: {
              [Op.or]: [
                {
                  [Op.and]: [
                    { 'address.houseNumber': houseNumber },
                    { 'address.street': { [Op.iLike]: `%${street}%` } },
                  ],
                },
                { city: { [Op.iLike]: `%${city}%` } },
              ],
            },
          });

          if (existingProperty) {
            property = existingProperty;
          } else if (input.addPropertyIfNotExists) {
            // Create new property
            const createResult = await propertyCreationService.createProperty(
              {
                address: {
                  houseNumber,
                  street,
                },
                city,
                state,
                zip,
                county: marketData?.county,
                propertyType: marketData?.propertyType || 'Single Family',
                bedroomCount: marketData?.bedrooms || 0,
                bathroomCount: marketData?.bathrooms || 0,
                livingSpaceSqFt: marketData?.sqft,
                lotSizeSqFt: marketData?.lotSize,
                yearBuilt: marketData?.yearBuilt,
                arv: marketData?.zestimate,
                occupancyStatus: skipTraceResult.ownerOccupied ? 'owner_occupied' : 'unknown',
                processingState: 'created',
              },
              {
                sourceName: 'skip_trace_agent',
                sourceId: 'agent-chat',
                createdBy: context.userId,
                enqueueForProcessing: true,
                emitAutomationEvents: true,
                enrichmentOptions: { enabled: true },
              }
            );

            if (createResult.success && createResult.property) {
              property = createResult.property;
              propertyCreated = true;
            }
          }

          // Step 3: Create contacts from skip trace owners
          const createdContacts: any[] = [];
          const linkedContacts: any[] = [];

          if (input.addContacts && skipTraceResult.owners && skipTraceResult.owners.length > 0) {
            for (const owner of skipTraceResult.owners) {
              // Check if contact already exists (by phone or email)
              let existingContact: Contact | null = null;

              if (owner.phones && owner.phones.length > 0) {
                const primaryPhone = owner.phones.find(p => p.isPrimary) || owner.phones[0];
                existingContact = await Contact.findOne({
                  where: {
                    organizationId: organizationId,
                    phone: primaryPhone.number,
                  },
                });
              }

              if (!existingContact && owner.emails && owner.emails.length > 0) {
                existingContact = await Contact.findOne({
                  where: {
                    organizationId: organizationId,
                    email: owner.emails[0],
                  },
                });
              }

              let contact: Contact;

              if (existingContact) {
                contact = existingContact;
                // Update with new info if available
                const updates: Partial<Contact> = {};
                if (!existingContact.email && owner.emails?.[0]) {
                  updates.email = owner.emails[0];
                }
                if (!existingContact.phone && owner.phones?.[0]) {
                  updates.phone = owner.phones[0].number;
                }
                if (Object.keys(updates).length > 0) {
                  await existingContact.update(updates);
                }
              } else {
                // Create new contact
                const primaryPhone = owner.phones?.find(p => p.isPrimary) || owner.phones?.[0];

                contact = await Contact.create({
                  organizationId: organizationId,
                  createdById: context.userId,
                  type: input.contactRole as any,
                  name: owner.name,
                  email: owner.emails?.[0] || null,
                  phone: primaryPhone?.number || null,
                  address: skipTraceResult.mailingAddress?.street || null,
                  city: skipTraceResult.mailingAddress?.city || null,
                  state: skipTraceResult.mailingAddress?.state || null,
                  zip: skipTraceResult.mailingAddress?.zip || null,
                  tags: ['skip-traced', ...(input.additionalTags || [])],
                  status: 'active',
                  metadata: {
                    skipTraceSource: skipTraceResult.dataSource,
                    skipTraceDate: new Date().toISOString(),
                    allPhones: owner.phones?.map(p => ({ number: p.number, type: p.type })),
                    allEmails: owner.emails,
                    age: owner.age,
                    ageRange: owner.ageRange,
                    associatedAddresses: owner.associatedAddresses,
                    ownerOccupied: skipTraceResult.ownerOccupied,
                    ownershipType: skipTraceResult.ownershipType,
                  },
                });

                createdContacts.push({
                  id: contact.id,
                  name: contact.name,
                  phone: contact.phone,
                  email: contact.email,
                  type: contact.type,
                });
              }

              // Link contact to property if property exists
              if (property) {
                // Check if link already exists
                const existingLink = await PropertyContact.findOne({
                  where: {
                    propertyId: property.id,
                    contactId: contact.id,
                  },
                });

                if (!existingLink) {
                  await PropertyContact.create({
                    propertyId: property.id,
                    contactId: contact.id,
                    role: input.contactRole as any,
                    isPrimary: createdContacts.length === 0, // First contact is primary
                    notes: `Added via skip trace on ${new Date().toLocaleDateString()}`,
                  });

                  linkedContacts.push({
                    contactId: contact.id,
                    contactName: contact.name,
                    role: input.contactRole,
                  });
                }
              }
            }
          }

          // Build response
          const fullAddress = `${houseNumber} ${street}, ${city}, ${state} ${zip}`.trim();

          return success({
            found: true,
            address: fullAddress,
            skipTrace: {
              ownerCount: skipTraceResult.owners?.length || 0,
              ownerOccupied: skipTraceResult.ownerOccupied,
              ownershipType: skipTraceResult.ownershipType,
              owners: skipTraceResult.owners?.map(o => ({
                name: o.name,
                phones: o.phones?.map(p => ({ number: p.number, type: p.type })) || [],
                emails: o.emails || [],
              })),
              mailingAddress: skipTraceResult.mailingAddress,
              confidence: skipTraceResult.confidence,
            },
            property: property ? {
              id: property.id,
              address: fullAddress,
              created: propertyCreated,
              status: property.status,
            } : null,
            contacts: {
              created: createdContacts,
              linked: linkedContacts,
              totalOwners: skipTraceResult.owners?.length || 0,
            },
            marketData: marketData ? {
              zestimate: marketData.zestimate,
              bedrooms: marketData.bedrooms,
              bathrooms: marketData.bathrooms,
              sqft: marketData.sqft,
              yearBuilt: marketData.yearBuilt,
            } : null,
            message: `Skip traced ${fullAddress}. ` +
              `Found ${skipTraceResult.owners?.length || 0} owner(s). ` +
              (propertyCreated ? 'Property created. ' : property ? 'Property already exists. ' : '') +
              (createdContacts.length > 0 ? `Created ${createdContacts.length} contact(s). ` : '') +
              (linkedContacts.length > 0 ? `Linked ${linkedContacts.length} contact(s) to property.` : ''),
          });
        } catch (error) {
          return failure(`Error with skip trace and add: ${error}`);
        }
      },
      cacheable: false, // Don't cache since it creates records
    }),

    // =========================================================================
    // GET RENTAL MARKET TRENDS
    // =========================================================================
    defineTool({
      name: 'get_rental_market_trends',
      description:
        'Get rental market trends for a city/area including median rent, average rent, listing counts, and historical trends.',
      category: 'market_data',
      schema: z.object({
        location: z.string().describe('City and state (e.g., "Austin, TX")'),
        bedroomType: z
          .string()
          .optional()
          .describe('Bedroom filter: All_Bedrooms, Studio, One, Two, Three, Four_Plus'),
        homeType: z
          .string()
          .optional()
          .describe('Home type: All_Property_Types, Apartments, Houses, Condos, Townhomes'),
      }),
      handler: async (input, context) => {
        try {
          const service = MarketDataService.getInstance();
          const result = await service.getRentalMarketTrends(
            input.location,
            input.bedroomType || 'All_Bedrooms',
            input.homeType || 'All_Property_Types'
          );

          if (!result) {
            return success({
              found: false,
              location: input.location,
              message: `No rental market data found for ${input.location}`,
            });
          }

          // Create UI components for visualization
          const uiComponents: string[] = [];

          // Add trend chart if trends available
          if (result.trends && result.trends.length > 0) {
            const trendData = result.trends.slice(0, 12).map((t: any) => ({
              label: t.date,
              value: t.medianRent || 0,
            }));

            uiComponents.push(
              createChart({
                type: 'line',
                title: `Rental Trends - ${result.location}`,
                data: trendData,
                showLegend: false,
              })
            );
          }

          return success(
            {
              found: true,
              location: result.location,
              summary: {
                medianRent: result.medianRent,
                averageRent: result.averageRent,
                totalListings: result.totalListings,
                yearOverYearChange: result.yearOverYearChange,
                monthOverMonthChange: result.monthOverMonthChange,
              },
              trends: result.trends?.slice(0, 12).map((t: any) => ({
                date: t.date,
                medianRent: t.medianRent,
                rentChange: t.rentChangePercent,
              })),
              rentalYield: result.medianRent
                ? `Median rent $${result.medianRent}/mo from ${result.totalListings || 'N/A'} listings`
                : null,
              dataSource: result.dataSource,
            },
            `Rental trends for ${result.location}`,
            { uiComponents }
          );
        } catch (error) {
          return failure(`Error getting rental trends: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 24 * 60 * 60, // 24 hours
    }),

    // =========================================================================
    // GET RECENT MARKET LOOKUPS
    // =========================================================================
    defineTool({
      name: 'get_recent_market_lookups',
      description:
        'Get recently looked up properties from the market data cache. Useful for reviewing what properties have been researched.',
      category: 'market_data',
      schema: z.object({
        limit: z.number().optional().default(10).describe('Number of recent lookups to return'),
      }),
      handler: async (input, context) => {
        try {
          const service = MarketDataService.getInstance();
          const results = await service.getRecentLookups(input.limit || 10);

          if (results.length === 0) {
            return success({
              count: 0,
              lookups: [],
              message: 'No recent property lookups found in database.',
            });
          }

          return success({
            count: results.length,
            lookups: results.map((r: any) => ({
              zpid: r.zpid,
              address: r.address,
              city: r.city,
              state: r.state,
              zestimate: r.zestimate,
              bedrooms: r.bedrooms,
              bathrooms: r.bathrooms,
              sqft: r.sqft,
              lookupCount: r.lookupCount,
              lastLookupAt: r.lastLookupAt,
            })),
          });
        } catch (error) {
          return failure(`Error getting recent lookups: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET MARKET STATS
    // =========================================================================
    defineTool({
      name: 'get_market_stats',
      description:
        'Get statistical analysis of properties in a specific market including price ranges, averages, and distribution.',
      category: 'market_data',
      schema: z.object({
        state: z.string().optional().describe('Filter by state'),
        city: z.string().optional().describe('Filter by city'),
      }),
      handler: async (input, context) => {
        try {
          // This would query the Property database for stats
          // For now, return structure indicating it needs property data
          return success({
            location: {
              state: input.state || 'All',
              city: input.city || 'All',
            },
            message:
              'Market stats require property database access. Use search_properties to find properties in this area.',
            suggestion: 'Search for properties first, then analyze the results.',
          });
        } catch (error) {
          return failure(`Error getting market stats: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 60 * 60, // 1 hour
    }),

    // =========================================================================
    // FIND BEST FUNDS
    // =========================================================================
    defineTool({
      name: 'find_best_funds',
      description:
        'Find the best matching funds for a property based on historical acceptance rates and buy box criteria.',
      category: 'market_data',
      schema: z.object({
        state: z.string().describe('Property state'),
        askingPrice: z.number().describe('Asking price'),
        propertyType: z.string().optional().describe('Property type'),
        bedrooms: z.number().optional().describe('Number of bedrooms'),
        bathrooms: z.number().optional().describe('Number of bathrooms'),
      }),
      handler: async (input, context) => {
        try {
          // This would integrate with deal intelligence service
          // For now, return structure indicating it needs scoring
          return success({
            property: {
              state: input.state,
              askingPrice: input.askingPrice,
              propertyType: input.propertyType || 'Single Family',
            },
            suggestion: 'Use score_deal_against_buyboxes for detailed fund matching.',
            message: 'Fund matching requires buy box scoring. This tool shows acceptance rates.',
          });
        } catch (error) {
          return failure(`Error finding best funds: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerMarketDataTools;
