/**
 * Authentication Controller
 *
 * Handles auth-related API endpoints for Supabase integration.
 * Note: Actual authentication (login, register, logout) is handled
 * by Supabase client on the frontend. This controller provides
 * endpoints for profile management and session validation.
 */

import { Request, Response } from 'express';
import MarketplaceUser from '../models/MarketplaceUser';

/**
 * Register - Placeholder for Supabase integration
 * Actual registration happens via Supabase client
 */
export const register = async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
    message: 'Registration is handled by Supabase. Use the frontend auth flow.',
  });
};

/**
 * Login - Placeholder for Supabase integration
 * Actual login happens via Supabase client
 */
export const login = async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
    message: 'Login is handled by Supabase. Use the frontend auth flow.',
  });
};

/**
 * Refresh Token - Placeholder for Supabase integration
 * Actual token refresh happens via Supabase client
 */
export const refreshToken = async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
    message: 'Token refresh is handled by Supabase. Use the frontend auth flow.',
  });
};

/**
 * Logout - Placeholder for Supabase integration
 * Actual logout happens via Supabase client
 */
export const logout = async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
};

/**
 * Forgot Password - Placeholder for Supabase integration
 */
export const forgotPassword = async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
    message: 'Password reset is handled by Supabase. Use the frontend auth flow.',
  });
};

/**
 * Verify Magic Link - Placeholder for Supabase integration
 */
export const verifyMagicLink = async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
    message: 'Magic link verification is handled by Supabase. Use the frontend auth flow.',
  });
};

/**
 * Request Magic Link - Placeholder for Supabase integration
 */
export const requestMagicLink = async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
    message: 'Magic link requests are handled by Supabase. Use the frontend auth flow.',
  });
};

/**
 * Get current authenticated user's profile
 */
export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const user = await MarketplaceUser.findByPk(req.user.id, {
      attributes: { exclude: ['passwordHash'] },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Update current user's profile
 */
export const updateProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const { name, company, phone, avatar, bio, expertise, title, timezone } = req.body;

    const user = await MarketplaceUser.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Update allowed fields
    await user.update({
      ...(name !== undefined && { name }),
      ...(company !== undefined && { company }),
      ...(phone !== undefined && { phone }),
      ...(avatar !== undefined && { avatar }),
      ...(bio !== undefined && { bio }),
      ...(expertise !== undefined && { expertise }),
      ...(title !== undefined && { title }),
      ...(timezone !== undefined && { timezone }),
    });

    // Reload to get updated values
    await user.reload();

    res.json({
      success: true,
      data: user.toJSON(),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Change Password - Placeholder for Supabase integration
 */
export const changePassword = async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
    message: 'Password change is handled by Supabase. Use the frontend auth flow.',
  });
};

export default {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  verifyMagicLink,
  requestMagicLink,
  getCurrentUser,
  updateProfile,
  changePassword,
};
