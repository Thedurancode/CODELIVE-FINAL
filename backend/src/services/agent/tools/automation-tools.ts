/**
 * Automation Tools
 *
 * Tools for managing automation rules and workflows.
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import Automation from '../../../models/Automation';
import AutomationExecution from '../../../models/AutomationExecution';
import { Op } from 'sequelize';

/**
 * Register all automation tools with the registry
 */
export function registerAutomationTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // LIST AUTOMATIONS
    // =========================================================================
    defineTool({
      name: 'list_automations',
      description: 'List all configured automation rules and their status.',
      category: 'automation',
      schema: z.object({
        enabled: z.boolean().optional().describe('Filter by enabled status'),
        triggerType: z.string().optional().describe('Filter by trigger type'),
      }),
      handler: async (input, context) => {
        try {
          const where: any = {};
          if (input.enabled !== undefined) where.enabled = input.enabled;
          if (input.triggerType) where.triggerType = input.triggerType;

          const automations = await Automation.findAll({
            where,
            order: [['priority', 'ASC']],
          });

          return success({
            automations: automations.map((a: any) => ({
              id: a.id,
              name: a.name,
              description: a.description,
              triggerType: a.triggerType,
              actionType: a.actionType,
              enabled: a.enabled,
              priority: a.priority,
              lastTriggered: a.lastTriggeredAt,
              executionCount: a.executionCount,
            })),
            count: automations.length,
          });
        } catch (error) {
          return failure(`Error listing automations: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 30 * 60, // 30 minutes
    }),

    // =========================================================================
    // GET AUTOMATION
    // =========================================================================
    defineTool({
      name: 'get_automation',
      description: 'Get detailed information about a specific automation rule.',
      category: 'automation',
      schema: z.object({
        automationId: z.string().describe('Automation ID or name'),
      }),
      handler: async (input, context) => {
        try {
          let automation = await Automation.findByPk(input.automationId);

          if (!automation) {
            automation = await Automation.findOne({
              where: { name: { [Op.iLike]: `%${input.automationId}%` } },
            });
          }

          if (!automation) {
            return failure(`Automation "${input.automationId}" not found.`);
          }

          const a = automation as any;
          return success({
            id: a.id,
            name: a.name,
            description: a.description,
            trigger: a.trigger,
            conditions: a.conditions,
            actions: a.actions,
            enabled: a.enabled,
            cooldown: a.cooldown,
            lastExecutedAt: a.lastExecutedAt,
            executionCount: a.executionCount,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          });
        } catch (error) {
          return failure(`Error getting automation: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 30 * 60, // 30 minutes
    }),

    // =========================================================================
    // TOGGLE AUTOMATION
    // =========================================================================
    defineTool({
      name: 'toggle_automation',
      description: 'Enable or disable an automation rule.',
      category: 'automation',
      schema: z.object({
        automationId: z.string().describe('Automation ID or name'),
        enabled: z.boolean().describe('New enabled state'),
      }),
      handler: async (input, context) => {
        try {
          let automation = await Automation.findByPk(input.automationId);

          if (!automation) {
            automation = await Automation.findOne({
              where: { name: { [Op.iLike]: `%${input.automationId}%` } },
            });
          }

          if (!automation) {
            return failure(`Automation "${input.automationId}" not found.`);
          }

          await automation.update({ enabled: input.enabled });

          return success({
            automationId: automation.id,
            name: automation.name,
            enabled: input.enabled,
            message: `Automation "${automation.name}" has been ${input.enabled ? 'enabled' : 'disabled'}.`,
          });
        } catch (error) {
          return failure(`Error toggling automation: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // CREATE AUTOMATION
    // =========================================================================
    defineTool({
      name: 'create_automation',
      description: 'Create a new automation rule.',
      category: 'automation',
      schema: z.object({
        name: z.string().describe('Automation name'),
        description: z.string().optional().describe('Description'),
        triggerType: z
          .enum(['deal_created', 'deal_scored', 'deal_matched', 'stage_changed', 'schedule'])
          .describe('When to trigger'),
        triggerConditions: z
          .object({
            minScore: z.number().optional(),
            states: z.array(z.string()).optional(),
            matchType: z.string().optional(),
          })
          .optional()
          .describe('Conditions for triggering'),
        actionType: z
          .enum(['send_email', 'send_sms', 'create_task', 'update_stage', 'notify_fund'])
          .describe('Action to take'),
        actionConfig: z
          .object({
            templateId: z.string().optional(),
            recipientType: z.string().optional(),
            message: z.string().optional(),
          })
          .optional()
          .describe('Action configuration'),
        enabled: z.boolean().optional().default(true).describe('Enable immediately'),
      }),
      handler: async (input, context) => {
        try {
          const automation = await Automation.create({
            name: input.name,
            description: input.description,
            triggerType: input.triggerType,
            triggerConditions: input.triggerConditions || {},
            actionType: input.actionType,
            actionConfig: input.actionConfig || {},
            enabled: input.enabled !== false,
            priority: 50,
          } as any);

          const a = automation as any;
          return success({
            automationId: a.id,
            name: a.name,
            trigger: a.trigger,
            actions: a.actions,
            enabled: a.enabled,
            message: `Automation "${a.name}" created successfully.`,
          });
        } catch (error) {
          return failure(`Error creating automation: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // DELETE AUTOMATION
    // =========================================================================
    defineTool({
      name: 'delete_automation',
      description: 'Delete an automation rule permanently.',
      category: 'automation',
      schema: z.object({
        automationId: z.string().describe('Automation ID or name'),
        confirm: z.boolean().describe('Must be true to confirm deletion'),
      }),
      handler: async (input, context) => {
        try {
          if (!input.confirm) {
            return failure('Deletion not confirmed. Set confirm=true to delete.');
          }

          let automation = await Automation.findByPk(input.automationId);

          if (!automation) {
            automation = await Automation.findOne({
              where: { name: { [Op.iLike]: `%${input.automationId}%` } },
            });
          }

          if (!automation) {
            return failure(`Automation "${input.automationId}" not found.`);
          }

          const name = automation.name;
          await automation.destroy();

          return success({
            deleted: true,
            name,
            message: `Automation "${name}" has been deleted.`,
          });
        } catch (error) {
          return failure(`Error deleting automation: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET AUTOMATION HISTORY
    // =========================================================================
    defineTool({
      name: 'get_automation_history',
      description: 'Get execution history for an automation.',
      category: 'automation',
      schema: z.object({
        automationId: z.string().optional().describe('Filter by automation ID'),
        status: z
          .enum(['success', 'failed', 'pending'])
          .optional()
          .describe('Filter by status'),
        limit: z.number().optional().default(20).describe('Number of records'),
      }),
      handler: async (input, context) => {
        try {
          const where: any = {};
          if (input.automationId) where.automationId = input.automationId;
          if (input.status) where.status = input.status;

          const executions = await AutomationExecution.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: input.limit || 20,
          });

          return success({
            executions: executions.map((e: any) => ({
              id: e.id,
              automationId: e.automationId,
              status: e.status,
              triggeredBy: e.triggeredBy,
              result: e.result,
              error: e.error,
              executedAt: e.createdAt,
            })),
            count: executions.length,
          });
        } catch (error) {
          return failure(`Error getting automation history: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerAutomationTools;
