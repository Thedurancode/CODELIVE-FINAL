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
    queryFn: () => api.get<Project>(`/api/projects/${id}`),
    enabled: !!id,
  });
}

export function useProjectStats() {
  return useQuery({
    queryKey: ['projectStats'],
    queryFn: () => api.get<ProjectStats>('/api/projects/stats'),
  });
}

export function useSearchProjects(query: string, limit: number = 10) {
  return useQuery({
    queryKey: ['projectSearch', query],
    queryFn: () => api.get<Project[]>(`/api/projects/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    enabled: query.length >= 2,
  });
}

export function useProjectTags() {
  return useQuery({
    queryKey: ['projectTags'],
    queryFn: () => api.get<{ tag: string; count: number }[]>('/api/projects/tags'),
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
    queryFn: () => api.get<TeamMember[]>('/api/projects/team-members'),
  });
}

/**
 * Get members assigned to a specific project
 */
export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => api.get<ProjectMember[]>(`/api/projects/${projectId}/members`),
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
