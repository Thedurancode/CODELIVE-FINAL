/**
 * Supabase Auth Client
 *
 * Client-side authentication using Supabase Auth.
 * Provides functions for sign in, sign up, sign out, and session management.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Session, User, AuthError } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create Supabase client
const supabase = supabaseUrl && supabaseAnonKey
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<{
  data: { user: User | null; session: Session | null } | null;
  error: AuthError | null;
}> {
  if (!supabase) {
    return {
      data: null,
      error: { message: 'Supabase not configured', name: 'ConfigError' } as AuthError,
    };
  }

  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Sign up with email, password, and name
 */
export async function signUp(email: string, password: string, name: string): Promise<{
  data: { user: User | null; session: Session | null } | null;
  error: AuthError | null;
}> {
  if (!supabase) {
    return {
      data: null,
      error: { message: 'Supabase not configured', name: 'ConfigError' } as AuthError,
    };
  }

  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        full_name: name,
      },
    },
  });
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<{ error: AuthError | null }> {
  if (!supabase) {
    return { error: null };
  }

  return supabase.auth.signOut();
}

/**
 * Get the current session
 */
export async function getSession(): Promise<{
  data: { session: Session | null };
  error: AuthError | null;
}> {
  if (!supabase) {
    return {
      data: { session: null },
      error: null,
    };
  }

  return supabase.auth.getSession();
}

/**
 * Get the current user
 */
export async function getUser(): Promise<{
  data: { user: User | null };
  error: AuthError | null;
}> {
  if (!supabase) {
    return {
      data: { user: null },
      error: null,
    };
  }

  return supabase.auth.getUser();
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  if (!supabase) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }

  return supabase.auth.onAuthStateChange(callback);
}

/**
 * Get access token from current session
 */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) {
    return null;
  }

  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Refresh the current session
 */
export async function refreshSession(): Promise<{
  data: { session: Session | null };
  error: AuthError | null;
}> {
  if (!supabase) {
    return {
      data: { session: null },
      error: null,
    };
  }

  return supabase.auth.refreshSession();
}

// Export the supabase client for direct access if needed
export { supabase };

// Type exports
export type { Session, User, AuthError };
