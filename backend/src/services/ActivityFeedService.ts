/**
 * Activity Feed Service
 *
 * Business logic for managing platform activity feeds.
 * Handles creating, querying, and aggregating activity data.
 */

import ActivityFeed, {
  ActivityEventType,
  ActivityResourceType,
  ActivityActorType,
  ActivityFeedAttributes,
} from '../models/ActivityFeed';
import { logger } from './LoggerService';
import { Op } from 'sequelize';

export interface CreateActivityParams {
  organizationId?: string;
  eventType: ActivityEventType;
  actor: {
    type: ActivityActorType;
    id?: string;
    name: string;
    avatar?: string;
    email?: string;
  };
  resource: {
    type: ActivityResourceType;
    id: string;
    name?: string;
    url?: string;
  };
  action: string;
  summary: string;
  details?: Record<string, any>;
  metadata?: {
    ip?: string;
    userAgent?: string;
    location?: string;
  };
  importance?: 'low' | 'normal' | 'high' | 'critical';
}

export interface ActivityFeedQueryParams {
  organizationId?: string;
  eventTypes?: ActivityEventType[];
  resourceTypes?: ActivityResourceType[];
  actorId?: string;
  startDate?: string;
  endDate?: string;
  importance?: ('low' | 'normal' | 'high' | 'critical')[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityFeedResponse {
  activities: ActivityFeedAttributes[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

class ActivityFeedService {
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Sync the model (create table if not exists)
      await ActivityFeed.sync({ alter: false });
      this.initialized = true;
      logger.info('Activity Feed Service initialized');
    } catch (error) {
      logger.error('Failed to initialize Activity Feed Service', {}, error);
      throw error;
    }
  }

  /**
   * Create a new activity entry
   */
  async createActivity(params: CreateActivityParams): Promise<ActivityFeed> {
    try {
      const activity = await ActivityFeed.create({
        organizationId: params.organizationId,
        eventType: params.eventType,
        timestamp: new Date(),
        actor: params.actor,
        resource: params.resource,
        action: params.action,
        summary: params.summary,
        details: params.details,
        metadata: params.metadata,
        importance: params.importance || 'normal',
        readBy: [],
      });

      logger.debug('Activity created', {
        id: activity.id,
        eventType: activity.eventType,
        actorName: activity.actor.name,
      });

      return activity;
    } catch (error) {
      logger.error('Failed to create activity', { params }, error);
      throw error;
    }
  }

  /**
   * Get activity feed with filters and pagination
   */
  async getActivityFeed(params: ActivityFeedQueryParams): Promise<ActivityFeedResponse> {
    try {
      const limit = Math.min(params.limit || 50, 100);
      const offset = params.offset || 0;

      const { activities, total } = await ActivityFeed.getActivityFeed({
        organizationId: params.organizationId,
        eventTypes: params.eventTypes,
        resourceTypes: params.resourceTypes,
        actorId: params.actorId,
        startDate: params.startDate ? new Date(params.startDate) : undefined,
        endDate: params.endDate ? new Date(params.endDate) : undefined,
        importance: params.importance,
        search: params.search,
        limit,
        offset,
      });

      return {
        activities: activities.map((a) => a.toJSON()),
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        hasMore: offset + activities.length < total,
      };
    } catch (error) {
      logger.error('Failed to get activity feed', { params }, error);
      throw error;
    }
  }

  /**
   * Get a single activity entry
   */
  async getActivityById(id: string): Promise<ActivityFeed | null> {
    try {
      return await ActivityFeed.findByPk(id);
    } catch (error) {
      logger.error('Failed to get activity by ID', { id }, error);
      throw error;
    }
  }

  /**
   * Mark activities as read
   */
  async markAsRead(activityIds: string[], userId: string): Promise<{ updatedCount: number }> {
    try {
      const updatedCount = await ActivityFeed.markAsRead(activityIds, userId);
      return { updatedCount };
    } catch (error) {
      logger.error('Failed to mark activities as read', { activityIds, userId }, error);
      throw error;
    }
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(organizationId: string, userId: string): Promise<number> {
    try {
      return await ActivityFeed.getUnreadCount(organizationId, userId);
    } catch (error) {
      logger.error('Failed to get unread count', { organizationId, userId }, error);
      throw error;
    }
  }

  /**
   * Get activity statistics
   */
  async getStatistics(
    organizationId: string,
    days: number = 7
  ): Promise<{
    totalActivities: number;
    byEventType: Record<string, number>;
    byResourceType: Record<string, number>;
    byImportance: Record<string, number>;
    dailyCount: { date: string; count: number }[];
  }> {
    try {
      return await ActivityFeed.getStatistics(organizationId, days);
    } catch (error) {
      logger.error('Failed to get activity statistics', { organizationId, days }, error);
      throw error;
    }
  }

  /**
   * Get available filter options
   */
  async getFilterOptions(organizationId?: string): Promise<{
    eventTypes: string[];
    resourceTypes: string[];
    importanceLevels: string[];
    actors: { id: string; name: string }[];
  }> {
    try {
      const where: any = {};
      if (organizationId) {
        where.organizationId = organizationId;
      }

      // Get distinct values
      const activities = await ActivityFeed.findAll({
        where,
        attributes: ['eventType', 'resource', 'actor', 'importance'],
        limit: 1000,
      });

      const eventTypes = new Set<string>();
      const resourceTypes = new Set<string>();
      const importanceLevels = new Set<string>();
      const actorsMap = new Map<string, string>();

      for (const activity of activities) {
        eventTypes.add(activity.eventType);
        resourceTypes.add(activity.resource.type);
        importanceLevels.add(activity.importance);
        if (activity.actor.id) {
          actorsMap.set(activity.actor.id, activity.actor.name);
        }
      }

      return {
        eventTypes: Array.from(eventTypes).sort(),
        resourceTypes: Array.from(resourceTypes).sort(),
        importanceLevels: Array.from(importanceLevels),
        actors: Array.from(actorsMap.entries()).map(([id, name]) => ({ id, name })),
      };
    } catch (error) {
      logger.error('Failed to get filter options', { organizationId }, error);
      throw error;
    }
  }

  /**
   * Delete old activities (for cleanup)
   */
  async cleanupOldActivities(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

      const result = await ActivityFeed.destroy({
        where: {
          timestamp: { [Op.lt]: cutoffDate },
          importance: { [Op.ne]: 'critical' }, // Keep critical activities
        },
      });

      logger.info('Cleaned up old activities', { deletedCount: result, daysToKeep });
      return result;
    } catch (error) {
      logger.error('Failed to cleanup old activities', { daysToKeep }, error);
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS FOR CREATING SPECIFIC ACTIVITY TYPES
  // ============================================================================

  /**
   * Log a deal activity
   */
  async logDealActivity(
    eventType: 'deal_created' | 'deal_updated' | 'deal_deleted' | 'deal_viewed' | 'deal_liked' | 'deal_passed',
    dealId: string,
    dealName: string,
    actor: { id?: string; name: string; type?: ActivityActorType },
    organizationId?: string,
    details?: Record<string, any>
  ): Promise<ActivityFeed> {
    const actionMap: Record<string, string> = {
      deal_created: 'created',
      deal_updated: 'updated',
      deal_deleted: 'deleted',
      deal_viewed: 'viewed',
      deal_liked: 'liked',
      deal_passed: 'passed on',
    };

    const summaryMap: Record<string, string> = {
      deal_created: `${actor.name} created deal "${dealName}"`,
      deal_updated: `${actor.name} updated deal "${dealName}"`,
      deal_deleted: `${actor.name} deleted deal "${dealName}"`,
      deal_viewed: `${actor.name} viewed deal "${dealName}"`,
      deal_liked: `${actor.name} liked deal "${dealName}"`,
      deal_passed: `${actor.name} passed on deal "${dealName}"`,
    };

    return this.createActivity({
      organizationId,
      eventType,
      actor: {
        type: actor.type || 'user',
        id: actor.id,
        name: actor.name,
      },
      resource: {
        type: 'deal',
        id: dealId,
        name: dealName,
        url: `/deals/${dealId}`,
      },
      action: actionMap[eventType],
      summary: summaryMap[eventType],
      details,
      importance: eventType === 'deal_created' ? 'high' : 'normal',
    });
  }

  /**
   * Log an offer activity
   */
  async logOfferActivity(
    eventType: 'offer_made' | 'offer_updated' | 'offer_accepted' | 'offer_rejected' | 'offer_expired',
    offerId: string,
    dealName: string,
    actor: { id?: string; name: string; type?: ActivityActorType },
    organizationId?: string,
    details?: Record<string, any>
  ): Promise<ActivityFeed> {
    const actionMap: Record<string, string> = {
      offer_made: 'submitted',
      offer_updated: 'updated',
      offer_accepted: 'accepted',
      offer_rejected: 'rejected',
      offer_expired: 'expired',
    };

    const summaryMap: Record<string, string> = {
      offer_made: `${actor.name} submitted an offer on "${dealName}"`,
      offer_updated: `${actor.name} updated their offer on "${dealName}"`,
      offer_accepted: `Offer on "${dealName}" was accepted`,
      offer_rejected: `Offer on "${dealName}" was rejected`,
      offer_expired: `Offer on "${dealName}" has expired`,
    };

    const importanceMap: Record<string, 'low' | 'normal' | 'high' | 'critical'> = {
      offer_made: 'high',
      offer_updated: 'normal',
      offer_accepted: 'critical',
      offer_rejected: 'high',
      offer_expired: 'normal',
    };

    return this.createActivity({
      organizationId,
      eventType,
      actor: {
        type: actor.type || 'user',
        id: actor.id,
        name: actor.name,
      },
      resource: {
        type: 'offer',
        id: offerId,
        name: `Offer on ${dealName}`,
      },
      action: actionMap[eventType],
      summary: summaryMap[eventType],
      details,
      importance: importanceMap[eventType],
    });
  }

  /**
   * Log a buyer activity
   */
  async logBuyerActivity(
    eventType: 'buyer_created' | 'buyer_updated' | 'buyer_contacted',
    buyerId: string,
    buyerName: string,
    actor: { id?: string; name: string; type?: ActivityActorType },
    organizationId?: string,
    details?: Record<string, any>
  ): Promise<ActivityFeed> {
    const actionMap: Record<string, string> = {
      buyer_created: 'added',
      buyer_updated: 'updated',
      buyer_contacted: 'contacted',
    };

    const summaryMap: Record<string, string> = {
      buyer_created: `${actor.name} added new buyer "${buyerName}"`,
      buyer_updated: `${actor.name} updated buyer "${buyerName}"`,
      buyer_contacted: `${actor.name} contacted buyer "${buyerName}"`,
    };

    return this.createActivity({
      organizationId,
      eventType,
      actor: {
        type: actor.type || 'user',
        id: actor.id,
        name: actor.name,
      },
      resource: {
        type: 'buyer',
        id: buyerId,
        name: buyerName,
        url: `/buyers/${buyerId}`,
      },
      action: actionMap[eventType],
      summary: summaryMap[eventType],
      details,
      importance: eventType === 'buyer_created' ? 'high' : 'normal',
    });
  }

  /**
   * Log a task activity
   */
  async logTaskActivity(
    eventType: 'task_created' | 'task_assigned' | 'task_completed' | 'task_overdue',
    taskId: string,
    taskTitle: string,
    actor: { id?: string; name: string; type?: ActivityActorType },
    organizationId?: string,
    details?: Record<string, any>
  ): Promise<ActivityFeed> {
    const actionMap: Record<string, string> = {
      task_created: 'created',
      task_assigned: 'assigned',
      task_completed: 'completed',
      task_overdue: 'is overdue',
    };

    const summaryMap: Record<string, string> = {
      task_created: `${actor.name} created task "${taskTitle}"`,
      task_assigned: `Task "${taskTitle}" was assigned to ${details?.assigneeName || 'team member'}`,
      task_completed: `${actor.name} completed task "${taskTitle}"`,
      task_overdue: `Task "${taskTitle}" is now overdue`,
    };

    const importanceMap: Record<string, 'low' | 'normal' | 'high' | 'critical'> = {
      task_created: 'normal',
      task_assigned: 'normal',
      task_completed: 'normal',
      task_overdue: 'high',
    };

    return this.createActivity({
      organizationId,
      eventType,
      actor: {
        type: actor.type || 'user',
        id: actor.id,
        name: actor.name,
      },
      resource: {
        type: 'task',
        id: taskId,
        name: taskTitle,
        url: `/tasks?id=${taskId}`,
      },
      action: actionMap[eventType],
      summary: summaryMap[eventType],
      details,
      importance: importanceMap[eventType],
    });
  }

  /**
   * Log a compliance activity
   */
  async logComplianceActivity(
    eventType: 'compliance_check_passed' | 'compliance_check_failed' | 'compliance_issue_resolved',
    checkId: string,
    checkName: string,
    actor: { id?: string; name: string; type?: ActivityActorType },
    organizationId?: string,
    details?: Record<string, any>
  ): Promise<ActivityFeed> {
    const actionMap: Record<string, string> = {
      compliance_check_passed: 'passed',
      compliance_check_failed: 'failed',
      compliance_issue_resolved: 'resolved',
    };

    const summaryMap: Record<string, string> = {
      compliance_check_passed: `Compliance check "${checkName}" passed`,
      compliance_check_failed: `Compliance check "${checkName}" failed`,
      compliance_issue_resolved: `${actor.name} resolved compliance issue "${checkName}"`,
    };

    const importanceMap: Record<string, 'low' | 'normal' | 'high' | 'critical'> = {
      compliance_check_passed: 'normal',
      compliance_check_failed: 'critical',
      compliance_issue_resolved: 'high',
    };

    return this.createActivity({
      organizationId,
      eventType,
      actor: {
        type: actor.type || 'system',
        id: actor.id,
        name: actor.name,
      },
      resource: {
        type: 'compliance',
        id: checkId,
        name: checkName,
        url: `/compliance?check=${checkId}`,
      },
      action: actionMap[eventType],
      summary: summaryMap[eventType],
      details,
      importance: importanceMap[eventType],
    });
  }

  /**
   * Log a team activity
   */
  async logTeamActivity(
    eventType: 'team_member_added' | 'team_member_removed' | 'message_sent',
    resourceId: string,
    resourceName: string,
    actor: { id?: string; name: string; type?: ActivityActorType },
    organizationId?: string,
    details?: Record<string, any>
  ): Promise<ActivityFeed> {
    const actionMap: Record<string, string> = {
      team_member_added: 'joined',
      team_member_removed: 'left',
      message_sent: 'sent',
    };

    const summaryMap: Record<string, string> = {
      team_member_added: `${resourceName} joined the team`,
      team_member_removed: `${resourceName} left the team`,
      message_sent: `${actor.name} sent a message`,
    };

    return this.createActivity({
      organizationId,
      eventType,
      actor: {
        type: actor.type || 'user',
        id: actor.id,
        name: actor.name,
      },
      resource: {
        type: eventType === 'message_sent' ? 'message' : 'team',
        id: resourceId,
        name: resourceName,
      },
      action: actionMap[eventType],
      summary: summaryMap[eventType],
      details,
      importance: eventType === 'team_member_added' ? 'high' : 'normal',
    });
  }

  // ============================================================================
  // MEETING ACTIVITY HELPERS
  // ============================================================================

  /**
   * Log a meeting activity
   */
  async logMeetingActivity(
    eventType:
      | 'meeting_created'
      | 'meeting_updated'
      | 'meeting_cancelled'
      | 'meeting_started'
      | 'meeting_ended',
    meetingId: string,
    meetingTitle: string,
    actor: { id?: string; name: string; type?: ActivityActorType },
    organizationId?: string,
    details?: Record<string, any>
  ): Promise<ActivityFeed> {
    const actionMap: Record<string, string> = {
      meeting_created: 'scheduled',
      meeting_updated: 'updated',
      meeting_cancelled: 'cancelled',
      meeting_started: 'started',
      meeting_ended: 'ended',
    };

    const summaryMap: Record<string, string> = {
      meeting_created: `${actor.name} scheduled meeting "${meetingTitle}"`,
      meeting_updated: `${actor.name} updated meeting "${meetingTitle}"`,
      meeting_cancelled: `${actor.name} cancelled meeting "${meetingTitle}"`,
      meeting_started: `Meeting "${meetingTitle}" has started`,
      meeting_ended: `Meeting "${meetingTitle}" has ended`,
    };

    const importanceMap: Record<string, 'low' | 'normal' | 'high' | 'critical'> = {
      meeting_created: 'high',
      meeting_updated: 'normal',
      meeting_cancelled: 'high',
      meeting_started: 'normal',
      meeting_ended: 'low',
    };

    return this.createActivity({
      organizationId,
      eventType,
      actor: {
        type: actor.type || 'user',
        id: actor.id,
        name: actor.name,
      },
      resource: {
        type: 'meeting',
        id: meetingId,
        name: meetingTitle,
        url: `/meetings/${meetingId}`,
      },
      action: actionMap[eventType],
      summary: summaryMap[eventType],
      details,
      importance: importanceMap[eventType],
    });
  }

  /**
   * Log a meeting participant activity
   */
  async logParticipantActivity(
    eventType:
      | 'participant_added'
      | 'participant_removed'
      | 'participant_rsvp_accepted'
      | 'participant_rsvp_declined'
      | 'participant_rsvp_tentative'
      | 'participant_joined'
      | 'participant_left',
    meetingId: string,
    meetingTitle: string,
    participantName: string,
    actor: { id?: string; name: string; type?: ActivityActorType },
    organizationId?: string,
    details?: Record<string, any>
  ): Promise<ActivityFeed> {
    const actionMap: Record<string, string> = {
      participant_added: 'invited',
      participant_removed: 'removed',
      participant_rsvp_accepted: 'accepted',
      participant_rsvp_declined: 'declined',
      participant_rsvp_tentative: 'tentatively accepted',
      participant_joined: 'joined',
      participant_left: 'left',
    };

    const summaryMap: Record<string, string> = {
      participant_added: `${actor.name} invited ${participantName} to "${meetingTitle}"`,
      participant_removed: `${actor.name} removed ${participantName} from "${meetingTitle}"`,
      participant_rsvp_accepted: `${participantName} accepted invitation to "${meetingTitle}"`,
      participant_rsvp_declined: `${participantName} declined invitation to "${meetingTitle}"`,
      participant_rsvp_tentative: `${participantName} tentatively accepted "${meetingTitle}"`,
      participant_joined: `${participantName} joined meeting "${meetingTitle}"`,
      participant_left: `${participantName} left meeting "${meetingTitle}"`,
    };

    const importanceMap: Record<string, 'low' | 'normal' | 'high' | 'critical'> = {
      participant_added: 'normal',
      participant_removed: 'normal',
      participant_rsvp_accepted: 'normal',
      participant_rsvp_declined: 'normal',
      participant_rsvp_tentative: 'low',
      participant_joined: 'low',
      participant_left: 'low',
    };

    return this.createActivity({
      organizationId,
      eventType,
      actor: {
        type: actor.type || 'user',
        id: actor.id,
        name: actor.name,
      },
      resource: {
        type: 'meeting',
        id: meetingId,
        name: meetingTitle,
        url: `/meetings/${meetingId}`,
      },
      action: actionMap[eventType],
      summary: summaryMap[eventType],
      details: {
        ...details,
        participantName,
      },
      importance: importanceMap[eventType],
    });
  }
}

export const activityFeedService = new ActivityFeedService();
export default activityFeedService;
