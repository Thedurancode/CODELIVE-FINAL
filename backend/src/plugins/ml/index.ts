/**
 * ML Plugin Module (DISABLED)
 *
 * TensorFlow is disabled for production deployment.
 * All ML functions return mock/default values.
 */

// Types - keep for compatibility
export * from './types';

// Stub implementations
const ML_DISABLED_MESSAGE = 'ML features are temporarily disabled';

class DisabledMLService {
  private initialized = false;

  async initialize(): Promise<void> {
    console.log('⚠️ ML Service disabled - TensorFlow not available');
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized;
  }

  async predict(_input: any): Promise<{ score: number; confidence: number }> {
    return { score: 0.5, confidence: 0 };
  }

  async train(_data: any): Promise<void> {
    console.log(ML_DISABLED_MESSAGE);
  }

  async getModelInfo(): Promise<any> {
    return { status: 'disabled', message: ML_DISABLED_MESSAGE };
  }
}

class DisabledFeatureExtractor {
  extract(_deal: any): any {
    return {};
  }
}

class DisabledModelManager {
  async loadModel(): Promise<void> {}
  async saveModel(): Promise<void> {}
  getActiveModel(): null { return null; }
}

class DisabledScoreBlender {
  blend(_scores: any[]): number {
    return 0.5;
  }
}

class DisabledTrainingService {
  async startTraining(): Promise<void> {
    console.log(ML_DISABLED_MESSAGE);
  }
  async getTrainingStatus(): Promise<any> {
    return { status: 'disabled' };
  }
}

class DisabledRetrainingScheduler {
  start(): void {}
  stop(): void {}
}

class DisabledMLScoringPlugin {
  async score(_deal: any): Promise<number> {
    return 0.5;
  }
}

// Export stub instances
export const featureExtractor = new DisabledFeatureExtractor();
export const FeatureExtractor = DisabledFeatureExtractor;
export const modelManager = new DisabledModelManager();
export const ModelManager = DisabledModelManager;
export const scoreBlender = new DisabledScoreBlender();
export const ScoreBlender = DisabledScoreBlender;
export const trainingService = new DisabledTrainingService();
export const TrainingService = DisabledTrainingService;
export const retrainingScheduler = new DisabledRetrainingScheduler();
export const RetrainingScheduler = DisabledRetrainingScheduler;
export const mlScoringPlugin = new DisabledMLScoringPlugin();
export const MLScoringPlugin = DisabledMLScoringPlugin;
export const mlService = new DisabledMLService();
export const MLService = DisabledMLService;

// Stub for DealQualityModel
export class DealQualityModel {
  async predict(_input: any): Promise<number> { return 0.5; }
  async train(_data: any): Promise<void> {}
}

export interface IScoringPlugin {
  score(deal: any): Promise<number>;
}

// Default export
export default mlService;
