'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  DollarSign,
  Calendar,
  Home,
  FileText,
  BarChart3,
} from 'lucide-react';
import { Property } from '@/types';
import { format } from 'date-fns';

interface ValuationSectionProps {
  property: Property;
}

function formatCurrency(amount?: number): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

export function ValuationSection({ property }: ValuationSectionProps) {
  const hasValuationData =
    property.zestimate ||
    property.lastSoldPrice ||
    property.taxAssessedValue ||
    property.askingPrice ||
    property.arv;

  if (!hasValuationData) {
    return null;
  }

  // Calculate spread if we have asking price and ARV
  const spread = property.arv && property.askingPrice
    ? ((property.arv - property.askingPrice) / property.arv) * 100
    : null;

  // Calculate discount from Zestimate
  const zestimateDiscount = property.zestimate && property.askingPrice
    ? ((property.zestimate - property.askingPrice) / property.zestimate) * 100
    : null;

  return (
    <Card className="bg-card border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <TrendingUp className="h-5 w-5 text-emerald-500" />
          Valuation & History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary Valuations Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Asking Price */}
          {property.askingPrice && (
            <div className="p-3 rounded-lg bg-secondary/50 border border/50">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <DollarSign className="h-3 w-3" />
                Asking Price
              </div>
              <div className="text-lg font-bold text-foreground">
                {formatCurrency(property.askingPrice)}
              </div>
            </div>
          )}

          {/* ARV */}
          {property.arv && (
            <div className="p-3 rounded-lg bg-secondary/50 border border/50">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <TrendingUp className="h-3 w-3" />
                ARV
              </div>
              <div className="text-lg font-bold text-emerald-400">
                {formatCurrency(property.arv)}
              </div>
              {spread && spread > 0 && (
                <div className="text-xs text-emerald-400 mt-1">
                  {spread.toFixed(1)}% spread
                </div>
              )}
            </div>
          )}

          {/* Zestimate */}
          {property.zestimate && (
            <div className="p-3 rounded-lg bg-secondary/50 border border/50">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Home className="h-3 w-3" />
                Zestimate
              </div>
              <div className="text-lg font-bold text-blue-400">
                {formatCurrency(property.zestimate)}
              </div>
              {property.zestimateRangeLow && property.zestimateRangeHigh && (
                <div className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(property.zestimateRangeLow)} - {formatCurrency(property.zestimateRangeHigh)}
                </div>
              )}
              {zestimateDiscount && zestimateDiscount > 0 && (
                <Badge className="mt-1 bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                  {zestimateDiscount.toFixed(1)}% below Zestimate
                </Badge>
              )}
            </div>
          )}

          {/* Rent Zestimate */}
          {property.rentZestimate && (
            <div className="p-3 rounded-lg bg-secondary/50 border border/50">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Home className="h-3 w-3" />
                Rent Estimate
              </div>
              <div className="text-lg font-bold text-purple-400">
                {formatCurrency(property.rentZestimate)}/mo
              </div>
              {property.askingPrice && property.rentZestimate && (
                <div className="text-xs text-muted-foreground mt-1">
                  {((property.rentZestimate * 12 / property.askingPrice) * 100).toFixed(2)}% gross yield
                </div>
              )}
            </div>
          )}

          {/* Tax Assessed Value */}
          {property.taxAssessedValue && (
            <div className="p-3 rounded-lg bg-secondary/50 border border/50">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <FileText className="h-3 w-3" />
                Tax Assessed
              </div>
              <div className="text-lg font-bold text-amber-400">
                {formatCurrency(property.taxAssessedValue)}
              </div>
            </div>
          )}

          {/* Price Per SqFt */}
          {property.pricePerSqft && (
            <div className="p-3 rounded-lg bg-secondary/50 border border/50">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <BarChart3 className="h-3 w-3" />
                Price/SqFt
              </div>
              <div className="text-lg font-bold text-cyan-400">
                ${property.pricePerSqft.toFixed(0)}
              </div>
            </div>
          )}
        </div>

        {/* Last Sale Info */}
        {(property.lastSoldPrice || property.lastSoldDate) && (
          <div className="p-3 rounded-lg bg-secondary/30 border border/30">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Last Sold:</span>
              {property.lastSoldPrice && (
                <span className="text-foreground font-medium">
                  {formatCurrency(property.lastSoldPrice)}
                </span>
              )}
              {property.lastSoldDate && (
                <span className="text-muted-foreground">
                  on {formatDate(property.lastSoldDate)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Market Context */}
        {(property.neighborhoodMedianPrice || property.cityMedianPrice) && (
          <div className="p-3 rounded-lg bg-secondary/30 border border/30">
            <div className="text-xs text-muted-foreground mb-2">Market Context</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {property.neighborhoodMedianPrice && (
                <div>
                  <span className="text-muted-foreground">Neighborhood Median:</span>
                  <span className="text-foreground ml-2">{formatCurrency(property.neighborhoodMedianPrice)}</span>
                </div>
              )}
              {property.cityMedianPrice && (
                <div>
                  <span className="text-muted-foreground">City Median:</span>
                  <span className="text-foreground ml-2">{formatCurrency(property.cityMedianPrice)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Comparables Summary */}
        {property.comparablesCount && property.comparablesCount > 0 && (
          <div className="p-3 rounded-lg bg-secondary/30 border border/30">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {property.comparablesCount} Comparable Properties
              </span>
              {property.comparablesAvgPrice && (
                <span className="text-foreground font-medium">
                  Avg: {formatCurrency(property.comparablesAvgPrice)}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
