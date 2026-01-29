'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
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
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useProject, useUpdateProject, useDeleteProject, useProjectRecap, useRefreshProjectRecap } from '@/hooks/use-projects';
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
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

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
  const { user } = useAuth();
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
  const [isAddNoteDialogOpen, setIsAddNoteDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [isPlayingRecap, setIsPlayingRecap] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recapAudioCacheRef = useRef<{ text: string; audioUrl: string } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // Also cancel browser speech synthesis if active
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
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

  // GitHub data - reduced perPage for better performance
  const { data: recentIssues } = useGitHubIssues(repoInfo?.owner, repoInfo?.repo, {
    state: 'open',
    perPage: 5
  });
  const { data: closedIssues } = useGitHubIssues(repoInfo?.owner, repoInfo?.repo, {
    state: 'closed',
    perPage: 20  // Reduced from 100
  });
  const { data: commits } = useGitHubCommits(repoInfo?.owner, repoInfo?.repo, {
    perPage: 20  // Reduced from 100
  });
  const { data: pullRequests } = useGitHubPullRequests(repoInfo?.owner, repoInfo?.repo, {
    state: 'open',
    perPage: 20  // Reduced from 100
  });
  const { data: collaboratorAccess } = useGitHubCollaboratorAccess(project?.githubUrl);
  const canClone = collaboratorAccess?.isCollaborator ?? false;

  // Client Portal hooks
  const { data: projectClients, refetch: refetchClients } = useProjectClients(id);
  const generateInvite = useGenerateInvite();
  const revokeClientAccess = useRevokeClientAccess();

  // Sprite hook for MCP panel
  const { data: sprite } = useSpriteByProject(id);

  // Project recap hooks
  const { data: recapData, isLoading: isRecapLoading } = useProjectRecap(id);
  const refreshRecap = useRefreshProjectRecap();

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

  const handleRefreshRecap = async () => {
    try {
      await refreshRecap.mutateAsync(id);
      toast.success('Project recap refreshed');
    } catch {
      toast.error('Failed to refresh recap');
    }
  };

  const handlePlayRecap = useCallback(async () => {
    // If already playing, stop
    if (isPlayingRecap) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingRecap(false);
      return;
    }

    setIsLoadingAudio(true);

    try {
      // First, generate a fresh recap with the user's name for personalization
      const freshRecap = await refreshRecap.mutateAsync({
        projectId: id,
        userName: user?.name || undefined
      });
      const textToSpeak = freshRecap?.recap;

      if (!textToSpeak) {
        toast.error('No recap available to play');
        setIsLoadingAudio(false);
        return;
      }

      // Check if we have cached audio for this exact recap text
      if (recapAudioCacheRef.current?.text === textToSpeak) {
        // Use cached audio - no change in recap
        const audio = new Audio(recapAudioCacheRef.current.audioUrl);
        audioRef.current = audio;

        audio.onplay = () => {
          setIsPlayingRecap(true);
          setIsLoadingAudio(false);
        };
        audio.onended = () => {
          setIsPlayingRecap(false);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setIsPlayingRecap(false);
          setIsLoadingAudio(false);
          audioRef.current = null;
          // Cache might be stale, clear it
          recapAudioCacheRef.current = null;
          toast.error('Failed to play cached audio');
        };

        await audio.play();
        return;
      }

      // Recap changed - generate new audio with ElevenLabs
      const response = await api.post<{ audio: string; voice: string }>('/api/voice/elevenlabs/speak', {
        text: textToSpeak,
        voice: 'rachel', // Pre-made ElevenLabs voice (calm American female)
      });

      if (response?.audio) {
        // Cache the new audio
        recapAudioCacheRef.current = { text: textToSpeak, audioUrl: response.audio };

        const audio = new Audio(response.audio);
        audioRef.current = audio;

        audio.onplay = () => {
          setIsPlayingRecap(true);
          setIsLoadingAudio(false);
        };
        audio.onended = () => {
          setIsPlayingRecap(false);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setIsPlayingRecap(false);
          setIsLoadingAudio(false);
          audioRef.current = null;
          toast.error('Failed to play audio');
        };

        await audio.play();
        return;
      }
    } catch (error) {
      // ElevenLabs not available, fall back to browser TTS
      console.log('ElevenLabs not available, using browser TTS:', error);
    }

    setIsLoadingAudio(false);

    // Fallback to browser speech synthesis
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      toast.error('Speech synthesis not available');
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
      v.name.includes('Samantha') ||
      v.name.includes('Google') ||
      v.name.includes('Natural') ||
      v.lang.startsWith('en')
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => setIsPlayingRecap(true);
    utterance.onend = () => setIsPlayingRecap(false);
    utterance.onerror = () => {
      setIsPlayingRecap(false);
      toast.error('Failed to play recap');
    };

    window.speechSynthesis.speak(utterance);
  }, [isPlayingRecap, id, refreshRecap, user?.name]);

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
      <div className="flex flex-col gap-4">
        {/* Top row: Back button, logo, title */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link href="/projects">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          {project.logoUrl ? (
            <img
              src={project.logoUrl}
              alt={`${project.title} logo`}
              className="h-11 w-11 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="h-11 w-11 rounded-lg bg-accent-600/20 flex items-center justify-center shrink-0">
              <FolderKanban className="h-5 w-5 text-accent-400" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-foreground">{project.title}</h1>
            <Badge variant="outline" className={`${STATUS_COLORS[project.status]} text-xs mt-1`}>
              {project.status.replace('_', ' ')}
            </Badge>
          </div>
        </div>

        {/* Action buttons row - Consolidated */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Play Recap - Voice button */}
          <Button
            variant="outline"
            size="sm"
            className={isPlayingRecap
              ? "bg-violet-500/20 border-violet-500/40 text-violet-400 hover:bg-violet-500/30"
              : "hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/40"
            }
            onClick={handlePlayRecap}
            disabled={isLoadingAudio}
            title={isPlayingRecap ? "Stop playback" : "Generate and play fresh AI recap"}
          >
            {isLoadingAudio ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : isPlayingRecap ? (
              <>
                <VolumeX className="h-4 w-4 mr-2" />
                Stop
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4 mr-2" />
                Play Recap
              </>
            )}
          </Button>

          {/* Add Note - Primary Action */}
          <Button
            className="bg-emerald-500/20 backdrop-blur-sm border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-300 hover:border-emerald-400/60 shadow-lg shadow-emerald-500/10 transition-all duration-200"
            onClick={() => {
              setActiveTab('notes');
              setIsAddNoteDialogOpen(true);
            }}
          >
            <StickyNote className="h-4 w-4 mr-2" />
            Add Note
          </Button>

          {/* Primary action: Open Terminal / Launch Agent */}
          {project.githubUrl && (
            <SpriteLaunchButton
              projectId={project.id}
              projectTitle={project.title}
              githubUrl={project.githubUrl}
            />
          )}

          {/* GitHub dropdown - combines GitHub, Clone options */}
          {project.githubUrl && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Github className="h-4 w-4 mr-1" />
                  GitHub
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-card border">
                <DropdownMenuItem asChild>
                  <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Repository
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsNewIssueDialogOpen(true)}>
                  <CirclePlus className="mr-2 h-4 w-4" />
                  New Issue
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsCodingTaskDialogOpen(true)}>
                  <Bot className="mr-2 h-4 w-4" />
                  Start Coding Task
                </DropdownMenuItem>
                {canClone && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <a href={`x-github-client://openRepo/${project.githubUrl}`}>
                        <MonitorDown className="mr-2 h-4 w-4" />
                        Clone in GitHub Desktop
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={`vscode://vscode.git/clone?url=${encodeURIComponent(project.githubUrl)}`}>
                        <Code2 className="mr-2 h-4 w-4" />
                        Clone in VS Code
                      </a>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Share dropdown - combines Share and Clients */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Share2 className="h-4 w-4 mr-1" />
                Share
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-card border">
              <DropdownMenuItem onClick={handleCopyPublicLink}>
                {linkCopied ? (
                  <Check className="mr-2 h-4 w-4 text-green-400" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                Copy Public Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsClientPortalDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Manage Client Access
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border">
              <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit Project
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleStatusChange('active')}
                disabled={project.status === 'active'}
              >
                <Play className="mr-2 h-4 w-4" />
                Set Active
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange('on_hold')}
                disabled={project.status === 'on_hold'}
              >
                <Pause className="mr-2 h-4 w-4" />
                Put On Hold
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange('completed')}
                disabled={project.status === 'completed'}
                className="text-green-400"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark Completed
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange('archived')}
                disabled={project.status === 'archived'}
                className="text-muted-foreground"
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-red-400"
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
          <Tabs
            value={activeTab || (project.githubUrl ? 'github' : 'notes')}
            onValueChange={setActiveTab}
            className="space-y-4"
          >
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
                  <ProjectNotesPanel
                    projectId={id}
                    githubUrl={project.githubUrl}
                    externalDialogOpen={isAddNoteDialogOpen}
                    onExternalDialogOpenChange={setIsAddNoteDialogOpen}
                  />
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

              {/* AI Recap Section */}
              <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-violet-500" />
                    </div>
                    <div>
                      <p className="font-medium">AI Recap</p>
                      <p className="text-xs text-muted-foreground">
                        {recapData?.updatedAt
                          ? `Updated ${new Date(recapData.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                          : 'Auto-generated summary'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleRefreshRecap}
                    disabled={refreshRecap.isPending}
                    title="Refresh recap"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshRecap.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                  {isRecapLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-5/6" />
                    </div>
                  ) : recapData?.recap ? (
                    <p className="text-sm text-foreground leading-relaxed">{recapData.recap}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No recap available yet. Add notes or make changes to generate a summary.
                    </p>
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
