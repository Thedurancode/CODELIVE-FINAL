/**
 * Reminder Controller
 *
 * API endpoints for reminder management:
 * - CRUD operations for reminders
 * - Snooze and acknowledge actions
 * - Statistics
 */

import { Request, Response } from 'express';
import { reminderService } from '../services/ReminderService';
import type { ReminderStatus, ReminderPriority, ReminderLinkType } from '../models/Reminder';

// ============================================================================
// REMINDERS CRUD
// ============================================================================

export const getReminders = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const {
      page,
      limit,
      search,
      status,
      priority,
      linkType,
      propertyId,
      taskId,
      buyerId,
      reminderBefore,
      reminderAfter,
      tags,
      sortBy,
      sortOrder,
      includeOverdue,
    } = req.query;

    const result = await reminderService.getReminders({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      search: search as string,
      status: status ? (status as string).split(',') as ReminderStatus[] : undefined,
      priority: priority ? (priority as string).split(',') as ReminderPriority[] : undefined,
      linkType: linkType as ReminderLinkType,
      propertyId: propertyId ? parseInt(propertyId as string, 10) : undefined,
      taskId: taskId as string,
      buyerId: buyerId as string,
      reminderBefore: reminderBefore ? new Date(reminderBefore as string) : undefined,
      reminderAfter: reminderAfter ? new Date(reminderAfter as string) : undefined,
      tags: tags ? (tags as string).split(',') : undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'ASC' | 'DESC',
      includeOverdue: includeOverdue === 'true',
      userId, // Filter by current user
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getMyReminders = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    const { page, limit, status, priority, sortBy, sortOrder } = req.query;

    const result = await reminderService.getReminders({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      userId,
      status: status ? (status as string).split(',') as ReminderStatus[] : undefined,
      priority: priority ? (priority as string).split(',') as ReminderPriority[] : undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'ASC' | 'DESC',
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getReminder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const reminder = await reminderService.getReminder(id);
    if (!reminder) {
      return res.status(404).json({
        success: false,
        error: 'Reminder not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: reminder,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const createReminder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    const reminder = await reminderService.createReminder({
      ...req.body,
      userId,
      organizationId: req.body.organizationId || organizationId,
    });

    res.status(201).json({
      success: true,
      data: reminder,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const updateReminder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const reminder = await reminderService.updateReminder(id, req.body);
    if (!reminder) {
      return res.status(404).json({
        success: false,
        error: 'Reminder not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: reminder,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const deleteReminder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await reminderService.deleteReminder(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Reminder not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Reminder deleted',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// REMINDER ACTIONS
// ============================================================================

export const snoozeReminder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { minutes } = req.body;

    if (!minutes || typeof minutes !== 'number' || minutes <= 0) {
      return res.status(400).json({
        success: false,
        error: 'minutes must be a positive number',
        timestamp: new Date().toISOString(),
      });
    }

    const reminder = await reminderService.snoozeReminder(id, minutes);
    if (!reminder) {
      return res.status(404).json({
        success: false,
        error: 'Reminder not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: reminder,
      message: `Reminder snoozed for ${minutes} minutes`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const acknowledgeReminder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    const reminder = await reminderService.acknowledgeReminder(id, userId);
    if (!reminder) {
      return res.status(404).json({
        success: false,
        error: 'Reminder not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: reminder,
      message: 'Reminder acknowledged',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const cancelReminder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const reminder = await reminderService.cancelReminder(id);
    if (!reminder) {
      return res.status(404).json({
        success: false,
        error: 'Reminder not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: reminder,
      message: 'Reminder cancelled',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// REMINDERS BY ENTITY
// ============================================================================

export const getUpcomingReminders = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { hours } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    const reminders = await reminderService.getUpcomingReminders(
      userId,
      hours ? parseInt(hours as string, 10) : 24
    );

    res.json({
      success: true,
      data: reminders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getRemindersByDeal = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { status } = req.query;

    const reminders = await reminderService.getRemindersByDeal(
      parseInt(propertyId, 10),
      status ? (status as string).split(',') as ReminderStatus[] : undefined
    );

    res.json({
      success: true,
      data: reminders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getRemindersByTask = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { status } = req.query;

    const reminders = await reminderService.getRemindersByTask(
      taskId,
      status ? (status as string).split(',') as ReminderStatus[] : undefined
    );

    res.json({
      success: true,
      data: reminders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

export const getRemindersByBuyer = async (req: Request, res: Response) => {
  try {
    const { buyerId } = req.params;
    const { status } = req.query;

    const reminders = await reminderService.getRemindersByBuyer(
      buyerId,
      status ? (status as string).split(',') as ReminderStatus[] : undefined
    );

    res.json({
      success: true,
      data: reminders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// STATISTICS
// ============================================================================

export const getReminderStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    const { scope } = req.query;

    let stats;
    if (scope === 'organization' && organizationId) {
      stats = await reminderService.getReminderStats(undefined, organizationId);
    } else if (scope === 'all') {
      stats = await reminderService.getReminderStats();
    } else {
      // Default to current user's reminders
      stats = await reminderService.getReminderStats(userId);
    }

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};
