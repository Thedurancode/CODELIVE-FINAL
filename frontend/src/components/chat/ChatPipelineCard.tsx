'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PipelineCardData } from '@/lib/chat-parser';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  ListTodo,
  User,
} from 'lucide-react';

interface ChatPipelineCardProps {
  data: PipelineCardData;
  className?: string;
}

const PIPELINE_STAGES = [
  { key: 'new', label: 'New' },
  { key: 'analyzing', label: 'Analyzing' },
  { key: 'due_diligence', label: 'Due Diligence' },
  { key: 'offered', label: 'Offered' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'under_contract', label: 'Under Contract' },
  { key: 'closed', label: 'Closed' },
] as const;

function getStageIndex(stage: string): number {
  return PIPELINE_STAGES.findIndex(s => s.key === stage);
}

function getStageColor(stage: string): string {
  switch (stage) {
    case 'new':
      return 'bg-blue-500';
    case 'analyzing':
      return 'bg-purple-500';
    case 'due_diligence':
      return 'bg-amber-500';
    case 'offered':
      return 'bg-cyan-500';
    case 'negotiating':
      return 'bg-orange-500';
    case 'under_contract':
      return 'bg-emerald-500';
    case 'closed':
      return 'bg-green-500';
    default:
      return 'bg-zinc-500';
  }
}

export function ChatPipelineCard({ data, className }: ChatPipelineCardProps) {
  const router = useRouter();
  const { propertyId, propertyAddress, currentStage, daysInStage, nextActions, assignedTo } = data;

  const currentStageIndex = getStageIndex(currentStage);
  const currentStageLabel = PIPELINE_STAGES.find(s => s.key === currentStage)?.label || currentStage;

  const handleViewPipeline = () => {
    router.push(`/pipeline?property=${propertyId}`);
  };

  const handleViewProperty = () => {
    router.push(`/deals/${propertyId}`);
  };

  return (
    <div className={cn('w-full max-w-md bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden my-3', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-zinc-200">Pipeline Status</h3>
            <p className="text-xs text-zinc-500 truncate">{propertyAddress}</p>
          </div>
          <Badge className={cn('text-xs', getStageColor(currentStage), 'text-white')}>
            {currentStageLabel}
          </Badge>
        </div>
      </div>

      {/* Stage Progress */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          {PIPELINE_STAGES.map((stage, index) => {
            const isCompleted = index < currentStageIndex;
            const isCurrent = index === currentStageIndex;
            const isPending = index > currentStageIndex;

            return (
              <div key={stage.key} className="flex items-center">
                {/* Stage Indicator */}
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center transition-all',
                    isCompleted && 'bg-green-500',
                    isCurrent && getStageColor(currentStage),
                    isPending && 'bg-zinc-700'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  ) : isCurrent ? (
                    <Circle className="h-3 w-3 text-white fill-white" />
                  ) : (
                    <Circle className="h-3 w-3 text-zinc-500" />
                  )}
                </div>

                {/* Connector Line */}
                {index < PIPELINE_STAGES.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 w-4 sm:w-6',
                      index < currentStageIndex ? 'bg-green-500' : 'bg-zinc-700'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Stage Labels (only show current) */}
        <div className="text-center">
          <p className="text-xs text-zinc-400">
            Stage {currentStageIndex + 1} of {PIPELINE_STAGES.length}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-3 border-t border-zinc-800 space-y-2">
        {/* Days in Stage */}
        {daysInStage !== undefined && (
          <div className="flex items-center gap-2 text-xs">
            <Clock className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-zinc-400">
              {daysInStage} {daysInStage === 1 ? 'day' : 'days'} in current stage
            </span>
          </div>
        )}

        {/* Assigned To */}
        {assignedTo && (
          <div className="flex items-center gap-2 text-xs">
            <User className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-zinc-400">Assigned to: {assignedTo}</span>
          </div>
        )}

        {/* Next Actions */}
        {nextActions && nextActions.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
              <ListTodo className="h-3.5 w-3.5" />
              <span>Next Actions:</span>
            </div>
            <ul className="space-y-1">
              {nextActions.map((action, index) => (
                <li key={index} className="flex items-center gap-2 text-xs text-zinc-300">
                  <ArrowRight className="h-3 w-3 text-accent-400" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-zinc-800 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs h-8"
          onClick={handleViewPipeline}
        >
          <ExternalLink className="h-3 w-3 mr-1.5" />
          View Pipeline
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-xs h-8"
          onClick={handleViewProperty}
        >
          Property Details
        </Button>
      </div>
    </div>
  );
}

export default ChatPipelineCard;
