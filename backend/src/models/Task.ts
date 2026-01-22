/**
 * Task Model
 *
 * Full task management with assignments, due dates, priorities, and dependencies.
 * Tasks can be linked to deals (properties), buyers, or compliance items
 * with automated creation from workflow rules.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Task status options
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';

// Task priority options
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

// Link type for what entity the task is associated with
export type TaskLinkType = 'deal' | 'buyer' | 'compliance' | 'project' | 'none';

interface TaskAttributes {
  id: string;
  title: string;
  description: string | null;

  // Status and Priority
  status: TaskStatus;
  priority: TaskPriority;

  // Dates
  dueDate: Date | null;
  startDate: Date | null;
  completedAt: Date | null;

  // Assignment
  assignedTo: string | null; // MarketplaceUser UUID
  assignedBy: string | null; // MarketplaceUser UUID
  organizationId: string | null;

  // Links to other entities
  linkType: TaskLinkType;
  propertyId: number | null; // For deal linkage
  buyerId: string | null; // For buyer linkage
  complianceCheckId: number | null; // For compliance linkage
  projectId: string | null; // For project linkage

  // Dependencies - stored as JSON array of task IDs
  dependsOn: string[];
  blockedBy: string[]; // Tasks that block this task

  // Recurrence (for automated task creation)
  isRecurring: boolean;
  recurrencePattern: string | null; // cron expression or simple pattern
  parentTaskId: string | null; // For recurring task instances

  // Audit trail
  createdBy: string | null;
  completedBy: string | null;

  // Additional info
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface TaskCreationAttributes
  extends Optional<
    TaskAttributes,
    | 'id'
    | 'description'
    | 'status'
    | 'priority'
    | 'dueDate'
    | 'startDate'
    | 'completedAt'
    | 'assignedTo'
    | 'assignedBy'
    | 'organizationId'
    | 'linkType'
    | 'propertyId'
    | 'buyerId'
    | 'complianceCheckId'
    | 'projectId'
    | 'dependsOn'
    | 'blockedBy'
    | 'isRecurring'
    | 'recurrencePattern'
    | 'parentTaskId'
    | 'createdBy'
    | 'completedBy'
    | 'notes'
    | 'tags'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
  > {}

class Task
  extends Model<TaskAttributes, TaskCreationAttributes>
  implements TaskAttributes
{
  declare id: string;
  declare title: string;
  declare description: string | null;

  declare status: TaskStatus;
  declare priority: TaskPriority;

  declare dueDate: Date | null;
  declare startDate: Date | null;
  declare completedAt: Date | null;

  declare assignedTo: string | null;
  declare assignedBy: string | null;
  declare organizationId: string | null;

  declare linkType: TaskLinkType;
  declare propertyId: number | null;
  declare buyerId: string | null;
  declare complianceCheckId: number | null;
  declare projectId: string | null;

  declare dependsOn: string[];
  declare blockedBy: string[];

  declare isRecurring: boolean;
  declare recurrencePattern: string | null;
  declare parentTaskId: string | null;

  declare createdBy: string | null;
  declare completedBy: string | null;

  declare notes: string | null;
  declare tags: string[];
  declare metadata: Record<string, unknown> | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Static helper methods
  static async getTasksForUser(userId: string, status?: TaskStatus) {
    const where: Record<string, unknown> = { assignedTo: userId };
    if (status) where.status = status;
    return this.findAll({
      where,
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
        ['createdAt', 'DESC'],
      ],
    });
  }

  static async getTasksCreatedBy(userId: string) {
    return this.findAll({
      where: { createdBy: userId },
      order: [['createdAt', 'DESC']],
    });
  }

  static async getTasksByDeal(propertyId: number) {
    return this.findAll({
      where: { propertyId, linkType: 'deal' },
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
      ],
    });
  }

  static async getTasksByBuyer(buyerId: string) {
    return this.findAll({
      where: { buyerId, linkType: 'buyer' },
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
      ],
    });
  }

  static async getTasksByCompliance(complianceCheckId: number) {
    return this.findAll({
      where: { complianceCheckId, linkType: 'compliance' },
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
      ],
    });
  }

  static async getTasksByProject(projectId: string, status?: TaskStatus | TaskStatus[]) {
    const where: Record<string, unknown> = { projectId, linkType: 'project' };
    if (status) {
      where.status = Array.isArray(status) ? { [require('sequelize').Op.in]: status } : status;
    }
    return this.findAll({
      where,
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
      ],
    });
  }

  static async getOverdueTasks(userId?: string) {
    const where: Record<string, unknown> = {
      status: ['pending', 'in_progress'],
      dueDate: { [require('sequelize').Op.lt]: new Date() },
    };
    if (userId) where.assignedTo = userId;
    return this.findAll({
      where,
      order: [['dueDate', 'ASC']],
    });
  }

  static async getPendingCount(userId: string): Promise<number> {
    return this.count({
      where: { assignedTo: userId, status: 'pending' },
    });
  }

  static async getBlockedTasks(taskId: string) {
    return this.findAll({
      where: {
        dependsOn: { [require('sequelize').Op.contains]: [taskId] },
      },
    });
  }
}

Task.init(
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
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'blocked', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      allowNull: false,
      defaultValue: 'normal',
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    assignedTo: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: true,
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
      type: DataTypes.ENUM('deal', 'buyer', 'compliance', 'project', 'none'),
      allowNull: false,
      defaultValue: 'none',
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'properties',
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
    complianceCheckId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'compliance_checks',
        key: 'id',
      },
    },
    projectId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'projects',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    dependsOn: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: false,
      defaultValue: [],
    },
    blockedBy: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: false,
      defaultValue: [],
    },
    isRecurring: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    recurrencePattern: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentTaskId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'tasks',
        key: 'id',
      },
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
    },
    completedBy: {
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
    tableName: 'tasks',
    timestamps: true,
    indexes: [
      { fields: ['assignedTo', 'status'] },
      { fields: ['assignedBy'] },
      { fields: ['createdBy'] },
      { fields: ['organizationId'] },
      { fields: ['propertyId'] },
      { fields: ['buyerId'] },
      { fields: ['complianceCheckId'] },
      { fields: ['projectId'] },
      { fields: ['status'] },
      { fields: ['priority'] },
      { fields: ['dueDate'] },
      { fields: ['linkType'] },
      { fields: ['parentTaskId'] },
      { fields: ['tags'], using: 'gin' },
    ],
  }
);

export default Task;
