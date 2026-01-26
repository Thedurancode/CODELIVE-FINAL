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
  Activity,
  FileText,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  ListChecks,
  FolderTree,
  Plug,
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
import { ProjectActivityFeed } from '@/components/projects/ProjectActivityFeed';
import { SpriteLaunchButton, SpritePanel, SpriteTaskQueuePanel, SpriteFileBrowser, SpriteMcpPanel } from '@/components/sprites';
import { SpriteChatPanel } from '@/components/sprites/SpriteChatPanel';
import { useSpriteByProject } from '@/hooks/use-sprites';
import { ScrollArea } from '@/components/ui/scroll-area';

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

  // Sprite hook for MCP panel
  const { data: sprite } = useSpriteByProject(id);

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
              githubUrl={project.githubUrl}
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
          <Tabs defaultValue={project.githubUrl ? 'github' : 'notes'} className="space-y-4">
            <TabsList className="bg-secondary border">
              {project.githubUrl && (
                <TabsTrigger value="github" className="data-[state=active]:bg-secondary">
                  <Github className="h-4 w-4 mr-2" />
                  Repository
                </TabsTrigger>
              )}
              {project.githubUrl && (
                <TabsTrigger value="agent" className="data-[state=active]:bg-secondary">
                  <Bot className="h-4 w-4 mr-2" />
                  Agent
                </TabsTrigger>
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
                <GitHubRepoPanel githubUrl={project.githubUrl} projectId={project.id} />
              </TabsContent>
            )}

            {project.githubUrl && (
              <TabsContent value="agent">
                <Tabs defaultValue="agent-status" className="space-y-4">
                  <TabsList className="bg-muted/50 border border-border/50">
                    <TabsTrigger value="agent-status" className="data-[state=active]:bg-background/80">
                      <Bot className="h-4 w-4 mr-2" />
                      Agent
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="data-[state=active]:bg-background/80">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Chat
                    </TabsTrigger>
                    <TabsTrigger value="tasks" className="data-[state=active]:bg-background/80">
                      <ListChecks className="h-4 w-4 mr-2" />
                      Tasks
                    </TabsTrigger>
                    <TabsTrigger value="files" className="data-[state=active]:bg-background/80">
                      <FolderTree className="h-4 w-4 mr-2" />
                      Files
                    </TabsTrigger>
                    <TabsTrigger value="mcp" className="data-[state=active]:bg-background/80">
                      <Plug className="h-4 w-4 mr-2" />
                      MCP
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="agent-status">
                    <SpritePanel
                      projectId={project.id}
                      projectTitle={project.title}
                    />
                  </TabsContent>
                  <TabsContent value="chat">
                    <Card className="bg-card border">
                      <CardContent className="p-0">
                        <SpriteChatPanel
                          projectId={project.id}
                          className="h-[500px]"
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="tasks">
                    <Card className="bg-card border">
                      <CardContent className="p-0">
                        <SpriteTaskQueuePanel
                          projectId={project.id}
                          className="h-[500px]"
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="files">
                    <Card className="bg-card border">
                      <CardContent className="p-0">
                        <SpriteFileBrowser
                          projectId={project.id}
                          className="h-[500px]"
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="mcp">
                    <Card className="bg-card border">
                      <CardContent className="p-0">
                        <SpriteMcpPanel
                          spriteId={sprite?.id}
                          className="h-[500px]"
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
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

        {/* Sidebar - OS Style */}
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden shadow-xl">
          <ScrollArea className="h-[calc(100vh-16rem)]">
            <div className="p-4 space-y-4">
              {/* Quick Stats Section */}
              <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Quick Stats</p>
                    <p className="text-xs text-muted-foreground">Project overview</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-background/50 border border-border/50 text-center">
                    <p className="text-2xl font-bold text-foreground">{project.noteCount || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Notes</p>
                  </div>
                  {project.githubUrl && (
                    <>
                      <div className="p-3 rounded-lg bg-background/50 border border-border/50 text-center">
                        <p className="text-2xl font-bold text-green-400">{recentIssues?.length || 0}</p>
                        <p className="text-[10px] text-muted-foreground">Open Issues</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background/50 border border-border/50 text-center">
                        <p className="text-2xl font-bold text-blue-400">{commits?.length || 0}</p>
                        <p className="text-[10px] text-muted-foreground">Commits</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background/50 border border-border/50 text-center">
                        <p className="text-2xl font-bold text-purple-400">{pullRequests?.length || 0}</p>
                        <p className="text-[10px] text-muted-foreground">Open PRs</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Activity Feed Section */}
              <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                <ProjectActivityFeed
                  projectId={id}
                  githubUrl={project.githubUrl}
                  noteCount={project.noteCount}
                />
              </div>

              {/* Project Details Section */}
              <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium">Project Details</p>
                    <p className="text-xs text-muted-foreground">Timeline and info</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {project.description && (
                    <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                      <p className="text-xs text-muted-foreground mb-1">Description</p>
                      <p className="text-sm text-foreground line-clamp-3">{project.description}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                        <Calendar className="h-3 w-3" />
                        Start
                      </p>
                      <p className="text-sm font-medium">{formatDate(project.startDate)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                        <Calendar className="h-3 w-3" />
                        Target End
                      </p>
                      <p className="text-sm font-medium">{formatDate(project.targetEndDate)}</p>
                    </div>
                  </div>

                  {project.actualEndDate && (
                    <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                      <p className="text-xs text-green-400 flex items-center gap-1 mb-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Completed
                      </p>
                      <p className="text-sm font-medium text-green-400">{formatDate(project.actualEndDate)}</p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <Clock className="h-3 w-3" />
                      Created
                    </p>
                    <p className="text-sm font-medium">{formatDate(project.createdAt)}</p>
                  </div>

                  {project.githubUrl && (
                    <a
                      href={project.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-lg bg-background/50 border border-border/50 hover:bg-background/80 hover:border-primary/30 transition-all group"
                    >
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                        <Github className="h-3 w-3" />
                        Repository
                      </p>
                      <p className="text-sm font-medium text-primary group-hover:underline flex items-center gap-1">
                        {project.githubUrl.replace('https://github.com/', '')}
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </p>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Edit Dialog - OS Style */}
      {mounted && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl max-w-xl p-0 overflow-hidden shadow-2xl">
            <DialogHeader className="px-6 pt-6 pb-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Edit2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Edit Project</DialogTitle>
                  <p className="text-sm text-muted-foreground">Update project settings</p>
                </div>
              </div>
            </DialogHeader>
            <div className="px-6 pb-6">
              <ProjectForm
                project={project}
                onSubmit={handleUpdate}
                onCancel={() => setIsEditDialogOpen(false)}
                isLoading={updateProject.isPending}
              />
            </div>
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

      {/* New Issue Dialog - OS Style */}
      <Dialog open={isNewIssueDialogOpen} onOpenChange={setIsNewIssueDialogOpen}>
        <DialogContent className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl max-w-lg p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="px-6 pt-6 pb-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <CirclePlus className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <DialogTitle className="text-xl">Create Issue</DialogTitle>
                <p className="text-sm text-muted-foreground">Add a new GitHub issue</p>
              </div>
            </div>
          </DialogHeader>
          <div className="px-6 py-4 space-y-4">
            <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="issue-title" className="text-muted-foreground text-sm">Title *</Label>
                <Input
                  id="issue-title"
                  placeholder="Enter issue title..."
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  className="bg-background/50 border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue-body" className="text-muted-foreground text-sm">Description</Label>
                <Textarea
                  id="issue-body"
                  placeholder="Describe the issue..."
                  value={issueBody}
                  onChange={(e) => setIssueBody(e.target.value)}
                  rows={4}
                  className="bg-background/50 border-border/50 resize-none"
                />
              </div>
            </div>
          </div>
          <div className="px-6 pb-6 flex gap-3">
            <Button variant="outline" onClick={() => setIsNewIssueDialogOpen(false)} className="flex-1 border-border/50">
              Cancel
            </Button>
            <Button
              onClick={handleCreateIssue}
              disabled={createIssue.isPending || !issueTitle.trim()}
              className="flex-1 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 hover:text-green-300"
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Issue Detail Dialog - OS Style */}
      <Dialog open={!!selectedIssue} onOpenChange={(open) => !open && setSelectedIssue(null)}>
        <DialogContent className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl max-w-2xl p-0 overflow-hidden shadow-2xl">
          {selectedIssue && (
            <>
              <DialogHeader className="px-6 pt-6 pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <CircleDot className="h-5 w-5 text-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <DialogTitle className="text-xl truncate">{selectedIssue.title}</DialogTitle>
                      <Badge variant="outline" className="shrink-0 text-green-400 border-green-400/50 text-xs">
                        Open
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <span className="font-mono">#{selectedIssue.number}</span>
                      <span>·</span>
                      <span>by {selectedIssue.user?.login || 'Unknown'}</span>
                      <span>·</span>
                      <span>{new Date(selectedIssue.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                </div>
                {selectedIssue.labels && selectedIssue.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
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
              <div className="px-6 py-4">
                <div className="p-4 rounded-xl bg-muted/50 border border-border/50 max-h-[300px] overflow-y-auto">
                  {selectedIssue.body ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <p className="whitespace-pre-wrap text-foreground text-sm">{selectedIssue.body}</p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic text-sm">No description provided.</p>
                  )}
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <Button variant="outline" onClick={() => setSelectedIssue(null)} className="flex-1 border-border/50">
                  Close
                </Button>
                <Button asChild className="flex-1">
                  <a href={selectedIssue.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View on GitHub
                  </a>
                </Button>
              </div>
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
