/**
 * Marketplace Services Index
 *
 * Exports all marketplace-related services for use throughout the application.
 */

// Services (singleton instances)
export { feedService } from './FeedService';
export { swipeService } from './SwipeService';
export { behaviorAnalysisService } from './BehaviorAnalysisService';
export { matchService } from './MatchService';

// Types
export type { NormalizedDeal, MLScoreResult } from './FeedService';
export type { SwipeData, PassReasonAnalytics, DealAnalytics } from './SwipeService';
export type { PredictionFactor, AlmostLikedAnalysis, QuickDismissAnalysis } from './BehaviorAnalysisService';
export type { MatchCheckResult } from './MatchService';

// Constants
export * from './constants';
