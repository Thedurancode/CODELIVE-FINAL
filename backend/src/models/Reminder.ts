/**
 * Reminder Model
 *
 * User-facing reminder system for tracking upcoming events, deadlines,
 * and important dates. Supports linking to deals, tasks, buyers, and
 * other entities. Includes recurrence support and notification integration.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Reminder status options
export type ReminderStatus = 'pending' | 'sent' | 'acknowledged' | 'snoozed' | 'cancelled';

// Reminder priority options
export type ReminderPriority = 'low' | 'normal' | 'high' | 'urgent';

// Link type for what entity the reminder is associated with
export type ReminderLinkType = 'deal' | 'task' | 'buyer' | 'contract' | 'compliance' | 'general';

// Recurrence type
export type ReminderRecurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

interface ReminderAttributes {
  id: string;
  title: string;
  description: string | null;

  // Scheduling
  reminderTime: Date;
  recurrence: ReminderRecurrence;
  recurrencePattern: string | null; // cron expression for custom recurrence
  timezone: string;

  // Status and Priority
  status: ReminderStatus;
  priority: ReminderPriority;

  // Snooze tracking
  snoozedUntil: Date | null;
  snoozeCount: number;

  // User association
  userId: string; // MarketplaceUser UUID
  organizationId: string | null;

  // Links to other entities
  linkType: ReminderLinkType;
  propertyId: number | null;
  taskId: string | null;
  buyerId: string | null;
  contractId: string | null;
  complianceCheckId: number | null;

  // Notification tracking
  notificationSent: boolean;
  notificationSentAt: Date | null;
  emailSent: boolean;
  emailSentAt: Date | null;

  // Acknowledgment tracking
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;

  // Additional info
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;

  // Parent reminder for recurring reminders
  parentReminderId: string | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface ReminderCreationAttributes
  extends Optional<
    ReminderAttributes,
    | 'id'
    | 'description'
    | 'recurrence'
    | 'recurrencePattern'
    | 'timezone'
    | 'status'
    | 'priority'
    | 'snoozedUntil'
    | 'snoozeCount'
    | 'organizationId'
    | 'linkType'
    | 'propertyId'
    | 'taskId'
    | 'buyerId'
    | 'contractId'
    | 'complianceCheckId'
    | 'notificationSent'
    | 'notificationSentAt'
    | 'emailSent'
    | 'emailSentAt'
    | 'acknowledgedAt'
    | 'acknowledgedBy'
    | 'notes'
    | 'tags'
    | 'metadata'
    | 'parentReminderId'
    | 'createdAt'
    | 'updatedAt'
  > {}

class Reminder
  extends Model<ReminderAttributes, ReminderCreationAttributes>
  implements ReminderAttributes
{
  declare id: string;
  declare title: string;
  declare description: string | null;

  declare reminderTime: Date;
  declare recurrence: ReminderRecurrence;
  declare recurrencePattern: string | null;
  declare timezone: string;

  declare status: ReminderStatus;
  declare priority: ReminderPriority;

  declare snoozedUntil: Date | null;
  declare snoozeCount: number;

  declare userId: string;
  declare organizationId: string | null;

  declare linkType: ReminderLinkType;
  declare propertyId: number | null;
  declare taskId: string | null;
  declare buyerId: string | null;
  declare contractId: string | null;
  declare complianceCheckId: number | null;

  declare notificationSent: boolean;
  declare notificationSentAt: Date | null;
  declare emailSent: boolean;
  declare emailSentAt: Date | null;

  declare acknowledgedAt: Date | null;
  declare acknowledgedBy: string | null;

  declare notes: string | null;
  declare tags: string[];
  declare metadata: Record<string, unknown> | null;

  declare parentReminderId: string | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Helper methods
  isDue(): boolean {
    const now = new Date();
    if (this.status !== 'pending') return false;
    if (this.snoozedUntil && this.snoozedUntil > now) return false;
    return this.reminderTime <= now;
  }

  isRecurring(): boolean {
    return this.recurrence !== 'none';
  }

  isSnoozed(): boolean {
    if (!this.snoozedUntil) return false;
    return this.snoozedUntil > new Date();
  }

  // Static helper methods
  static async getRemindersForUser(userId: string, status?: ReminderStatus) {
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    return this.findAll({
      where,
      order: [
        ['reminderTime', 'ASC'],
        ['priority', 'DESC'],
      ],
    });
  }

  static async getPendingReminders(userId?: string) {
    const where: Record<string, unknown> = {
      status: 'pending',
    };
    if (userId) where.userId = userId;
    return this.findAll({
      where,
      order: [['reminderTime', 'ASC']],
    });
  }

  static async getDueReminders() {
    const now = new Date();
    return this.findAll({
      where: {
        status: 'pending',
        reminderTime: { [require('sequelize').Op.lte]: now },
        [require('sequelize').Op.or]: [
          { snoozedUntil: null },
          { snoozedUntil: { [require('sequelize').Op.lte]: now } },
        ],
      },
      order: [
        ['priority', 'DESC'],
        ['reminderTime', 'ASC'],
      ],
    });
  }

  static async getUpcomingReminders(userId: string, hours: number = 24) {
    const now = new Date();
    const upcoming = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return this.findAll({
      where: {
        userId,
        status: 'pending',
        reminderTime: {
          [require('sequelize').Op.gte]: now,
          [require('sequelize').Op.lte]: upcoming,
        },
      },
      order: [['reminderTime', 'ASC']],
    });
  }

  static async getRemindersByDeal(propertyId: number) {
    return this.findAll({
      where: { propertyId, linkType: 'deal' },
      order: [['reminderTime', 'ASC']],
    });
  }

  static async getRemindersByTask(taskId: string) {
    return this.findAll({
      where: { taskId, linkType: 'task' },
      order: [['reminderTime', 'ASC']],
    });
  }

  static async getRemindersByBuyer(buyerId: string) {
    return this.findAll({
      where: { buyerId, linkType: 'buyer' },
      order: [['reminderTime', 'ASC']],
    });
  }
}

Reminder.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reminderTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    recurrence: {
      type: DataTypes.ENUM('none', 'daily', 'weekly', 'monthly', 'yearly', 'custom'),
      allowNull: false,
      defaultValue: 'none',
    },
    recurrencePattern: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    timezone: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'America/Chicago',
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'acknowledged', 'snoozed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      allowNull: false,
      defaultValue: 'normal',
    },
    snoozedUntil: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    snoozeCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id',
      },
    },
    linkType: {
      type: DataTypes.ENUM('deal', 'task', 'buyer', 'contract', 'compliance', 'general'),
      allowNull: false,
      defaultValue: 'general',
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'properties',
        key: 'id',
      },
    },
    taskId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'tasks',
        key: 'id',
      },
    },
    buyerId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'buyers',
        key: 'id',
      },
    },
    contractId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    complianceCheckId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'compliance_checks',
        key: 'id',
      },
    },
    notificationSent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notificationSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    emailSent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    emailSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    acknowledgedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    acknowledgedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    parentReminderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'reminders',
        key: 'id',
      },
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
    tableName: 'reminders',
    timestamps: true,
    indexes: [
      { fields: ['userId', 'status'] },
      { fields: ['userId', 'reminderTime'] },
      { fields: ['organizationId'] },
      { fields: ['status'] },
      { fields: ['priority'] },
      { fields: ['reminderTime'] },
      { fields: ['linkType'] },
      { fields: ['propertyId'] },
      { fields: ['taskId'] },
      { fields: ['buyerId'] },
      { fields: ['parentReminderId'] },
      { fields: ['tags'], using: 'gin' },
      {
        name: 'reminders_due',
        fields: ['status', 'reminderTime'],
        where: { status: 'pending' },
      },
    ],
  }
);

export default Reminder;
export { ReminderAttributes, ReminderCreationAttributes };
