'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileCheck,
  Send,
  Check,
  Clock,
  Circle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Bell,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import {
  useDocumentRequirements,
  useSendDocument,
  useSendDocumentReminder,
  useSyncDocumentStatus,
  DocumentRequirement,
  DocumentRequirementStatus,
} from '@/hooks/use-document-checklist';
import { useLatestComplianceCheck } from '@/hooks/use-compliance-rules';
import { DOCUMENT_CATEGORIES } from '@/hooks/use-document-templates';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface DocumentRequirementsChecklistProps {
  propertyId: string;
  propertyState?: string;
  transactionType?: 'wholesaling' | 'retail' | 'all';
}

// Status configuration for display
const statusConfig: Record<DocumentRequirementStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode
}> = {
  missing: {
    label: 'Not Sent',
    color: 'text-muted-foreground',
    bgColor: 'bg-zinc-500/10',
    icon: <Circle className="h-4 w-4" />,
  },
  pending: {
    label: 'Pending',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    icon: <Clock className="h-4 w-4" />,
  },
  completed: {
    label: 'Signed',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    icon: <Check className="h-4 w-4" />,
  },
  needs_resend: {
    label: 'Needs Resend',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    icon: <AlertCircle className="h-4 w-4" />,
  },
};

export function DocumentRequirementsChecklist({
  propertyId,
  propertyState,
  transactionType = 'wholesaling',
}: DocumentRequirementsChecklistProps) {
  const { data: requirements, isLoading, error, refetch } = useDocumentRequirements(propertyId, transactionType);
  const { data: latestComplianceCheck, isLoading: ocrLoading } = useLatestComplianceCheck(propertyId);
  const sendDocument = useSendDocument();
  const sendReminder = useSendDocumentReminder();
  const syncStatus = useSyncDocumentStatus();

  const [expanded, setExpanded] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentRequirement | null>(null);
  const [signerEmail, setSignerEmail] = useState('');
  const [signerName, setSignerName] = useState('');

  const handleSendDocument = async () => {
    if (!selectedDocument || !signerEmail) return;

    try {
      await sendDocument.mutateAsync({
        templateId: selectedDocument.docuSealTemplateId,
        propertyId,
        signers: [
          {
            email: signerEmail,
            name: signerName || undefined,
            role: 'signer',
          },
        ],
        expiresInDays: 7,
      });
      toast.success(`${selectedDocument.name} sent for signature`);
      setSendDialogOpen(false);
      setSelectedDocument(null);
      setSignerEmail('');
      setSignerName('');
    } catch {
      toast.error('Failed to send document');
    }
  };

  const handleSendReminder = async (doc: DocumentRequirement) => {
    if (!doc.submission?.submissionId) return;

    try {
      await sendReminder.mutateAsync({
        submissionId: doc.submission.submissionId,
        propertyId,
      });
      toast.success('Reminder sent');
    } catch {
      toast.error('Failed to send reminder');
    }
  };

  const handleSync = async (doc: DocumentRequirement) => {
    if (!doc.submission?.submissionId) return;

    try {
      await syncStatus.mutateAsync({
        submissionId: doc.submission.submissionId,
        propertyId,
      });
      toast.success('Status synced');
    } catch {
      toast.error('Failed to sync status');
    }
  };

  const openSendDialog = (doc: DocumentRequirement) => {
    setSelectedDocument(doc);
    setSendDialogOpen(true);
  };

  if (isLoading) {
    return (
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <FileCheck className="h-5 w-5 text-cyan-500" />
            Required Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !requirements) {
    return (
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <FileCheck className="h-5 w-5 text-cyan-500" />
            Required Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-muted-foreground text-sm mb-3">
              {error ? 'Failed to load document requirements' : 'No checklist available'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { requirements: docs, summary, allSatisfied } = requirements;
  const completionPercentage = summary.total > 0
    ? Math.round((summary.completed / summary.total) * 100)
    : 100;
  const displayDocs = expanded ? docs : docs.slice(0, 4);
  const contractOcr = latestComplianceCheck?.contractOcr || null;
  const ocrConfidence = contractOcr && typeof contractOcr.confidence === 'number'
    ? Math.round(contractOcr.confidence * 100)
    : null;
  const ocrFields = contractOcr?.extractedFields || {};
  const ocrPurchasePrice = formatOcrNumber(ocrFields.purchasePrice);
  const ocrClosingDate = formatOcrDate(ocrFields.closingDate);
  const ocrExpirationDate = formatOcrDate(ocrFields.contractExpirationDate);
  const ocrEvidence: Record<string, { page?: number; snippet?: string; confidence?: number }> =
    contractOcr?.fieldEvidence || {};
  const evidenceEntries = [
    { key: 'sellerName', label: 'Seller', evidence: ocrEvidence.sellerName },
    { key: 'buyerName', label: 'Buyer', evidence: ocrEvidence.buyerName },
    { key: 'purchasePrice', label: 'Price', evidence: ocrEvidence.purchasePrice },
    { key: 'closingDate', label: 'Closing', evidence: ocrEvidence.closingDate },
    { key: 'contractExpirationDate', label: 'Expiration', evidence: ocrEvidence.contractExpirationDate },
    { key: 'propertyAddress', label: 'Address', evidence: ocrEvidence.propertyAddress },
    { key: 'assignable', label: 'Assignable', evidence: ocrEvidence.assignable },
    { key: 'marketingClauseFound', label: 'Marketing', evidence: ocrEvidence.marketingClauseFound },
  ].filter(entry => entry.evidence && (entry.evidence.snippet || typeof entry.evidence.page === 'number'));

  return (
    <>
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-foreground">
              <FileCheck className="h-5 w-5 text-cyan-500" />
              Required Documents
            </span>
            <div className="flex items-center gap-2">
              {propertyState && (
                <Badge variant="outline" className="text-muted-foreground border">
                  {propertyState}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  allSatisfied
                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                    : summary.pending > 0
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'text-muted-foreground border'
                )}
              >
                {summary.completed}/{summary.total} signed
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Completion</span>
              <span className="text-foreground font-medium">{completionPercentage}%</span>
            </div>
            <Progress
              value={completionPercentage}
              className="h-2 bg-secondary"
            />
          </div>

          {/* Contract OCR Summary */}
          <div className="rounded-lg border bg-card/60 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-3 bg-secondary/30 border-b">
              <span className="text-sm font-medium text-foreground">Contract OCR</span>
              {ocrLoading ? (
                <Badge variant="outline" className="text-muted-foreground">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Loading
                </Badge>
              ) : contractOcr ? (
                <Badge
                  variant="outline"
                  className={cn(
                    'font-medium',
                    contractOcr.success
                      ? 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10'
                      : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                  )}
                >
                  {contractOcr.success ? `AI Confidence: ${ocrConfidence ?? 0}%` : 'OCR Failed'}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not Run
                </Badge>
              )}
            </div>

            {contractOcr ? (
              <div className="p-3 space-y-4">
                {/* Key Flags - 2 column grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className={cn(
                    'flex items-center gap-2 p-2 rounded-md text-xs font-medium',
                    contractOcr.extractedFields?.assignable
                      ? 'bg-green-500/10 text-green-400'
                      : contractOcr.extractedFields?.assignable === false
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-secondary text-muted-foreground'
                  )}>
                    {contractOcr.extractedFields?.assignable ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : contractOcr.extractedFields?.assignable === false ? (
                      <AlertCircle className="h-3.5 w-3.5" />
                    ) : (
                      <Circle className="h-3.5 w-3.5" />
                    )}
                    Assignable
                  </div>
                  <div className={cn(
                    'flex items-center gap-2 p-2 rounded-md text-xs font-medium',
                    contractOcr.extractedFields?.marketingClauseFound
                      ? 'bg-green-500/10 text-green-400'
                      : contractOcr.extractedFields?.marketingClauseFound === false
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-secondary text-muted-foreground'
                  )}>
                    {contractOcr.extractedFields?.marketingClauseFound ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : contractOcr.extractedFields?.marketingClauseFound === false ? (
                      <AlertCircle className="h-3.5 w-3.5" />
                    ) : (
                      <Circle className="h-3.5 w-3.5" />
                    )}
                    Marketing Clause
                  </div>
                </div>

                {/* Extracted Fields - Clean table layout */}
                <div className="rounded-md border bg-secondary/20">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="px-3 py-2 text-muted-foreground w-24">Seller</td>
                        <td className="px-3 py-2 text-foreground font-medium">{formatOcrText(ocrFields.sellerName) || '—'}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-muted-foreground">Buyer</td>
                        <td className="px-3 py-2 text-foreground font-medium">{formatOcrText(ocrFields.buyerName) || '—'}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-muted-foreground">Price</td>
                        <td className="px-3 py-2 text-foreground font-medium">{formatOcrCurrency(ocrPurchasePrice)}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-muted-foreground">Closing</td>
                        <td className="px-3 py-2 text-foreground font-medium">{formatOcrDateDisplay(ocrClosingDate)}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-muted-foreground">Expiration</td>
                        <td className="px-3 py-2 text-foreground font-medium">{formatOcrDateDisplay(ocrExpirationDate)}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-muted-foreground">Address</td>
                        <td className="px-3 py-2 text-foreground font-medium truncate max-w-[200px]" title={formatOcrText(ocrFields.propertyAddress)}>
                          {formatOcrText(ocrFields.propertyAddress) || '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Source/Model metadata - subtle footer */}
                {(contractOcr.source || contractOcr.model) && (
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    {contractOcr.source && (
                      <span>Source: <span className="text-foreground/70">{String(contractOcr.source).toUpperCase()}</span></span>
                    )}
                    {contractOcr.model && (
                      <span>Model: <span className="text-foreground/70">{contractOcr.model}</span></span>
                    )}
                  </div>
                )}

                {/* Evidence Section - Collapsible style */}
                {evidenceEntries.length > 0 && (
                  <div className="border-t pt-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                      Extracted Evidence
                    </div>
                    <div className="space-y-2">
                      {evidenceEntries.map(entry => {
                        const meta = formatEvidenceMeta(entry.evidence);
                        return (
                          <div key={entry.key} className="p-2 rounded-md bg-secondary/30 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-foreground">{entry.label}</span>
                              {meta && (
                                <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                                  {meta}
                                </span>
                              )}
                            </div>
                            <div
                              className="text-muted-foreground italic line-clamp-2"
                              title={entry.evidence?.snippet}
                            >
                              {formatEvidenceSnippet(entry.evidence?.snippet)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  OCR summary appears after a compliance check with a contract upload.
                </p>
              </div>
            )}
          </div>

          {/* Document List */}
          {docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6">
              <FileText className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">No documents required for {propertyState || 'this property'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayDocs.map((doc, index) => {
                const statusInfo = statusConfig[doc.status];
                const categoryInfo = DOCUMENT_CATEGORIES.find((c) => c.value === doc.category);

                return (
                  <div
                    key={`${doc.category || 'cat'}-${doc.templateId || index}`}
                    className="p-3 rounded-lg bg-secondary/50 border border-border/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn('flex items-center', statusInfo.color)}>
                            {statusInfo.icon}
                          </span>
                          <span className="text-foreground font-medium truncate">
                            {doc.name}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(statusInfo.color, statusInfo.bgColor, 'border-0 text-xs')}
                          >
                            {statusInfo.label}
                          </Badge>
                        </div>
                        {(doc.description || categoryInfo?.description) && (
                          <p className="text-muted-foreground text-xs">{doc.description || categoryInfo?.description}</p>
                        )}
                        {doc.submission?.sentAt && (
                          <p className="text-muted-foreground text-xs mt-1">
                            Sent {formatDistanceToNow(new Date(doc.submission.sentAt), { addSuffix: true })}
                          </p>
                        )}
                        {doc.submission?.submitters && doc.submission.submitters.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {doc.submission.submitters.map((signer, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className={cn(
                                  'text-xs font-normal',
                                  signer.status === 'completed'
                                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                                    : 'bg-secondary/50 text-muted-foreground border-border/50'
                                )}
                              >
                                {signer.email.split('@')[0]}
                                {signer.status === 'completed' && (
                                  <Check className="h-3 w-3 ml-1" />
                                )}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {doc.status === 'missing' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                            onClick={() => openSendDialog(doc)}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Send
                          </Button>
                        )}
                        {doc.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                              onClick={() => handleSendReminder(doc)}
                              disabled={sendReminder.isPending}
                              title="Send reminder"
                            >
                              <Bell className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-zinc-500/10"
                              onClick={() => handleSync(doc)}
                              disabled={syncStatus.isPending}
                              title="Sync status"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {doc.status === 'completed' && doc.submission?.submissionId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                            asChild
                          >
                            <a
                              href={`/api/contracts/${doc.submission.submissionId}/documents`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View
                            </a>
                          </Button>
                        )}
                        {doc.status === 'needs_resend' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => openSendDialog(doc)}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Resend
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Show more/less button */}
              {docs.length > 4 && (
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-foreground"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-2" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      Show all {docs.length} documents
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {/* Summary / Next Steps */}
          {(summary.missing > 0 || summary.pending > 0) && (
            <div className="pt-3 border-t">
              <p className="text-muted-foreground text-xs font-medium mb-2">Next Steps</p>
              <ul className="space-y-1">
                {summary.missing > 0 && (
                  <li className="text-muted-foreground text-sm flex items-start gap-2">
                    <span className="text-cyan-500 mt-1">•</span>
                    Send {summary.missing} missing document{summary.missing > 1 ? 's' : ''} for signature
                  </li>
                )}
                {summary.pending > 0 && (
                  <li className="text-muted-foreground text-sm flex items-start gap-2">
                    <span className="text-amber-500 mt-1">•</span>
                    Wait for {summary.pending} pending document{summary.pending > 1 ? 's' : ''} to be signed
                  </li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Document Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="bg-card border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-cyan-500" />
              Send Document for Signature
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Send {selectedDocument?.name} for e-signature
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedDocument && (
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-foreground font-medium">{selectedDocument.name}</p>
                <p className="text-muted-foreground text-sm">
                  {DOCUMENT_CATEGORIES.find((c) => c.value === selectedDocument.category)?.description}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="signer-email">Signer Email *</Label>
              <Input
                id="signer-email"
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                className="bg-secondary border"
                placeholder="signer@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signer-name">Signer Name (optional)</Label>
              <Input
                id="signer-name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="bg-secondary border"
                placeholder="John Doe"
              />
            </div>

            <p className="text-muted-foreground text-xs">
              The document will expire in 7 days. Property details will be automatically filled.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSendDialogOpen(false)}
              className="border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendDocument}
              disabled={!signerEmail || sendDocument.isPending}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {sendDocument.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Document
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatOcrValue(value?: boolean) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Unknown';
}

function formatOcrText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function formatOcrNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function formatOcrDate(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  return undefined;
}

function formatOcrCurrency(value?: number): string {
  if (!value) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatOcrDateDisplay(value?: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatEvidenceSnippet(snippet?: string): string {
  if (!snippet) return '—';
  const cleaned = snippet.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 90) {
    return `"${cleaned}"`;
  }
  return `"${cleaned.slice(0, 87)}..."`;
}

function formatEvidenceMeta(
  evidence?: { page?: number; confidence?: number }
): string | undefined {
  if (!evidence) return undefined;
  const parts: string[] = [];
  if (typeof evidence.page === 'number') {
    parts.push(`p. ${evidence.page}`);
  }
  if (typeof evidence.confidence === 'number') {
    parts.push(`${Math.round(evidence.confidence * 100)}%`);
  }
  return parts.length > 0 ? parts.join(' | ') : undefined;
}
