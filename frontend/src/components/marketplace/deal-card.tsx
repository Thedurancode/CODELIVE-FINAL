'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Bed,
  Bath,
  Square,
  Calendar,
  TrendingUp,
  Eye,
  MessageSquare,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Clock,
  DollarSign,
  Home,
  Percent,
  ImageOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { MarketplaceDeal, PropertyType } from '@/types/marketplace';

// =============================================================================
// CONSTANTS
// =============================================================================

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  single_family: 'Single Family',
  townhouse: 'Townhouse',
  condo: 'Condo',
  multi_family: 'Multi-Family',
  duplex: 'Duplex',
  triplex: 'Triplex',
  fourplex: 'Fourplex',
  land: 'Land',
  commercial: 'Commercial',
};

/** Blur placeholder data URL for images */
const BLUR_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PC9zdmc+';

// =============================================================================
// IMAGE COMPONENT WITH LAZY LOADING
// =============================================================================

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
}

function LazyImage({ src, alt, className, onLoad, onError }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Reset state when src changes
    setIsLoaded(false);
    setHasError(false);
  }, [src]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  if (hasError) {
    return (
      <div className={cn('flex items-center justify-center bg-muted', className)}>
        <ImageOff className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Image failed to load</span>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* Blur placeholder */}
      {!isLoaded && (
        <div
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-muted-foreground/20"
          aria-hidden="true"
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  );
}

interface DealCardProps {
  deal: MarketplaceDeal;
  onSave?: () => void;
  onShare?: () => void;
  onRequestInfo?: () => void;
  className?: string;
  showActions?: boolean;
}

export function DealCard({
  deal,
  onSave,
  onShare,
  onRequestInfo,
  className,
  showActions = true,
}: DealCardProps) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  const { deal: details, matchScore, matchReasons, isNew, isFeatured, viewCount, offerCount } = deal;

  // Mock photos if none exist
  const photos = details.photos?.length
    ? details.photos
    : [
        `https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&h=600&fit=crop`,
        `https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=600&fit=crop`,
        `https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=600&fit=crop`,
      ];

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const getMatchScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      {/* Photo section */}
      <div className="relative h-[55%] w-full overflow-hidden" role="region" aria-label="Property photos">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPhotoIndex}
            className="h-full w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <LazyImage
              src={photos[currentPhotoIndex]}
              alt={`Property photo ${currentPhotoIndex + 1} of ${photos.length}`}
              className="h-full w-full"
            />
          </motion.div>
        </AnimatePresence>

        {/* Preload next image for smoother transitions */}
        {photos.length > 1 && (
          <link
            rel="preload"
            as="image"
            href={photos[(currentPhotoIndex + 1) % photos.length]}
          />
        )}

        {/* Photo navigation */}
        {photos.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                prevPhoto();
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/50 p-2 text-foreground backdrop-blur-sm transition-colors hover:bg-background/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                nextPhoto();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/50 p-2 text-foreground backdrop-blur-sm transition-colors hover:bg-background/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>

            {/* Photo indicators */}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5" role="tablist" aria-label="Photo indicators">
              {photos.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPhotoIndex(i);
                  }}
                  className={cn(
                    'h-2 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
                    i === currentPhotoIndex ? 'w-5 bg-white' : 'w-2 bg-white/60 hover:bg-white/80'
                  )}
                  role="tab"
                  aria-selected={i === currentPhotoIndex}
                  aria-label={`Go to photo ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}

        {/* Top badges */}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {isNew && (
            <Badge className="bg-accent-500 text-foreground">
              <Sparkles className="mr-1 h-3 w-3" />
              New
            </Badge>
          )}
          {isFeatured && (
            <Badge className="bg-amber-500 text-foreground">
              <TrendingUp className="mr-1 h-3 w-3" />
              Hot Deal
            </Badge>
          )}
          {details.daysOnMarket !== undefined && details.daysOnMarket <= 3 && (
            <Badge variant="secondary">
              <Clock className="mr-1 h-3 w-3" />
              {details.daysOnMarket === 0 ? 'Today' : `${details.daysOnMarket}d ago`}
            </Badge>
          )}
        </div>

        {/* Match score */}
        <div className="absolute right-3 top-3">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-foreground shadow-lg',
              getMatchScoreBg(matchScore)
            )}
          >
            <Percent className="h-4 w-4" />
            {matchScore}% Match
          </div>
        </div>

        {/* Stats overlay */}
        <div className="absolute bottom-3 right-3 flex gap-2">
          <div className="flex items-center gap-1 rounded-full bg-background/50 px-2 py-1 text-xs text-foreground backdrop-blur-sm">
            <Eye className="h-3 w-3" />
            {viewCount}
          </div>
          <div className="flex items-center gap-1 rounded-full bg-background/50 px-2 py-1 text-xs text-foreground backdrop-blur-sm">
            <MessageSquare className="h-3 w-3" />
            {offerCount} offers
          </div>
        </div>
      </div>

      {/* Details section */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Price and location */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{formatPrice(details.price)}</h2>
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">
                {details.city}, {details.state} {details.zip}
              </span>
            </div>
          </div>
          {showActions && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSave?.();
              }}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Bookmark className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Property specs */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Home className="h-4 w-4 text-muted-foreground" />
            <span>{PROPERTY_TYPE_LABELS[details.propertyType] || details.propertyType}</span>
          </div>
          {details.bedrooms && (
            <div className="flex items-center gap-1.5">
              <Bed className="h-4 w-4 text-muted-foreground" />
              <span>{details.bedrooms} bed</span>
            </div>
          )}
          {details.bathrooms && (
            <div className="flex items-center gap-1.5">
              <Bath className="h-4 w-4 text-muted-foreground" />
              <span>{details.bathrooms} bath</span>
            </div>
          )}
          {details.sqft && (
            <div className="flex items-center gap-1.5">
              <Square className="h-4 w-4 text-muted-foreground" />
              <span>{formatNumber(details.sqft)} sqft</span>
            </div>
          )}
          {details.yearBuilt && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Built {details.yearBuilt}</span>
            </div>
          )}
        </div>

        {/* Financial metrics */}
        {(details.arv || details.equity) && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3">
            {details.arv && (
              <div>
                <div className="text-xs text-muted-foreground">ARV</div>
                <div className="font-semibold text-green-600">{formatPrice(details.arv)}</div>
              </div>
            )}
            {details.equity && (
              <div>
                <div className="text-xs text-muted-foreground">Equity</div>
                <div className="font-semibold text-green-600">{details.equity}%</div>
              </div>
            )}
            {details.arv && details.price && (
              <div>
                <div className="text-xs text-muted-foreground">Potential Profit</div>
                <div className="font-semibold text-green-600">
                  {formatPrice(details.arv - details.price)}
                </div>
              </div>
            )}
            {details.arv && details.price && (
              <div>
                <div className="text-xs text-muted-foreground">ROI</div>
                <div className="font-semibold text-green-600">
                  {Math.round(((details.arv - details.price) / details.price) * 100)}%
                </div>
              </div>
            )}
          </div>
        )}

        {/* Match reasons */}
        {matchReasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {matchReasons.map((reason, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {reason}
              </Badge>
            ))}
          </div>
        )}

        {/* Expandable description */}
        {details.description && (
          <div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? 'Show less' : 'Show more...'}
            </button>
            <AnimatePresence>
              {isExpanded && (
                <motion.p
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-2 text-sm text-muted-foreground"
                >
                  {details.description}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Wholesaler info */}
        {details.wholesalerName && (
          <div className="mt-auto border-t pt-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Listed by</div>
                <div className="text-sm font-medium">{details.wholesalerName}</div>
              </div>
              {showActions && onRequestInfo && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestInfo();
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Contact
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Compact version for lists
interface DealCardCompactProps {
  deal: MarketplaceDeal;
  onClick?: () => void;
  onMakeOffer?: () => void;
  showOfferButton?: boolean;
  selected?: boolean;
  className?: string;
}

export function DealCardCompact({
  deal,
  onClick,
  onMakeOffer,
  showOfferButton = true,
  selected = false,
  className,
}: DealCardCompactProps) {
  const { deal: details, matchScore, isNew } = deal;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const photo = details.photos?.[0] || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=300&fit=crop';

  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex cursor-pointer gap-3 rounded-lg border bg-card p-3 transition-all hover:shadow-md',
        selected && 'ring-2 ring-primary',
        className
      )}
    >
      {/* Photo */}
      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg">
        <LazyImage src={photo} alt={`Property at ${details.city}, ${details.state}`} className="h-full w-full" />
        {isNew && (
          <Badge className="absolute left-1 top-1 bg-accent-500 text-[10px] text-foreground">New</Badge>
        )}
      </div>

      {/* Details */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-semibold">{formatPrice(details.price)}</h3>
            <Badge
              variant="secondary"
              className={cn('flex-shrink-0 text-xs', matchScore >= 80 && 'bg-green-100 text-green-700')}
            >
              {matchScore}%
            </Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {details.city}, {details.state}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {details.bedrooms && <span>{details.bedrooms} bed</span>}
            {details.bathrooms && <span>{details.bathrooms} bath</span>}
            {details.sqft && <span>{details.sqft.toLocaleString()} sqft</span>}
          </div>

          {showOfferButton && onMakeOffer && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMakeOffer();
              }}
              className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100"
            >
              Make Offer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
