'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import {
  StickyNote,
  CirclePlus,
  Github,
  Share2,
  Copy,
  Check,
  ExternalLink,
  UserPlus,
  Bot,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { SpriteLaunchButton } from '@/components/sprites';
import { useProject } from '@/hooks/use-projects';
import { useCreateGitHubIssue } from '@/hooks/use-github-repo';
import { useCreateProjectNote } from '@/hooks/use-project-notes';

interface ProjectHeaderActionsProps {
  projectId: string;
}

export function ProjectHeaderActions({ projectId }: ProjectHeaderActionsProps) {
  const { data: project, isLoading } = useProject(projectId);
  const createNote = useCreateProjectNote();
  const createIssue = useCreateGitHubIssue();

  const [isAddNoteDialogOpen, setIsAddNoteDialogOpen] = useState(false);
  const [isNewIssueDialogOpen, setIsNewIssueDialogOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Note form state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Issue form state
  const [issueTitle, setIssueTitle] = useState('');
  const [issueBody, setIssueBody] = useState('');

  if (isLoading || !project) {
    return null;
  }

  const handleCopyPublicLink = () => {
    const publicUrl = `${window.location.origin}/projects/${project.id}/public`;
    navigator.clipboard.writeText(publicUrl);
    setLinkCopied(true);
    toast.success('Public link copied!');
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) {
      toast.error('Note content is required');
      return;
    }

    try {
      await createNote.mutateAsync({
        projectId: project.id,
        title: noteTitle || undefined,
        content: noteContent,
      });
      toast.success('Note added');
      setIsAddNoteDialogOpen(false);
      setNoteTitle('');
      setNoteContent('');
    } catch (error) {
      toast.error('Failed to add note');
    }
  };

  const handleCreateIssue = async () => {
    if (!issueTitle.trim()) {
      toast.error('Issue title is required');
      return;
    }

    try {
      await createIssue.mutateAsync({
        repoUrl: project.githubUrl!,
        title: issueTitle,
        body: issueBody,
      });
      toast.success('Issue created on GitHub');
      setIsNewIssueDialogOpen(false);
      setIssueTitle('');
      setIssueBody('');
    } catch (error) {
      toast.error('Failed to create issue');
    }
  };

  return (
    <>
      <div className="hidden md:flex items-center gap-2 mr-3 border-r border-border/50 pr-3">
        {/* Add Note */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-muted-foreground hover:text-foreground gap-1.5"
          onClick={() => setIsAddNoteDialogOpen(true)}
        >
          <StickyNote className="h-4 w-4" />
          <span className="hidden lg:inline">Note</span>
        </Button>

        {/* New Issue */}
        {project.githubUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => setIsNewIssueDialogOpen(true)}
          >
            <CirclePlus className="h-4 w-4" />
            <span className="hidden lg:inline">Issue</span>
          </Button>
        )}

        {/* Launch Agent */}
        {project.githubUrl && (
          <SpriteLaunchButton
            projectId={project.id}
            projectTitle={project.title}
            githubUrl={project.githubUrl}
            compact
          />
        )}

        {/* GitHub */}
        {project.githubUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground hover:text-foreground gap-1.5"
            asChild
          >
            <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4" />
              <span className="hidden lg:inline">GitHub</span>
            </a>
          </Button>
        )}

        {/* Share */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-muted-foreground hover:text-foreground gap-1.5"
          onClick={handleCopyPublicLink}
        >
          {linkCopied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          <span className="hidden lg:inline">Share</span>
        </Button>
      </div>

      {/* Add Note Dialog */}
      <Dialog open={isAddNoteDialogOpen} onOpenChange={setIsAddNoteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="note-title">Title (optional)</Label>
              <Input
                id="note-title"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Note title..."
              />
            </div>
            <div>
              <Label htmlFor="note-content">Content</Label>
              <Textarea
                id="note-content"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write your note..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddNote} disabled={createNote.isPending}>
              {createNote.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Issue Dialog */}
      <Dialog open={isNewIssueDialogOpen} onOpenChange={setIsNewIssueDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create GitHub Issue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="issue-title">Title</Label>
              <Input
                id="issue-title"
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                placeholder="Issue title..."
              />
            </div>
            <div>
              <Label htmlFor="issue-body">Description (optional)</Label>
              <Textarea
                id="issue-body"
                value={issueBody}
                onChange={(e) => setIssueBody(e.target.value)}
                placeholder="Describe the issue..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewIssueDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateIssue} disabled={createIssue.isPending}>
              {createIssue.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
