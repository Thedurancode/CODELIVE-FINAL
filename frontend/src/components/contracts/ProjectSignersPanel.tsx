'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileSignature,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Send,
  Mail,
  Phone,
  Bell,
  Link2,
  ExternalLink,
  Filter,
} from 'lucide-react';
import {
  useProjectSigners,
  useSendSignerReminder,
  type ContractSigner,
} from '@/hooks/use-project-contracts';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';

// Status configuration
const STATUS_CONFIG: Record<ContractSigner['status'], {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}> = {
  pending: {
    label: 'Pending',
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-500/20',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  sent: {
    label: 'Sent',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    icon: <Send className="h-3.5 w-3.5" />,
  },
  opened: {
    label: 'Viewed',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    icon: <Eye className="h-3.5 w-3.5" />,
  },
  completed: {
    label: 'Signed',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  declined: {
    label: 'Declined',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
};

interface ProjectSignersPanelProps {
  projectId: string;
  maxHeight?: string;
}

export function ProjectSignersPanel({
  projectId,
  maxHeight = '400px',
}: ProjectSignersPanelProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading, error } = useProjectSigners(projectId);
  const sendReminder = useSendSignerReminder();

  // Debug logging
  console.log('[ProjectSignersPanel] projectId:', projectId);
  console.log('[ProjectSignersPanel] isLoading:', isLoading);
  console.log('[ProjectSignersPanel] error:', error);
  console.log('[ProjectSignersPanel] data:', data);

  const signers = data?.data || [];
  const stats = data?.stats;

  // Filter signers
  const filteredSigners = statusFilter === 'all'
    ? signers
    : signers.filter(s => s.status === statusFilter);

  // Group by contract
  const signersByContract = filteredSigners.reduce((acc, signer) => {
    const contractId = signer.submissionId;
    if (!acc[contractId]) {
      acc[contractId] = {
        contractId,
        contractName: (signer as any).submission?.templateName || `Contract #${contractId}`,
        signers: [],
      };
    }
    acc[contractId].signers.push(signer);
    return acc;
  }, {} as Record<number, { contractId: number; contractName: string; signers: ContractSigner[] }>);

  const handleSendReminder = async (signer: ContractSigner) => {
    try {
      await sendReminder.mutateAsync({
        signerId: signer.id,
        contractId: signer.submissionId,
      });
      toast.success(`Reminder sent to ${signer.email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reminder');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            All Signers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            All Signers
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <XCircle className="h-12 w-12 mx-auto mb-3 text-red-500/50" />
          <p className="text-sm text-muted-foreground">Failed to load signers</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {(error as Error)?.message || 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-5 w-5" />
            All Signers
            {signers.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {signers.length}
              </Badge>
            )}
          </CardTitle>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8">
              <Filter className="h-3.5 w-3.5 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="opened">Viewed</SelectItem>
              <SelectItem value="completed">Signed</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats bar */}
        {stats && stats.total > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Completion</span>
              <span className="font-medium">{stats.completionRate}%</span>
            </div>
            <Progress value={stats.completionRate} className="h-2" />
            <div className="grid grid-cols-5 gap-2 text-xs">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center p-2 rounded bg-zinc-500/10">
                      <span className="font-semibold">{stats.pending}</span>
                      <span className="text-muted-foreground">Pending</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Waiting to be sent</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center p-2 rounded bg-amber-500/10">
                      <span className="font-semibold text-amber-400">{stats.sent}</span>
                      <span className="text-muted-foreground">Sent</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Email sent, awaiting action</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center p-2 rounded bg-blue-500/10">
                      <span className="font-semibold text-blue-400">{stats.opened}</span>
                      <span className="text-muted-foreground">Viewed</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Document viewed, not yet signed</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center p-2 rounded bg-green-500/10">
                      <span className="font-semibold text-green-400">{stats.completed}</span>
                      <span className="text-muted-foreground">Signed</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Successfully signed</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center p-2 rounded bg-red-500/10">
                      <span className="font-semibold text-red-400">{stats.declined}</span>
                      <span className="text-muted-foreground">Declined</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Declined to sign</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {filteredSigners.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileSignature className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {statusFilter === 'all' ? 'No signers found' : `No ${statusFilter} signers`}
            </p>
          </div>
        ) : (
          <ScrollArea style={{ maxHeight }}>
            <div className="space-y-4">
              {Object.values(signersByContract).map((group) => (
                <div key={group.contractId} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <FileSignature className="h-4 w-4" />
                    {group.contractName}
                    <Badge variant="outline" className="text-xs">
                      {group.signers.length} signer{group.signers.length > 1 ? 's' : ''}
                    </Badge>
                  </div>

                  <div className="space-y-1 pl-6">
                    {group.signers.map((signer) => (
                      <CompactSignerRow
                        key={signer.id}
                        signer={signer}
                        onSendReminder={() => handleSendReminder(signer)}
                        isSending={sendReminder.isPending}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// Compact signer row for project view
interface CompactSignerRowProps {
  signer: ContractSigner;
  onSendReminder: () => void;
  isSending?: boolean;
}

function CompactSignerRow({ signer, onSendReminder, isSending }: CompactSignerRowProps) {
  const statusConfig = STATUS_CONFIG[signer.status];
  const canSendReminder = ['pending', 'sent', 'opened'].includes(signer.status);

  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors group">
      {/* Status icon */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`h-7 w-7 rounded-full flex items-center justify-center ${statusConfig.bgColor}`}>
              <span className={statusConfig.color}>{statusConfig.icon}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{statusConfig.label}</p>
            {signer.completedAt && (
              <p className="text-xs">
                {format(new Date(signer.completedAt), 'MMM d, yyyy h:mm a')}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {signer.name || signer.email.split('@')[0]}
          </span>
          <Badge variant="outline" className="text-[10px] capitalize h-5">
            {signer.role}
          </Badge>
          {signer.contact && (
            <Link2 className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mail className="h-3 w-3" />
          <span className="truncate">{signer.email}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        {canSendReminder && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onSendReminder}
                  disabled={isSending}
                >
                  <Bell className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Send Reminder</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {signer.embedUrl && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => window.open(signer.embedUrl, '_blank')}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open Signing Link</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Reminder count */}
      {signer.reminderCount > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="text-[10px] h-5 gap-0.5">
                <Bell className="h-3 w-3" />
                {signer.reminderCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {signer.reminderCount} reminder{signer.reminderCount > 1 ? 's' : ''} sent
              {signer.lastReminderAt && (
                <p className="text-xs">
                  Last: {formatDistanceToNow(new Date(signer.lastReminderAt), { addSuffix: true })}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

export default ProjectSignersPanel;
