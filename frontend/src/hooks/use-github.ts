import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  url: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  user: {
    login: string;
    avatar_url: string;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  repoName?: string;
  projectTitle?: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  private: boolean;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  updatedAt: string;
  pushedAt?: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

interface GitHubStatus {
  configured: boolean;
  message?: string;
  user?: {
    login: string;
    name: string;
    avatar_url: string;
  };
  org: string | null;
}

interface CreateRepoInput {
  name: string;
  description?: string;
  private?: boolean;
}

/**
 * Check GitHub integration status
 */
export function useGitHubStatus() {
  return useQuery({
    queryKey: ['github-status'],
    queryFn: () => api.get<GitHubStatus>('/api/github/status'),
    staleTime: 60000,
  });
}

/**
 * List user/org repositories
 */
export function useGitHubRepos(page: number = 1, perPage: number = 30) {
  return useQuery({
    queryKey: ['github-repos', page, perPage],
    queryFn: () => api.get<GitHubRepo[]>(`/api/github/repos?page=${page}&perPage=${perPage}`),
    staleTime: 30000,
  });
}

/**
 * Search repositories
 */
export function useSearchGitHubRepos(query: string) {
  return useQuery({
    queryKey: ['github-repos-search', query],
    queryFn: () => api.get<GitHubRepo[]>(`/api/github/repos/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 30000,
  });
}

/**
 * Get repository details
 */
export function useGitHubRepo(owner: string, repo: string) {
  return useQuery({
    queryKey: ['github-repo', owner, repo],
    queryFn: () => api.get<GitHubRepo>(`/api/github/repos/${owner}/${repo}`),
    enabled: !!owner && !!repo,
    staleTime: 30000,
  });
}

/**
 * Create a new repository
 */
export function useCreateGitHubRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRepoInput) => api.post<GitHubRepo>('/api/github/repos', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-repos'] });
    },
  });
}

/**
 * Get issues from a single repository
 */
export function useGitHubIssues(
  owner: string,
  repo: string,
  options: { state?: 'open' | 'closed' | 'all'; perPage?: number } = {}
) {
  const { state = 'open', perPage = 10 } = options;
  return useQuery({
    queryKey: ['github-issues', owner, repo, state, perPage],
    queryFn: () =>
      api.get<GitHubIssue[]>(
        `/api/github/issues?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&state=${state}&perPage=${perPage}`
      ),
    enabled: !!owner && !!repo,
    staleTime: 60000,
  });
}

/**
 * Get issues from multiple repositories (bulk)
 */
export function useGitHubIssuesBulk(
  repos: Array<{ owner: string; repo: string; projectTitle?: string }>,
  options: { state?: 'open' | 'closed' | 'all'; perPage?: number } = {}
) {
  const { state = 'open', perPage = 5 } = options;
  return useQuery({
    queryKey: ['github-issues-bulk', repos, state, perPage],
    queryFn: () =>
      api.post<GitHubIssue[]>('/api/github/issues/bulk', { repos, state, perPage }),
    enabled: repos.length > 0,
    staleTime: 60000,
  });
}
