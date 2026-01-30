'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  FileText,
  ChevronRight,
  Wifi,
  Palette,
  Mail,
  Key,
  Sliders,
  Users,
  Bot,
  Server,
  Shield,
  Settings,
  Tv,
  FileSignature,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { useAppStore } from '@/stores/app-store';
import { toast } from 'sonner';
import EmailSourceSettings from '@/components/settings/EmailSourceSettings';
import { EmailAccountSettings } from '@/components/settings/EmailAccountSettings';
import MCPServersSettings from '@/components/settings/MCPServersSettings';
import TeamManagement from '@/components/settings/TeamManagement';
import { SpriteSettings } from '@/components/settings/SpriteSettings';
import TVDisplaySettings from '@/components/settings/TVDisplaySettings';
import DocuSealSettings from '@/components/settings/DocuSealSettings';
import { cn } from '@/lib/utils';

// Settings sections configuration
const settingsSections = [
  { id: 'connections', label: 'Connections', icon: Wifi },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'tv', label: 'TV Display', icon: Tv },
  { id: 'docuseal', label: 'DocuSeal', icon: FileSignature },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'agents', label: 'AI Agents', icon: Bot },
  { id: 'mcp', label: 'MCP Servers', icon: Server },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'api', label: 'API Keys', icon: Key },
  { id: 'scoring', label: 'Scoring', icon: Sliders },
  { id: 'danger', label: 'Account', icon: Shield },
];

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
  const [activeSection, setActiveSection] = useState('connections');
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

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

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'connections':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Connection Status</h2>
                <p className="text-sm text-muted-foreground">Monitor your service connections</p>
              </div>
              <Button variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh All
              </Button>
            </div>
            <div className="grid gap-3">
              {connections.map((conn) => (
                <div
                  key={conn.name}
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    {conn.connected ? (
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                        <XCircle className="h-5 w-5 text-red-500" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{conn.name}</p>
                      <p className="text-xs text-muted-foreground">Last checked: {conn.lastChecked}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'px-3 py-1',
                      conn.connected
                        ? 'border-green-500/50 text-green-500 bg-green-500/10'
                        : 'border-red-500/50 text-red-500 bg-red-500/10'
                    )}
                  >
                    {conn.connected ? 'Connected' : 'Disconnected'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Appearance</h2>
              <p className="text-sm text-muted-foreground">Customize the look of your application</p>
            </div>

            <div className="space-y-4">
              <Label className="text-base font-medium">Theme</Label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setTheme('light')}
                  className={cn(
                    'p-4 rounded-xl border-2 transition-all',
                    'flex flex-col items-center gap-3',
                    theme === 'light'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <div className="w-16 h-16 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                    <Sun className="h-8 w-8 text-amber-500" />
                  </div>
                  <span className="font-medium">Light</span>
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={cn(
                    'p-4 rounded-xl border-2 transition-all',
                    'flex flex-col items-center gap-3',
                    theme === 'dark'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <div className="w-16 h-16 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                    <Moon className="h-8 w-8 text-blue-400" />
                  </div>
                  <span className="font-medium">Dark</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Notifications</h2>
              <p className="text-sm text-muted-foreground">Manage your notification preferences</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Email for New Deals</p>
                    <p className="text-xs text-muted-foreground">Get notified when new deals are imported</p>
                  </div>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">High-Score Matches (&gt;80%)</p>
                    <p className="text-xs text-muted-foreground">Get notified for excellent matches</p>
                  </div>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </div>
        );

      case 'tv':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">TV Display</h2>
              <p className="text-sm text-muted-foreground">Configure the slideshow for your TV display mode</p>
            </div>
            <TVDisplaySettings />
          </div>
        );

      case 'docuseal':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <FileSignature className="h-5 w-5" />
                DocuSeal
              </h2>
              <p className="text-sm text-muted-foreground">
                Configure DocuSeal e-signature integration for contracts.{' '}
                <a
                  href="https://docuseal.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Learn more <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>
            <DocuSealSettings />
          </div>
        );

      case 'email':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Email Settings</h2>
              <p className="text-sm text-muted-foreground">Configure email accounts and deal sources</p>
            </div>
            <EmailAccountSettings />
            <EmailSourceSettings />
          </div>
        );

      case 'team':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Team Management</h2>
              <p className="text-sm text-muted-foreground">Manage team members and permissions</p>
            </div>
            <TeamManagement />
          </div>
        );

      case 'agents':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">AI Agents (Sprites)</h2>
              <p className="text-sm text-muted-foreground">Configure Claude Code agents for your projects</p>
            </div>
            <SpriteSettings />
          </div>
        );

      case 'mcp':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">MCP Servers</h2>
              <p className="text-sm text-muted-foreground">Configure Model Context Protocol servers</p>
            </div>
            <MCPServersSettings />
          </div>
        );

      case 'templates':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Contract Templates</h2>
              <p className="text-sm text-muted-foreground">Manage state document templates and DocuSeal integrations</p>
            </div>
            <Link href="/settings/templates">
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border/50 hover:bg-muted/70 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Template Administration</p>
                    <p className="text-xs text-muted-foreground">
                      Configure templates, field mappings, and automation triggers
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </Link>
          </div>
        );

      case 'api':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">API Keys & Credentials</h2>
              <p className="text-sm text-muted-foreground">Manage your API keys and service credentials</p>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Key className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-medium">OpenAI API</p>
                    <p className="text-xs text-muted-foreground">GPT-4 and embeddings</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-sm">API Key</Label>
                    <div className="relative">
                      <Input
                        type={showSecrets['openai'] ? 'text' : 'password'}
                        defaultValue="sk-...abcd"
                        className="pr-10"
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
                    <Label className="text-muted-foreground text-sm">Model</Label>
                    <Input defaultValue="gpt-4-turbo" />
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Key className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="font-medium">Pinecone</p>
                    <p className="text-xs text-muted-foreground">Vector database for RAG</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-sm">API Key</Label>
                    <div className="relative">
                      <Input
                        type={showSecrets['pinecone'] ? 'text' : 'password'}
                        defaultValue="pc-...xyz"
                        className="pr-10"
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
                    <Label className="text-muted-foreground text-sm">Index Name</Label>
                    <Input defaultValue="dispotree" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'scoring':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Scoring Settings</h2>
              <p className="text-sm text-muted-foreground">Configure deal scoring and matching parameters</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Sliders className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Use Pinecone Pre-filtering</p>
                    <p className="text-xs text-muted-foreground">Filter buy boxes using semantic search before scoring</p>
                  </div>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-2">
                  <Label className="text-muted-foreground text-sm">Match Threshold (%)</Label>
                  <Input type="number" defaultValue="60" />
                </div>
                <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-2">
                  <Label className="text-muted-foreground text-sm">Pre-filter Top K</Label>
                  <Input type="number" defaultValue="10" />
                </div>
                <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-2">
                  <Label className="text-muted-foreground text-sm">Auto-Submit Delay (s)</Label>
                  <Input type="number" defaultValue="300" />
                </div>
              </div>
            </div>
          </div>
        );

      case 'danger':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Account</h2>
              <p className="text-sm text-muted-foreground">Manage your account settings</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <LogOut className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Sign Out</p>
                    <p className="text-xs text-muted-foreground">Sign out of your account</p>
                  </div>
                </div>
                <Button variant="outline" onClick={handleLogout}>
                  Sign Out
                </Button>
              </div>

              <Separator />

              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="font-medium text-red-500">Danger Zone</p>
                    <p className="text-xs text-muted-foreground">Irreversible actions</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Delete Account</p>
                    <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
                  </div>
                  <Button variant="outline" className="border-red-500/50 text-red-500 hover:bg-red-500/10">
                    Delete Account
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-start justify-center py-6">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 px-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Settings</h1>
              <p className="text-sm text-muted-foreground">Manage your application preferences</p>
            </div>
          </div>
          <Button onClick={handleSave} size="sm">
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>

        {/* Main Content */}
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex min-h-[600px]">
            {/* Sidebar */}
            <div className="w-56 border-r border-border/50 bg-muted/30 p-2">
              <ScrollArea className="h-[600px]">
                <nav className="space-y-1">
                  {settingsSections.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                          'hover:bg-muted/70',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                        <span className="text-sm font-medium">{section.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </ScrollArea>
            </div>

            {/* Content */}
            <div className="flex-1 p-6">
              <ScrollArea className="h-[600px] pr-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeSection}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {renderSectionContent()}
                  </motion.div>
                </AnimatePresence>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
