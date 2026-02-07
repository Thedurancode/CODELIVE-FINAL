'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Edit2,
  StickyNote,
  Loader2,
  Mic,
  MicOff,
  Square,
  Github,
  ExternalLink,
  AlertTriangle,
  Merge,
  Copy,
  Play,
  Pause,
  Upload,
  FileAudio,
  RefreshCw,
  AlertCircle,
  Download,
  Search,
  Languages,
  Clock,
  AtSign,
  Paperclip,
  Image,
  FileText,
  Film,
  File,
  X,
  ChevronDown,
  ChevronUp,
  Cloud,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useProjectNotes,
  useCreateProjectNote,
  useUpdateProjectNote,
  useDeleteProjectNote,
  useCreateGitHubIssueFromNote,
  useMentionableUsers,
  useNoteAttachments,
  useUploadNoteAttachment,
  useDeleteNoteAttachment,
  type MentionableUser,
  type NoteAttachment,
} from '@/hooks/use-project-notes';
import {
  useProjectAudioNotes,
  useCreateProjectAudioNote,
  useDeleteProjectAudioNote,
  useRetryAudioNoteTranscription,
} from '@/hooks/use-project-audio-notes';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { ProjectNote, ProjectAudioNote } from '@/types';

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface ProjectNotesPanelProps {
  projectId: string;
  githubUrl?: string | null;
  externalDialogOpen?: boolean;
  onExternalDialogOpenChange?: (open: boolean) => void;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();

  // Get time string (e.g., "2:30 PM")
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Calculate differences
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Get day boundaries
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  // Day names for "last X" format
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Just now (< 1 minute)
  if (diffMins < 1) {
    return 'just now';
  }

  // Minutes ago (< 1 hour)
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  }

  // Hours ago (< 4 hours, same day)
  if (diffHours < 4 && dateDay.getTime() === today.getTime()) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  }

  // Today
  if (dateDay.getTime() === today.getTime()) {
    return `today at ${timeStr}`;
  }

  // Yesterday
  if (dateDay.getTime() === yesterday.getTime()) {
    return `yesterday at ${timeStr}`;
  }

  // Within the last 7 days - use "last Thursday" format
  if (diffDays < 7) {
    const dayName = dayNames[date.getDay()];
    return `last ${dayName} at ${timeStr}`;
  }

  // Within 2 weeks - use "X days ago"
  if (diffDays < 14) {
    return `${diffDays} days ago`;
  }

  // Same year - show month and day
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) + ` at ${timeStr}`;
  }

  // Different year - show full date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ` at ${timeStr}`;
}

// Simple word-based similarity check
function getSimilarity(text1: string, text2: string): number {
  const normalize = (text: string) =>
    text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2); // Ignore short words like "to", "a", etc.

  const words1 = new Set(normalize(text1));
  const words2 = new Set(normalize(text2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return intersection / union; // Jaccard similarity
}

// Find similar notes for a given note (for duplicate detection)
function findSimilarNotes(note: ProjectNote, allNotes: ProjectNote[], threshold = 0.4): ProjectNote[] {
  return allNotes.filter(other => {
    if (other.id === note.id) return false;

    // Check time proximity (within 1 hour)
    const timeDiff = Math.abs(new Date(note.createdAt).getTime() - new Date(other.createdAt).getTime());
    const withinHour = timeDiff < 60 * 60 * 1000;

    // Check content similarity
    const similarity = getSimilarity(note.content, other.content);

    // Similar if: high content similarity OR (moderate similarity AND within same hour)
    return similarity > 0.6 || (similarity > threshold && withinHour);
  });
}

// Extract key topics/keywords from note content
function extractTopics(content: string): string[] {
  const text = content.toLowerCase();

  // Common action words to pair with topics
  const actionWords = ['started', 'start', 'began', 'begin', 'working on', 'finished', 'finish', 'completed', 'complete', 'done with', 'updated', 'update', 'fixed', 'fix', 'added', 'add', 'created', 'create', 'reviewed', 'review', 'deployed', 'deploy', 'tested', 'test', 'merged', 'merge'];

  // Find words that follow action words (likely topics)
  const words = text.split(/\s+/).filter(w => w.length > 2);
  const topics: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^\w]/g, '');
    // Skip common words
    if (['the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'this', 'that', 'today', 'yesterday'].includes(word)) continue;

    // If previous word was an action word, this is likely a topic
    if (i > 0) {
      const prevWords = words.slice(Math.max(0, i - 2), i).join(' ');
      if (actionWords.some(a => prevWords.includes(a))) {
        topics.push(word);
      }
    }

    // Also add capitalized words (likely proper nouns/features)
    if (words[i][0] === words[i][0].toUpperCase() && word.length > 3) {
      topics.push(word.toLowerCase());
    }
  }

  // Add any word that looks like a feature name (contains no spaces, might be camelCase or have numbers)
  const featurePattern = /\b([a-z]+(?:[A-Z][a-z]+)+|[a-z]+[-_][a-z]+|[a-z]+\d+)\b/g;
  const features = content.match(featurePattern) || [];
  topics.push(...features.map(f => f.toLowerCase()));

  return [...new Set(topics)];
}

// Group notes by shared topics into threads
interface NoteThread {
  id: string;
  topic: string | null;
  notes: ProjectNote[];
}

// Language options for transcription
const TRANSCRIPTION_LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
] as const;

// Maximum file size for attachments
// - Files <100MB: Stored locally + synced to GitHub
// - Files >=100MB: Stored in Wasabi cloud storage (if configured)
const MAX_ATTACHMENT_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_RECORDING_DURATION = 600; // 10 minutes in seconds

// Highlight search query in text
function highlightSearchMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-500/40 text-foreground rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

// Export transcript to different formats
function exportTranscript(
  audioNote: ProjectAudioNote,
  format: 'txt' | 'srt' | 'json'
): void {
  if (!audioNote.transcript) return;

  let content: string;
  let filename: string;
  let mimeType: string;

  const timestamp = new Date(audioNote.createdAt).toISOString().split('T')[0];
  const baseName = audioNote.originalFilename?.replace(/\.[^.]+$/, '') || 'transcript';

  switch (format) {
    case 'txt':
      content = audioNote.transcript;
      filename = `${baseName}-${timestamp}.txt`;
      mimeType = 'text/plain';
      break;

    case 'srt':
      // Simple SRT format (single subtitle block)
      content = `1\n00:00:00,000 --> ${formatSrtTime(audioNote.duration || 0)}\n${audioNote.transcript}\n`;
      filename = `${baseName}-${timestamp}.srt`;
      mimeType = 'application/x-subrip';
      break;

    case 'json':
      content = JSON.stringify({
        filename: audioNote.originalFilename,
        duration: audioNote.duration,
        transcribedAt: audioNote.updatedAt,
        language: audioNote.transcriptionLanguage || 'auto',
        transcript: audioNote.transcript,
      }, null, 2);
      filename = `${baseName}-${timestamp}.json`;
      mimeType = 'application/json';
      break;

    default:
      return;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

// Audio Waveform Visualizer Component
function AudioWaveform({ analyser, isRecording }: { analyser: AnalyserNode | null; isRecording: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!analyser || !canvasRef.current || !isRecording) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
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

      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;

        // Gradient from accent color to red based on amplitude
        const hue = 340 + (dataArray[i] / 255) * 60;
        ctx.fillStyle = `hsla(${hue}, 80%, 50%, 0.8)`;

        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isRecording]);

  if (!isRecording) return null;

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={50}
      className="rounded-lg bg-black/30"
    />
  );
}

// Get icon for file type
function getFileTypeIcon(type: string) {
  switch (type) {
    case 'image':
      return Image;
    case 'audio':
      return FileAudio;
    case 'video':
      return Film;
    case 'document':
      return FileText;
    default:
      return File;
  }
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Note Attachments Component
function NoteAttachments({ projectId, noteId }: { projectId: string; noteId: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: attachmentsData, isLoading } = useNoteAttachments(projectId, noteId);
  const uploadAttachment = useUploadNoteAttachment(projectId, noteId);
  const deleteAttachment = useDeleteNoteAttachment(projectId, noteId);

  const attachments: NoteAttachment[] = Array.isArray(attachmentsData)
    ? attachmentsData
    : ((attachmentsData as any)?.data || []);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    // 100MB limit (GitHub API limit)
    if (file.size > MAX_ATTACHMENT_FILE_SIZE) {
      toast.error('File is too large. Maximum size is 100MB.');
      return;
    }

    try {
      await uploadAttachment.mutateAsync(file);
      toast.success('File uploaded');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload file');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDelete = async (attachmentId: number) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      await deleteAttachment.mutateAsync(attachmentId);
      toast.success('Attachment deleted');
    } catch {
      toast.error('Failed to delete attachment');
    }
  };

  if (isLoading) {
    return null;
  }

  // Show minimal attach button if no attachments and not expanded
  if (attachments.length === 0 && !isExpanded) {
    return (
      <div className="mt-2 flex items-center">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          disabled={uploadAttachment.isPending}
        >
          {uploadAttachment.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Paperclip className="h-3 w-3" />
              <span>Attach</span>
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-border/20">
      {/* Attachments header with toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Paperclip className="h-3 w-3" />
          <span>{attachments.length} file{attachments.length !== 1 ? 's' : ''}</span>
          {attachments.length > 0 && (
            isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
          )}
        </button>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadAttachment.isPending}
        >
          {uploadAttachment.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>

      {/* Expanded attachments list or drop zone */}
      {isExpanded && (
        <div
          className={`mt-1.5 rounded border border-dashed transition-colors ${
            isDragging
              ? 'border-accent-500 bg-accent-500/10'
              : 'border-border/40'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {attachments.length === 0 ? (
            <div className="px-2 py-1.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <span>Drop or</span>
              <button
                className="text-accent-400 hover:underline"
                onClick={() => fileInputRef.current?.click()}
              >
                browse
              </button>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {attachments.map((attachment) => {
                const Icon = getFileTypeIcon(attachment.type);
                return (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-secondary/50 group"
                  >
                    {/* Thumbnail or icon */}
                    {attachment.type === 'image' ? (
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-10 w-10 rounded overflow-hidden flex-shrink-0 bg-secondary"
                      >
                        <img
                          src={attachment.thumbnailUrl || attachment.url}
                          alt={attachment.originalFilename}
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ) : (
                      <div className="h-10 w-10 rounded bg-secondary flex items-center justify-center flex-shrink-0">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-foreground hover:text-accent-400 truncate block"
                      >
                        {attachment.originalFilename}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(attachment.size)}
                        {attachment.uploader?.name && ` • ${attachment.uploader.name}`}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Cloud storage badge when using Wasabi */}
                      {attachment.storageType === 'wasabi' && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="h-5 px-1.5 flex items-center gap-1 rounded bg-green-500/20 text-green-400 text-[10px] font-medium">
                                <Cloud className="h-3 w-3" />
                                Cloud
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="bg-secondary border">
                              Stored in Wasabi cloud storage
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {/* LFS badge when using LFS storage */}
                      {attachment.usedLfs && !attachment.storageType?.startsWith('wasabi') && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="h-5 px-1.5 flex items-center justify-center rounded bg-purple-500/20 text-purple-400 text-[10px] font-medium">
                                LFS
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="bg-secondary border">
                              Stored via Git LFS (Large File Storage)
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {/* GitHub link when synced */}
                      {attachment.githubUrl && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={attachment.githubUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-7 w-7 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                              >
                                <Github className="h-4 w-4" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent className="bg-secondary border">
                              View in GitHub{attachment.usedLfs ? ' (LFS)' : ''}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={attachment.url}
                              download={attachment.originalFilename}
                              className="h-7 w-7 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent className="bg-secondary border">
                            Download
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleDelete(attachment.id)}
                              className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-secondary border">
                            Delete
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                );
              })}

              {/* Drop zone hint when there are attachments */}
              <div
                className={`mt-2 p-2 rounded text-center text-xs text-muted-foreground/60 border border-dashed border-border/30 ${
                  isDragging ? 'bg-accent-500/10 border-accent-500' : ''
                }`}
              >
                Drop more files here
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsed preview thumbnails */}
      {!isExpanded && attachments.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {attachments.slice(0, 4).map((attachment) => {
            const Icon = getFileTypeIcon(attachment.type);
            return attachment.type === 'image' ? (
              <a
                key={attachment.id}
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 w-8 rounded overflow-hidden bg-secondary hover:ring-2 ring-accent-500/50"
              >
                <img
                  src={attachment.thumbnailUrl || attachment.url}
                  alt={attachment.originalFilename}
                  className="h-full w-full object-cover"
                />
              </a>
            ) : (
              <TooltipProvider key={attachment.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 w-8 rounded bg-secondary flex items-center justify-center hover:ring-2 ring-accent-500/50"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent className="bg-secondary border">
                    {attachment.originalFilename}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
          {attachments.length > 4 && (
            <button
              onClick={() => setIsExpanded(true)}
              className="h-8 px-2 rounded bg-secondary flex items-center justify-center text-xs text-muted-foreground hover:text-foreground"
            >
              +{attachments.length - 4} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function groupNotesIntoThreads(notes: ProjectNote[]): NoteThread[] {
  if (!notes || notes.length === 0) return [];

  const threads: NoteThread[] = [];
  const processedIds = new Set<number>();

  // Sort notes by date (oldest first for threading)
  const sortedNotes = [...notes].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const note of sortedNotes) {
    if (processedIds.has(note.id)) continue;

    const noteTopics = extractTopics(note.content);

    // Find related notes (share topics and within reasonable time)
    const relatedNotes = sortedNotes.filter(other => {
      if (other.id === note.id || processedIds.has(other.id)) return false;

      const otherTopics = extractTopics(other.content);
      const sharedTopics = noteTopics.filter(t => otherTopics.includes(t));

      // Must share at least one meaningful topic
      if (sharedTopics.length === 0) return false;

      // Check time proximity (within 7 days)
      const timeDiff = Math.abs(new Date(note.createdAt).getTime() - new Date(other.createdAt).getTime());
      const withinWeek = timeDiff < 7 * 24 * 60 * 60 * 1000;

      return withinWeek;
    });

    if (relatedNotes.length > 0) {
      // Create a thread
      const threadNotes = [note, ...relatedNotes].sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Find common topic
      const allTopics = threadNotes.flatMap(n => extractTopics(n.content));
      const topicCounts = allTopics.reduce((acc, t) => {
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const commonTopic = Object.entries(topicCounts)
        .filter(([_, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      threads.push({
        id: `thread-${note.id}`,
        topic: commonTopic,
        notes: threadNotes,
      });

      threadNotes.forEach(n => processedIds.add(n.id));
    } else {
      // Single note thread
      threads.push({
        id: `single-${note.id}`,
        topic: null,
        notes: [note],
      });
      processedIds.add(note.id);
    }
  }

  // Sort threads by most recent note
  return threads.sort((a, b) =>
    new Date(b.notes[b.notes.length - 1].createdAt).getTime() -
    new Date(a.notes[a.notes.length - 1].createdAt).getTime()
  );
}

export function ProjectNotesPanel({ projectId, githubUrl, externalDialogOpen, onExternalDialogOpenChange }: ProjectNotesPanelProps) {
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);

  // Use external control if provided, otherwise use internal state
  const isCreateDialogOpen = externalDialogOpen !== undefined ? externalDialogOpen : internalDialogOpen;
  const setIsCreateDialogOpen = onExternalDialogOpenChange || setInternalDialogOpen;
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ProjectNote | null>(null);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

  // Pending attachments for new note
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const createAttachmentInputRef = useRef<HTMLInputElement>(null);

  // Merge dialog state
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergeSourceNote, setMergeSourceNote] = useState<ProjectNote | null>(null);
  const [mergeTargetNote, setMergeTargetNote] = useState<ProjectNote | null>(null);

  // Voice dictation state
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const autoStartRef = useRef(false);

  // Audio recording state
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isAudioDialogOpen, setIsAudioDialogOpen] = useState(false);
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('auto');
  const [audioAnalyser, setAudioAnalyser] = useState<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio playback state
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<Record<number, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Search/filter state for transcripts
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState('');

  // @mention autocomplete state
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: notesData, isLoading } = useProjectNotes(projectId);
  const { data: audioNotesData, isLoading: isLoadingAudio } = useProjectAudioNotes(projectId);
  const createNote = useCreateProjectNote(projectId);
  const updateNote = useUpdateProjectNote(projectId);
  const deleteNote = useDeleteProjectNote(projectId);
  const createGitHubIssue = useCreateGitHubIssueFromNote(projectId);

  // Audio note hooks
  const createAudioNote = useCreateProjectAudioNote(projectId);
  const deleteAudioNote = useDeleteProjectAudioNote(projectId);
  const retryTranscription = useRetryAudioNoteTranscription(projectId);

  // Mentionable users for @mention autocomplete
  const { data: mentionableUsersData } = useMentionableUsers(projectId);
  const mentionableUsers: MentionableUser[] = Array.isArray(mentionableUsersData)
    ? mentionableUsersData
    : ((mentionableUsersData as any)?.data || []);

  // Extract array from potentially wrapped response
  const notes: ProjectNote[] = Array.isArray(notesData)
    ? notesData
    : ((notesData as any)?.data || []);

  // Extract audio notes array
  const audioNotes: ProjectAudioNote[] = Array.isArray(audioNotesData)
    ? audioNotesData
    : ((audioNotesData as any)?.data || []);

  // Filter mentionable users based on query
  const filteredMentionUsers = mentionableUsers.filter((user) =>
    mentionQuery
      ? user.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(mentionQuery.toLowerCase())
      : true
  ).slice(0, 5); // Limit to 5 suggestions

  // Handle @mention input detection
  const handleContentChange = useCallback((
    value: string,
    cursorPos: number,
    isEditing: boolean = false
  ) => {
    setContent(value);

    // Check for @ trigger
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setMentionStartPos(cursorPos - atMatch[0].length);
      setMentionQuery(atMatch[1]);
      setShowMentionPopup(true);
      setSelectedMentionIndex(0);
    } else {
      setShowMentionPopup(false);
      setMentionQuery('');
      setMentionStartPos(null);
    }
  }, []);

  // Insert selected mention into content
  const insertMention = useCallback((user: MentionableUser) => {
    if (mentionStartPos === null) return;

    const beforeMention = content.slice(0, mentionStartPos);
    const afterMention = content.slice(mentionStartPos + mentionQuery.length + 1); // +1 for @
    const mentionText = user.name.includes(' ') ? `@"${user.name}"` : `@${user.name.replace(/\s/g, '')}`;
    const newContent = beforeMention + mentionText + ' ' + afterMention;

    setContent(newContent);
    setShowMentionPopup(false);
    setMentionQuery('');
    setMentionStartPos(null);

    // Focus back to textarea
    const textarea = textareaRef.current || editTextareaRef.current;
    if (textarea) {
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = beforeMention.length + mentionText.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  }, [content, mentionStartPos, mentionQuery]);

  // Handle keyboard navigation in mention popup
  const handleMentionKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showMentionPopup || filteredMentionUsers.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedMentionIndex((prev) =>
          prev < filteredMentionUsers.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedMentionIndex((prev) =>
          prev > 0 ? prev - 1 : filteredMentionUsers.length - 1
        );
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        insertMention(filteredMentionUsers[selectedMentionIndex]);
        break;
      case 'Escape':
        setShowMentionPopup(false);
        break;
    }
  }, [showMentionPopup, filteredMentionUsers, selectedMentionIndex, insertMention]);

  // Initialize speech recognition
  const initSpeechRecognition = useCallback(() => {
    if (typeof window === 'undefined') return null;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.warn('Speech Recognition not supported');
      return null;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + ' ';
        } else {
          interim += transcript;
        }
      }

      if (final) {
        setContent(prev => prev + final);
        setInterimTranscript('');
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        toast.error(`Voice recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    return recognition;
  }, []);

  // Start listening
  const startListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = initSpeechRecognition();
    if (recognition) {
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
      }
    } else {
      toast.error('Speech recognition is not supported in your browser');
    }
  }, [initSpeechRecognition]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Auto-start voice when dialog opens
  useEffect(() => {
    if (isCreateDialogOpen && autoStartRef.current) {
      // Small delay to ensure dialog is fully rendered
      const timer = setTimeout(() => {
        startListening();
      }, 500);
      return () => clearTimeout(timer);
    }

    // Cleanup when dialog closes
    if (!isCreateDialogOpen && !isEditDialogOpen) {
      stopListening();
    }
  }, [isCreateDialogOpen, isEditDialogOpen, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  // Audio recording functions
  const startRecordingAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up audio context for waveform visualization
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      setAudioAnalyser(analyser);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        setAudioAnalyser(null);

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // Check file size
        if (audioBlob.size > MAX_ATTACHMENT_FILE_SIZE) {
          toast.error(`Recording is too large (${(audioBlob.size / (1024 * 1024)).toFixed(1)}MB). Maximum size is 100MB.`);
          return;
        }

        // Upload the audio with language preference
        try {
          await createAudioNote.mutateAsync({ file: audioBlob, language: transcriptionLanguage });
          toast.success('Audio uploaded, transcription started');
          setIsAudioDialogOpen(false);
        } catch (error: any) {
          console.error('Failed to upload audio:', error);
          toast.error(error?.message || 'Failed to upload audio');
        }
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecordingAudio(true);
      setRecordingTime(0);

      // Update recording time with auto-stop at max duration
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_RECORDING_DURATION - 1) {
            toast.warning('Maximum recording duration reached (10 minutes)');
            stopRecordingAudio();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (error) {
      console.error('Failed to start recording:', error);
      toast.error('Could not access microphone. Please check permissions.');
    }
  }, [createAudioNote, transcriptionLanguage]);

  const stopRecordingAudio = useCallback(() => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop();
      setIsRecordingAudio(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setAudioAnalyser(null);
    }
  }, [isRecordingAudio]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/m4a'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(webm|mp3|mp4|m4a|wav|ogg)$/i)) {
      toast.error('Please upload a valid audio file (webm, mp3, wav, m4a, ogg)');
      return;
    }

    // Validate file size
    if (file.size > MAX_ATTACHMENT_FILE_SIZE) {
      toast.error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum size is 100MB.`);
      return;
    }

    try {
      await createAudioNote.mutateAsync({ file, language: transcriptionLanguage });
      toast.success('Audio uploaded, transcription started');
      setIsAudioDialogOpen(false);
    } catch (error: any) {
      console.error('Failed to upload audio:', error);
      toast.error(error?.message || 'Failed to upload audio');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [createAudioNote, transcriptionLanguage]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleAudioPlayback = (audioNote: ProjectAudioNote) => {
    if (playingAudioId === audioNote.id) {
      // Stop current playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudioId(null);
    } else {
      // Stop previous playback
      if (audioRef.current) {
        audioRef.current.pause();
      }
      // Start new playback
      const audio = new Audio(audioNote.audioUrl);

      audio.ontimeupdate = () => {
        if (audio.duration) {
          setPlaybackProgress(prev => ({
            ...prev,
            [audioNote.id]: (audio.currentTime / audio.duration) * 100,
          }));
        }
      };

      audio.onended = () => {
        setPlayingAudioId(null);
        setPlaybackProgress(prev => ({ ...prev, [audioNote.id]: 0 }));
      };

      audio.onerror = () => {
        toast.error('Failed to play audio. The file may have expired.');
        setPlayingAudioId(null);
      };

      audio.play().catch(() => {
        toast.error('Failed to play audio. Please try again.');
        setPlayingAudioId(null);
      });

      audioRef.current = audio;
      setPlayingAudioId(audioNote.id);
    }
  };

  const handleDeleteAudioNote = async (audioId: number) => {
    if (!confirm('Delete this audio recording?')) return;
    try {
      await deleteAudioNote.mutateAsync(audioId);
      toast.success('Audio note deleted');
    } catch {
      toast.error('Failed to delete audio note');
    }
  };

  const handleRetryTranscription = async (audioId: number) => {
    try {
      await retryTranscription.mutateAsync(audioId);
      toast.success('Transcription retry started');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to retry transcription');
    }
  };

  const handleCreate = async () => {
    stopListening();
    if (!content.trim()) {
      toast.error('Please enter note content');
      return;
    }
    try {
      const newNote = await createNote.mutateAsync({
        content: content.trim(),
        subject: subject || undefined,
      });

      // Upload pending attachments if any
      if (pendingAttachments.length > 0 && newNote?.id) {
        const uploadPromises = pendingAttachments.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          try {
            await api.upload(`/api/projects/${projectId}/notes/${newNote.id}/attachments`, formData);
          } catch (err) {
            console.error('Failed to upload attachment:', file.name, err);
          }
        });
        await Promise.all(uploadPromises);
        if (pendingAttachments.length > 0) {
          toast.success(`Note created with ${pendingAttachments.length} attachment${pendingAttachments.length > 1 ? 's' : ''}`);
        }
      } else {
        toast.success('Note created');
      }

      setIsCreateDialogOpen(false);
      setSubject('');
      setContent('');
      setPendingAttachments([]);
      autoStartRef.current = false;
    } catch (error: any) {
      console.error('Failed to create note:', error);
      toast.error(error?.message || 'Failed to create note');
    }
  };

  // Open dialog with voice auto-start option
  const openCreateDialogWithVoice = (autoStartVoice: boolean = false) => {
    autoStartRef.current = autoStartVoice;
    setSubject('');
    setContent('');
    setPendingAttachments([]);
    setIsCreateDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingNote || !content.trim()) return;
    try {
      await updateNote.mutateAsync({
        noteId: editingNote.id,
        data: {
          content,
          subject: subject || null,
        },
      });
      toast.success('Note updated');
      setIsEditDialogOpen(false);
      setEditingNote(null);
      setSubject('');
      setContent('');
    } catch {
      toast.error('Failed to update note');
    }
  };

  const handleDelete = async (noteId: number) => {
    if (!confirm('Delete this note?')) return;
    try {
      await deleteNote.mutateAsync(noteId);
      toast.success('Note deleted');
    } catch {
      toast.error('Failed to delete note');
    }
  };

  // Open merge dialog
  const openMergeDialog = (sourceNote: ProjectNote, targetNote: ProjectNote) => {
    setMergeSourceNote(sourceNote);
    setMergeTargetNote(targetNote);
    setIsMergeDialogOpen(true);
  };

  // Handle merging two notes
  const handleMergeNotes = async () => {
    if (!mergeSourceNote || !mergeTargetNote) return;

    try {
      // Keep the older note, merge content from newer note
      const olderNote = new Date(mergeSourceNote.createdAt) < new Date(mergeTargetNote.createdAt)
        ? mergeSourceNote
        : mergeTargetNote;
      const newerNote = olderNote === mergeSourceNote ? mergeTargetNote : mergeSourceNote;

      // Combine content with a separator
      const mergedContent = `${olderNote.content}\n\n---\n[Merged from note on ${formatDate(newerNote.createdAt)}]\n${newerNote.content}`;

      // Update the older note with merged content
      await updateNote.mutateAsync({
        noteId: olderNote.id,
        data: {
          content: mergedContent,
          subject: olderNote.subject || newerNote.subject || null,
        },
      });

      // Delete the newer note
      await deleteNote.mutateAsync(newerNote.id);

      toast.success('Notes merged successfully');
      setIsMergeDialogOpen(false);
      setMergeSourceNote(null);
      setMergeTargetNote(null);
    } catch {
      toast.error('Failed to merge notes');
    }
  };

  const openEditDialog = (note: ProjectNote) => {
    setEditingNote(note);
    setSubject(note.subject || '');
    setContent(note.content);
    setIsEditDialogOpen(true);
  };

  const handleCreateGitHubIssue = async (note: ProjectNote) => {
    if (!githubUrl) {
      toast.error('No GitHub repository linked to this project');
      return;
    }
    try {
      const result = await createGitHubIssue.mutateAsync({ noteId: note.id });
      toast.success(
        <div className="flex items-center gap-2">
          <span>GitHub issue #{result.issueNumber} created</span>
          <a
            href={result.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-400 hover:underline inline-flex items-center gap-1"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      );
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create GitHub issue');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4">
            <Skeleton className="h-4 w-1/4 mb-2" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {notes?.length || 0} Note{notes?.length !== 1 ? 's' : ''}{audioNotes?.length > 0 && ` + ${audioNotes.length} Audio`}
        </h3>
        <div className="flex gap-2">
          {/* Upload Audio Transcript Dialog - Button hidden, accessed via context menu */}
          <Dialog open={isAudioDialogOpen} onOpenChange={(open) => {
            if (!open && isRecordingAudio) {
              stopRecordingAudio();
            }
            setIsAudioDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="hidden"
              >
                <FileAudio className="h-4 w-4 mr-1" />
                Record
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground flex items-center gap-2">
                  <FileAudio className="h-5 w-5" />
                  Audio Recording
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Record or upload an audio file. It will be automatically transcribed.
                </p>

                {/* Language Selection */}
                <div className="flex items-center gap-3">
                  <Languages className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={transcriptionLanguage}
                    onValueChange={setTranscriptionLanguage}
                  >
                    <SelectTrigger className="flex-1 bg-secondary border">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border">
                      {TRANSCRIPTION_LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Recording Controls */}
                <div className="flex flex-col items-center gap-4 py-6">
                  {isRecordingAudio ? (
                    <>
                      {/* Waveform Visualization */}
                      <AudioWaveform analyser={audioAnalyser} isRecording={isRecordingAudio} />

                      <div className="flex items-center gap-2 text-red-400">
                        <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-2xl font-mono">{formatDuration(recordingTime)}</span>
                        <span className="text-xs text-muted-foreground">
                          / {formatDuration(MAX_RECORDING_DURATION)}
                        </span>
                      </div>

                      {/* Progress bar for recording duration */}
                      <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500 transition-all duration-1000"
                          style={{ width: `${(recordingTime / MAX_RECORDING_DURATION) * 100}%` }}
                        />
                      </div>

                      <Button
                        variant="destructive"
                        size="lg"
                        onClick={stopRecordingAudio}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        <Square className="h-5 w-5 mr-2" />
                        Stop Recording
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="lg"
                        onClick={startRecordingAudio}
                        disabled={createAudioNote.isPending}
                        className="bg-accent-600 hover:bg-accent-700 text-white"
                      >
                        {createAudioNote.isPending ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Mic className="h-5 w-5 mr-2" />
                            Start Recording
                          </>
                        )}
                      </Button>

                      <div className="text-center text-muted-foreground text-sm">or</div>

                      {/* File Upload */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*,.webm,.mp3,.wav,.m4a,.ogg"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={createAudioNote.isPending}
                        className="border text-foreground"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Audio File
                      </Button>

                      <p className="text-xs text-muted-foreground text-center">
                        Max file size: 100MB | Max duration: 10 minutes
                      </p>
                    </>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Note Button - Auto-starts dictation */}
          <Button
            size="sm"
            variant="outline"
            className="bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30 hover:border-green-500/70 hover:text-green-300 backdrop-blur-sm"
            onClick={() => openCreateDialogWithVoice(true)}
          >
            <Mic className="h-4 w-4 mr-1" />
            Add Note
          </Button>
          {/* Regular Add Note Button - Hidden, dialog opened via green button */}
          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
            if (!open) {
              stopListening();
              autoStartRef.current = false;
            }
            setIsCreateDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="hidden">
                <Plus className="h-4 w-4 mr-1" />
                Add Note
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground flex items-center gap-2">
                  Add Note
                  {isListening && (
                    <span className="flex items-center gap-1 text-sm font-normal text-red-400">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      Recording...
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Button
                      type="button"
                      variant={isListening ? 'destructive' : 'outline'}
                      size="sm"
                      onClick={toggleListening}
                      className={isListening ? 'bg-red-600 hover:bg-red-700' : 'border'}
                    >
                      {isListening ? (
                        <>
                          <Square className="h-3 w-3 mr-1" />
                          Stop
                        </>
                      ) : (
                        <>
                          <Mic className="h-3 w-3 mr-1" />
                          Dictate
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      placeholder={isListening ? "Listening... speak now" : "Write your note... Use @ to mention someone"}
                      value={content + interimTranscript}
                      onChange={(e) => {
                        if (!isListening) {
                          handleContentChange(e.target.value, e.target.selectionStart || 0);
                        }
                      }}
                      onKeyDown={handleMentionKeyDown}
                      className={`mt-1 bg-secondary border text-foreground min-h-40 ${isListening ? 'border-red-500/50' : ''}`}
                      required
                      autoFocus
                    />
                    {/* @mention autocomplete popup */}
                    {showMentionPopup && filteredMentionUsers.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1 bg-secondary border rounded-lg shadow-lg z-50 overflow-hidden">
                        {filteredMentionUsers.map((user, index) => (
                          <button
                            key={user.id}
                            type="button"
                            className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-accent-500/20 ${
                              index === selectedMentionIndex ? 'bg-accent-500/20' : ''
                            }`}
                            onClick={() => insertMention(user)}
                          >
                            <div className="h-6 w-6 rounded-full bg-accent-500/30 flex items-center justify-center text-xs text-accent-400 uppercase">
                              {user.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-foreground truncate">{user.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                            </div>
                            <span className="text-xs text-muted-foreground/50 capitalize">{user.type}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {isListening && (
                      <div className="absolute bottom-2 right-2">
                        <div className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse delay-75" />
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse delay-150" />
                        </div>
                      </div>
                    )}
                  </div>
                  {interimTranscript && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      Hearing: {interimTranscript}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Type @ to mention team members or contacts
                  </p>
                </div>

                {/* Attachments Section */}
                <div className="border border-dashed border-border/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Paperclip className="h-4 w-4" />
                      <span>Attachments</span>
                      {pendingAttachments.length > 0 && (
                        <span className="text-xs bg-accent-500/20 text-accent-400 px-1.5 py-0.5 rounded">
                          {pendingAttachments.length}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => createAttachmentInputRef.current?.click()}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add File
                    </Button>
                    <input
                      ref={createAttachmentInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          const newFiles = Array.from(e.target.files);
                          setPendingAttachments(prev => [...prev, ...newFiles]);
                        }
                        e.target.value = '';
                      }}
                    />
                  </div>
                  {pendingAttachments.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 text-center py-2">
                      No attachments. Click "Add File" to attach files to this note.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {pendingAttachments.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-2 p-2 bg-secondary/50 rounded text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {file.type.startsWith('image/') ? (
                              <Image className="h-4 w-4 text-blue-400 shrink-0" />
                            ) : file.type.startsWith('video/') ? (
                              <Film className="h-4 w-4 text-purple-400 shrink-0" />
                            ) : file.type.startsWith('audio/') ? (
                              <FileAudio className="h-4 w-4 text-green-400 shrink-0" />
                            ) : (
                              <File className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="truncate">{file.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                            onClick={() => {
                              setPendingAttachments(prev => prev.filter((_, i) => i !== index));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 border text-foreground"
                    onClick={() => {
                      stopListening();
                      setIsCreateDialogOpen(false);
                      setSubject('');
                      setContent('');
                      setPendingAttachments([]);
                      autoStartRef.current = false;
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-300"
                    onClick={handleCreate}
                    disabled={!content.trim() || createNote.isPending}
                  >
                    {createNote.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Note'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Audio Notes Section */}
      {audioNotes && audioNotes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileAudio className="h-4 w-4 text-accent-400" />
              <span className="text-sm font-medium text-muted-foreground">Audio Recordings</span>
            </div>
            {/* Search transcripts */}
            <div className="relative w-48">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search transcripts..."
                value={transcriptSearchQuery}
                onChange={(e) => setTranscriptSearchQuery(e.target.value)}
                className="h-8 pl-7 text-xs bg-secondary border"
              />
            </div>
          </div>
          {audioNotes
            .filter((note) =>
              !transcriptSearchQuery ||
              note.transcript?.toLowerCase().includes(transcriptSearchQuery.toLowerCase()) ||
              note.originalFilename?.toLowerCase().includes(transcriptSearchQuery.toLowerCase())
            )
            .map((audioNote) => (
            <Card key={audioNote.id} className="bg-secondary/50 border border-accent-500/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Author Avatar */}
                  <div className="flex-shrink-0">
                    {audioNote.author?.avatar ? (
                      <img
                        src={audioNote.author.avatar}
                        alt={audioNote.author?.name || 'Author'}
                        className="w-10 h-10 rounded-full object-cover border-2 border-accent-500/30"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-accent-500/20 border-2 border-accent-500/30 flex items-center justify-center">
                        <span className="text-sm font-semibold text-accent-400">
                          {(audioNote.author?.name || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Author Name & Time */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-foreground">
                        {audioNote.author?.name || 'Unknown'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(audioNote.createdAt)}
                      </span>
                    </div>

                    {/* Audio Player Controls */}
                    <div className="flex items-center gap-3 mb-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAudioPlayback(audioNote)}
                        disabled={!audioNote.audioUrl}
                        className="h-10 w-10 rounded-full p-0 border-accent-500/50 flex-shrink-0"
                      >
                        {playingAudioId === audioNote.id ? (
                          <Pause className="h-5 w-5 text-accent-400" />
                        ) : (
                          <Play className="h-5 w-5 text-accent-400 ml-0.5" />
                        )}
                      </Button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground truncate">{audioNote.originalFilename}</span>
                          {audioNote.duration && (
                            <span className="text-xs text-muted-foreground/60 flex-shrink-0">
                              {formatDuration(audioNote.duration)}
                            </span>
                          )}
                          {audioNote.transcriptionLanguage && audioNote.transcriptionLanguage !== 'auto' && (
                            <span className="text-xs bg-accent-500/20 text-accent-400 px-1.5 py-0.5 rounded flex-shrink-0">
                              {TRANSCRIPTION_LANGUAGES.find(l => l.code === audioNote.transcriptionLanguage)?.label || audioNote.transcriptionLanguage}
                            </span>
                          )}
                        </div>

                        {/* Playback Progress Bar */}
                        {playingAudioId === audioNote.id && (
                          <div className="mt-2 w-full h-1 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent-500 transition-all duration-200"
                              style={{ width: `${playbackProgress[audioNote.id] || 0}%` }}
                            />
                          </div>
                        )}

                        {/* Transcription Status */}
                        <div className="mt-1">
                          {audioNote.transcriptionStatus === 'pending' && (
                            <span className="text-xs text-yellow-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Queued for transcription...
                            </span>
                          )}
                          {audioNote.transcriptionStatus === 'processing' && (
                            <span className="text-xs text-blue-400 flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Transcribing audio...
                            </span>
                          )}
                          {audioNote.transcriptionStatus === 'failed' && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-red-400 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {audioNote.transcriptionError || 'Transcription failed'}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRetryTranscription(audioNote.id)}
                                className="h-6 px-2 text-xs text-accent-400 hover:text-accent-300"
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Retry
                              </Button>
                            </div>
                          )}
                          {audioNote.transcriptionStatus === 'completed' && audioNote.transcript && (
                            <span className="text-xs text-green-400 flex items-center gap-1">
                              Transcribed successfully
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Transcript */}
                    {audioNote.transcriptionStatus === 'completed' && audioNote.transcript && (
                      <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {highlightSearchMatch(audioNote.transcript, transcriptSearchQuery)}
                        </p>
                        {/* Export buttons */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
                          <span className="text-xs text-muted-foreground">Export:</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => exportTranscript(audioNote, 'txt')}
                          >
                            TXT
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => exportTranscript(audioNote, 'srt')}
                          >
                            SRT
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => exportTranscript(audioNote, 'json')}
                          >
                            JSON
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              navigator.clipboard.writeText(audioNote.transcript || '');
                              toast.success('Transcript copied to clipboard');
                            }}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-secondary border">
                      {audioNote.transcriptionStatus === 'failed' && (
                        <DropdownMenuItem
                          onClick={() => handleRetryTranscription(audioNote.id)}
                          className="text-foreground cursor-pointer"
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Retry Transcription
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleDeleteAudioNote(audioNote.id)}
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
      )}

      {/* Text Notes Section */}
      {notes && notes.length > 0 ? (
        <div className="space-y-4">
          {groupNotesIntoThreads(notes).map((thread) => (
            <div key={thread.id}>
              {/* Thread Header - only show for multi-note threads */}
              {thread.notes.length > 1 && thread.topic && (
                <div className="flex items-center gap-2 mb-2 px-2">
                  <div className="h-px flex-1 bg-accent-500/30" />
                  <span className="text-xs text-accent-400 font-medium px-2 py-0.5 bg-accent-500/10 rounded-full capitalize">
                    {thread.topic}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {thread.notes.length} updates
                  </span>
                  <div className="h-px flex-1 bg-accent-500/30" />
                </div>
              )}

              {/* Notes in thread */}
              <div className={thread.notes.length > 1 ? 'relative pl-4' : ''}>
                {/* Timeline line for multi-note threads */}
                {thread.notes.length > 1 && (
                  <div className="absolute left-[7px] top-4 bottom-4 w-0.5 bg-accent-500/30" />
                )}

                <div className="space-y-2">
                  {thread.notes.map((note: ProjectNote, noteIndex: number) => {
                    const similarNotes = findSimilarNotes(note, notes);
                    const hasSimilar = similarNotes.length > 0;
                    const isFirst = noteIndex === 0;
                    const isLast = noteIndex === thread.notes.length - 1;
                    const isThreaded = thread.notes.length > 1;

                    return (
                      <div key={note.id} className="relative">
                        {/* Timeline dot */}
                        {isThreaded && (
                          <div className={`absolute -left-4 top-4 w-3 h-3 rounded-full border-2 ${
                            isLast
                              ? 'bg-accent-500 border-accent-400'
                              : 'bg-secondary border-accent-500/50'
                          }`} />
                        )}

                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <Card
                              className={`bg-secondary/50 border ${hasSimilar ? 'border-amber-500/50' : ''} ${
                                isThreaded && isLast ? 'border-accent-500/50' : ''
                              } cursor-context-menu`}
                            >
                              <CardContent className="p-4">
                            {/* Similarity Warning Banner */}
                            {hasSimilar && (
                              <div className="flex items-center justify-between gap-2 mb-3 p-2 bg-amber-500/10 rounded-lg border border-amber-500/30">
                                <div className="flex items-center gap-2 text-amber-400 text-xs">
                                  <AlertTriangle className="h-4 w-4" />
                                  <span>Similar to {similarNotes.length} other note{similarNotes.length > 1 ? 's' : ''}</span>
                                </div>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/20"
                                        onClick={() => openMergeDialog(note, similarNotes[0])}
                                      >
                                        <Merge className="h-3.5 w-3.5 mr-1" />
                                        Merge
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-secondary border">
                                      <p>Combine these similar notes into one</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            )}

                            <div className="flex items-start gap-3">
                              {/* Author Avatar */}
                              <div className="flex-shrink-0">
                                {(note.author?.avatar || note.user?.avatar) ? (
                                  <img
                                    src={note.author?.avatar || note.user?.avatar}
                                    alt={note.author?.name || note.user?.name || 'Author'}
                                    className="w-10 h-10 rounded-full object-cover border-2 border-accent-500/30"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-accent-500/20 border-2 border-accent-500/30 flex items-center justify-center">
                                    <span className="text-sm font-semibold text-accent-400">
                                      {(note.author?.name || note.user?.name || 'U').charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                {/* Author Name & Time */}
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-sm font-semibold ${isThreaded && isLast ? 'text-accent-400' : 'text-foreground'}`}>
                                    {note.author?.name || note.user?.name || 'Unknown'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(note.createdAt)}
                                    {note.updatedAt !== note.createdAt && ' (edited)'}
                                  </span>
                                </div>

                                {note.subject && (
                                  <h4 className="font-medium text-foreground mb-1">{note.subject}</h4>
                                )}
                                <p className="text-base text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                  {note.content}
                                </p>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-secondary border">
                                  <DropdownMenuItem
                                    onClick={() => openEditDialog(note)}
                                    className="text-foreground cursor-pointer"
                                  >
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => setIsAudioDialogOpen(true)}
                                    className="text-foreground cursor-pointer"
                                  >
                                    <Mic className="mr-2 h-4 w-4" />
                                    Upload Audio Transcript
                                  </DropdownMenuItem>
                                  {hasSimilar && (
                                    <DropdownMenuItem
                                      onClick={() => openMergeDialog(note, similarNotes[0])}
                                      className="text-amber-400 cursor-pointer"
                                    >
                                      <Merge className="mr-2 h-4 w-4" />
                                      Merge with similar
                                    </DropdownMenuItem>
                                  )}
                                  {githubUrl && (
                                    <DropdownMenuItem
                                      onClick={() => handleCreateGitHubIssue(note)}
                                      className="text-foreground cursor-pointer"
                                      disabled={createGitHubIssue.isPending}
                                    >
                                      <Github className="mr-2 h-4 w-4" />
                                      {createGitHubIssue.isPending ? 'Creating...' : 'Create GitHub Issue'}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(note.id)}
                                    className="text-red-400 cursor-pointer"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {/* Note Attachments */}
                            <NoteAttachments projectId={projectId} noteId={note.id} />
                          </CardContent>
                            </Card>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="bg-secondary border">
                            <ContextMenuItem
                              onClick={() => openEditDialog(note)}
                              className="cursor-pointer"
                            >
                              <Edit2 className="mr-2 h-4 w-4" />
                              Edit
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => setIsAudioDialogOpen(true)}
                              className="cursor-pointer"
                            >
                              <Mic className="mr-2 h-4 w-4" />
                              Upload Audio Transcript
                            </ContextMenuItem>
                            {hasSimilar && (
                              <ContextMenuItem
                                onClick={() => openMergeDialog(note, similarNotes[0])}
                                className="text-amber-400 cursor-pointer"
                              >
                                <Merge className="mr-2 h-4 w-4" />
                                Merge with similar
                              </ContextMenuItem>
                            )}
                            {githubUrl && (
                              <ContextMenuItem
                                onClick={() => handleCreateGitHubIssue(note)}
                                className="cursor-pointer"
                                disabled={createGitHubIssue.isPending}
                              >
                                <Github className="mr-2 h-4 w-4" />
                                Create GitHub Issue
                              </ContextMenuItem>
                            )}
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => handleDelete(note.id)}
                              className="text-red-400 cursor-pointer"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : audioNotes.length === 0 && (
        <Card className="bg-secondary/50 border">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <StickyNote className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No notes yet</p>
            <p className="text-muted-foreground text-xs">Add notes or record audio to keep track of project details</p>
          </CardContent>
        </Card>
      )}

      {/* Edit Note Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          stopListening();
        }
        setIsEditDialogOpen(open);
      }}>
        <DialogContent className="bg-card border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              Edit Note
              {isListening && (
                <span className="flex items-center gap-1 text-sm font-normal text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  Recording...
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-muted-foreground text-sm">Subject</Label>
              <Input
                placeholder="Note subject..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-muted-foreground text-sm">Content *</Label>
                <Button
                  type="button"
                  variant={isListening ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={toggleListening}
                  className={isListening ? 'bg-red-600 hover:bg-red-700' : 'border'}
                >
                  {isListening ? (
                    <>
                      <Square className="h-3 w-3 mr-1" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Mic className="h-3 w-3 mr-1" />
                      Dictate
                    </>
                  )}
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  ref={editTextareaRef}
                  placeholder={isListening ? "Listening... speak now" : "Write your note... Use @ to mention someone"}
                  value={content + interimTranscript}
                  onChange={(e) => {
                    if (!isListening) {
                      handleContentChange(e.target.value, e.target.selectionStart || 0, true);
                    }
                  }}
                  onKeyDown={handleMentionKeyDown}
                  className={`mt-1 bg-secondary border text-foreground min-h-32 ${isListening ? 'border-red-500/50' : ''}`}
                  required
                />
                {/* @mention autocomplete popup */}
                {showMentionPopup && filteredMentionUsers.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-secondary border rounded-lg shadow-lg z-50 overflow-hidden">
                    {filteredMentionUsers.map((user, index) => (
                      <button
                        key={user.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-accent-500/20 ${
                          index === selectedMentionIndex ? 'bg-accent-500/20' : ''
                        }`}
                        onClick={() => insertMention(user)}
                      >
                        <div className="h-6 w-6 rounded-full bg-accent-500/30 flex items-center justify-center text-xs text-accent-400 uppercase">
                          {user.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground truncate">{user.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                        </div>
                        <span className="text-xs text-muted-foreground/50 capitalize">{user.type}</span>
                      </button>
                    ))}
                  </div>
                )}
                {isListening && (
                  <div className="absolute bottom-2 right-2">
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse delay-75" />
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse delay-150" />
                    </div>
                  </div>
                )}
              </div>
              {interimTranscript && (
                <p className="text-xs text-muted-foreground mt-1 italic">
                  Hearing: {interimTranscript}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Type @ to mention team members or contacts
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 border text-foreground"
                onClick={() => {
                  stopListening();
                  setIsEditDialogOpen(false);
                  setEditingNote(null);
                  setSubject('');
                  setContent('');
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
                onClick={() => {
                  stopListening();
                  handleUpdate();
                }}
                disabled={!content.trim() || updateNote.isPending}
              >
                {updateNote.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge Notes Dialog */}
      <Dialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen}>
        <DialogContent className="bg-card border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Merge className="h-5 w-5 text-amber-400" />
              Merge Similar Notes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              These notes appear to be about the same topic. Merging will combine their content into one note.
            </p>

            {mergeSourceNote && mergeTargetNote && (
              <div className="space-y-3">
                <div className="p-3 bg-secondary rounded-lg border">
                  <p className="text-xs text-muted-foreground mb-1">
                    {formatDate(mergeSourceNote.createdAt)}
                  </p>
                  <p className="text-sm text-foreground">{mergeSourceNote.content}</p>
                </div>
                <div className="flex justify-center">
                  <div className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                    + merge with
                  </div>
                </div>
                <div className="p-3 bg-secondary rounded-lg border">
                  <p className="text-xs text-muted-foreground mb-1">
                    {formatDate(mergeTargetNote.createdAt)}
                  </p>
                  <p className="text-sm text-foreground">{mergeTargetNote.content}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 border text-foreground"
                onClick={() => {
                  setIsMergeDialogOpen(false);
                  setMergeSourceNote(null);
                  setMergeTargetNote(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleMergeNotes}
                disabled={updateNote.isPending || deleteNote.isPending}
              >
                {updateNote.isPending || deleteNote.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <Merge className="mr-2 h-4 w-4" />
                    Merge Notes
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
