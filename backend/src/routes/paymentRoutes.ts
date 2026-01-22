/**
 * Payment API Routes (Stripe)
 *
 * Handles payment processing for services like ProxyPics photo orders
 */

import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authenticate, requireAdmin } from '../middleware/auth';
import { stripeService } from '../services/StripeService';
import { proxyPicsService } from '../services/ProxyPicsService';
import Property from '../models/Property';
import { Resend } from 'resend';

const router = Router();

// Initialize Resend for email receipts
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Send payment receipt email
 */
async function sendPaymentReceipt(
  userEmail: string,
  userName: string,
  paymentIntentId: string,
  amount: number,
  propertyAddress: string,
  templateTokens: string[],
  orderIds: string[]
): Promise<void> {
  if (!resend) {
    console.log('📧 Email service not configured, skipping payment receipt');
    return;
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Dispotree <noreply@dispotree.com>';

  const templateNames: Record<string, string> = {
    'exterior-standard': 'Exterior Standard Photos',
    'full-property': 'Full Property Photos',
    'drive-by': 'Drive-By Photos',
  };

  const templatesHtml = templateTokens
    .map(token => {
      const name = templateNames[token] || token;
      return `<li style="padding: 8px 0; color: #374151;">${name}</li>`;
    })
    .join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold; color: white; margin-bottom: 10px;">
          🌳 DISPOTREE
        </div>
        <h1 style="color: white; margin: 0; font-size: 24px;">📸 Payment Receipt</h1>
      </div>

      <div style="padding: 30px; background: #f9fafb;">
        <p style="font-size: 16px; color: #374151;">Hi ${userName},</p>
        <p style="font-size: 16px; color: #374151;">Thank you for your payment! Your professional photo order has been placed.</p>

        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <h3 style="margin: 0 0 15px 0; color: #111827;">Order Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Property:</td>
              <td style="padding: 6px 0; color: #111827; font-weight: bold;">${propertyAddress}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Amount Paid:</td>
              <td style="padding: 6px 0; color: #22c55e; font-weight: bold; font-size: 18px;">$${amount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Payment ID:</td>
              <td style="padding: 6px 0; color: #6b7280; font-family: monospace; font-size: 12px;">${paymentIntentId}</td>
            </tr>
          </table>
        </div>

        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <h3 style="margin: 0 0 10px 0; color: #111827;">Photo Templates Ordered</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            ${templatesHtml}
          </ul>
        </div>

        <div style="background: #ecfdf5; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #22c55e;">
          <p style="margin: 0; color: #065f46; font-size: 14px;">
            <strong>What's Next?</strong><br/>
            A photographer will be assigned to your property within 24-48 hours. You'll receive an update when photos are ready for download.
          </p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="${frontendUrl}/dashboard/deals" style="background: #22c55e; color: white; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">View Your Properties</a>
        </div>
      </div>

      <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
        <p>Dispotree - Real Estate Deal Management</p>
        <p>Questions? <a href="mailto:support@dispotree.com" style="color: #9ca3af;">Contact Support</a></p>
      </div>
    </div>
  `;

  try {
    await resend.emails.send({
      from: fromEmail,
      to: [userEmail],
      subject: `📸 Payment Receipt - Professional Photos for ${propertyAddress}`,
      html,
    });

    console.log(`📧 Payment receipt sent to ${userEmail} for $${amount.toFixed(2)}`);
  } catch (error) {
    console.error('Failed to send payment receipt email:', error);
  }
}

// Webhook endpoint (no auth required - verified by Stripe signature)
router.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    return res.status(400).json({
      success: false,
      error: 'Missing stripe-signature header',
    });
  }

  try {
    // Raw body is needed for webhook verification
    const payload = req.body;

    const result = await stripeService.handleWebhook(payload, signature);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    // Handle different event types
    const event = result.event!;

    switch (event.type) {
      case 'payment_intent.succeeded':
        console.log(`💳 Payment succeeded: ${event.data.object.id}`);
        // ProxyPics orders are processed after payment confirmation
        // The frontend will call the order endpoint with the payment intent ID
        break;

      case 'payment_intent.payment_failed':
        console.log(`💳 Payment failed: ${event.data.object.id}`);
        break;

      default:
        console.log(`💳 Unhandled event type: ${event.type}`);
    }

    res.json({ success: true, received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed',
    });
  }
});

// All other routes require authentication
router.use(authenticate);

/**
 * POST /api/payments/create-intent/proxypics
 * Create payment intent for ProxyPics photo order
 */
router.post('/create-intent/proxypics', async (req: Request, res: Response) => {
  try {
    if (!stripeService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Payment service not configured',
        message: 'Set STRIPE_SECRET_KEY environment variable',
      });
    }

    const { propertyId, templateTokens } = req.body;

    if (!propertyId || !templateTokens || !Array.isArray(templateTokens) || templateTokens.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'propertyId and templateTokens (array) are required',
      });
    }

    // Get property details
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    // Build address string
    const propAddress = property.get('address') as any;
    const propertyAddress = `${propAddress?.street || `${propAddress?.houseNumber || ''} ${propAddress?.streetName || ''}`.trim()}, ${property.get('city')}, ${property.get('state')} ${property.get('zip')}`;

    // Create payment intent
    const result = await stripeService.createProxyPicsPaymentIntent(
      propertyId,
      templateTokens,
      propertyAddress
    );

    if (result.success) {
      res.json({
        success: true,
        data: {
          clientSecret: result.clientSecret,
          amount: result.amount,
          currency: result.currency,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment intent',
    });
  }
});

/**
 * POST /api/payments/confirm-and-order/proxypics
 * Verify payment and create ProxyPics order
 */
router.post('/confirm-and-order/proxypics', async (req: Request, res: Response) => {
  try {
    if (!stripeService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Payment service not configured',
      });
    }

    if (!proxyPicsService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'ProxyPics service not configured',
      });
    }

    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'paymentIntentId is required',
      });
    }

    // Verify payment
    const verifyResult = await stripeService.verifyPayment(paymentIntentId);

    if (!verifyResult.success) {
      return res.status(400).json({
        success: false,
        error: verifyResult.error || 'Payment verification failed',
      });
    }

    if (!verifyResult.paid) {
      return res.status(400).json({
        success: false,
        error: 'Payment not completed',
      });
    }

    const metadata = verifyResult.metadata!;

    // Get property
    const property = await Property.findByPk(metadata.propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    // Build address
    const propAddress = property.get('address') as any;
    const orderAddress = {
      street: propAddress?.street || `${propAddress?.houseNumber || ''} ${propAddress?.streetName || ''}`.trim(),
      city: property.get('city') as string,
      state: property.get('state') as string,
      zip: property.get('zip') as string,
    };

    // Place orders for each template
    const results = await Promise.all(
      metadata.templateTokens.map(async (templateToken) => {
        return await proxyPicsService.orderPhotos({
          address: orderAddress,
          templateToken,
          platform: 'crowdsource',
          externalId: `property-${metadata.propertyId}`,
        });
      })
    );

    const successCount = results.filter(r => r.success).length;
    const lastSuccess = results.find(r => r.success);

    if (successCount > 0) {
      // Update property with order info
      if (lastSuccess?.order) {
        const existingMeta = (property.get('marketDataEnrichment') as any) || {};
        await property.update({
          marketDataEnrichment: {
            ...existingMeta,
            proxyPicsOrderId: lastSuccess.order.orderId,
            proxyPicsOrderStatus: lastSuccess.order.status,
            proxyPicsOrderedAt: new Date().toISOString(),
            proxyPicsPaymentIntentId: paymentIntentId,
          },
        });
      }

      // Send payment receipt email
      if (req.user) {
        const orderIds = results.filter(r => r.success && r.order).map(r => r.order!.orderId);
        const propertyAddress = `${orderAddress.street}, ${orderAddress.city}, ${orderAddress.state} ${orderAddress.zip}`;

        sendPaymentReceipt(
          req.user.email,
          req.user.name,
          paymentIntentId,
          verifyResult.amount || 0,
          propertyAddress,
          metadata.templateTokens,
          orderIds
        ).catch(err => console.error('Failed to send payment receipt:', err));
      }

      res.json({
        success: true,
        data: {
          ordersPlaced: successCount,
          order: lastSuccess?.order,
        },
        message: `${successCount} photo order(s) placed successfully!`,
      });
    } else {
      // Payment succeeded but order failed - create automatic refund
      console.error('Payment succeeded but ProxyPics order failed:', results);

      try {
        const refundResult = await stripeService.createRefund(
          paymentIntentId,
          'requested_by_customer'
        );

        if (refundResult.success) {
          console.log(`✅ Automatic refund created: ${refundResult.refund!.id} for failed order`);
          res.status(500).json({
            success: false,
            error: 'Photo order failed after payment.',
            message: 'Your payment has been automatically refunded. Please try again or contact support.',
            refunded: true,
            refundId: refundResult.refund!.id,
          });
        } else {
          console.error('Failed to create automatic refund:', refundResult.error);
          res.status(500).json({
            success: false,
            error: 'Photo order failed after payment.',
            message: 'Please contact support for a refund. Reference: ' + paymentIntentId,
            refunded: false,
          });
        }
      } catch (refundError) {
        console.error('Error creating automatic refund:', refundError);
        res.status(500).json({
          success: false,
          error: 'Photo order failed after payment.',
          message: 'Please contact support for a refund. Reference: ' + paymentIntentId,
          refunded: false,
        });
      }
    }
  } catch (error) {
    console.error('Confirm and order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process order',
    });
  }
});

/**
 * POST /api/payments/refund/:paymentIntentId
 * Create refund for a payment
 */
router.post('/refund/:paymentIntentId', async (req: Request, res: Response) => {
  try {
    if (!stripeService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Payment service not configured',
      });
    }

    const { paymentIntentId } = req.params;
    const { reason } = req.body;

    const result = await stripeService.createRefund(paymentIntentId, reason);

    if (result.success) {
      res.json({
        success: true,
        data: {
          refundId: result.refund!.id,
          amount: result.refund!.amount,
          status: result.refund!.status,
        },
        message: 'Refund created successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Create refund error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create refund',
    });
  }
});

/**
 * GET /api/payments/orders/proxypics
 * List all ProxyPics orders (admin only)
 */
router.get('/orders/proxypics', requireAdmin, async (req: Request, res: Response) => {
  try {
    // Get properties with ProxyPics order metadata
    const properties = await Property.findAll({
      where: {
        marketDataEnrichment: {
          proxyPicsOrderId: {
            [Op.ne]: null,
          },
        },
      },
      attributes: [
        'id',
        'address',
        'city',
        'state',
        'zip',
        'marketDataEnrichment',
        'createdAt',
        'updatedAt',
      ],
      order: [['updatedAt', 'DESC']],
    });

    // Extract order information from properties
    const orders = properties.map(property => {
      const enrichment = property.get('marketDataEnrichment') as any;
      const address = property.get('address') as any;

      return {
        id: enrichment.proxyPicsOrderId,
        orderId: enrichment.proxyPicsOrderId,
        propertyId: property.get('id'),
        status: enrichment.proxyPicsOrderStatus || 'unknown',
        address: `${address?.street || `${address?.houseNumber || ''} ${address?.streetName || ''}`.trim()}, ${property.get('city')}, ${property.get('state')} ${property.get('zip')}`,
        paymentIntentId: enrichment.proxyPicsPaymentIntentId,
        orderedAt: enrichment.proxyPicsOrderedAt,
        updatedAt: property.get('updatedAt'),
      };
    });

    res.json({
      success: true,
      data: orders,
      count: orders.length,
    });
  } catch (error) {
    console.error('List ProxyPics orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ProxyPics orders',
    });
  }
});

export default router;
