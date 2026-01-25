/**
 * SpriteActivityTimeline
 *
 * Displays a real-time activity feed for sprite tasks and actions.
 */

'use client';

import { useMemo } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Clock,
  CheckCircle2,
  XCircle,
  GitBranch,
  GitPullRequest,
  Play,
  Pause,
  RefreshCw,
  FileCode,
  AlertCircle,
  Bot,
  User,
  Zap,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { SpriteTask, SpriteTaskStatus } from '@/types/spriteTask';

// Activity event types
type ActivityEventType =
  | 'task_created'
  | 'task_assigned'
  | 'task_started'
  | 'task_progress'
  | 'branch_created'
  | 'pr_created'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled'
  | 'task_retried'
  | 'github_comment'
  | 'status_change';

interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  taskId: string;
  taskTitle: string;
  timestamp: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface SpriteActivityTimelineProps {
  tasks: SpriteTask[];
  maxItems?: number;
  className?: string;
}

// Event icon mapping
const EVENT_ICONS: Record<ActivityEventType, React.ElementType> = {
  task_created: Clock,
  task_assigned: Bot,
  task_started: Play,
  task_progress: Zap,
  branch_created: GitBranch,
  pr_created: GitPullRequest,
  task_completed: CheckCircle2,
  task_failed: XCircle,
  task_cancelled: Pause,
  task_retried: RefreshCw,
  github_comment: MessageSquare,
  status_change: RefreshCw,
};

// Event color mapping
const EVENT_COLORS: Record<ActivityEventType, string> = {
  task_created: 'text-gray-500 bg-gray-500/10',
  task_assigned: 'text-blue-500 bg-blue-500/10',
  task_started: 'text-yellow-500 bg-yellow-500/10',
  task_progress: 'text-yellow-500 bg-yellow-500/10',
  branch_created: 'text-purple-500 bg-purple-500/10',
  pr_created: 'text-purple-500 bg-purple-500/10',
  task_completed: 'text-green-500 bg-green-500/10',
  task_failed: 'text-red-500 bg-red-500/10',
  task_cancelled: 'text-gray-400 bg-gray-400/10',
  task_retried: 'text-orange-500 bg-orange-500/10',
  github_comment: 'text-blue-400 bg-blue-400/10',
  status_change: 'text-indigo-500 bg-indigo-500/10',
};

// Event labels
const EVENT_LABELS: Record<ActivityEventType, string> = {
  task_created: 'Task Created',
  task_assigned: 'Assigned to Sprite',
  task_started: 'Started Processing',
  task_progress: 'Progress Update',
  branch_created: 'Branch Created',
  pr_created: 'PR Created',
  task_completed: 'Completed',
  task_failed: 'Failed',
  task_cancelled: 'Cancelled',
  task_retried: 'Retrying',
  github_comment: 'GitHub Comment',
  status_change: 'Status Change',
};

// Convert task status changes to activity events
function tasksToActivityEvents(tasks: SpriteTask[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const task of tasks) {
    // Task created event
    events.push({
      id: `${task.id}-created`,
      type: 'task_created',
      taskId: task.id,
      taskTitle: task.title,
      timestamp: task.queuedAt,
      description: task.source === 'github_issue'
        ? `From GitHub issue #${task.githubIssueNumber}`
        : 'Manually created',
    });

    // Task started event
    if (task.startedAt) {
      events.push({
        id: `${task.id}-started`,
        type: 'task_started',
        taskId: task.id,
        taskTitle: task.title,
        timestamp: task.startedAt,
      });
    }

    // Branch created event
    if (task.branchName) {
      events.push({
        id: `${task.id}-branch`,
        type: 'branch_created',
        taskId: task.id,
        taskTitle: task.title,
        timestamp: task.startedAt || task.queuedAt,
        description: task.branchName,
      });
    }

    // PR created event
    if (task.pullRequestUrl) {
      events.push({
        id: `${task.id}-pr`,
        type: 'pr_created',
        taskId: task.id,
        taskTitle: task.title,
        timestamp: task.completedAt || task.startedAt || task.queuedAt,
        description: `PR #${task.pullRequestNumber}`,
        metadata: { url: task.pullRequestUrl },
      });
    }

    // Final status event
    if (task.completedAt) {
      if (task.status === 'completed') {
        events.push({
          id: `${task.id}-completed`,
          type: 'task_completed',
          taskId: task.id,
          taskTitle: task.title,
          timestamp: task.completedAt,
        });
      } else if (task.status === 'failed') {
        events.push({
          id: `${task.id}-failed`,
          type: 'task_failed',
          taskId: task.id,
          taskTitle: task.title,
          timestamp: task.completedAt,
          description: task.errorMessage || 'Unknown error',
        });
      } else if (task.status === 'cancelled') {
        events.push({
          id: `${task.id}-cancelled`,
          type: 'task_cancelled',
          taskId: task.id,
          taskTitle: task.title,
          timestamp: task.completedAt,
        });
      }
    }
  }

  // Sort by timestamp (most recent first)
  return events.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

// Individual activity item
function ActivityItem({ event }: { event: ActivityEvent }) {
  const Icon = EVENT_ICONS[event.type];
  const colorClass = EVENT_COLORS[event.type];

  return (
    <div className="flex gap-3 py-3">
      {/* Icon */}
      <div className={cn('p-1.5 rounded-full shrink-0', colorClass)}>
        <Icon className="h-3.5 w-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {EVENT_LABELS[event.type]}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
          </span>
        </div>

        <p className="text-sm font-medium truncate" title={event.taskTitle}>
          {event.taskTitle}
        </p>

        {event.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {event.type === 'pr_created' && event.metadata?.url ? (
              <a
                href={event.metadata.url as string}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {event.description}
              </a>
            ) : event.type === 'branch_created' ? (
              <code className="bg-muted px-1 rounded text-xs">
                {event.description}
              </code>
            ) : (
              event.description
            )}
          </p>
        )}
      </div>

      {/* Timestamp tooltip */}
      <span
        className="text-xs text-muted-foreground shrink-0"
        title={format(new Date(event.timestamp), 'PPpp')}
      >
        {format(new Date(event.timestamp), 'HH:mm')}
      </span>
    </div>
  );
}

export function SpriteActivityTimeline({
  tasks,
  maxItems = 50,
  className,
}: SpriteActivityTimelineProps) {
  // Convert tasks to activity events
  const events = useMemo(() => {
    const allEvents = tasksToActivityEvents(tasks);
    return allEvents.slice(0, maxItems);
  }, [tasks, maxItems]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, ActivityEvent[]> = {};

    for (const event of events) {
      const date = format(new Date(event.timestamp), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(event);
    }

    return Object.entries(groups).map(([date, events]) => ({
      date,
      label: format(new Date(date), 'EEEE, MMMM d'),
      events,
    }));
  }, [events]);

  if (events.length === 0) {
    return (
      <div className={cn('text-center py-8', className)}>
        <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">No activity yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Create a task to see activity here
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-[400px]', className)}>
      <div className="space-y-4 pr-4">
        {groupedEvents.map(({ date, label, events }) => (
          <div key={date}>
            {/* Date header */}
            <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2 z-10">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {label}
              </h4>
            </div>

            {/* Events for this date */}
            <div className="divide-y divide-border">
              {events.map((event) => (
                <ActivityItem key={event.id} event={event} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
