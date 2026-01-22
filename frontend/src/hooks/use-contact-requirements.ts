'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Contact requirement field definition
export interface RequiredField {
  fieldName: string;
  displayName: string;
  dataType: string;
  required: boolean;
  validation?: string;
}

// Contact requirement definition
export interface ContactRequirement {
  category: string;
  role: string;
  phase: number;
  blocking: boolean;
  storageTable?: string;
  requiredFields?: RequiredField[];
}

// Contact type with state assignments (aggregated view)
export interface ContactRequirementType {
  category: string;
  role: string;
  phase: number;
  blocking: boolean;
  requiredFields: RequiredField[];
  states: string[];
}

// State contact requirements
export interface StateContactRequirements {
  state: string;
  contacts: ContactRequirement[];
}

// Bulk operation result
export interface BulkOperationResult {
  results: Array<{ state: string; status: string }>;
  summary: {
    added?: number;
    removed?: number;
    alreadyExists?: number;
    notFound?: number;
    errors: number;
  };
}

// Default contact types that can be added
export const DEFAULT_CONTACT_TYPES: ContactRequirement[] = [
  {
    category: 'wholesaler',
    role: 'Wholesaler/Submitter',
    phase: 0,
    blocking: true,
    storageTable: 'marketplace_users',
    requiredFields: [
      { fieldName: 'first_name', displayName: 'First Name', dataType: 'string', required: true },
      { fieldName: 'last_name', displayName: 'Last Name', dataType: 'string', required: true },
      { fieldName: 'email', displayName: 'Email Address', dataType: 'email', required: true },
      { fieldName: 'phone', displayName: 'Phone Number', dataType: 'phone', required: true },
    ],
  },
  {
    category: 'seller',
    role: 'Property Seller',
    phase: 0,
    blocking: true,
    storageTable: 'contacts',
    requiredFields: [
      { fieldName: 'name', displayName: 'Full Name', dataType: 'string', required: true },
      { fieldName: 'email', displayName: 'Email Address', dataType: 'email', required: false },
      { fieldName: 'phone', displayName: 'Phone Number', dataType: 'phone', required: true },
    ],
  },
  {
    category: 'attorney',
    role: 'Real Estate Attorney',
    phase: 1,
    blocking: true,
    storageTable: 'contacts',
    requiredFields: [
      { fieldName: 'name', displayName: 'Attorney Name', dataType: 'string', required: true },
      { fieldName: 'company', displayName: 'Law Firm', dataType: 'string', required: false },
      { fieldName: 'email', displayName: 'Email Address', dataType: 'email', required: true },
      { fieldName: 'phone', displayName: 'Phone Number', dataType: 'phone', required: true },
      { fieldName: 'licenseNumber', displayName: 'Bar Number', dataType: 'string', required: false },
    ],
  },
  {
    category: 'title_company',
    role: 'Title Company',
    phase: 1,
    blocking: true,
    storageTable: 'contacts',
    requiredFields: [
      { fieldName: 'company', displayName: 'Company Name', dataType: 'string', required: true },
      { fieldName: 'name', displayName: 'Contact Person', dataType: 'string', required: true },
      { fieldName: 'email', displayName: 'Email Address', dataType: 'email', required: true },
      { fieldName: 'phone', displayName: 'Phone Number', dataType: 'phone', required: true },
    ],
  },
  {
    category: 'escrow_agent',
    role: 'Escrow Agent',
    phase: 1,
    blocking: false,
    storageTable: 'contacts',
    requiredFields: [
      { fieldName: 'company', displayName: 'Company Name', dataType: 'string', required: true },
      { fieldName: 'name', displayName: 'Agent Name', dataType: 'string', required: true },
      { fieldName: 'email', displayName: 'Email Address', dataType: 'email', required: true },
      { fieldName: 'phone', displayName: 'Phone Number', dataType: 'phone', required: true },
    ],
  },
  {
    category: 'buyer',
    role: 'End Buyer',
    phase: 2,
    blocking: true,
    storageTable: 'contacts',
    requiredFields: [
      { fieldName: 'name', displayName: 'Buyer Name', dataType: 'string', required: true },
      { fieldName: 'company', displayName: 'Company (if LLC)', dataType: 'string', required: false },
      { fieldName: 'email', displayName: 'Email Address', dataType: 'email', required: true },
      { fieldName: 'phone', displayName: 'Phone Number', dataType: 'phone', required: true },
    ],
  },
  {
    category: 'notary',
    role: 'Notary Public',
    phase: 2,
    blocking: false,
    storageTable: 'contacts',
    requiredFields: [
      { fieldName: 'name', displayName: 'Notary Name', dataType: 'string', required: true },
      { fieldName: 'email', displayName: 'Email Address', dataType: 'email', required: false },
      { fieldName: 'phone', displayName: 'Phone Number', dataType: 'phone', required: true },
    ],
  },
  {
    category: 'broker',
    role: 'Licensed Broker',
    phase: 0,
    blocking: true,
    storageTable: 'contacts',
    requiredFields: [
      { fieldName: 'name', displayName: 'Broker Name', dataType: 'string', required: true },
      { fieldName: 'company', displayName: 'Brokerage', dataType: 'string', required: true },
      { fieldName: 'email', displayName: 'Email Address', dataType: 'email', required: true },
      { fieldName: 'phone', displayName: 'Phone Number', dataType: 'phone', required: true },
      { fieldName: 'licenseNumber', displayName: 'License Number', dataType: 'string', required: true },
      { fieldName: 'licenseState', displayName: 'License State', dataType: 'string', required: true },
    ],
  },
];

// Attorney states (states that require an attorney at closing)
export const ATTORNEY_STATES = [
  'CT', 'DE', 'DC', 'GA', 'MA', 'MD', 'NC', 'NH', 'NJ', 'NY', 'RI', 'SC', 'VT', 'WV',
];

// States that require a licensed broker for wholesale deals
export const BROKER_REQUIRED_STATES = ['IL', 'OH', 'OK'];

/**
 * Fetch all contact requirement types with their state assignments
 */
export function useContactRequirementTypes() {
  return useQuery<ContactRequirementType[]>({
    queryKey: ['contact-requirement-types'],
    queryFn: async () => {
      const response = await api.get<ContactRequirementType[]>('/api/compliance/contact-requirements/types');
      return Array.isArray(response) ? response : [];
    },
    staleTime: 30000,
  });
}

/**
 * Fetch contact requirements for a specific state
 */
export function useContactRequirementsForState(state: string) {
  return useQuery<StateContactRequirements>({
    queryKey: ['contact-requirements', state],
    queryFn: async () => {
      const response = await api.get<StateContactRequirements>(`/api/compliance/contact-requirements/state/${state}`);
      return response;
    },
    enabled: !!state,
    staleTime: 30000,
  });
}

/**
 * Update contact requirements for a state
 */
export function useUpdateContactRequirementsForState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ state, contacts }: { state: string; contacts: ContactRequirement[] }) => {
      return api.put<StateContactRequirements>(`/api/compliance/contact-requirements/state/${state}`, { contacts });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-requirement-types'] });
      queryClient.invalidateQueries({ queryKey: ['contact-requirements'] });
    },
  });
}

/**
 * Bulk assign a contact requirement to multiple states
 */
export function useBulkAssignContactRequirement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactRequirement, states }: { contactRequirement: ContactRequirement; states: string[] }) => {
      return api.post<BulkOperationResult>('/api/compliance/contact-requirements/bulk-assign', {
        contactRequirement,
        states,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-requirement-types'] });
      queryClient.invalidateQueries({ queryKey: ['contact-requirements'] });
    },
  });
}

/**
 * Bulk remove a contact requirement from multiple states
 */
export function useBulkRemoveContactRequirement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ category, states }: { category: string; states: string[] }) => {
      return api.post<BulkOperationResult>('/api/compliance/contact-requirements/bulk-remove', {
        category,
        states,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-requirement-types'] });
      queryClient.invalidateQueries({ queryKey: ['contact-requirements'] });
    },
  });
}
