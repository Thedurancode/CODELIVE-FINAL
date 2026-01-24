'use client';

import { use } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ExternalLink, GitCommit } from 'lucide-react';
import { useClientCommits, useClientProject } from '@/hooks/use-client-portal';
import { formatDistanceToNow, format } from 'date-fns';

export default function ClientCommitsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: project } = useClientProject(id);
  const { data: commits, isLoading } = useClientCommits(id, { perPage: 50 });

  // Group commits by date
  const groupedCommits = commits?.reduce(
    (groups, commit) => {
      const date = commit.author?.date
        ? format(new Date(commit.author.date), 'MMMM d, yyyy')
        : 'Unknown Date';
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(commit);
      return groups;
    },
    {} as Record<string, typeof commits>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Commits</h1>
        <p className="text-muted-foreground">
          {project?.title || 'Project'} commit history
        </p>
      </div>

      {/* Commits List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : commits && commits.length > 0 ? (
        <div className="space-y-8">
          {Object.entries(groupedCommits || {}).map(([date, dateCommits]) => (
            <div key={date}>
              <h2 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                <GitCommit className="h-4 w-4" />
                {date}
              </h2>
              <div className="space-y-2">
                {dateCommits?.map((commit) => (
                  <Card key={commit.sha}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {commit.author?.name?.charAt(0)?.toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                {commit.message.split('\n')[0]}
                              </p>
                              {commit.message.split('\n').length > 1 && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {commit.message.split('\n').slice(1).join('\n').trim()}
                                </p>
                              )}
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
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span>{commit.author?.name || 'Unknown'}</span>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {commit.sha.substring(0, 7)}
                            </code>
                            {commit.author?.date && (
                              <span>
                                {formatDistanceToNow(new Date(commit.author.date), {
                                  addSuffix: true,
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <GitCommit className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No Commits</h3>
            <p className="text-sm text-muted-foreground mt-1">
              No commits have been made yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
