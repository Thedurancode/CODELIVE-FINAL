'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { DealScoreData } from '@/lib/chat-parser';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface ChatDealScoreProps {
  data: DealScoreData;
  className?: string;
}

function getScoreColor(score: number, maxScore: number): string {
  const percentage = (score / maxScore) * 100;
  if (percentage >= 80) return 'bg-green-500';
  if (percentage >= 60) return 'bg-emerald-500';
  if (percentage >= 40) return 'bg-yellow-500';
  if (percentage >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}

function getOverallScoreColor(score: number): string {
  if (score >= 80) return 'text-green-400 border-green-500/30 bg-green-500/10';
  if (score >= 60) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (score >= 40) return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
  if (score >= 20) return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
  return 'text-red-400 border-red-500/30 bg-red-500/10';
}

function getRecommendationConfig(recommendation?: string) {
  switch (recommendation) {
    case 'strong_buy':
      return {
        label: 'Strong Buy',
        icon: ThumbsUp,
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
      };
    case 'buy':
      return {
        label: 'Buy',
        icon: CheckCircle2,
        className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      };
    case 'hold':
      return {
        label: 'Hold',
        icon: AlertCircle,
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      };
    case 'pass':
      return {
        label: 'Pass',
        icon: ThumbsDown,
        className: 'bg-red-500/20 text-red-400 border-red-500/30',
      };
    default:
      return null;
  }
}

export function ChatDealScore({ data, className }: ChatDealScoreProps) {
  const router = useRouter();
  const { propertyId, propertyAddress, overallScore, scores, recommendation, summary } = data;

  const recommendationConfig = getRecommendationConfig(recommendation);

  const handleViewProperty = () => {
    router.push(`/deals/${propertyId}`);
  };

  return (
    <div className={cn('w-full max-w-md bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden my-3', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-200 truncate">Deal Score Analysis</h3>
          <p className="text-xs text-zinc-500 truncate">{propertyAddress}</p>
        </div>

        {/* Overall Score Badge */}
        <div className={cn(
          'flex items-center justify-center w-14 h-14 rounded-xl border-2 font-bold text-xl',
          getOverallScoreColor(overallScore)
        )}>
          {overallScore}
        </div>
      </div>

      {/* Recommendation Badge */}
      {recommendationConfig && (
        <div className="px-4 py-2 border-b border-zinc-800">
          <Badge className={cn('gap-1.5', recommendationConfig.className)}>
            <recommendationConfig.icon className="h-3.5 w-3.5" />
            {recommendationConfig.label}
          </Badge>
        </div>
      )}

      {/* Score Breakdown */}
      <div className="px-4 py-3 space-y-3">
        {scores.map((item, index) => {
          const percentage = (item.score / item.maxScore) * 100;
          return (
            <div key={index} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">{item.category}</span>
                <span className="text-zinc-300 font-medium">
                  {item.score}/{item.maxScore}
                </span>
              </div>
              <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-500', getScoreColor(item.score, item.maxScore))}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              {item.details && (
                <p className="text-xs text-zinc-500 mt-0.5">{item.details}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {summary && (
        <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900/50">
          <p className="text-xs text-zinc-400 leading-relaxed">{summary}</p>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8"
          onClick={handleViewProperty}
        >
          <ExternalLink className="h-3 w-3 mr-1.5" />
          View Full Analysis
        </Button>
      </div>
    </div>
  );
}

export default ChatDealScore;
