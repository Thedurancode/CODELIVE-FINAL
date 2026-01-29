/**
 * Better Auth Client
 *
 * Client-side authentication using Better Auth.
 * Provides hooks and functions for sign in, sign up, sign out, and session management.
 */

import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Better Auth client instance
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [adminClient()],
});

/**
 * Export commonly used auth functions and hooks
 */
export const {
  useSession,
  signIn,
  signOut,
  signUp,
} = authClient;

/**
 * Type exports
 */
export type Session = typeof authClient.$Infer.Session;
export type User = Session['user'];
