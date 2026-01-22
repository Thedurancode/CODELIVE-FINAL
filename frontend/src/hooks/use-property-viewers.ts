import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PropertyViewer {
  userId: string;
  userName: string;
  userEmail?: string;
  userAvatar?: string;
  userRole?: string;
  viewedAt: string;
  viewCount: number;
}

export interface PropertyViewersResponse {
  success: true;
  data: PropertyViewer[];
  totalViews: number;
  uniqueViewers: number;
}

export function usePropertyViewers(propertyId: string) {
  return useQuery({
    queryKey: ['property-viewers', propertyId],
    queryFn: () => api.get<PropertyViewersResponse>(`/api/listings/${propertyId}/viewers`),
    enabled: !!propertyId,
  });
}

export function useRecordPropertyView() {
  return useMutation({
    mutationFn: (propertyId: string) =>
      api.post<{ success: boolean; alreadyViewed?: boolean; recorded?: boolean }>(
        `/api/listings/${propertyId}/view`
      ),
  });
}
