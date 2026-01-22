/**
 * UserSession Model
 * Tracks user login sessions for analytics and security
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

interface UserSessionAttributes {
  id: string;
  userId: string;
  loginAt: Date;
  logoutAt?: Date;
  lastActivityAt: Date;
  duration?: number; // in seconds
  ipAddress?: string;
  userAgent?: string;
  device?: string;
  browser?: string;
  os?: string;
  country?: string;
  city?: string;
  isActive: boolean;
  endReason?: 'logout' | 'timeout' | 'forced' | 'token_expired';
  pagesViewed?: number;
  actionsPerformed?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserSessionCreationAttributes extends Optional<UserSessionAttributes, 'id' | 'logoutAt' | 'duration' | 'ipAddress' | 'userAgent' | 'device' | 'browser' | 'os' | 'country' | 'city' | 'endReason' | 'pagesViewed' | 'actionsPerformed' | 'createdAt' | 'updatedAt'> {}

class UserSession extends Model<UserSessionAttributes, UserSessionCreationAttributes> implements UserSessionAttributes {
  public id!: string;
  public userId!: string;
  public loginAt!: Date;
  public logoutAt?: Date;
  public lastActivityAt!: Date;
  public duration?: number;
  public ipAddress?: string;
  public userAgent?: string;
  public device?: string;
  public browser?: string;
  public os?: string;
  public country?: string;
  public city?: string;
  public isActive!: boolean;
  public endReason?: 'logout' | 'timeout' | 'forced' | 'token_expired';
  public pagesViewed?: number;
  public actionsPerformed?: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Start a new session
   */
  static async startSession(data: {
    userId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<UserSession> {
    // Parse user agent for device info
    const deviceInfo = UserSession.parseUserAgent(data.userAgent);

    // End any existing active sessions for this user
    await UserSession.update(
      {
        isActive: false,
        logoutAt: new Date(),
        endReason: 'forced',
      },
      {
        where: {
          userId: data.userId,
          isActive: true,
        },
      }
    );

    return UserSession.create({
      userId: data.userId,
      loginAt: new Date(),
      lastActivityAt: new Date(),
      isActive: true,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      ...deviceInfo,
      pagesViewed: 0,
      actionsPerformed: 0,
    });
  }

  /**
   * End a session
   */
  static async endSession(sessionId: string, reason: 'logout' | 'timeout' | 'forced' | 'token_expired' = 'logout'): Promise<UserSession | null> {
    const session = await UserSession.findByPk(sessionId);
    if (!session) return null;

    const logoutAt = new Date();
    const duration = Math.floor((logoutAt.getTime() - session.loginAt.getTime()) / 1000);

    await session.update({
      isActive: false,
      logoutAt,
      duration,
      endReason: reason,
    });

    return session;
  }

  /**
   * Update session activity
   */
  static async updateActivity(sessionId: string, incrementPages: boolean = false, incrementActions: boolean = false): Promise<void> {
    const updates: any = {
      lastActivityAt: new Date(),
    };

    if (incrementPages) {
      updates.pagesViewed = sequelize.literal('COALESCE(pages_viewed, 0) + 1');
    }

    if (incrementActions) {
      updates.actionsPerformed = sequelize.literal('COALESCE(actions_performed, 0) + 1');
    }

    await UserSession.update(updates, {
      where: { id: sessionId, isActive: true },
    });
  }

  /**
   * Get active sessions for a user
   */
  static async getActiveSessions(userId: string): Promise<UserSession[]> {
    return UserSession.findAll({
      where: { userId, isActive: true },
      order: [['lastActivityAt', 'DESC']],
    });
  }

  /**
   * Get session history for a user
   */
  static async getUserSessionHistory(userId: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<{ sessions: UserSession[]; total: number }> {
    const { limit = 50, offset = 0 } = options;

    const { rows, count } = await UserSession.findAndCountAll({
      where: { userId },
      order: [['loginAt', 'DESC']],
      limit,
      offset,
    });

    return { sessions: rows, total: count };
  }

  /**
   * Get session analytics
   */
  static async getAnalytics(days: number = 30): Promise<{
    totalSessions: number;
    uniqueUsers: number;
    activeSessions: number;
    avgSessionDuration: number;
    avgPagesPerSession: number;
    avgActionsPerSession: number;
    sessionsByDevice: Record<string, number>;
    sessionsByBrowser: Record<string, number>;
    sessionsByCountry: Record<string, number>;
    sessionsByDay: { date: string; count: number }[];
    sessionsByHour: { hour: number; count: number }[];
    peakHours: number[];
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Total sessions
    const totalSessions = await UserSession.count({
      where: { loginAt: { [Op.gte]: since } },
    });

    // Unique users
    const uniqueUsersResult = await UserSession.findAll({
      attributes: [[sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('userId'))), 'count']],
      where: { loginAt: { [Op.gte]: since } },
      raw: true,
    });
    const uniqueUsers = parseInt((uniqueUsersResult[0] as any)?.count) || 0;

    // Active sessions
    const activeSessions = await UserSession.count({
      where: { isActive: true },
    });

    // Average session duration (only completed sessions)
    const avgDurationResult = await UserSession.findAll({
      attributes: [[sequelize.fn('AVG', sequelize.col('duration')), 'avg']],
      where: {
        duration: { [Op.not]: null },
        loginAt: { [Op.gte]: since },
      },
      raw: true,
    });
    const avgSessionDuration = Math.round(parseFloat((avgDurationResult[0] as any)?.avg) || 0);

    // Average pages per session
    const avgPagesResult = await UserSession.findAll({
      attributes: [[sequelize.fn('AVG', sequelize.col('pagesViewed')), 'avg']],
      where: { loginAt: { [Op.gte]: since } },
      raw: true,
    });
    const avgPagesPerSession = Math.round((parseFloat((avgPagesResult[0] as any)?.avg) || 0) * 10) / 10;

    // Average actions per session
    const avgActionsResult = await UserSession.findAll({
      attributes: [[sequelize.fn('AVG', sequelize.col('actionsPerformed')), 'avg']],
      where: { loginAt: { [Op.gte]: since } },
      raw: true,
    });
    const avgActionsPerSession = Math.round((parseFloat((avgActionsResult[0] as any)?.avg) || 0) * 10) / 10;

    // Sessions by device
    const byDeviceResult = await UserSession.findAll({
      attributes: [
        'device',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      where: { loginAt: { [Op.gte]: since } },
      group: ['device'],
      raw: true,
    });
    const sessionsByDevice: Record<string, number> = {};
    (byDeviceResult as any[]).forEach((row) => {
      sessionsByDevice[row.device || 'unknown'] = parseInt(row.count);
    });

    // Sessions by browser
    const byBrowserResult = await UserSession.findAll({
      attributes: [
        'browser',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      where: { loginAt: { [Op.gte]: since } },
      group: ['browser'],
      raw: true,
    });
    const sessionsByBrowser: Record<string, number> = {};
    (byBrowserResult as any[]).forEach((row) => {
      sessionsByBrowser[row.browser || 'unknown'] = parseInt(row.count);
    });

    // Sessions by country
    const byCountryResult = await UserSession.findAll({
      attributes: [
        'country',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      where: { loginAt: { [Op.gte]: since } },
      group: ['country'],
      raw: true,
    });
    const sessionsByCountry: Record<string, number> = {};
    (byCountryResult as any[]).forEach((row) => {
      sessionsByCountry[row.country || 'unknown'] = parseInt(row.count);
    });

    // Sessions by day
    const byDayResult = await UserSession.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('loginAt')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      where: { loginAt: { [Op.gte]: since } },
      group: [sequelize.fn('DATE', sequelize.col('loginAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('loginAt')), 'ASC']],
      raw: true,
    });
    const sessionsByDay = (byDayResult as any[]).map((row) => ({
      date: row.date,
      count: parseInt(row.count),
    }));

    // Sessions by hour
    const byHourResult = await UserSession.findAll({
      attributes: [
        [sequelize.fn('EXTRACT', sequelize.literal('HOUR FROM "loginAt"')), 'hour'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      where: { loginAt: { [Op.gte]: since } },
      group: [sequelize.fn('EXTRACT', sequelize.literal('HOUR FROM "loginAt"'))],
      order: [[sequelize.fn('EXTRACT', sequelize.literal('HOUR FROM "loginAt"')), 'ASC']],
      raw: true,
    });
    const sessionsByHour = (byHourResult as any[]).map((row) => ({
      hour: parseInt(row.hour),
      count: parseInt(row.count),
    }));

    // Find peak hours (top 3)
    const sortedHours = [...sessionsByHour].sort((a, b) => b.count - a.count);
    const peakHours = sortedHours.slice(0, 3).map((h) => h.hour);

    return {
      totalSessions,
      uniqueUsers,
      activeSessions,
      avgSessionDuration,
      avgPagesPerSession,
      avgActionsPerSession,
      sessionsByDevice,
      sessionsByBrowser,
      sessionsByCountry,
      sessionsByDay,
      sessionsByHour,
      peakHours,
    };
  }

  /**
   * Parse user agent string
   */
  static parseUserAgent(userAgent?: string): { device?: string; browser?: string; os?: string } {
    if (!userAgent) return {};

    let device = 'desktop';
    let browser = 'unknown';
    let os = 'unknown';

    // Detect device
    if (/mobile/i.test(userAgent)) {
      device = 'mobile';
    } else if (/tablet|ipad/i.test(userAgent)) {
      device = 'tablet';
    }

    // Detect browser
    if (/chrome/i.test(userAgent) && !/edg/i.test(userAgent)) {
      browser = 'Chrome';
    } else if (/firefox/i.test(userAgent)) {
      browser = 'Firefox';
    } else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) {
      browser = 'Safari';
    } else if (/edg/i.test(userAgent)) {
      browser = 'Edge';
    } else if (/opera|opr/i.test(userAgent)) {
      browser = 'Opera';
    }

    // Detect OS
    if (/windows/i.test(userAgent)) {
      os = 'Windows';
    } else if (/macintosh|mac os/i.test(userAgent)) {
      os = 'macOS';
    } else if (/linux/i.test(userAgent)) {
      os = 'Linux';
    } else if (/android/i.test(userAgent)) {
      os = 'Android';
    } else if (/iphone|ipad|ipod/i.test(userAgent)) {
      os = 'iOS';
    }

    return { device, browser, os };
  }

  /**
   * Timeout inactive sessions
   */
  static async timeoutInactiveSessions(timeoutMinutes: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const [affectedCount] = await UserSession.update(
      {
        isActive: false,
        logoutAt: new Date(),
        endReason: 'timeout',
      },
      {
        where: {
          isActive: true,
          lastActivityAt: { [Op.lt]: cutoff },
        },
      }
    );

    // Update duration for timed out sessions
    await sequelize.query(`
      UPDATE user_sessions
      SET duration = EXTRACT(EPOCH FROM (logout_at - login_at))::integer
      WHERE end_reason = 'timeout' AND duration IS NULL
    `);

    return affectedCount;
  }
}

UserSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    loginAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'login_at',
    },
    logoutAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'logout_at',
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'last_activity_at',
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Session duration in seconds',
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address',
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent',
    },
    device: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    browser: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    os: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    endReason: {
      type: DataTypes.ENUM('logout', 'timeout', 'forced', 'token_expired'),
      allowNull: true,
      field: 'end_reason',
    },
    pagesViewed: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'pages_viewed',
    },
    actionsPerformed: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'actions_performed',
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'user_sessions',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['is_active'] },
      { fields: ['login_at'] },
      { fields: ['last_activity_at'] },
      { fields: ['device'] },
      { fields: ['browser'] },
      { fields: ['country'] },
    ],
  }
);

export default UserSession;
