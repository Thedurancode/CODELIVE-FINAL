/**
 * FollowUpChain Model
 *
 * Defines multi-step follow-up sequences that trigger based on events.
 * Each chain contains ordered steps with delays and actions.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Step action types
export type FollowUpActionType =
  | 'send_email'
  | 'send_sms'
  | 'create_task'
  | 'update_status'
  | 'add_tag'
  | 'archive'
  | 'notify_user'
  | 'webhook';

// Individual step in a chain
export interface FollowUpStep {
  stepNumber: number;
  name: string;
  delayDays: number;
  delayHours: number;
  actionType: FollowUpActionType;
  actionConfig: {
    // For send_email
    template?: string;
    subject?: string;
    to?: string; // 'seller' | 'buyer' | 'agent' | specific email
    // For send_sms
    message?: string;
    phone?: string;
    // For create_task
    taskTitle?: string;
    taskDescription?: string;
    priority?: 'low' | 'medium' | 'high';
    assignTo?: string;
    // For update_status
    newStatus?: string;
    // For add_tag
    tag?: string;
    // For archive
    reason?: string;
    // For webhook
    url?: string;
    payload?: Record<string, any>;
  };
  conditions?: {
    // Skip this step if conditions are met
    skipIf?: {
      field: string;
      operator: '==' | '!=' | '>' | '<' | 'contains' | 'not_contains';
      value: any;
    }[];
  };
  stopChainIf?: {
    // Stop the entire chain if conditions are met
    field: string;
    operator: '==' | '!=' | '>' | '<' | 'contains' | 'not_contains';
    value: any;
  }[];
}

// Trigger events for chains
export type FollowUpTriggerEvent =
  | 'offer.no_response'
  | 'offer.rejected'
  | 'offer.countered'
  | 'deal.stale'
  | 'deal.created'
  | 'pipeline.stage_changed'
  | 'contract.sent'
  | 'contract.viewed'
  | 'custom';

interface FollowUpChainAttributes {
  id: string;
  name: string;
  description?: string;
  triggerEvent: FollowUpTriggerEvent;
  triggerConditions?: object; // Additional conditions for trigger
  steps: FollowUpStep[];
  isActive: boolean;
  priority: number; // Lower = higher priority when multiple chains match
  createdAt: Date;
  updatedAt: Date;
}

interface FollowUpChainCreationAttributes
  extends Optional<FollowUpChainAttributes, 'id' | 'description' | 'triggerConditions' | 'isActive' | 'priority' | 'createdAt' | 'updatedAt'> {}

class FollowUpChain
  extends Model<FollowUpChainAttributes, FollowUpChainCreationAttributes>
  implements FollowUpChainAttributes
{
  declare id: string;
  declare name: string;
  declare description: string | undefined;
  declare triggerEvent: FollowUpTriggerEvent;
  declare triggerConditions: object | undefined;
  declare steps: FollowUpStep[];
  declare isActive: boolean;
  declare priority: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Get total duration of the chain in days
   */
  getTotalDurationDays(): number {
    return this.steps.reduce((total, step) => {
      return total + step.delayDays + (step.delayHours / 24);
    }, 0);
  }

  /**
   * Get number of steps
   */
  getStepCount(): number {
    return this.steps.length;
  }

  /**
   * Get step by number
   */
  getStep(stepNumber: number): FollowUpStep | undefined {
    return this.steps.find(s => s.stepNumber === stepNumber);
  }

  /**
   * Validate chain configuration
   */
  validateChain(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.name || this.name.trim() === '') {
      errors.push('Chain name is required');
    }

    if (!this.steps || this.steps.length === 0) {
      errors.push('Chain must have at least one step');
    }

    // Validate step numbers are sequential
    const stepNumbers = this.steps.map(s => s.stepNumber).sort((a, b) => a - b);
    for (let i = 0; i < stepNumbers.length; i++) {
      if (stepNumbers[i] !== i + 1) {
        errors.push(`Step numbers must be sequential starting from 1, found gap at ${i + 1}`);
        break;
      }
    }

    // Validate each step
    this.steps.forEach((step, index) => {
      if (!step.actionType) {
        errors.push(`Step ${index + 1}: actionType is required`);
      }
      if (step.delayDays < 0) {
        errors.push(`Step ${index + 1}: delayDays cannot be negative`);
      }
      if (step.delayHours < 0 || step.delayHours >= 24) {
        errors.push(`Step ${index + 1}: delayHours must be between 0 and 23`);
      }
    });

    return { valid: errors.length === 0, errors };
  }

  /**
   * Find active chains by trigger event
   */
  static async findByTrigger(triggerEvent: FollowUpTriggerEvent): Promise<FollowUpChain[]> {
    return this.findAll({
      where: {
        triggerEvent,
        isActive: true,
      },
      order: [['priority', 'ASC']],
    });
  }
}

FollowUpChain.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    triggerEvent: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    triggerConditions: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    steps: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
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
    tableName: 'follow_up_chains',
    timestamps: true,
    indexes: [
      { fields: ['triggerEvent'] },
      { fields: ['isActive'] },
      { fields: ['priority'] },
    ],
  }
);

export default FollowUpChain;
export { FollowUpChainAttributes, FollowUpChainCreationAttributes };
