'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  MoreHorizontal,
  FolderKanban,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Github,
  Calendar,
  Tag,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  useProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useProjectTags,
  useBulkDeleteProjects,
  useBulkAddProjectMembers,
} from '@/hooks/use-projects';
import { toast } from 'sonner';
import type { Project, ProjectStatus } from '@/types';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { SpriteLaunchButton } from '@/components/sprites';

const STATUS_COLORS: Record<ProjectStatus, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  on_hold: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  archived: 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const TAG_COLORS = [
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-green-500/20 text-green-400 border-green-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
];

function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ProjectsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data, isLoading, error, refetch } = useProjects({
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    tags: tagFilter ? [tagFilter] : undefined,
  });

  const { data: tagsData } = useProjectTags();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const bulkDeleteProjects = useBulkDeleteProjects();
  const bulkAddProjectMembers = useBulkAddProjectMembers();

  const allTags: { tag: string; count: number }[] = Array.isArray(tagsData) ? tagsData : ((tagsData as any)?.data || []);
  const projects = data?.data || [];
  const pagination = data?.pagination;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p: Project) => p.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} projects?`)) return;
    try {
      await bulkDeleteProjects.mutateAsync(Array.from(selectedIds));
      toast.success(`${selectedIds.size} projects deleted`);
      clearSelection();
    } catch {
      toast.error('Failed to delete projects');
    }
  };

  const handleCreate = async (projectData: Partial<Project> & { memberIds?: string[] }) => {
    try {
      const { memberIds, ...data } = projectData;
      const project = await createProject.mutateAsync(data);

      // Add team members if any were selected
      if (memberIds && memberIds.length > 0 && project?.id) {
        try {
          await bulkAddProjectMembers.mutateAsync({
            projectId: project.id,
            memberIds,
          });
          toast.success(`Project created with ${memberIds.length} team member${memberIds.length > 1 ? 's' : ''}`);
        } catch {
          toast.success('Project created, but failed to add some team members');
        }
      } else {
        toast.success('Project created successfully');
      }

      setIsFormOpen(false);
    } catch {
      toast.error('Failed to create project');
    }
  };

  const handleUpdate = async (projectData: Partial<Project>) => {
    if (!editingProject) return;
    try {
      await updateProject.mutateAsync({ id: editingProject.id, data: projectData });
      toast.success('Project updated successfully');
      setEditingProject(null);
    } catch {
      toast.error('Failed to update project');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      await deleteProject.mutateAsync(id);
      toast.success('Project deleted successfully');
    } catch {
      toast.error('Failed to delete project');
    }
  };

  const openEditDialog = (project: Project) => {
    setEditingProject(project);
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage your projects and tasks</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load projects</p>
            <p className="text-muted-foreground mb-4">{(error as Error).message}</p>
            <Button onClick={() => refetch()} variant="outline" className="border">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Projects</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {isLoading ? 'Loading...' : `${pagination?.total || 0} projects`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            className="border text-foreground"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {mounted ? (
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button className="bg-accent-600 hover:bg-accent-700 text-white">
                  <Plus className="mr-2 h-4 w-4" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Create Project</DialogTitle>
                </DialogHeader>
                <ProjectForm
                  onSubmit={handleCreate}
                  onCancel={() => setIsFormOpen(false)}
                  isLoading={createProject.isPending}
                />
              </DialogContent>
            </Dialog>
          ) : (
            <Button className="bg-accent-600 hover:bg-accent-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Tag Sidebar */}
        <div className="hidden lg:block w-48 shrink-0 space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground px-2 flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tags
          </h3>
          <div className="space-y-1">
            <button
              onClick={() => setTagFilter(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                tagFilter === null
                  ? 'bg-accent-600/20 text-accent-400'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              All Projects
              <span className="float-right text-muted-foreground">{pagination?.total || 0}</span>
            </button>
            {allTags.map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                  tagFilter === tag
                    ? 'bg-accent-600/20 text-accent-400'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Badge variant="outline" className={`${getTagColor(tag)} text-xs`}>
                    {tag}
                  </Badge>
                </span>
                <span className="text-muted-foreground ml-2">{count}</span>
              </button>
            ))}
            {allTags.length === 0 && (
              <p className="text-xs text-muted-foreground px-3 py-2">No tags yet</p>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-4">
          {/* Bulk Action Bar */}
          {selectedIds.size > 0 && (
            <div className="bg-accent-600/10 border border-accent-600/30 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedIds.size === projects.length && projects.length > 0}
                  onCheckedChange={() => toggleSelectAll()}
                />
                <span className="text-sm text-foreground">
                  {selectedIds.size} project{selectedIds.size !== 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-700 text-red-400 hover:bg-red-900/20"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9 bg-card border text-foreground"
              />
            </div>
            {/* Mobile tag filter - only render on client to avoid hydration mismatch */}
            {mounted && (
              <Select
                value={tagFilter || 'all'}
                onValueChange={(v) => setTagFilter(v === 'all' ? null : v)}
              >
                <SelectTrigger className="w-[150px] bg-card border text-foreground lg:hidden">
                  <Tag className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent className="bg-secondary border">
                  <SelectItem value="all" className="text-foreground">All Tags</SelectItem>
                  {allTags.map(({ tag }) => (
                    <SelectItem key={tag} value={tag} className="text-foreground">{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {mounted && (
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v as ProjectStatus | 'all');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[150px] bg-card border text-foreground">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-secondary border">
                  <SelectItem value="all" className="text-foreground">All Status</SelectItem>
                  <SelectItem value="active" className="text-foreground">Active</SelectItem>
                  <SelectItem value="on_hold" className="text-foreground">On Hold</SelectItem>
                  <SelectItem value="completed" className="text-foreground">Completed</SelectItem>
                  <SelectItem value="archived" className="text-foreground">Archived</SelectItem>
                  <SelectItem value="cancelled" className="text-foreground">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Table */}
          <Card className="bg-card border">
            {isLoading ? (
              <CardContent className="p-6">
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="h-10 w-10 rounded" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-1/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : projects.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow className="border hover:bg-transparent">
                        <TableHead className="text-muted-foreground w-10">
                          <Checkbox
                            checked={selectedIds.size === projects.length && projects.length > 0}
                            onCheckedChange={() => toggleSelectAll()}
                          />
                        </TableHead>
                        <TableHead className="text-muted-foreground">Project</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-muted-foreground">Tags</TableHead>
                        <TableHead className="text-muted-foreground">Start Date</TableHead>
                        <TableHead className="text-muted-foreground">Target End</TableHead>
                        <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projects.map((project: Project) => (
                        <TableRow
                          key={project.id}
                          className={`border hover:bg-secondary/50 ${selectedIds.has(project.id) ? 'bg-accent-600/10' : ''}`}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(project.id)}
                              onCheckedChange={() => toggleSelect(project.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Link href={`/projects/${project.id}`} className="block">
                              <div className="flex items-center gap-3">
                                {project.logoUrl ? (
                                  <img
                                    src={project.logoUrl}
                                    alt={`${project.title} logo`}
                                    className="h-10 w-10 rounded-lg object-cover shrink-0"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-lg bg-accent-600/20 flex items-center justify-center shrink-0">
                                    <FolderKanban className="h-5 w-5 text-accent-400" />
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium text-foreground hover:text-accent-400 transition-colors">
                                    {project.title}
                                  </p>
                                  {project.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-1">
                                      {project.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_COLORS[project.status]}>
                              {project.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {project.tags && project.tags.length > 0 ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                {project.tags.slice(0, 2).map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className={`${getTagColor(tag)} text-xs cursor-pointer`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTagFilter(tag);
                                    }}
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                                {project.tags.length > 2 && (
                                  <span className="text-xs text-muted-foreground">
                                    +{project.tags.length - 2}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatDate(project.startDate)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatDate(project.targetEndDate)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {project.githubUrl && (
                                <>
                                  <SpriteLaunchButton
                                    projectId={project.id}
                                    projectTitle={project.title}
                                    compact
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    asChild
                                  >
                                    <a
                                      href={project.githubUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Github className="h-4 w-4" />
                                    </a>
                                  </Button>
                                </>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-secondary border">
                                  <DropdownMenuItem asChild className="text-foreground cursor-pointer">
                                    <Link href={`/projects/${project.id}`}>
                                      <ExternalLink className="mr-2 h-4 w-4" />
                                      View
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openEditDialog(project)}
                                    className="text-foreground cursor-pointer"
                                  >
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  {project.githubUrl && (
                                    <DropdownMenuItem asChild className="text-foreground cursor-pointer">
                                      <a
                                        href={project.githubUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <Github className="mr-2 h-4 w-4" />
                                        Open GitHub
                                      </a>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator className="bg-border" />
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(project.id)}
                                    className="text-red-400 cursor-pointer"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border">
                    <p className="text-sm text-muted-foreground">
                      Showing {(page - 1) * pagination.limit + 1} to{' '}
                      {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                        className="border"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page + 1)}
                        disabled={page >= pagination.totalPages}
                        className="border"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No projects found</h3>
                <p className="text-muted-foreground text-center max-w-sm">
                  {search || statusFilter !== 'all' || tagFilter
                    ? 'Try adjusting your search or filters'
                    : 'Create your first project to get started'}
                </p>
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      {mounted && (
        <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
          <DialogContent className="bg-card border max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Edit Project</DialogTitle>
            </DialogHeader>
            {editingProject && (
              <ProjectForm
                project={editingProject}
                onSubmit={handleUpdate}
                onCancel={() => setEditingProject(null)}
                isLoading={updateProject.isPending}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
