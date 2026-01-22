/**
 * Offer Expiration Scheduler
 *
 * Automatically marks offers as 'expired' when their expiresAt date passes.
 * Also notifies buyers when their offers are about to expire.
 *
 * FIX 3: Ensures offers don't remain 'pending' forever after expiration.
 */

import cron from 'node-cron';
import { Op } from 'sequelize';
import DealOffer from '../models/DealOffer';
import MarketplaceUser from '../models/MarketplaceUser';
import { automationEngine } from '../plugins/automation/AutomationEngine';

interface ExpirationConfig {
  // How often to check for expired offers (cron expression)
  checkInterval: string;
  // Hours before expiry to send warning notification
  warningHoursBeforeExpiry: number;
  // Whether to notify buyers of expiration
  notifyBuyers: boolean;
}

interface ExpirationResult {
  expiredCount: number;
  warningsSent: number;
  errors: string[];
}

class OfferExpirationScheduler {
  private task: cron.ScheduledTask | null = null;
  private running: boolean = false;
  private lastRun: Date | null = null;
  private config: ExpirationConfig;

  constructor() {
    this.config = {
      checkInterval: '0 * * * *', // Every hour
      warningHoursBeforeExpiry: 12,
      notifyBuyers: true,
    };
  }

  /**
   * Start the scheduler
   */
  start(cronExpression?: string): void {
    if (this.task) {
      console.log('[OfferExpirationScheduler] Already running');
      return;
    }

    const expression = cronExpression || this.config.checkInterval;

    this.task = cron.schedule(expression, async () => {
      await this.processExpirations();
    });

    this.running = true;
    console.log(`[OfferExpirationScheduler] Started (${expression})`);

    // Run immediately on startup to catch any missed expirations
    this.processExpirations().catch(console.error);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.running = false;
      console.log('[OfferExpirationScheduler] Stopped');
    }
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get last run time
   */
  getLastRun(): Date | null {
    return this.lastRun;
  }

  /**
   * Process all pending expirations
   */
  async processExpirations(): Promise<ExpirationResult> {
    const result: ExpirationResult = {
      expiredCount: 0,
      warningsSent: 0,
      errors: [],
    };

    try {
      console.log('[OfferExpirationScheduler] Processing offer expirations...');

      // 1. Mark expired offers
      result.expiredCount = await this.markExpiredOffers();

      // 2. Send expiry warnings for offers expiring soon
      if (this.config.notifyBuyers) {
        result.warningsSent = await this.sendExpiryWarnings();
      }

      this.lastRun = new Date();

      console.log(
        `[OfferExpirationScheduler] Complete: ${result.expiredCount} expired, ${result.warningsSent} warnings sent`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMsg);
      console.error('[OfferExpirationScheduler] Error:', errorMsg);
    }

    return result;
  }

  /**
   * Mark all past-due offers as expired
   */
  private async markExpiredOffers(): Promise<number> {
    const now = new Date();

    // Find pending offers that have passed their expiration
    const expiredOffers = await DealOffer.findAll({
      where: {
        status: 'pending',
        expiresAt: { [Op.lt]: now },
      },
      include: [
        { model: MarketplaceUser, as: 'user', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (expiredOffers.length === 0) {
      return 0;
    }

    // Update all expired offers
    await DealOffer.update(
      {
        status: 'expired',
        respondedAt: now,
      },
      {
        where: {
          status: 'pending',
          expiresAt: { [Op.lt]: now },
        },
      }
    );

    // Emit events for each expired offer
    for (const offer of expiredOffers) {
      try {
        await automationEngine.emitEvent({
          id: `offer_expired_${offer.id}_${Date.now()}`,
          type: 'offer.expired' as any,
          timestamp: now,
          payload: {
            offerId: offer.id,
            dealId: offer.dealId,
            buyerId: offer.userId,
            buyerName: (offer as any).user?.name,
            buyerEmail: (offer as any).user?.email,
            offerAmount: offer.offerAmount,
            expiredAt: now.toISOString(),
          },
          metadata: {
            dealId: offer.dealId,
            userId: offer.userId,
            sourceId: 'scheduler',
          },
        });
      } catch (error) {
        console.warn(`[OfferExpirationScheduler] Failed to emit event for offer ${offer.id}:`, error);
      }
    }

    console.log(`[OfferExpirationScheduler] Marked ${expiredOffers.length} offers as expired`);
    return expiredOffers.length;
  }

  /**
   * Send warning notifications for offers expiring soon
   */
  private async sendExpiryWarnings(): Promise<number> {
    const now = new Date();
    const warningThreshold = new Date(
      now.getTime() + this.config.warningHoursBeforeExpiry * 60 * 60 * 1000
    );

    // Find pending offers expiring within the warning window
    // But not already notified (we'll track this with a metadata field)
    const soonToExpire = await DealOffer.findAll({
      where: {
        status: 'pending',
        expiresAt: {
          [Op.gt]: now,
          [Op.lt]: warningThreshold,
        },
      },
      include: [
        { model: MarketplaceUser, as: 'user', attributes: ['id', 'name', 'email'] },
      ],
    });

    let warningsSent = 0;

    for (const offer of soonToExpire) {
      // Check if we already sent a warning (stored in metadata or separate table)
      // For simplicity, we'll emit the event and let automation dedup
      try {
        const hoursLeft = Math.round(
          (offer.expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000)
        );

        await automationEngine.emitEvent({
          id: `offer_expiring_${offer.id}_${Date.now()}`,
          type: 'offer.expiring_soon' as any,
          timestamp: now,
          payload: {
            offerId: offer.id,
            dealId: offer.dealId,
            buyerId: offer.userId,
            buyerName: (offer as any).user?.name,
            buyerEmail: (offer as any).user?.email,
            offerAmount: offer.offerAmount,
            expiresAt: offer.expiresAt.toISOString(),
            hoursUntilExpiry: hoursLeft,
          },
          metadata: {
            dealId: offer.dealId,
            userId: offer.userId,
            sourceId: 'scheduler',
          },
        });

        warningsSent++;
      } catch (error) {
        console.warn(`[OfferExpirationScheduler] Failed to send warning for offer ${offer.id}:`, error);
      }
    }

    if (warningsSent > 0) {
      console.log(`[OfferExpirationScheduler] Sent ${warningsSent} expiry warnings`);
    }

    return warningsSent;
  }

  /**
   * Manually trigger expiration check
   */
  async runNow(): Promise<ExpirationResult> {
    return this.processExpirations();
  }

  /**
   * Get status of scheduler
   */
  getStatus(): {
    running: boolean;
    lastRun: Date | null;
    config: ExpirationConfig;
  } {
    return {
      running: this.running,
      lastRun: this.lastRun,
      config: this.config,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ExpirationConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[OfferExpirationScheduler] Config updated:', this.config);
  }
}

export const offerExpirationScheduler = new OfferExpirationScheduler();
export default offerExpirationScheduler;
