import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Document {
  id: string;
  name: string;
  type: string;
  chunks: number;
  createdAt: string;
}

interface SearchResult {
  id: string;
  documentName: string;
  snippet: string;
  score: number;
}

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get<Document[]>('/api/ai/knowledge/documents'),
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const token = typeof window !== 'undefined' ? localStorage.getItem('dispotree_token') : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/ai/knowledge/upload`, {
        method: 'POST',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to upload document');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/ai/knowledge/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useSearchKnowledge() {
  return useMutation({
    mutationFn: (query: string) =>
      api.post<SearchResult[]>('/api/ai/knowledge/search', { query }),
  });
}
