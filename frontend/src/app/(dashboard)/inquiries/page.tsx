'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Send,
  Building2,
  User,
  Loader2,
  RefreshCw,
  Filter,
  BarChart3,
  Trash2,
  CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInquiries, useInquiryStats, useAnswerInquiry } from '@/hooks/use-inquiries';
import type { PropertyInquiry, InquiryStatus, InquiryCategory } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const categoryLabels: Record<InquiryCategory, string> = {
  seller_motivation: 'Seller Motivation',
  property_condition: 'Property Condition',
  property_history: 'Property History',
  closing_terms: 'Closing Terms',
  inclusions: 'Inclusions',
  pricing: 'Pricing',
  other: 'Other',
};

const priorityColors = {
  low: 'bg-zinc-600',
  normal: 'bg-blue-600',
  high: 'bg-orange-600',
  urgent: 'bg-red-600',
};

const statusConfig: Record<InquiryStatus, { label: string; icon: typeof CheckCircle; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-500' },
  answered: { label: 'Answered', icon: CheckCircle, color: 'text-green-500' },
  expired: { label: 'Expired', icon: AlertCircle, color: 'text-red-500' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-muted-foreground' },
};

export default function InquiriesPage() {
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | 'all'>('pending');
  const [selectedInquiry, setSelectedInquiry] = useState<PropertyInquiry | null>(null);
  const [response, setResponse] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkResponse, setBulkResponse] = useState('');
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  const { data, isLoading, refetch } = useInquiries({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 50,
  });

  const { data: stats } = useInquiryStats();
  const answerMutation = useAnswerInquiry();

  const inquiries = (data as { data?: PropertyInquiry[] })?.data || [];
  const pendingInquiries = inquiries.filter(i => i.status === 'pending');

  const handleOpenResponse = (inquiry: PropertyInquiry) => {
    setSelectedInquiry(inquiry);
    setResponse('');
    setIsDialogOpen(true);
  };

  const handleSubmitResponse = async () => {
    if (!selectedInquiry || !response.trim()) return;

    try {
      await answerMutation.mutateAsync({
        id: selectedInquiry.id,
        response: response.trim(),
      });
      toast.success('Response sent successfully!');
      setIsDialogOpen(false);
      setSelectedInquiry(null);
      setResponse('');
      refetch();
    } catch {
      toast.error('Failed to send response. Please try again.');
    }
  };

  // Selection handlers
  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === pendingInquiries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingInquiries.map(i => i.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk actions
  const handleBulkAnswer = async () => {
    if (selectedIds.size === 0 || !bulkResponse.trim()) return;

    setIsBulkLoading(true);
    try {
      const result = await api.post<{ success: number; failed: number }>('/api/inquiries/bulk/answer', {
        inquiryIds: Array.from(selectedIds),
        response: bulkResponse.trim(),
      });
      toast.success(`Answered ${result.success} inquiries`);
      setIsBulkDialogOpen(false);
      setBulkResponse('');
      clearSelection();
      refetch();
    } catch {
      toast.error('Failed to bulk answer inquiries');
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkCancel = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`Cancel ${selectedIds.size} selected inquiries?`)) return;

    setIsBulkLoading(true);
    try {
      const result = await api.post<{ success: number; failed: number }>('/api/inquiries/bulk/cancel', {
        inquiryIds: Array.from(selectedIds),
      });
      toast.success(`Cancelled ${result.success} inquiries`);
      clearSelection();
      refetch();
    } catch {
      toast.error('Failed to cancel inquiries');
    } finally {
      setIsBulkLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Buyer Inquiries</h1>
          <p className="text-muted-foreground text-sm">
            Answer questions from buyers about your properties
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inquiries/analytics">
            <Button variant="outline" size="sm" className="border">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-600/20 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.pending || 0}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-600/20 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.answered || 0}</p>
                <p className="text-sm text-muted-foreground">Answered</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600/20 rounded-lg">
                <MessageSquare className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.total || 0}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-600/20 rounded-lg">
                <Clock className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {stats?.avgResponseTime ? `${Math.round(stats.avgResponseTime)}h` : 'N/A'}
                </p>
                <p className="text-sm text-muted-foreground">Avg Response</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Bulk Actions Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as InquiryStatus | 'all');
              clearSelection();
            }}
          >
            <SelectTrigger className="w-40 bg-secondary border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="answered">Answered</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-secondary px-3 py-2 rounded-lg">
            <span className="text-sm text-foreground">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              className="border"
              onClick={() => setIsBulkDialogOpen(true)}
            >
              <CheckSquare className="h-4 w-4 mr-1" />
              Bulk Answer
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-600 text-red-400 hover:bg-red-900/20"
              onClick={handleBulkCancel}
              disabled={isBulkLoading}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Inquiries List */}
      <Card className="bg-card border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-foreground">Inquiries</CardTitle>
          {statusFilter === 'pending' && pendingInquiries.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAll}
              className="text-muted-foreground"
            >
              {selectedIds.size === pendingInquiries.length ? 'Deselect All' : 'Select All'}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : inquiries.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No inquiries found</p>
              <p className="text-muted-foreground text-sm">
                {statusFilter === 'pending'
                  ? 'Great job! All inquiries have been answered.'
                  : 'No inquiries match the current filter.'}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {inquiries.map((inquiry) => {
                  const StatusIcon = statusConfig[inquiry.status].icon;
                  const isSelected = selectedIds.has(inquiry.id);
                  return (
                    <div
                      key={inquiry.id}
                      className={cn(
                        'p-4 bg-secondary/50 rounded-lg border transition-colors',
                        isSelected ? 'border-blue-500 bg-blue-900/10' : 'border hover:border'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox for pending items */}
                        {inquiry.status === 'pending' && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelection(inquiry.id)}
                            className="mt-1"
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          {/* Header */}
                          <div className="flex items-center gap-2 mb-2">
                            <Badge
                              variant="outline"
                              className={cn('text-xs', priorityColors[inquiry.priority])}
                            >
                              {inquiry.priority}
                            </Badge>
                            <Badge variant="outline" className="text-xs border">
                              {categoryLabels[inquiry.category]}
                            </Badge>
                            <div className={cn('flex items-center gap-1', statusConfig[inquiry.status].color)}>
                              <StatusIcon className="h-3 w-3" />
                              <span className="text-xs">{statusConfig[inquiry.status].label}</span>
                            </div>
                          </div>

                          {/* Question */}
                          <p className="text-foreground mb-3">{inquiry.question}</p>

                          {/* Property & Buyer Info */}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              <span>Property #{inquiry.propertyId}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span>Buyer: {inquiry.buyer?.email || inquiry.buyerId}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{formatDistanceToNow(new Date(inquiry.createdAt))} ago</span>
                            </div>
                          </div>

                          {/* Response (if answered) */}
                          {inquiry.status === 'answered' && inquiry.sellerResponse && (
                            <div className="mt-3 p-3 bg-green-900/20 border border-green-800 rounded">
                              <p className="text-sm text-foreground">
                                <span className="text-green-400 font-medium">Response: </span>
                                {inquiry.sellerResponse}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Action Button */}
                        {inquiry.status === 'pending' && (
                          <Button
                            onClick={() => handleOpenResponse(inquiry)}
                            className="bg-blue-600 hover:bg-blue-700 shrink-0"
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Respond
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Single Response Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Respond to Inquiry</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Your response will be sent to the buyer and injected into their chat session.
            </DialogDescription>
          </DialogHeader>

          {selectedInquiry && (
            <div className="space-y-4">
              <div className="p-3 bg-secondary rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Buyer's Question:</p>
                <p className="text-foreground">{selectedInquiry.question}</p>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Your Response:</label>
                <Textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="Type your response to the buyer..."
                  className="bg-secondary border text-foreground min-h-[120px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitResponse}
              disabled={!response.trim() || answerMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {answerMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Response Dialog */}
      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="bg-card border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Bulk Answer Inquiries</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Send the same response to {selectedIds.size} selected inquiries.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-secondary rounded-lg">
              <p className="text-sm text-muted-foreground">Selected {selectedIds.size} inquiries</p>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Response for all:</label>
              <Textarea
                value={bulkResponse}
                onChange={(e) => setBulkResponse(e.target.value)}
                placeholder="Type the response to send to all selected inquiries..."
                className="bg-secondary border text-foreground min-h-[120px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBulkDialogOpen(false)}
              className="border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkAnswer}
              disabled={!bulkResponse.trim() || isBulkLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isBulkLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send to All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
