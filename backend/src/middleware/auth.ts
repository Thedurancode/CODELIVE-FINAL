/**
 * Authentication Middleware
 *
 * Re-exports Supabase Auth middleware for backward compatibility.
 * All authentication now uses Supabase token-based auth.
 */

export {
  authenticate,
  optionalAuth,
  authorize,
  authorizeOwner,
  requireAdmin,
} from './supabaseAuth';

// For default export compatibility
import supabaseAuthMiddleware from './supabaseAuth';
export default supabaseAuthMiddleware;
