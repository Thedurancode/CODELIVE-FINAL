/**
 * Deal Intake Service
 *
 * Single entry point for ingesting normalized deals:
 * - Persist to Property
 * - Enqueue processing pipeline
 */

import { NormalizedDeal } from '../plugins/types';
import { dealProcessingQueue } from './DealProcessingQueue';
import { propertyService, BulkSaveResult, SavePropertyResult } from './propertyService';
import Property from '../models/Property';
import { Transaction } from 'sequelize';

export interface DealIntakeOptions {
  allowUpdate?: boolean;
  enrichWithMarketData?: boolean;
  queueProcessing?: boolean;
  enqueueOnUpdate?: boolean;
  sourceId?: string;
  sourceName?: string;
  metadata?: Record<string, any>;
}

export interface BulkDealIntakeOptions extends DealIntakeOptions {
  skipDuplicates?: boolean;
}

class DealIntakeService {
  private getUpdatePolicy(property: Property): { enqueue: boolean; reset: boolean } {
    const state = (property as any).processingState as string | undefined;
    const approvalStatus = (property as any).approvalStatus as string | undefined;

    if (!state || state === 'created') {
      return { enqueue: true, reset: false };
    }

    if (approvalStatus === 'draft' && (state === 'rejected' || state === 'blocked')) {
      return { enqueue: true, reset: true };
    }

    return { enqueue: false, reset: false };
  }

  private buildSourceInfo(deal: NormalizedDeal, options: DealIntakeOptions): {
    sourceId: string;
    sourceName: string;
  } {
    return {
      sourceId: deal.sourceId || options.sourceId || 'intake',
      sourceName: deal.sourceName || options.sourceName || 'Intake',
    };
  }

  private async enqueueProcessing(
    property: Property,
    deal: NormalizedDeal,
    action: SavePropertyResult['action'],
    transaction: Transaction,
    options: DealIntakeOptions
  ): Promise<void> {
    const updatePolicy = this.getUpdatePolicy(property);
    const forceEnqueue = options.enqueueOnUpdate === true;
    const enqueueOnUpdate = forceEnqueue || updatePolicy.enqueue;

    if (action !== 'created' && !(enqueueOnUpdate && action === 'updated')) {
      return;
    }

    const state = (property as any).processingState as string | undefined;
    const approvalStatus = (property as any).approvalStatus as string | undefined;
    const shouldResetState = forceEnqueue
      ? approvalStatus === 'draft' && !!state && state !== 'created'
      : updatePolicy.reset;

    if (action === 'updated' && shouldResetState) {
      await property.update(
        {
          processingState: 'created',
          processingStateUpdatedAt: new Date(),
        },
        { transaction }
      );
    }

    const { sourceId, sourceName } = this.buildSourceInfo(deal, options);

    await dealProcessingQueue.enqueueDeal(property, deal, {
      transaction,
      sourceId,
      sourceName,
      metadata: {
        ...options.metadata,
        intakeAction: action,
      },
    });
  }

  async ingestDeal(deal: NormalizedDeal, options: DealIntakeOptions = {}): Promise<SavePropertyResult> {
    const queueProcessing = options.queueProcessing !== false;

    return propertyService.saveDealToDatabase(deal, {
      allowUpdate: options.allowUpdate,
      enrichWithMarketData: options.enrichWithMarketData,
      onBeforeCommit: queueProcessing
        ? (property, action, transaction) =>
            this.enqueueProcessing(property, deal, action, transaction, options)
        : undefined,
    });
  }

  async bulkIngestDeals(deals: NormalizedDeal[], options: BulkDealIntakeOptions = {}): Promise<BulkSaveResult> {
    const queueProcessing = options.queueProcessing !== false;

    return propertyService.bulkSaveDeals(deals, {
      allowUpdate: options.allowUpdate,
      skipDuplicates: options.skipDuplicates,
      enrichWithMarketData: options.enrichWithMarketData,
      onBeforeCommit: queueProcessing
        ? (deal, property, action, transaction) =>
            this.enqueueProcessing(property, deal, action, transaction, options)
        : undefined,
    });
  }
}

export const dealIntakeService = new DealIntakeService();
export default dealIntakeService;
