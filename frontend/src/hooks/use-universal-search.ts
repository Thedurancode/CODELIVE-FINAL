import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Contact, Project, PaginatedResponse } from '@/types';

export interface UniversalSearchResult {
  type: 'project' | 'contact';
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  icon: 'project' | 'contact';
  href: string;
  image?: string;
  data: Project | Contact | Record<string, unknown>;
}

export interface UniversalSearchResults {
  projects: UniversalSearchResult[];
  contacts: UniversalSearchResult[];
  total: number;
}

async function fetchUniversalSearch(query: string, limit: number = 3): Promise<UniversalSearchResults> {
  // Fetch all searches in parallel
  const [projectsRes, contactsRes] = await Promise.allSettled([
    api.get<PaginatedResponse<Project>>(`/api/projects?search=${encodeURIComponent(query)}&limit=${limit}`),
    api.get<Contact[]>(`/api/contacts/search?q=${encodeURIComponent(query)}&limit=${limit}`),
  ]);

  const results: UniversalSearchResults = {
    projects: [],
    contacts: [],
    total: 0,
  };

  // Process projects (priority)
  if (projectsRes.status === 'fulfilled' && projectsRes.value?.data) {
    const projects = projectsRes.value.data;
    results.projects = projects.map((p: Project) => ({
      type: 'project' as const,
      id: String(p.id),
      title: p.title || 'Untitled Project',
      subtitle: p.description || p.status?.replace('_', ' ') || 'Project',
      meta: p.status?.replace('_', ' '),
      icon: 'project' as const,
      href: `/projects/${p.id}`,
      image: p.logoUrl,
      data: p,
    }));
  }

  // Process contacts - API returns { success: true, data: [...] }
  if (contactsRes.status === 'fulfilled') {
    const contactData = contactsRes.value;
    // Handle both wrapped { data: [...] } and direct array responses
    const contacts: Contact[] = Array.isArray(contactData)
      ? contactData
      : (contactData as { data?: Contact[] })?.data || [];

    results.contacts = contacts.map((c: Contact) => ({
      type: 'contact' as const,
      id: String(c.id),
      title: c.name || c.email || 'Unknown',
      subtitle: c.company || c.type || 'Contact',
      meta: c.phone || c.email,
      icon: 'contact' as const,
      href: `/contacts/${c.id}`,
      image: (c as any).avatar || (c as any).imageUrl,
      data: c,
    }));
  }

  results.total = results.projects.length + results.contacts.length;

  return results;
}

export function useUniversalSearch(query: string, limit: number = 3) {
  return useQuery({
    queryKey: ['universalSearch', query, limit],
    queryFn: () => fetchUniversalSearch(query, limit),
    enabled: query.length >= 2,
    staleTime: 30000, // Cache for 30 seconds
  });
}
