/**
 * Reddit Routes
 *
 * API endpoints for fetching Reddit posts for TV display.
 */

import { Router, Request, Response } from 'express';
import { redditService, DEFAULT_SUBREDDITS } from '../services/RedditService';

const router = Router();

/**
 * @swagger
 * /api/reddit/feed:
 *   get:
 *     summary: Get combined feed from multiple subreddits
 *     tags: [Reddit]
 *     parameters:
 *       - in: query
 *         name: subreddits
 *         schema:
 *           type: string
 *         description: Comma-separated list of subreddits (defaults to preset list)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [hot, new, top, rising]
 *         description: Sort order (default: hot)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Posts per subreddit (default: 10)
 *       - in: query
 *         name: totalLimit
 *         schema:
 *           type: integer
 *         description: Total posts to return (default: 50)
 *     responses:
 *       200:
 *         description: Combined Reddit feed
 */
router.get('/feed', async (req: Request, res: Response) => {
  try {
    const {
      subreddits: subredditParam,
      sort = 'hot',
      limit = '10',
      totalLimit = '50',
    } = req.query;

    const subreddits = subredditParam
      ? (subredditParam as string).split(',').map((s) => s.trim())
      : DEFAULT_SUBREDDITS;

    const feed = await redditService.getCombinedFeed(subreddits, {
      sort: sort as 'hot' | 'new' | 'top' | 'rising',
      limit: parseInt(limit as string, 10),
      totalLimit: parseInt(totalLimit as string, 10),
    });

    res.json({
      success: true,
      data: feed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Reddit] Feed error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch Reddit feed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/reddit/subreddit/{name}:
 *   get:
 *     summary: Get posts from a specific subreddit
 *     tags: [Reddit]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Subreddit name (without r/)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [hot, new, top, rising]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: time
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month, year, all]
 *         description: Time filter for top posts
 *     responses:
 *       200:
 *         description: Subreddit posts
 */
router.get('/subreddit/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { sort = 'hot', limit = '25', time, after } = req.query;

    const feed = await redditService.getSubredditPosts(name, {
      sort: sort as 'hot' | 'new' | 'top' | 'rising',
      limit: parseInt(limit as string, 10),
      time: time as 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' | undefined,
      after: after as string | undefined,
    });

    res.json({
      success: true,
      data: feed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Reddit] Subreddit error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch subreddit',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/reddit/search:
 *   get:
 *     summary: Search Reddit posts
 *     tags: [Reddit]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: subreddit
 *         schema:
 *           type: string
 *         description: Limit search to specific subreddit
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [relevance, hot, top, new, comments]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, subreddit, sort = 'relevance', limit = '25', time = 'all' } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
        timestamp: new Date().toISOString(),
      });
    }

    const posts = await redditService.search(q as string, {
      subreddit: subreddit as string | undefined,
      sort: sort as 'relevance' | 'hot' | 'top' | 'new' | 'comments',
      limit: parseInt(limit as string, 10),
      time: time as 'hour' | 'day' | 'week' | 'month' | 'year' | 'all',
    });

    res.json({
      success: true,
      data: posts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Reddit] Search error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search Reddit',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/reddit/defaults:
 *   get:
 *     summary: Get default subreddits list
 *     tags: [Reddit]
 *     responses:
 *       200:
 *         description: List of default subreddits
 */
router.get('/defaults', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: redditService.getDefaultSubreddits(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
