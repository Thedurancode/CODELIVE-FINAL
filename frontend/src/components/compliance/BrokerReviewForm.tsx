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
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  UserCheck,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useStateBrokerDecisions,
  useUpdatePhase8,
  type BrokerDecision,
  type BrokerDecisionOption,
} from '@/hooks/use-state-compliance';

interface BrokerReviewFormProps {
  dealId: number;
  state: string;
  reviewerName?: string;
  currentDecision?: BrokerDecision;
  currentNotes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  isReadOnly?: boolean;
  onComplete?: () => void;
}

const DECISION_ICONS: Record<BrokerDecision, typeof CheckCircle2> = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  needs_info: HelpCircle,
};

const DECISION_COLORS: Record<BrokerDecision, string> = {
  pending: 'text-muted-foreground',
  approved: 'text-green-500',
  rejected: 'text-red-500',
  needs_info: 'text-amber-500',
};

export function BrokerReviewForm({
  dealId,
  state,
  reviewerName = '',
  currentDecision,
  currentNotes,
  reviewedAt,
  reviewedBy,
  isReadOnly = false,
  onComplete,
}: BrokerReviewFormProps) {
  const [selectedDecision, setSelectedDecision] = useState<BrokerDecision | undefined>(
    currentDecision
  );
  const [notes, setNotes] = useState(currentNotes || '');
  const [reviewer, setReviewer] = useState(reviewerName);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const { data: decisionsData, isLoading: isLoadingDecisions } = useStateBrokerDecisions(state);
  const updatePhase8 = useUpdatePhase8();

  const decisionOptions: BrokerDecisionOption[] = decisionsData?.data || [];

  const handleSelectDecision = (decision: BrokerDecision) => {
    if (isReadOnly) return;
    setSelectedDecision(decision);
    setError(null);
  };

  const validateForm = (): boolean => {
    if (!selectedDecision) {
      setError('Please select a decision');
      return false;
    }
    if (!reviewer.trim()) {
      setError('Reviewer name is required');
      return false;
    }
    const option = decisionOptions.find((o) => o.decision === selectedDecision);
    if (option?.requiresNotes && !notes.trim()) {
      setError('Notes are required for this decision');
      return false;
    }
    return true;
  };

  const handleSubmitClick = () => {
    if (!validateForm()) return;
    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmDialog(false);

    try {
      const result = await updatePhase8.mutateAsync({
        dealId,
        reviewedBy: reviewer.trim(),
        decision: selectedDecision!,
        notes: notes.trim() || undefined,
      });

      if (result.success) {
        onComplete?.();
      } else {
        setError('Failed to submit broker review');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit broker review');
    }
  };

  const selectedOption = decisionOptions.find((o) => o.decision === selectedDecision);

  if (isLoadingDecisions) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-16 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show completed state if already reviewed
  if (isReadOnly && currentDecision && currentDecision !== 'pending') {
    const DecisionIcon = DECISION_ICONS[currentDecision];
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Broker Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
            <DecisionIcon className={cn('h-6 w-6', DECISION_COLORS[currentDecision])} />
            <div>
              <div className="font-medium capitalize">
                {currentDecision === 'needs_info' ? 'Needs More Info' : currentDecision}
              </div>
              <div className="text-sm text-muted-foreground">
                Reviewed by {reviewedBy} on{' '}
                {reviewedAt ? new Date(reviewedAt).toLocaleDateString() : 'N/A'}
              </div>
            </div>
          </div>
          {currentNotes && (
            <div className="p-4 rounded-lg border">
              <Label className="text-xs text-muted-foreground">Review Notes</Label>
              <p className="text-sm mt-1">{currentNotes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Broker Review
          </CardTitle>
          <CardDescription>
            Review this deal and approve or reject for distribution. This action requires broker
            authorization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Reviewer Name */}
          <div className="space-y-2">
            <Label htmlFor="reviewer-name">Reviewer Name *</Label>
            <input
              id="reviewer-name"
              type="text"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder="Enter your name"
              disabled={isReadOnly}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Decision Options */}
          <div className="space-y-2">
            <Label>Decision *</Label>
            <div className="grid gap-3">
              {decisionOptions
                .filter((o) => o.decision !== 'pending')
                .map((option) => (
                  <BrokerDecisionCard
                    key={option.decision}
                    option={option}
                    isSelected={selectedDecision === option.decision}
                    isReadOnly={isReadOnly}
                    onSelect={handleSelectDecision}
                  />
                ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="review-notes">
              Notes {selectedOption?.requiresNotes ? '*' : '(optional)'}
            </Label>
            <Textarea
              id="review-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                selectedOption?.requiresNotes
                  ? 'Please provide details for your decision...'
                  : 'Add any additional notes about this review...'
              }
              disabled={isReadOnly}
              rows={4}
            />
            {selectedOption?.requiresNotes && (
              <p className="text-xs text-muted-foreground">
                Notes are required when selecting "{selectedOption.label}"
              </p>
            )}
          </div>

          {!isReadOnly && (
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSubmitClick}
                disabled={!selectedDecision || !reviewer.trim() || updatePhase8.isPending}
                className={cn(
                  selectedDecision === 'approved' && 'bg-green-600 hover:bg-green-700',
                  selectedDecision === 'rejected' && 'bg-red-600 hover:bg-red-700',
                  selectedDecision === 'needs_info' && 'bg-amber-600 hover:bg-amber-700'
                )}
              >
                {updatePhase8.isPending ? 'Submitting...' : 'Submit Review'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Broker Review</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to submit your review as{' '}
              <span className="font-medium text-foreground">{reviewer}</span> with decision:{' '}
              <Badge
                className={cn(
                  selectedDecision === 'approved' && 'bg-green-500',
                  selectedDecision === 'rejected' && 'bg-red-500',
                  selectedDecision === 'needs_info' && 'bg-amber-500'
                )}
              >
                {selectedDecision === 'needs_info'
                  ? 'Needs More Info'
                  : selectedDecision?.toUpperCase()}
              </Badge>
              <br />
              <br />
              This action will be recorded in the compliance audit log and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSubmit}
              className={cn(
                selectedDecision === 'approved' && 'bg-green-600 hover:bg-green-700',
                selectedDecision === 'rejected' && 'bg-red-600 hover:bg-red-700',
                selectedDecision === 'needs_info' && 'bg-amber-600 hover:bg-amber-700'
              )}
            >
              Confirm & Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface BrokerDecisionCardProps {
  option: BrokerDecisionOption;
  isSelected: boolean;
  isReadOnly: boolean;
  onSelect: (decision: BrokerDecision) => void;
}

function BrokerDecisionCard({
  option,
  isSelected,
  isReadOnly,
  onSelect,
}: BrokerDecisionCardProps) {
  const Icon = DECISION_ICONS[option.decision];
  const colorClass = DECISION_COLORS[option.decision];

  return (
    <div
      className={cn(
        'relative rounded-lg border p-4 transition-all',
        isSelected && 'ring-2',
        isSelected && option.decision === 'approved' && 'border-green-500 ring-green-500/20',
        isSelected && option.decision === 'rejected' && 'border-red-500 ring-red-500/20',
        isSelected && option.decision === 'needs_info' && 'border-amber-500 ring-amber-500/20',
        !isReadOnly && 'cursor-pointer hover:border-muted-foreground/50',
        isReadOnly && 'cursor-default'
      )}
      onClick={() => !isReadOnly && onSelect(option.decision)}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('h-5 w-5 mt-0.5', colorClass)} />
        <div className="flex-1">
          <div className="font-medium">{option.label}</div>
          <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
        </div>
        {isSelected && (
          <div
            className={cn(
              'h-4 w-4 rounded-full flex items-center justify-center',
              option.decision === 'approved' && 'bg-green-500',
              option.decision === 'rejected' && 'bg-red-500',
              option.decision === 'needs_info' && 'bg-amber-500'
            )}
          >
            <CheckCircle2 className="h-3 w-3 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}

export default BrokerReviewForm;
