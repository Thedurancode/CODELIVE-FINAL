import { create } from 'zustand';

export interface ArtifactContent {
  id: string;
  type: 'code' | 'document' | 'property' | 'table';
  title: string;
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

interface ChatState {
  // Conversation sidebar
  conversationSidebarOpen: boolean;
  toggleConversationSidebar: () => void;
  setConversationSidebarOpen: (open: boolean) => void;

  // Artifact panel
  artifactPanelOpen: boolean;
  currentArtifact: ArtifactContent | null;
  openArtifact: (artifact: ArtifactContent) => void;
  closeArtifact: () => void;
  toggleArtifactPanel: () => void;

  // Streaming state
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;

  // Input state
  inputValue: string;
  setInputValue: (value: string) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  // Conversation sidebar - collapsed by default for clean UI
  conversationSidebarOpen: false,
  toggleConversationSidebar: () =>
    set((state) => ({ conversationSidebarOpen: !state.conversationSidebarOpen })),
  setConversationSidebarOpen: (open) => set({ conversationSidebarOpen: open }),

  // Artifact panel
  artifactPanelOpen: false,
  currentArtifact: null,
  openArtifact: (artifact) => set({ artifactPanelOpen: true, currentArtifact: artifact }),
  closeArtifact: () => set({ artifactPanelOpen: false, currentArtifact: null }),
  toggleArtifactPanel: () =>
    set((state) => ({ artifactPanelOpen: !state.artifactPanelOpen })),

  // Streaming state
  isStreaming: false,
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),

  // Input state
  inputValue: '',
  setInputValue: (value) => set({ inputValue: value }),
}));
