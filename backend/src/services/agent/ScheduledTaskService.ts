/**
 * ScheduledTaskService
 *
 * Manages scheduled tasks (reminders, reports, actions) for the AI agent.
 * Handles CRUD operations and natural language time parsing.
 */

import * as chrono from 'chrono-node';
import { Op } from 'sequelize';
import ScheduledTask, {
  ScheduledTaskType,
  ScheduledTaskStatus,
  ScheduledTaskAttributes,
} from '../../models/ScheduledTask';
import { logger } from '../../utils/logger';
import { notificationService } from '../NotificationService';

export interface CreateTaskInput {
  userId: string;
  sessionId: string;
  type: ScheduledTaskType;
  title: string;
  message: string;
  scheduledFor: Date | string; // Date or natural language string
  recurrence?: string;
  timezone?: string;
  actionType?: string;
  actionParams?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface TaskExecutionResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

class ScheduledTaskService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    logger.info('ScheduledTaskService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Create a new scheduled task
   */
  async createTask(input: CreateTaskInput): Promise<ScheduledTask> {
    // Parse natural language time if string provided
    const scheduledFor =
      typeof input.scheduledFor === 'string'
        ? this.parseNaturalTime(input.scheduledFor, input.timezone)
        : input.scheduledFor;

    if (!scheduledFor || scheduledFor <= new Date()) {
      throw new Error('Invalid or past scheduled time. Please specify a future time.');
    }

    const task = await ScheduledTask.create({
      userId: input.userId,
      sessionId: input.sessionId,
      type: input.type,
      title: input.title,
      message: input.message,
      scheduledFor,
      recurrence: input.recurrence,
      timezone: input.timezone || 'America/Chicago',
      actionType: input.actionType,
      actionParams: input.actionParams,
      metadata: input.metadata,
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
    });

    logger.info({ taskId: task.id, type: input.type, scheduledFor }, 'Scheduled task created');

    return task;
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<ScheduledTask | null> {
    return ScheduledTask.findByPk(taskId);
  }

  /**
   * List tasks for a user
   */
  async listTasks(
    userId: string,
    options: {
      status?: ScheduledTaskStatus | ScheduledTaskStatus[];
      type?: ScheduledTaskType;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ tasks: ScheduledTask[]; total: number }> {
    const where: any = { userId };

    if (options.status) {
      where.status = Array.isArray(options.status) ? { [Op.in]: options.status } : options.status;
    }
    if (options.type) {
      where.type = options.type;
    }

    const { rows: tasks, count: total } = await ScheduledTask.findAndCountAll({
      where,
      order: [['scheduledFor', 'ASC']],
      limit: options.limit || 50,
      offset: options.offset || 0,
    });

    return { tasks, total };
  }

  /**
   * Cancel a scheduled task
   */
  async cancelTask(taskId: string, userId: string): Promise<boolean> {
    const task = await ScheduledTask.findOne({
      where: { id: taskId, userId, status: 'pending' },
    });

    if (!task) {
      return false;
    }

    task.status = 'cancelled';
    await task.save();

    logger.info({ taskId }, 'Scheduled task cancelled');
    return true;
  }

  /**
   * Reschedule a task to a new time
   */
  async rescheduleTask(
    taskId: string,
    userId: string,
    newTime: Date | string,
    timezone?: string
  ): Promise<ScheduledTask | null> {
    const task = await ScheduledTask.findOne({
      where: { id: taskId, userId, status: 'pending' },
    });

    if (!task) {
      return null;
    }

    const scheduledFor =
      typeof newTime === 'string' ? this.parseNaturalTime(newTime, timezone || task.timezone) : newTime;

    if (!scheduledFor || scheduledFor <= new Date()) {
      throw new Error('Invalid or past scheduled time.');
    }

    task.scheduledFor = scheduledFor;
    await task.save();

    logger.info({ taskId, newTime: scheduledFor }, 'Scheduled task rescheduled');
    return task;
  }

  /**
   * Get due tasks for execution
   */
  async getDueTasks(limit: number = 10): Promise<ScheduledTask[]> {
    return ScheduledTask.findAll({
      where: {
        status: 'pending',
        scheduledFor: { [Op.lte]: new Date() },
      },
      order: [['scheduledFor', 'ASC']],
      limit,
    });
  }

  /**
   * Execute a scheduled task
   */
  async executeTask(task: ScheduledTask): Promise<TaskExecutionResult> {
    try {
      switch (task.type) {
        case 'reminder':
          return await this.executeReminder(task);
        case 'report':
          return await this.executeReport(task);
        case 'action':
          return await this.executeAction(task);
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
    } catch (error) {
      logger.error({ error, taskId: task.id }, 'Task execution failed');
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Mark task as completed
   */
  async markCompleted(task: ScheduledTask, result?: Record<string, unknown>): Promise<void> {
    task.status = 'completed';
    task.executedAt = new Date();
    task.result = result;
    await task.save();

    // Handle recurring tasks - create next occurrence
    if (task.isRecurring()) {
      await this.scheduleNextOccurrence(task);
    }
  }

  /**
   * Mark task as failed
   */
  async markFailed(task: ScheduledTask, error: string): Promise<void> {
    task.retryCount += 1;

    if (task.canRetry()) {
      // Schedule retry with exponential backoff
      const backoffMs = Math.min(60000 * Math.pow(2, task.retryCount), 3600000); // Max 1 hour
      task.nextRetryAt = new Date(Date.now() + backoffMs);
      task.error = error;
    } else {
      task.status = 'failed';
      task.error = error;
    }

    await task.save();
  }

  /**
   * Parse natural language time expression
   */
  parseNaturalTime(expression: string, timezone?: string): Date | null {
    const refDate = new Date();

    // Use chrono-node for parsing
    const results = chrono.parse(expression, refDate, {
      forwardDate: true,
    });

    if (results.length === 0) {
      return null;
    }

    return results[0].start.date();
  }

  /**
   * Parse recurrence pattern
   * Supports: "daily", "weekly", "monthly", "every Monday", etc.
   */
  parseRecurrence(pattern: string): string | null {
    const normalized = pattern.toLowerCase().trim();

    // Simple patterns
    if (normalized === 'daily') return '0 9 * * *'; // 9 AM daily
    if (normalized === 'weekly') return '0 9 * * 1'; // 9 AM Monday
    if (normalized === 'monthly') return '0 9 1 * *'; // 9 AM 1st of month

    // Day-specific patterns
    const dayMap: Record<string, string> = {
      monday: '1',
      tuesday: '2',
      wednesday: '3',
      thursday: '4',
      friday: '5',
      saturday: '6',
      sunday: '0',
    };

    for (const [day, cron] of Object.entries(dayMap)) {
      if (normalized.includes(day)) {
        return `0 9 * * ${cron}`; // 9 AM on that day
      }
    }

    // Return as-is if it looks like a cron expression
    if (/^[\d\s*\/,-]+$/.test(normalized) && normalized.split(/\s+/).length === 5) {
      return normalized;
    }

    return null;
  }

  /**
   * Execute a reminder task
   */
  private async executeReminder(task: ScheduledTask): Promise<TaskExecutionResult> {
    // Send notification to user
    notificationService.sendToUser(task.userId, {
      type: 'system',
      title: task.title,
      message: task.message,
      priority: 'normal',
      data: {
        taskId: task.id,
        taskType: 'reminder',
        sessionId: task.sessionId,
      },
    });

    return {
      success: true,
      message: `Reminder sent: ${task.title}`,
    };
  }

  /**
   * Execute a report task
   */
  private async executeReport(task: ScheduledTask): Promise<TaskExecutionResult> {
    // Report execution would trigger report generation
    // For now, send notification that report is ready
    notificationService.sendToUser(task.userId, {
      type: 'system',
      title: `Report Ready: ${task.title}`,
      message: task.message,
      priority: 'normal',
      data: {
        taskId: task.id,
        taskType: 'report',
        reportParams: task.actionParams,
      },
    });

    return {
      success: true,
      message: `Report scheduled: ${task.title}`,
    };
  }

  /**
   * Execute an action task (tool invocation)
   */
  private async executeAction(task: ScheduledTask): Promise<TaskExecutionResult> {
    if (!task.actionType) {
      return {
        success: false,
        error: 'No action type specified',
      };
    }

    // Action tasks would invoke the specified tool
    // This would be integrated with the agent system
    logger.info({ taskId: task.id, actionType: task.actionType }, 'Action task executed');

    return {
      success: true,
      message: `Action ${task.actionType} queued for execution`,
      data: {
        actionType: task.actionType,
        actionParams: task.actionParams,
      },
    };
  }

  /**
   * Schedule next occurrence for recurring task
   */
  private async scheduleNextOccurrence(task: ScheduledTask): Promise<void> {
    if (!task.recurrence) return;

    // Parse cron expression to find next occurrence
    // For simplicity, add fixed intervals based on pattern
    let nextDate: Date | null = null;

    if (task.recurrence.includes('* * *')) {
      // Daily at same time
      nextDate = new Date(task.scheduledFor);
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (task.recurrence.startsWith('0 ') && task.recurrence.includes(' * *')) {
      // Weekly at same time
      nextDate = new Date(task.scheduledFor);
      nextDate.setDate(nextDate.getDate() + 7);
    } else {
      // Monthly
      nextDate = new Date(task.scheduledFor);
      nextDate.setMonth(nextDate.getMonth() + 1);
    }

    if (nextDate && nextDate > new Date()) {
      await ScheduledTask.create({
        userId: task.userId,
        sessionId: task.sessionId,
        type: task.type,
        title: task.title,
        message: task.message,
        scheduledFor: nextDate,
        recurrence: task.recurrence,
        timezone: task.timezone,
        actionType: task.actionType,
        actionParams: task.actionParams,
        metadata: { ...task.metadata, previousTaskId: task.id },
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
      });

      logger.info({ originalTaskId: task.id, nextDate }, 'Next occurrence scheduled');
    }
  }

  /**
   * Cleanup old completed/failed tasks
   */
  async cleanupOldTasks(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await ScheduledTask.destroy({
      where: {
        status: { [Op.in]: ['completed', 'failed', 'cancelled'] },
        updatedAt: { [Op.lt]: cutoffDate },
      },
    });

    if (result > 0) {
      logger.info({ count: result }, 'Cleaned up old scheduled tasks');
    }

    return result;
  }
}

export const scheduledTaskService = new ScheduledTaskService();
export default ScheduledTaskService;
