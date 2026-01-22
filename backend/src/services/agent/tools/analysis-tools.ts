/**
 * Analysis Tools
 *
 * Deal analysis, scoring, and intelligence tools for the AI agent.
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import { dealProcessingService } from '../../../plugins';
import { dealIntelligenceService } from '../../DealIntelligenceService';
import { marketDataService } from '../../MarketDataService';
import { pipelineService } from '../../PipelineService';
import { Property } from '../../../models';
import {
  createDealScore,
  createBuyBoxMatch,
  type DealScoreData,
  type BuyBoxMatchData,
} from '../ui-components';

/**
 * Register all analysis tools with the registry
 */
export function registerAnalysisTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // ANALYZE DEAL
    // =========================================================================
    defineTool({
      name: 'analyze_deal',
      description:
        'Deep analysis of a deal including ROI, MAO (70% rule), cash-on-cash return, and AI-powered insights',
      category: 'analysis',
      schema: z.object({
        address: z.string().describe('Property address'),
        city: z.string().describe('City'),
        state: z.string().describe('State'),
        askingPrice: z.number().describe('Current asking price'),
        arv: z.number().optional().describe('After Repair Value (if known)'),
        rehabCost: z.number().optional().describe('Estimated repair cost (if known)'),
        bedrooms: z.number().optional().describe('Number of bedrooms'),
        bathrooms: z.number().optional().describe('Number of bathrooms'),
        sqft: z.number().optional().describe('Square footage'),
      }),
      handler: async (input, context) => {
        try {
          const { address, city, state, askingPrice, arv, rehabCost, bedrooms, bathrooms, sqft } =
            input;

          // Calculate MAO using 70% rule
          const estimatedArv = arv || askingPrice * 1.2;
          const estimatedRehab = rehabCost || askingPrice * 0.1;
          const mao = estimatedArv * 0.7 - estimatedRehab;

          // Calculate potential profit
          const potentialProfit = estimatedArv - askingPrice - estimatedRehab;
          const roi = (potentialProfit / askingPrice) * 100;

          // Simple deal score (0-100)
          let dealScore = 50;
          if (askingPrice <= mao) dealScore += 25;
          if (roi > 20) dealScore += 15;
          if (roi > 30) dealScore += 10;

          // Generate insights
          const insights: string[] = [];
          if (askingPrice > mao) {
            insights.push(`Asking price is $${(askingPrice - mao).toLocaleString()} above MAO`);
          } else {
            insights.push(`Good deal - $${(mao - askingPrice).toLocaleString()} under MAO`);
          }
          if (roi > 25) {
            insights.push(`Strong ROI of ${roi.toFixed(1)}%`);
          }
          if (potentialProfit > 30000) {
            insights.push(`Potential profit of $${potentialProfit.toLocaleString()}`);
          }

          // Determine recommendation for UI
          let recommendation: 'strong_buy' | 'buy' | 'hold' | 'pass' = 'hold';
          if (dealScore >= 80) recommendation = 'strong_buy';
          else if (dealScore >= 65) recommendation = 'buy';
          else if (dealScore >= 50) recommendation = 'hold';
          else recommendation = 'pass';

          // Create UI component for rich rendering
          const scoreData: DealScoreData = {
            propertyId: 0, // No ID for new analysis
            propertyAddress: `${address}, ${city}, ${state}`,
            overallScore: Math.round(dealScore),
            scores: [
              { category: 'MAO Analysis', score: askingPrice <= mao ? 25 : 10, maxScore: 25, details: `${askingPrice <= mao ? 'Under' : 'Above'} MAO` },
              { category: 'ROI', score: Math.min(Math.round(roi / 2), 25), maxScore: 25, details: `${roi.toFixed(1)}% projected` },
              { category: 'Profit Potential', score: Math.min(Math.round(potentialProfit / 2000), 25), maxScore: 25, details: `$${Math.round(potentialProfit).toLocaleString()}` },
              { category: 'Deal Quality', score: Math.round(dealScore / 4), maxScore: 25, details: mao > askingPrice ? 'Good margin' : 'Tight margin' },
            ],
            recommendation,
            summary: insights.join('. '),
          };
          const uiComponent = createDealScore(scoreData);

          return success(
            {
              analysis: {
                mao: Math.round(mao),
                estimatedArv: Math.round(estimatedArv),
                estimatedRehab: Math.round(estimatedRehab),
                potentialProfit: Math.round(potentialProfit),
                roi: Math.round(roi * 10) / 10,
                dealScore: Math.round(dealScore),
                recommendation: mao > askingPrice ? 'Good deal - under MAO' : 'Caution - above MAO',
              },
              property: {
                address: `${address}, ${city}, ${state}`,
                bedrooms,
                bathrooms,
                sqft,
              },
              insights,
            },
            `Deal analysis complete with score of ${Math.round(dealScore)}`,
            { uiComponents: [uiComponent] }
          );
        } catch (error) {
          return failure(`Error analyzing deal: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SCORE DEAL AGAINST BUY BOXES
    // =========================================================================
    defineTool({
      name: 'score_deal_against_buyboxes',
      description:
        'Score a deal against all registered hedge fund buy boxes to find matches and get fund contact info',
      category: 'analysis',
      schema: z.object({
        address: z.string().describe('Property address'),
        city: z.string().describe('City'),
        state: z.string().describe('State'),
        zip: z.string().describe('ZIP code'),
        askingPrice: z.number().describe('Asking price'),
        bedrooms: z.number().optional().describe('Number of bedrooms'),
        bathrooms: z.number().optional().describe('Number of bathrooms'),
        sqft: z.number().optional().describe('Square footage'),
        yearBuilt: z.number().optional().describe('Year built'),
        propertyType: z.string().optional().describe('Property type'),
      }),
      handler: async (input, context) => {
        try {
          const deal = {
            address: { street: input.address, city: input.city, state: input.state, zip: input.zip },
            askingPrice: input.askingPrice,
            bedrooms: input.bedrooms,
            bathrooms: input.bathrooms,
            sqft: input.sqft,
            yearBuilt: input.yearBuilt,
            propertyType: input.propertyType || 'Single Family',
          };

          const results = await dealProcessingService.scoreDeal(deal as any);

          if (results.length === 0) {
            return success({
              scores: [],
              summary: { totalBuyBoxes: 0, strongMatches: 0, moderateMatches: 0, weakMatches: 0 },
              message: 'No buy boxes registered. Create buy boxes first.',
            });
          }

          // Find best match for UI
          const sortedResults = [...results].sort((a: any, b: any) => b.percentage - a.percentage);
          const bestMatch = sortedResults[0]?.buyBoxName;

          // Create UI component for rich rendering
          const matchData: BuyBoxMatchData = {
            propertyId: 0, // No ID for new scoring
            propertyAddress: `${input.address}, ${input.city}, ${input.state}`,
            matches: results.map((r: any) => ({
              buyBoxId: r.buyBoxId || 0,
              buyBoxName: r.buyBoxName,
              fundName: r.fundName,
              matchScore: r.percentage,
              matchType: r.percentage >= 75 ? 'strong' : r.percentage >= 50 ? 'moderate' : r.percentage >= 25 ? 'weak' : 'no_match',
              matchedCriteria: r.matchedCriteria || [],
              failedCriteria: r.failedCriteria || [],
            })),
            bestMatch,
          };
          const uiComponent = createBuyBoxMatch(matchData);

          const strongMatches = results.filter((r: any) => r.percentage >= 80).length;
          return success(
            {
              scores: results.map((r: any) => ({
                buyBox: r.buyBoxName,
                score: `${r.percentage}%`,
                matchType: r.matchType,
                autoSubmit: r.percentage >= (r.autoSubmitThreshold || 80),
                fundContact: r.contactEmail || null,
              })),
              summary: {
                totalBuyBoxes: results.length,
                strongMatches,
                moderateMatches: results.filter(
                  (r: any) => r.percentage >= 60 && r.percentage < 80
                ).length,
                weakMatches: results.filter(
                  (r: any) => r.percentage >= 50 && r.percentage < 60
                ).length,
              },
            },
            `Scored against ${results.length} buy boxes, ${strongMatches} strong matches`,
            { uiComponents: [uiComponent] }
          );
        } catch (error) {
          return failure(`Error scoring deal: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // QUICK DEAL SCORE
    // =========================================================================
    defineTool({
      name: 'quick_deal_score',
      description:
        'Get a quick pass/fail score for a deal in under 1 second. Returns success probability, verdict (Strong Buy/Consider/Weak/Pass), and top reason.',
      category: 'analysis',
      schema: z.object({
        state: z.string().describe('State abbreviation'),
        askingPrice: z.number().describe('Asking price'),
        arv: z.number().optional().describe('After Repair Value'),
        rehabEstimate: z.number().optional().describe('Estimated rehab cost'),
        propertyType: z.string().optional().describe('Property type'),
        bedrooms: z.number().optional().describe('Number of bedrooms'),
      }),
      handler: async (input, context) => {
        try {
          const { state, askingPrice, arv, rehabEstimate, propertyType, bedrooms } = input;

          // Quick MAO calculation
          const estimatedArv = arv || askingPrice * 1.15;
          const estimatedRehab = rehabEstimate || askingPrice * 0.08;
          const mao = estimatedArv * 0.7 - estimatedRehab;

          // Calculate quick metrics
          const percentOfMao = (askingPrice / mao) * 100;
          const potentialProfit = estimatedArv - askingPrice - estimatedRehab;
          const roi = (potentialProfit / askingPrice) * 100;

          // Determine verdict
          let verdict: string;
          let probability: number;
          let reason: string;

          if (percentOfMao <= 85 && roi > 25) {
            verdict = 'Strong Buy';
            probability = 85;
            reason = `Under MAO by ${(100 - percentOfMao).toFixed(0)}% with ${roi.toFixed(0)}% ROI`;
          } else if (percentOfMao <= 95 && roi > 15) {
            verdict = 'Consider';
            probability = 65;
            reason = `Near MAO with reasonable ${roi.toFixed(0)}% ROI`;
          } else if (percentOfMao <= 105) {
            verdict = 'Weak';
            probability = 35;
            reason = `At or slightly above MAO, ${roi.toFixed(0)}% ROI may be tight`;
          } else {
            verdict = 'Pass';
            probability = 15;
            reason = `${(percentOfMao - 100).toFixed(0)}% above MAO, insufficient margin`;
          }

          return success({
            verdict,
            probability,
            reason,
            metrics: {
              askingPrice,
              mao: Math.round(mao),
              percentOfMao: Math.round(percentOfMao),
              potentialProfit: Math.round(potentialProfit),
              roi: Math.round(roi),
            },
          });
        } catch (error) {
          return failure(`Error calculating quick score: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 5 * 60, // 5 minutes
    }),

    // =========================================================================
    // GET DEAL INTELLIGENCE
    // =========================================================================
    defineTool({
      name: 'get_deal_intelligence',
      description:
        'Get comprehensive AI-powered deal intelligence including: success probability prediction, optimal offer price with negotiation tactics, best fund matches with acceptance rates, and market context. Use this for deep analysis of any deal.',
      category: 'analysis',
      schema: z.object({
        address: z.string().describe('Property street address'),
        city: z.string().describe('City'),
        state: z.string().describe('State abbreviation (e.g., TX, FL, GA)'),
        askingPrice: z.number().describe('Current asking price'),
        arv: z.number().optional().describe('After Repair Value (if known)'),
        rehabEstimate: z.number().optional().describe('Estimated repair costs'),
        propertyType: z.string().optional().describe('Property type (e.g., Single Family, Condo)'),
        bedrooms: z.number().optional().describe('Number of bedrooms'),
        bathrooms: z.number().optional().describe('Number of bathrooms'),
        sqft: z.number().optional().describe('Square footage'),
      }),
      handler: (async (input: any, context: any) => {
        try {
          // Use the analyze deal method from the service
          const fullAddress = `${input.address}, ${input.city}, ${input.state}`;
          const intelligence = await dealIntelligenceService.analyzeDeal({
            address: fullAddress,
            askingPrice: input.askingPrice,
            arv: input.arv,
            rehabEstimate: input.rehabEstimate,
            propertyType: input.propertyType || 'Single Family',
            bedrooms: input.bedrooms,
            bathrooms: input.bathrooms,
            sqft: input.sqft,
          } as any);

          return success(intelligence);
        } catch (error) {
          // Fallback to basic analysis if intelligence service fails
          const mao = (input.arv || input.askingPrice * 1.15) * 0.7 - (input.rehabEstimate || 0);
          return success({
            verdict: input.askingPrice <= mao ? 'Consider' : 'Review',
            successProbability: input.askingPrice <= mao ? 60 : 40,
            mao: Math.round(mao),
            message: 'Basic analysis only - intelligence service not available',
          });
        }
      }) as any,
      cacheable: true,
      cacheTTL: 15 * 60, // 15 minutes
    }),

    // =========================================================================
    // GET PRICING STRATEGY
    // =========================================================================
    defineTool({
      name: 'get_pricing_strategy',
      description:
        'Get optimal pricing strategy with negotiation tactics. Shows recommended offer range, opening bid, walk-away price, and negotiation tips.',
      category: 'analysis',
      schema: z.object({
        address: z.string().describe('Property address'),
        city: z.string().describe('City'),
        state: z.string().describe('State'),
        askingPrice: z.number().describe('Current asking price'),
        arv: z.number().optional().describe('After Repair Value'),
        rehabEstimate: z.number().optional().describe('Estimated repair costs'),
        daysOnMarket: z.number().optional().describe('Days on market'),
        motivationLevel: z
          .enum(['low', 'medium', 'high'])
          .optional()
          .describe('Seller motivation level'),
      }),
      handler: async (input, context) => {
        try {
          const {
            askingPrice,
            arv,
            rehabEstimate,
            daysOnMarket = 30,
            motivationLevel = 'medium',
          } = input;

          const estimatedArv = arv || askingPrice * 1.15;
          const estimatedRehab = rehabEstimate || askingPrice * 0.08;
          const mao = estimatedArv * 0.7 - estimatedRehab;

          // Calculate offer range based on motivation and DOM
          let discountFactor = 0.1; // Base 10% below asking
          if (daysOnMarket > 60) discountFactor += 0.05;
          if (daysOnMarket > 90) discountFactor += 0.05;
          if (motivationLevel === 'high') discountFactor += 0.1;
          if (motivationLevel === 'low') discountFactor -= 0.05;

          const openingOffer = Math.round(askingPrice * (1 - discountFactor));
          const targetPrice = Math.round(Math.min(mao, askingPrice * 0.95));
          const walkAwayPrice = Math.round(mao * 1.05);

          // Generate negotiation tips
          const tips: string[] = [];
          if (daysOnMarket > 60) {
            tips.push('Property has been on market a while - seller may be motivated');
          }
          if (askingPrice > mao) {
            tips.push(
              `Asking is ${Math.round(((askingPrice - mao) / mao) * 100)}% above MAO - negotiate hard`
            );
          }
          if (motivationLevel === 'high') {
            tips.push('High seller motivation - they may accept below-market offers');
          }
          tips.push('Start with opening offer and work up slowly');
          tips.push('Get repair estimates in writing to justify lower offers');

          return success({
            openingOffer,
            targetPrice,
            walkAwayPrice,
            mao: Math.round(mao),
            spread: {
              belowAsking: Math.round(askingPrice - openingOffer),
              percentOff: Math.round((1 - openingOffer / askingPrice) * 100),
            },
            negotiationTips: tips,
            recommendation:
              askingPrice <= mao
                ? 'Strong position - offer at or near asking'
                : 'Negotiate down to MAO or below',
          });
        } catch (error) {
          return failure(`Error calculating pricing strategy: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 10 * 60, // 10 minutes
    }),

    // =========================================================================
    // QUICK DEAL ASSESSMENT
    // =========================================================================
    defineTool({
      name: 'quick_deal_assessment',
      description:
        'Rapid evaluation of an existing property with all metrics including MAO, ROI, matching funds, and recommendation. Use for existing properties in the database.',
      category: 'analysis',
      schema: z.object({
        propertyId: z.string().describe('Property ID to assess'),
      }),
      handler: async (input, context) => {
        try {
          // This would fetch from database and run full assessment
          // For now, return structure
          return success({
            propertyId: input.propertyId,
            message: 'Quick assessment requires property lookup - use analyze_deal for new properties',
            suggestion: 'Provide address, price, and ARV for full analysis',
          });
        } catch (error) {
          return failure(`Error in quick assessment: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SCORE PIPELINE DEALS
    // =========================================================================
    defineTool({
      name: 'score_pipeline_deals',
      description:
        "Score all deals in the user's pipeline against buy boxes. Use this when the user asks to score their deals, pipeline deals, or latest deals against buy boxes. This fetches all active pipeline deals with their property details and scores each one.",
      category: 'analysis',
      schema: z.object({
        userId: z.string().describe('The user ID'),
        stage: z
          .enum(['new', 'analyzing', 'due_diligence', 'offered', 'negotiating', 'under_contract'])
          .optional()
          .describe('Filter by pipeline stage (optional)'),
        limit: z.number().optional().default(10).describe('Maximum number of deals to score'),
      }),
      handler: async (input, context) => {
        try {
          // Get user's active pipeline deals
          const { items: pipelineItems, total } = await pipelineService.getUserPipeline(
            input.userId,
            {
              stage: input.stage as any,
              includeCompleted: false,
              limit: input.limit || 10,
            }
          );

          if (pipelineItems.length === 0) {
            return success({
              totalDeals: 0,
              scoredDeals: [],
              message: 'No active deals in your pipeline to score. Add deals to your pipeline first using add_to_pipeline.',
            });
          }

          // Score each deal
          const scoredDeals: any[] = [];
          const errors: string[] = [];

          for (const pipelineItem of pipelineItems) {
            try {
              // Get full property details
              let property = null;
              if (pipelineItem.propertyId) {
                property = await Property.findByPk(pipelineItem.propertyId);
              }

              // Use snapshot if no property found
              const snapshot = pipelineItem.entrySnapshot || {};
              const propertyData = property || snapshot;

              // Build deal object for scoring
              const address = property
                ? `${property.address}, ${property.city}, ${property.state}`
                : snapshot.city
                ? `${snapshot.city}, ${snapshot.state}`
                : 'Unknown Address';

              const deal = {
                address: {
                  street: property?.address || 'Unknown',
                  city: property?.city || snapshot.city || 'Unknown',
                  state: property?.state || snapshot.state || 'Unknown',
                  zip: property?.zip || 'Unknown',
                },
                askingPrice:
                  property?.reservePrice ||
                  property?.purchaseContractPrice ||
                  snapshot.price ||
                  0,
                bedrooms: property?.bedroomCount || snapshot.bedrooms,
                bathrooms: property?.bathroomCount || snapshot.bathrooms,
                sqft: property?.livingSpaceSqFt || snapshot.sqft,
                yearBuilt: property?.yearBuilt,
                propertyType: property?.propertyType || snapshot.propertyType || 'Single Family',
              };

              // Skip if no price
              if (!deal.askingPrice) {
                errors.push(`Deal ${pipelineItem.dealId}: No price available for scoring`);
                continue;
              }

              // Score against buy boxes
              const scores = await dealProcessingService.scoreDeal(deal as any);

              scoredDeals.push({
                pipelineId: pipelineItem.id,
                dealId: pipelineItem.dealId,
                propertyId: pipelineItem.propertyId,
                address,
                stage: pipelineItem.stage,
                askingPrice: deal.askingPrice,
                daysInPipeline: pipelineItem.getDaysInPipeline?.() || 0,
                scores: scores.map((r: any) => ({
                  buyBox: r.buyBoxName,
                  score: `${r.percentage}%`,
                  matchType: r.matchType,
                  autoSubmit: r.percentage >= (r.autoSubmitThreshold || 80),
                })),
                bestMatch:
                  scores.length > 0
                    ? {
                        buyBox: scores[0].buyBoxName,
                        score: `${scores[0].percentage}%`,
                      }
                    : null,
                totalMatches: scores.filter((s: any) => s.percentage >= 50).length,
              });
            } catch (dealError) {
              errors.push(`Deal ${pipelineItem.dealId}: ${dealError}`);
            }
          }

          // Generate summary
          const summary = {
            totalInPipeline: total,
            dealsScored: scoredDeals.length,
            dealsWithMatches: scoredDeals.filter((d) => d.totalMatches > 0).length,
            strongMatches: scoredDeals.filter((d) =>
              d.scores.some((s: any) => parseInt(s.score) >= 80)
            ).length,
            moderateMatches: scoredDeals.filter(
              (d) =>
                d.scores.some((s: any) => parseInt(s.score) >= 60 && parseInt(s.score) < 80) &&
                !d.scores.some((s: any) => parseInt(s.score) >= 80)
            ).length,
          };

          return success({
            totalDeals: total,
            scoredDeals,
            summary,
            errors: errors.length > 0 ? errors : undefined,
            message:
              scoredDeals.length > 0
                ? `Scored ${scoredDeals.length} deals. ${summary.strongMatches} have strong matches (80%+), ${summary.moderateMatches} have moderate matches (60-79%).`
                : 'No deals could be scored. Ensure your pipeline deals have property details.',
          });
        } catch (error) {
          return failure(`Error scoring pipeline deals: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerAnalysisTools;
