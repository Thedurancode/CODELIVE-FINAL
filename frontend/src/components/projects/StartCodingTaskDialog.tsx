'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { RefreshCw, Bot, GitBranch, Play, TestTube } from 'lucide-react';
import { useStartCodingTask, type CodingTaskConfig } from '@/hooks/use-coding-tasks';
import { toast } from 'sonner';

interface StartCodingTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectTitle: string;
  defaultBranch?: string;
  onSuccess?: (taskId: string) => void;
}

export function StartCodingTaskDialog({
  open,
  onOpenChange,
  projectId,
  projectTitle,
  defaultBranch = 'main',
  onSuccess,
}: StartCodingTaskDialogProps) {
  const startTask = useStartCodingTask();

  // Form state
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');

  // Advanced config
  const [branchPrefix, setBranchPrefix] = useState<'feature' | 'bugfix' | 'refactor'>('feature');
  const [baseBranch, setBaseBranch] = useState(defaultBranch);
  const [runTests, setRunTests] = useState(true);
  const [testCommand, setTestCommand] = useState('npm test');
  const [lintCommand, setLintCommand] = useState('npm run lint');
  const [autoCreatePR, setAutoCreatePR] = useState(true);
  const [prLabels, setPrLabels] = useState('ai-generated');

  const resetForm = () => {
    setTitle('');
    setInstructions('');
    setBranchPrefix('feature');
    setBaseBranch(defaultBranch);
    setRunTests(true);
    setTestCommand('npm test');
    setLintCommand('npm run lint');
    setAutoCreatePR(true);
    setPrLabels('ai-generated');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!instructions.trim()) {
      toast.error('Instructions are required');
      return;
    }

    const config: Partial<CodingTaskConfig> = {
      branchPrefix,
      baseBranch,
      runTests,
      testCommand: testCommand.trim() || undefined,
      lintCommand: lintCommand.trim() || undefined,
      autoCreatePR,
      prLabels: prLabels.split(',').map((l) => l.trim()).filter(Boolean),
    };

    try {
      const task = await startTask.mutateAsync({
        projectId,
        title: title.trim(),
        instructions: instructions.trim(),
        config,
      });

      toast.success('Coding task started', {
        description: `Claude is working on: ${title}`,
      });

      resetForm();
      onOpenChange(false);
      onSuccess?.(task.id);
    } catch (error) {
      toast.error('Failed to start task', {
        description: (error as Error).message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-500" />
            Start Coding Task
          </DialogTitle>
          <DialogDescription>
            Let Claude implement code changes for {projectTitle}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Task Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Add user authentication, Fix pagination bug"
              disabled={startTask.isPending}
            />
            <p className="text-xs text-muted-foreground">
              A brief title that describes what Claude should implement
            </p>
          </div>

          {/* Instructions */}
          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions for Claude</Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Describe in detail what you want Claude to implement...

Example:
- Add a new user authentication system using JWT
- Create login and register endpoints in src/routes/auth.ts
- Add middleware for protected routes
- Include proper error handling and validation
- Write tests for the new endpoints"
              rows={8}
              disabled={startTask.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Be specific about what files to modify, what patterns to follow, and any constraints
            </p>
          </div>

          {/* Advanced Options */}
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="advanced" className="border-none">
              <AccordionTrigger className="py-2 hover:no-underline">
                Advanced Options
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                {/* Branch Settings */}
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <GitBranch className="w-4 h-4" />
                    Branch Settings
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="baseBranch">Base Branch</Label>
                      <Input
                        id="baseBranch"
                        value={baseBranch}
                        onChange={(e) => setBaseBranch(e.target.value)}
                        placeholder="main"
                        disabled={startTask.isPending}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="branchPrefix">Branch Prefix</Label>
                      <Select
                        value={branchPrefix}
                        onValueChange={(v) => setBranchPrefix(v as typeof branchPrefix)}
                        disabled={startTask.isPending}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="feature">feature/</SelectItem>
                          <SelectItem value="bugfix">bugfix/</SelectItem>
                          <SelectItem value="refactor">refactor/</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Test Settings */}
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <TestTube className="w-4 h-4" />
                    Test & Lint Settings
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="runTests">Run Tests</Label>
                    <Switch
                      id="runTests"
                      checked={runTests}
                      onCheckedChange={setRunTests}
                      disabled={startTask.isPending}
                    />
                  </div>

                  {runTests && (
                    <div className="space-y-2">
                      <Label htmlFor="testCommand">Test Command</Label>
                      <Input
                        id="testCommand"
                        value={testCommand}
                        onChange={(e) => setTestCommand(e.target.value)}
                        placeholder="npm test"
                        disabled={startTask.isPending}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="lintCommand">Lint Command (optional)</Label>
                    <Input
                      id="lintCommand"
                      value={lintCommand}
                      onChange={(e) => setLintCommand(e.target.value)}
                      placeholder="npm run lint"
                      disabled={startTask.isPending}
                    />
                  </div>
                </div>

                {/* PR Settings */}
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Play className="w-4 h-4" />
                    Pull Request Settings
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="autoCreatePR">Auto-create Pull Request</Label>
                    <Switch
                      id="autoCreatePR"
                      checked={autoCreatePR}
                      onCheckedChange={setAutoCreatePR}
                      disabled={startTask.isPending}
                    />
                  </div>

                  {autoCreatePR && (
                    <div className="space-y-2">
                      <Label htmlFor="prLabels">PR Labels (comma-separated)</Label>
                      <Input
                        id="prLabels"
                        value={prLabels}
                        onChange={(e) => setPrLabels(e.target.value)}
                        placeholder="ai-generated, needs-review"
                        disabled={startTask.isPending}
                      />
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={startTask.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={startTask.isPending}>
              {startTask.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4 mr-2" />
                  Start Task
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
