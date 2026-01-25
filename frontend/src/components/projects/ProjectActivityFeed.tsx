'use client';

import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  GitCommit,
  GitPullRequest,
  GitMerge,
  CircleDot,
  MessageSquare,
  FileText,
  StickyNote,
  Users,
  Clock,
  ExternalLink,
  Activity,
  GitBranch,
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  Loader2,
} from 'lucide-react';
import {
  useGitHubCommits,
  useGitHubPullRequests,
  useGitHubIssues,
  parseGitHubUrl,
  type GitHubCommit,
  type GitHubPullRequest,
  type GitHubIssue,
} from '@/hooks/use-github-repo';
import { cn } from '@/lib/utils';

interface ProjectActivityFeedProps {
  projectId: string;
  githubUrl?: string | null;
  noteCount?: number;
  className?: string;
}

// Unified activity item type
interface ActivityItem {
  id: string;
  type: 'commit' | 'pr_opened' | 'pr_merged' | 'pr_closed' | 'issue_opened' | 'issue_closed' | 'note' | 'project_update';
  title: string;
  description?: string;
  author: {
    name: string;
    avatar?: string;
  };
  timestamp: Date;
  url?: string;
  metadata?: {
    sha?: string;
    number?: number;
    branch?: string;
    labels?: Array<{ name: string; color: string }>;
  };
}

// Format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get icon and color for activity type
function getActivityStyle(type: ActivityItem['type']) {
  switch (type) {
    case 'commit':
      return {
        icon: GitCommit,
        color: 'bg-blue-500/20 text-blue-500',
        label: 'Commit',
      };
    case 'pr_opened':
      return {
        icon: GitPullRequest,
        color: 'bg-green-500/20 text-green-500',
        label: 'PR Opened',
      };
    case 'pr_merged':
      return {
        icon: GitMerge,
        color: 'bg-purple-500/20 text-purple-500',
        label: 'PR Merged',
      };
    case 'pr_closed':
      return {
        icon: XCircle,
        color: 'bg-red-500/20 text-red-500',
        label: 'PR Closed',
      };
    case 'issue_opened':
      return {
        icon: CircleDot,
        color: 'bg-green-500/20 text-green-500',
        label: 'Issue Opened',
      };
    case 'issue_closed':
      return {
        icon: CheckCircle2,
        color: 'bg-purple-500/20 text-purple-500',
        label: 'Issue Closed',
      };
    case 'note':
      return {
        icon: StickyNote,
        color: 'bg-amber-500/20 text-amber-500',
        label: 'Note',
      };
    case 'project_update':
      return {
        icon: Activity,
        color: 'bg-primary/20 text-primary',
        label: 'Update',
      };
    default:
      return {
        icon: Activity,
        color: 'bg-muted text-muted-foreground',
        label: 'Activity',
      };
  }
}

// Individual activity item component - Timeline style
function ActivityItemCard({ item, isLast }: { item: ActivityItem; isLast?: boolean }) {
  const style = getActivityStyle(item.type);
  const Icon = style.icon;

  const content = (
    <div className="flex gap-3 group">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 border-background',
          style.color
        )}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        {!isLast && (
          <div className="w-0.5 flex-1 bg-border/50 mt-1" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="p-2.5 rounded-lg bg-background/50 border border-border/50 hover:bg-background/80 hover:border-border transition-all">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
              {item.title}
            </p>
            {item.url && (
              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
            )}
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[11px]">
            {/* Type badge */}
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 border-0",
                style.color
              )}
            >
              {style.label}
            </Badge>

            {/* Author with avatar */}
            <div className="flex items-center gap-1">
              {item.author.avatar ? (
                <img
                  src={item.author.avatar}
                  alt={item.author.name}
                  className="h-3.5 w-3.5 rounded-full"
                />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full bg-secondary flex items-center justify-center">
                  <User className="h-2 w-2 text-muted-foreground" />
                </div>
              )}
              <span className="text-muted-foreground">{item.author.name}</span>
            </div>

            <span className="text-muted-foreground/50">·</span>

            {/* Timestamp */}
            <span className="text-muted-foreground">
              {formatRelativeTime(item.timestamp)}
            </span>

            {/* SHA for commits */}
            {item.metadata?.sha && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <code className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1 rounded">
                  {item.metadata.sha.slice(0, 7)}
                </code>
              </>
            )}

            {/* PR/Issue number */}
            {item.metadata?.number && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="font-mono text-muted-foreground">
                  #{item.metadata.number}
                </span>
              </>
            )}
          </div>

          {/* Labels for PRs/Issues */}
          {item.metadata?.labels && item.metadata.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item.metadata.labels.slice(0, 3).map((label) => (
                <Badge
                  key={label.name}
                  variant="outline"
                  className="text-[9px] px-1 py-0"
                  style={{
                    borderColor: `#${label.color}40`,
                    backgroundColor: `#${label.color}15`,
                    color: `#${label.color}`,
                  }}
                >
                  {label.name}
                </Badge>
              ))}
              {item.metadata.labels.length > 3 && (
                <span className="text-[9px] text-muted-foreground">
                  +{item.metadata.labels.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }

  return content;
}

export function ProjectActivityFeed({
  projectId,
  githubUrl,
  noteCount = 0,
  className,
}: ProjectActivityFeedProps) {
  const repoInfo = githubUrl ? parseGitHubUrl(githubUrl) : null;

  // Fetch GitHub data
  const { data: commits, isLoading: commitsLoading } = useGitHubCommits(
    repoInfo?.owner,
    repoInfo?.repo,
    { perPage: 15 }
  );
  const { data: pullRequests, isLoading: prsLoading } = useGitHubPullRequests(
    repoInfo?.owner,
    repoInfo?.repo,
    { state: 'all', perPage: 10 }
  );
  const { data: issues, isLoading: issuesLoading } = useGitHubIssues(
    repoInfo?.owner,
    repoInfo?.repo,
    { state: 'all', perPage: 10 }
  );

  const isLoading = commitsLoading || prsLoading || issuesLoading;

  // Transform and combine all activities
  const activities = useMemo(() => {
    const items: ActivityItem[] = [];

    // Add commits
    commits?.forEach((commit) => {
      items.push({
        id: `commit-${commit.sha}`,
        type: 'commit',
        title: commit.message.split('\n')[0],
        author: {
          name: commit.author.login || commit.author.name,
          avatar: commit.author.avatarUrl,
        },
        timestamp: new Date(commit.author.date),
        url: commit.url,
        metadata: {
          sha: commit.sha,
        },
      });
    });

    // Add pull requests
    pullRequests?.forEach((pr) => {
      const prType = pr.mergedAt
        ? 'pr_merged'
        : pr.state === 'closed'
        ? 'pr_closed'
        : 'pr_opened';

      items.push({
        id: `pr-${pr.id}`,
        type: prType,
        title: pr.title,
        author: {
          name: pr.user.login,
          avatar: pr.user.avatar_url,
        },
        timestamp: new Date(pr.mergedAt || pr.closedAt || pr.createdAt),
        url: pr.url,
        metadata: {
          number: pr.number,
          labels: pr.labels,
        },
      });
    });

    // Add issues (excluding PRs which GitHub returns in issues API too)
    issues?.forEach((issue) => {
      // Skip if this is actually a PR (GitHub returns PRs in issues endpoint)
      if ('pull_request' in issue) return;

      items.push({
        id: `issue-${issue.id}`,
        type: issue.state === 'closed' ? 'issue_closed' : 'issue_opened',
        title: issue.title,
        author: {
          name: issue.user.login,
          avatar: issue.user.avatar_url,
        },
        timestamp: new Date(issue.state === 'closed' && issue.closedAt ? issue.closedAt : issue.createdAt),
        url: issue.url,
        metadata: {
          number: issue.number,
          labels: issue.labels,
        },
      });
    });

    // Sort by timestamp (most recent first)
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return items;
  }, [commits, pullRequests, issues]);

  // Group activities by date
  const groupedActivities = useMemo(() => {
    const groups: { label: string; items: ActivityItem[] }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    const todayItems: ActivityItem[] = [];
    const yesterdayItems: ActivityItem[] = [];
    const thisWeekItems: ActivityItem[] = [];
    const olderItems: ActivityItem[] = [];

    activities.forEach((item) => {
      const itemDate = new Date(item.timestamp);
      itemDate.setHours(0, 0, 0, 0);

      if (itemDate.getTime() === today.getTime()) {
        todayItems.push(item);
      } else if (itemDate.getTime() === yesterday.getTime()) {
        yesterdayItems.push(item);
      } else if (itemDate >= thisWeek) {
        thisWeekItems.push(item);
      } else {
        olderItems.push(item);
      }
    });

    if (todayItems.length > 0) groups.push({ label: 'Today', items: todayItems });
    if (yesterdayItems.length > 0) groups.push({ label: 'Yesterday', items: yesterdayItems });
    if (thisWeekItems.length > 0) groups.push({ label: 'This Week', items: thisWeekItems });
    if (olderItems.length > 0) groups.push({ label: 'Earlier', items: olderItems });

    return groups;
  }, [activities]);

  // Flatten activities for timeline display with last-item tracking
  const flatActivities = useMemo(() => {
    const flat: Array<{ item: ActivityItem; groupLabel: string; isLastInGroup: boolean; isLast: boolean }> = [];
    groupedActivities.forEach((group, groupIdx) => {
      group.items.forEach((item, itemIdx) => {
        flat.push({
          item,
          groupLabel: itemIdx === 0 ? group.label : '',
          isLastInGroup: itemIdx === group.items.length - 1,
          isLast: groupIdx === groupedActivities.length - 1 && itemIdx === group.items.length - 1,
        });
      });
    });
    return flat;
  }, [groupedActivities]);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
          <GitCommit className="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <p className="font-medium">Activity Timeline</p>
          <p className="text-xs text-muted-foreground">
            {activities.length} recent activities
          </p>
        </div>
      </div>

      {/* Activity List */}
      <ScrollArea className="h-[320px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">Loading activity...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
              <Activity className="h-6 w-6 opacity-50" />
            </div>
            <p className="text-sm font-medium">No recent activity</p>
            {!repoInfo && (
              <p className="text-xs mt-1 text-center px-4">Connect a GitHub repo to see commits, PRs, and issues</p>
            )}
          </div>
        ) : (
          <div className="pr-3">
            {flatActivities.map(({ item, groupLabel, isLast }) => (
              <div key={item.id}>
                {groupLabel && (
                  <div className="flex items-center gap-2 mb-2 mt-1">
                    <div className="h-px flex-1 bg-border/30" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2">
                      {groupLabel}
                    </span>
                    <div className="h-px flex-1 bg-border/30" />
                  </div>
                )}
                <ActivityItemCard item={item} isLast={isLast} />
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
