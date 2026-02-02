import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Project, ProjectFilters, ProjectStats, PaginatedResponse, TeamMember, ProjectMember, ProjectRole } from '@/types';

export function useProjects(filters: ProjectFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.search) params.append('search', filters.search);
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status.join(',') : filters.status;
    params.append('status', statuses);
  }
  if (filters.tags) params.append('tags', filters.tags.join(','));
  if (filters.createdById) params.append('createdById', filters.createdById);
  if (filters.sortBy) params.append('sortBy', filters.sortBy);
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

  const filtersKey = JSON.stringify(filters);

  return useQuery({
    queryKey: ['projects', filtersKey],
    queryFn: () => api.get<PaginatedResponse<Project>>(`/api/projects?${params.toString()}`),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const response = await api.get<{ data: Project }>(`/api/projects/${id}`);
      // Endpoint is under /api/projects/ which is treated as paginated, so unwrap data
      return response.data;
    },
    enabled: !!id,
  });
}

export function useProjectStats() {
  return useQuery({
    queryKey: ['projectStats'],
    queryFn: async () => {
      const response = await api.get<{ data: ProjectStats }>('/api/projects/stats');
      return response.data;
    },
  });
}

export function useSearchProjects(query: string, limit: number = 10) {
  return useQuery({
    queryKey: ['projectSearch', query],
    queryFn: async () => {
      const response = await api.get<{ data: Project[] }>(`/api/projects/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      return response.data;
    },
    enabled: query.length >= 2,
  });
}

export function useProjectTags() {
  return useQuery({
    queryKey: ['projectTags'],
    queryFn: async () => {
      const response = await api.get<{ data: { tag: string; count: number }[] }>('/api/projects/tags');
      return response.data;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Project> & { _logoFile?: File }) => {
      const { _logoFile, ...projectData } = data;
      const project = await api.post<Project>('/api/projects', projectData);

      // If there's a logo file, upload it after creating the project
      if (_logoFile && project.id) {
        try {
          const formData = new FormData();
          formData.append('file', _logoFile);
          const result = await api.upload<{ logoUrl: string }>(`/api/projects/${project.id}/logo`, formData);
          project.logoUrl = result.logoUrl;
        } catch (error) {
          console.error('Failed to upload logo:', error);
        }
      }

      return project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectStats'] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) =>
      api.patch<Project>(`/api/projects/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projectStats'] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectStats'] });
    },
  });
}

export function useBulkAddProjectTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectIds, tags }: { projectIds: string[]; tags: string[] }) =>
      api.post<{ updatedCount: number }>('/api/projects/bulk/tags', { projectIds, tags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectTags'] });
    },
  });
}

export function useBulkRemoveProjectTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectIds, tags }: { projectIds: string[]; tags: string[] }) =>
      api.delete<{ updatedCount: number }>('/api/projects/bulk/tags', { projectIds, tags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectTags'] });
    },
  });
}

export function useBulkDeleteProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectIds: string[]) =>
      api.post<{ deletedCount: number }>('/api/projects/bulk/delete', { projectIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectStats'] });
    },
  });
}

// ============================================================================
// TEAM MEMBER HOOKS
// ============================================================================

/**
 * Get all team members in the organization (for selection)
 */
export function useTeamMembers() {
  return useQuery({
    queryKey: ['teamMembers'],
    queryFn: async () => {
      const response = await api.get<{ data: TeamMember[] }>('/api/projects/team-members');
      return response.data;
    },
  });
}

/**
 * Get members assigned to a specific project
 */
export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: async () => {
      const response = await api.get<{ data: ProjectMember[] }>(`/api/projects/${projectId}/members`);
      return response.data;
    },
    enabled: !!projectId,
  });
}

/**
 * Add a single member to a project
 */
export function useAddProjectMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, memberId, projectRole, githubUsername }: {
      projectId: string;
      memberId: string;
      projectRole?: ProjectRole;
      githubUsername?: string;
    }) => api.post<ProjectMember>(`/api/projects/${projectId}/members`, {
      memberId,
      projectRole,
      githubUsername,
    }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

/**
 * Bulk add members to a project
 */
export function useBulkAddProjectMembers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, memberIds, projectRole }: {
      projectId: string;
      memberIds: string[];
      projectRole?: ProjectRole;
    }) => api.post<{ addedCount: number }>(`/api/projects/${projectId}/members/bulk`, {
      memberIds,
      projectRole,
    }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

/**
 * Update a project member's role
 */
export function useUpdateProjectMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, memberId, data }: {
      projectId: string;
      memberId: string;
      data: { projectRole?: ProjectRole; githubUsername?: string; notes?: string };
    }) => api.patch<ProjectMember>(`/api/projects/${projectId}/members/${memberId}`, data),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
    },
  });
}

/**
 * Remove a member from a project
 */
export function useRemoveProjectMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, memberId }: { projectId: string; memberId: string }) =>
      api.delete(`/api/projects/${projectId}/members/${memberId}`),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

// ============================================================================
// PROJECT RECAP HOOKS
// ============================================================================

export interface ProjectRecap {
  recap: string | null;
  updatedAt: string | null;
  projectId: string;
}

/**
 * Get the AI-generated recap for a project
 */
export function useProjectRecap(projectId: string) {
  return useQuery({
    queryKey: ['projectRecap', projectId],
    queryFn: async () => {
      const response = await api.get<{ data: ProjectRecap }>(`/api/projects/${projectId}/recap`);
      return response.data;
    },
    enabled: !!projectId,
  });
}

/**
 * Force refresh the AI recap for a project
 */
export function useRefreshProjectRecap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, userName }: { projectId: string; userName?: string }) =>
      api.post<ProjectRecap>(`/api/projects/${projectId}/recap/refresh`, { userName }),
    onSuccess: (data, { projectId }) => {
      queryClient.setQueryData(['projectRecap', projectId], data);
    },
  });
}

// ============================================================================
// SCREENSHOT HOOKS
// ============================================================================

interface ScreenshotData {
  screenshotUrl: string | null;
  deploymentUrl: string | null;
}

interface CaptureScreenshotResult {
  screenshotUrl: string;
  storagePath: string;
}

/**
 * Get screenshot data for a project
 */
export function useProjectScreenshot(projectId: string | undefined) {
  return useQuery({
    queryKey: ['projectScreenshot', projectId],
    queryFn: () => api.get<ScreenshotData>(`/api/projects/${projectId}/screenshot`),
    enabled: !!projectId,
  });
}

/**
 * Capture a new screenshot of the project's live deployment
 */
export function useCaptureProjectScreenshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api.post<CaptureScreenshotResult>(`/api/projects/${projectId}/screenshot`),
    onSuccess: (data, projectId) => {
      queryClient.setQueryData(['projectScreenshot', projectId], {
        screenshotUrl: data.screenshotUrl,
        deploymentUrl: null, // Will be refreshed with full project data
      });
      // Also invalidate the project to update screenshotUrl
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

/**
 * Delete the project screenshot
 */
export function useDeleteProjectScreenshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api.delete(`/api/projects/${projectId}/screenshot`),
    onSuccess: (_, projectId) => {
      queryClient.setQueryData(['projectScreenshot', projectId], {
        screenshotUrl: null,
        deploymentUrl: null,
      });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}
