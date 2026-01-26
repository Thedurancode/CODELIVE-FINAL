/**
 * Marketplace Constants
 *
 * Centralized configuration for all marketplace services.
 * Eliminates magic numbers and makes tuning easier.
 */

// =============================================================================
// FEED SCORING WEIGHTS
// =============================================================================

/** Maximum points for buy box matching (base score) */
export const MAX_BUYBOX_SCORE = 85;

/** Points for matching state (required) */
export const SCORE_STATE_MATCH = 30;

/** Points for price in range */
export const SCORE_PRICE_RANGE = 25;

/** Points for matching property type */
export const SCORE_PROPERTY_TYPE = 15;

/** Points for bedrooms in range */
export const SCORE_BEDROOMS = 10;

/** Points for equity threshold met */
export const SCORE_EQUITY = 10;

/** Points for HOA preference match */
export const SCORE_HOA = 10;

/** Maximum ML contribution to final score */
export const MAX_ML_SCORE = 15;

/** Weight applied to base score in blended calculation */
export const BASE_SCORE_WEIGHT = 0.85;

// =============================================================================
// ML THRESHOLDS
// =============================================================================

/** Minimum ML confidence to include in scoring */
export const ML_CONFIDENCE_THRESHOLD = 0.75;

/** Minimum ML confidence for primary prediction usage */
export const ML_PRIMARY_CONFIDENCE_THRESHOLD = 0.60;

/** ML confidence threshold for match trigger */
export const ML_MATCH_CONFIDENCE_THRESHOLD = 0.85;

// =============================================================================
// BEHAVIOR ANALYSIS THRESHOLDS
// =============================================================================

/** Minimum actions needed to build behavior profile */
export const MIN_ACTIONS_FOR_PROFILE = 5;

/** Minimum liked actions for view duration baseline */
export const MIN_LIKED_FOR_DURATION_BASELINE = 3;

/** Minimum view duration (ms) for meaningful baseline */
export const MIN_MEANINGFUL_DURATION_MS = 5000;

/** Ratio of avg liked duration that qualifies as "almost liked" */
export const ALMOST_LIKED_DURATION_RATIO = 0.7;

/** Maximum almost-liked deals to analyze */
export const MAX_ALMOST_LIKED_DEALS = 50;

/** Quick dismiss threshold in milliseconds */
export const QUICK_DISMISS_THRESHOLD_MS = 5000;

/** Maximum quick dismiss actions to analyze */
export const MAX_QUICK_DISMISS_ACTIONS = 100;

/** Minimum quick dismiss actions for pattern analysis */
export const MIN_QUICK_DISMISS_FOR_PATTERN = 5;

/** Quick dismiss frequency ratio to trigger penalty */
export const QUICK_DISMISS_FREQUENCY_RATIO = 0.4;

// =============================================================================
// PERSONALIZATION BOOSTS
// =============================================================================

/** Boost for price within 20% of avg liked price */
export const BOOST_PRICE_ALIGNMENT = 5;

/** Boost for previously liked state (>2 likes) */
export const BOOST_LIKED_STATE = 3;

/** Boost for previously liked property type (>2 likes) */
export const BOOST_LIKED_TYPE = 3;

/** Penalty for matching top pass reason pattern */
export const PENALTY_PASS_REASON_PATTERN = 5;

/** Boost for deliberate buyer high-equity deals */
export const BOOST_DELIBERATE_HIGH_EQUITY = 2;

/** Boost for deliberate buyer well-priced deals */
export const BOOST_DELIBERATE_GOOD_PRICE = 2;

/** Boost for decisive buyer state match */
export const BOOST_DECISIVE_STATE = 2;

/** Boost for decisive buyer type match */
export const BOOST_DECISIVE_TYPE = 2;

/** View duration ratio indicating decisive buyer */
export const DECISIVE_BUYER_DURATION_RATIO = 3;

/** View duration (seconds) indicating deliberate buyer */
export const DELIBERATE_BUYER_VIEW_SECONDS = 30;

// =============================================================================
// PREDICTION SCORING
// =============================================================================

/** Base prediction score (neutral) */
export const PREDICTION_BASE_SCORE = 50;

/** Points for price in preferred range (rule-based) */
export const PREDICTION_PRICE_IN_RANGE = 15;

/** Points for price higher than typical passes */
export const PREDICTION_PRICE_TOO_HIGH = 10;

/** Points for previously liked state */
export const PREDICTION_LIKED_STATE = 10;

/** Points for previously liked property type */
export const PREDICTION_LIKED_TYPE = 10;

/** Penalty for matching pass reason */
export const PREDICTION_PASS_REASON_PENALTY = 15;

/** Points for "almost liked" similar deal */
export const PREDICTION_ALMOST_LIKED_SIMILAR = 8;

/** Points if deal addresses "almost liked" price concern */
export const PREDICTION_ALMOST_LIKED_BETTER_PRICE = 7;

/** Points if deal is larger than "almost liked" too-small */
export const PREDICTION_ALMOST_LIKED_LARGER = 5;

/** Points if deal has more equity than "almost liked" low-equity */
export const PREDICTION_ALMOST_LIKED_MORE_EQUITY = 6;

/** Penalty for matching quick-dismiss state pattern */
export const PREDICTION_QUICK_DISMISS_STATE = 8;

/** Penalty for matching quick-dismiss type pattern */
export const PREDICTION_QUICK_DISMISS_TYPE = 6;

/** Penalty for price above quick-dismiss threshold */
export const PREDICTION_QUICK_DISMISS_PRICE = 5;

/** Reduction factor for rule-based scores when ML is active */
export const ML_ACTIVE_SCORE_REDUCTION = 0.53; // Roughly halves the points

// =============================================================================
// MATCH THRESHOLDS
// =============================================================================

/** Buy box score threshold for match trigger */
export const BUYBOX_MATCH_THRESHOLD = 95;

/** Priority buy box score threshold for match trigger */
export const PRIORITY_BUYBOX_MATCH_THRESHOLD = 80;

/** Minimum priority rating for priority buy box match */
export const PRIORITY_BUYBOX_MIN_RATING = 8;

// =============================================================================
// VIEW DURATION SCORING
// =============================================================================

/** Deep analysis threshold (seconds) - serious buyer */
export const VIEW_DEEP_ANALYSIS_SECONDS = 60;
export const VIEW_DEEP_ANALYSIS_SCORE = 15;

/** Thorough review threshold (seconds) */
export const VIEW_THOROUGH_SECONDS = 30;
export const VIEW_THOROUGH_SCORE = 10;

/** Good consideration threshold (seconds) */
export const VIEW_GOOD_SECONDS = 15;
export const VIEW_GOOD_SCORE = 5;

/** Normal engagement threshold (seconds) */
export const VIEW_NORMAL_SECONDS = 5;
export const VIEW_NORMAL_SCORE = 2;

/** Almost liked threshold for passes (seconds) */
export const VIEW_ALMOST_LIKED_SECONDS = 45;
export const VIEW_ALMOST_LIKED_SCORE = 8;

/** Some interest threshold for passes (seconds) */
export const VIEW_SOME_INTEREST_SECONDS = 20;
export const VIEW_SOME_INTEREST_SCORE = 3;

/** Quick dismiss penalty score */
export const VIEW_QUICK_DISMISS_PENALTY = -5;

// =============================================================================
// SESSION & ACTIVITY
// =============================================================================

/** Session gap threshold in milliseconds (30 minutes) */
export const SESSION_GAP_MS = 30 * 60 * 1000;

/** Deal considered "new" within this many hours */
export const NEW_DEAL_HOURS = 24;

// =============================================================================
// PRICE ANALYSIS
// =============================================================================

/** Price alignment tolerance (within X% of avg liked) */
export const PRICE_ALIGNMENT_TOLERANCE = 0.2;

/** Price preference range expansion factor */
export const PRICE_PREFERENCE_RANGE_FACTOR = 0.3;

/** Price prediction range factor */
export const PRICE_PREDICTION_RANGE_FACTOR = 0.2;

/** "Almost liked" better price threshold */
export const ALMOST_LIKED_BETTER_PRICE_RATIO = 0.9;

/** "Almost liked" larger size threshold */
export const ALMOST_LIKED_LARGER_RATIO = 1.1;

/** "Almost liked" more equity threshold */
export const ALMOST_LIKED_MORE_EQUITY_RATIO = 1.15;

/** Quick dismiss high price ratio */
export const QUICK_DISMISS_HIGH_PRICE_RATIO = 1.2;

/** Pass reason high price ratio */
export const PASS_REASON_HIGH_PRICE_RATIO = 1.3;

// =============================================================================
// PAGINATION & LIMITS
// =============================================================================

/** Default feed page size */
export const DEFAULT_FEED_LIMIT = 20;

/** Maximum deals to fetch for filtering */
export const MAX_DEALS_FETCH = 100;

/** Top pass reasons to return */
export const TOP_PASS_REASONS_COUNT = 5;

/** Top match reasons to return */
export const TOP_MATCH_REASONS_COUNT = 5;

/** Offer expiry days */
export const OFFER_EXPIRY_DAYS = 3;
