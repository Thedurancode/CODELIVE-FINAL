'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface MagicLinkResponse {
  success: boolean;
  message: string;
  data?: {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      company?: string;
      fundId?: string;
      isNewUser?: boolean;
    };
    token?: string;
    refreshToken?: string;
    expiresIn?: number;
    requiresLogin?: boolean;
  };
  error?: string;
}

function MagicLinkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'request'>('verifying');
  const [message, setMessage] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [email, setEmail] = useState('');
  const [isRequestingLink, setIsRequestingLink] = useState(false);

  useEffect(() => {
    if (!token) {
      // No token - show request form
      setStatus('request');
      return;
    }

    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data: MagicLinkResponse = await res.json();

      if (!data.success || !data.data) {
        setStatus('error');
        setMessage(data.message || 'Invalid or expired link');
        return;
      }

      const { user, token: accessToken, requiresLogin } = data.data;
      setIsNewUser(user.isNewUser || false);

      if (requiresLogin) {
        // Account created but needs to complete login
        setStatus('success');
        setMessage(user.isNewUser
          ? 'Your account has been created! Redirecting to login...'
          : 'Welcome back! Redirecting to login...'
        );
        setTimeout(() => {
          router.push('/login');
        }, 2000);
        return;
      }

      if (accessToken) {
        // Full authentication successful - store tokens and redirect
        localStorage.setItem('codelive_token', accessToken);
        document.cookie = `codelive_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}`; // 7 days

        setStatus('success');
        setMessage(user.isNewUser
          ? 'Welcome to CodeLive! Redirecting...'
          : 'Welcome back! Redirecting...'
        );

        toast.success(user.isNewUser ? 'Account created successfully!' : 'Signed in successfully!');

        setTimeout(() => {
          router.push('/chat');
        }, 1500);
      } else {
        // Partial success - redirect to login
        setStatus('success');
        setMessage('Verification complete. Redirecting to login...');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (error) {
      console.error('Magic link verification error:', error);
      setStatus('error');
      setMessage('Something went wrong. Please try again or request a new link.');
    }
  };

  const requestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    if (!supabase) {
      toast.error('Authentication service not configured');
      return;
    }

    setIsRequestingLink(true);
    try {
      // Use Supabase magic link (OTP) instead of custom backend
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        throw error;
      }

      toast.success('Magic link sent! Check your email.');
      setMessage('Check your email for a login link. It may take a minute to arrive.');
    } catch (error) {
      console.error('Magic link error:', error);
      toast.error((error as Error).message || 'Failed to send magic link. Please try again.');
    } finally {
      setIsRequestingLink(false);
    }
  };

  return (
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
          {status === 'verifying' && 'Verifying...'}
          {status === 'success' && (isNewUser ? 'Welcome!' : 'Welcome Back!')}
          {status === 'error' && 'Link Expired'}
          {status === 'request' && 'Sign In with Email'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {status === 'verifying' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-12 w-12 text-accent-500 animate-spin" />
            <p className="text-muted-foreground text-center">
              Verifying your magic link...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="rounded-full bg-accent-500/20 p-4">
              <CheckCircle className="h-12 w-12 text-accent-500" />
            </div>
            <p className="text-foreground text-center">{message}</p>
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="rounded-full bg-red-500/20 p-4">
              <XCircle className="h-12 w-12 text-red-500" />
            </div>
            <p className="text-foreground text-center">{message}</p>

            <div className="w-full mt-4 pt-4 border-t border">
              <p className="text-sm text-muted-foreground text-center mb-4">
                Request a new login link:
              </p>
              <form onSubmit={requestNewLink} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="bg-secondary/50 border text-foreground"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-accent-600 hover:bg-accent-700"
                  disabled={isRequestingLink}
                >
                  {isRequestingLink ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Magic Link
                    </>
                  )}
                </Button>
              </form>
            </div>

            <div className="text-center mt-4">
              <button
                onClick={() => router.push('/login')}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Or sign in with password
              </button>
            </div>
          </div>
        )}

        {status === 'request' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Enter your email to receive a secure login link. No password required!
            </p>
            <form onSubmit={requestNewLink} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-secondary/50 border text-foreground"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-accent-600 hover:bg-accent-700"
                disabled={isRequestingLink}
              >
                {isRequestingLink ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Magic Link
                  </>
                )}
              </Button>
            </form>

            {message && (
              <div className="rounded-lg bg-accent-500/10 border border-accent-500/20 p-4">
                <p className="text-sm text-accent-400 text-center">{message}</p>
              </div>
            )}

            <div className="relative pt-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card/80 px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full border bg-secondary/30 text-foreground hover:bg-secondary/50"
              onClick={() => router.push('/login')}
            >
              Sign in with password
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingFallback() {
  return (
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
        <CardTitle className="text-2xl text-foreground">Loading...</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-12 w-12 text-accent-500 animate-spin" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function MagicLinkPage() {
  return (
    <div
      className="min-h-screen relative bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center p-4"
      style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
    >
      {/* Dark overlay with blur */}
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />

      <Suspense fallback={<LoadingFallback />}>
        <MagicLinkContent />
      </Suspense>
    </div>
  );
}
