/**
 * Reminder Service
 *
 * Business logic for reminder management:
 * - CRUD operations for reminders
 * - Snooze and acknowledge functionality
 * - Statistics and upcoming reminders
 * - Notification scheduling
 */

import { Op } from 'sequelize';
import Reminder, { ReminderStatus, ReminderPriority, ReminderLinkType, ReminderRecurrence } from '../models/Reminder';
import Property from '../models/Property';
import Task from '../models/Task';
import Buyer from '../models/Buyer';
import MarketplaceUser from '../models/MarketplaceUser';

// Interfaces
interface ReminderFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ReminderStatus | ReminderStatus[];
  priority?: ReminderPriority | ReminderPriority[];
  userId?: string;
  organizationId?: string;
  linkType?: ReminderLinkType;
  propertyId?: number;
  taskId?: string;
  buyerId?: string;
  reminderBefore?: Date;
  reminderAfter?: Date;
  tags?: string[];
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  includeOverdue?: boolean;
}

interface CreateReminderData {
  title: string;
  description?: string;
  reminderTime: Date | string;
  recurrence?: ReminderRecurrence;
  recurrencePattern?: string;
  timezone?: string;
  status?: ReminderStatus;
  priority?: ReminderPriority;
  userId: string;
  organizationId?: string;
  linkType?: ReminderLinkType;
  propertyId?: number;
  taskId?: string;
  buyerId?: string;
  contractId?: string;
  complianceCheckId?: number;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  parentReminderId?: string;
}

interface UpdateReminderData {
  title?: string;
  description?: string;
  reminderTime?: Date | string;
  recurrence?: ReminderRecurrence;
  recurrencePattern?: string;
  timezone?: string;
  priority?: ReminderPriority;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface ReminderStats {
  total: number;
  pending: number;
  sent: number;
  acknowledged: number;
  snoozed: number;
  cancelled: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  byPriority: Record<ReminderPriority, number>;
  byLinkType: Record<ReminderLinkType, number>;
}

class ReminderService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('ReminderService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get reminders with filtering and pagination
   */
  async getReminders(filters: ReminderFilters = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      priority,
      userId,
      organizationId,
      linkType,
      propertyId,
      taskId,
      buyerId,
      reminderBefore,
      reminderAfter,
      tags,
      sortBy = 'reminderTime',
      sortOrder = 'ASC',
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

    // User/org filters
    if (userId) where.userId = userId;
    if (organizationId) where.organizationId = organizationId;

    // Link filters
    if (linkType) where.linkType = linkType;
    if (propertyId) where.propertyId = propertyId;
    if (taskId) where.taskId = taskId;
    if (buyerId) where.buyerId = buyerId;

    // Date filters
    if (reminderBefore || reminderAfter) {
      where.reminderTime = {};
      if (reminderBefore) (where.reminderTime as Record<string, unknown>)[Op.lte as unknown as string] = reminderBefore;
      if (reminderAfter) (where.reminderTime as Record<string, unknown>)[Op.gte as unknown as string] = reminderAfter;
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

    // Include overdue
    if (includeOverdue) {
      const now = new Date();
      where[Op.and as unknown as string] = [
        { status: { [Op.in]: ['pending', 'snoozed'] } },
        {
          [Op.or as unknown as string]: [
            { snoozedUntil: { [Op.lt]: now } },
            { snoozedUntil: null, reminderTime: { [Op.lt]: now } },
          ],
        },
      ];
    }

    const { count, rows } = await Reminder.findAndCountAll({
      where,
      include: [
        {
          model: MarketplaceUser,
          as: 'user',
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
          model: Task,
          as: 'task',
          attributes: ['id', 'title', 'status', 'dueDate'],
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
    });

    // Add computed fields
    const now = new Date();
    const data = rows.map((r) => {
      const plain = r.get({ plain: true }) as unknown as Record<string, unknown>;
      const reminderTime = new Date(plain.reminderTime as string);
      const snoozedUntil = plain.snoozedUntil ? new Date(plain.snoozedUntil as string) : null;
      const checkTime = snoozedUntil || reminderTime;
      
      plain.isOverdue = (plain.status === 'pending' || plain.status === 'snoozed') && checkTime < now;
      plain.isDue = (plain.status === 'pending' || plain.status === 'snoozed') && checkTime <= now;
      plain.isSnoozed = plain.status === 'snoozed' && snoozedUntil !== null;
      plain.minutesUntilDue = (plain.status === 'pending' || plain.status === 'snoozed') 
        ? Math.round((checkTime.getTime() - now.getTime()) / 60000)
        : null;
      
      return plain;
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Get a single reminder by ID
   */
  async getReminder(id: string) {
    const reminder = await Reminder.findByPk(id, {
      include: [
        {
          model: MarketplaceUser,
          as: 'user',
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
          model: Task,
          as: 'task',
          attributes: ['id', 'title', 'status', 'dueDate'],
          required: false,
        },
        {
          model: Buyer,
          as: 'buyer',
          attributes: ['id', 'name', 'buyingState'],
          required: false,
        },
      ],
    });
    return reminder;
  }

  /**
   * Create a new reminder
   */
  async createReminder(data: CreateReminderData) {
    const reminder = await Reminder.create({
      ...data,
      reminderTime: typeof data.reminderTime === 'string' ? new Date(data.reminderTime) : data.reminderTime,
    });
    return this.getReminder(reminder.id);
  }

  /**
   * Update a reminder
   */
  async updateReminder(id: string, data: UpdateReminderData) {
    const reminder = await Reminder.findByPk(id);
    if (!reminder) return null;

    const updateData: Record<string, unknown> = { ...data };
    if (data.reminderTime) {
      updateData.reminderTime = typeof data.reminderTime === 'string' ? new Date(data.reminderTime) : data.reminderTime;
    }

    await reminder.update(updateData);
    return this.getReminder(id);
  }

  /**
   * Delete a reminder
   */
  async deleteReminder(id: string): Promise<boolean> {
    const reminder = await Reminder.findByPk(id);
    if (!reminder) return false;

    await reminder.destroy();
    return true;
  }

  /**
   * Snooze a reminder
   */
  async snoozeReminder(id: string, minutes: number) {
    const reminder = await Reminder.findByPk(id);
    if (!reminder) return null;

    const now = new Date();
    reminder.snoozedUntil = new Date(now.getTime() + minutes * 60 * 1000);
    reminder.snoozeCount += 1;
    reminder.status = 'snoozed';
    await reminder.save();

    return this.getReminder(id);
  }

  /**
   * Acknowledge a reminder
   */
  async acknowledgeReminder(id: string, userId: string) {
    const reminder = await Reminder.findByPk(id);
    if (!reminder) return null;

    reminder.status = 'acknowledged';
    reminder.acknowledgedAt = new Date();
    reminder.acknowledgedBy = userId;
    await reminder.save();

    return this.getReminder(id);
  }

  /**
   * Cancel a reminder
   */
  async cancelReminder(id: string) {
    const reminder = await Reminder.findByPk(id);
    if (!reminder) return null;

    reminder.status = 'cancelled';
    await reminder.save();

    return this.getReminder(id);
  }

  /**
   * Get upcoming reminders for a user
   */
  async getUpcomingReminders(userId: string, hours: number = 24) {
    const now = new Date();
    const future = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const reminders = await Reminder.findAll({
      where: {
        userId,
        status: { [Op.in]: ['pending', 'snoozed'] },
        [Op.or]: [
          {
            snoozedUntil: { [Op.between]: [now, future] },
          },
          {
            snoozedUntil: null,
            reminderTime: { [Op.between]: [now, future] },
          },
        ],
      },
      include: [
        { model: Property, as: 'property', attributes: ['id', 'propertyId', 'address', 'city', 'state', 'zip'], required: false },
        { model: Task, as: 'task', attributes: ['id', 'title', 'status'], required: false },
        { model: Buyer, as: 'buyer', attributes: ['id', 'name'], required: false },
      ],
      order: [['reminderTime', 'ASC']],
    });

    return reminders;
  }

  /**
   * Get reminders by deal (property)
   */
  async getRemindersByDeal(propertyId: number, status?: ReminderStatus[]) {
    const where: Record<string, unknown> = { propertyId, linkType: 'deal' };
    if (status) where.status = { [Op.in]: status };
    return Reminder.findAll({ where, order: [['reminderTime', 'ASC']] });
  }

  /**
   * Get reminders by task
   */
  async getRemindersByTask(taskId: string, status?: ReminderStatus[]) {
    const where: Record<string, unknown> = { taskId, linkType: 'task' };
    if (status) where.status = { [Op.in]: status };
    return Reminder.findAll({ where, order: [['reminderTime', 'ASC']] });
  }

  /**
   * Get reminders by buyer
   */
  async getRemindersByBuyer(buyerId: string, status?: ReminderStatus[]) {
    const where: Record<string, unknown> = { buyerId, linkType: 'buyer' };
    if (status) where.status = { [Op.in]: status };
    return Reminder.findAll({ where, order: [['reminderTime', 'ASC']] });
  }

  /**
   * Get reminder statistics
   */
  async getReminderStats(userId?: string, organizationId?: string): Promise<ReminderStats> {
    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (organizationId) where.organizationId = organizationId;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [total, pending, sent, acknowledged, snoozed, cancelled] = await Promise.all([
      Reminder.count({ where }),
      Reminder.count({ where: { ...where, status: 'pending' } }),
      Reminder.count({ where: { ...where, status: 'sent' } }),
      Reminder.count({ where: { ...where, status: 'acknowledged' } }),
      Reminder.count({ where: { ...where, status: 'snoozed' } }),
      Reminder.count({ where: { ...where, status: 'cancelled' } }),
    ]);

    // Overdue
    const overdue = await Reminder.count({
      where: {
        ...where,
        status: { [Op.in]: ['pending', 'snoozed'] },
        [Op.or]: [
          { snoozedUntil: { [Op.lt]: now } },
          { snoozedUntil: null, reminderTime: { [Op.lt]: now } },
        ],
      },
    });

    // Due today
    const dueToday = await Reminder.count({
      where: {
        ...where,
        status: { [Op.in]: ['pending', 'snoozed'] },
        [Op.or]: [
          { snoozedUntil: { [Op.between]: [todayStart, todayEnd] } },
          { snoozedUntil: null, reminderTime: { [Op.between]: [todayStart, todayEnd] } },
        ],
      },
    });

    // Due soon (within 7 days)
    const dueSoon = await Reminder.count({
      where: {
        ...where,
        status: { [Op.in]: ['pending', 'snoozed'] },
        [Op.or]: [
          { snoozedUntil: { [Op.between]: [now, weekEnd] } },
          { snoozedUntil: null, reminderTime: { [Op.between]: [now, weekEnd] } },
        ],
      },
    });

    // By priority
    const [low, normal, high, urgent] = await Promise.all([
      Reminder.count({ where: { ...where, priority: 'low' } }),
      Reminder.count({ where: { ...where, priority: 'normal' } }),
      Reminder.count({ where: { ...where, priority: 'high' } }),
      Reminder.count({ where: { ...where, priority: 'urgent' } }),
    ]);

    // By link type
    const [deal, task, buyer, contract, compliance, general] = await Promise.all([
      Reminder.count({ where: { ...where, linkType: 'deal' } }),
      Reminder.count({ where: { ...where, linkType: 'task' } }),
      Reminder.count({ where: { ...where, linkType: 'buyer' } }),
      Reminder.count({ where: { ...where, linkType: 'contract' } }),
      Reminder.count({ where: { ...where, linkType: 'compliance' } }),
      Reminder.count({ where: { ...where, linkType: 'general' } }),
    ]);

    return {
      total,
      pending,
      sent,
      acknowledged,
      snoozed,
      cancelled,
      overdue,
      dueToday,
      dueSoon,
      byPriority: { low, normal, high, urgent },
      byLinkType: { deal, task, buyer, contract, compliance, general },
    };
  }

  /**
   * Get due reminders (for scheduler)
   */
  async getDueReminders() {
    const now = new Date();
    return Reminder.findAll({
      where: {
        status: { [Op.in]: ['pending', 'snoozed'] },
        [Op.or]: [
          {
            snoozedUntil: { [Op.lte]: now },
          },
          {
            snoozedUntil: null,
            reminderTime: { [Op.lte]: now },
          },
        ],
      },
      order: [['reminderTime', 'ASC']],
    });
  }

  /**
   * Mark a reminder as sent (for scheduler)
   */
  async markAsSent(id: string) {
    const reminder = await Reminder.findByPk(id);
    if (!reminder) return null;

    reminder.status = 'sent';
    reminder.notificationSent = true;
    reminder.notificationSentAt = new Date();
    await reminder.save();

    return reminder;
  }

  /**
   * Process unsnoozed reminders (snoozed reminders whose snooze time has passed)
   */
  async processUnsnoozedReminders() {
    const now = new Date();
    const snoozedReminders = await Reminder.findAll({
      where: {
        status: 'snoozed',
        snoozedUntil: { [Op.lte]: now },
      },
    });

    for (const reminder of snoozedReminders) {
      reminder.status = 'pending';
      reminder.snoozedUntil = null;
      await reminder.save();
    }

    return snoozedReminders.length;
  }
}

export const reminderService = new ReminderService();
export default reminderService;
