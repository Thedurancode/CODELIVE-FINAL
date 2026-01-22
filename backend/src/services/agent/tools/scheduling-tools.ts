/**
 * Scheduling Tools
 *
 * Tools for creating and managing scheduled tasks (reminders, reports, actions).
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import { scheduledTaskService } from '../ScheduledTaskService';
import { reminderService } from '../../ReminderService';
import { resolveCommunicationContext } from '../../../utils/organizationDefaults';

/**
 * Register all scheduling tools with the registry
 */
export function registerSchedulingTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // SCHEDULE REMINDER
    // =========================================================================
    defineTool({
      name: 'schedule_reminder',
      description:
        'Schedule a reminder for the user. Accepts natural language time expressions like "in 2 hours", "tomorrow at 9am", "next Monday". The user will receive a notification when the reminder is due.',
      category: 'scheduling',
      schema: z.object({
        title: z.string().describe('Short title for the reminder'),
        message: z.string().describe('Reminder message/details'),
        scheduledFor: z
          .string()
          .describe(
            'When to send the reminder. Natural language like "in 2 hours", "tomorrow at 3pm", "next Friday at noon"'
          ),
        recurrence: z
          .string()
          .optional()
          .describe('Optional recurrence pattern: "daily", "weekly", "monthly", or "every Monday"'),
      }),
      handler: async (input, context) => {
        try {
          const { userId, organizationId } = await resolveCommunicationContext({
            userId: context.userId,
          });
          if (!userId) {
            return failure('User authentication required to schedule reminders.');
          }

          // Validate and parse the time
          const parsedTime = scheduledTaskService.parseNaturalTime(input.scheduledFor);
          if (!parsedTime) {
            return failure(
              `Could not understand the time "${input.scheduledFor}". Try something like "in 2 hours", "tomorrow at 9am", or "next Monday".`
            );
          }

          // Parse recurrence if provided
          let recurrencePattern: string | undefined;
          let recurrenceType: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' = 'none';
          if (input.recurrence) {
            recurrencePattern = scheduledTaskService.parseRecurrence(input.recurrence) || undefined;
            if (!recurrencePattern) {
              return failure(
                `Could not understand recurrence "${input.recurrence}". Try "daily", "weekly", "monthly", or "every Monday".`
              );
            }
            const normalized = input.recurrence.trim().toLowerCase();
            if (normalized === 'daily') recurrenceType = 'daily';
            else if (normalized === 'weekly') recurrenceType = 'weekly';
            else if (normalized === 'monthly') recurrenceType = 'monthly';
            else if (normalized === 'yearly' || normalized === 'annually' || normalized === 'annual') recurrenceType = 'yearly';
            else recurrenceType = 'custom';
          }

          const reminder = await reminderService.createReminder({
            title: input.title,
            description: input.message,
            reminderTime: parsedTime,
            recurrence: recurrenceType === 'none' ? undefined : recurrenceType,
            recurrencePattern: recurrenceType === 'custom' ? recurrencePattern : undefined,
            userId,
            organizationId: organizationId || undefined,
            linkType: 'general',
          });

          return success({
            reminderId: reminder.id,
            title: reminder.title,
            scheduledFor: reminder.reminderTime.toISOString(),
            formattedTime: reminder.reminderTime.toLocaleString(),
            recurring: recurrenceType !== 'none',
            message: `Reminder scheduled for ${reminder.reminderTime.toLocaleString()}`,
          });
        } catch (error) {
          return failure(`Error scheduling reminder: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SCHEDULE REPORT
    // =========================================================================
    defineTool({
      name: 'schedule_report',
      description:
        'Schedule a recurring or one-time report to be generated and sent to the user. Supports market reports, deal summaries, pipeline updates, etc.',
      category: 'scheduling',
      schema: z.object({
        title: z.string().describe('Report title'),
        reportType: z
          .enum(['market_summary', 'deal_pipeline', 'buy_box_matches', 'property_alerts', 'custom'])
          .describe('Type of report to generate'),
        scheduledFor: z.string().describe('When to generate the first report'),
        recurrence: z
          .string()
          .optional()
          .describe('Recurrence pattern for regular reports: "daily", "weekly", "monthly"'),
        parameters: z
          .record(z.string(), z.any())
          .optional()
          .describe('Report-specific parameters (e.g., state filter, price range)'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required to schedule reports.');
          }

          const parsedTime = scheduledTaskService.parseNaturalTime(input.scheduledFor);
          if (!parsedTime) {
            return failure(`Could not understand the time "${input.scheduledFor}".`);
          }

          let recurrence: string | undefined;
          if (input.recurrence) {
            recurrence = scheduledTaskService.parseRecurrence(input.recurrence) || undefined;
          }

          const task = await scheduledTaskService.createTask({
            userId: context.userId,
            sessionId: context.sessionId,
            type: 'report',
            title: input.title,
            message: `${input.reportType} report`,
            scheduledFor: parsedTime,
            recurrence,
            actionType: input.reportType,
            actionParams: input.parameters,
          });

          return success({
            taskId: task.id,
            title: task.title,
            reportType: input.reportType,
            scheduledFor: task.scheduledFor.toISOString(),
            recurring: !!recurrence,
            recurrencePattern: input.recurrence,
            message: `${input.reportType} report scheduled for ${task.scheduledFor.toLocaleString()}`,
          });
        } catch (error) {
          return failure(`Error scheduling report: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SCHEDULE ACTION
    // =========================================================================
    defineTool({
      name: 'schedule_action',
      description:
        'Schedule a tool/action to run at a specific time. Useful for delayed operations like "analyze this property tomorrow" or "send this deal to funds on Monday".',
      category: 'scheduling',
      schema: z.object({
        title: z.string().describe('Description of the scheduled action'),
        actionType: z.string().describe('Name of the tool to execute'),
        actionParams: z.record(z.string(), z.any()).describe('Parameters to pass to the tool'),
        scheduledFor: z.string().describe('When to execute the action'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required to schedule actions.');
          }

          const parsedTime = scheduledTaskService.parseNaturalTime(input.scheduledFor);
          if (!parsedTime) {
            return failure(`Could not understand the time "${input.scheduledFor}".`);
          }

          const task = await scheduledTaskService.createTask({
            userId: context.userId,
            sessionId: context.sessionId,
            type: 'action',
            title: input.title,
            message: `Execute ${input.actionType}`,
            scheduledFor: parsedTime,
            actionType: input.actionType,
            actionParams: input.actionParams,
          });

          return success({
            taskId: task.id,
            title: task.title,
            actionType: input.actionType,
            scheduledFor: task.scheduledFor.toISOString(),
            message: `Action "${input.actionType}" scheduled for ${task.scheduledFor.toLocaleString()}`,
          });
        } catch (error) {
          return failure(`Error scheduling action: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // LIST SCHEDULED TASKS
    // =========================================================================
    defineTool({
      name: 'list_scheduled_tasks',
      description:
        "List the user's scheduled tasks (reminders, reports, actions). Shows pending tasks by default.",
      category: 'scheduling',
      schema: z.object({
        status: z
          .enum(['pending', 'completed', 'failed', 'cancelled', 'all'])
          .optional()
          .default('pending')
          .describe('Filter by status'),
        type: z
          .enum(['reminder', 'report', 'action'])
          .optional()
          .describe('Filter by task type'),
        limit: z.number().optional().default(20).describe('Maximum tasks to return'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          const statusFilter =
            input.status === 'all'
              ? ['pending', 'completed', 'failed', 'cancelled']
              : [input.status || 'pending'];

          const { tasks, total } = await scheduledTaskService.listTasks(context.userId, {
            status: statusFilter as any,
            type: input.type,
            limit: input.limit,
          });

          return success({
            tasks: tasks.map((t) => ({
              id: t.id,
              type: t.type,
              title: t.title,
              message: t.message,
              scheduledFor: t.scheduledFor.toISOString(),
              formattedTime: t.scheduledFor.toLocaleString(),
              status: t.status,
              recurring: !!t.recurrence,
              actionType: t.actionType,
            })),
            count: tasks.length,
            total,
          });
        } catch (error) {
          return failure(`Error listing scheduled tasks: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // CANCEL SCHEDULED TASK
    // =========================================================================
    defineTool({
      name: 'cancel_scheduled_task',
      description: 'Cancel a pending scheduled task by ID.',
      category: 'scheduling',
      schema: z.object({
        taskId: z.string().describe('ID of the task to cancel'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          const cancelled = await scheduledTaskService.cancelTask(input.taskId, context.userId);

          if (!cancelled) {
            return failure(
              `Could not cancel task ${input.taskId}. It may not exist, already completed, or belong to another user.`
            );
          }

          return success({
            taskId: input.taskId,
            cancelled: true,
            message: `Task ${input.taskId} has been cancelled.`,
          });
        } catch (error) {
          return failure(`Error cancelling task: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // RESCHEDULE TASK
    // =========================================================================
    defineTool({
      name: 'reschedule_task',
      description: 'Reschedule a pending task to a new time.',
      category: 'scheduling',
      schema: z.object({
        taskId: z.string().describe('ID of the task to reschedule'),
        newTime: z.string().describe('New time for the task (natural language)'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          const task = await scheduledTaskService.rescheduleTask(
            input.taskId,
            context.userId,
            input.newTime
          );

          if (!task) {
            return failure(
              `Could not reschedule task ${input.taskId}. It may not exist or belong to another user.`
            );
          }

          return success({
            taskId: task.id,
            title: task.title,
            oldTime: 'Previous time',
            newTime: task.scheduledFor.toISOString(),
            formattedTime: task.scheduledFor.toLocaleString(),
            message: `Task rescheduled to ${task.scheduledFor.toLocaleString()}`,
          });
        } catch (error) {
          return failure(`Error rescheduling task: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerSchedulingTools;
