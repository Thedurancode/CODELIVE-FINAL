/**
 * Local Authentication Controller
 *
 * Provides standalone JWT authentication for cases where
 * Supabase is not available or for server-to-server auth.
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import MarketplaceUser from '../models/MarketplaceUser';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

/**
 * Register a new user with local authentication
 */
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Email, password, and name are required',
      });
    }

    // Check if user already exists
    const existingUser = await MarketplaceUser.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User already exists',
        message: 'An account with this email already exists',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await MarketplaceUser.create({
      email,
      passwordHash,
      name,
      role: 'team_member',
      verified: true,
    });

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Local register error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Login with email and password
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing credentials',
        message: 'Email and password are required',
      });
    }

    // Find user
    const user = await MarketplaceUser.findOne({ where: { email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Local login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Get current user from JWT token
 */
export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    // Extract token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'No authorization token provided',
      });
    }

    const token = authHeader.slice(7);

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };

    // Find user
    const user = await MarketplaceUser.findByPk(decoded.userId, {
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
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'The provided token is invalid or expired',
      });
    }

    console.error('Local getCurrentUser error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export default {
  register,
  login,
  getCurrentUser,
};
