/**
 * Vercel Project Panel
 *
 * Manages Vercel project linking and deployments within the project detail page.
 * Environment variables are managed in the Secrets tab via ProjectEnvVariablesPanel.
 */

'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useVercelStatus,
  useVercelProjects,
  useVercelProject,
  useCreateVercelProject,
  useVercelDeployments,
  useCreateVercelDeployment,
  useVercelDomains,
  useAddVercelDomain,
  useRemoveVercelDomain,
  useVerifyVercelDomain,
} from '@/hooks/use-vercel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Checkbox } from '@/components/ui/checkbox';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Plus,
  Rocket,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Triangle,
  AlertCircle,
  Link2,
  Cloud,
  Play,
  Key,
  Globe,
  Trash2,
  RefreshCw,
  Copy,
} from 'lucide-react';
import {
  FRAMEWORK_LABELS,
  DEPLOYMENT_STATE_LABELS,
} from '@/types/vercel';
import type { VercelProject, VercelDomain } from '@/types/vercel';

// ============================================================================
// SCHEMAS
// ============================================================================

const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  framework: z.string().optional(),
  buildCommand: z.string().optional(),
  installCommand: z.string().optional(),
  rootDirectory: z.string().optional(),
  linkGitHub: z.boolean().default(true),
});

type CreateProjectFormData = z.infer<typeof createProjectSchema>;

// ============================================================================
// HELPERS
// ============================================================================

function DeploymentStatusIcon({ state }: { state: string }) {
  switch (state) {
    case 'READY':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'ERROR':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'BUILDING':
    case 'QUEUED':
    case 'INITIALIZING':
      return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
    case 'CANCELED':
      return <XCircle className="h-4 w-4 text-gray-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-gray-400" />;
  }
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface VercelProjectPanelProps {
  projectId: string;
  githubUrl?: string | null;
  vercelProjectId?: string | null;
  onVercelLinked?: (vercelProjectId: string) => void;
}

export function VercelProjectPanel({
  projectId,
  githubUrl,
  vercelProjectId: initialVercelProjectId,
  onVercelLinked,
}: VercelProjectPanelProps) {
  const [linkedVercelId, setLinkedVercelId] = useState<string | null>(initialVercelProjectId || null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);

  const { data: status, isLoading: statusLoading } = useVercelStatus();
  const { data: vercelProjects } = useVercelProjects();
  const { data: linkedProject } = useVercelProject(linkedVercelId);
  const { data: deployments } = useVercelDeployments(linkedVercelId, 8);

  const createMutation = useCreateVercelProject();
  const deployMutation = useCreateVercelDeployment();
  const { data: domains, isLoading: domainsLoading } = useVercelDomains(linkedVercelId);
  const addDomainMutation = useAddVercelDomain();
  const removeDomainMutation = useRemoveVercelDomain();
  const verifyDomainMutation = useVerifyVercelDomain();

  // Parse GitHub repo from URL (e.g., "https://github.com/owner/repo" → "owner/repo")
  const githubRepo = githubUrl
    ? githubUrl.replace('https://github.com/', '').replace('.git', '').replace(/\/$/, '')
    : null;

  const createForm = useForm<CreateProjectFormData>({
    resolver: zodResolver(createProjectSchema) as any,
    defaultValues: {
      name: '',
      framework: 'nextjs',
      linkGitHub: true,
    },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // NOT CONFIGURED
  // ──────────────────────────────────────────────────────────────────────────

  if (statusLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status?.configured) {
    return (
      <Card className="border-dashed">
        <CardContent className="text-center py-8">
          <Triangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Vercel Not Configured</p>
          <p className="text-sm text-muted-foreground mt-1">
            Set the <code className="text-xs bg-muted px-1 py-0.5 rounded">VERCEL_TOKEN</code> environment variable on the backend to enable Vercel integration.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREATE PROJECT
  // ──────────────────────────────────────────────────────────────────────────

  const handleCreate = async (data: CreateProjectFormData) => {
    try {
      const project = await createMutation.mutateAsync({
        name: data.name,
        framework: data.framework || undefined,
        buildCommand: data.buildCommand || undefined,
        installCommand: data.installCommand || undefined,
        rootDirectory: data.rootDirectory || undefined,
        gitRepository: data.linkGitHub && githubRepo
          ? { repo: githubRepo, type: 'github' }
          : undefined,
      });

      setLinkedVercelId(project.id);
      onVercelLinked?.(project.id);
      toast.success(`Vercel project "${project.name}" created`);
      setIsCreateDialogOpen(false);
      createForm.reset();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // LINK EXISTING PROJECT
  // ──────────────────────────────────────────────────────────────────────────

  const handleLink = (project: VercelProject) => {
    setLinkedVercelId(project.id);
    onVercelLinked?.(project.id);
    toast.success(`Linked to "${project.name}"`);
    setIsLinkDialogOpen(false);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // DEPLOY
  // ──────────────────────────────────────────────────────────────────────────

  const handleDeploy = async (target: 'production' | 'preview' = 'production') => {
    if (!linkedVercelId) return;
    try {
      const deployment = await deployMutation.mutateAsync({
        projectId: linkedVercelId,
        target,
      });
      toast.success('Deployment triggered', {
        description: deployment.url ? (
          <a href={`https://${deployment.url}`} target="_blank" rel="noopener noreferrer" className="underline">
            View deployment
          </a>
        ) : undefined,
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // NO PROJECT LINKED
  // ──────────────────────────────────────────────────────────────────────────

  if (!linkedVercelId) {
    return (
      <>
        <Card className="border-dashed">
          <CardContent className="text-center py-8">
            <Triangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="font-medium">No Vercel Project Linked</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create a new Vercel project or link an existing one.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => {
                createForm.reset({
                  name: '',
                  framework: 'nextjs',
                  linkGitHub: !!githubRepo,
                });
                setIsCreateDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
              <Button variant="outline" onClick={() => setIsLinkDialogOpen(true)}>
                <Link2 className="h-4 w-4 mr-2" />
                Link Existing
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <CreateProjectDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          form={createForm}
          onSubmit={handleCreate}
          isPending={createMutation.isPending}
          githubRepo={githubRepo}
        />

        {/* Link Dialog */}
        <LinkProjectDialog
          open={isLinkDialogOpen}
          onOpenChange={setIsLinkDialogOpen}
          projects={vercelProjects || []}
          onLink={handleLink}
        />
      </>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PROJECT LINKED — FULL VIEW
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Project Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Triangle className="h-5 w-5" />
              <div>
                <CardTitle className="text-base">
                  {linkedProject?.name || linkedVercelId}
                </CardTitle>
                {linkedProject?.framework && (
                  <CardDescription>
                    {FRAMEWORK_LABELS[linkedProject.framework] || linkedProject.framework}
                    {linkedProject.link && (
                      <span className="ml-2">
                        &middot; {linkedProject.link.org}/{linkedProject.link.repo}
                      </span>
                    )}
                  </CardDescription>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleDeploy('production')}
                disabled={deployMutation.isPending}
              >
                {deployMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4 mr-2" />
                )}
                Deploy
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`https://vercel.com/${linkedProject?.name || linkedVercelId}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLinkedVercelId(null);
                  onVercelLinked?.('');
                }}
              >
                Unlink
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Deployments */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Recent Deployments</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeploy('preview')}
              disabled={deployMutation.isPending}
            >
              <Play className="h-3 w-3 mr-1" />
              Preview Deploy
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {deployments && deployments.length > 0 ? (
            <div className="space-y-2">
              {deployments.map((d) => (
                <div
                  key={d.uid}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <DeploymentStatusIcon state={d.readyState || d.state} />
                    <div>
                      <div className="text-sm font-medium">
                        {d.url ? (
                          <a
                            href={`https://${d.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {d.url.length > 50 ? d.url.substring(0, 50) + '...' : d.url}
                          </a>
                        ) : (
                          'Deployment'
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {timeAgo(d.created)}
                        {d.target && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {d.target}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      (d.readyState || d.state) === 'READY'
                        ? 'border-green-500 text-green-500'
                        : (d.readyState || d.state) === 'ERROR'
                        ? 'border-red-500 text-red-500'
                        : 'border-yellow-500 text-yellow-500'
                    }`}
                  >
                    {DEPLOYMENT_STATE_LABELS[d.readyState || d.state] || d.state}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No deployments yet</p>
          )}
        </CardContent>
      </Card>

      {/* Domains */}
      <DomainsCard
        projectId={linkedVercelId}
        domains={domains || []}
        isLoading={domainsLoading}
        addDomainMutation={addDomainMutation}
        removeDomainMutation={removeDomainMutation}
        verifyDomainMutation={verifyDomainMutation}
      />

      {/* Env vars note */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <Key className="h-3 w-3" />
        <span>Manage environment variables in the <strong>Secrets</strong> tab. Enable &quot;Sync to Vercel&quot; on any secret to push it here.</span>
      </div>

      {/* Create Dialog */}
      <CreateProjectDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        form={createForm}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
        githubRepo={githubRepo}
      />

      {/* Link Dialog */}
      <LinkProjectDialog
        open={isLinkDialogOpen}
        onOpenChange={setIsLinkDialogOpen}
        projects={vercelProjects || []}
        onLink={handleLink}
      />
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function CreateProjectDialog({
  open,
  onOpenChange,
  form,
  onSubmit,
  isPending,
  githubRepo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: any;
  onSubmit: (data: CreateProjectFormData) => void;
  isPending: boolean;
  githubRepo: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Vercel Project</DialogTitle>
          <DialogDescription>
            Create a new project on Vercel{githubRepo ? ` linked to ${githubRepo}` : ''}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="my-project" {...field} />
                  </FormControl>
                  <FormDescription>
                    URL-safe name for the Vercel project
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="framework"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Framework</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Auto-detect" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(FRAMEWORK_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {githubRepo && (
              <FormField
                control={form.control}
                name="linkGitHub"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2 space-y-0 rounded-md border p-3">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div>
                      <FormLabel className="font-normal">Link GitHub Repository</FormLabel>
                      <FormDescription className="text-xs">
                        Connect to <code className="bg-muted px-1 rounded">{githubRepo}</code> for automatic deployments
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="buildCommand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Build Command (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="npm run build" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rootDirectory"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Root Directory (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="frontend" {...field} />
                  </FormControl>
                  <FormDescription>
                    Subdirectory containing the app (for monorepos)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function LinkProjectDialog({
  open,
  onOpenChange,
  projects,
  onLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: VercelProject[];
  onLink: (project: VercelProject) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Link Vercel Project</DialogTitle>
          <DialogDescription>
            Select an existing Vercel project to link.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {projects.length > 0 ? (
            projects.map((project) => (
              <button
                key={project.id}
                onClick={() => onLink(project)}
                className="w-full flex items-center justify-between p-3 rounded-md border hover:bg-muted transition-colors text-left"
              >
                <div>
                  <div className="font-medium text-sm">{project.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {project.framework ? FRAMEWORK_LABELS[project.framework] || project.framework : 'No framework'}
                    {project.link && ` \u00B7 ${project.link.org}/${project.link.repo}`}
                  </div>
                </div>
                <Link2 className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Cloud className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No Vercel projects found</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DomainsCard({
  projectId,
  domains,
  isLoading,
  addDomainMutation,
  removeDomainMutation,
  verifyDomainMutation,
}: {
  projectId: string;
  domains: VercelDomain[];
  isLoading: boolean;
  addDomainMutation: ReturnType<typeof useAddVercelDomain>;
  removeDomainMutation: ReturnType<typeof useRemoveVercelDomain>;
  verifyDomainMutation: ReturnType<typeof useVerifyVercelDomain>;
}) {
  const [showAddInput, setShowAddInput] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [domainToRemove, setDomainToRemove] = useState<string | null>(null);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  const handleAddDomain = async () => {
    if (!newDomainName.trim()) return;
    try {
      await addDomainMutation.mutateAsync({
        projectId,
        name: newDomainName.trim(),
      });
      toast.success(`Domain "${newDomainName}" added`);
      setNewDomainName('');
      setShowAddInput(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    try {
      await removeDomainMutation.mutateAsync({ projectId, domain });
      toast.success(`Domain "${domain}" removed`);
      setDomainToRemove(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleVerifyDomain = async (domain: string) => {
    try {
      const result = await verifyDomainMutation.mutateAsync({ projectId, domain });
      if ((result as any)?.verified) {
        toast.success(`Domain "${domain}" verified!`);
      } else {
        toast.info(`DNS not yet propagated for "${domain}". Check your records.`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Domains
            </CardTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAddInput(!showAddInput)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Domain
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Inline Add Domain Input */}
          {showAddInput && (
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="example.com"
                value={newDomainName}
                onChange={(e) => setNewDomainName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddDomain();
                  if (e.key === 'Escape') {
                    setShowAddInput(false);
                    setNewDomainName('');
                  }
                }}
                autoFocus
                className="text-sm"
              />
              <Button
                size="sm"
                onClick={handleAddDomain}
                disabled={addDomainMutation.isPending || !newDomainName.trim()}
              >
                {addDomainMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Add'
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowAddInput(false);
                  setNewDomainName('');
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Domain List */}
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : domains.length > 0 ? (
            <div className="space-y-2">
              {domains.map((d) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">
                          <a
                            href={`https://${d.name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {d.name}
                          </a>
                        </div>
                        {d.gitBranch && (
                          <div className="text-xs text-muted-foreground">
                            Branch: {d.gitBranch}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          d.verified
                            ? 'border-green-500 text-green-500'
                            : 'border-yellow-500 text-yellow-500'
                        }`}
                      >
                        {d.verified ? 'Verified' : 'Pending DNS'}
                      </Badge>
                      {!d.verified && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() =>
                              setExpandedDomain(
                                expandedDomain === d.name ? null : d.name
                              )
                            }
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            <span className="text-xs">DNS</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => handleVerifyDomain(d.name)}
                            disabled={verifyDomainMutation.isPending}
                          >
                            {verifyDomainMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => setDomainToRemove(d.name)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* DNS Verification Instructions (expanded) */}
                  {expandedDomain === d.name && d.verification && d.verification.length > 0 && (
                    <Alert className="mt-2 ml-7">
                      <AlertDescription>
                        <p className="text-xs font-medium mb-2">
                          Add the following DNS record to verify this domain:
                        </p>
                        {d.verification.map((v, i) => (
                          <div
                            key={i}
                            className="bg-muted rounded p-2 text-xs font-mono space-y-1 mb-2 last:mb-0"
                          >
                            <div className="flex items-center justify-between">
                              <span>
                                <strong>Type:</strong> {v.type}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="break-all">
                                <strong>Name:</strong> {v.domain}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 px-1 shrink-0"
                                onClick={() => copyToClipboard(v.domain)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="break-all">
                                <strong>Value:</strong> {v.value}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 px-1 shrink-0"
                                onClick={() => copyToClipboard(v.value)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            {v.reason && (
                              <div className="text-muted-foreground mt-1">
                                {v.reason}
                              </div>
                            )}
                          </div>
                        ))}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom domains configured
            </p>
          )}
        </CardContent>
      </Card>

      {/* Remove Domain Confirmation */}
      <AlertDialog
        open={!!domainToRemove}
        onOpenChange={(open) => !open && setDomainToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Domain</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{domainToRemove}</strong>?
              This will remove the domain from your Vercel project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => domainToRemove && handleRemoveDomain(domainToRemove)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeDomainMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
