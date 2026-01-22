'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Property } from '@/types';
import { Bed, Bath, Maximize } from 'lucide-react';

interface DealGridCardProps {
  deal: Property;
  onClick?: () => void;
  selected?: boolean;
}

const formatPrice = (price?: number) => {
  if (!price) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
};

const getAddress = (deal: Property) => {
  if (deal.address?.houseNumber && deal.address?.street) {
    return `${deal.address.houseNumber} ${deal.address.street}`;
  }
  return 'Address unavailable';
};

export function DealGridCard({ deal, onClick, selected }: DealGridCardProps) {
  const photo =
    deal.photoLinks?.[0] ||
    deal.photos?.[0] ||
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=300&fit=crop';

  return (
    <div
      onClick={onClick}
      className={cn(
        'group cursor-pointer rounded-lg border bg-card overflow-hidden transition-all hover:shadow-md hover:border-primary/50',
        selected && 'ring-2 ring-primary border-primary'
      )}
    >
      {/* Photo */}
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
        <img
          src={photo}
          alt={`Property at ${deal.city}, ${deal.state}`}
          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {/* Price overlay - only show if price exists */}
        {deal.askingPrice && deal.askingPrice > 0 && (
          <div className="absolute bottom-2 left-2 bg-black/75 text-white px-2 py-1 rounded text-sm font-semibold">
            {formatPrice(deal.askingPrice)}
          </div>
        )}
        {/* Status badge */}
        {deal.approvalStatus && deal.approvalStatus !== 'draft' && (
          <Badge
            className="absolute top-2 right-2 text-xs"
            variant="secondary"
          >
            {deal.approvalStatus === 'live'
              ? 'Live'
              : deal.approvalStatus === 'pending_broker_approval'
              ? 'Pending'
              : deal.approvalStatus}
          </Badge>
        )}
        {/* Unread indicator */}
        {deal._hasUnreadMessages && (
          <span className="absolute top-2 left-2 relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
          </span>
        )}
      </div>

      {/* Details */}
      <div className="p-3 space-y-1">
        <p className="font-medium text-sm truncate text-foreground">
          {getAddress(deal)}
        </p>
        <p className="text-xs text-muted-foreground">
          {deal.city}, {deal.state}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
          {deal.bedroomCount != null && (
            <span className="flex items-center gap-1">
              <Bed className="h-3 w-3" /> {deal.bedroomCount}
            </span>
          )}
          {deal.bathroomCount != null && (
            <span className="flex items-center gap-1">
              <Bath className="h-3 w-3" /> {deal.bathroomCount}
            </span>
          )}
          {deal.livingSpaceSqFt != null && (
            <span className="flex items-center gap-1">
              <Maximize className="h-3 w-3" /> {deal.livingSpaceSqFt.toLocaleString()}
            </span>
          )}
        </div>
        {/* Offers count */}
        {deal._offerCount != null && deal._offerCount > 0 && (
          <div className="pt-1">
            <Badge
              variant="secondary"
              className="bg-blue-500/20 text-blue-400 border-blue-500/50 text-xs"
            >
              {deal._offerCount} offer{deal._offerCount > 1 ? 's' : ''}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
