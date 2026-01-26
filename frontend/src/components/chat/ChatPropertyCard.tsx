'use client';

import { MapPin, DollarSign, Bed, Bath, Ruler, Calendar, Home } from 'lucide-react';
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

export function ChatPropertyCard({ property, className }: ChatPropertyCardProps) {
  const fullAddress = [
    property.address,
    property.city,
    property.state,
    property.zip,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-700 bg-zinc-800/50 overflow-hidden',
        'hover:border-zinc-600 transition-colors',
        className
      )}
    >
      {/* Image */}
      {property.imageUrl && (
        <div className="aspect-video w-full bg-zinc-900">
          <img
            src={property.imageUrl}
            alt={property.address}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Address */}
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-accent-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-zinc-200 font-medium">{fullAddress}</p>
        </div>

        {/* Price Row */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-green-400" />
            <span className="text-lg font-semibold text-white">
              {formatPrice(property.price)}
            </span>
          </div>
          {property.arv && (
            <div className="text-xs text-zinc-400">
              ARV: {formatPrice(property.arv)}
            </div>
          )}
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {property.bedrooms !== undefined && (
            <div className="flex items-center gap-1.5 text-zinc-300">
              <Bed className="h-3.5 w-3.5 text-zinc-500" />
              <span>{property.bedrooms} beds</span>
            </div>
          )}
          {property.bathrooms !== undefined && (
            <div className="flex items-center gap-1.5 text-zinc-300">
              <Bath className="h-3.5 w-3.5 text-zinc-500" />
              <span>{property.bathrooms} baths</span>
            </div>
          )}
          {property.sqft !== undefined && (
            <div className="flex items-center gap-1.5 text-zinc-300">
              <Ruler className="h-3.5 w-3.5 text-zinc-500" />
              <span>{formatNumber(property.sqft)} sqft</span>
            </div>
          )}
          {property.yearBuilt !== undefined && (
            <div className="flex items-center gap-1.5 text-zinc-300">
              <Calendar className="h-3.5 w-3.5 text-zinc-500" />
              <span>Built {property.yearBuilt}</span>
            </div>
          )}
        </div>

        {/* Property Type & Status */}
        {(property.propertyType || property.status) && (
          <div className="flex items-center gap-2 pt-1">
            {property.propertyType && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-700 text-xs text-zinc-300">
                <Home className="h-3 w-3" />
                {property.propertyType}
              </span>
            )}
            {property.status && (
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  property.status.toLowerCase() === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : property.status.toLowerCase() === 'pending'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-zinc-700 text-zinc-300'
                )}
              >
                {property.status}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
