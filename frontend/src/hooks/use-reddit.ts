import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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

export interface CombinedRedditFeed {
  posts: RedditPost[];
  subreddits: string[];
  fetchedAt: string;
}

/**
 * Get combined feed from multiple subreddits
 */
export function useRedditFeed(options?: {
  subreddits?: string[];
  sort?: 'hot' | 'new' | 'top' | 'rising';
  limit?: number;
  totalLimit?: number;
  refetchInterval?: number;
}) {
  const { subreddits, sort = 'hot', limit = 10, totalLimit = 50, refetchInterval = 5 * 60 * 1000 } = options || {};

  const params = new URLSearchParams();
  if (subreddits?.length) params.append('subreddits', subreddits.join(','));
  if (sort) params.append('sort', sort);
  if (limit) params.append('limit', String(limit));
  if (totalLimit) params.append('totalLimit', String(totalLimit));

  return useQuery({
    queryKey: ['reddit', 'feed', subreddits, sort, limit, totalLimit],
    queryFn: () => api.get<CombinedRedditFeed>(`/api/reddit/feed?${params.toString()}`),
    refetchInterval,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Get posts from a specific subreddit
 */
export function useSubreddit(
  subreddit: string,
  options?: {
    sort?: 'hot' | 'new' | 'top' | 'rising';
    limit?: number;
    time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    refetchInterval?: number;
  }
) {
  const { sort = 'hot', limit = 25, time, refetchInterval = 5 * 60 * 1000 } = options || {};

  const params = new URLSearchParams();
  if (sort) params.append('sort', sort);
  if (limit) params.append('limit', String(limit));
  if (time) params.append('time', time);

  return useQuery({
    queryKey: ['reddit', 'subreddit', subreddit, sort, limit, time],
    queryFn: () => api.get<RedditFeed>(`/api/reddit/subreddit/${subreddit}?${params.toString()}`),
    enabled: !!subreddit,
    refetchInterval,
    staleTime: 60 * 1000,
  });
}

/**
 * Search Reddit
 */
export function useRedditSearch(
  query: string,
  options?: {
    subreddit?: string;
    sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
    limit?: number;
  }
) {
  const { subreddit, sort = 'relevance', limit = 25 } = options || {};

  const params = new URLSearchParams();
  params.append('q', query);
  if (subreddit) params.append('subreddit', subreddit);
  if (sort) params.append('sort', sort);
  if (limit) params.append('limit', String(limit));

  return useQuery({
    queryKey: ['reddit', 'search', query, subreddit, sort, limit],
    queryFn: () => api.get<RedditPost[]>(`/api/reddit/search?${params.toString()}`),
    enabled: !!query && query.length >= 2,
    staleTime: 60 * 1000,
  });
}

/**
 * Get default subreddits
 */
export function useDefaultSubreddits() {
  return useQuery({
    queryKey: ['reddit', 'defaults'],
    queryFn: () => api.get<string[]>('/api/reddit/defaults'),
    staleTime: Infinity, // Never refetch
  });
}
