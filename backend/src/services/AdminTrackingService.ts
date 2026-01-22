/**
 * AdminTrackingService
 * Service for admin analytics - search tracking and session analytics
 */

import SearchQuery from '../models/SearchQuery';
import UserSession from '../models/UserSession';

class AdminTrackingService {
  // ============================================================================
  // SEARCH TRACKING
  // ============================================================================

  /**
   * Log a search query
   */
  async logSearch(data: {
    userId: string;
    query: string;
    filters?: Record<string, any>;
    resultsCount: number;
    searchDuration?: number;
    source?: 'marketplace' | 'deals' | 'buyers' | 'contacts' | 'global';
  }): Promise<SearchQuery> {
    return SearchQuery.create({
      userId: data.userId,
      query: data.query.toLowerCase().trim(),
      filters: data.filters,
      resultsCount: data.resultsCount,
      searchDuration: data.searchDuration,
      source: data.source || 'marketplace',
    });
  }

  /**
   * Track when a user clicks on a search result
   */
  async trackSearchClick(searchId: string, resultId: string, position: number): Promise<void> {
    await SearchQuery.update(
      {
        clickedResultId: resultId,
        clickedResultPosition: position,
      },
      { where: { id: searchId } }
    );
  }

  /**
   * Get popular searches
   */
  async getPopularSearches(options: {
    limit?: number;
    source?: string;
    days?: number;
  } = {}): Promise<{ query: string; count: number; avgResults: number }[]> {
    return SearchQuery.getPopularSearches(options);
  }

  /**
   * Get zero-result searches
   */
  async getZeroResultSearches(options: {
    limit?: number;
    days?: number;
  } = {}): Promise<{ query: string; count: number; lastSearched: Date }[]> {
    return SearchQuery.getZeroResultSearches(options);
  }

  /**
   * Get user's search history
   */
  async getUserSearchHistory(userId: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<{ searches: SearchQuery[]; total: number }> {
    return SearchQuery.getUserSearchHistory(userId, options);
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(days: number = 30): Promise<{
    totalSearches: number;
    uniqueUsers: number;
    avgResultsPerSearch: number;
    zeroResultRate: number;
    avgSearchDuration: number;
    searchesBySource: Record<string, number>;
    searchesByDay: { date: string; count: number }[];
    popularSearches: { query: string; count: number; avgResults: number }[];
    zeroResultSearches: { query: string; count: number; lastSearched: Date }[];
  }> {
    const [analytics, popularSearches, zeroResultSearches] = await Promise.all([
      SearchQuery.getAnalytics(days),
      SearchQuery.getPopularSearches({ limit: 10, days }),
      SearchQuery.getZeroResultSearches({ limit: 10, days }),
    ]);

    return {
      ...analytics,
      popularSearches,
      zeroResultSearches,
    };
  }

  // ============================================================================
  // SESSION TRACKING
  // ============================================================================

  /**
   * Start a new session
   */
  async startSession(data: {
    userId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<UserSession> {
    return UserSession.startSession(data);
  }

  /**
   * End a session
   */
  async endSession(sessionId: string, reason: 'logout' | 'timeout' | 'forced' | 'token_expired' = 'logout'): Promise<UserSession | null> {
    return UserSession.endSession(sessionId, reason);
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string, incrementPages: boolean = false, incrementActions: boolean = false): Promise<void> {
    return UserSession.updateActivity(sessionId, incrementPages, incrementActions);
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(userId?: string): Promise<UserSession[]> {
    if (userId) {
      return UserSession.getActiveSessions(userId);
    }

    return UserSession.findAll({
      where: { isActive: true },
      order: [['lastActivityAt', 'DESC']],
      limit: 100,
    });
  }

  /**
   * Get user's session history
   */
  async getUserSessionHistory(userId: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<{ sessions: UserSession[]; total: number }> {
    return UserSession.getUserSessionHistory(userId, options);
  }

  /**
   * Get session analytics
   */
  async getSessionAnalytics(days: number = 30): Promise<{
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
    return UserSession.getAnalytics(days);
  }

  /**
   * Timeout inactive sessions
   */
  async timeoutInactiveSessions(timeoutMinutes: number = 30): Promise<number> {
    return UserSession.timeoutInactiveSessions(timeoutMinutes);
  }

  /**
   * Force end all sessions for a user (e.g., password change, security concern)
   */
  async forceEndAllSessions(userId: string): Promise<number> {
    const sessions = await UserSession.findAll({
      where: { userId, isActive: true },
    });

    let count = 0;
    for (const session of sessions) {
      await UserSession.endSession(session.id, 'forced');
      count++;
    }

    return count;
  }

  // ============================================================================
  // COMBINED ADMIN DASHBOARD
  // ============================================================================

  /**
   * Get combined admin tracking dashboard data
   */
  async getDashboard(days: number = 30): Promise<{
    search: {
      totalSearches: number;
      uniqueUsers: number;
      avgResultsPerSearch: number;
      zeroResultRate: number;
      popularSearches: { query: string; count: number }[];
    };
    sessions: {
      totalSessions: number;
      uniqueUsers: number;
      activeSessions: number;
      avgSessionDuration: number;
      sessionsByDevice: Record<string, number>;
      peakHours: number[];
    };
  }> {
    const [searchAnalytics, sessionAnalytics] = await Promise.all([
      this.getSearchAnalytics(days),
      this.getSessionAnalytics(days),
    ]);

    return {
      search: {
        totalSearches: searchAnalytics.totalSearches,
        uniqueUsers: searchAnalytics.uniqueUsers,
        avgResultsPerSearch: searchAnalytics.avgResultsPerSearch,
        zeroResultRate: searchAnalytics.zeroResultRate,
        popularSearches: searchAnalytics.popularSearches.slice(0, 5),
      },
      sessions: {
        totalSessions: sessionAnalytics.totalSessions,
        uniqueUsers: sessionAnalytics.uniqueUsers,
        activeSessions: sessionAnalytics.activeSessions,
        avgSessionDuration: sessionAnalytics.avgSessionDuration,
        sessionsByDevice: sessionAnalytics.sessionsByDevice,
        peakHours: sessionAnalytics.peakHours,
      },
    };
  }
}

export const adminTrackingService = new AdminTrackingService();
