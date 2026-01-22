/**
 * Sprite Store
 *
 * Zustand store for managing Sprites state:
 * - Active sprites per project
 * - Terminal dialog state
 * - Recent sessions (persisted)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Sprite, SpriteStatus } from '@/types/sprite';

// Active sprite info for quick access
interface ActiveSpriteInfo {
  id: string;
  projectId: string;
  status: SpriteStatus;
  spriteName: string;
  lastAccessedAt: string;
}

// Recent terminal session for quick resume
interface RecentSession {
  spriteId: string;
  projectId: string;
  projectTitle: string;
  sessionId: string;
  lastUsed: string;
}

interface SpriteState {
  // Active sprites map (projectId -> sprite info)
  activeSprites: Record<string, ActiveSpriteInfo>;

  // Terminal dialog state
  terminalOpen: boolean;
  currentSpriteId: string | null;
  currentProjectId: string | null;

  // Terminal dimensions
  terminalCols: number;
  terminalRows: number;

  // Recent sessions (persisted for quick resume)
  recentSessions: RecentSession[];

  // Actions
  setActiveSprite: (projectId: string, sprite: Sprite | null) => void;
  updateSpriteStatus: (projectId: string, status: SpriteStatus) => void;
  removeActiveSprite: (projectId: string) => void;
  clearActiveSprites: () => void;

  // Terminal actions
  openTerminal: (spriteId: string, projectId: string) => void;
  closeTerminal: () => void;
  setTerminalDimensions: (cols: number, rows: number) => void;

  // Session tracking
  addRecentSession: (session: Omit<RecentSession, 'lastUsed'>) => void;
  removeRecentSession: (spriteId: string) => void;
  clearRecentSessions: () => void;
}

const MAX_RECENT_SESSIONS = 10;

export const useSpriteStore = create<SpriteState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeSprites: {},
      terminalOpen: false,
      currentSpriteId: null,
      currentProjectId: null,
      terminalCols: 80,
      terminalRows: 24,
      recentSessions: [],

      // Set or update active sprite for a project
      setActiveSprite: (projectId, sprite) =>
        set((state) => {
          if (!sprite) {
            const { [projectId]: _, ...rest } = state.activeSprites;
            return { activeSprites: rest };
          }

          return {
            activeSprites: {
              ...state.activeSprites,
              [projectId]: {
                id: sprite.id,
                projectId: sprite.projectId,
                status: sprite.status,
                spriteName: sprite.spriteName,
                lastAccessedAt: sprite.lastAccessedAt || new Date().toISOString(),
              },
            },
          };
        }),

      // Update just the status of an active sprite
      updateSpriteStatus: (projectId, status) =>
        set((state) => {
          const existing = state.activeSprites[projectId];
          if (!existing) return state;

          return {
            activeSprites: {
              ...state.activeSprites,
              [projectId]: {
                ...existing,
                status,
                lastAccessedAt: new Date().toISOString(),
              },
            },
          };
        }),

      // Remove a sprite from active tracking
      removeActiveSprite: (projectId) =>
        set((state) => {
          const { [projectId]: _, ...rest } = state.activeSprites;
          return { activeSprites: rest };
        }),

      // Clear all active sprites
      clearActiveSprites: () => set({ activeSprites: {} }),

      // Open terminal for a sprite
      openTerminal: (spriteId, projectId) =>
        set({
          terminalOpen: true,
          currentSpriteId: spriteId,
          currentProjectId: projectId,
        }),

      // Close terminal
      closeTerminal: () =>
        set({
          terminalOpen: false,
          currentSpriteId: null,
          currentProjectId: null,
        }),

      // Update terminal dimensions
      setTerminalDimensions: (cols, rows) =>
        set({
          terminalCols: cols,
          terminalRows: rows,
        }),

      // Add a recent session
      addRecentSession: (session) =>
        set((state) => {
          // Remove existing session for same sprite if exists
          const filtered = state.recentSessions.filter(
            (s) => s.spriteId !== session.spriteId
          );

          // Add new session at the beginning
          const updated = [
            { ...session, lastUsed: new Date().toISOString() },
            ...filtered,
          ].slice(0, MAX_RECENT_SESSIONS);

          return { recentSessions: updated };
        }),

      // Remove a recent session
      removeRecentSession: (spriteId) =>
        set((state) => ({
          recentSessions: state.recentSessions.filter(
            (s) => s.spriteId !== spriteId
          ),
        })),

      // Clear all recent sessions
      clearRecentSessions: () => set({ recentSessions: [] }),
    }),
    {
      name: 'sprite-storage',
      partialize: (state) => ({
        // Only persist recent sessions and terminal dimensions
        recentSessions: state.recentSessions,
        terminalCols: state.terminalCols,
        terminalRows: state.terminalRows,
      }),
    }
  )
);

// Selector hooks for common use cases
export const useActiveSprite = (projectId: string) =>
  useSpriteStore((state) => state.activeSprites[projectId]);

// Individual terminal state selectors to avoid object creation on every render
export const useTerminalOpen = () => useSpriteStore((state) => state.terminalOpen);
export const useCurrentSpriteId = () => useSpriteStore((state) => state.currentSpriteId);
export const useCurrentProjectId = () => useSpriteStore((state) => state.currentProjectId);
export const useTerminalDimensions = () => {
  const cols = useSpriteStore((state) => state.terminalCols);
  const rows = useSpriteStore((state) => state.terminalRows);
  return { cols, rows };
};

export const useRecentSessions = () =>
  useSpriteStore((state) => state.recentSessions);
