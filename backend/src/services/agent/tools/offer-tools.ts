/**
 * Offer Tools
 *
 * Tools for creating, listing, and managing deal offers.
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import DealOffer from '../../../models/DealOffer';
import { Property, MarketplaceUser } from '../../../models';
import { swipeService } from '../../marketplace/SwipeService';
import { Op } from 'sequelize';
import { createOfferCard, createChart, OfferCardData } from '../ui-components';

/**
 * Register all offer tools with the registry
 */
export function registerOfferTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // CREATE OFFER
    // =========================================================================
    defineTool({
      name: 'create_offer',
      description: `Create a purchase offer on a property/deal. Use this to:
- Submit offers to sellers
- Make bids on wholesale deals
- Start negotiations on properties

Requires: deal/property ID, offer amount, financing type, and closing timeline.`,
      category: 'offer',
      schema: z.object({
        dealId: z.string().describe('Deal or property ID to make offer on'),
        offerAmount: z.number().positive().describe('Offer amount in dollars'),
        closingDays: z
          .number()
          .int()
          .positive()
          .default(14)
          .describe('Number of days to close (default 14)'),
        earnestMoney: z
          .number()
          .positive()
          .optional()
          .describe('Earnest money deposit amount'),
        financeType: z
          .enum(['cash', 'hard_money', 'conventional', 'other'])
          .default('cash')
          .describe('Financing type'),
        contingencies: z
          .array(z.string())
          .optional()
          .describe('List of contingencies (e.g., "inspection", "financing", "appraisal")'),
        notes: z.string().optional().describe('Additional notes or terms for the offer'),
        proofOfFunds: z.boolean().optional().default(false).describe('Whether proof of funds is attached'),
        expiresInDays: z
          .number()
          .int()
          .positive()
          .default(3)
          .describe('Days until offer expires (default 3)'),
      }),
      handler: async (input, context) => {
        try {
          // Validate user context
          if (!context.userId) {
            return failure('User authentication required to create offers.');
          }

          // Check if user exists
          const user = await MarketplaceUser.findByPk(context.userId);
          if (!user) {
            return failure('User not found. Please ensure you are registered.');
          }

          // Verify the deal/property exists
          const property = await Property.findOne({
            where: {
              [Op.or]: [
                { id: input.dealId },
                { dealId: input.dealId },
              ],
            },
          });

          if (!property) {
            return failure(`Property or deal "${input.dealId}" not found.`);
          }

          // Calculate expiration date
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);

          // Create the offer
          const offer = await DealOffer.create({
            userId: context.userId,
            dealId: input.dealId,
            propertyId: property.id,
            offerAmount: input.offerAmount,
            earnestMoney: input.earnestMoney,
            closingDays: input.closingDays,
            contingencies: input.contingencies || [],
            notes: input.notes,
            financeType: input.financeType,
            proofOfFunds: input.proofOfFunds || false,
            preApprovalLetter: false,
            status: 'pending',
            expiresAt,
          });

          // Calculate offer metrics
          const askingPrice = property.askingPrice || property.price || 0;
          const discount = askingPrice > 0
            ? ((askingPrice - input.offerAmount) / askingPrice * 100).toFixed(1)
            : null;

          // Create UI component for the offer
          const offerCardData: OfferCardData = {
            offerId: offer.id,
            propertyId: property.id,
            propertyAddress: property.address || `${property.city}, ${property.state}`,
            offerAmount: input.offerAmount,
            buyerName: user?.name || 'You',
            status: 'pending',
            expiresAt: expiresAt.toISOString(),
            terms: `${input.closingDays} days to close, ${input.financeType}`,
          };

          return success(
            {
              offerId: offer.id,
              dealId: input.dealId,
              propertyId: property.id,
              address: property.address,
              offerAmount: input.offerAmount,
              askingPrice,
              discount: discount ? `${discount}%` : null,
              closingDays: input.closingDays,
              earnestMoney: input.earnestMoney,
              financeType: input.financeType,
              contingencies: input.contingencies || [],
              status: 'pending',
              expiresAt: expiresAt.toISOString(),
            },
            `Offer of $${input.offerAmount.toLocaleString()} submitted on ${property.address}. Expires in ${input.expiresInDays} days.`,
            { uiComponents: [createOfferCard(offerCardData)] }
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error creating offer: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // LIST OFFERS
    // =========================================================================
    defineTool({
      name: 'list_offers',
      description: `List offers with flexible filtering. Use this to:
- View all your submitted offers
- Check offers on a specific property
- Filter by status (pending, accepted, rejected, etc.)
- Review offer history`,
      category: 'offer',
      schema: z.object({
        dealId: z.string().optional().describe('Filter by deal/property ID'),
        status: z
          .enum(['pending', 'viewed', 'countered', 'accepted', 'rejected', 'expired', 'withdrawn', 'all'])
          .optional()
          .default('all')
          .describe('Filter by offer status'),
        myOffers: z
          .boolean()
          .optional()
          .default(true)
          .describe('Only show my offers (default true)'),
        limit: z.number().int().positive().optional().default(20).describe('Max results'),
        includeExpired: z.boolean().optional().default(false).describe('Include expired offers'),
      }),
      handler: async (input, context) => {
        try {
          // Build where clause
          const where: Record<string, any> = {};

          // Filter by user if myOffers is true
          if (input.myOffers && context.userId) {
            where.userId = context.userId;
          }

          // Filter by deal
          if (input.dealId) {
            where.dealId = input.dealId;
          }

          // Filter by status
          if (input.status && input.status !== 'all') {
            where.status = input.status;
          }

          // Exclude expired by default
          if (!input.includeExpired) {
            where[Op.or as any] = [
              { status: { [Op.ne]: 'expired' } },
              { expiresAt: { [Op.gt]: new Date() } },
            ];
          }

          // Fetch offers
          const offers = await DealOffer.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: input.limit,
          });

          // Enrich with property data
          const enrichedOffers = await Promise.all(
            offers.map(async (offer) => {
              let property = null;
              if (offer.propertyId) {
                property = await Property.findByPk(offer.propertyId, {
                  attributes: ['id', 'address', 'city', 'state', 'askingPrice', 'price'],
                });
              }

              const askingPrice = property?.askingPrice || property?.price || 0;
              const discount = askingPrice > 0
                ? ((askingPrice - offer.offerAmount) / askingPrice * 100).toFixed(1)
                : null;

              return {
                id: offer.id,
                dealId: offer.dealId,
                propertyId: offer.propertyId,
                address: property?.address || 'Unknown',
                city: property?.city,
                state: property?.state,
                offerAmount: offer.offerAmount,
                askingPrice,
                discount: discount ? `${discount}%` : null,
                earnestMoney: offer.earnestMoney,
                closingDays: offer.closingDays,
                financeType: offer.financeType,
                contingencies: offer.contingencies,
                status: offer.status,
                counterOffer: offer.counterOfferAmount
                  ? {
                      amount: offer.counterOfferAmount,
                      closingDays: offer.counterOfferClosingDays,
                      notes: offer.counterOfferNotes,
                      at: offer.counterOfferAt,
                    }
                  : null,
                expiresAt: offer.expiresAt,
                isExpired: new Date() > offer.expiresAt,
                createdAt: offer.createdAt,
                viewedAt: offer.viewedAt,
                respondedAt: offer.respondedAt,
              };
            })
          );

          // Summary stats
          const stats = {
            total: enrichedOffers.length,
            pending: enrichedOffers.filter((o) => o.status === 'pending').length,
            accepted: enrichedOffers.filter((o) => o.status === 'accepted').length,
            rejected: enrichedOffers.filter((o) => o.status === 'rejected').length,
            countered: enrichedOffers.filter((o) => o.status === 'countered').length,
            expired: enrichedOffers.filter((o) => o.isExpired).length,
          };

          // Create UI components
          const uiComponents: string[] = [];

          // Add offer cards for each offer (up to 5)
          const topOffers = enrichedOffers.slice(0, 5);
          for (const offer of topOffers) {
            const offerCardData: OfferCardData = {
              offerId: offer.id,
              propertyId: offer.propertyId,
              propertyAddress: offer.address,
              offerAmount: offer.offerAmount,
              buyerName: 'You',
              status: offer.status as OfferCardData['status'],
              expiresAt: offer.expiresAt?.toISOString?.() || String(offer.expiresAt),
              terms: `${offer.closingDays} days, ${offer.financeType}`,
            };
            uiComponents.push(createOfferCard(offerCardData));
          }

          // Add chart showing status distribution if multiple offers
          if (enrichedOffers.length > 1) {
            uiComponents.push(
              createChart({
                type: 'donut',
                title: 'Offers by Status',
                data: [
                  { label: 'Pending', value: stats.pending, color: '#f59e0b' },
                  { label: 'Accepted', value: stats.accepted, color: '#22c55e' },
                  { label: 'Rejected', value: stats.rejected, color: '#ef4444' },
                  { label: 'Countered', value: stats.countered, color: '#8b5cf6' },
                  { label: 'Expired', value: stats.expired, color: '#6b7280' },
                ].filter(d => d.value > 0),
                showLegend: true,
              })
            );
          }

          return success(
            {
              offers: enrichedOffers,
              stats,
            },
            `Found ${enrichedOffers.length} offer(s).`,
            { uiComponents }
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error listing offers: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET OFFER DETAILS
    // =========================================================================
    defineTool({
      name: 'get_offer_details',
      description: 'Get detailed information about a specific offer.',
      category: 'offer',
      schema: z.object({
        offerId: z.string().describe('Offer ID to retrieve'),
      }),
      handler: async (input, context) => {
        try {
          const offer = await DealOffer.findByPk(input.offerId);

          if (!offer) {
            return failure(`Offer "${input.offerId}" not found.`);
          }

          // Get property info
          let property = null;
          if (offer.propertyId) {
            property = await Property.findByPk(offer.propertyId);
          }

          // Get user info
          let user = null;
          if (offer.userId) {
            user = await MarketplaceUser.findByPk(offer.userId, {
              attributes: ['id', 'name', 'email', 'company'],
            });
          }

          const askingPrice = property?.askingPrice || property?.price || 0;
          const discount = askingPrice > 0
            ? ((askingPrice - offer.offerAmount) / askingPrice * 100).toFixed(1)
            : null;

          return success({
            offer: {
              id: offer.id,
              dealId: offer.dealId,
              status: offer.status,
              offerAmount: offer.offerAmount,
              askingPrice,
              discount: discount ? `${discount}%` : null,
              earnestMoney: offer.earnestMoney,
              closingDays: offer.closingDays,
              financeType: offer.financeType,
              proofOfFunds: offer.proofOfFunds,
              preApprovalLetter: offer.preApprovalLetter,
              contingencies: offer.contingencies,
              notes: offer.notes,
              counterOffer: offer.counterOfferAmount
                ? {
                    amount: offer.counterOfferAmount,
                    closingDays: offer.counterOfferClosingDays,
                    notes: offer.counterOfferNotes,
                    at: offer.counterOfferAt,
                  }
                : null,
              expiresAt: offer.expiresAt,
              isExpired: new Date() > offer.expiresAt,
              createdAt: offer.createdAt,
              viewedAt: offer.viewedAt,
              respondedAt: offer.respondedAt,
            },
            property: property
              ? {
                  id: property.id,
                  address: property.address,
                  city: property.city,
                  state: property.state,
                  zipCode: property.zipCode,
                  askingPrice: property.askingPrice || property.price,
                  beds: property.beds,
                  baths: property.baths,
                  sqft: property.sqft,
                }
              : null,
            buyer: user
              ? {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  company: user.company,
                }
              : null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error getting offer details: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // UPDATE OFFER STATUS
    // =========================================================================
    defineTool({
      name: 'update_offer_status',
      description: `Update the status of an offer. Use this to:
- Withdraw your offer
- Accept/reject offers (if you're the seller)
- Counter an offer`,
      category: 'offer',
      schema: z.object({
        offerId: z.string().describe('Offer ID to update'),
        action: z
          .enum(['withdraw', 'accept', 'reject', 'counter'])
          .describe('Action to take on the offer'),
        counterAmount: z
          .number()
          .positive()
          .optional()
          .describe('Counter offer amount (required if action is "counter")'),
        counterClosingDays: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Counter offer closing days'),
        counterNotes: z.string().optional().describe('Counter offer notes'),
        reason: z.string().optional().describe('Reason for rejection or withdrawal'),
      }),
      handler: async (input, context) => {
        try {
          const offer = await DealOffer.findByPk(input.offerId);

          if (!offer) {
            return failure(`Offer "${input.offerId}" not found.`);
          }

          // Check if offer is already resolved
          if (['accepted', 'rejected', 'expired', 'withdrawn'].includes(offer.status)) {
            return failure(`Cannot update offer - it is already ${offer.status}.`);
          }

          const updates: Partial<typeof offer> = {
            respondedAt: new Date(),
          };

          switch (input.action) {
            case 'withdraw':
              // Only the offer creator can withdraw
              if (context.userId && offer.userId !== context.userId) {
                return failure('You can only withdraw your own offers.');
              }
              updates.status = 'withdrawn';
              break;

            case 'accept':
              updates.status = 'accepted';
              break;

            case 'reject':
              updates.status = 'rejected';
              if (input.reason) {
                updates.notes = `${offer.notes || ''}\n\nRejection reason: ${input.reason}`.trim();
              }
              break;

            case 'counter':
              if (!input.counterAmount) {
                return failure('Counter offer amount is required.');
              }
              updates.status = 'countered';
              updates.counterOfferAmount = input.counterAmount;
              updates.counterOfferClosingDays = input.counterClosingDays;
              updates.counterOfferNotes = input.counterNotes;
              updates.counterOfferAt = new Date();
              break;
          }

          await offer.update(updates);

          return success({
            offerId: offer.id,
            action: input.action,
            newStatus: updates.status,
            counterOffer: input.action === 'counter'
              ? {
                  amount: input.counterAmount,
                  closingDays: input.counterClosingDays,
                  notes: input.counterNotes,
                }
              : null,
            message: `Offer ${input.action === 'counter' ? 'countered' : input.action + 'ed'} successfully.`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error updating offer: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET OFFER STATS
    // =========================================================================
    defineTool({
      name: 'get_offer_stats',
      description: 'Get statistics about offers (acceptance rate, average discount, etc.).',
      category: 'offer',
      schema: z.object({
        timeRange: z
          .enum(['7d', '30d', '90d', 'all'])
          .optional()
          .default('30d')
          .describe('Time range for stats'),
      }),
      handler: async (input, context) => {
        try {
          // Calculate date range
          let dateFilter: Date | null = null;
          if (input.timeRange !== 'all') {
            dateFilter = new Date();
            const days = input.timeRange === '7d' ? 7 : input.timeRange === '30d' ? 30 : 90;
            dateFilter.setDate(dateFilter.getDate() - days);
          }

          const where: Record<string, any> = {};
          if (context.userId) {
            where.userId = context.userId;
          }
          if (dateFilter) {
            where.createdAt = { [Op.gte]: dateFilter };
          }

          // Get all offers in range
          const offers = await DealOffer.findAll({ where });

          // Calculate stats
          const total = offers.length;
          const pending = offers.filter((o) => o.status === 'pending').length;
          const accepted = offers.filter((o) => o.status === 'accepted').length;
          const rejected = offers.filter((o) => o.status === 'rejected').length;
          const countered = offers.filter((o) => o.status === 'countered').length;
          const expired = offers.filter((o) => o.status === 'expired').length;
          const withdrawn = offers.filter((o) => o.status === 'withdrawn').length;

          // Calculate rates
          const resolvedOffers = offers.filter((o) =>
            ['accepted', 'rejected', 'countered'].includes(o.status)
          );
          const acceptanceRate = resolvedOffers.length > 0
            ? (accepted / resolvedOffers.length * 100).toFixed(1)
            : '0';

          // Calculate average offer amounts
          const avgOfferAmount = total > 0
            ? offers.reduce((sum, o) => sum + o.offerAmount, 0) / total
            : 0;

          const avgClosingDays = total > 0
            ? offers.reduce((sum, o) => sum + o.closingDays, 0) / total
            : 0;

          // Create UI components
          const uiComponents: string[] = [];

          // Add pie chart showing offer outcomes
          if (total > 0) {
            uiComponents.push(
              createChart({
                type: 'pie',
                title: 'Offer Outcomes',
                data: [
                  { label: 'Pending', value: pending, color: '#f59e0b' },
                  { label: 'Accepted', value: accepted, color: '#22c55e' },
                  { label: 'Rejected', value: rejected, color: '#ef4444' },
                  { label: 'Countered', value: countered, color: '#8b5cf6' },
                  { label: 'Expired', value: expired, color: '#6b7280' },
                  { label: 'Withdrawn', value: withdrawn, color: '#9ca3af' },
                ].filter(d => d.value > 0),
                showLegend: true,
              })
            );
          }

          return success(
            {
              timeRange: input.timeRange,
              stats: {
                total,
                pending,
                accepted,
                rejected,
                countered,
                expired,
                withdrawn,
                acceptanceRate: `${acceptanceRate}%`,
                avgOfferAmount: Math.round(avgOfferAmount),
                avgClosingDays: Math.round(avgClosingDays),
              },
            },
            `${total} offers in the last ${input.timeRange}. Acceptance rate: ${acceptanceRate}%.`,
            { uiComponents }
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error getting offer stats: ${errorMessage}`);
        }
      },
      cacheable: true,
      cacheTTL: 5 * 60, // 5 minutes
    }),
  ]);
}

export default registerOfferTools;
