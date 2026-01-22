'use client';

import { useState } from 'react';
import {
  usePendingApprovals,
  useApprovalStats,
  useApproveDeal,
  useRejectDeal,
  useRequestChanges,
  useApprovalHistory,
  PendingDeal,
  ApprovalHistoryEntry,
} from '@/hooks/use-deal-approvals';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  Clock,
  Home,
  DollarSign,
  MapPin,
  MoreHorizontal,
  AlertCircle,
  History,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function formatCurrency(value: number | undefined): string {
  if (!value) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAddress(deal: PendingDeal): string {
  const { address, city, state, zip } = deal;
  const street = address ? `${address.houseNumber || ''} ${address.street || ''}`.trim() : '';
  return `${street}, ${city}, ${state} ${zip}`;
}

export default function BrokerApprovalsPage() {
  const { data: deals = [], isLoading: dealsLoading, error: dealsError } = usePendingApprovals();
  const { data: stats, isLoading: statsLoading } = useApprovalStats();

  const approveDeal = useApproveDeal();
  const rejectDeal = useRejectDeal();
  const requestChanges = useRequestChanges();

  const [selectedDeal, setSelectedDeal] = useState<PendingDeal | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'changes' | 'history' | null>(null);
  const [notes, setNotes] = useState('');

  const { data: history = [] } = useApprovalHistory(
    actionType === 'history' && selectedDeal ? selectedDeal.id : null
  );

  const handleAction = (deal: PendingDeal, action: 'approve' | 'reject' | 'changes' | 'history') => {
    setSelectedDeal(deal);
    setActionType(action);
    setNotes('');
  };

  const handleSubmit = async () => {
    if (!selectedDeal) return;

    try {
      if (actionType === 'approve') {
        await approveDeal.mutateAsync({ propertyId: selectedDeal.id, notes: notes || undefined });
      } else if (actionType === 'reject') {
        if (!notes.trim()) {
          alert('Please provide a rejection reason');
          return;
        }
        await rejectDeal.mutateAsync({ propertyId: selectedDeal.id, reason: notes });
      } else if (actionType === 'changes') {
        if (!notes.trim()) {
          alert('Please describe the required changes');
          return;
        }
        await requestChanges.mutateAsync({ propertyId: selectedDeal.id, changes: notes });
      }
      setSelectedDeal(null);
      setActionType(null);
      setNotes('');
    } catch (error) {
      console.error('Action failed:', error);
    }
  };

  const isSubmitting = approveDeal.isPending || rejectDeal.isPending || requestChanges.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Deal Approvals</h1>
            <p className="text-muted-foreground">Review and approve deals before they go live in the marketplace</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground">Pending</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                <span className="text-2xl font-bold">
                  {statsLoading ? '...' : stats?.pending ?? 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground">Approved This Week</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">
                  {statsLoading ? '...' : stats?.approvedThisWeek ?? 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground">Rejected This Week</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <span className="text-2xl font-bold">
                  {statsLoading ? '...' : stats?.rejectedThisWeek ?? 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground">Avg. Approval Time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-accent-500" />
                <span className="text-2xl font-bold">
                  {statsLoading ? '...' : `${stats?.avgApprovalTimeHours ?? 0}h`}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Deals List */}
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle>Pending Approvals</CardTitle>
            <CardDescription className="text-muted-foreground">
              Deals awaiting your review and approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dealsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : dealsError ? (
              <div className="flex items-center justify-center py-12 text-red-400">
                <AlertCircle className="h-5 w-5 mr-2" />
                Failed to load pending deals
              </div>
            ) : deals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mb-4 text-green-500" />
                <p className="text-lg font-medium">All caught up!</p>
                <p className="text-sm">No deals pending approval</p>
              </div>
            ) : (
              <div className="space-y-4">
                {deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <Home className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">{formatAddress(deal)}</span>
                        {deal.status && (
                          <Badge
                            variant="outline"
                            className={
                              deal.status === 'Green'
                                ? 'border-green-500 text-green-500'
                                : deal.status === 'Yellow'
                                ? 'border-yellow-500 text-yellow-500'
                                : 'border-red-500 text-red-500'
                            }
                          >
                            {deal.status}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {deal.propertyType}
                        </span>
                        <span>
                          {deal.bedroomCount} bed / {deal.bathroomCount} bath
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          {formatCurrency(deal.reservePrice || deal.buyItNowPrice)}
                        </span>
                        {deal.arv && (
                          <span className="text-green-400">ARV: {formatCurrency(deal.arv)}</span>
                        )}
                      </div>

                      {deal.submittedForApprovalAt && (
                        <p className="text-xs text-muted-foreground">
                          Submitted{' '}
                          {formatDistanceToNow(new Date(deal.submittedForApprovalAt), {
                            addSuffix: true,
                          })}
                        </p>
                      )}

                      {deal.changesRequested && (
                        <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-sm text-yellow-400">
                          <strong>Changes Requested:</strong> {deal.changesRequested}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleAction(deal, 'approve')}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="border">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-card border">
                          <DropdownMenuItem
                            className="text-yellow-400 focus:bg-secondary"
                            onClick={() => handleAction(deal, 'changes')}
                          >
                            <MessageSquare className="mr-2 h-4 w-4" />
                            Request Changes
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-400 focus:bg-secondary"
                            onClick={() => handleAction(deal, 'reject')}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Reject
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-muted-foreground focus:bg-secondary"
                            onClick={() => handleAction(deal, 'history')}
                          >
                            <History className="mr-2 h-4 w-4" />
                            View History
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Dialog */}
      <Dialog
        open={!!selectedDeal && actionType !== 'history'}
        onOpenChange={() => {
          setSelectedDeal(null);
          setActionType(null);
        }}
      >
        <DialogContent className="bg-card border">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' && 'Approve Deal'}
              {actionType === 'reject' && 'Reject Deal'}
              {actionType === 'changes' && 'Request Changes'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {selectedDeal && formatAddress(selectedDeal)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="notes">
                {actionType === 'approve' && 'Notes (optional)'}
                {actionType === 'reject' && 'Rejection Reason (required)'}
                {actionType === 'changes' && 'Required Changes (required)'}
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  actionType === 'approve'
                    ? 'Add any notes about this approval...'
                    : actionType === 'reject'
                    ? 'Explain why this deal is being rejected...'
                    : 'Describe what changes are needed...'
                }
                className="bg-secondary border min-h-[100px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedDeal(null);
                setActionType(null);
              }}
              className="border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={
                actionType === 'approve'
                  ? 'bg-green-600 hover:bg-green-700'
                  : actionType === 'reject'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-yellow-600 hover:bg-yellow-700'
              }
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {actionType === 'approve' && 'Approve & Go Live'}
              {actionType === 'reject' && 'Reject Deal'}
              {actionType === 'changes' && 'Request Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog
        open={actionType === 'history'}
        onOpenChange={() => {
          setSelectedDeal(null);
          setActionType(null);
        }}
      >
        <DialogContent className="bg-card border">
          <DialogHeader>
            <DialogTitle>Approval History</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {selectedDeal && formatAddress(selectedDeal)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[400px] overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No history available</p>
            ) : (
              <div className="space-y-3">
                {history.map((entry: ApprovalHistoryEntry, index: number) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 bg-secondary/50 rounded-lg"
                  >
                    <div
                      className={`p-1.5 rounded-full ${
                        entry.action === 'approved' || entry.action === 'made_live'
                          ? 'bg-green-500/20 text-green-500'
                          : entry.action === 'rejected'
                          ? 'bg-red-500/20 text-red-500'
                          : entry.action === 'changes_requested'
                          ? 'bg-yellow-500/20 text-yellow-500'
                          : 'bg-accent-500/20 text-accent-500'
                      }`}
                    >
                      {entry.action === 'approved' || entry.action === 'made_live' ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : entry.action === 'rejected' ? (
                        <XCircle className="h-4 w-4" />
                      ) : entry.action === 'changes_requested' ? (
                        <MessageSquare className="h-4 w-4" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium capitalize">
                        {entry.action.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        by {entry.performedByName || entry.performedBy}
                      </p>
                      {entry.notes && (
                        <p className="text-sm text-foreground mt-1">{entry.notes}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(entry.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedDeal(null);
                setActionType(null);
              }}
              className="border"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
