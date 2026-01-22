/**
 * PluginController Unit Tests
 */

import { Request, Response } from 'express';
import * as pluginController from '../../controllers/pluginController';

// Mock dependencies
jest.mock('../../plugins', () => ({
  dealProcessingService: {
    getAvailableSourceTypes: jest.fn(),
    getActiveSources: jest.fn(),
    addDealSource: jest.fn(),
    removeDealSource: jest.fn(),
    fetchDealsFromSource: jest.fn(),
    fetchDealsFromAllSources: jest.fn(),
    handleSourceWebhook: jest.fn(),
    getAllBuyBoxes: jest.fn(),
    addBuyBox: jest.fn(),
    updateBuyBox: jest.fn(),
    removeBuyBox: jest.fn(),
    scoreDeal: jest.fn(),
    findBestMatches: jest.fn(),
    enrichDeal: jest.fn(),
    analyzeDeal: jest.fn(),
    getAllAutomations: jest.fn(),
    addAutomation: jest.fn(),
    triggerAutomation: jest.fn(),
    getAllWorkflows: jest.fn(),
    getWorkflowTemplates: jest.fn(),
    addWorkflow: jest.fn(),
    startWorkflow: jest.fn(),
    resumeWorkflow: jest.fn(),
    getPendingReviews: jest.fn(),
    submitReview: jest.fn(),
    processDeal: jest.fn(),
  },
  pluginRegistry: {
    getActiveSource: jest.fn(),
  },
  FirecrawlDealSourcePlugin: jest.fn().mockImplementation(() => ({
    testConnection: jest.fn().mockResolvedValue({ success: true, message: 'Connected' }),
  })),
}));

jest.mock('../../plugins/browser', () => ({
  auctionSubmission: {
    getAllSites: jest.fn(),
    registerSite: jest.fn(),
    getSite: jest.fn(),
    updateCredentials: jest.fn(),
    testLogin: jest.fn(),
    submitDeal: jest.fn(),
    submitToMultipleSites: jest.fn(),
    submitToAllEnabled: jest.fn(),
    getEnabledSites: jest.fn(),
    getRecentJobs: jest.fn(),
    getJob: jest.fn(),
    removeSite: jest.fn(),
  },
}));

jest.mock('../../services/propertyService', () => ({
  propertyService: {
    bulkSaveDeals: jest.fn(),
  },
}));

jest.mock('../../models/Property', () => ({
  findOne: jest.fn(),
  findAll: jest.fn(),
}));

import { dealProcessingService, pluginRegistry } from '../../plugins';
import { auctionSubmission } from '../../plugins/browser';

describe('PluginController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockRequest = {
      params: {},
      body: {},
      query: {},
      headers: {},
    };

    mockResponse = {
      json: jsonMock,
      status: statusMock,
    };
  });

  // ============================================================================
  // DEAL SOURCES TESTS
  // ============================================================================

  describe('Deal Sources', () => {
    describe('getAvailableSourceTypes', () => {
      it('should return available source types', async () => {
        const mockTypes = ['api', 'csv', 'webhook', 'email', 'firecrawl'];
        (dealProcessingService.getAvailableSourceTypes as jest.Mock).mockReturnValue(mockTypes);

        await pluginController.getAvailableSourceTypes(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockTypes,
          })
        );
      });

      it('should handle errors', async () => {
        (dealProcessingService.getAvailableSourceTypes as jest.Mock).mockImplementation(() => {
          throw new Error('Service error');
        });

        await pluginController.getAvailableSourceTypes(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Service error',
          })
        );
      });
    });

    describe('getActiveSources', () => {
      it('should return active sources', async () => {
        const mockSources = [{ id: 'source-1', name: 'Test Source' }];
        (dealProcessingService.getActiveSources as jest.Mock).mockReturnValue(mockSources);

        await pluginController.getActiveSources(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockSources,
          })
        );
      });
    });

    describe('addDealSource', () => {
      it('should add deal source successfully', async () => {
        mockRequest.body = { name: 'New Source', type: 'api' };
        (dealProcessingService.addDealSource as jest.Mock).mockResolvedValue({ success: true });

        await pluginController.addDealSource(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(statusMock).toHaveBeenCalledWith(201);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
          })
        );
      });

      it('should return 400 on validation failure', async () => {
        mockRequest.body = { name: 'Invalid Source' };
        (dealProcessingService.addDealSource as jest.Mock).mockResolvedValue({
          success: false,
          errors: ['Invalid type'],
        });

        await pluginController.addDealSource(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(statusMock).toHaveBeenCalledWith(400);
      });
    });

    describe('removeDealSource', () => {
      it('should remove deal source', async () => {
        mockRequest.params = { sourceId: 'source-1' };
        (dealProcessingService.removeDealSource as jest.Mock).mockResolvedValue(undefined);

        await pluginController.removeDealSource(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            message: 'Source source-1 removed',
          })
        );
      });
    });

    describe('fetchDealsFromSource', () => {
      it('should fetch deals from source', async () => {
        mockRequest.params = { sourceId: 'source-1' };
        const mockResult = { success: true, deals: [{ id: 'deal-1' }] };
        (dealProcessingService.fetchDealsFromSource as jest.Mock).mockResolvedValue(mockResult);

        await pluginController.fetchDealsFromSource(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockResult,
          })
        );
      });
    });
  });

  // ============================================================================
  // BUY BOXES TESTS
  // ============================================================================

  describe('Buy Boxes', () => {
    describe('getAllBuyBoxes', () => {
      it('should return all buy boxes', async () => {
        const mockBuyBoxes = [{ id: 'bb-1', name: 'Test Buy Box' }];
        (dealProcessingService.getAllBuyBoxes as jest.Mock).mockReturnValue(mockBuyBoxes);

        await pluginController.getAllBuyBoxes(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockBuyBoxes,
          })
        );
      });
    });

    describe('addBuyBox', () => {
      it('should add buy box', async () => {
        mockRequest.body = {
          name: 'New Buy Box',
          criteria: { states: ['TX'] },
        };
        (dealProcessingService.addBuyBox as jest.Mock).mockResolvedValue(undefined);

        await pluginController.addBuyBox(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(statusMock).toHaveBeenCalledWith(201);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
          })
        );
      });
    });

    describe('updateBuyBox', () => {
      it('should update buy box', async () => {
        mockRequest.params = { buyBoxId: 'bb-1' };
        mockRequest.body = { name: 'Updated Buy Box' };
        (dealProcessingService.updateBuyBox as jest.Mock).mockResolvedValue(undefined);

        await pluginController.updateBuyBox(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
          })
        );
      });
    });

    describe('removeBuyBox', () => {
      it('should remove buy box', async () => {
        mockRequest.params = { buyBoxId: 'bb-1' };
        (dealProcessingService.removeBuyBox as jest.Mock).mockResolvedValue(undefined);

        await pluginController.removeBuyBox(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            message: 'Buy box bb-1 removed',
          })
        );
      });
    });

    describe('scoreDeal', () => {
      it('should score deal against buy boxes', async () => {
        mockRequest.body = {
          address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
          askingPrice: 200000,
        };
        const mockResults = [{ buyBoxId: 'bb-1', score: 85 }];
        (dealProcessingService.scoreDeal as jest.Mock).mockResolvedValue(mockResults);

        await pluginController.scoreDeal(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockResults,
          })
        );
      });
    });

    describe('findBestMatches', () => {
      it('should find best matching buy boxes', async () => {
        mockRequest.body = {
          address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        };
        mockRequest.query = { limit: '3' };
        const mockMatches = [{ buyBoxId: 'bb-1', score: 90 }];
        (dealProcessingService.findBestMatches as jest.Mock).mockResolvedValue(mockMatches);

        await pluginController.findBestMatches(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(dealProcessingService.findBestMatches).toHaveBeenCalledWith(
          expect.any(Object),
          3
        );
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockMatches,
          })
        );
      });
    });
  });

  // ============================================================================
  // AUTOMATIONS TESTS
  // ============================================================================

  describe('Automations', () => {
    describe('getAllAutomations', () => {
      it('should return all automations', async () => {
        const mockAutomations = [{ id: 'auto-1', name: 'Test Automation' }];
        (dealProcessingService.getAllAutomations as jest.Mock).mockReturnValue(mockAutomations);

        await pluginController.getAllAutomations(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockAutomations,
          })
        );
      });
    });

    describe('addAutomation', () => {
      it('should add automation', async () => {
        mockRequest.body = {
          name: 'New Automation',
          trigger: { type: 'deal_score', threshold: 80 },
          actions: [{ type: 'notify' }],
        };
        (dealProcessingService.addAutomation as jest.Mock).mockReturnValue(undefined);

        await pluginController.addAutomation(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(statusMock).toHaveBeenCalledWith(201);
      });
    });

    describe('triggerAutomation', () => {
      it('should trigger automation', async () => {
        mockRequest.params = { automationId: 'auto-1' };
        mockRequest.body = { dealId: 'deal-1' };
        const mockResult = { success: true, actions: ['notified'] };
        (dealProcessingService.triggerAutomation as jest.Mock).mockResolvedValue(mockResult);

        await pluginController.triggerAutomation(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockResult,
          })
        );
      });
    });
  });

  // ============================================================================
  // WORKFLOWS TESTS
  // ============================================================================

  describe('Workflows', () => {
    describe('getAllWorkflows', () => {
      it('should return all workflows', async () => {
        const mockWorkflows = [{ id: 'wf-1', name: 'Test Workflow' }];
        (dealProcessingService.getAllWorkflows as jest.Mock).mockReturnValue(mockWorkflows);

        await pluginController.getAllWorkflows(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockWorkflows,
          })
        );
      });
    });

    describe('getWorkflowTemplates', () => {
      it('should return workflow templates', async () => {
        const mockTemplates = [{ id: 'tpl-1', name: 'Standard Workflow' }];
        (dealProcessingService.getWorkflowTemplates as jest.Mock).mockReturnValue(mockTemplates);

        await pluginController.getWorkflowTemplates(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockTemplates,
          })
        );
      });
    });

    describe('startWorkflow', () => {
      it('should start workflow for deal', async () => {
        mockRequest.params = { workflowId: 'wf-1' };
        mockRequest.body = { address: { street: '123 Main St' } };
        const mockExecution = { executionId: 'exec-1', status: 'running' };
        (dealProcessingService.startWorkflow as jest.Mock).mockResolvedValue(mockExecution);

        await pluginController.startWorkflow(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockExecution,
          })
        );
      });
    });

    describe('resumeWorkflow', () => {
      it('should resume paused workflow', async () => {
        mockRequest.params = { executionId: 'exec-1' };
        mockRequest.body = { approved: true };
        const mockExecution = { executionId: 'exec-1', status: 'running' };
        (dealProcessingService.resumeWorkflow as jest.Mock).mockResolvedValue(mockExecution);

        await pluginController.resumeWorkflow(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockExecution,
          })
        );
      });
    });
  });

  // ============================================================================
  // AUCTION SITES TESTS
  // ============================================================================

  describe('Auction Sites', () => {
    describe('getAuctionSites', () => {
      it('should return auction sites with redacted credentials', async () => {
        const mockSites = [
          {
            id: 'site-1',
            name: 'Xome',
            credentials: { username: 'user', password: 'pass' },
          },
        ];
        (auctionSubmission.getAllSites as jest.Mock).mockReturnValue(mockSites);

        await pluginController.getAuctionSites(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.arrayContaining([
              expect.objectContaining({
                id: 'site-1',
                credentials: { username: '***configured***', password: '***configured***' },
              }),
            ]),
          })
        );
      });
    });

    describe('registerAuctionSite', () => {
      it('should register auction site', async () => {
        mockRequest.body = {
          id: 'site-1',
          name: 'New Site',
          type: 'auction',
          enabled: true,
        };
        (auctionSubmission.registerSite as jest.Mock).mockReturnValue(undefined);

        await pluginController.registerAuctionSite(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(statusMock).toHaveBeenCalledWith(201);
      });

      it('should return 400 for missing fields', async () => {
        mockRequest.body = { name: 'Incomplete Site' };

        await pluginController.registerAuctionSite(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(statusMock).toHaveBeenCalledWith(400);
      });
    });

    describe('updateAuctionCredentials', () => {
      it('should update credentials', async () => {
        mockRequest.params = { siteId: 'site-1' };
        mockRequest.body = { username: 'newuser', password: 'newpass' };
        (auctionSubmission.getSite as jest.Mock).mockReturnValue({ id: 'site-1', name: 'Site' });
        (auctionSubmission.updateCredentials as jest.Mock).mockReturnValue(undefined);

        await pluginController.updateAuctionCredentials(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
          })
        );
      });

      it('should return 404 for non-existent site', async () => {
        mockRequest.params = { siteId: 'nonexistent' };
        mockRequest.body = { username: 'user', password: 'pass' };
        (auctionSubmission.getSite as jest.Mock).mockReturnValue(null);

        await pluginController.updateAuctionCredentials(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(statusMock).toHaveBeenCalledWith(404);
      });
    });

    describe('testAuctionLogin', () => {
      it('should test login successfully', async () => {
        mockRequest.params = { siteId: 'site-1' };
        (auctionSubmission.getSite as jest.Mock).mockReturnValue({
          id: 'site-1',
          name: 'Site',
          credentials: { username: 'user', password: 'pass' },
        });
        (auctionSubmission.testLogin as jest.Mock).mockResolvedValue({ success: true });

        await pluginController.testAuctionLogin(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
          })
        );
      });

      it('should return 400 for unconfigured credentials', async () => {
        mockRequest.params = { siteId: 'site-1' };
        (auctionSubmission.getSite as jest.Mock).mockReturnValue({
          id: 'site-1',
          name: 'Site',
          credentials: {},
        });

        await pluginController.testAuctionLogin(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(statusMock).toHaveBeenCalledWith(400);
      });
    });

    describe('submitToAuction', () => {
      it('should submit deal to auction', async () => {
        mockRequest.params = { siteId: 'site-1' };
        mockRequest.body = {
          address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
        };
        (auctionSubmission.submitDeal as jest.Mock).mockResolvedValue({
          success: true,
          confirmationNumber: 'CONF-123',
        });

        await pluginController.submitToAuction(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
          })
        );
      });

      it('should return 400 for missing address', async () => {
        mockRequest.params = { siteId: 'site-1' };
        mockRequest.body = {};

        await pluginController.submitToAuction(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(statusMock).toHaveBeenCalledWith(400);
      });
    });

    describe('getSubmissionJobs', () => {
      it('should return recent jobs', async () => {
        mockRequest.query = { limit: '5' };
        const mockJobs = [{ id: 'job-1', status: 'completed' }];
        (auctionSubmission.getRecentJobs as jest.Mock).mockReturnValue(mockJobs);

        await pluginController.getSubmissionJobs(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(auctionSubmission.getRecentJobs).toHaveBeenCalledWith(5);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockJobs,
          })
        );
      });
    });
  });

  // ============================================================================
  // DEAL PROCESSING TESTS
  // ============================================================================

  describe('Deal Processing', () => {
    describe('processDeal', () => {
      it('should process deal through pipeline', async () => {
        mockRequest.body = {
          deal: { address: { street: '123 Main St' } },
          options: { enrich: true },
        };
        const mockResult = { status: 'completed', score: 85 };
        (dealProcessingService.processDeal as jest.Mock).mockResolvedValue(mockResult);

        await pluginController.processDeal(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockResult,
          })
        );
      });
    });

    describe('enrichDeal', () => {
      it('should enrich deal with external data', async () => {
        mockRequest.body = {
          deal: { address: { street: '123 Main St' } },
          providers: ['zillow'],
        };
        const mockEnriched = { arv: 300000 };
        (dealProcessingService.enrichDeal as jest.Mock).mockResolvedValue(mockEnriched);

        await pluginController.enrichDeal(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockEnriched,
          })
        );
      });
    });

    describe('analyzeDeal', () => {
      it('should analyze deal', async () => {
        mockRequest.body = { address: { street: '123 Main St' } };
        const mockAnalysis = { recommendation: 'buy', score: 90 };
        (dealProcessingService.analyzeDeal as jest.Mock).mockResolvedValue(mockAnalysis);

        await pluginController.analyzeDeal(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockAnalysis,
          })
        );
      });
    });
  });

  // ============================================================================
  // REVIEWS TESTS
  // ============================================================================

  describe('Reviews', () => {
    describe('getPendingReviews', () => {
      it('should return pending reviews', async () => {
        const mockReviews = [{ id: 'review-1', dealId: 'deal-1' }];
        (dealProcessingService.getPendingReviews as jest.Mock).mockReturnValue(mockReviews);

        await pluginController.getPendingReviews(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockReviews,
          })
        );
      });
    });

    describe('submitReview', () => {
      it('should submit review', async () => {
        mockRequest.params = { reviewId: 'review-1' };
        mockRequest.body = { approved: true, notes: 'Looks good' };
        (dealProcessingService.submitReview as jest.Mock).mockResolvedValue(undefined);

        await pluginController.submitReview(
          mockRequest as Request,
          mockResponse as Response
        );

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            message: 'Review submitted',
          })
        );
      });
    });
  });
});
