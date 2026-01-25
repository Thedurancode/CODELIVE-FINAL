/**
 * TaskCostEstimate
 *
 * Estimates the API cost for a task based on description complexity,
 * expected token usage, and model pricing.
 */

'use client';

import { useMemo } from 'react';
import {
  DollarSign,
  Clock,
  Zap,
  Info,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TaskCostEstimateProps {
  title: string;
  description: string;
  className?: string;
  showDetails?: boolean;
}

// Model pricing (per 1M tokens)
const MODEL_PRICING = {
  'claude-sonnet-4': {
    input: 3.0,
    output: 15.0,
    name: 'Claude Sonnet 4',
  },
  'claude-opus-4': {
    input: 15.0,
    output: 75.0,
    name: 'Claude Opus 4',
  },
  'claude-haiku': {
    input: 0.25,
    output: 1.25,
    name: 'Claude Haiku',
  },
};

// Default model for cost estimation
const DEFAULT_MODEL = 'claude-sonnet-4';

// Cost tiers
interface CostTier {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ElementType;
  maxCost: number;
}

const COST_TIERS: CostTier[] = [
  {
    label: 'Low',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-950',
    icon: TrendingDown,
    maxCost: 0.05,
  },
  {
    label: 'Medium',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100 dark:bg-yellow-950',
    icon: Zap,
    maxCost: 0.20,
  },
  {
    label: 'High',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100 dark:bg-orange-950',
    icon: TrendingUp,
    maxCost: 0.50,
  },
  {
    label: 'Very High',
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-950',
    icon: DollarSign,
    maxCost: Infinity,
  },
];

// Estimate tokens from text
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

// Estimate complexity factors
function analyzeTaskComplexity(title: string, description: string): {
  codeGenerationFactor: number;
  iterationFactor: number;
  toolUseFactor: number;
  contextFactor: number;
} {
  const fullText = `${title} ${description}`.toLowerCase();

  // Code generation factor (more code = more output tokens)
  let codeGenerationFactor = 1.0;
  if (fullText.includes('implement') || fullText.includes('create')) codeGenerationFactor += 0.5;
  if (fullText.includes('full') || fullText.includes('complete')) codeGenerationFactor += 0.3;
  if (fullText.includes('component') || fullText.includes('feature')) codeGenerationFactor += 0.3;
  if (fullText.includes('test')) codeGenerationFactor += 0.4;
  if (fullText.includes('refactor')) codeGenerationFactor += 0.2;

  // Iteration factor (complex tasks may require multiple attempts)
  let iterationFactor = 1.0;
  if (fullText.includes('complex') || fullText.includes('difficult')) iterationFactor += 0.5;
  if (fullText.includes('bug') || fullText.includes('fix')) iterationFactor += 0.3;
  if (fullText.includes('debug')) iterationFactor += 0.4;
  if (fullText.includes('multiple') || fullText.includes('several')) iterationFactor += 0.3;

  // Tool use factor (file operations, searches, etc.)
  let toolUseFactor = 1.0;
  const fileExtensions = (fullText.match(/\.[a-z]{2,4}\b/gi) || []).length;
  toolUseFactor += fileExtensions * 0.1;
  if (fullText.includes('search') || fullText.includes('find')) toolUseFactor += 0.2;
  if (fullText.includes('read') || fullText.includes('analyze')) toolUseFactor += 0.2;

  // Context factor (how much codebase context needed)
  let contextFactor = 1.0;
  if (fullText.includes('codebase') || fullText.includes('project')) contextFactor += 0.3;
  if (fullText.includes('understand') || fullText.includes('explore')) contextFactor += 0.4;
  if (fullText.includes('architecture') || fullText.includes('structure')) contextFactor += 0.3;

  return {
    codeGenerationFactor: Math.min(codeGenerationFactor, 3.0),
    iterationFactor: Math.min(iterationFactor, 2.5),
    toolUseFactor: Math.min(toolUseFactor, 2.0),
    contextFactor: Math.min(contextFactor, 2.0),
  };
}

// Calculate cost estimate
function calculateCostEstimate(
  title: string,
  description: string,
  modelId: string = DEFAULT_MODEL
): {
  estimatedCost: number;
  estimatedTime: number; // in minutes
  inputTokens: number;
  outputTokens: number;
  breakdown: {
    baseInputTokens: number;
    baseOutputTokens: number;
    factors: {
      codeGeneration: number;
      iterations: number;
      toolUse: number;
      context: number;
    };
  };
} {
  const model = MODEL_PRICING[modelId as keyof typeof MODEL_PRICING] || MODEL_PRICING[DEFAULT_MODEL];
  const factors = analyzeTaskComplexity(title, description);

  // Base token estimates
  const promptTokens = estimateTokens(title + description);
  const baseInputTokens = promptTokens + 2000; // System prompt + context
  const baseOutputTokens = 1000; // Base response

  // Apply factors
  const totalFactor =
    factors.codeGenerationFactor *
    factors.iterationFactor *
    factors.toolUseFactor *
    factors.contextFactor;

  // Calculate adjusted tokens
  const adjustedInputTokens = Math.ceil(baseInputTokens * factors.contextFactor * factors.toolUseFactor);
  const adjustedOutputTokens = Math.ceil(baseOutputTokens * factors.codeGenerationFactor * factors.iterationFactor);

  // Calculate cost
  const inputCost = (adjustedInputTokens / 1_000_000) * model.input;
  const outputCost = (adjustedOutputTokens / 1_000_000) * model.output;
  const estimatedCost = inputCost + outputCost;

  // Estimate time (rough: ~100 tokens/second for output)
  const estimatedTime = Math.ceil(adjustedOutputTokens / 6000); // ~100 tokens/sec = 6000/min

  return {
    estimatedCost,
    estimatedTime: Math.max(1, estimatedTime),
    inputTokens: adjustedInputTokens,
    outputTokens: adjustedOutputTokens,
    breakdown: {
      baseInputTokens,
      baseOutputTokens,
      factors: {
        codeGeneration: factors.codeGenerationFactor,
        iterations: factors.iterationFactor,
        toolUse: factors.toolUseFactor,
        context: factors.contextFactor,
      },
    },
  };
}

// Get cost tier
function getCostTier(cost: number): CostTier {
  return COST_TIERS.find((tier) => cost <= tier.maxCost) || COST_TIERS[COST_TIERS.length - 1];
}

export function TaskCostEstimate({
  title,
  description,
  className,
  showDetails = false,
}: TaskCostEstimateProps) {
  const estimate = useMemo(
    () => calculateCostEstimate(title, description),
    [title, description]
  );

  const tier = getCostTier(estimate.estimatedCost);
  const TierIcon = tier.icon;

  // Format cost
  const formatCost = (cost: number) => {
    if (cost < 0.01) return '< $0.01';
    return `~$${cost.toFixed(2)}`;
  };

  // Format time
  const formatTime = (minutes: number) => {
    if (minutes < 1) return '< 1 min';
    if (minutes === 1) return '~1 min';
    return `~${minutes} min`;
  };

  if (!title && !description) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className={cn('flex items-center gap-2', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className={cn(
                'gap-1 cursor-help',
                tier.bgColor,
                tier.color
              )}
            >
              <TierIcon className="h-3 w-3" />
              {formatCost(estimate.estimatedCost)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-2 text-xs">
              <div className="font-medium">Cost Estimate</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Input tokens:</span>
                <span>{estimate.inputTokens.toLocaleString()}</span>
                <span className="text-muted-foreground">Output tokens:</span>
                <span>{estimate.outputTokens.toLocaleString()}</span>
                <span className="text-muted-foreground">Model:</span>
                <span>{MODEL_PRICING[DEFAULT_MODEL].name}</span>
              </div>
              {showDetails && (
                <>
                  <div className="border-t pt-2 mt-2">
                    <div className="font-medium mb-1">Complexity Factors</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-muted-foreground">Code Gen:</span>
                      <span>{estimate.breakdown.factors.codeGeneration.toFixed(1)}x</span>
                      <span className="text-muted-foreground">Iterations:</span>
                      <span>{estimate.breakdown.factors.iterations.toFixed(1)}x</span>
                      <span className="text-muted-foreground">Tool Use:</span>
                      <span>{estimate.breakdown.factors.toolUse.toFixed(1)}x</span>
                      <span className="text-muted-foreground">Context:</span>
                      <span>{estimate.breakdown.factors.context.toFixed(1)}x</span>
                    </div>
                  </div>
                </>
              )}
              <p className="text-muted-foreground italic pt-1 border-t">
                Estimate only. Actual cost may vary.
              </p>
            </div>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 cursor-help">
              <Clock className="h-3 w-3" />
              {formatTime(estimate.estimatedTime)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Estimated processing time</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

// Export helper for use in other components
export { calculateCostEstimate, getCostTier, MODEL_PRICING };
