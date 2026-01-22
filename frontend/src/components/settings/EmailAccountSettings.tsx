'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Mail, CheckCircle2, XCircle, AlertCircle, Trash2, RefreshCw, Eye, EyeOff } from 'lucide-react';
import {
  useUserEmailConfig,
  useSaveEmailConfig,
  useTestEmailConnection,
  useDeleteEmailConfig,
  EMAIL_PRESETS,
  EMAIL_PROVIDER_SETUP,
  EmailPresetKey,
  detectEmailProvider,
} from '@/hooks/use-user-email-config';
import { useSyncEmails } from '@/hooks/use-email-client';
import { formatDistanceToNow } from 'date-fns';
import { AppPasswordGuide, AppPasswordErrorGuide } from './AppPasswordGuide';

const emailConfigSchema = z.object({
  accountEmail: z.string().email('Valid email address required'),
  displayName: z.string().optional(),
  imapHost: z.string().min(1, 'IMAP host is required'),
  imapPort: z.number().min(1).max(65535),
  imapSecure: z.boolean(),
  imapUser: z.string().min(1, 'IMAP username is required'),
  imapPassword: z.string().optional(), // Optional - required only for new configs
  smtpFrom: z.string().email().optional().or(z.literal('')),
});

type EmailConfigFormData = z.infer<typeof emailConfigSchema>;

export function EmailAccountSettings() {
  const [selectedPreset, setSelectedPreset] = useState<EmailPresetKey>('gmail');
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [passwordWarning, setPasswordWarning] = useState<string | null>(null);

  const { data: config, isLoading: configLoading } = useUserEmailConfig();
  const saveConfig = useSaveEmailConfig();
  const testConnection = useTestEmailConnection();
  const deleteConfig = useDeleteEmailConfig();
  const syncEmails = useSyncEmails();

  const form = useForm<EmailConfigFormData>({
    resolver: zodResolver(emailConfigSchema),
    defaultValues: {
      accountEmail: '',
      displayName: '',
      imapHost: EMAIL_PRESETS.gmail.imapHost,
      imapPort: EMAIL_PRESETS.gmail.imapPort,
      imapSecure: EMAIL_PRESETS.gmail.imapSecure,
      imapUser: '',
      imapPassword: '',
      smtpFrom: '',
    },
  });

  // Update form when config loads
  useEffect(() => {
    if (config) {
      const preset = detectEmailProvider(config.accountEmail);
      setSelectedPreset(preset);
      form.reset({
        accountEmail: config.accountEmail,
        displayName: config.displayName || '',
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        imapSecure: config.imapSecure,
        imapUser: config.imapUser,
        imapPassword: '', // Never pre-fill password
        smtpFrom: config.smtpFrom || '',
      });
    }
  }, [config, form]);

  // Handle preset change
  const handlePresetChange = (preset: EmailPresetKey) => {
    setSelectedPreset(preset);
    const presetConfig = EMAIL_PRESETS[preset];
    form.setValue('imapHost', presetConfig.imapHost);
    form.setValue('imapPort', presetConfig.imapPort);
    form.setValue('imapSecure', presetConfig.imapSecure);
  };

  // Handle email change to auto-detect preset
  const handleEmailChange = (email: string) => {
    form.setValue('accountEmail', email);
    form.setValue('imapUser', email); // Usually same as email
    const detected = detectEmailProvider(email);
    if (detected !== selectedPreset) {
      handlePresetChange(detected);
    }
  };

  // Validate password format for selected provider
  const validatePassword = (password: string) => {
    const providerSetup = EMAIL_PROVIDER_SETUP[selectedPreset];
    if (!providerSetup?.passwordFormat?.validate) {
      setPasswordWarning(null);
      return;
    }
    const result = providerSetup.passwordFormat.validate(password);
    setPasswordWarning(result.warning || null);
  };

  // Test connection
  const handleTestConnection = async () => {
    setTestResult(null);
    const values = form.getValues();

    if (!values.imapHost || !values.imapUser || !values.imapPassword) {
      setTestResult({ success: false, error: 'Please fill in all required fields' });
      return;
    }

    try {
      const result = await testConnection.mutateAsync({
        imapHost: values.imapHost,
        imapPort: values.imapPort,
        imapSecure: values.imapSecure,
        imapUser: values.imapUser,
        imapPassword: values.imapPassword,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Connection failed' });
    }
  };

  // Save configuration
  const onSubmit = async (data: EmailConfigFormData) => {
    console.log('[EmailSettings] onSubmit called with data:', data);

    // Password is required for new configs
    if (!config && !data.imapPassword) {
      console.log('[EmailSettings] Password required for new config');
      form.setError('imapPassword', { message: 'Password is required' });
      return;
    }

    try {
      console.log('[EmailSettings] Calling saveConfig.mutateAsync...');
      const result = await saveConfig.mutateAsync({
        accountEmail: data.accountEmail,
        displayName: data.displayName || undefined,
        imapHost: data.imapHost,
        imapPort: data.imapPort,
        imapSecure: data.imapSecure,
        imapUser: data.imapUser,
        imapPassword: data.imapPassword || '', // Empty string if updating without new password
        smtpFrom: data.smtpFrom || undefined,
      });
      console.log('[EmailSettings] Save successful:', result);
    } catch (err) {
      console.error('[EmailSettings] Save error:', err);
    }
  };

  // Log form errors
  const formErrors = form.formState.errors;
  if (Object.keys(formErrors).length > 0) {
    console.log('[EmailSettings] Form validation errors:', formErrors);
  }

  // Handle delete
  const handleDelete = async () => {
    try {
      await deleteConfig.mutateAsync();
      setShowDeleteDialog(false);
      form.reset();
    } catch (err) {
      // Error handled by mutation
    }
  };

  // Handle sync
  const handleSync = async () => {
    try {
      await syncEmails.mutateAsync({});
    } catch (err) {
      // Error handled by mutation
    }
  };

  if (configLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Account
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Account
            </CardTitle>
            <CardDescription>
              Connect your email to sync messages and send emails from the platform
            </CardDescription>
          </div>
          {config && (
            <div className="flex items-center gap-2">
              <Badge variant={config.syncStatus === 'error' ? 'destructive' : 'secondary'}>
                {config.syncStatus === 'syncing' ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Syncing
                  </>
                ) : config.syncStatus === 'error' ? (
                  <>
                    <XCircle className="mr-1 h-3 w-3" />
                    Error
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Connected
                  </>
                )}
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Section */}
        {config && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{config.accountEmail}</p>
                {config.displayName && (
                  <p className="text-sm text-muted-foreground">{config.displayName}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncEmails.isPending || config.syncStatus === 'syncing'}
                >
                  {syncEmails.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Sync Now
                </Button>
                <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Disconnect
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Disconnect Email Account</DialogTitle>
                      <DialogDescription>
                        This will remove your email configuration and stop syncing emails.
                        Your existing synced emails will remain in the database.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={deleteConfig.isPending}
                      >
                        {deleteConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Disconnect
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            {config.lastSyncAt && (
              <p className="text-sm text-muted-foreground">
                Last synced {formatDistanceToNow(new Date(config.lastSyncAt), { addSuffix: true })}
              </p>
            )}
            {config.lastSyncError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{config.lastSyncError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Configuration Form */}
        <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
          console.error('[EmailSettings] Form validation failed:', errors);
        })} className="space-y-4">
          {/* Email Provider Preset */}
          <div className="space-y-2">
            <Label>Email Provider</Label>
            <Select value={selectedPreset} onValueChange={(v) => handlePresetChange(v as EmailPresetKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EMAIL_PRESETS).map(([key, preset]) => (
                  <SelectItem key={key} value={key}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* App Password Guide */}
          {EMAIL_PROVIDER_SETUP[selectedPreset]?.requiresAppPassword && (
            <AppPasswordGuide provider={selectedPreset} />
          )}

          {/* Email Address */}
          <div className="space-y-2">
            <Label htmlFor="accountEmail">Email Address</Label>
            <Input
              id="accountEmail"
              type="email"
              placeholder="your@email.com"
              {...form.register('accountEmail')}
              onChange={(e) => handleEmailChange(e.target.value)}
            />
            {form.formState.errors.accountEmail && (
              <p className="text-sm text-destructive">{form.formState.errors.accountEmail.message}</p>
            )}
          </div>

          {/* Display Name (optional) */}
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name (optional)</Label>
            <Input
              id="displayName"
              placeholder="Your Name"
              {...form.register('displayName')}
            />
          </div>

          {/* IMAP Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="imapHost">IMAP Host</Label>
              <Input
                id="imapHost"
                placeholder="imap.example.com"
                {...form.register('imapHost')}
              />
              {form.formState.errors.imapHost && (
                <p className="text-sm text-destructive">{form.formState.errors.imapHost.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="imapPort">Port</Label>
              <Input
                id="imapPort"
                type="number"
                {...form.register('imapPort', { valueAsNumber: true })}
              />
            </div>
          </div>

          {/* SSL/TLS Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Use SSL/TLS</Label>
              <p className="text-sm text-muted-foreground">Secure connection (recommended)</p>
            </div>
            <Switch
              checked={form.watch('imapSecure')}
              onCheckedChange={(checked) => form.setValue('imapSecure', checked)}
            />
          </div>

          {/* IMAP Username */}
          <div className="space-y-2">
            <Label htmlFor="imapUser">IMAP Username</Label>
            <Input
              id="imapUser"
              placeholder="Usually your email address"
              {...form.register('imapUser')}
            />
            {form.formState.errors.imapUser && (
              <p className="text-sm text-destructive">{form.formState.errors.imapUser.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="imapPassword">
              {config ? 'New Password (leave empty to keep current)' : EMAIL_PROVIDER_SETUP[selectedPreset]?.requiresAppPassword ? 'App Password' : 'Password'}
            </Label>
            <div className="relative">
              <Input
                id="imapPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder={config ? '••••••••' : EMAIL_PROVIDER_SETUP[selectedPreset]?.requiresAppPassword ? 'Paste your App Password here' : 'Enter password'}
                {...form.register('imapPassword', { required: !config })}
                onChange={(e) => {
                  form.setValue('imapPassword', e.target.value);
                  validatePassword(e.target.value);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {form.formState.errors.imapPassword && (
              <p className="text-sm text-destructive">{form.formState.errors.imapPassword.message}</p>
            )}
            {passwordWarning && (
              <p className="text-sm text-amber-600 dark:text-amber-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {passwordWarning}
              </p>
            )}
            {EMAIL_PROVIDER_SETUP[selectedPreset]?.requiresAppPassword && !config && !passwordWarning && (
              <p className="text-sm text-muted-foreground">
                Use the App Password you generated, not your regular {EMAIL_PROVIDER_SETUP[selectedPreset].name} password
              </p>
            )}
          </div>

          {/* SMTP From (optional) */}
          <div className="space-y-2">
            <Label htmlFor="smtpFrom">Send From Address (optional)</Label>
            <Input
              id="smtpFrom"
              type="email"
              placeholder="Leave empty to use account email"
              {...form.register('smtpFrom')}
            />
            <p className="text-sm text-muted-foreground">
              Override the &quot;From&quot; address when sending emails
            </p>
          </div>

          {/* Test Connection Result */}
          {testResult && (
            testResult.success ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Connection successful! Your email settings are correct.
                </AlertDescription>
              </Alert>
            ) : (
              <AppPasswordErrorGuide
                provider={selectedPreset}
                errorMessage={testResult.error}
              />
            )
          )}

          {/* Save Error */}
          {saveConfig.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {saveConfig.error instanceof Error ? saveConfig.error.message : 'Failed to save configuration'}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testConnection.isPending}
            >
              {testConnection.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
            <Button type="submit" disabled={saveConfig.isPending}>
              {saveConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {config ? 'Update Configuration' : 'Connect Email'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
