/**
 * HumanApprovalService
 *
 * Manages human-in-the-loop approval workflow for destructive agent actions.
 * Handles approval request creation, timeout, and resolution.
 */

import { Op } from 'sequelize';
import HumanApprovalRequest, { ApprovalStatus } from '../../models/HumanApprovalRequest';
import { logger } from '../../utils/logger';
import type { ApprovalRequest, ApprovalResponse } from './types';

// Default approval timeout in seconds
const DEFAULT_APPROVAL_TIMEOUT = 300; // 5 minutes

// In-memory map of pending approval promises
const pendingApprovals = new Map<
  string,
  {
    resolve: (response: ApprovalResponse) => void;
    reject: (error: Error) => void;
    timeoutId: NodeJS.Timeout;
  }
>();

class HumanApprovalService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    logger.info('HumanApprovalService initialized');

    // Start cleanup of expired approvals
    this.startExpirationChecker();
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Create an approval request and wait for response
   */
  async requestApproval(
    userId: string,
    sessionId: string,
    requestId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    reason: string,
    timeoutSeconds: number = DEFAULT_APPROVAL_TIMEOUT
  ): Promise<ApprovalResponse> {
    const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);

    // Create database record
    const request = await HumanApprovalRequest.create({
      userId,
      sessionId,
      requestId,
      toolName,
      toolInput,
      approvalReason: reason,
      status: 'pending',
      expiresAt,
    });

    logger.info({ approvalId: request.id, toolName, userId }, 'Approval request created');

    // Create promise that resolves when approved/rejected/expired
    return new Promise<ApprovalResponse>((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(async () => {
        pendingApprovals.delete(request.id);
        await this.handleExpiration(request.id);
        resolve({ approved: false, reason: 'Approval request timed out' });
      }, timeoutSeconds * 1000);

      // Store in pending map
      pendingApprovals.set(request.id, { resolve, reject, timeoutId });
    });
  }

  /**
   * Approve a pending request
   */
  async approve(approvalId: string, respondedBy?: string): Promise<boolean> {
    const request = await HumanApprovalRequest.findByPk(approvalId);

    if (!request || !request.isPending()) {
      return false;
    }

    await request.approve(respondedBy);

    // Resolve the pending promise
    const pending = pendingApprovals.get(approvalId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.resolve({ approved: true });
      pendingApprovals.delete(approvalId);
    }

    logger.info({ approvalId, respondedBy }, 'Approval request approved');
    return true;
  }

  /**
   * Reject a pending request
   */
  async reject(approvalId: string, reason?: string, respondedBy?: string): Promise<boolean> {
    const request = await HumanApprovalRequest.findByPk(approvalId);

    if (!request || !request.isPending()) {
      return false;
    }

    await request.reject(reason, respondedBy);

    // Resolve the pending promise
    const pending = pendingApprovals.get(approvalId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.resolve({ approved: false, reason });
      pendingApprovals.delete(approvalId);
    }

    logger.info({ approvalId, reason, respondedBy }, 'Approval request rejected');
    return true;
  }

  /**
   * Get approval request by ID
   */
  async getRequest(approvalId: string): Promise<HumanApprovalRequest | null> {
    return HumanApprovalRequest.findByPk(approvalId);
  }

  /**
   * List pending approvals for a user
   */
  async listPendingForUser(userId: string): Promise<HumanApprovalRequest[]> {
    return HumanApprovalRequest.findAll({
      where: {
        userId,
        status: 'pending',
        expiresAt: { [Op.gt]: new Date() },
      },
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * List all pending approvals (admin)
   */
  async listAllPending(limit: number = 50): Promise<HumanApprovalRequest[]> {
    return HumanApprovalRequest.findAll({
      where: {
        status: 'pending',
        expiresAt: { [Op.gt]: new Date() },
      },
      order: [['createdAt', 'DESC']],
      limit,
    });
  }

  /**
   * Handle expiration of an approval request
   */
  private async handleExpiration(approvalId: string): Promise<void> {
    const request = await HumanApprovalRequest.findByPk(approvalId);

    if (request && request.status === 'pending') {
      await request.markExpired();
      logger.info({ approvalId }, 'Approval request expired');
    }
  }

  /**
   * Start background checker for expired approvals
   */
  private startExpirationChecker(): void {
    // Check every minute for expired approvals
    setInterval(async () => {
      try {
        const expired = await HumanApprovalRequest.findAll({
          where: {
            status: 'pending',
            expiresAt: { [Op.lt]: new Date() },
          },
        });

        for (const request of expired) {
          // Resolve any pending promises
          const pending = pendingApprovals.get(request.id);
          if (pending) {
            clearTimeout(pending.timeoutId);
            pending.resolve({ approved: false, reason: 'Approval request expired' });
            pendingApprovals.delete(request.id);
          }

          await request.markExpired();
        }

        if (expired.length > 0) {
          logger.info({ count: expired.length }, 'Expired approval requests processed');
        }
      } catch (error) {
        logger.error({ error }, 'Error checking for expired approvals');
      }
    }, 60000); // Every minute
  }

  /**
   * Convert to ApprovalRequest format for streaming
   */
  toStreamEvent(request: HumanApprovalRequest): ApprovalRequest {
    return {
      id: request.id,
      toolName: request.toolName,
      toolInput: request.toolInput,
      reason: request.approvalReason,
      expiresAt: request.expiresAt,
    };
  }

  /**
   * Cleanup old approval records
   */
  async cleanupOldRecords(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await HumanApprovalRequest.destroy({
      where: {
        status: { [Op.in]: ['approved', 'rejected', 'expired'] },
        updatedAt: { [Op.lt]: cutoffDate },
      },
    });

    if (result > 0) {
      logger.info({ count: result }, 'Cleaned up old approval records');
    }

    return result;
  }
}

export const humanApprovalService = new HumanApprovalService();
export default HumanApprovalService;
