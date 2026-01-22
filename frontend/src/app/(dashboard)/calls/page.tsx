'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
  User,
  Building2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Filter,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Smile,
  Meh,
  Frown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCalls,
  useVoiceServiceStatus,
  useBatchAnalyzeCalls,
  formatDuration,
  getStatusColor,
  getOutcomeColor,
  formatOutcome,
  type CallDirection,
  type CallStatus,
  type CallOutcome,
  type Call,
} from '@/hooks/use-calls';
import { cn } from '@/lib/utils';

export default function CallsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<CallDirection | 'all'>('all');
  const [status, setStatus] = useState<CallStatus | 'all'>('all');
  const [outcome, setOutcome] = useState<CallOutcome | 'all'>('all');

  const { data: callsData, isLoading, error, refetch } = useCalls({
    page,
    limit: 20,
    direction: direction === 'all' ? undefined : direction,
    status: status === 'all' ? undefined : status,
    outcome: outcome === 'all' ? undefined : outcome,
  });

  const { data: serviceStatus } = useVoiceServiceStatus();
  const batchAnalyze = useBatchAnalyzeCalls();

  const calls = callsData?.data || [];
  const pagination = callsData?.pagination;

  const getDirectionIcon = (dir: CallDirection, callStatus: CallStatus) => {
    if (callStatus === 'no-answer' || callStatus === 'failed' || callStatus === 'busy') {
      return <PhoneMissed className="h-4 w-4 text-red-500" />;
    }
    return dir === 'inbound' ? (
      <PhoneIncoming className="h-4 w-4 text-blue-500" />
    ) : (
      <PhoneOutgoing className="h-4 w-4 text-green-500" />
    );
  };

  const getSentimentIcon = (sentiment: number | null) => {
    if (sentiment === null) return <Meh className="h-4 w-4 text-gray-400" />;
    if (sentiment >= 0.7) return <Smile className="h-4 w-4 text-green-500" />;
    if (sentiment >= 0.4) return <Meh className="h-4 w-4 text-amber-500" />;
    return <Frown className="h-4 w-4 text-red-500" />;
  };

  const handleRowClick = (call: Call) => {
    router.push(`/calls/${call.id}`);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calls</h1>
          <p className="text-muted-foreground">
            Manage voice calls and view transcripts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => batchAnalyze.mutate(10)}
            disabled={batchAnalyze.isPending}
          >
            {batchAnalyze.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Analyze Unprocessed
          </Button>
        </div>
      </div>

      {/* Service Status Card */}
      {serviceStatus && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Voice Service Status
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                {serviceStatus.twilio.configured ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span>Twilio: {serviceStatus.twilio.configured ? 'Connected' : 'Not configured'}</span>
              </div>
              <div className="flex items-center gap-2">
                {serviceStatus.openai.configured ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span>OpenAI: {serviceStatus.openai.configured ? 'Connected' : 'Not configured'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-blue-500" />
                <span>Active: {serviceStatus.activeSessions}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  24h: {serviceStatus.last24Hours.total} calls ({serviceStatus.last24Hours.completed} completed)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Select
              value={direction}
              onValueChange={(v) => {
                setDirection(v as CallDirection | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Directions</SelectItem>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as CallStatus | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="no-answer">No Answer</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={outcome}
              onValueChange={(v) => {
                setOutcome(v as CallOutcome | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outcomes</SelectItem>
                <SelectItem value="hot_lead">Hot Lead</SelectItem>
                <SelectItem value="follow_up">Follow Up</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="not_interested">Not Interested</SelectItem>
                <SelectItem value="no_answer">No Answer</SelectItem>
                <SelectItem value="left_voicemail">Left Voicemail</SelectItem>
                <SelectItem value="wrong_number">Wrong Number</SelectItem>
                <SelectItem value="escalate">Escalate</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Calls Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <p className="text-muted-foreground">Failed to load calls</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Phone className="h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">No calls found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Contact / Deal</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Sentiment</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow
                    key={call.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(call)}
                  >
                    <TableCell>
                      {getDirectionIcon(call.direction, call.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {call.direction === 'inbound' ? call.from_number : call.to_number}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {call.direction === 'inbound' ? 'From' : 'To'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {call.contact_id && (
                          <div className="flex items-center gap-1 text-sm">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-[150px]">Contact linked</span>
                          </div>
                        )}
                        {call.deal_id && (
                          <div className="flex items-center gap-1 text-sm">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            <Link
                              href={`/deals/${call.deal_id}`}
                              className="text-primary hover:underline truncate max-w-[150px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Deal #{call.deal_id}
                            </Link>
                          </div>
                        )}
                        {!call.contact_id && !call.deal_id && (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>{formatDuration(call.duration_sec)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('capitalize', getStatusColor(call.status))}>
                        {call.status.replace(/-/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {call.outcome ? (
                        <Badge variant="outline" className={cn(getOutcomeColor(call.outcome))}>
                          {formatOutcome(call.outcome)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {getSentimentIcon(call.sentiment)}
                        {call.sentiment !== null && (
                          <span className="text-sm">
                            {Math.round(call.sentiment * 100)}%
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {format(new Date(call.created_at), 'MMM d, yyyy')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(call.created_at), 'h:mm a')}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} calls
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">
              Page {pagination.page} of {pagination.pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={page === pagination.pages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
