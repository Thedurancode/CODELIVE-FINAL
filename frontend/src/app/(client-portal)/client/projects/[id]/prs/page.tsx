'use client';

import { use, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ExternalLink,
  GitPullRequest,
  GitMerge,
  Circle,
  XCircle,
} from 'lucide-react';
import { useClientPullRequests, useClientProject } from '@/hooks/use-client-portal';
import { formatDistanceToNow } from 'date-fns';

export default function ClientPRsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [state, setState] = useState<'open' | 'closed' | 'all'>('all');

  const { data: project } = useClientProject(id);
  const { data: prs, isLoading } = useClientPullRequests(id, { state, perPage: 50 });

  const openCount = prs?.filter((p) => p.state === 'open').length || 0;
  const mergedCount = prs?.filter((p) => p.merged).length || 0;
  const closedCount =
    prs?.filter((p) => p.state === 'closed' && !p.merged).length || 0;

  const getPRIcon = (pr: { state: string; merged: boolean }) => {
    if (pr.merged) return <GitMerge className="h-5 w-5 text-purple-500" />;
    if (pr.state === 'open')
      return <GitPullRequest className="h-5 w-5 text-green-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pull Requests</h1>
        <p className="text-muted-foreground">
          {project?.title || 'Project'} pull requests
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={state} onValueChange={(v) => setState(v as typeof state)}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            <GitPullRequest className="h-4 w-4" />
            All
          </TabsTrigger>
          <TabsTrigger value="open" className="gap-2">
            <Circle className="h-4 w-4" />
            Open ({openCount})
          </TabsTrigger>
          <TabsTrigger value="closed" className="gap-2">
            <GitMerge className="h-4 w-4" />
            Merged ({mergedCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* PR List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : prs && prs.length > 0 ? (
        <div className="space-y-4">
          {prs.map((pr) => (
            <Card
              key={pr.number}
              className="hover:bg-accent/50 transition-colors"
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="pt-1">{getPRIcon(pr)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={pr.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline text-lg"
                      >
                        {pr.title}
                      </a>
                      <a
                        href={pr.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                      >
                        <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">
                        {pr.head.ref} → {pr.base.ref}
                      </Badge>
                      {pr.merged && (
                        <Badge variant="secondary" className="bg-purple-500/20">
                          Merged
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      #{pr.number}{' '}
                      {pr.merged
                        ? 'merged'
                        : pr.state === 'open'
                          ? 'opened'
                          : 'closed'}{' '}
                      {formatDistanceToNow(
                        new Date(
                          pr.merged
                            ? pr.merged_at!
                            : pr.state === 'open'
                              ? pr.created_at
                              : pr.closed_at || pr.updated_at
                        ),
                        { addSuffix: true }
                      )}{' '}
                      by {pr.user?.login || 'unknown'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <GitPullRequest className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No Pull Requests</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {state === 'all'
                ? 'No pull requests have been created yet.'
                : `No ${state} pull requests.`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
