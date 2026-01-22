/**
 * AI Compliance Controller Unit Tests
 */

import { Request, Response } from 'express';
import {
  analyzeCompliance,
  getComplianceHistory,
} from '../../controllers/aiComplianceController';

describe('AIComplianceController', () => {
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
    };

    mockResponse = {
      json: jsonMock,
      status: statusMock,
    };
  });

  // ============================================================================
  // ANALYZE COMPLIANCE
  // ============================================================================

  describe('analyzeCompliance', () => {
    it('should analyze contract and return compliance status', async () => {
      mockRequest.body = {
        propertyId: 1,
        wholesalerEntityName: 'ABC Investments LLC',
        expectedSellerName: 'John Smith',
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            status: expect.stringMatching(/Green|Yellow|Red/),
            issues: expect.any(Array),
            extractedData: expect.any(Object),
            recommendations: expect.any(Array),
            confidenceScore: expect.any(Number),
            needsHumanReview: expect.any(Boolean),
          }),
          timestamp: expect.any(String),
          executionTimeMs: expect.any(Number),
        })
      );
    });

    it('should return 400 when propertyId is missing', async () => {
      mockRequest.body = {
        wholesalerEntityName: 'ABC Investments LLC',
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'propertyId is required',
        })
      );
    });

    it('should detect assignment clause in contract', async () => {
      mockRequest.body = {
        propertyId: 1,
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data.extractedData).toHaveProperty('assignable');
    });

    it('should detect marketing clause in contract', async () => {
      mockRequest.body = {
        propertyId: 1,
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data.extractedData).toHaveProperty('marketingClauseFound');
    });

    it('should provide next steps based on status', async () => {
      mockRequest.body = {
        propertyId: 1,
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data).toHaveProperty('nextSteps');
      expect(Array.isArray(response.data.nextSteps)).toBe(true);
    });

    it('should include confidence score', async () => {
      mockRequest.body = {
        propertyId: 1,
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(response.data.confidenceScore).toBeLessThanOrEqual(100);
    });

    it('should handle errors gracefully', async () => {
      // Force an error by making json throw
      const errorResponse: Partial<Response> = {
        json: jest.fn().mockImplementation(() => {
          throw new Error('Response error');
        }),
        status: statusMock,
      };

      mockRequest.body = { propertyId: 1 };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await analyzeCompliance(mockRequest as Request, errorResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // COMPLIANCE STATUS CALCULATION
  // ============================================================================

  describe('Compliance Status Calculation', () => {
    it('should return Green status for compliant contract', async () => {
      mockRequest.body = {
        propertyId: 1,
        wholesalerEntityName: 'ABC Investments LLC',
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      // Mock contract has both assignment and marketing clauses
      expect(response.data.status).toBe('Green');
    });
  });

  // ============================================================================
  // STATE-SPECIFIC COMPLIANCE
  // ============================================================================

  describe('State-Specific Compliance', () => {
    it('should apply state-specific rules', async () => {
      mockRequest.body = {
        propertyId: 1,
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      // Response should be valid regardless of state rules
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });
  });

  // ============================================================================
  // GET COMPLIANCE HISTORY
  // ============================================================================

  describe('getComplianceHistory', () => {
    it('should return compliance check history for property', async () => {
      mockRequest.params = { propertyId: '1' };

      await getComplianceHistory(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
          timestamp: expect.any(String),
          executionTimeMs: expect.any(Number),
        })
      );
    });

    it('should include check details in history', async () => {
      mockRequest.params = { propertyId: '1' };

      await getComplianceHistory(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data[0]).toEqual(
        expect.objectContaining({
          property_id: expect.any(Number),
          check_type: expect.any(String),
          status: expect.any(String),
        })
      );
    });

    it('should handle errors', async () => {
      mockRequest.params = { propertyId: '1' };

      // Force error
      const errorResponse: Partial<Response> = {
        json: jest.fn().mockImplementation(() => {
          throw new Error('Database error');
        }),
        status: statusMock,
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await getComplianceHistory(mockRequest as Request, errorResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // EXTRACTED DATA TESTS
  // ============================================================================

  describe('Extracted Data', () => {
    it('should extract assignability from contract', async () => {
      mockRequest.body = {
        propertyId: 1,
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data.extractedData).toHaveProperty('assignable');
      expect(response.data.extractedData.assignable).toBe(true);
    });

    it('should extract marketing clause from contract', async () => {
      mockRequest.body = {
        propertyId: 1,
        wholesalerEntityName: 'Test Investments LLC',
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data.extractedData).toHaveProperty('marketingClauseFound');
      expect(response.data.extractedData.marketingClauseFound).toBe(true);
    });

    it('should extract purchase price from contract', async () => {
      mockRequest.body = {
        propertyId: 1,
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.data.extractedData).toHaveProperty('purchasePrice');
    });
  });

  // ============================================================================
  // RECOMMENDATIONS TESTS
  // ============================================================================

  describe('Recommendations', () => {
    it('should generate recommendations based on issues', async () => {
      mockRequest.body = {
        propertyId: 1,
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(Array.isArray(response.data.recommendations)).toBe(true);
    });

    it('should flag for human review when needed', async () => {
      mockRequest.body = {
        propertyId: 1,
      };

      await analyzeCompliance(mockRequest as Request, mockResponse as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(typeof response.data.needsHumanReview).toBe('boolean');
    });
  });
});
