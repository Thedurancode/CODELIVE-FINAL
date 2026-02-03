/**
 * Automaker API Hooks
 *
 * React Query hooks for integrating with the local Automaker server.
 * Automaker provides autonomous AI agents for code development tasks.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const AUTOMAKER_BASE_URL = process.env.NEXT_PUBLIC_AUTOMAKER_URL || 'http://localhost:3008';
const AUTOMAKER_API_KEY = process.env.NEXT_PUBLIC_AUTOMAKER_API_KEY || '';

interface AutomakerFeature {
  id: string;
  title: string;
  description: string;
  status: string;
  category?: string;
  githubIssue?: number;
}

interface RunningAgent {
  featureId: string;
  projectPath: string;
  projectName: string;
  isAutoMode: boolean;
  model: string;
  provider: string;
  title: string;
  description: string;
}

interface CreateFeatureParams {
  projectPath: string;
  title: string;
  description: string;
  githubIssue?: number;
}

interface RunFeatureParams {
  projectPath: string;
  featureId: string;
}

interface StopFeatureParams {
  featureId: string;
}

interface ListFeaturesParams {
  projectPath: string;
}

async function automakerFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (AUTOMAKER_API_KEY) {
    headers['X-API-Key'] = AUTOMAKER_API_KEY;
  }

  const res = await fetch(`${AUTOMAKER_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'Automaker API error');
  }

  return data;
}

/**
 * Check if Automaker server is online
 */
export function useAutomakerHealth() {
  return useQuery({
    queryKey: ['automaker', 'health'],
    queryFn: async () => {
      const res = await fetch(`${AUTOMAKER_BASE_URL}/api/health`);
      if (!res.ok) throw new Error('Server offline');
      return res.json();
    },
    refetchInterval: 30000,
    retry: false,
  });
}

/**
 * Get list of currently running agents
 */
export function useAutomakerRunningAgents() {
  return useQuery({
    queryKey: ['automaker', 'running-agents'],
    queryFn: () =>
      automakerFetch<{ success: boolean; runningAgents: RunningAgent[]; totalCount: number }>(
        '/api/running-agents/'
      ),
    refetchInterval: 5000,
  });
}

/**
 * Get auto-mode status for a project
 */
export function useAutomakerStatus(projectPath: string) {
  return useQuery({
    queryKey: ['automaker', 'status', projectPath],
    queryFn: () =>
      automakerFetch<{
        success: boolean;
        isRunning: boolean;
        runningFeatures: string[];
        runningCount: number;
      }>('/api/auto-mode/status', {
        method: 'POST',
        body: JSON.stringify({ projectPath }),
      }),
    enabled: !!projectPath,
    refetchInterval: 5000,
  });
}

/**
 * List features for a project
 */
export function useAutomakerFeatures(projectPath: string) {
  return useQuery({
    queryKey: ['automaker', 'features', projectPath],
    queryFn: () =>
      automakerFetch<{ success: boolean; features: AutomakerFeature[] }>(
        '/api/features/list',
        {
          method: 'POST',
          body: JSON.stringify({ projectPath }),
        }
      ),
    enabled: !!projectPath,
  });
}

/**
 * Create a new feature/task
 */
export function useCreateAutomakerFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectPath, title, description, githubIssue }: CreateFeatureParams) => {
      return automakerFetch<{ success: boolean; feature: AutomakerFeature }>(
        '/api/features/create',
        {
          method: 'POST',
          body: JSON.stringify({
            projectPath,
            feature: {
              title,
              description,
              status: 'in-progress',
              ...(githubIssue && { githubIssue }),
            },
          }),
        }
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['automaker', 'features', variables.projectPath],
      });
    },
  });
}

/**
 * Run a feature autonomously
 */
export function useRunAutomakerFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectPath, featureId }: RunFeatureParams) => {
      return automakerFetch<{ success: boolean }>('/api/auto-mode/run-feature', {
        method: 'POST',
        body: JSON.stringify({ projectPath, featureId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automaker', 'running-agents'] });
      queryClient.invalidateQueries({ queryKey: ['automaker', 'status'] });
    },
  });
}

/**
 * Stop a running feature
 */
export function useStopAutomakerFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ featureId }: StopFeatureParams) => {
      return automakerFetch<{ success: boolean; stopped: boolean }>(
        '/api/auto-mode/stop-feature',
        {
          method: 'POST',
          body: JSON.stringify({ featureId }),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automaker', 'running-agents'] });
      queryClient.invalidateQueries({ queryKey: ['automaker', 'status'] });
    },
  });
}

/**
 * Delete a feature
 */
export function useDeleteAutomakerFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectPath,
      featureId,
    }: {
      projectPath: string;
      featureId: string;
    }) => {
      return automakerFetch<{ success: boolean }>('/api/features/delete', {
        method: 'POST',
        body: JSON.stringify({ projectPath, featureId }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['automaker', 'features', variables.projectPath],
      });
    },
  });
}

/**
 * List GitHub issues for a project
 */
export function useAutomakerGitHubIssues(projectPath: string) {
  return useQuery({
    queryKey: ['automaker', 'github-issues', projectPath],
    queryFn: () =>
      automakerFetch<{ success: boolean; openIssues: any[] }>('/api/github/issues', {
        method: 'POST',
        body: JSON.stringify({ projectPath }),
      }),
    enabled: !!projectPath,
    staleTime: 60000, // Cache for 1 minute
  });
}

/**
 * Get available AI models
 */
export function useAutomakerModels() {
  return useQuery({
    queryKey: ['automaker', 'models'],
    queryFn: () =>
      automakerFetch<{ success: boolean; models: any[] }>('/api/models/available'),
    staleTime: 300000, // Cache for 5 minutes
  });
}

/**
 * Verify a completed feature
 */
export function useVerifyAutomakerFeature() {
  return useMutation({
    mutationFn: async ({
      projectPath,
      featureId,
    }: {
      projectPath: string;
      featureId: string;
    }) => {
      return automakerFetch<{ success: boolean }>('/api/auto-mode/verify-feature', {
        method: 'POST',
        body: JSON.stringify({ projectPath, featureId }),
      });
    },
  });
}

/**
 * Commit feature changes
 */
export function useCommitAutomakerFeature() {
  return useMutation({
    mutationFn: async ({
      projectPath,
      featureId,
    }: {
      projectPath: string;
      featureId: string;
    }) => {
      return automakerFetch<{ success: boolean }>('/api/auto-mode/commit-feature', {
        method: 'POST',
        body: JSON.stringify({ projectPath, featureId }),
      });
    },
  });
}

/**
 * Get agent output for a feature (formatted)
 */
export function useAutomakerAgentOutput(projectPath: string, featureId: string | null) {
  return useQuery({
    queryKey: ['automaker', 'agent-output', projectPath, featureId],
    queryFn: async () => {
      const res = await fetch(`${AUTOMAKER_BASE_URL}/api/features/agent-output`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(AUTOMAKER_API_KEY && { 'X-API-Key': AUTOMAKER_API_KEY }),
        },
        body: JSON.stringify({ projectPath, featureId }),
      });
      const data = await res.json();
      // API returns 'content' field, normalize to 'output'
      return {
        success: data.success,
        output: data.content || data.output,
        error: data.error,
      } as { success: boolean; output?: string; error?: string };
    },
    enabled: !!projectPath && !!featureId,
    refetchInterval: 3000, // Poll every 3 seconds for real-time updates
  });
}

/**
 * Get raw agent output for a feature (markdown)
 */
export function useAutomakerRawOutput(projectPath: string, featureId: string | null) {
  return useQuery({
    queryKey: ['automaker', 'raw-output', projectPath, featureId],
    queryFn: async () => {
      const res = await fetch(`${AUTOMAKER_BASE_URL}/api/features/raw-output`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(AUTOMAKER_API_KEY && { 'X-API-Key': AUTOMAKER_API_KEY }),
        },
        body: JSON.stringify({ projectPath, featureId }),
      });
      const data = await res.json();
      // API returns 'content' field, normalize to 'output'
      return {
        success: data.success,
        output: data.content || data.output,
        error: data.error,
      } as { success: boolean; output?: string; error?: string };
    },
    enabled: !!projectPath && !!featureId,
    refetchInterval: 3000, // Poll every 3 seconds for real-time updates
  });
}

// ============================================
// 🧠 AI PLANNING FEATURES
// ============================================

/**
 * Generate AI title from task description
 */
export function useGenerateTitle() {
  return useMutation({
    mutationFn: async ({ description }: { description: string }) => {
      return automakerFetch<{ success: boolean; title: string }>(
        '/api/features/generate-title',
        {
          method: 'POST',
          body: JSON.stringify({ description }),
        }
      );
    },
  });
}

/**
 * Analyze project structure with AI
 */
export function useAnalyzeProject() {
  return useMutation({
    mutationFn: async ({ projectPath }: { projectPath: string }) => {
      return automakerFetch<{
        success: boolean;
        analysis: {
          summary: string;
          technologies: string[];
          structure: string;
          suggestions: string[];
        };
      }>('/api/auto-mode/analyze-project', {
        method: 'POST',
        body: JSON.stringify({ projectPath }),
      });
    },
  });
}

/**
 * Get cached project analysis
 */
export function useProjectAnalysis(projectPath: string) {
  return useQuery({
    queryKey: ['automaker', 'analysis', projectPath],
    queryFn: () =>
      automakerFetch<{
        success: boolean;
        analysis: {
          summary: string;
          technologies: string[];
          structure: string;
        } | null;
      }>('/api/ideation/analysis', {
        method: 'POST',
        body: JSON.stringify({ projectPath }),
      }),
    enabled: !!projectPath,
    staleTime: 300000, // Cache for 5 minutes
  });
}

/**
 * Generate backlog plan - AI organizes and prioritizes tasks
 */
export function useGenerateBacklogPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectPath, prompt }: { projectPath: string; prompt?: string }) => {
      return automakerFetch<{
        success: boolean;
        plan: {
          features: Array<{
            title: string;
            description: string;
            priority: number;
            category?: string;
          }>;
          reasoning: string;
        };
      }>('/api/backlog-plan/generate', {
        method: 'POST',
        body: JSON.stringify({ projectPath, prompt }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['automaker', 'features', variables.projectPath],
      });
    },
  });
}

/**
 * Apply backlog plan - creates features from plan
 */
export function useApplyBacklogPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectPath,
      plan
    }: {
      projectPath: string;
      plan: {
        features: Array<{
          title: string;
          description: string;
          priority: number;
          category?: string;
        }>;
      };
    }) => {
      return automakerFetch<{ success: boolean; createdCount: number }>(
        '/api/backlog-plan/apply',
        {
          method: 'POST',
          body: JSON.stringify({ projectPath, plan }),
        }
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['automaker', 'features', variables.projectPath],
      });
    },
  });
}

/**
 * Generate project specification/documentation
 */
export function useGenerateSpec() {
  return useMutation({
    mutationFn: async ({ projectPath }: { projectPath: string }) => {
      return automakerFetch<{
        success: boolean;
        spec: {
          overview: string;
          architecture: string;
          features: string[];
          techStack: string[];
        };
      }>('/api/spec-regeneration/generate', {
        method: 'POST',
        body: JSON.stringify({ projectPath }),
      });
    },
  });
}

/**
 * Stop suggestions generation (clears stuck state)
 */
export function useStopSuggestions() {
  return useMutation({
    mutationFn: async () => {
      return automakerFetch<{ success: boolean }>('/api/suggestions/stop', {
        method: 'POST',
      });
    },
  });
}

/**
 * Get suggestions generation status
 */
export function useSuggestionsStatus() {
  return useQuery({
    queryKey: ['automaker', 'suggestions-status'],
    queryFn: () =>
      automakerFetch<{ success: boolean; isRunning: boolean }>('/api/suggestions/status'),
    refetchInterval: 2000,
  });
}

/**
 * Generate feature suggestions based on project analysis
 * Note: This starts a background process. Results come via WebSocket events.
 * For simple integration, we poll the status and wait for completion.
 */
export function useGenerateSuggestions() {
  return useMutation({
    mutationFn: async ({ projectPath }: { projectPath: string }) => {
      // First stop any stuck process
      try {
        await automakerFetch<{ success: boolean }>('/api/suggestions/stop', {
          method: 'POST',
        });
      } catch {
        // Ignore stop errors
      }

      // Start generation
      const result = await automakerFetch<{
        success: boolean;
        suggestions?: Array<{
          id: string;
          title: string;
          description: string;
          category: string;
          priority: number;
        }>;
      }>('/api/suggestions/generate', {
        method: 'POST',
        body: JSON.stringify({ projectPath }),
      });

      // If API returns suggestions directly, return them
      if (result.suggestions) {
        return result;
      }

      // Otherwise, the generation runs in background via WebSocket
      // Return empty suggestions with a note
      return {
        success: true,
        suggestions: [],
        note: 'Suggestions are being generated in the background. Check Automaker UI for results.',
      };
    },
  });
}

/**
 * Enhance/improve text with AI
 */
export function useEnhancePrompt() {
  return useMutation({
    mutationFn: async ({
      text,
      mode = 'improve'
    }: {
      text: string;
      mode?: 'improve' | 'expand' | 'simplify' | 'technical';
    }) => {
      return automakerFetch<{ success: boolean; enhanced: string }>(
        '/api/enhance-prompt',
        {
          method: 'POST',
          body: JSON.stringify({ text, mode }),
        }
      );
    },
  });
}
