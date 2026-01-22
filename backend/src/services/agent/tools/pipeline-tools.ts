/**
 * Pipeline & Portfolio Tools
 *
 * Tools for managing deal pipelines and investment portfolios.
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import { pipelineService } from '../../PipelineService';
import { portfolioService } from '../../PortfolioService';
import { createPipelineCard, createChart, PipelineCardData } from '../ui-components';

// Pipeline stages enum
const PIPELINE_STAGES = [
  'new',
  'analyzing',
  'due_diligence',
  'offered',
  'negotiating',
  'under_contract',
  'closed_won',
  'closed_lost',
] as const;

// Portfolio status enum
const PORTFOLIO_STATUSES = [
  'holding',
  'renting',
  'renovating',
  'listed_for_sale',
  'sold',
] as const;

/**
 * Get suggested next actions based on pipeline stage
 */
function getNextActionsForStage(stage: string): string[] {
  switch (stage) {
    case 'new':
      return ['Run deal analysis', 'Enrich with market data', 'Score against buy boxes'];
    case 'analyzing':
      return ['Complete analysis', 'Move to due diligence', 'Send to matching funds'];
    case 'due_diligence':
      return ['Order inspection', 'Verify title', 'Make offer'];
    case 'offered':
      return ['Follow up with seller', 'Negotiate terms', 'Increase offer'];
    case 'negotiating':
      return ['Review counter', 'Accept terms', 'Walk away'];
    case 'under_contract':
      return ['Schedule closing', 'Complete inspections', 'Arrange financing'];
    default:
      return [];
  }
}

/**
 * Register all pipeline and portfolio tools with the registry
 */
export function registerPipelineTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // ADD TO PIPELINE
    // =========================================================================
    defineTool({
      name: 'add_to_pipeline',
      description:
        "Add a deal to the user's pipeline for tracking. Use when user wants to track or follow up on a property.",
      category: 'pipeline',
      schema: z.object({
        userId: z.string().describe('The user ID'),
        dealId: z.string().describe('The deal/property ID to add'),
        stage: z
          .enum(['new', 'analyzing', 'due_diligence', 'offered', 'negotiating', 'under_contract'])
          .optional()
          .describe('Initial pipeline stage'),
        notes: z.string().optional().describe('Notes about the deal'),
      }),
      handler: async (input, context) => {
        try {
          const pipeline = await pipelineService.addToPipeline(input.userId, input.dealId, {
            stage: (input.stage as any) || 'new',
            notes: input.notes,
            triggeredBy: 'agent',
          });

          return success({
            pipelineId: pipeline.id,
            dealId: pipeline.dealId,
            stage: pipeline.stage,
            message: `Deal ${input.dealId} added to your pipeline at stage "${pipeline.stage}"`,
          });
        } catch (error) {
          return failure(`Error adding to pipeline: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // UPDATE PIPELINE STAGE
    // =========================================================================
    defineTool({
      name: 'update_pipeline_stage',
      description: 'Move a deal to a new stage in the pipeline. Use when user updates deal progress.',
      category: 'pipeline',
      schema: z.object({
        pipelineId: z.string().describe('The pipeline item ID'),
        stage: z
          .enum(PIPELINE_STAGES)
          .describe('New stage'),
        notes: z.string().optional().describe('Notes about the stage change'),
      }),
      handler: async (input, context) => {
        try {
          const pipeline = await pipelineService.updateStage(input.pipelineId, input.stage as any, {
            notes: input.notes,
            triggeredBy: 'agent',
          });

          return success({
            pipelineId: pipeline.id,
            previousStage: pipeline.stageHistory[pipeline.stageHistory.length - 2]?.stage,
            newStage: pipeline.stage,
            daysInPipeline: pipeline.getDaysInPipeline(),
            message: `Pipeline updated to "${pipeline.stage}"`,
          });
        } catch (error) {
          return failure(`Error updating pipeline stage: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET MY PIPELINE
    // =========================================================================
    defineTool({
      name: 'get_my_pipeline',
      description: "Get the user's current deal pipeline with all active deals and their stages.",
      category: 'pipeline',
      schema: z.object({
        userId: z.string().describe('The user ID'),
        stage: z.enum(PIPELINE_STAGES).optional().describe('Filter by stage'),
        includeCompleted: z.boolean().optional().default(false).describe('Include closed deals'),
      }),
      handler: async (input, context) => {
        try {
          const result = await pipelineService.getUserPipeline(input.userId, {
            stage: input.stage as any,
            includeCompleted: input.includeCompleted,
          });

          const summary = result.items.map((p: any) => ({
            pipelineId: p.id,
            dealId: p.dealId,
            stage: p.stage,
            daysInPipeline: p.getDaysInPipeline?.() || 0,
            outcome: p.outcome,
            enteredAt: p.stageHistory?.[0]?.enteredAt,
          }));

          const stages = {
            new: summary.filter((d: any) => d.stage === 'new').length,
            analyzing: summary.filter((d: any) => d.stage === 'analyzing').length,
            due_diligence: summary.filter((d: any) => d.stage === 'due_diligence').length,
            offered: summary.filter((d: any) => d.stage === 'offered').length,
            negotiating: summary.filter((d: any) => d.stage === 'negotiating').length,
            under_contract: summary.filter((d: any) => d.stage === 'under_contract').length,
          };

          // Create UI components for visualization
          const uiComponents: string[] = [];

          // Add pipeline cards for each deal (up to 5)
          const topDeals = result.items.slice(0, 5);
          for (const p of topDeals) {
            const pipelineData: PipelineCardData = {
              propertyId: p.dealId,
              propertyAddress: p.property?.address || `Deal ${p.dealId}`,
              currentStage: p.stage as PipelineCardData['currentStage'],
              daysInStage: p.getDaysInPipeline?.() || 0,
              nextActions: getNextActionsForStage(p.stage),
            };
            uiComponents.push(createPipelineCard(pipelineData));
          }

          // Add a chart showing stage distribution
          const chartData = createChart({
            type: 'bar',
            title: 'Pipeline by Stage',
            data: [
              { label: 'New', value: stages.new, color: '#3b82f6' },
              { label: 'Analyzing', value: stages.analyzing, color: '#8b5cf6' },
              { label: 'Due Diligence', value: stages.due_diligence, color: '#f59e0b' },
              { label: 'Offered', value: stages.offered, color: '#10b981' },
              { label: 'Negotiating', value: stages.negotiating, color: '#06b6d4' },
              { label: 'Under Contract', value: stages.under_contract, color: '#22c55e' },
            ],
            showLegend: false,
          });
          uiComponents.push(chartData);

          return success(
            {
              totalDeals: result.total,
              deals: summary,
              stages,
            },
            `Found ${result.total} deals in your pipeline`,
            { uiComponents }
          );
        } catch (error) {
          return failure(`Error getting pipeline: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // CLOSE DEAL
    // =========================================================================
    defineTool({
      name: 'close_deal',
      description:
        'Mark a deal as closed (won, lost, or withdrawn). Use when user closes or loses a deal.',
      category: 'pipeline',
      schema: z.object({
        pipelineId: z.string().describe('The pipeline item ID'),
        outcome: z.enum(['won', 'lost', 'withdrawn']).describe('Deal outcome'),
        closePrice: z.number().optional().describe('Final close price (for won deals)'),
        reason: z.string().optional().describe('Reason for loss or withdrawal'),
      }),
      handler: async (input, context) => {
        try {
          const pipeline = await pipelineService.markAsClosed(input.pipelineId, input.outcome as any, {
            closePrice: input.closePrice,
            reason: input.reason,
          });

          return success({
            pipelineId: pipeline.id,
            outcome: pipeline.outcome,
            closePrice: pipeline.closePrice,
            daysToClose: pipeline.getDaysInPipeline?.() || 0,
            message:
              input.outcome === 'won'
                ? `Congratulations! Deal closed for $${input.closePrice?.toLocaleString() || 'N/A'}`
                : `Deal marked as ${input.outcome}${input.reason ? `: ${input.reason}` : ''}`,
          });
        } catch (error) {
          return failure(`Error closing deal: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // ADD TO PORTFOLIO
    // =========================================================================
    defineTool({
      name: 'add_to_portfolio',
      description:
        "Add a property to the user's portfolio for tracking investments. Can move from pipeline or add directly.",
      category: 'portfolio',
      schema: z.object({
        userId: z.string().describe('The user ID'),
        address: z.string().optional().describe('Property address (if adding directly)'),
        city: z.string().optional().describe('City'),
        state: z.string().optional().describe('State'),
        propertyType: z.string().optional().describe('Property type'),
        acquisitionDate: z.string().optional().describe('Date acquired (ISO format)'),
        acquisitionPrice: z.number().describe('Purchase price'),
        totalInvested: z.number().optional().describe('Total investment including rehab'),
        monthlyRent: z.number().optional().describe('Monthly rental income'),
        monthlyExpenses: z.number().optional().describe('Monthly expenses'),
        pipelineId: z.string().optional().describe('Pipeline ID if moving from pipeline'),
      }),
      handler: async (input, context) => {
        try {
          let portfolio;

          if (input.pipelineId) {
            // Move from pipeline to portfolio
            portfolio = await pipelineService.moveToPortfolio(input.pipelineId, {
              acquisitionPrice: input.acquisitionPrice,
              closingCosts: (input.totalInvested || input.acquisitionPrice) - input.acquisitionPrice,
              monthlyRent: input.monthlyRent,
              monthlyExpenses: input.monthlyExpenses,
            });
          } else {
            // Direct add to portfolio
            portfolio = await portfolioService.addProperty(input.userId, {
              address: input.address || 'Unknown',
              city: input.city || 'Unknown',
              state: input.state || 'Unknown',
              propertyType: input.propertyType || 'Single Family',
              acquisitionDate: input.acquisitionDate ? new Date(input.acquisitionDate) : new Date(),
              acquisitionPrice: input.acquisitionPrice,
              totalInvested: input.totalInvested || input.acquisitionPrice,
              monthlyRent: input.monthlyRent || 0,
              monthlyExpenses: input.monthlyExpenses || 0,
            } as any);
          }

          return success({
            portfolioId: portfolio.id,
            address: `${portfolio.address}, ${portfolio.city}, ${portfolio.state}`,
            acquisitionPrice: portfolio.acquisitionPrice,
            currentValue: portfolio.currentValue,
            equity: portfolio.equity,
            cashFlow: portfolio.monthlyCashFlow,
            message: 'Property added to your portfolio!',
          });
        } catch (error) {
          return failure(`Error adding to portfolio: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET MY PORTFOLIO
    // =========================================================================
    defineTool({
      name: 'get_my_portfolio',
      description: "Get the user's property portfolio with all investments and their status.",
      category: 'portfolio',
      schema: z.object({
        userId: z.string().describe('The user ID'),
        status: z.enum(PORTFOLIO_STATUSES).optional().describe('Filter by status'),
        state: z.string().optional().describe('Filter by state'),
      }),
      handler: async (input, context) => {
        try {
          const result = await portfolioService.getUserPortfolio(input.userId, {
            status: input.status as any,
            state: input.state,
          });

          const summary = result.items.map((p: any) => ({
            portfolioId: p.id,
            address: `${p.address}, ${p.city}, ${p.state}`,
            status: p.status,
            acquisitionPrice: p.acquisitionPrice,
            currentValue: p.currentValue,
            equity: p.equity,
            cashFlow: p.monthlyCashFlow,
            roi: p.cashOnCashReturn,
          }));

          return success({
            totalProperties: result.total,
            properties: summary,
            statusBreakdown: {
              holding: summary.filter((p: any) => p.status === 'holding').length,
              renting: summary.filter((p: any) => p.status === 'renting').length,
              renovating: summary.filter((p: any) => p.status === 'renovating').length,
              listed_for_sale: summary.filter((p: any) => p.status === 'listed_for_sale').length,
              sold: summary.filter((p: any) => p.status === 'sold').length,
            },
          });
        } catch (error) {
          return failure(`Error getting portfolio: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET PORTFOLIO VALUE
    // =========================================================================
    defineTool({
      name: 'get_portfolio_value',
      description: "Get the total value and equity of the user's portfolio.",
      category: 'portfolio',
      schema: z.object({
        userId: z.string().describe('The user ID'),
      }),
      handler: async (input, context) => {
        try {
          const [summary, totalValue] = await Promise.all([
            portfolioService.getPortfolioSummary(input.userId),
            portfolioService.getTotalValue(input.userId),
          ]);

          return success({
            totalValue: totalValue.totalValue,
            totalEquity: totalValue.totalEquity,
            totalProperties: summary.totalProperties,
            totalInvested: summary.totalInvested,
            byStatus: summary.byStatus,
            byState: summary.byState,
            message: `Your portfolio has ${summary.totalProperties} properties worth $${totalValue.totalValue.toLocaleString()} with $${totalValue.totalEquity.toLocaleString()} in equity`,
          });
        } catch (error) {
          return failure(`Error getting portfolio value: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // UPDATE PROPERTY VALUE
    // =========================================================================
    defineTool({
      name: 'update_property_value',
      description: 'Update the current market value of a property in the portfolio.',
      category: 'portfolio',
      schema: z.object({
        portfolioId: z.string().describe('The portfolio item ID'),
        value: z.number().describe('New market value'),
        source: z.enum(['manual', 'zillow', 'appraisal', 'cma']).describe('Valuation source'),
      }),
      handler: async (input, context) => {
        try {
          const portfolio = await portfolioService.updateValuation(
            input.portfolioId,
            input.value,
            input.source as any
          );

          const previousValue = portfolio.acquisitionPrice;
          const appreciation = ((input.value - previousValue) / previousValue) * 100;

          return success({
            portfolioId: portfolio.id,
            address: `${portfolio.address}, ${portfolio.city}, ${portfolio.state}`,
            previousValue,
            newValue: input.value,
            appreciation: `${appreciation.toFixed(1)}%`,
            newEquity: portfolio.equity,
            source: input.source,
            message: `Property value updated to $${input.value.toLocaleString()} (${appreciation >= 0 ? '+' : ''}${appreciation.toFixed(1)}% from acquisition)`,
          });
        } catch (error) {
          return failure(`Error updating property value: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerPipelineTools;
