/**
 * CalendarConnection Model
 *
 * Stores OAuth tokens for calendar integrations (Google, Outlook).
 * Used by CalendarIntegrationService for managing calendar events.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type CalendarProvider = 'google' | 'outlook';

interface CalendarConnectionAttributes {
  id: string;
  userId: string;
  provider: CalendarProvider;

  // OAuth tokens (encrypted in production)
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date;

  // Calendar settings
  calendarId?: string; // Primary calendar to use
  defaultReminders?: number[]; // Minutes before event

  // Status
  active: boolean;
  lastSyncAt?: Date;
  syncError?: string;

  // User profile from calendar provider
  email?: string;
  displayName?: string;

  createdAt: Date;
  updatedAt: Date;
}

interface CalendarConnectionCreationAttributes
  extends Optional<
    CalendarConnectionAttributes,
    | 'id'
    | 'calendarId'
    | 'defaultReminders'
    | 'active'
    | 'lastSyncAt'
    | 'syncError'
    | 'email'
    | 'displayName'
    | 'createdAt'
    | 'updatedAt'
  > {}

class CalendarConnection
  extends Model<CalendarConnectionAttributes, CalendarConnectionCreationAttributes>
  implements CalendarConnectionAttributes
{
  declare id: string;
  declare userId: string;
  declare provider: CalendarProvider;
  declare accessToken: string;
  declare refreshToken: string;
  declare tokenExpiry: Date;
  declare calendarId: string | undefined;
  declare defaultReminders: number[] | undefined;
  declare active: boolean;
  declare lastSyncAt: Date | undefined;
  declare syncError: string | undefined;
  declare email: string | undefined;
  declare displayName: string | undefined;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Check if token needs refresh (expires in < 5 minutes)
   */
  needsRefresh(): boolean {
    const fiveMinutes = 5 * 60 * 1000;
    return new Date().getTime() + fiveMinutes >= this.tokenExpiry.getTime();
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    return this.active && !this.syncError;
  }

  /**
   * Update tokens after refresh
   */
  async updateTokens(accessToken: string, refreshToken?: string, expiresIn?: number): Promise<void> {
    this.accessToken = accessToken;
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }
    if (expiresIn) {
      this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);
    }
    this.syncError = undefined;
    await this.save();
  }

  /**
   * Mark connection as having an error
   */
  async markError(error: string): Promise<void> {
    this.syncError = error;
    await this.save();
  }

  /**
   * Record successful sync
   */
  async recordSync(): Promise<void> {
    this.lastSyncAt = new Date();
    this.syncError = undefined;
    await this.save();
  }
}

CalendarConnection.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: () => `cal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    provider: {
      type: DataTypes.ENUM('google', 'outlook'),
      allowNull: false,
    },
    accessToken: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    refreshToken: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tokenExpiry: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    calendarId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    defaultReminders: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [30, 10], // 30 and 10 minutes before
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    syncError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    displayName: {
      type: DataTypes.STRING,
      allowNull: true,
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
    tableName: 'calendar_connections',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['provider'] },
      { fields: ['active'] },
      {
        name: 'calendar_connections_user_provider',
        fields: ['userId', 'provider'],
        unique: true,
      },
    ],
  }
);

export default CalendarConnection;
export { CalendarConnectionAttributes, CalendarConnectionCreationAttributes };
