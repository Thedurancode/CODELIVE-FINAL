/**
 * Automation Model
 *
 * Persists automation configurations to the database.
 * Used by the AutomationEngine for event-driven workflows.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import {
  AutomationTrigger,
  AutomationCondition,
  AutomationAction,
  Automation as AutomationType,
} from '../plugins/types';

interface AutomationAttributes {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  cooldown?: number;
  maxExecutionsPerHour?: number;
  lastExecutedAt?: Date;
  executionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface AutomationCreationAttributes
  extends Optional<
    AutomationAttributes,
    | 'id'
    | 'description'
    | 'enabled'
    | 'cooldown'
    | 'maxExecutionsPerHour'
    | 'lastExecutedAt'
    | 'executionCount'
    | 'createdAt'
    | 'updatedAt'
  > {}

class Automation
  extends Model<AutomationAttributes, AutomationCreationAttributes>
  implements AutomationAttributes
{
  declare id: string;
  declare name: string;
  declare description: string | undefined;
  declare enabled: boolean;
  declare trigger: AutomationTrigger;
  declare conditions: AutomationCondition[];
  declare actions: AutomationAction[];
  declare cooldown: number | undefined;
  declare maxExecutionsPerHour: number | undefined;
  declare lastExecutedAt: Date | undefined;
  declare executionCount: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Convert to the Automation type expected by AutomationEngine
   */
  toAutomation(): AutomationType {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      enabled: this.enabled,
      trigger: this.trigger,
      conditions: this.conditions,
      actions: this.actions,
      cooldown: this.cooldown,
      maxExecutionsPerHour: this.maxExecutionsPerHour,
      lastExecutedAt: this.lastExecutedAt,
      executionCount: this.executionCount,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

Automation.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: () => `automation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    trigger: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    conditions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    actions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    cooldown: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    maxExecutionsPerHour: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    lastExecutedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    executionCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'automations',
    timestamps: true,
    indexes: [
      { fields: ['enabled'] },
      { fields: ['lastExecutedAt'] },
      { name: 'automations_trigger_type', using: 'gin', fields: [sequelize.literal("(trigger->>'type')")] },
    ],
  }
);

export default Automation;
export { AutomationAttributes, AutomationCreationAttributes };
