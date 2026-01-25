/**
 * CreateSpriteTaskDialog
 *
 * Dialog form for creating new sprite tasks with smart issue parsing.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, BookTemplate, Link2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { TaskTemplateSelector } from './TaskTemplateSelector';
import { TaskSplitSuggestion, type SubtaskSuggestion } from './TaskSplitSuggestion';
import { TaskCostEstimate } from './TaskCostEstimate';
import { ParsedIssuePreview } from './ParsedIssuePreview';
import type { AppliedTaskTemplate } from '@/types/taskTemplate';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useCreateSpriteTask, useParseGitHubIssue } from '@/hooks/use-sprite-tasks';
import type { SpriteTaskPriority, ParsedGitHubIssue } from '@/types/spriteTask';

interface CreateSpriteTaskDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill with GitHub issue number */
  initialIssueNumber?: number;
}

// Form validation schema
const formSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(200, 'Title must be less than 200 characters'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(5000, 'Description must be less than 5000 characters'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  githubIssueUrl: z
    .string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

const PRIORITY_OPTIONS: { value: SpriteTaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function CreateSpriteTaskDialog({
  projectId,
  open,
  onOpenChange,
  initialIssueNumber,
}: CreateSpriteTaskDialogProps) {
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'manual' | 'github'>('manual');
  const [issueInput, setIssueInput] = useState('');
  const [parsedIssue, setParsedIssue] = useState<ParsedGitHubIssue | null>(null);
  const [lastParsedInput, setLastParsedInput] = useState<string>('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const createMutation = useCreateSpriteTask();
  const parseIssueMutation = useParseGitHubIssue();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'medium',
      githubIssueUrl: '',
    },
  });

  // Initialize with issue number if provided
  useEffect(() => {
    if (initialIssueNumber && open) {
      setCreateMode('github');
      setIssueInput(String(initialIssueNumber));
      handleParseIssue(initialIssueNumber);
    }
  }, [initialIssueNumber, open]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setParsedIssue(null);
      setIssueInput('');
      setLastParsedInput('');
      setCreateMode('manual');
      form.reset();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    }
  }, [open, form]);

  // Extract issue number from URL or number input
  const extractIssueNumber = useCallback((input: string): number | null => {
    // Check if it's a URL
    const urlMatch = input.match(/\/issues\/(\d+)/);
    if (urlMatch) return parseInt(urlMatch[1], 10);

    // Check if it's a number
    const num = parseInt(input, 10);
    if (!isNaN(num) && num > 0) return num;

    return null;
  }, []);

  // Parse GitHub issue
  const handleParseIssue = useCallback(async (issueNum?: number) => {
    const num = issueNum ?? extractIssueNumber(issueInput);
    if (!num || isNaN(num)) return;

    // Track what we're parsing to avoid re-parsing the same input
    const inputKey = String(num);
    if (inputKey === lastParsedInput && parsedIssue) return;

    try {
      const result = await parseIssueMutation.mutateAsync({
        projectId,
        issueNumber: num,
      });
      setParsedIssue(result);
      setLastParsedInput(inputKey);

      // Pre-fill form with parsed data
      form.setValue('title', result.title);
      form.setValue('description', result.prompt); // Use generated prompt
      form.setValue('priority', result.priority);
      form.setValue(
        'githubIssueUrl',
        result.issueUrl || `https://github.com/issues/${num}`
      );
    } catch (error) {
      console.error('Failed to parse issue:', error);
    }
  }, [issueInput, lastParsedInput, parsedIssue, parseIssueMutation, projectId, form, extractIssueNumber]);

  // Auto-parse when issue input changes (debounced)
  useEffect(() => {
    if (createMode !== 'github' || !issueInput.trim()) return;

    const num = extractIssueNumber(issueInput);
    if (!num) return;

    // Don't re-parse if we already parsed this
    if (String(num) === lastParsedInput) return;

    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the auto-parse (500ms delay)
    debounceRef.current = setTimeout(() => {
      handleParseIssue(num);
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [issueInput, createMode, lastParsedInput, extractIssueNumber, handleParseIssue]);

  const onSubmit = async (values: FormValues) => {
    // Extract issue number from URL if provided
    let githubIssueNumber: number | undefined;
    if (values.githubIssueUrl) {
      const match = values.githubIssueUrl.match(/\/issues\/(\d+)/);
      if (match) {
        githubIssueNumber = parseInt(match[1], 10);
      }
    }

    await createMutation.mutateAsync({
      projectId,
      title: values.title,
      description: values.description,
      prompt: values.description, // Use description as prompt
      priority: values.priority as SpriteTaskPriority,
      githubIssueNumber,
      githubIssueUrl: values.githubIssueUrl || undefined,
    });

    form.reset();
    setParsedIssue(null);
    onOpenChange(false);
  };

  // Handle template selection
  const handleTemplateSelect = (applied: AppliedTaskTemplate) => {
    form.setValue('title', applied.title);
    form.setValue('description', applied.description);
    form.setValue('priority', applied.priority);
    setCreateMode('manual');
  };

  // Handle task split - creates multiple tasks
  const handleSplitTask = async (subtasks: SubtaskSuggestion[]) => {
    for (const subtask of subtasks) {
      await createMutation.mutateAsync({
        projectId,
        title: subtask.title,
        description: subtask.description,
        prompt: subtask.description,
        priority: subtask.priority,
      });
    }
    form.reset();
    setParsedIssue(null);
    onOpenChange(false);
  };

  // Watch form values for cost estimation
  const watchedTitle = form.watch('title');
  const watchedDescription = form.watch('description');
  const watchedPriority = form.watch('priority');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Create New Task</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTemplateSelectorOpen(true)}
                className="gap-1.5"
              >
                <BookTemplate className="h-3.5 w-3.5" />
                Use Template
              </Button>
            </DialogTitle>
            <DialogDescription>
              Add a task to the queue for Claude to work on.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as 'manual' | 'github')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">Manual Entry</TabsTrigger>
              <TabsTrigger value="github" className="gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                From GitHub Issue
              </TabsTrigger>
            </TabsList>

            {/* GitHub Issue Input */}
            <TabsContent value="github" className="space-y-4">
              <div className="relative">
                <Input
                  placeholder="Enter issue # or paste GitHub URL - auto-parses"
                  value={issueInput}
                  onChange={(e) => setIssueInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const num = extractIssueNumber(issueInput);
                      if (num) handleParseIssue(num);
                    }
                  }}
                  className="pr-10"
                />
                {/* Status indicator in input */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {parseIssueMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : parsedIssue && lastParsedInput === String(extractIssueNumber(issueInput)) ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : null}
                </div>
              </div>

              {/* Parsed Issue Preview */}
              {parsedIssue && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Smart Parsed Data</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const num = extractIssueNumber(issueInput);
                        if (num) handleParseIssue(num);
                      }}
                      disabled={parseIssueMutation.isPending}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${parseIssueMutation.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  <ParsedIssuePreview parsed={parsedIssue} showPrompt />
                </div>
              )}

              {parseIssueMutation.isError && (
                <p className="text-sm text-destructive">
                  Failed to parse issue. Make sure the issue exists and the project has a GitHub URL configured.
                </p>
              )}
            </TabsContent>

            {/* Manual Entry Form */}
            <TabsContent value="manual">
              {/* Form fields shown for both modes below */}
            </TabsContent>
          </Tabs>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Add dark mode toggle to settings"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      A brief summary of what needs to be done.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Description / Prompt
                      {parsedIssue && (
                        <span className="ml-2 text-xs text-muted-foreground font-normal">
                          (auto-generated from issue)
                        </span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the task in detail. Include any specific requirements, files to modify, or acceptance criteria..."
                        className="min-h-[120px] font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      This will be sent to Claude as the task prompt.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Priority
                      {parsedIssue && (
                        <span className="ml-2 text-xs text-muted-foreground font-normal">
                          (detected from labels)
                        </span>
                      )}
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Higher priority tasks are processed first.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {createMode === 'manual' && (
                <FormField
                  control={form.control}
                  name="githubIssueUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GitHub Issue URL (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://github.com/owner/repo/issues/123"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Link to a GitHub issue for tracking.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Task Split Suggestion */}
              {watchedDescription && watchedDescription.length > 50 && (
                <TaskSplitSuggestion
                  title={watchedTitle}
                  description={watchedDescription}
                  priority={watchedPriority as 'low' | 'medium' | 'high' | 'urgent'}
                  onApplySplit={handleSplitTask}
                />
              )}

              {/* Cost Estimate */}
              {(watchedTitle || watchedDescription) && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">Estimated cost:</span>
                  <TaskCostEstimate
                    title={watchedTitle}
                    description={watchedDescription}
                    showDetails
                  />
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Create Task
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Template Selector Dialog */}
      <TaskTemplateSelector
        open={templateSelectorOpen}
        onOpenChange={setTemplateSelectorOpen}
        onSelectTemplate={handleTemplateSelect}
        projectId={projectId}
      />
    </>
  );
}
