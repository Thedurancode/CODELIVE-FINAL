import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectBrandAsset, BrandAssetType, BrandAssetVariant } from '@/types';

export function useProjectBrandAssets(
  projectId: string,
  filters?: { assetType?: BrandAssetType; variant?: BrandAssetVariant }
) {
  const queryParams = new URLSearchParams();
  if (filters?.assetType) queryParams.append('assetType', filters.assetType);
  if (filters?.variant) queryParams.append('variant', filters.variant);
  const queryString = queryParams.toString();

  return useQuery({
    queryKey: ['projectBrandAssets', projectId, filters],
    queryFn: async () => {
      const response = await api.get<{ data: ProjectBrandAsset[] }>(
        `/api/projects/${projectId}/brand-assets${queryString ? `?${queryString}` : ''}`
      );
      // Endpoint is under /api/projects/ which is treated as paginated, so unwrap data
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectBrandAsset(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      file: File;
      name: string;
      description?: string;
      assetType: BrandAssetType;
      variant?: BrandAssetVariant;
      isPrimary?: boolean;
    }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('name', data.name);
      if (data.description) formData.append('description', data.description);
      formData.append('assetType', data.assetType);
      if (data.variant) formData.append('variant', data.variant);
      if (data.isPrimary !== undefined) formData.append('isPrimary', String(data.isPrimary));

      return api.upload<ProjectBrandAsset>(`/api/projects/${projectId}/brand-assets`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectBrandAssets', projectId] });
    },
  });
}

export function useUpdateProjectBrandAsset(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      assetId,
      data,
    }: {
      assetId: number;
      data: {
        name?: string;
        description?: string;
        assetType?: BrandAssetType;
        variant?: BrandAssetVariant;
        isPrimary?: boolean;
        sortOrder?: number;
      };
    }) => api.patch<ProjectBrandAsset>(`/api/projects/${projectId}/brand-assets/${assetId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectBrandAssets', projectId] });
    },
  });
}

export function useDeleteProjectBrandAsset(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assetId: number) =>
      api.delete(`/api/projects/${projectId}/brand-assets/${assetId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectBrandAssets', projectId] });
    },
  });
}

export function useReorderProjectBrandAssets(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assetIds: number[]) =>
      api.post(`/api/projects/${projectId}/brand-assets/reorder`, { assetIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectBrandAssets', projectId] });
    },
  });
}
