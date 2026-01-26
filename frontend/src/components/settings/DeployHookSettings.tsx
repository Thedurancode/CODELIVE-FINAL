/**
 * Deploy Hook Settings Component
 *
 * Allows users to configure Vercel/Netlify/custom deploy hooks
 * that trigger when tasks complete or PRs are merged.
 */

'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useDeployHooksByProject,
  useDeployStats,
  useCreateDeployHook,
  useUpdateDeployHook,
  useDeleteDeployHook,
  useToggleDeployHook,
  useTriggerDeployHook,
  useTestDeployHook,
} from '@/hooks/use-deploy-hooks';
import type {
  DeployHook,
  DeployHookProvider,
  DeployTrigger,
  DeployEnvironment,
  PROVIDER_LABELS,
  TRIGGER_LABELS,
  ENVIRONMENT_LABELS,
} from '@/types/deployHook';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Edit2,
  Play,
  TestTube2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Rocket,
  ExternalLink,
  Loader2,
} from 'lucide-react';

// =============================================================================
// FORM SCHEMA
// =============================================================================

const deployHookFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  provider: z.enum(['vercel', 'netlify', 'custom']),
  webhookUrl: z.string().url('Must be a valid URL'),
  environment: z.enum(['preview', 'production']),
  triggers: z.array(z.enum(['task_completed', 'pr_merged', 'manual'])).min(1, 'Select at least one trigger'),
  branchFilter: z.string().optional(),
  labelFilter: z.string().optional(),
});

type DeployHookFormData = z.infer<typeof deployHookFormSchema>;

// =============================================================================
// PROVIDER LABELS
// =============================================================================

const providerLabels: Record<DeployHookProvider, string> = {
  vercel: 'Vercel',
  netlify: 'Netlify',
  custom: 'Custom Webhook',
};

const triggerLabels: Record<DeployTrigger, string> = {
  task_completed: 'Task Completed',
  pr_merged: 'PR Merged',
  manual: 'Manual Only',
};

const environmentLabels: Record<DeployEnvironment, string> = {
  preview: 'Preview',
  production: 'Production',
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface DeployHookSettingsProps {
  projectId: string;
}

export default function DeployHookSettings({ projectId }: DeployHookSettingsProps) {
  const { data: hooks, isLoading, error } = useDeployHooksByProject(projectId);
  const { data: stats } = useDeployStats(projectId);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingHook, setEditingHook] = useState<DeployHook | null>(null);
  const [deletingHookId, setDeletingHookId] = useState<string | null>(null);

  const createMutation = useCreateDeployHook();
  const updateMutation = useUpdateDeployHook();
  const deleteMutation = useDeleteDeployHook();
  const toggleMutation = useToggleDeployHook();
  const triggerMutation = useTriggerDeployHook();
  const testMutation = useTestDeployHook();

  const form = useForm<DeployHookFormData>({
    resolver: zodResolver(deployHookFormSchema),
    defaultValues: {
      name: '',
      provider: 'vercel',
      webhookUrl: '',
      environment: 'preview',
      triggers: ['task_completed'],
      branchFilter: '',
      labelFilter: '',
    },
  });

  // Reset form when dialog opens
  const openCreateDialog = () => {
    form.reset({
      name: '',
      provider: 'vercel',
      webhookUrl: '',
      environment: 'preview',
      triggers: ['task_completed'],
      branchFilter: '',
      labelFilter: '',
    });
    setIsCreateDialogOpen(true);
  };

  // Open edit dialog
  const openEditDialog = (hook: DeployHook) => {
    form.reset({
      name: hook.name,
      provider: hook.provider,
      webhookUrl: hook.webhookUrl,
      environment: hook.environment,
      triggers: hook.triggers,
      branchFilter: hook.branchFilter || '',
      labelFilter: hook.labelFilter || '',
    });
    setEditingHook(hook);
  };

  // Handle form submission
  const onSubmit = async (data: DeployHookFormData) => {
    try {
      if (editingHook) {
        await updateMutation.mutateAsync({
          id: editingHook.id,
          ...data,
          branchFilter: data.branchFilter || null,
          labelFilter: data.labelFilter || null,
        });
        toast.success('Deploy hook updated');
        setEditingHook(null);
      } else {
        await createMutation.mutateAsync({
          projectId,
          ...data,
          branchFilter: data.branchFilter || undefined,
          labelFilter: data.labelFilter || undefined,
        });
        toast.success('Deploy hook created');
        setIsCreateDialogOpen(false);
      }
      form.reset();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deletingHookId) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingHookId, projectId });
      toast.success('Deploy hook deleted');
    } catch (err) {
      toast.error((err as Error).message);
    }
    setDeletingHookId(null);
  };

  // Handle toggle
  const handleToggle = async (id: string) => {
    try {
      await toggleMutation.mutateAsync(id);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Handle manual trigger
  const handleTrigger = async (id: string) => {
    try {
      const result = await triggerMutation.mutateAsync(id);
      if (result.success) {
        toast.success('Deployment triggered', {
          description: result.deploymentUrl ? (
            <a href={result.deploymentUrl} target="_blank" rel="noopener noreferrer" className="underline">
              View deployment
            </a>
          ) : undefined,
        });
      } else {
        toast.error('Deployment failed', { description: result.error });
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Handle test
  const handleTest = async (id: string) => {
    try {
      const result = await testMutation.mutateAsync(id);
      if (result.success) {
        toast.success('Connection test passed', { description: result.message });
      } else {
        toast.error('Connection test failed', { description: result.message });
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Deploy Hooks
          </CardTitle>
          <CardDescription>Loading deploy hooks...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Deploy Hooks
          </CardTitle>
          <CardDescription className="text-red-500">
            Failed to load deploy hooks: {(error as Error).message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Card */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.totalHooks}</div>
              <p className="text-xs text-muted-foreground">Total Hooks</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-500">{stats.activeHooks}</div>
              <p className="text-xs text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.totalDeploys}</div>
              <p className="text-xs text-muted-foreground">Total Deploys</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.overallSuccessRate}%</div>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Hooks List Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                Deploy Hooks
              </CardTitle>
              <CardDescription>
                Automatically trigger deployments when tasks complete or PRs are merged
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Hook
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {hooks && hooks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Triggers</TableHead>
                  <TableHead>Stats</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hooks.map((hook) => (
                  <TableRow key={hook.id}>
                    <TableCell>
                      <div className="font-medium">{hook.name}</div>
                      {hook.branchFilter && (
                        <div className="text-xs text-muted-foreground">
                          Branch: {hook.branchFilter}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{providerLabels[hook.provider]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={hook.environment === 'production' ? 'destructive' : 'secondary'}>
                        {environmentLabels[hook.environment]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {hook.triggers.map((trigger) => (
                          <Badge key={trigger} variant="outline" className="text-xs">
                            {triggerLabels[trigger]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="text-green-500">{hook.successfulDeploys}</span>
                        {' / '}
                        <span className="text-red-500">{hook.failedDeploys}</span>
                        {hook.successRate > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({hook.successRate}%)
                          </span>
                        )}
                      </div>
                      {hook.lastTriggeredAt && (
                        <div className="text-xs text-muted-foreground">
                          Last: {new Date(hook.lastTriggeredAt).toLocaleDateString()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={hook.status === 'active'}
                          onCheckedChange={() => handleToggle(hook.id)}
                          disabled={toggleMutation.isPending}
                        />
                        {hook.consecutiveFailures >= 3 && (
                          <AlertCircle className="h-4 w-4 text-yellow-500" title="Multiple failures" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTest(hook.id)}
                          disabled={testMutation.isPending}
                          title="Test connection"
                        >
                          <TestTube2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTrigger(hook.id)}
                          disabled={triggerMutation.isPending || hook.status !== 'active'}
                          title="Trigger deploy"
                        >
                          {triggerMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(hook)}
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingHookId(hook.id)}
                          className="text-red-500 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Rocket className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No deploy hooks configured</p>
              <p className="text-sm">Add a hook to trigger deployments when tasks complete</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen || !!editingHook}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingHook(null);
            form.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingHook ? 'Edit Deploy Hook' : 'Add Deploy Hook'}
            </DialogTitle>
            <DialogDescription>
              Configure a webhook to trigger deployments on Vercel, Netlify, or a custom endpoint.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Production Deploy" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="vercel">Vercel</SelectItem>
                        <SelectItem value="netlify">Netlify</SelectItem>
                        <SelectItem value="custom">Custom Webhook</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="webhookUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Webhook URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://api.vercel.com/v1/integrations/deploy/..."
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Paste your deploy hook URL from {form.watch('provider') === 'vercel' ? 'Vercel Project Settings' : form.watch('provider') === 'netlify' ? 'Netlify Site Settings' : 'your webhook service'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="environment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Environment</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="preview">Preview</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="triggers"
                render={() => (
                  <FormItem>
                    <FormLabel>Triggers</FormLabel>
                    <FormDescription>
                      When should this hook be triggered?
                    </FormDescription>
                    <div className="space-y-2">
                      {(['task_completed', 'pr_merged', 'manual'] as DeployTrigger[]).map((trigger) => (
                        <FormField
                          key={trigger}
                          control={form.control}
                          name="triggers"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(trigger)}
                                  onCheckedChange={(checked) => {
                                    const current = field.value || [];
                                    if (checked) {
                                      field.onChange([...current, trigger]);
                                    } else {
                                      field.onChange(current.filter((t) => t !== trigger));
                                    }
                                  }}
                                />
                              </FormControl>
                              <Label className="font-normal">{triggerLabels[trigger]}</Label>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="branchFilter"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch Filter (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="feature/*" {...field} />
                    </FormControl>
                    <FormDescription>
                      Only trigger for branches matching this pattern (glob)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setEditingHook(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingHook ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingHookId} onOpenChange={() => setDeletingHookId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deploy Hook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this deploy hook? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
