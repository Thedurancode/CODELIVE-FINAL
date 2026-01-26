/**
 * Authentication Controller
 *
 * Handles user authentication using Supabase Auth.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../config/supabase';
import MarketplaceUser from '../models/MarketplaceUser';
import MagicLinkToken from '../models/MagicLinkToken';
import Fund from '../models/Fund';
import Contact, { ContactType } from '../models/Contact';
import Organization from '../models/Organization';

type MarketplaceRole =
  | 'buyer'
  | 'investor'
  | 'wholesaler'
  | 'agent'
  | 'broker'
  | 'broker_assistant'
  | 'transaction_coordinator'
  | 'team_member'
  | 'admin'
  | 'super_admin';

const DEFAULT_ROLE: MarketplaceRole = 'buyer';
const ALLOWED_ROLES = new Set<MarketplaceRole>([
  'buyer',
  'investor',
  'wholesaler',
  'agent',
  'broker',
  'broker_assistant',
  'transaction_coordinator',
  'team_member',
  'admin',
  'super_admin',
]);

const resolveRoleFromAppMetadata = (user: { app_metadata?: Record<string, unknown> | null }): MarketplaceRole => {
  const role = user.app_metadata?.role;
  if (typeof role === 'string' && ALLOWED_ROLES.has(role as MarketplaceRole)) {
    return role as MarketplaceRole;
  }
  return DEFAULT_ROLE;
};

/**
 * Create an organization for a new user
 * Each user gets their own organization by default (can be changed later)
 */
async function createOrganizationForUser(user: MarketplaceUser): Promise<Organization | null> {
  try {
    // Skip if user already has an organization
    if (user.organizationId) {
      const existing = await Organization.findByPk(user.organizationId);
      if (existing) {
        return existing;
      }
    }

    // Generate organization name from company or user name
    const orgName = user.company || `${user.name}'s Organization`;

    // Generate a URL-safe slug
    const baseSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    // Make slug unique by adding timestamp if needed
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    // Create the organization
    const organization = await Organization.create({
      name: orgName,
      slug,
      ownerId: user.id,
      status: 'active',
      plan: 'free',
    });

    // Update user with organization ID
    await user.update({ organizationId: organization.id });

    console.log(`Created organization "${orgName}" for user ${user.email}`);
    return organization;
  } catch (error) {
    console.error('Failed to create organization for user:', error);
    return null;
  }
}

/**
 * Create a contact record for a new user signup
 * The contact is owned by the first admin/super_admin user found,
 * or by the user themselves if no admin exists.
 */
async function createContactForUser(user: MarketplaceUser): Promise<void> {
  try {
    // Skip if user doesn't have an organization yet
    if (!user.organizationId) {
      console.log(`Skipping contact creation for user ${user.email} - no organization assigned`);
      return;
    }

    // Check if a contact already exists with this linkedUserId
    const existingContact = await Contact.findOne({
      where: { linkedUserId: user.id },
    });

    if (existingContact) {
      console.log(`Contact already exists for user ${user.email}`);
      return;
    }

    // Find the first admin/super_admin to own this contact
    const adminUser = await MarketplaceUser.findOne({
      where: {
        role: ['admin', 'super_admin'],
      },
      order: [['createdAt', 'ASC']],
    });

    // Contact owner: admin if exists, otherwise the user themselves
    const ownerId = adminUser?.id || user.id;

    // Map user role to contact type
    const roleToType: Record<string, ContactType> = {
      buyer: 'buyer',
      investor: 'buyer',
      wholesaler: 'wholesaler',
      agent: 're_agent',
      broker: 'broker',
      broker_assistant: 'broker',
      transaction_coordinator: 'transaction_coordinator',
      team_member: 'team_member',
      admin: 'team_member',
      super_admin: 'team_member',
    };

    await Contact.create({
      organizationId: user.organizationId,
      createdById: ownerId,
      linkedUserId: user.id,
      type: roleToType[user.role] || 'other',
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      company: user.company || null,
      status: 'active',
      tags: ['platform-user', 'auto-created'],
    });

    console.log(`Created contact for new user ${user.email}`);
  } catch (error) {
    // Don't fail registration if contact creation fails
    console.error('Failed to create contact for user:', error);
  }
}

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Create a new user account with email and password using Supabase Auth
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

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Weak password',
        message: 'Password must be at least 8 characters',
      });
    }

    // Register with Supabase Auth using admin API (auto-confirms email)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        company,
        phone,
      },
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        error: authError.code || 'Registration failed',
        message: authError.message,
      });
    }

    if (!authData.user) {
      return res.status(400).json({
        success: false,
        error: 'Registration failed',
        message: 'Failed to create user',
      });
    }

    // Sync user to MarketplaceUser table
    const [user, created] = await MarketplaceUser.findOrCreate({
      where: { id: authData.user.id },
      defaults: {
        id: authData.user.id,
        email,
        name,
        company,
        phone,
        role: DEFAULT_ROLE,
      },
    });

    if (!created) {
      await user.update({ email, name, company, phone });
    }

    // Create an organization for new users (or ensure existing user has one)
    await createOrganizationForUser(user);

    // Reload user to get updated organizationId
    await user.reload();

    // Create a contact record for this user (for CRM tracking)
    await createContactForUser(user);

    // Sign in the user to get a session
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          company: user.company,
        },
        token: signInData?.session?.access_token,
        refreshToken: signInData?.session?.refresh_token,
        expiresIn: signInData?.session?.expires_in,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     description: Authenticate user using Supabase Auth
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

    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: error.message,
      });
    }

    if (!data.user || !data.session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Authentication failed',
      });
    }

    // Sync/update user in MarketplaceUser table
    const userEmail = data.user.email || email;
    const displayName = data.user.user_metadata?.name || userEmail.split('@')[0];
    const [user, created] = await MarketplaceUser.findOrCreate({
      where: { id: data.user.id },
      defaults: {
        id: data.user.id,
        email: userEmail,
        name: displayName,
        company: data.user.user_metadata?.company,
        phone: data.user.user_metadata?.phone,
        role: resolveRoleFromAppMetadata(data.user),
        lastActiveAt: new Date(),
      },
    });

    if (!created) {
      await user.update({
        email: userEmail,
        name: displayName,
        company: data.user.user_metadata?.company,
        phone: data.user.user_metadata?.phone,
        lastActiveAt: new Date(),
      });
    }

    // Ensure user has an organization (for existing users who don't have one)
    if (!user.organizationId) {
      await createOrganizationForUser(user);
      await user.reload();
    }

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
          verified: data.user.email_confirmed_at !== null,
        },
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Get a new access token using refresh token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid refresh token
 */
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Missing token',
        message: 'Refresh token is required',
      });
    }

    // Refresh with Supabase
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: token,
    });

    if (error || !data.session) {
      return res.status(401).json({
        success: false,
        error: 'Token refresh failed',
        message: error?.message || 'Invalid refresh token',
      });
    }

    res.json({
      success: true,
      data: {
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      error: 'Token refresh failed',
      message: error instanceof Error ? error.message : 'Invalid refresh token',
    });
  }
};

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     description: Returns the authenticated user's profile
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
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const token = authHeader.substring(7);

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: error?.message || 'Token verification failed',
      });
    }

    // Get user from database
    const dbUser = await MarketplaceUser.findByPk(user.id, {
      attributes: { exclude: ['passwordHash'] },
    });

    console.log('📝 Get current user - avatar length:', dbUser?.avatar?.length || 0);

    if (!dbUser) {
      // User exists in Supabase but not in our DB - create them
      const userEmail = user.email || '';
      const newUser = await MarketplaceUser.create({
        id: user.id,
        email: userEmail,
        name: user.user_metadata?.name || userEmail.split('@')[0] || 'User',
        company: user.user_metadata?.company,
        phone: user.user_metadata?.phone,
        role: resolveRoleFromAppMetadata(user),
      });

      // Create an organization for the new user
      await createOrganizationForUser(newUser);
      await newUser.reload();

      // Create a contact record for this user
      await createContactForUser(newUser);

      return res.json({
        success: true,
        data: newUser,
      });
    }

    // Ensure existing user has an organization
    if (!dbUser.organizationId) {
      await createOrganizationForUser(dbUser);
      await dbUser.reload();
    }

    res.json({
      success: true,
      data: dbUser,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile',
    });
  }
};

/**
 * @swagger
 * /api/auth/password:
 *   put:
 *     summary: Change password
 *     description: Update the authenticated user's password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         description: Not authenticated
 */
export const changePassword = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Weak password',
        message: 'New password must be at least 8 characters',
      });
    }

    // Update password via Supabase
    // Note: authenticate middleware already verified the token, Supabase uses its session
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Password change failed',
        message: error.message,
      });
    }

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
    });
  }
};

/**
 * @swagger
 * /api/auth/me:
 *   patch:
 *     summary: Update current user profile
 *     description: Update the authenticated user's profile information
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               company:
 *                 type: string
 *               phone:
 *                 type: string
 *               avatar:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Not authenticated
 */
export const updateProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const { name, company, phone, avatar } = req.body;

    // Build update object with only provided fields
    const updateData: Partial<{
      name: string;
      company: string;
      phone: string;
      avatar: string;
    }> = {};

    if (name !== undefined) updateData.name = name;
    if (company !== undefined) updateData.company = company;
    if (phone !== undefined) updateData.phone = phone;
    if (avatar !== undefined) updateData.avatar = avatar;

    console.log('📝 Update profile request:', {
      userId: req.user.id,
      fields: Object.keys(updateData),
      avatarLength: avatar ? avatar.length : 0,
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update',
      });
    }

    // Update user in database
    const [affectedRows] = await MarketplaceUser.update(updateData, {
      where: { id: req.user.id },
    });

    console.log('📝 Update result:', { affectedRows, userId: req.user.id });

    // Fetch updated user
    const updatedUser = await MarketplaceUser.findByPk(req.user.id, {
      attributes: { exclude: ['passwordHash'] },
    });

    console.log('📝 Updated user avatar length:', updatedUser?.avatar?.length || 0);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout
 *     description: Sign out the current user
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
export const logout = async (req: Request, res: Response) => {
  try {
    await supabase.auth.signOut();
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  }
};

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Send password reset email
 *     description: Send a password reset link to the user's email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reset email sent
 */
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email required',
      });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password`,
    });

    if (error) {
      // Don't reveal if email exists
      console.error('Password reset error:', error);
    }

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent',
    });
  }
};

/**
 * @swagger
 * /api/auth/magic-link:
 *   post:
 *     summary: Verify magic link token and authenticate user
 *     description: |
 *       Verifies a magic link token from email and creates/authenticates the user.
 *       If the user doesn't exist, creates a new account linked to their Fund.
 *       Returns JWT tokens for immediate access.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: The magic link token from the email
 *     responses:
 *       200:
 *         description: Authentication successful
 *       400:
 *         description: Invalid or expired token
 */
export const verifyMagicLink = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token required',
        message: 'Magic link token is required',
      });
    }

    // Verify the token
    const tokenRecord = await MagicLinkToken.verifyToken(token);

    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired token',
        message: 'This link is invalid or has expired. Please request a new magic link.',
      });
    }

    const email = tokenRecord.email;
    const fundId = tokenRecord.fundId;

    // Check if user already exists in MarketplaceUser
    let user = await MarketplaceUser.findOne({ where: { email } });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;

      // Get fund info for user creation
      let fundName = 'Investor';
      let companyName: string | undefined;

      if (fundId) {
        const fund = await Fund.findByPk(fundId);
        if (fund) {
          fundName = fund.name;
          companyName = fund.companyName || fund.name;
        }
      }

      // Generate a random password for Supabase (user won't need it - they'll use magic links)
      const randomPassword = crypto.randomBytes(32).toString('hex');

      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          name: fundName,
          company: companyName,
          role: 'buyer',
          createdViaMagicLink: true,
        },
      });

      if (authError) {
        // If user already exists in Supabase but not in our DB, try to find them
        if (authError.message?.includes('already been registered')) {
          const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
          const supabaseUser = existingUsers?.users?.find(u => u.email === email);

          if (supabaseUser) {
            // Create MarketplaceUser linked to existing Supabase user
            user = await MarketplaceUser.create({
              id: supabaseUser.id,
              email,
              name: fundName,
              company: companyName,
              role: 'buyer',
              fundId: fundId || undefined,
              verified: true,
            });
          } else {
            return res.status(400).json({
              success: false,
              error: 'Account creation failed',
              message: 'Unable to create account. Please try registering manually.',
            });
          }
        } else {
          console.error('Supabase user creation error:', authError);
          return res.status(400).json({
            success: false,
            error: 'Account creation failed',
            message: authError.message,
          });
        }
      } else if (authData.user) {
        // Create MarketplaceUser with Supabase user ID
        user = await MarketplaceUser.create({
          id: authData.user.id,
          email,
          name: fundName,
          company: companyName,
          role: 'buyer',
          fundId: fundId || undefined,
          verified: true,
        });
      }
    } else if (fundId && !user.fundId) {
      // User exists but isn't linked to fund - link them now
      await user.update({ fundId });
    }

    // Create contact for new users
    if (isNewUser && user) {
      await createContactForUser(user);
    }

    if (!user) {
      return res.status(500).json({
        success: false,
        error: 'Account creation failed',
        message: 'Unable to create user account',
      });
    }

    // Mark token as used
    await tokenRecord.markUsed();

    // Generate a session for the user using Supabase admin
    // We'll generate a magic link through Supabase and extract the session
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (signInError || !signInData) {
      console.error('Failed to generate session:', signInError);
      // Still return success but without tokens - user can log in manually
      return res.json({
        success: true,
        message: isNewUser ? 'Account created successfully' : 'Welcome back',
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            company: user.company,
            fundId: user.fundId,
            isNewUser,
          },
          requiresLogin: true,
        },
      });
    }

    // Use the OTP from the magic link to sign in
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: signInData.properties?.hashed_token || '',
      type: 'email',
    });

    if (verifyError || !verifyData.session) {
      // If OTP verification fails, try direct session creation via admin
      // Return partial success - user can complete login on frontend
      return res.json({
        success: true,
        message: isNewUser ? 'Account created successfully' : 'Welcome back',
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            company: user.company,
            fundId: user.fundId,
            isNewUser,
          },
          requiresLogin: true,
        },
      });
    }

    // Update last active
    await user.update({ lastActiveAt: new Date() });

    res.json({
      success: true,
      message: isNewUser ? 'Account created successfully! Welcome to Dispotree.' : 'Welcome back!',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          company: user.company,
          fundId: user.fundId,
          verified: user.verified,
          isNewUser,
        },
        token: verifyData.session.access_token,
        refreshToken: verifyData.session.refresh_token,
        expiresIn: verifyData.session.expires_in,
      },
    });
  } catch (error) {
    console.error('Magic link verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Verification failed',
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

/**
 * @swagger
 * /api/auth/request-magic-link:
 *   post:
 *     summary: Request a new magic link
 *     description: Sends a new magic link to the user's email for passwordless login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Magic link sent (always returns success to prevent enumeration)
 */
export const requestMagicLink = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user or fund exists with this email
    const user = await MarketplaceUser.findOne({ where: { email: normalizedEmail } });
    const fund = await Fund.findOne({ where: { contactEmail: normalizedEmail } });

    if (!user && !fund) {
      // Don't reveal that email doesn't exist
      return res.json({
        success: true,
        message: 'If an account exists with this email, a magic link has been sent',
      });
    }

    // Generate new magic link token
    const tokenRecord = await MagicLinkToken.generateToken({
      email: normalizedEmail,
      fundId: fund?.id || user?.fundId,
      expiresInHours: 24,
    });

    // Send magic link email
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const magicLinkUrl = `${frontendUrl}/auth/magic?token=${tokenRecord.token}`;

    // Use Resend to send email
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const { Resend } = await import('resend');
      const resend = new Resend(resendApiKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'Dispotree <noreply@dispotree.com>';

      await resend.emails.send({
        from: fromEmail,
        to: [normalizedEmail],
        subject: '🔐 Your Dispotree Login Link',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center;">
              <div style="font-size: 28px; font-weight: bold; color: white; margin-bottom: 10px; letter-spacing: 1px;">
                🌳 DISPOTREE
              </div>
              <h1 style="color: white; margin: 0; font-size: 24px;">🔐 Login Link</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <p style="font-size: 16px; color: #374151;">Hi there,</p>
              <p style="font-size: 16px; color: #374151;">Click the button below to securely sign in to your Dispotree account:</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${magicLinkUrl}" style="background: #22c55e; color: white; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Sign In to Dispotree</a>
              </div>

              <p style="font-size: 13px; color: #6b7280; text-align: center;">
                This link expires in 24 hours.
              </p>

              <p style="font-size: 13px; color: #6b7280; margin-top: 30px;">
                If you didn't request this link, you can safely ignore this email.
              </p>
            </div>
            <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
              <p>Dispotree - Real Estate Deal Management</p>
            </div>
          </div>
        `,
      });

      console.log(`📧 Magic link sent to ${normalizedEmail}`);
    } else {
      console.log('Email service not configured - magic link URL:', magicLinkUrl);
    }

    res.json({
      success: true,
      message: 'If an account exists with this email, a magic link has been sent',
    });
  } catch (error) {
    console.error('Request magic link error:', error);
    res.json({
      success: true,
      message: 'If an account exists with this email, a magic link has been sent',
    });
  }
};
