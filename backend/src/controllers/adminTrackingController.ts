/**
 * Admin Tracking Controller
 * Endpoints for search tracking and session analytics
 */

import { Request, Response } from 'express';
import { adminTrackingService } from '../services/AdminTrackingService';

// ============================================================================
// SEARCH TRACKING
// ============================================================================

/**
 * Log a search query
 */
export const logSearch = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { query, filters, resultsCount, searchDuration, source } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
        timestamp: new Date().toISOString(),
      });
    }

    const search = await adminTrackingService.logSearch({
      userId,
      query,
      filters,
      resultsCount: resultsCount || 0,
      searchDuration,
      source,
    });

    res.status(201).json({
      success: true,
      data: { id: search.id },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Track a search result click
 */
export const trackSearchClick = async (req: Request, res: Response) => {
  try {
    const { searchId } = req.params;
    const { resultId, position } = req.body;

    if (!resultId) {
      return res.status(400).json({
        success: false,
        error: 'Result ID is required',
        timestamp: new Date().toISOString(),
      });
    }

    await adminTrackingService.trackSearchClick(searchId, resultId, position || 0);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get search analytics
 */
export const getSearchAnalytics = async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const analytics = await adminTrackingService.getSearchAnalytics(days);

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get popular searches
 */
export const getPopularSearches = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const days = parseInt(req.query.days as string) || 30;
    const source = req.query.source as string | undefined;

    const searches = await adminTrackingService.getPopularSearches({ limit, days, source });

    res.json({
      success: true,
      data: searches,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get zero-result searches
 */
export const getZeroResultSearches = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const days = parseInt(req.query.days as string) || 30;

    const searches = await adminTrackingService.getZeroResultSearches({ limit, days });

    res.json({
      success: true,
      data: searches,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get user's search history
 */
export const getUserSearchHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await adminTrackingService.getUserSearchHistory(userId, {
      limit,
      offset: (page - 1) * limit,
    });

    res.json({
      success: true,
      data: result.searches,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// SESSION TRACKING
// ============================================================================

/**
 * Start a new session (called on login)
 */
export const startSession = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
    const userAgent = req.headers['user-agent'];

    const session = await adminTrackingService.startSession({
      userId,
      ipAddress,
      userAgent,
    });

    res.status(201).json({
      success: true,
      data: { sessionId: session.id },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * End a session (called on logout)
 */
export const endSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;

    const session = await adminTrackingService.endSession(sessionId, reason || 'logout');

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        duration: session.duration,
        pagesViewed: session.pagesViewed,
        actionsPerformed: session.actionsPerformed,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Update session activity (heartbeat)
 */
export const updateSessionActivity = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { incrementPages, incrementActions } = req.body;

    await adminTrackingService.updateSessionActivity(
      sessionId,
      incrementPages || false,
      incrementActions || false
    );

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get session analytics
 */
export const getSessionAnalytics = async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const analytics = await adminTrackingService.getSessionAnalytics(days);

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get active sessions
 */
export const getActiveSessions = async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;

    const sessions = await adminTrackingService.getActiveSessions(userId);

    res.json({
      success: true,
      data: sessions,
      count: sessions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get user's session history
 */
export const getUserSessionHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await adminTrackingService.getUserSessionHistory(userId, {
      limit,
      offset: (page - 1) * limit,
    });

    res.json({
      success: true,
      data: result.sessions,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Force end all sessions for a user
 */
export const forceEndUserSessions = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const count = await adminTrackingService.forceEndAllSessions(userId);

    res.json({
      success: true,
      data: { sessionsEnded: count },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Timeout inactive sessions (maintenance endpoint)
 */
export const timeoutInactiveSessions = async (req: Request, res: Response) => {
  try {
    const timeoutMinutes = parseInt(req.query.minutes as string) || 30;

    const count = await adminTrackingService.timeoutInactiveSessions(timeoutMinutes);

    res.json({
      success: true,
      data: { sessionsTimedOut: count },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};

// ============================================================================
// COMBINED DASHBOARD
// ============================================================================

/**
 * Get combined admin tracking dashboard
 */
export const getDashboard = async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const dashboard = await adminTrackingService.getDashboard(days);

    res.json({
      success: true,
      data: dashboard,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
};
