'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/stat-card';
import {
  FolderKanban,
  MessageSquare,
  GitBranch,
  ListTodo,
  ArrowRight,
  Cpu,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useProjects } from '@/hooks/use-projects';
import { useTasks } from '@/hooks/use-tasks';
import type { Project, Task } from '@/types';

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  on_hold: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  completed: 'bg-accent-500/10 text-accent-500 border-accent-500/20',
  archived: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const taskStatusIcons: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  in_progress: <Clock className="h-4 w-4 text-amber-500" />,
  pending: <Clock className="h-4 w-4 text-gray-500" />,
  blocked: <AlertCircle className="h-4 w-4 text-red-500" />,
};

export default function DashboardPage() {
  const { data: projectsData, isLoading: projectsLoading } = useProjects({ limit: 5 });
  const { data: tasksData, isLoading: tasksLoading } = useTasks({ limit: 5, status: ['pending', 'in_progress'] });

  const recentProjects = projectsData?.data || [];
  const totalProjects = projectsData?.pagination?.total || 0;
  const activeProjects = recentProjects.filter((p: Project) => p.status === 'active').length;

  const recentTasks = tasksData?.data || [];
  const totalTasks = tasksData?.pagination?.total || 0;
  const pendingTasks = recentTasks.filter((t: Task) => t.status === 'pending').length;
  const inProgressTasks = recentTasks.filter((t: Task) => t.status === 'in_progress').length;

  const isLoading = projectsLoading || tasksLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Welcome back! Here&apos;s your project overview.</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-card border">
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title="Total Projects"
              value={totalProjects}
              change={`${activeProjects} active`}
              changeType="neutral"
              icon={FolderKanban}
              iconColor="text-accent-500"
            />
            <StatCard
              title="Active Tasks"
              value={totalTasks}
              change={`${pendingTasks} pending`}
              changeType="neutral"
              icon={ListTodo}
              iconColor="text-purple-500"
            />
            <StatCard
              title="In Progress"
              value={inProgressTasks}
              change="Tasks being worked on"
              changeType="neutral"
              icon={Cpu}
              iconColor="text-amber-500"
            />
            <StatCard
              title="Completed"
              value={0}
              change="Tasks completed"
              changeType="positive"
              icon={CheckCircle2}
              iconColor="text-green-500"
            />
          </>
        )}
      </div>

      {/* Main Content Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Projects */}
        <Card className="bg-card border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground">Recent Projects</CardTitle>
            <Link href="/projects">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentProjects.length > 0 ? (
              <div className="space-y-3">
                {recentProjects.map((project: Project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {project.title}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {project.description || 'No description'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <Badge
                        variant="outline"
                        className={statusColors[project.status || 'active']}
                      >
                        {project.status || 'active'}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FolderKanban className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No projects yet</p>
                <Link href="/projects">
                  <Button variant="link" className="text-accent-400 mt-2">
                    Create your first project
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card className="bg-card border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground">Recent Tasks</CardTitle>
            <Link href="/tasks">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentTasks.length > 0 ? (
              <div className="space-y-3">
                {recentTasks.map((task: Task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {taskStatusIcons[task.status] || taskStatusIcons.pending}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {task.title}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ListTodo className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No tasks yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="text-foreground">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Link href="/projects">
              <Button variant="outline" className="w-full h-auto py-6 flex-col gap-2 border hover:bg-secondary hover:border-accent-600">
                <FolderKanban className="h-6 w-6 text-accent-500" />
                <span className="text-foreground">View Projects</span>
              </Button>
            </Link>
            <Link href="/chat">
              <Button variant="outline" className="w-full h-auto py-6 flex-col gap-2 border hover:bg-secondary hover:border-green-600">
                <MessageSquare className="h-6 w-6 text-green-500" />
                <span className="text-foreground">AI Assistant</span>
              </Button>
            </Link>
            <Link href="/activity-feed">
              <Button variant="outline" className="w-full h-auto py-6 flex-col gap-2 border hover:bg-secondary hover:border-purple-600">
                <GitBranch className="h-6 w-6 text-purple-500" />
                <span className="text-foreground">Activity Feed</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
