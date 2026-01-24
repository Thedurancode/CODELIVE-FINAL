'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  MoreHorizontal,
  FolderKanban,
  AlertCircle,
  RefreshCw,
  Github,
  Calendar,
  Clock,
  Users,
  StickyNote,
  ListTodo,
  ExternalLink,
  Play,
  Pause,
  CheckCircle2,
  Archive,
  XCircle,
  Bot,
  CirclePlus,
  Loader2,
  Share2,
  Copy,
  Check,
  CircleDot,
  MonitorDown,
  Code2,
  UserPlus,
  Link2,
  Trash2 as TrashIcon,
  Mail,
  MailCheck,
} from 'lucide-react';
import { useProject, useUpdateProject, useDeleteProject } from '@/hooks/use-projects';
import { useCreateGitHubIssue, useGitHubIssues, useGitHubCommits, useGitHubPullRequests, parseGitHubUrl } from '@/hooks/use-github-repo';
import { useGitHubCollaboratorAccess } from '@/hooks/use-github';
import { useProjectClients, useGenerateInvite, useRevokeClientAccess } from '@/hooks/use-client-portal';
import { toast } from 'sonner';
import type { Project, ProjectStatus } from '@/types';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { ProjectContactsPanel } from '@/components/projects/ProjectContactsPanel';
import { ProjectNotesPanel } from '@/components/projects/ProjectNotesPanel';
import { ProjectTasksPanel } from '@/components/projects/ProjectTasksPanel';
import { GitHubRepoPanel } from '@/components/projects/GitHubRepoPanel';
import { StartCodingTaskDialog } from '@/components/projects/StartCodingTaskDialog';
import { CodingTasksList } from '@/components/projects/CodingTasksList';
import { SpriteLaunchButton, SpritePanel } from '@/components/sprites';

const STATUS_COLORS: Record<ProjectStatus, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  on_hold: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  archived: 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_ICONS: Record<ProjectStatus, React.ReactNode> = {
  active: <Play className="h-4 w-4" />,
  on_hold: <Pause className="h-4 w-4" />,
  completed: <CheckCircle2 className="h-4 w-4" />,
  archived: <Archive className="h-4 w-4" />,
  cancelled: <XCircle className="h-4 w-4" />,
};

const TAG_COLORS = [
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-green-500/20 text-green-400 border-green-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
];

function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCodingTaskDialogOpen, setIsCodingTaskDialogOpen] = useState(false);
  const [isNewIssueDialogOpen, setIsNewIssueDialogOpen] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueBody, setIssueBody] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<{ id: number; number: number; title: string; body: string | null; url: string; createdAt: string; state: string; user: { login: string; avatar_url: string }; labels: Array<{ name: string; color: string }> } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isClientPortalDialogOpen, setIsClientPortalDialogOpen] = useState(false);
  const [clientInviteEmail, setClientInviteEmail] = useState('');
  const [sendInviteEmail, setSendInviteEmail] = useState(true);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopyPublicLink = () => {
    const publicUrl = `${window.location.origin}/p/${id}`;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setLinkCopied(true);
      toast.success('Public link copied to clipboard');
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {
      toast.error('Failed to copy link');
    });
  };

  const { data: project, isLoading, error, refetch } = useProject(id);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  // Parse GitHub URL for issue creation
  const repoInfo = project?.githubUrl ? parseGitHubUrl(project.githubUrl) : null;
  const createIssue = useCreateGitHubIssue(repoInfo?.owner, repoInfo?.repo);
  const { data: recentIssues } = useGitHubIssues(repoInfo?.owner, repoInfo?.repo, { state: 'open', perPage: 5 });
  const { data: closedIssues } = useGitHubIssues(repoInfo?.owner, repoInfo?.repo, { state: 'closed', perPage: 100 });
  const { data: commits } = useGitHubCommits(repoInfo?.owner, repoInfo?.repo, { perPage: 100 });
  const { data: pullRequests } = useGitHubPullRequests(repoInfo?.owner, repoInfo?.repo, { state: 'open', perPage: 100 });
  const { data: collaboratorAccess } = useGitHubCollaboratorAccess(project?.githubUrl);
  const canClone = collaboratorAccess?.isCollaborator ?? false;

  // Client Portal hooks
  const { data: projectClients, refetch: refetchClients } = useProjectClients(id);
  const generateInvite = useGenerateInvite();
  const revokeClientAccess = useRevokeClientAccess();

  const handleUpdate = async (projectData: Partial<Project>) => {
    try {
      await updateProject.mutateAsync({ id, data: projectData });
      toast.success('Project updated successfully');
      setIsEditDialogOpen(false);
    } catch {
      toast.error('Failed to update project');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;
    try {
      await deleteProject.mutateAsync(id);
      toast.success('Project deleted successfully');
      router.push('/projects');
    } catch {
      toast.error('Failed to delete project');
    }
  };

  const handleStatusChange = async (newStatus: ProjectStatus) => {
    try {
      await updateProject.mutateAsync({ id, data: { status: newStatus } });
      toast.success(`Project status updated to ${newStatus.replace('_', ' ')}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleGenerateInvite = async () => {
    try {
      const result = await generateInvite.mutateAsync({
        projectId: id,
        clientEmail: clientInviteEmail || undefined,
        sendEmail: sendInviteEmail && !!clientInviteEmail,
      });
      setGeneratedInviteUrl(result.inviteUrl);
      setInviteEmailSent(result.emailSent);
      if (result.emailSent) {
        toast.success('Invite sent! Email notification delivered.');
      } else {
        toast.success('Invite link generated!');
      }
      refetchClients();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to generate invite');
    }
  };

  const handleCopyInviteLink = () => {
    if (generatedInviteUrl) {
      navigator.clipboard.writeText(generatedInviteUrl);
      setInviteLinkCopied(true);
      toast.success('Invite link copied to clipboard');
      setTimeout(() => setInviteLinkCopied(false), 2000);
    }
  };

  const handleRevokeClient = async (clientId: number) => {
    if (!confirm('Are you sure you want to revoke this client\'s access?')) return;
    try {
      await revokeClientAccess.mutateAsync({ projectId: id, clientId });
      toast.success('Client access revoked');
      refetchClients();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to revoke access');
    }
  };

  const handleCreateIssue = async () => {
    if (!issueTitle.trim()) {
      toast.error('Issue title is required');
      return;
    }
    try {
      const result = await createIssue.mutateAsync({
        title: issueTitle,
        body: issueBody || undefined,
      });
      toast.success(`Issue #${result.number} created successfully`);
      setIsNewIssueDialogOpen(false);
      setIssueTitle('');
      setIssueBody('');
      // Open the issue in a new tab
      if (result.url) {
        window.open(result.url, '_blank');
      }
    } catch (err: unknown) {
      const error = err as { message?: string; error?: string };
      toast.error(error?.error || error?.message || 'Failed to create issue');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
          </div>
          <div>
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" className="mb-4" asChild>
          <Link href="/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Link>
        </Button>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">
              {error ? 'Failed to load project' : 'Project not found'}
            </p>
            <p className="text-muted-foreground mb-4">
              {error ? (error as Error).message : 'The project you are looking for does not exist.'}
            </p>
            <Button onClick={() => refetch()} variant="outline" className="border">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" className="shrink-0 mt-1" asChild>
            <Link href="/projects">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-start gap-4">
            {project.logoUrl ? (
              <img
                src={project.logoUrl}
                alt={`${project.title} logo`}
                className="h-12 w-12 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-accent-600/20 flex items-center justify-center shrink-0">
                <FolderKanban className="h-6 w-6 text-accent-400" />
              </div>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">{project.title}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <Badge variant="outline" className={STATUS_COLORS[project.status]}>
                  {STATUS_ICONS[project.status]}
                  <span className="ml-1">{project.status.replace('_', ' ')}</span>
                </Badge>
                {project.tags && project.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className={getTagColor(tag)}>
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="relative overflow-hidden bg-red-500/10 backdrop-blur-sm border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 hover:border-red-400/50 transition-all duration-300 shadow-[0_0_15px_rgba(239,68,68,0.15)] hover:shadow-[0_0_20px_rgba(239,68,68,0.25)]"
            onClick={() => setIsCodingTaskDialogOpen(true)}
            disabled={!project.githubUrl}
            title={!project.githubUrl ? 'Add a GitHub URL to enable coding tasks' : 'Start Coding Task'}
          >
            <Bot className="h-4 w-4 mr-1" />
            Code
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="relative overflow-hidden bg-green-500/10 backdrop-blur-sm border border-green-500/30 text-green-400 hover:bg-green-500/20 hover:text-green-300 hover:border-green-400/50 transition-all duration-300 shadow-[0_0_15px_rgba(34,197,94,0.15)] hover:shadow-[0_0_20px_rgba(34,197,94,0.25)]"
            onClick={() => setIsNewIssueDialogOpen(true)}
            disabled={!project.githubUrl}
            title={!project.githubUrl ? 'Add a GitHub URL to create issues' : 'New Issue'}
          >
            <CirclePlus className="h-4 w-4 mr-1" />
            Issue
          </Button>
          {project.githubUrl && (
            <SpriteLaunchButton
              projectId={project.id}
              projectTitle={project.title}
            />
          )}
          {project.githubUrl && (
            <Button variant="outline" size="sm" className="border" asChild>
              <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" title="Open in GitHub">
                <Github className="h-4 w-4" />
              </a>
            </Button>
          )}
          {project.githubUrl && canClone && (
            <Button variant="outline" size="sm" className="border" asChild>
              <a href={`x-github-client://openRepo/${project.githubUrl}`} title="Clone in GitHub Desktop">
                <MonitorDown className="h-4 w-4" />
              </a>
            </Button>
          )}
          {project.githubUrl && canClone && (
            <Button variant="outline" size="sm" className="border" asChild>
              <a href={`vscode://vscode.git/clone?url=${encodeURIComponent(project.githubUrl)}`} title="Clone in VS Code">
                <Code2 className="h-4 w-4" />
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border"
            onClick={handleCopyPublicLink}
            title="Copy public link for ticket submissions"
          >
            {linkCopied ? (
              <Check className="h-4 w-4 mr-1 text-green-400" />
            ) : (
              <Share2 className="h-4 w-4 mr-1" />
            )}
            Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border"
            onClick={() => setIsClientPortalDialogOpen(true)}
            title="Manage client portal access"
          >
            <UserPlus className="h-4 w-4 mr-1" />
            Clients
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border"
            onClick={() => setIsEditDialogOpen(true)}
          >
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="border">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-secondary border">
              <DropdownMenuItem
                onClick={() => handleStatusChange('active')}
                disabled={project.status === 'active'}
                className="text-foreground cursor-pointer"
              >
                <Play className="mr-2 h-4 w-4" />
                Set Active
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange('on_hold')}
                disabled={project.status === 'on_hold'}
                className="text-foreground cursor-pointer"
              >
                <Pause className="mr-2 h-4 w-4" />
                Put On Hold
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange('completed')}
                disabled={project.status === 'completed'}
                className="text-green-400 cursor-pointer"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark Completed
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange('archived')}
                disabled={project.status === 'archived'}
                className="text-muted-foreground cursor-pointer"
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-red-400 cursor-pointer"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <Tabs defaultValue={project.githubUrl ? 'github' : 'tasks'} className="space-y-4">
            <TabsList className="bg-secondary border">
              {project.githubUrl && (
                <>
                  <TabsTrigger value="github" className="data-[state=active]:bg-secondary">
                    <Github className="h-4 w-4 mr-2" />
                    Repository
                  </TabsTrigger>
                </>
              )}
              <TabsTrigger value="notes" className="data-[state=active]:bg-secondary">
                <StickyNote className="h-4 w-4 mr-2" />
                Notes
              </TabsTrigger>
              <TabsTrigger value="contacts" className="data-[state=active]:bg-secondary">
                <Users className="h-4 w-4 mr-2" />
                Contacts
              </TabsTrigger>
            </TabsList>

            {project.githubUrl && (
              <TabsContent value="github">
                <GitHubRepoPanel githubUrl={project.githubUrl} />
              </TabsContent>
            )}

            <TabsContent value="notes">
              <Card className="bg-card border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-medium text-foreground">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProjectNotesPanel projectId={id} githubUrl={project.githubUrl} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="contacts">
              <Card className="bg-card border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-medium text-foreground">Contacts</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProjectContactsPanel projectId={id} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card className="bg-card border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium text-foreground">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-secondary/50 rounded-lg">
                  <p className="text-2xl font-bold text-foreground">{project.noteCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Notes</p>
                </div>
                {project.githubUrl && (
                  <>
                    <div className="text-center p-3 bg-secondary/50 rounded-lg">
                      <p className="text-2xl font-bold text-green-400">{recentIssues?.length || 0}</p>
                      <p className="text-xs text-muted-foreground">Open Tickets</p>
                    </div>
                    <div className="text-center p-3 bg-secondary/50 rounded-lg">
                      <p className="text-2xl font-bold text-red-400">{closedIssues?.length || 0}</p>
                      <p className="text-xs text-muted-foreground">Closed Tickets</p>
                    </div>
                    <div className="text-center p-3 bg-secondary/50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-400">{commits?.length || 0}</p>
                      <p className="text-xs text-muted-foreground">Commits</p>
                    </div>
                    <div className="text-center p-3 bg-secondary/50 rounded-lg">
                      <p className="text-2xl font-bold text-purple-400">{pullRequests?.length || 0}</p>
                      <p className="text-xs text-muted-foreground">Open PRs</p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sprite Panel */}
          {project.githubUrl && (
            <SpritePanel
              projectId={project.id}
              projectTitle={project.title}
            />
          )}

          {/* Recent Tickets */}
          {project.githubUrl && (
            <Card className="bg-card border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                    <span className="text-2xl font-bold text-green-400">{recentIssues?.length || 0}</span>
                    Open Tickets
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setIsNewIssueDialogOpen(true)}
                  >
                    <CirclePlus className="h-3 w-3 mr-1" />
                    New
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {recentIssues && recentIssues.length > 0 ? (
                  <div className="space-y-2">
                    {recentIssues.slice(0, 5).map((issue) => (
                      <button
                        key={issue.id}
                        onClick={() => setSelectedIssue(issue)}
                        className="block w-full text-left p-3 rounded hover:bg-secondary/80 transition-colors group"
                      >
                        <p className="text-lg font-medium truncate group-hover:text-accent-400">
                          {issue.title}
                        </p>
                        {issue.body && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {issue.body}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(issue.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No open tickets
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Project Details */}
          <Card className="bg-card border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium text-foreground">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {project.description && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Description</p>
                  <p className="text-sm text-foreground">{project.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Start Date
                  </p>
                  <p className="text-sm text-foreground">{formatDate(project.startDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Target End
                  </p>
                  <p className="text-sm text-foreground">{formatDate(project.targetEndDate)}</p>
                </div>
              </div>

              {project.actualEndDate && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Completed On
                  </p>
                  <p className="text-sm text-foreground">{formatDate(project.actualEndDate)}</p>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Created
                </p>
                <p className="text-sm text-foreground">{formatDate(project.createdAt)}</p>
              </div>

              {project.githubUrl && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                    <Github className="h-3.5 w-3.5" />
                    Repository
                  </p>
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent-400 hover:underline flex items-center gap-1"
                  >
                    {project.githubUrl.replace('https://github.com/', '')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      {mounted && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="bg-card border max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Edit Project</DialogTitle>
            </DialogHeader>
            <ProjectForm
              project={project}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditDialogOpen(false)}
              isLoading={updateProject.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Start Coding Task Dialog */}
      {mounted && project.githubUrl && (
        <StartCodingTaskDialog
          open={isCodingTaskDialogOpen}
          onOpenChange={setIsCodingTaskDialogOpen}
          projectId={id}
          projectTitle={project.title}
          onSuccess={(taskId) => {
            // Optionally navigate to task detail or switch to AI Tasks tab
            toast.success('Task started', {
              description: `Task ID: ${taskId.slice(0, 8)}...`,
            });
          }}
        />
      )}

      {/* New Issue Dialog */}
      <Dialog open={isNewIssueDialogOpen} onOpenChange={setIsNewIssueDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Issue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="issue-title">Title</Label>
              <Input
                id="issue-title"
                placeholder="Issue title"
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue-body">Description (optional)</Label>
              <Textarea
                id="issue-body"
                placeholder="Describe the issue..."
                value={issueBody}
                onChange={(e) => setIssueBody(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewIssueDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateIssue}
              disabled={createIssue.isPending || !issueTitle.trim()}
              className="relative overflow-hidden bg-green-500/10 backdrop-blur-sm border border-green-500/30 text-green-400 hover:bg-green-500/20 hover:text-green-300 hover:border-green-400/50 transition-all duration-300 shadow-[0_0_15px_rgba(34,197,94,0.15)] hover:shadow-[0_0_20px_rgba(34,197,94,0.25)]"
            >
              {createIssue.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CirclePlus className="mr-2 h-4 w-4" />
                  Create Issue
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue Detail Dialog */}
      <Dialog open={!!selectedIssue} onOpenChange={(open) => !open && setSelectedIssue(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedIssue && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="shrink-0 text-green-400 border-green-400/50">
                    <CircleDot className="h-3 w-3 mr-1" />
                    Open
                  </Badge>
                  <DialogTitle className="text-xl">
                    {selectedIssue.title}
                  </DialogTitle>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground pt-2">
                  <span className="font-mono">#{selectedIssue.number}</span>
                  <span>•</span>
                  <span>Opened by {selectedIssue.user?.login || 'Unknown'}</span>
                  <span>•</span>
                  <span>{new Date(selectedIssue.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                {selectedIssue.labels && selectedIssue.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2">
                    {selectedIssue.labels.map((label) => (
                      <Badge
                        key={label.name}
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: `#${label.color}`,
                          color: `#${label.color}`,
                        }}
                      >
                        {label.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </DialogHeader>
              <div className="py-4">
                {selectedIssue.body ? (
                  <div className="prose prose-sm prose-invert max-w-none">
                    <p className="whitespace-pre-wrap text-foreground">{selectedIssue.body}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground italic">No description provided.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedIssue(null)}>
                  Close
                </Button>
                <Button asChild>
                  <a href={selectedIssue.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View on GitHub
                  </a>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Client Portal Dialog */}
      <Dialog open={isClientPortalDialogOpen} onOpenChange={(open) => {
        setIsClientPortalDialogOpen(open);
        if (!open) {
          setClientInviteEmail('');
          setGeneratedInviteUrl(null);
          setSendInviteEmail(true);
          setInviteEmailSent(false);
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Client Portal Access
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Generate Invite Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Generate Invite Link</h3>
              <div className="space-y-2">
                <Label htmlFor="client-email">Client Email (optional)</Label>
                <Input
                  id="client-email"
                  type="email"
                  placeholder="client@example.com"
                  value={clientInviteEmail}
                  onChange={(e) => setClientInviteEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  If provided, the invite will be tracked for this email.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="send-email"
                  checked={sendInviteEmail}
                  onCheckedChange={(checked) => setSendInviteEmail(checked === true)}
                  disabled={!clientInviteEmail}
                />
                <Label
                  htmlFor="send-email"
                  className={`text-sm ${!clientInviteEmail ? 'text-muted-foreground' : ''}`}
                >
                  Send email notification
                </Label>
              </div>
              <Button
                onClick={handleGenerateInvite}
                disabled={generateInvite.isPending}
                className="w-full"
              >
                {generateInvite.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Link2 className="mr-2 h-4 w-4" />
                    Generate Invite Link
                  </>
                )}
              </Button>

              {/* Generated Link */}
              {generatedInviteUrl && (
                <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-green-400">Invite link generated!</p>
                    {inviteEmailSent && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                        <MailCheck className="h-3 w-3" />
                        Email sent
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={generatedInviteUrl}
                      readOnly
                      className="text-xs bg-secondary"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={handleCopyInviteLink}
                    >
                      {inviteLinkCopied ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {inviteEmailSent
                      ? `An invite email has been sent to ${clientInviteEmail}. They can also use this link directly.`
                      : "Share this link with your client. They'll create an account and get access to view issues, PRs, and commits."}
                  </p>
                </div>
              )}
            </div>

            {/* Active Clients Section */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-medium">
                Active Clients ({projectClients?.filter(c => c.status === 'active').length || 0})
              </h3>
              {projectClients && projectClients.length > 0 ? (
                <div className="space-y-2">
                  {projectClients.map((client) => (
                    <div
                      key={client.id}
                      className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm">
                          {client.clientName || client.clientEmail || 'Pending invite'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {client.status === 'active' ? (
                            <>Joined {new Date(client.acceptedAt || client.invitedAt).toLocaleDateString()}</>
                          ) : client.status === 'pending' ? (
                            <>Invited {new Date(client.invitedAt).toLocaleDateString()} • Pending</>
                          ) : (
                            <>Revoked</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            client.status === 'active'
                              ? 'text-green-400 border-green-400/50'
                              : client.status === 'pending'
                                ? 'text-amber-400 border-amber-400/50'
                                : 'text-red-400 border-red-400/50'
                          }
                        >
                          {client.status}
                        </Badge>
                        {client.status !== 'revoked' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                            onClick={() => handleRevokeClient(client.id)}
                            title="Revoke access"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No clients have been invited yet.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClientPortalDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
