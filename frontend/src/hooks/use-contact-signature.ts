import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
interface ContactSignature {
  hasSignature: boolean;
  signatureUrl?: string;
  signatureUpdatedAt?: string;
}

interface SignatureRequest {
  id: string;
  status: 'pending' | 'completed' | 'expired';
  expiresAt: string;
  createdAt: string;
}

interface RequestSignatureResponse {
  requestId: string;
  token: string;
  expiresAt: string;
  signatureUrl: string;
  smsSent: boolean;
}

interface RequestSignatureParams {
  contactId: string;
  sendSms?: boolean;
}

interface PublicSignatureRequest {
  status: 'pending' | 'completed' | 'expired';
  expiresAt: string;
  contactName?: string;
  organizationName?: string;
}

interface UploadSignatureResponse {
  signatureUrl: string;
}

// ===========================================================================
// AUTHENTICATED HOOKS (for logged-in users managing contacts)
// ===========================================================================

/**
 * Get a contact's signature
 */
export function useContactSignature(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-signature', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const response = await api.get<ContactSignature>(`/api/contacts/${contactId}/signature`);
      return response;
    },
    enabled: !!contactId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get pending signature request for a contact
 */
export function usePendingSignatureRequest(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-signature-request', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const response = await api.get<SignatureRequest | null>(`/api/contacts/${contactId}/signature-request`);
      return response;
    },
    enabled: !!contactId,
    staleTime: 1000 * 30, // 30 seconds
  });
}

/**
 * Request a signature from a contact
 * @param sendSms - If true (default), sends SMS to contact. If false, just generates the link.
 */
export function useRequestSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, sendSms = true }: RequestSignatureParams) => {
      const response = await api.post<RequestSignatureResponse>(
        `/api/contacts/${contactId}/request-signature`,
        { sendSms }
      );
      return response;
    },
    onSuccess: (_, { contactId }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['contact-signature', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-signature-request', contactId] });
    },
  });
}

/**
 * Generate a signature link for a contact (without sending SMS)
 * Returns the URL to copy/share
 */
export function useGenerateSignatureLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contactId: string) => {
      const response = await api.post<RequestSignatureResponse>(
        `/api/contacts/${contactId}/request-signature`,
        { sendSms: false }
      );
      return response;
    },
    onSuccess: (_, contactId) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['contact-signature', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-signature-request', contactId] });
    },
  });
}

/**
 * Delete a contact's signature
 */
export function useDeleteSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contactId: string) => {
      await api.delete(`/api/contacts/${contactId}/signature`);
    },
    onSuccess: (_, contactId) => {
      queryClient.invalidateQueries({ queryKey: ['contact-signature', contactId] });
    },
  });
}

// ===========================================================================
// PUBLIC HOOKS (for contacts uploading their signature via token)
// ===========================================================================

/**
 * Get signature request details by token (public, no auth)
 */
export function usePublicSignatureRequest(token: string | undefined) {
  return useQuery({
    queryKey: ['public-signature-request', token],
    queryFn: async () => {
      if (!token) return null;
      // Use fetch directly for public endpoint (no auth header)
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/signatures/request/${token}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Invalid or expired request');
      }
      const data = await response.json();
      return data.data as PublicSignatureRequest;
    },
    enabled: !!token,
    retry: false,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Upload signature (public, no auth)
 */
export function useUploadSignature() {
  return useMutation({
    mutationFn: async ({ token, file, cleanupStrength }: { token: string; file: File; cleanupStrength?: number }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (cleanupStrength !== undefined) {
        formData.append('cleanupStrength', cleanupStrength.toString());
      }

      // Use fetch directly for public endpoint (no auth header)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/signatures/upload/${token}`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload signature');
      }

      const data = await response.json();
      return data.data as UploadSignatureResponse;
    },
  });
}
