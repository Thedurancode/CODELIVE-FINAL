'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import { api } from '@/lib/api';

const REMEMBER_EMAIL_KEY = 'codelive_remember_email';
const REMEMBER_ME_KEY = 'codelive_remember_me';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [isRegister, setIsRegister] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
  });

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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
        // Register with Supabase
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
          // Set cookie for middleware auth check + localStorage for API/WebSocket
          document.cookie = `codelive_token=${data.session.access_token}; path=/; max-age=${60 * 60 * 24 * 7}`; // 7 days
          localStorage.setItem('codelive_token', data.session.access_token);
          toast.success('Account created!');
          router.push('/chat');
        } else {
          toast.success('Check your email to confirm your account!');
        }
      } else {
        // Login with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });

        if (error) throw error;

        if (data.session) {
          // Handle Remember Me preference
          if (rememberMe) {
            localStorage.setItem(REMEMBER_ME_KEY, 'true');
            localStorage.setItem(REMEMBER_EMAIL_KEY, form.email);
            // Set cookie for 30 days when remember me is checked
            document.cookie = `codelive_token=${data.session.access_token}; path=/; max-age=${60 * 60 * 24 * 30}`;
          } else {
            localStorage.removeItem(REMEMBER_ME_KEY);
            localStorage.removeItem(REMEMBER_EMAIL_KEY);
            // Session cookie (expires when browser closes)
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
    <div
      className="min-h-screen relative bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center p-4"
      style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
    >
      {/* Dark overlay with blur */}
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />

      <Card className="relative z-10 w-full max-w-md bg-card/80 border backdrop-blur">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image
              src="/dispotree-long-inverted.png"
              alt="CodeLive"
              width={200}
              height={48}
              className="h-12 w-auto"
            />
          </div>
          <CardTitle className="text-2xl text-foreground">
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </CardTitle>
          <p className="text-muted-foreground text-sm mt-2">
            {isRegister ? 'Sign up to get started' : 'Sign in to your account'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Social Login Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              className="border bg-secondary/30 text-foreground hover:bg-secondary/50"
              onClick={handleGoogleLogin}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border bg-secondary/30 text-foreground hover:bg-secondary/50"
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
              <span className="w-full border-t border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card/80 px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Your name"
                  className="bg-secondary/50 border text-foreground"
                  required={isRegister}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                className="bg-secondary/50 border text-foreground"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Password</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="********"
                className="bg-secondary/50 border text-foreground"
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
                  className="border data-[state=checked]:bg-accent-600 data-[state=checked]:border-accent-600"
                />
                <label
                  htmlFor="remember"
                  className="text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Remember me
                </label>
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-accent-600 hover:bg-accent-700"
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
              className="text-sm text-foreground hover:text-foreground block w-full"
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
            {!isRegister && (
              <button
                type="button"
                onClick={() => router.push('/auth/magic')}
                className="text-sm text-accent-400 hover:text-accent-300"
              >
                Sign in with magic link (no password)
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
