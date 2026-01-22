/**
 * Image Embedding Service
 *
 * Generates embeddings for property photos to enable visual similarity matching.
 * Uses OpenAI's vision model to describe images, then embeds the descriptions.
 *
 * Architecture:
 * 1. Fetch property photos
 * 2. Analyze with GPT-4 Vision to extract visual features
 * 3. Generate text embeddings from the visual description
 * 4. Store embeddings for ML feature extraction
 */

import OpenAI from 'openai';
import { redisService } from './RedisService';

// Embedding dimensions (must match text-embedding-3-small)
const EMBEDDING_DIMENSIONS = 1536;

// Cache TTL for image embeddings (7 days)
const EMBEDDING_CACHE_TTL = 7 * 24 * 60 * 60;

// Max photos to analyze per property (for cost control)
const MAX_PHOTOS_PER_PROPERTY = 3;

export interface ImageAnalysis {
  overallCondition: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  features: string[];
  concerns: string[];
  description: string;
  qualityScore: number; // 0-100
}

export interface PropertyImageEmbedding {
  propertyId: string;
  embedding: number[];
  analysis: ImageAnalysis;
  photoCount: number;
  analyzedAt: Date;
}

class ImageEmbeddingService {
  private openai: OpenAI | null = null;
  private isInitialized: boolean = false;
  private embeddingModel: string = 'text-embedding-3-small';
  private visionModel: string = 'gpt-4o-mini'; // Cost-effective vision model

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('[ImageEmbedding] No OPENAI_API_KEY - image embeddings disabled');
      return;
    }

    try {
      this.openai = new OpenAI({ apiKey });
      this.isInitialized = true;
      console.log('[ImageEmbedding] Service initialized');
    } catch (error) {
      console.error('[ImageEmbedding] Initialization failed:', error);
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.openai !== null;
  }

  /**
   * Generate embedding for a property's photos
   */
  async generatePropertyEmbedding(
    propertyId: string,
    photoUrls: string[]
  ): Promise<PropertyImageEmbedding | null> {
    if (!this.isReady() || photoUrls.length === 0) {
      return null;
    }

    // Check cache first
    const cacheKey = `img_embed:${propertyId}`;
    const cached = await redisService.get<PropertyImageEmbedding>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Limit photos for cost control
      const photosToAnalyze = photoUrls.slice(0, MAX_PHOTOS_PER_PROPERTY);

      // Analyze photos with vision model
      const analysis = await this.analyzePhotos(photosToAnalyze);

      // Generate embedding from the visual description
      const embedding = await this.generateEmbedding(
        this.analysisToEmbeddingText(analysis)
      );

      const result: PropertyImageEmbedding = {
        propertyId,
        embedding,
        analysis,
        photoCount: photoUrls.length,
        analyzedAt: new Date(),
      };

      // Cache the result
      await redisService.set(cacheKey, JSON.stringify(result), EMBEDDING_CACHE_TTL);

      return result;
    } catch (error) {
      console.error('[ImageEmbedding] Failed to generate embedding:', error);
      return null;
    }
  }

  /**
   * Analyze property photos using GPT-4 Vision
   */
  private async analyzePhotos(photoUrls: string[]): Promise<ImageAnalysis> {
    if (!this.openai) {
      return this.getDefaultAnalysis();
    }

    try {
      const imageContent = photoUrls.map((url) => ({
        type: 'image_url' as const,
        image_url: { url, detail: 'low' as const }, // Low detail for cost savings
      }));

      const response = await this.openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          {
            role: 'system',
            content: `You are a real estate photo analyst. Analyze property photos and extract:
1. Overall condition (excellent/good/fair/poor)
2. Positive features (modern kitchen, hardwood floors, natural light, etc.)
3. Concerns (dated fixtures, visible damage, clutter, etc.)
4. Brief description for embedding

Respond in JSON format:
{
  "overallCondition": "good",
  "features": ["modern kitchen", "hardwood floors"],
  "concerns": ["dated bathroom"],
  "description": "Well-maintained 3-bedroom with modern kitchen and hardwood floors throughout. Bathroom needs updating.",
  "qualityScore": 75
}`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze these property photos:' },
              ...imageContent,
            ],
          },
        ],
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.getDefaultAnalysis();
      }

      const parsed = JSON.parse(content);
      return {
        overallCondition: parsed.overallCondition || 'unknown',
        features: parsed.features || [],
        concerns: parsed.concerns || [],
        description: parsed.description || '',
        qualityScore: parsed.qualityScore || 50,
      };
    } catch (error) {
      console.error('[ImageEmbedding] Photo analysis failed:', error);
      return this.getDefaultAnalysis();
    }
  }

  /**
   * Convert analysis to text for embedding
   */
  private analysisToEmbeddingText(analysis: ImageAnalysis): string {
    const parts = [
      `Property condition: ${analysis.overallCondition}`,
      `Quality score: ${analysis.qualityScore}/100`,
    ];

    if (analysis.features.length > 0) {
      parts.push(`Features: ${analysis.features.join(', ')}`);
    }

    if (analysis.concerns.length > 0) {
      parts.push(`Concerns: ${analysis.concerns.join(', ')}`);
    }

    if (analysis.description) {
      parts.push(`Description: ${analysis.description}`);
    }

    return parts.join('. ');
  }

  /**
   * Generate text embedding using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      return new Array(EMBEDDING_DIMENSIONS).fill(0);
    }

    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    return response.data[0].embedding;
  }

  /**
   * Get default analysis when processing fails
   */
  private getDefaultAnalysis(): ImageAnalysis {
    return {
      overallCondition: 'unknown',
      features: [],
      concerns: [],
      description: '',
      qualityScore: 50,
    };
  }

  /**
   * Calculate similarity between two embeddings (cosine similarity)
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Get user's visual preference embedding from their liked properties
   */
  async getUserVisualPreference(
    likedPropertyEmbeddings: PropertyImageEmbedding[]
  ): Promise<number[] | null> {
    if (likedPropertyEmbeddings.length === 0) return null;

    // Average all liked property embeddings
    const avgEmbedding = new Array(EMBEDDING_DIMENSIONS).fill(0);

    for (const prop of likedPropertyEmbeddings) {
      for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
        avgEmbedding[i] += prop.embedding[i] / likedPropertyEmbeddings.length;
      }
    }

    return avgEmbedding;
  }

  /**
   * Score a property's visual match to user preferences
   */
  async scoreVisualMatch(
    propertyEmbedding: PropertyImageEmbedding,
    userPreferenceEmbedding: number[]
  ): Promise<{
    score: number;
    conditionScore: number;
    similarityScore: number;
  }> {
    // Cosine similarity (0-1)
    const similarity = this.calculateSimilarity(
      propertyEmbedding.embedding,
      userPreferenceEmbedding
    );

    // Condition score (0-1)
    const conditionScore = propertyEmbedding.analysis.qualityScore / 100;

    // Blend: 60% similarity, 40% condition
    const score = similarity * 0.6 + conditionScore * 0.4;

    return {
      score,
      conditionScore,
      similarityScore: similarity,
    };
  }

  /**
   * Batch process multiple properties
   */
  async batchGenerateEmbeddings(
    properties: Array<{ propertyId: string; photoUrls: string[] }>
  ): Promise<Map<string, PropertyImageEmbedding>> {
    const results = new Map<string, PropertyImageEmbedding>();

    // Process in parallel with concurrency limit
    const CONCURRENCY = 3;
    for (let i = 0; i < properties.length; i += CONCURRENCY) {
      const batch = properties.slice(i, i + CONCURRENCY);
      const embeddings = await Promise.all(
        batch.map((p) => this.generatePropertyEmbedding(p.propertyId, p.photoUrls))
      );

      embeddings.forEach((emb, idx) => {
        if (emb) {
          results.set(batch[idx].propertyId, emb);
        }
      });
    }

    return results;
  }

  /**
   * Get embedding dimensions for ML integration
   */
  getEmbeddingDimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }

  /**
   * Extract reduced features for ML (PCA-style dimensionality reduction)
   * Returns 16 key visual features for the ML model
   */
  extractMLFeatures(embedding: PropertyImageEmbedding): number[] {
    const { analysis, embedding: emb } = embedding;

    // Extract 16 interpretable features for ML
    return [
      // Condition score (normalized 0-1)
      analysis.qualityScore / 100,

      // Condition encoding (one-hot style)
      analysis.overallCondition === 'excellent' ? 1 : 0,
      analysis.overallCondition === 'good' ? 1 : 0,
      analysis.overallCondition === 'fair' ? 1 : 0,
      analysis.overallCondition === 'poor' ? 1 : 0,

      // Feature counts (normalized)
      Math.min(analysis.features.length / 10, 1),
      Math.min(analysis.concerns.length / 5, 1),

      // Feature presence (common positives)
      analysis.features.some((f) => f.toLowerCase().includes('kitchen')) ? 1 : 0,
      analysis.features.some((f) => f.toLowerCase().includes('hardwood')) ? 1 : 0,
      analysis.features.some((f) => f.toLowerCase().includes('updated')) ? 1 : 0,
      analysis.features.some((f) => f.toLowerCase().includes('natural light')) ? 1 : 0,

      // Concern presence (common negatives)
      analysis.concerns.some((c) => c.toLowerCase().includes('dated')) ? 1 : 0,
      analysis.concerns.some((c) => c.toLowerCase().includes('damage')) ? 1 : 0,
      analysis.concerns.some((c) => c.toLowerCase().includes('repair')) ? 1 : 0,

      // First 2 principal components of embedding (approximated)
      emb.slice(0, 100).reduce((a, b) => a + b, 0) / 100,
      emb.slice(100, 200).reduce((a, b) => a + b, 0) / 100,
    ];
  }
}

// Singleton instance
export const imageEmbeddingService = new ImageEmbeddingService();
export default imageEmbeddingService;
