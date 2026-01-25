'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  LayoutList,
  LayoutGrid,
  Columns3,
  GripVertical,
  MonitorDown,
  Code2,
  Folder,
  Settings,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
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
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<ProjectStatus, string> = {
  in_talks: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  now_coding: 'bg-green-500/20 text-green-400 border-green-500/30',
  needs_review: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_ICONS: Record<ProjectStatus, { bg: string; dot: string }> = {
  in_talks: { bg: 'bg-purple-500/20', dot: 'bg-purple-500' },
  now_coding: { bg: 'bg-green-500/20', dot: 'bg-green-500' },
  needs_review: { bg: 'bg-amber-500/20', dot: 'bg-amber-500' },
  completed: { bg: 'bg-blue-500/20', dot: 'bg-blue-500' },
  cancelled: { bg: 'bg-red-500/20', dot: 'bg-red-500' },
};

const TAG_COLORS = [
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-green-500/20 text-green-400 border-green-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
];

type ViewMode = 'list' | 'grid' | 'kanban';

const KANBAN_COLUMNS: { status: ProjectStatus; title: string }[] = [
  { status: 'in_talks', title: 'In Talks' },
  { status: 'now_coding', title: 'Now Coding' },
  { status: 'needs_review', title: 'Needs Review' },
  { status: 'completed', title: 'Completed' },
  { status: 'cancelled', title: 'Cancelled' },
];

// Sidebar sections
const sidebarSections = [
  { id: 'all', label: 'All Projects', icon: Folder },
  { id: 'in_talks', label: 'In Talks', status: 'in_talks' as ProjectStatus },
  { id: 'now_coding', label: 'Now Coding', status: 'now_coding' as ProjectStatus },
  { id: 'needs_review', label: 'Needs Review', status: 'needs_review' as ProjectStatus },
  { id: 'completed', label: 'Completed', status: 'completed' as ProjectStatus },
  { id: 'cancelled', label: 'Cancelled', status: 'cancelled' as ProjectStatus },
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
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

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

  const getStatusCount = (status: ProjectStatus | 'all') => {
    if (status === 'all') return pagination?.total || 0;
    return projects.filter((p: Project) => p.status === status).length;
  };

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

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const projectId = result.draggableId;
    const newStatus = result.destination.droppableId as ProjectStatus;
    const project = projects.find((p: Project) => p.id === projectId);

    if (!project || project.status === newStatus) return;

    try {
      await updateProject.mutateAsync({ id: projectId, data: { status: newStatus } });
      toast.success(`Project moved to ${newStatus.replace('_', ' ')}`);
    } catch {
      toast.error('Failed to update project status');
    }
  };

  const getProjectsByStatus = (status: ProjectStatus) => {
    return projects.filter((p: Project) => p.status === status);
  };

  if (error) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold">Failed to load projects</h2>
          <p className="text-muted-foreground">{(error as Error).message}</p>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl bg-muted/50 border border-border/50">
              <div className="flex items-center gap-3 mb-3">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-3 w-full mb-2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      );
    }

    if (projects.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <FolderKanban className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No projects found</h3>
          <p className="text-muted-foreground text-center max-w-sm">
            {search || statusFilter !== 'all' || tagFilter
              ? 'Try adjusting your search or filters'
              : 'Create your first project to get started'}
          </p>
        </div>
      );
    }

    if (viewMode === 'kanban') {
      return (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto p-4 pb-6">
            {KANBAN_COLUMNS.map(({ status, title }) => {
              const columnProjects = getProjectsByStatus(status);
              return (
                <div key={status} className="flex-shrink-0 w-72">
                  <div className={`rounded-lg p-3 mb-3 ${STATUS_COLORS[status].replace('text-', 'bg-').split(' ')[0]}`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`font-medium ${STATUS_COLORS[status].split(' ')[1]}`}>
                        {title}
                      </h3>
                      <Badge variant="outline" className={`${STATUS_COLORS[status]} text-xs`}>
                        {columnProjects.length}
                      </Badge>
                    </div>
                  </div>
                  <Droppable droppableId={status}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-3 min-h-[200px] p-2 rounded-lg transition-colors ${
                          snapshot.isDraggingOver ? 'bg-primary/10' : 'bg-muted/30'
                        }`}
                      >
                        {columnProjects.map((project: Project, index: number) => (
                          <Draggable key={project.id} draggableId={project.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`bg-card border rounded-lg p-3 transition-shadow ${
                                  snapshot.isDragging ? 'shadow-lg ring-2 ring-primary' : ''
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <Link href={`/projects/${project.id}`} className="block">
                                      <div className="flex items-center gap-2 mb-1">
                                        {project.logoUrl ? (
                                          <img src={project.logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
                                        ) : (
                                          <div className="h-6 w-6 rounded bg-primary/20 flex items-center justify-center">
                                            <FolderKanban className="h-3 w-3 text-primary" />
                                          </div>
                                        )}
                                        <h4 className="font-medium text-sm hover:text-primary transition-colors truncate">
                                          {project.title}
                                        </h4>
                                      </div>
                                    </Link>
                                    {project.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                        {project.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      );
    }

    if (viewMode === 'list') {
      return (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedIds.size === projects.length && projects.length > 0}
                    onCheckedChange={() => toggleSelectAll()}
                  />
                </TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project: Project) => (
                <TableRow
                  key={project.id}
                  className={cn(
                    'border-border/50 hover:bg-muted/50',
                    selectedIds.has(project.id) && 'bg-primary/5'
                  )}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(project.id)}
                      onCheckedChange={() => toggleSelect(project.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/projects/${project.id}`} className="flex items-center gap-3">
                      {project.logoUrl ? (
                        <img src={project.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                          <FolderKanban className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium hover:text-primary transition-colors">{project.title}</p>
                        {project.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{project.description}</p>
                        )}
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
                      <div className="flex gap-1">
                        {project.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className={`${getTagColor(tag)} text-xs`}>
                            {tag}
                          </Badge>
                        ))}
                        {project.tags.length > 2 && (
                          <span className="text-xs text-muted-foreground">+{project.tags.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{formatDate(project.startDate)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {project.githubUrl && (
                        <SpriteLaunchButton
                          projectId={project.id}
                          projectTitle={project.title}
                          githubUrl={project.githubUrl}
                          compact
                        />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border">
                          <DropdownMenuItem asChild>
                            <Link href={`/projects/${project.id}`}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(project)}>
                            <Edit2 className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {project.githubUrl && (
                            <>
                              <DropdownMenuItem asChild>
                                <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">
                                  <Github className="mr-2 h-4 w-4" />
                                  GitHub
                                </a>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a href={`vscode://vscode.git/clone?url=${encodeURIComponent(project.githubUrl)}`}>
                                  <Code2 className="mr-2 h-4 w-4" />
                                  Clone in VS Code
                                </a>
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(project.id)} className="text-red-400">
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
      );
    }

    // Grid view (default)
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {projects.map((project: Project) => (
          <div
            key={project.id}
            className={cn(
              'p-4 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/50 transition-all group',
              selectedIds.has(project.id) && 'border-primary ring-1 ring-primary'
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedIds.has(project.id)}
                  onCheckedChange={() => toggleSelect(project.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                {project.logoUrl ? (
                  <img src={project.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center">
                    <FolderKanban className="h-6 w-6 text-primary" />
                  </div>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card border">
                  <DropdownMenuItem asChild>
                    <Link href={`/projects/${project.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openEditDialog(project)}>
                    <Edit2 className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  {project.githubUrl && (
                    <>
                      <DropdownMenuItem asChild>
                        <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">
                          <Github className="mr-2 h-4 w-4" />
                          GitHub
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={`vscode://vscode.git/clone?url=${encodeURIComponent(project.githubUrl)}`}>
                          <Code2 className="mr-2 h-4 w-4" />
                          Clone in VS Code
                        </a>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleDelete(project.id)} className="text-red-400">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Link href={`/projects/${project.id}`} className="block">
              <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-1 mb-1">
                {project.title}
              </h3>
              {project.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{project.description}</p>
              )}
            </Link>

            <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/30">
              <Badge variant="outline" className={`${STATUS_COLORS[project.status]} text-xs`}>
                {project.status.replace('_', ' ')}
              </Badge>
              <div className="flex items-center gap-1">
                {project.githubUrl && (
                  <SpriteLaunchButton
                    projectId={project.id}
                    projectTitle={project.title}
                    githubUrl={project.githubUrl}
                    compact
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-start justify-center py-6">
      <div className="w-full max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 px-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <FolderKanban className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Projects</h1>
              <p className="text-sm text-muted-foreground">
                {isLoading ? 'Loading...' : `${pagination?.total || 0} projects`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex border border-border/50 rounded-lg overflow-hidden">
              <Button
                variant="ghost"
                size="sm"
                className={cn('rounded-none h-9', viewMode === 'grid' && 'bg-primary/10 text-primary')}
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn('rounded-none h-9 border-x border-border/50', viewMode === 'list' && 'bg-primary/10 text-primary')}
                onClick={() => setViewMode('list')}
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn('rounded-none h-9', viewMode === 'kanban' && 'bg-primary/10 text-primary')}
                onClick={() => setViewMode('kanban')}
              >
                <Columns3 className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {mounted && (
              <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    New Project
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl max-w-xl p-0 overflow-hidden shadow-2xl">
                  <DialogHeader className="px-6 pt-6 pb-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                        <Plus className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <DialogTitle className="text-xl">Create Project</DialogTitle>
                        <p className="text-sm text-muted-foreground">Set up a new project</p>
                      </div>
                    </div>
                  </DialogHeader>
                  <div className="px-6 pb-6">
                    <ProjectForm
                      onSubmit={handleCreate}
                      onCancel={() => setIsFormOpen(false)}
                      isLoading={createProject.isPending}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex min-h-[600px]">
            {/* Sidebar */}
            <div className="w-56 border-r border-border/50 bg-muted/30 p-2 hidden lg:block">
              <ScrollArea className="h-[600px]">
                <nav className="space-y-1">
                  {/* Status filters */}
                  <div className="px-2 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </div>
                  {sidebarSections.map((section) => {
                    const isActive = statusFilter === (section.status || 'all');
                    const Icon = section.icon || (({ className }: { className: string }) => (
                      <div className={cn('w-2 h-2 rounded-full', STATUS_ICONS[section.status!]?.dot, className)} />
                    ));
                    return (
                      <button
                        key={section.id}
                        onClick={() => {
                          setStatusFilter(section.status || 'all');
                          setPage(1);
                        }}
                        className={cn(
                          'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                          'hover:bg-muted/70',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {section.icon ? (
                            <Icon className={cn('h-4 w-4', isActive && 'text-primary')} />
                          ) : (
                            <div className={cn('w-2 h-2 rounded-full', STATUS_ICONS[section.status!]?.dot)} />
                          )}
                          <span className="text-sm font-medium">{section.label}</span>
                        </div>
                      </button>
                    );
                  })}

                  {/* Tags */}
                  {allTags.length > 0 && (
                    <>
                      <div className="px-2 py-2 mt-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Tags
                      </div>
                      {allTags.map(({ tag, count }) => (
                        <button
                          key={tag}
                          onClick={() => {
                            setTagFilter(tagFilter === tag ? null : tag);
                            setPage(1);
                          }}
                          className={cn(
                            'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all',
                            'hover:bg-muted/70',
                            tagFilter === tag
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Badge variant="outline" className={`${getTagColor(tag)} text-xs`}>
                            {tag}
                          </Badge>
                          <span className="text-xs">{count}</span>
                        </button>
                      ))}
                    </>
                  )}
                </nav>
              </ScrollArea>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col">
              {/* Toolbar */}
              <div className="p-4 border-b border-border/50 flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-9 bg-muted/50 border-border/50"
                  />
                </div>

                {/* Mobile filters */}
                <div className="lg:hidden flex gap-2">
                  {mounted && (
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => {
                        setStatusFilter(v as ProjectStatus | 'all');
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[140px] bg-muted/50">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="in_talks">In Talks</SelectItem>
                        <SelectItem value="now_coding">Now Coding</SelectItem>
                        <SelectItem value="needs_review">Needs Review</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Bulk actions */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-sm text-muted-foreground">
                      {selectedIds.size} selected
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                      onClick={handleBulkDelete}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearSelection}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Main content area */}
              <ScrollArea className="flex-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${viewMode}-${statusFilter}-${tagFilter}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {renderContent()}
                  </motion.div>
                </AnimatePresence>
              </ScrollArea>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="p-4 border-t border-border/50 flex items-center justify-between">
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
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= pagination.totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Edit Dialog */}
        {mounted && (
          <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
            <DialogContent className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl max-w-xl p-0 overflow-hidden shadow-2xl">
              <DialogHeader className="px-6 pt-6 pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Settings className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl">Edit Project</DialogTitle>
                    <p className="text-sm text-muted-foreground">Update project settings</p>
                  </div>
                </div>
              </DialogHeader>
              <div className="px-6 pb-6">
                {editingProject && (
                  <ProjectForm
                    project={editingProject}
                    onSubmit={handleUpdate}
                    onCancel={() => setEditingProject(null)}
                    isLoading={updateProject.isPending}
                  />
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
