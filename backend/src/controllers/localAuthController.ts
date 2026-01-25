/**
 * Local Authentication Controller
 *
 * Standalone JWT-based authentication using bcrypt + jsonwebtoken.
 * Does NOT depend on Supabase - uses Fly Postgres directly.
 */

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import MarketplaceUser from '../models/MarketplaceUser';
import Organization from '../models/Organization';
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const JWT_SECRET = process.env.JWT_SECRET || 'dispotree-local-auth-secret-change-me';
const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 10;

type MarketplaceRole = 'buyer' | 'investor' | 'wholesaler' | 'agent' | 'broker' |
  'broker_assistant' | 'transaction_coordinator' | 'team_member' | 'admin' | 'super_admin';

const DEFAULT_ROLE: MarketplaceRole = 'buyer';

/**
 * Generate JWT token for a user
 */
function generateToken(user: MarketplaceUser): string {
  const payload = {
    sub: user.id,
    email: user.email,
    user_metadata: {
      name: user.name,
      company: user.company,
      phone: user.phone,
    },
    app_metadata: {
      role: user.role,
    },
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Create an organization for a new user
 */
async function createOrganizationForUser(user: MarketplaceUser): Promise<Organization | null> {
  try {
    if (user.organizationId) {
      const existing = await Organization.findByPk(user.organizationId);
      if (existing) return existing;
    }

    const orgName = user.company || `${user.name}'s Organization`;
    const baseSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const organization = await Organization.create({
      name: orgName,
      slug,
      ownerId: user.id,
      status: 'active',
      plan: 'free',
    });

    // Use raw SQL to update organizationId to avoid missing column issues
    await sequelize.query(
      `UPDATE marketplace_users SET organization_id = $1 WHERE id = $2`,
      { bind: [organization.id, user.id], type: QueryTypes.UPDATE }
    );
    console.log(`Created organization "${orgName}" for user ${user.email}`);
    return organization;
  } catch (error) {
    console.error('Failed to create organization:', error);
    return null;
  }
}

/**
 * @swagger
 * /api/auth/local/register:
 *   post:
 *     summary: Register a new user (local auth)
 *     description: Create a new user account with email and password using local database
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               name:
 *                 type: string
 *               company:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Invalid input or email already exists
 */
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name, company, phone } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Email, password, and name are required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email',
        message: 'Please provide a valid email address',
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Weak password',
        message: 'Password must be at least 8 characters',
      });
    }

    // Check if user already exists (explicitly select columns to avoid missing column errors)
    const existingUser = await MarketplaceUser.findOne({
      where: { email: email.toLowerCase().trim() },
      attributes: ['id', 'email'],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered',
        message: 'An account with this email already exists',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user using raw SQL to avoid model default value issues with missing columns
    const userId = uuidv4();
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedName = name.trim();
    const normalizedCompany = company?.trim() || null;
    const normalizedPhone = phone?.trim() || null;

    await sequelize.query(
      `INSERT INTO marketplace_users (id, email, "passwordHash", name, company, phone, role, verified, "createdAt", "updatedAt", "lastActiveAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())`,
      {
        bind: [userId, normalizedEmail, passwordHash, normalizedName, normalizedCompany, normalizedPhone, DEFAULT_ROLE, true],
        type: QueryTypes.INSERT,
      }
    );

    // Fetch the created user
    const user = await MarketplaceUser.findByPk(userId, {
      attributes: ['id', 'email', 'name', 'company', 'phone', 'role', 'verified', 'organizationId', 'lastActiveAt'],
    });

    if (!user) {
      throw new Error('Failed to create user');
    }

    // Create organization
    await createOrganizationForUser(user);
    // Reload user with explicit attributes to avoid missing column errors
    const updatedUser = await MarketplaceUser.findByPk(userId, {
      attributes: ['id', 'email', 'name', 'company', 'phone', 'role', 'verified', 'organizationId', 'lastActiveAt'],
    }) || user;

    // Generate token
    const token = generateToken(updatedUser);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
          company: updatedUser.company,
        },
        token,
        expiresIn: 604800, // 7 days in seconds
      },
    });
  } catch (error) {
    console.error('Local registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/auth/local/login:
 *   post:
 *     summary: Login with email and password (local auth)
 *     description: Authenticate user using local database
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
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

    // Find user (explicitly select only needed columns to avoid missing column errors)
    const user = await MarketplaceUser.findOne({
      where: { email: email.toLowerCase().trim() },
      attributes: ['id', 'email', 'passwordHash', 'name', 'company', 'phone', 'role', 'verified', 'organizationId', 'lastActiveAt'],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Invalid email or password',
      });
    }

    // Check if user has a password (might be OAuth-only user)
    if (!user.passwordHash) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'This account uses social login. Please sign in with Google or GitHub.',
      });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Invalid email or password',
      });
    }

    // Update last active using raw SQL to avoid missing column issues
    await sequelize.query(
      `UPDATE marketplace_users SET "lastActiveAt" = NOW() WHERE id = $1`,
      { bind: [user.id], type: QueryTypes.UPDATE }
    );

    // Ensure user has an organization
    if (!user.organizationId) {
      await createOrganizationForUser(user);
      // Refetch user with explicit attributes to avoid missing column errors
      const refreshedUser = await MarketplaceUser.findByPk(user.id, {
        attributes: ['id', 'email', 'name', 'company', 'phone', 'role', 'verified', 'organizationId', 'lastActiveAt'],
      });
      if (refreshedUser) Object.assign(user, refreshedUser.dataValues);
    }

    // Generate token
    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          company: user.company,
          verified: user.verified,
        },
        token,
        expiresIn: 604800, // 7 days in seconds
      },
    });
  } catch (error) {
    console.error('Local login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/auth/local/me:
 *   get:
 *     summary: Get current user profile (local auth)
 *     description: Returns the authenticated user's profile using local JWT
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Not authenticated
 */
export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const token = authHeader.substring(7);

    // Verify token
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Token is invalid or expired',
      });
    }

    if (!payload.sub) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Token missing user ID',
      });
    }

    // Get user from database (explicitly select columns to avoid missing column errors)
    const user = await MarketplaceUser.findByPk(payload.sub, {
      attributes: ['id', 'email', 'name', 'company', 'phone', 'role', 'verified', 'avatar', 'organizationId', 'fundId', 'createdAt', 'updatedAt', 'lastActiveAt'],
    });

    if (!user) {
      return res.status(401).json({
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
    });
  }
};

export default {
  register,
  login,
  getCurrentUser,
};
