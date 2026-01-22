'use client';

import { useRouter } from 'next/navigation';
import { Bed, Bath, Square, Calendar, DollarSign, MapPin, Home, TrendingUp, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface PropertyPreviewData {
  id: number;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  propertyType?: string;
  askingPrice?: number;
  arv?: number;
  bedroomCount?: number;
  bathroomCount?: number;
  livingSpaceSqFt?: number;
  yearBuilt?: number;
  status?: string;
  photoLinks?: string[];
}

interface PropertyPreviewCardProps {
  property: PropertyPreviewData;
  className?: string;
}

function formatPrice(price?: number): string {
  if (!price) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatNumber(num?: number): string {
  if (!num) return 'N/A';
  return new Intl.NumberFormat('en-US').format(num);
}

function getStatusColor(status?: string): string {
  switch (status) {
    case 'new':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'enriched':
      return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    case 'scored':
      return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'submitted':
      return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
    case 'accepted':
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'rejected':
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  }
}

export function PropertyPreviewCard({ property, className }: PropertyPreviewCardProps) {
  const router = useRouter();
  const mainImage = property.photoLinks?.[0];
  const fullAddress = [
    property.address,
    property.city,
    property.state,
    property.zip,
  ].filter(Boolean).join(', ');

  const handleViewProperty = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/deals/${property.id}`);
  };

  return (
    <div className={cn('w-80', className)}>
      {/* Property Image */}
      <div className="relative h-40 rounded-t-lg overflow-hidden bg-muted">
        {mainImage ? (
          <img
            src={mainImage}
            alt={property.address || 'Property'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Home className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}

        {/* Status Badge */}
        {property.status && (
          <Badge
            className={cn(
              'absolute top-2 right-2 capitalize',
              getStatusColor(property.status)
            )}
          >
            {property.status}
          </Badge>
        )}

        {/* Property Type */}
        {property.propertyType && (
          <Badge
            variant="secondary"
            className="absolute top-2 left-2 bg-background/60 text-foreground border-0"
          >
            {property.propertyType}
          </Badge>
        )}
      </div>

      {/* Property Details */}
      <div className="p-3 space-y-3">
        {/* Address */}
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-sm font-medium leading-tight">{fullAddress || 'Address not available'}</p>
        </div>

        {/* Price Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-green-500" />
            <span className="text-lg font-bold text-green-600">
              {formatPrice(property.askingPrice)}
            </span>
          </div>
          {property.arv && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>ARV: {formatPrice(property.arv)}</span>
            </div>
          )}
        </div>

        {/* Property Stats */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {property.bedroomCount !== undefined && (
            <div className="flex items-center gap-1">
              <Bed className="h-4 w-4" />
              <span>{property.bedroomCount} bed</span>
            </div>
          )}
          {property.bathroomCount !== undefined && (
            <div className="flex items-center gap-1">
              <Bath className="h-4 w-4" />
              <span>{property.bathroomCount} bath</span>
            </div>
          )}
          {property.livingSpaceSqFt && (
            <div className="flex items-center gap-1">
              <Square className="h-4 w-4" />
              <span>{formatNumber(property.livingSpaceSqFt)} sqft</span>
            </div>
          )}
        </div>

        {/* Year Built */}
        {property.yearBuilt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Built in {property.yearBuilt}</span>
          </div>
        )}

        {/* View Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={handleViewProperty}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          View Property Details
        </Button>
      </div>
    </div>
  );
}

export function PropertyPreviewSkeleton() {
  return (
    <div className="w-80">
      <Skeleton className="h-40 rounded-t-lg" />
      <div className="p-3 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-6 w-32" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}

export default PropertyPreviewCard;
