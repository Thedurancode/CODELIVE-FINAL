'use client';

import { cn } from '@/lib/utils';
import type { MarketDataCardData } from '@/lib/chat-parser';
import {
  MapPin,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Home,
  Calendar,
} from 'lucide-react';

interface ChatMarketDataProps {
  data: MarketDataCardData;
  className?: string;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatChange(change?: number): { text: string; className: string; icon: typeof TrendingUp } {
  if (change === undefined) {
    return { text: 'N/A', className: 'text-zinc-500', icon: TrendingUp };
  }
  if (change > 0) {
    return {
      text: `+${change.toFixed(1)}%`,
      className: 'text-green-400',
      icon: TrendingUp,
    };
  }
  if (change < 0) {
    return {
      text: `${change.toFixed(1)}%`,
      className: 'text-red-400',
      icon: TrendingDown,
    };
  }
  return { text: '0%', className: 'text-zinc-400', icon: TrendingUp };
}

export function ChatMarketData({ data, className }: ChatMarketDataProps) {
  const { location, medianPrice, priceChange, daysOnMarket, inventory, comparables } = data;
  const changeInfo = formatChange(priceChange);
  const ChangeIcon = changeInfo.icon;

  return (
    <div className={cn('w-full max-w-md bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden my-3', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-accent-400" />
          <h3 className="text-sm font-semibold text-zinc-200">Market Data</h3>
        </div>
        <p className="text-xs text-zinc-500 mt-1">{location}</p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 divide-x divide-zinc-800">
        {/* Median Price */}
        <div className="px-4 py-4 text-center">
          <div className="flex items-center justify-center gap-1 text-zinc-500 mb-1">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-xs">Median Price</span>
          </div>
          <p className="text-lg font-bold text-zinc-200">{formatPrice(medianPrice)}</p>
          <div className={cn('flex items-center justify-center gap-1 text-xs mt-1', changeInfo.className)}>
            <ChangeIcon className="h-3 w-3" />
            <span>{changeInfo.text} YoY</span>
          </div>
        </div>

        {/* Days on Market */}
        <div className="px-4 py-4 text-center">
          <div className="flex items-center justify-center gap-1 text-zinc-500 mb-1">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-xs">Avg. Days on Market</span>
          </div>
          <p className="text-lg font-bold text-zinc-200">
            {daysOnMarket !== undefined ? daysOnMarket : 'N/A'}
          </p>
          <p className="text-xs text-zinc-500 mt-1">days</p>
        </div>
      </div>

      {/* Inventory */}
      {inventory !== undefined && (
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Home className="h-4 w-4 text-zinc-500" />
            <span className="text-zinc-400">Active Listings:</span>
          </div>
          <span className="text-zinc-200 font-medium">{inventory.toLocaleString()}</span>
        </div>
      )}

      {/* Comparables */}
      {comparables && comparables.length > 0 && (
        <div className="border-t border-zinc-800">
          <div className="px-4 py-2 bg-zinc-900/50">
            <p className="text-xs text-zinc-500">Recent Comparables</p>
          </div>
          <div className="divide-y divide-zinc-800">
            {comparables.slice(0, 3).map((comp, index) => (
              <div key={index} className="px-4 py-2 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300 truncate">{comp.address}</p>
                  {comp.soldDate && (
                    <div className="flex items-center gap-1 text-xs text-zinc-500 mt-0.5">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(comp.soldDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium text-green-400 ml-2">
                  {formatPrice(comp.price)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatMarketData;
