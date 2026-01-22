/**
 * Activity Feed Controller
 *
 * Handles HTTP requests for the activity feed feature.
 */

import { Request, Response, NextFunction } from 'express';
import { activityFeedService, ActivityFeedQueryParams } from '../services/ActivityFeedService';
import { logger } from '../services/LoggerService';

/**
 * Get activity feed with filters
 */
export async function getActivityFeed(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      organizationId,
      eventTypes,
      resourceTypes,
      actorId,
      startDate,
      endDate,
      importance,
      search,
      limit,
      offset,
    } = req.query;

    const params: ActivityFeedQueryParams = {
      organizationId: organizationId as string,
      eventTypes: eventTypes ? (eventTypes as string).split(',') as any[] : undefined,
      resourceTypes: resourceTypes ? (resourceTypes as string).split(',') as any[] : undefined,
      actorId: actorId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      importance: importance ? (importance as string).split(',') as any[] : undefined,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    };

    const result = await activityFeedService.getActivityFeed(params);
    res.json(result);
  } catch (error) {
    logger.error('Error getting activity feed', { query: req.query }, error);
    next(error);
  }
}

/**
 * Get a single activity entry
 */
export async function getActivityById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const activity = await activityFeedService.getActivityById(id);

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.json(activity);
  } catch (error) {
    logger.error('Error getting activity by ID', { id: req.params.id }, error);
    next(error);
  }
}

/**
 * Mark activities as read
 */
export async function markAsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const { activityIds } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!activityIds || !Array.isArray(activityIds)) {
      return res.status(400).json({ error: 'activityIds must be an array' });
    }

    const result = await activityFeedService.markAsRead(activityIds, userId);
    res.json(result);
  } catch (error) {
    logger.error('Error marking activities as read', { body: req.body }, error);
    next(error);
  }
}

/**
 * Get unread count for current user
 */
export async function getUnreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const { organizationId } = req.query;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const count = await activityFeedService.getUnreadCount(organizationId as string, userId);
    res.json({ unreadCount: count });
  } catch (error) {
    logger.error('Error getting unread count', { query: req.query }, error);
    next(error);
  }
}

/**
 * Get activity statistics
 */
export async function getStatistics(req: Request, res: Response, next: NextFunction) {
  try {
    const { organizationId, days } = req.query;

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const statistics = await activityFeedService.getStatistics(
      organizationId as string,
      days ? parseInt(days as string, 10) : 7
    );

    res.json(statistics);
  } catch (error) {
    logger.error('Error getting activity statistics', { query: req.query }, error);
    next(error);
  }
}

/**
 * Get available filter options
 */
export async function getFilterOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const { organizationId } = req.query;
    const options = await activityFeedService.getFilterOptions(organizationId as string);
    res.json(options);
  } catch (error) {
    logger.error('Error getting filter options', { query: req.query }, error);
    next(error);
  }
}

/**
 * Create a new activity (internal use / testing)
 */
export async function createActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const activity = await activityFeedService.createActivity(req.body);
    res.status(201).json(activity);
  } catch (error) {
    logger.error('Error creating activity', { body: req.body }, error);
    next(error);
  }
}

/**
 * Cleanup old activities (admin only)
 */
export async function cleanupActivities(req: Request, res: Response, next: NextFunction) {
  try {
    const { daysToKeep } = req.body;
    const deletedCount = await activityFeedService.cleanupOldActivities(daysToKeep || 90);
    res.json({ deletedCount, message: `Deleted ${deletedCount} old activities` });
  } catch (error) {
    logger.error('Error cleaning up activities', { body: req.body }, error);
    next(error);
  }
}
