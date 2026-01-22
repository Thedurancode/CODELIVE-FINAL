'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Megaphone,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useUpdatePhase9,
  type DistributionStatus,
  type DistributionChannel,
} from '@/hooks/use-state-compliance';

interface DistributionStatusCardProps {
  dealId: number;
  currentStatus?: DistributionStatus;
  startedAt?: string;
  distributionChannels?: DistributionChannel[];
  currentNotes?: string;
  canStart?: boolean;
  isReadOnly?: boolean;
  onComplete?: () => void;
}

const STATUS_CONFIG: Record<
  DistributionStatus,
  { label: string; color: string; bgColor: string; icon: typeof Clock }
> = {
  pending: {
    label: 'Pending',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    icon: Clock,
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    icon: Play,
  },
  completed: {
    label: 'Completed',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    icon: XCircle,
  },
};

const CHANNEL_LABELS: Record<DistributionChannel, string> = {
  auction: 'Auction Services',
  funds: 'Funds/Institutional Buyers',
  private_buyers: 'Private Buyer Network',
};

export function DistributionStatusCard({
  dealId,
  currentStatus = 'pending',
  startedAt,
  distributionChannels = [],
  currentNotes,
  canStart = true,
  isReadOnly = false,
  onComplete,
}: DistributionStatusCardProps) {
  const [notes, setNotes] = useState(currentNotes || '');
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'start' | 'complete' | 'fail' | null>(null);

  const updatePhase9 = useUpdatePhase9();

  const statusConfig = STATUS_CONFIG[currentStatus];
  const StatusIcon = statusConfig.icon;

  const handleAction = async (action: 'start' | 'complete' | 'fail') => {
    setConfirmAction(null);
    setError(null);

    try {
      const result = await updatePhase9.mutateAsync({
        dealId,
        action,
        notes: notes.trim() || undefined,
      });

      if (result.success) {
        onComplete?.();
      } else {
        setError(`Failed to ${action} distribution`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} distribution`);
    }
  };

  const canPerformActions = !isReadOnly && !updatePhase9.isPending;

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Distribution Status
          </CardTitle>
          <CardDescription>
            Track and manage the distribution of this deal to buyers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Current Status */}
          <div
            className={cn(
              'flex items-center gap-3 p-4 rounded-lg',
              statusConfig.bgColor
            )}
          >
            <StatusIcon className={cn('h-6 w-6', statusConfig.color)} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{statusConfig.label}</span>
                <Badge variant="outline" className={statusConfig.color}>
                  {currentStatus.replace('_', ' ')}
                </Badge>
              </div>
              {startedAt && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <Calendar className="h-3 w-3" />
                  Started: {new Date(startedAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Distribution Channels */}
          {distributionChannels.length > 0 && (
            <div className="p-4 rounded-lg border">
              <Label className="text-xs text-muted-foreground">Distribution Channels</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {distributionChannels.map((channel) => (
                  <Badge key={channel} variant="secondary">
                    {CHANNEL_LABELS[channel] || channel}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {(currentStatus !== 'completed' || currentNotes) && (
            <div className="space-y-2">
              <Label htmlFor="distribution-notes">Notes</Label>
              <Textarea
                id="distribution-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about the distribution process..."
                disabled={isReadOnly || currentStatus === 'completed'}
                rows={3}
              />
            </div>
          )}

          {/* Action Buttons */}
          {!isReadOnly && (
            <div className="flex flex-wrap gap-2 pt-4">
              {currentStatus === 'pending' && canStart && (
                <Button
                  onClick={() => setConfirmAction('start')}
                  disabled={!canPerformActions}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Distribution
                </Button>
              )}

              {currentStatus === 'in_progress' && (
                <>
                  <Button
                    onClick={() => setConfirmAction('complete')}
                    disabled={!canPerformActions}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark Complete
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmAction('fail')}
                    disabled={!canPerformActions}
                    className="border-red-500 text-red-500 hover:bg-red-500/10"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Mark Failed
                  </Button>
                </>
              )}

              {currentStatus === 'failed' && (
                <Button
                  onClick={() => setConfirmAction('start')}
                  disabled={!canPerformActions}
                  variant="outline"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Retry Distribution
                </Button>
              )}

              {currentStatus === 'completed' && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Distribution completed successfully
                </div>
              )}
            </div>
          )}

          {!canStart && currentStatus === 'pending' && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Distribution cannot be started. Ensure broker approval and all required
                agreements are in place.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'start' && 'Start Distribution?'}
              {confirmAction === 'complete' && 'Complete Distribution?'}
              {confirmAction === 'fail' && 'Mark Distribution as Failed?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'start' &&
                'This will begin the distribution process for this deal. The deal will be sent to the selected distribution channels.'}
              {confirmAction === 'complete' &&
                'This will mark the distribution as complete. Make sure all distribution activities have finished.'}
              {confirmAction === 'fail' &&
                'This will mark the distribution as failed. You can retry the distribution later if needed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && handleAction(confirmAction)}
              className={cn(
                confirmAction === 'start' && 'bg-blue-600 hover:bg-blue-700',
                confirmAction === 'complete' && 'bg-green-600 hover:bg-green-700',
                confirmAction === 'fail' && 'bg-red-600 hover:bg-red-700'
              )}
            >
              {confirmAction === 'start' && 'Start Distribution'}
              {confirmAction === 'complete' && 'Mark Complete'}
              {confirmAction === 'fail' && 'Mark Failed'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default DistributionStatusCard;
