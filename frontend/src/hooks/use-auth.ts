'use client';

/**
 * Authentication Hook
 *
 * Wrapper around Better Auth client providing login, register, logout functions
 * with automatic navigation and error handling.
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useSession, signIn, signOut, signUp, type Session } from '@/lib/auth-client';

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
  refetch: () => void;
}

/**
 * Hook for authentication state and actions
 */
export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const { data: session, isPending, error, refetch } = useSession();

  const login = useCallback(async (email: string, password: string) => {
    const result = await signIn.email({
      email,
      password,
    });

    if (result.error) {
      throw new Error(result.error.message || 'Login failed');
    }

    // Refresh session after login
    await refetch();

    // Navigate to projects page
    router.push('/projects');
  }, [router, refetch]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const result = await signUp.email({
      email,
      password,
      name,
    });

    if (result.error) {
      throw new Error(result.error.message || 'Registration failed');
    }

    // Refresh session after registration
    await refetch();

    // Navigate to projects page
    router.push('/projects');
  }, [router, refetch]);

  const logout = useCallback(async () => {
    await signOut();
    router.push('/login');
  }, [router]);

  return {
    user: session?.user ? {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name || '',
      image: session.user.image || undefined,
    } : null,
    session: session || null,
    isLoading: isPending,
    isAuthenticated: !!session?.user,
    error: error || null,
    login,
    register,
    logout,
    refetch,
  };
}

export default useAuth;
