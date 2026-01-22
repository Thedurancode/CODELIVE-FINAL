import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PropertyContact, ContactRole } from '@/types';

export function usePropertyContacts(propertyId: string) {
  return useQuery({
    queryKey: ['propertyContacts', propertyId],
    queryFn: () => api.get<PropertyContact[]>(`/api/listings/${propertyId}/contacts`),
    enabled: !!propertyId,
  });
}

export function useAssignContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      propertyId,
      contactId,
      role,
      isPrimary,
      notes,
    }: {
      propertyId: string;
      contactId: string;
      role: ContactRole;
      isPrimary?: boolean;
      notes?: string;
    }) =>
      api.post<PropertyContact>(`/api/listings/${propertyId}/contacts`, {
        contactId,
        role,
        isPrimary,
        notes,
      }),
    onSuccess: (_, { propertyId }) => {
      queryClient.invalidateQueries({ queryKey: ['propertyContacts', propertyId] });
    },
  });
}

export function useUnassignContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      propertyId,
      contactId,
      role,
    }: {
      propertyId: string;
      contactId: string;
      role?: ContactRole;
    }) => {
      const url = role
        ? `/api/listings/${propertyId}/contacts/${contactId}?role=${role}`
        : `/api/listings/${propertyId}/contacts/${contactId}`;
      return api.delete(url);
    },
    onSuccess: (_, { propertyId }) => {
      queryClient.invalidateQueries({ queryKey: ['propertyContacts', propertyId] });
    },
  });
}

export function useUpdateContactAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      propertyId,
      contactId,
      updates,
    }: {
      propertyId: string;
      contactId: string;
      updates: { role?: ContactRole; isPrimary?: boolean; notes?: string };
    }) => api.patch<PropertyContact>(`/api/listings/${propertyId}/contacts/${contactId}`, updates),
    onSuccess: (_, { propertyId }) => {
      queryClient.invalidateQueries({ queryKey: ['propertyContacts', propertyId] });
    },
  });
}
