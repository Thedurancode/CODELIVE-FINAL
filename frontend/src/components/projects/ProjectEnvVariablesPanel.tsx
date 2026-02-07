'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Copy,
  Key,
  Loader2,
  Check,
  Lock,
  Triangle,
  RefreshCw,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useProjectEnvVariables,
  useCreateProjectEnvVariable,
  useUpdateProjectEnvVariable,
  useDeleteProjectEnvVariable,
  useGetEnvVariableValue,
  useBulkSyncEnvVariablesToVercel,
} from '@/hooks/use-project-env-variables';
import { toast } from 'sonner';
import type { ProjectEnvVariable } from '@/types';

interface ProjectEnvVariablesPanelProps {
  projectId: string;
  vercelProjectId?: string | null;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export function ProjectEnvVariablesPanel({ projectId, vercelProjectId }: ProjectEnvVariablesPanelProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingVariable, setEditingVariable] = useState<ProjectEnvVariable | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [syncToVercel, setSyncToVercel] = useState(false);
  const [vercelTargets, setVercelTargets] = useState<string[]>(['production', 'preview', 'development']);
  const [revealedValues, setRevealedValues] = useState<Record<number, string>>({});
  const [loadingValues, setLoadingValues] = useState<Record<number, boolean>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: envVariablesData, isLoading } = useProjectEnvVariables(projectId);
  const createEnvVariable = useCreateProjectEnvVariable(projectId);
  const updateEnvVariable = useUpdateProjectEnvVariable(projectId);
  const deleteEnvVariable = useDeleteProjectEnvVariable(projectId);
  const getEnvVariableValue = useGetEnvVariableValue(projectId);
  const bulkSync = useBulkSyncEnvVariablesToVercel(projectId);

  // Extract array from potentially wrapped response
  const envVariables: ProjectEnvVariable[] = Array.isArray(envVariablesData)
    ? envVariablesData
    : ((envVariablesData as any)?.data || []);

  const hasSyncedVars = envVariables?.some(v => v.syncToVercel);

  const handleCreate = async () => {
    if (!name.trim() || !value.trim()) {
      toast.error('Name and value are required');
      return;
    }

    try {
      await createEnvVariable.mutateAsync({
        name: name.trim(),
        value: value.trim(),
        description: description.trim() || undefined,
        syncToVercel,
        vercelTarget: syncToVercel ? vercelTargets : undefined,
      });
      toast.success(syncToVercel ? 'Secret created and synced to Vercel' : 'Secret created');
      setIsCreateDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create environment variable');
    }
  };

  const handleUpdate = async () => {
    if (!editingVariable) return;

    try {
      await updateEnvVariable.mutateAsync({
        envId: editingVariable.id,
        data: {
          name: name.trim() || undefined,
          value: value.trim() || undefined,
          description: description.trim(),
          syncToVercel,
          vercelTarget: syncToVercel ? vercelTargets : undefined,
        },
      });
      toast.success(syncToVercel ? 'Secret updated and synced to Vercel' : 'Secret updated');
      setIsEditDialogOpen(false);
      setEditingVariable(null);
      resetForm();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update environment variable');
    }
  };

  const handleDelete = async (envId: number) => {
    if (!confirm('Delete this environment variable? This cannot be undone.')) return;

    try {
      await deleteEnvVariable.mutateAsync(envId);
      toast.success('Environment variable deleted');
      // Remove from revealed values
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[envId];
        return next;
      });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete environment variable');
    }
  };

  const handleBulkSync = async () => {
    try {
      const result: any = await bulkSync.mutateAsync();
      const data = result?.data || result;
      toast.success(`Synced ${data.synced || 0} variable${(data.synced || 0) !== 1 ? 's' : ''} to Vercel${data.failed > 0 ? ` (${data.failed} failed)` : ''}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sync to Vercel');
    }
  };

  const openEditDialog = (envVar: ProjectEnvVariable) => {
    setEditingVariable(envVar);
    setName(envVar.name);
    setValue(''); // Don't pre-fill value for security
    setDescription(envVar.description || '');
    setSyncToVercel(envVar.syncToVercel || false);
    setVercelTargets(envVar.vercelTarget || ['production', 'preview', 'development']);
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setName('');
    setValue('');
    setDescription('');
    setSyncToVercel(false);
    setVercelTargets(['production', 'preview', 'development']);
  };

  const toggleRevealValue = useCallback(async (envId: number) => {
    if (revealedValues[envId]) {
      // Hide the value
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[envId];
        return next;
      });
    } else {
      // Fetch and reveal the value
      setLoadingValues((prev) => ({ ...prev, [envId]: true }));
      try {
        const result = await getEnvVariableValue.mutateAsync(envId);
        const valueData = (result as any)?.value || (result as any)?.data?.value;
        if (valueData) {
          setRevealedValues((prev) => ({ ...prev, [envId]: valueData }));
        }
      } catch (error: any) {
        toast.error('Failed to reveal value');
      } finally {
        setLoadingValues((prev) => ({ ...prev, [envId]: false }));
      }
    }
  }, [revealedValues, getEnvVariableValue]);

  const copyToClipboard = useCallback(async (envId: number) => {
    // First, get the value if not already revealed
    let valueToCopy = revealedValues[envId];

    if (!valueToCopy) {
      try {
        const result = await getEnvVariableValue.mutateAsync(envId);
        valueToCopy = (result as any)?.value || (result as any)?.data?.value;
      } catch {
        toast.error('Failed to copy value');
        return;
      }
    }

    if (valueToCopy) {
      await navigator.clipboard.writeText(valueToCopy);
      setCopiedId(envId);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, [revealedValues, getEnvVariableValue]);

  // Vercel sync toggle section (shared between create and edit dialogs)
  const VercelSyncSection = () => {
    if (!vercelProjectId) return null;

    return (
      <div className="space-y-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Triangle className="h-4 w-4" />
            <Label className="text-sm font-medium">Sync to Vercel</Label>
          </div>
          <Switch
            checked={syncToVercel}
            onCheckedChange={setSyncToVercel}
          />
        </div>
        {syncToVercel && (
          <div>
            <Label className="text-xs text-muted-foreground">Target Environments</Label>
            <div className="flex gap-4 mt-1.5">
              {(['production', 'preview', 'development'] as const).map((env) => (
                <label key={env} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={vercelTargets.includes(env)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setVercelTargets(prev => [...prev, env]);
                      } else {
                        setVercelTargets(prev => prev.filter(t => t !== env));
                      }
                    }}
                  />
                  <span className="capitalize">{env}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4">
            <Skeleton className="h-4 w-1/4 mb-2" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Lock className="h-4 w-4" />
          {envVariables?.length || 0} Secret{envVariables?.length !== 1 ? 's' : ''}
        </h3>
        <div className="flex items-center gap-2">
          {vercelProjectId && hasSyncedVars && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkSync}
              disabled={bulkSync.isPending}
            >
              {bulkSync.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Sync All to Vercel
            </Button>
          )}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-accent-600 hover:bg-accent-700 text-white">
                <Plus className="h-4 w-4 mr-1" />
                Add Secret
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Add Environment Variable
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label className="text-muted-foreground text-sm">Name *</Label>
                  <Input
                    placeholder="API_KEY"
                    value={name}
                    onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                    className="mt-1 bg-secondary border text-foreground font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use SCREAMING_SNAKE_CASE (e.g., DATABASE_URL)
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Value *</Label>
                  <Textarea
                    placeholder="Your secret value..."
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="mt-1 bg-secondary border text-foreground font-mono min-h-24"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Values are encrypted and stored securely
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Description</Label>
                  <Input
                    placeholder="What is this variable for?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 bg-secondary border text-foreground"
                  />
                </div>
                <VercelSyncSection />
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 border text-foreground"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-300"
                    onClick={handleCreate}
                    disabled={!name.trim() || !value.trim() || createEnvVariable.isPending}
                  >
                    {createEnvVariable.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Secret'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {envVariables && envVariables.length > 0 ? (
        <div className="space-y-2">
          {envVariables.map((envVar) => (
            <Card key={envVar.id} className="bg-secondary/50 border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Key className="h-4 w-4 text-accent-400 shrink-0" />
                      <span className="font-mono font-medium text-foreground">{envVar.name}</span>
                      {envVar.syncToVercel && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400 gap-1">
                                <Triangle className="h-3 w-3" />
                                Vercel
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Synced to: {(envVar.vercelTarget || []).join(', ')}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>

                    {/* Value display */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 flex items-center gap-2 bg-background/50 rounded px-3 py-2 border border-border/50 font-mono text-sm">
                        {loadingValues[envVar.id] ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : revealedValues[envVar.id] ? (
                          <span className="text-foreground break-all">{revealedValues[envVar.id]}</span>
                        ) : (
                          <span className="text-muted-foreground">••••••••••••••••</span>
                        )}
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => toggleRevealValue(envVar.id)}
                              disabled={loadingValues[envVar.id]}
                            >
                              {loadingValues[envVar.id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : revealedValues[envVar.id] ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {revealedValues[envVar.id] ? 'Hide value' : 'Reveal value'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => copyToClipboard(envVar.id)}
                            >
                              {copiedId === envVar.id ? (
                                <Check className="h-4 w-4 text-green-400" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy to clipboard</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {envVar.description && (
                      <p className="text-sm text-muted-foreground mb-2">{envVar.description}</p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{envVar.author?.name || 'Unknown'}</span>
                      <span>•</span>
                      <span>{formatDate(envVar.createdAt)}</span>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-secondary border">
                      <DropdownMenuItem
                        onClick={() => openEditDialog(envVar)}
                        className="text-foreground cursor-pointer"
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => copyToClipboard(envVar.id)}
                        className="text-foreground cursor-pointer"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Value
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(envVar.id)}
                        className="text-red-400 cursor-pointer"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-secondary/50 border">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Key className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No secrets stored</p>
            <p className="text-muted-foreground text-xs">Add environment variables to securely store API keys, passwords, etc.</p>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-card border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Edit Environment Variable
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-muted-foreground text-sm">Name</Label>
              <Input
                placeholder="API_KEY"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                className="mt-1 bg-secondary border text-foreground font-mono"
              />
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">New Value (leave blank to keep current)</Label>
              <Textarea
                placeholder="Enter new value or leave blank..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1 bg-secondary border text-foreground font-mono min-h-24"
              />
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Description</Label>
              <Input
                placeholder="What is this variable for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
            <VercelSyncSection />
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 border text-foreground"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingVariable(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-300"
                onClick={handleUpdate}
                disabled={updateEnvVariable.isPending}
              >
                {updateEnvVariable.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Update Secret'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
