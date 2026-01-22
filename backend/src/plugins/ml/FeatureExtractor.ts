/**
 * Feature Extractor
 *
 * Extracts and normalizes features from deals for ML model input.
 * Handles:
 * - Numeric feature extraction and normalization
 * - Categorical feature one-hot encoding
 * - Derived feature calculation
 * - Buy box match features
 * - Image embedding features (visual analysis)
 */

import { NormalizedDeal, BuyBox } from '../types';
import {
  FeatureVector,
  FeatureExtractionConfig,
  NormalizationParams,
  US_STATES,
  PROPERTY_TYPES,
  OCCUPANCY_TYPES,
  DEFAULT_FEATURE_CONFIG,
} from './types';
import { imageEmbeddingService, PropertyImageEmbedding } from '../../services/ImageEmbeddingService';

// Number of image features extracted
const IMAGE_FEATURE_COUNT = 16;

export class FeatureExtractor {
  private config: FeatureExtractionConfig;
  private normalizationParams: Map<string, NormalizationParams> = new Map();
  private isFitted: boolean = false;

  constructor(config: Partial<FeatureExtractionConfig> = {}) {
    this.config = { ...DEFAULT_FEATURE_CONFIG, ...config };
  }

  /**
   * Extract all features from a deal
   */
  extractFeatures(deal: NormalizedDeal, buyBox?: BuyBox): FeatureVector {
    const numeric = this.extractNumericFeatures(deal);
    const derived = this.extractDerivedFeatures(deal);
    const categorical = this.extractCategoricalFeatures(deal);
    const buyBoxMatch = buyBox ? this.extractBuyBoxMatchFeatures(deal, buyBox) : this.getEmptyBuyBoxFeatures();
    const imageFeatures = this.extractImageFeaturesSync(deal);

    // Combine all features
    const combined = [...numeric, ...derived, ...categorical, ...buyBoxMatch, ...imageFeatures];

    // Apply normalization if fitted
    const normalized = this.isFitted ? this.normalize(combined) : combined;

    return {
      numeric: [...numeric, ...derived],
      categorical,
      buyBoxMatch,
      imageFeatures,
      raw: normalized,
    };
  }

  /**
   * Extract all features including async image embedding
   */
  async extractFeaturesAsync(deal: NormalizedDeal, buyBox?: BuyBox): Promise<FeatureVector> {
    const numeric = this.extractNumericFeatures(deal);
    const derived = this.extractDerivedFeatures(deal);
    const categorical = this.extractCategoricalFeatures(deal);
    const buyBoxMatch = buyBox ? this.extractBuyBoxMatchFeatures(deal, buyBox) : this.getEmptyBuyBoxFeatures();
    const imageFeatures = await this.extractImageFeaturesAsync(deal);

    // Combine all features
    const combined = [...numeric, ...derived, ...categorical, ...buyBoxMatch, ...imageFeatures];

    // Apply normalization if fitted
    const normalized = this.isFitted ? this.normalize(combined) : combined;

    return {
      numeric: [...numeric, ...derived],
      categorical,
      buyBoxMatch,
      imageFeatures,
      raw: normalized,
    };
  }

  /**
   * Extract basic numeric features
   */
  private extractNumericFeatures(deal: NormalizedDeal): number[] {
    return [
      deal.askingPrice || 0,
      deal.arv || 0,
      deal.sqft || 0,
      deal.yearBuilt || 1970,
      deal.bedrooms || 0,
      deal.bathrooms || 0,
      deal.photos?.length || 0,
      deal.repairEstimate || 0,
      deal.monthlyRent || 0,
    ];
  }

  /**
   * Extract derived/calculated features
   */
  private extractDerivedFeatures(deal: NormalizedDeal): number[] {
    const price = deal.askingPrice || 1;
    const arv = deal.arv || price * 1.3;
    const sqft = deal.sqft || 1;
    const yearBuilt = deal.yearBuilt || 1970;
    const currentYear = new Date().getFullYear();
    const monthlyRent = deal.monthlyRent || 0;
    const repairEstimate = deal.repairEstimate || 0;

    return [
      // Price per sqft
      sqft > 0 ? price / sqft : 0,

      // ARV to price ratio
      price > 0 ? arv / price : 1,

      // Equity percentage
      arv > 0 ? ((arv - price) / arv) * 100 : 0,

      // Property age
      currentYear - yearBuilt,

      // Repair to price ratio
      price > 0 ? repairEstimate / price : 0,

      // Rent to price ratio (annual)
      price > 0 && monthlyRent > 0 ? (monthlyRent * 12) / price : 0,
    ];
  }

  /**
   * Extract one-hot encoded categorical features
   */
  private extractCategoricalFeatures(deal: NormalizedDeal): number[] {
    const stateOneHot = this.oneHotEncode(
      deal.address?.state?.toUpperCase() || '',
      US_STATES
    );

    const typeOneHot = this.oneHotEncode(
      this.normalizePropertyType(deal.propertyType || ''),
      PROPERTY_TYPES
    );

    const occupancyOneHot = this.oneHotEncode(
      deal.occupancyStatus || 'unknown',
      OCCUPANCY_TYPES
    );

    return [...stateOneHot, ...typeOneHot, ...occupancyOneHot];
  }

  /**
   * Extract features indicating how well deal matches buy box criteria
   */
  private extractBuyBoxMatchFeatures(deal: NormalizedDeal, buyBox: BuyBox): number[] {
    const criteria = buyBox.criteria;

    return [
      // State match
      this.matchesStringArray(deal.address?.state, criteria.states) ? 1 : 0,

      // Price in range
      this.inRange(deal.askingPrice, criteria.minPrice, criteria.maxPrice) ? 1 : 0,

      // Bedrooms in range
      this.inRange(deal.bedrooms, criteria.minBedrooms, criteria.maxBedrooms) ? 1 : 0,

      // Year built in range
      this.inRange(deal.yearBuilt, criteria.minYearBuilt, criteria.maxYearBuilt) ? 1 : 0,

      // Property type match
      this.matchesStringArray(deal.propertyType, criteria.propertyTypes) ? 1 : 0,
    ];
  }

  /**
   * Get empty buy box features when no buy box is provided
   */
  private getEmptyBuyBoxFeatures(): number[] {
    return [0.5, 0.5, 0.5, 0.5, 0.5]; // Neutral values
  }

  // ===========================================================================
  // IMAGE FEATURES
  // ===========================================================================

  /**
   * Extract image features synchronously (uses cached/stored embeddings)
   */
  private extractImageFeaturesSync(deal: NormalizedDeal): number[] {
    // Check if deal has pre-computed image analysis
    const imageAnalysis = (deal as any).imageAnalysis;

    if (imageAnalysis) {
      return this.extractImageFeaturesFromAnalysis(imageAnalysis);
    }

    // Return neutral features if no image data available
    return this.getEmptyImageFeatures();
  }

  /**
   * Extract image features asynchronously (generates embeddings if needed)
   */
  private async extractImageFeaturesAsync(deal: NormalizedDeal): Promise<number[]> {
    // Check if deal has pre-computed image analysis
    const imageAnalysis = (deal as any).imageAnalysis;

    if (imageAnalysis) {
      return this.extractImageFeaturesFromAnalysis(imageAnalysis);
    }

    // Try to generate embeddings from photos
    const photos = deal.photos || [];
    if (photos.length > 0 && imageEmbeddingService.isReady()) {
      try {
        const embedding = await imageEmbeddingService.generatePropertyEmbedding(
          deal.externalId || 'unknown',
          photos
        );

        if (embedding) {
          return imageEmbeddingService.extractMLFeatures(embedding);
        }
      } catch (error) {
        console.warn('[FeatureExtractor] Image embedding failed:', error);
      }
    }

    // Return neutral features if no image data available
    return this.getEmptyImageFeatures();
  }

  /**
   * Extract features from stored image analysis
   */
  private extractImageFeaturesFromAnalysis(analysis: any): number[] {
    const conditionMap: Record<string, number> = {
      excellent: 1.0,
      good: 0.75,
      fair: 0.5,
      poor: 0.25,
      unknown: 0.5,
    };

    const features = analysis.features || [];
    const concerns = analysis.concerns || [];

    return [
      // Condition score (normalized 0-1)
      (analysis.qualityScore || 50) / 100,

      // Condition encoding (one-hot style)
      analysis.overallCondition === 'excellent' ? 1 : 0,
      analysis.overallCondition === 'good' ? 1 : 0,
      analysis.overallCondition === 'fair' ? 1 : 0,
      analysis.overallCondition === 'poor' ? 1 : 0,

      // Feature counts (normalized)
      Math.min(features.length / 10, 1),
      Math.min(concerns.length / 5, 1),

      // Feature presence (common positives)
      features.some((f: string) => f.toLowerCase().includes('kitchen')) ? 1 : 0,
      features.some((f: string) => f.toLowerCase().includes('hardwood')) ? 1 : 0,
      features.some((f: string) => f.toLowerCase().includes('updated')) ? 1 : 0,
      features.some((f: string) => f.toLowerCase().includes('natural light')) ? 1 : 0,

      // Concern presence (common negatives)
      concerns.some((c: string) => c.toLowerCase().includes('dated')) ? 1 : 0,
      concerns.some((c: string) => c.toLowerCase().includes('damage')) ? 1 : 0,
      concerns.some((c: string) => c.toLowerCase().includes('repair')) ? 1 : 0,

      // Placeholder for embedding principal components
      conditionMap[analysis.overallCondition] || 0.5,
      features.length > concerns.length ? 0.7 : 0.3,
    ];
  }

  /**
   * Get empty/neutral image features
   */
  private getEmptyImageFeatures(): number[] {
    return new Array(IMAGE_FEATURE_COUNT).fill(0.5);
  }

  /**
   * One-hot encode a value
   */
  private oneHotEncode(value: string, categories: string[]): number[] {
    const encoded = new Array(categories.length).fill(0);
    const index = categories.findIndex(c =>
      c.toLowerCase() === value.toLowerCase()
    );
    if (index >= 0) {
      encoded[index] = 1;
    }
    return encoded;
  }

  /**
   * Normalize property type to standard categories
   */
  private normalizePropertyType(type: string): string {
    const lower = type.toLowerCase();

    if (lower.includes('single') || lower.includes('sfh') || lower.includes('house')) {
      return 'single_family';
    }
    if (lower.includes('condo')) return 'condo';
    if (lower.includes('town')) return 'townhouse';
    if (lower.includes('multi') || lower.includes('apartment')) return 'multi_family';
    if (lower.includes('duplex') || lower === '2') return 'duplex';
    if (lower.includes('triplex') || lower === '3') return 'triplex';
    if (lower.includes('quad') || lower === '4') return 'quadplex';
    if (lower.includes('manufactured') || lower.includes('mobile')) return 'manufactured';
    if (lower.includes('land') || lower.includes('lot')) return 'land';

    return 'other';
  }

  /**
   * Check if value matches any in array (case-insensitive)
   */
  private matchesStringArray(value: string | undefined, array: string[] | undefined): boolean {
    if (!value || !array || array.length === 0) return false;
    return array.some(item => item.toLowerCase() === value.toLowerCase());
  }

  /**
   * Check if value is in range
   */
  private inRange(value: number | undefined, min?: number, max?: number): boolean {
    if (value === undefined) return false;
    const minOk = min === undefined || value >= min;
    const maxOk = max === undefined || value <= max;
    return minOk && maxOk;
  }

  // ===========================================================================
  // NORMALIZATION
  // ===========================================================================

  /**
   * Fit normalization parameters on training data
   */
  fitNormalization(data: number[][]): void {
    if (data.length === 0) return;

    const numFeatures = data[0].length;

    for (let i = 0; i < numFeatures; i++) {
      const values = data.map(row => row[i]).filter(v => !isNaN(v) && isFinite(v));

      if (values.length === 0) {
        this.normalizationParams.set(`feature_${i}`, { mean: 0, std: 1 });
        continue;
      }

      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance) || 1; // Avoid division by zero

      const min = Math.min(...values);
      const max = Math.max(...values);

      this.normalizationParams.set(`feature_${i}`, { mean, std, min, max });
    }

    this.isFitted = true;
  }

  /**
   * Apply z-score normalization
   */
  normalize(features: number[]): number[] {
    if (!this.isFitted) return features;

    return features.map((value, i) => {
      const params = this.normalizationParams.get(`feature_${i}`);
      if (!params) return value;

      // Z-score normalization
      const normalized = (value - params.mean) / params.std;

      // Clip to reasonable range (-5 to 5)
      return Math.max(-5, Math.min(5, normalized));
    });
  }

  /**
   * Get normalization parameters for model saving
   */
  getNormalizationParams(): Record<string, NormalizationParams> {
    const params: Record<string, NormalizationParams> = {};
    this.normalizationParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  /**
   * Load normalization parameters from saved model
   */
  loadNormalizationParams(params: Record<string, NormalizationParams>): void {
    this.normalizationParams.clear();
    for (const [key, value] of Object.entries(params)) {
      this.normalizationParams.set(key, value);
    }
    this.isFitted = true;
  }

  /**
   * Get feature dimension
   */
  getInputDimension(): number {
    return this.config.totalDimension;
  }

  /**
   * Get feature configuration
   */
  getConfig(): FeatureExtractionConfig {
    return this.config;
  }

  /**
   * Check if extractor is fitted
   */
  isReady(): boolean {
    return this.isFitted;
  }
}

// Singleton instance
export const featureExtractor = new FeatureExtractor();
export default featureExtractor;
