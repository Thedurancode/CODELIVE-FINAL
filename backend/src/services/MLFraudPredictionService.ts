/**
 * ML-Powered Fraud Prediction Service (DISABLED)
 *
 * TensorFlow is disabled for production deployment.
 * Returns default/safe values for all predictions.
 */

// Feature vector interface (kept for type compatibility)
export interface FraudFeatureVector {
  sellerSubmissionRate: number;
  phoneSubmissionRate: number;
  emailSubmissionRate: number;
  addressSubmissionRate: number;
  ipSubmissionRate: number;
  wholesalerSubmissionRate: number;
  priceToValueRatio: number;
  pricePerSqft: number;
  priceDeviation: number;
  hourOfDay: number;
  dayOfWeek: number;
  timeSinceLastSubmission: number;
  sellerIsWholesaler: number;
  hasHistoricalSignals: number;
  confirmedFraudConnection: number;
  entityMismatchScore: number;
  propertyAge: number;
  daysOnMarket: number;
  bedroomCount: number;
  bathroomCount: number;
}

export interface MLPrediction {
  predictionId: string;
  fraudProbability: number;
  riskScore: number;
  anomalyScore: number;
  confidence: number;
  modelVersion: string;
  features: Partial<FraudFeatureVector>;
  featureImportance: Array<{ feature: string; importance: number }>;
  timestamp: Date;
}

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc: number;
  lastTrainedAt: Date | null;
  sampleCount: number;
}

class MLFraudPredictionService {
  private initialized = false;
  private modelVersion = 'disabled';

  async initialize(): Promise<void> {
    console.log('⚠️ ML Fraud Prediction Service disabled - TensorFlow not available');
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized;
  }

  async predict(_request: {
    sellerName?: string;
    sellerPhone?: string;
    sellerEmail?: string;
    propertyAddress?: string;
    wholesalerName?: string;
    askingPrice?: number;
    estimatedValue?: number;
    sqft?: number;
    yearBuilt?: number;
    daysOnMarket?: number;
    bedrooms?: number;
    bathrooms?: number;
    clientIp?: string;
    propertyId?: number;
  }): Promise<MLPrediction> {
    // Return a safe default prediction (low risk)
    return {
      predictionId: `disabled-${Date.now()}`,
      fraudProbability: 0.1,
      riskScore: 10,
      anomalyScore: 0.1,
      confidence: 0,
      modelVersion: this.modelVersion,
      features: {},
      featureImportance: [],
      timestamp: new Date(),
    };
  }

  async extractFeatures(_request: any): Promise<FraudFeatureVector> {
    return {
      sellerSubmissionRate: 0,
      phoneSubmissionRate: 0,
      emailSubmissionRate: 0,
      addressSubmissionRate: 0,
      ipSubmissionRate: 0,
      wholesalerSubmissionRate: 0,
      priceToValueRatio: 1,
      pricePerSqft: 0,
      priceDeviation: 0,
      hourOfDay: 0,
      dayOfWeek: 0,
      timeSinceLastSubmission: 0,
      sellerIsWholesaler: 0,
      hasHistoricalSignals: 0,
      confirmedFraudConnection: 0,
      entityMismatchScore: 0,
      propertyAge: 0,
      daysOnMarket: 0,
      bedroomCount: 0,
      bathroomCount: 0,
    };
  }

  async train(_forceRetrain = false): Promise<{ success: boolean; metrics: ModelMetrics }> {
    console.log('⚠️ ML training disabled - TensorFlow not available');
    return {
      success: false,
      metrics: {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        auc: 0,
        lastTrainedAt: null,
        sampleCount: 0,
      },
    };
  }

  async addFeedback(_predictionId: string, _wasActuallyFraud: boolean, _notes?: string): Promise<void> {
    console.log('⚠️ ML feedback disabled - TensorFlow not available');
  }

  getMetrics(): ModelMetrics {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      auc: 0,
      lastTrainedAt: null,
      sampleCount: 0,
    };
  }

  getModelVersion(): string {
    return this.modelVersion;
  }

  getModelInfo(): { status: string; version: string; message: string } {
    return {
      status: 'disabled',
      version: this.modelVersion,
      message: 'ML features are temporarily disabled',
    };
  }
}

export const mlFraudPredictionService = new MLFraudPredictionService();
export default mlFraudPredictionService;
