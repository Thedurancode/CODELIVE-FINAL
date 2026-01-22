'use client';

import { useRouter } from 'next/navigation';
import { Bed, Bath, Square, DollarSign, MapPin, Home, TrendingUp, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PropertyCardData } from '@/lib/chat-parser';

interface ChatPropertyCardProps {
  property: PropertyCardData;
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

export function ChatPropertyCard({ property, className }: ChatPropertyCardProps) {
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
    <div className={cn('w-full max-w-sm bg-card border rounded-lg overflow-hidden shadow-sm my-2', className)}>
      {/* Property Image */}
      <div className="relative h-32 bg-muted">
        {mainImage ? (
          <img
            src={mainImage}
            alt={property.address || 'Property'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Home className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}

        {/* Status Badge */}
        {property.status && (
          <Badge
            className={cn(
              'absolute top-2 right-2 capitalize text-xs',
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
            className="absolute top-2 left-2 bg-background/70 text-foreground border-0 text-xs"
          >
            {property.propertyType}
          </Badge>
        )}
      </div>

      {/* Property Details */}
      <div className="p-3 space-y-2">
        {/* Address */}
        <div className="flex items-start gap-2">
          <MapPin className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs font-medium leading-tight line-clamp-2">{fullAddress || 'Address not available'}</p>
        </div>

        {/* Price Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5 text-green-500" />
            <span className="text-base font-bold text-green-600">
              {formatPrice(property.price)}
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
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {property.bedroomCount !== undefined && (
            <div className="flex items-center gap-1">
              <Bed className="h-3.5 w-3.5" />
              <span>{property.bedroomCount} bed</span>
            </div>
          )}
          {property.bathroomCount !== undefined && (
            <div className="flex items-center gap-1">
              <Bath className="h-3.5 w-3.5" />
              <span>{property.bathroomCount} bath</span>
            </div>
          )}
          {property.livingSpaceSqFt && (
            <div className="flex items-center gap-1">
              <Square className="h-3.5 w-3.5" />
              <span>{formatNumber(property.livingSpaceSqFt)} sqft</span>
            </div>
          )}
        </div>

        {/* View Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-7 mt-1"
          onClick={handleViewProperty}
        >
          <ExternalLink className="h-3 w-3 mr-1.5" />
          View Details
        </Button>
      </div>
    </div>
  );
}

/**
 * Container for multiple property cards in chat
 */
export function ChatPropertyCardList({ properties }: { properties: PropertyCardData[] }) {
  if (properties.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 my-2">
      {properties.map((property, index) => (
        <ChatPropertyCard key={property.id || index} property={property} />
      ))}
    </div>
  );
}

export default ChatPropertyCard;
