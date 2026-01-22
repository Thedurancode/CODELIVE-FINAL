'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MapPin,
  Home,
  DollarSign,
  Bed,
  Bath,
  Maximize,
  Calendar,
  Check,
  ChevronRight,
  Loader2,
  TrendingUp,
  History,
  Receipt,
  Users,
  Image,
  LayoutGrid,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { NewDealForm } from '@/components/deals/NewDealForm';
import { useEnrichProperty, useProperty } from '@/hooks/use-properties';
import Link from 'next/link';
import type { Property } from '@/types';
import { toast } from 'sonner';

// Enrichment step configuration
const enrichmentSteps = [
  { id: 'zestimate', label: 'Zestimate & Valuations', icon: TrendingUp, color: 'text-green-400' },
  { id: 'priceHistory', label: 'Price History', icon: History, color: 'text-accent-400' },
  { id: 'taxHistory', label: 'Tax History', icon: Receipt, color: 'text-amber-400' },
  { id: 'skipTrace', label: 'Skip Trace (Owner Info)', icon: Users, color: 'text-purple-400' },
  { id: 'images', label: 'Property Images', icon: Image, color: 'text-pink-400' },
  { id: 'comparables', label: 'Comparable Properties', icon: LayoutGrid, color: 'text-cyan-400' },
];

function EnrichmentResultsView({
  propertyId,
  initialProperty,
  onAddAnother,
}: {
  propertyId: string;
  initialProperty?: Property | null;
  onAddAnother: () => void;
}) {
  const { data: property, isLoading, error, refetch } = useProperty(propertyId);
  const enrichProperty = useEnrichProperty();
  const [pollingCount, setPollingCount] = useState(0);
  const [pollingDelayMs, setPollingDelayMs] = useState(2000);
  const resolvedProperty = property ?? initialProperty ?? null;

  // Poll for updates while processing
  useEffect(() => {
    if (!resolvedProperty) return;

    const processingState = resolvedProperty.processingState;
    // Terminal states from backend: active, rejected, blocked, approval_pending (enrichment done by this point)
    const terminalStates = ['active', 'rejected', 'blocked', 'approval_pending', 'scored'];
    const isProcessing = processingState && !terminalStates.includes(processingState);

    if (isProcessing) {
      const timer = setTimeout(() => {
        refetch();
        setPollingCount((prev) => prev + 1);
      }, pollingDelayMs);
      return () => clearTimeout(timer);
    }
  }, [resolvedProperty, pollingCount, pollingDelayMs, refetch]);

  useEffect(() => {
    if (pollingCount === 10) setPollingDelayMs(5000);
    if (pollingCount === 30) setPollingDelayMs(15000);
  }, [pollingCount]);

  useEffect(() => {
    setPollingCount(0);
    setPollingDelayMs(2000);
  }, [propertyId]);

  const formatCurrency = (amount?: number | null) => {
    if (!amount) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date?: string) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (date?: string | Date | null) => {
    if (!date) return null;
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Check what data was enriched
  const getEnrichmentStatus = () => {
    if (!resolvedProperty) return {};

    return {
      zestimate: {
        success: !!resolvedProperty.zestimate || !!resolvedProperty.rentZestimate,
        data: {
          zestimate: formatCurrency(resolvedProperty.zestimate),
          rentZestimate: formatCurrency(resolvedProperty.rentZestimate),
          pricePerSqft: resolvedProperty.pricePerSqft ? `$${resolvedProperty.pricePerSqft}/sqft` : null,
        },
      },
      priceHistory: {
        success: !!resolvedProperty.lastSoldPrice || !!resolvedProperty.lastSoldDate,
        data: {
          lastSoldPrice: formatCurrency(resolvedProperty.lastSoldPrice),
          lastSoldDate: formatDate(resolvedProperty.lastSoldDate),
        },
      },
      taxHistory: {
        success: !!resolvedProperty.taxAssessedValue,
        data: {
          taxAssessedValue: formatCurrency(resolvedProperty.taxAssessedValue),
        },
      },
      skipTrace: {
        success:
          !!(resolvedProperty as any).ownerName ||
          ((resolvedProperty as any).ownerPhones?.length || 0) > 0 ||
          ((resolvedProperty as any).ownerEmails?.length || 0) > 0,
        data: {
          ownerName: (resolvedProperty as any).ownerName,
          ownerPhone: (resolvedProperty as any).ownerPhones?.[0],
          ownerEmail: (resolvedProperty as any).ownerEmails?.[0],
        },
      },
      images: {
        success: (resolvedProperty.photoLinks?.length || 0) > 0 || (resolvedProperty.photos?.length || 0) > 0,
        data: {
          count: (resolvedProperty.photoLinks?.length || 0) + (resolvedProperty.photos?.length || 0),
        },
      },
      comparables: {
        success: !!resolvedProperty.comparablesCount || !!resolvedProperty.comparablesAvgPrice,
        data: {
          count: resolvedProperty.comparablesCount ? `${resolvedProperty.comparablesCount} comps` : null,
          avgPrice: formatCurrency(resolvedProperty.comparablesAvgPrice),
        },
      },
    };
  };

  const enrichmentStatus = getEnrichmentStatus();
  const processingState = resolvedProperty?.processingState;
  // Terminal states from backend: active, rejected, blocked, approval_pending (enrichment done by this point)
  const terminalStates = ['active', 'rejected', 'blocked', 'approval_pending', 'scored'];
  const isDealProcessing = processingState && !terminalStates.includes(processingState);
  const processingUpdatedAt = resolvedProperty?.processingStateUpdatedAt || resolvedProperty?.updatedAt;
  const processingAgeMs = processingUpdatedAt
    ? Date.now() - new Date(processingUpdatedAt).getTime()
    : null;
  const isStalled = Boolean(isDealProcessing && processingAgeMs && processingAgeMs > 120000);
  const enrichmentMeta = (resolvedProperty?.marketDataEnrichment || {}) as {
    status?: string;
    error?: string;
    reason?: string;
    enabledOptions?: Record<string, boolean>;
    fetchedAt?: string;
    failedAt?: string;
    skippedAt?: string;
    startedAt?: string;
  };
  const enrichmentUpdatedAt =
    resolvedProperty?.enrichedAt ||
    enrichmentMeta.fetchedAt ||
    enrichmentMeta.failedAt ||
    enrichmentMeta.skippedAt ||
    null;
  const enrichmentStatusLabel =
    enrichmentMeta.status ||
    (resolvedProperty?.enrichedAt ? 'complete' : isDealProcessing ? 'processing' : 'not_started');
  const enrichmentError = enrichmentMeta.error;
  const enrichmentStatusKey = (enrichmentStatusLabel || '').toLowerCase();
  const isEnrichmentDone = ['success', 'complete', 'failed', 'skipped'].includes(enrichmentStatusKey);
  const isEnrichmentProcessing = enrichmentStatusKey === 'processing' || (!isEnrichmentDone && Boolean(isDealProcessing));
  const enrichmentStatusMap: Record<string, { label: string; className: string }> = {
    success: { label: 'Complete', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
    complete: { label: 'Complete', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
    failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
    skipped: { label: 'Skipped', className: 'bg-zinc-600/10 text-muted-foreground border-zinc-600/30' },
    processing: { label: 'Processing', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    not_started: { label: 'Not Started', className: 'bg-zinc-600/10 text-muted-foreground border-zinc-600/30' },
    unknown: { label: 'Unknown', className: 'bg-secondary text-muted-foreground border' },
  };
  const enrichmentStatusDisplay = enrichmentStatusMap[enrichmentStatusKey] || {
    label: 'Unknown',
    className: 'bg-secondary text-muted-foreground border',
  };
  const enabledOptionLabels = enrichmentMeta.enabledOptions
    ? [
        { key: 'fetchZestimate', label: 'Zestimate' },
        { key: 'fetchPriceHistory', label: 'Price History' },
        { key: 'fetchTaxHistory', label: 'Tax History' },
        { key: 'fetchSkipTrace', label: 'Skip Trace' },
        { key: 'fetchPropertyImages', label: 'Images' },
        { key: 'fetchComparables', label: 'Comparables' },
      ]
        .filter(({ key }) => enrichmentMeta.enabledOptions?.[key])
        .map(({ label }) => label)
    : [];
  const stepOptionKeyById: Record<string, string> = {
    zestimate: 'fetchZestimate',
    priceHistory: 'fetchPriceHistory',
    taxHistory: 'fetchTaxHistory',
    skipTrace: 'fetchSkipTrace',
    images: 'fetchPropertyImages',
    comparables: 'fetchComparables',
  };
  const stepsWithStatus = enrichmentSteps.map((step) => {
    const optionKey = stepOptionKeyById[step.id];
    const optionEnabled = enrichmentMeta.enabledOptions
      ? enrichmentMeta.enabledOptions?.[optionKey] !== false
      : true;
    const status = !optionEnabled
      ? 'skipped'
      : enrichmentStatus[step.id as keyof typeof enrichmentStatus]?.success
        ? 'success'
        : isEnrichmentDone
          ? 'missing'
          : 'pending';
    return { ...step, status, optionEnabled };
  });
  const firstPendingIndex = isEnrichmentProcessing
    ? stepsWithStatus.findIndex((step) => step.status === 'pending')
    : -1;

  const handleManualEnrich = async () => {
    try {
      const result = await enrichProperty.mutateAsync(propertyId);
      const enrichment = (result as { _enrichment?: { success?: boolean; error?: string } })?._enrichment;

      if (enrichment?.success === false) {
        toast.error(enrichment.error || 'Enrichment failed');
        return;
      }

      toast.success('Enrichment request completed');
    } catch (enrichError) {
      toast.error(enrichError instanceof Error ? enrichError.message : 'Failed to run enrichment');
    }
  };

  if (isLoading && !resolvedProperty) {
    return (
      <Card className="bg-card border">
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 text-accent-500 animate-spin" />
            <p className="text-muted-foreground">Loading property data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const address = resolvedProperty?.address
    ? typeof resolvedProperty.address === 'string'
      ? resolvedProperty.address
      : `${resolvedProperty.address.houseNumber || ''} ${resolvedProperty.address.street || ''}`.trim()
    : 'Property';
  const hasRefreshError = Boolean(error);

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <Card className="bg-gradient-to-br from-green-900/30 to-green-800/20 border-green-700">
        <CardContent className="py-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
              <Check className="h-6 w-6 text-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-foreground mb-1">Deal Created Successfully!</h2>
              <p className="text-foreground">{address}, {resolvedProperty?.city}, {resolvedProperty?.state} {resolvedProperty?.zip}</p>
              {isEnrichmentProcessing && (
                <div className="flex items-center gap-2 mt-2 text-amber-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Enrichment in progress...</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border text-foreground"
                onClick={onAddAnother}
              >
                Add Another
              </Button>
              <Link href={`/deals/${propertyId}`}>
                <Button className="bg-accent-600 hover:bg-accent-700 text-white">
                  View Deal
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {isStalled && isEnrichmentProcessing && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Enrichment hasn&apos;t updated in a while.
            </p>
            <p className="text-xs text-muted-foreground">
              Processing may be paused on the server. You can keep waiting or refresh the deal.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border"
              onClick={handleManualEnrich}
              disabled={enrichProperty.isPending}
            >
              {enrichProperty.isPending ? 'Running...' : 'Run Enrichment'}
            </Button>
            <Button variant="outline" size="sm" className="border" onClick={() => refetch()}>
              Refresh
            </Button>
          </div>
        </div>
      )}

      {hasRefreshError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Unable to refresh deal details.
            </p>
            <p className="text-xs text-muted-foreground">
              We&apos;ll keep showing what we have. Try again or open the deal page.
            </p>
          </div>
          <Button variant="outline" size="sm" className="border" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Property Summary */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Home className="h-5 w-5 text-accent-400" />
            Property Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-secondary/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Bed className="h-4 w-4" />
                Bedrooms
              </div>
              <p className="text-foreground font-semibold">{resolvedProperty?.bedroomCount || 'N/A'}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Bath className="h-4 w-4" />
                Bathrooms
              </div>
              <p className="text-foreground font-semibold">{resolvedProperty?.bathroomCount || 'N/A'}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Maximize className="h-4 w-4" />
                Sq Ft
              </div>
              <p className="text-foreground font-semibold">
                {resolvedProperty?.livingSpaceSqFt ? resolvedProperty.livingSpaceSqFt.toLocaleString() : 'N/A'}
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Calendar className="h-4 w-4" />
                Year Built
              </div>
              <p className="text-foreground font-semibold">{resolvedProperty?.yearBuilt || 'N/A'}</p>
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {resolvedProperty?.reservePrice && (
              <div className="bg-secondary/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <DollarSign className="h-4 w-4" />
                  Asking Price
                </div>
                <p className="text-foreground font-semibold text-lg">{formatCurrency(resolvedProperty.reservePrice)}</p>
              </div>
            )}
            {resolvedProperty?.arv && (
              <div className="bg-secondary/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <TrendingUp className="h-4 w-4" />
                  ARV
                </div>
                <p className="text-green-400 font-semibold text-lg">{formatCurrency(resolvedProperty.arv)}</p>
              </div>
            )}
            {resolvedProperty?.zestimate && (
              <div className="bg-secondary/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <TrendingUp className="h-4 w-4" />
                  Zestimate
                </div>
                <p className="text-accent-400 font-semibold text-lg">{formatCurrency(resolvedProperty.zestimate)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Enrichment Results */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Loader2 className={`h-5 w-5 text-accent-400 ${isEnrichmentProcessing ? 'animate-spin' : ''}`} />
            Market Data Enrichment
            {isEnrichmentProcessing && (
              <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-400 border-amber-500/30">
                Processing
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border p-3 mb-4 bg-secondary/30">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={enrichmentStatusDisplay.className}>
                    {enrichmentStatusDisplay.label}
                  </Badge>
                  {enrichmentUpdatedAt && (
                    <span className="text-xs text-muted-foreground">
                      Updated {formatDateTime(enrichmentUpdatedAt)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border"
                  onClick={handleManualEnrich}
                  disabled={enrichProperty.isPending}
                >
                  {enrichProperty.isPending ? 'Running...' : 'Run Enrichment'}
                </Button>
                <Button variant="outline" size="sm" className="border" onClick={() => refetch()}>
                  Refresh
                </Button>
              </div>
            </div>
            {enrichmentError && (
              <p className="text-xs text-red-400 mt-2">
                Error: {enrichmentError}
              </p>
            )}
            {enrichmentMeta.reason && (
              <p className="text-xs text-amber-400 mt-2">
                Reason: {enrichmentMeta.reason}
              </p>
            )}
            {enabledOptionLabels.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Requested:</span>
                {enabledOptionLabels.map((label) => (
                  <Badge key={label} variant="outline" className="bg-secondary/60 text-muted-foreground border">
                    {label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {stepsWithStatus.map((step, index) => {
              const status = enrichmentStatus[step.id as keyof typeof enrichmentStatus];
              const Icon = step.icon;
              const hasData = status?.success;
              const data = status?.data || {};
              const isActiveStep = isEnrichmentProcessing && step.status === 'pending' && index === firstPendingIndex;
              const isQueuedStep = isEnrichmentProcessing && step.status === 'pending' && index > firstPendingIndex;
              const isSkipped = step.status === 'skipped';
              const isMissing = step.status === 'missing';

              return (
                <div
                  key={step.id}
                  className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                    hasData
                      ? 'bg-green-900/20 border border-green-700/30'
                      : isSkipped
                        ? 'bg-secondary/30 border border'
                        : isActiveStep
                          ? 'bg-amber-500/10 border border-amber-500/30'
                          : 'bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${hasData ? 'bg-green-600/20' : 'bg-zinc-700/50'}`}>
                      <Icon
                        className={`h-4 w-4 ${
                          hasData ? 'text-green-400' : isSkipped ? 'text-muted-foreground/60' : 'text-muted-foreground'
                        }`}
                      />
                    </div>
                    <div>
                      <p className={`font-medium ${hasData ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {step.label}
                      </p>
                      {hasData ? (
                        <p className="text-sm text-muted-foreground">
                          {Object.entries(data)
                            .filter(([_, v]) => v)
                            .map(([k, v]) => `${v}`)
                            .join(' • ') || 'Data found'}
                        </p>
                      ) : isSkipped ? (
                        <p className="text-xs text-muted-foreground">Skipped</p>
                      ) : isActiveStep ? (
                        <p className="text-xs text-amber-400">In progress...</p>
                      ) : isQueuedStep ? (
                        <p className="text-xs text-muted-foreground">Queued</p>
                      ) : isMissing && isEnrichmentDone ? (
                        <p className="text-xs text-muted-foreground">No data returned</p>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    {isActiveStep ? (
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    ) : hasData ? (
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                    ) : isSkipped ? (
                      <XCircle className="h-5 w-5 text-muted-foreground/60" />
                    ) : (
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Photo Preview */}
          {resolvedProperty?.photoLinks && resolvedProperty.photoLinks.length > 0 && (
            <div className="mt-4 pt-4 border-t border">
              <p className="text-sm text-muted-foreground mb-3">
                {resolvedProperty.photoLinks.length} Photo{resolvedProperty.photoLinks.length !== 1 ? 's' : ''} Available
              </p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {resolvedProperty.photoLinks.slice(0, 6).map((photo: string, index: number) => (
                  <div
                    key={index}
                    className="flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden bg-secondary"
                  >
                    <img
                      src={photo}
                      alt={`Property photo ${index + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                ))}
                {resolvedProperty.photoLinks.length > 6 && (
                  <div className="flex-shrink-0 w-20 h-16 rounded-lg bg-secondary flex items-center justify-center">
                    <span className="text-muted-foreground text-sm">+{resolvedProperty.photoLinks.length - 6}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        <Button
          variant="outline"
          className="border text-foreground"
          onClick={() => (window.location.href = '/deals')}
        >
          View All Deals
        </Button>
        <Button
          className="bg-accent-600 hover:bg-accent-700 text-white"
          onClick={() => (window.location.href = '/marketplace')}
        >
          Go to Marketplace
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function NewDealPage() {
  const [createdPropertyId, setCreatedPropertyId] = useState<string | null>(null);
  const [createdProperty, setCreatedProperty] = useState<Property | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleAddAnother = () => {
    setIsSuccess(false);
    setCreatedPropertyId(null);
    setCreatedProperty(null);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Add New Deal</h1>
          <p className="text-muted-foreground mt-1">
            {isSuccess
              ? 'Review your deal and enrichment results'
              : 'Enter property details to add a new deal to the platform'}
          </p>
        </div>
      </div>

      {/* Success State with Enrichment Results */}
      {isSuccess && createdPropertyId ? (
        <EnrichmentResultsView
          propertyId={createdPropertyId}
          initialProperty={createdProperty}
          onAddAnother={handleAddAnother}
        />
      ) : (
        <NewDealForm
          onSuccess={(property) => {
            setCreatedPropertyId(String(property.id));
            setCreatedProperty(property);
            setIsSuccess(true);
          }}
        />
      )}
    </div>
  );
}
