/**
 * Reddit Service
 *
 * Fetches posts from Reddit's public JSON API.
 * No authentication required for read-only access.
 */

import axios from 'axios';

export interface RedditPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  subredditPrefixed: string;
  url: string;
  permalink: string;
  thumbnail: string | null;
  preview: string | null;
  selftext: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  createdUtc: number;
  createdAt: string;
  isVideo: boolean;
  isImage: boolean;
  isSelf: boolean;
  domain: string;
  flair: string | null;
  awards: number;
}

export interface RedditFeed {
  subreddit: string;
  posts: RedditPost[];
  after: string | null;
  fetchedAt: string;
}

// Default subreddits for TV display
export const DEFAULT_SUBREDDITS = [
  'news',
  'technology',
  'worldnews',
  'science',
  'business',
  'stocks',
  'realestate',
  'programming',
];

class RedditService {
  private baseUrl = 'https://www.reddit.com';
  private userAgent = 'CodeLive/1.0';
  private cache: Map<string, { data: RedditFeed; expiry: number }> = new Map();
  private cacheTtl = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch posts from a subreddit
   */
  async getSubredditPosts(
    subreddit: string,
    options: {
      sort?: 'hot' | 'new' | 'top' | 'rising';
      limit?: number;
      after?: string;
      time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    } = {}
  ): Promise<RedditFeed> {
    const { sort = 'hot', limit = 25, after, time } = options;
    const cacheKey = `${subreddit}:${sort}:${limit}:${after || ''}:${time || ''}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    try {
      const params: Record<string, string | number> = { limit, raw_json: 1 };
      if (after) params.after = after;
      if (time && (sort === 'top')) params.t = time;

      const response = await axios.get(
        `${this.baseUrl}/r/${subreddit}/${sort}.json`,
        {
          params,
          headers: {
            'User-Agent': this.userAgent,
          },
          timeout: 10000,
        }
      );

      const posts = this.transformPosts(response.data.data.children);
      const feed: RedditFeed = {
        subreddit,
        posts,
        after: response.data.data.after,
        fetchedAt: new Date().toISOString(),
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: feed,
        expiry: Date.now() + this.cacheTtl,
      });

      return feed;
    } catch (error) {
      console.error(`[RedditService] Error fetching r/${subreddit}:`, error);
      throw new Error(`Failed to fetch posts from r/${subreddit}`);
    }
  }

  /**
   * Fetch posts from multiple subreddits
   */
  async getMultipleSubreddits(
    subreddits: string[],
    options: {
      sort?: 'hot' | 'new' | 'top' | 'rising';
      limit?: number;
    } = {}
  ): Promise<RedditFeed[]> {
    const results = await Promise.allSettled(
      subreddits.map((sub) => this.getSubredditPosts(sub, options))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<RedditFeed> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  /**
   * Get a combined feed from multiple subreddits sorted by time
   */
  async getCombinedFeed(
    subreddits: string[] = DEFAULT_SUBREDDITS,
    options: {
      sort?: 'hot' | 'new' | 'top' | 'rising';
      limit?: number;
      totalLimit?: number;
    } = {}
  ): Promise<{ posts: RedditPost[]; subreddits: string[]; fetchedAt: string }> {
    const { limit = 10, totalLimit = 50 } = options;

    const feeds = await this.getMultipleSubreddits(subreddits, { ...options, limit });

    // Combine and sort all posts by created time (newest first)
    const allPosts = feeds
      .flatMap((feed) => feed.posts)
      .sort((a, b) => b.createdUtc - a.createdUtc)
      .slice(0, totalLimit);

    return {
      posts: allPosts,
      subreddits: feeds.map((f) => f.subreddit),
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Search Reddit
   */
  async search(
    query: string,
    options: {
      subreddit?: string;
      sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
      limit?: number;
      time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    } = {}
  ): Promise<RedditPost[]> {
    const { subreddit, sort = 'relevance', limit = 25, time = 'all' } = options;

    try {
      const baseSearchUrl = subreddit
        ? `${this.baseUrl}/r/${subreddit}/search.json`
        : `${this.baseUrl}/search.json`;

      const params: Record<string, string | number> = {
        q: query,
        sort,
        limit,
        t: time,
        raw_json: 1,
        restrict_sr: subreddit ? 1 : 0,
      };

      const response = await axios.get(baseSearchUrl, {
        params,
        headers: {
          'User-Agent': this.userAgent,
        },
        timeout: 10000,
      });

      return this.transformPosts(response.data.data.children);
    } catch (error) {
      console.error('[RedditService] Search error:', error);
      throw new Error('Failed to search Reddit');
    }
  }

  /**
   * Transform Reddit API response to our format
   */
  private transformPosts(children: any[]): RedditPost[] {
    return children
      .filter((child: any) => child.kind === 't3') // t3 = link/post
      .map((child: any) => {
        const data = child.data;

        // Get best preview image
        let preview: string | null = null;
        if (data.preview?.images?.[0]?.source?.url) {
          preview = data.preview.images[0].source.url.replace(/&amp;/g, '&');
        }

        // Get thumbnail (filter out special values)
        let thumbnail: string | null = data.thumbnail;
        if (['self', 'default', 'nsfw', 'spoiler', ''].includes(thumbnail)) {
          thumbnail = null;
        }

        return {
          id: data.id,
          title: data.title,
          author: data.author,
          subreddit: data.subreddit,
          subredditPrefixed: data.subreddit_name_prefixed,
          url: data.url,
          permalink: `https://www.reddit.com${data.permalink}`,
          thumbnail,
          preview,
          selftext: data.selftext || '',
          score: data.score,
          upvoteRatio: data.upvote_ratio,
          numComments: data.num_comments,
          createdUtc: data.created_utc,
          createdAt: new Date(data.created_utc * 1000).toISOString(),
          isVideo: data.is_video || false,
          isImage: /\.(jpg|jpeg|png|gif|webp)$/i.test(data.url),
          isSelf: data.is_self,
          domain: data.domain,
          flair: data.link_flair_text || null,
          awards: data.total_awards_received || 0,
        };
      });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get default subreddits
   */
  getDefaultSubreddits(): string[] {
    return [...DEFAULT_SUBREDDITS];
  }
}

export const redditService = new RedditService();
