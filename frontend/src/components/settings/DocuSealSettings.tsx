'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, RefreshCw, CheckCircle, XCircle, FileSignature, Eye, EyeOff, Key } from 'lucide-react';
import { useSettingsByCategory, useUpdateSetting, type Setting } from '@/hooks/use-settings';

export default function DocuSealSettings() {
  const { data: settingsData, isLoading, error, refetch } = useSettingsByCategory('docuseal');
  const updateSetting = useUpdateSetting();

  // Extract settings array (handle both array and wrapped response)
  const settings = Array.isArray(settingsData) ? settingsData : (settingsData?.data || []);

  // Local state for form
  const [apiUrl, setApiUrl] = useState('https://api.docuseal.com');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [hasUrlChanges, setHasUrlChanges] = useState(false);
  const [hasKeyChanges, setHasKeyChanges] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Initialize form from settings
  useEffect(() => {
    if (settings && settings.length > 0) {
      const urlSetting = settings.find((s: Setting) => s.key === 'docuseal.apiUrl');
      const enabledSetting = settings.find((s: Setting) => s.key === 'docuseal.enabled');
      const keySetting = settings.find((s: Setting) => s.key === 'docuseal.apiKey');

      if (urlSetting?.value) setApiUrl(urlSetting.value);
      if (enabledSetting?.value !== undefined) setEnabled(enabledSetting.value);
      if (keySetting?.value) setApiKey(keySetting.value);
    }
  }, [settings]);

  const handleUrlChange = (value: string) => {
    setApiUrl(value);
    setHasUrlChanges(true);
    setTestStatus('idle');
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setHasKeyChanges(true);
  };

  const handleEnabledChange = async (value: boolean) => {
    setEnabled(value);
    try {
      await updateSetting.mutateAsync({ key: 'docuseal.enabled', value });
      toast.success(value ? 'DocuSeal enabled' : 'DocuSeal disabled');
    } catch (err) {
      toast.error('Failed to update setting');
      setEnabled(!value); // Revert
    }
  };

  const handleSaveUrl = async () => {
    setIsSavingUrl(true);
    try {
      await updateSetting.mutateAsync({ key: 'docuseal.apiUrl', value: apiUrl });
      setHasUrlChanges(false);
      toast.success('DocuSeal API URL saved');
      refetch();
    } catch (err: any) {
      console.error('Failed to save URL:', err);
      const errorMessage = err?.message || 'Unknown error';
      toast.error(`Failed to save API URL: ${errorMessage}`);
    } finally {
      setIsSavingUrl(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    setIsSavingKey(true);
    try {
      await updateSetting.mutateAsync({ key: 'docuseal.apiKey', value: apiKey });
      setHasKeyChanges(false);
      toast.success('DocuSeal API Key saved');
      refetch();
    } catch (err: any) {
      console.error('Failed to save API key:', err);
      const errorMessage = err?.message || 'Unknown error';
      toast.error(`Failed to save API key: ${errorMessage}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleTest = async () => {
    setTestStatus('testing');
    try {
      // Test the connection via our backend which has the API key
      const res = await fetch('/api/docuseal/templates', {
        method: 'GET',
        credentials: 'include',
      });

      if (res.ok) {
        setTestStatus('success');
        toast.success('Connection successful - API key is valid');
      } else if (res.status === 401) {
        setTestStatus('error');
        toast.error('Invalid API key');
      } else {
        setTestStatus('error');
        toast.error('Connection failed');
      }
    } catch (err) {
      setTestStatus('error');
      toast.error('Connection failed - check the URL and API key');
    }
  };

  const maskApiKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <p className="text-muted-foreground">Failed to load settings</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enable/Disable Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Integration Status
          </CardTitle>
          <CardDescription>Enable or disable DocuSeal e-signature integration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>DocuSeal Integration</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, you can create and manage contracts for your projects
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={enabled ? 'default' : 'secondary'}>
                {enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Switch
                checked={enabled}
                onCheckedChange={handleEnabledChange}
                disabled={updateSetting.isPending}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Key Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Key
          </CardTitle>
          <CardDescription>
            Enter your DocuSeal API key. You can find this in your DocuSeal dashboard under Settings → API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="Enter your DocuSeal API key"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <Button
                onClick={handleSaveApiKey}
                disabled={!hasKeyChanges || isSavingKey}
              >
                {isSavingKey ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Key
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your API key is stored securely and used for server-side API calls only.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* API URL Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">API Endpoint URL</CardTitle>
          <CardDescription>
            Configure the DocuSeal API endpoint. Use the default for DocuSeal Cloud, or enter your
            self-hosted instance URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiUrl">API URL</Label>
            <div className="flex gap-2">
              <Input
                id="apiUrl"
                type="url"
                value={apiUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://api.docuseal.com"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testStatus === 'testing' || !apiUrl || !apiKey}
                title={!apiKey ? 'Save an API key first to test the connection' : 'Test connection'}
              >
                {testStatus === 'testing' ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : testStatus === 'success' ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : testStatus === 'error' ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  'Test'
                )}
              </Button>
              <Button
                onClick={handleSaveUrl}
                disabled={!hasUrlChanges || isSavingUrl}
              >
                {isSavingUrl ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save URL
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Default: https://api.docuseal.com (DocuSeal Cloud)
            </p>
          </div>

          {/* Quick URLs */}
          <div className="pt-4 border-t">
            <Label className="text-sm">Quick Set</Label>
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUrlChange('https://api.docuseal.com')}
              >
                DocuSeal Cloud
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUrlChange('http://localhost:3003')}
              >
                Local Dev
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="space-y-3 text-sm">
            <p className="font-medium">About DocuSeal</p>
            <p className="text-muted-foreground">
              DocuSeal is an open-source document e-signature platform. You can use the cloud-hosted
              version or self-host your own instance for full control over your data.
            </p>
            <div className="flex gap-4 pt-2">
              <a
                href="https://www.docuseal.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-xs"
              >
                Documentation →
              </a>
              <a
                href="https://www.docuseal.com/sign_up"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-xs"
              >
                Get API Key →
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
