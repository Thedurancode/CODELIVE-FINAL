'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, ExternalLink, Bug, CheckCircle2, Circle } from 'lucide-react';
import { useClientIssues, useClientProject } from '@/hooks/use-client-portal';
import { formatDistanceToNow } from 'date-fns';

export default function ClientIssuesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [state, setState] = useState<'open' | 'closed' | 'all'>('all');

  const { data: project } = useClientProject(id);
  const { data: issues, isLoading } = useClientIssues(id, { state, perPage: 50 });

  const openCount = issues?.filter((i) => i.state === 'open').length || 0;
  const closedCount = issues?.filter((i) => i.state === 'closed').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Issues</h1>
          <p className="text-muted-foreground">
            {project?.title || 'Project'} issue tracker
          </p>
        </div>
        <Button onClick={() => router.push(`/client/projects/${id}/issues/new`)}>
          <Plus className="h-4 w-4 mr-2" />
          New Issue
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={state} onValueChange={(v) => setState(v as typeof state)}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            <Bug className="h-4 w-4" />
            All
          </TabsTrigger>
          <TabsTrigger value="open" className="gap-2">
            <Circle className="h-4 w-4" />
            Open ({openCount})
          </TabsTrigger>
          <TabsTrigger value="closed" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Closed ({closedCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Issues List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : issues && issues.length > 0 ? (
        <div className="space-y-4">
          {issues.map((issue) => (
            <Card
              key={issue.number}
              className="hover:bg-accent/50 transition-colors"
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="pt-1">
                    {issue.state === 'open' ? (
                      <Circle className="h-5 w-5 text-green-500" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-purple-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={issue.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline text-lg"
                      >
                        {issue.title}
                      </a>
                      <a
                        href={issue.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                      >
                        <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </a>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {issue.labels.map((label) => (
                        <Badge
                          key={label.name}
                          variant="outline"
                          style={{
                            borderColor: `#${label.color}`,
                            color: `#${label.color}`,
                          }}
                        >
                          {label.name}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      #{issue.number} {issue.state === 'open' ? 'opened' : 'closed'}{' '}
                      {formatDistanceToNow(
                        new Date(
                          issue.state === 'open'
                            ? issue.created_at
                            : issue.closed_at || issue.updated_at
                        ),
                        { addSuffix: true }
                      )}{' '}
                      by {issue.user?.login || 'unknown'}
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
            <Bug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No Issues</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {state === 'all'
                ? 'No issues have been created yet.'
                : `No ${state} issues.`}
            </p>
            <Button
              className="mt-4"
              onClick={() => router.push(`/client/projects/${id}/issues/new`)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Issue
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
