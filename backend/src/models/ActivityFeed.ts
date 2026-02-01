/**
 * Activity Feed Model
 *
 * Central feed for tracking all activity across deals, buyers, and team members.
 * Provides a timeline of events for quick platform overview.
 */

import { Model, DataTypes, Sequelize, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

// Activity event types
export type ActivityEventType =
  | 'deal_created'
  | 'deal_updated'
  | 'deal_deleted'
  | 'deal_viewed'
  | 'deal_liked'
  | 'deal_passed'
  | 'offer_made'
  | 'offer_updated'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'offer_expired'
  | 'buyer_created'
  | 'buyer_updated'
  | 'buyer_contacted'
  | 'task_created'
  | 'task_assigned'
  | 'task_completed'
  | 'task_overdue'
  | 'compliance_check_passed'
  | 'compliance_check_failed'
  | 'compliance_issue_resolved'
  | 'document_uploaded'
  | 'document_signed'
  | 'message_sent'
  | 'team_member_added'
  | 'team_member_removed'
  | 'pipeline_stage_changed'
  | 'system_event'
  // Meeting events
  | 'meeting_created'
  | 'meeting_updated'
  | 'meeting_cancelled'
  | 'meeting_started'
  | 'meeting_ended'
  | 'participant_added'
  | 'participant_removed'
  | 'participant_rsvp_accepted'
  | 'participant_rsvp_declined'
  | 'participant_rsvp_tentative'
  | 'participant_joined'
  | 'participant_left';

// Resource types that activities can be associated with
export type ActivityResourceType =
  | 'deal'
  | 'buyer'
  | 'task'
  | 'compliance'
  | 'document'
  | 'message'
  | 'team'
  | 'offer'
  | 'pipeline'
  | 'system'
  | 'meeting'
  | 'meeting_participant';

// Actor types
export type ActivityActorType = 'user' | 'system' | 'automation' | 'external';

export interface ActivityFeedAttributes {
  id: string;
  organizationId?: string;
  eventType: ActivityEventType;
  timestamp: Date;
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
  importance: 'low' | 'normal' | 'high' | 'critical';
  readBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface ActivityFeedCreationAttributes
  extends Optional<ActivityFeedAttributes, 'id' | 'readBy' | 'importance' | 'createdAt' | 'updatedAt' | 'details' | 'metadata'> {}

export class ActivityFeed
  extends Model<ActivityFeedAttributes, ActivityFeedCreationAttributes>
  implements ActivityFeedAttributes
{
  declare id: string;
  declare organizationId?: string;
  declare eventType: ActivityEventType;
  declare timestamp: Date;
  declare actor: {
    type: ActivityActorType;
    id?: string;
    name: string;
    avatar?: string;
    email?: string;
  };
  declare resource: {
    type: ActivityResourceType;
    id: string;
    name?: string;
    url?: string;
  };
  declare action: string;
  declare summary: string;
  declare details?: Record<string, any>;
  declare metadata?: {
    ip?: string;
    userAgent?: string;
    location?: string;
  };
  declare importance: 'low' | 'normal' | 'high' | 'critical';
  declare readBy: string[];
  declare createdAt: Date;
  declare updatedAt: Date;

  /**
   * Get activity feed for an organization with filters
   */
  static async getActivityFeed(options: {
    organizationId?: string;
    eventTypes?: ActivityEventType[];
    resourceTypes?: ActivityResourceType[];
    actorId?: string;
    startDate?: Date;
    endDate?: Date;
    importance?: ('low' | 'normal' | 'high' | 'critical')[];
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ activities: ActivityFeed[]; total: number }> {
    const where: any = {};

    if (options.organizationId) {
      where.organizationId = options.organizationId;
    }

    if (options.eventTypes?.length) {
      where.eventType = { [Op.in]: options.eventTypes };
    }

    if (options.resourceTypes?.length) {
      where['resource.type'] = { [Op.in]: options.resourceTypes };
    }

    if (options.actorId) {
      where['actor.id'] = options.actorId;
    }

    if (options.importance?.length) {
      where.importance = { [Op.in]: options.importance };
    }

    if (options.startDate || options.endDate) {
      where.timestamp = {};
      if (options.startDate) where.timestamp[Op.gte] = options.startDate;
      if (options.endDate) where.timestamp[Op.lte] = options.endDate;
    }

    if (options.search) {
      where[Op.or] = [
        { summary: { [Op.iLike]: `%${options.search}%` } },
        { 'actor.name': { [Op.iLike]: `%${options.search}%` } },
        { 'resource.name': { [Op.iLike]: `%${options.search}%` } },
      ];
    }

    const { rows: activities, count: total } = await ActivityFeed.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    });

    return { activities, total };
  }

  /**
   * Mark activities as read by a user
   */
  static async markAsRead(activityIds: string[], userId: string): Promise<number> {
    const activities = await ActivityFeed.findAll({
      where: { id: { [Op.in]: activityIds } },
    });

    let updatedCount = 0;
    for (const activity of activities) {
      if (!activity.readBy.includes(userId)) {
        activity.readBy = [...activity.readBy, userId];
        await activity.save();
        updatedCount++;
      }
    }

    return updatedCount;
  }

  /**
   * Get unread count for a user
   */
  static async getUnreadCount(organizationId: string, userId: string): Promise<number> {
    return ActivityFeed.count({
      where: {
        organizationId,
        readBy: { [Op.not]: { [Op.contains]: [userId] } },
      },
    });
  }

  /**
   * Get activity statistics
   */
  static async getStatistics(
    organizationId: string,
    days: number = 7
  ): Promise<{
    totalActivities: number;
    byEventType: Record<string, number>;
    byResourceType: Record<string, number>;
    byImportance: Record<string, number>;
    dailyCount: { date: string; count: number }[];
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const activities = await ActivityFeed.findAll({
      where: {
        organizationId,
        timestamp: { [Op.gte]: since },
      },
    });

    const byEventType: Record<string, number> = {};
    const byResourceType: Record<string, number> = {};
    const byImportance: Record<string, number> = {};
    const dailyCountMap: Record<string, number> = {};

    for (const activity of activities) {
      // By event type
      byEventType[activity.eventType] = (byEventType[activity.eventType] || 0) + 1;

      // By resource type
      const resourceType = activity.resource.type;
      byResourceType[resourceType] = (byResourceType[resourceType] || 0) + 1;

      // By importance
      byImportance[activity.importance] = (byImportance[activity.importance] || 0) + 1;

      // Daily count
      const dateKey = activity.timestamp.toISOString().split('T')[0];
      dailyCountMap[dateKey] = (dailyCountMap[dateKey] || 0) + 1;
    }

    const dailyCount = Object.entries(dailyCountMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalActivities: activities.length,
      byEventType,
      byResourceType,
      byImportance,
      dailyCount,
    };
  }
}

// Initialize the model
ActivityFeed.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    eventType: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    actor: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    resource: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    importance: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'critical'),
      allowNull: false,
      defaultValue: 'normal',
    },
    readBy: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: false,
      defaultValue: [],
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'activity_feeds',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['organization_id', 'timestamp'] },
      { fields: ['event_type', 'timestamp'] },
      { fields: ['timestamp'] },
      { fields: ['importance'] },
      {
        fields: [sequelize.literal("(actor->>'id')")],
        name: 'idx_activity_actor_id',
      },
      {
        fields: [sequelize.literal("(resource->>'type')")],
        name: 'idx_activity_resource_type',
      },
    ],
  }
);

export default ActivityFeed;
