/**
 * Model Manager
 *
 * Manages ML model lifecycle:
 * - Loading and unloading models
 * - Model version tracking
 * - Production model selection
 * - Model persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { DealQualityModel } from './models/DealQualityModel';
import { FeatureExtractor } from './FeatureExtractor';
import ModelVersion, { FeatureConfig, ModelMetrics } from '../../models/ModelVersion';
import { MLModelType } from '../../models/MLPrediction';
import { LoadedModel, ModelInfo, NormalizationParams } from './types';

export class ModelManager {
  private modelsDir: string;
  private loadedModels: Map<string, LoadedModel> = new Map();

  constructor(modelsDir?: string) {
    // Use /tmp in production for containerized environments
    this.modelsDir = modelsDir || path.join('/tmp', 'ml_models');
    this.ensureModelsDir();
  }

  /**
   * Ensure models directory exists
   */
  private ensureModelsDir(): void {
    try {
      if (!fs.existsSync(this.modelsDir)) {
        fs.mkdirSync(this.modelsDir, { recursive: true });
      }
    } catch (err) {
      console.warn('⚠️ Could not create ML models directory:', (err as Error).message);
    }
  }

  /**
   * Load the active production model for a given type
   */
  async loadActiveModel(modelType: MLModelType): Promise<boolean> {
    try {
      const activeVersion = await ModelVersion.findOne({
        where: { modelType, isProduction: true, status: 'active' },
      });

      if (!activeVersion) {
        console.log(`[ML] No active ${modelType} model found`);
        return false;
      }

      return this.loadModel(modelType, activeVersion.version);
    } catch (error) {
      console.error(`[ML] Failed to load active ${modelType} model:`, error);
      return false;
    }
  }

  /**
   * Load a specific model version
   */
  async loadModel(modelType: MLModelType, version: string): Promise<boolean> {
    try {
      const modelVersion = await ModelVersion.findOne({
        where: { modelType, version },
      });

      if (!modelVersion) {
        console.error(`[ML] Model version not found: ${modelType}/${version}`);
        return false;
      }

      // Create and load the model
      const model = new DealQualityModel({
        inputDim: modelVersion.featureConfig.inputDim,
      });

      await model.load(modelVersion.modelPath);

      // Create feature extractor with saved normalization params
      const featureExtractor = new FeatureExtractor();
      featureExtractor.loadNormalizationParams(
        modelVersion.featureConfig.normalizationParams as Record<string, NormalizationParams>
      );

      // Store loaded model
      this.loadedModels.set(modelType, {
        model: model,
        version: version,
        featureConfig: modelVersion.featureConfig,
        normalizationParams: new Map(
          Object.entries(modelVersion.featureConfig.normalizationParams)
        ),
      });

      console.log(`[ML] Loaded ${modelType} model version ${version}`);
      return true;
    } catch (error) {
      console.error(`[ML] Failed to load model ${modelType}/${version}:`, error);
      return false;
    }
  }

  /**
   * Save a trained model
   */
  async saveModel(
    model: DealQualityModel,
    modelType: MLModelType,
    metrics: ModelMetrics,
    featureConfig: FeatureConfig,
    trainingDataCount: number
  ): Promise<string> {
    const version = `v${Date.now()}`;
    const modelPath = path.join(this.modelsDir, modelType, version);

    // Create directory
    fs.mkdirSync(modelPath, { recursive: true });

    // Save TensorFlow model
    await model.save(modelPath);

    // Save feature config
    fs.writeFileSync(
      path.join(modelPath, 'feature_config.json'),
      JSON.stringify(featureConfig, null, 2)
    );

    // Create version record
    await ModelVersion.create({
      id: version,
      modelType,
      version,
      modelPath,
      weightsPath: path.join(modelPath, 'weights.bin'),
      metrics,
      featureConfig,
      status: 'active',
      isProduction: false,
      trainingDataCount,
      trainingStartedAt: new Date(),
      trainingCompletedAt: new Date(),
    });

    console.log(`[ML] Saved ${modelType} model version ${version}`);
    return version;
  }

  /**
   * Make a prediction using the loaded model
   */
  async predict(
    modelType: MLModelType,
    features: number[]
  ): Promise<{ score: number; confidence: number }> {
    const loaded = this.loadedModels.get(modelType);
    if (!loaded) {
      throw new Error(`Model ${modelType} not loaded`);
    }

    const model = loaded.model as DealQualityModel;
    return model.predict(features);
  }

  /**
   * Promote a model version to production
   */
  async promoteToProduction(modelType: MLModelType, version: string): Promise<void> {
    // Demote current production model
    await ModelVersion.update(
      { isProduction: false },
      { where: { modelType, isProduction: true } }
    );

    // Promote new model
    await ModelVersion.update(
      { isProduction: true },
      { where: { modelType, version } }
    );

    // Reload model
    await this.loadActiveModel(modelType);

    console.log(`[ML] Promoted ${modelType} model ${version} to production`);
  }

  /**
   * Deprecate a model version
   */
  async deprecateModel(modelType: MLModelType, version: string): Promise<void> {
    await ModelVersion.update(
      { status: 'deprecated', isProduction: false },
      { where: { modelType, version } }
    );

    // Unload if currently loaded
    const loaded = this.loadedModels.get(modelType);
    if (loaded?.version === version) {
      this.unloadModel(modelType);
    }
  }

  /**
   * Unload a model from memory
   */
  unloadModel(modelType: MLModelType): void {
    const loaded = this.loadedModels.get(modelType);
    if (loaded) {
      const model = loaded.model as DealQualityModel;
      model.dispose();
      this.loadedModels.delete(modelType);
      console.log(`[ML] Unloaded ${modelType} model`);
    }
  }

  /**
   * Check if a model is loaded
   */
  hasActiveModel(modelType: MLModelType): boolean {
    return this.loadedModels.has(modelType);
  }

  /**
   * Get the active version for a model type
   */
  getActiveVersion(modelType: MLModelType): string | null {
    return this.loadedModels.get(modelType)?.version || null;
  }

  /**
   * Get loaded model info
   */
  getLoadedModelInfo(modelType: MLModelType): LoadedModel | null {
    return this.loadedModels.get(modelType) || null;
  }

  /**
   * Get info about the active model
   */
  async getActiveModelInfo(modelType: MLModelType): Promise<ModelInfo | null> {
    const version = await ModelVersion.findOne({
      where: { modelType, isProduction: true, status: 'active' },
    });

    if (!version) return null;

    return {
      version: version.version,
      modelType: version.modelType,
      status: version.status,
      isProduction: version.isProduction,
      trainingDataCount: version.trainingDataCount,
      metrics: version.metrics,
      createdAt: version.createdAt,
    };
  }

  /**
   * List all model versions for a type
   */
  async listModelVersions(modelType: MLModelType): Promise<ModelInfo[]> {
    const versions = await ModelVersion.findAll({
      where: { modelType },
      order: [['createdAt', 'DESC']],
    });

    return versions.map(v => ({
      version: v.version,
      modelType: v.modelType,
      status: v.status,
      isProduction: v.isProduction,
      trainingDataCount: v.trainingDataCount,
      metrics: v.metrics,
      createdAt: v.createdAt,
    }));
  }

  /**
   * Delete old deprecated models (cleanup)
   */
  async cleanupOldModels(
    modelType: MLModelType,
    keepCount: number = 5
  ): Promise<number> {
    const deprecated = await ModelVersion.findAll({
      where: { modelType, status: 'deprecated' },
      order: [['createdAt', 'DESC']],
      offset: keepCount,
    });

    let deleted = 0;
    for (const version of deprecated) {
      try {
        // Delete files
        if (fs.existsSync(version.modelPath)) {
          fs.rmSync(version.modelPath, { recursive: true });
        }

        // Delete record
        await version.destroy();
        deleted++;
      } catch (error) {
        console.error(`[ML] Failed to delete model ${version.version}:`, error);
      }
    }

    if (deleted > 0) {
      console.log(`[ML] Cleaned up ${deleted} old ${modelType} models`);
    }

    return deleted;
  }

  /**
   * Get models directory
   */
  getModelsDir(): string {
    return this.modelsDir;
  }

  /**
   * Initialize - load all active production models
   */
  async initialize(): Promise<void> {
    console.log('[ML] Initializing ModelManager...');

    const modelTypes: MLModelType[] = ['deal_quality', 'fund_match', 'close_probability'];

    for (const type of modelTypes) {
      try {
        await this.loadActiveModel(type);
      } catch (error) {
        // Model might not exist yet
        console.log(`[ML] No ${type} model to load (may need training first)`);
      }
    }

    console.log('[ML] ModelManager initialized');
  }

  /**
   * Dispose all loaded models
   */
  dispose(): void {
    for (const [modelType] of this.loadedModels) {
      this.unloadModel(modelType as MLModelType);
    }
  }
}

// Singleton instance
export const modelManager = new ModelManager();
export default modelManager;
