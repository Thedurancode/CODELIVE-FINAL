'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ListChecks } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  usePropertyChecklistSummary,
} from '@/hooks/use-property-checklist';
import { PropertyChecklistDialog } from './PropertyChecklistDialog';

interface PropertyChecklistButtonProps {
  propertyId: number;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showProgress?: boolean;
  className?: string;
  onContactItemClick?: (contactSpec: { category: string; role: string }) => void;
}

export function PropertyChecklistButton({
  propertyId,
  variant = 'outline',
  size = 'default',
  showProgress = true,
  className,
  onContactItemClick,
}: PropertyChecklistButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: summary, isLoading, error } = usePropertyChecklistSummary(propertyId);

  // Don't render if property ID is invalid
  if (!propertyId || isNaN(propertyId)) {
    return null;
  }

  const getProgressColor = () => {
    if (!summary) return 'text-muted-foreground';
    if (summary.blockingCount > 0) return 'text-red-600';
    if (summary.completedCount === summary.totalCount) return 'text-green-600';
    return 'text-yellow-600';
  };

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={() => setDialogOpen(true)}
        className={`h-8 px-3 ${className}`}
        disabled={error !== null}
        title={error ? 'Checklist unavailable' : 'View property checklist'}
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ListChecks className="h-3 w-3" />
        )}
        {summary && !error ? (
          <div className="flex items-center gap-2 ml-2">
            <span className={`text-sm font-semibold ${getProgressColor()}`}>
              {summary.overallProgress}%
            </span>
            <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  summary.blockingCount > 0
                    ? 'bg-red-600'
                    : summary.completedCount === summary.totalCount
                    ? 'bg-green-600'
                    : 'bg-yellow-600'
                }`}
                style={{ width: `${summary.overallProgress}%` }}
              />
            </div>
          </div>
        ) : null}
      </Button>

      <PropertyChecklistDialog
        propertyId={propertyId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onContactItemClick={onContactItemClick}
      />
    </>
  );
}
