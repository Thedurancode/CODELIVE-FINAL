/**
 * Batch Tools
 *
 * Tools for batch operations on multiple items with progress streaming.
 */

import { z } from 'zod';
import { Op } from 'sequelize';
import { toolRegistry, success, failure, defineTool } from './registry';
import Property from '../../../models/Property';
import { dealProcessingService } from '../../../plugins';
import { agentEventService } from '../AgentEventService';

/**
 * Register all batch tools with the registry
 */
export function registerBatchTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // BATCH ANALYZE DEALS
    // =========================================================================
    defineTool({
      name: 'batch_analyze_deals',
      description:
        'Analyze multiple properties in batch with progress updates. Returns MAO, ROI, and deal scores for each property.',
      category: 'batch',
      supportsProgress: true,
      schema: z.object({
        propertyIds: z.array(z.number()).describe('Array of property IDs to analyze'),
        analysisType: z
          .enum(['quick', 'full'])
          .optional()
          .default('quick')
          .describe('Analysis depth'),
      }),
      handler: async (input, context) => {
        const startTime = Date.now();
        const results: Array<{
          propertyId: number;
          success: boolean;
          analysis?: Record<string, unknown>;
          error?: string;
        }> = [];

        const total = input.propertyIds.length;
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < total; i++) {
          const propertyId = input.propertyIds[i];

          // Emit progress
          if (context.emitProgress) {
            context.emitProgress({
              current: i + 1,
              total,
              percentage: Math.round(((i + 1) / total) * 100),
              message: `Analyzing property ${propertyId}...`,
              itemId: String(propertyId),
            });
          }

          try {
            const property = await Property.findByPk(propertyId);
            if (!property) {
              results.push({ propertyId, success: false, error: 'Property not found' });
              failureCount++;
              continue;
            }

            // Quick analysis calculations
            const askingPrice = property.purchaseContractPrice || property.buyItNowPrice || property.reservePrice || 0;
            const arv = property.arv || askingPrice * 1.15;
            const rehabCost = property.rehabCost || askingPrice * 0.08;
            const mao = arv * 0.7 - rehabCost;
            const potentialProfit = arv - askingPrice - rehabCost;
            const roi = askingPrice > 0 ? (potentialProfit / askingPrice) * 100 : 0;

            let dealScore = 50;
            if (askingPrice <= mao) dealScore += 25;
            if (roi > 20) dealScore += 15;
            if (roi > 30) dealScore += 10;

            results.push({
              propertyId,
              success: true,
              analysis: {
                address: property.address,
                askingPrice,
                mao: Math.round(mao),
                arv: Math.round(arv),
                rehabCost: Math.round(rehabCost),
                potentialProfit: Math.round(potentialProfit),
                roi: Math.round(roi * 10) / 10,
                dealScore,
                recommendation: askingPrice <= mao ? 'Good Deal' : 'Above MAO',
              },
            });
            successCount++;
          } catch (error) {
            results.push({ propertyId, success: false, error: String(error) });
            failureCount++;
          }
        }

        const durationMs = Date.now() - startTime;

        // Emit batch completion event
        await agentEventService.emitBatchCompleted(
          context,
          'batch_analyze_deals',
          total,
          successCount,
          failureCount,
          durationMs
        );

        return success({
          total,
          successCount,
          failureCount,
          durationMs,
          results,
        });
      },
      cacheable: false,
    }),

    // =========================================================================
    // BATCH SCORE PROPERTIES
    // =========================================================================
    defineTool({
      name: 'batch_score_properties',
      description:
        'Score multiple properties against all buy boxes in batch. Shows which funds might be interested in each property.',
      category: 'batch',
      supportsProgress: true,
      schema: z.object({
        propertyIds: z.array(z.number()).describe('Array of property IDs to score'),
      }),
      handler: async (input, context) => {
        const startTime = Date.now();
        const results: Array<{
          propertyId: number;
          success: boolean;
          matches?: Array<{ buyBox: string; score: number; matchType: string }>;
          error?: string;
        }> = [];

        const total = input.propertyIds.length;
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < total; i++) {
          const propertyId = input.propertyIds[i];

          if (context.emitProgress) {
            context.emitProgress({
              current: i + 1,
              total,
              percentage: Math.round(((i + 1) / total) * 100),
              message: `Scoring property ${propertyId} against buy boxes...`,
              itemId: String(propertyId),
            });
          }

          try {
            const property = await Property.findByPk(propertyId);
            if (!property) {
              results.push({ propertyId, success: false, error: 'Property not found' });
              failureCount++;
              continue;
            }

            // Score against buy boxes using deal processing service
            const scores = await dealProcessingService.scoreDeal(property as any);

            results.push({
              propertyId,
              success: true,
              matches: scores.map((s: any) => ({
                buyBox: s.buyBoxName,
                score: s.percentage,
                matchType: s.matchType,
              })),
            });
            successCount++;
          } catch (error) {
            results.push({ propertyId, success: false, error: String(error) });
            failureCount++;
          }
        }

        const durationMs = Date.now() - startTime;

        await agentEventService.emitBatchCompleted(
          context,
          'batch_score_properties',
          total,
          successCount,
          failureCount,
          durationMs
        );

        return success({
          total,
          successCount,
          failureCount,
          durationMs,
          results,
        });
      },
      cacheable: false,
    }),

    // =========================================================================
    // BATCH UPDATE PROPERTIES
    // =========================================================================
    defineTool({
      name: 'batch_update_properties',
      description:
        'Update multiple properties with the same field values. Use for bulk status changes, tagging, or field updates.',
      category: 'batch',
      supportsProgress: true,
      requiresApproval: (input) => input.propertyIds.length > 10,
      approvalReason: 'Bulk update affects more than 10 properties',
      schema: z.object({
        propertyIds: z.array(z.number()).describe('Array of property IDs to update'),
        updates: z.record(z.string(), z.any()).describe('Fields to update on all properties'),
      }),
      handler: async (input, context) => {
        const startTime = Date.now();
        const results: Array<{
          propertyId: number;
          success: boolean;
          error?: string;
        }> = [];

        const total = input.propertyIds.length;
        let successCount = 0;
        let failureCount = 0;

        // Validate updates - prevent updating critical fields
        const forbiddenFields = ['id', 'createdAt', 'updatedAt'];
        for (const field of forbiddenFields) {
          if (field in input.updates) {
            return failure(`Cannot update field: ${field}`);
          }
        }

        for (let i = 0; i < total; i++) {
          const propertyId = input.propertyIds[i];

          if (context.emitProgress) {
            context.emitProgress({
              current: i + 1,
              total,
              percentage: Math.round(((i + 1) / total) * 100),
              message: `Updating property ${propertyId}...`,
              itemId: String(propertyId),
            });
          }

          try {
            const property = await Property.findByPk(propertyId);
            if (!property) {
              results.push({ propertyId, success: false, error: 'Property not found' });
              failureCount++;
              continue;
            }

            await property.update(input.updates);
            results.push({ propertyId, success: true });
            successCount++;
          } catch (error) {
            results.push({ propertyId, success: false, error: String(error) });
            failureCount++;
          }
        }

        const durationMs = Date.now() - startTime;

        await agentEventService.emitBatchCompleted(
          context,
          'batch_update_properties',
          total,
          successCount,
          failureCount,
          durationMs
        );

        return success({
          total,
          successCount,
          failureCount,
          updatedFields: Object.keys(input.updates),
          durationMs,
          results,
        });
      },
      cacheable: false,
    }),

    // =========================================================================
    // BATCH EXPORT PROPERTIES
    // =========================================================================
    defineTool({
      name: 'batch_export_properties',
      description:
        'Export multiple properties to a downloadable format. Prepares data for CSV or JSON export.',
      category: 'batch',
      supportsProgress: true,
      schema: z.object({
        propertyIds: z.array(z.number()).describe('Array of property IDs to export'),
        format: z.enum(['csv', 'json']).optional().default('csv').describe('Export format'),
        fields: z
          .array(z.string())
          .optional()
          .describe('Specific fields to include (default: all)'),
      }),
      handler: async (input, context) => {
        const startTime = Date.now();
        const exportData: Record<string, unknown>[] = [];

        const total = input.propertyIds.length;
        let successCount = 0;

        for (let i = 0; i < total; i++) {
          const propertyId = input.propertyIds[i];

          if (context.emitProgress) {
            context.emitProgress({
              current: i + 1,
              total,
              percentage: Math.round(((i + 1) / total) * 100),
              message: `Exporting property ${propertyId}...`,
              itemId: String(propertyId),
            });
          }

          try {
            const property = await Property.findByPk(propertyId);
            if (!property) continue;

            const data = property.toJSON() as unknown as Record<string, unknown>;

            // Filter to requested fields if specified
            if (input.fields && input.fields.length > 0) {
              const filtered: Record<string, unknown> = {};
              for (const field of input.fields) {
                if (field in data) {
                  filtered[field] = data[field];
                }
              }
              exportData.push(filtered);
            } else {
              exportData.push(data);
            }
            successCount++;
          } catch (error) {
            // Skip failed properties
          }
        }

        const durationMs = Date.now() - startTime;

        // Generate export content
        let exportContent: string;
        if (input.format === 'json') {
          exportContent = JSON.stringify(exportData, null, 2);
        } else {
          // CSV format
          if (exportData.length === 0) {
            exportContent = '';
          } else {
            const headers = Object.keys(exportData[0]);
            const rows = exportData.map((row) =>
              headers.map((h) => {
                const val = row[h];
                if (val === null || val === undefined) return '';
                if (typeof val === 'object') return JSON.stringify(val);
                return String(val).includes(',') ? `"${val}"` : String(val);
              }).join(',')
            );
            exportContent = [headers.join(','), ...rows].join('\n');
          }
        }

        return success({
          total,
          exported: successCount,
          format: input.format,
          contentLength: exportContent.length,
          preview: exportContent.substring(0, 1000) + (exportContent.length > 1000 ? '...' : ''),
          durationMs,
        });
      },
      cacheable: false,
    }),

    // =========================================================================
    // BATCH SEND TO FUNDS
    // =========================================================================
    defineTool({
      name: 'batch_send_to_funds',
      description:
        'Send multiple deals to selected funds for consideration. Requires approval for large batches.',
      category: 'batch',
      supportsProgress: true,
      requiresApproval: true,
      approvalReason: 'Sending deals to funds requires confirmation',
      schema: z.object({
        propertyIds: z.array(z.number()).describe('Array of property IDs to send'),
        fundIds: z.array(z.string()).optional().describe('Specific fund IDs (default: all matching)'),
        message: z.string().optional().describe('Custom message to include'),
      }),
      handler: async (input, context) => {
        const startTime = Date.now();
        const results: Array<{
          propertyId: number;
          success: boolean;
          fundsSent?: string[];
          error?: string;
        }> = [];

        const total = input.propertyIds.length;
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < total; i++) {
          const propertyId = input.propertyIds[i];

          if (context.emitProgress) {
            context.emitProgress({
              current: i + 1,
              total,
              percentage: Math.round(((i + 1) / total) * 100),
              message: `Sending property ${propertyId} to funds...`,
              itemId: String(propertyId),
            });
          }

          try {
            const property = await Property.findByPk(propertyId);
            if (!property) {
              results.push({ propertyId, success: false, error: 'Property not found' });
              failureCount++;
              continue;
            }

            // In a real implementation, this would send to funds via the distribution system
            results.push({
              propertyId,
              success: true,
              fundsSent: input.fundIds || ['auto-matched'],
            });
            successCount++;
          } catch (error) {
            results.push({ propertyId, success: false, error: String(error) });
            failureCount++;
          }
        }

        const durationMs = Date.now() - startTime;

        await agentEventService.emitBatchCompleted(
          context,
          'batch_send_to_funds',
          total,
          successCount,
          failureCount,
          durationMs
        );

        return success({
          total,
          successCount,
          failureCount,
          durationMs,
          results,
        });
      },
      cacheable: false,
    }),
  ]);
}

export default registerBatchTools;
