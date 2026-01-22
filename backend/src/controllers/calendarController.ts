/**
 * Calendar Controller
 *
 * REST API controller for Google Calendar integration.
 * Wraps CalendarIntegrationService methods for HTTP access.
 */

import { Request, Response } from 'express';
import { calendarIntegrationService, CalendarEvent } from '../services/agent/CalendarIntegrationService';
import { logger } from '../utils/logger';

export const calendarController = {
  /**
   * Get calendar connection status
   */
  async getStatus(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const isConfigured = calendarIntegrationService.isConfigured();
      if (!isConfigured) {
        return res.json({
          success: true,
          data: {
            configured: false,
            connected: false,
            message: 'Google Calendar is not configured on this server',
          },
        });
      }

      const status = await calendarIntegrationService.getStatus(userId);
      return res.json({
        success: true,
        data: {
          configured: true,
          ...status,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get calendar status');
      return res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Get OAuth URL to connect Google Calendar
   */
  async getConnectUrl(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      if (!calendarIntegrationService.isConfigured()) {
        return res.status(400).json({
          success: false,
          error: 'Google Calendar is not configured on this server',
        });
      }

      const state = JSON.stringify({ userId });
      const authUrl = calendarIntegrationService.getAuthUrl(userId, state);

      return res.json({
        success: true,
        data: { authUrl },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get calendar auth URL');
      return res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * Handle OAuth callback from Google
   */
  async handleCallback(req: Request, res: Response) {
    try {
      const { code, state } = req.query;

      if (!code || typeof code !== 'string') {
        return res.redirect('/calendar?error=missing_code');
      }

      // Parse state to get userId
      let userId: string;
      try {
        const stateData = JSON.parse(state as string);
        userId = stateData.userId;
      } catch {
        return res.redirect('/calendar?error=invalid_state');
      }

      if (!userId) {
        return res.redirect('/calendar?error=missing_user');
      }

      await calendarIntegrationService.handleCallback(userId, code);

      // Redirect to calendar page with success
      return res.redirect('/calendar?connected=true');
    } catch (error) {
      logger.error({ error }, 'Failed to handle calendar callback');
      return res.redirect('/calendar?error=callback_failed');
    }
  },

  /**
   * Disconnect Google Calendar
   */
  async disconnect(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const result = await calendarIntegrationService.disconnect(userId);

      return res.json({
        success: true,
        data: { disconnected: result },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to disconnect calendar');
      return res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * List calendar events
   */
  async listEvents(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { maxResults, timeMin, timeMax, query } = req.query;

      const options = {
        maxResults: maxResults ? parseInt(maxResults as string, 10) : 50,
        timeMin: timeMin ? new Date(timeMin as string) : undefined,
        timeMax: timeMax ? new Date(timeMax as string) : undefined,
        query: query as string | undefined,
      };

      const events = await calendarIntegrationService.listEvents(userId, options);

      // Transform events for frontend
      const transformedEvents = events.map((event) => ({
        id: event.id,
        title: event.summary || 'Untitled Event',
        description: event.description,
        startTime: event.start?.dateTime || event.start?.date,
        endTime: event.end?.dateTime || event.end?.date,
        location: event.location,
        attendees: event.attendees?.map((a) => a.email) || [],
        status: event.status,
        link: event.htmlLink,
        propertyId: event.extendedProperties?.private?.propertyId
          ? parseInt(event.extendedProperties.private.propertyId, 10)
          : undefined,
        buyerId: event.extendedProperties?.private?.buyerId || undefined,
        isAllDay: !event.start?.dateTime,
      }));

      return res.json({
        success: true,
        data: transformedEvents,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list calendar events');
      const message = (error as Error).message;
      if (message === 'Calendar not connected') {
        return res.status(400).json({
          success: false,
          error: 'Calendar not connected. Please connect your Google Calendar first.',
        });
      }
      return res.status(500).json({
        success: false,
        error: message,
      });
    }
  },

  /**
   * Create a calendar event
   */
  async createEvent(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { title, description, startTime, endTime, location, attendees, propertyId, buyerId, reminders } = req.body;

      if (!title || !startTime || !endTime) {
        return res.status(400).json({
          success: false,
          error: 'Title, startTime, and endTime are required',
        });
      }

      const event: CalendarEvent = {
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        location,
        attendees,
        propertyId,
        buyerId,
        reminders,
      };

      const createdEvent = await calendarIntegrationService.createEvent(userId, event);

      return res.json({
        success: true,
        data: {
          id: createdEvent?.id,
          title: createdEvent?.summary,
          startTime: createdEvent?.start?.dateTime || createdEvent?.start?.date,
          endTime: createdEvent?.end?.dateTime || createdEvent?.end?.date,
          link: createdEvent?.htmlLink,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create calendar event');
      const message = (error as Error).message;
      if (message === 'Calendar not connected') {
        return res.status(400).json({
          success: false,
          error: 'Calendar not connected. Please connect your Google Calendar first.',
        });
      }
      return res.status(500).json({
        success: false,
        error: message,
      });
    }
  },

  /**
   * Update a calendar event
   */
  async updateEvent(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Event ID is required',
        });
      }

      const { title, description, startTime, endTime, location } = req.body;

      const updates: Partial<CalendarEvent> = {};
      if (title) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (startTime) updates.startTime = new Date(startTime);
      if (endTime) updates.endTime = new Date(endTime);
      if (location !== undefined) updates.location = location;

      const updatedEvent = await calendarIntegrationService.updateEvent(userId, id, updates);

      return res.json({
        success: true,
        data: {
          id: updatedEvent?.id,
          title: updatedEvent?.summary,
          startTime: updatedEvent?.start?.dateTime || updatedEvent?.start?.date,
          endTime: updatedEvent?.end?.dateTime || updatedEvent?.end?.date,
          link: updatedEvent?.htmlLink,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to update calendar event');
      const message = (error as Error).message;
      if (message === 'Calendar not connected') {
        return res.status(400).json({
          success: false,
          error: 'Calendar not connected. Please connect your Google Calendar first.',
        });
      }
      return res.status(500).json({
        success: false,
        error: message,
      });
    }
  },

  /**
   * Delete a calendar event
   */
  async deleteEvent(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Event ID is required',
        });
      }

      await calendarIntegrationService.deleteEvent(userId, id);

      return res.json({
        success: true,
        data: { deleted: true },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to delete calendar event');
      const message = (error as Error).message;
      if (message === 'Calendar not connected') {
        return res.status(400).json({
          success: false,
          error: 'Calendar not connected. Please connect your Google Calendar first.',
        });
      }
      return res.status(500).json({
        success: false,
        error: message,
      });
    }
  },

  /**
   * Find free time slots
   */
  async findFreeSlots(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { durationMinutes, startDate, endDate, maxSlots } = req.query;

      if (!durationMinutes || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'durationMinutes, startDate, and endDate are required',
        });
      }

      const slots = await calendarIntegrationService.findFreeSlots(
        userId,
        parseInt(durationMinutes as string, 10),
        new Date(startDate as string),
        new Date(endDate as string),
        maxSlots ? parseInt(maxSlots as string, 10) : 5
      );

      return res.json({
        success: true,
        data: slots,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to find free slots');
      const message = (error as Error).message;
      if (message === 'Calendar not connected') {
        return res.status(400).json({
          success: false,
          error: 'Calendar not connected. Please connect your Google Calendar first.',
        });
      }
      return res.status(500).json({
        success: false,
        error: message,
      });
    }
  },
};
