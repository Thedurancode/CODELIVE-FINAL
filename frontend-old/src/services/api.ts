import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface Deal {
  id: number;
  propertyId: string;
  status: 'new' | 'reviewing' | 'submitted' | 'accepted' | 'rejected' | 'countered';
  propertyType: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    county?: string;
  };
  askingPrice: number;
  arv?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  yearBuilt?: number;
  occupancyStatus?: string;
  source?: string;
  sourceContact?: string;
  photos?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  scoringResults?: ScoringResult[];
}

export interface BuyBox {
  id: string;
  name: string;
  fundName: string;
  description?: string;
  enabled: boolean;
  priority: number;
  autoSubmit: boolean;
  autoSubmitThreshold?: number;
  contactEmail?: string;
  contactPhone?: string;
  criteria: {
    states?: string[];
    counties?: string[];
    cities?: string[];
    zipCodes?: string[];
    propertyTypes?: string[];
    minPrice?: number;
    maxPrice?: number;
    minARV?: number;
    maxARV?: number;
    minBedrooms?: number;
    maxBedrooms?: number;
    minBathrooms?: number;
    maxBathrooms?: number;
    minSqft?: number;
    maxSqft?: number;
    minYearBuilt?: number;
    minGrossYield?: number;
    allowPool?: boolean;
    allowSeptic?: boolean;
    allowFloodZone?: boolean;
    conditions?: string[];
    investmentStrategies?: string[];
  };
  scoringWeights?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface ScoringResult {
  buyBoxId: string;
  buyBoxName: string;
  fundName: string;
  totalScore: number;
  matchPercentage: number;
  breakdown: Record<string, { score: number; weight: number; details: string }>;
  hardNos: string[];
  isMatch: boolean;
}

export interface DashboardStats {
  totalDeals: number;
  newDeals: number;
  reviewingDeals: number;
  submittedDeals: number;
  acceptedDeals: number;
  rejectedDeals: number;
  activeBuyBoxes: number;
  totalBuyBoxes: number;
  avgMatchScore: number;
  topMatches: { dealId: number; address: string; score: number; buyBox: string }[];
  recentDeals: Deal[];
  dealsByState: Record<string, number>;
}

export interface PipelineColumn {
  id: string;
  title: string;
  deals: Deal[];
}

// API Functions
export const dealsApi = {
  getAll: async (params?: { status?: string; state?: string; limit?: number; offset?: number }) => {
    const response = await api.get<{ deals: Deal[]; total: number }>('/deals', { params });
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get<Deal>(`/deals/${id}`);
    return response.data;
  },

  create: async (deal: Partial<Deal>) => {
    const response = await api.post<Deal>('/deals', deal);
    return response.data;
  },

  update: async (id: number, deal: Partial<Deal>) => {
    const response = await api.put<Deal>(`/deals/${id}`, deal);
    return response.data;
  },

  updateStatus: async (id: number, status: Deal['status']) => {
    const response = await api.patch<Deal>(`/deals/${id}/status`, { status });
    return response.data;
  },

  delete: async (id: number) => {
    await api.delete(`/deals/${id}`);
  },

  score: async (id: number) => {
    const response = await api.post<{ results: ScoringResult[] }>(`/deals/${id}/score`);
    return response.data;
  },

  getPipeline: async (): Promise<PipelineColumn[]> => {
    const response = await api.get<{ pipeline: PipelineColumn[] }>('/deals/pipeline');
    return response.data.pipeline;
  },
};

export const buyBoxesApi = {
  getAll: async () => {
    const response = await api.get<BuyBox[]>('/buyboxes');
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<BuyBox>(`/buyboxes/${id}`);
    return response.data;
  },

  create: async (buyBox: Partial<BuyBox>) => {
    const response = await api.post<BuyBox>('/buyboxes', buyBox);
    return response.data;
  },

  update: async (id: string, buyBox: Partial<BuyBox>) => {
    const response = await api.put<BuyBox>(`/buyboxes/${id}`, buyBox);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/buyboxes/${id}`);
  },

  toggle: async (id: string, enabled: boolean) => {
    const response = await api.patch<BuyBox>(`/buyboxes/${id}/toggle`, { enabled });
    return response.data;
  },
};

export const scoringApi = {
  testDeal: async (deal: Partial<Deal>, buyBoxIds?: string[]) => {
    const response = await api.post<{ results: ScoringResult[] }>('/scoring/test', { deal, buyBoxIds });
    return response.data;
  },

  scoreDeal: async (dealId: number) => {
    const response = await api.post<{ results: ScoringResult[] }>(`/scoring/deal/${dealId}`);
    return response.data;
  },

  getBestMatches: async (dealId: number, limit?: number) => {
    const response = await api.get<{ matches: ScoringResult[] }>(`/scoring/deal/${dealId}/matches`, { params: { limit } });
    return response.data;
  },
};

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await api.get<DashboardStats>('/dashboard/stats');
    return response.data;
  },
};

export const settingsApi = {
  get: async () => {
    const response = await api.get('/settings');
    return response.data;
  },

  update: async (settings: Record<string, any>) => {
    const response = await api.put('/settings', settings);
    return response.data;
  },

  testConnection: async (service: string) => {
    const response = await api.post(`/settings/test/${service}`);
    return response.data;
  },
};

export default api;
