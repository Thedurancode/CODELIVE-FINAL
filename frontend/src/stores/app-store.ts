import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PropertyFilters } from '@/types';

interface AppState {
  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Selected items (for bulk actions)
  selectedPropertyIds: string[];
  selectProperty: (id: string) => void;
  deselectProperty: (id: string) => void;
  clearSelection: () => void;
  selectAll: (ids: string[]) => void;

  // Filters
  propertyFilters: PropertyFilters;
  setPropertyFilters: (filters: Partial<PropertyFilters>) => void;
  clearPropertyFilters: () => void;

  // Chat
  currentConversationId: string | null;
  setCurrentConversation: (id: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Theme
      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      // Selected items
      selectedPropertyIds: [],
      selectProperty: (id) =>
        set((state) => ({
          selectedPropertyIds: [...state.selectedPropertyIds, id],
        })),
      deselectProperty: (id) =>
        set((state) => ({
          selectedPropertyIds: state.selectedPropertyIds.filter((pid) => pid !== id),
        })),
      clearSelection: () => set({ selectedPropertyIds: [] }),
      selectAll: (ids) => set({ selectedPropertyIds: ids }),

      // Filters
      propertyFilters: { page: 1, limit: 20 },
      setPropertyFilters: (filters) =>
        set((state) => ({
          propertyFilters: { ...state.propertyFilters, ...filters },
        })),
      clearPropertyFilters: () => set({ propertyFilters: { page: 1, limit: 20 } }),

      // Chat
      currentConversationId: null,
      setCurrentConversation: (id) => set({ currentConversationId: id }),
    }),
    {
      name: 'dispotree-storage',
      partialize: (state) => ({
        theme: state.theme,
        // sidebarOpen intentionally not persisted - always start minimized
        propertyFilters: state.propertyFilters,
        currentConversationId: state.currentConversationId,
      }),
    }
  )
);
