'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Shield,
  FileCheck,
  FileText,
  Lock,
  Unlock,
  ChevronRight,
  Loader2,
  Building2,
  FileSignature,
  Send,
  RefreshCw,
  Eye,
  Users,
  Gavel,
  Home,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  useDealCompliance,
  useDealWorkflow,
  useStateDisclosures,
  useStateGates,
  useCompletePhase,
  useBlockWorkflow,
  useUnblockWorkflow,
  usePhaseContractStatus,
  useResendContract,
  PHASE_NAMES,
  STATUS_TEXT_COLORS,
  DistributionChannel,
} from '@/hooks/use-state-compliance';
import { TransactionTypeForm } from '@/components/compliance/TransactionTypeForm';
import { DistributionChannelForm } from '@/components/compliance/DistributionChannelForm';
import { BrokerReviewForm } from '@/components/compliance/BrokerReviewForm';
import { DistributionStatusCard } from '@/components/compliance/DistributionStatusCard';

// Oklahoma 7-Phase Configuration (0-6) matching backend spec
const PHASE_CONFIG: Record<number, {
  requiresGate?: string;
  requiresPhase?: number;
  requiresStatus?: string;
}> = {
  0: {}, // LLC Hard Gate - no prerequisites
  1: { requiresPhase: 0, requiresGate: 'OK-GATE-1' }, // Property Submission
  2: { requiresPhase: 1, requiresGate: 'OK-GATE-2' }, // Compliance Review
  3: { requiresPhase: 2, requiresGate: 'OK-GATE-3', requiresStatus: 'GREEN' }, // Pre-Distribution
  4: { requiresPhase: 3, requiresGate: 'OK-GATE-4' }, // Offer Accepted / 3-Day Hold
  5: { requiresPhase: 4, requiresGate: 'OK-GATE-5' }, // Buyer Contract Execution
  6: { requiresPhase: 5 }, // Closing
};

// Phase descriptions matching backend spec
const PHASE_DESCRIPTIONS: Record<number, { title: string; description: string; icon: React.ReactNode }> = {
  0: {
    title: 'Account Setup & Entity Verification',
    description: 'Complete LLC setup with Articles of Organization, Operating Agreement, authorized signer, and CSA',
    icon: <Building2 className="h-5 w-5" />,
  },
  1: {
    title: 'Property Submission',
    description: 'Upload purchase contract and seller acknowledgment/disclosures',
    icon: <FileText className="h-5 w-5" />,
  },
  2: {
    title: 'Compliance Review & Approval',
    description: 'Validate contract terms and verify all 8 Oklahoma disclosures',
    icon: <Shield className="h-5 w-5" />,
  },
  3: {
    title: 'Approved / Pre-Distribution',
    description: 'Execute MSA/ASA agreements and obtain broker approval',
    icon: <FileSignature className="h-5 w-5" />,
  },
  4: {
    title: 'Offer Accepted / Pre-Buyer Ack',
    description: 'Seller acknowledges assignment - 3-day statutory hold begins',
    icon: <Gavel className="h-5 w-5" />,
  },
  5: {
    title: 'Buyer Contract Execution',
    description: 'Execute assignment after 3-day hold expires',
    icon: <Users className="h-5 w-5" />,
  },
  6: {
    title: 'Title, Closing & Settlement',
    description: 'Complete transaction with title company',
    icon: <Home className="h-5 w-5" />,
  },
};

// Status icon component
function StatusIcon({
  status,
  size = 'md',
}: {
  status: 'GREEN' | 'YELLOW' | 'RED' | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  if (status === 'GREEN') {
    return <CheckCircle2 className={`${sizeClasses[size]} text-green-400`} />;
  } else if (status === 'YELLOW') {
    return <AlertTriangle className={`${sizeClasses[size]} text-yellow-400`} />;
  } else if (status === 'RED') {
    return <XCircle className={`${sizeClasses[size]} text-red-400`} />;
  }
  return <Clock className={`${sizeClasses[size]} text-muted-foreground`} />;
}

// Phase status badge
function PhaseStatus({ phase, workflow }: {
  phase: number;
  workflow: any;
}) {
  const isComplete = workflow?.phaseCompletions?.[phase] === true;
  const isCurrent = workflow?.currentPhase === phase;

  if (isComplete) {
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Complete
      </Badge>
    );
  }

  if (isCurrent) {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
        <Clock className="h-3 w-3 mr-1" />
        Current
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Clock className="h-3 w-3 mr-1" />
      Pending
    </Badge>
  );
}

// Check if a phase can be accessed
function canAccessPhase(phase: number, workflow: any, compliance: any): {
  allowed: boolean;
  reason?: string
} {
  if (!workflow) return { allowed: false, reason: 'Workflow not loaded' };

  // Already complete - always accessible for viewing
  if (workflow.phaseCompletions?.[phase] === true) {
    return { allowed: true };
  }

  // Check if workflow is blocked
  if (workflow.blocked) {
    return { allowed: false, reason: `Workflow blocked: ${workflow.blockedReason}` };
  }

  const config = PHASE_CONFIG[phase] || {};

  // Check required phase
  if (config.requiresPhase !== undefined) {
    if (workflow.phaseCompletions?.[config.requiresPhase] !== true) {
      return {
        allowed: false,
        reason: `Complete Phase ${config.requiresPhase} (${PHASE_DESCRIPTIONS[config.requiresPhase]?.title}) first`
      };
    }
  }

  // Check required status (for phase 3, need GREEN)
  if (config.requiresStatus === 'GREEN' && compliance?.overallStatus !== 'GREEN') {
    return {
      allowed: false,
      reason: `Overall status must be GREEN (currently ${compliance?.overallStatus || 'pending'})`
    };
  }

  return { allowed: true };
}

// Calculate 3-day hold remaining
function calculateHoldRemaining(sellerAckDate: string | undefined): { expired: boolean; daysRemaining: number; message: string } {
  if (!sellerAckDate) {
    return { expired: false, daysRemaining: 3, message: 'Seller acknowledgment not recorded' };
  }

  const ackDate = new Date(sellerAckDate);
  const holdExpires = new Date(ackDate);
  holdExpires.setDate(holdExpires.getDate() + 3);

  const now = new Date();
  const diffMs = holdExpires.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return { expired: true, daysRemaining: 0, message: '3-day hold satisfied - can proceed' };
  }

  return { expired: false, daysRemaining: diffDays, message: `${diffDays} day(s) remaining in statutory hold` };
}

export default function DealCompliancePage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id as string;

  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [expandedPhases, setExpandedPhases] = useState<string[]>([]);

  // Fetch data
  const { data: complianceData, isLoading: loadingCompliance, error: complianceError, refetch } = useDealCompliance(dealId);
  const { data: workflowData, isLoading: loadingWorkflow, refetch: refetchWorkflow } = useDealWorkflow(dealId);

  const compliance = complianceData?.data?.compliance;
  const workflow = workflowData?.data?.workflow;

  // Fetch state-specific data
  const { data: disclosuresData } = useStateDisclosures(compliance?.state || '');
  const { data: gatesData } = useStateGates(compliance?.state || '');

  // Mutations
  const completePhase = useCompletePhase();
  const blockWorkflowMutation = useBlockWorkflow();
  const unblockWorkflowMutation = useUnblockWorkflow();
  const resendContract = useResendContract();

  // Phase 3 contract status (MSA/ASA)
  const { data: phase3ContractStatus, refetch: refetchPhase3Contracts } = usePhaseContractStatus(dealId, 3);

  // Auto-expand current phase
  useEffect(() => {
    if (workflow?.currentPhase !== undefined) {
      setExpandedPhases([`phase-${workflow.currentPhase}`]);
    }
  }, [workflow?.currentPhase]);

  // Calculate disclosure progress
  const disclosureProgress = useMemo(() => {
    if (!compliance?.disclosureResults) return { found: 0, total: 8, percentage: 0 };
    const results = Object.values(compliance.disclosureResults);
    const found = results.filter((v) => v === true).length;
    const total = 8; // Oklahoma has 8 required disclosures
    return {
      found,
      total,
      percentage: total > 0 ? Math.round((found / total) * 100) : 0,
    };
  }, [compliance?.disclosureResults]);

  // Handle phase completion with auto-progression
  const handleCompletePhase = async (phase: number) => {
    try {
      await completePhase.mutateAsync({ dealId: parseInt(dealId), phase });
      toast.success(`Phase ${phase} completed`);

      // Refetch data to get updated workflow
      await Promise.all([refetch(), refetchWorkflow()]);

      // Auto-expand next phase
      const nextPhase = phase + 1;
      if (nextPhase <= 6) {
        setExpandedPhases([`phase-${nextPhase}`]);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to complete phase');
    }
  };

  // Handle block
  const handleBlock = async () => {
    if (!blockReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    try {
      await blockWorkflowMutation.mutateAsync({
        dealId: parseInt(dealId),
        reason: blockReason,
      });
      toast.success('Workflow blocked');
      setBlockDialogOpen(false);
      setBlockReason('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to block workflow');
    }
  };

  // Handle unblock
  const handleUnblock = async () => {
    try {
      await unblockWorkflowMutation.mutateAsync({ dealId: parseInt(dealId) });
      toast.success('Workflow unblocked');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unblock workflow');
    }
  };

  if (loadingCompliance || loadingWorkflow) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (complianceError || !compliance) {
    return (
      <div className="p-6">
        <Card className="bg-destructive/10 border-destructive">
          <CardContent className="p-6 text-center">
            <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Compliance Not Initialized
            </h2>
            <p className="text-muted-foreground mb-4">
              No compliance tracking found for this deal. Initialize compliance from the deal page.
            </p>
            <Button onClick={() => router.back()} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get agreements status for Phase 3
  const distributionChannels = (compliance.stateSpecificData?.distributionChannels as DistributionChannel[]) || [];
  const needsMSA = distributionChannels.length > 0;
  const needsASA = distributionChannels.includes('auction');

  // Calculate 3-day hold status for Phase 4/5
  const holdStatus = calculateHoldRemaining(compliance.cancellationDeliveryDate);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/deals/${dealId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {compliance.state} Compliance Workflow
            </h1>
            <p className="text-muted-foreground">
              Deal #{dealId} - Phase {workflow?.currentPhase || 0} of 6
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {workflow?.blocked ? (
            <Button
              variant="outline"
              className="border-green-500/50 text-green-400"
              onClick={handleUnblock}
              disabled={unblockWorkflowMutation.isPending}
            >
              {unblockWorkflowMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Unlock className="h-4 w-4 mr-2" />
              )}
              Unblock
            </Button>
          ) : (
            <Button
              variant="outline"
              className="border-red-500/50 text-red-400"
              onClick={() => setBlockDialogOpen(true)}
            >
              <Lock className="h-4 w-4 mr-2" />
              Block
            </Button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <Card className="bg-card border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Workflow Progress</span>
            <span className="text-sm text-muted-foreground">
              {workflowData?.data?.completionPercentage || 0}% Complete
            </span>
          </div>
          <Progress value={workflowData?.data?.completionPercentage || 0} className="h-3" />
        </CardContent>
      </Card>

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                compliance.overallStatus === 'GREEN' ? 'bg-green-500/20' :
                compliance.overallStatus === 'YELLOW' ? 'bg-yellow-500/20' :
                compliance.overallStatus === 'RED' ? 'bg-red-500/20' : 'bg-secondary'
              }`}>
                <Shield className={`h-6 w-6 ${
                  compliance.overallStatus ? STATUS_TEXT_COLORS[compliance.overallStatus] : 'text-muted-foreground'
                }`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overall Status</p>
                <p className={`text-xl font-bold ${
                  compliance.overallStatus ? STATUS_TEXT_COLORS[compliance.overallStatus] : 'text-muted-foreground'
                }`}>
                  {compliance.overallStatus || 'Pending'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <FileCheck className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Phase</p>
                <p className="text-xl font-bold text-foreground">
                  {workflow?.currentPhase || 0} / 6
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <FileText className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Disclosures</p>
                <p className="text-xl font-bold text-foreground">
                  {disclosureProgress.found}/{disclosureProgress.total}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                compliance.canDistribute ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                {compliance.canDistribute ? (
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-400" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Distribution</p>
                <p className={`text-xl font-bold ${
                  compliance.canDistribute ? 'text-green-400' : 'text-red-400'
                }`}>
                  {compliance.canDistribute ? 'Ready' : 'Blocked'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Blocked Warning */}
      {workflow?.blocked && (
        <Alert className="bg-red-500/10 border-red-500/30">
          <Lock className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-400">
            <strong>Workflow Blocked:</strong> {workflow.blockedReason || 'No reason provided'}
            {workflow.blockedByGate && (
              <Badge variant="outline" className="ml-2 text-xs">
                Gate: {workflow.blockedByGate}
              </Badge>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Phase Accordion - 7 Phases (0-6) */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-emerald-500" />
            Oklahoma Compliance Workflow
          </CardTitle>
          <CardDescription>
            Complete each phase in order. Gates must pass before proceeding to the next phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion
            type="multiple"
            value={expandedPhases}
            onValueChange={setExpandedPhases}
            className="space-y-2"
          >
            {/* Phase 0: LLC Hard Gate */}
            <AccordionItem value="phase-0" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    workflow?.phaseCompletions?.[0] ? 'bg-green-500 text-white' :
                    workflow?.currentPhase === 0 ? 'bg-emerald-500 text-white' : 'bg-secondary'
                  }`}>
                    {workflow?.phaseCompletions?.[0] ? <CheckCircle2 className="h-4 w-4" /> : '0'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{PHASE_DESCRIPTIONS[0].title}</span>
                  </div>
                  <PhaseStatus phase={0} workflow={workflow} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">{PHASE_DESCRIPTIONS[0].description}</p>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Requirements (OK-GATE-1):</h4>
                    <ul className="space-y-2 ml-4">
                      <li className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                        LLC profile complete (legal name, EIN, formation date, address)
                      </li>
                      <li className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                        Articles of Organization uploaded & verified
                      </li>
                      <li className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                        Operating Agreement uploaded & verified
                      </li>
                      <li className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                        Authorized signer identified
                      </li>
                      <li className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                        Client Services Agreement (CSA) executed
                      </li>
                    </ul>
                  </div>

                  {!workflow?.phaseCompletions?.[0] && workflow?.currentPhase === 0 && (
                    <Button
                      size="sm"
                      className="mt-4"
                      onClick={() => handleCompletePhase(0)}
                      disabled={completePhase.isPending}
                    >
                      {completePhase.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Mark Complete
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Phase 1: Property Submission */}
            <AccordionItem value="phase-1" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    workflow?.phaseCompletions?.[1] ? 'bg-green-500 text-white' :
                    workflow?.currentPhase === 1 ? 'bg-emerald-500 text-white' : 'bg-secondary'
                  }`}>
                    {workflow?.phaseCompletions?.[1] ? <CheckCircle2 className="h-4 w-4" /> : '1'}
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{PHASE_DESCRIPTIONS[1].title}</span>
                  </div>
                  <PhaseStatus phase={1} workflow={workflow} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                {(() => {
                  const access = canAccessPhase(1, workflow, compliance);
                  if (!access.allowed) {
                    return (
                      <Alert>
                        <Lock className="h-4 w-4" />
                        <AlertDescription>{access.reason}</AlertDescription>
                      </Alert>
                    );
                  }
                  return (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">{PHASE_DESCRIPTIONS[1].description}</p>

                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Requirements (OK-GATE-2):</h4>
                        <ul className="space-y-2 ml-4">
                          <li className="flex items-center gap-2 text-sm">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            Purchase contract uploaded
                          </li>
                          <li className="flex items-center gap-2 text-sm">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            Seller acknowledgment/disclosures uploaded
                          </li>
                          <li className="flex items-center gap-2 text-sm">
                            <FileCheck className="h-4 w-4 text-muted-foreground" />
                            OCR extraction complete
                          </li>
                        </ul>
                      </div>

                      <Link href={`/deals/${dealId}`}>
                        <Button variant="outline" size="sm">
                          Go to Deal Documents
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>

                      {!workflow?.phaseCompletions?.[1] && (
                        <Button
                          size="sm"
                          onClick={() => handleCompletePhase(1)}
                          disabled={completePhase.isPending}
                        >
                          Mark Documents Uploaded
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </AccordionContent>
            </AccordionItem>

            {/* Phase 2: Compliance Review & Approval */}
            <AccordionItem value="phase-2" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    workflow?.phaseCompletions?.[2] ? 'bg-green-500 text-white' :
                    workflow?.currentPhase === 2 ? 'bg-emerald-500 text-white' : 'bg-secondary'
                  }`}>
                    {workflow?.phaseCompletions?.[2] ? <CheckCircle2 className="h-4 w-4" /> : '2'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{PHASE_DESCRIPTIONS[2].title}</span>
                  </div>
                  <PhaseStatus phase={2} workflow={workflow} />
                  <StatusIcon status={compliance.overallStatus} size="sm" />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                {(() => {
                  const access = canAccessPhase(2, workflow, compliance);
                  if (!access.allowed) {
                    return (
                      <Alert>
                        <Lock className="h-4 w-4" />
                        <AlertDescription>{access.reason}</AlertDescription>
                      </Alert>
                    );
                  }
                  return (
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground">{PHASE_DESCRIPTIONS[2].description}</p>

                      {/* Contract Validation */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          Contract Validation
                          <StatusIcon status={compliance.phase3Status} size="sm" />
                        </h4>
                        {[
                          { key: 'buyerMatchesLlc', label: 'Buyer matches LLC', critical: true },
                          { key: 'sellerMatchesRecords', label: 'Seller matches records', critical: false },
                          { key: 'contractAssignable', label: 'Contract assignable (and/or assigns)', critical: true },
                          { key: 'asIsLanguage', label: 'AS-IS language present', critical: true },
                          { key: 'contractNotExpired', label: 'Contract not expired', critical: true },
                          { key: 'sellerSignaturePresent', label: 'Seller signature present', critical: true },
                        ].map((check) => (
                          <div key={check.key} className="flex items-center justify-between py-2 border-b last:border-0">
                            <span className="text-sm">
                              {check.label}
                              {check.critical && <span className="text-red-400 ml-1">*</span>}
                            </span>
                            {(compliance as any)[check.key] === true ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400" />
                            ) : (compliance as any)[check.key] === false ? (
                              <XCircle className="h-4 w-4 text-red-400" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* 8 Oklahoma Disclosures */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          Oklahoma Disclosures (8 Required)
                          <StatusIcon status={compliance.phase4Status} size="sm" />
                        </h4>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground">Progress</span>
                          <span className="text-sm font-medium">{disclosureProgress.found}/{disclosureProgress.total}</span>
                        </div>
                        <Progress value={disclosureProgress.percentage} className="h-2 mb-3" />

                        {disclosuresData?.data && (
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {disclosuresData.data.map((disclosure) => {
                              const found = compliance.disclosureResults?.[disclosure.disclosureId];
                              const isHighRisk = disclosure.disclosureId === 'OK-D5' || disclosure.disclosureId === 'OK-D8';
                              return (
                                <div key={disclosure.disclosureId} className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                                  found ? 'bg-green-500/10' : 'bg-red-500/10'
                                }`}>
                                  <div className="flex-1">
                                    <span className={`text-sm ${found ? 'text-green-400' : 'text-red-400'}`}>
                                      {disclosure.disclosureId}: {disclosure.name}
                                    </span>
                                    {isHighRisk && !found && (
                                      <Badge variant="destructive" className="ml-2 text-xs">HIGH RISK</Badge>
                                    )}
                                  </div>
                                  {found ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Overall Status */}
                      <div className="p-4 rounded-lg bg-secondary/50">
                        <div className="flex items-center gap-4">
                          <div className={`h-16 w-16 rounded-lg flex items-center justify-center ${
                            compliance.overallStatus === 'GREEN' ? 'bg-green-500/20' :
                            compliance.overallStatus === 'YELLOW' ? 'bg-yellow-500/20' :
                            compliance.overallStatus === 'RED' ? 'bg-red-500/20' : 'bg-secondary'
                          }`}>
                            <Shield className={`h-8 w-8 ${
                              compliance.overallStatus ? STATUS_TEXT_COLORS[compliance.overallStatus] : 'text-muted-foreground'
                            }`} />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{compliance.overallStatus || 'PENDING'}</p>
                            <p className="text-sm text-muted-foreground">
                              {compliance.overallStatus === 'GREEN' ? 'All checks passed - can distribute' :
                               compliance.overallStatus === 'YELLOW' ? 'Remediable issues - manual review required' :
                               compliance.overallStatus === 'RED' ? 'Critical issues - deal blocked' : 'Awaiting validation'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {!workflow?.phaseCompletions?.[2] && compliance.overallStatus === 'GREEN' && (
                        <Button
                          size="sm"
                          onClick={() => handleCompletePhase(2)}
                          disabled={completePhase.isPending}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Confirm GREEN Status & Continue
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </AccordionContent>
            </AccordionItem>

            {/* Phase 3: Approved / Pre-Distribution */}
            <AccordionItem value="phase-3" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    workflow?.phaseCompletions?.[3] ? 'bg-green-500 text-white' :
                    workflow?.currentPhase === 3 ? 'bg-emerald-500 text-white' : 'bg-secondary'
                  }`}>
                    {workflow?.phaseCompletions?.[3] ? <CheckCircle2 className="h-4 w-4" /> : '3'}
                  </div>
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{PHASE_DESCRIPTIONS[3].title}</span>
                  </div>
                  <PhaseStatus phase={3} workflow={workflow} />
                  {compliance.brokerDecision === 'approved' && (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Broker Approved
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                {(() => {
                  const access = canAccessPhase(3, workflow, compliance);
                  if (!access.allowed) {
                    return (
                      <Alert>
                        <Lock className="h-4 w-4" />
                        <AlertDescription>{access.reason}</AlertDescription>
                      </Alert>
                    );
                  }
                  return (
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground">{PHASE_DESCRIPTIONS[3].description}</p>

                      {/* Distribution Channels */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Distribution Channels</h4>
                        <DistributionChannelForm
                          dealId={parseInt(dealId)}
                          state={compliance.state}
                          currentChannels={distributionChannels}
                          isReadOnly={workflow?.phaseCompletions?.[3] === true}
                          onComplete={() => {}}
                        />
                      </div>

                      {/* MSA/ASA Agreements */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Required Agreements (OK-GATE-4)</h4>

                        {/* MSA */}
                        <div className={`p-4 rounded-lg border ${
                          needsMSA ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-secondary/50'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FileSignature className={`h-5 w-5 ${needsMSA ? 'text-amber-400' : 'text-muted-foreground'}`} />
                              <div>
                                <p className="font-medium">Marketing Services Agreement (MSA)</p>
                                <p className="text-sm text-muted-foreground">Required for all distribution</p>
                              </div>
                            </div>
                            <Badge variant="outline">{needsMSA ? 'Required' : 'Not Required'}</Badge>
                          </div>
                        </div>

                        {/* ASA */}
                        <div className={`p-4 rounded-lg border ${
                          needsASA ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-secondary/50'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FileSignature className={`h-5 w-5 ${needsASA ? 'text-amber-400' : 'text-muted-foreground'}`} />
                              <div>
                                <p className="font-medium">Auction Services Agreement (ASA)</p>
                                <p className="text-sm text-muted-foreground">Required for Hubzu auction channel</p>
                              </div>
                            </div>
                            <Badge variant="outline">{needsASA ? 'Required' : 'Not Required'}</Badge>
                          </div>
                        </div>
                      </div>

                      {/* Broker Review */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Broker Review</h4>
                        <BrokerReviewForm
                          dealId={parseInt(dealId)}
                          state={compliance.state}
                          currentDecision={compliance.brokerDecision}
                          currentNotes={compliance.brokerNotes}
                          reviewedAt={compliance.brokerReviewedAt}
                          reviewedBy={compliance.brokerReviewedBy}
                          isReadOnly={workflow?.phaseCompletions?.[3] === true}
                          onComplete={() => handleCompletePhase(3)}
                        />
                      </div>
                    </div>
                  );
                })()}
              </AccordionContent>
            </AccordionItem>

            {/* Phase 4: Offer Accepted / 3-Day Hold */}
            <AccordionItem value="phase-4" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    workflow?.phaseCompletions?.[4] ? 'bg-green-500 text-white' :
                    workflow?.currentPhase === 4 ? 'bg-emerald-500 text-white' : 'bg-secondary'
                  }`}>
                    {workflow?.phaseCompletions?.[4] ? <CheckCircle2 className="h-4 w-4" /> : '4'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Gavel className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{PHASE_DESCRIPTIONS[4].title}</span>
                  </div>
                  <PhaseStatus phase={4} workflow={workflow} />
                  {holdStatus.expired && compliance.cancellationDeliveryDate && (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Hold Complete
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                {(() => {
                  const access = canAccessPhase(4, workflow, compliance);
                  if (!access.allowed) {
                    return (
                      <Alert>
                        <Lock className="h-4 w-4" />
                        <AlertDescription>{access.reason}</AlertDescription>
                      </Alert>
                    );
                  }
                  return (
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground">{PHASE_DESCRIPTIONS[4].description}</p>

                      {/* 3-Day Hold Warning */}
                      <Alert className="bg-amber-500/10 border-amber-500/30">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <AlertDescription className="text-amber-400">
                          <strong>CRITICAL - Oklahoma 3-Day Statutory Hold:</strong> After seller acknowledges the assignment,
                          you must wait 3 calendar days before executing the assignment. Violating this is a LAWSUIT RISK.
                        </AlertDescription>
                      </Alert>

                      {/* Requirements */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Requirements (OK-GATE-5):</h4>
                        <ul className="space-y-2">
                          <li className="flex items-center justify-between py-2 border-b">
                            <span className="text-sm">Transaction coordinator assigned</span>
                            {compliance.stateSpecificData?.transactionCoordinatorId ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground" />
                            )}
                          </li>
                          <li className="flex items-center justify-between py-2 border-b">
                            <span className="text-sm">Seller acknowledgment uploaded</span>
                            {compliance.cancellationDeliveryDate ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground" />
                            )}
                          </li>
                          <li className="flex items-center justify-between py-2">
                            <span className="text-sm">Seller acknowledgment date</span>
                            <span className="text-sm font-medium">
                              {compliance.cancellationDeliveryDate
                                ? new Date(compliance.cancellationDeliveryDate).toLocaleDateString()
                                : 'Not recorded'}
                            </span>
                          </li>
                        </ul>
                      </div>

                      {/* 3-Day Hold Status */}
                      {compliance.cancellationDeliveryDate && (
                        <div className={`p-4 rounded-lg ${
                          holdStatus.expired ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'
                        }`}>
                          <div className="flex items-center gap-3">
                            {holdStatus.expired ? (
                              <CheckCircle2 className="h-8 w-8 text-green-400" />
                            ) : (
                              <Clock className="h-8 w-8 text-amber-400" />
                            )}
                            <div>
                              <p className={`font-medium ${holdStatus.expired ? 'text-green-400' : 'text-amber-400'}`}>
                                {holdStatus.message}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Seller acknowledged: {new Date(compliance.cancellationDeliveryDate).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {!workflow?.phaseCompletions?.[4] && compliance.cancellationDeliveryDate && (
                        <Button
                          size="sm"
                          onClick={() => handleCompletePhase(4)}
                          disabled={completePhase.isPending}
                        >
                          Mark Seller Acknowledgment Complete
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </AccordionContent>
            </AccordionItem>

            {/* Phase 5: Buyer Contract Execution */}
            <AccordionItem value="phase-5" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    workflow?.phaseCompletions?.[5] ? 'bg-green-500 text-white' :
                    workflow?.currentPhase === 5 ? 'bg-emerald-500 text-white' : 'bg-secondary'
                  }`}>
                    {workflow?.phaseCompletions?.[5] ? <CheckCircle2 className="h-4 w-4" /> : '5'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{PHASE_DESCRIPTIONS[5].title}</span>
                  </div>
                  <PhaseStatus phase={5} workflow={workflow} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                {(() => {
                  const access = canAccessPhase(5, workflow, compliance);
                  if (!access.allowed) {
                    return (
                      <Alert>
                        <Lock className="h-4 w-4" />
                        <AlertDescription>{access.reason}</AlertDescription>
                      </Alert>
                    );
                  }

                  // Check if 3-day hold has expired
                  if (!holdStatus.expired && compliance.cancellationDeliveryDate) {
                    return (
                      <Alert className="bg-red-500/10 border-red-500/30">
                        <Lock className="h-4 w-4 text-red-400" />
                        <AlertDescription className="text-red-400">
                          <strong>BLOCKED - Statutory Hold Active:</strong> {holdStatus.message}.
                          Cannot execute assignment until 3-day hold expires.
                        </AlertDescription>
                      </Alert>
                    );
                  }

                  return (
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground">{PHASE_DESCRIPTIONS[5].description}</p>

                      {/* Transaction Type */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Transaction Type</h4>
                        <TransactionTypeForm
                          dealId={parseInt(dealId)}
                          state={compliance.state}
                          currentTransactionType={compliance.transactionType}
                          isReadOnly={workflow?.phaseCompletions?.[5] === true}
                          onComplete={() => {}}
                        />
                      </div>

                      {/* Assignment Details */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Assignment Details</h4>
                        {compliance.assigneeName ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between py-2 border-b">
                              <span className="text-sm">Assignee (End Buyer)</span>
                              <span className="text-sm font-medium">{compliance.assigneeName}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b">
                              <span className="text-sm">Entity Type</span>
                              <span className="text-sm font-medium">{compliance.assigneeEntityType || '-'}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b">
                              <span className="text-sm">Assignment Fee</span>
                              <span className="text-sm font-medium">
                                {compliance.assignmentFee ? `$${compliance.assignmentFee.toLocaleString()}` : '-'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                              <span className="text-sm">Execution Date</span>
                              <span className="text-sm font-medium">
                                {compliance.assignmentExecutionDate
                                  ? new Date(compliance.assignmentExecutionDate).toLocaleDateString()
                                  : '-'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Assignment details will be recorded here once executed.
                          </p>
                        )}
                      </div>

                      {/* Timing Validation */}
                      <div className="p-4 rounded-lg bg-secondary/50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Timing Valid (3-day rule)</span>
                          {compliance.timingValid ? (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Valid
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Pending
                            </Badge>
                          )}
                        </div>
                      </div>

                      {!workflow?.phaseCompletions?.[5] && compliance.canExecuteAssignment && (
                        <Button
                          size="sm"
                          onClick={() => handleCompletePhase(5)}
                          disabled={completePhase.isPending}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Complete Assignment
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </AccordionContent>
            </AccordionItem>

            {/* Phase 6: Title, Closing & Settlement */}
            <AccordionItem value="phase-6" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    workflow?.phaseCompletions?.[6] ? 'bg-green-500 text-white' :
                    workflow?.currentPhase === 6 ? 'bg-emerald-500 text-white' : 'bg-secondary'
                  }`}>
                    {workflow?.phaseCompletions?.[6] ? <CheckCircle2 className="h-4 w-4" /> : '6'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{PHASE_DESCRIPTIONS[6].title}</span>
                  </div>
                  <PhaseStatus phase={6} workflow={workflow} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                {(() => {
                  const access = canAccessPhase(6, workflow, compliance);
                  if (!access.allowed) {
                    return (
                      <Alert>
                        <Lock className="h-4 w-4" />
                        <AlertDescription>{access.reason}</AlertDescription>
                      </Alert>
                    );
                  }
                  return (
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground">{PHASE_DESCRIPTIONS[6].description}</p>

                      {/* Optional Documents */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Optional Closing Documents</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li>- Closing Disclosure</li>
                          <li>- Settlement Statement</li>
                          <li>- Wiring Instructions</li>
                          {distributionChannels.includes('auction') && <li>- Hubzu Addendum</li>}
                        </ul>
                      </div>

                      {/* Title Company */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Title Company (Optional)</h4>
                        <p className="text-sm text-muted-foreground">
                          Coordinate with title company for closing. This information is optional but recommended.
                        </p>
                      </div>

                      {!workflow?.phaseCompletions?.[6] && (
                        <Button
                          size="sm"
                          onClick={() => handleCompletePhase(6)}
                          disabled={completePhase.isPending}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Mark Deal Closed
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Block Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="bg-card border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-red-500" />
              Block Workflow
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm text-muted-foreground">Reason</label>
            <textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              className="w-full mt-2 p-3 rounded-lg bg-secondary border text-foreground resize-none"
              rows={3}
              placeholder="Enter reason for blocking..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={handleBlock}
              disabled={blockWorkflowMutation.isPending}
            >
              {blockWorkflowMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Block Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
