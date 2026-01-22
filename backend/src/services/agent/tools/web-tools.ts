/**
 * Web Tools
 *
 * Tools for web scraping, auction site management, and browser automation.
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import { AuctionSubmissionPlugin } from '../../../plugins/browser';
import Firecrawl from '@mendable/firecrawl-js';
import Property from '../../../models/Property';

// Get singleton instance
const auctionSubmissionPlugin = new AuctionSubmissionPlugin();

/**
 * Register all web tools with the registry
 */
export function registerWebTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // SCRAPE WEBSITE
    // =========================================================================
    defineTool({
      name: 'scrape_website',
      description:
        'Scrape a website URL to extract property information. Returns structured data from listing pages.',
      category: 'web',
      schema: z.object({
        url: z.string().describe('Website URL to scrape'),
        extractFields: z
          .array(z.string())
          .optional()
          .describe('Specific fields to extract (address, price, beds, etc.)'),
      }),
      handler: async (input, context) => {
        try {
          const firecrawlKey = process.env.FIRECRAWL_API_KEY;
          if (!firecrawlKey) {
            return failure('Web scraping not available. FIRECRAWL_API_KEY not configured.');
          }

          const firecrawl = new Firecrawl({ apiKey: firecrawlKey });
          const result = await firecrawl.scrapeUrl(input.url, {
            formats: ['markdown'],
          }) as any;

          return success({
            url: input.url,
            extracted: result.extract || null,
            markdown: result.markdown?.substring(0, 2000),
            message: 'Website scraped successfully.',
          });
        } catch (error) {
          return failure(`Error scraping website: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 60 * 60, // 1 hour
    }),

    // =========================================================================
    // MAP WEBSITE
    // =========================================================================
    defineTool({
      name: 'map_website',
      description:
        'Map a website structure to discover all listing pages. Useful for finding multiple properties on a site.',
      category: 'web',
      schema: z.object({
        url: z.string().describe('Base website URL to map'),
        maxPages: z.number().optional().default(50).describe('Maximum pages to discover'),
      }),
      handler: async (input, context) => {
        try {
          const firecrawlKey = process.env.FIRECRAWL_API_KEY;
          if (!firecrawlKey) {
            return failure('Web mapping not available. FIRECRAWL_API_KEY not configured.');
          }

          const firecrawl = new Firecrawl({ apiKey: firecrawlKey });
          const result = await firecrawl.mapUrl(input.url, {
            limit: input.maxPages,
          }) as any;

          const links = result.links || [];
          // Filter for likely property listing URLs
          const propertyUrls = links.filter(
            (url: string) =>
              url.includes('/property') ||
              url.includes('/listing') ||
              url.includes('/home') ||
              url.includes('/for-sale') ||
              url.match(/\/\d{5,}/) // Numeric IDs often indicate listings
          );

          return success({
            baseUrl: input.url,
            totalPages: links.length,
            propertyUrls: propertyUrls.slice(0, 20),
            message: `Found ${links.length} pages, ${propertyUrls.length} appear to be property listings.`,
          });
        } catch (error) {
          return failure(`Error mapping website: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 24 * 60 * 60, // 24 hours
    }),

    // =========================================================================
    // LIST AUCTION SITES
    // =========================================================================
    defineTool({
      name: 'list_auction_sites',
      description:
        'List all configured auction sites for property submission (Xome, Hubzu, etc.).',
      category: 'web',
      schema: z.object({}),
      handler: async (input, context) => {
        try {
          const sites = auctionSubmissionPlugin.getAllSites();

          return success({
            sites: sites.map((s: any) => ({
              id: s.id,
              name: s.name,
              type: s.type,
              enabled: s.enabled,
              hasCredentials: !!s.credentials?.username,
              lastSubmission: s.lastSubmission || 'Never',
            })),
            count: sites.length,
          });
        } catch (error) {
          return failure(`Error listing auction sites: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 24 * 60 * 60, // 24 hours
    }),

    // =========================================================================
    // SUBMIT PROPERTY TO SITE
    // =========================================================================
    defineTool({
      name: 'submit_property_to_site',
      description: 'Submit a property from the database to an auction site.',
      category: 'web',
      schema: z.object({
        propertyId: z.string().describe('The property ID to submit'),
        siteId: z.string().describe('The auction site ID (e.g., xome, hubzu, zillow)'),
      }),
      handler: async (input, context) => {
        try {
          const property = await Property.findOne({ where: { propertyId: input.propertyId } });
          if (!property) {
            return failure(`Property ${input.propertyId} not found.`);
          }

          const p = property as any;
          const deal = {
            address: {
              street: `${p.address?.houseNumber || ''} ${p.address?.street || ''}`.trim(),
              city: p.city,
              state: p.state,
              zip: p.zip,
            },
            askingPrice: p.mlsListingPrice || p.buyItNowPrice,
            bedrooms: p.bedroomCount,
            bathrooms: p.bathroomCount,
            sqft: p.livingSpaceSqFt,
            description: p.propertyListingDescription,
            photos: p.photoLinks,
          };

          const result = await auctionSubmissionPlugin.submitDeal(deal as any, input.siteId);

          if (result.success) {
            return success({
              propertyId: input.propertyId,
              siteId: input.siteId,
              confirmationNumber: result.confirmationNumber || 'Pending',
              message: `Successfully submitted to ${input.siteId}!`,
            });
          } else {
            return failure(`Failed to submit: ${result.error}`);
          }
        } catch (error) {
          return failure(`Error submitting property: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerWebTools;
