'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  StickyNote,
  Plus,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
  X,
  Send,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useDealNotes,
  useCreateDealNote,
  useUpdateDealNote,
  useDeleteDealNote,
  formatRelativeTime,
  type DealNote,
} from '@/hooks/use-deal-notes';

interface PropertyNotesSectionProps {
  propertyId: string;
}

export function PropertyNotesSection({ propertyId }: PropertyNotesSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: notes, isLoading, error, refetch } = useDealNotes(propertyId);
  const createNote = useCreateDealNote(propertyId);
  const updateNote = useUpdateDealNote(propertyId);
  const deleteNote = useDeleteDealNote(propertyId);

  // Auto-focus textarea when adding
  useEffect(() => {
    if (isAdding && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isAdding]);

  // Auto-focus when editing
  useEffect(() => {
    if (editingId && editTextareaRef.current) {
      editTextareaRef.current.focus();
      // Move cursor to end
      editTextareaRef.current.selectionStart = editTextareaRef.current.value.length;
    }
  }, [editingId]);

  const handleCreateNote = async () => {
    if (!newNoteContent.trim()) {
      toast.error('Please enter a note');
      return;
    }

    try {
      await createNote.mutateAsync({ content: newNoteContent.trim() });
      toast.success('Note added');
      setNewNoteContent('');
      setIsAdding(false);
    } catch (err: any) {
      console.error('Create note error:', err);
      toast.error(err?.message || 'Failed to add note');
    }
  };

  const handleUpdateNote = async (noteId: number) => {
    if (!editContent.trim()) {
      toast.error('Note cannot be empty');
      return;
    }

    try {
      await updateNote.mutateAsync({
        noteId,
        updates: { content: editContent.trim() },
      });
      toast.success('Note updated');
      setEditingId(null);
      setEditContent('');
    } catch (err: any) {
      console.error('Update note error:', err);
      if (err?.message?.includes('author')) {
        toast.error('Only the author can edit this note');
      } else {
        toast.error(err?.message || 'Failed to update note');
      }
    }
  };

  const handleDeleteNote = async (note: DealNote) => {
    if (!confirm('Delete this note?')) return;

    try {
      await deleteNote.mutateAsync(note.id);
      toast.success('Note deleted');
    } catch (err: any) {
      console.error('Delete note error:', err);
      if (err?.message?.includes('author')) {
        toast.error('Only the author can delete this note');
      } else {
        toast.error(err?.message || 'Failed to delete note');
      }
    }
  };

  const startEditing = (note: DealNote) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent('');
  };

  const cancelAdding = () => {
    setIsAdding(false);
    setNewNoteContent('');
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (
    e: React.KeyboardEvent,
    action: 'create' | 'update',
    noteId?: number
  ) => {
    if (e.key === 'Escape') {
      if (action === 'create') {
        cancelAdding();
      } else {
        cancelEditing();
      }
    }
    // Cmd/Ctrl + Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (action === 'create') {
        handleCreateNote();
      } else if (noteId) {
        handleUpdateNote(noteId);
      }
    }
  };

  return (
    <Card className="bg-card border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-foreground text-base">
            <StickyNote className="h-4 w-4 text-yellow-500" />
            Notes
            {notes && notes.length > 0 && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                {notes.length}
              </Badge>
            )}
          </CardTitle>
          {!isAdding && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAdding(true)}
              className="h-8 px-3 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Note
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add Note Inline Form */}
        {isAdding && (
          <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
            <Textarea
              ref={textareaRef}
              placeholder="Write your note..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'create')}
              rows={3}
              className="resize-none bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-yellow-500/50 mb-2"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Press <kbd className="px-1 py-0.5 bg-secondary rounded text-[10px]">Cmd+Enter</kbd> to save
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelAdding}
                  disabled={createNote.isPending}
                  className="h-8 px-2"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateNote}
                  disabled={createNote.isPending || !newNoteContent.trim()}
                  className="h-8 px-3 bg-yellow-600 hover:bg-yellow-700 text-white"
                >
                  {createNote.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load notes</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {error.message || 'Please try again'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="mt-2 text-muted-foreground hover:text-foreground"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Notes List */}
        {!isLoading && !error && notes && notes.length > 0 && (
          <div className="space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className={cn(
                  'group p-3 rounded-lg transition-colors border',
                  editingId === note.id
                    ? 'bg-yellow-500/10 border-yellow-500/30'
                    : 'bg-secondary/30 border-transparent hover:bg-secondary/50 hover:border-border'
                )}
              >
                {editingId === note.id ? (
                  // Edit Mode
                  <div>
                    <Textarea
                      ref={editTextareaRef}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'update', note.id)}
                      rows={3}
                      className="resize-none bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-yellow-500/50 mb-2"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelEditing}
                        disabled={updateNote.isPending}
                        className="h-7 px-2"
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleUpdateNote(note.id)}
                        disabled={updateNote.isPending || !editContent.trim()}
                        className="h-7 px-2 bg-yellow-600 hover:bg-yellow-700 text-white"
                      >
                        {updateNote.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Save
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-start gap-3">
                    {/* Author Avatar */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-yellow-500 to-amber-500 flex items-center justify-center text-xs font-bold text-white">
                      {note.author.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground truncate">
                          {note.author.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(note.createdAt)}
                        </span>
                        {note.updatedAt !== note.createdAt && (
                          <span className="text-xs text-muted-foreground/70 italic">
                            (edited)
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                        {note.content}
                      </p>
                    </div>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border">
                        <DropdownMenuItem
                          onClick={() => startEditing(note)}
                          className="text-foreground"
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteNote(note)}
                          className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && (!notes || notes.length === 0) && !isAdding && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <StickyNote className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No notes yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Add notes to track important details about this deal
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAdding(true)}
              className="mt-4 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add First Note
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
