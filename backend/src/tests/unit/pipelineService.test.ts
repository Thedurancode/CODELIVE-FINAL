/**
 * Pipeline Service Unit Tests
 *
 * Tests for deal pipeline management:
 * - Adding/removing deals from pipeline
 * - Stage transitions and history tracking
 * - Pipeline statistics and conversion rates
 * - Moving deals to portfolio
 */

import { pipelineService } from '../../services/PipelineService';
import DealPipeline from '../../models/DealPipeline';
import Portfolio from '../../models/Portfolio';
import { Property } from '../../models';
import { notificationService } from '../../services/NotificationService';

// Mock models - preserving PIPELINE_STAGES export
jest.mock('../../models/DealPipeline', () => {
  const originalModule = jest.requireActual('../../models/DealPipeline');
  const mockModel = {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
  };
  return {
    __esModule: true,
    ...originalModule,
    default: mockModel,
  };
});

jest.mock('../../models/Portfolio', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
  },
}));

jest.mock('../../models', () => ({
  Property: {
    findByPk: jest.fn(),
  },
}));

// Mock notification service
jest.mock('../../services/NotificationService', () => ({
  notificationService: {
    sendToUser: jest.fn(),
  },
}));

describe('PipelineService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // ADD TO PIPELINE TESTS
  // ============================================================================

  describe('addToPipeline', () => {
    it('should add a new deal to pipeline', async () => {
      const mockPipeline = {
        id: 'pipeline-123',
        userId: 'user-123',
        dealId: 'deal-456',
        stage: 'new',
        stageHistory: [{ stage: 'new', enteredAt: expect.any(String) }],
      };

      (DealPipeline.findOne as jest.Mock).mockResolvedValue(null);
      (DealPipeline.create as jest.Mock).mockResolvedValue(mockPipeline);

      const result = await pipelineService.addToPipeline('user-123', 'deal-456');

      expect(DealPipeline.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-123', dealId: 'deal-456' },
      });
      expect(DealPipeline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          dealId: 'deal-456',
          stage: 'new',
        })
      );
      expect(result).toEqual(mockPipeline);
    });

    it('should throw error if deal already exists in pipeline', async () => {
      (DealPipeline.findOne as jest.Mock).mockResolvedValue({
        id: 'existing-pipeline',
        dealId: 'deal-456',
      });

      await expect(
        pipelineService.addToPipeline('user-123', 'deal-456')
      ).rejects.toThrow('Deal deal-456 is already in your pipeline');
    });

    it('should add deal with custom initial stage', async () => {
      (DealPipeline.findOne as jest.Mock).mockResolvedValue(null);
      (DealPipeline.create as jest.Mock).mockResolvedValue({
        id: 'pipeline-123',
        stage: 'analyzing',
      });

      await pipelineService.addToPipeline('user-123', 'deal-456', {
        stage: 'analyzing',
      });

      expect(DealPipeline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'analyzing',
        })
      );
    });

    it('should populate snapshot from property if propertyId provided', async () => {
      const mockProperty = {
        id: 1,
        reservePrice: 150000,
        arv: 200000,
        state: 'TX',
        city: 'Austin',
        propertyType: 'SFR',
        bedroomCount: 3,
        bathroomCount: 2,
        livingSpaceSqFt: 1500,
      };

      (DealPipeline.findOne as jest.Mock).mockResolvedValue(null);
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);
      (DealPipeline.create as jest.Mock).mockResolvedValue({ id: 'pipeline-123' });

      await pipelineService.addToPipeline('user-123', 'deal-456', {
        propertyId: 1,
      });

      expect(Property.findByPk).toHaveBeenCalledWith(1);
      expect(DealPipeline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entrySnapshot: expect.objectContaining({
            price: 150000,
            arv: 200000,
            state: 'TX',
            city: 'Austin',
          }),
        })
      );
    });

    it('should record triggeredBy in stage history', async () => {
      (DealPipeline.findOne as jest.Mock).mockResolvedValue(null);
      (DealPipeline.create as jest.Mock).mockResolvedValue({ id: 'pipeline-123' });

      await pipelineService.addToPipeline('user-123', 'deal-456', {
        triggeredBy: 'automation',
      });

      expect(DealPipeline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          stageHistory: expect.arrayContaining([
            expect.objectContaining({
              triggeredBy: 'automation',
            }),
          ]),
        })
      );
    });
  });

  // ============================================================================
  // UPDATE STAGE TESTS
  // ============================================================================

  describe('updateStage', () => {
    it('should update stage and maintain history', async () => {
      const mockPipeline: any = {
        id: 'pipeline-123',
        userId: 'user-123',
        stage: 'new',
        stageHistory: [{ stage: 'new', enteredAt: '2024-01-01T00:00:00Z' }],
        isClosed: () => false,
        save: jest.fn().mockResolvedValue(true),
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);

      const result = await pipelineService.updateStage('pipeline-123', 'analyzing');

      expect(mockPipeline.stage).toBe('analyzing');
      expect(mockPipeline.stageHistory).toHaveLength(2);
      expect(mockPipeline.stageHistory[0].exitedAt).toBeDefined();
      expect(mockPipeline.stageHistory[1].stage).toBe('analyzing');
      expect(mockPipeline.save).toHaveBeenCalled();
    });

    it('should throw error if pipeline not found', async () => {
      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(
        pipelineService.updateStage('nonexistent', 'analyzing')
      ).rejects.toThrow('Pipeline item nonexistent not found');
    });

    it('should throw error if deal is already closed', async () => {
      const mockPipeline = {
        id: 'pipeline-123',
        stage: 'closed_won',
        isClosed: () => true,
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);

      await expect(
        pipelineService.updateStage('pipeline-123', 'analyzing')
      ).rejects.toThrow('Cannot update stage of a closed deal');
    });

    it('should set outcome when moving to closed_won', async () => {
      const mockPipeline: any = {
        id: 'pipeline-123',
        userId: 'user-123',
        stage: 'under_contract',
        stageHistory: [{ stage: 'under_contract', enteredAt: '2024-01-01T00:00:00Z' }],
        isClosed: () => false,
        save: jest.fn().mockResolvedValue(true),
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);

      await pipelineService.updateStage('pipeline-123', 'closed_won');

      expect(mockPipeline.outcome).toBe('won');
      expect(mockPipeline.closedAt).toBeDefined();
    });

    it('should set outcome when moving to closed_lost', async () => {
      const mockPipeline: any = {
        id: 'pipeline-123',
        userId: 'user-123',
        stage: 'negotiating',
        stageHistory: [{ stage: 'negotiating', enteredAt: '2024-01-01T00:00:00Z' }],
        isClosed: () => false,
        save: jest.fn().mockResolvedValue(true),
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);

      await pipelineService.updateStage('pipeline-123', 'closed_lost');

      expect(mockPipeline.outcome).toBe('lost');
      expect(mockPipeline.closedAt).toBeDefined();
    });

    it('should send notification on stage change', async () => {
      const mockPipeline: any = {
        id: 'pipeline-123',
        userId: 'user-123',
        dealId: 'deal-456',
        propertyId: 1,
        stage: 'new',
        stageHistory: [{ stage: 'new', enteredAt: '2024-01-01T00:00:00Z' }],
        isClosed: () => false,
        save: jest.fn().mockResolvedValue(true),
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);

      await pipelineService.updateStage('pipeline-123', 'analyzing');

      expect(notificationService.sendToUser).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          type: 'pipeline_update',
          data: expect.objectContaining({
            previousStage: 'new',
            newStage: 'analyzing',
          }),
        })
      );
    });

    it('should send notification on stage update', async () => {
      const mockPipeline: any = {
        id: 'pipeline-123',
        userId: 'user-123',
        stage: 'new',
        stageHistory: [{ stage: 'new', enteredAt: '2024-01-01T00:00:00Z' }],
        isClosed: () => false,
        save: jest.fn().mockResolvedValue(true),
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);
      (notificationService.sendToUser as jest.Mock).mockReturnValue(undefined);

      const result = await pipelineService.updateStage('pipeline-123', 'analyzing');

      expect(result).toBeDefined();
      expect(notificationService.sendToUser).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          type: 'pipeline_update',
          title: 'Pipeline Stage Updated',
        })
      );
    });
  });

  // ============================================================================
  // REMOVE FROM PIPELINE TESTS
  // ============================================================================

  describe('removeFromPipeline', () => {
    it('should remove deal from pipeline', async () => {
      const mockPipeline = {
        id: 'pipeline-123',
        destroy: jest.fn().mockResolvedValue(true),
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);

      await pipelineService.removeFromPipeline('pipeline-123');

      expect(mockPipeline.destroy).toHaveBeenCalled();
    });

    it('should throw error if pipeline item not found', async () => {
      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(
        pipelineService.removeFromPipeline('nonexistent')
      ).rejects.toThrow('Pipeline item nonexistent not found');
    });
  });

  // ============================================================================
  // MARK AS CLOSED TESTS
  // ============================================================================

  describe('markAsClosed', () => {
    it('should mark deal as won with close price', async () => {
      const mockPipeline: any = {
        id: 'pipeline-123',
        stage: 'under_contract',
        stageHistory: [{ stage: 'under_contract', enteredAt: '2024-01-01T00:00:00Z' }],
        save: jest.fn().mockResolvedValue(true),
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);

      const result = await pipelineService.markAsClosed('pipeline-123', 'won', {
        closePrice: 150000,
        reason: 'Great deal!',
      });

      expect(mockPipeline.stage).toBe('closed_won');
      expect(mockPipeline.outcome).toBe('won');
      expect(mockPipeline.closePrice).toBe(150000);
      expect(mockPipeline.outcomeReason).toBe('Great deal!');
      expect(mockPipeline.closedAt).toBeDefined();
    });

    it('should mark deal as lost with reason', async () => {
      const mockPipeline: any = {
        id: 'pipeline-123',
        stage: 'negotiating',
        stageHistory: [{ stage: 'negotiating', enteredAt: '2024-01-01T00:00:00Z' }],
        save: jest.fn().mockResolvedValue(true),
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);

      await pipelineService.markAsClosed('pipeline-123', 'lost', {
        reason: 'Price too high',
      });

      expect(mockPipeline.stage).toBe('closed_lost');
      expect(mockPipeline.outcome).toBe('lost');
      expect(mockPipeline.outcomeReason).toBe('Price too high');
    });
  });

  // ============================================================================
  // MOVE TO PORTFOLIO TESTS
  // ============================================================================

  describe('moveToPortfolio', () => {
    it('should create portfolio entry from won deal', async () => {
      const mockPipeline = {
        id: 'pipeline-123',
        userId: 'user-123',
        propertyId: 1,
        outcome: 'won',
        closedAt: new Date('2024-01-15'),
        entrySnapshot: {
          city: 'Austin',
          state: 'TX',
          propertyType: 'SFR',
          bedrooms: 3,
          bathrooms: 2,
          sqft: 1500,
          arv: 200000,
        },
      };

      const mockPortfolio = {
        id: 'portfolio-123',
        userId: 'user-123',
        propertyId: 1,
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);
      (Portfolio.create as jest.Mock).mockResolvedValue(mockPortfolio);

      const result = await pipelineService.moveToPortfolio('pipeline-123', {
        acquisitionPrice: 150000,
        closingCosts: 5000,
        rehabCost: 20000,
        monthlyRent: 1500,
        status: 'renting',
      });

      expect(Portfolio.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          propertyId: 1,
          acquisitionPrice: 150000,
          closingCosts: 5000,
          rehabCost: 20000,
          totalInvested: 175000, // 150000 + 5000 + 20000
          monthlyRent: 1500,
          status: 'renting',
          city: 'Austin',
          state: 'TX',
        })
      );
      expect(result).toEqual(mockPortfolio);
    });

    it('should throw error if deal is not won', async () => {
      const mockPipeline = {
        id: 'pipeline-123',
        outcome: 'lost',
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);

      await expect(
        pipelineService.moveToPortfolio('pipeline-123', { acquisitionPrice: 150000 })
      ).rejects.toThrow('Only won deals can be moved to portfolio');
    });

    it('should throw error if pipeline not found', async () => {
      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(
        pipelineService.moveToPortfolio('nonexistent', { acquisitionPrice: 150000 })
      ).rejects.toThrow('Pipeline item nonexistent not found');
    });

    it('should calculate totalInvested correctly', async () => {
      const mockPipeline = {
        id: 'pipeline-123',
        userId: 'user-123',
        outcome: 'won',
        closedAt: new Date(),
        entrySnapshot: { city: 'Austin', state: 'TX' },
      };

      (DealPipeline.findByPk as jest.Mock).mockResolvedValue(mockPipeline);
      (Portfolio.create as jest.Mock).mockResolvedValue({ id: 'portfolio-123' });

      await pipelineService.moveToPortfolio('pipeline-123', {
        acquisitionPrice: 100000,
        closingCosts: 3000,
        rehabCost: 15000,
      });

      expect(Portfolio.create).toHaveBeenCalledWith(
        expect.objectContaining({
          totalInvested: 118000,
        })
      );
    });
  });

  // ============================================================================
  // GET USER PIPELINE TESTS
  // ============================================================================

  describe('getUserPipeline', () => {
    it('should return user pipeline excluding closed by default', async () => {
      const mockItems = [
        { id: 'p1', stage: 'new' },
        { id: 'p2', stage: 'analyzing' },
      ];

      (DealPipeline.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: mockItems,
        count: 2,
      });

      const result = await pipelineService.getUserPipeline('user-123');

      expect(DealPipeline.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-123',
          }),
        })
      );
      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(2);
    });

    it('should filter by specific stage', async () => {
      (DealPipeline.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await pipelineService.getUserPipeline('user-123', { stage: 'negotiating' });

      expect(DealPipeline.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stage: 'negotiating',
          }),
        })
      );
    });

    it('should include completed when specified', async () => {
      (DealPipeline.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await pipelineService.getUserPipeline('user-123', { includeCompleted: true });

      // Should not have the notIn filter for closed stages
      expect(DealPipeline.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123' },
        })
      );
    });

    it('should respect pagination options', async () => {
      (DealPipeline.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 100,
      });

      await pipelineService.getUserPipeline('user-123', {
        limit: 20,
        offset: 40,
      });

      expect(DealPipeline.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
          offset: 40,
        })
      );
    });
  });

  // ============================================================================
  // PIPELINE STATISTICS TESTS
  // ============================================================================

  describe('getPipelineStats', () => {
    it('should calculate pipeline statistics correctly', async () => {
      const mockPipelines = [
        {
          stage: 'new',
          isClosed: () => false,
          getDaysInPipeline: () => 0,
        },
        {
          stage: 'analyzing',
          isClosed: () => false,
          getDaysInPipeline: () => 0,
        },
        {
          stage: 'closed_won',
          outcome: 'won',
          isClosed: () => true,
          getDaysInPipeline: () => 30,
        },
        {
          stage: 'closed_lost',
          outcome: 'lost',
          isClosed: () => true,
          getDaysInPipeline: () => 15,
        },
      ];

      (DealPipeline.findAll as jest.Mock).mockResolvedValue(mockPipelines);

      const stats = await pipelineService.getPipelineStats('user-123');

      expect(stats.totalDeals).toBe(4);
      expect(stats.byStage.new).toBe(1);
      expect(stats.byStage.analyzing).toBe(1);
      expect(stats.byStage.closed_won).toBe(1);
      expect(stats.byStage.closed_lost).toBe(1);
      expect(stats.closedWon).toBe(1);
      expect(stats.closedLost).toBe(1);
      expect(stats.winRate).toBe(50); // 1 won / (1 won + 1 lost) * 100
      expect(stats.avgDaysInPipeline).toBe(22.5); // (30 + 15) / 2
    });

    it('should handle empty pipeline', async () => {
      (DealPipeline.findAll as jest.Mock).mockResolvedValue([]);

      const stats = await pipelineService.getPipelineStats('user-123');

      expect(stats.totalDeals).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.avgDaysInPipeline).toBe(0);
    });

    it('should work without userId filter (admin view)', async () => {
      (DealPipeline.findAll as jest.Mock).mockResolvedValue([]);

      await pipelineService.getPipelineStats();

      expect(DealPipeline.findAll).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  // ============================================================================
  // CONVERSION RATES TESTS
  // ============================================================================

  describe('getConversionRates', () => {
    it('should calculate stage transition rates', async () => {
      const mockPipelines = [
        {
          stageHistory: [
            { stage: 'new' },
            { stage: 'analyzing' },
            { stage: 'closed_won' },
          ],
          outcome: 'won',
          isClosed: () => true,
          getDaysInPipeline: () => 20,
        },
        {
          stageHistory: [
            { stage: 'new' },
            { stage: 'analyzing' },
            { stage: 'closed_lost' },
          ],
          outcome: 'lost',
          isClosed: () => true,
          getDaysInPipeline: () => 15,
        },
      ];

      (DealPipeline.findAll as jest.Mock).mockResolvedValue(mockPipelines);

      const rates = await pipelineService.getConversionRates('user-123');

      expect(rates.overallWinRate).toBe(50);
      expect(rates.avgTimeToClose).toBe(20); // Only won deals
      expect(rates.stages.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // STAGE TIMING TESTS
  // ============================================================================

  describe('getAverageTimeByStage', () => {
    it('should calculate average time per stage', async () => {
      const mockPipelines = [
        {
          getStageTimings: () => ({
            new: 2,
            analyzing: 5,
          }),
        },
        {
          getStageTimings: () => ({
            new: 4,
            analyzing: 3,
          }),
        },
      ];

      (DealPipeline.findAll as jest.Mock).mockResolvedValue(mockPipelines);

      const timings = await pipelineService.getAverageTimeByStage('user-123');

      expect(timings.new.avgDays).toBe(3); // (2 + 4) / 2
      expect(timings.new.minDays).toBe(2);
      expect(timings.new.maxDays).toBe(4);
      expect(timings.analyzing.avgDays).toBe(4); // (5 + 3) / 2
    });
  });

  // ============================================================================
  // FIND BY DEAL ID TESTS
  // ============================================================================

  describe('findByDealId', () => {
    it('should find pipeline item by deal ID', async () => {
      const mockPipeline = { id: 'pipeline-123', dealId: 'deal-456' };

      (DealPipeline.findOne as jest.Mock).mockResolvedValue(mockPipeline);

      const result = await pipelineService.findByDealId('user-123', 'deal-456');

      expect(DealPipeline.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-123', dealId: 'deal-456' },
      });
      expect(result).toEqual(mockPipeline);
    });

    it('should return null if not found', async () => {
      (DealPipeline.findOne as jest.Mock).mockResolvedValue(null);

      const result = await pipelineService.findByDealId('user-123', 'nonexistent');

      expect(result).toBeNull();
    });
  });
});
