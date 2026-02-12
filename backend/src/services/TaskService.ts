/**
 * Task Service
 *
 * Business logic for task management:
 * - CRUD operations for tasks
 * - Assignment management
 * - Dependency resolution
 * - Automated task creation from workflow rules
 */

import { Op, Transaction } from 'sequelize';
import Task, { TaskStatus, TaskPriority, TaskLinkType } from '../models/Task';
import Property from '../models/Property';
import Buyer from '../models/Buyer';
import MarketplaceUser from '../models/MarketplaceUser';
import sequelize from '../config/database';
import { activityFeedService } from './ActivityFeedService';

// Interfaces
interface TaskFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  assignedTo?: string;
  createdBy?: string;
  organizationId?: string;
  linkType?: TaskLinkType;
  propertyId?: number;
  buyerId?: string;
  complianceCheckId?: number;
  dueBefore?: Date;
  dueAfter?: Date;
  tags?: string[];
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  includeOverdue?: boolean;
}

interface CreateTaskData {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | string;
  startDate?: Date | string;
  assignedTo?: string;
  assignedBy?: string;
  organizationId?: string;
  linkType?: TaskLinkType;
  propertyId?: number;
  buyerId?: string;
  complianceCheckId?: number;
  dependsOn?: string[];
  isRecurring?: boolean;
  recurrencePattern?: string;
  parentTaskId?: string;
  createdBy?: string;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface UpdateTaskData {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | string | null;
  startDate?: Date | string | null;
  assignedTo?: string | null;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  dependsOn?: string[];
}

interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  blocked: number;
  cancelled: number;
  overdue: number;
  dueToday: number;
  dueSoon: number; // within next 7 days
  byPriority: Record<TaskPriority, number>;
  byLinkType: Record<TaskLinkType, number>;
}

interface WorkflowRule {
  trigger: 'deal_created' | 'deal_stage_changed' | 'compliance_issue' | 'buyer_matched';
  conditions?: Record<string, unknown>;
  taskTemplate: CreateTaskData;
}

class TaskService {
  private initialized = false;
  private workflowRules: WorkflowRule[] = [];

  async initialize(): Promise<void> {
    // Load any stored workflow rules from settings
    this.workflowRules = this.getDefaultWorkflowRules();
    this.initialized = true;
    console.log('TaskService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get tasks with filtering and pagination
   */
  async getTasks(filters: TaskFilters = {}) {
    const {
      page = 1,
      limit = 20,
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
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      includeOverdue,
    } = filters;

    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    // Status filter
    if (status) {
      where.status = Array.isArray(status) ? { [Op.in]: status } : status;
    }

    // Priority filter
    if (priority) {
      where.priority = Array.isArray(priority) ? { [Op.in]: priority } : priority;
    }

    // Assignment filters
    if (assignedTo) where.assignedTo = assignedTo;
    if (createdBy) where.createdBy = createdBy;
    if (organizationId) where.organizationId = organizationId;

    // Link filters
    if (linkType) where.linkType = linkType;
    if (propertyId) where.propertyId = propertyId;
    if (buyerId) where.buyerId = buyerId;
    if (complianceCheckId) where.complianceCheckId = complianceCheckId;

    // Date filters
    if (dueBefore || dueAfter) {
      where.dueDate = {};
      if (dueBefore) (where.dueDate as Record<string, unknown>)[Op.lte as unknown as string] = dueBefore;
      if (dueAfter) (where.dueDate as Record<string, unknown>)[Op.gte as unknown as string] = dueAfter;
    }

    // Tags filter
    if (tags && tags.length > 0) {
      where.tags = { [Op.overlap]: tags };
    }

    // Search filter
    if (search) {
      where[Op.or as unknown as string] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { notes: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Include overdue (pending/in_progress tasks past due date)
    if (includeOverdue) {
      const now = new Date();
      where[Op.and as unknown as string] = [
        { status: { [Op.in]: ['pending', 'in_progress'] } },
        { dueDate: { [Op.lt]: now } },
      ];
    }

    const { count, rows } = await Task.findAndCountAll({
      where,
      include: [
        {
          model: MarketplaceUser,
          as: 'assignee',
          attributes: ['id', 'email', 'name'],
          required: false,
        },
        {
          model: MarketplaceUser,
          as: 'creator',
          attributes: ['id', 'email', 'name'],
          required: false,
        },
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'propertyId', 'address', 'city', 'state', 'zip'],
          required: false,
        },
        {
          model: Buyer,
          as: 'buyer',
          attributes: ['id', 'name', 'buyingState'],
          required: false,
        },
      ],
      order: [[sortBy, sortOrder]],
      limit,
      offset,
      distinct: true,
    });

    // Add computed fields
    const now = new Date();
    const tasksWithComputed = rows.map((task) => {
      const taskJson = task.toJSON();
      return {
        ...taskJson,
        isOverdue: task.dueDate && task.dueDate < now && ['pending', 'in_progress'].includes(task.status),
        daysUntilDue: task.dueDate
          ? Math.ceil((task.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      };
    });

    return {
      data: tasksWithComputed,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Get a single task by ID
   */
  async getTask(id: string): Promise<Task | null> {
    return await Task.findByPk(id, {
      include: [
        {
          model: MarketplaceUser,
          as: 'assignee',
          attributes: ['id', 'email', 'name'],
          required: false,
        },
        {
          model: MarketplaceUser,
          as: 'creator',
          attributes: ['id', 'email', 'name'],
          required: false,
        },
        {
          model: Property,
          as: 'property',
          required: false,
        },
        {
          model: Buyer,
          as: 'buyer',
          required: false,
        },
      ],
    });
  }

  /**
   * Create a new task
   */
  async createTask(data: CreateTaskData, transaction?: Transaction): Promise<Task> {
    // Validate dependencies exist
    if (data.dependsOn && data.dependsOn.length > 0) {
      const existingTasks = await Task.count({
        where: { id: { [Op.in]: data.dependsOn } },
      });
      if (existingTasks !== data.dependsOn.length) {
        throw new Error('Some dependent tasks do not exist');
      }
    }

    // Set linkType based on provided entity IDs
    let linkType: TaskLinkType = data.linkType || 'none';
    if (!data.linkType) {
      if (data.propertyId) linkType = 'deal';
      else if (data.buyerId) linkType = 'buyer';
      else if (data.complianceCheckId) linkType = 'compliance';
    }

    const task = await Task.create(
      {
        title: data.title,
        description: data.description || null,
        status: data.status || 'pending',
        priority: data.priority || 'normal',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        assignedTo: data.assignedTo || null,
        assignedBy: data.assignedBy || null,
        organizationId: data.organizationId || null,
        linkType,
        propertyId: data.propertyId || null,
        buyerId: data.buyerId || null,
        complianceCheckId: data.complianceCheckId || null,
        dependsOn: data.dependsOn || [],
        blockedBy: [],
        isRecurring: data.isRecurring || false,
        recurrencePattern: data.recurrencePattern || null,
        parentTaskId: data.parentTaskId || null,
        createdBy: data.createdBy || null,
        notes: data.notes || null,
        tags: data.tags || [],
        metadata: data.metadata || null,
      },
      { transaction }
    );

    // Update blockedBy on dependent tasks
    if (data.dependsOn && data.dependsOn.length > 0) {
      await this.updateBlockedByReferences(task.id, data.dependsOn, 'add', transaction);
    }

    // Log activity
    const creator = data.createdBy
      ? await MarketplaceUser.findByPk(data.createdBy)
      : null;
    activityFeedService.logTaskActivity(
      'task_created',
      task.id,
      task.title,
      {
        id: data.createdBy,
        name: creator?.name || creator?.email || 'System',
        type: data.createdBy ? 'user' : 'system',
      },
      data.organizationId,
      { priority: task.priority, dueDate: task.dueDate }
    ).catch(() => {}); // Non-blocking

    return task;
  }

  /**
   * Update an existing task
   */
  async updateTask(id: string, data: UpdateTaskData): Promise<Task | null> {
    const task = await Task.findByPk(id);
    if (!task) return null;

    // Handle dependency changes
    if (data.dependsOn !== undefined) {
      const oldDeps = task.dependsOn || [];
      const newDeps = data.dependsOn || [];

      // Remove old blockedBy references
      const removedDeps = oldDeps.filter(d => !newDeps.includes(d));
      if (removedDeps.length > 0) {
        await this.updateBlockedByReferences(id, removedDeps, 'remove');
      }

      // Add new blockedBy references
      const addedDeps = newDeps.filter(d => !oldDeps.includes(d));
      if (addedDeps.length > 0) {
        // Validate new dependencies exist
        const existingTasks = await Task.count({
          where: { id: { [Op.in]: addedDeps } },
        });
        if (existingTasks !== addedDeps.length) {
          throw new Error('Some dependent tasks do not exist');
        }
        await this.updateBlockedByReferences(id, addedDeps, 'add');
      }
    }

    await task.update({
      ...data,
      dueDate: data.dueDate !== undefined
        ? (data.dueDate ? new Date(data.dueDate) : null)
        : task.dueDate,
      startDate: data.startDate !== undefined
        ? (data.startDate ? new Date(data.startDate) : null)
        : task.startDate,
    });

    return task;
  }

  /**
   * Complete a task
   */
  async completeTask(id: string, completedBy: string): Promise<Task | null> {
    const task = await Task.findByPk(id);
    if (!task) return null;

    // Check if all dependencies are completed
    if (task.dependsOn && task.dependsOn.length > 0) {
      const incompleteDeps = await Task.count({
        where: {
          id: { [Op.in]: task.dependsOn },
          status: { [Op.notIn]: ['completed', 'cancelled'] },
        },
      });
      if (incompleteDeps > 0) {
        throw new Error('Cannot complete task with incomplete dependencies');
      }
    }

    await task.update({
      status: 'completed',
      completedAt: new Date(),
      completedBy,
    });

    // Unblock dependent tasks
    await this.resolveBlockedTasks(id);

    // Log activity
    const completer = await MarketplaceUser.findByPk(completedBy);
    activityFeedService.logTaskActivity(
      'task_completed',
      task.id,
      task.title,
      {
        id: completedBy,
        name: completer?.name || completer?.email || 'Unknown',
        type: 'user',
      },
      task.organizationId || undefined,
      { completedAt: task.completedAt }
    ).catch(() => {}); // Non-blocking

    return task;
  }

  /**
   * Cancel a task
   */
  async cancelTask(id: string): Promise<Task | null> {
    const task = await Task.findByPk(id);
    if (!task) return null;

    await task.update({
      status: 'cancelled',
    });

    // Unblock dependent tasks (even though this task wasn't completed)
    await this.resolveBlockedTasks(id);

    return task;
  }

  /**
   * Delete a task
   */
  async deleteTask(id: string): Promise<boolean> {
    const task = await Task.findByPk(id);
    if (!task) return false;

    // Remove this task from dependsOn arrays of other tasks
    await Task.update(
      { dependsOn: sequelize.literal(`array_remove("dependsOn", '${id}')`) as unknown as string[] },
      { where: { dependsOn: { [Op.contains]: [id] } } }
    );

    // Remove from blockedBy arrays
    await Task.update(
      { blockedBy: sequelize.literal(`array_remove("blockedBy", '${id}')`) as unknown as string[] },
      { where: { blockedBy: { [Op.contains]: [id] } } }
    );

    await task.destroy();
    return true;
  }

  /**
   * Assign a task to a user
   */
  async assignTask(id: string, assignedTo: string, assignedBy: string): Promise<Task | null> {
    const task = await Task.findByPk(id);
    if (!task) return null;

    await task.update({
      assignedTo,
      assignedBy,
    });

    // Log activity
    const [assigner, assignee] = await Promise.all([
      MarketplaceUser.findByPk(assignedBy),
      MarketplaceUser.findByPk(assignedTo),
    ]);
    activityFeedService.logTaskActivity(
      'task_assigned',
      task.id,
      task.title,
      {
        id: assignedBy,
        name: assigner?.name || assigner?.email || 'Unknown',
        type: 'user',
      },
      task.organizationId || undefined,
      { assigneeName: assignee?.name || assignee?.email, assigneeId: assignedTo }
    ).catch(() => {}); // Non-blocking

    return task;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(id: string, status: TaskStatus, userId?: string): Promise<Task | null> {
    const task = await Task.findByPk(id);
    if (!task) return null;

    const updates: Partial<Task> = { status };

    if (status === 'completed') {
      updates.completedAt = new Date();
      if (userId) updates.completedBy = userId;
    } else if (status === 'in_progress' && !task.startDate) {
      updates.startDate = new Date();
    }

    await task.update(updates);

    if (status === 'completed' || status === 'cancelled') {
      await this.resolveBlockedTasks(id);
    }

    return task;
  }

  /**
   * Get tasks by deal (property)
   */
  async getTasksByDeal(propertyId: number, status?: TaskStatus[]) {
    const where: Record<string, unknown> = {
      propertyId,
      linkType: 'deal',
    };
    if (status) where.status = { [Op.in]: status };

    return await Task.findAll({
      where,
      include: [
        {
          model: MarketplaceUser,
          as: 'assignee',
          attributes: ['id', 'email', 'name'],
          required: false,
        },
      ],
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
      ],
    });
  }

  /**
   * Get tasks by buyer
   */
  async getTasksByBuyer(buyerId: string, status?: TaskStatus[]) {
    const where: Record<string, unknown> = {
      buyerId,
      linkType: 'buyer',
    };
    if (status) where.status = { [Op.in]: status };

    return await Task.findAll({
      where,
      include: [
        {
          model: MarketplaceUser,
          as: 'assignee',
          attributes: ['id', 'email', 'name'],
          required: false,
        },
      ],
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
      ],
    });
  }

  /**
   * Get tasks by compliance check
   */
  async getTasksByCompliance(complianceCheckId: number, status?: TaskStatus[]) {
    const where: Record<string, unknown> = {
      complianceCheckId,
      linkType: 'compliance',
    };
    if (status) where.status = { [Op.in]: status };

    return await Task.findAll({
      where,
      include: [
        {
          model: MarketplaceUser,
          as: 'assignee',
          attributes: ['id', 'email', 'name'],
          required: false,
        },
      ],
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
      ],
    });
  }

  /**
   * Get tasks by project
   */
  async getTasksByProject(projectId: string, status?: TaskStatus[]) {
    const where: Record<string, unknown> = {
      projectId,
      linkType: 'project',
    };
    if (status) where.status = { [Op.in]: status };

    return await Task.findAll({
      where,
      include: [
        {
          model: MarketplaceUser,
          as: 'assignee',
          attributes: ['id', 'email', 'name'],
          required: false,
        },
      ],
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
      ],
    });
  }

  /**
   * Get task statistics
   */
  async getTaskStats(userId?: string, organizationId?: string): Promise<TaskStats> {
    const where: Record<string, unknown> = {};
    if (userId) where.assignedTo = userId;
    if (organizationId) where.organizationId = organizationId;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const [total, pending, inProgress, completed, blocked, cancelled, overdue, dueToday, dueSoon] =
      await Promise.all([
        Task.count({ where }),
        Task.count({ where: { ...where, status: 'pending' } }),
        Task.count({ where: { ...where, status: 'in_progress' } }),
        Task.count({ where: { ...where, status: 'completed' } }),
        Task.count({ where: { ...where, status: 'blocked' } }),
        Task.count({ where: { ...where, status: 'cancelled' } }),
        Task.count({
          where: {
            ...where,
            status: { [Op.in]: ['pending', 'in_progress'] },
            dueDate: { [Op.lt]: now },
          },
        }),
        Task.count({
          where: {
            ...where,
            status: { [Op.in]: ['pending', 'in_progress'] },
            dueDate: { [Op.gte]: today, [Op.lt]: tomorrow },
          },
        }),
        Task.count({
          where: {
            ...where,
            status: { [Op.in]: ['pending', 'in_progress'] },
            dueDate: { [Op.gte]: tomorrow, [Op.lte]: weekFromNow },
          },
        }),
      ]);

    // Get counts by priority
    const priorityCounts = await Task.findAll({
      where,
      attributes: ['priority', [sequelize.fn('COUNT', '*'), 'count']],
      group: ['priority'],
      raw: true,
    });

    const byPriority: Record<TaskPriority, number> = {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0,
    };
    priorityCounts.forEach((p: any) => {
      byPriority[p.priority as TaskPriority] = parseInt(p.count, 10);
    });

    // Get counts by link type
    const linkTypeCounts = await Task.findAll({
      where,
      attributes: ['linkType', [sequelize.fn('COUNT', '*'), 'count']],
      group: ['linkType'],
      raw: true,
    });

    const byLinkType: Record<TaskLinkType, number> = {
      deal: 0,
      buyer: 0,
      compliance: 0,
      project: 0,
      none: 0,
    };
    linkTypeCounts.forEach((l: any) => {
      byLinkType[l.linkType as TaskLinkType] = parseInt(l.count, 10);
    });

    return {
      total,
      pending,
      inProgress,
      completed,
      blocked,
      cancelled,
      overdue,
      dueToday,
      dueSoon,
      byPriority,
      byLinkType,
    };
  }

  /**
   * Create tasks from workflow rules
   */
  async createTasksFromWorkflow(
    trigger: WorkflowRule['trigger'],
    context: {
      propertyId?: number;
      buyerId?: string;
      complianceCheckId?: number;
      organizationId?: string;
      userId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Task[]> {
    const applicableRules = this.workflowRules.filter(
      (rule) => rule.trigger === trigger
    );

    const createdTasks: Task[] = [];

    for (const rule of applicableRules) {
      // Check conditions if any
      if (rule.conditions) {
        // Simple condition matching
        let conditionsMet = true;
        for (const [key, value] of Object.entries(rule.conditions)) {
          if (context.metadata && context.metadata[key] !== value) {
            conditionsMet = false;
            break;
          }
        }
        if (!conditionsMet) continue;
      }

      // Create task from template
      const task = await this.createTask({
        ...rule.taskTemplate,
        propertyId: context.propertyId,
        buyerId: context.buyerId,
        complianceCheckId: context.complianceCheckId,
        organizationId: context.organizationId,
        createdBy: context.userId,
        metadata: {
          ...rule.taskTemplate.metadata,
          workflowTrigger: trigger,
          ...context.metadata,
        },
      });

      createdTasks.push(task);
    }

    return createdTasks;
  }

  /**
   * Add a workflow rule
   */
  addWorkflowRule(rule: WorkflowRule): void {
    this.workflowRules.push(rule);
  }

  /**
   * Get workflow rules
   */
  getWorkflowRules(): WorkflowRule[] {
    return this.workflowRules;
  }

  // Private helper methods

  private async updateBlockedByReferences(
    taskId: string,
    dependencyIds: string[],
    action: 'add' | 'remove',
    transaction?: Transaction
  ): Promise<void> {
    if (action === 'add') {
      await Task.update(
        { blockedBy: sequelize.literal(`array_append("blockedBy", '${taskId}')`) as unknown as string[] },
        { where: { id: { [Op.in]: dependencyIds } }, transaction }
      );
    } else {
      await Task.update(
        { blockedBy: sequelize.literal(`array_remove("blockedBy", '${taskId}')`) as unknown as string[] },
        { where: { id: { [Op.in]: dependencyIds } }, transaction }
      );
    }
  }

  private async resolveBlockedTasks(completedTaskId: string): Promise<void> {
    // Find tasks that had this task as a dependency
    const blockedTasks = await Task.findAll({
      where: {
        dependsOn: { [Op.contains]: [completedTaskId] },
        status: 'blocked',
      },
    });

    for (const blockedTask of blockedTasks) {
      // Check if all other dependencies are completed
      const remainingDeps = blockedTask.dependsOn.filter((d) => d !== completedTaskId);
      if (remainingDeps.length === 0) {
        // No more dependencies, unblock the task
        await blockedTask.update({ status: 'pending' });
      } else {
        // Check if remaining dependencies are all completed
        const incompleteDeps = await Task.count({
          where: {
            id: { [Op.in]: remainingDeps },
            status: { [Op.notIn]: ['completed', 'cancelled'] },
          },
        });
        if (incompleteDeps === 0) {
          await blockedTask.update({ status: 'pending' });
        }
      }
    }

    // Update blockedBy arrays
    await Task.update(
      { blockedBy: sequelize.literal(`array_remove("blockedBy", '${completedTaskId}')`) as unknown as string[] },
      { where: { blockedBy: { [Op.contains]: [completedTaskId] } } }
    );
  }

  private getDefaultWorkflowRules(): WorkflowRule[] {
    return [
      {
        trigger: 'deal_created',
        taskTemplate: {
          title: 'Review new deal submission',
          description: 'Review the newly submitted deal for initial assessment',
          priority: 'normal',
          tags: ['deal', 'review'],
        },
      },
      {
        trigger: 'compliance_issue',
        taskTemplate: {
          title: 'Address compliance issue',
          description: 'Review and resolve the compliance issue flagged',
          priority: 'high',
          tags: ['compliance', 'urgent'],
        },
      },
      {
        trigger: 'buyer_matched',
        taskTemplate: {
          title: 'Contact matched buyer',
          description: 'Reach out to the matched buyer about the property',
          priority: 'normal',
          tags: ['buyer', 'outreach'],
        },
      },
    ];
  }
}

export const taskService = new TaskService();
export default taskService;
