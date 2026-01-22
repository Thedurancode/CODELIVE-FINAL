import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface MarketDataLookupRequest {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  forceRefresh?: boolean;
  maxAgeDays?: number;
  includeImages?: boolean;
  includePriceHistory?: boolean;
  includeTaxHistory?: boolean;
  includeComparables?: boolean;
  includeSkipTrace?: boolean;
}

// Core property data from Zillow
export interface ZillowPropertyData {
  zpid?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  zestimate?: number;
  zestimateRangeLow?: number;
  zestimateRangeHigh?: number;
  rentZestimate?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  lotSize?: number;
  yearBuilt?: number;
  propertyType?: string;
  pricePerSqft?: number;
  taxAssessedValue?: number;
  lastSoldPrice?: number;
  lastSoldDate?: string;
}

// Full response from backend
export interface FullPropertyLookup {
  property: ZillowPropertyData;
  images?: {
    url?: string;
    images?: string[];
  };
  priceHistory?: {
    history?: Array<{
      date: string;
      price: number | null;
      event: string;
    }>;
  };
  taxHistory?: {
    history?: Array<{
      year: number;
      taxPaid: number | null;
      assessedValue: number;
    }>;
  };
  comparables?: {
    homes?: Array<{
      zpid: string;
      address: string;
      bedrooms: number;
      bathrooms: number;
      sqft: number;
      zestimate: number;
    }>;
  };
}

export function useMarketDataLookup() {
  return useMutation({
    mutationFn: (request: MarketDataLookupRequest) =>
      api.post<FullPropertyLookup>('/api/market-data/lookup', request),
  });
}
