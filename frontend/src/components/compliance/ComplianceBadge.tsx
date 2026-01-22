'use client';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Shield, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComplianceBadgeProps {
  complianceNotes?: string[];
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

type ComplianceStatus = 'passed' | 'warning' | 'critical' | 'unchecked';

function parseComplianceStatus(notes?: string[]): {
  status: ComplianceStatus;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
} {
  if (!notes || notes.length === 0) {
    return { status: 'unchecked', criticalCount: 0, warningCount: 0, infoCount: 0 };
  }

  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  notes.forEach((note) => {
    if (note.includes('[CRITICAL]')) criticalCount++;
    else if (note.includes('[WARNING]')) warningCount++;
    else if (note.includes('[INFO]')) infoCount++;
  });

  if (criticalCount > 0) {
    return { status: 'critical', criticalCount, warningCount, infoCount };
  }
  if (warningCount > 0) {
    return { status: 'warning', criticalCount, warningCount, infoCount };
  }
  return { status: 'passed', criticalCount, warningCount, infoCount };
}

const statusConfig: Record<
  ComplianceStatus,
  {
    label: string;
    color: string;
    icon: typeof Shield;
    bgClass: string;
  }
> = {
  passed: {
    label: 'Compliant',
    color: 'text-emerald-400',
    icon: ShieldCheck,
    bgClass: 'bg-emerald-500/20 border-emerald-500/50',
  },
  warning: {
    label: 'Warnings',
    color: 'text-amber-400',
    icon: Shield,
    bgClass: 'bg-amber-500/20 border-amber-500/50',
  },
  critical: {
    label: 'Issues',
    color: 'text-red-400',
    icon: ShieldAlert,
    bgClass: 'bg-red-500/20 border-red-500/50',
  },
  unchecked: {
    label: 'Not Checked',
    color: 'text-muted-foreground',
    icon: ShieldQuestion,
    bgClass: 'bg-zinc-500/20 border-zinc-500/50',
  },
};

export function ComplianceBadge({
  complianceNotes,
  showLabel = false,
  size = 'sm',
}: ComplianceBadgeProps) {
  const { status, criticalCount, warningCount } = parseComplianceStatus(complianceNotes);
  const config = statusConfig[status];
  const Icon = config.icon;

  const tooltipContent = () => {
    if (status === 'unchecked') return 'Compliance not yet checked';
    if (status === 'passed') return 'All compliance checks passed';

    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    return parts.join(', ');
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            config.bgClass,
            config.color,
            size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1',
            'cursor-help'
          )}
        >
          <Icon className={cn('mr-1', size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')} />
          {showLabel ? (
            config.label
          ) : status === 'critical' || status === 'warning' ? (
            <span className="text-xs">
              {criticalCount > 0 && criticalCount}
              {criticalCount > 0 && warningCount > 0 && '/'}
              {warningCount > 0 && warningCount}
            </span>
          ) : null}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="bg-secondary border border text-foreground">
        <p>{tooltipContent()}</p>
        {complianceNotes && complianceNotes.length > 0 && status !== 'passed' && (
          <ul className="mt-1 text-xs text-muted-foreground max-w-xs">
            {complianceNotes.slice(0, 3).map((note, i) => (
              <li key={i} className="truncate">
                • {note.replace(/\[(CRITICAL|WARNING|INFO)\]\s*/i, '')}
              </li>
            ))}
            {complianceNotes.length > 3 && (
              <li className="text-muted-foreground">+ {complianceNotes.length - 3} more...</li>
            )}
          </ul>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export { parseComplianceStatus, type ComplianceStatus };
