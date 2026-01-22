'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  MoreHorizontal,
  Check,
  X,
  Clock,
  AlertTriangle,
  Building2,
  Users,
  Shield,
  Calendar,
  User,
  Edit,
  Trash2,
  Play,
  Pause,
} from 'lucide-react';
import type { Task, TaskStatus, TaskPriority } from '@/types';

interface TaskCardProps {
  task: Task;
  onComplete?: (id: string) => void;
  onCancel?: (id: string) => void;
  onStatusChange?: (id: string, status: TaskStatus) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  onClick?: (task: Task) => void;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: typeof Check }> = {
  pending: { label: 'Pending', color: 'bg-zinc-500/20 text-zinc-400', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/20 text-blue-400', icon: Play },
  completed: { label: 'Completed', color: 'bg-green-500/20 text-green-400', icon: Check },
  blocked: { label: 'Blocked', color: 'bg-red-500/20 text-red-400', icon: Pause },
  cancelled: { label: 'Cancelled', color: 'bg-zinc-500/20 text-muted-foreground', icon: X },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-zinc-500/20 text-zinc-400' },
  normal: { label: 'Normal', color: 'bg-blue-500/20 text-blue-400' },
  high: { label: 'High', color: 'bg-orange-500/20 text-orange-400' },
  urgent: { label: 'Urgent', color: 'bg-red-500/20 text-red-400' },
};

const LINK_TYPE_ICONS = {
  deal: Building2,
  buyer: Users,
  compliance: Shield,
  none: null,
};

export function TaskCard({
  task,
  onComplete,
  onCancel,
  onStatusChange,
  onEdit,
  onDelete,
  onClick,
}: TaskCardProps) {
  const statusConfig = STATUS_CONFIG[task.status];
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const StatusIcon = statusConfig.icon;
  const LinkIcon = task.linkType !== 'none' ? LINK_TYPE_ICONS[task.linkType] : null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  const getDueDateClass = () => {
    if (!task.dueDate) return '';
    if (task.isOverdue) return 'text-red-400';
    if (task.daysUntilDue !== null && task.daysUntilDue !== undefined && task.daysUntilDue <= 1) return 'text-orange-400';
    return 'text-muted-foreground';
  };

  return (
    <div
      className={`bg-card border rounded-xl p-5 sm:p-6 hover:bg-secondary/50 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${task.status === 'completed' || task.status === 'cancelled' ? 'opacity-60' : ''}`}
      onClick={() => onClick?.(task)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          {/* Status Icon */}
          <div className={`p-3 rounded-xl ${statusConfig.color}`}>
            <StatusIcon className="h-5 w-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={`font-semibold text-lg text-foreground truncate ${
                  task.status === 'completed' ? 'line-through' : ''
                }`}
              >
                {task.title}
              </h3>
              {task.isOverdue && task.status !== 'completed' && task.status !== 'cancelled' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Overdue</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {task.description && (
              <p className="text-base text-muted-foreground mt-2 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Meta info */}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {/* Priority */}
              <Badge className={`${priorityConfig.color} text-sm px-3 py-1`}>{priorityConfig.label}</Badge>

              {/* Link type */}
              {LinkIcon && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <LinkIcon className="h-4 w-4" />
                        <span className="capitalize">{task.linkType}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Linked to {task.linkType}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Due date */}
              {task.dueDate && (
                <div className={`flex items-center gap-1.5 text-sm ${getDueDateClass()}`}>
                  <Calendar className="h-4 w-4" />
                  <span>
                    {task.isOverdue
                      ? `Overdue (${formatDate(task.dueDate)})`
                      : formatDate(task.dueDate)}
                  </span>
                </div>
              )}

              {/* Assignee */}
              {task.assignee && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span className="truncate max-w-[120px]">{task.assignee.name}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Assigned to {task.assignee.name}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Tags */}
              {task.tags && task.tags.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {task.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} className="bg-accent-500/20 text-accent-400 text-sm px-2.5 py-0.5">
                      {tag}
                    </Badge>
                  ))}
                  {task.tags.length > 2 && (
                    <Badge className="bg-zinc-500/20 text-zinc-400 text-sm px-2.5 py-0.5">
                      +{task.tags.length - 2}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {task.status !== 'completed' && task.status !== 'cancelled' && onComplete && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-green-500 hover:text-green-400"
                    onClick={() => onComplete(task.id)}
                  >
                    <Check className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Mark Complete</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-secondary border">
              {onEdit && (
                <DropdownMenuItem
                  onClick={() => onEdit(task)}
                  className="text-foreground cursor-pointer"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}

              {onStatusChange && task.status !== 'completed' && (
                <>
                  <DropdownMenuSeparator />
                  {task.status !== 'in_progress' && (
                    <DropdownMenuItem
                      onClick={() => onStatusChange(task.id, 'in_progress')}
                      className="text-foreground cursor-pointer"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Start Progress
                    </DropdownMenuItem>
                  )}
                  {task.status !== 'pending' && (
                    <DropdownMenuItem
                      onClick={() => onStatusChange(task.id, 'pending')}
                      className="text-foreground cursor-pointer"
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      Move to Pending
                    </DropdownMenuItem>
                  )}
                  {task.status !== 'blocked' && (
                    <DropdownMenuItem
                      onClick={() => onStatusChange(task.id, 'blocked')}
                      className="text-foreground cursor-pointer"
                    >
                      <Pause className="mr-2 h-4 w-4" />
                      Mark Blocked
                    </DropdownMenuItem>
                  )}
                </>
              )}

              {onCancel && task.status !== 'cancelled' && task.status !== 'completed' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onCancel(task.id)}
                    className="text-orange-400 cursor-pointer"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel Task
                  </DropdownMenuItem>
                </>
              )}

              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(task.id)}
                    className="text-red-400 cursor-pointer"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
