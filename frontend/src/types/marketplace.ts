/**
 * Marketplace Types
 * Types for the swipe-based deal marketplace
 */

// ============================================================================
// DEAL TYPES
// ============================================================================

export interface MarketplaceDeal {
  id: string;
  deal: DealDetails;
  matchScore: number;
  matchReasons: string[];
  isNew: boolean;
  isFeatured: boolean;
  expiresAt?: string;
  viewCount: number;
  offerCount: number;
  savedCount: number;
}

export interface DealDetails {
  id: string;
  price: number;
  arv?: number;
  equity?: number;
  address?: string;
  city: string;
  state: string;
  zip?: string;
  propertyType: PropertyType;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  lotSize?: number;
  yearBuilt?: number;
  hasPool?: boolean;
  hasGarage?: boolean;
  hasHOA?: boolean;
  condition?: PropertyCondition;
  photos?: string[];
  description?: string;
  wholesalerName?: string;
  wholesalerPhone?: string;
  wholesalerEmail?: string;
  repairEstimate?: number;
  daysOnMarket?: number;
  createdAt: string;
}

export type PropertyType =
  | 'single_family'
  | 'townhouse'
  | 'condo'
  | 'multi_family'
  | 'duplex'
  | 'triplex'
  | 'fourplex'
  | 'land'
  | 'commercial';

export type PropertyCondition =
  | 'turnkey'
  | 'light_rehab'
  | 'moderate_rehab'
  | 'heavy_rehab'
  | 'tear_down';

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
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

export const CONDITION_LABELS: Record<PropertyCondition, string> = {
  turnkey: 'Turnkey',
  light_rehab: 'Light Rehab',
  moderate_rehab: 'Moderate Rehab',
  heavy_rehab: 'Heavy Rehab',
  tear_down: 'Tear Down',
};

// ============================================================================
// FEED TYPES
// ============================================================================

export interface MarketplaceFeed {
  deals: MarketplaceDeal[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  filters: FeedFilters;
}

export interface FeedFilters {
  sortBy: 'match_score' | 'newest' | 'price_low' | 'price_high' | 'ending_soon';
  priceRange?: { min: number; max: number };
  states?: string[];
  propertyTypes?: PropertyType[];
  minBeds?: number;
  minBaths?: number;
}

export interface FeedRequest {
  page?: number;
  limit?: number;
  sortBy?: FeedFilters['sortBy'];
  buyBoxId?: string;
  minPrice?: number;
  maxPrice?: number;
  states?: string;
  propertyTypes?: string;
}

// ============================================================================
// SWIPE TYPES
// ============================================================================

export type SwipeAction = 'like' | 'pass' | 'super_like' | 'maybe';
export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export type PassReason =
  | 'price_too_high'
  | 'location_not_ideal'
  | 'property_condition'
  | 'not_enough_equity'
  | 'wrong_property_type'
  | 'too_small'
  | 'too_large'
  | 'bad_neighborhood'
  | 'title_issues'
  | 'already_have_similar'
  | 'over_budget'
  | 'other';

export const PASS_REASONS: { value: PassReason; label: string }[] = [
  { value: 'price_too_high', label: 'Price too high' },
  { value: 'location_not_ideal', label: 'Location not ideal' },
  { value: 'property_condition', label: 'Property condition concerns' },
  { value: 'not_enough_equity', label: 'Not enough equity' },
  { value: 'wrong_property_type', label: 'Wrong property type' },
  { value: 'too_small', label: 'Too small' },
  { value: 'too_large', label: 'Too large' },
  { value: 'bad_neighborhood', label: 'Neighborhood concerns' },
  { value: 'title_issues', label: 'Potential title issues' },
  { value: 'already_have_similar', label: 'Already have similar property' },
  { value: 'over_budget', label: 'Over my current budget' },
  { value: 'other', label: 'Other reason' },
];

export interface SwipeRequest {
  action: SwipeAction;
  passReason?: PassReason;
  passReasonCustom?: string;
  maybeNotes?: string;
  viewDuration?: number;
}

// ============================================================================
// MATCH TYPES - "It's a Match!" feature
// ============================================================================

export type MatchType = 'ml_prediction' | 'buybox_score' | 'super_like' | 'priority_match';

export interface MatchInfo {
  isMatch: boolean;
  matchType?: MatchType;
  matchScore: number;
  matchReasons: string[];
  mlConfidence?: number;
  buyBoxScore?: number;
  celebrationMessage?: string;
}

export interface SwipeResponse {
  success: boolean;
  message: string;
  match?: MatchInfo;
}

// ============================================================================
// OFFER TYPES
// ============================================================================

export type OfferStatus =
  | 'pending'
  | 'viewed'
  | 'countered'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export type FinanceType = 'cash' | 'hard_money' | 'conventional' | 'other';

export interface DealOffer {
  id: string;
  userId: string;
  dealId: string;
  offerAmount: number;
  earnestMoney?: number;
  closingDays: number;
  contingencies: string[];
  notes?: string;
  financeType: FinanceType;
  proofOfFunds: boolean;
  status: OfferStatus;
  counterOfferAmount?: number;
  counterOfferClosingDays?: number;
  counterOfferNotes?: string;
  counterOfferAt?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  respondedAt?: string;
}

export interface OfferRequest {
  offerAmount: number;
  earnestMoney?: number;
  closingDays: number;
  contingencies?: string[];
  notes?: string;
  financeType: FinanceType;
  proofOfFunds?: boolean;
}

export const FINANCE_TYPE_LABELS: Record<FinanceType, string> = {
  cash: 'Cash',
  hard_money: 'Hard Money',
  conventional: 'Conventional',
  other: 'Other',
};

export const COMMON_CONTINGENCIES = [
  { value: 'inspection', label: 'Inspection' },
  { value: 'appraisal', label: 'Appraisal' },
  { value: 'financing', label: 'Financing' },
  { value: 'title', label: 'Clear Title' },
  { value: 'survey', label: 'Survey' },
];

// ============================================================================
// USER & BUY BOX TYPES
// ============================================================================

export interface MarketplaceUser {
  id: string;
  email: string;
  name: string;
  company?: string;
  phone?: string;
  role: 'buyer' | 'investor' | 'wholesaler' | 'agent';
  totalDealsViewed: number;
  totalLikes: number;
  totalPasses: number;
  totalOffers: number;
  acceptedOffers: number;
  lastActiveAt: string;
  createdAt: string;
}

export interface UserBuyBox {
  id: string;
  userId: string;
  name: string;
  active: boolean;
  priority: number;
  states: string[];
  cities?: string[];
  zipCodes?: string[];
  minPrice?: number;
  maxPrice?: number;
  propertyTypes: PropertyType[];
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minSqft?: number;
  maxSqft?: number;
  minYearBuilt?: number;
  minEquityPercent?: number;
  allowHoa?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// ANALYTICS & PREDICTION TYPES
// ============================================================================

export interface UserBehaviorProfile {
  userId: string;
  implicitPreferences: {
    avgLikedPrice: number;
    avgPassedPrice: number;
    preferredPriceRange: { min: number; max: number };
    likedStates: Record<string, number>;
    passedStates: Record<string, number>;
    likedPropertyTypes: Record<string, number>;
    passedPropertyTypes: Record<string, number>;
    avgLikedSqft: number;
    avgPassedSqft: number;
    avgLikedBedrooms: number;
    avgPassedBedrooms: number;
    avgViewDurationLiked: number;
    avgViewDurationPassed: number;
  };
  topPassReasons: { reason: PassReason; count: number; percentage: number }[];
  mostActiveHours: number[];
  mostActiveDays: string[];
  avgDealsPerSession: number;
  likeRate: number;
  offerRate: number;
  conversionRate: number;
  predictedInterests: {
    priceRange: { min: number; max: number };
    states: string[];
    propertyTypes: string[];
    minEquity: number;
  };
  lastUpdated: string;
}

export interface DealPrediction {
  dealId: string;
  userId: string;
  predictedAction: SwipeAction;
  confidence: number;
  factors: {
    factor: string;
    impact: 'positive' | 'negative';
    weight: number;
  }[];
}

export interface DealAnalytics {
  views: number;
  likes: number;
  passes: number;
  offers: number;
  conversionRate: number;
  topPassReasons: { reason: string; count: number }[];
}

export interface PassReasonAnalytics {
  reason: string;
  label: string;
  count: number;
  percentage: number;
}

// ============================================================================
// COMPARISON TYPES
// ============================================================================

export interface DealComparison {
  deals: ComparedDeal[];
  summary: {
    bestFinancial: string;
    bestProperty: string;
    bestLocation: string;
    bestMarket: string;
    lowestCompetition: string;
  };
  winner: {
    dealId: string;
    score: number;
    reasons: string[];
  };
}

export interface ComparedDeal {
  dealId: string;
  address: string;
  scores: {
    financial: number;
    property: number;
    location: number;
    market: number;
    competition: number;
    overall: number;
  };
  pros: string[];
  cons: string[];
}
