'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useComplianceCheck,
  useComplianceIssueReviews,
  useReviewComplianceIssue,
  type ComplianceIssue,
  type ComplianceIssueReview,
} from '@/hooks/use-compliance-rules';

interface ComplianceIssueReviewPanelProps {
  checkId?: number;
}

type ReviewDraft = {
  decision: 'confirmed' | 'dismissed' | 'overridden';
  notes?: string;
  overrideSeverity?: 'critical' | 'warning' | 'info' | '';
  overrideMessage?: string;
};

const severityStyles: Record<NonNullable<ComplianceIssue['severity']>, string> = {
  critical: 'border-red-500/40 text-red-300 bg-red-500/10',
  warning: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
  info: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
};

const qualityStyles: Record<string, string> = {
  known: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  inferred: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
  unknown: 'border-zinc-500/40 text-foreground bg-zinc-500/10',
};

const linkLabels: Record<string, string> = {
  property: 'Property',
  documents: 'Documents',
  documentRequirements: 'Doc Requirements',
  contacts: 'Contacts',
  contact: 'Contact',
  document: 'Document',
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '—';
    }
  }
  return String(value);
}

function formatSource(issue: ComplianceIssue) {
  if (!issue.valueSource) return 'Unknown';
  if (issue.valueSource === 'contact' && issue.sourceDetail?.role) {
    return `Contact (${issue.sourceDetail.role})`;
  }
  if (issue.valueSource === 'ocr') return 'Contract OCR';
  if (issue.valueSource === 'document') return 'Document Status';
  if (issue.valueSource === 'evidence') return 'Evidence Requirement';
  return issue.valueSource.charAt(0).toUpperCase() + issue.valueSource.slice(1);
}

function formatConfidence(confidence?: number | null) {
  if (confidence === null || confidence === undefined) return null;
  return `${Math.round(confidence * 100)}%`;
}

export function ComplianceIssueReviewPanel({ checkId }: ComplianceIssueReviewPanelProps) {
  const { data: check, isLoading } = useComplianceCheck(checkId);
  const { data: reviews = [] } = useComplianceIssueReviews(checkId);
  const reviewIssue = useReviewComplianceIssue();
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);

  const reviewMap = useMemo(() => {
    return reviews.reduce<Record<string, ComplianceIssueReview>>((acc, review) => {
      acc[review.issueId] = review;
      return acc;
    }, {});
  }, [reviews]);

  const issues = check?.issues || [];

  const getDraft = (issueId: string, review?: ComplianceIssueReview): ReviewDraft => {
    if (drafts[issueId]) return drafts[issueId];
    return {
      decision: review?.decision || 'confirmed',
      notes: review?.notes || '',
      overrideSeverity: review?.overrideSeverity || '',
      overrideMessage: review?.overrideMessage || '',
    };
  };

  const updateDraft = (issueId: string, update: Partial<ReviewDraft>, review?: ComplianceIssueReview) => {
    const next = { ...getDraft(issueId, review), ...update };
    setDrafts((prev) => ({ ...prev, [issueId]: next }));
  };

  const submitReview = (issueId: string, draft: ReviewDraft) => {
    if (!checkId) return;

    if (draft.decision === 'overridden' && !draft.overrideSeverity && !draft.overrideMessage) {
      toast.error('Override needs a severity or message.');
      return;
    }

    setActiveIssueId(issueId);
    reviewIssue.mutate(
      {
        checkId,
        issueId,
        decision: draft.decision,
        notes: draft.notes || null,
        overrideSeverity: draft.overrideSeverity || null,
        overrideMessage: draft.overrideMessage || null,
      },
      {
        onSuccess: () => {
          toast.success('Review saved.');
          setActiveIssueId(null);
        },
        onError: (error: any) => {
          toast.error(error?.message || 'Failed to save review.');
          setActiveIssueId(null);
        },
      }
    );
  };

  if (!checkId) {
    return <p className="text-xs text-muted-foreground">Run a compliance check to see issue details.</p>;
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/2 bg-secondary" />
        <Skeleton className="h-16 w-full bg-secondary" />
      </div>
    );
  }

  if (!check || issues.length === 0) {
    return <p className="text-xs text-muted-foreground">No compliance issues found in the latest check.</p>;
  }

  return (
    <div className="space-y-4">
      {issues.map((issue) => {
        const issueId = issue.issueId || `${issue.ruleId}-${issue.field}-${issue.message}`;
        const review = reviewMap[issueId];
        const draft = getDraft(issueId, review);
        const isSubmitting = reviewIssue.isPending && activeIssueId === issueId;
        const quality = issue.dataQuality;
        const links = issue.links || {};
        const linkEntries = Object.entries(links).filter(([, value]) => Boolean(value));

        return (
          <div key={issueId} className="rounded-lg border border bg-card/60 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn('text-xs', severityStyles[issue.severity])}>
                {issue.severity.toUpperCase()}
              </Badge>
              <span className="text-sm text-foreground font-medium">{issue.ruleName}</span>
              <span className="text-xs text-muted-foreground">{issue.field}</span>
              {review && (
                <Badge variant="outline" className="text-[10px] border-cyan-500/40 text-cyan-300 bg-cyan-500/10">
                  {review.decision.toUpperCase()}
                </Badge>
              )}
            </div>

            <p className="text-sm text-foreground">{issue.message}</p>

            <div className="grid gap-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span>Current: <span className="text-foreground">{formatValue(issue.currentValue)}</span></span>
                <span>Expected: <span className="text-foreground">{formatValue(issue.expectedValue)}</span></span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>Source: <span className="text-foreground">{formatSource(issue)}</span></span>
                {issue.sourceDetail?.submissionId && (
                  <span>Submission: <span className="text-foreground">#{issue.sourceDetail.submissionId}</span></span>
                )}
              </div>
              {quality && (
                <div className="flex flex-wrap items-center gap-2">
                  <span>Quality:</span>
                  <Badge variant="outline" className={cn('text-[10px]', qualityStyles[quality.status])}>
                    {quality.status.toUpperCase()}
                  </Badge>
                  {quality.source && <span>Source: <span className="text-foreground">{quality.source}</span></span>}
                  {formatConfidence(quality.confidence) && (
                    <span>Confidence: <span className="text-foreground">{formatConfidence(quality.confidence)}</span></span>
                  )}
                </div>
              )}
            </div>

            {linkEntries.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {linkEntries.map(([key, value]) => (
                  <Link
                    key={key}
                    href={value}
                    className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                  >
                    {linkLabels[key] || key}
                  </Link>
                ))}
              </div>
            )}

            <div className="rounded-md border border bg-card/80 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Review Decision</Label>
                {review && review.reviewerEmail && (
                  <span className="text-[11px] text-muted-foreground">Reviewed by {review.reviewerEmail}</span>
                )}
              </div>

              <div className="grid gap-3">
                <Select
                  value={draft.decision}
                  onValueChange={(value) => updateDraft(issueId, { decision: value as ReviewDraft['decision'] }, review)}
                >
                  <SelectTrigger className="bg-card border text-foreground">
                    <SelectValue placeholder="Decision" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border text-foreground">
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                    <SelectItem value="overridden">Overridden</SelectItem>
                  </SelectContent>
                </Select>

                <Textarea
                  value={draft.notes || ''}
                  onChange={(event) => updateDraft(issueId, { notes: event.target.value }, review)}
                  placeholder="Reviewer notes"
                  className="min-h-[80px] bg-card border text-foreground"
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Override Severity</Label>
                    <Select
                      value={draft.overrideSeverity || ''}
                      onValueChange={(value) => updateDraft(issueId, { overrideSeverity: value as ReviewDraft['overrideSeverity'] }, review)}
                    >
                      <SelectTrigger className="bg-card border text-foreground">
                        <SelectValue placeholder="Select severity" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border text-foreground">
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Override Message</Label>
                    <Input
                      value={draft.overrideMessage || ''}
                      onChange={(event) => updateDraft(issueId, { overrideMessage: event.target.value }, review)}
                      placeholder="Optional override message"
                      className="bg-card border text-foreground"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    onClick={() => submitReview(issueId, draft)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Saving...' : 'Save Review'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
