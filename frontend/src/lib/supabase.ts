/**
 * Supabase Client
 *
 * Browser client for Supabase services including auth and database.
 * Uses @supabase/ssr for proper cookie handling in Next.js.
 * Lazy-initialized to avoid SSR issues with browser APIs.
 */

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let _supabase: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Get the Supabase browser client (lazy-initialized).
 * Returns null during SSR or if credentials are missing.
 */
export function getSupabase() {
  if (typeof window === 'undefined') return null;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!_supabase) {
    _supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

/**
 * @deprecated Use getSupabase() instead for SSR safety.
 * This export exists for backward compatibility but may be null during SSR.
 */
export const supabase = typeof window !== 'undefined' && supabaseUrl && supabaseAnonKey
  ? (() => { _supabase = createBrowserClient(supabaseUrl, supabaseAnonKey); return _supabase; })()
  : null;

export default supabase;
