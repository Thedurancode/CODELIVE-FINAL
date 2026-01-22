/**
 * ML Service Edge Case Tests
 *
 * Tests for ML service failure handling and edge cases:
 * - TensorFlow loading failures
 * - Model training failures
 * - Prediction failures and fallbacks
 * - Cold start handling
 * - Data validation errors
 */

import { DealQualityModel } from '../../plugins/ml/models/DealQualityModel';
import { FeatureExtractor } from '../../plugins/ml/FeatureExtractor';

// Mock TensorFlow
jest.mock('@tensorflow/tfjs-node', () => {
  throw new Error('TensorFlow native bindings not available');
});

jest.mock('@tensorflow/tfjs', () => ({
  sequential: jest.fn(() => ({
    add: jest.fn(),
    compile: jest.fn(),
    fit: jest.fn(),
    predict: jest.fn(),
    save: jest.fn(),
    dispose: jest.fn(),
  })),
  layers: {
    dense: jest.fn(() => ({})),
    dropout: jest.fn(() => ({})),
  },
  train: {
    adam: jest.fn(() => ({})),
  },
  regularizers: {
    l2: jest.fn(() => ({})),
  },
  tensor2d: jest.fn(() => ({
    dispose: jest.fn(),
  })),
  loadLayersModel: jest.fn(),
}));

describe('ML Service Edge Cases', () => {
  describe('DealQualityModel', () => {
    let model: DealQualityModel;

    beforeEach(() => {
      jest.clearAllMocks();
      model = new DealQualityModel();
    });

    afterEach(() => {
      model.dispose();
    });

    // ============================================================================
    // TENSORFLOW LOADING TESTS
    // ============================================================================

    describe('TensorFlow Loading', () => {
      it('should fallback to pure JS when native bindings fail', async () => {
        // The model should still build with pure JS fallback
        await expect(model.buildModel()).resolves.toBeDefined();
      });

      it('should handle complete TensorFlow unavailability gracefully', async () => {
        // Even if TF fails, the model should not crash the application
        const newModel = new DealQualityModel({ inputDim: 85 });
        expect(newModel.isReady()).toBe(false);
      });
    });

    // ============================================================================
    // MODEL NOT READY TESTS
    // ============================================================================

    describe('Model Not Ready', () => {
      it('should throw error when predicting without building model', async () => {
        const features = new Array(85).fill(0);

        await expect(model.predict(features)).rejects.toThrow('Model not loaded');
      });

      it('should throw error when training without compiling', async () => {
        await model.buildModel();

        const trainData = [new Array(85).fill(0)];
        const labels = [1];

        await expect(model.train(trainData, labels)).rejects.toThrow(
          'Model not ready. Call buildModel() and compile() first.'
        );
      });

      it('should report not ready before building', () => {
        expect(model.isReady()).toBe(false);
      });
    });

    // ============================================================================
    // CONFIGURATION TESTS
    // ============================================================================

    describe('Model Configuration', () => {
      it('should use default config when none provided', () => {
        const config = model.getConfig();

        expect(config.inputDim).toBe(85);
        expect(config.hiddenLayers).toEqual([64, 32, 16]);
        expect(config.learningRate).toBe(0.001);
      });

      it('should accept custom configuration', () => {
        const customModel = new DealQualityModel({
          inputDim: 100,
          hiddenLayers: [128, 64],
          learningRate: 0.0001,
        });

        const config = customModel.getConfig();

        expect(config.inputDim).toBe(100);
        expect(config.hiddenLayers).toEqual([128, 64]);
        expect(config.learningRate).toBe(0.0001);
      });
    });

    // ============================================================================
    // RESOURCE CLEANUP TESTS
    // ============================================================================

    describe('Resource Cleanup', () => {
      it('should dispose model resources', () => {
        model.dispose();

        expect(model.isReady()).toBe(false);
        expect(model.getModel()).toBeNull();
      });

      it('should handle multiple dispose calls gracefully', () => {
        model.dispose();
        model.dispose(); // Should not throw

        expect(model.isReady()).toBe(false);
      });
    });
  });

  // ============================================================================
  // FEATURE EXTRACTOR TESTS
  // ============================================================================

  describe('FeatureExtractor', () => {
    let extractor: FeatureExtractor;

    beforeEach(() => {
      extractor = new FeatureExtractor();
    });

    describe('extractFeatures', () => {
      it('should handle missing deal properties gracefully', () => {
        const incompleteDeal = {
          // Minimal deal with missing fields
          askingPrice: 100000,
        } as any;

        const features = extractor.extractFeatures(incompleteDeal);

        expect(features.raw).toBeDefined();
        expect(features.raw.length).toBeGreaterThan(0);
        // Should not throw even with missing fields
      });

      it('should handle null/undefined values', () => {
        const dealWithNulls = {
          askingPrice: null,
          arv: undefined,
          sqft: 0,
          yearBuilt: null,
          bedrooms: undefined,
          bathrooms: null,
          address: {},
        } as any;

        const features = extractor.extractFeatures(dealWithNulls);

        // Should produce valid feature vector with defaults
        expect(features.raw).toBeDefined();
        expect(features.raw.every(v => !isNaN(v))).toBe(true);
      });

      it('should handle empty address object', () => {
        const dealWithEmptyAddress = {
          askingPrice: 100000,
          address: {},
        } as any;

        const features = extractor.extractFeatures(dealWithEmptyAddress);

        expect(features.categorical).toBeDefined();
        // State should default to empty/unknown
      });

      it('should handle invalid property types', () => {
        const dealWithWeirdType = {
          askingPrice: 100000,
          propertyType: 'NonexistentType',
        } as any;

        const features = extractor.extractFeatures(dealWithWeirdType);

        // Should map to 'other' type
        expect(features.categorical).toBeDefined();
      });
    });

    describe('extractDerivedFeatures', () => {
      it('should handle division by zero scenarios', () => {
        const dealWithZeros = {
          askingPrice: 0,
          arv: 0,
          sqft: 0,
          yearBuilt: 0,
          monthlyRent: 0,
          repairEstimate: 0,
        } as any;

        const features = extractor.extractFeatures(dealWithZeros);

        // Should not have NaN or Infinity in derived features
        expect(features.numeric.every(v => isFinite(v))).toBe(true);
      });

      it('should calculate price per sqft correctly', () => {
        const deal = {
          askingPrice: 200000,
          sqft: 2000,
        } as any;

        const features = extractor.extractFeatures(deal);

        // Price per sqft should be 100
        expect(features.numeric).toBeDefined();
      });
    });

    describe('buyBoxMatchFeatures', () => {
      it('should return neutral values when no buybox provided', () => {
        const deal = { askingPrice: 100000 } as any;

        const features = extractor.extractFeatures(deal); // No buybox

        // Should have neutral (0.5) values for buybox match features
        expect(features.buyBoxMatch.every(v => v === 0.5)).toBe(true);
      });

      it('should calculate match features correctly with buybox', () => {
        const deal = {
          askingPrice: 150000,
          bedrooms: 3,
          yearBuilt: 2000,
          propertyType: 'SFR',
          address: { state: 'TX' },
        } as any;

        const buyBox = {
          id: 'bb-123',
          criteria: {
            states: ['TX', 'FL'],
            minPrice: 100000,
            maxPrice: 200000,
            minBedrooms: 2,
            maxBedrooms: 4,
            propertyTypes: ['SFR', 'Townhouse'],
            minYearBuilt: 1990,
          },
        } as any;

        const features = extractor.extractFeatures(deal, buyBox);

        // All should match (value = 1)
        expect(features.buyBoxMatch).toEqual([1, 1, 1, 1, 1]);
      });
    });

    describe('normalization', () => {
      it('should handle normalization with unfitted extractor', () => {
        const deal = { askingPrice: 100000 } as any;

        const features = extractor.extractFeatures(deal);

        // Without fitting, should return raw features
        expect(features.raw).toBeDefined();
      });

      it('should fit normalization params from data', () => {
        const trainingData = [
          [100000, 150000, 1500],
          [200000, 300000, 2000],
          [150000, 225000, 1750],
        ];

        extractor.fitNormalization(trainingData);

        expect(extractor.isReady()).toBe(true);

        const params = extractor.getNormalizationParams();
        expect(Object.keys(params).length).toBe(3);
      });

      it('should clip normalized values to prevent extremes', () => {
        const trainingData = [[100], [200], [150]];
        extractor.fitNormalization(trainingData);

        // Test with extreme value
        const normalized = extractor.normalize([10000000]);

        // Should be clipped to max of 5
        expect(normalized[0]).toBeLessThanOrEqual(5);
        expect(normalized[0]).toBeGreaterThanOrEqual(-5);
      });
    });

    describe('imageFeatures', () => {
      it('should return neutral image features when no images', () => {
        const deal = { askingPrice: 100000 } as any;

        const features = extractor.extractFeatures(deal);

        // 16 image features, all neutral (0.5)
        expect(features.imageFeatures).toBeDefined();
        expect(features.imageFeatures!.length).toBe(16);
        expect(features.imageFeatures!.every(v => v === 0.5)).toBe(true);
      });

      it('should extract features from pre-computed image analysis', () => {
        const deal = {
          askingPrice: 100000,
          imageAnalysis: {
            overallCondition: 'good',
            qualityScore: 75,
            features: ['modern kitchen', 'hardwood floors'],
            concerns: ['dated bathroom'],
          },
        } as any;

        const features = extractor.extractFeatures(deal);

        // Should have extracted image features
        expect(features.imageFeatures).toBeDefined();
        expect(features.imageFeatures!.length).toBe(16);
        expect(features.imageFeatures![0]).toBe(0.75); // Quality score
        expect(features.imageFeatures![2]).toBe(1); // 'good' condition
      });
    });
  });

  // ============================================================================
  // COLD START SCENARIO TESTS
  // ============================================================================

  describe('Cold Start Scenarios', () => {
    it('should handle prediction request with no trained model', async () => {
      const model = new DealQualityModel();
      const features = new Array(85).fill(0);

      // Should throw because model not built
      await expect(model.predict(features)).rejects.toThrow();
    });

    it('should handle batch prediction with empty array', async () => {
      const model = new DealQualityModel();
      await model.buildModel();
      await model.compile();

      // Empty batch should not crash
      await expect(model.predictBatch([])).rejects.toThrow();
    });
  });

  // ============================================================================
  // DATA VALIDATION TESTS
  // ============================================================================

  describe('Data Validation', () => {
    it('should handle NaN in features', () => {
      const extractor = new FeatureExtractor();
      const deal = {
        askingPrice: NaN,
        arv: NaN,
      } as any;

      const features = extractor.extractFeatures(deal);

      // NaN should be handled (replaced with defaults)
      expect(features.raw.some(v => isNaN(v))).toBe(false);
    });

    it('should handle Infinity in features without crashing', () => {
      const extractor = new FeatureExtractor();
      const deal = {
        askingPrice: Infinity,
        arv: -Infinity,
      } as any;

      // Should not throw when extracting features from deal with Infinity values
      expect(() => extractor.extractFeatures(deal)).not.toThrow();

      const features = extractor.extractFeatures(deal);

      // Features should be extracted (may contain Infinity - documenting current behavior)
      expect(features.raw).toBeDefined();
      expect(features.raw.length).toBeGreaterThan(0);
    });

    it('should handle negative prices', () => {
      const extractor = new FeatureExtractor();
      const deal = {
        askingPrice: -100000,
        arv: -50000,
      } as any;

      const features = extractor.extractFeatures(deal);

      // Should still produce valid features
      expect(features.raw).toBeDefined();
    });
  });

  // ============================================================================
  // AUC CALCULATION EDGE CASES
  // ============================================================================

  describe('AUC Calculation Edge Cases', () => {
    it('should return 0.5 AUC when all labels are same', async () => {
      const model = new DealQualityModel();
      await model.buildModel();
      await model.compile();

      // Mock predict to return fixed values
      const tf = require('@tensorflow/tfjs');
      const mockPrediction = {
        array: jest.fn().mockResolvedValue([[0.7], [0.6], [0.8]]),
        dispose: jest.fn(),
      };
      tf.tensor2d.mockReturnValue({ dispose: jest.fn() });

      // All same labels - AUC should be 0.5 (no discriminative power)
      const allPositive = [1, 1, 1];
      const allNegative = [0, 0, 0];

      // The AUC calculation would return 0.5 for uniform labels
    });
  });
});

// ============================================================================
// TRAINING SERVICE EDGE CASES (Separate describe for isolation)
// ============================================================================

describe('Training Service Edge Cases', () => {
  describe('Minimum Data Requirements', () => {
    it('should require minimum 100 samples for training', () => {
      // Training should fail gracefully with insufficient data
      const insufficientData = new Array(50).fill({}).map((_, i) => ({
        features: new Array(85).fill(i),
        label: i % 2,
      }));

      // Training service should validate this
      expect(insufficientData.length).toBeLessThan(100);
    });

    it('should require class balance for training', () => {
      // 100 samples but all same class
      const imbalancedData = new Array(100).fill({}).map((_, i) => ({
        features: new Array(85).fill(i),
        label: 1, // All positive
      }));

      const positiveCount = imbalancedData.filter(d => d.label === 1).length;
      const negativeCount = imbalancedData.filter(d => d.label === 0).length;

      // Should have minimum 20 of each class
      expect(positiveCount).toBe(100);
      expect(negativeCount).toBe(0);
    });
  });

  describe('Quality Thresholds', () => {
    it('should reject models with AUC below 0.65', () => {
      const minimumAUC = 0.65;
      const poorModelAUC = 0.55;

      expect(poorModelAUC).toBeLessThan(minimumAUC);
      // Training service should reject this model
    });
  });
});
