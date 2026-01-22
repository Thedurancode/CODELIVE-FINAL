/**
 * Market Data Service
 *
 * Fetches real-time market data from RapidAPI Zillow API
 * Provides caching, fallbacks, and normalized data for scoring
 * Persists lookups to PostgreSQL for cost savings and analytics
 *
 * Cache Strategy:
 * - L1: In-memory cache (fast, per-instance)
 * - L2: Redis cache (shared across instances, survives restarts)
 */

import PropertyLookup from '../models/PropertyLookup';
import { redisService, CACHE_TTL, CACHE_PREFIX } from './RedisService';
import { createLimitedMap } from '../utils/security';

export interface MarketDataRequest {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface PropertyMarketData {
  // Property identifiers
  zpid?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county?: string;

  // Valuations
  zestimate?: number;
  zestimateRangeLow?: number;
  zestimateRangeHigh?: number;
  rentZestimate?: number;
  rentZestimateRangeLow?: number;
  rentZestimateRangeHigh?: number;

  // Property details
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  lotSize?: number;
  yearBuilt?: number;
  propertyType?: string;

  // Market stats
  pricePerSqft?: number;
  taxAssessedValue?: number;
  lastSoldPrice?: number;
  lastSoldDate?: string;

  // Price history
  priceHistory?: PriceHistoryItem[];
  zestimateHistory?: ZestimateHistoryItem[];

  // Neighborhood/Market context
  neighborhoodMedianPrice?: number;
  cityMedianPrice?: number;
  stateMedianPrice?: number;
  daysOnMarket?: number;
  priceChange1Year?: number;

  // Comparable properties
  comparables?: ComparableProperty[];

  // Metadata
  lastUpdated: Date;
  dataSource: string;
  confidence: number;
}

export interface PriceHistoryItem {
  date: string;
  timestamp?: number;
  price: number | null;
  pricePerSqft?: number | null;
  priceChangeRate?: number;
  event: string;
  source?: string;
  buyerAgent?: AgentInfo;
  sellerAgent?: AgentInfo;
}

export interface AgentInfo {
  name: string;
  profileUrl?: string;
  photoUrl?: string;
}

export interface PriceHistoryData {
  history: PriceHistoryItem[];
  totalEvents: number;
  lastSaleDate?: string;
  lastSalePrice?: number;
  listingHistory: PriceHistoryItem[];  // Filtered to just listings
  saleHistory: PriceHistoryItem[];     // Filtered to just sales
  lastUpdated: Date;
  dataSource: string;
}

// Tax History
export interface TaxHistoryItem {
  year: number;
  timestamp: number;
  taxPaid: number | null;
  taxIncreaseRate: number;
  assessedValue: number;
  valueIncreaseRate: number;
}

export interface TaxHistoryData {
  history: TaxHistoryItem[];
  totalYears: number;
  currentTax?: number;
  currentAssessedValue?: number;
  averageTaxRate?: number;  // Tax as % of assessed value
  lastUpdated: Date;
  dataSource: string;
}

// Chart Data Point (shared between chart types)
export interface ChartPoint {
  x: string;         // Date or label
  y: number;         // Value
  timestamp?: number;
  label?: string;
}

// Base Chart Data interface
export interface ChartData {
  data: ChartPoint[];
  title?: string;
  description?: string;
  yAxisLabel?: string;
  xAxisLabel?: string;
  currentValue?: number;
  minValue?: number;
  maxValue?: number;
  percentChange?: number;
  lastUpdated: Date;
  dataSource: string;
}

// Tax Assessment Chart Data (from graph_charts?which=tax_assessment)
export interface TaxAssessmentChartPoint extends ChartPoint {}
export interface TaxAssessmentChartData extends ChartData {}

// Tax Paid Chart Data (from graph_charts?which=tax_paid)
export interface TaxPaidChartPoint extends ChartPoint {}
export interface TaxPaidChartData extends ChartData {
  // Additional property info from response
  city?: string;
  state?: string;
  streetAddress?: string;
  zipcode?: string;
}

export interface ZestimateHistoryItem {
  date: string;
  value: number;
}

export interface ComparableProperty {
  address: string;
  price: number;
  sqft: number;
  bedrooms: number;
  bathrooms: number;
  distance?: number;
  soldDate?: string;
}

// Skip Trace / Owner Information
export interface SkipTraceData {
  // Owner info
  owners: OwnerInfo[];

  // Property ownership
  ownerOccupied?: boolean;
  ownershipType?: string; // 'individual', 'trust', 'llc', 'corporation'

  // Mailing address (if different from property)
  mailingAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };

  // Metadata
  lastUpdated: Date;
  dataSource: string;
  confidence: number;
}

export interface OwnerInfo {
  name: string;
  firstName?: string;
  lastName?: string;

  // Contact info
  phones?: PhoneInfo[];
  emails?: string[];

  // Demographics
  age?: number;
  ageRange?: string;

  // Associated addresses
  associatedAddresses?: string[];
}

export interface PhoneInfo {
  number: string;
  type?: 'mobile' | 'landline' | 'voip' | 'unknown';
  carrier?: string;
  isPrimary?: boolean;
}

// Property Images
export interface PropertyImages {
  // Main images
  primaryImage?: string;
  streetViewUrl?: string;
  propertyUrl?: string;

  // All photos with multiple resolutions
  photos: PropertyPhoto[];

  // Counts
  totalPhotos: number;

  // Metadata
  lastUpdated: Date;
  dataSource: string;
}

export interface PropertyPhoto {
  // Preferred URLs (highest quality available)
  jpegUrl: string;
  webpUrl?: string;

  // All available resolutions
  resolutions: ImageResolution[];
}

export interface ImageResolution {
  url: string;
  width: number;
  format: 'jpeg' | 'webp';
}

// Comparable Homes Data
export interface ComparableHome {
  zpid: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  price?: number;
  zestimate?: number;
  rentZestimate?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  lotSize?: number;
  yearBuilt?: number;
  propertyType?: string;
  homeStatus?: string;
  daysOnZillow?: number;
  imageUrl?: string;
  detailUrl?: string;
  distance?: number;
  latitude?: number;
  longitude?: number;
}

export interface ComparableHomesData {
  comparables: ComparableHome[];
  totalCount: number;
  subjectProperty?: {
    zpid: string;
    address: string;
    zestimate?: number;
  };
  lastUpdated: Date;
  dataSource: string;
}

// Rental Market Trends (market-level data for a city/area)
export interface RentalMarketTrend {
  date: string;
  medianRent: number;
  medianRentPerSqft?: number;
  rentChange?: number;
  rentChangePercent?: number;
}

export interface RentalMarketData {
  // Location
  location: string;
  city?: string;
  state?: string;
  regionType?: string;

  // Current stats
  medianRent?: number;
  medianRentPerSqft?: number;
  averageRent?: number;
  totalListings?: number;

  // Trends
  trends: RentalMarketTrend[];
  yearOverYearChange?: number;
  monthOverMonthChange?: number;

  // Breakdown by bedroom
  byBedroom?: {
    studio?: number;
    oneBed?: number;
    twoBed?: number;
    threeBed?: number;
    fourPlusBed?: number;
  };

  // Breakdown by property type
  byPropertyType?: {
    apartment?: number;
    house?: number;
    condo?: number;
    townhouse?: number;
  };

  // Metadata
  lastUpdated: Date;
  dataSource: string;
}

// Combined property lookup with all data sources
export interface FullPropertyLookup {
  property: PropertyMarketData;
  skipTrace?: SkipTraceData;
  images?: PropertyImages;
  priceHistory?: PriceHistoryData;
  taxHistory?: TaxHistoryData;
  taxAssessmentChart?: TaxAssessmentChartData;
  taxPaidChart?: TaxPaidChartData;
  comparables?: ComparableHomesData;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class MarketDataService {
  private static instance: MarketDataService;

  private readonly apiKey: string;
  private readonly apiHost = 'private-zillow.p.rapidapi.com';
  private readonly baseUrl = 'https://private-zillow.p.rapidapi.com';

  // In-memory cache with size limit and TTL (SECURITY: prevents memory leak)
  private cache = createLimitedMap<string, CacheEntry<any>>({
    maxSize: 5000, // Limit to 5000 entries to prevent memory exhaustion
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours TTL
    onEvict: (key) => console.log(`MarketDataService: Cache evicted ${key}`),
  });
  private readonly defaultTTL = 24 * 60 * 60 * 1000; // 24 hours in ms

  // Rate limiting
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly minRequestInterval = 100; // ms between requests

  // Fallback static data (used when API fails)
  private readonly fallbackMedianPrices: Record<string, number> = {
    'AL': 220000, 'AK': 350000, 'AZ': 420000, 'AR': 195000, 'CA': 750000,
    'CO': 550000, 'CT': 380000, 'DE': 330000, 'FL': 400000, 'GA': 320000,
    'HI': 850000, 'ID': 450000, 'IL': 270000, 'IN': 230000, 'IA': 200000,
    'KS': 210000, 'KY': 200000, 'LA': 195000, 'ME': 320000, 'MD': 400000,
    'MA': 550000, 'MI': 230000, 'MN': 330000, 'MS': 175000, 'MO': 230000,
    'MT': 420000, 'NE': 250000, 'NV': 430000, 'NH': 420000, 'NJ': 480000,
    'NM': 290000, 'NY': 400000, 'NC': 320000, 'ND': 270000, 'OH': 210000,
    'OK': 195000, 'OR': 480000, 'PA': 270000, 'RI': 400000, 'SC': 290000,
    'SD': 280000, 'TN': 310000, 'TX': 320000, 'UT': 520000, 'VT': 350000,
    'VA': 380000, 'WA': 580000, 'WV': 150000, 'WI': 270000, 'WY': 320000,
  };

  private constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY || process.env.RAPIDAPI_ZILLOW_KEY || '';

    if (!this.apiKey) {
      console.warn('MarketDataService: No RapidAPI key configured. Using fallback data.');
    }
  }

  static getInstance(): MarketDataService {
    if (!MarketDataService.instance) {
      MarketDataService.instance = new MarketDataService();
    }
    return MarketDataService.instance;
  }

  /**
   * Get comprehensive market data for a property
   */
  async getMarketData(request: MarketDataRequest): Promise<PropertyMarketData> {
    const cacheKey = this.buildCacheKey(request);

    // Check cache first
    const cached = this.getFromCache<PropertyMarketData>(cacheKey);
    if (cached) {
      console.log(`MarketDataService: Cache hit for ${request.address}`);
      return cached;
    }

    // If no API key, return fallback data
    if (!this.apiKey) {
      return this.buildFallbackData(request);
    }

    try {
      // Fetch from API
      const propertyData = await this.fetchPropertyByAddress(request.address);

      // Normalize and enrich the data
      const normalizedData = this.normalizePropertyData(propertyData, request);

      // Cache the result
      this.setCache(cacheKey, normalizedData);

      return normalizedData;
    } catch (error) {
      console.error('MarketDataService: API error, using fallback:', error);
      return this.buildFallbackData(request);
    }
  }

  /**
   * Get Zestimate history for a property
   */
  async getZestimateHistory(zpidOrAddress: string): Promise<ZestimateHistoryItem[]> {
    const cacheKey = `zhistory:${zpidOrAddress}`;

    const cached = this.getFromCache<ZestimateHistoryItem[]>(cacheKey);
    if (cached) return cached;

    if (!this.apiKey) {
      console.warn('[MarketDataService] API key not configured, returning empty result');
      return [];
    }

    try {
      await this.rateLimit();

      const params = new URLSearchParams({
        recent_first: 'True',
        which: 'zestimate_history',
      });

      // Determine if it's a ZPID or address
      if (/^\d+$/.test(zpidOrAddress)) {
        params.append('byzpid', zpidOrAddress);
      } else {
        params.append('byaddress', zpidOrAddress);
      }

      const response = await this.fetchWithTimeout(`${this.baseUrl}/graph_charts?${params}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const history = this.parseZestimateHistory(data);

      this.setCache(cacheKey, history);
      return history;
    } catch (error) {
      console.error('MarketDataService: Failed to fetch Zestimate history:', error);
      return [];
    }
  }

  /**
   * Get tax assessment chart data for a property
   */
  async getTaxAssessmentChart(request: MarketDataRequest, zpid?: string): Promise<TaxAssessmentChartData | null> {
    const cacheKey = this.buildCacheKey(request, 'taxchart');

    const cached = this.getFromCache<TaxAssessmentChartData>(cacheKey);
    if (cached) {
      console.log(`MarketDataService: Tax assessment chart cache hit for ${request.address}`);
      return cached;
    }

    if (!this.apiKey) {
      console.warn('MarketDataService: No API key for tax assessment chart');
      return null;
    }

    try {
      await this.rateLimit();

      const params = new URLSearchParams({
        recent_first: 'True',
        which: 'tax_assessment',
      });

      // Prefer ZPID lookup (more reliable)
      if (zpid) {
        params.append('byzpid', zpid);
      } else {
        params.append('byaddress', request.address);
      }

      const url = `${this.baseUrl}/graph_charts?${params}`;
      console.log(`MarketDataService: Fetching tax assessment chart for ${request.address}`);

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tax assessment chart API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const chartData = this.normalizeTaxAssessmentChart(data);

      this.setCache(cacheKey, chartData);
      return chartData;
    } catch (error) {
      console.error('MarketDataService: Failed to fetch tax assessment chart:', error);
      return null;
    }
  }

  private normalizeTaxAssessmentChart(raw: any): TaxAssessmentChartData {
    // Parse chart data points
    const rawData = raw.data || raw.chartData || [];

    const data: TaxAssessmentChartPoint[] = rawData.map((item: any) => ({
      x: item.x || item.date || item.label || '',
      y: item.y || item.value || 0,
      timestamp: item.time || item.timestamp,
      label: item.label,
    }));

    // Calculate stats from data
    const values = data.map(d => d.y).filter(v => v > 0);
    const currentValue = values.length > 0 ? values[0] : undefined;
    const minValue = values.length > 0 ? Math.min(...values) : undefined;
    const maxValue = values.length > 0 ? Math.max(...values) : undefined;

    // Calculate percent change (most recent vs oldest)
    let percentChange: number | undefined;
    if (values.length >= 2) {
      const oldest = values[values.length - 1];
      const newest = values[0];
      if (oldest > 0) {
        percentChange = Math.round(((newest - oldest) / oldest) * 100);
      }
    }

    return {
      data,
      title: raw.title || 'Tax Assessment History',
      description: raw.description,
      yAxisLabel: raw.yAxisLabel || 'Assessed Value ($)',
      xAxisLabel: raw.xAxisLabel || 'Year',
      currentValue,
      minValue,
      maxValue,
      percentChange,
      lastUpdated: new Date(),
      dataSource: 'rapidapi-zillow-chart',
    };
  }

  /**
   * Get tax paid chart data for a property
   */
  async getTaxPaidChart(request: MarketDataRequest, zpid?: string): Promise<TaxPaidChartData | null> {
    const cacheKey = this.buildCacheKey(request, 'taxpaidchart');

    const cached = this.getFromCache<TaxPaidChartData>(cacheKey);
    if (cached) {
      console.log(`MarketDataService: Tax paid chart cache hit for ${request.address}`);
      return cached;
    }

    if (!this.apiKey) {
      console.warn('MarketDataService: No API key for tax paid chart');
      return null;
    }

    try {
      await this.rateLimit();

      const params = new URLSearchParams({
        recent_first: 'True',
        which: 'tax_paid',
      });

      // Prefer ZPID lookup (more reliable)
      if (zpid) {
        params.append('byzpid', zpid);
      } else {
        params.append('byaddress', request.address);
      }

      const url = `${this.baseUrl}/graph_charts?${params}`;
      console.log(`MarketDataService: Fetching tax paid chart for ${request.address}`);

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tax paid chart API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const chartData = this.normalizeTaxPaidChart(data);

      this.setCache(cacheKey, chartData);
      return chartData;
    } catch (error) {
      console.error('MarketDataService: Failed to fetch tax paid chart:', error);
      return null;
    }
  }

  private normalizeTaxPaidChart(raw: any): TaxPaidChartData {
    // Parse chart data from homeValueChartData structure
    const dataPoints = raw.DataPoints || {};
    const homeValueChartData = dataPoints.homeValueChartData || [];

    // Get points from the first series (usually "This home")
    const firstSeries = homeValueChartData[0] || {};
    const rawPoints = firstSeries.points || [];

    const data: ChartPoint[] = rawPoints.map((item: any) => {
      // x is a timestamp, convert to date string
      const date = new Date(item.x);
      const dateStr = date.toISOString().split('T')[0];

      return {
        x: dateStr,
        y: item.y || 0,
        timestamp: item.x,
        label: firstSeries.name,
      };
    });

    // Calculate stats from data
    const values = data.map(d => d.y).filter(v => v > 0);
    const currentValue = values.length > 0 ? values[0] : undefined;
    const minValue = values.length > 0 ? Math.min(...values) : undefined;
    const maxValue = values.length > 0 ? Math.max(...values) : undefined;

    // Calculate percent change (most recent vs oldest)
    let percentChange: number | undefined;
    if (values.length >= 2) {
      const oldest = values[values.length - 1];
      const newest = values[0];
      if (oldest > 0) {
        percentChange = Math.round(((newest - oldest) / oldest) * 100);
      }
    }

    return {
      data,
      title: 'Tax Paid History',
      description: raw.description,
      yAxisLabel: 'Tax Paid ($)',
      xAxisLabel: 'Year',
      currentValue,
      minValue,
      maxValue,
      percentChange,
      city: dataPoints.city,
      state: dataPoints.state,
      streetAddress: dataPoints.streetAddress,
      zipcode: dataPoints.zipcode,
      lastUpdated: new Date(),
      dataSource: 'rapidapi-zillow-taxpaid',
    };
  }

  // ============================================================================
  // Comparable Homes
  // ============================================================================

  /**
   * Get comparable homes for a property (requires ZPID)
   */
  async getComparableHomes(request: MarketDataRequest, zpid?: string): Promise<ComparableHomesData | null> {
    // ZPID is required for comparable homes endpoint
    if (!zpid) {
      console.warn('MarketDataService: ZPID required for comparable homes');
      return null;
    }

    const cacheKey = `comps:${zpid}`;

    const cached = this.getFromCache<ComparableHomesData>(cacheKey);
    if (cached) {
      console.log(`MarketDataService: Comparable homes cache hit for ZPID ${zpid}`);
      return cached;
    }

    if (!this.apiKey) {
      console.warn('MarketDataService: No API key for comparable homes');
      return null;
    }

    try {
      await this.rateLimit();

      const params = new URLSearchParams({
        byzpid: zpid,
      });

      const url = `${this.baseUrl}/comparable_homes?${params}`;
      console.log(`MarketDataService: Fetching comparable homes for ZPID ${zpid}`);

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Comparable homes API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const comparablesData = this.normalizeComparableHomes(data, zpid);

      this.setCache(cacheKey, comparablesData);
      return comparablesData;
    } catch (error) {
      console.error('MarketDataService: Failed to fetch comparable homes:', error);
      return null;
    }
  }

  private normalizeComparableHomes(raw: any, subjectZpid: string): ComparableHomesData {
    // Parse comparable homes from response
    const rawComps = raw.comparables || raw.homes || raw.properties || [];

    const comparables: ComparableHome[] = rawComps.map((comp: any) => {
      const address = comp.address || {};

      return {
        zpid: comp.zpid?.toString() || '',
        address: address.streetAddress || comp.streetAddress || comp.address || '',
        city: address.city || comp.city || '',
        state: address.state || comp.state || '',
        zipcode: address.zipcode || comp.zipcode || '',
        price: comp.price || comp.listPrice || undefined,
        zestimate: comp.zestimate || comp.zestimateValue || undefined,
        rentZestimate: comp.rentZestimate || undefined,
        bedrooms: comp.bedrooms || comp.beds || undefined,
        bathrooms: comp.bathrooms || comp.baths || undefined,
        sqft: comp.livingArea || comp.sqft || comp.livingAreaSqFt || undefined,
        lotSize: comp.lotSize || comp.lotAreaValue || undefined,
        yearBuilt: comp.yearBuilt || undefined,
        propertyType: comp.homeType || comp.propertyType || undefined,
        homeStatus: comp.homeStatus || comp.status || undefined,
        daysOnZillow: comp.daysOnZillow || undefined,
        imageUrl: comp.imgSrc || comp.hiResImageLink || comp.image || undefined,
        detailUrl: comp.detailUrl || comp.url || undefined,
        distance: comp.distance || undefined,
        latitude: comp.latitude || comp.lat || address.latitude || undefined,
        longitude: comp.longitude || comp.lng || address.longitude || undefined,
      };
    }).filter((c: ComparableHome) => c.zpid); // Filter out empty entries

    // Extract subject property info if available
    const subject = raw.subjectProperty || raw.subject;
    const subjectProperty = subject ? {
      zpid: subject.zpid?.toString() || subjectZpid,
      address: subject.address?.streetAddress || subject.streetAddress || '',
      zestimate: subject.zestimate || undefined,
    } : undefined;

    return {
      comparables,
      totalCount: comparables.length,
      subjectProperty,
      lastUpdated: new Date(),
      dataSource: 'rapidapi-zillow-comps',
    };
  }

  // ============================================================================
  // Rental Market Trends (Market-Level Data)
  // ============================================================================

  /**
   * Get rental market trends for a city/area
   * @param searchQuery - Location to search (e.g., "Austin, TX", "Miami, FL")
   * @param bedroomType - Filter by bedroom count: 'All_Bedrooms', 'Studio', 'One', 'Two', 'Three', 'Four_Plus'
   * @param homeType - Filter by property type: 'All_Property_Types', 'Apartments', 'Houses', 'Condos', 'Townhomes'
   */
  async getRentalMarketTrends(
    searchQuery: string,
    bedroomType: string = 'All_Bedrooms',
    homeType: string = 'All_Property_Types'
  ): Promise<RentalMarketData | null> {
    const cacheKey = `rental:${searchQuery}:${bedroomType}:${homeType}`.toLowerCase().replace(/[^a-z0-9]/g, '');

    const cached = this.getFromCache<RentalMarketData>(cacheKey);
    if (cached) {
      console.log(`MarketDataService: Rental market cache hit for ${searchQuery}`);
      return cached;
    }

    if (!this.apiKey) {
      console.warn('MarketDataService: No API key for rental market trends');
      return null;
    }

    try {
      await this.rateLimit();

      const params = new URLSearchParams({
        search_query: searchQuery,
        bedrooom_type: bedroomType, // Note: API has typo "bedrooom"
        home_type: homeType,
      });

      const url = `${this.baseUrl}/rental_market?${params}`;
      console.log(`MarketDataService: Fetching rental market trends for ${searchQuery}`);

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Rental market API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const rentalData = this.normalizeRentalMarketData(data, searchQuery);

      // Cache for 7 days (market data doesn't change frequently)
      this.setCache(cacheKey, rentalData, 7 * 24 * 60 * 60 * 1000);
      return rentalData;
    } catch (error) {
      console.error('MarketDataService: Failed to fetch rental market trends:', error);
      return null;
    }
  }

  private normalizeRentalMarketData(raw: any, searchQuery: string): RentalMarketData {
    // Parse rental market data from response (data is in rental_market_trends)
    const marketData = raw.rental_market_trends || raw.rentalMarketData || raw.data || raw;
    const summary = marketData.summary || {};

    // Parse trends from rent history chart or histogram
    const rentHistory = marketData.rentHistory || [];
    const trends: RentalMarketTrend[] = rentHistory.map((item: any) => ({
      date: item.date || item.x || '',
      medianRent: item.medianRent || item.y || item.value || 0,
      medianRentPerSqft: item.medianRentPerSqft || undefined,
      rentChange: item.rentChange || item.change || undefined,
      rentChangePercent: item.rentChangePercent || item.changePercent || undefined,
    }));

    // Parse rent histogram for distribution data
    const histogram = marketData.rentHistogram || {};
    const priceDistribution = histogram.priceAndCount || [];

    // Parse bedroom breakdown if available
    const bedroomData = marketData.byBedroom || marketData.bedroomBreakdown || {};
    const byBedroom = Object.keys(bedroomData).length > 0 ? {
      studio: bedroomData.studio || bedroomData['0'] || undefined,
      oneBed: bedroomData.oneBed || bedroomData['1'] || bedroomData.one || undefined,
      twoBed: bedroomData.twoBed || bedroomData['2'] || bedroomData.two || undefined,
      threeBed: bedroomData.threeBed || bedroomData['3'] || bedroomData.three || undefined,
      fourPlusBed: bedroomData.fourPlusBed || bedroomData['4+'] || bedroomData.fourPlus || undefined,
    } : undefined;

    // Parse property type breakdown if available
    const propertyData = marketData.byPropertyType || marketData.propertyBreakdown || {};
    const byPropertyType = Object.keys(propertyData).length > 0 ? {
      apartment: propertyData.apartment || propertyData.apartments || undefined,
      house: propertyData.house || propertyData.houses || undefined,
      condo: propertyData.condo || propertyData.condos || undefined,
      townhouse: propertyData.townhouse || propertyData.townhomes || undefined,
    } : undefined;

    return {
      location: marketData.areaName || searchQuery,
      city: this.extractCity(marketData.areaName || searchQuery),
      state: this.extractStateFromQuery(marketData.areaName || searchQuery),
      regionType: marketData.areaType || 'city',

      medianRent: summary.medianRent || undefined,
      medianRentPerSqft: summary.medianRentPerSqft || undefined,
      averageRent: summary.averageRent || undefined,
      totalListings: summary.availableRentals || summary.totalListings || undefined,

      trends,
      yearOverYearChange: summary.yearlyChange || undefined,
      monthOverMonthChange: summary.monthlyChange || undefined,

      byBedroom,
      byPropertyType,

      lastUpdated: new Date(),
      dataSource: 'rapidapi-zillow-rental',
    };
  }

  private extractCity(query: string): string {
    const parts = query.split(',');
    return parts[0]?.trim() || '';
  }

  private extractStateFromQuery(query: string): string {
    const parts = query.split(',');
    if (parts.length >= 2) {
      const statePart = parts[1].trim();
      // Extract state code (2 letters)
      const stateMatch = statePart.match(/^([A-Z]{2})/i);
      return stateMatch ? stateMatch[1].toUpperCase() : '';
    }
    return '';
  }

  /**
   * Get remaining API request count
   */
  async getApiRequestCount(): Promise<{ used: number; remaining: number; limit: number } | null> {
    if (!this.apiKey) return null;

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api_reqcount?x_rapidapi_key=${this.apiKey}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) return null;

      const data = await response.json();
      return {
        used: data.used || 0,
        remaining: data.remaining || 0,
        limit: data.limit || 0,
      };
    } catch (error) {
      console.error('MarketDataService: Failed to get request count:', error);
      return null;
    }
  }

  /**
   * Batch fetch market data for multiple properties
   */
  async batchGetMarketData(requests: MarketDataRequest[]): Promise<Map<string, PropertyMarketData>> {
    const results = new Map<string, PropertyMarketData>();

    // Process in parallel with concurrency limit
    const concurrency = 3;
    const chunks = this.chunkArray(requests, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(async (req) => {
        const data = await this.getMarketData(req);
        results.set(req.address, data);
      });

      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Get market stats for a ZIP code
   */
  async getZipMarketStats(zip: string): Promise<{
    medianPrice: number;
    pricePerSqft: number;
    rentEstimate: number;
    daysOnMarket: number;
  }> {
    const cacheKey = `zip:${zip}`;

    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    // For ZIP-level stats, we'd typically aggregate from multiple properties
    // or use a dedicated market stats API endpoint
    // For now, we'll use state-level fallback with adjustment

    const state = this.zipToState(zip);
    const stateMedian = this.fallbackMedianPrices[state] || 300000;

    // Adjust based on ZIP (rough estimate - premium zips get +20%, etc.)
    const zipMultiplier = this.getZipMultiplier(zip);

    const stats = {
      medianPrice: Math.round(stateMedian * zipMultiplier),
      pricePerSqft: Math.round((stateMedian * zipMultiplier) / 1800), // avg sqft
      rentEstimate: Math.round((stateMedian * zipMultiplier) * 0.007), // 0.7% rent ratio
      daysOnMarket: 30, // default
    };

    this.setCache(cacheKey, stats, 7 * 24 * 60 * 60 * 1000); // 7 day cache for ZIP stats
    return stats;
  }

  // ============================================================================
  // Skip Trace / Owner Lookup
  // ============================================================================

  /**
   * Get skip trace (owner/contact) data for a property
   */
  async getSkipTrace(request: MarketDataRequest): Promise<SkipTraceData | null> {
    const cacheKey = this.buildCacheKey(request, 'skip');

    // Check cache first
    const cached = this.getFromCache<SkipTraceData>(cacheKey);
    if (cached) {
      console.log(`MarketDataService: Skip trace cache hit for ${request.address}`);
      return cached;
    }

    // If no API key, return null
    if (!this.apiKey) {
      console.warn('MarketDataService: No API key for skip trace');
      return null;
    }

    try {
      const skipData = await this.fetchSkipTrace(request);
      const normalizedData = this.normalizeSkipTraceData(skipData);

      // Cache the result
      this.setCache(cacheKey, normalizedData);

      return normalizedData;
    } catch (error) {
      console.error('MarketDataService: Skip trace error:', error);
      return null;
    }
  }

  /**
   * Get full property lookup with all data sources
   * Checks database first, then fetches from API if needed
   * Automatically saves lookups to database for future use
   */
  async getFullPropertyLookup(request: MarketDataRequest, options?: {
    includeImages?: boolean;
    includePriceHistory?: boolean;
    includeTaxHistory?: boolean;
    includeTaxAssessmentChart?: boolean;
    includeTaxPaidChart?: boolean;
    includeComparables?: boolean;
    includeSkipTrace?: boolean;
    forceRefresh?: boolean;      // Skip database check, fetch fresh data
    maxAgeDays?: number;         // Max age of cached data (default: 7 days)
    saveToDatabase?: boolean;    // Save lookup to database (default: true)
  }): Promise<FullPropertyLookup> {
    console.log(`MarketDataService: Full lookup for ${request.address}`);

    const maxAgeDays = options?.maxAgeDays ?? 7;
    const saveToDb = options?.saveToDatabase !== false;

    // =========================================================================
    // STEP 1: Check database for existing lookup (unless forceRefresh)
    // =========================================================================
    if (!options?.forceRefresh) {
      try {
        const existingLookup = await this.loadFromDatabase(request.address);

        if (existingLookup && !existingLookup.isStale(maxAgeDays)) {
          console.log(`MarketDataService: Found in database (ZPID: ${existingLookup.zpid})`);

          // Increment lookup count
          await existingLookup.recordLookup();

          // Return cached data from database
          return {
            property: existingLookup.propertyData as PropertyMarketData,
            skipTrace: existingLookup.skipTraceData as SkipTraceData | undefined,
            images: existingLookup.imagesData as PropertyImages | undefined,
            priceHistory: existingLookup.priceHistoryData as PriceHistoryData | undefined,
            taxHistory: existingLookup.taxHistoryData as TaxHistoryData | undefined,
            taxAssessmentChart: existingLookup.taxAssessmentChartData as TaxAssessmentChartData | undefined,
            taxPaidChart: existingLookup.taxPaidChartData as TaxPaidChartData | undefined,
            comparables: existingLookup.comparablesData as ComparableHomesData | undefined,
          };
        }

        if (existingLookup) {
          console.log(`MarketDataService: Database entry is stale, refreshing...`);
        }
      } catch (dbError) {
        console.warn('MarketDataService: Database check failed, proceeding with API:', dbError);
      }
    }

    // =========================================================================
    // STEP 2: Fetch from API
    // =========================================================================

    // First fetch property and skip trace in parallel
    const [property, skipTrace] = await Promise.all([
      this.getMarketData(request),
      options?.includeSkipTrace === false ? Promise.resolve(null) : this.getSkipTrace(request),
    ]);

    // Then fetch additional data using ZPID if available (more reliable)
    const [images, priceHistory, taxHistory, taxAssessmentChart, taxPaidChart, comparables] = await Promise.all([
      options?.includeImages !== false
        ? this.getPropertyImages(request, property.zpid)
        : Promise.resolve(null),
      options?.includePriceHistory !== false
        ? this.getPriceHistory(request, property.zpid)
        : Promise.resolve(null),
      options?.includeTaxHistory !== false
        ? this.getTaxHistory(request, property.zpid)
        : Promise.resolve(null),
      options?.includeTaxAssessmentChart !== false
        ? this.getTaxAssessmentChart(request, property.zpid)
        : Promise.resolve(null),
      options?.includeTaxPaidChart !== false
        ? this.getTaxPaidChart(request, property.zpid)
        : Promise.resolve(null),
      options?.includeComparables !== false
        ? this.getComparableHomes(request, property.zpid)
        : Promise.resolve(null),
    ]);

    const result: FullPropertyLookup = {
      property,
      skipTrace: skipTrace || undefined,
      images: images || undefined,
      priceHistory: priceHistory || undefined,
      taxHistory: taxHistory || undefined,
      taxAssessmentChart: taxAssessmentChart || undefined,
      taxPaidChart: taxPaidChart || undefined,
      comparables: comparables || undefined,
    };

    // =========================================================================
    // STEP 3: Save to database (if enabled and we have a ZPID)
    // =========================================================================
    if (saveToDb && property.zpid) {
      try {
        await this.saveToDatabase(result);
        console.log(`MarketDataService: Saved to database (ZPID: ${property.zpid})`);
      } catch (saveError) {
        console.warn('MarketDataService: Failed to save to database:', saveError);
      }
    }

    return result;
  }

  // ============================================================================
  // Database Persistence
  // ============================================================================

  /**
   * Save a full property lookup to the database
   */
  private async saveToDatabase(lookup: FullPropertyLookup): Promise<PropertyLookup> {
    const property = lookup.property;

    if (!property.zpid) {
      throw new Error('Cannot save lookup without ZPID');
    }

    const normalizedAddress = PropertyLookup.normalizeAddress(property.address);

    // Upsert: Update if exists, create if not
    const [record, created] = await PropertyLookup.upsert({
      zpid: property.zpid,
      address: property.address,
      normalizedAddress,
      city: property.city?.toLowerCase() || '',
      state: property.state?.toUpperCase() || '',
      zip: property.zip || '',

      // Summary fields for quick queries
      zestimate: property.zestimate,
      rentZestimate: property.rentZestimate,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      sqft: property.sqft,
      yearBuilt: property.yearBuilt,
      propertyType: property.propertyType,

      // Full JSONB data
      propertyData: property as object,
      skipTraceData: lookup.skipTrace as object | undefined,
      imagesData: lookup.images as object | undefined,
      priceHistoryData: lookup.priceHistory as object | undefined,
      taxHistoryData: lookup.taxHistory as object | undefined,
      taxAssessmentChartData: lookup.taxAssessmentChart as object | undefined,
      taxPaidChartData: lookup.taxPaidChart as object | undefined,
      comparablesData: lookup.comparables as object | undefined,

      // Metadata
      lastLookupAt: new Date(),
      dataFreshness: 0,
      confidence: property.confidence || 0,
      dataSource: property.dataSource || 'rapidapi-zillow',
    });

    return record;
  }

  /**
   * Load a property lookup from the database by address
   */
  private async loadFromDatabase(address: string): Promise<PropertyLookup | null> {
    return PropertyLookup.findByAddress(address);
  }

  /**
   * Load a property lookup from the database by ZPID
   */
  async getFromDatabaseByZpid(zpid: string): Promise<FullPropertyLookup | null> {
    const record = await PropertyLookup.findByZpid(zpid);

    if (!record) return null;

    return {
      property: record.propertyData as PropertyMarketData,
      skipTrace: record.skipTraceData as SkipTraceData | undefined,
      images: record.imagesData as PropertyImages | undefined,
      priceHistory: record.priceHistoryData as PriceHistoryData | undefined,
      taxHistory: record.taxHistoryData as TaxHistoryData | undefined,
      taxAssessmentChart: record.taxAssessmentChartData as TaxAssessmentChartData | undefined,
      taxPaidChart: record.taxPaidChartData as TaxPaidChartData | undefined,
      comparables: record.comparablesData as ComparableHomesData | undefined,
    };
  }

  /**
   * Get recent property lookups from the database
   */
  async getRecentLookups(limit: number = 20): Promise<PropertyLookup[]> {
    return PropertyLookup.getRecent(limit);
  }

  /**
   * Get lookups by city/state
   */
  async getLookupsByLocation(city: string, state: string): Promise<PropertyLookup[]> {
    return PropertyLookup.findByLocation(city, state);
  }

  // ============================================================================
  // Property Images
  // ============================================================================

  /**
   * Get property images (photos, street view)
   */
  async getPropertyImages(request: MarketDataRequest, zpid?: string): Promise<PropertyImages | null> {
    const cacheKey = this.buildCacheKey(request, 'images');

    // Check cache first
    const cached = this.getFromCache<PropertyImages>(cacheKey);
    if (cached) {
      console.log(`MarketDataService: Images cache hit for ${request.address}`);
      return cached;
    }

    // If no API key, return null
    if (!this.apiKey) {
      console.warn('MarketDataService: No API key for images');
      return null;
    }

    try {
      const imageData = await this.fetchPropertyImages(request.address, zpid);
      const normalizedData = this.normalizePropertyImages(imageData);

      // Cache the result
      this.setCache(cacheKey, normalizedData);

      return normalizedData;
    } catch (error) {
      console.error('MarketDataService: Images error:', error);
      return null;
    }
  }

  private async fetchPropertyImages(address: string, zpid?: string): Promise<any> {
    await this.rateLimit();

    const params = new URLSearchParams();

    // Prefer ZPID lookup (more reliable) over address lookup
    if (zpid) {
      params.append('byzpid', zpid);
    } else {
      params.append('byaddress', address);
    }

    const url = `${this.baseUrl}/propimages?${params}`;

    console.log(`MarketDataService: Fetching images for ${address}`);

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Images API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data;
  }

  private normalizePropertyImages(raw: any): PropertyImages {
    const photos: PropertyPhoto[] = [];

    // Parse originalPhotos array
    const originalPhotos = raw.originalPhotos || [];

    for (const photo of originalPhotos) {
      const mixedSources = photo.mixedSources || {};
      const jpegSources = mixedSources.jpeg || [];
      const webpSources = mixedSources.webp || [];

      // Get highest resolution JPEG and WebP
      const highestJpeg = jpegSources.reduce((best: any, curr: any) =>
        (curr.width > (best?.width || 0)) ? curr : best, null);
      const highestWebp = webpSources.reduce((best: any, curr: any) =>
        (curr.width > (best?.width || 0)) ? curr : best, null);

      if (highestJpeg) {
        const resolutions: ImageResolution[] = [
          ...jpegSources.map((s: any) => ({ url: s.url, width: s.width, format: 'jpeg' as const })),
          ...webpSources.map((s: any) => ({ url: s.url, width: s.width, format: 'webp' as const })),
        ];

        photos.push({
          jpegUrl: highestJpeg.url,
          webpUrl: highestWebp?.url,
          resolutions,
        });
      }
    }

    return {
      primaryImage: raw.hiResImageLink || photos[0]?.jpegUrl,
      streetViewUrl: raw.streetViewImageUrl,
      propertyUrl: raw.propertyURL,
      photos,
      totalPhotos: photos.length,
      lastUpdated: new Date(),
      dataSource: 'rapidapi-zillow-images',
    };
  }

  // ============================================================================
  // Price History
  // ============================================================================

  /**
   * Get price history for a property
   */
  async getPriceHistory(request: MarketDataRequest, zpid?: string): Promise<PriceHistoryData | null> {
    const cacheKey = this.buildCacheKey(request, 'history');

    // Check cache first
    const cached = this.getFromCache<PriceHistoryData>(cacheKey);
    if (cached) {
      console.log(`MarketDataService: Price history cache hit for ${request.address}`);
      return cached;
    }

    // If no API key, return null
    if (!this.apiKey) {
      console.warn('MarketDataService: No API key for price history');
      return null;
    }

    try {
      const historyData = await this.fetchPriceHistory(request.address, zpid);
      const normalizedData = this.normalizePriceHistory(historyData);

      // Cache the result
      this.setCache(cacheKey, normalizedData);

      return normalizedData;
    } catch (error) {
      console.error('MarketDataService: Price history error:', error);
      return null;
    }
  }

  private async fetchPriceHistory(address: string, zpid?: string): Promise<any> {
    await this.rateLimit();

    const params = new URLSearchParams();

    // Prefer ZPID lookup (more reliable) over address lookup
    if (zpid) {
      params.append('byzpid', zpid);
    } else {
      params.append('byaddress', address);
    }

    const url = `${this.baseUrl}/pricehistory?${params}`;

    console.log(`MarketDataService: Fetching price history for ${address}`);

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Price history API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data;
  }

  private normalizePriceHistory(raw: any): PriceHistoryData {
    const rawHistory = raw.priceHistory || [];

    // Parse all history items
    const history: PriceHistoryItem[] = rawHistory.map((item: any) => ({
      date: item.date,
      timestamp: item.time,
      price: item.price,
      pricePerSqft: item.pricePerSquareFoot,
      priceChangeRate: item.priceChangeRate,
      event: item.event,
      source: item.source,
      buyerAgent: item.buyerAgent ? {
        name: item.buyerAgent.name,
        profileUrl: item.buyerAgent.profileUrl,
        photoUrl: item.buyerAgent.photo?.url,
      } : undefined,
      sellerAgent: item.sellerAgent ? {
        name: item.sellerAgent.name,
        profileUrl: item.sellerAgent.profileUrl,
        photoUrl: item.sellerAgent.photo?.url,
      } : undefined,
    }));

    // Filter to listings and sales
    const listingHistory = history.filter(h =>
      h.event === 'Listed for sale' || h.event === 'Price change' || h.event === 'Listing removed'
    );
    const saleHistory = history.filter(h => h.event === 'Sold');

    // Find last sale
    const lastSale = saleHistory[0];

    return {
      history,
      totalEvents: history.length,
      lastSaleDate: lastSale?.date,
      lastSalePrice: lastSale?.price || undefined,
      listingHistory,
      saleHistory,
      lastUpdated: new Date(),
      dataSource: 'rapidapi-zillow-history',
    };
  }

  // ============================================================================
  // Tax History
  // ============================================================================

  /**
   * Get tax history for a property
   */
  async getTaxHistory(request: MarketDataRequest, zpid?: string): Promise<TaxHistoryData | null> {
    const cacheKey = this.buildCacheKey(request, 'tax');

    // Check cache first
    const cached = this.getFromCache<TaxHistoryData>(cacheKey);
    if (cached) {
      console.log(`MarketDataService: Tax history cache hit for ${request.address}`);
      return cached;
    }

    // If no API key, return null
    if (!this.apiKey) {
      console.warn('MarketDataService: No API key for tax history');
      return null;
    }

    try {
      const taxData = await this.fetchTaxHistory(request.address, zpid);
      const normalizedData = this.normalizeTaxHistory(taxData);

      // Cache the result
      this.setCache(cacheKey, normalizedData);

      return normalizedData;
    } catch (error) {
      console.error('MarketDataService: Tax history error:', error);
      return null;
    }
  }

  private async fetchTaxHistory(address: string, zpid?: string): Promise<any> {
    await this.rateLimit();

    const params = new URLSearchParams();

    // Prefer ZPID lookup (more reliable) over address lookup
    if (zpid) {
      params.append('byzpid', zpid);
    } else {
      params.append('byaddress', address);
    }

    const url = `${this.baseUrl}/taxinfo?${params}`;

    console.log(`MarketDataService: Fetching tax history for ${address}`);

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tax history API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data;
  }

  private normalizeTaxHistory(raw: any): TaxHistoryData {
    const rawHistory = raw.taxHistory || [];

    // Parse all history items and convert timestamp to year
    const history: TaxHistoryItem[] = rawHistory.map((item: any) => {
      const date = new Date(item.time);
      return {
        year: date.getFullYear(),
        timestamp: item.time,
        taxPaid: item.taxPaid,
        taxIncreaseRate: item.taxIncreaseRate || 0,
        assessedValue: item.value,
        valueIncreaseRate: item.valueIncreaseRate || 0,
      };
    });

    // Get current (most recent) values
    const current = history[0];

    // Calculate average tax rate (tax / assessed value) where both exist and assessedValue > 0
    const withBothValues = history.filter(
      (h): h is typeof h & { taxPaid: number; assessedValue: number } =>
        typeof h.taxPaid === 'number' && typeof h.assessedValue === 'number' && h.assessedValue > 0
    );
    const avgTaxRate = withBothValues.length > 0
      ? withBothValues.reduce((sum, h) => sum + (h.taxPaid / h.assessedValue), 0) / withBothValues.length
      : undefined;

    return {
      history,
      totalYears: history.length,
      currentTax: current?.taxPaid || undefined,
      currentAssessedValue: current?.assessedValue,
      averageTaxRate: avgTaxRate ? Math.round(avgTaxRate * 10000) / 100 : undefined, // As percentage
      lastUpdated: new Date(),
      dataSource: 'rapidapi-zillow-tax',
    };
  }

  /**
   * Batch fetch full property lookups
   */
  async batchGetFullLookup(requests: MarketDataRequest[]): Promise<Map<string, FullPropertyLookup>> {
    const results = new Map<string, FullPropertyLookup>();

    // Process in parallel with concurrency limit
    const concurrency = 3;
    const chunks = this.chunkArray(requests, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(async (req) => {
        const data = await this.getFullPropertyLookup(req);
        results.set(req.address, data);
      });

      await Promise.all(promises);
    }

    return results;
  }

  private async fetchSkipTrace(request: MarketDataRequest): Promise<any> {
    await this.rateLimit();

    // Parse address into street and citystatezip
    const { street, cityStateZip } = this.parseAddressForSkipTrace(request);

    const params = new URLSearchParams({
      street,
      citystatezip: cityStateZip,
      page: '1',
    });

    const url = `${this.baseUrl}/skip/byaddress?${params}`;

    console.log(`MarketDataService: Fetching skip trace for ${request.address}`);

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Skip trace API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data;
  }

  private parseAddressForSkipTrace(request: MarketDataRequest): { street: string; cityStateZip: string } {
    const address = request.address;

    // Try to parse "123 Main St, City, ST 12345" format
    const parts = address.split(',').map(p => p.trim());

    if (parts.length >= 2) {
      const street = parts[0];
      const cityStateZip = parts.slice(1).join(', ');
      return { street, cityStateZip };
    }

    // Fallback: use the whole address as street and construct cityStateZip from request
    const cityStateZip = [request.city, request.state, request.zip]
      .filter(Boolean)
      .join(', ');

    return {
      street: address,
      cityStateZip: cityStateZip || address,
    };
  }

  private normalizeSkipTraceData(raw: any): SkipTraceData {
    // Handle the RapidAPI skip trace response format
    // Response contains PeopleDetails array with person records
    const peopleDetails = raw.PeopleDetails || raw.peopleDetails || raw.results || raw.data || [];
    const propertyDetails = raw.PropertyDetails || raw.propertyDetails || {};

    const owners: OwnerInfo[] = [];

    // Parse each person from PeopleDetails
    for (const person of (Array.isArray(peopleDetails) ? peopleDetails : [])) {
      // Parse name into first/last
      const fullName = person.Name || person.name || '';
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Parse "Lives in" to get associated addresses
      const livesIn = person['Lives in'] || person.livesIn || '';
      const usedToLiveIn = person['Used to live in'] || person.usedToLiveIn || '';
      const addresses: string[] = [];
      if (livesIn) addresses.push(livesIn);
      if (usedToLiveIn) {
        const pastAddrs = usedToLiveIn.split(',').map((a: string) => a.trim());
        addresses.push(...pastAddrs);
      }

      const owner: OwnerInfo = {
        name: fullName,
        firstName,
        lastName,
        phones: this.parsePhones(person.phones || person.phoneNumbers || person.phone),
        emails: this.parseEmails(person.emails || person.email),
        age: person.Age || person.age,
        ageRange: person.ageRange || person.age_range,
        associatedAddresses: addresses.length > 0 ? addresses : undefined,
      };

      if (owner.name) {
        owners.push(owner);
      }
    }

    // Parse property details for mailing address
    const mailingAddr = propertyDetails?.mailingAddress || propertyDetails?.mailing_address;

    return {
      owners,
      ownerOccupied: propertyDetails?.ownerOccupied ?? propertyDetails?.owner_occupied,
      ownershipType: propertyDetails?.ownershipType || propertyDetails?.ownership_type,
      mailingAddress: mailingAddr ? {
        street: mailingAddr.street || mailingAddr.address || '',
        city: mailingAddr.city || '',
        state: mailingAddr.state || '',
        zip: mailingAddr.zip || mailingAddr.zipcode || '',
      } : undefined,
      lastUpdated: new Date(),
      dataSource: 'rapidapi-zillow-skip',
      confidence: this.calculateSkipTraceConfidence(owners),
    };
  }

  private parsePhones(phones: any): PhoneInfo[] {
    if (!phones) return [];

    const phoneList = Array.isArray(phones) ? phones : [phones];

    return phoneList
      .filter(Boolean)
      .map((phone: any) => {
        if (typeof phone === 'string') {
          return { number: phone, type: 'unknown' as const };
        }
        return {
          number: phone.number || phone.phone || phone.value || String(phone),
          type: (phone.type || phone.lineType || 'unknown') as PhoneInfo['type'],
          carrier: phone.carrier,
          isPrimary: phone.isPrimary || phone.is_primary,
        };
      })
      .filter(p => p.number);
  }

  private parseEmails(emails: any): string[] {
    if (!emails) return [];

    const emailList = Array.isArray(emails) ? emails : [emails];

    return emailList
      .filter(Boolean)
      .map((email: any) => {
        if (typeof email === 'string') return email;
        return email.email || email.address || email.value || String(email);
      })
      .filter(e => e && e.includes('@'));
  }

  private calculateSkipTraceConfidence(owners: OwnerInfo[]): number {
    if (owners.length === 0) return 0;

    let confidence = 50;

    // Add confidence for having contact info
    const hasPhone = owners.some(o => o.phones && o.phones.length > 0);
    const hasEmail = owners.some(o => o.emails && o.emails.length > 0);
    const hasFullName = owners.some(o => o.firstName && o.lastName);

    if (hasPhone) confidence += 20;
    if (hasEmail) confidence += 15;
    if (hasFullName) confidence += 15;

    return Math.min(confidence, 100);
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 15000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async fetchPropertyByAddress(address: string): Promise<any> {
    await this.rateLimit();

    const encodedAddress = encodeURIComponent(address);
    const url = `${this.baseUrl}/pro/byaddress?propertyaddress=${encodedAddress}`;

    console.log(`MarketDataService: Fetching data for ${address}`);

    let response: Response | undefined;
    try {
      response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
    } catch (fetchError) {
      throw new Error(`Zillow API request failed: ${fetchError instanceof Error ? fetchError.message : 'Network error'}`);
    }

    if (!response) {
      throw new Error('Zillow API request failed: No response received');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zillow API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data || data.error) {
      throw new Error(`Zillow API returned error: ${data?.error || 'No data'}`);
    }

    return data;
  }

  private normalizePropertyData(raw: any, request: MarketDataRequest): PropertyMarketData {
    // Handle RapidAPI Zillow response format
    // Data comes in propertyDetails with key values in adTargets OR in property format
    const property = raw.propertyDetails || raw.property || raw.data || raw;
    const adTargets = property.adTargets || {};
    const resoFacts = property.resoFacts || {};
    const addressInfo = property.address || {};

    // Extract address components (try multiple sources)
    const city = property.city || adTargets.city || addressInfo.city || request.city || '';
    const state = property.state || adTargets.state || addressInfo.state || request.state || '';
    const zip = property.zipcode || adTargets.zip || addressInfo.zipcode || request.zip || '';

    // Extract valuations from adTargets (they come as strings) or from property
    const zestimate = adTargets.zestimate ? parseInt(adTargets.zestimate, 10) :
                      (property.zestimate || undefined);
    const rentZestimate = adTargets.rentZestimate ? parseInt(adTargets.rentZestimate, 10) :
                          (property.rentZestimate || undefined);

    // Extract property details from adTargets OR resoFacts OR property directly
    const bedroomsRaw = adTargets.bd || resoFacts.bedrooms || property.bedrooms;
    const bathroomsRaw = adTargets.ba || resoFacts.bathrooms || property.bathrooms;
    const sqftRaw = adTargets.sqft || resoFacts.livingArea || property.livingArea;

    const bedrooms = bedroomsRaw ? parseInt(String(bedroomsRaw), 10) : undefined;
    const bathrooms = bathroomsRaw ? parseFloat(String(bathroomsRaw)) : undefined;
    const sqft = sqftRaw ? parseInt(String(sqftRaw), 10) : 0;

    // Parse year built (format: "1920-1939" or just "1985")
    let yearBuilt: number | undefined;
    const yrbltRaw = adTargets.yrblt || resoFacts.yearBuilt || property.yearBuilt;
    if (yrbltRaw) {
      const yearMatch = String(yrbltRaw).match(/\d{4}/);
      yearBuilt = yearMatch ? parseInt(yearMatch[0], 10) : undefined;
    }

    // Extract property type
    const propertyType = adTargets.proptp === 'sfh' ? 'Single Family' :
                         adTargets.proptp === 'mfh' ? 'Multi Family' :
                         adTargets.proptp === 'condo' ? 'Condo' :
                         property.homeType || adTargets.proptp || undefined;

    // Extract lot size
    const lotSizeRaw = adTargets.lotsize || resoFacts.lotSize || property.lotSize || property.lotAreaValue;
    const lotSize = lotSizeRaw ? parseInt(String(lotSizeRaw), 10) : undefined;

    // Build price history
    const priceHistory = this.parsePriceHistory(property.priceHistory || property.price_history || []);

    // Get comparables if available
    const comparables = this.parseComparables(property.comps || property.comparables || []);

    // Calculate derived metrics
    const pricePerSqft = sqft > 0 && zestimate ? Math.round(zestimate / sqft) : undefined;

    // Calculate 1-year price change from history
    const priceChange1Year = this.calculateYearOverYearChange(priceHistory);

    // Build confidence based on extracted data
    const confidenceData = {
      zestimate,
      rentZestimate,
      priceHistory,
      comps: comparables,
      taxAssessedValue: property.taxAssessedValue,
    };

    return {
      zpid: property.zpid?.toString() || undefined,
      address: request.address,
      city,
      state,
      zip,
      county: property.county || undefined,

      zestimate,
      zestimateRangeLow: property.zestimateLowPercent && zestimate ? zestimate * (1 - property.zestimateLowPercent / 100) : undefined,
      zestimateRangeHigh: property.zestimateHighPercent && zestimate ? zestimate * (1 + property.zestimateHighPercent / 100) : undefined,
      rentZestimate,
      rentZestimateRangeLow: property.rentZestimateLowPercent && rentZestimate ? rentZestimate * (1 - property.rentZestimateLowPercent / 100) : undefined,
      rentZestimateRangeHigh: property.rentZestimateHighPercent && rentZestimate ? rentZestimate * (1 + property.rentZestimateHighPercent / 100) : undefined,

      bedrooms,
      bathrooms,
      sqft: sqft || undefined,
      lotSize,
      yearBuilt,
      propertyType,

      pricePerSqft,
      taxAssessedValue: property.taxAssessedValue || undefined,
      lastSoldPrice: property.lastSoldPrice || undefined,
      lastSoldDate: property.lastSoldDate || undefined,

      priceHistory,
      zestimateHistory: [], // Fetched separately if needed

      neighborhoodMedianPrice: property.neighborhoodMedianPrice || undefined,
      cityMedianPrice: property.cityMedianPrice || undefined,
      stateMedianPrice: this.fallbackMedianPrices[state] || undefined,
      daysOnMarket: property.daysOnZillow || property.daysOnMarket || undefined,
      priceChange1Year: priceChange1Year ?? undefined,

      comparables,

      lastUpdated: new Date(),
      dataSource: 'rapidapi-zillow',
      confidence: this.calculateConfidenceFromData(confidenceData),
    };
  }

  private parsePriceHistory(history: any[]): PriceHistoryItem[] {
    if (!Array.isArray(history)) return [];

    return history
      .filter((item) => item.price || item.amount)
      .map((item) => ({
        date: item.date || item.time || '',
        price: item.price || item.amount || 0,
        event: item.event || item.type || 'unknown',
        source: item.source || 'zillow',
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  private parseZestimateHistory(data: any): ZestimateHistoryItem[] {
    if (!data || !data.data) return [];

    const chartData = data.data || [];
    return chartData.map((item: any) => ({
      date: item.x || item.date || '',
      value: item.y || item.value || 0,
    }));
  }

  private parseComparables(comps: any[]): ComparableProperty[] {
    if (!Array.isArray(comps)) return [];

    return comps.slice(0, 5).map((comp) => ({
      address: comp.address || comp.streetAddress || '',
      price: comp.price || comp.lastSoldPrice || 0,
      sqft: comp.livingArea || comp.sqft || 0,
      bedrooms: comp.bedrooms || 0,
      bathrooms: comp.bathrooms || 0,
      distance: comp.distance || null,
      soldDate: comp.lastSoldDate || comp.soldDate || null,
    }));
  }

  private calculateYearOverYearChange(history: PriceHistoryItem[]): number | null {
    if (history.length < 2) return null;

    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    // Find most recent price
    const recentPrice = history[0]?.price;

    // Find price closest to one year ago
    const yearAgoItem = history.find((item) => new Date(item.date) <= oneYearAgo);

    if (!recentPrice || !yearAgoItem?.price || yearAgoItem.price === 0) return null;

    return Math.round(((recentPrice - yearAgoItem.price) / yearAgoItem.price) * 100);
  }

  private calculateConfidence(data: any): number {
    let confidence = 50; // Base confidence

    if (data.zestimate) confidence += 15;
    if (data.rentZestimate) confidence += 10;
    if (data.priceHistory?.length > 0) confidence += 10;
    if (data.comps?.length > 0) confidence += 10;
    if (data.taxAssessedValue) confidence += 5;

    return Math.min(confidence, 100);
  }

  private calculateConfidenceFromData(data: {
    zestimate?: number;
    rentZestimate?: number;
    priceHistory?: PriceHistoryItem[];
    comps?: ComparableProperty[];
    taxAssessedValue?: number;
  }): number {
    let confidence = 50; // Base confidence

    if (data.zestimate) confidence += 15;
    if (data.rentZestimate) confidence += 10;
    if (data.priceHistory && data.priceHistory.length > 0) confidence += 10;
    if (data.comps && data.comps.length > 0) confidence += 10;
    if (data.taxAssessedValue) confidence += 5;

    return Math.min(confidence, 100);
  }

  private buildFallbackData(request: MarketDataRequest): PropertyMarketData {
    const state = request.state || this.extractState(request.address);
    const stateMedian = this.fallbackMedianPrices[state] || 300000;

    return {
      address: request.address,
      city: request.city || '',
      state: state,
      zip: request.zip || '',

      stateMedianPrice: stateMedian,
      pricePerSqft: Math.round(stateMedian / 1800),
      rentZestimate: Math.round(stateMedian * 0.007),

      lastUpdated: new Date(),
      dataSource: 'fallback',
      confidence: 20,
    };
  }

  private extractState(address: string): string {
    // Try to extract state from address string
    const statePattern = /,\s*([A-Z]{2})\s*\d{5}/;
    const match = address.match(statePattern);
    return match?.[1] || '';
  }

  private zipToState(zip: string): string {
    // First digit of ZIP indicates region
    const firstDigit = zip.charAt(0);
    const zipRanges: Record<string, string[]> = {
      '0': ['CT', 'MA', 'ME', 'NH', 'NJ', 'NY', 'PR', 'RI', 'VT'],
      '1': ['DE', 'NY', 'PA'],
      '2': ['DC', 'MD', 'NC', 'SC', 'VA', 'WV'],
      '3': ['AL', 'FL', 'GA', 'MS', 'TN'],
      '4': ['IN', 'KY', 'MI', 'OH'],
      '5': ['IA', 'MN', 'MT', 'ND', 'SD', 'WI'],
      '6': ['IL', 'KS', 'MO', 'NE'],
      '7': ['AR', 'LA', 'OK', 'TX'],
      '8': ['AZ', 'CO', 'ID', 'NM', 'NV', 'UT', 'WY'],
      '9': ['AK', 'CA', 'HI', 'OR', 'WA'],
    };

    const states = zipRanges[firstDigit] || [];
    return states[0] || 'TX'; // Default to TX
  }

  private getZipMultiplier(zip: string): number {
    // Premium ZIP ranges (rough approximation)
    const premiumPrefixes = ['100', '902', '941', '331', '331']; // NYC, LA, SF, Miami
    const budgetPrefixes = ['38', '39', '71', '72']; // MS, rural areas

    for (const prefix of premiumPrefixes) {
      if (zip.startsWith(prefix)) return 1.5;
    }

    for (const prefix of budgetPrefixes) {
      if (zip.startsWith(prefix)) return 0.7;
    }

    return 1.0;
  }

  private getHeaders(): HeadersInit {
    return {
      'X-RapidAPI-Key': this.apiKey,
      'X-RapidAPI-Host': this.apiHost,
    };
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.minRequestInterval) {
      await new Promise((resolve) => setTimeout(resolve, this.minRequestInterval - elapsed));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  private buildCacheKey(request: MarketDataRequest, type: string = 'property'): string {
    // Normalize address for cache key
    const normalized = request.address
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 50);
    return `${type}:${normalized}`;
  }

  private getFromCache<T>(key: string): T | null {
    // L1: Check in-memory cache first
    const entry = this.cache.get(key);
    if (entry) {
      const now = Date.now();
      if (now - entry.timestamp <= entry.ttl) {
        return entry.data as T;
      }
      this.cache.delete(key);
    }
    return null;
  }

  /**
   * Get from cache with Redis L2 fallback (async version)
   */
  private async getFromCacheAsync<T>(key: string): Promise<T | null> {
    // L1: Check in-memory cache first
    const l1 = this.getFromCache<T>(key);
    if (l1) return l1;

    // L2: Check Redis cache
    const redisKey = `${CACHE_PREFIX.MARKET_DATA}${key}`;
    const l2 = await redisService.get<T>(redisKey);
    if (l2) {
      // Populate L1 cache from Redis
      this.setCache(key, l2);
      return l2;
    }

    return null;
  }

  private setCache<T>(key: string, data: T, ttl?: number): void {
    // L1: Set in-memory cache
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });

    // L2: Set Redis cache (fire and forget)
    const redisKey = `${CACHE_PREFIX.MARKET_DATA}${key}`;
    const redisTTL = Math.floor((ttl || this.defaultTTL) / 1000); // Convert to seconds
    redisService.set(redisKey, data, redisTTL).catch((err) => {
      console.warn('Redis cache set error:', err.message);
    });
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance
export const marketDataService = MarketDataService.getInstance();
