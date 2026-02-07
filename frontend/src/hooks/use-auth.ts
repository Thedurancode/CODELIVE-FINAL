'use client';

/**
 * Authentication Hook
 *
 * Wrapper around Supabase Auth providing login, register, logout functions
 * with automatic navigation and error handling.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  signIn,
  signUp,
  signOut,
  getSession,
  onAuthStateChange,
  type Session,
  type User,
} from '@/lib/auth-client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string;
}

export interface UseAuthReturn {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Hook for authentication state and actions
 */
export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch initial session
  const fetchSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: sessionError } = await getSession();

      if (sessionError) {
        console.error('Session fetch error:', sessionError);
        setError(new Error(sessionError.message));
        setSession(null);
        setUser(null);
        return;
      }

      setSession(data.session);
      if (data.session?.user) {
        setUser({
          id: data.session.user.id,
          email: data.session.user.email || '',
          name: data.session.user.user_metadata?.name ||
                data.session.user.user_metadata?.full_name ||
                data.session.user.email?.split('@')[0] || '',
          image: data.session.user.user_metadata?.avatar_url,
        });
      } else {
        setUser(null);
      }
      setError(null);
    } catch (err) {
      console.error('Session fetch error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch session'));
      setSession(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Subscribe to auth state changes
  useEffect(() => {
    fetchSession();

    const { data: { subscription } } = onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setUser({
          id: newSession.user.id,
          email: newSession.user.email || '',
          name: newSession.user.user_metadata?.name ||
                newSession.user.user_metadata?.full_name ||
                newSession.user.email?.split('@')[0] || '',
          image: newSession.user.user_metadata?.avatar_url,
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchSession]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: loginError } = await signIn(email, password);

      if (loginError) {
        throw new Error(loginError.message || 'Login failed');
      }

      if (!data?.session) {
        throw new Error('No session returned from login');
      }

      // Update session state immediately
      setSession(data.session);
      if (data.session.user) {
        setUser({
          id: data.session.user.id,
          email: data.session.user.email || '',
          name: data.session.user.user_metadata?.name ||
                data.session.user.user_metadata?.full_name ||
                data.session.user.email?.split('@')[0] || '',
          image: data.session.user.user_metadata?.avatar_url,
        });
      }
      setIsLoading(false);

      // Navigate to projects page
      router.push('/projects');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(new Error(errorMessage));
      setIsLoading(false);
      throw err;
    }
  }, [router]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: signUpError } = await signUp(email, password, name);

      if (signUpError) {
        throw new Error(signUpError.message || 'Registration failed');
      }

      // Check if email confirmation is required
      if (data?.user && !data?.session) {
        setIsLoading(false);
        throw new Error('Please check your email to confirm your account');
      }

      if (!data?.session) {
        throw new Error('No session returned from registration');
      }

      // Update session state immediately
      setSession(data.session);
      if (data.session.user) {
        setUser({
          id: data.session.user.id,
          email: data.session.user.email || '',
          name: data.session.user.user_metadata?.name ||
                data.session.user.user_metadata?.full_name ||
                data.session.user.email?.split('@')[0] || '',
          image: data.session.user.user_metadata?.avatar_url,
        });
      }
      setIsLoading(false);

      // Navigate to projects page
      router.push('/projects');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(new Error(errorMessage));
      setIsLoading(false);
      throw err;
    }
  }, [router]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await signOut();
      setSession(null);
      setUser(null);
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  return {
    user,
    session,
    isLoading,
    isAuthenticated: !!session?.user,
    error,
    login,
    register,
    logout,
    refetch: fetchSession,
  };
}

export default useAuth;
