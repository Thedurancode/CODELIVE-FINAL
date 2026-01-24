'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderKanban, ChevronRight } from 'lucide-react';
import { useClientProjects, useClientProfile } from '@/hooks/use-client-portal';
import Image from 'next/image';

export default function ClientDashboardPage() {
  const router = useRouter();
  const { data: profile } = useClientProfile();
  const { data: projects, isLoading, error } = useClientProjects();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Failed to load projects</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome{profile?.user?.name ? `, ${profile.user.name}` : ''}
        </h1>
        <p className="text-muted-foreground">
          View and manage your projects
        </p>
      </div>

      {projects && projects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors group"
              onClick={() => router.push(`/client/projects/${project.id}`)}
            >
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                {project.logoUrl ? (
                  <Image
                    src={project.logoUrl}
                    alt={project.title}
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FolderKanban className="h-6 w-6 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg truncate">{project.title}</CardTitle>
                  <p className="text-xs text-muted-foreground capitalize">
                    {project.status}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </CardHeader>
              {project.description && (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No Projects</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You don&apos;t have access to any projects yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
