/**
 * Authentication Middleware
 *
 * Re-exports Better Auth middleware for backward compatibility.
 * All authentication now uses Better Auth session-based auth.
 */

export {
  authenticate,
  optionalAuth,
  authorize,
  authorizeOwner,
  requireAdmin,
} from './betterAuth';

// For default export compatibility
import betterAuthMiddleware from './betterAuth';
export default betterAuthMiddleware;
