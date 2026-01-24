import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Log configuration status (only in development)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('[Supabase] URL configured:', !!supabaseUrl);
  console.log('[Supabase] Anon key configured:', !!supabaseAnonKey);
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase] Missing configuration - auth will be disabled');
  }
}

// Only create client if we have valid credentials
export const supabase = supabaseUrl && supabaseAnonKey
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : null;

export default supabase;
