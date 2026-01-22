import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface ImportResult {
  success: boolean;
  imported: number;
  errors: string[];
}

export function useImportCSV() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const token = typeof window !== 'undefined' ? localStorage.getItem('dispotree_token') : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/listings/import/csv`, {
        method: 'POST',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to import CSV');
      }

      return res.json() as Promise<ImportResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export function useImportURL() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (url: string) =>
      api.post<ImportResult>('/api/listings/import/url', { url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export function useTestEmailConnection() {
  return useMutation({
    mutationFn: (config: {
      server: string;
      port: number;
      email: string;
      password: string;
    }) => api.post('/api/plugins/email/test', config),
  });
}

export function useSaveEmailConfig() {
  return useMutation({
    mutationFn: (config: {
      server: string;
      port: number;
      email: string;
      password: string;
    }) => api.post('/api/plugins/email/configure', config),
  });
}
