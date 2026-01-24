'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  FolderKanban,
  Bug,
  GitPullRequest,
  GitCommit,
  Plus,
  ExternalLink,
} from 'lucide-react';
import {
  useClientProject,
  useClientIssues,
  useClientPullRequests,
  useClientCommits,
} from '@/hooks/use-client-portal';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';

export default function ClientProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: project, isLoading: isLoadingProject } = useClientProject(id);
  const { data: issues } = useClientIssues(id, { state: 'open', perPage: 5 });
  const { data: prs } = useClientPullRequests(id, { state: 'all', perPage: 5 });
  const { data: commits } = useClientCommits(id, { perPage: 5 });

  if (isLoadingProject) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  const openIssueCount = issues?.filter((i) => i.state === 'open').length || 0;
  const openPRCount = prs?.filter((p) => p.state === 'open' && !p.merged).length || 0;

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="flex items-start gap-4">
        {project.logoUrl ? (
          <Image
            src={project.logoUrl}
            alt={project.title}
            width={64}
            height={64}
            className="h-16 w-16 rounded-lg object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
            <FolderKanban className="h-8 w-8 text-primary" />
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
            <Badge variant="outline" className="capitalize">
              {project.status}
            </Badge>
          </div>
          {project.description && (
            <p className="text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        <Button onClick={() => router.push(`/client/projects/${id}/issues/new`)}>
          <Plus className="h-4 w-4 mr-2" />
          New Issue
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => router.push(`/client/projects/${id}/issues`)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Issues</CardTitle>
            <Bug className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openIssueCount}</div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => router.push(`/client/projects/${id}/prs`)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open PRs</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openPRCount}</div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => router.push(`/client/projects/${id}/commits`)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Commits</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{commits?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Issues */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Issues</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/client/projects/${id}/issues`)}
            >
              View All
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {issues && issues.length > 0 ? (
              issues.slice(0, 5).map((issue) => (
                <div
                  key={issue.number}
                  className="flex items-start gap-3 text-sm"
                >
                  <Badge
                    variant={issue.state === 'open' ? 'default' : 'secondary'}
                    className="shrink-0"
                  >
                    {issue.state}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <a
                      href={issue.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline truncate block"
                    >
                      {issue.title}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      #{issue.number} opened{' '}
                      {formatDistanceToNow(new Date(issue.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <a
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </a>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No issues yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Commits */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Commits</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/client/projects/${id}/commits`)}
            >
              View All
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {commits && commits.length > 0 ? (
              commits.slice(0, 5).map((commit) => (
                <div
                  key={commit.sha}
                  className="flex items-start gap-3 text-sm"
                >
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {commit.sha.substring(0, 7)}
                  </code>
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{commit.message.split('\n')[0]}</p>
                    <p className="text-xs text-muted-foreground">
                      {commit.author?.name || 'Unknown'}{' '}
                      {commit.author?.date &&
                        formatDistanceToNow(new Date(commit.author.date), {
                          addSuffix: true,
                        })}
                    </p>
                  </div>
                  <a
                    href={commit.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </a>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No commits yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
