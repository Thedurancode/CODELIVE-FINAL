'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  MessageSquare,
  ExternalLink,
  Loader2,
  RefreshCw,
  Maximize,
  Minimize,
  Clock,
  Globe,
  Flame,
  Sparkles,
  User,
  ArrowUp,
  Zap,
  Code,
  Briefcase,
  HelpCircle,
  Newspaper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Hacker News Logo
function HNLogo({ className }: { className?: string }) {
  return (
    <div className={cn('font-bold text-white', className)}>Y</div>
  );
}

interface HackerNewsItem {
  id: number;
  title: string;
  url?: string;
  by: string;
  time: number;
  score: number;
  descendants?: number;
  type: string;
  text?: string;
}

type StoryType = 'top' | 'new' | 'best' | 'ask' | 'show' | 'job';

const STORY_TYPES: { type: StoryType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: 'top', label: 'Top', icon: <Flame className="h-4 w-4" />, color: 'text-orange-400' },
  { type: 'best', label: 'Best', icon: <Sparkles className="h-4 w-4" />, color: 'text-amber-400' },
  { type: 'new', label: 'New', icon: <Zap className="h-4 w-4" />, color: 'text-green-400' },
  { type: 'ask', label: 'Ask HN', icon: <HelpCircle className="h-4 w-4" />, color: 'text-blue-400' },
  { type: 'show', label: 'Show HN', icon: <Code className="h-4 w-4" />, color: 'text-purple-400' },
  { type: 'job', label: 'Jobs', icon: <Briefcase className="h-4 w-4" />, color: 'text-emerald-400' },
];

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60);
  const hours = Math.floor(diff / 3600);
  const days = Math.floor(diff / 86400);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'now';
}

function getDomain(url?: string): string {
  if (!url) return 'news.ycombinator.com';
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

function getStoryBadge(story: HackerNewsItem): { label: string; color: string } | null {
  if (story.title.startsWith('Ask HN:')) {
    return { label: 'Ask HN', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
  }
  if (story.title.startsWith('Show HN:')) {
    return { label: 'Show HN', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
  }
  if (story.title.startsWith('Tell HN:')) {
    return { label: 'Tell HN', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' };
  }
  if (story.type === 'job') {
    return { label: 'Hiring', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
  }
  return null;
}

// Featured Story Card (Top Story)
function FeaturedStoryCard({ story }: { story: HackerNewsItem }) {
  const badge = getStoryBadge(story);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative p-8 rounded-3xl bg-gradient-to-br from-orange-500/20 via-zinc-900/80 to-zinc-900/90 border border-orange-500/30 overflow-hidden"
    >
      {/* Background glow */}
      <div className="absolute -top-20 -right-20 w-60 h-60 bg-orange-500/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-orange-600/10 rounded-full blur-3xl" />

      <div className="relative z-10">
        {/* Top Badge */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm shadow-lg shadow-orange-500/30">
            <Flame className="h-4 w-4" />
            #1 TOP STORY
          </div>
          {badge && (
            <Badge variant="outline" className={cn('border', badge.color)}>
              {badge.label}
            </Badge>
          )}
        </div>

        {/* Title */}
        <h2 className="text-4xl font-bold text-white leading-tight mb-6">
          {story.title}
        </h2>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-6 mb-6">
          {story.url && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800/60 text-orange-300">
              <Globe className="h-4 w-4" />
              <span className="font-medium">{getDomain(story.url)}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-zinc-400">
            <User className="h-4 w-4" />
            <span className="font-medium">{story.by}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <Clock className="h-4 w-4" />
            <span>{formatTimeAgo(story.time)}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-orange-500/20 border border-orange-500/30">
            <ArrowUp className="h-6 w-6 text-orange-400" />
            <span className="text-3xl font-bold text-orange-400">{story.score}</span>
            <span className="text-orange-400/70">points</span>
          </div>
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-zinc-800/60 border border-zinc-700">
            <MessageSquare className="h-6 w-6 text-zinc-400" />
            <span className="text-3xl font-bold text-white">{story.descendants || 0}</span>
            <span className="text-zinc-500">comments</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Story Card for Grid
function StoryCard({ story, rank, index }: { story: HackerNewsItem; rank: number; index: number }) {
  const badge = getStoryBadge(story);
  const isTopRank = rank <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="group relative p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-orange-500/30 hover:bg-zinc-900/80 transition-all cursor-pointer"
    >
      <div className="flex items-start gap-4">
        {/* Rank Badge */}
        <div className={cn(
          'flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl font-bold text-lg',
          isTopRank
            ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/30'
            : 'bg-zinc-800 text-zinc-400'
        )}>
          {rank}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="font-semibold text-white group-hover:text-orange-400 transition-colors line-clamp-2 mb-2">
            {story.title}
          </h3>

          {/* Meta Row */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {story.url && (
              <span className="text-orange-400/70 truncate max-w-[150px]">
                {getDomain(story.url)}
              </span>
            )}
            {badge && (
              <Badge variant="outline" className={cn('text-xs border', badge.color)}>
                {badge.label}
              </Badge>
            )}
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-4 mt-3 text-sm">
            <div className="flex items-center gap-1.5 text-orange-400">
              <ArrowUp className="h-3.5 w-3.5" />
              <span className="font-semibold">{story.score}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-500">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{story.descendants || 0}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-500">
              <User className="h-3.5 w-3.5" />
              <span>{story.by}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-600">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatTimeAgo(story.time)}</span>
            </div>
          </div>
        </div>

        {/* External Link Icon */}
        <ExternalLink className="h-4 w-4 text-zinc-700 group-hover:text-orange-400 transition-colors flex-shrink-0" />
      </div>

      {/* Trending indicator for high-score stories */}
      {story.score > 300 && (
        <div className="absolute top-3 right-3">
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-semibold animate-pulse">
            <Flame className="h-3 w-3" />
            Hot
          </span>
        </div>
      )}
    </motion.div>
  );
}

export default function HackerNewsPage() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [stories, setStories] = useState<HackerNewsItem[]>([]);
  const [storyType, setStoryType] = useState<StoryType>('top');
  const [totalPoints, setTotalPoints] = useState(0);
  const [totalComments, setTotalComments] = useState(0);

  // Fetch stories
  const fetchStories = useCallback(async () => {
    setIsLoading(true);
    try {
      const endpoint = storyType === 'top' ? 'topstories' :
                       storyType === 'new' ? 'newstories' :
                       storyType === 'best' ? 'beststories' :
                       storyType === 'ask' ? 'askstories' :
                       storyType === 'show' ? 'showstories' :
                       'jobstories';

      const idsRes = await fetch(`https://hacker-news.firebaseio.com/v0/${endpoint}.json`);
      const ids = await idsRes.json();

      const storyPromises = ids.slice(0, 30).map(async (id: number) => {
        const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        return res.json();
      });

      const fetchedStories = await Promise.all(storyPromises);
      const validStories = fetchedStories.filter(Boolean) as HackerNewsItem[];
      setStories(validStories);

      // Calculate totals
      const points = validStories.reduce((sum, s) => sum + (s.score || 0), 0);
      const comments = validStories.reduce((sum, s) => sum + (s.descendants || 0), 0);
      setTotalPoints(points);
      setTotalComments(comments);
    } catch (error) {
      console.error('Failed to fetch HN stories:', error);
    }
    setIsLoading(false);
  }, [storyType]);

  useEffect(() => {
    fetchStories();
    const interval = setInterval(fetchStories, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, [fetchStories]);

  // Update clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fullscreen handling
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const featuredStory = stories[0];
  const gridStories = stories.slice(1, 25);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* Gradient Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-black to-zinc-950" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-amber-600/5 via-transparent to-transparent" />

      {/* Content */}
      <div className="relative z-10 h-screen flex flex-col">
        {/* Header */}
        <header className="flex-shrink-0 backdrop-blur-xl bg-black/70 border-b border-zinc-800">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Left - Logo & Title */}
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/30">
                  <HNLogo className="text-3xl" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold flex items-center gap-2">
                    Hacker News
                    <TrendingUp className="h-6 w-6 text-orange-500" />
                  </h1>
                  <p className="text-sm text-zinc-500 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                    </span>
                    Live Feed
                  </p>
                </div>
              </div>

              {/* Center - Story Type Selector */}
              <div className="hidden lg:flex items-center gap-1 p-1 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                {STORY_TYPES.map(({ type, label, icon, color }) => (
                  <button
                    key={type}
                    onClick={() => setStoryType(type)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all',
                      storyType === type
                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    )}
                  >
                    <span className={storyType === type ? 'text-white' : color}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>

              {/* Right - Clock & Controls */}
              <div className="flex items-center gap-4">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-2xl font-bold tabular-nums text-white">
                    {currentTime.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {currentTime.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={fetchStories}
                    disabled={isLoading}
                    className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white"
                  >
                    <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggleFullscreen}
                    className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white"
                  >
                    {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto px-6 py-6">
            {isLoading && stories.length === 0 ? (
              <div className="flex items-center justify-center py-32">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-12 w-12 animate-spin text-orange-500" />
                  <p className="text-zinc-500">Loading stories...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Featured Story + Stats Row */}
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                  {/* Featured Story */}
                  <div className="xl:col-span-3">
                    {featuredStory && <FeaturedStoryCard story={featuredStory} />}
                  </div>

                  {/* Live Stats */}
                  <div className="xl:col-span-1">
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="h-full p-6 rounded-3xl bg-gradient-to-br from-zinc-900/80 to-zinc-900/50 border border-zinc-800 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-6">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                          </span>
                          <span className="text-orange-400 font-semibold">Live Stats</span>
                        </div>

                        <div className="space-y-6">
                          <div>
                            <div className="text-4xl font-bold text-white">{formatNumber(totalPoints)}</div>
                            <div className="text-sm text-zinc-500 flex items-center gap-2">
                              <ArrowUp className="h-4 w-4 text-orange-400" />
                              Total Points
                            </div>
                          </div>
                          <div>
                            <div className="text-4xl font-bold text-white">{formatNumber(totalComments)}</div>
                            <div className="text-sm text-zinc-500 flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-blue-400" />
                              Total Comments
                            </div>
                          </div>
                          <div>
                            <div className="text-4xl font-bold text-white">{stories.length}</div>
                            <div className="text-sm text-zinc-500 flex items-center gap-2">
                              <Newspaper className="h-4 w-4 text-green-400" />
                              Stories Loaded
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-zinc-800 mt-6">
                        <div className="text-xs text-zinc-600 flex items-center gap-2">
                          <RefreshCw className="h-3 w-3" />
                          Updates every 5 minutes
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Stories Grid */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-5 w-5 text-orange-400" />
                    <h2 className="text-xl font-bold text-white">
                      {STORY_TYPES.find(t => t.type === storyType)?.label || 'Top'} Stories
                    </h2>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                      {gridStories.length} stories
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {gridStories.map((story, index) => (
                      <StoryCard
                        key={story.id}
                        story={story}
                        rank={index + 2}
                        index={index}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="flex-shrink-0 border-t border-zinc-800 bg-black/70 backdrop-blur-sm">
          <div className="container mx-auto px-6 py-3">
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-orange-500 flex items-center justify-center">
                    <HNLogo className="text-xs" />
                  </div>
                  <span>Powered by Hacker News API</span>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <a
                  href="https://news.ycombinator.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-orange-400 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Visit HN
                </a>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>Auto-refreshes every 5 minutes</span>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
