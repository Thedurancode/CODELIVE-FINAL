'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Eye,
  BarChart3,
  GripVertical,
  ArrowRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { usePipeline, useUpdatePipelineStage } from '@/hooks/use-pipeline';
import { toast } from 'sonner';
import type { DealPipeline } from '@/types';

const stages = [
  { id: 'new', title: 'New', color: '#71717a' },
  { id: 'analyzing', title: 'Analyzing', color: '#3b82f6' },
  { id: 'due_diligence', title: 'Due Diligence', color: '#8b5cf6' },
  { id: 'offered', title: 'Offered', color: '#f59e0b' },
  { id: 'negotiating', title: 'Negotiating', color: '#f97316' },
  { id: 'under_contract', title: 'Under Contract', color: '#06b6d4' },
  { id: 'closed_won', title: 'Won', color: '#22c55e' },
  { id: 'closed_lost', title: 'Lost', color: '#ef4444' },
];

export default function PipelinePage() {
  const [selectedDeal, setSelectedDeal] = useState<DealPipeline | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: pipelineDeals, isLoading, error, refetch } = usePipeline();
  const updateStage = useUpdatePipelineStage();

  const deals = pipelineDeals || [];

  const handleCardClick = (deal: DealPipeline) => {
    setSelectedDeal(deal);
    setDialogOpen(true);
  };

  const moveDeal = async (dealId: string, newStage: string) => {
    try {
      await updateStage.mutateAsync({ id: dealId, stage: newStage });
      toast.success(`Deal moved to ${newStage}`);
      setDialogOpen(false);
    } catch {
      toast.error('Failed to move deal');
    }
  };

  const getDealsForStage = (stageId: string) =>
    deals.filter((d: DealPipeline) => d.stage === stageId);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Pipeline</h1>
          <p className="text-muted-foreground mt-1">Track deals through your workflow</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load pipeline</p>
            <p className="text-muted-foreground mb-4">{(error as Error).message}</p>
            <Button onClick={() => refetch()} variant="outline" className="border">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Pipeline</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Track deals through your workflow</p>
        </div>
        <Button variant="outline" size="sm" className="border text-foreground w-fit" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = getDealsForStage(stage.id);
          return (
            <div
              key={stage.id}
              className="flex-shrink-0 w-72"
            >
              <Card className="bg-card/50 border h-full">
                <CardHeader
                  className="pb-3"
                  style={{ borderBottom: `3px solid ${stage.color}` }}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-foreground">{stage.title}</CardTitle>
                    <Badge
                      variant="secondary"
                      className="text-xs"
                      style={{
                        backgroundColor: `${stage.color}20`,
                        color: stage.color,
                      }}
                    >
                      {isLoading ? '...' : stageDeals.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-2">
                  <ScrollArea className="h-[calc(100vh-280px)]">
                    <div className="space-y-2 pr-2">
                      {isLoading ? (
                        Array.from({ length: 2 }).map((_, i) => (
                          <Skeleton key={i} className="h-24 w-full" />
                        ))
                      ) : stageDeals.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No deals
                        </div>
                      ) : (
                        stageDeals.map((deal: DealPipeline) => (
                          <Card
                            key={deal.id}
                            className="bg-secondary/50 border cursor-pointer hover:bg-secondary hover:border transition-colors"
                            onClick={() => handleCardClick(deal)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-start gap-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {deal.property?.address
                                      ? typeof deal.property.address === 'string'
                                        ? deal.property.address
                                        : `${deal.property.address.houseNumber} ${deal.property.address.street}${deal.property.address.address2 ? ', ' + deal.property.address.address2 : ''}`
                                      : 'Unknown Address'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {deal.property?.city}, {deal.property?.state}
                                  </p>
                                  <div className="flex items-center justify-between mt-2">
                                    <span className="text-sm font-medium text-accent-400">
                                      ${deal.property?.askingPrice?.toLocaleString() || 'N/A'}
                                    </span>
                                    {deal.bestScore && (
                                      <Badge
                                        variant="outline"
                                        className={
                                          deal.bestScore >= 80
                                            ? 'border-green-500/50 text-green-500'
                                            : deal.bestScore >= 60
                                            ? 'border-amber-500/50 text-amber-500'
                                            : 'border-red-500/50 text-red-500'
                                        }
                                      >
                                        {deal.bestScore}%
                                      </Badge>
                                    )}
                                  </div>
                                  {deal.daysInStage !== undefined && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {deal.daysInStage} day{deal.daysInStage !== 1 ? 's' : ''} in stage
                                    </p>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Deal Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {selectedDeal?.property?.address
                ? typeof selectedDeal.property.address === 'string'
                  ? selectedDeal.property.address
                  : `${selectedDeal.property.address.houseNumber} ${selectedDeal.property.address.street}`
                : 'Deal Details'}
            </DialogTitle>
          </DialogHeader>
          {selectedDeal && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="text-sm text-foreground">
                    {selectedDeal.property?.city}, {selectedDeal.property?.state}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="text-sm text-foreground">
                    ${selectedDeal.property?.askingPrice?.toLocaleString() || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Score</p>
                  <p className="text-sm text-foreground">{selectedDeal.bestScore || 'N/A'}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Days in Stage</p>
                  <p className="text-sm text-foreground">{selectedDeal.daysInStage || 0}</p>
                </div>
              </div>

              {selectedDeal.targetFund && (
                <div>
                  <p className="text-xs text-muted-foreground">Target Fund</p>
                  <p className="text-sm text-foreground">{selectedDeal.targetFund}</p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Move to:</p>
                <div className="flex flex-wrap gap-2">
                  {stages
                    .filter((s) => s.id !== selectedDeal.stage)
                    .map((stage) => (
                      <Button
                        key={stage.id}
                        variant="outline"
                        size="sm"
                        className="border"
                        style={{
                          borderColor: `${stage.color}50`,
                          color: stage.color,
                        }}
                        onClick={() => moveDeal(selectedDeal.id, stage.id)}
                        disabled={updateStage.isPending}
                      >
                        <ArrowRight className="mr-1 h-3 w-3" />
                        {stage.title}
                      </Button>
                    ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 border text-foreground"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border text-foreground"
                >
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Score
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
