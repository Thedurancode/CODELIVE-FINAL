import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
export interface UserEmailConfig {
  id: string;
  userId: string;
  accountEmail: string;
  displayName?: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  smtpFrom?: string;
  isActive: boolean;
  lastSyncAt?: string;
  lastSyncError?: string;
  syncStatus: 'idle' | 'syncing' | 'error';
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailConfigInput {
  accountEmail: string;
  displayName?: string;
  imapHost: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUser: string;
  imapPassword: string;
  smtpFrom?: string;
}

export interface TestConnectionInput {
  imapHost: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUser: string;
  imapPassword: string;
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  mailboxes?: string[];
}

// Email provider presets
export const EMAIL_PRESETS = {
  gmail: {
    name: 'Gmail',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    notes: 'Use an App Password if 2FA is enabled',
  },
  outlook: {
    name: 'Outlook / Office 365',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    notes: 'Use your Microsoft account credentials',
  },
  yahoo: {
    name: 'Yahoo Mail',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecure: true,
    notes: 'Generate an App Password in Yahoo Account Security',
  },
  icloud: {
    name: 'iCloud Mail',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    notes: 'Use an app-specific password from appleid.apple.com',
  },
  custom: {
    name: 'Custom IMAP Server',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    notes: 'Enter your mail server details',
  },
} as const;

// App password format validation
export interface PasswordValidation {
  expectedLength: number;
  formatDescription: string;
  formatExample: string;
  validate: (password: string) => { valid: boolean; warning?: string };
}

// App password setup instructions for each provider
export const EMAIL_PROVIDER_SETUP = {
  gmail: {
    name: 'Gmail',
    requiresAppPassword: true,
    appPasswordUrl: 'https://myaccount.google.com/apppasswords',
    helpUrl: 'https://support.google.com/accounts/answer/185833',
    steps: [
      'Go to your Google Account at myaccount.google.com',
      'Select "Security" from the left menu',
      'Under "Signing in to Google", enable 2-Step Verification if not already enabled',
      'Go back to Security and select "App passwords"',
      'Select "Mail" as the app and your device type',
      'Click "Generate" and copy the 16-character password',
    ],
    passwordFormat: {
      expectedLength: 16,
      formatDescription: '16 lowercase letters (no spaces)',
      formatExample: 'abcdefghijklmnop',
      validate: (password: string) => {
        const cleaned = password.replace(/\s/g, '').toLowerCase();
        if (cleaned.length === 0) return { valid: true };
        if (password.includes(' ') && cleaned.length === 16) {
          return { valid: false, warning: 'Remove the spaces from your App Password' };
        }
        if (cleaned.length < 16 && cleaned.length > 0) {
          return { valid: false, warning: `App Password should be 16 characters (currently ${cleaned.length})` };
        }
        if (cleaned.length > 16) {
          return { valid: false, warning: 'This looks like your regular password. Use the 16-character App Password instead.' };
        }
        if (!/^[a-z]+$/.test(cleaned)) {
          return { valid: false, warning: 'Gmail App Passwords only contain lowercase letters' };
        }
        return { valid: true };
      },
    } as PasswordValidation,
  },
  outlook: {
    name: 'Outlook / Microsoft 365',
    requiresAppPassword: true,
    appPasswordUrl: 'https://account.live.com/proofs/AppPassword',
    helpUrl: 'https://support.microsoft.com/en-us/account-billing/using-app-passwords-with-apps-that-don-t-support-two-step-verification-5896ed9b-4263-e681-128a-a6f2979a7944',
    steps: [
      'Go to your Microsoft Account Security page',
      'Select "Advanced security options"',
      'Under "App passwords", select "Create a new app password"',
      'Copy the generated password (it will only be shown once)',
      'Use this password instead of your regular Microsoft password',
    ],
    passwordFormat: {
      expectedLength: 16,
      formatDescription: '16 characters',
      formatExample: 'abcdefghijklmnop',
      validate: (password: string) => {
        const cleaned = password.replace(/\s/g, '');
        if (cleaned.length === 0) return { valid: true };
        if (cleaned.length < 16 && cleaned.length > 0) {
          return { valid: false, warning: `App Password should be 16 characters (currently ${cleaned.length})` };
        }
        if (cleaned.length > 20) {
          return { valid: false, warning: 'This looks like your regular password. Use the App Password instead.' };
        }
        return { valid: true };
      },
    } as PasswordValidation,
  },
  yahoo: {
    name: 'Yahoo Mail',
    requiresAppPassword: true,
    appPasswordUrl: 'https://login.yahoo.com/account/security/app-passwords',
    helpUrl: 'https://help.yahoo.com/kb/generate-third-party-passwords-sln15241.html',
    steps: [
      'Sign in to your Yahoo Account Security page',
      'Scroll to "App passwords" section',
      'Click "Generate app password"',
      'Select "Other App" and enter "CodeLive"',
      'Click "Generate" and copy the password',
    ],
    passwordFormat: {
      expectedLength: 16,
      formatDescription: '16 characters',
      formatExample: 'abcdefghijklmnop',
      validate: (password: string) => {
        const cleaned = password.replace(/\s/g, '');
        if (cleaned.length === 0) return { valid: true };
        if (cleaned.length > 20) {
          return { valid: false, warning: 'This looks like your regular password. Use the App Password instead.' };
        }
        return { valid: true };
      },
    } as PasswordValidation,
  },
  icloud: {
    name: 'iCloud Mail',
    requiresAppPassword: true,
    appPasswordUrl: 'https://appleid.apple.com/account/manage',
    helpUrl: 'https://support.apple.com/en-us/HT204397',
    steps: [
      'Sign in to appleid.apple.com',
      'Go to "Sign-In and Security"',
      'Select "App-Specific Passwords"',
      'Click the "+" button to generate a new password',
      'Name it "CodeLive" and click "Create"',
      'Copy the password shown (you won\'t see it again)',
    ],
    passwordFormat: {
      expectedLength: 19,
      formatDescription: '19 characters with dashes (xxxx-xxxx-xxxx-xxxx)',
      formatExample: 'abcd-efgh-ijkl-mnop',
      validate: (password: string) => {
        if (password.length === 0) return { valid: true };
        // iCloud app passwords are formatted as xxxx-xxxx-xxxx-xxxx (19 chars with dashes)
        const cleaned = password.replace(/-/g, '');
        if (cleaned.length > 20) {
          return { valid: false, warning: 'This looks like your regular password. Use the App-Specific Password instead.' };
        }
        return { valid: true };
      },
    } as PasswordValidation,
  },
  custom: {
    name: 'Custom IMAP Server',
    requiresAppPassword: false,
    appPasswordUrl: '',
    helpUrl: '',
    steps: [
      'Enter your IMAP server hostname (e.g., mail.example.com)',
      'Use the correct port (usually 993 for SSL/TLS)',
      'Enter your email username and password',
      'Contact your email administrator if you have connection issues',
    ],
    passwordFormat: null,
  },
} as const;

export type EmailProviderKey = keyof typeof EMAIL_PROVIDER_SETUP;

export type EmailPresetKey = keyof typeof EMAIL_PRESETS;

/**
 * Fetch current user's email configuration
 */
export function useUserEmailConfig() {
  return useQuery({
    queryKey: ['user-email-config'],
    queryFn: async (): Promise<UserEmailConfig | null> => {
      const response = await api.get<UserEmailConfig | null>('/api/email-client/config');
      return response;
    },
  });
}

/**
 * Save email configuration (create or update)
 */
export function useSaveEmailConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: EmailConfigInput): Promise<UserEmailConfig> => {
      const response = await api.post<UserEmailConfig>('/api/email-client/config', config);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-email-config'] });
      queryClient.invalidateQueries({ queryKey: ['email-client-status'] });
    },
  });
}

/**
 * Test IMAP connection with provided credentials
 */
export function useTestEmailConnection() {
  return useMutation({
    mutationFn: async (config: TestConnectionInput): Promise<TestConnectionResult> => {
      const response = await api.post<TestConnectionResult>('/api/email-client/config/test', config);
      return response;
    },
  });
}

/**
 * Delete email configuration
 */
export function useDeleteEmailConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      await api.delete('/api/email-client/config');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-email-config'] });
      queryClient.invalidateQueries({ queryKey: ['email-client-status'] });
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['email-unread-counts'] });
    },
  });
}

/**
 * Helper to detect email provider from email address
 */
export function detectEmailProvider(email: string): EmailPresetKey {
  const domain = email.split('@')[1]?.toLowerCase();

  if (!domain) return 'custom';

  if (domain.includes('gmail') || domain.includes('googlemail')) {
    return 'gmail';
  }

  // Check for Microsoft domains - be specific to avoid false positives (e.g., "codelive.ai")
  if (
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain === 'msn.com' ||
    domain.endsWith('.outlook.com') ||
    domain.endsWith('.hotmail.com') ||
    domain.endsWith('.live.com') ||
    domain.includes('office365')
  ) {
    return 'outlook';
  }

  if (domain.includes('yahoo') || domain.includes('ymail')) {
    return 'yahoo';
  }

  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') {
    return 'icloud';
  }

  return 'custom';
}
