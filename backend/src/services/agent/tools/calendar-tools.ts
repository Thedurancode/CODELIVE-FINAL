/**
 * Calendar Tools
 *
 * Tools for managing calendar events (showings, follow-ups, deadlines).
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import { calendarIntegrationService } from '../CalendarIntegrationService';

/**
 * Register all calendar tools with the registry
 */
export function registerCalendarTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // SCHEDULE SHOWING
    // =========================================================================
    defineTool({
      name: 'schedule_showing',
      description:
        'Schedule a property showing on the calendar. Creates a calendar event with property details and optional attendees.',
      category: 'calendar',
      schema: z.object({
        propertyAddress: z.string().describe('Property address for the showing'),
        startTime: z.string().describe('Start time (ISO string or natural language)'),
        durationMinutes: z.number().optional().default(60).describe('Duration in minutes'),
        attendees: z.array(z.string()).optional().describe('Email addresses of attendees'),
        notes: z.string().optional().describe('Additional notes for the showing'),
        propertyId: z.number().optional().describe('Property ID for linking'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          const isConnected = await calendarIntegrationService.isConnected(context.userId);
          if (!isConnected) {
            return failure(
              'Calendar not connected. Please connect your Google Calendar first via /api/calendar/connect/google'
            );
          }

          const startTime = new Date(input.startTime);
          if (isNaN(startTime.getTime())) {
            return failure(`Invalid start time: ${input.startTime}`);
          }

          const endTime = new Date(startTime.getTime() + input.durationMinutes * 60000);

          const event = await calendarIntegrationService.createEvent(context.userId, {
            title: `Property Showing: ${input.propertyAddress}`,
            description: input.notes || `Showing for property at ${input.propertyAddress}`,
            startTime,
            endTime,
            location: input.propertyAddress,
            attendees: input.attendees,
            propertyId: input.propertyId,
            reminders: [
              { method: 'popup', minutes: 30 },
              { method: 'email', minutes: 60 },
            ],
          });

          return success({
            eventId: event?.id,
            title: event?.summary,
            startTime: event?.start?.dateTime,
            endTime: event?.end?.dateTime,
            location: event?.location,
            attendees: event?.attendees?.map((a) => a.email),
            link: event?.htmlLink,
            message: `Showing scheduled for ${startTime.toLocaleString()}`,
          });
        } catch (error) {
          return failure(`Error scheduling showing: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SCHEDULE FOLLOW UP
    // =========================================================================
    defineTool({
      name: 'schedule_follow_up',
      description:
        'Schedule a follow-up call or meeting on the calendar. Great for buyer/seller follow-ups.',
      category: 'calendar',
      schema: z.object({
        title: z.string().describe('Follow-up title'),
        description: z.string().optional().describe('Description/notes'),
        startTime: z.string().describe('Start time'),
        durationMinutes: z.number().optional().default(30).describe('Duration'),
        attendees: z.array(z.string()).optional().describe('Attendee emails'),
        buyerId: z.string().optional().describe('Buyer ID for linking'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          const isConnected = await calendarIntegrationService.isConnected(context.userId);
          if (!isConnected) {
            return failure('Calendar not connected.');
          }

          const startTime = new Date(input.startTime);
          if (isNaN(startTime.getTime())) {
            return failure(`Invalid start time: ${input.startTime}`);
          }

          const endTime = new Date(startTime.getTime() + input.durationMinutes * 60000);

          const event = await calendarIntegrationService.createEvent(context.userId, {
            title: `Follow-up: ${input.title}`,
            description: input.description,
            startTime,
            endTime,
            attendees: input.attendees,
            buyerId: input.buyerId,
            reminders: [{ method: 'popup', minutes: 15 }],
          });

          return success({
            eventId: event?.id,
            title: event?.summary,
            startTime: event?.start?.dateTime,
            link: event?.htmlLink,
            message: `Follow-up scheduled for ${startTime.toLocaleString()}`,
          });
        } catch (error) {
          return failure(`Error scheduling follow-up: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // CREATE DEADLINE
    // =========================================================================
    defineTool({
      name: 'create_deadline',
      description:
        'Create a deadline reminder on the calendar. Good for contract deadlines, inspection periods, etc.',
      category: 'calendar',
      schema: z.object({
        title: z.string().describe('Deadline title'),
        dueDate: z.string().describe('Deadline date/time'),
        description: z.string().optional().describe('Details about the deadline'),
        reminderDays: z
          .array(z.number())
          .optional()
          .default([1, 3])
          .describe('Days before to remind'),
        propertyId: z.number().optional().describe('Property ID for linking'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          const isConnected = await calendarIntegrationService.isConnected(context.userId);
          if (!isConnected) {
            return failure('Calendar not connected.');
          }

          const dueDate = new Date(input.dueDate);
          if (isNaN(dueDate.getTime())) {
            return failure(`Invalid due date: ${input.dueDate}`);
          }

          // Create all-day event for deadline
          const startOfDay = new Date(dueDate);
          startOfDay.setHours(9, 0, 0, 0);
          const endOfDay = new Date(dueDate);
          endOfDay.setHours(9, 30, 0, 0);

          const reminders = input.reminderDays.map((days) => ({
            method: 'email' as const,
            minutes: days * 24 * 60,
          }));

          const event = await calendarIntegrationService.createEvent(context.userId, {
            title: `DEADLINE: ${input.title}`,
            description: input.description,
            startTime: startOfDay,
            endTime: endOfDay,
            propertyId: input.propertyId,
            reminders,
          });

          return success({
            eventId: event?.id,
            title: event?.summary,
            dueDate: dueDate.toISOString(),
            reminders: input.reminderDays.map((d) => `${d} day(s) before`),
            link: event?.htmlLink,
            message: `Deadline created for ${dueDate.toLocaleDateString()}`,
          });
        } catch (error) {
          return failure(`Error creating deadline: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // LIST CALENDAR EVENTS
    // =========================================================================
    defineTool({
      name: 'list_calendar_events',
      description:
        "List upcoming calendar events. Shows the user's schedule for a given time range.",
      category: 'calendar',
      schema: z.object({
        daysAhead: z.number().optional().default(7).describe('Number of days to look ahead'),
        maxEvents: z.number().optional().default(20).describe('Maximum events to return'),
        query: z.string().optional().describe('Search query to filter events'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          const isConnected = await calendarIntegrationService.isConnected(context.userId);
          if (!isConnected) {
            return failure('Calendar not connected.');
          }

          const timeMin = new Date();
          const timeMax = new Date();
          timeMax.setDate(timeMax.getDate() + input.daysAhead);

          const events = await calendarIntegrationService.listEvents(context.userId, {
            timeMin,
            timeMax,
            maxResults: input.maxEvents,
            query: input.query,
          });

          return success({
            count: events.length,
            dateRange: {
              from: timeMin.toISOString(),
              to: timeMax.toISOString(),
            },
            events: events.map((e) => ({
              id: e.id,
              title: e.summary,
              startTime: e.start?.dateTime || e.start?.date,
              endTime: e.end?.dateTime || e.end?.date,
              location: e.location,
              status: e.status,
              link: e.htmlLink,
            })),
          });
        } catch (error) {
          return failure(`Error listing events: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // FIND AVAILABLE TIMES
    // =========================================================================
    defineTool({
      name: 'find_available_times',
      description:
        'Find available time slots in the calendar. Useful for scheduling meetings or showings.',
      category: 'calendar',
      schema: z.object({
        durationMinutes: z.number().describe('Duration needed in minutes'),
        daysAhead: z.number().optional().default(7).describe('How many days ahead to search'),
        maxSlots: z.number().optional().default(5).describe('Maximum slots to return'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          const isConnected = await calendarIntegrationService.isConnected(context.userId);
          if (!isConnected) {
            return failure('Calendar not connected.');
          }

          const startDate = new Date();
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + input.daysAhead);

          const slots = await calendarIntegrationService.findFreeSlots(
            context.userId,
            input.durationMinutes,
            startDate,
            endDate,
            input.maxSlots
          );

          return success({
            durationMinutes: input.durationMinutes,
            searchRange: {
              from: startDate.toISOString(),
              to: endDate.toISOString(),
            },
            slots: slots.map((s) => ({
              start: s.start.toISOString(),
              end: s.end.toISOString(),
              formatted: `${s.start.toLocaleDateString()} ${s.start.toLocaleTimeString()} - ${s.end.toLocaleTimeString()}`,
            })),
            count: slots.length,
          });
        } catch (error) {
          return failure(`Error finding available times: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // RESCHEDULE EVENT
    // =========================================================================
    defineTool({
      name: 'reschedule_event',
      description: 'Reschedule an existing calendar event to a new time.',
      category: 'calendar',
      schema: z.object({
        eventId: z.string().describe('Calendar event ID to reschedule'),
        newStartTime: z.string().describe('New start time'),
        newDurationMinutes: z.number().optional().describe('New duration (keeps original if not specified)'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          const isConnected = await calendarIntegrationService.isConnected(context.userId);
          if (!isConnected) {
            return failure('Calendar not connected.');
          }

          const newStartTime = new Date(input.newStartTime);
          if (isNaN(newStartTime.getTime())) {
            return failure(`Invalid start time: ${input.newStartTime}`);
          }

          const updates: any = { startTime: newStartTime };
          if (input.newDurationMinutes) {
            updates.endTime = new Date(newStartTime.getTime() + input.newDurationMinutes * 60000);
          }

          const event = await calendarIntegrationService.updateEvent(
            context.userId,
            input.eventId,
            updates
          );

          return success({
            eventId: event?.id,
            title: event?.summary,
            newStartTime: event?.start?.dateTime,
            newEndTime: event?.end?.dateTime,
            link: event?.htmlLink,
            message: `Event rescheduled to ${newStartTime.toLocaleString()}`,
          });
        } catch (error) {
          return failure(`Error rescheduling event: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // CANCEL CALENDAR EVENT
    // =========================================================================
    defineTool({
      name: 'cancel_calendar_event',
      description: 'Cancel/delete a calendar event.',
      category: 'calendar',
      schema: z.object({
        eventId: z.string().describe('Calendar event ID to cancel'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.userId) {
            return failure('User authentication required.');
          }

          const isConnected = await calendarIntegrationService.isConnected(context.userId);
          if (!isConnected) {
            return failure('Calendar not connected.');
          }

          await calendarIntegrationService.deleteEvent(context.userId, input.eventId);

          return success({
            eventId: input.eventId,
            cancelled: true,
            message: 'Calendar event has been cancelled.',
          });
        } catch (error) {
          return failure(`Error cancelling event: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerCalendarTools;
