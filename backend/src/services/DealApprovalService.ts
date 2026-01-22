/**
 * Deal Approval Service
 *
 * Handles the broker approval workflow for deals.
 * Integrates with ComplianceService for auto-queuing
 * and BrokerService for broker assignment.
 */

import Property from '../models/Property';
import BrokerProfile from '../models/BrokerProfile';
import MarketplaceUser from '../models/MarketplaceUser';
import { brokerService } from './BrokerService';
import { complianceEventStream } from './ComplianceEventStream';
import { complianceTriggerService } from './ComplianceTriggerService';
import { activityFeedService } from './ActivityFeedService';
import { Op } from 'sequelize';

export type ApprovalStatus = 'draft' | 'pending_broker_approval' | 'approved' | 'rejected' | 'live';

export interface ApprovalHistoryEntry {
  action: 'queued' | 'approved' | 'rejected' | 'changes_requested' | 'resubmitted' | 'made_live';
  performedBy: string;
  performedByName?: string;
  timestamp: Date;
  notes?: string;
}

export interface ApprovalStats {
  pending: number;
  approvedThisWeek: number;
  rejectedThisWeek: number;
  avgApprovalTimeHours: number;
}

class DealApprovalService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('DealApprovalService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Queue a deal for broker approval
   * Called automatically when compliance passes (Green)
   */
  async queueForApproval(propertyId: number): Promise<Property> {
    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    // Only queue if currently in draft
    if (property.approvalStatus && property.approvalStatus !== 'draft') {
      console.log(`Property ${propertyId} already has approval status: ${property.approvalStatus}`);
      return property;
    }

    // Validate property has a state
    if (!property.state) {
      throw new Error(`Property ${propertyId} has no state set - cannot assign a broker`);
    }

    // Get an available broker for this property's state
    const brokerResult = await brokerService.getAvailableBroker(property.state);

    if (!brokerResult.success || !brokerResult.brokerId) {
      throw new Error(`No broker available for state ${property.state}. Register a broker first.`);
    }

    // Assign broker and update status
    await brokerService.assignBrokerToDeal(brokerResult.brokerId);

    await property.update({
      approvalStatus: 'pending_broker_approval',
      assignedBrokerId: brokerResult.brokerId,
      submittedForApprovalAt: new Date(),
      processingState: 'approval_pending',
      processingStateUpdatedAt: new Date(),
    });

    console.log(`✓ Property ${propertyId} queued for broker approval (broker: ${brokerResult.brokerName})`);

    // Fire compliance triggers for broker assignment and status change
    complianceTriggerService
      .handlePropertyEvent('property.broker_assigned', propertyId, {
        brokerId: brokerResult.brokerId,
        brokerName: brokerResult.brokerName,
        state: property.state,
      })
      .catch(err => console.warn('Broker assigned trigger failed:', err.message));

    complianceTriggerService
      .handlePropertyEvent('property.status_changed', propertyId, {
        previousStatus: 'draft',
        newStatus: 'pending_broker_approval',
        state: property.state,
      })
      .catch(err => console.warn('Status changed trigger failed:', err.message));

    return property;
  }

  /**
   * Get deals pending broker approval for a specific broker
   */
  async getPendingApprovals(brokerId: string): Promise<Property[]> {
    return Property.findAll({
      where: {
        assignedBrokerId: brokerId,
        approvalStatus: 'pending_broker_approval',
      },
      order: [['submittedForApprovalAt', 'ASC']],
    });
  }

  /**
   * Get all deals assigned to a broker (any status)
   */
  async getBrokerDeals(brokerId: string, status?: ApprovalStatus): Promise<Property[]> {
    const where: any = { assignedBrokerId: brokerId };
    if (status) {
      where.approvalStatus = status;
    }

    return Property.findAll({
      where,
      order: [['updatedAt', 'DESC']],
    });
  }

  /**
   * Broker approves a deal - automatically goes live
   */
  async approveDeal(
    propertyId: number,
    brokerId: string,
    notes?: string
  ): Promise<Property> {
    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    // Verify broker is assigned to this deal
    if (property.assignedBrokerId !== brokerId) {
      throw new Error('You are not authorized to approve this deal');
    }

    if (property.approvalStatus !== 'pending_broker_approval') {
      throw new Error(`Cannot approve deal with status: ${property.approvalStatus}`);
    }

    // Approve and automatically go live
    await property.update({
      approvalStatus: 'live',
      approvedAt: new Date(),
      approvedBy: brokerId,
      approvalNotes: notes || undefined,
      processingState: 'active',
      processingStateUpdatedAt: new Date(),
      // Clear any previous rejection/changes fields
      rejectedAt: undefined,
      rejectedBy: undefined,
      rejectionReason: undefined,
      changesRequestedAt: undefined,
      changesRequestedBy: undefined,
      changesRequested: undefined,
    } as any);

    console.log(`✓ Property ${propertyId} approved by broker ${brokerId} and is now LIVE`);

    // Emit compliance event
    complianceEventStream.publish(
      'compliance.broker.approved',
      'property',
      propertyId,
      {
        brokerId,
        brokerNotes: notes || null,
        approvedAt: new Date().toISOString(),
        propertyAddress: property.address,
        propertyState: property.state,
      },
      {
        source: 'broker',
        metadata: {
          action: 'approved',
          assignedBrokerId: brokerId,
        },
      }
    );

    // Fire compliance trigger for status change
    complianceTriggerService
      .handlePropertyEvent('property.status_changed', propertyId, {
        previousStatus: 'pending_broker_approval',
        newStatus: 'live',
        approvedBy: brokerId,
        state: property.state,
      })
      .catch(err => console.warn('Status changed trigger failed:', err.message));

    // Log activity
    BrokerProfile.findByPk(brokerId, {
      include: [{ model: MarketplaceUser, as: 'user', attributes: ['name', 'email'] }],
    }).then((broker) => {
      const dealName = property.address
        ? `${property.address}${property.city ? `, ${property.city}` : ''}`
        : `Deal #${propertyId}`;
      const brokerName = (broker as any)?.user?.name || (broker as any)?.user?.email || 'Broker';
      activityFeedService.createActivity({
        eventType: 'deal_updated',
        actor: {
          type: 'user',
          id: brokerId,
          name: brokerName,
        },
        resource: {
          type: 'deal',
          id: String(propertyId),
          name: dealName,
          url: `/deals/${propertyId}`,
        },
        action: 'approved',
        summary: `${brokerName} approved deal "${dealName}" - now LIVE`,
        details: { notes, state: property.state },
        importance: 'high',
      });
    }).catch(() => {}); // Non-blocking

    return property;
  }

  /**
   * Broker rejects a deal
   */
  async rejectDeal(
    propertyId: number,
    brokerId: string,
    reason: string
  ): Promise<Property> {
    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    // Verify broker is assigned to this deal
    if (property.assignedBrokerId !== brokerId) {
      throw new Error('You are not authorized to reject this deal');
    }

    if (property.approvalStatus !== 'pending_broker_approval') {
      throw new Error(`Cannot reject deal with status: ${property.approvalStatus}`);
    }

    await property.update({
      approvalStatus: 'rejected',
      rejectedAt: new Date(),
      rejectedBy: brokerId,
      rejectionReason: reason,
      processingState: 'rejected',
      processingStateUpdatedAt: new Date(),
    });

    // Decrement broker's active deals since this one is rejected
    await brokerService.completeDeal(brokerId);

    console.log(`✗ Property ${propertyId} rejected by broker ${brokerId}: ${reason}`);

    // Emit compliance event
    complianceEventStream.publish(
      'compliance.broker.rejected',
      'property',
      propertyId,
      {
        brokerId,
        rejectionReason: reason,
        rejectedAt: new Date().toISOString(),
        propertyAddress: property.address,
        propertyState: property.state,
      },
      {
        source: 'broker',
        metadata: {
          action: 'rejected',
          assignedBrokerId: brokerId,
          severity: 'warning',
        },
      }
    );

    // Fire compliance trigger for status change
    complianceTriggerService
      .handlePropertyEvent('property.status_changed', propertyId, {
        previousStatus: 'pending_broker_approval',
        newStatus: 'rejected',
        rejectedBy: brokerId,
        rejectionReason: reason,
        state: property.state,
      })
      .catch(err => console.warn('Status changed trigger failed:', err.message));

    // Log activity
    BrokerProfile.findByPk(brokerId, {
      include: [{ model: MarketplaceUser, as: 'user', attributes: ['name', 'email'] }],
    }).then((broker) => {
      const dealName = property.address
        ? `${property.address}${property.city ? `, ${property.city}` : ''}`
        : `Deal #${propertyId}`;
      const brokerName = (broker as any)?.user?.name || (broker as any)?.user?.email || 'Broker';
      activityFeedService.createActivity({
        eventType: 'deal_updated',
        actor: {
          type: 'user',
          id: brokerId,
          name: brokerName,
        },
        resource: {
          type: 'deal',
          id: String(propertyId),
          name: dealName,
          url: `/deals/${propertyId}`,
        },
        action: 'rejected',
        summary: `${brokerName} rejected deal "${dealName}"`,
        details: { reason, state: property.state },
        importance: 'high',
      });
    }).catch(() => {}); // Non-blocking

    return property;
  }

  /**
   * Broker requests changes before approval
   */
  async requestChanges(
    propertyId: number,
    brokerId: string,
    changes: string
  ): Promise<Property> {
    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    // Verify broker is assigned to this deal
    if (property.assignedBrokerId !== brokerId) {
      throw new Error('You are not authorized to request changes on this deal');
    }

    if (property.approvalStatus !== 'pending_broker_approval') {
      throw new Error(`Cannot request changes on deal with status: ${property.approvalStatus}`);
    }

    await property.update({
      approvalStatus: 'draft', // Back to draft for edits
      changesRequestedAt: new Date(),
      changesRequestedBy: brokerId,
      changesRequested: changes,
      processingState: 'created',
      processingStateUpdatedAt: new Date(),
    });

    console.log(`⚠ Property ${propertyId} needs changes: ${changes}`);

    // Emit compliance event
    complianceEventStream.publish(
      'compliance.broker.changes_requested',
      'property',
      propertyId,
      {
        brokerId,
        changesRequested: changes,
        requestedAt: new Date().toISOString(),
        propertyAddress: property.address,
        propertyState: property.state,
      },
      {
        source: 'broker',
        metadata: {
          action: 'changes_requested',
          assignedBrokerId: brokerId,
          severity: 'info',
        },
      }
    );

    // Fire compliance trigger for status change (back to draft)
    complianceTriggerService
      .handlePropertyEvent('property.status_changed', propertyId, {
        previousStatus: 'pending_broker_approval',
        newStatus: 'draft',
        changesRequestedBy: brokerId,
        changesRequested: changes,
        state: property.state,
      })
      .catch(err => console.warn('Status changed trigger failed:', err.message));

    return property;
  }

  /**
   * Resubmit deal after changes
   * Used when wholesaler fixes issues from requestChanges
   */
  async resubmitForApproval(propertyId: number): Promise<Property> {
    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    if (property.approvalStatus !== 'draft' && property.approvalStatus !== 'rejected') {
      throw new Error(`Cannot resubmit deal with status: ${property.approvalStatus}`);
    }

    // If still has an assigned broker, requeue to same broker
    if (property.assignedBrokerId) {
      await property.update({
        approvalStatus: 'pending_broker_approval',
        submittedForApprovalAt: new Date(),
        // Clear changes requested since they're being addressed
        changesRequested: undefined,
        processingState: 'approval_pending',
        processingStateUpdatedAt: new Date(),
      } as any);
    } else {
      // Need to assign a new broker
      return this.queueForApproval(propertyId);
    }

    console.log(`↻ Property ${propertyId} resubmitted for broker approval`);

    return property;
  }

  /**
   * Check if a deal can be distributed (is it live?)
   */
  canDistribute(property: Property): boolean {
    return property.processingState === 'active' || property.approvalStatus === 'live';
  }

  /**
   * Admin: Force set a deal to live status (bypasses broker approval)
   */
  async adminSetLive(propertyId: number, adminId: string): Promise<Property> {
    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    // Already live? No-op
    if (property.approvalStatus === 'live') {
      console.log(`Property ${propertyId} is already live`);
      return property;
    }

    await property.update({
      approvalStatus: 'live',
      approvedAt: new Date(),
      approvedBy: adminId,
      approvalNotes: 'Admin bypass - set live directly',
      processingState: 'active',
      processingStateUpdatedAt: new Date(),
    });

    console.log(`✓ Admin ${adminId} set property ${propertyId} to LIVE`);
    return property;
  }

  /**
   * Admin: Bulk set multiple deals to live
   */
  async adminBulkSetLive(propertyIds: number[], adminId: string): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of propertyIds) {
      try {
        await this.adminSetLive(id, adminId);
        success++;
      } catch (error) {
        console.error(`Failed to set property ${id} live:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Get approval statistics for a broker
   */
  async getBrokerApprovalStats(brokerId: string): Promise<ApprovalStats> {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Count pending
    const pending = await Property.count({
      where: {
        assignedBrokerId: brokerId,
        approvalStatus: 'pending_broker_approval',
      },
    });

    // Count approved this week
    const approvedThisWeek = await Property.count({
      where: {
        assignedBrokerId: brokerId,
        approvalStatus: 'live',
        approvedAt: { [Op.gte]: oneWeekAgo },
      },
    });

    // Count rejected this week
    const rejectedThisWeek = await Property.count({
      where: {
        assignedBrokerId: brokerId,
        approvalStatus: 'rejected',
        rejectedAt: { [Op.gte]: oneWeekAgo },
      },
    });

    // Calculate average approval time (for deals approved this week)
    const recentApprovals = await Property.findAll({
      where: {
        assignedBrokerId: brokerId,
        approvalStatus: 'live',
        approvedAt: { [Op.gte]: oneWeekAgo },
        submittedForApprovalAt: { [Op.ne]: null as any },
      } as any,
      attributes: ['submittedForApprovalAt', 'approvedAt'],
    });

    let avgApprovalTimeHours = 0;
    if (recentApprovals.length > 0) {
      const totalHours = recentApprovals.reduce((sum, p) => {
        if (p.submittedForApprovalAt && p.approvedAt) {
          const diffMs = p.approvedAt.getTime() - p.submittedForApprovalAt.getTime();
          return sum + diffMs / (1000 * 60 * 60);
        }
        return sum;
      }, 0);
      avgApprovalTimeHours = Math.round((totalHours / recentApprovals.length) * 10) / 10;
    }

    return {
      pending,
      approvedThisWeek,
      rejectedThisWeek,
      avgApprovalTimeHours,
    };
  }

  /**
   * Get approval audit trail for a property
   */
  async getApprovalHistory(propertyId: number): Promise<ApprovalHistoryEntry[]> {
    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    const history: ApprovalHistoryEntry[] = [];

    // Build history from timestamps
    if (property.submittedForApprovalAt) {
      history.push({
        action: 'queued',
        performedBy: 'system',
        performedByName: 'System',
        timestamp: property.submittedForApprovalAt,
        notes: property.assignedBrokerId ? `Assigned to broker` : undefined,
      });
    }

    if (property.changesRequestedAt && property.changesRequestedBy) {
      const broker = await BrokerProfile.findByPk(property.changesRequestedBy, {
        include: [{ model: MarketplaceUser, as: 'user' }],
      });
      history.push({
        action: 'changes_requested',
        performedBy: property.changesRequestedBy,
        performedByName: (broker as any)?.user?.name || 'Broker',
        timestamp: property.changesRequestedAt,
        notes: property.changesRequested || undefined,
      });
    }

    if (property.rejectedAt && property.rejectedBy) {
      const broker = await BrokerProfile.findByPk(property.rejectedBy, {
        include: [{ model: MarketplaceUser, as: 'user' }],
      });
      history.push({
        action: 'rejected',
        performedBy: property.rejectedBy,
        performedByName: (broker as any)?.user?.name || 'Broker',
        timestamp: property.rejectedAt,
        notes: property.rejectionReason || undefined,
      });
    }

    if (property.approvedAt && property.approvedBy) {
      const broker = await BrokerProfile.findByPk(property.approvedBy, {
        include: [{ model: MarketplaceUser, as: 'user' }],
      });
      history.push({
        action: 'approved',
        performedBy: property.approvedBy,
        performedByName: (broker as any)?.user?.name || 'Broker',
        timestamp: property.approvedAt,
        notes: property.approvalNotes || undefined,
      });

      // If approved, it went live
      history.push({
        action: 'made_live',
        performedBy: property.approvedBy,
        performedByName: (broker as any)?.user?.name || 'Broker',
        timestamp: property.approvedAt,
        notes: 'Deal is now live in marketplace',
      });
    }

    // Sort by timestamp
    history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return history;
  }
}

export const dealApprovalService = new DealApprovalService();
export default dealApprovalService;
