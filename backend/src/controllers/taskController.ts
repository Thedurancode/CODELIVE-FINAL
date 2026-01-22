/**
 * Task Controller
 *
 * API endpoints for task management:
 * - CRUD operations for tasks
 * - Assignment management
 * - Status updates
 * - Task statistics
 */

import { Request, Response } from 'express';
import { taskService } from '../services/TaskService';
import type { TaskStatus, TaskPriority, TaskLinkType } from '../models/Task';

// ============================================================================
// TASKS CRUD
// ============================================================================

export const getTasks = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const {
      page,
      limit,
      search,
      status,
      priority,
      assignedTo,
      createdBy,
      organizationId,
      linkType,
      propertyId,
      buyerId,
      complianceCheckId,
      dueBefore,
      dueAfter,
      tags,
      sortBy,
      sortOrder,
      includeOverdue,
    } = req.query;

    const result = await taskService.getTasks({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      search: search as string,
      status: status ? (status as string).split(',') as TaskStatus[] : undefined,
      priority: priority ? (priority as string).split(',') as TaskPriority[] : undefined,
      assignedTo: (assignedTo as string) || userId, // Default to current user
      createdBy: createdBy as string,
      organizationId: organizationId as string,
      linkType: linkType as TaskLinkType,
      propertyId: propertyId ? parseInt(propertyId as string, 10) : undefined,
      buyerId: buyerId as string,
      complianceCheckId: complianceCheckId ? parseInt(complianceCheckId as string, 10) : undefined,
      dueBefore: dueBefore ? new Date(dueBefore as string) : undefined,
      dueAfter: dueAfter ? new Date(dueAfter as string) : undefined,
      tags: tags ? (tags as string).split(',') : undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'ASC' | 'DESC',
      includeOverdue: includeOverdue === 'true',
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

export const getTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await taskService.getTask(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: task,
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

export const createTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;

    const task = await taskService.createTask({
      ...req.body,
      createdBy: userId,
      organizationId: req.body.organizationId || organizationId,
    });

    res.status(201).json({
      success: true,
      data: task,
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

export const updateTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await taskService.updateTask(id, req.body);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: task,
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

export const deleteTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await taskService.deleteTask(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Task deleted',
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
// TASK ACTIONS
// ============================================================================

export const completeTask = async (req: Request, res: Response) => {
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

    const task = await taskService.completeTask(id, userId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: task,
      message: 'Task completed',
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

export const cancelTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = await taskService.cancelTask(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: task,
      message: 'Task cancelled',
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

export const assignTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;
    const userId = (req as any).user?.id;

    if (!assignedTo) {
      return res.status(400).json({
        success: false,
        error: 'assignedTo is required',
        timestamp: new Date().toISOString(),
      });
    }

    const task = await taskService.assignTask(id, assignedTo, userId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: task,
      message: 'Task assigned',
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

export const updateTaskStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = (req as any).user?.id;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'status is required',
        timestamp: new Date().toISOString(),
      });
    }

    const validStatuses: TaskStatus[] = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        timestamp: new Date().toISOString(),
      });
    }

    const task = await taskService.updateTaskStatus(id, status, userId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: task,
      message: `Task status updated to ${status}`,
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
// TASKS BY ENTITY
// ============================================================================

export const getTasksByDeal = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { status } = req.query;

    const tasks = await taskService.getTasksByDeal(
      parseInt(propertyId, 10),
      status ? (status as string).split(',') as TaskStatus[] : undefined
    );

    res.json({
      success: true,
      data: tasks,
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

export const getTasksByBuyer = async (req: Request, res: Response) => {
  try {
    const { buyerId } = req.params;
    const { status } = req.query;

    const tasks = await taskService.getTasksByBuyer(
      buyerId,
      status ? (status as string).split(',') as TaskStatus[] : undefined
    );

    res.json({
      success: true,
      data: tasks,
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

export const getTasksByCompliance = async (req: Request, res: Response) => {
  try {
    const { complianceCheckId } = req.params;
    const { status } = req.query;

    const tasks = await taskService.getTasksByCompliance(
      parseInt(complianceCheckId, 10),
      status ? (status as string).split(',') as TaskStatus[] : undefined
    );

    res.json({
      success: true,
      data: tasks,
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

export const getMyTasks = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      });
    }

    const {
      page,
      limit,
      status,
      priority,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await taskService.getTasks({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      assignedTo: userId,
      status: status ? (status as string).split(',') as TaskStatus[] : undefined,
      priority: priority ? (priority as string).split(',') as TaskPriority[] : undefined,
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

// ============================================================================
// STATISTICS
// ============================================================================

export const getTaskStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    const { scope } = req.query;

    let stats;
    if (scope === 'organization' && organizationId) {
      stats = await taskService.getTaskStats(undefined, organizationId);
    } else if (scope === 'all') {
      stats = await taskService.getTaskStats();
    } else {
      // Default to current user's tasks
      stats = await taskService.getTaskStats(userId);
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

// ============================================================================
// WORKFLOW
// ============================================================================

export const triggerWorkflow = async (req: Request, res: Response) => {
  try {
    const { trigger, propertyId, buyerId, complianceCheckId, metadata } = req.body;
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;

    const validTriggers = ['deal_created', 'deal_stage_changed', 'compliance_issue', 'buyer_matched'];
    if (!trigger || !validTriggers.includes(trigger)) {
      return res.status(400).json({
        success: false,
        error: `Invalid trigger. Must be one of: ${validTriggers.join(', ')}`,
        timestamp: new Date().toISOString(),
      });
    }

    const tasks = await taskService.createTasksFromWorkflow(trigger, {
      propertyId: propertyId ? parseInt(propertyId, 10) : undefined,
      buyerId,
      complianceCheckId: complianceCheckId ? parseInt(complianceCheckId, 10) : undefined,
      organizationId,
      userId,
      metadata,
    });

    res.status(201).json({
      success: true,
      data: tasks,
      message: `Created ${tasks.length} tasks from workflow`,
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
