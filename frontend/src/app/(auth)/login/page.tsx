'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, Hash, Clock, Flame, ArrowUp, MessageSquare, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const REMEMBER_EMAIL_KEY = 'codelive_remember_email';
const REMEMBER_ME_KEY = 'codelive_remember_me';

// X/Twitter Logo
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// Trending news data
interface TrendingItem {
  id: string;
  rank: number;
  title: string;
  category: string;
  posts: string;
  isHashtag: boolean;
}

const TRENDING_NEWS: TrendingItem[] = [
  { id: '1', rank: 1, title: '#TechNews', category: 'Technology', posts: '125K', isHashtag: true },
  { id: '2', rank: 2, title: 'OpenAI', category: 'Technology', posts: '89.2K', isHashtag: false },
  { id: '3', rank: 3, title: '#AI', category: 'Technology', posts: '67.5K', isHashtag: true },
  { id: '4', rank: 4, title: 'Apple', category: 'Business', posts: '54.1K', isHashtag: false },
  { id: '5', rank: 5, title: '#Startup', category: 'Business', posts: '32.1K', isHashtag: true },
  { id: '6', rank: 6, title: 'Bitcoin', category: 'Finance', posts: '38.9K', isHashtag: false },
  { id: '7', rank: 7, title: '#WebDev', category: 'Technology', posts: '24.5K', isHashtag: true },
  { id: '8', rank: 8, title: 'SpaceX', category: 'Science', posts: '21.3K', isHashtag: false },
];

const CATEGORY_COLORS: Record<string, string> = {
  Technology: 'text-blue-400',
  Business: 'text-emerald-400',
  Finance: 'text-amber-400',
  Science: 'text-purple-400',
};

function TrendingCard({ item }: { item: TrendingItem }) {
  return (
    <div className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all cursor-pointer">
      <div className={cn(
        'flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold',
        item.rank <= 3 ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white' : 'bg-zinc-800 text-zinc-400'
      )}>
        {item.rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {item.isHashtag ? (
            <Hash className="h-3.5 w-3.5 text-[#1d9bf0]" />
          ) : (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          )}
          <span className="font-medium text-white group-hover:text-[#1d9bf0] transition-colors truncate">
            {item.title}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn('text-xs', CATEGORY_COLORS[item.category])}>{item.category}</span>
          <span className="text-xs text-zinc-500">·</span>
          <span className="text-xs text-zinc-500">{item.posts} posts</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [isRegister, setIsRegister] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
  });

  // Update clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Check if system needs first-run setup
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const response = await api.get<{ needsSetup: boolean }>('/api/setup/status');
        if (response.needsSetup) {
          router.push('/setup');
          return;
        }
      } catch {
        // If API fails, continue to login (might be network issue)
      }
      setIsCheckingSetup(false);
    };
    checkSetup();
  }, [router]);

  // Load remembered email on mount
  useEffect(() => {
    const savedRememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
    const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);

    if (savedRememberMe && savedEmail) {
      setRememberMe(true);
      setForm((prev) => ({ ...prev, email: savedEmail }));
    }
  }, []);

  // Show loading while checking setup status
  if (isCheckingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-[#1d9bf0]" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!supabase) {
      toast.error('Authentication service not configured');
      setIsLoading(false);
      return;
    }

    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: {
              name: form.name,
            },
          },
        });

        if (error) throw error;

        if (data.session) {
          document.cookie = `codelive_token=${data.session.access_token}; path=/; max-age=${60 * 60 * 24 * 7}`;
          localStorage.setItem('codelive_token', data.session.access_token);
          toast.success('Account created!');
          router.push('/chat');
        } else {
          toast.success('Check your email to confirm your account!');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });

        if (error) throw error;

        if (data.session) {
          if (rememberMe) {
            localStorage.setItem(REMEMBER_ME_KEY, 'true');
            localStorage.setItem(REMEMBER_EMAIL_KEY, form.email);
            document.cookie = `codelive_token=${data.session.access_token}; path=/; max-age=${60 * 60 * 24 * 30}`;
          } else {
            localStorage.removeItem(REMEMBER_ME_KEY);
            localStorage.removeItem(REMEMBER_EMAIL_KEY);
            document.cookie = `codelive_token=${data.session.access_token}; path=/`;
          }
          localStorage.setItem('codelive_token', data.session.access_token);
          toast.success('Welcome back!');
          router.push('/chat');
        }
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      toast.error('Authentication service not configured');
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleGitHubLogin = async () => {
    if (!supabase) {
      toast.error('Authentication service not configured');
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-black flex">
      {/* Background gradients */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-black to-zinc-950" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#1d9bf0]/10 via-transparent to-transparent" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-purple-600/10 via-transparent to-transparent" />

      {/* Left side - Trending News */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative z-10 flex-col p-8 xl:p-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white">
              <XLogo className="h-6 w-6 text-black" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Trending Now
                <Flame className="h-5 w-5 text-orange-500" />
              </h2>
              <p className="text-xs text-zinc-500">What's happening in tech</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white tabular-nums">
              {currentTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })}
            </div>
            <div className="text-xs text-zinc-500">
              {currentTime.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>
        </div>

        {/* Trending List */}
        <div className="flex-1 overflow-hidden">
          <div className="space-y-1">
            {TRENDING_NEWS.map((item) => (
              <TrendingCard key={item.id} item={item} />
            ))}
          </div>

          {/* Live Stats */}
          <div className="mt-8 p-5 rounded-2xl bg-gradient-to-br from-[#1d9bf0]/10 to-purple-600/10 border border-[#1d9bf0]/20">
            <div className="flex items-center gap-2 mb-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1d9bf0] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#1d9bf0]"></span>
              </span>
              <span className="text-sm text-[#1d9bf0] font-medium">Live Activity</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-2xl font-bold text-white">2.1M</div>
                <div className="text-xs text-zinc-500">Posts/hour</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">847K</div>
                <div className="text-xs text-zinc-500">Active users</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">156</div>
                <div className="text-xs text-zinc-500">Topics</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center gap-2 text-xs text-zinc-600">
          <Clock className="h-3.5 w-3.5" />
          <span>Updates every 60 seconds</span>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-800 backdrop-blur-xl">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <img
                src="/codelive-logo.png"
                alt="CodeLive"
                className="h-10 w-auto object-contain"
              />
            </div>
            <CardTitle className="text-2xl text-white">
              {isRegister ? 'Create Account' : 'Welcome Back'}
            </CardTitle>
            <p className="text-zinc-400 text-sm mt-1">
              {isRegister ? 'Sign up to get started' : 'Sign in to your account'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Social Login Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-zinc-700 bg-zinc-800/50 text-white hover:bg-zinc-800 hover:text-white"
                onClick={handleGoogleLogin}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-zinc-700 bg-zinc-800/50 text-white hover:bg-zinc-800 hover:text-white"
                onClick={handleGitHubLogin}
              >
                <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-zinc-900/80 px-2 text-zinc-500">Or continue with</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div className="space-y-2">
                  <Label className="text-zinc-400">Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-[#1d9bf0] focus:ring-[#1d9bf0]/20"
                    required={isRegister}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-zinc-400">Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@example.com"
                  className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-[#1d9bf0] focus:ring-[#1d9bf0]/20"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Password</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-[#1d9bf0] focus:ring-[#1d9bf0]/20"
                  required
                  minLength={8}
                />
              </div>
              {!isRegister && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                    className="border-zinc-600 data-[state=checked]:bg-[#1d9bf0] data-[state=checked]:border-[#1d9bf0]"
                  />
                  <label
                    htmlFor="remember"
                    className="text-sm text-zinc-400 cursor-pointer select-none"
                  >
                    Remember me
                  </label>
                </div>
              )}
              <Button
                type="submit"
                className="w-full bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isRegister ? 'Creating...' : 'Signing in...'}
                  </>
                ) : (
                  isRegister ? 'Create Account' : 'Sign In'
                )}
              </Button>
            </form>
            <div className="mt-4 text-center space-y-2">
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="text-sm text-zinc-400 hover:text-white block w-full transition-colors"
              >
                {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
              {!isRegister && (
                <button
                  type="button"
                  onClick={() => router.push('/auth/magic')}
                  className="text-sm text-[#1d9bf0] hover:text-[#1a8cd8] transition-colors"
                >
                  Sign in with magic link (no password)
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
