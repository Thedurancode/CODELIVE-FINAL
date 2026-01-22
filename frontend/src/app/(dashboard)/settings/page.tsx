'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Save,
  RefreshCw,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Sun,
  Moon,
  AlertTriangle,
  LogOut,
  Bell,
  BellOff,
  FileText,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useAppStore } from '@/stores/app-store';
import { toast } from 'sonner';
import EmailSourceSettings from '@/components/settings/EmailSourceSettings';
import { EmailAccountSettings } from '@/components/settings/EmailAccountSettings';
import ProxyPicsOrders from '@/components/settings/ProxyPicsOrders';
import MCPServersSettings from '@/components/settings/MCPServersSettings';
import TeamManagement from '@/components/settings/TeamManagement';
import { SpriteSettings } from '@/components/settings/SpriteSettings';
import {
  isPushSupported,
  isSubscribedToPush,
  enablePushNotifications,
  unsubscribeFromPush,
  getNotificationPermission,
} from '@/lib/push-notifications';

const connections = [
  { name: 'PostgreSQL Database', connected: true, lastChecked: 'Just now' },
  { name: 'Pinecone Vector DB', connected: true, lastChecked: 'Just now' },
  { name: 'OpenAI API', connected: true, lastChecked: 'Just now' },
  { name: 'Zillow API', connected: false, lastChecked: '5 min ago' },
  { name: 'Email Server (IMAP)', connected: false, lastChecked: 'Never' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useAppStore();
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [pushLoading, setPushLoading] = useState(false);

  // Check push notification status on mount
  useEffect(() => {
    const checkPushStatus = async () => {
      const supported = isPushSupported();
      setPushSupported(supported);
      setPushPermission(getNotificationPermission());

      if (supported) {
        const subscribed = await isSubscribedToPush();
        setPushEnabled(subscribed);
      }
    };
    checkPushStatus();
  }, []);

  const handlePushToggle = async (enabled: boolean) => {
    setPushLoading(true);
    try {
      if (enabled) {
        const success = await enablePushNotifications();
        if (success) {
          setPushEnabled(true);
          setPushPermission('granted');
          toast.success('Push notifications enabled');
        } else {
          toast.error('Failed to enable push notifications. Check browser permissions.');
        }
      } else {
        const success = await unsubscribeFromPush();
        if (success) {
          setPushEnabled(false);
          toast.success('Push notifications disabled');
        }
      }
    } catch (error) {
      toast.error('Failed to update push notification settings');
    } finally {
      setPushLoading(false);
    }
  };

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    toast.success('Settings saved successfully');
  };

  const handleLogout = () => {
    localStorage.removeItem('dispotree_token');
    document.cookie = 'dispotree_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    toast.success('Logged out successfully');
    router.push('/login');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your application settings</p>
        </div>
        <Button onClick={handleSave} className="bg-accent-600 hover:bg-accent-700 text-white">
          <Save className="mr-2 h-4 w-4" />
          Save Changes
        </Button>
      </div>

      {/* Connection Status */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-card-foreground">Connection Status</CardTitle>
            <CardDescription className="text-muted-foreground">
              Monitor your service connections
            </CardDescription>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {connections.map((conn) => (
              <div
                key={conn.name}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
              >
                <div className="flex items-center gap-2">
                  {conn.connected ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{conn.name}</p>
                    <p className="text-xs text-muted-foreground">{conn.lastChecked}</p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    conn.connected
                      ? 'border-green-500/50 text-green-500'
                      : 'border-red-500/50 text-red-500'
                  }
                >
                  {conn.connected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Contract Templates Admin */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Contract Templates</CardTitle>
          <CardDescription className="text-muted-foreground">
            Manage state document templates and DocuSeal integrations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings/templates">
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary/70 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-accent-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">Template Administration</p>
                  <p className="text-xs text-muted-foreground">
                    Configure templates, field mappings, and automation triggers
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </Link>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Appearance</CardTitle>
          <CardDescription className="text-muted-foreground">
            Customize the look of your application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? (
                <Moon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Sun className="h-5 w-5 text-amber-500" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">Theme</p>
                <p className="text-xs text-muted-foreground">Toggle between dark and light mode</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('dark')}
                className={theme === 'dark' ? 'bg-accent-600' : ''}
              >
                Dark
              </Button>
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('light')}
                className={theme === 'light' ? 'bg-accent-600' : ''}
              >
                Light
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Account */}
      <EmailAccountSettings />

      {/* Email Deal Sources */}
      <EmailSourceSettings />

      {/* ProxyPics Orders */}
      <ProxyPicsOrders />

      {/* MCP Servers */}
      <MCPServersSettings />

      {/* Claude Sprites */}
      <SpriteSettings />

      {/* Team Management */}
      <TeamManagement />

      {/* API Keys */}
      <Accordion type="single" collapsible className="space-y-4">
        <AccordionItem value="api-keys" className="border border-border rounded-lg bg-card">
          <AccordionTrigger className="px-6 text-foreground hover:no-underline">
            API Keys & Credentials
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">OpenAI API Key</Label>
                  <div className="relative">
                    <Input
                      type={showSecrets['openai'] ? 'text' : 'password'}
                      defaultValue="sk-...abcd"
                      className="bg-secondary border-border text-foreground pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => toggleSecret('openai')}
                    >
                      {showSecrets['openai'] ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Model</Label>
                  <Input
                    defaultValue="gpt-4-turbo"
                    className="bg-secondary border-border text-foreground"
                  />
                </div>
              </div>

              <Separator className="bg-border" />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Pinecone API Key</Label>
                  <div className="relative">
                    <Input
                      type={showSecrets['pinecone'] ? 'text' : 'password'}
                      defaultValue="pc-...xyz"
                      className="bg-secondary border-border text-foreground pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => toggleSecret('pinecone')}
                    >
                      {showSecrets['pinecone'] ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Index Name</Label>
                  <Input
                    defaultValue="dispotree"
                    className="bg-secondary border-border text-foreground"
                  />
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="scoring" className="border border-border rounded-lg bg-card">
          <AccordionTrigger className="px-6 text-foreground hover:no-underline">
            Scoring Settings
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Use Pinecone Pre-filtering</p>
                  <p className="text-xs text-muted-foreground">
                    Filter buy boxes using semantic search before scoring
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Match Threshold (%)</Label>
                  <Input
                    type="number"
                    defaultValue="60"
                    className="bg-secondary border-border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Pre-filter Top K</Label>
                  <Input
                    type="number"
                    defaultValue="10"
                    className="bg-secondary border-border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Auto-Submit Delay (s)</Label>
                  <Input
                    type="number"
                    defaultValue="300"
                    className="bg-secondary border-border text-foreground"
                  />
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="notifications" className="border border-border rounded-lg bg-card">
          <AccordionTrigger className="px-6 text-foreground hover:no-underline">
            Notifications
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-4">
              {/* Push Notifications */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {pushEnabled ? (
                    <Bell className="h-5 w-5 text-accent-500" />
                  ) : (
                    <BellOff className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">Push notifications</p>
                    <p className="text-xs text-muted-foreground">
                      {!pushSupported
                        ? 'Not supported in this browser'
                        : pushPermission === 'denied'
                        ? 'Blocked by browser - check site permissions'
                        : 'Get notified when you receive new messages'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={pushEnabled}
                  onCheckedChange={handlePushToggle}
                  disabled={!pushSupported || pushPermission === 'denied' || pushLoading}
                />
              </div>

              <Separator className="bg-border" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Email for new deals</p>
                  <p className="text-xs text-muted-foreground">Get notified when new deals are imported</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">High-score matches (&gt;80%)</p>
                  <p className="text-xs text-muted-foreground">Get notified for excellent matches</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Slack notifications</p>
                  <p className="text-xs text-muted-foreground">Send notifications to Slack channel</p>
                </div>
                <Switch />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Danger Zone */}
      <Card className="bg-card border-red-900/50">
        <CardHeader>
          <CardTitle className="text-red-500 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Sign Out</p>
              <p className="text-xs text-muted-foreground">
                Sign out of your account
              </p>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
          <Separator className="bg-border" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Delete Account</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete your account and all data
              </p>
            </div>
            <Button variant="outline" className="border-red-700 text-red-500 hover:bg-red-900/20">
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
