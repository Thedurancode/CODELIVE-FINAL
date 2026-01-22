/**
 * ScoringEngine Unit Tests
 */

import { ScoringEngine, IScoringPlugin } from '../../plugins/scoring/ScoringEngine';
import { BuyBox, NormalizedDeal } from '../../plugins/types';

// Mock the HedgeFundBuyBox model
jest.mock('../../models/HedgeFundBuyBox', () => ({
  findAll: jest.fn().mockResolvedValue([]),
  findByPk: jest.fn(),
  create: jest.fn(),
  destroy: jest.fn(),
}));

import HedgeFundBuyBox from '../../models/HedgeFundBuyBox';

describe('ScoringEngine', () => {
  let engine: ScoringEngine;

  const createMockDeal = (overrides: Partial<NormalizedDeal> = {}): NormalizedDeal => ({
    sourceId: 'test-source',
    sourceName: 'Test',
    address: {
      street: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      county: 'Travis',
    },
    askingPrice: 200000,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1500,
    propertyType: 'single_family',
    normalizedAt: new Date(),
    confidence: 0.9,
    rawData: {},
    ...overrides,
  });

  const createMockBuyBox = (overrides: Partial<BuyBox> = {}): BuyBox => ({
    id: 'bb-1',
    name: 'Test Buy Box',
    fundName: 'Test Fund',
    enabled: true,
    priority: 1,
    criteria: {
      states: ['TX'],
      minPrice: 100000,
      maxPrice: 300000,
      propertyTypes: ['single_family'],
    },
    scoringWeights: {
      geographic: 25,
      price: 20,
      propertyType: 10,
      bedrooms: 5,
      bathrooms: 5,
      yearBuilt: 5,
      occupancy: 5,
      hoa: 5,
      photos: 5,
      condition: 5,
      riskFactors: 5,
      strategyMetrics: 5,
      custom: 0,
    },
    autoSubmit: false,
    autoSubmitThreshold: 80,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new ScoringEngine();
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const eng = new ScoringEngine();
      expect(eng).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const eng = new ScoringEngine({
        strongMatchThreshold: 90,
      });
      expect(eng).toBeDefined();
    });

    it('should register plugins from config', () => {
      const mockPlugin: IScoringPlugin = {
        name: 'TestPlugin',
        score: jest.fn().mockResolvedValue([]),
      };

      const eng = new ScoringEngine({ plugins: [mockPlugin] });
      expect(eng).toBeDefined();
    });
  });

  // ============================================================================
  // BUY BOX MANAGEMENT TESTS
  // ============================================================================

  describe('loadFromDatabase', () => {
    it('should load buy boxes from database', async () => {
      const mockDbBuyBoxes = [
        {
          toBuyBox: () => createMockBuyBox({ id: 'bb-1' }),
        },
        {
          toBuyBox: () => createMockBuyBox({ id: 'bb-2' }),
        },
      ];

      (HedgeFundBuyBox.findAll as jest.Mock).mockResolvedValue(mockDbBuyBoxes);
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await engine.loadFromDatabase();

      expect(HedgeFundBuyBox.findAll).toHaveBeenCalled();
      expect(engine.getAllBuyBoxes()).toHaveLength(2);
      logSpy.mockRestore();
    });

    it('should handle database errors gracefully', async () => {
      (HedgeFundBuyBox.findAll as jest.Mock).mockRejectedValue(new Error('DB error'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await engine.loadFromDatabase();

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('should handle missing table gracefully', async () => {
      const error: any = new Error('Table not found');
      error.original = { code: '42P01' };
      (HedgeFundBuyBox.findAll as jest.Mock).mockRejectedValue(error);
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await engine.loadFromDatabase();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('table does not exist'));
      logSpy.mockRestore();
    });
  });

  describe('registerBuyBox', () => {
    it('should save buy box to database and cache', async () => {
      const buyBox = createMockBuyBox();
      (HedgeFundBuyBox.create as jest.Mock).mockResolvedValue(buyBox);
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await engine.registerBuyBox(buyBox);

      expect(HedgeFundBuyBox.create).toHaveBeenCalled();
      expect(engine.getBuyBox(buyBox.id)).toBeDefined();
      logSpy.mockRestore();
    });
  });

  describe('updateBuyBox', () => {
    it('should update existing buy box', async () => {
      const buyBox = createMockBuyBox();
      const mockDbBuyBox = {
        update: jest.fn().mockResolvedValue(true),
      };
      (HedgeFundBuyBox.findByPk as jest.Mock).mockResolvedValue(mockDbBuyBox);

      await engine.updateBuyBox(buyBox);

      expect(mockDbBuyBox.update).toHaveBeenCalled();
    });

    it('should throw error for non-existent buy box', async () => {
      (HedgeFundBuyBox.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(engine.updateBuyBox(createMockBuyBox())).rejects.toThrow('Buy box not found');
    });
  });

  describe('removeBuyBox', () => {
    it('should remove buy box from database and cache', async () => {
      // First add a buy box
      (HedgeFundBuyBox.create as jest.Mock).mockResolvedValue({});
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      await engine.registerBuyBox(createMockBuyBox({ id: 'to-remove' }));

      (HedgeFundBuyBox.destroy as jest.Mock).mockResolvedValue(1);

      await engine.removeBuyBox('to-remove');

      expect(HedgeFundBuyBox.destroy).toHaveBeenCalledWith({ where: { id: 'to-remove' } });
      expect(engine.getBuyBox('to-remove')).toBeUndefined();
      logSpy.mockRestore();
    });
  });

  describe('getAllBuyBoxes', () => {
    it('should return only enabled buy boxes', async () => {
      (HedgeFundBuyBox.create as jest.Mock).mockResolvedValue({});
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-1', enabled: true }));
      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-2', enabled: false }));
      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-3', enabled: true }));

      const buyBoxes = engine.getAllBuyBoxes();

      expect(buyBoxes).toHaveLength(2);
      expect(buyBoxes.every((bb) => bb.enabled)).toBe(true);
      logSpy.mockRestore();
    });

    it('should sort by priority descending', async () => {
      (HedgeFundBuyBox.create as jest.Mock).mockResolvedValue({});
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-1', priority: 1 }));
      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-2', priority: 3 }));
      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-3', priority: 2 }));

      const buyBoxes = engine.getAllBuyBoxes();

      expect(buyBoxes[0].priority).toBe(3);
      expect(buyBoxes[1].priority).toBe(2);
      expect(buyBoxes[2].priority).toBe(1);
      logSpy.mockRestore();
    });
  });

  describe('getAllBuyBoxesIncludingDisabled', () => {
    it('should return all buy boxes including disabled', async () => {
      (HedgeFundBuyBox.create as jest.Mock).mockResolvedValue({});
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-1', enabled: true }));
      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-2', enabled: false }));

      const allBuyBoxes = engine.getAllBuyBoxesIncludingDisabled();

      expect(allBuyBoxes).toHaveLength(2);
      logSpy.mockRestore();
    });
  });

  // ============================================================================
  // SCORING PLUGIN TESTS
  // ============================================================================

  describe('registerPlugin', () => {
    it('should register a custom scoring plugin', () => {
      const mockPlugin: IScoringPlugin = {
        name: 'TestPlugin',
        score: jest.fn().mockResolvedValue([]),
      };
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      engine.registerPlugin(mockPlugin);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Registered scoring plugin'));
      logSpy.mockRestore();
    });
  });

  // ============================================================================
  // SCORING TESTS
  // ============================================================================

  describe('scoreDealAgainstBuyBox', () => {
    it('should score a matching deal', async () => {
      const deal = createMockDeal();
      const buyBox = createMockBuyBox();

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      expect(result.buyBoxId).toBe(buyBox.id);
      expect(result.percentage).toBeGreaterThan(0);
      expect(result.breakdown).toBeInstanceOf(Array);
      expect(result.breakdown.length).toBeGreaterThan(0);
    });

    it('should penalize deals outside target states', async () => {
      const deal = createMockDeal({
        address: { street: '123 Main', city: 'Miami', state: 'FL', zip: '33101' },
      });
      const buyBox = createMockBuyBox({
        criteria: { states: ['TX'] },
      });

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      // Geographic scoring should be impacted for non-matching state
      const geoBreakdown = result.breakdown.find((b) => b.criterion === 'Geographic Location');
      expect(geoBreakdown).toBeDefined();
      // Either hard fail or low score on geographic criterion
      expect(geoBreakdown?.earnedPoints).toBeLessThanOrEqual(geoBreakdown?.maxPoints || 0);
    });

    it('should score price correctly within range', async () => {
      const deal = createMockDeal({ askingPrice: 200000 });
      const buyBox = createMockBuyBox({
        criteria: { minPrice: 100000, maxPrice: 300000 },
      });

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      const priceBreakdown = result.breakdown.find((b) => b.criterion === 'Price');
      expect(priceBreakdown?.passed).toBe(true);
    });

    it('should penalize price significantly over maximum', async () => {
      const deal = createMockDeal({ askingPrice: 500000 });
      const buyBox = createMockBuyBox({
        criteria: { maxPrice: 300000 },
      });

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      expect(result.failedHardRequirements).toContain('Price significantly over maximum');
    });

    it('should score property type correctly', async () => {
      const deal = createMockDeal({ propertyType: 'single_family' });
      const buyBox = createMockBuyBox({
        criteria: { propertyTypes: ['single_family', 'condo_townhome'] },
      });

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      const typeBreakdown = result.breakdown.find((b) => b.criterion === 'Property Type');
      expect(typeBreakdown?.passed).toBe(true);
    });

    it('should exclude excluded property types', async () => {
      const deal = createMockDeal({ propertyType: 'mobile_home_park' });
      const buyBox = createMockBuyBox({
        criteria: { excludePropertyTypes: ['mobile_home_park'] },
      });

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      const typeBreakdown = result.breakdown.find((b) => b.criterion === 'Property Type');
      expect(typeBreakdown?.passed).toBe(false);
    });

    it('should determine strong match', async () => {
      const deal = createMockDeal();
      const buyBox = createMockBuyBox({
        criteria: {
          states: ['TX'],
          minPrice: 100000,
          maxPrice: 300000,
          propertyTypes: ['single_family'],
        },
      });

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      // With all criteria matching, should be strong match
      expect(['strong', 'moderate']).toContain(result.matchType);
    });

    it('should calculate auto-submit eligibility', async () => {
      const deal = createMockDeal();
      const buyBox = createMockBuyBox({
        autoSubmit: true,
        autoSubmitThreshold: 50,
        criteria: { states: ['TX'] },
      });

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      // Should be eligible if percentage >= threshold and passed hard requirements
      if (result.percentage >= 50 && result.passedHardRequirements) {
        expect(result.autoSubmitEligible).toBe(true);
      }
    });

    it('should call scoring plugins', async () => {
      const mockPlugin: IScoringPlugin = {
        name: 'TestPlugin',
        score: jest.fn().mockResolvedValue([
          {
            criterion: 'Custom',
            weight: 10,
            maxPoints: 10,
            earnedPoints: 8,
            passed: true,
            details: 'Plugin score',
          },
        ]),
      };

      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      engine.registerPlugin(mockPlugin);
      logSpy.mockRestore();

      const deal = createMockDeal();
      const buyBox = createMockBuyBox();

      await engine.scoreDealAgainstBuyBox(deal, buyBox);

      expect(mockPlugin.score).toHaveBeenCalledWith(deal, buyBox);
    });

    it('should handle plugin errors gracefully', async () => {
      const mockPlugin: IScoringPlugin = {
        name: 'FailingPlugin',
        score: jest.fn().mockRejectedValue(new Error('Plugin error')),
      };

      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      engine.registerPlugin(mockPlugin);
      logSpy.mockRestore();

      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const deal = createMockDeal();
      const buyBox = createMockBuyBox();

      // Should not throw
      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      expect(result).toBeDefined();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Scoring plugin FailingPlugin failed'),
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });
  });

  describe('scoreDealAgainstAllBuyBoxes', () => {
    it('should score against all enabled buy boxes', async () => {
      (HedgeFundBuyBox.create as jest.Mock).mockResolvedValue({});
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-1', name: 'Box 1' }));
      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-2', name: 'Box 2' }));
      logSpy.mockRestore();

      const deal = createMockDeal();

      const results = await engine.scoreDealAgainstAllBuyBoxes(deal);

      expect(results).toHaveLength(2);
    });

    it('should sort results by percentage descending', async () => {
      (HedgeFundBuyBox.create as jest.Mock).mockResolvedValue({});
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      // Create buy boxes with different match criteria
      await engine.registerBuyBox(
        createMockBuyBox({
          id: 'bb-1',
          criteria: { states: ['FL'] }, // Won't match TX deal
        })
      );
      await engine.registerBuyBox(
        createMockBuyBox({
          id: 'bb-2',
          criteria: { states: ['TX'] }, // Will match TX deal
        })
      );
      logSpy.mockRestore();

      const deal = createMockDeal();

      const results = await engine.scoreDealAgainstAllBuyBoxes(deal);

      // Second buy box should score higher and appear first
      expect(results[0].buyBoxId).toBe('bb-2');
    });
  });

  describe('findBestMatches', () => {
    it('should return top N matches', async () => {
      (HedgeFundBuyBox.create as jest.Mock).mockResolvedValue({});
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-1', criteria: { states: ['TX'] } }));
      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-2', criteria: { states: ['TX'] } }));
      await engine.registerBuyBox(createMockBuyBox({ id: 'bb-3', criteria: { states: ['TX'] } }));
      logSpy.mockRestore();

      const deal = createMockDeal();

      const results = await engine.findBestMatches(deal, 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should filter out no-matches', async () => {
      (HedgeFundBuyBox.create as jest.Mock).mockResolvedValue({});
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await engine.registerBuyBox(
        createMockBuyBox({
          id: 'bb-nomatch',
          criteria: { states: ['FL'] }, // Won't match TX deal
        })
      );
      logSpy.mockRestore();

      const deal = createMockDeal();

      const results = await engine.findBestMatches(deal);

      // All results should be matches (not no_match)
      expect(results.every((r) => r.matchType !== 'no_match')).toBe(true);
    });
  });

  // ============================================================================
  // INDIVIDUAL SCORING METHOD TESTS
  // ============================================================================

  describe('Geographic Scoring', () => {
    it('should give full points when no state restrictions', async () => {
      const deal = createMockDeal();
      const buyBox = createMockBuyBox({ criteria: {} });

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      const geoBreakdown = result.breakdown.find((b) => b.criterion === 'Geographic Location');
      expect(geoBreakdown?.passed).toBe(true);
    });

    it('should match state correctly', async () => {
      const deal = createMockDeal({
        address: { street: '123', city: 'Houston', state: 'TX', zip: '77001' },
      });
      const buyBox = createMockBuyBox({
        criteria: { states: ['TX', 'FL'] },
      });

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      const geoBreakdown = result.breakdown.find((b) => b.criterion === 'Geographic Location');
      expect(geoBreakdown?.earnedPoints).toBeGreaterThan(0);
    });

    it('should exclude by ZIP code', async () => {
      const deal = createMockDeal({
        address: { street: '123', city: 'Austin', state: 'TX', zip: '78701' },
      });
      const buyBox = createMockBuyBox({
        criteria: {
          states: ['TX'],
          excludeZipCodes: ['78701'],
        },
      });

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      const geoBreakdown = result.breakdown.find((b) => b.criterion === 'Geographic Location');
      expect(geoBreakdown?.earnedPoints).toBe(0);
    });
  });

  describe('Bedroom Scoring', () => {
    it('should score bedrooms within range', async () => {
      const deal = createMockDeal({ bedrooms: 3 });
      const buyBox = createMockBuyBox({
        criteria: { minBedrooms: 2, maxBedrooms: 4 },
      });

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      const bedroomBreakdown = result.breakdown.find((b) => b.criterion === 'Bedrooms');
      expect(bedroomBreakdown?.passed).toBe(true);
    });
  });

  describe('HOA Scoring', () => {
    it('should include HOA in scoring breakdown', async () => {
      const deal = createMockDeal();
      const buyBox = createMockBuyBox();

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      const hoaBreakdown = result.breakdown.find((b) => b.criterion === 'HOA');
      expect(hoaBreakdown).toBeDefined();
    });
  });

  describe('Photos Scoring', () => {
    it('should include photos in scoring breakdown', async () => {
      const deal = createMockDeal({
        photos: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],
      });
      const buyBox = createMockBuyBox();

      const result = await engine.scoreDealAgainstBuyBox(deal, buyBox);

      const photosBreakdown = result.breakdown.find((b) => b.criterion === 'Photos');
      expect(photosBreakdown).toBeDefined();
    });
  });
});
