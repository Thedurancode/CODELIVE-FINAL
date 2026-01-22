/**
 * Webhook Settings Component
 *
 * Allows users to configure webhook subscriptions for real-time notifications
 * of platform events (new deal, offer made, compliance issue).
 */

'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useWebhooks,
  useWebhook,
  useWebhookEventTypes,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useRegenerateWebhookSecret,
  useResetWebhook,
  useWebhookDeliveries,
  useRetryDelivery,
  Webhook,
  WebhookDelivery,
} from '@/hooks/use-webhooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  TestTube2,
  Key,
  Copy,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Activity,
  Webhook as WebhookIcon,
} from 'lucide-react';

// =============================================================================
// FORM SCHEMA
// =============================================================================

const webhookFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(1000).optional(),
  url: z.string().url('Must be a valid URL'),
  events: z.array(z.string()).min(1, 'Select at least one event'),
  retryEnabled: z.boolean().optional().default(true),
  maxRetries: z.number().min(0).max(10).optional().default(3),
  timeoutMs: z.number().min(1000).max(60000).optional().default(30000),
});

type WebhookFormData = z.infer<typeof webhookFormSchema>;

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function WebhookSettings() {
  const { data: webhooks, isLoading, error } = useWebhooks({ includeInactive: true });
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WebhookIcon className="h-5 w-5" />
            Webhooks
          </CardTitle>
          <CardDescription>Loading webhooks...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WebhookIcon className="h-5 w-5" />
            Webhooks
          </CardTitle>
          <CardDescription className="text-red-500">
            Failed to load webhooks: {(error as Error).message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <WebhookIcon className="h-5 w-5" />
                Webhooks
              </CardTitle>
              <CardDescription>
                Configure webhooks to receive real-time notifications for platform events
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Webhook
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <WebhookForm
                  onSuccess={() => setIsCreateDialogOpen(false)}
                  onCancel={() => setIsCreateDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {webhooks && webhooks.length > 0 ? (
            <div className="space-y-4">
              {webhooks.map((webhook: Webhook) => (
                <WebhookCard
                  key={webhook.id}
                  webhook={webhook}
                  onSelect={() => setSelectedWebhook(webhook.id)}
                  isSelected={selectedWebhook === webhook.id}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <WebhookIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No webhooks configured</p>
              <p className="text-sm">
                Add a webhook to receive real-time notifications for platform events
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedWebhook && (
        <WebhookDetails
          webhookId={selectedWebhook}
          onClose={() => setSelectedWebhook(null)}
        />
      )}
    </div>
  );
}

// =============================================================================
// WEBHOOK CARD
// =============================================================================

function WebhookCard({
  webhook,
  onSelect,
  isSelected,
}: {
  webhook: Webhook;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const deleteWebhook = useDeleteWebhook();
  const testWebhook = useTestWebhook();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteWebhook.mutateAsync(webhook.id);
      toast.success('Webhook deleted');
    } catch (err) {
      toast.error('Failed to delete webhook');
    }
  };

  const handleTest = async () => {
    try {
      const result = await testWebhook.mutateAsync(webhook.id);
      if (result.delivered) {
        toast.success(`Test delivered in ${result.responseTime}ms`);
      } else {
        toast.error(`Test failed: ${result.error}`);
      }
    } catch (err) {
      toast.error('Failed to send test');
    }
  };

  return (
    <div
      className={`border rounded-lg p-4 transition-colors cursor-pointer ${
        isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">{webhook.name}</h3>
            {webhook.active ? (
              <Badge variant="default" className="bg-green-500">
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
            {!webhook.stats.isHealthy && (
              <Badge variant="destructive">Unhealthy</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{webhook.url}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              {webhook.stats.successRate}% success
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              {webhook.successCount} delivered
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-500" />
              {webhook.failureCount} failed
            </span>
            {webhook.lastDeliveryAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last: {new Date(webhook.lastDeliveryAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {webhook.events.slice(0, 3).map((event) => (
              <Badge key={event} variant="outline" className="text-xs">
                {event}
              </Badge>
            ))}
            {webhook.events.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{webhook.events.length - 3} more
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTest}
            disabled={testWebhook.isPending}
          >
            <TestTube2 className="h-4 w-4" />
          </Button>
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <Edit2 className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <WebhookForm
                webhook={webhook}
                onSuccess={() => setIsEditDialogOpen(false)}
                onCancel={() => setIsEditDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{webhook.name}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-500 hover:bg-red-600"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// WEBHOOK FORM
// =============================================================================

function WebhookForm({
  webhook,
  onSuccess,
  onCancel,
}: {
  webhook?: Webhook;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { data: eventTypes } = useWebhookEventTypes();
  const createWebhook = useCreateWebhook();
  const updateWebhook = useUpdateWebhook();
  const [showSecret, setShowSecret] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(webhookFormSchema),
    defaultValues: {
      name: webhook?.name || '',
      description: webhook?.description || '',
      url: webhook?.url || '',
      events: webhook?.events || [],
      retryEnabled: webhook?.retryEnabled ?? true,
      maxRetries: webhook?.maxRetries ?? 3,
      timeoutMs: webhook?.timeoutMs ?? 30000,
    },
  });

  const onSubmit = async (data: WebhookFormData) => {
    try {
      if (webhook) {
        await updateWebhook.mutateAsync({ id: webhook.id, ...data });
        toast.success('Webhook updated');
      } else {
        const result = await createWebhook.mutateAsync(data);
        setNewSecret(result.secret);
        toast.success('Webhook created');
      }
      if (!newSecret) {
        onSuccess();
      }
    } catch (err) {
      toast.error(`Failed to ${webhook ? 'update' : 'create'} webhook`);
    }
  };

  const toggleEvent = (event: string) => {
    const currentEvents = form.getValues('events');
    if (currentEvents.includes(event)) {
      form.setValue(
        'events',
        currentEvents.filter((e) => e !== event)
      );
    } else {
      form.setValue('events', [...currentEvents, event]);
    }
  };

  const selectAllInCategory = (category: string[]) => {
    const currentEvents = form.getValues('events');
    const newEvents = [...new Set([...currentEvents, ...category])];
    form.setValue('events', newEvents);
  };

  if (newSecret) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            Webhook Created!
          </DialogTitle>
          <DialogDescription>
            Save your webhook secret. It will not be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label className="text-sm font-medium">Webhook Secret</Label>
          <div className="flex items-center gap-2 mt-2">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={newSecret}
              readOnly
              className="font-mono"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(newSecret);
                toast.success('Secret copied to clipboard');
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Use this secret to verify webhook signatures. The signature is sent in the
            X-Webhook-Signature header.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onSuccess}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{webhook ? 'Edit Webhook' : 'Create Webhook'}</DialogTitle>
        <DialogDescription>
          {webhook
            ? 'Update your webhook configuration'
            : 'Configure a new webhook to receive event notifications'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My Webhook"
              {...form.register('name')}
              className={form.formState.errors.name ? 'border-red-500' : ''}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Describe what this webhook is for..."
              {...form.register('description')}
            />
          </div>

          <div>
            <Label htmlFor="url">Webhook URL</Label>
            <Input
              id="url"
              placeholder="https://example.com/webhook"
              {...form.register('url')}
              className={form.formState.errors.url ? 'border-red-500' : ''}
            />
            {form.formState.errors.url && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.url.message}</p>
            )}
          </div>

          <div>
            <Label className="mb-2 block">Events</Label>
            {form.formState.errors.events && (
              <p className="text-xs text-red-500 mb-2">{form.formState.errors.events.message}</p>
            )}
            {eventTypes && (
              <Tabs defaultValue="deal" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="deal">Deal Events</TabsTrigger>
                  <TabsTrigger value="offer">Offer Events</TabsTrigger>
                  <TabsTrigger value="compliance">Compliance Events</TabsTrigger>
                </TabsList>
                <TabsContent value="deal" className="space-y-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectAllInCategory(eventTypes.categories.deal)}
                  >
                    Select All Deal Events
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    {eventTypes.categories.deal.map((event: string) => (
                      <label key={event} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={form.watch('events').includes(event)}
                          onCheckedChange={() => toggleEvent(event)}
                        />
                        {event.replace('deal.', '')}
                      </label>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="offer" className="space-y-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectAllInCategory(eventTypes.categories.offer)}
                  >
                    Select All Offer Events
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    {eventTypes.categories.offer.map((event: string) => (
                      <label key={event} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={form.watch('events').includes(event)}
                          onCheckedChange={() => toggleEvent(event)}
                        />
                        {event.replace('offer.', '')}
                      </label>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="compliance" className="space-y-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectAllInCategory(eventTypes.categories.compliance)}
                  >
                    Select All Compliance Events
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    {eventTypes.categories.compliance.map((event: string) => (
                      <label key={event} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={form.watch('events').includes(event)}
                          onCheckedChange={() => toggleEvent(event)}
                        />
                        {event.replace('compliance.', '')}
                      </label>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="retryEnabled">Automatic Retries</Label>
              <p className="text-xs text-muted-foreground">
                Automatically retry failed deliveries
              </p>
            </div>
            <Switch
              id="retryEnabled"
              checked={form.watch('retryEnabled')}
              onCheckedChange={(checked) => form.setValue('retryEnabled', checked)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createWebhook.isPending || updateWebhook.isPending}
          >
            {(createWebhook.isPending || updateWebhook.isPending) && (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            )}
            {webhook ? 'Save Changes' : 'Create Webhook'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// =============================================================================
// WEBHOOK DETAILS
// =============================================================================

function WebhookDetails({
  webhookId,
  onClose,
}: {
  webhookId: string;
  onClose: () => void;
}) {
  const { data: webhook, isLoading } = useWebhook(webhookId);
  const { data: deliveriesData } = useWebhookDeliveries(webhookId, { limit: 20 });
  const regenerateSecret = useRegenerateWebhookSecret();
  const resetWebhook = useResetWebhook();
  const retryDelivery = useRetryDelivery();
  const [showNewSecret, setShowNewSecret] = useState<string | null>(null);

  const handleRegenerateSecret = async () => {
    try {
      const result = await regenerateSecret.mutateAsync(webhookId);
      setShowNewSecret(result.secret);
      toast.success('Secret regenerated');
    } catch (err) {
      toast.error('Failed to regenerate secret');
    }
  };

  const handleReset = async () => {
    try {
      await resetWebhook.mutateAsync(webhookId);
      toast.success('Webhook reset and re-enabled');
    } catch (err) {
      toast.error('Failed to reset webhook');
    }
  };

  const handleRetry = async (deliveryId: number) => {
    try {
      const result = await retryDelivery.mutateAsync({ webhookId, deliveryId });
      if (result.delivered) {
        toast.success('Retry successful');
      } else {
        toast.error(`Retry failed: ${result.error}`);
      }
    } catch (err) {
      toast.error('Failed to retry delivery');
    }
  };

  if (isLoading || !webhook) {
    return (
      <Card>
        <CardContent className="p-6">Loading webhook details...</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{webhook.name}</CardTitle>
            <CardDescription>{webhook.url}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="deliveries">Delivery Logs</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{webhook.stats.successRate}%</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Total Deliveries</p>
                <p className="text-2xl font-bold">{webhook.stats.totalDeliveries}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Successful</p>
                <p className="text-2xl font-bold text-green-600">{webhook.successCount}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{webhook.failureCount}</p>
              </div>
            </div>

            {webhook.deliveryStats && (
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Delivery Statistics</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Avg Response Time</p>
                    <p className="font-medium">{webhook.deliveryStats.averageResponseTime}ms</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Pending Retries</p>
                    <p className="font-medium">{webhook.deliveryStats.pendingRetries}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Consecutive Failures</p>
                    <p className="font-medium">{webhook.consecutiveFailures}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Health Status</p>
                    <p className="font-medium">
                      {webhook.stats.isHealthy ? (
                        <span className="text-green-600">Healthy</span>
                      ) : (
                        <span className="text-red-600">Unhealthy</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!webhook.active && (
              <div className="p-4 border border-yellow-500 bg-yellow-50 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-700">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-medium">Webhook Disabled</span>
                </div>
                <p className="text-sm text-yellow-600 mt-1">
                  This webhook has been disabled due to consecutive failures.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleReset}
                  disabled={resetWebhook.isPending}
                >
                  Reset and Re-enable
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="deliveries" className="pt-4">
            {deliveriesData && deliveriesData.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Response Time</TableHead>
                    <TableHead>Delivered At</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveriesData.map((delivery: WebhookDelivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell>
                        <Badge variant="outline">{delivery.eventType}</Badge>
                      </TableCell>
                      <TableCell>
                        {delivery.success ? (
                          <Badge className="bg-green-500">
                            {delivery.statusCode}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            {delivery.error || 'Failed'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {delivery.responseTime ? `${delivery.responseTime}ms` : '-'}
                      </TableCell>
                      <TableCell>
                        {new Date(delivery.deliveredAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {!delivery.success && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRetry(delivery.id)}
                            disabled={retryDelivery.isPending}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No deliveries yet
              </p>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 pt-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Webhook Secret</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Use this secret to verify webhook signatures
              </p>
              {showNewSecret ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input type="text" value={showNewSecret} readOnly className="font-mono" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(showNewSecret);
                        toast.success('Secret copied');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-yellow-600">
                    Save this secret - it will not be shown again!
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewSecret(null)}
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Key className="h-4 w-4 mr-2" />
                      Regenerate Secret
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Regenerate Webhook Secret</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will invalidate the current secret. You'll need to update your
                        integration with the new secret.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRegenerateSecret}>
                        Regenerate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Subscribed Events</h4>
              <div className="flex flex-wrap gap-2">
                {webhook.events.map((event: string) => (
                  <Badge key={event} variant="outline">
                    {event}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Configuration</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Retry Enabled</p>
                  <p className="font-medium">{webhook.retryEnabled ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Max Retries</p>
                  <p className="font-medium">{webhook.maxRetries}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Timeout</p>
                  <p className="font-medium">{webhook.timeoutMs}ms</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {new Date(webhook.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
