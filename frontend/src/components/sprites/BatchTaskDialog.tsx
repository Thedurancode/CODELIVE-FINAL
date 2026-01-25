/**
 * BatchTaskDialog
 *
 * Dialog for creating multiple tasks at once from various sources:
 * - Multiple GitHub issues
 * - Bulk text input (one task per line)
 * - CSV import
 */

'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Loader2,
  FileText,
  Github,
  Upload,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateSpriteTask } from '@/hooks/use-sprite-tasks';
import type { SpriteTaskPriority } from '@/types/spriteTask';

interface BatchTaskDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Individual task item for batch creation
interface BatchTaskItem {
  id: string;
  title: string;
  description: string;
  priority: SpriteTaskPriority;
  selected: boolean;
  status: 'pending' | 'creating' | 'success' | 'error';
  error?: string;
}

// Form schema for bulk text input
const bulkTextSchema = z.object({
  text: z.string().min(1, 'Enter at least one task'),
  defaultPriority: z.enum(['low', 'medium', 'high', 'urgent']),
});

type BulkTextForm = z.infer<typeof bulkTextSchema>;

// Parse bulk text into tasks
function parseBulkText(text: string, priority: SpriteTaskPriority): BatchTaskItem[] {
  const lines = text.split('\n').filter((line) => line.trim());

  return lines.map((line, idx) => {
    // Try to extract priority from line (e.g., "[HIGH] Fix bug" or "!urgent Fix bug")
    let taskPriority = priority;
    let title = line.trim();

    const priorityMatch = title.match(/^\[?(urgent|high|medium|low)\]?\s*/i);
    if (priorityMatch) {
      taskPriority = priorityMatch[1].toLowerCase() as SpriteTaskPriority;
      title = title.slice(priorityMatch[0].length);
    }

    const urgentMatch = title.match(/^!+(urgent|high|medium|low)?\s*/i);
    if (urgentMatch) {
      if (urgentMatch[1]) {
        taskPriority = urgentMatch[1].toLowerCase() as SpriteTaskPriority;
      } else {
        // Number of ! determines priority
        const exclamations = (urgentMatch[0].match(/!/g) || []).length;
        if (exclamations >= 3) taskPriority = 'urgent';
        else if (exclamations === 2) taskPriority = 'high';
        else if (exclamations === 1) taskPriority = 'medium';
      }
      title = title.slice(urgentMatch[0].length);
    }

    return {
      id: `bulk_${idx}_${Date.now()}`,
      title,
      description: title, // Use title as description for bulk tasks
      priority: taskPriority,
      selected: true,
      status: 'pending' as const,
    };
  });
}

// Task preview item
function TaskPreviewItem({
  task,
  onToggle,
  onRemove,
  onUpdatePriority,
}: {
  task: BatchTaskItem;
  onToggle: () => void;
  onRemove: () => void;
  onUpdatePriority: (priority: SpriteTaskPriority) => void;
}) {
  const priorityColors: Record<SpriteTaskPriority, string> = {
    low: 'text-gray-500',
    medium: 'text-blue-500',
    high: 'text-orange-500',
    urgent: 'text-red-500',
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg border',
        task.status === 'success' && 'bg-green-50 dark:bg-green-950 border-green-200',
        task.status === 'error' && 'bg-red-50 dark:bg-red-950 border-red-200',
        task.status === 'creating' && 'opacity-50',
        !task.selected && 'opacity-50'
      )}
    >
      <Checkbox
        checked={task.selected}
        onCheckedChange={onToggle}
        disabled={task.status !== 'pending'}
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.title}</p>
        {task.error && (
          <p className="text-xs text-red-500 mt-0.5">{task.error}</p>
        )}
      </div>

      {task.status === 'pending' && (
        <>
          <Select
            value={task.priority}
            onValueChange={(v) => onUpdatePriority(v as SpriteTaskPriority)}
          >
            <SelectTrigger className="w-24 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </>
      )}

      {task.status === 'creating' && (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}

      {task.status === 'success' && (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      )}

      {task.status === 'error' && (
        <AlertCircle className="h-4 w-4 text-red-500" />
      )}
    </div>
  );
}

export function BatchTaskDialog({
  projectId,
  open,
  onOpenChange,
}: BatchTaskDialogProps) {
  const [activeTab, setActiveTab] = useState<'bulk' | 'csv'>('bulk');
  const [tasks, setTasks] = useState<BatchTaskItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const createMutation = useCreateSpriteTask();

  const bulkForm = useForm<BulkTextForm>({
    resolver: zodResolver(bulkTextSchema),
    defaultValues: {
      text: '',
      defaultPriority: 'medium',
    },
  });

  // Parse bulk text into tasks
  const handleParseBulk = (values: BulkTextForm) => {
    const parsed = parseBulkText(values.text, values.defaultPriority);
    setTasks(parsed);
  };

  // Toggle task selection
  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, selected: !t.selected } : t
      )
    );
  };

  // Remove task
  const removeTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  // Update task priority
  const updatePriority = (taskId: string, priority: SpriteTaskPriority) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, priority } : t
      )
    );
  };

  // Select/deselect all
  const toggleAll = (selected: boolean) => {
    setTasks((prev) =>
      prev.map((t) => (t.status === 'pending' ? { ...t, selected } : t))
    );
  };

  // Process selected tasks
  const handleProcessTasks = async () => {
    const selectedTasks = tasks.filter((t) => t.selected && t.status === 'pending');
    if (selectedTasks.length === 0) return;

    setIsProcessing(true);

    for (const task of selectedTasks) {
      // Mark as creating
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: 'creating' as const } : t
        )
      );

      try {
        await createMutation.mutateAsync({
          projectId,
          title: task.title,
          description: task.description,
          prompt: task.description,
          priority: task.priority,
        });

        // Mark as success
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...t, status: 'success' as const } : t
          )
        );
      } catch (error) {
        // Mark as error
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, status: 'error' as const, error: (error as Error).message }
              : t
          )
        );
      }
    }

    setIsProcessing(false);
  };

  // Stats
  const stats = useMemo(() => {
    const selected = tasks.filter((t) => t.selected && t.status === 'pending').length;
    const success = tasks.filter((t) => t.status === 'success').length;
    const failed = tasks.filter((t) => t.status === 'error').length;
    const total = tasks.length;
    return { selected, success, failed, total };
  }, [tasks]);

  // Reset on close
  const handleClose = () => {
    if (!isProcessing) {
      setTasks([]);
      bulkForm.reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Batch Create Tasks</DialogTitle>
          <DialogDescription>
            Create multiple tasks at once from text or CSV.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'bulk' | 'csv')}>
          <TabsList className="w-full">
            <TabsTrigger value="bulk" className="flex-1 gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Bulk Text
            </TabsTrigger>
            <TabsTrigger value="csv" className="flex-1 gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              CSV Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bulk" className="space-y-4 mt-4">
            {tasks.length === 0 ? (
              <Form {...bulkForm}>
                <form onSubmit={bulkForm.handleSubmit(handleParseBulk)} className="space-y-4">
                  <FormField
                    control={bulkForm.control}
                    name="text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tasks (one per line)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={`Fix login bug
Add dark mode toggle
!high Update API documentation
[urgent] Fix security vulnerability
Refactor user service`}
                            className="min-h-[150px] font-mono text-sm"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Prefix with [priority] or ! for priority (e.g., [high], !urgent, !!!)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={bulkForm.control}
                    name="defaultPriority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Priority</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full">
                    Parse Tasks
                  </Button>
                </form>
              </Form>
            ) : (
              <div className="space-y-4">
                {/* Stats & Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{stats.total} tasks</Badge>
                    {stats.success > 0 && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        {stats.success} created
                      </Badge>
                    )}
                    {stats.failed > 0 && (
                      <Badge variant="secondary" className="bg-red-100 text-red-700">
                        {stats.failed} failed
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleAll(true)}
                      disabled={isProcessing}
                    >
                      Select All
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleAll(false)}
                      disabled={isProcessing}
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>

                {/* Task List */}
                <ScrollArea className="h-[250px] pr-4">
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <TaskPreviewItem
                        key={task.id}
                        task={task}
                        onToggle={() => toggleTask(task.id)}
                        onRemove={() => removeTask(task.id)}
                        onUpdatePriority={(p) => updatePriority(task.id, p)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          <TabsContent value="csv" className="mt-4">
            <div className="text-center py-8 text-muted-foreground">
              <Upload className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">CSV import coming soon</p>
              <p className="text-xs mt-1">
                Drag and drop a CSV file or click to browse
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
          >
            {tasks.length > 0 && stats.success === stats.total ? 'Done' : 'Cancel'}
          </Button>

          {tasks.length > 0 && stats.selected > 0 && (
            <Button
              onClick={handleProcessTasks}
              disabled={isProcessing || stats.selected === 0}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create {stats.selected} Task{stats.selected !== 1 ? 's' : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
