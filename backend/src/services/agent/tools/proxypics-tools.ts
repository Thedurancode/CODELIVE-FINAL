/**
 * ProxyPics Tools
 *
 * Tools for ordering and managing property photos via ProxyPics crowdsourced photography network.
 * - 180K+ photographers nationwide
 * - < 24 hour turnaround for exterior photos
 * - Supports Crowdsource and Direct platforms
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import { proxyPicsService } from '../../ProxyPicsService';
import { Property } from '../../../models';
import { Op } from 'sequelize';

/**
 * Build a full address string from Property model
 */
function buildAddressString(property: Property): string {
  const address = property.address;
  const streetPart = address
    ? `${address.houseNumber || ''} ${address.street || ''}${address.address2 ? ' ' + address.address2 : ''}`.trim()
    : '';
  return `${streetPart}, ${property.city}, ${property.state} ${property.zip}`;
}

/**
 * Find a property by address string (fuzzy match)
 */
async function findPropertyByAddress(address: string): Promise<Property | null> {
  // Try matching city and state first
  const parts = address.split(/[,\s]+/).filter(p => p.length > 2);

  if (parts.length > 0) {
    // Search by city, state, or street parts
    const property = await Property.findOne({
      where: {
        [Op.or]: [
          { city: { [Op.iLike]: `%${parts[0]}%` } },
          ...parts.map(part => ({ city: { [Op.iLike]: `%${part}%` } })),
        ],
      },
    });
    return property;
  }

  return null;
}

/**
 * Register all ProxyPics tools with the registry
 */
export function registerProxyPicsTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // ORDER PROPERTY PHOTOS
    // =========================================================================
    defineTool({
      name: 'order_property_photos',
      description: `Order professional exterior photos for a property via ProxyPics.
Photographers typically complete orders within 24 hours.

You can order by:
- Property ID (if known)
- Property address (will find matching property in database)
- Just an address (for properties not yet in database)

Options:
- platform: "crowdsource" (default, 180K+ photographers) or "direct" (specific photographer)
- priceBoost: Add incentive (in dollars) for faster completion
- notes: Special instructions for the photographer
- templateToken: Use a predefined photo template (get templates first)`,
      category: 'market_data',
      schema: z.object({
        propertyId: z.number().optional().describe('Property ID (if ordering for an existing property)'),
        address: z.string().optional().describe('Property address (e.g., "123 Main St, Austin TX 78701")'),
        platform: z.enum(['crowdsource', 'direct']).optional().default('crowdsource')
          .describe('Photo platform: crowdsource (default) or direct'),
        priceBoost: z.number().optional().describe('Additional incentive in dollars for faster completion'),
        notes: z.string().optional().describe('Special instructions for the photographer'),
        templateToken: z.string().optional().describe('Template token for predefined photo requirements'),
        expiresInHours: z.number().optional().default(24).describe('Hours until order expires (default: 24)'),
      }),
      handler: async (input) => {
        try {
          if (!proxyPicsService.isReady()) {
            return failure('ProxyPics service is not configured. Please set PROXYPICS_API_KEY.');
          }

          let fullAddress: string;
          let propertyId: number | undefined;
          let externalId: string | undefined;

          // Determine the address to use
          if (input.propertyId) {
            const property = await Property.findByPk(input.propertyId);
            if (!property) {
              return failure(`Property not found with ID: ${input.propertyId}`);
            }
            fullAddress = buildAddressString(property);
            propertyId = property.id;
            externalId = `property-${property.id}`;
          } else if (input.address) {
            // Try to find property in database
            const property = await findPropertyByAddress(input.address);
            if (property) {
              fullAddress = buildAddressString(property);
              propertyId = property.id;
              externalId = `property-${property.id}`;
            } else {
              fullAddress = input.address;
            }
          } else {
            return failure('Please provide either a propertyId or an address.');
          }

          // Calculate expiration
          const expiresAt = new Date(Date.now() + (input.expiresInHours || 24) * 60 * 60 * 1000);

          // Create the order
          const result = await proxyPicsService.orderPhotos({
            address: fullAddress,
            platform: input.platform,
            priceBoost: input.priceBoost,
            additionalNotes: input.notes,
            templateToken: input.templateToken,
            expiresAt,
            externalId,
          });

          if (!result.success || !result.order) {
            return failure(result.error || 'Failed to create photo order');
          }

          const order = result.order;
          return success({
            orderId: order.id,
            address: order.address,
            status: order.status,
            platform: order.platform,
            cost: order.cost,
            priceBoost: order.priceBoost,
            expiresAt: order.expiresAt?.toISOString(),
            propertyId,
            message: `Photo order #${order.id} created for ${order.smallAddress}. ` +
              `Photographers will capture exterior photos within ${input.expiresInHours || 24} hours.` +
              (order.priceBoost ? ` (Boosted by $${order.priceBoost} for priority)` : ''),
          });
        } catch (error) {
          return failure(`Failed to order photos: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET PHOTO ORDER STATUS
    // =========================================================================
    defineTool({
      name: 'get_photo_order_status',
      description: `Get the status and details of a ProxyPics photo order.

Status values:
- unassigned: Waiting for a photographer
- assigned: Photographer accepted the job
- upload_started: Photos being uploaded
- completed: Photos uploaded, awaiting review
- fulfilled: Approved and finalized
- canceled: Order was canceled
- expired: Order expired before completion
- on_hold: Order paused`,
      category: 'market_data',
      schema: z.object({
        orderId: z.union([z.string(), z.number()]).describe('The ProxyPics order ID'),
      }),
      handler: async (input) => {
        try {
          if (!proxyPicsService.isReady()) {
            return failure('ProxyPics service is not configured.');
          }

          const result = await proxyPicsService.getOrderStatus(input.orderId);

          if (!result.success || !result.order) {
            return failure(result.error || 'Order not found');
          }

          const order = result.order;
          const statusMessages: Record<string, string> = {
            unassigned: 'Waiting for a photographer to accept',
            assigned: 'A photographer has accepted and is en route',
            upload_started: 'Photographer is uploading photos',
            completed: 'Photos are ready for your review',
            fulfilled: 'Photos approved and finalized',
            canceled: 'Order was canceled',
            expired: 'Order expired before completion',
            on_hold: 'Order is on hold',
          };

          return success({
            orderId: order.id,
            address: order.address,
            status: order.status,
            statusDescription: statusMessages[order.status] || order.status,
            platform: order.platform,
            cost: order.cost,
            createdAt: order.createdAt.toISOString(),
            expiresAt: order.expiresAt?.toISOString(),
            completedAt: order.completedAt?.toISOString(),
            downloadPhotosUrl: order.downloadPhotosUrl,
            downloadReportUrl: order.downloadReportUrl,
            tasks: order.tasks,
            message: `Order #${order.id}: ${statusMessages[order.status] || order.status}` +
              (order.downloadPhotosUrl ? '. Photos are available for download.' : ''),
          });
        } catch (error) {
          return failure(`Failed to get order status: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 60, // 1 minute cache
    }),

    // =========================================================================
    // LIST PHOTO ORDERS
    // =========================================================================
    defineTool({
      name: 'list_photo_orders',
      description: 'List all ProxyPics photo orders with their current status.',
      category: 'market_data',
      schema: z.object({
        page: z.number().optional().default(1).describe('Page number'),
        perPage: z.number().optional().default(20).describe('Orders per page (max 50)'),
      }),
      handler: async (input) => {
        try {
          if (!proxyPicsService.isReady()) {
            return failure('ProxyPics service is not configured.');
          }

          const result = await proxyPicsService.listOrders({
            page: input.page,
            perPage: Math.min(input.perPage || 20, 50),
          });

          const statusCounts: Record<string, number> = {};
          result.orders.forEach(order => {
            statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
          });

          return success({
            orders: result.orders.map(order => ({
              orderId: order.id,
              address: order.smallAddress,
              status: order.status,
              platform: order.platform,
              cost: order.cost,
              createdAt: order.createdAt.toISOString(),
              hasPhotos: !!order.downloadPhotosUrl,
            })),
            total: result.total,
            page: result.page,
            statusCounts,
            message: `Found ${result.total} photo orders. ` +
              Object.entries(statusCounts).map(([s, c]) => `${c} ${s}`).join(', '),
          });
        } catch (error) {
          return failure(`Failed to list photo orders: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 30, // 30 seconds cache
    }),

    // =========================================================================
    // CANCEL PHOTO ORDER
    // =========================================================================
    defineTool({
      name: 'cancel_photo_order',
      description: 'Cancel a pending ProxyPics photo order. Only works for orders not yet completed.',
      category: 'market_data',
      schema: z.object({
        orderId: z.union([z.string(), z.number()]).describe('The ProxyPics order ID to cancel'),
      }),
      handler: async (input) => {
        try {
          if (!proxyPicsService.isReady()) {
            return failure('ProxyPics service is not configured.');
          }

          // First check the status
          const statusResult = await proxyPicsService.getOrderStatus(input.orderId);
          if (statusResult.order?.status === 'completed' || statusResult.order?.status === 'fulfilled') {
            return failure('Cannot cancel a completed order. You can reject it instead if photos need to be retaken.');
          }

          const canceled = await proxyPicsService.cancelOrder(input.orderId);

          if (canceled) {
            return success({
              orderId: input.orderId,
              canceled: true,
              message: `Photo order #${input.orderId} has been canceled.`,
            });
          } else {
            return failure(`Failed to cancel order #${input.orderId}. It may already be in progress.`);
          }
        } catch (error) {
          return failure(`Failed to cancel photo order: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // APPROVE PHOTO ORDER
    // =========================================================================
    defineTool({
      name: 'approve_photo_order',
      description: 'Approve a completed ProxyPics photo order. This finalizes the order and pays the photographer.',
      category: 'market_data',
      schema: z.object({
        orderId: z.union([z.string(), z.number()]).describe('The ProxyPics order ID to approve'),
      }),
      handler: async (input) => {
        try {
          if (!proxyPicsService.isReady()) {
            return failure('ProxyPics service is not configured.');
          }

          const result = await proxyPicsService.approveOrder(input.orderId);

          if (!result.success) {
            return failure(result.error || 'Failed to approve order');
          }

          return success({
            orderId: input.orderId,
            status: 'fulfilled',
            downloadPhotosUrl: result.order?.downloadPhotosUrl,
            downloadReportUrl: result.order?.downloadReportUrl,
            message: `Photo order #${input.orderId} approved. Photos are now finalized.` +
              (result.order?.downloadPhotosUrl ? ' Download link is available.' : ''),
          });
        } catch (error) {
          return failure(`Failed to approve photo order: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // REJECT PHOTO ORDER
    // =========================================================================
    defineTool({
      name: 'reject_photo_order',
      description: `Reject a completed ProxyPics photo order if photos don't meet requirements.
The order will be reopened for the photographer to retake photos.

Valid rejection reasons:
- wrong_address: Photos are of the wrong property
- poor_quality: Photos are blurry, dark, or poorly framed
- incomplete: Missing required angles or views
- other: Other issue (provide clarification)`,
      category: 'market_data',
      schema: z.object({
        orderId: z.union([z.string(), z.number()]).describe('The ProxyPics order ID to reject'),
        reason: z.enum(['wrong_address', 'poor_quality', 'incomplete', 'other'])
          .describe('Reason for rejection'),
        clarification: z.string().optional().describe('Additional details about the issue'),
      }),
      handler: async (input) => {
        try {
          if (!proxyPicsService.isReady()) {
            return failure('ProxyPics service is not configured.');
          }

          const result = await proxyPicsService.rejectOrder(
            input.orderId,
            input.reason,
            input.clarification
          );

          if (!result.success) {
            return failure(result.error || 'Failed to reject order');
          }

          return success({
            orderId: input.orderId,
            rejected: true,
            reason: input.reason,
            message: `Photo order #${input.orderId} rejected (${input.reason}). ` +
              'The photographer will be notified to retake the photos.',
          });
        } catch (error) {
          return failure(`Failed to reject photo order: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET PHOTO TEMPLATES
    // =========================================================================
    defineTool({
      name: 'get_photo_templates',
      description: `Get available photo request templates (Products) from ProxyPics.
Templates define what photos should be taken (e.g., front exterior, all sides, interior).
Use template tokens when creating orders to specify photo requirements.`,
      category: 'market_data',
      schema: z.object({}),
      handler: async () => {
        try {
          if (!proxyPicsService.isReady()) {
            return failure('ProxyPics service is not configured.');
          }

          const templates = await proxyPicsService.getTemplates();

          return success({
            templates: templates.map(t => ({
              name: t.name,
              token: t.token,
              platform: t.platform,
              tasks: t.tasks.map(task => task.title),
            })),
            message: `Found ${templates.length} photo templates available.`,
          });
        } catch (error) {
          return failure(`Failed to get photo templates: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 60 * 60, // 1 hour cache
    }),

    // =========================================================================
    // SEND PHOTOGRAPHER MESSAGE
    // =========================================================================
    defineTool({
      name: 'send_photographer_message',
      description: 'Send a message/note to the photographer handling a photo order. Useful for providing additional instructions or asking questions.',
      category: 'market_data',
      schema: z.object({
        orderId: z.number().describe('The ProxyPics order ID'),
        message: z.string().describe('Message to send to the photographer'),
      }),
      handler: async (input) => {
        try {
          if (!proxyPicsService.isReady()) {
            return failure('ProxyPics service is not configured.');
          }

          const result = await proxyPicsService.sendMessage(input.orderId, input.message);

          if (!result.success) {
            return failure(result.error || 'Failed to send message');
          }

          return success({
            orderId: input.orderId,
            messageSent: true,
            message: `Message sent to photographer for order #${input.orderId}.`,
          });
        } catch (error) {
          return failure(`Failed to send message: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // EXTEND PHOTO ORDER
    // =========================================================================
    defineTool({
      name: 'extend_photo_order',
      description: 'Extend an expired or expiring photo order with a new deadline.',
      category: 'market_data',
      schema: z.object({
        orderId: z.union([z.string(), z.number()]).describe('The ProxyPics order ID to extend'),
        additionalHours: z.number().default(24).describe('Additional hours to add (default: 24)'),
      }),
      handler: async (input) => {
        try {
          if (!proxyPicsService.isReady()) {
            return failure('ProxyPics service is not configured.');
          }

          const expiresAt = new Date(Date.now() + (input.additionalHours || 24) * 60 * 60 * 1000);
          const result = await proxyPicsService.extendOrder(input.orderId, expiresAt);

          if (!result.success) {
            return failure(result.error || 'Failed to extend order');
          }

          return success({
            orderId: input.orderId,
            newExpiresAt: expiresAt.toISOString(),
            message: `Photo order #${input.orderId} extended until ${expiresAt.toLocaleString()}.`,
          });
        } catch (error) {
          return failure(`Failed to extend photo order: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerProxyPicsTools;
