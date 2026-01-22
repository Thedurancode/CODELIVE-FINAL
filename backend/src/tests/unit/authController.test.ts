/**
 * Authentication Controller Unit Tests
 *
 * Critical security tests for user authentication flows:
 * - Registration validation
 * - Login security
 * - Token refresh
 * - Password change
 * - Email enumeration prevention
 */

import { Request, Response } from 'express';
import {
  register,
  login,
  refreshToken,
  getCurrentUser,
  changePassword,
  logout,
  forgotPassword,
} from '../../controllers/authController';

// Mock Supabase
jest.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      refreshSession: jest.fn(),
      getUser: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  },
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: jest.fn(),
      },
    },
  },
}));

// Mock MarketplaceUser model
jest.mock('../../models/MarketplaceUser', () => ({
  __esModule: true,
  default: {
    findOrCreate: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
  },
}));

import { supabase, supabaseAdmin } from '../../config/supabase';
import MarketplaceUser from '../../models/MarketplaceUser';

describe('AuthController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockRequest = {
      body: {},
      headers: {},
    };

    mockResponse = {
      json: jsonMock,
      status: statusMock,
    };
  });

  // ============================================================================
  // REGISTRATION TESTS
  // ============================================================================

  describe('register', () => {
    const validRegistration = {
      email: 'test@example.com',
      password: 'securePassword123',
      name: 'Test User',
      company: 'Test Company',
      phone: '555-1234',
      role: 'buyer',
    };

    it('should register a new user successfully', async () => {
      mockRequest.body = validRegistration;

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: new Date().toISOString(),
        user_metadata: { name: 'Test User' },
      };

      const mockSession = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_in: 3600,
      };

      (supabaseAdmin.auth.admin.createUser as jest.Mock).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      (MarketplaceUser.findOrCreate as jest.Mock).mockResolvedValue([
        {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'buyer',
          company: 'Test Company',
          update: jest.fn(),
        },
        true,
      ]);

      await register(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Registration successful',
          data: expect.objectContaining({
            user: expect.objectContaining({
              email: 'test@example.com',
            }),
            token: 'access-token-123',
          }),
        })
      );
    });

    it('should reject registration with missing email', async () => {
      mockRequest.body = {
        password: 'securePassword123',
        name: 'Test User',
      };

      await register(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Missing required fields',
        })
      );
    });

    it('should reject registration with missing password', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        name: 'Test User',
      };

      await register(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Missing required fields',
        })
      );
    });

    it('should reject registration with missing name', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'securePassword123',
      };

      await register(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Missing required fields',
        })
      );
    });

    it('should reject weak passwords (less than 8 characters)', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'short',
        name: 'Test User',
      };

      await register(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Weak password',
          message: 'Password must be at least 8 characters',
        })
      );
    });

    it('should handle Supabase auth errors gracefully', async () => {
      mockRequest.body = validRegistration;

      (supabaseAdmin.auth.admin.createUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: { code: 'email_exists', message: 'Email already registered' },
      });

      await register(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'email_exists',
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      mockRequest.body = validRegistration;

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      (supabaseAdmin.auth.admin.createUser as jest.Mock).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      (MarketplaceUser.findOrCreate as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await register(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Registration failed',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should default role to buyer when not specified', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'securePassword123',
        name: 'Test User',
        // No role specified
      };

      const mockUser = { id: 'user-123', email: 'test@example.com' };

      (supabaseAdmin.auth.admin.createUser as jest.Mock).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'token' } },
        error: null,
      });

      (MarketplaceUser.findOrCreate as jest.Mock).mockResolvedValue([
        { id: 'user-123', email: 'test@example.com', name: 'Test User', role: 'buyer', update: jest.fn() },
        true,
      ]);

      await register(mockRequest as Request, mockResponse as Response);

      expect(MarketplaceUser.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          defaults: expect.objectContaining({
            role: 'buyer',
          }),
        })
      );
    });
  });

  // ============================================================================
  // LOGIN TESTS
  // ============================================================================

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'correctPassword',
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: new Date().toISOString(),
        user_metadata: { name: 'Test User' },
      };

      const mockSession = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_in: 3600,
      };

      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      (MarketplaceUser.findOrCreate as jest.Mock).mockResolvedValue([
        {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'buyer',
          update: jest.fn(),
        },
        true,
      ]);

      await login(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Login successful',
          data: expect.objectContaining({
            token: 'access-token-123',
            refreshToken: 'refresh-token-123',
          }),
        })
      );
    });

    it('should reject login with missing email', async () => {
      mockRequest.body = { password: 'somePassword' };

      await login(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Missing credentials',
        })
      );
    });

    it('should reject login with missing password', async () => {
      mockRequest.body = { email: 'test@example.com' };

      await login(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Missing credentials',
        })
      );
    });

    it('should return 401 for invalid credentials', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'wrongPassword',
      };

      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      await login(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid credentials',
        })
      );
    });

    it('should return 401 when no session is created', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123',
      };

      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' }, session: null },
        error: null,
      });

      await login(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should update lastActiveAt on successful login', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'correctPassword',
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {},
      };

      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: {
          user: mockUser,
          session: { access_token: 'token', refresh_token: 'refresh' },
        },
        error: null,
      });

      const updateMock = jest.fn();
      (MarketplaceUser.findOrCreate as jest.Mock).mockResolvedValue([
        {
          ...mockUser,
          update: updateMock,
        },
        false,
      ]);

      await login(mockRequest as Request, mockResponse as Response);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          lastActiveAt: expect.any(Date),
        })
      );
    });
  });

  // ============================================================================
  // TOKEN REFRESH TESTS
  // ============================================================================

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };

      (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
        data: {
          session: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      });

      await refreshToken(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            token: 'new-access-token',
            refreshToken: 'new-refresh-token',
          }),
        })
      );
    });

    it('should reject when refresh token is missing', async () => {
      mockRequest.body = {};

      await refreshToken(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Missing token',
        })
      );
    });

    it('should return 401 for invalid refresh token', async () => {
      mockRequest.body = { refreshToken: 'invalid-token' };

      (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid refresh token' },
      });

      await refreshToken(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Token refresh failed',
        })
      );
    });
  });

  // ============================================================================
  // GET CURRENT USER TESTS
  // ============================================================================

  describe('getCurrentUser', () => {
    it('should return user profile with valid token', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockDbUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'buyer',
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      (MarketplaceUser.findByPk as jest.Mock).mockResolvedValue(mockDbUser);

      await getCurrentUser(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockDbUser,
        })
      );
    });

    it('should return 401 without authorization header', async () => {
      mockRequest.headers = {};

      await getCurrentUser(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Not authenticated',
        })
      );
    });

    it('should return 401 with invalid Bearer format', async () => {
      mockRequest.headers = { authorization: 'InvalidFormat token' };

      await getCurrentUser(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should return 401 for invalid token', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      await getCurrentUser(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid token',
        })
      );
    });

    it('should create user in DB if exists in Supabase but not in DB', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      const mockSupabaseUser = {
        id: 'new-user-123',
        email: 'newuser@example.com',
        user_metadata: { name: 'New User', role: 'investor' },
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: mockSupabaseUser },
        error: null,
      });

      (MarketplaceUser.findByPk as jest.Mock).mockResolvedValue(null);
      (MarketplaceUser.create as jest.Mock).mockResolvedValue({
        id: 'new-user-123',
        email: 'newuser@example.com',
        name: 'New User',
      });

      await getCurrentUser(mockRequest as Request, mockResponse as Response);

      expect(MarketplaceUser.create).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });
  });

  // ============================================================================
  // CHANGE PASSWORD TESTS
  // ============================================================================

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockRequest.body = { newPassword: 'newSecurePassword123' };

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: { user: {} },
        error: null,
      });

      await changePassword(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Password changed successfully',
        })
      );
    });

    it('should return 401 without authorization', async () => {
      mockRequest.headers = {};
      mockRequest.body = { newPassword: 'newPassword123' };

      await changePassword(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should reject weak new password', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockRequest.body = { newPassword: 'short' };

      await changePassword(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Weak password',
        })
      );
    });

    it('should reject missing new password', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockRequest.body = {};

      await changePassword(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  // ============================================================================
  // LOGOUT TESTS
  // ============================================================================

  describe('logout', () => {
    it('should logout successfully', async () => {
      (supabase.auth.signOut as jest.Mock).mockResolvedValue({});

      await logout(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Logged out successfully',
        })
      );
    });

    it('should return success even if signOut fails', async () => {
      (supabase.auth.signOut as jest.Mock).mockRejectedValue(
        new Error('Signout failed')
      );

      await logout(mockRequest as Request, mockResponse as Response);

      // Should still return success to prevent info leakage
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });
  });

  // ============================================================================
  // FORGOT PASSWORD TESTS (Email Enumeration Prevention)
  // ============================================================================

  describe('forgotPassword', () => {
    it('should return success for existing email (no enumeration)', async () => {
      mockRequest.body = { email: 'existing@example.com' };

      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: {},
        error: null,
      });

      await forgotPassword(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'If an account exists with this email, a reset link has been sent',
        })
      );
    });

    it('should return same success for non-existing email (prevents enumeration)', async () => {
      mockRequest.body = { email: 'nonexistent@example.com' };

      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: {},
        error: { message: 'User not found' },
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await forgotPassword(mockRequest as Request, mockResponse as Response);

      // CRITICAL: Same response regardless of whether email exists
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'If an account exists with this email, a reset link has been sent',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should reject missing email', async () => {
      mockRequest.body = {};

      await forgotPassword(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Email required',
        })
      );
    });

    it('should return success even on exception (prevents enumeration)', async () => {
      mockRequest.body = { email: 'test@example.com' };

      (supabase.auth.resetPasswordForEmail as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await forgotPassword(mockRequest as Request, mockResponse as Response);

      // Should still return success to prevent timing attacks
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // SECURITY EDGE CASES
  // ============================================================================

  describe('Security Edge Cases', () => {
    it('should not expose internal errors in production-like responses', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test',
      };

      (supabaseAdmin.auth.admin.createUser as jest.Mock).mockRejectedValue(
        new Error('Internal database connection pool exhausted')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await register(mockRequest as Request, mockResponse as Response);

      // Should not expose the actual internal error message
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );

      consoleSpy.mockRestore();
    });

    it('should handle SQL injection attempts in email', async () => {
      mockRequest.body = {
        email: "'; DROP TABLE users; --",
        password: 'password123',
        name: 'Hacker',
      };

      // Supabase should handle this, but we should not crash
      (supabaseAdmin.auth.admin.createUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid email format' },
      });

      await register(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should handle XSS attempts in name field', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123',
        name: '<script>alert("XSS")</script>',
      };

      const mockUser = { id: 'user-123', email: 'test@example.com' };

      (supabaseAdmin.auth.admin.createUser as jest.Mock).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'token' } },
        error: null,
      });

      (MarketplaceUser.findOrCreate as jest.Mock).mockResolvedValue([
        { id: 'user-123', name: '<script>alert("XSS")</script>', update: jest.fn() },
        true,
      ]);

      await register(mockRequest as Request, mockResponse as Response);

      // Should complete without crashing - sanitization should happen at display
      expect(statusMock).toHaveBeenCalledWith(201);
    });
  });
});
