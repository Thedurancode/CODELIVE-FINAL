'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
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
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Edit2,
  ListTodo,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  Pause,
  XCircle,
} from 'lucide-react';
import {
  useTasksByProject,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCompleteTask,
  useCancelTask,
} from '@/hooks/use-tasks';
import { TaskForm } from '@/components/tasks/TaskForm';
import { toast } from 'sonner';
import type { Task, TaskStatus, TaskPriority } from '@/types';

interface ProjectTasksPanelProps {
  projectId: string;
}

const STATUS_ICONS: Record<TaskStatus, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-zinc-400" />,
  in_progress: <Play className="h-4 w-4 text-blue-400" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-400" />,
  blocked: <Pause className="h-4 w-4 text-red-400" />,
  cancelled: <XCircle className="h-4 w-4 text-zinc-500" />,
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  blocked: 'bg-red-500/20 text-red-400 border-red-500/30',
  cancelled: 'bg-zinc-600/20 text-zinc-500 border-zinc-600/30',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  normal: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  high: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function isOverdue(dueDate: string | null | undefined, status: TaskStatus) {
  if (!dueDate || status === 'completed' || status === 'cancelled') return false;
  return new Date(dueDate) < new Date();
}

export function ProjectTasksPanel({ projectId }: ProjectTasksPanelProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const statusFilter = showCompleted ? undefined : ['pending', 'in_progress', 'blocked'] as TaskStatus[];
  const { data: tasks, isLoading } = useTasksByProject(projectId, statusFilter);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const completeTask = useCompleteTask();
  const cancelTask = useCancelTask();

  const handleCreate = async (data: Partial<Task>) => {
    try {
      await createTask.mutateAsync({
        ...data,
        projectId,
        linkType: 'project',
      });
      toast.success('Task created');
      setIsCreateDialogOpen(false);
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleUpdate = async (data: Partial<Task>) => {
    if (!editingTask) return;
    try {
      await updateTask.mutateAsync({
        id: editingTask.id,
        data,
      });
      toast.success('Task updated');
      setIsEditDialogOpen(false);
      setEditingTask(null);
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await deleteTask.mutateAsync(taskId);
      toast.success('Task deleted');
    } catch {
      toast.error('Failed to delete task');
    }
  };

  const handleComplete = async (taskId: string) => {
    try {
      await completeTask.mutateAsync(taskId);
      toast.success('Task completed');
    } catch {
      toast.error('Failed to complete task');
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await cancelTask.mutateAsync(taskId);
      toast.success('Task cancelled');
    } catch {
      toast.error('Failed to cancel task');
    }
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    try {
      await updateTask.mutateAsync({
        id: taskId,
        data: { status },
      });
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    setIsEditDialogOpen(true);
  };

  const pendingCount = tasks?.filter((t: Task) => t.status === 'pending' || t.status === 'in_progress' || t.status === 'blocked').length || 0;
  const completedCount = tasks?.filter((t: Task) => t.status === 'completed').length || 0;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-3">
            <Skeleton className="h-5 w-5 rounded" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            {pendingCount} Active Task{pendingCount !== 1 ? 's' : ''}
          </h3>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              checked={showCompleted}
              onCheckedChange={(checked) => setShowCompleted(checked === true)}
            />
            Show completed
          </label>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-accent-600 hover:bg-accent-700 text-white">
              <Plus className="h-4 w-4 mr-1" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Create Task</DialogTitle>
            </DialogHeader>
            <TaskForm
              onSubmit={handleCreate}
              onCancel={() => setIsCreateDialogOpen(false)}
              isSubmitting={createTask.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {tasks && tasks.length > 0 ? (
        <div className="space-y-2">
          {tasks.map((task: Task) => (
            <Card
              key={task.id}
              className={`bg-secondary/50 border ${
                task.status === 'completed' || task.status === 'cancelled' ? 'opacity-60' : ''
              }`}
            >
              <CardContent className="p-3 flex items-start gap-3">
                <button
                  onClick={() => {
                    if (task.status === 'completed') return;
                    handleComplete(task.id);
                  }}
                  disabled={task.status === 'completed' || task.status === 'cancelled'}
                  className="mt-0.5 shrink-0"
                >
                  {STATUS_ICONS[task.status]}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className={`font-medium ${
                        task.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                    >
                      {task.title}
                    </p>
                    <Badge variant="outline" className={PRIORITY_COLORS[task.priority]}>
                      {task.priority}
                    </Badge>
                  </div>
                  {task.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <Badge variant="outline" className={STATUS_COLORS[task.status]}>
                      {task.status.replace('_', ' ')}
                    </Badge>
                    {task.dueDate && (
                      <span
                        className={`flex items-center gap-1 ${
                          isOverdue(task.dueDate, task.status) ? 'text-red-400' : ''
                        }`}
                      >
                        {isOverdue(task.dueDate, task.status) ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                    {task.tags && task.tags.length > 0 && (
                      <span className="flex items-center gap-1">
                        {task.tags.slice(0, 2).map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs bg-accent-500/10 text-accent-400 border-accent-500/30"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {task.tags.length > 2 && (
                          <span className="text-muted-foreground">+{task.tags.length - 2}</span>
                        )}
                      </span>
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
                      onClick={() => openEditDialog(task)}
                      className="text-foreground cursor-pointer"
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border" />
                    {task.status !== 'pending' && (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(task.id, 'pending')}
                        className="text-foreground cursor-pointer"
                      >
                        <Circle className="mr-2 h-4 w-4" />
                        Set Pending
                      </DropdownMenuItem>
                    )}
                    {task.status !== 'in_progress' && (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(task.id, 'in_progress')}
                        className="text-blue-400 cursor-pointer"
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Start
                      </DropdownMenuItem>
                    )}
                    {task.status !== 'completed' && (
                      <DropdownMenuItem
                        onClick={() => handleComplete(task.id)}
                        className="text-green-400 cursor-pointer"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Complete
                      </DropdownMenuItem>
                    )}
                    {task.status !== 'blocked' && task.status !== 'completed' && task.status !== 'cancelled' && (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(task.id, 'blocked')}
                        className="text-amber-400 cursor-pointer"
                      >
                        <Pause className="mr-2 h-4 w-4" />
                        Mark Blocked
                      </DropdownMenuItem>
                    )}
                    {task.status !== 'cancelled' && (
                      <DropdownMenuItem
                        onClick={() => handleCancel(task.id)}
                        className="text-muted-foreground cursor-pointer"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Cancel
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem
                      onClick={() => handleDelete(task.id)}
                      className="text-red-400 cursor-pointer"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-secondary/50 border">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <ListTodo className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No tasks yet</p>
            <p className="text-muted-foreground text-xs">Create tasks to track your project work</p>
          </CardContent>
        </Card>
      )}

      {/* Edit Task Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-card border max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <TaskForm
              task={editingTask}
              onSubmit={handleUpdate}
              onCancel={() => {
                setIsEditDialogOpen(false);
                setEditingTask(null);
              }}
              isSubmitting={updateTask.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
