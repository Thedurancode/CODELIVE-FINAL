'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { BuyBoxMatchData } from '@/lib/chat-parser';
import {
  Target,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Building2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useState } from 'react';

interface ChatBuyBoxMatchProps {
  data: BuyBoxMatchData;
  className?: string;
}

function getMatchTypeConfig(matchType: string) {
  switch (matchType) {
    case 'strong':
      return {
        label: 'Strong Match',
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
        barColor: 'bg-green-500',
      };
    case 'moderate':
      return {
        label: 'Moderate Match',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        barColor: 'bg-yellow-500',
      };
    case 'weak':
      return {
        label: 'Weak Match',
        className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        barColor: 'bg-orange-500',
      };
    default:
      return {
        label: 'No Match',
        className: 'bg-red-500/20 text-red-400 border-red-500/30',
        barColor: 'bg-red-500',
      };
  }
}

export function ChatBuyBoxMatch({ data, className }: ChatBuyBoxMatchProps) {
  const router = useRouter();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const { propertyId, propertyAddress, matches, bestMatch } = data;

  const handleViewProperty = () => {
    router.push(`/deals/${propertyId}`);
  };

  const handleViewBuyBox = (buyBoxId: number) => {
    router.push(`/buyboxes/${buyBoxId}`);
  };

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  // Sort matches by score descending
  const sortedMatches = [...matches].sort((a, b) => b.matchScore - a.matchScore);

  return (
    <div className={cn('w-full max-w-md bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden my-3', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-4 w-4 text-accent-400" />
          <h3 className="text-sm font-semibold text-zinc-200">Buy Box Matches</h3>
        </div>
        <p className="text-xs text-zinc-500 truncate">{propertyAddress}</p>
        {bestMatch && (
          <p className="text-xs text-green-400 mt-1">Best match: {bestMatch}</p>
        )}
      </div>

      {/* Match List */}
      <div className="divide-y divide-zinc-800">
        {sortedMatches.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <XCircle className="h-8 w-8 mx-auto text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-500">No matching buy boxes found</p>
          </div>
        ) : (
          sortedMatches.map((match, index) => {
            const config = getMatchTypeConfig(match.matchType);
            const isExpanded = expandedIndex === index;

            return (
              <div key={match.buyBoxId} className="px-4 py-3">
                {/* Match Header */}
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleExpand(index)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-zinc-200 truncate">
                        {match.buyBoxName}
                      </span>
                    </div>
                    {match.fundName && (
                      <p className="text-xs text-zinc-500 ml-5.5 truncate">{match.fundName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={cn('text-xs', config.className)}>
                      {match.matchScore}%
                    </Badge>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-zinc-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-zinc-500" />
                    )}
                  </div>
                </div>

                {/* Score Bar */}
                <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', config.barColor)}
                    style={{ width: `${match.matchScore}%` }}
                  />
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-3 space-y-2">
                    {/* Matched Criteria */}
                    {match.matchedCriteria.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 mb-1">Matched Criteria:</p>
                        <div className="flex flex-wrap gap-1">
                          {match.matchedCriteria.map((criteria, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {criteria}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Failed Criteria */}
                    {match.failedCriteria && match.failedCriteria.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 mb-1">Failed Criteria:</p>
                        <div className="flex flex-wrap gap-1">
                          {match.failedCriteria.map((criteria, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded"
                            >
                              <XCircle className="h-3 w-3" />
                              {criteria}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* View Buy Box Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs h-7 mt-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewBuyBox(match.buyBoxId);
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1.5" />
                      View Buy Box
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Action */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8"
          onClick={handleViewProperty}
        >
          <ExternalLink className="h-3 w-3 mr-1.5" />
          View Property Details
        </Button>
      </div>
    </div>
  );
}

export default ChatBuyBoxMatch;
