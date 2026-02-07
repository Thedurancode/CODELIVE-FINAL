'use client';

import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ActivityFeed } from '@/components/activity-feed';
import {
  ActivityResourceType,
  ActivityImportance,
} from '@/hooks/use-activity-feed';
import { useProjects } from '@/hooks/use-projects';
import {
  useGitHubCommits,
  useGitHubPullRequests,
  useGitHubIssues,
  parseGitHubUrl,
  type GitHubCommit,
  type GitHubPullRequest,
  type GitHubIssue,
} from '@/hooks/use-github-repo';
import {
  Activity,
  CheckSquare,
  AlertTriangle,
  GitCommit,
  GitPullRequest,
  GitMerge,
  CircleDot,
  CheckCircle2,
  XCircle,
  User,
  Loader2,
  Github,
  FolderGit2,
  FolderKanban,
  StickyNote,
} from 'lucide-react';

// Quick filter presets
const QUICK_FILTERS = [
  { label: 'All', filter: {}, icon: Activity, color: 'bg-primary/20 text-primary' },
  { label: 'Projects', filter: { resourceTypes: ['pipeline' as ActivityResourceType] }, icon: FolderKanban, color: 'bg-emerald-500/20 text-emerald-500' },
  { label: 'Commits', filter: {}, icon: GitCommit, color: 'bg-blue-500/20 text-blue-500', isGitHub: true },
  { label: 'Notes', filter: { resourceTypes: ['document' as ActivityResourceType] }, icon: StickyNote, color: 'bg-amber-500/20 text-amber-500' },
  { label: 'Tasks', filter: { resourceTypes: ['task' as ActivityResourceType] }, icon: CheckSquare, color: 'bg-purple-500/20 text-purple-500' },
  { label: 'High Priority', filter: { importance: ['high' as ActivityImportance, 'critical' as ActivityImportance] }, icon: AlertTriangle, color: 'bg-red-500/20 text-red-500' },
];

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

// Unified activity item for aggregated GitHub data
interface AggregatedActivity {
  id: string;
  type: 'commit' | 'pr_open' | 'pr_merged' | 'pr_closed' | 'issue_open' | 'issue_closed';
  title: string;
  author: {
    name: string;
    avatar?: string;
  };
  timestamp: Date;
  url: string;
  project: {
    id: string;
    title: string;
    logoUrl?: string;
  };
  metadata?: {
    sha?: string;
    number?: number;
    labels?: Array<{ name: string; color: string }>;
  };
}

export default function ActivityFeedPage() {
  const [selectedQuickFilter, setSelectedQuickFilter] = useState(0);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  // Would come from auth context in real app
  const organizationId = undefined;

  // Fetch all projects to get their GitHub URLs
  const { data: projectsData, isLoading: projectsLoading } = useProjects({ limit: 100 });

  // Filter projects that have GitHub URLs
  const projectsWithGitHub = useMemo(() => {
    if (!projectsData?.data) return [];
    return projectsData.data.filter((p) => p.githubUrl);
  }, [projectsData]);

  // Get the effective selected project (use first if none selected)
  const effectiveSelectedProject = useMemo(() => {
    if (selectedProject) return selectedProject;
    return projectsWithGitHub.length > 0 ? projectsWithGitHub[0].id : null;
  }, [selectedProject, projectsWithGitHub]);

  // Get the selected project's repo info
  const selectedProjectData = useMemo(() => {
    if (!effectiveSelectedProject) return null;
    const project = projectsWithGitHub.find((p) => p.id === effectiveSelectedProject);
    if (!project?.githubUrl) return null;
    const repoInfo = parseGitHubUrl(project.githubUrl);
    return repoInfo ? { project, repoInfo } : null;
  }, [effectiveSelectedProject, projectsWithGitHub]);

  // Fetch GitHub data for the selected project only (fixed hook call count)
  const { data: commits, isLoading: commitsLoading } = useGitHubCommits(
    selectedProjectData?.repoInfo?.owner,
    selectedProjectData?.repoInfo?.repo,
    { perPage: 15 }
  );

  const { data: pullRequests, isLoading: prsLoading } = useGitHubPullRequests(
    selectedProjectData?.repoInfo?.owner,
    selectedProjectData?.repoInfo?.repo,
    { state: 'all', perPage: 10 }
  );

  const { data: issues, isLoading: issuesLoading } = useGitHubIssues(
    selectedProjectData?.repoInfo?.owner,
    selectedProjectData?.repoInfo?.repo,
    { state: 'all', perPage: 10 }
  );

  // Aggregate GitHub activity from the selected project
  const aggregatedActivities = useMemo(() => {
    if (!selectedProjectData) return [];

    const activities: AggregatedActivity[] = [];
    const project = selectedProjectData.project;

    // Add commits
    (commits || []).forEach((commit: GitHubCommit) => {
      activities.push({
        id: `commit-${project.id}-${commit.sha}`,
        type: 'commit',
        title: commit.message.split('\n')[0],
        author: {
          name: commit.author.login || commit.author.name,
          avatar: commit.author.avatarUrl,
        },
        timestamp: new Date(commit.author.date),
        url: commit.url,
        project: {
          id: project.id,
          title: project.title,
          logoUrl: project.logoUrl ?? undefined,
        },
        metadata: { sha: commit.sha },
      });
    });

    // Add PRs
    (pullRequests || []).forEach((pr: GitHubPullRequest) => {
      const prType = pr.mergedAt ? 'pr_merged' : pr.state === 'closed' ? 'pr_closed' : 'pr_open';
      activities.push({
        id: `pr-${project.id}-${pr.id}`,
        type: prType,
        title: pr.title,
        author: {
          name: pr.user.login,
          avatar: pr.user.avatar_url,
        },
        timestamp: new Date(pr.mergedAt || pr.closedAt || pr.createdAt),
        url: pr.url,
        project: {
          id: project.id,
          title: project.title,
          logoUrl: project.logoUrl ?? undefined,
        },
        metadata: { number: pr.number, labels: pr.labels },
      });
    });

    // Add issues (filter out PRs which GitHub returns in issues)
    (issues || []).forEach((issue: GitHubIssue) => {
      if ('pull_request' in issue) return;
      activities.push({
        id: `issue-${project.id}-${issue.id}`,
        type: issue.state === 'closed' ? 'issue_closed' : 'issue_open',
        title: issue.title,
        author: {
          name: issue.user.login,
          avatar: issue.user.avatar_url,
        },
        timestamp: new Date(issue.state === 'closed' && issue.closedAt ? issue.closedAt : issue.createdAt),
        url: issue.url,
        project: {
          id: project.id,
          title: project.title,
          logoUrl: project.logoUrl ?? undefined,
        },
        metadata: { number: issue.number, labels: issue.labels },
      });
    });

    // Sort by timestamp (most recent first)
    return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [selectedProjectData, commits, pullRequests, issues]);

  // Check if any data is loading
  const isGitHubLoading = commitsLoading || prsLoading || issuesLoading;

  // Get current filter based on quick filter selection
  const currentFilter = QUICK_FILTERS[selectedQuickFilter]?.filter || {};

  // Calculate stats
  const totalProjects = projectsWithGitHub.length;
  const totalCommits = commits?.length || 0;
  const totalPRs = pullRequests?.length || 0;
  const totalIssues = issues?.filter((i: GitHubIssue) => !('pull_request' in i))?.length || 0;

  // Get activity style
  const getActivityStyle = (type: AggregatedActivity['type']) => {
    switch (type) {
      case 'commit':
        return { icon: GitCommit, color: 'bg-blue-500/20 text-blue-500', label: 'Commit' };
      case 'pr_open':
        return { icon: GitPullRequest, color: 'bg-green-500/20 text-green-500', label: 'PR Opened' };
      case 'pr_merged':
        return { icon: GitMerge, color: 'bg-purple-500/20 text-purple-500', label: 'PR Merged' };
      case 'pr_closed':
        return { icon: XCircle, color: 'bg-red-500/20 text-red-500', label: 'PR Closed' };
      case 'issue_open':
        return { icon: CircleDot, color: 'bg-green-500/20 text-green-500', label: 'Issue Opened' };
      case 'issue_closed':
        return { icon: CheckCircle2, color: 'bg-purple-500/20 text-purple-500', label: 'Issue Closed' };
      default:
        return { icon: Activity, color: 'bg-muted text-muted-foreground', label: 'Activity' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
          <Activity className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Activity Feed</h1>
          <p className="text-sm text-muted-foreground">
            Central feed showing all activity across your platform
          </p>
        </div>
      </div>

      {/* Stats cards - OS Style */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <FolderKanban className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalProjects}</p>
              <p className="text-xs text-muted-foreground">Projects</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <GitCommit className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalCommits}</p>
              <p className="text-xs text-muted-foreground">Commits</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <GitPullRequest className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalPRs}</p>
              <p className="text-xs text-muted-foreground">Pull Requests</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <CircleDot className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalIssues}</p>
              <p className="text-xs text-muted-foreground">Issues</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick filters - OS Style chips */}
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((filter, index) => {
          const Icon = filter.icon;
          const isSelected = selectedQuickFilter === index;
          return (
            <button
              key={filter.label}
              onClick={() => setSelectedQuickFilter(index)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-xl border transition-all',
                isSelected
                  ? 'bg-primary/20 border-primary/30 text-primary'
                  : 'bg-card/50 border-border/50 text-muted-foreground hover:bg-card hover:border-border hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{filter.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Activity feed - takes 2 columns on large screens */}
        <div className="lg:col-span-2">
          <ActivityFeed
            organizationId={organizationId}
            showHeader={false}
            showFilters={true}
            maxHeight="calc(100vh - 400px)"
            initialFilters={currentFilter}
            limit={12}
          />
        </div>

        {/* Sidebar with GitHub - OS Style */}
        <div className="space-y-4">
          {/* Connected Projects */}
          <div className="p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                <Github className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-medium">Connected Repositories</p>
                <p className="text-xs text-muted-foreground">
                  {projectsWithGitHub.length} project{projectsWithGitHub.length !== 1 ? 's' : ''} with GitHub
                </p>
              </div>
            </div>
            {projectsLoading ? (
              <div className="flex flex-col items-center justify-center h-20 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Loading projects...</p>
              </div>
            ) : projectsWithGitHub.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
                <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center mb-2">
                  <FolderGit2 className="h-5 w-5 opacity-50" />
                </div>
                <p className="text-sm">No GitHub repos connected</p>
                <p className="text-xs mt-1 text-center px-4">
                  Connect a GitHub repo to your projects to see activity here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <ScrollArea className="h-[160px]">
                  <div className="space-y-1 pr-3">
                    {projectsWithGitHub.map((project) => {
                      const repoInfo = parseGitHubUrl(project.githubUrl!);
                      return (
                        <button
                          key={project.id}
                          onClick={() => setSelectedProject(project.id)}
                          className={cn(
                            'w-full text-left p-2 rounded-lg border transition-all flex items-center gap-2',
                            effectiveSelectedProject === project.id
                              ? 'bg-primary/10 border-primary/30'
                              : 'bg-background/50 border-border/50 hover:bg-background/80'
                          )}
                        >
                          {project.logoUrl ? (
                            <img
                              src={project.logoUrl}
                              alt={project.title}
                              className="h-5 w-5 rounded object-cover"
                            />
                          ) : (
                            <div className="h-5 w-5 rounded bg-muted flex items-center justify-center">
                              <FolderGit2 className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              'text-sm font-medium truncate',
                              effectiveSelectedProject === project.id ? 'text-primary' : ''
                            )}>
                              {project.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : ''}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Aggregated GitHub Activity Timeline */}
          {projectsWithGitHub.length > 0 && (
            <div className="p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <GitCommit className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium">GitHub Activity</p>
                  <p className="text-xs text-muted-foreground">
                    {aggregatedActivities.length} recent activities
                  </p>
                </div>
              </div>
              <ScrollArea className="h-[400px]">
                {isGitHubLoading || projectsLoading ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Loading activity...</p>
                  </div>
                ) : aggregatedActivities.length > 0 ? (
                  <div className="pr-3">
                    {aggregatedActivities.slice(0, 20).map((activity, index) => {
                      const style = getActivityStyle(activity.type);
                      const Icon = style.icon;
                      const isLast = index === Math.min(aggregatedActivities.length, 20) - 1;

                      return (
                        <a
                          key={activity.id}
                          href={activity.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex gap-3 group"
                        >
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
                              <p className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors">
                                {activity.title}
                              </p>

                              {/* Metadata row */}
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[11px]">
                                {/* Type badge */}
                                <Badge
                                  variant="outline"
                                  className={cn('text-[10px] px-1.5 py-0 border-0', style.color)}
                                >
                                  {style.label}
                                </Badge>

                                {/* Project */}
                                <div className="flex items-center gap-1">
                                  {activity.project.logoUrl ? (
                                    <img
                                      src={activity.project.logoUrl}
                                      alt={activity.project.title}
                                      className="h-3 w-3 rounded"
                                    />
                                  ) : (
                                    <FolderGit2 className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  <span className="text-muted-foreground truncate max-w-[80px]">
                                    {activity.project.title}
                                  </span>
                                </div>

                                <span className="text-muted-foreground/50">·</span>

                                {/* Author */}
                                <div className="flex items-center gap-1">
                                  {activity.author.avatar ? (
                                    <img
                                      src={activity.author.avatar}
                                      alt={activity.author.name}
                                      className="h-3.5 w-3.5 rounded-full"
                                    />
                                  ) : (
                                    <div className="h-3.5 w-3.5 rounded-full bg-secondary flex items-center justify-center">
                                      <User className="h-2 w-2 text-muted-foreground" />
                                    </div>
                                  )}
                                  <span className="text-muted-foreground">{activity.author.name}</span>
                                </div>

                                <span className="text-muted-foreground/50">·</span>

                                {/* Timestamp */}
                                <span className="text-muted-foreground">
                                  {formatRelativeTime(activity.timestamp)}
                                </span>

                                {/* SHA for commits */}
                                {activity.metadata?.sha && (
                                  <>
                                    <span className="text-muted-foreground/50">·</span>
                                    <code className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1 rounded">
                                      {activity.metadata.sha.slice(0, 7)}
                                    </code>
                                  </>
                                )}

                                {/* PR/Issue number */}
                                {activity.metadata?.number && (
                                  <>
                                    <span className="text-muted-foreground/50">·</span>
                                    <span className="font-mono text-muted-foreground">
                                      #{activity.metadata.number}
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* Labels */}
                              {activity.metadata?.labels && activity.metadata.labels.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {activity.metadata.labels.slice(0, 2).map((label) => (
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
                                  {activity.metadata.labels.length > 2 && (
                                    <span className="text-[9px] text-muted-foreground">
                                      +{activity.metadata.labels.length - 2}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center mb-2">
                      <GitCommit className="h-5 w-5 opacity-50" />
                    </div>
                    <p className="text-sm">No recent activity</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
