/**
 * SpriteLaunchDialog
 *
 * Dialog for launching a new sprite with branch selection.
 * Allows users to select which branch to clone and work on.
 */

'use client';

import { useState, useEffect } from 'react';
import { Bot, Loader2, GitBranch, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useGitHubBranches, parseGitHubUrl } from '@/hooks/use-github-repo';
import { useCreateSprite } from '@/hooks/use-sprites';
import { useSpriteStore } from '@/stores/sprite-store';
import { toast } from 'sonner';

interface SpriteLaunchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectTitle?: string;
  githubUrl: string | null;
}

export function SpriteLaunchDialog({
  open,
  onOpenChange,
  projectId,
  projectTitle,
  githubUrl,
}: SpriteLaunchDialogProps) {
  const [selectedBranch, setSelectedBranch] = useState<string>('main');

  const createSprite = useCreateSprite();
  const openTerminal = useSpriteStore((state) => state.openTerminal);
  const addRecentSession = useSpriteStore((state) => state.addRecentSession);

  // Parse GitHub URL to get owner/repo
  const parsed = githubUrl ? parseGitHubUrl(githubUrl) : null;
  const { owner, repo } = parsed || { owner: undefined, repo: undefined };

  // Fetch branches from GitHub
  const {
    data: branches,
    isLoading: branchesLoading,
    error: branchesError,
  } = useGitHubBranches(owner, repo);

  // Find default branch (usually main or master)
  useEffect(() => {
    if (branches && branches.length > 0) {
      // Try to find main, then master, then use first branch
      const defaultBranch =
        branches.find((b) => b.name === 'main') ||
        branches.find((b) => b.name === 'master') ||
        branches[0];
      if (defaultBranch) {
        setSelectedBranch(defaultBranch.name);
      }
    }
  }, [branches]);

  const handleLaunch = async () => {
    try {
      toast.loading('Creating coding agent...');
      const newSprite = await createSprite.mutateAsync({
        projectId,
        branch: selectedBranch,
      });
      toast.dismiss();
      toast.success(`Coding agent created on branch: ${selectedBranch}`);
      openTerminal(newSprite.id, projectId);
      addRecentSession({
        spriteId: newSprite.id,
        projectId,
        projectTitle: projectTitle || 'Project',
        sessionId: '',
      });
      onOpenChange(false);
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to create coding agent');
    }
  };

  const isPending = createSprite.isPending;
  const hasGitHub = !!githubUrl && !!owner && !!repo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-500" />
            Launch Coding Agent
          </DialogTitle>
          <DialogDescription>
            Create a new coding agent for this project. The agent will clone the repository
            and set up a persistent development environment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* GitHub Configuration Warning */}
          {!hasGitHub && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No GitHub repository configured for this project. Add a GitHub URL in project settings
                to enable branch selection.
              </AlertDescription>
            </Alert>
          )}

          {/* Branch Selection */}
          {hasGitHub && (
            <div className="space-y-2">
              <Label htmlFor="branch">Branch to clone</Label>
              <Select
                value={selectedBranch}
                onValueChange={setSelectedBranch}
                disabled={branchesLoading || isPending}
              >
                <SelectTrigger id="branch" className="w-full">
                  {branchesLoading ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading branches...
                    </span>
                  ) : (
                    <SelectValue placeholder="Select a branch">
                      <span className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        {selectedBranch}
                      </span>
                    </SelectValue>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {branches?.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      <span className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        {branch.name}
                        {branch.protected && (
                          <span className="text-xs text-muted-foreground">(protected)</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                  {!branchesLoading && (!branches || branches.length === 0) && (
                    <SelectItem value="main" disabled>
                      No branches found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The agent will create a feature branch from this base branch for its work.
              </p>
              {branchesError && (
                <p className="text-xs text-destructive">
                  Failed to load branches. Using default: main
                </p>
              )}
            </div>
          )}

          {/* Info about what happens next */}
          <div className="rounded-lg bg-muted p-3 space-y-1">
            <p className="text-sm font-medium">What happens next:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>1. Clone repository to a persistent Linux VM</li>
              <li>2. Create a feature branch (sprite/agent-name)</li>
              <li>3. Set up Claude Code for AI-assisted development</li>
              <li>4. Open terminal for interactive coding</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleLaunch}
            disabled={isPending || (!hasGitHub && !branches)}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Bot className="h-4 w-4 mr-2" />
                Launch Agent
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
