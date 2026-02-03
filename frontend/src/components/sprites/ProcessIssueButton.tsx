/**
 * ProcessIssueButton
 *
 * Button to process a GitHub issue with Claude AI.
 * Creates a task from the issue and queues it for processing.
 */

'use client';

import { useState } from 'react';
import { Bot, Loader2, Check, Sparkles, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { useProcessGitHubIssue } from '@/hooks/use-sprite-tasks';
import { useSpriteByProject } from '@/hooks/use-sprites';
import type { SpriteTaskPriority } from '@/types/spriteTask';
import { toast } from 'sonner';

interface ProcessIssueButtonProps {
  projectId: string;
  issueNumber: number;
  issueTitle: string;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'default' | 'outline' | 'ghost';
  showLabel?: boolean;
  className?: string;
}

const PRIORITY_OPTIONS: { value: SpriteTaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function ProcessIssueButton({
  projectId,
  issueNumber,
  issueTitle,
  size = 'sm',
  variant = 'outline',
  showLabel = false,
  className,
}: ProcessIssueButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [priority, setPriority] = useState<SpriteTaskPriority>('medium');
  const [justProcessed, setJustProcessed] = useState(false);

  const { data: sprite } = useSpriteByProject(projectId);
  const processIssue = useProcessGitHubIssue();

  const handleProcess = async () => {
    try {
      const task = await processIssue.mutateAsync({
        projectId,
        issueNumber,
        spriteId: sprite?.id,
        priority,
      });

      setIsOpen(false);
      setJustProcessed(true);
      setTimeout(() => setJustProcessed(false), 3000);

      toast.success('Issue queued for processing', {
        description: `Task created: ${task.title}`,
      });
    } catch (error) {
      toast.error('Failed to process issue', {
        description: (error as Error).message,
      });
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
  };

  // If just processed, show success state
  if (justProcessed) {
    return (
      <Button
        size={size}
        variant="ghost"
        disabled
        className={className}
      >
        <Check className="h-4 w-4 text-green-500" />
        {showLabel && <span className="ml-1 hidden sm:inline">Queued</span>}
      </Button>
    );
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size={size}
              variant={variant}
              onClick={handleClick}
              disabled={!sprite}
              className={className}
            >
              <ListPlus className="h-4 w-4" />
              {showLabel && <span className="ml-1 hidden sm:inline">Convert to Task</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {sprite
              ? 'Convert issue to task and process with Claude AI'
              : 'Launch a sprite first to convert issues to tasks'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListPlus className="h-5 w-5" />
              Convert Issue to Task
            </DialogTitle>
            <DialogDescription>
              Create a task from this issue. Claude will analyze it and create a pull request with the solution.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">#{issueNumber}</p>
              <p className="text-sm text-muted-foreground line-clamp-2">{issueTitle}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as SpriteTaskPriority)}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Higher priority issues are processed first.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleProcess} disabled={processIssue.isPending}>
              {processIssue.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ListPlus className="h-4 w-4 mr-2" />
              )}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
