/**
 * Inquiry Controller
 *
 * Handles API requests for the buyer-seller inquiry system.
 * - Buyers can view their inquiries
 * - Admins/Sellers can view and answer inquiries
 */

import { Request, Response } from 'express';
import { inquiryService } from '../services/InquiryService';
import { InquiryStatus, InquiryPriority, InquiryCategory } from '../models/PropertyInquiry';

export const inquiryController = {
  // ============================================================================
  // BUYER ENDPOINTS
  // ============================================================================

  /**
   * Get buyer's inquiries
   */
  async getMyInquiries(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { status } = req.query;

      const inquiries = await inquiryService.getBuyerInquiries(
        userId,
        status as InquiryStatus | undefined
      );

      res.json({
        success: true,
        data: inquiries,
        count: inquiries.length,
      });
    } catch (error) {
      console.error('Error getting buyer inquiries:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Cancel a pending inquiry (buyer only)
   */
  async cancelInquiry(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const inquiry = await inquiryService.cancelInquiry(parseInt(id), userId);

      res.json({
        success: true,
        data: inquiry,
        message: 'Inquiry cancelled successfully',
      });
    } catch (error) {
      console.error('Error cancelling inquiry:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // ADMIN/SELLER ENDPOINTS
  // ============================================================================

  /**
   * Get all pending inquiries (admin view)
   */
  async getPendingInquiries(req: Request, res: Response) {
    try {
      const { limit, offset, priority, category } = req.query;

      const result = await inquiryService.getAllPendingInquiries({
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        priority: priority as InquiryPriority | undefined,
        category: category as InquiryCategory | undefined,
      });

      res.json({
        success: true,
        data: result.inquiries,
        pagination: {
          total: result.total,
          limit: limit ? parseInt(limit as string) : 50,
          offset: offset ? parseInt(offset as string) : 0,
        },
      });
    } catch (error) {
      console.error('Error getting pending inquiries:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get inquiries for a specific property
   */
  async getPropertyInquiries(req: Request, res: Response) {
    try {
      const { propertyId } = req.params;

      const inquiries = await inquiryService.getPendingInquiries(
        parseInt(propertyId)
      );

      res.json({
        success: true,
        data: inquiries,
        count: inquiries.length,
      });
    } catch (error) {
      console.error('Error getting property inquiries:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get a specific inquiry
   */
  async getInquiry(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const inquiry = await inquiryService.getInquiry(parseInt(id));

      if (!inquiry) {
        return res.status(404).json({
          success: false,
          error: 'Inquiry not found',
        });
      }

      res.json({
        success: true,
        data: inquiry,
      });
    } catch (error) {
      console.error('Error getting inquiry:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Answer an inquiry (admin/seller)
   */
  async answerInquiry(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { response, role } = req.body;

      if (!response || typeof response !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Response is required',
        });
      }

      if (response.length > 5000) {
        return res.status(400).json({
          success: false,
          error: 'Response too long. Maximum 5,000 characters.',
        });
      }

      const inquiry = await inquiryService.answerInquiry({
        inquiryId: parseInt(id),
        response,
        answeredBy: userId,
        answeredByRole: role || 'admin',
      });

      res.json({
        success: true,
        data: inquiry,
        message: 'Inquiry answered successfully. Buyer has been notified.',
      });
    } catch (error) {
      console.error('Error answering inquiry:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get inquiry statistics
   */
  async getStats(req: Request, res: Response) {
    try {
      const stats = await inquiryService.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Error getting inquiry stats:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // BULK ACTIONS
  // ============================================================================

  /**
   * Bulk answer inquiries
   */
  async bulkAnswerInquiries(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { inquiryIds, response, role } = req.body;

      if (!Array.isArray(inquiryIds) || inquiryIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'inquiryIds must be a non-empty array',
        });
      }

      if (!response || typeof response !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Response is required',
        });
      }

      if (inquiryIds.length > 50) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 50 inquiries can be answered at once',
        });
      }

      const result = await inquiryService.bulkAnswerInquiries(
        inquiryIds,
        response,
        userId,
        role || 'admin'
      );

      res.json({
        success: true,
        data: result,
        message: `Answered ${result.success} inquiries, ${result.failed} failed`,
      });
    } catch (error) {
      console.error('Error bulk answering inquiries:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Bulk cancel inquiries
   */
  async bulkCancelInquiries(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { inquiryIds } = req.body;

      if (!Array.isArray(inquiryIds) || inquiryIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'inquiryIds must be a non-empty array',
        });
      }

      if (inquiryIds.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 100 inquiries can be cancelled at once',
        });
      }

      const result = await inquiryService.bulkCancelInquiries(inquiryIds, userId);

      res.json({
        success: true,
        data: result,
        message: `Cancelled ${result.success} inquiries`,
      });
    } catch (error) {
      console.error('Error bulk cancelling inquiries:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Get inquiry analytics
   */
  async getAnalytics(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      const analytics = await inquiryService.getAnalytics({
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error('Error getting inquiry analytics:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },
};

export default inquiryController;
