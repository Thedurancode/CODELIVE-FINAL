'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Mail,
  Plus,
  Settings2,
  Trash2,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Inbox,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useEmailSources,
  useCreateEmailSource,
  useUpdateEmailSource,
  useDeleteEmailSource,
  useTestEmailConnection,
  useToggleEmailSource,
  useTriggerEmailFetch,
  useEmailInbox,
  useEmailInboxSummary,
  type EmailSource,
  type EmailSourceSettings as EmailSettings,
  type EmailInboxItem,
} from '@/hooks/use-email-sources';

interface EmailSourceFormData {
  name: string;
  fetchMethod: 'webhook' | 'imap' | 'gmail_api';
  imapHost: string;
  imapPort: string;
  imapUser: string;
  imapPassword: string;
  imapTls: boolean;
  gmailCredentials: string;
  gmailTokens: string;
  pollIntervalMinutes: string;
  senderFilter: string;
  subjectFilter: string;
  parsingMode: 'ai' | 'template' | 'regex';
  templatePattern: string;
  webhookSecret: string;
}

const defaultFormData: EmailSourceFormData = {
  name: '',
  fetchMethod: 'imap',
  imapHost: '',
  imapPort: '993',
  imapUser: '',
  imapPassword: '',
  imapTls: true,
  gmailCredentials: '',
  gmailTokens: '',
  pollIntervalMinutes: '5',
  senderFilter: '',
  subjectFilter: '',
  parsingMode: 'ai',
  templatePattern: '',
  webhookSecret: '',
};

export default function EmailSourceSettings() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inboxDialogOpen, setInboxDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<EmailSource | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [formData, setFormData] = useState<EmailSourceFormData>(defaultFormData);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [inboxPage, setInboxPage] = useState(1);
  const [inboxStatusFilter, setInboxStatusFilter] = useState<string | undefined>();

  const { data: sources, isLoading: loadingSources } = useEmailSources();
  const createSource = useCreateEmailSource();
  const updateSource = useUpdateEmailSource();
  const deleteSource = useDeleteEmailSource();
  const testConnection = useTestEmailConnection();
  const toggleSource = useToggleEmailSource();
  const triggerFetch = useTriggerEmailFetch();

  const { data: inboxData, isLoading: loadingInbox } = useEmailInbox(
    selectedSourceId || '',
    { page: inboxPage, limit: 10, status: inboxStatusFilter as EmailInboxItem['status'] | undefined }
  );
  const { data: inboxSummary } = useEmailInboxSummary(selectedSourceId || '');

  const handleOpenDialog = (source?: EmailSource) => {
    if (source) {
      setEditingSource(source);
      setFormData({
        name: source.name,
        fetchMethod: source.settings.fetchMethod || 'imap',
        imapHost: source.settings.imapHost || '',
        imapPort: String(source.settings.imapPort || 993),
        imapUser: source.settings.imapUser || '',
        imapPassword: source.settings.imapPassword || '',
        imapTls: source.settings.imapTls !== false,
        gmailCredentials: source.settings.gmailCredentials || '',
        gmailTokens: source.settings.gmailTokens || '',
        pollIntervalMinutes: String(source.settings.pollIntervalMinutes || 5),
        senderFilter: source.settings.senderFilter || '',
        subjectFilter: source.settings.subjectFilter || '',
        parsingMode: source.settings.parsingMode || 'ai',
        templatePattern: source.settings.templatePattern || '',
        webhookSecret: source.settings.webhookSecret || '',
      });
    } else {
      setEditingSource(null);
      setFormData(defaultFormData);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSource(null);
    setFormData(defaultFormData);
  };

  const buildSettings = (): EmailSettings => {
    const settings: EmailSettings = {
      fetchMethod: formData.fetchMethod,
      parsingMode: formData.parsingMode,
      pollIntervalMinutes: parseInt(formData.pollIntervalMinutes) || 5,
    };

    if (formData.senderFilter) settings.senderFilter = formData.senderFilter;
    if (formData.subjectFilter) settings.subjectFilter = formData.subjectFilter;

    if (formData.fetchMethod === 'imap') {
      settings.imapHost = formData.imapHost;
      settings.imapPort = parseInt(formData.imapPort) || 993;
      settings.imapUser = formData.imapUser;
      settings.imapPassword = formData.imapPassword;
      settings.imapTls = formData.imapTls;
    } else if (formData.fetchMethod === 'gmail_api') {
      settings.gmailCredentials = formData.gmailCredentials;
      settings.gmailTokens = formData.gmailTokens;
    } else if (formData.fetchMethod === 'webhook') {
      settings.webhookSecret = formData.webhookSecret;
    }

    if (formData.parsingMode === 'template' || formData.parsingMode === 'regex') {
      settings.templatePattern = formData.templatePattern;
    }

    return settings;
  };

  const handleTestConnection = async () => {
    try {
      const settings = buildSettings();
      const result = await testConnection.mutateAsync(settings);
      if (result.success) {
        toast.success(result.message || 'Connection successful!');
      } else {
        toast.error(result.message || 'Connection failed');
      }
    } catch (error) {
      toast.error('Failed to test connection: ' + (error as Error).message);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a name for the email source');
      return;
    }

    try {
      const settings = buildSettings();

      if (editingSource) {
        await updateSource.mutateAsync({
          sourceId: editingSource.id,
          data: { name: formData.name, settings },
        });
        toast.success('Email source updated successfully');
      } else {
        await createSource.mutateAsync({ name: formData.name, settings });
        toast.success('Email source created successfully');
      }
      handleCloseDialog();
    } catch (error) {
      toast.error('Failed to save: ' + (error as Error).message);
    }
  };

  const handleDelete = async (sourceId: string) => {
    if (!confirm('Are you sure you want to delete this email source?')) return;
    try {
      await deleteSource.mutateAsync(sourceId);
      toast.success('Email source deleted');
    } catch (error) {
      toast.error('Failed to delete: ' + (error as Error).message);
    }
  };

  const handleToggle = async (sourceId: string, enabled: boolean) => {
    try {
      await toggleSource.mutateAsync({ sourceId, enabled });
      toast.success(enabled ? 'Email source enabled' : 'Email source disabled');
    } catch (error) {
      toast.error('Failed to toggle: ' + (error as Error).message);
    }
  };

  const handleTriggerFetch = async (sourceId: string) => {
    try {
      const result = await triggerFetch.mutateAsync(sourceId);
      toast.success(`Fetched ${result.dealsIngested} new deals`);
    } catch (error) {
      toast.error('Failed to fetch: ' + (error as Error).message);
    }
  };

  const openInboxDialog = (sourceId: string) => {
    setSelectedSourceId(sourceId);
    setInboxPage(1);
    setInboxStatusFilter(undefined);
    setInboxDialogOpen(true);
  };

  const getStatusBadge = (status: EmailInboxItem['status']) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50">Success</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50">Failed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">Pending</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">Processing</Badge>;
      case 'skipped':
        return <Badge className="bg-zinc-500/20 text-muted-foreground border-zinc-500/50">Skipped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <>
      <Card className="bg-card border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Deal Sources
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Configure email sources to automatically import deals from your inbox
            </CardDescription>
          </div>
          <Button
            onClick={() => handleOpenDialog()}
            className="bg-accent-600 hover:bg-accent-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Source
          </Button>
        </CardHeader>
        <CardContent>
          {loadingSources ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sources && sources.length > 0 ? (
            <div className="space-y-4">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-zinc-700">
                      <Mail className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{source.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {source.settings.fetchMethod === 'imap' && `IMAP: ${source.settings.imapHost}`}
                        {source.settings.fetchMethod === 'gmail_api' && 'Gmail API'}
                        {source.settings.fetchMethod === 'webhook' && 'Webhook'}
                        {' • '}
                        {source.settings.parsingMode?.toUpperCase() || 'AI'} parsing
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={source.enabled}
                      onCheckedChange={(enabled) => handleToggle(source.id, enabled)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openInboxDialog(source.id)}
                      title="View inbox history"
                    >
                      <Inbox className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleTriggerFetch(source.id)}
                      disabled={!source.enabled || triggerFetch.isPending}
                      title="Fetch emails now"
                    >
                      {triggerFetch.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenDialog(source)}
                      title="Edit source"
                    >
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(source.id)}
                      title="Delete source"
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No email sources configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add an email source to start importing deals automatically
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingSource ? 'Edit Email Source' : 'Add Email Source'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Configure how to fetch and parse emails for deal extraction
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Source Name */}
            <div className="space-y-2">
              <Label className="text-foreground">Source Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Deal Alerts Inbox"
                className="bg-secondary border text-foreground"
              />
            </div>

            {/* Fetch Method */}
            <div className="space-y-2">
              <Label className="text-foreground">Fetch Method</Label>
              <Select
                value={formData.fetchMethod}
                onValueChange={(v) => setFormData({ ...formData, fetchMethod: v as EmailSourceFormData['fetchMethod'] })}
              >
                <SelectTrigger className="bg-secondary border text-foreground w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border">
                  <SelectItem value="imap">IMAP (Direct Server Connection)</SelectItem>
                  <SelectItem value="gmail_api">Gmail API</SelectItem>
                  <SelectItem value="webhook">Webhook (Receive Forwards)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-secondary" />

            {/* IMAP Settings */}
            {formData.fetchMethod === 'imap' && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">IMAP Settings</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">IMAP Server</Label>
                    <Input
                      value={formData.imapHost}
                      onChange={(e) => setFormData({ ...formData, imapHost: e.target.value })}
                      placeholder="imap.gmail.com"
                      className="bg-secondary border text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Port</Label>
                    <Input
                      value={formData.imapPort}
                      onChange={(e) => setFormData({ ...formData, imapPort: e.target.value })}
                      placeholder="993"
                      className="bg-secondary border text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Email Address</Label>
                    <Input
                      value={formData.imapUser}
                      onChange={(e) => setFormData({ ...formData, imapUser: e.target.value })}
                      placeholder="deals@company.com"
                      className="bg-secondary border text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Password / App Password</Label>
                    <div className="relative">
                      <Input
                        type={showPasswords['imap'] ? 'text' : 'password'}
                        value={formData.imapPassword}
                        onChange={(e) => setFormData({ ...formData, imapPassword: e.target.value })}
                        placeholder="••••••••"
                        className="bg-secondary border text-foreground pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7"
                        onClick={() => setShowPasswords({ ...showPasswords, imap: !showPasswords['imap'] })}
                      >
                        {showPasswords['imap'] ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.imapTls}
                    onCheckedChange={(checked) => setFormData({ ...formData, imapTls: checked })}
                  />
                  <Label className="text-muted-foreground">Use TLS/SSL</Label>
                </div>
              </div>
            )}

            {/* Gmail API Settings */}
            {formData.fetchMethod === 'gmail_api' && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">Gmail API Settings</h4>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">OAuth Credentials JSON</Label>
                  <Input
                    value={formData.gmailCredentials}
                    onChange={(e) => setFormData({ ...formData, gmailCredentials: e.target.value })}
                    placeholder="Paste OAuth credentials JSON"
                    className="bg-secondary border text-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get credentials from Google Cloud Console &gt; APIs &gt; Credentials
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">OAuth Tokens JSON</Label>
                  <Input
                    type={showPasswords['gmail'] ? 'text' : 'password'}
                    value={formData.gmailTokens}
                    onChange={(e) => setFormData({ ...formData, gmailTokens: e.target.value })}
                    placeholder="Paste OAuth tokens JSON"
                    className="bg-secondary border text-foreground"
                  />
                </div>
              </div>
            )}

            {/* Webhook Settings */}
            {formData.fetchMethod === 'webhook' && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">Webhook Settings</h4>
                <div className="p-4 rounded-lg bg-secondary/50 border border">
                  <p className="text-sm text-foreground mb-2">Webhook URL:</p>
                  <code className="text-xs text-accent-400 break-all">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/api/plugins/sources/email/webhook
                  </code>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Webhook Secret (Optional)</Label>
                  <Input
                    value={formData.webhookSecret}
                    onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
                    placeholder="Shared secret for verification"
                    className="bg-secondary border text-foreground"
                  />
                </div>
              </div>
            )}

            <Separator className="bg-secondary" />

            {/* Polling & Filtering */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-foreground">Polling & Filtering</h4>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Poll Interval (minutes)</Label>
                  <Input
                    type="number"
                    value={formData.pollIntervalMinutes}
                    onChange={(e) => setFormData({ ...formData, pollIntervalMinutes: e.target.value })}
                    min="1"
                    className="bg-secondary border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Sender Filter (regex)</Label>
                  <Input
                    value={formData.senderFilter}
                    onChange={(e) => setFormData({ ...formData, senderFilter: e.target.value })}
                    placeholder="deals@.*\.com"
                    className="bg-secondary border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Subject Filter (regex)</Label>
                  <Input
                    value={formData.subjectFilter}
                    onChange={(e) => setFormData({ ...formData, subjectFilter: e.target.value })}
                    placeholder=".*deal.*"
                    className="bg-secondary border text-foreground"
                  />
                </div>
              </div>
            </div>

            <Separator className="bg-secondary" />

            {/* Parsing Mode */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-foreground">Parsing Mode</h4>
              <Select
                value={formData.parsingMode}
                onValueChange={(v) => setFormData({ ...formData, parsingMode: v as EmailSourceFormData['parsingMode'] })}
              >
                <SelectTrigger className="bg-secondary border text-foreground w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border">
                  <SelectItem value="ai">AI Extraction (GPT-4o-mini)</SelectItem>
                  <SelectItem value="template">Template-based</SelectItem>
                  <SelectItem value="regex">Regex Pattern</SelectItem>
                </SelectContent>
              </Select>

              {(formData.parsingMode === 'template' || formData.parsingMode === 'regex') && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Pattern Template</Label>
                  <Input
                    value={formData.templatePattern}
                    onChange={(e) => setFormData({ ...formData, templatePattern: e.target.value })}
                    placeholder="Address: {{address}}, Price: {{price}}"
                    className="bg-secondary border text-foreground"
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testConnection.isPending}
              className="border text-foreground"
            >
              {testConnection.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Test Connection
            </Button>
            <Button variant="outline" onClick={handleCloseDialog} className="border text-foreground">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createSource.isPending || updateSource.isPending}
              className="bg-accent-600 hover:bg-accent-700 text-white"
            >
              {(createSource.isPending || updateSource.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingSource ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inbox History Dialog */}
      <Dialog open={inboxDialogOpen} onOpenChange={setInboxDialogOpen}>
        <DialogContent className="bg-card border max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              Email Inbox History
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              View received emails and extracted deals
            </DialogDescription>
          </DialogHeader>

          {/* Summary Stats */}
          {inboxSummary && (
            <div className="grid grid-cols-5 gap-3 py-4">
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-foreground">{inboxSummary.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10 text-center">
                <p className="text-2xl font-bold text-green-400">{inboxSummary.success}</p>
                <p className="text-xs text-muted-foreground">Success</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 text-center">
                <p className="text-2xl font-bold text-red-400">{inboxSummary.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <div className="p-3 rounded-lg bg-yellow-500/10 text-center">
                <p className="text-2xl font-bold text-yellow-400">{inboxSummary.pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <div className="p-3 rounded-lg bg-accent-500/10 text-center">
                <p className="text-2xl font-bold text-accent-400">{inboxSummary.totalDeals}</p>
                <p className="text-xs text-muted-foreground">Deals</p>
              </div>
            </div>
          )}

          {/* Filter */}
          <div className="flex items-center gap-4 pb-2">
            <Label className="text-muted-foreground">Filter by status:</Label>
            <Select
              value={inboxStatusFilter || 'all'}
              onValueChange={(v) => {
                setInboxStatusFilter(v === 'all' ? undefined : v);
                setInboxPage(1);
              }}
            >
              <SelectTrigger className="bg-secondary border text-foreground w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-secondary border">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Inbox Table */}
          <div className="flex-1 overflow-auto">
            {loadingInbox ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : inboxData?.data && inboxData.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Received</TableHead>
                    <TableHead className="text-muted-foreground">From</TableHead>
                    <TableHead className="text-muted-foreground">Subject</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Deals</TableHead>
                    <TableHead className="text-muted-foreground">Mode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inboxData.data.map((email) => (
                    <TableRow key={email.id} className="border hover:bg-secondary/50">
                      <TableCell className="text-foreground text-xs">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {formatDate(email.receivedAt)}
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground text-sm max-w-[150px] truncate">
                        {email.from}
                      </TableCell>
                      <TableCell className="text-foreground text-sm max-w-[200px] truncate">
                        {email.hasPdfAttachment && (
                          <Badge variant="outline" className="mr-2 text-xs">PDF</Badge>
                        )}
                        {email.subject}
                      </TableCell>
                      <TableCell>{getStatusBadge(email.status)}</TableCell>
                      <TableCell className="text-center">
                        {email.dealCount > 0 ? (
                          <Badge className="bg-accent-500/20 text-accent-400 border-accent-500/50">
                            {email.dealCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs uppercase">
                        {email.parsingMode || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8">
                <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No emails found</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {inboxData?.pagination && inboxData.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border">
              <p className="text-sm text-muted-foreground">
                Page {inboxData.pagination.page} of {inboxData.pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInboxPage((p) => Math.max(1, p - 1))}
                  disabled={inboxPage <= 1}
                  className="border text-foreground"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInboxPage((p) => p + 1)}
                  disabled={inboxPage >= inboxData.pagination.totalPages}
                  className="border text-foreground"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
