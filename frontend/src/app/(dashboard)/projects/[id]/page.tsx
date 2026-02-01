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
  Globe,
  FileSignature,
  Key,
  Palette,
  Video,
  Download,
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
import { ProjectEnvVariablesPanel } from '@/components/projects/ProjectEnvVariablesPanel';
import { ProjectBrandPanel } from '@/components/projects/ProjectBrandPanel';
import { ProjectTasksPanel } from '@/components/projects/ProjectTasksPanel';
import { GitHubRepoPanel } from '@/components/projects/GitHubRepoPanel';
import { StartCodingTaskDialog } from '@/components/projects/StartCodingTaskDialog';
import { CodingTasksList } from '@/components/projects/CodingTasksList';
import { ProjectActivityFeed } from '@/components/projects/ProjectActivityFeed';
import { SpriteLaunchButton, SpritePanel, SpriteTaskQueuePanel, SpriteFileBrowser, SpriteMcpPanel } from '@/components/sprites';
import { SpriteChatPanel } from '@/components/sprites/SpriteChatPanel';
import { useSpriteByProject } from '@/hooks/use-sprites';
import { useProjectContracts, getContractStatusColor, getContractStatusLabel, type ProjectContract } from '@/hooks/use-project-contracts';
import { ProjectSignersPanel } from '@/components/contracts/ProjectSignersPanel';
import { ContractSignersPanel } from '@/components/contracts/ContractSignersPanel';
import { ProjectMeetingsPanel } from '@/components/projects/ProjectMeetingsPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

// Audio Waveform Visualizer for Recap Playback
function RecapWaveform({ analyser, isPlaying }: { analyser: AnalyserNode | null; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!analyser || !canvasRef.current || !isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      // Clear canvas when not playing
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      // Clear with fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw bars with violet gradient (matching recap button color)
      const barCount = 48;
      const barWidth = (canvas.width / barCount) - 2;
      const barSpacing = 2;
      const cornerRadius = 2;

      for (let i = 0; i < barCount; i++) {
        // Sample from frequency data
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex];
        const barHeight = Math.max(4, (value / 255) * canvas.height * 0.85);

        // Violet gradient based on amplitude
        const intensity = value / 255;
        const hue = 265 + intensity * 35; // Purple to pink
        const saturation = 70 + intensity * 25;
        const lightness = 55 + intensity * 20;

        // Add glow effect for high amplitudes
        if (intensity > 0.6) {
          ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`;
          ctx.shadowBlur = 8;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${0.75 + intensity * 0.25})`;

        // Draw rounded bar from center
        const x = i * (barWidth + barSpacing);
        const y = (canvas.height - barHeight) / 2;

        // Draw rounded rectangle
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, cornerRadius);
        ctx.fill();
      }

      // Reset shadow
      ctx.shadowBlur = 0;
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isPlaying]);

  if (!isPlaying) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/30">
      <canvas
        ref={canvasRef}
        width={240}
        height={48}
        className="rounded-md bg-black/30"
      />
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
        </span>
        <span className="text-xs font-medium text-violet-400">Speaking...</span>
      </div>
    </div>
  );
}

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

// Project Contracts Section Component
function ProjectContractsSection({ projectId }: { projectId: string }) {
  const { data: contractsData, isLoading, error, refetch } = useProjectContracts(projectId);

  // Extract array from potentially wrapped response
  const contracts: ProjectContract[] = Array.isArray(contractsData)
    ? contractsData
    : ((contractsData as any)?.data || []);

  if (isLoading) {
    return (
      <Card className="bg-card border">
        <CardContent className="flex items-center justify-center py-10">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    console.error('[ProjectContracts] Error:', error);
    return (
      <Card className="bg-card border">
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-muted-foreground">Failed to load contracts</p>
          <p className="text-xs text-muted-foreground/70">{(error as Error)?.message || 'Unknown error'}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Contracts
          </CardTitle>
          <Badge variant="secondary">{contracts?.length || 0} contracts</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {!contracts || contracts.length === 0 ? (
          <div className="text-center py-8">
            <FileSignature className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No contracts associated with this project</p>
            <p className="text-xs text-muted-foreground/70 mt-2">
              Link DocuSeal contracts to track e-signatures for this project
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {contracts.map((contract: ProjectContract) => (
              <div
                key={contract.id}
                className="p-4 rounded-lg bg-muted/30 border border-border/50 hover:border-border transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium truncate">
                        {contract.templateName || `Contract #${contract.docuSealSubmissionId}`}
                      </h4>
                      <Badge
                        variant="outline"
                        className={getContractStatusColor(contract.status)}
                      >
                        {getContractStatusLabel(contract.status)}
                      </Badge>
                    </div>
                    {contract.documentCategory && (
                      <p className="text-xs text-muted-foreground mb-2">{contract.documentCategory}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {contract.sentAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Sent {new Date(contract.sentAt).toLocaleDateString()}
                        </span>
                      )}
                      {contract.submitters && contract.submitters.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {contract.submitters.length} signer{contract.submitters.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {/* Submitters Progress */}
                    {contract.submitters && contract.submitters.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {contract.submitters.map((submitter, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-background/50"
                          >
                            {submitter.status === 'completed' ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            ) : submitter.status === 'declined' ? (
                              <XCircle className="h-3 w-3 text-red-500" />
                            ) : (
                              <Clock className="h-3 w-3 text-muted-foreground" />
                            )}
                            <span className="truncate max-w-[120px]">
                              {submitter.name || submitter.email}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {contract.combinedDocumentUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <a
                          href={contract.combinedDocumentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [recapAnalyser, setRecapAnalyser] = useState<AnalyserNode | null>(null);

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
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
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
  const { data: projectClientsData, refetch: refetchClients } = useProjectClients(id);
  const clientsList = Array.isArray(projectClientsData) ? projectClientsData : (projectClientsData?.data || []);
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
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setRecapAnalyser(null);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingRecap(false);
      return;
    }

    setIsLoadingAudio(true);

    try {
      // Use the new cached audio endpoint - it handles caching server-side
      // This saves ElevenLabs credits by reusing cached audio when the recap hasn't changed
      const response = await api.get<{
        audioUrl: string;
        cached: boolean;
        recap: string;
        warning?: string;
      }>(`/api/projects/${id}/recap/audio?voice=rachel`);

      if (response?.audioUrl) {
        // Log whether we used cached audio or generated new
        if (response.cached) {
          console.log('[RecapAudio] Using cached audio');
        } else {
          console.log('[RecapAudio] Generated new audio');
        }

        // Update local cache for immediate replay
        recapAudioCacheRef.current = { text: response.recap, audioUrl: response.audioUrl };

        const audio = new Audio(response.audioUrl);
        audio.crossOrigin = 'anonymous'; // Required for audio analysis
        audioRef.current = audio;

        // Set up audio context and analyser for waveform visualization
        const setupAudioAnalyser = () => {
          try {
            const audioContext = new AudioContext();
            const source = audioContext.createMediaElementSource(audio);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            setRecapAnalyser(analyser);
          } catch (e) {
            console.log('[RecapAudio] Could not set up audio analyser:', e);
          }
        };

        audio.onplay = () => {
          if (!audioContextRef.current) {
            setupAudioAnalyser();
          }
          setIsPlayingRecap(true);
          setIsLoadingAudio(false);
        };
        audio.onended = () => {
          setIsPlayingRecap(false);
          audioRef.current = null;
          if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
          }
          setRecapAnalyser(null);
        };
        audio.onerror = () => {
          setIsPlayingRecap(false);
          setIsLoadingAudio(false);
          audioRef.current = null;
          if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
          }
          setRecapAnalyser(null);
          // Cache might be stale, clear it
          recapAudioCacheRef.current = null;
          toast.error('Failed to play audio');
        };

        await audio.play();
        return;
      }
    } catch (error: unknown) {
      // Check if it's a quota or service error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('quota') || errorMessage.includes('credits')) {
        toast.error('ElevenLabs quota exceeded. Using browser speech instead.');
      } else {
        console.log('ElevenLabs not available, using browser TTS:', error);
      }
    }

    setIsLoadingAudio(false);

    // Fallback to browser speech synthesis
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      toast.error('Speech synthesis not available');
      return;
    }

    // Get recap text for browser TTS fallback
    let textToSpeak = recapAudioCacheRef.current?.text;
    if (!textToSpeak) {
      try {
        const freshRecap = await refreshRecap.mutateAsync({
          projectId: id,
          userName: user?.name || undefined
        });
        textToSpeak = freshRecap?.recap;
      } catch {
        toast.error('Failed to load recap');
        return;
      }
    }

    if (!textToSpeak) {
      toast.error('No recap available to play');
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
            <Badge variant="outline" className={`${STATUS_COLORS[project.status || 'active']} text-xs mt-1`}>
              {(project.status || 'active').replace('_', ' ')}
            </Badge>
          </div>
        </div>

        {/* Action buttons row - Consolidated */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Play Recap - Voice button with waveform */}
          <div className="flex items-center gap-2">
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
            {/* Waveform visualization when playing */}
            <RecapWaveform analyser={recapAnalyser} isPlaying={isPlayingRecap} />
          </div>

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

          {/* New Issue Button */}
          {project.githubUrl && (
            <Button
              variant="outline"
              size="sm"
              className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 hover:border-orange-400/60"
              onClick={() => setIsNewIssueDialogOpen(true)}
            >
              <CirclePlus className="h-4 w-4 mr-2" />
              New Issue
            </Button>
          )}

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
                    <DropdownMenuSeparator />
                    {(() => {
                      const parsed = parseGitHubUrl(project.githubUrl);
                      if (!parsed) return null;
                      return (
                        <DropdownMenuItem asChild>
                          <a href={`${process.env.NEXT_PUBLIC_API_URL || ''}/api/github/repos/${parsed.owner}/${parsed.repo}/download/zip`}>
                            <Download className="mr-2 h-4 w-4" />
                            Download ZIP
                          </a>
                        </DropdownMenuItem>
                      );
                    })()}
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
              <TabsTrigger value="meetings" className="data-[state=active]:bg-secondary">
                <Video className="h-4 w-4 mr-2" />
                Meetings
              </TabsTrigger>
              <TabsTrigger value="contracts" className="data-[state=active]:bg-secondary">
                <FileSignature className="h-4 w-4 mr-2" />
                Contracts
              </TabsTrigger>
              <TabsTrigger value="secrets" className="data-[state=active]:bg-secondary">
                <Key className="h-4 w-4 mr-2" />
                Secrets
              </TabsTrigger>
              <TabsTrigger value="brand" className="data-[state=active]:bg-secondary">
                <Palette className="h-4 w-4 mr-2" />
                Brand
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

            <TabsContent value="meetings">
              <Card className="bg-card border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-medium text-foreground">Meetings</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProjectMeetingsPanel projectId={id} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="contracts">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ProjectContractsSection projectId={id} />
                <ProjectSignersPanel projectId={id} />
              </div>
            </TabsContent>

            <TabsContent value="secrets">
              <ProjectEnvVariablesPanel projectId={id} />
            </TabsContent>

            <TabsContent value="brand">
              <ProjectBrandPanel projectId={id} />
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

              {/* Quick Links Section */}
              {(project.deploymentUrl || project.githubUrl) && (
                <div className="flex items-center gap-2">
                  {project.deploymentUrl && (
                    <a
                      href={project.deploymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 p-3 rounded-xl bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 transition-all group flex items-center justify-center gap-2"
                    >
                      <Globe className="h-5 w-5 text-green-400" />
                      <span className="text-sm font-medium text-green-400">Live</span>
                      <ExternalLink className="h-3 w-3 text-green-400/50 group-hover:text-green-400" />
                    </a>
                  )}
                  {project.githubUrl && (
                    <a
                      href={project.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 p-3 rounded-xl bg-muted/50 border border-border/50 hover:bg-muted/70 transition-all group flex items-center justify-center gap-2"
                    >
                      <Github className="h-5 w-5 text-foreground" />
                      <span className="text-sm font-medium">Repo</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
                    </a>
                  )}
                </div>
              )}

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
                Active Clients ({clientsList.filter(c => c.status === 'active').length})
              </h3>
              {clientsList.length > 0 ? (
                <div className="space-y-2">
                  {clientsList.map((client) => (
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
