'use client';

import { useState, useEffect } from 'react';
import { useGitHubStatus, useGitHubRepos, useSearchGitHubRepos, useCreateGitHubRepo, GitHubRepo } from '@/hooks/use-github';
import { Github, Search, Plus, Loader2, Lock, Globe, Star, GitFork, AlertCircle, Check, ExternalLink } from 'lucide-react';

interface GitHubRepoPickerProps {
  value: string | null;
  onChange: (url: string | null) => void;
  projectName?: string;
}

export function GitHubRepoPicker({ value, onChange, projectName }: GitHubRepoPickerProps) {
  const [mode, setMode] = useState<'select' | 'search' | 'create'>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [newRepoName, setNewRepoName] = useState(projectName || '');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);

  const { data: status, isLoading: statusLoading } = useGitHubStatus();
  const { data: repos, isLoading: reposLoading } = useGitHubRepos();
  const { data: searchResults, isLoading: searchLoading } = useSearchGitHubRepos(searchQuery);
  const createRepo = useCreateGitHubRepo();

  // Update new repo name when projectName changes
  useEffect(() => {
    if (projectName && !newRepoName) {
      setNewRepoName(projectName);
    }
  }, [projectName, newRepoName]);

  // Parse current value to get selected repo
  const parseUrl = (url: string) => {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    return match ? { owner: match[1], repo: match[2] } : null;
  };

  const selectedRepo = value ? parseUrl(value) : null;

  // Handle repo selection
  const handleSelect = (repo: GitHubRepo) => {
    onChange(repo.url);
  };

  // Handle create new repo
  const handleCreate = async () => {
    if (!newRepoName.trim()) return;

    try {
      const repo = await createRepo.mutateAsync({
        name: newRepoName.trim(),
        description: newRepoDescription.trim() || undefined,
        private: newRepoPrivate,
      });
      onChange(repo.url);
      setMode('select');
    } catch (error) {
      console.error('Failed to create repo:', error);
    }
  };

  // Handle clear selection
  const handleClear = () => {
    onChange(null);
  };

  // Not configured state
  if (!statusLoading && !status?.configured) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
        <div className="flex items-center gap-3 text-zinc-500">
          <Github className="h-5 w-5" />
          <div>
            <p className="font-medium">GitHub not configured</p>
            <p className="text-sm">Add GITHUB_TOKEN to backend .env to enable</p>
          </div>
        </div>
        {/* Still allow manual URL input */}
        <input
          type="url"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Or paste GitHub URL manually..."
          className="mt-3 w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
        />
      </div>
    );
  }

  // Loading state
  if (statusLoading) {
    return (
      <div className="rounded-lg border border-zinc-300 dark:border-zinc-700 p-4 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Selected repo display
  if (value && selectedRepo) {
    return (
      <div className="rounded-lg border border-zinc-300 dark:border-zinc-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Github className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {selectedRepo.owner}/{selectedRepo.repo}
              </p>
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                Open in GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-300 dark:border-zinc-700 overflow-hidden">
      {/* Mode tabs */}
      <div className="flex border-b border-zinc-300 dark:border-zinc-700">
        <button
          type="button"
          onClick={() => setMode('select')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'select'
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          Recent Repos
        </button>
        <button
          type="button"
          onClick={() => setMode('search')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'search'
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <Search className="h-4 w-4 inline mr-1" />
          Search
        </button>
        <button
          type="button"
          onClick={() => setMode('create')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'create'
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <Plus className="h-4 w-4 inline mr-1" />
          Create New
        </button>
      </div>

      <div className="p-4">
        {/* Recent repos list */}
        {mode === 'select' && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {reposLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            ) : repos && repos.length > 0 ? (
              repos.map((repo) => (
                <RepoItem key={repo.id} repo={repo} onSelect={handleSelect} />
              ))
            ) : (
              <p className="text-center text-zinc-500 py-8">No repositories found</p>
            )}
          </div>
        )}

        {/* Search mode */}
        {mode === 'search' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search repositories..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
              />
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {searchLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                </div>
              ) : searchQuery.length < 2 ? (
                <p className="text-center text-zinc-500 py-8 text-sm">Type at least 2 characters to search</p>
              ) : searchResults && searchResults.length > 0 ? (
                searchResults.map((repo) => (
                  <RepoItem key={repo.id} repo={repo} onSelect={handleSelect} />
                ))
              ) : (
                <p className="text-center text-zinc-500 py-8">No repositories found</p>
              )}
            </div>
          </div>
        )}

        {/* Create new repo */}
        {mode === 'create' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Repository Name
              </label>
              <input
                type="text"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="my-project"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={newRepoDescription}
                onChange={(e) => setNewRepoDescription(e.target.value)}
                placeholder="A brief description..."
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={newRepoPrivate}
                  onChange={() => setNewRepoPrivate(true)}
                  className="text-blue-600"
                />
                <Lock className="h-4 w-4 text-zinc-500" />
                <span className="text-sm">Private</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!newRepoPrivate}
                  onChange={() => setNewRepoPrivate(false)}
                  className="text-blue-600"
                />
                <Globe className="h-4 w-4 text-zinc-500" />
                <span className="text-sm">Public</span>
              </label>
            </div>
            {createRepo.error && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                {(createRepo.error as Error).message}
              </div>
            )}
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newRepoName.trim() || createRepo.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createRepo.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Github className="h-4 w-4" />
              )}
              Create Repository
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Repo item component
function RepoItem({ repo, onSelect }: { repo: GitHubRepo; onSelect: (repo: GitHubRepo) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(repo)}
      className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
    >
      <Github className="h-5 w-5 text-zinc-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {repo.name}
          </span>
          {repo.private ? (
            <Lock className="h-3 w-3 text-zinc-400" />
          ) : (
            <Globe className="h-3 w-3 text-zinc-400" />
          )}
        </div>
        {repo.description && (
          <p className="text-sm text-zinc-500 truncate">{repo.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
          {repo.language && <span>{repo.language}</span>}
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3" />
            {repo.stars}
          </span>
          <span className="flex items-center gap-1">
            <GitFork className="h-3 w-3" />
            {repo.forks}
          </span>
        </div>
      </div>
    </button>
  );
}
