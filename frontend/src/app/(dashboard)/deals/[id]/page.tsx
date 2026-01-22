'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProperty } from '@/hooks/use-properties';
import { usePropertyViewers, useRecordPropertyView } from '@/hooks/use-property-viewers';
import { useTeamConversationByProperty, useUnarchiveTeamConversation } from '@/hooks/use-team-chat';
import { useLatestComplianceCheck } from '@/hooks/use-compliance-rules';
import { useDealOffers } from '@/hooks/use-deal-offers';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ComplianceIssueReviewPanel } from '@/components/compliance/ComplianceIssueReviewPanel';
import {
  MapPin,
  Home,
  DollarSign,
  Bed,
  Bath,
  Maximize,
  Maximize2,
  User,
  Users,
  Eye,
  ArrowLeft,
  Edit,
  Heart,
  Share2,
  Navigation,
  Check,
  X,
  Sparkles,
  Building2,
  FileText,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Info,
  Calendar,
  TrendingUp,
  LucideIcon,
  MessageSquare,
  HandCoins,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { PropertyContactsSection } from '@/components/deals/PropertyContactsSection';
import { PropertyPhotosModal } from '@/components/deals/PropertyPhotosModal';
import { PotentialBuyersSection } from '@/components/deals/PotentialBuyersSection';
import { UnifiedDocumentSection } from '@/components/deals/UnifiedDocumentSection';
import { PropertyDocumentsSection } from '@/components/deals/PropertyDocumentsSection';
import { OffersSection } from '@/components/deals/OffersSection';
import { SkipTraceSection } from '@/components/deals/SkipTraceSection';
import { ValuationSection } from '@/components/deals/ValuationSection';
import { ImageAnalysisSection } from '@/components/deals/ImageAnalysisSection';
import { DocumentDropProvider } from '@/components/deals/DocumentDropContext';
import { DocumentEmailModal } from '@/components/deals/DocumentEmailModal';
import { PublicPropertyChat } from '@/components/deals/PublicPropertyChat';
import { PublicLinkManager } from '@/components/deals/PublicLinkManager';
import { PropertyChecklistButton } from '@/components/property/PropertyChecklistButton';
import { StreetViewModal } from '@/components/maps/StreetViewModal';
import { PropertyNotesSection } from '@/components/deals/PropertyNotesSection';

const statusColors: Record<string, string> = {
  new: 'bg-accent-500/10 text-accent-500 border-accent-500/20',
  enriched: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  scored: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  submitted: 'bg-green-500/10 text-green-500 border-green-500/20',
  accepted: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const complianceColors: Record<string, string> = {
  Green: 'bg-green-500/10 text-green-500 border-green-500/20',
  Yellow: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  Red: 'bg-red-500/10 text-red-500 border-red-500/20',
};

// Approval status config for marketplace visibility
const approvalStatusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-zinc-500/10 text-muted-foreground border-zinc-500/20' },
  pending_broker_approval: { label: 'Pending Approval', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  approved: { label: 'Approved', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  rejected: { label: 'Rejected', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  live: { label: 'Live', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
};

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = params.id as string;

  const { data: property, isLoading, error } = useProperty(propertyId);
  const { data: latestComplianceCheck, isLoading: latestComplianceLoading } = useLatestComplianceCheck(propertyId);
  const { data: viewersData } = usePropertyViewers(propertyId);
  const { data: offersData } = useDealOffers(propertyId);
  const recordView = useRecordPropertyView();

  // Team chat conversation for this property
  const propertyIdNum = propertyId ? parseInt(propertyId, 10) : null;
  const { data: propertyConversation, isLoading: conversationLoading, refetch: refetchConversation } = useTeamConversationByProperty(
    propertyIdNum && !isNaN(propertyIdNum) ? propertyIdNum : null
  );
  const unarchiveConversation = useUnarchiveTeamConversation();

  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const [photosModalOpen, setPhotosModalOpen] = useState(false);
  const [propertyPhotos, setPropertyPhotos] = useState<string[]>([]);
  const [slideshowOpen, setSlideshowOpen] = useState(false);

  // Contact dialog state for checklist integration
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [preselectedContactRole, setPreselectedContactRole] = useState<string | undefined>();
  const [viewersModalOpen, setViewersModalOpen] = useState(false);
  const [streetViewModalOpen, setStreetViewModalOpen] = useState(false);

  // Handle contact item click from checklist
  const handleChecklistContactClick = (contactSpec: { category: string; role: string }) => {
    console.log('handleChecklistContactClick called with:', contactSpec);

    // Map the category/role to ContactRole type
    const roleMap: Record<string, string> = {
      'seller': 'seller',
      'wholesaler': 'wholesaler',
      'broker': 'broker',
      'attorney': 'attorney',
      'buyer': 'buyer',
      're_agent': 're_agent',
      'agent': 'agent',
    };

    const role = roleMap[contactSpec.category.toLowerCase()] || roleMap[contactSpec.role.toLowerCase()] || 'other';
    console.log('Mapped role:', role);
    console.log('Opening contact dialog with preselected role:', role);

    setPreselectedContactRole(role as any);
    setContactDialogOpen(true);
  };

  // Record view when page loads
  useEffect(() => {
    if (propertyId) {
      recordView.mutate(propertyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // Sync property photos
  useEffect(() => {
    if (property) {
      const photos = property.photoLinks || property.photos || [];
      setPropertyPhotos(photos);
    }
  }, [property]);

  // Keyboard navigation for slideshow (must be before early returns)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // F key to open fullscreen (only when photos exist)
      if ((e.key === 'f' || e.key === 'F') && !slideshowOpen && propertyPhotos.length > 0) {
        e.preventDefault();
        setSlideshowOpen(true);
        return;
      }

      // Only handle these keys when slideshow is open
      if (!slideshowOpen) return;

      if (e.key === 'Escape') setSlideshowOpen(false);
      if (e.key === 'ArrowRight') {
        setCurrentPhotoIndex((prev) => {
          const photos = propertyPhotos.length > 0 ? propertyPhotos : [];
          return photos.length > 0 ? (prev + 1) % photos.length : 0;
        });
      }
      if (e.key === 'ArrowLeft') {
        setCurrentPhotoIndex((prev) => {
          const photos = propertyPhotos.length > 0 ? propertyPhotos : [];
          return photos.length > 0 ? (prev - 1 + photos.length) % photos.length : 0;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slideshowOpen, propertyPhotos]);

  if (isLoading) {
    return <DealDetailSkeleton />;
  }

  if (error || !property) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <X className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Property not found</p>
            <p className="text-muted-foreground">The property you&apos;re looking for doesn&apos;t exist.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Use propertyPhotos state (synced with modal) or fallback to property data
  const photos = propertyPhotos.length > 0 ? propertyPhotos : (property.photoLinks || property.photos || []);
  const address = typeof property.address === 'string'
    ? property.address
    : property.address
      ? `${property.address.houseNumber || ''} ${property.address.street || ''}${property.address.address2 ? ', ' + property.address.address2 : ''}`.trim()
      : 'Address not available';

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date?: string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const contractOcr = latestComplianceCheck?.contractOcr || null;
  const ocrConfidence = contractOcr && typeof contractOcr.confidence === 'number'
    ? Math.round(contractOcr.confidence * 100)
    : null;
  const ocrConfidenceLabel = ocrConfidence !== null ? `${ocrConfidence}%` : 'n/a';
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

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground -ml-2">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">{address}</h1>
            {(() => {
              const status = property.approvalStatus || 'draft';
              const config = approvalStatusConfig[status] || approvalStatusConfig.draft;
              return (
                <Badge variant="outline" className={config.color}>
                  {config.label}
                </Badge>
              );
            })()}
            {property.status && (
              <Badge variant="outline" className={statusColors[property.status] || ''}>
                {property.status}
              </Badge>
            )}
            {property.complianceStatus && (
              <Badge variant="outline" className={complianceColors[property.complianceStatus] || ''}>
                {property.complianceStatus}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <MapPin className="h-4 w-4" />
            {property.city}, {property.state} {property.zip}
            {property.county && <span>• {property.county} County</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" className="border text-muted-foreground hover:bg-secondary" onClick={() => setLiked(!liked)}>
            <Heart className={cn('h-4 w-4', liked && 'fill-red-500 text-red-500')} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="border text-muted-foreground hover:bg-secondary"
            onClick={() => {
              const publicChatUrl = `${window.location.origin}/property-chat/${propertyId}`;
              navigator.clipboard.writeText(publicChatUrl);
              toast.success('Public chat link copied!', {
                description: 'Share this link to invite others to discuss this property',
                action: {
                  label: 'Open',
                  onClick: () => window.open(publicChatUrl, '_blank'),
                },
              });
            }}
            title="Copy public chat link"
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="border text-muted-foreground hover:bg-secondary"
            onClick={() => setStreetViewModalOpen(true)}
            title="View on Google Street View"
          >
            <Navigation className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border text-muted-foreground hover:bg-secondary"
            onClick={async () => {
              // If conversation is archived, unarchive it first
              if (propertyConversation?.id && propertyConversation.isArchived) {
                try {
                  await unarchiveConversation.mutateAsync(propertyConversation.id);
                  toast.success('Conversation unarchived', {
                    description: 'Opening team chat...'
                  });

                  // Refetch the conversation to get updated data
                  await refetchConversation();

                  // Small delay to ensure the query cache is updated
                  await new Promise(resolve => setTimeout(resolve, 300));
                } catch (error) {
                  toast.error('Failed to unarchive conversation');
                  return;
                }
              }

              // Emit custom event to open messenger with this property's conversation
              const event = new CustomEvent('openMessengerForProperty', {
                detail: { propertyId: propertyIdNum, conversationId: propertyConversation?.id }
              });
              window.dispatchEvent(event);

              if (!propertyConversation?.isArchived) {
                toast.success(
                  propertyConversation?.id
                    ? 'Opening team chat...'
                    : 'Creating team chat...',
                  {
                    description: propertyConversation?.id
                      ? `Conversation for ${address || 'this property'}`
                      : 'Starting a new conversation for this property'
                  }
                );
              }
            }}
            disabled={conversationLoading}
          >
            <MessageSquare className="mr-1 md:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Team Chat</span>
          </Button>
          <PropertyChecklistButton
            propertyId={propertyIdNum || parseInt(propertyId, 10)}
            variant="outline"
            size="sm"
            showProgress={true}
            onContactItemClick={handleChecklistContactClick}
          />
          <Button
            variant="outline"
            size="sm"
            className="border text-muted-foreground hover:bg-secondary"
            onClick={() => setPhotosModalOpen(true)}
          >
            <ImageIcon className="mr-1 md:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Photos</span>
            {propertyPhotos.length > 0 && (
              <span className="ml-1 text-xs bg-accent-500/20 text-accent-400 px-1.5 py-0.5 rounded">
                {propertyPhotos.length}
              </span>
            )}
          </Button>
          <Link href={`/deals/${propertyId}/edit`}>
            <Button variant="outline" size="sm" className="border text-muted-foreground hover:bg-secondary">
              <Edit className="mr-1 md:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Edit</span>
            </Button>
          </Link>
          <PublicLinkManager propertyId={propertyId} />
        </div>
      </div>

      {/* Key Stats Row */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        <StatCard icon={Bed} label="Bedrooms" value={property.bedroomCount ?? 'N/A'} color="text-accent-500" />
        <StatCard icon={Bath} label="Bathrooms" value={property.bathroomCount ?? 'N/A'} color="text-purple-500" />
        <StatCard icon={Maximize} label="Living Area" value={property.livingSpaceSqFt ? `${property.livingSpaceSqFt.toLocaleString()} sqft` : 'N/A'} color="text-amber-500" />
        <StatCard icon={Maximize} label="Lot Size" value={property.lotSizeSqFt ? `${property.lotSizeSqFt.toLocaleString()} sqft` : 'N/A'} color="text-green-500" />
        <StatCard icon={HandCoins} label="Total Offers" value={offersData?.length || 0} color="text-emerald-500" />
        <StatCard icon={Users} label="Unique Viewers" value={viewersData?.uniqueViewers || 0} color="text-pink-500" onClick={() => setViewersModalOpen(true)} />
      </div>

      {/* Main Content Grid - wrapped in DocumentDropProvider for drag-to-email */}
      <DocumentDropProvider>
        <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
          {/* Photo Gallery */}
          <Card className="bg-card border overflow-hidden self-start">
            <CardContent className="p-0">
              {photos.length > 0 ? (
                <>
                  <div className="relative aspect-video bg-secondary">
                    <img
                      src={photos[currentPhotoIndex]}
                      alt={`Property photo ${currentPhotoIndex + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {/* Fullscreen button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSlideshowOpen(true)}
                      className="absolute top-2 right-2 bg-background/50 hover:bg-background/70 text-foreground"
                    >
                      <Maximize2 className="h-5 w-5" />
                    </Button>
                    {photos.length > 1 && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={prevPhoto}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/50 hover:bg-background/70 text-foreground"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={nextPhoto}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/50 hover:bg-background/70 text-foreground"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/70 px-3 py-1 rounded-full">
                          <span className="text-foreground text-sm">{currentPhotoIndex + 1} / {photos.length}</span>
                        </div>
                      </>
                    )}
                  </div>
                  {photos.length > 1 && (
                    <div className="flex gap-2 p-4 overflow-x-auto">
                      {photos.map((photo: string, index: number) => (
                        <button
                          key={index}
                          onClick={() => setCurrentPhotoIndex(index)}
                          className={cn(
                            'flex-shrink-0 w-20 h-16 rounded overflow-hidden border-2 transition-all',
                            index === currentPhotoIndex
                              ? 'border-accent-500 opacity-100'
                              : 'border-transparent opacity-60 hover:opacity-100'
                          )}
                        >
                          <img src={photo} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground text-sm">No photos available</p>
                </div>
              )}
            </CardContent>
            {/* Description - under photos */}
            {((property.description?.trim() || property.propertyListingDescription?.trim())) && (
              <div className="border-t border p-6">
                <div className="flex items-center gap-2 text-foreground font-semibold mb-2">
                  <FileText className="h-4 w-4 text-amber-500" />
                  Description
                </div>
                <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                  {property.propertyListingDescription || property.description}
                </p>
              </div>
            )}
          </Card>

          {/* Assigned Contacts */}
          <PropertyContactsSection
            propertyId={propertyId}
            externalDialogOpen={contactDialogOpen}
            onExternalDialogChange={setContactDialogOpen}
            preselectedRole={preselectedContactRole as any}
          />

          {/* Documents - with drag-to-email support */}
          <PropertyDocumentsSection
            propertyId={propertyId}
            propertyAddress={address}
          />

          {/* Deal Notes - Full width */}
          <PropertyNotesSection propertyId={propertyId} />

          {/* Potential Buyers - Full width (hidden if no matches) */}
          <PotentialBuyersSection propertyId={propertyId} />
        </div>

        {/* Right Column - Financial Summary + Property Details */}
        <div className="space-y-6">
          <Card className="bg-card border">
            <CardContent className="space-y-6">
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  Financial Summary
                </div>
                <div className="space-y-3">
                  <FinancialRow label="ARV" value={formatCurrency(property.arv)} highlight />
                  <FinancialRow label="Asking Price" value={formatCurrency(property.askingPrice || property.reservePrice)} />
                  <FinancialRow label="Purchase Price" value={formatCurrency(property.purchaseContractPrice)} />
                  <FinancialRow label="Rehab Cost" value={formatCurrency(property.rehabCost || property.renovationBudget)} />
                  <FinancialRow label="Zestimate" value={formatCurrency(property.zestimate)} />
                  <FinancialRow label="Rent Zestimate" value={formatCurrency(property.rentZestimate)} />
                </div>
                {(property.arv && property.askingPrice) && (
                  <div className="pt-4 border-t border">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Potential Profit</span>
                      <span className="text-xl font-bold text-green-400">
                        {formatCurrency(property.arv - property.askingPrice - (property.rehabCost || 0))}
                      </span>
                    </div>
                  </div>
                )}
              </section>

              <div className="border-t border" />

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Home className="h-5 w-5 text-accent-500" />
                  Property Details
                </div>
                <DetailRow label="Property Type" value={property.propertyType} />
                <DetailRow label="Year Built" value={property.yearBuilt} />
                <DetailRow label="Stories" value={property.stories} />
                <DetailRow label="Condition" value={property.condition} />
                <DetailRow label="Foundation" value={property.foundationType} />
                <DetailRow label="Roof" value={property.roof} />
                <DetailRow label="HVAC" value={property.hvac} />
                <DetailRow label="Garage" value={property.garage || property.garageCount ? `${property.garage || ''} ${property.garageCount ? `(${property.garageCount})` : ''}`.trim() : undefined} />
              </section>

              <div className="border-t border" />

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Users className="h-5 w-5 text-purple-500" />
                  Occupancy & Access
                </div>
                <DetailRow label="Occupancy Status" value={property.occupancyStatus} />
                <DetailRow label="Occupancy Details" value={property.occupancyDetails} />
                <FeatureRow label="Delivered Vacant" value={property.deliveredVacant} />
                <DetailRow label="Access" value={property.accessToProperty} />
                <DetailRow label="Lockbox Code" value={property.lockboxCode} />
              </section>

              <div className="border-t border" />

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  Features & Amenities
                </div>
                <FeatureRow label="Pool" value={property.pool} />
                <FeatureRow label="Solar Panels" value={property.solar} />
                <FeatureRow label="Septic" value={property.septic} />
                <FeatureRow label="Well Water" value={property.well} />
                <FeatureRow label="HOA" value={property.hoa} />
                {property.hoa && property.hoaDuesAmount && (
                  <DetailRow label="HOA Dues" value={`${formatCurrency(property.hoaDuesAmount)}/${property.hoaBillingFrequency || 'month'}`} />
                )}
                <DetailRow label="Water Heater" value={property.waterHeater} />
                <DetailRow label="Sewer" value={property.sewer} />
              </section>
            </CardContent>
          </Card>

        </div>
        </div>
        {/* Email Modal for document sharing */}
        <DocumentEmailModal propertyAddress={address} />
      </DocumentDropProvider>

      {/* Second Row - 2 columns */}
      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2">

        {/* Compliance & Contract - Hidden */}
        {/* <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <FileText className="h-5 w-5 text-cyan-500" />
              Contract & Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FeatureRow label="Assignable Contract" value={property.assignable} />
            <FeatureRow label="Marketing Clause" value={property.marketingClauseFound} />
            <FeatureRow label="Broker on File" value={property.brokerOnFile} />
            <FeatureRow label="Financeable" value={property.financeable} />
            <DetailRow label="Conveyance Type" value={property.conveyanceType} />
            {property.complianceNotes && property.complianceNotes.length > 0 && (
              <div className="pt-2">
                <span className="text-sm text-muted-foreground block mb-2">Compliance Notes</span>
                <div className="flex flex-wrap gap-2">
                  {property.complianceNotes.map((note: string, i: number) => (
                    <Badge key={i} variant="outline" className="bg-secondary border text-foreground">
                      {note}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="pt-2 border-t border">
              <span className="text-sm text-muted-foreground block mb-2">Compliance Issues</span>
              <ComplianceIssueReviewPanel checkId={latestComplianceCheck?.id} />
            </div>
            <div className="pt-2 border-t border">
              {latestComplianceLoading ? (
                <p className="text-xs text-muted-foreground">Loading contract OCR...</p>
              ) : contractOcr ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Contract OCR</span>
                    <Badge
                      variant="outline"
                      className={
                        contractOcr.success
                          ? 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10'
                          : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                      }
                    >
                      {contractOcr.success ? `AI ${ocrConfidenceLabel}` : 'OCR failed'}
                    </Badge>
                  </div>
                  {contractOcr.success ? (
                    <>
                      <OcrFlagRow label="Assignable (OCR)" value={contractOcr.extractedFields?.assignable} />
                      <OcrFlagRow label="Marketing Clause (OCR)" value={contractOcr.extractedFields?.marketingClauseFound} />
                      <DetailRow label="Seller (OCR)" value={formatOcrText(ocrFields.sellerName)} />
                      <DetailRow label="Buyer (OCR)" value={formatOcrText(ocrFields.buyerName)} />
                      <DetailRow label="Purchase Price (OCR)" value={ocrPurchasePrice ? formatCurrency(ocrPurchasePrice) : undefined} />
                      <DetailRow label="Closing Date (OCR)" value={ocrClosingDate ? formatDate(ocrClosingDate) : undefined} />
                      <DetailRow label="Contract Expiration (OCR)" value={ocrExpirationDate ? formatDate(ocrExpirationDate) : undefined} />
                      <DetailRow label="Address (OCR)" value={formatOcrText(ocrFields.propertyAddress)} />
                      {evidenceEntries.length > 0 && (
                        <div className="pt-2 border-t border">
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Evidence</span>
                          <div className="mt-2 space-y-1 text-xs">
                            {evidenceEntries.map(entry => {
                              const meta = formatEvidenceMeta(entry.evidence);
                              return (
                                <div key={entry.key} className="flex items-start justify-between gap-3">
                                  <span className="text-muted-foreground">{entry.label}</span>
                                  <div className="text-right max-w-[65%]">
                                    <div
                                      className="text-foreground truncate"
                                      title={entry.evidence?.snippet}
                                    >
                                      {formatEvidenceSnippet(entry.evidence?.snippet)}
                                    </div>
                                    {meta && <div className="text-[11px] text-muted-foreground">{meta}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      OCR couldn't extract contract signals yet. Re-upload or rerun compliance.
                    </p>
                  )}
                  <DetailRow
                    label="OCR Source"
                    value={contractOcr.source ? contractOcr.source.toUpperCase() : undefined}
                  />
                  <DetailRow
                    label="OCR Model"
                    value={contractOcr.model}
                  />
                  <DetailRow
                    label="Processed"
                    value={contractOcr.processedAt ? formatDate(contractOcr.processedAt) : undefined}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Contract OCR appears after a compliance check with a contract upload.
                </p>
              )}
            </div>
          </CardContent>
        </Card> */}

        {/* Who Viewed This Deal - Hidden, now shown in modal */}
        {/* <Card className="bg-card border" id="viewers-section">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Eye className="h-5 w-5 text-pink-500" />
              Who Viewed This Deal
            </CardTitle>
          </CardHeader>
          <CardContent>
            {viewersData?.data && viewersData.data.length > 0 ? (
              <div className="space-y-3">
                {viewersData.data.slice(0, 5).map((viewer: { userName?: string; viewedAt?: string; userRole?: string }, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-500 to-purple-500 flex items-center justify-center text-foreground font-semibold">
                      {viewer.userName?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground font-medium truncate">{viewer.userName}</p>
                      <p className="text-muted-foreground text-xs">{formatDate(viewer.viewedAt)}</p>
                    </div>
                    {viewer.userRole && (
                      <Badge variant="outline" className="bg-zinc-700 border text-foreground text-xs">
                        {viewer.userRole}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <Eye className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">No views yet</p>
              </div>
            )}
          </CardContent>
        </Card> */}

        {/* Offers - Hidden */}
        {/* <OffersSection propertyId={propertyId} /> */}

        {/* Skip Trace - Hidden */}
        {/* <SkipTraceSection property={property} /> */}
      </div>

      {/* AI Image Analysis */}
      <ImageAnalysisSection property={property} />

      {/* Public Property Discussion - Hidden for now */}
      {/* {propertyIdNum && (
        <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <PublicPropertyChat
            propertyId={propertyIdNum}
            propertyAddress={`${address}, ${property.city}, ${property.state}`}
          />
        </div>
      )} */}

      {/* Bottom Row - Agent & Property IDs */}
      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {/* Agent Information */}
        {property.agentFirstName && (
          <Card className="bg-card border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <User className="h-5 w-5 text-pink-500" />
                Agent Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Agent Name" value={`${property.agentFirstName} ${property.agentLastName || ''}`} />
              <DetailRow label="Email" value={property.agentEmail} />
              <DetailRow label="Phone" value={property.agentPhoneNumber} />
              <DetailRow label="License #" value={property.agentLicenseNumber} />
              <DetailRow label="Broker" value={property.brokerCompany} />
            </CardContent>
          </Card>
        )}

        {/* Wholesaler Information - Hidden */}
        {/* {(property.wholesalerLlcName || property.llcOwnerName) && (
          <Card className="bg-card border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Building2 className="h-5 w-5 text-orange-500" />
                Wholesaler
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="LLC Name" value={property.wholesalerLlcName} />
              <DetailRow label="Owner" value={property.llcOwnerName} />
              <DetailRow label="Email" value={property.llcOwnerEmail} />
              <DetailRow label="Contract Exp." value={property.purchaseContractExpiration ? formatDate(property.purchaseContractExpiration) : undefined} />
            </CardContent>
          </Card>
        )} */}

      </div>

      {/* Photos Modal */}
      <PropertyPhotosModal
        isOpen={photosModalOpen}
        onClose={() => setPhotosModalOpen(false)}
        propertyId={propertyId}
        photos={photos}
        onPhotosChange={setPropertyPhotos}
        propertyAddress={`${address}, ${property.city}, ${property.state} ${property.zip}`}
      />

      {/* Fullscreen Slideshow */}
      {slideshowOpen && photos.length > 0 && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSlideshowOpen(false)}
            className="absolute top-4 right-4 z-10 bg-background/50 hover:bg-background/70 text-foreground"
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Main image */}
          <div className="flex-1 flex items-center justify-center relative">
            <img
              src={photos[currentPhotoIndex]}
              alt={`Photo ${currentPhotoIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />

            {/* Navigation buttons */}
            {photos.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={prevPhoto}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/50 hover:bg-background/70 text-foreground h-12 w-12"
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={nextPhoto}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/50 hover:bg-background/70 text-foreground h-12 w-12"
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}

            {/* Photo counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/70 px-4 py-2 rounded-full">
              <span className="text-foreground">{currentPhotoIndex + 1} / {photos.length}</span>
            </div>
          </div>

          {/* Thumbnail strip */}
          {photos.length > 1 && (
            <div className="bg-card p-4 overflow-x-auto">
              <div className="flex gap-2 justify-center">
                {photos.map((photo: string, index: number) => (
                  <button
                    key={index}
                    onClick={() => setCurrentPhotoIndex(index)}
                    className={cn(
                      'flex-shrink-0 w-20 h-16 rounded overflow-hidden border-2 transition-all',
                      index === currentPhotoIndex
                        ? 'border-accent-500 opacity-100'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    )}
                  >
                    <img src={photo} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Property Viewers Modal */}
      <Dialog open={viewersModalOpen} onOpenChange={setViewersModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-pink-500" />
              Property Viewers
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-secondary/50 border-0">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10">
                      <Eye className="h-5 w-5 text-cyan-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{viewersData?.totalViews || 0}</p>
                      <p className="text-xs text-muted-foreground">Total Views</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-secondary/50 border-0">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-pink-500/10">
                      <Users className="h-5 w-5 text-pink-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{viewersData?.uniqueViewers || 0}</p>
                      <p className="text-xs text-muted-foreground">Unique Viewers</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Viewers List */}
            {viewersData?.data && viewersData.data.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Viewer Details</h3>
                {viewersData.data.map((viewer, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-500 to-purple-500 flex items-center justify-center text-foreground font-semibold text-lg">
                      {viewer.userName?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground font-medium">{viewer.userName || 'Unknown User'}</p>
                      <p className="text-muted-foreground text-xs">Last viewed {formatDate(viewer.viewedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-accent-500/10 border-accent-500/20 text-accent-400">
                        {viewer.viewCount} {viewer.viewCount === 1 ? 'view' : 'views'}
                      </Badge>
                      {viewer.userRole && (
                        <Badge variant="outline" className="bg-background border text-foreground">
                          {viewer.userRole}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Eye className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No views yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Be the first to share this property</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Street View Modal */}
      <StreetViewModal
        open={streetViewModalOpen}
        onOpenChange={setStreetViewModalOpen}
        address={address}
        city={property.city || ''}
        state={property.state || ''}
        zip={property.zip || ''}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, onClick }: { icon: LucideIcon; label: string; value: string | number; color: string; onClick?: () => void }) {
  return (
    <Card
      className={cn("bg-card border", onClick && "cursor-pointer hover:bg-secondary/50 transition-colors")}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg bg-secondary', color)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FinancialRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', highlight ? 'text-green-400 text-lg' : 'text-foreground')}>
        {value}
      </span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-foreground text-sm font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
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

function FeatureRow({ label, value }: { label: string; value?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="flex items-center gap-1">
        {value ? (
          <>
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-green-400 text-sm">Yes</span>
          </>
        ) : (
          <>
            <X className="h-4 w-4 text-red-500" />
            <span className="text-red-400 text-sm">No</span>
          </>
        )}
      </div>
    </div>
  );
}

function OcrFlagRow({ label, value }: { label: string; value?: boolean }) {
  let Icon = Info;
  let text = 'Unknown';
  let color = 'text-muted-foreground';

  if (value === true) {
    Icon = Check;
    text = 'Yes';
    color = 'text-emerald-400';
  } else if (value === false) {
    Icon = X;
    text = 'No';
    color = 'text-red-400';
  }

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="flex items-center gap-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className={`${color} text-sm`}>{text}</span>
      </div>
    </div>
  );
}

function DealDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-5 w-64 mt-2" />
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="bg-card border">
            <CardContent className="p-4">
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Card className="bg-card border lg:col-span-2">
          <CardContent className="p-0">
            <Skeleton className="aspect-video w-full" />
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="p-6">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
