/**
 * Buy Box Tools
 *
 * Tools for managing hedge fund buy boxes and investment criteria.
 */

import { z } from 'zod';
import { Op } from 'sequelize';
import { toolRegistry, success, failure, defineTool } from './registry';
import HedgeFundBuyBox from '../../../models/HedgeFundBuyBox';
import { dealProcessingService } from '../../../plugins';

/**
 * Register all buy box tools with the registry
 */
export function registerBuyboxTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // LIST BUY BOXES
    // =========================================================================
    defineTool({
      name: 'list_buyboxes',
      description:
        'List all registered hedge fund buy boxes with their criteria and contact info',
      category: 'buybox',
      schema: z.object({}),
      handler: async (input, context) => {
        try {
          const buyBoxes = dealProcessingService.getAllBuyBoxes();

          if (buyBoxes.length === 0) {
            return success({
              buyBoxes: [],
              message: 'No buy boxes registered. Use create_buybox to add one.',
            });
          }

          return success({
            buyBoxes: buyBoxes.map((bb: any) => ({
              id: bb.id,
              name: bb.name,
              enabled: bb.enabled,
              fundName: bb.fundName,
              contactEmail: bb.contactEmail,
              states: bb.criteria?.states?.join(', ') || 'Any',
              priceRange:
                bb.criteria?.minPrice && bb.criteria?.maxPrice
                  ? `$${bb.criteria.minPrice.toLocaleString()} - $${bb.criteria.maxPrice.toLocaleString()}`
                  : 'Any',
              bedroomRange:
                bb.criteria?.minBedrooms && bb.criteria?.maxBedrooms
                  ? `${bb.criteria.minBedrooms} - ${bb.criteria.maxBedrooms}`
                  : 'Any',
              autoSubmitThreshold: bb.autoSubmitThreshold || 80,
            })),
            count: buyBoxes.length,
          });
        } catch (error) {
          return failure(`Error listing buy boxes: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 60 * 60, // 1 hour
    }),

    // =========================================================================
    // GET BUY BOX DETAILS
    // =========================================================================
    defineTool({
      name: 'get_buybox_details',
      description:
        'Get complete details of a specific buy box including all criteria and scoring weights.',
      category: 'buybox',
      schema: z.object({
        buyBoxId: z.string().describe('Buy box ID or name to look up'),
      }),
      handler: async (input, context) => {
        try {
          let buyBox = await HedgeFundBuyBox.findByPk(input.buyBoxId);

          // Try finding by name if not found by ID
          if (!buyBox) {
            buyBox = await HedgeFundBuyBox.findOne({
              where: { name: { [Op.iLike]: `%${input.buyBoxId}%` } },
            });
          }

          if (!buyBox) {
            return failure(`Buy box "${input.buyBoxId}" not found.`);
          }

          const b = buyBox as any;
          return success({
            id: b.id,
            name: b.name,
            description: b.description,
            fundName: b.fundName,
            contactEmail: b.contactEmail,
            enabled: b.enabled,
            priority: b.priority,
            criteria: b.criteria,
            scoringWeights: b.scoringWeights,
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
          });
        } catch (error) {
          return failure(`Error getting buy box details: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 60 * 60, // 1 hour
    }),

    // =========================================================================
    // CREATE BUY BOX
    // =========================================================================
    defineTool({
      name: 'create_buybox',
      description: 'Create a new hedge fund buy box with specific investment criteria',
      category: 'buybox',
      schema: z.object({
        name: z.string().describe('Buy box name (e.g., "Texas SFR Under 300k")'),
        fundName: z.string().optional().describe('Fund/investor name'),
        contactEmail: z.string().optional().describe('Contact email for this fund'),
        states: z.array(z.string()).optional().describe('Target states (e.g., ["TX", "FL"])'),
        minPrice: z.number().optional().describe('Minimum property price'),
        maxPrice: z.number().optional().describe('Maximum property price'),
        minBedrooms: z.number().optional().describe('Minimum bedrooms'),
        maxBedrooms: z.number().optional().describe('Maximum bedrooms'),
        propertyTypes: z
          .array(z.string())
          .optional()
          .describe('Property types (e.g., ["Single Family", "Condo"])'),
        autoSubmitThreshold: z
          .number()
          .optional()
          .describe('Score threshold for auto-submission (e.g., 80)'),
      }),
      handler: async (input, context) => {
        try {
          const buyBoxData = {
            name: input.name,
            fundName: input.fundName || input.name,
            contactEmail: input.contactEmail,
            enabled: true,
            priority: 1,
            autoSubmitEnabled: !!input.autoSubmitThreshold,
            autoSubmitThreshold: input.autoSubmitThreshold || 80,
            criteria: {
              states: input.states || [],
              minPrice: input.minPrice,
              maxPrice: input.maxPrice,
              minBedrooms: input.minBedrooms,
              maxBedrooms: input.maxBedrooms,
              propertyTypes: input.propertyTypes || ['Single Family'],
            },
            weights: {
              locationWeight: 20,
              priceWeight: 20,
              propertyTypeWeight: 15,
              bedroomsWeight: 15,
              bathroomsWeight: 10,
              sqftWeight: 10,
              yearBuiltWeight: 5,
              conditionWeight: 5,
            },
          };

          // Save to database
          const created = await HedgeFundBuyBox.create(buyBoxData as any);

          // Reload buy boxes in scoring engine
          await dealProcessingService.loadBuyBoxesFromDatabase();

          return success({
            buyBox: {
              id: (created as any).id,
              name: (created as any).name,
              fundName: (created as any).fundName,
              contactEmail: (created as any).contactEmail,
              states: input.states?.join(', ') || 'Any',
              priceRange:
                input.minPrice && input.maxPrice
                  ? `$${input.minPrice.toLocaleString()} - $${input.maxPrice.toLocaleString()}`
                  : 'Any',
            },
            message: 'Buy box created and activated!',
          });
        } catch (error) {
          return failure(`Error creating buy box: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // UPDATE BUY BOX
    // =========================================================================
    defineTool({
      name: 'update_buybox',
      description:
        'Update a buy box criteria, contact info, or settings. Changes take effect immediately for scoring.',
      category: 'buybox',
      schema: z.object({
        buyBoxId: z.string().describe('Buy box ID or name to update'),
        updates: z
          .object({
            name: z.string().optional().describe('New name'),
            description: z.string().optional().describe('Description'),
            fundName: z.string().optional().describe('Fund name'),
            contactEmail: z.string().optional().describe('Contact email'),
            enabled: z.boolean().optional().describe('Enable/disable'),
            priority: z.number().optional().describe('Priority (1-100)'),
            autoSubmit: z.boolean().optional().describe('Enable auto-submit'),
            autoSubmitThreshold: z.number().optional().describe('Auto-submit score threshold'),
            criteria: z
              .object({
                states: z.array(z.string()).optional().describe('Target states'),
                counties: z.array(z.string()).optional().describe('Target counties'),
                minPrice: z.number().optional().describe('Minimum price'),
                maxPrice: z.number().optional().describe('Maximum price'),
                minBedrooms: z.number().optional().describe('Minimum bedrooms'),
                maxBedrooms: z.number().optional().describe('Maximum bedrooms'),
                minBathrooms: z.number().optional().describe('Minimum bathrooms'),
                minSqft: z.number().optional().describe('Minimum square footage'),
                maxSqft: z.number().optional().describe('Maximum square footage'),
                propertyTypes: z.array(z.string()).optional().describe('Allowed property types'),
                minYearBuilt: z.number().optional().describe('Minimum year built'),
                maxYearBuilt: z.number().optional().describe('Maximum year built'),
              })
              .optional()
              .describe('Criteria updates (merged with existing)'),
          })
          .describe('Fields to update'),
      }),
      handler: async (input, context) => {
        try {
          let buyBox = await HedgeFundBuyBox.findByPk(input.buyBoxId);

          // Try finding by name if not found by ID
          if (!buyBox) {
            buyBox = await HedgeFundBuyBox.findOne({
              where: { name: { [Op.iLike]: `%${input.buyBoxId}%` } },
            });
          }

          if (!buyBox) {
            return failure(`Buy box "${input.buyBoxId}" not found.`);
          }

          // Build update object
          const updateData: any = {};
          const updates = input.updates;

          // Simple fields
          if (updates.name !== undefined) updateData.name = updates.name;
          if (updates.description !== undefined) updateData.description = updates.description;
          if (updates.fundName !== undefined) updateData.fundName = updates.fundName;
          if (updates.contactEmail !== undefined) updateData.contactEmail = updates.contactEmail;
          if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
          if (updates.priority !== undefined) updateData.priority = updates.priority;
          if (updates.autoSubmit !== undefined) updateData.autoSubmitEnabled = updates.autoSubmit;
          if (updates.autoSubmitThreshold !== undefined)
            updateData.autoSubmitThreshold = updates.autoSubmitThreshold;

          // Merge criteria if provided
          if (updates.criteria) {
            updateData.criteria = { ...buyBox.criteria, ...updates.criteria };
          }

          if (Object.keys(updateData).length === 0) {
            return failure('No updates provided.');
          }

          await buyBox.update(updateData);

          // Reload buy boxes in scoring engine
          await dealProcessingService.loadBuyBoxesFromDatabase();

          return success({
            buyBoxId: buyBox.id,
            name: buyBox.name,
            updated: Object.keys(updateData),
            message: `Updated buy box "${buyBox.name}"`,
          });
        } catch (error) {
          return failure(`Error updating buy box: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // DELETE BUY BOX
    // =========================================================================
    defineTool({
      name: 'delete_buybox',
      description:
        'Permanently delete a buy box. Requires confirmation. Deals will no longer be scored against it.',
      category: 'buybox',
      schema: z.object({
        buyBoxId: z.string().describe('Buy box ID or name to delete'),
        confirm: z.boolean().describe('Must be true to confirm deletion'),
      }),
      handler: async (input, context) => {
        try {
          if (!input.confirm) {
            return failure('Deletion not confirmed. Set confirm=true to delete the buy box.');
          }

          let buyBox = await HedgeFundBuyBox.findByPk(input.buyBoxId);

          // Try finding by name if not found by ID
          if (!buyBox) {
            buyBox = await HedgeFundBuyBox.findOne({
              where: { name: { [Op.iLike]: `%${input.buyBoxId}%` } },
            });
          }

          if (!buyBox) {
            return failure(`Buy box "${input.buyBoxId}" not found.`);
          }

          const name = buyBox.name;
          const id = buyBox.id;

          await buyBox.destroy();

          // Reload buy boxes in scoring engine
          await dealProcessingService.loadBuyBoxesFromDatabase();

          return success({
            deleted: { id, name },
            message: `Buy box "${name}" has been deleted.`,
          });
        } catch (error) {
          return failure(`Error deleting buy box: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerBuyboxTools;
