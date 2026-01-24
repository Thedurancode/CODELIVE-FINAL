'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  Hash,
  MessageCircle,
  Repeat2,
  Heart,
  Share,
  Loader2,
  RefreshCw,
  Maximize,
  Minimize,
  Clock,
  Globe,
  Flame,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// X/Twitter Logo SVG
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// Mock trending data - in production, this would come from an API
interface TrendingTopic {
  id: string;
  rank: number;
  name: string;
  category: string;
  tweetCount: string;
  description?: string;
  isHashtag: boolean;
}

interface FeaturedTweet {
  id: string;
  author: {
    name: string;
    handle: string;
    avatar: string;
    verified: boolean;
  };
  content: string;
  timestamp: string;
  likes: number;
  retweets: number;
  replies: number;
  topic?: string;
}

// Simulated trending topics (would be replaced with real API data)
const MOCK_TRENDING: TrendingTopic[] = [
  { id: '1', rank: 1, name: '#TechNews', category: 'Technology', tweetCount: '125K', isHashtag: true },
  { id: '2', rank: 2, name: 'OpenAI', category: 'Technology', tweetCount: '89.2K', isHashtag: false },
  { id: '3', rank: 3, name: '#AI', category: 'Technology', tweetCount: '67.5K', isHashtag: true },
  { id: '4', rank: 4, name: 'Apple', category: 'Business', tweetCount: '54.1K', isHashtag: false },
  { id: '5', rank: 5, name: '#Programming', category: 'Technology', tweetCount: '45.3K', isHashtag: true },
  { id: '6', rank: 6, name: 'Bitcoin', category: 'Finance', tweetCount: '38.9K', isHashtag: false },
  { id: '7', rank: 7, name: '#Startup', category: 'Business', tweetCount: '32.1K', isHashtag: true },
  { id: '8', rank: 8, name: 'Tesla', category: 'Business', tweetCount: '28.7K', isHashtag: false },
  { id: '9', rank: 9, name: '#WebDev', category: 'Technology', tweetCount: '24.5K', isHashtag: true },
  { id: '10', rank: 10, name: 'SpaceX', category: 'Science', tweetCount: '21.3K', isHashtag: false },
];

const MOCK_FEATURED_TWEETS: FeaturedTweet[] = [
  {
    id: '1',
    author: {
      name: 'Tech Insider',
      handle: 'techinsider',
      avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=TI&backgroundColor=1d9bf0',
      verified: true,
    },
    content: 'Breaking: Major tech companies are investing heavily in AI infrastructure. The race to build the most advanced models continues. What does this mean for developers? 🚀',
    timestamp: '2h',
    likes: 12500,
    retweets: 3200,
    replies: 890,
    topic: '#TechNews',
  },
  {
    id: '2',
    author: {
      name: 'Startup Daily',
      handle: 'startupdaily',
      avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=SD&backgroundColor=00ba7c',
      verified: true,
    },
    content: 'The future of work is changing rapidly. Remote-first companies are seeing 40% higher retention rates. Is your company adapting? 💼',
    timestamp: '4h',
    likes: 8900,
    retweets: 2100,
    replies: 567,
    topic: '#Startup',
  },
  {
    id: '3',
    author: {
      name: 'Dev Community',
      handle: 'devcommunity',
      avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=DC&backgroundColor=7856ff',
      verified: true,
    },
    content: 'New JavaScript framework just dropped! Here are the top 5 features that will change how you build web apps. Thread 🧵👇',
    timestamp: '6h',
    likes: 15600,
    retweets: 4500,
    replies: 1230,
    topic: '#WebDev',
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Technology: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Business: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Finance: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Science: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Entertainment: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  Sports: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function TrendingCard({ topic, index }: { topic: TrendingTopic; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group relative p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex items-center justify-center w-10 h-10 rounded-xl font-bold text-lg',
            index < 3 ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white' : 'bg-zinc-800 text-zinc-400'
          )}>
            {topic.rank}
          </div>
          <div>
            <div className="flex items-center gap-2">
              {topic.isHashtag ? (
                <Hash className="h-4 w-4 text-[#1d9bf0]" />
              ) : (
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              )}
              <span className="font-semibold text-white group-hover:text-[#1d9bf0] transition-colors">
                {topic.name}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={cn('text-xs border', CATEGORY_COLORS[topic.category] || 'bg-zinc-800 text-zinc-400')}>
                {topic.category}
              </Badge>
              <span className="text-xs text-zinc-500">{topic.tweetCount} posts</span>
            </div>
          </div>
        </div>
        <ExternalLink className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
      </div>
    </motion.div>
  );
}

function FeaturedTweetCard({ tweet, index }: { tweet: FeaturedTweet; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 + index * 0.1 }}
      className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all"
    >
      {/* Author */}
      <div className="flex items-center gap-3 mb-3">
        <img
          src={tweet.author.avatar}
          alt={tweet.author.name}
          className="w-12 h-12 rounded-full"
        />
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-white">{tweet.author.name}</span>
            {tweet.author.verified && (
              <svg viewBox="0 0 22 22" className="h-5 w-5 text-[#1d9bf0]" fill="currentColor">
                <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
              </svg>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <span>@{tweet.author.handle}</span>
            <span>·</span>
            <span>{tweet.timestamp}</span>
          </div>
        </div>
        <XLogo className="h-5 w-5 text-zinc-600" />
      </div>

      {/* Content */}
      <p className="text-white text-lg leading-relaxed mb-4">{tweet.content}</p>

      {/* Topic Badge */}
      {tweet.topic && (
        <Badge className="mb-4 bg-[#1d9bf0]/20 text-[#1d9bf0] border-[#1d9bf0]/30 hover:bg-[#1d9bf0]/30">
          {tweet.topic}
        </Badge>
      )}

      {/* Engagement */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
        <button className="flex items-center gap-2 text-zinc-500 hover:text-[#1d9bf0] transition-colors">
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm">{formatNumber(tweet.replies)}</span>
        </button>
        <button className="flex items-center gap-2 text-zinc-500 hover:text-emerald-400 transition-colors">
          <Repeat2 className="h-5 w-5" />
          <span className="text-sm">{formatNumber(tweet.retweets)}</span>
        </button>
        <button className="flex items-center gap-2 text-zinc-500 hover:text-pink-500 transition-colors">
          <Heart className="h-5 w-5" />
          <span className="text-sm">{formatNumber(tweet.likes)}</span>
        </button>
        <button className="flex items-center gap-2 text-zinc-500 hover:text-[#1d9bf0] transition-colors">
          <Share className="h-5 w-5" />
        </button>
      </div>
    </motion.div>
  );
}

export default function TwitterTrendingPage() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [trending, setTrending] = useState<TrendingTopic[]>([]);
  const [featuredTweets, setFeaturedTweets] = useState<FeaturedTweet[]>([]);

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setTrending(MOCK_TRENDING);
      setFeaturedTweets(MOCK_FEATURED_TWEETS);
      setIsLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

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

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => {
      setTrending(MOCK_TRENDING);
      setFeaturedTweets(MOCK_FEATURED_TWEETS);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Gradient Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-black to-zinc-950" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#1d9bf0]/10 via-transparent to-transparent" />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/70 border-b border-zinc-800">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Left - Logo & Title */}
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white">
                  <XLogo className="h-7 w-7 text-black" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold flex items-center gap-2">
                    Trending Now
                    <Flame className="h-6 w-6 text-orange-500" />
                  </h1>
                  <p className="text-sm text-zinc-500 flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    United States · Updated live
                  </p>
                </div>
              </div>

              {/* Center - Clock */}
              <div className="hidden md:flex flex-col items-center">
                <span className="text-4xl font-bold tabular-nums">
                  {currentTime.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </span>
                <span className="text-sm text-zinc-500">
                  {currentTime.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>

              {/* Right - Controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRefresh}
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
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-6 py-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="h-10 w-10 animate-spin text-[#1d9bf0]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Trending Topics - Left Column */}
              <div className="lg:col-span-1 space-y-4">
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="h-5 w-5 text-[#1d9bf0]" />
                  <h2 className="text-xl font-bold">What's happening</h2>
                </div>
                <div className="space-y-3">
                  {trending.map((topic, index) => (
                    <TrendingCard key={topic.id} topic={topic} index={index} />
                  ))}
                </div>
              </div>

              {/* Featured Tweets - Right Column */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center gap-2 mb-6">
                  <MessageCircle className="h-5 w-5 text-[#1d9bf0]" />
                  <h2 className="text-xl font-bold">Featured Posts</h2>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {featuredTweets.map((tweet, index) => (
                    <FeaturedTweetCard key={tweet.id} tweet={tweet} index={index} />
                  ))}
                </div>

                {/* Live Stats */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="mt-8 p-6 rounded-2xl bg-gradient-to-br from-[#1d9bf0]/20 to-purple-600/20 border border-[#1d9bf0]/30"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1d9bf0] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[#1d9bf0]"></span>
                      </span>
                      <span className="text-[#1d9bf0] font-semibold">Live Activity</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <div className="text-3xl font-bold text-white">2.1M</div>
                      <div className="text-sm text-zinc-400">Posts this hour</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-white">847K</div>
                      <div className="text-sm text-zinc-400">Active users</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-white">156</div>
                      <div className="text-sm text-zinc-400">Trending topics</div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-zinc-800 mt-12">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <div className="flex items-center gap-2">
                <XLogo className="h-4 w-4" />
                <span>Powered by X API</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Auto-refreshes every 60 seconds</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
