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
} from 'lucide-react';
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
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectNotesPanel({ projectId, githubUrl }: ProjectNotesPanelProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ProjectNote | null>(null);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

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
                  <Label className="text-muted-foreground text-sm">Subject (optional)</Label>
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
                      placeholder={isListening ? "Listening... speak now" : "Write your note or click Dictate to use voice..."}
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
                      setIsCreateDialogOpen(false);
                      setSubject('');
                      setContent('');
                      autoStartRef.current = false;
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
                    onClick={handleCreate}
                    disabled={!content.trim() || createNote.isPending}
                  >
                    {createNote.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Note'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {notes && notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note: ProjectNote) => (
            <Card key={note.id} className="bg-secondary/50 border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {note.subject && (
                      <h4 className="font-medium text-foreground mb-1">{note.subject}</h4>
                    )}
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {note.content}
                    </p>
                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span>{note.author?.name || note.user?.name || 'Unknown'}</span>
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
    </div>
  );
}
