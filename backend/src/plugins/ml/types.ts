/**
 * ML Plugin Type Definitions
 */

import { NormalizedDeal, BuyBox } from '../types';
import { FeatureConfig as DBFeatureConfig, ModelMetrics as DBModelMetrics } from '../../models/ModelVersion';

// ============================================================================
// FEATURE TYPES
// ============================================================================

export interface FeatureVector {
  numeric: number[];
  categorical: number[];
  buyBoxMatch: number[];
  imageFeatures?: number[];  // Visual analysis features (16 dimensions)
  raw: number[];  // Combined and normalized
}

// Feature extraction configuration (used internally)
export interface FeatureExtractionConfig {
  numericFeatures: string[];
  categoricalFeatures: string[];
  categoricalDimensions: Record<string, number>;
  totalDimension: number;
}

// Re-export database types for convenience
export type FeatureConfig = DBFeatureConfig;

export interface NormalizationParams {
  mean: number;
  std: number;
  min?: number;
  max?: number;
}

// ============================================================================
// TRAINING TYPES
// ============================================================================

export interface TrainingDataPoint {
  dealSnapshot: Partial<NormalizedDeal>;
  buyBoxSnapshot?: Partial<BuyBox>;
  outcome: 'positive' | 'negative';
  feedbackType: 'fund_feedback' | 'deal_action' | 'deal_offer';
  timestamp: Date;
}

export interface TrainingOptions {
  epochs?: number;
  batchSize?: number;
  learningRate?: number;
  validationSplit?: number;
  earlyStopping?: boolean;
  patience?: number;
  since?: Date;
}

export interface TrainingResult {
  success: boolean;
  modelVersion?: string;
  metrics?: ModelMetrics;
  trainingDataCount?: number;
  reason?: string;
  error?: string;
}

// Re-export ModelMetrics from database model for consistency
export type ModelMetrics = DBModelMetrics;

export interface DataSplit {
  features: number[][];
  labels: number[];
}

// ============================================================================
// PREDICTION TYPES
// ============================================================================

export interface MLPredictionResult {
  score: number;       // 0-1 probability
  confidence: number;  // 0-1 how certain the model is
  modelVersion: string;
}

export interface BlendConfig {
  baseMLWeight: number;           // Default ML weight (e.g., 0.3)
  highConfidenceThreshold: number; // Threshold for full ML weight (e.g., 0.8)
  minConfidenceThreshold: number;  // Minimum confidence to use ML (e.g., 0.6)
  trainingDataCount: number;       // Current training data count
  minDataForFullWeight: number;    // Data count for full ML weight (e.g., 500)
}

export interface BlendBreakdown {
  ruleBasedScore: number;
  ruleWeight: number;
  mlScore: number;
  mlWeight: number;
  mlConfidence: number;
  adjustmentReason: string;
}

export interface BlendResult {
  finalScore: number;
  breakdown: BlendBreakdown;
}

// ============================================================================
// MODEL MANAGEMENT TYPES
// ============================================================================

export interface LoadedModel {
  model: any;  // TensorFlow model
  version: string;
  featureConfig: FeatureConfig;
  normalizationParams: Map<string, NormalizationParams>;
}

export interface ModelInfo {
  version: string;
  modelType: string;
  status: string;
  isProduction: boolean;
  trainingDataCount: number;
  metrics?: ModelMetrics;
  createdAt: Date;
}

// ============================================================================
// RETRAINING TYPES
// ============================================================================

export interface RetrainingCheck {
  should: boolean;
  reason: string;
  newOutcomesCount?: number;
  modelAge?: number;
  performanceDrop?: number;
}

export interface RetrainingConfig {
  minNewOutcomes: number;          // Retrain after N new outcomes
  maxAgeDays: number;              // Retrain if model older than N days
  performanceDropThreshold: number; // Retrain if accuracy drops by this %
  scheduledTime: string;           // Cron time for scheduled checks
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

export const PROPERTY_TYPES = [
  'single_family',
  'condo',
  'townhouse',
  'multi_family',
  'duplex',
  'triplex',
  'quadplex',
  'manufactured',
  'land',
  'other'
];

export const OCCUPANCY_TYPES = [
  'vacant',
  'occupied',
  'tenant',
  'owner',
  'unknown'
];

export const DEFAULT_FEATURE_CONFIG: FeatureExtractionConfig = {
  numericFeatures: [
    'price', 'arv', 'sqft', 'yearBuilt', 'bedrooms', 'bathrooms',
    'photoCount', 'repairEstimate', 'monthlyRent',
    'pricePerSqft', 'arvToPrice', 'equityPercent', 'propertyAge', 'repairRatio', 'rentRatio'
  ],
  categoricalFeatures: ['state', 'propertyType', 'occupancyStatus'],
  categoricalDimensions: {
    state: 50,
    propertyType: 10,
    occupancyStatus: 5
  },
  // Total: numeric(15) + state(50) + type(10) + occupancy(5) + buyBoxMatch(5) + imageFeatures(16)
  totalDimension: 15 + 50 + 10 + 5 + 5 + 16
};

export const DEFAULT_BLEND_CONFIG: BlendConfig = {
  baseMLWeight: 0.3,
  highConfidenceThreshold: 0.8,
  minConfidenceThreshold: 0.6,
  trainingDataCount: 0,
  minDataForFullWeight: 500
};

export const DEFAULT_RETRAINING_CONFIG: RetrainingConfig = {
  minNewOutcomes: 50,
  maxAgeDays: 30,
  performanceDropThreshold: 0.1,
  scheduledTime: '03:00'
};

export const MIN_TRAINING_SAMPLES = 100;
export const MODEL_AUC_THRESHOLD = 0.65;
