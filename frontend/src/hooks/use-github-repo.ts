import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
export interface GitHubContentItem {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  downloadUrl: string | null;
}

export interface GitHubCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
    login?: string;
    avatarUrl?: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
    login?: string;
    avatarUrl?: string;
  };
  url: string;
}

export interface GitHubBranch {
  name: string;
  commitSha: string;
  protected: boolean;
}

export interface GitHubTreeItem {
  path: string;
  type: 'file' | 'dir';
  sha: string;
  size?: number;
}

export interface GitHubFileContent {
  content: string;
  encoding: string;
  sha: string;
  size: number;
  path: string;
}

export interface GitHubReadme {
  content: string;
  path: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  draft: boolean;
  url: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  requestedReviewers: Array<{
    login: string;
    avatar_url: string;
  }>;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}

// Parse GitHub URL to extract owner/repo
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return { owner: match[1], repo: match[2].replace('.git', '') };
    }
  } catch {}
  return null;
}

// Hook to list directory contents
export function useGitHubContents(
  owner: string | undefined,
  repo: string | undefined,
  path: string = '',
  ref?: string
) {
  return useQuery({
    queryKey: ['github', 'contents', owner, repo, path, ref],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (path) params.set('path', path);
      if (ref) params.set('ref', ref);
      const queryString = params.toString();
      const url = `/api/github/repos/${owner}/${repo}/contents${queryString ? `?${queryString}` : ''}`;
      return api.get<GitHubContentItem[]>(url);
    },
    enabled: !!owner && !!repo,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Hook to get file content
export function useGitHubFileContent(
  owner: string | undefined,
  repo: string | undefined,
  path: string | undefined,
  ref?: string
) {
  return useQuery({
    queryKey: ['github', 'file', owner, repo, path, ref],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (path) params.set('path', path);
      if (ref) params.set('ref', ref);
      return api.get<GitHubFileContent>(`/api/github/repos/${owner}/${repo}/file?${params}`);
    },
    enabled: !!owner && !!repo && !!path,
    staleTime: 1000 * 60 * 5,
  });
}

// Hook to get README
export function useGitHubReadme(
  owner: string | undefined,
  repo: string | undefined,
  ref?: string
) {
  return useQuery({
    queryKey: ['github', 'readme', owner, repo, ref],
    queryFn: async () => {
      const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      return api.get<GitHubReadme | null>(`/api/github/repos/${owner}/${repo}/readme${params}`);
    },
    enabled: !!owner && !!repo,
    staleTime: 1000 * 60 * 5,
  });
}

// Hook to list commits
export function useGitHubCommits(
  owner: string | undefined,
  repo: string | undefined,
  options?: {
    sha?: string;
    path?: string;
    perPage?: number;
    page?: number;
    enabled?: boolean;
  }
) {
  // Exclude 'enabled' from query key to prevent unnecessary re-queries
  const { enabled, ...queryOptions } = options || {};
  return useQuery({
    queryKey: ['github', 'commits', owner, repo, queryOptions],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.sha) params.set('sha', options.sha);
      if (options?.path) params.set('path', options.path);
      if (options?.perPage) params.set('perPage', String(options.perPage));
      if (options?.page) params.set('page', String(options.page));
      const queryString = params.toString();
      return api.get<GitHubCommit[]>(
        `/api/github/repos/${owner}/${repo}/commits${queryString ? `?${queryString}` : ''}`
      );
    },
    enabled: !!owner && !!repo && (enabled !== false),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

// Hook to list branches
export function useGitHubBranches(owner: string | undefined, repo: string | undefined) {
  return useQuery({
    queryKey: ['github', 'branches', owner, repo],
    queryFn: () => api.get<GitHubBranch[]>(`/api/github/repos/${owner}/${repo}/branches`),
    enabled: !!owner && !!repo,
    staleTime: 1000 * 60 * 5,
  });
}

// Hook to get full tree
export function useGitHubTree(
  owner: string | undefined,
  repo: string | undefined,
  sha?: string
) {
  return useQuery({
    queryKey: ['github', 'tree', owner, repo, sha],
    queryFn: async () => {
      const params = sha ? `?sha=${encodeURIComponent(sha)}` : '';
      return api.get<GitHubTreeItem[]>(`/api/github/repos/${owner}/${repo}/tree${params}`);
    },
    enabled: !!owner && !!repo,
    staleTime: 1000 * 60 * 5,
  });
}

// Hook to list pull requests
export function useGitHubPullRequests(
  owner: string | undefined,
  repo: string | undefined,
  options?: {
    state?: 'open' | 'closed' | 'all';
    sort?: 'created' | 'updated' | 'popularity' | 'long-running';
    direction?: 'asc' | 'desc';
    perPage?: number;
    page?: number;
    enabled?: boolean;
  }
) {
  // Exclude 'enabled' from query key to prevent unnecessary re-queries
  const { enabled, ...queryOptions } = options || {};
  return useQuery({
    queryKey: ['github', 'pulls', owner, repo, queryOptions],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.state) params.set('state', options.state);
      if (options?.sort) params.set('sort', options.sort);
      if (options?.direction) params.set('direction', options.direction);
      if (options?.perPage) params.set('perPage', String(options.perPage));
      if (options?.page) params.set('page', String(options.page));
      const queryString = params.toString();
      return api.get<GitHubPullRequest[]>(
        `/api/github/repos/${owner}/${repo}/pulls${queryString ? `?${queryString}` : ''}`
      );
    },
    enabled: !!owner && !!repo && (enabled !== false),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

// GitHub Issue types
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  url: string;
  createdAt: string;
  closedAt?: string | null;
  user: {
    login: string;
    avatar_url: string;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
}

export interface CreateIssueInput {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

// Hook to create a GitHub issue
export function useCreateGitHubIssue(owner: string | undefined, repo: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateIssueInput) =>
      api.post<GitHubIssue>(`/api/github/repos/${owner}/${repo}/issues`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github', 'issues', owner, repo] });
    },
  });
}

// Hook to list GitHub issues
export function useGitHubIssues(
  owner: string | undefined,
  repo: string | undefined,
  options?: {
    state?: 'open' | 'closed' | 'all';
    perPage?: number;
    enabled?: boolean;
  }
) {
  // Exclude 'enabled' from query key to prevent unnecessary re-queries
  const { enabled, ...queryOptions } = options || {};
  return useQuery({
    queryKey: ['github', 'issues', owner, repo, queryOptions],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.state) params.set('state', options.state);
      if (options?.perPage) params.set('perPage', String(options.perPage));
      const queryString = params.toString();
      return api.get<GitHubIssue[]>(
        `/api/github/issues?owner=${owner}&repo=${repo}${queryString ? `&${queryString}` : ''}`
      );
    },
    enabled: !!owner && !!repo && (enabled !== false),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
