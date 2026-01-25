/**
 * CreateSpriteTaskDialog
 *
 * Dialog form for creating new sprite tasks.
 */

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, BookTemplate } from 'lucide-react';
import { TaskTemplateSelector } from './TaskTemplateSelector';
import { TaskSplitSuggestion, type SubtaskSuggestion } from './TaskSplitSuggestion';
import { TaskCostEstimate } from './TaskCostEstimate';
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
import { Label } from '@/components/ui/label';
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
import { useCreateSpriteTask } from '@/hooks/use-sprite-tasks';
import type { SpriteTaskPriority } from '@/types/spriteTask';
import { SPRITE_TASK_PRIORITY_LABELS } from '@/types/spriteTask';

interface CreateSpriteTaskDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
}: CreateSpriteTaskDialogProps) {
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const createMutation = useCreateSpriteTask();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'medium',
      githubIssueUrl: '',
    },
  });

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
    onOpenChange(false);
  };

  // Handle template selection
  const handleTemplateSelect = (applied: AppliedTaskTemplate) => {
    form.setValue('title', applied.title);
    form.setValue('description', applied.description);
    form.setValue('priority', applied.priority);
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
    onOpenChange(false);
  };

  // Watch form values for cost estimation
  const watchedTitle = form.watch('title');
  const watchedDescription = form.watch('description');
  const watchedPriority = form.watch('priority');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[525px]">
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
              Add a task to the queue for Claude to work on. The task will be
              processed automatically when a sprite is available.
            </DialogDescription>
          </DialogHeader>

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
                  <FormLabel>Description / Prompt</FormLabel>
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
                  <FormLabel>Priority</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
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
                    Link to a GitHub issue if this task is related to one.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
