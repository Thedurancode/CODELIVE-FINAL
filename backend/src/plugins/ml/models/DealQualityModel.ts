/**
 * Deal Quality Model (DISABLED)
 *
 * TensorFlow is disabled for production deployment.
 * Returns default/safe values for all predictions.
 */

import { ModelMetrics, TrainingOptions } from '../types';

export interface ModelConfig {
  inputDim: number;
  hiddenLayers: number[];
  dropoutRates: number[];
  l2Regularization: number;
  learningRate: number;
}

const DEFAULT_CONFIG: ModelConfig = {
  inputDim: 85,
  hiddenLayers: [64, 32, 16],
  dropoutRates: [0.3, 0.2, 0],
  l2Regularization: 0.01,
  learningRate: 0.001,
};

export class DealQualityModel {
  private config: ModelConfig;

  constructor(config: Partial<ModelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log('⚠️ DealQualityModel disabled - TensorFlow not available');
  }

  async buildModel(_inputDim?: number): Promise<any> {
    return null;
  }

  async compile(): Promise<void> {
    // No-op
  }

  async train(
    _trainFeatures: number[][],
    _trainLabels: number[],
    _validationFeatures?: number[][],
    _validationLabels?: number[],
    _options: TrainingOptions = {}
  ): Promise<any> {
    console.log('⚠️ ML training disabled - TensorFlow not available');
    return { history: { loss: [], accuracy: [] } };
  }

  async predict(_features: number[]): Promise<{ score: number; confidence: number }> {
    // Return neutral prediction
    return { score: 0.5, confidence: 0 };
  }

  async predictBatch(features: number[][]): Promise<Array<{ score: number; confidence: number }>> {
    // Return neutral predictions for all
    return features.map(() => ({ score: 0.5, confidence: 0 }));
  }

  async evaluate(
    _testFeatures: number[][],
    _testLabels: number[]
  ): Promise<ModelMetrics> {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      auc: 0,
    };
  }

  async save(_path: string): Promise<void> {
    console.log('⚠️ ML save disabled - TensorFlow not available');
  }

  async load(_path: string): Promise<void> {
    console.log('⚠️ ML load disabled - TensorFlow not available');
  }

  getModel(): any {
    return null;
  }

  getConfig(): ModelConfig {
    return this.config;
  }

  isReady(): boolean {
    return false;
  }

  dispose(): void {
    // No-op
  }
}

export default DealQualityModel;
