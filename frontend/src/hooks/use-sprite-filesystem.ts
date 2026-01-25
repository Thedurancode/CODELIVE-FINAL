/**
 * Sprite Filesystem Hooks
 *
 * React Query hooks for sprite filesystem operations.
 * Provides file browsing, reading, writing, and management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  FileEntry,
  ListDirectoryResponse,
  ReadFileTextResponse,
} from '@/types/sprite';

// Query keys for filesystem operations
export const filesystemKeys = {
  all: ['sprite-filesystem'] as const,
  directory: (spriteId: string, path: string) =>
    [...filesystemKeys.all, 'directory', spriteId, path] as const,
  file: (spriteId: string, path: string) =>
    [...filesystemKeys.all, 'file', spriteId, path] as const,
};

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List directory contents
 */
export function useSpriteDirectory(
  spriteId: string | null | undefined,
  path: string,
  workingDir?: string
) {
  const params = new URLSearchParams();
  params.set('path', path);
  if (workingDir) params.set('workingDir', workingDir);

  return useQuery({
    queryKey: filesystemKeys.directory(spriteId ?? '', path),
    queryFn: () =>
      api.get<ListDirectoryResponse>(
        `/api/sprites/${spriteId}/fs/list?${params.toString()}`
      ),
    enabled: !!spriteId,
    staleTime: 10000, // 10 seconds - files change often during development
  });
}

/**
 * Read file content as text
 */
export function useSpriteFileContent(
  spriteId: string | null | undefined,
  path: string | null | undefined,
  workingDir?: string
) {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  if (workingDir) params.set('workingDir', workingDir);

  return useQuery({
    queryKey: filesystemKeys.file(spriteId ?? '', path ?? ''),
    queryFn: () =>
      api.get<ReadFileTextResponse>(
        `/api/sprites/${spriteId}/fs/read-text?${params.toString()}`
      ),
    enabled: !!spriteId && !!path,
    staleTime: 5000, // 5 seconds
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================

interface WriteFileOptions {
  spriteId: string;
  path: string;
  content: string;
  workingDir?: string;
  mode?: string;
  mkdir?: boolean;
}

/**
 * Write/create a file
 */
export function useWriteSpriteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId, path, content, workingDir, mode, mkdir }: WriteFileOptions) => {
      return api.put<{ success: boolean; path: string }>(
        `/api/sprites/${spriteId}/fs/write`,
        { path, content, workingDir, mode, mkdir }
      );
    },
    onSuccess: (_, { spriteId, path }) => {
      // Invalidate the file content
      queryClient.invalidateQueries({
        queryKey: filesystemKeys.file(spriteId, path),
      });
      // Invalidate parent directory
      const parentPath = path.split('/').slice(0, -1).join('/') || '/';
      queryClient.invalidateQueries({
        queryKey: filesystemKeys.directory(spriteId, parentPath),
      });
    },
  });
}

interface DeleteFileOptions {
  spriteId: string;
  path: string;
  workingDir?: string;
  recursive?: boolean;
}

/**
 * Delete a file or directory
 */
export function useDeleteSpriteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId, path, workingDir, recursive }: DeleteFileOptions) => {
      const params = new URLSearchParams();
      params.set('path', path);
      if (workingDir) params.set('workingDir', workingDir);
      if (recursive) params.set('recursive', 'true');

      return api.delete<{ success: boolean }>(
        `/api/sprites/${spriteId}/fs/delete?${params.toString()}`
      );
    },
    onSuccess: (_, { spriteId, path }) => {
      // Invalidate file content
      queryClient.invalidateQueries({
        queryKey: filesystemKeys.file(spriteId, path),
      });
      // Invalidate parent directory
      const parentPath = path.split('/').slice(0, -1).join('/') || '/';
      queryClient.invalidateQueries({
        queryKey: filesystemKeys.directory(spriteId, parentPath),
      });
    },
  });
}

interface RenameFileOptions {
  spriteId: string;
  source: string;
  dest: string;
  workingDir?: string;
}

/**
 * Rename/move a file or directory
 */
export function useRenameSpriteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId, source, dest, workingDir }: RenameFileOptions) => {
      return api.post<{ success: boolean }>(
        `/api/sprites/${spriteId}/fs/rename`,
        { source, dest, workingDir }
      );
    },
    onSuccess: (_, { spriteId, source, dest }) => {
      // Invalidate both source and dest paths
      queryClient.invalidateQueries({
        queryKey: filesystemKeys.file(spriteId, source),
      });
      queryClient.invalidateQueries({
        queryKey: filesystemKeys.file(spriteId, dest),
      });
      // Invalidate parent directories
      const sourceParent = source.split('/').slice(0, -1).join('/') || '/';
      const destParent = dest.split('/').slice(0, -1).join('/') || '/';
      queryClient.invalidateQueries({
        queryKey: filesystemKeys.directory(spriteId, sourceParent),
      });
      if (sourceParent !== destParent) {
        queryClient.invalidateQueries({
          queryKey: filesystemKeys.directory(spriteId, destParent),
        });
      }
    },
  });
}

interface CreateDirectoryOptions {
  spriteId: string;
  path: string;
  workingDir?: string;
}

/**
 * Create a new directory
 */
export function useCreateSpriteDirectory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spriteId, path, workingDir }: CreateDirectoryOptions) => {
      // Create directory by writing an empty file with mkdir flag
      // The backend should handle directory creation
      return api.put<{ success: boolean }>(
        `/api/sprites/${spriteId}/fs/write`,
        { path: `${path}/.gitkeep`, content: '', workingDir, mkdir: true }
      );
    },
    onSuccess: (_, { spriteId, path }) => {
      // Invalidate parent directory
      const parentPath = path.split('/').slice(0, -1).join('/') || '/';
      queryClient.invalidateQueries({
        queryKey: filesystemKeys.directory(spriteId, parentPath),
      });
    },
  });
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get file extension from path
 */
export function getFileExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Get language for syntax highlighting based on file extension
 */
export function getLanguageFromExtension(ext: string): string {
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    mjs: 'javascript',
    cjs: 'javascript',

    // Web
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',

    // Data formats
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    toml: 'toml',

    // Markdown/Text
    md: 'markdown',
    mdx: 'markdown',
    txt: 'plaintext',

    // Programming languages
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',

    // Shell/Config
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'bash',
    dockerfile: 'dockerfile',
    env: 'plaintext',

    // SQL
    sql: 'sql',

    // GraphQL
    graphql: 'graphql',
    gql: 'graphql',
  };

  return languageMap[ext] || 'plaintext';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Check if file is likely binary based on extension
 */
export function isBinaryFile(path: string): boolean {
  const binaryExtensions = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'zip', 'tar', 'gz', 'rar', '7z',
    'mp3', 'mp4', 'wav', 'avi', 'mov', 'webm',
    'ttf', 'otf', 'woff', 'woff2', 'eot',
    'exe', 'dll', 'so', 'dylib',
    'pyc', 'class', 'o', 'obj',
  ]);

  const ext = getFileExtension(path);
  return binaryExtensions.has(ext);
}

/**
 * Get icon name for file type
 */
export function getFileIcon(entry: FileEntry): string {
  if (entry.isDir) {
    // Special folder names
    const name = entry.name.toLowerCase();
    if (name === 'node_modules') return 'folder-modules';
    if (name === '.git') return 'folder-git';
    if (name === 'src') return 'folder-src';
    if (name === 'public') return 'folder-public';
    if (name === 'components') return 'folder-components';
    if (name === 'pages' || name === 'app') return 'folder-app';
    if (name === 'api') return 'folder-api';
    if (name === 'lib' || name === 'utils') return 'folder-lib';
    if (name === 'hooks') return 'folder-hooks';
    if (name === 'styles') return 'folder-styles';
    if (name === 'tests' || name === '__tests__') return 'folder-test';
    if (name === 'dist' || name === 'build' || name === 'out') return 'folder-dist';
    return 'folder';
  }

  const ext = getFileExtension(entry.name);

  // Map extensions to icon names
  const iconMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'react',
    js: 'javascript',
    jsx: 'react',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'sass',
    html: 'html',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    rb: 'ruby',
    php: 'php',
    sql: 'database',
    sh: 'terminal',
    yml: 'yaml',
    yaml: 'yaml',
    env: 'settings',
    gitignore: 'git',
    dockerfile: 'docker',
    svg: 'image',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    ico: 'image',
  };

  return iconMap[ext] || 'file';
}

/**
 * Sort file entries (directories first, then alphabetically)
 */
export function sortFileEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    // Directories first
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;

    // Hidden files (starting with .) last within their category
    const aHidden = a.name.startsWith('.');
    const bHidden = b.name.startsWith('.');
    if (aHidden && !bHidden) return 1;
    if (!aHidden && bHidden) return -1;

    // Alphabetical
    return a.name.localeCompare(b.name);
  });
}
