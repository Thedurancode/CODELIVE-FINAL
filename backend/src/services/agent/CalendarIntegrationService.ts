/**
 * CalendarIntegrationService
 *
 * Integrates with Google Calendar API for scheduling events.
 * Handles OAuth flow, token management, and calendar operations.
 */

import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import CalendarConnection from '../../models/CalendarConnection';
import { logger } from '../../utils/logger';

// Google Calendar API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

export interface CalendarEvent {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees?: string[];
  propertyId?: number;
  buyerId?: string;
  reminders?: { method: 'email' | 'popup'; minutes: number }[];
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface ListEventsOptions {
  maxResults?: number;
  timeMin?: Date;
  timeMax?: Date;
  query?: string;
}

class CalendarIntegrationService {
  private initialized = false;
  private clientId: string | null = null;
  private clientSecret: string | null = null;
  private redirectUri: string | null = null;

  async initialize(): Promise<void> {
    // Load credentials from environment
    this.clientId = process.env.GOOGLE_CLIENT_ID || null;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || null;
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/calendar/callback';

    if (!this.clientId || !this.clientSecret) {
      logger.warn('Google Calendar credentials not configured');
    }

    this.initialized = true;
    logger.info('CalendarIntegrationService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Get OAuth2 client for a user
   */
  private async getOAuth2Client(userId: string): Promise<OAuth2Client | null> {
    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      this.clientId || undefined,
      this.clientSecret || undefined,
      this.redirectUri || undefined
    );

    // Get stored tokens
    const connection = await CalendarConnection.findOne({
      where: { userId, provider: 'google', active: true },
    });

    if (!connection) {
      return null;
    }

    oauth2Client.setCredentials({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
      expiry_date: connection.tokenExpiry.getTime(),
    });

    // Handle token refresh
    if (connection.needsRefresh()) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        await connection.updateTokens(
          credentials.access_token!,
          credentials.refresh_token || undefined,
          credentials.expiry_date ? Math.floor((credentials.expiry_date - Date.now()) / 1000) : 3600
        );
      } catch (error) {
        logger.error({ error, userId }, 'Failed to refresh calendar token');
        await connection.markError('Token refresh failed');
        return null;
      }
    }

    return oauth2Client;
  }

  /**
   * Get OAuth URL for user authorization
   */
  getAuthUrl(userId: string, state?: string): string {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google Calendar not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      this.clientId || undefined,
      this.clientSecret || undefined,
      this.redirectUri || undefined
    );

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: state || userId,
      prompt: 'consent',
    });
  }

  /**
   * Handle OAuth callback and store tokens
   */
  async handleCallback(userId: string, code: string): Promise<CalendarConnection> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google Calendar not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      this.clientId || undefined,
      this.clientSecret || undefined,
      this.redirectUri || undefined
    );

    const { tokens } = await oauth2Client.getToken(code);

    // Get user profile
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarList = await calendar.calendarList.list();
    const primaryCalendar = calendarList.data.items?.find((c) => c.primary);

    // Check for existing connection
    let connection = await CalendarConnection.findOne({
      where: { userId, provider: 'google' },
    });

    if (connection) {
      // Update existing
      await connection.updateTokens(
        tokens.access_token!,
        tokens.refresh_token || undefined,
        tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600
      );
      connection.active = true;
      connection.calendarId = primaryCalendar?.id || undefined;
      connection.email = primaryCalendar?.summary || undefined;
      await connection.save();
    } else {
      // Create new
      connection = await CalendarConnection.create({
        userId,
        provider: 'google',
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || '',
        tokenExpiry: new Date(tokens.expiry_date || Date.now() + 3600000),
        calendarId: primaryCalendar?.id || undefined,
        email: primaryCalendar?.summary || undefined,
        active: true,
      });
    }

    logger.info({ userId }, 'Calendar connected');
    return connection;
  }

  /**
   * Check if user has connected calendar
   */
  async isConnected(userId: string): Promise<boolean> {
    const connection = await CalendarConnection.findOne({
      where: { userId, provider: 'google', active: true },
    });
    return !!connection && !connection.needsRefresh();
  }

  /**
   * Disconnect calendar
   */
  async disconnect(userId: string): Promise<boolean> {
    const connection = await CalendarConnection.findOne({
      where: { userId, provider: 'google' },
    });

    if (connection) {
      connection.active = false;
      await connection.save();
      logger.info({ userId }, 'Calendar disconnected');
      return true;
    }

    return false;
  }

  /**
   * Get connection status
   */
  async getStatus(userId: string): Promise<{
    connected: boolean;
    email?: string;
    lastSyncAt?: Date;
    error?: string;
  }> {
    const connection = await CalendarConnection.findOne({
      where: { userId, provider: 'google' },
    });

    if (!connection) {
      return { connected: false };
    }

    return {
      connected: connection.active && connection.isHealthy(),
      email: connection.email,
      lastSyncAt: connection.lastSyncAt,
      error: connection.syncError,
    };
  }

  /**
   * Create a calendar event
   */
  async createEvent(userId: string, event: CalendarEvent): Promise<calendar_v3.Schema$Event | null> {
    const oauth2Client = await this.getOAuth2Client(userId);
    if (!oauth2Client) {
      throw new Error('Calendar not connected');
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const connection = await CalendarConnection.findOne({
      where: { userId, provider: 'google', active: true },
    });

    const calendarId = connection?.calendarId || 'primary';

    // Build event object
    const eventBody: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: {
        dateTime: event.startTime.toISOString(),
        timeZone: 'America/Chicago',
      },
      end: {
        dateTime: event.endTime.toISOString(),
        timeZone: 'America/Chicago',
      },
      attendees: event.attendees?.map((email) => ({ email })),
      reminders: event.reminders
        ? {
            useDefault: false,
            overrides: event.reminders.map((r) => ({
              method: r.method,
              minutes: r.minutes,
            })),
          }
        : { useDefault: true },
      extendedProperties: {
        private: {
          propertyId: event.propertyId?.toString() || '',
          buyerId: event.buyerId || '',
          source: 'dispotree',
        },
      },
    };

    const response = await calendar.events.insert({
      calendarId,
      requestBody: eventBody,
      sendUpdates: event.attendees?.length ? 'all' : 'none',
    });

    await connection?.recordSync();

    logger.info({ userId, eventId: response.data.id }, 'Calendar event created');
    return response.data;
  }

  /**
   * Update a calendar event
   */
  async updateEvent(
    userId: string,
    eventId: string,
    updates: Partial<CalendarEvent>
  ): Promise<calendar_v3.Schema$Event | null> {
    const oauth2Client = await this.getOAuth2Client(userId);
    if (!oauth2Client) {
      throw new Error('Calendar not connected');
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const connection = await CalendarConnection.findOne({
      where: { userId, provider: 'google', active: true },
    });

    const calendarId = connection?.calendarId || 'primary';

    // Build update object
    const updateBody: calendar_v3.Schema$Event = {};
    if (updates.title) updateBody.summary = updates.title;
    if (updates.description) updateBody.description = updates.description;
    if (updates.location) updateBody.location = updates.location;
    if (updates.startTime) {
      updateBody.start = {
        dateTime: updates.startTime.toISOString(),
        timeZone: 'America/Chicago',
      };
    }
    if (updates.endTime) {
      updateBody.end = {
        dateTime: updates.endTime.toISOString(),
        timeZone: 'America/Chicago',
      };
    }

    const response = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: updateBody,
    });

    await connection?.recordSync();
    return response.data;
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(userId: string, eventId: string): Promise<boolean> {
    const oauth2Client = await this.getOAuth2Client(userId);
    if (!oauth2Client) {
      throw new Error('Calendar not connected');
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const connection = await CalendarConnection.findOne({
      where: { userId, provider: 'google', active: true },
    });

    const calendarId = connection?.calendarId || 'primary';

    await calendar.events.delete({
      calendarId,
      eventId,
    });

    await connection?.recordSync();
    logger.info({ userId, eventId }, 'Calendar event deleted');
    return true;
  }

  /**
   * List calendar events
   */
  async listEvents(
    userId: string,
    options: ListEventsOptions = {}
  ): Promise<calendar_v3.Schema$Event[]> {
    const oauth2Client = await this.getOAuth2Client(userId);
    if (!oauth2Client) {
      throw new Error('Calendar not connected');
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const connection = await CalendarConnection.findOne({
      where: { userId, provider: 'google', active: true },
    });

    const calendarId = connection?.calendarId || 'primary';

    const response = await calendar.events.list({
      calendarId,
      maxResults: options.maxResults || 50,
      timeMin: (options.timeMin || new Date()).toISOString(),
      timeMax: options.timeMax?.toISOString(),
      q: options.query,
      singleEvents: true,
      orderBy: 'startTime',
    });

    await connection?.recordSync();
    return response.data.items || [];
  }

  /**
   * Find free time slots
   */
  async findFreeSlots(
    userId: string,
    durationMinutes: number,
    startDate: Date,
    endDate: Date,
    maxSlots: number = 5
  ): Promise<TimeSlot[]> {
    const events = await this.listEvents(userId, {
      timeMin: startDate,
      timeMax: endDate,
      maxResults: 100,
    });

    const slots: TimeSlot[] = [];
    let currentTime = new Date(startDate);

    // Only look at business hours (9 AM - 5 PM)
    const businessStart = 9;
    const businessEnd = 17;

    while (currentTime < endDate && slots.length < maxSlots) {
      const hour = currentTime.getHours();

      // Skip outside business hours
      if (hour < businessStart) {
        currentTime.setHours(businessStart, 0, 0, 0);
        continue;
      }
      if (hour >= businessEnd) {
        currentTime.setDate(currentTime.getDate() + 1);
        currentTime.setHours(businessStart, 0, 0, 0);
        continue;
      }

      // Skip weekends
      const day = currentTime.getDay();
      if (day === 0 || day === 6) {
        currentTime.setDate(currentTime.getDate() + 1);
        currentTime.setHours(businessStart, 0, 0, 0);
        continue;
      }

      const slotEnd = new Date(currentTime.getTime() + durationMinutes * 60000);

      // Check if slot overlaps with any event
      const hasConflict = events.some((event) => {
        const eventStart = new Date(event.start?.dateTime || event.start?.date || 0);
        const eventEnd = new Date(event.end?.dateTime || event.end?.date || 0);
        return currentTime < eventEnd && slotEnd > eventStart;
      });

      if (!hasConflict && slotEnd.getHours() <= businessEnd) {
        slots.push({
          start: new Date(currentTime),
          end: slotEnd,
        });
      }

      // Move to next slot
      currentTime = new Date(currentTime.getTime() + 30 * 60000); // 30-minute increments
    }

    return slots;
  }
}

export const calendarIntegrationService = new CalendarIntegrationService();
export default CalendarIntegrationService;
