/**
 * Better Auth Configuration
 *
 * Session-based authentication with 4 roles: admin, team_member, client, contact
 */

import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables early
dotenv.config();

console.log('[Better Auth] Initializing with DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('[Better Auth] NODE_ENV:', process.env.NODE_ENV);

// Build connection URL from environment
const getDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const user = process.env.DB_USER || 'dispotree_user';
  const password = process.env.DB_PASSWORD || 'dev_password';
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'dispotree_db';

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
};

// Create PostgreSQL connection pool for Better Auth
const dbUrl = getDatabaseUrl();
console.log('[Better Auth] Database URL prefix:', dbUrl.slice(0, 30) + '...');

// Don't override SSL if connection string specifies sslmode
const useSSL = process.env.NODE_ENV === 'production' && !dbUrl.includes('sslmode=disable');
console.log('[Better Auth] SSL enabled:', useSSL);

const pool = new Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
});

// Test pool connection
pool.query('SELECT 1')
  .then(() => console.log('[Better Auth] Database pool connected successfully'))
  .catch((err: Error) => console.error('[Better Auth] Database pool connection failed:', err.message));

/**
 * Better Auth instance
 *
 * Features:
 * - Email/password authentication
 * - Session-based auth (cookies)
 * - 4 roles: admin, team_member, client, contact
 * - bcrypt password hashing (compatible with existing users)
 */
export const auth = betterAuth({
  database: pool,

  // Email/password configuration
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Use bcrypt for password hashing (compatible with existing passwordHash column)
    password: {
      hash: async (password: string) => {
        return bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }: { hash: string; password: string }) => {
        return bcrypt.compare(password, hash);
      },
    },
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minute cache
    },
  },

  // Cookie configuration
  advanced: {
    cookiePrefix: 'codelive',
    crossSubDomainCookies: {
      enabled: process.env.NODE_ENV === 'production',
    },
  },

  // Base URL for API
  baseURL: process.env.BACKEND_URL || 'http://localhost:3001',
  basePath: '/api/auth',

  // Trusted origins for CORS
  trustedOrigins: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:3001',
  ],

  // Secret for signing tokens
  secret: process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET || 'dev-secret-change-in-production',

  // Plugins
  plugins: [
    admin({
      defaultRole: 'team_member',
    }),
  ],

  // User model configuration
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'team_member',
        input: false, // Don't allow setting via API
      },
    },
  },
});

// Export types
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;

// Valid roles for the application
export const VALID_ROLES = ['admin', 'team_member', 'client', 'contact'] as const;
export type Role = (typeof VALID_ROLES)[number];

/**
 * Check if a role is valid
 */
export const isValidRole = (role: string): role is Role => {
  return VALID_ROLES.includes(role as Role);
};

export default auth;
