import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Email source configuration types
export interface EmailSourceSettings {
  fetchMethod: 'webhook' | 'imap' | 'gmail_api';
  // IMAP settings
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPassword?: string;
  imapTls?: boolean;
  // Gmail API settings
  gmailCredentials?: string;
  gmailTokens?: string;
  // Common settings
  pollIntervalMinutes?: number;
  senderFilter?: string;
  subjectFilter?: string;
  parsingMode?: 'ai' | 'template' | 'regex';
  templatePattern?: string;
  webhookSecret?: string;
}

export interface EmailSource {
  id: string;
  name: string;
  type: 'email';
  enabled: boolean;
  settings: EmailSourceSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedDeal {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  arv?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  propertyType?: string;
  confidence?: number;
  propertyId?: number;
}

export interface EmailInboxItem {
  id: number;
  sourceId: string;
  sourceName: string;
  messageId: string;
  from: string;
  to?: string;
  subject: string;
  receivedAt: string;
  processedAt?: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
  parsingMode?: 'ai' | 'template' | 'regex';
  hasPdfAttachment: boolean;
  pdfFileName?: string;
  extractedDeals: ExtractedDeal[];
  dealCount: number;
  errorMessage?: string;
  rawEmailPreview?: string;
  processingTimeMs?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailInboxSummary {
  total: number;
  success: number;
  failed: number;
  pending: number;
  totalDeals: number;
  lastProcessed?: string;
}

export interface PaginatedInbox {
  data: EmailInboxItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Fetch all email sources
export function useEmailSources() {
  return useQuery({
    queryKey: ['email-sources'],
    queryFn: async () => {
      const sources = await api.get<EmailSource[]>('/api/plugins/sources');
      // Filter to only email type sources
      return sources.filter((s) => s.type === 'email');
    },
  });
}

// Fetch a single email source
export function useEmailSource(sourceId: string) {
  return useQuery({
    queryKey: ['email-source', sourceId],
    queryFn: () => api.get<EmailSource>(`/api/plugins/sources/${sourceId}`),
    enabled: !!sourceId,
  });
}

// Test email connection
export function useTestEmailConnection() {
  return useMutation({
    mutationFn: (settings: EmailSourceSettings) =>
      api.post<{ success: boolean; message: string; details?: Record<string, unknown> }>(
        '/api/plugins/sources/email/test',
        settings
      ),
  });
}

// Create a new email source
export function useCreateEmailSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; settings: EmailSourceSettings }) =>
      api.post<EmailSource>('/api/plugins/sources', {
        name: data.name,
        type: 'email',
        enabled: true,
        settings: data.settings,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-sources'] });
      queryClient.invalidateQueries({ queryKey: ['deal-sources'] });
    },
  });
}

// Update an existing email source
export function useUpdateEmailSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sourceId,
      data,
    }: {
      sourceId: string;
      data: { name?: string; enabled?: boolean; settings?: Partial<EmailSourceSettings> };
    }) => api.put<EmailSource>(`/api/plugins/sources/${sourceId}/update`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['email-sources'] });
      queryClient.invalidateQueries({ queryKey: ['email-source', variables.sourceId] });
      queryClient.invalidateQueries({ queryKey: ['deal-sources'] });
    },
  });
}

// Delete an email source
export function useDeleteEmailSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sourceId: string) => api.delete(`/api/plugins/sources/${sourceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-sources'] });
      queryClient.invalidateQueries({ queryKey: ['deal-sources'] });
    },
  });
}

// Fetch inbox history for a source
export function useEmailInbox(
  sourceId: string,
  options?: {
    page?: number;
    limit?: number;
    status?: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
  }
) {
  const { page = 1, limit = 20, status } = options || {};

  return useQuery({
    queryKey: ['email-inbox', sourceId, { page, limit, status }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (status) params.append('status', status);

      return api.get<PaginatedInbox>(`/api/plugins/sources/${sourceId}/inbox?${params}`);
    },
    enabled: !!sourceId,
  });
}

// Fetch inbox summary for a source
export function useEmailInboxSummary(sourceId: string) {
  return useQuery({
    queryKey: ['email-inbox-summary', sourceId],
    queryFn: () => api.get<EmailInboxSummary>(`/api/plugins/sources/${sourceId}/inbox/summary`),
    enabled: !!sourceId,
  });
}

// Toggle email source enabled/disabled
export function useToggleEmailSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceId, enabled }: { sourceId: string; enabled: boolean }) =>
      api.put<EmailSource>(`/api/plugins/sources/${sourceId}/update`, { enabled }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['email-sources'] });
      queryClient.invalidateQueries({ queryKey: ['email-source', variables.sourceId] });
    },
  });
}

// Manually trigger email fetch
export function useTriggerEmailFetch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sourceId: string) =>
      api.post<{ success: boolean; dealsIngested: number }>(`/api/plugins/sources/${sourceId}/fetch`),
    onSuccess: (_data, sourceId) => {
      queryClient.invalidateQueries({ queryKey: ['email-inbox', sourceId] });
      queryClient.invalidateQueries({ queryKey: ['email-inbox-summary', sourceId] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}
