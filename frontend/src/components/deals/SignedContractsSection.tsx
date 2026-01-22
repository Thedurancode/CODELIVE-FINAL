'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FileSignature,
  Download,
  ExternalLink,
  RefreshCw,
  Bell,
  Check,
  Clock,
  Eye,
  X,
  AlertTriangle,
  Loader2,
  User,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useSignedContracts,
  useSendContractReminder,
  useSyncContractStatus,
  getContractStatusDisplay,
  formatContractDate,
  type SignedContract,
} from '@/hooks/use-signed-contracts';

interface SignedContractsSectionProps {
  propertyId: string | number;
}

export function SignedContractsSection({ propertyId }: SignedContractsSectionProps) {
  const { data, isLoading, error, refetch } = useSignedContracts(propertyId);
  const sendReminder = useSendContractReminder();
  const syncStatus = useSyncContractStatus();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailsDialog, setDetailsDialog] = useState<SignedContract | null>(null);

  const contracts: SignedContract[] = data || [];

  const handleSendReminder = async (contract: SignedContract) => {
    try {
      await sendReminder.mutateAsync(contract.id);
      toast.success('Reminder sent', {
        description: 'Pending signers have been notified',
      });
    } catch (error: any) {
      toast.error('Failed to send reminder', {
        description: error.message,
      });
    }
  };

  const handleSyncStatus = async (contract: SignedContract) => {
    try {
      await syncStatus.mutateAsync(contract.id);
      toast.success('Status synced', {
        description: 'Contract status updated from DocuSeal',
      });
    } catch (error: any) {
      toast.error('Failed to sync status', {
        description: error.message,
      });
    }
  };

  const getSignerProgress = (contract: SignedContract) => {
    if (!contract.submitters?.length) return { completed: 0, total: 0, percent: 0 };
    const completed = contract.submitters.filter(s => s.status === 'completed').length;
    const total = contract.submitters.length;
    return { completed, total, percent: Math.round((completed / total) * 100) };
  };

  const getStatusIcon = (status: SignedContract['status']) => {
    switch (status) {
      case 'completed':
        return <Check className="h-4 w-4" />;
      case 'pending':
      case 'sent':
        return <Clock className="h-4 w-4" />;
      case 'viewed':
      case 'partially_signed':
        return <Eye className="h-4 w-4" />;
      case 'declined':
        return <X className="h-4 w-4" />;
      case 'expired':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <FileSignature className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-card border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <FileSignature className="h-5 w-5 text-emerald-500" />
            Signed Contracts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <FileSignature className="h-5 w-5 text-emerald-500" />
            Signed Contracts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
            <p className="text-sm text-amber-400">Could not load contracts</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="mt-2 text-muted-foreground hover:text-foreground"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <FileSignature className="h-5 w-5 text-emerald-500" />
            Signed Contracts
            {contracts.length > 0 && (
              <Badge variant="outline" className="ml-2 bg-secondary text-muted-foreground border">
                {contracts.length}
              </Badge>
            )}
          </div>
          {contracts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <FileSignature className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No contracts sent yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Contracts will appear here when sent via DocuSeal
            </p>
          </div>
        ) : (
          contracts.map((contract) => {
            const statusDisplay = getContractStatusDisplay(contract.status);
            const progress = getSignerProgress(contract);
            const isExpanded = expandedId === contract.id;

            return (
              <div
                key={contract.id}
                className="rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
              >
                {/* Main Row */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : contract.id)}
                >
                  {/* Status Icon */}
                  <div className={cn(
                    'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                    contract.status === 'completed' ? 'bg-emerald-500/10' : 'bg-zinc-500/10'
                  )}>
                    {contract.status === 'completed' ? (
                      <FileCheck className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <FileSignature className={cn('h-5 w-5', statusDisplay.color)} />
                    )}
                  </div>

                  {/* Contract Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {contract.templateName || contract.documentCategory || 'Contract'}
                      </p>
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', statusDisplay.bgColor, statusDisplay.color)}>
                        {getStatusIcon(contract.status)}
                        <span className="ml-1">{statusDisplay.label}</span>
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {contract.state && (
                        <span className="text-[10px] text-muted-foreground">
                          {contract.state}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatContractDate(contract.sentAt || contract.createdAt)}
                      </span>
                    </div>

                    {/* Progress Bar for multi-signer contracts */}
                    {progress.total > 1 && contract.status !== 'completed' && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                          <span>{progress.completed} of {progress.total} signed</span>
                          <span>{progress.percent}%</span>
                        </div>
                        <Progress value={progress.percent} className="h-1" />
                      </div>
                    )}
                  </div>

                  {/* Expand/Collapse */}
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 border-t border-border/50">
                    {/* Signers */}
                    {contract.submitters && contract.submitters.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                          Signers
                        </p>
                        <div className="space-y-2">
                          {contract.submitters.map((signer: SignedContract['submitters'][number], idx: number) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between py-1.5 px-2 rounded bg-background/50"
                            >
                              <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-foreground">{signer.email}</span>
                                {signer.role && (
                                  <span className="text-[10px] text-muted-foreground">
                                    ({signer.role})
                                  </span>
                                )}
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] px-1.5 py-0',
                                  signer.status === 'completed'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : signer.status === 'declined'
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                    : 'bg-zinc-500/10 text-muted-foreground border-zinc-500/20'
                                )}
                              >
                                {signer.status === 'completed' && <Check className="h-3 w-3 mr-1" />}
                                {signer.status === 'declined' && <X className="h-3 w-3 mr-1" />}
                                {signer.status === 'opened' && <Eye className="h-3 w-3 mr-1" />}
                                {signer.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      {contract.sentAt && (
                        <div>
                          <span className="text-muted-foreground">Sent:</span>{' '}
                          <span className="text-foreground">{formatContractDate(contract.sentAt)}</span>
                        </div>
                      )}
                      {contract.firstViewedAt && (
                        <div>
                          <span className="text-muted-foreground">First Viewed:</span>{' '}
                          <span className="text-foreground">{formatContractDate(contract.firstViewedAt)}</span>
                        </div>
                      )}
                      {contract.completedAt && (
                        <div>
                          <span className="text-muted-foreground">Completed:</span>{' '}
                          <span className="text-emerald-400">{formatContractDate(contract.completedAt)}</span>
                        </div>
                      )}
                      {contract.declinedAt && (
                        <div>
                          <span className="text-muted-foreground">Declined:</span>{' '}
                          <span className="text-red-400">{formatContractDate(contract.declinedAt)}</span>
                        </div>
                      )}
                      {contract.expireAt && contract.status !== 'completed' && (
                        <div>
                          <span className="text-muted-foreground">Expires:</span>{' '}
                          <span className="text-amber-400">{formatContractDate(contract.expireAt)}</span>
                        </div>
                      )}
                    </div>

                    {/* Decline Reason */}
                    {contract.declineReason && (
                      <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/20">
                        <p className="text-[11px] text-red-400">
                          <strong>Decline Reason:</strong> {contract.declineReason}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {/* Download Signed Document */}
                      {contract.status === 'completed' && contract.combinedDocumentUrl && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(contract.combinedDocumentUrl, '_blank');
                                }}
                                className="h-8 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                              >
                                <Download className="h-3.5 w-3.5 mr-1" />
                                Download Signed
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Download the fully signed document</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* View Audit Log */}
                      {contract.auditLogUrl && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(contract.auditLogUrl, '_blank');
                                }}
                                className="h-8 text-xs border text-muted-foreground hover:text-foreground hover:bg-secondary"
                              >
                                <Shield className="h-3.5 w-3.5 mr-1" />
                                Audit Log
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>View signing audit trail</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* Send Reminder (only for pending/viewed) */}
                      {['pending', 'sent', 'viewed', 'partially_signed'].includes(contract.status) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSendReminder(contract);
                                }}
                                disabled={sendReminder.isPending}
                                className="h-8 text-xs border text-muted-foreground hover:text-foreground hover:bg-secondary"
                              >
                                {sendReminder.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                ) : (
                                  <Bell className="h-3.5 w-3.5 mr-1" />
                                )}
                                Remind
                                {contract.reminderCount > 0 && (
                                  <span className="ml-1 text-[10px] text-muted-foreground">
                                    ({contract.reminderCount})
                                  </span>
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Send reminder to pending signers</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* Sync Status */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSyncStatus(contract);
                              }}
                              disabled={syncStatus.isPending}
                              className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary"
                            >
                              {syncStatus.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Sync status with DocuSeal</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
