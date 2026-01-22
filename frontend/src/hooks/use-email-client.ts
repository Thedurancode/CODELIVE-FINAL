import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'archive';
export type EmailStatus = 'unread' | 'read' | 'replied' | 'forwarded';

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
}

export interface Email {
  id: number;
  accountEmail: string;
  messageId: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
  folder: EmailFolder;
  status: EmailStatus;
  starred: boolean;
  important: boolean;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  attachments?: EmailAttachment[];
  hasAttachments: boolean;
  labels?: string[];
  sentAt?: string;
  receivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailClientStatus {
  configured: boolean;
  canSend: boolean;
  accountEmail: string | null;
  lastSyncAt: string | null;
  syncStatus: string | null;
  lastSyncError: string | null;
}

export interface EmailUnreadCounts {
  inbox: number;
  sent: number;
  drafts: number;
  trash: number;
  archive: number;
}

export interface EmailStats {
  total: number;
  unread: number;
  byFolder: EmailUnreadCounts;
}

export interface PaginatedEmails {
  data: Email[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SyncResult {
  synced: number;
  skipped: number;
  errors: number;
  newEmailCount: number;
}

// Fetch email client status
export function useEmailClientStatus() {
  return useQuery({
    queryKey: ['email-client-status'],
    queryFn: async (): Promise<EmailClientStatus> => {
      const response = await api.get<EmailClientStatus>('/api/email-client/status');
      // Ensure we never return undefined
      return response ?? {
        configured: false,
        canSend: false,
        accountEmail: null,
        lastSyncAt: null,
        syncStatus: null,
        lastSyncError: null,
      };
    },
  });
}

// Sync emails from server
export function useSyncEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: { limit?: number; folder?: string }) => {
      // API client auto-unwraps data.data, so response is SyncResult directly
      const response = await api.post<SyncResult>(
        '/api/email-client/sync',
        options || {}
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['email-unread-counts'] });
      queryClient.invalidateQueries({ queryKey: ['email-stats'] });
    },
  });
}

// Fetch emails by folder
export function useEmails(
  folder: EmailFolder,
  options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: EmailStatus;
    starred?: boolean;
  }
) {
  const { page = 1, limit = 50, search, status, starred } = options || {};

  return useQuery({
    queryKey: ['emails', folder, { page, limit, search, status, starred }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      if (starred !== undefined) params.append('starred', String(starred));

      const response = await api.get<PaginatedEmails>(
        `/api/email-client/folders/${folder}?${params}`
      );
      return response;
    },
  });
}

// Fetch single email
export function useEmail(id: number | null) {
  return useQuery({
    queryKey: ['email', id],
    queryFn: async () => {
      if (!id) return null;
      // API client auto-unwraps data.data
      return api.get<Email>(`/api/email-client/emails/${id}`);
    },
    enabled: !!id,
  });
}

// Fetch email thread
export function useEmailThread(threadId: string | null) {
  return useQuery({
    queryKey: ['email-thread', threadId],
    queryFn: async () => {
      if (!threadId) return [];
      return api.get<Email[]>(`/api/email-client/threads/${encodeURIComponent(threadId)}`);
    },
    enabled: !!threadId,
  });
}

// Get unread counts
export function useEmailUnreadCounts() {
  return useQuery({
    queryKey: ['email-unread-counts'],
    queryFn: () => api.get<EmailUnreadCounts>('/api/email-client/unread-counts'),
    refetchInterval: 60000, // Refresh every minute
  });
}

// Get email stats
export function useEmailStats() {
  return useQuery({
    queryKey: ['email-stats'],
    queryFn: () => api.get<EmailStats>('/api/email-client/stats'),
  });
}

// Search emails
export function useSearchEmails(query: string, options?: { folder?: EmailFolder; limit?: number }) {
  const { folder, limit = 50 } = options || {};

  return useQuery({
    queryKey: ['email-search', query, { folder, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      if (folder) params.append('folder', folder);
      return api.get<Email[]>(`/api/email-client/search?${params}`);
    },
    enabled: query.length >= 2,
  });
}

// Mark email as read
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.post<Email>(`/api/email-client/emails/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['email-unread-counts'] });
    },
  });
}

// Mark email as unread
export function useMarkAsUnread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.post<Email>(`/api/email-client/emails/${id}/unread`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['email-unread-counts'] });
    },
  });
}

// Toggle starred
export function useToggleStarred() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.post<Email>(`/api/email-client/emails/${id}/star`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
  });
}

// Move email to folder
export function useMoveToFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, folder }: { id: number; folder: EmailFolder }) =>
      api.post<Email>(`/api/email-client/emails/${id}/move`, { folder }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['email-unread-counts'] });
    },
  });
}

// Delete email
export function useDeleteEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/email-client/emails/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['email-unread-counts'] });
    },
  });
}

// Bulk update emails
export function useBulkUpdateEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      ids: number[];
      status?: EmailStatus;
      starred?: boolean;
      folder?: EmailFolder;
    }) => api.post<{ affectedCount: number }>('/api/email-client/bulk', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['email-unread-counts'] });
    },
  });
}

// Send email
export function useSendEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      to: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      subject: string;
      text?: string;
      html?: string;
      replyTo?: string;
      inReplyTo?: string;
      references?: string[];
    }) => api.post<{ id: string; email: Email }>('/api/email-client/send', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', 'sent'] });
    },
  });
}

// Save draft
export function useSaveDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      id?: number;
      to: string[];
      cc?: string[];
      subject: string;
      bodyText?: string;
      bodyHtml?: string;
      inReplyTo?: string;
    }) => api.post<Email>('/api/email-client/drafts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', 'drafts'] });
    },
  });
}

// Format email address for display
export function formatEmailAddress(address: EmailAddress): string {
  if (address.name) {
    return `${address.name} <${address.email}>`;
  }
  return address.email;
}

// Format email addresses for display
export function formatEmailAddresses(addresses: EmailAddress[]): string {
  return addresses.map(formatEmailAddress).join(', ');
}

// Get initials from email address
export function getEmailInitials(address: EmailAddress): string {
  if (address.name) {
    return address.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  return address.email[0].toUpperCase();
}

// Document types for picker
export interface DocumentWithProperty {
  id: number;
  propertyId: number;
  documentType: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  status: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
  property?: {
    id: number;
    address?: { street?: string; houseNumber?: string } | string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

interface AllDocumentsResponse {
  data: DocumentWithProperty[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Fetch all documents across all properties
export function useAllDocuments(options?: {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
}) {
  const { page = 1, limit = 50, search, type } = options || {};

  return useQuery({
    queryKey: ['all-documents', { page, limit, search, type }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.append('search', search);
      if (type) params.append('type', type);

      const response = await api.get<AllDocumentsResponse>(
        `/api/documents?${params}`
      );
      return response;
    },
  });
}
