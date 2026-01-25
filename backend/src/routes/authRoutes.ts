/**
 * Authentication Routes
 *
 * User registration, login, token refresh, and profile management.
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  refreshToken,
  getCurrentUser,
  updateProfile,
  changePassword,
  logout,
  forgotPassword,
  verifyMagicLink,
  requestMagicLink,
} from '../controllers/authController';
import * as localAuth from '../controllers/localAuthController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limiting for auth endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many attempts',
    message: 'Please try again in 15 minutes',
  },
});

const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour
  message: {
    success: false,
    error: 'Too many attempts',
    message: 'Please try again in 1 hour',
  },
});

// ============================================================================
// PUBLIC ROUTES (no authentication required)
// ============================================================================

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 */
router.post('/register', authLimiter, register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Authentication]
 */
router.post('/login', authLimiter, login);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 */
router.post('/refresh', authLimiter, refreshToken);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout
 *     tags: [Authentication]
 */
router.post('/logout', logout);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Send password reset email
 *     tags: [Authentication]
 */
router.post('/forgot-password', strictLimiter, forgotPassword);

/**
 * @swagger
 * /api/auth/magic-link:
 *   post:
 *     summary: Verify magic link token and authenticate user
 *     tags: [Authentication]
 */
router.post('/magic-link', authLimiter, verifyMagicLink);

/**
 * @swagger
 * /api/auth/request-magic-link:
 *   post:
 *     summary: Request a new magic link for passwordless login
 *     tags: [Authentication]
 */
router.post('/request-magic-link', strictLimiter, requestMagicLink);

// ============================================================================
// PROTECTED ROUTES (authentication required)
// ============================================================================

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', authenticate, getCurrentUser);

/**
 * @swagger
 * /api/auth/me:
 *   patch:
 *     summary: Update current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/me', authenticate, updateProfile);

/**
 * @swagger
 * /api/auth/password:
 *   put:
 *     summary: Change password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 */
router.put('/password', authenticate, strictLimiter, changePassword);

// ============================================================================
// LOCAL AUTH ROUTES (standalone JWT auth - no Supabase dependency)
// ============================================================================

/**
 * @swagger
 * /api/auth/local/register:
 *   post:
 *     summary: Register a new user (local auth)
 *     tags: [Authentication]
 */
router.post('/local/register', authLimiter, localAuth.register);

/**
 * @swagger
 * /api/auth/local/login:
 *   post:
 *     summary: Login with email and password (local auth)
 *     tags: [Authentication]
 */
router.post('/local/login', authLimiter, localAuth.login);

/**
 * @swagger
 * /api/auth/local/me:
 *   get:
 *     summary: Get current user profile (local auth)
 *     tags: [Authentication]
 */
router.get('/local/me', localAuth.getCurrentUser);

// ============================================================================
// DEVELOPMENT ROUTES (only enabled in development mode)
// ============================================================================

/**
 * @swagger
 * /api/auth/set-role:
 *   put:
 *     summary: Set user role (DEV ONLY)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 */
router.put('/set-role', authenticate, async (req: Request, res: Response) => {
  // Only allow in development mode
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Not available in production',
    });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const { role } = req.body;
  const validRoles = ['buyer', 'investor', 'wholesaler', 'agent', 'broker', 'admin', 'super_admin'];

  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid role',
      validRoles,
    });
  }

  try {
    const MarketplaceUser = (await import('../models/MarketplaceUser')).default;
    await MarketplaceUser.update({ role }, { where: { id: userId } });

    const updatedUser = await MarketplaceUser.findByPk(userId, {
      attributes: { exclude: ['passwordHash'] },
    });

    res.json({
      success: true,
      message: `Role updated to ${role}`,
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update role',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
