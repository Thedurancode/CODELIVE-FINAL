/**
 * Task Tools
 *
 * Tools for creating and assigning tasks via chat.
 */

import { z } from 'zod';
import { Op } from 'sequelize';
import { toolRegistry, success, failure, defineTool } from './registry';
import { scheduledTaskService } from '../ScheduledTaskService';
import { taskService } from '../../TaskService';
import MarketplaceUser from '../../../models/MarketplaceUser';
import { propertyService } from '../../propertyService';

type AssigneeMatch = {
  id: string;
  name: string;
  email: string;
  role: string;
};

async function getOrganizationIdForUser(userId: string): Promise<string | null> {
  const user = await MarketplaceUser.findByPk(userId, { attributes: ['organizationId'] });
  return user?.organizationId || null;
}

function parseAddressInput(input: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): { street?: string; city?: string; state?: string; zip?: string } {
  if (!input.address) return {};

  let street = input.address.trim();
  let city = input.city?.trim();
  let state = input.state?.trim().toUpperCase();
  let zip = input.zip?.trim();

  const parts = input.address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    street = parts[0];
    const tail = parts.slice(1);
    if (!city && tail.length >= 1) {
      if (tail.length >= 2) {
        city = tail[0];
      } else {
        const tokens = tail[0].split(/\s+/).filter(Boolean);
        if (tokens.length >= 2) {
          const match = tokens.slice(-2).join(' ').match(/([A-Za-z]{2})(?:\s+(\d{5}))?/);
          if (match) {
            state = state || match[1].toUpperCase();
            zip = zip || match[2];
            city = tokens.slice(0, tokens.length - (match[2] ? 2 : 1)).join(' ');
          } else {
            city = tail[0];
          }
        } else {
          city = tail[0];
        }
      }
    }
    if (!state && tail.length >= 2) {
      const match = tail[1].match(/([A-Za-z]{2})(?:\s+(\d{5}))?/);
      if (match) {
        state = match[1].toUpperCase();
        zip = zip || match[2];
      }
    }
  }

  return { street, city, state, zip };
}

async function findAssigneeByNameOrEmail(
  query: string,
  organizationId: string | null
): Promise<AssigneeMatch | null | { error: string }> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const where: Record<string, unknown> = {};
  if (organizationId) where.organizationId = organizationId;

  let matches: MarketplaceUser[] = [];
  if (trimmed.includes('@')) {
    matches = await MarketplaceUser.findAll({
      where: {
        ...where,
        email: { [Op.iLike]: trimmed },
      },
      limit: 5,
    });
  } else {
    matches = await MarketplaceUser.findAll({
      where: {
        ...where,
        name: { [Op.iLike]: `%${trimmed}%` },
      },
      limit: 5,
    });
  }

  if (matches.length === 0) {
    return { error: `No user found for "${trimmed}".` };
  }

  if (matches.length > 1) {
    const names = matches.map((m) => `${m.name} <${m.email}>`).join(', ');
    return { error: `Multiple users matched "${trimmed}": ${names}` };
  }

  const match = matches[0];
  return {
    id: match.id,
    name: match.name,
    email: match.email,
    role: match.role,
  };
}

async function resolveAssignees(input: {
  assignees?: string[] | string;
  assigneeRole?: string;
  assignToAll?: boolean;
  organizationId: string | null;
  userId: string;
}): Promise<{ assignees: AssigneeMatch[] } | { error: string }> {
  const { assignees, assigneeRole, assignToAll, organizationId, userId } = input;

  if (!organizationId && (assignToAll || assigneeRole || assignees)) {
    return { error: 'Organization not found for assigning tasks.' };
  }

  if (assignToAll) {
    const users = await MarketplaceUser.findAll({
      where: { organizationId },
      attributes: ['id', 'name', 'email', 'role'],
    });
    if (users.length === 0) {
      return { error: 'No users found in this organization.' };
    }
    return {
      assignees: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      })),
    };
  }

  if (assigneeRole) {
    const users = await MarketplaceUser.findAll({
      where: { organizationId, role: assigneeRole },
      attributes: ['id', 'name', 'email', 'role'],
    });
    if (users.length === 0) {
      return { error: `No users found with role "${assigneeRole}".` };
    }
    return {
      assignees: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      })),
    };
  }

  const list = Array.isArray(assignees) ? assignees : assignees ? [assignees] : [];
  if (list.length === 0) {
    const self = await MarketplaceUser.findByPk(userId, { attributes: ['id', 'name', 'email', 'role'] });
    if (!self) {
      return { error: 'User not found for task assignment.' };
    }
    return {
      assignees: [{
        id: self.id,
        name: self.name,
        email: self.email,
        role: self.role,
      }],
    };
  }

  const resolved: AssigneeMatch[] = [];
  for (const query of list) {
    const match = await findAssigneeByNameOrEmail(query, organizationId);
    if (!match || 'error' in match) {
      return { error: match?.error || `No user found for "${query}".` };
    }
    resolved.push(match);
  }

  return { assignees: resolved };
}

/**
 * Register task tools with the registry
 */
export function registerTaskTools(): void {
  toolRegistry.registerAll([
    defineTool({
      name: 'create_task',
      description:
        'Create and assign a task. Supports assigning to one user, a role, or everyone in the organization.',
      category: 'scheduling',
      schema: z.object({
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Task details'),
        dueDate: z.string().optional().describe('Due date/time (natural language, e.g., "tomorrow at 7pm")'),
        timezone: z.string().optional().describe('Timezone for due date (e.g., America/New_York)'),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        assignees: z.union([z.string(), z.array(z.string())]).optional()
          .describe('Assignee name(s) or email(s)'),
        assigneeRole: z.string().optional().describe('Assign to all users with this role'),
        assignToAll: z.boolean().optional().default(false)
          .describe('Assign to all users in your organization'),
        propertyId: z.number().optional().describe('Link task to a property by ID'),
        propertyAddress: z.string().optional().describe('Property address to link if propertyId not provided'),
        city: z.string().optional().describe('City for property lookup'),
        state: z.string().optional().describe('State for property lookup'),
        zip: z.string().optional().describe('ZIP for property lookup'),
        tags: z.array(z.string()).optional().describe('Tags for the task'),
        notes: z.string().optional().describe('Internal notes'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required to create tasks.');
          }

          const organizationId = await getOrganizationIdForUser(context.userId);
          const assigneeResult = await resolveAssignees({
            assignees: input.assignees,
            assigneeRole: input.assigneeRole,
            assignToAll: input.assignToAll,
            organizationId,
            userId: context.userId,
          });

          if ('error' in assigneeResult) {
            return failure(assigneeResult.error);
          }

          let dueDate: Date | undefined;
          if (input.dueDate) {
            const parsed = scheduledTaskService.parseNaturalTime(input.dueDate, input.timezone);
            if (!parsed) {
              return failure(`Could not understand the time "${input.dueDate}".`);
            }
            dueDate = parsed;
          }

          let propertyId = input.propertyId;
          if (!propertyId && input.propertyAddress) {
            const parsed = parseAddressInput({
              address: input.propertyAddress,
              city: input.city,
              state: input.state,
              zip: input.zip,
            });
            if (parsed.street && parsed.city && parsed.state) {
              const property = await propertyService.findByAddress(
                parsed.street,
                parsed.city,
                parsed.state,
                parsed.zip
              );
              if (property) {
                propertyId = property.id;
              }
            }
          }

          const created = [];
          for (const assignee of assigneeResult.assignees) {
            const task = await taskService.createTask({
              title: input.title,
              description: input.description,
              priority: input.priority,
              dueDate: dueDate ? dueDate.toISOString() : undefined,
              assignedTo: assignee.id,
              assignedBy: context.userId,
              createdBy: context.userId,
              organizationId: organizationId || undefined,
              propertyId,
              notes: input.notes,
              tags: input.tags,
            });

            created.push({
              id: task.id,
              title: task.title,
              assignee: { id: assignee.id, name: assignee.name, email: assignee.email },
              dueDate: task.dueDate?.toISOString() || null,
              priority: task.priority,
            });
          }

          return success({
            count: created.length,
            tasks: created,
            message: `Created ${created.length} task(s).`,
          });
        } catch (error) {
          return failure(`Error creating task: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerTaskTools;
