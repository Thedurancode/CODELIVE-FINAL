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
import { api } from '@/lib/api';

interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    company?: string;
    verified?: boolean;
  };
  token: string;
  expiresIn: number;
}

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
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isRegister) {
        // Register with backend API
        const response = await api.post<AuthResponse>('/api/auth/local/register', {
          email: form.email,
          password: form.password,
          name: form.name,
        });

        if (response.token) {
          document.cookie = `dispotree_token=${response.token}; path=/; max-age=${60 * 60 * 24 * 7}`;
          localStorage.setItem('dispotree_token', response.token);
          toast.success('Account created!');
          router.push('/projects');
        }
      } else {
        // Login with backend API
        const response = await api.post<AuthResponse>('/api/auth/local/login', {
          email: form.email,
          password: form.password,
        });

        if (response.token) {
          if (rememberMe) {
            localStorage.setItem(REMEMBER_ME_KEY, 'true');
            localStorage.setItem(REMEMBER_EMAIL_KEY, form.email);
            document.cookie = `dispotree_token=${response.token}; path=/; max-age=${60 * 60 * 24 * 30}`;
          } else {
            localStorage.removeItem(REMEMBER_ME_KEY);
            localStorage.removeItem(REMEMBER_EMAIL_KEY);
            document.cookie = `dispotree_token=${response.token}; path=/`;
          }
          localStorage.setItem('dispotree_token', response.token);
          toast.success('Welcome back!');
          router.push('/projects');
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error('[Login] Auth error:', err);
      // Provide more helpful error messages
      if (err.message.includes('Load failed') || err.message.includes('fetch')) {
        toast.error('Unable to connect to server. Please check your internet connection.');
      } else if (err.message.includes('Invalid') || err.message.includes('credentials')) {
        toast.error('Invalid email or password');
      } else {
        toast.error(err.message || 'Authentication failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    toast.info('Social login coming soon! Please use email/password for now.');
  };

  const handleGitHubLogin = async () => {
    toast.info('Social login coming soon! Please use email/password for now.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      {/* Background gradients */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

      {/* Login Card */}
      <Card className="w-full max-w-md bg-zinc-900/90 border-zinc-800 backdrop-blur-xl relative z-10">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <img
              src="/codelive-logo.png"
              alt="CodeLive"
              className="h-12 w-auto object-contain"
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
              <span className="bg-zinc-900/90 px-2 text-zinc-500">Or continue with</span>
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
                  className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-primary focus:ring-primary/20"
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
                className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-primary focus:ring-primary/20"
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
                className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-primary focus:ring-primary/20"
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
                  className="border-zinc-600 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
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
              className="w-full"
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
                className="text-sm text-primary hover:text-primary/80 transition-colors"
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
