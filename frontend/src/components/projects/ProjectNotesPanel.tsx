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
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useProjectNotes,
  useCreateProjectNote,
  useUpdateProjectNote,
  useDeleteProjectNote,
  useCreateGitHubIssueFromNote,
} from '@/hooks/use-project-notes';
import { toast } from 'sonner';
import type { ProjectNote } from '@/types';

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

  // Merge dialog state
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergeSourceNote, setMergeSourceNote] = useState<ProjectNote | null>(null);
  const [mergeTargetNote, setMergeTargetNote] = useState<ProjectNote | null>(null);

  // Voice dictation state
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const autoStartRef = useRef(false);

  const { data: notes, isLoading } = useProjectNotes(projectId);
  const createNote = useCreateProjectNote(projectId);
  const updateNote = useUpdateProjectNote(projectId);
  const deleteNote = useDeleteProjectNote(projectId);
  const createGitHubIssue = useCreateGitHubIssueFromNote(projectId);

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
    };
  }, []);

  const handleCreate = async () => {
    stopListening();
    if (!content.trim()) {
      toast.error('Please enter note content');
      return;
    }
    try {
      await createNote.mutateAsync({
        content: content.trim(),
        subject: subject || undefined,
      });
      toast.success('Note created');
      setIsCreateDialogOpen(false);
      setSubject('');
      setContent('');
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
          {notes?.length || 0} Note{notes?.length !== 1 ? 's' : ''}
        </h3>
        <div className="flex gap-2">
          {/* Voice Note Button - Auto-starts dictation */}
          <Button
            size="sm"
            variant="outline"
            className="border text-foreground"
            onClick={() => openCreateDialogWithVoice(true)}
          >
            <Mic className="h-4 w-4 mr-1" />
            Voice
          </Button>
          {/* Regular Add Note Button */}
          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
            if (!open) {
              stopListening();
              autoStartRef.current = false;
            }
            setIsCreateDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-accent-600 hover:bg-accent-700 text-white">
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
                      placeholder={isListening ? "Listening... speak now" : "Write your note..."}
                      value={content + interimTranscript}
                      onChange={(e) => {
                        if (!isListening) {
                          setContent(e.target.value);
                        }
                      }}
                      className={`mt-1 bg-secondary border text-foreground min-h-40 ${isListening ? 'border-red-500/50' : ''}`}
                      required
                      autoFocus
                    />
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

                        <Card
                          className={`bg-secondary/50 border ${hasSimilar ? 'border-amber-500/50' : ''} ${
                            isThreaded && isLast ? 'border-accent-500/50' : ''
                          }`}
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

                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                {note.subject && (
                                  <h4 className="font-medium text-foreground mb-1">{note.subject}</h4>
                                )}
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                  {note.content}
                                </p>
                                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                                  <span className={isThreaded && isLast ? 'text-accent-400 font-medium' : ''}>
                                    {note.author?.name || note.user?.name || 'Unknown'}
                                  </span>
                                  <span>•</span>
                                  <span>{formatDate(note.createdAt)}</span>
                                  {note.updatedAt !== note.createdAt && (
                                    <>
                                      <span>•</span>
                                      <span className="italic">edited</span>
                                    </>
                                  )}
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
                                    onClick={() => openEditDialog(note)}
                                    className="text-foreground cursor-pointer"
                                  >
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    Edit
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
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="bg-secondary/50 border">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <StickyNote className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No notes yet</p>
            <p className="text-muted-foreground text-xs">Add notes to keep track of project details</p>
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
                  placeholder={isListening ? "Listening... speak now" : "Write your note..."}
                  value={content + interimTranscript}
                  onChange={(e) => {
                    if (!isListening) {
                      setContent(e.target.value);
                    }
                  }}
                  className={`mt-1 bg-secondary border text-foreground min-h-32 ${isListening ? 'border-red-500/50' : ''}`}
                  required
                />
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
