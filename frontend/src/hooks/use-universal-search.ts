import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Property, Contact, Buyer, PaginatedResponse } from '@/types';

export interface UniversalSearchResult {
  type: 'property' | 'contact' | 'buyer' | 'buybox';
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  icon: 'property' | 'contact' | 'buyer' | 'buybox';
  href: string;
  image?: string;
  data: Property | Contact | Buyer | Record<string, unknown>;
}

export interface UniversalSearchResults {
  properties: UniversalSearchResult[];
  contacts: UniversalSearchResult[];
  buyers: UniversalSearchResult[];
  buyboxes: UniversalSearchResult[];
  total: number;
}

async function fetchUniversalSearch(query: string, limit: number = 3): Promise<UniversalSearchResults> {
  // Fetch all searches in parallel
  const [propertiesRes, contactsRes, buyersRes, buyboxesRes] = await Promise.allSettled([
    api.get<PaginatedResponse<Property>>(`/api/listings?search=${encodeURIComponent(query)}&limit=${limit}`),
    api.get<Contact[]>(`/api/contacts/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    api.get<Buyer[]>(`/api/buyers/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    api.get<PaginatedResponse<{ id: string; name: string; [key: string]: unknown }>>(`/api/hedgefunds?search=${encodeURIComponent(query)}&limit=${limit}`),
  ]);

  const results: UniversalSearchResults = {
    properties: [],
    contacts: [],
    buyers: [],
    buyboxes: [],
    total: 0,
  };

  // Process properties
  if (propertiesRes.status === 'fulfilled' && propertiesRes.value?.data) {
    const properties = propertiesRes.value.data;
    results.properties = properties.map((p: Property) => {
      const address = typeof p.address === 'string'
        ? p.address
        : `${p.address?.houseNumber || ''} ${p.address?.street || ''}`.trim();
      // Get the first photo from photoLinks array
      const propertyImage = p.photoLinks && p.photoLinks.length > 0 ? p.photoLinks[0] : undefined;
      return {
        type: 'property' as const,
        id: String(p.id),
        title: address || 'Unknown Address',
        subtitle: `${p.city}, ${p.state} ${p.zip || ''}`.trim(),
        meta: p.askingPrice ? `$${p.askingPrice.toLocaleString()}` : undefined,
        icon: 'property' as const,
        href: `/deals/${p.id}`,
        image: propertyImage,
        data: p,
      };
    });
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

  // Process buyers - API returns { success: true, data: [...] }
  if (buyersRes.status === 'fulfilled') {
    const buyerData = buyersRes.value;
    // Handle both wrapped { data: [...] } and direct array responses
    const buyers: Buyer[] = Array.isArray(buyerData)
      ? buyerData
      : (buyerData as { data?: Buyer[] })?.data || [];

    results.buyers = buyers.map((b: Buyer) => ({
      type: 'buyer' as const,
      id: String(b.id),
      title: b.name || b.company || 'Unknown Buyer',
      subtitle: b.county && b.state ? `${b.county}, ${b.state}` : b.state || 'Buyer',
      meta: b.isHot ? 'Hot Buyer' : undefined,
      icon: 'buyer' as const,
      href: `/buyers?search=${encodeURIComponent(b.name || '')}`,
      image: (b as any).avatar || (b as any).imageUrl,
      data: b,
    }));
  }

  // Process buyboxes
  if (buyboxesRes.status === 'fulfilled' && buyboxesRes.value?.data) {
    const buyboxes = buyboxesRes.value.data;
    results.buyboxes = buyboxes.map((bb: { id: string; name: string; fundName?: string; criteria?: { states?: string[] }; active?: boolean; [key: string]: unknown }) => {
      // Build subtitle from fund name and states
      const states = bb.criteria?.states;
      const stateText = states && states.length > 0
        ? states.length <= 3
          ? states.join(', ')
          : `${states.slice(0, 2).join(', ')} +${states.length - 2}`
        : null;
      const subtitle = [bb.fundName, stateText].filter(Boolean).join(' • ') || 'Buy Box';

      return {
        type: 'buybox' as const,
        id: String(bb.id),
        title: bb.name || 'Unnamed Buy Box',
        subtitle,
        meta: bb.active ? 'Active' : 'Inactive',
        icon: 'buybox' as const,
        href: `/buyboxes?id=${bb.id}`,
        data: bb,
      };
    });
  }

  results.total = results.properties.length + results.contacts.length + results.buyers.length + results.buyboxes.length;

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
