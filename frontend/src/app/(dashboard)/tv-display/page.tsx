'use client';

import { useState, useEffect } from 'react';
import { useRedditFeed, type RedditPost } from '@/hooks/use-reddit';
import {
  ArrowUp,
  MessageSquare,
  ExternalLink,
  RefreshCw,
  Tv,
  Clock,
  TrendingUp,
  Loader2,
  Maximize,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Default subreddits for TV display
const DEFAULT_SUBREDDITS = [
  'news',
  'technology',
  'worldnews',
  'science',
  'business',
  'stocks',
  'realestate',
  'programming',
];

const SUBREDDIT_COLORS: Record<string, string> = {
  news: 'bg-red-500/20 text-red-400 border-red-500/30',
  technology: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  worldnews: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  science: 'bg-green-500/20 text-green-400 border-green-500/30',
  business: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  stocks: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  realestate: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  programming: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

function getSubredditColor(subreddit: string) {
  return SUBREDDIT_COLORS[subreddit.toLowerCase()] || 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
}

function formatTimeAgo(dateString: string) {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatScore(score: number) {
  if (score >= 1000000) return `${(score / 1000000).toFixed(1)}M`;
  if (score >= 1000) return `${(score / 1000).toFixed(1)}k`;
  return score.toString();
}

function RedditPostCard({ post, featured = false }: { post: RedditPost; featured?: boolean }) {
  const hasImage = post.preview || (post.thumbnail && post.thumbnail.startsWith('http'));
  const imageUrl = post.preview || post.thumbnail;

  return (
    <a
      href={post.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group block rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden transition-all hover:border-accent-500/50 hover:bg-card/80 hover:shadow-lg hover:shadow-accent-500/5',
        featured && 'md:col-span-2 md:row-span-2'
      )}
    >
      {/* Image */}
      {hasImage && (
        <div className={cn('relative overflow-hidden bg-secondary', featured ? 'h-64' : 'h-40')}>
          <img
            src={imageUrl!}
            alt={post.title}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <Badge
            variant="outline"
            className={cn('absolute top-3 left-3 border', getSubredditColor(post.subreddit))}
          >
            r/{post.subreddit}
          </Badge>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {!hasImage && (
          <Badge
            variant="outline"
            className={cn('mb-2 border', getSubredditColor(post.subreddit))}
          >
            r/{post.subreddit}
          </Badge>
        )}

        <h3
          className={cn(
            'font-semibold text-foreground line-clamp-3 group-hover:text-accent-400 transition-colors',
            featured ? 'text-xl' : 'text-base'
          )}
        >
          {post.title}
        </h3>

        {post.selftext && !hasImage && (
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{post.selftext}</p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <ArrowUp className="h-4 w-4 text-orange-400" />
            {formatScore(post.score)}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            {post.numComments}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {formatTimeAgo(post.createdAt)}
          </span>
          {post.flair && (
            <Badge variant="secondary" className="text-xs">
              {post.flair}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground">by u/{post.author}</span>
          <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </a>
  );
}

export default function TVDisplayPage() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sort, setSort] = useState<'hot' | 'new' | 'top'>('hot');

  const { data: feed, isLoading, error, refetch, isFetching } = useRedditFeed({
    subreddits: DEFAULT_SUBREDDITS,
    sort,
    limit: 10,
    totalLimit: 50,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  // Update clock every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Handle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const posts = feed?.posts || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left - Title */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                <Tv className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Reddit Feed</h1>
                <p className="text-xs text-muted-foreground">
                  {posts.length} posts from {feed?.subreddits?.length || 0} subreddits
                </p>
              </div>
            </div>

            {/* Center - Clock */}
            <div className="hidden md:flex flex-col items-center">
              <span className="text-3xl font-bold text-foreground tabular-nums">
                {currentTime.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })}
              </span>
              <span className="text-sm text-muted-foreground">
                {currentTime.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>

            {/* Right - Controls */}
            <div className="flex items-center gap-2">
              {/* Sort */}
              <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
                {(['hot', 'new', 'top'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className={cn(
                      'px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize',
                      sort === s
                        ? 'bg-accent-600 text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Refresh */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={isFetching}
                className="border"
              >
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              </Button>

              {/* Fullscreen */}
              <Button
                variant="outline"
                size="icon"
                onClick={toggleFullscreen}
                className="border"
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Subreddit Tags */}
          <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
            <span className="text-sm text-muted-foreground flex-shrink-0">Showing:</span>
            {DEFAULT_SUBREDDITS.map((sub) => (
              <Badge
                key={sub}
                variant="outline"
                className={cn('flex-shrink-0 border', getSubredditColor(sub))}
              >
                r/{sub}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
            <span className="ml-3 text-lg text-muted-foreground">Loading Reddit feed...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <TrendingUp className="h-8 w-8 text-red-400" />
            </div>
            <p className="text-lg font-medium text-foreground mb-2">Failed to load feed</p>
            <p className="text-muted-foreground mb-4">{(error as Error).message}</p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Tv className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <p className="text-lg text-muted-foreground">No posts available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {posts.map((post, index) => (
              <RedditPostCard
                key={post.id}
                post={post}
                featured={index === 0} // First post is featured (larger)
              />
            ))}
          </div>
        )}

        {/* Last updated */}
        {feed?.fetchedAt && (
          <div className="text-center mt-8 text-sm text-muted-foreground">
            Last updated: {new Date(feed.fetchedAt).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
