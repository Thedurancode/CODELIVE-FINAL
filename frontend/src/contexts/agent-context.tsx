'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useAgentConfig } from '@/hooks/use-setup';

interface AgentConfig {
  name: string;
  avatar: string;
  personality: string;
}

interface AgentContextType {
  agent: AgentConfig;
  isLoading: boolean;
}

const defaultAgent: AgentConfig = {
  name: 'Diana',
  avatar: '/agent.png',
  personality: 'friendly and professional',
};

const AgentContext = createContext<AgentContextType>({
  agent: defaultAgent,
  isLoading: true,
});

export function AgentProvider({ children }: { children: ReactNode }) {
  const { data: agentConfig, isLoading } = useAgentConfig();

  const agent: AgentConfig = {
    name: agentConfig?.name || defaultAgent.name,
    avatar: agentConfig?.avatar || defaultAgent.avatar,
    personality: agentConfig?.personality || defaultAgent.personality,
  };

  return (
    <AgentContext.Provider value={{ agent, isLoading }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}
