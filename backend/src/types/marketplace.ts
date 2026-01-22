/**
 * Marketplace Types
 *
 * Types for the user-facing deal marketplace with:
 * - User preferences and buy boxes
 * - Swipe actions (like/pass)
 * - Offer management
 * - Action tracking for ML predictions
 */

// ============================================================================
// USER TYPES
// ============================================================================

export interface MarketplaceUser {
  id: string;
  email: string;
  name: string;
  company?: string;
  phone?: string;
  role: 'buyer' | 'investor' | 'wholesaler' | 'agent';
  verified: boolean;
  preferences: UserPreferences;
  stats: UserStats;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
}

export interface UserPreferences {
  buyBox: UserBuyBox;
  notifications: NotificationPreferences;
  dealAlerts: boolean;
  instantAlerts: boolean;
  dailyDigest: boolean;
}

export interface UserBuyBox {
  id: string;
  userId: string;
  name: string;
  active: boolean;
  criteria: UserBuyBoxCriteria;
  priority: number; // 1-10, higher = more important
  createdAt: Date;
  updatedAt: Date;
}

export interface UserBuyBoxCriteria {
  // Geographic
  states: string[];
  cities?: string[];
  zipCodes?: string[];
  maxDistanceMiles?: number;

  // Price
  minPrice?: number;
  maxPrice?: number;
  minARV?: number;
  maxARV?: number;
  minEquity?: number; // percentage

  // Property
  propertyTypes: PropertyType[];
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minSqft?: number;
  maxSqft?: number;
  minYearBuilt?: number;
  maxYearBuilt?: number;

  // Condition
  acceptedConditions?: PropertyCondition[];
  maxRehabCost?: number;

  // Features
  requirePool?: boolean;
  requireGarage?: boolean;
  requireNoHOA?: boolean;

  // Deal type
  dealTypes?: DealType[];
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

export type DealType =
  | 'wholesale'
  | 'subject_to'
  | 'seller_finance'
  | 'lease_option'
  | 'foreclosure'
  | 'reo';

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
  inApp: boolean;
}

export interface UserStats {
  totalDealsViewed: number;
  totalLikes: number;
  totalPasses: number;
  totalOffers: number;
  acceptedOffers: number;
  avgResponseTime: number; // milliseconds
  preferredPriceRange: { min: number; max: number };
  preferredStates: string[];
  lastActivity: Date;
}

// ============================================================================
// DEAL ACTION TYPES
// ============================================================================

export type DealActionType =
  | 'view'           // Opened deal card
  | 'like'           // Swipe right
  | 'pass'           // Swipe left
  | 'maybe'          // Needs more research - swipe down or bookmark
  | 'save'           // Favorited/bookmarked
  | 'share'          // Shared deal
  | 'offer'          // Submitted offer
  | 'request_info'   // Requested more info
  | 'message'        // Sent message
  | 'filter_applied' // Applied filters (track what filters)
  | 'search';        // Searched

export interface DealAction {
  id: string;
  userId: string;
  dealId: string;
  actionType: DealActionType;

  // For 'pass' actions
  passReason?: PassReason;
  passReasonCustom?: string;

  // For 'offer' actions
  offerId?: string;

  // For 'filter_applied' actions
  filtersApplied?: {
    states?: string[];
    cities?: string[];
    counties?: string[];
    priceMin?: number;
    priceMax?: number;
    propertyTypes?: string[];
    minBeds?: number;
    maxBeds?: number;
    [key: string]: any;
  };

  // For 'search' actions
  searchQuery?: string;

  // Timing
  viewDuration?: number; // milliseconds spent viewing
  timestamp: Date;

  // Context for ML
  dealSnapshot: DealSnapshot;
  matchScore?: number;
  position?: number; // position in feed when shown
}

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

// Snapshot of deal at time of action (for ML training)
export interface DealSnapshot {
  price: number;
  arv?: number;
  equity?: number;
  state: string;
  city: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  yearBuilt?: number;
  condition?: string;
  daysOnMarket: number;
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

export interface DealOffer {
  id: string;
  oduserId: string;
  dealId: string;

  // Offer details
  offerAmount: number;
  earnestMoney?: number;
  closingDays: number;
  contingencies: string[];
  notes?: string;

  // Finance details
  financeType: 'cash' | 'hard_money' | 'conventional' | 'other';
  proofOfFunds?: boolean;
  preApprovalLetter?: boolean;

  // Status tracking
  status: OfferStatus;
  counterOffer?: {
    amount: number;
    closingDays: number;
    notes?: string;
    timestamp: Date;
  };

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
}

// ============================================================================
// MARKETPLACE FEED TYPES
// ============================================================================

export interface MarketplaceDeal {
  id: string;
  deal: any; // NormalizedDeal
  matchScore: number;
  matchReasons: string[];
  isNew: boolean;
  isFeatured: boolean;
  expiresAt?: Date;
  viewCount: number;
  offerCount: number;
  savedCount: number;
}

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

// ============================================================================
// ML / PREDICTION TYPES
// ============================================================================

export interface UserBehaviorProfile {
  userId: string;

  // Calculated preferences from actions
  implicitPreferences: {
    avgLikedPrice: number;
    avgPassedPrice: number;
    preferredPriceRange: { min: number; max: number };

    likedStates: Map<string, number>; // state -> count
    passedStates: Map<string, number>;

    likedPropertyTypes: Map<string, number>;
    passedPropertyTypes: Map<string, number>;

    avgLikedSqft: number;
    avgPassedSqft: number;

    avgLikedBedrooms: number;
    avgPassedBedrooms: number;

    avgViewDurationLiked: number;
    avgViewDurationPassed: number;
  };

  // Pass reason analysis
  topPassReasons: { reason: PassReason; count: number; percentage: number }[];

  // Activity patterns
  mostActiveHours: number[];
  mostActiveDays: string[];
  avgDealsPerSession: number;

  // Engagement metrics
  likeRate: number; // likes / views
  offerRate: number; // offers / likes
  conversionRate: number; // accepted / offers

  // Predictions
  predictedInterests: {
    priceRange: { min: number; max: number };
    states: string[];
    propertyTypes: string[];
    minEquity: number;
  };

  lastUpdated: Date;
}

export interface DealPrediction {
  dealId: string;
  userId: string;
  predictedAction: 'like' | 'pass';
  confidence: number; // 0-100
  factors: {
    factor: string;
    impact: 'positive' | 'negative';
    weight: number;
  }[];
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface SwipeRequest {
  userId: string;
  dealId: string;
  action: 'like' | 'pass' | 'super_like' | 'maybe';
  passReason?: PassReason;
  passReasonCustom?: string;
  viewDuration?: number;
  maybeNotes?: string; // Notes for "maybe" pile
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

export interface OfferRequest {
  userId: string;
  dealId: string;
  offerAmount: number;
  earnestMoney?: number;
  closingDays: number;
  contingencies?: string[];
  notes?: string;
  financeType: 'cash' | 'hard_money' | 'conventional' | 'other';
  proofOfFunds?: boolean;
}

export interface FeedRequest {
  userId: string;
  page?: number;
  limit?: number;
  filters?: Partial<FeedFilters>;
  buyBoxId?: string;
  isAdmin?: boolean; // If true, show all deals regardless of approval status
}
