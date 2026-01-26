/**
 * Stripe Payment Service
 *
 * Handles payment processing for ProxyPics photo orders
 */

import Stripe from 'stripe';

export interface ProxyPicsPaymentMetadata {
  propertyId: string;
  templateTokens: string[];
  propertyAddress: string;
}

export interface PaymentIntentResponse {
  success: boolean;
  clientSecret?: string;
  error?: string;
  amount?: number;
  currency?: string;
}

class StripeService {
  private stripe: Stripe | null = null;
  private initialized: boolean = false;

  /**
   * Initialize Stripe
   */
  async initialize(): Promise<void> {
    const apiKey = process.env.STRIPE_SECRET_KEY;

    if (apiKey) {
      this.stripe = new Stripe(apiKey, {
        apiVersion: '2024-12-18.acacia',
      });
      this.initialized = true;
      console.log('✅ Stripe Service initialized');
    } else {
      console.log('⚠️  Stripe Service disabled (missing STRIPE_SECRET_KEY)');
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized && !!this.stripe;
  }

  /**
   * Calculate ProxyPics photo order cost
   * Base prices per template type
   */
  private calculateProxyPicsCost(templateTokens: string[]): number {
    const basePrices: Record<string, number> = {
      'exterior-standard': 15.00,
      'full-property': 35.00,
      'drive-by': 10.00,
      'default': 20.00,
    };

    let total = 0;
    for (const token of templateTokens) {
      const price = basePrices[token] || basePrices['default'];
      total += price;
    }

    return total;
  }

  /**
   * Create payment intent for ProxyPics order
   */
  async createProxyPicsPaymentIntent(
    propertyId: string,
    templateTokens: string[],
    propertyAddress: string
  ): Promise<PaymentIntentResponse> {
    if (!this.isReady() || !this.stripe) {
      return {
        success: false,
        error: 'Stripe service not configured',
      };
    }

    try {
      // Calculate amount (in cents)
      const amountInDollars = this.calculateProxyPicsCost(templateTokens);
      const amount = Math.round(amountInDollars * 100);

      // Create payment intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        metadata: {
          propertyId,
          templateTokens: templateTokens.join(','),
          propertyAddress,
          service: 'proxypics',
        },
        description: `ProxyPics Photo Order - ${propertyAddress}`,
      });

      return {
        success: true,
        clientSecret: paymentIntent.client_secret || undefined,
        amount: amountInDollars,
        currency: 'usd',
      };
    } catch (error) {
      console.error('Stripe payment intent creation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment intent creation failed',
      };
    }
  }

  /**
   * Verify payment was successful
   */
  async verifyPayment(paymentIntentId: string): Promise<{
    success: boolean;
    paid: boolean;
    amount?: number;
    metadata?: ProxyPicsPaymentMetadata;
    error?: string;
  }> {
    if (!this.isReady() || !this.stripe) {
      return {
        success: false,
        paid: false,
        error: 'Stripe service not configured',
      };
    }

    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      const metadata: ProxyPicsPaymentMetadata = {
        propertyId: paymentIntent.metadata.propertyId,
        templateTokens: paymentIntent.metadata.templateTokens.split(','),
        propertyAddress: paymentIntent.metadata.propertyAddress,
      };

      return {
        success: true,
        paid: paymentIntent.status === 'succeeded',
        amount: paymentIntent.amount / 100, // Convert cents to dollars
        metadata,
      };
    } catch (error) {
      console.error('Stripe payment verification failed:', error);
      return {
        success: false,
        paid: false,
        error: error instanceof Error ? error.message : 'Payment verification failed',
      };
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<{
    success: boolean;
    event?: Stripe.Event;
    error?: string;
  }> {
    if (!this.isReady() || !this.stripe) {
      return {
        success: false,
        error: 'Stripe service not configured',
      };
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return {
        success: false,
        error: 'Webhook secret not configured',
      };
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );

      console.log(`💳 Stripe webhook received: ${event.type}`);

      return {
        success: true,
        event,
      };
    } catch (error) {
      console.error('Stripe webhook verification failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Webhook verification failed',
      };
    }
  }

  /**
   * Create refund for a payment
   */
  async createRefund(paymentIntentId: string, reason?: string): Promise<{
    success: boolean;
    refund?: Stripe.Refund;
    error?: string;
  }> {
    if (!this.isReady() || !this.stripe) {
      return {
        success: false,
        error: 'Stripe service not configured',
      };
    }

    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: reason as Stripe.RefundCreateParams.Reason | undefined,
      });

      console.log(`💳 Refund created: ${refund.id} for ${paymentIntentId}`);

      return {
        success: true,
        refund,
      };
    } catch (error) {
      console.error('Stripe refund creation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Refund creation failed',
      };
    }
  }
}

// Singleton instance
export const stripeService = new StripeService();
export default stripeService;
