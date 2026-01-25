/**
 * SpriteFileTree
 *
 * Collapsible file tree for browsing sprite filesystem.
 * Supports lazy loading of directories.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  FileImage,
  Settings,
  Terminal,
  Database,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useSpriteDirectory, sortFileEntries, getFileExtension, isBinaryFile } from '@/hooks/use-sprite-filesystem';
import type { FileEntry } from '@/types/sprite';

interface SpriteFileTreeProps {
  spriteId: string;
  workingDir: string;
  selectedPath: string | null;
  onSelectFile: (path: string, entry: FileEntry) => void;
  onCreateFile?: (parentPath: string) => void;
  onCreateFolder?: (parentPath: string) => void;
  onRename?: (path: string, entry: FileEntry) => void;
  onDelete?: (path: string, entry: FileEntry) => void;
  className?: string;
}

export function SpriteFileTree({
  spriteId,
  workingDir,
  selectedPath,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  className,
}: SpriteFileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set([workingDir]));

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="p-2">
        <TreeNode
          spriteId={spriteId}
          workingDir={workingDir}
          path={workingDir}
          name={workingDir.split('/').pop() || '/'}
          isDir={true}
          depth={0}
          expandedPaths={expandedPaths}
          selectedPath={selectedPath}
          onToggle={toggleExpanded}
          onSelect={onSelectFile}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onRename={onRename}
          onDelete={onDelete}
        />
      </div>
    </ScrollArea>
  );
}

interface TreeNodeProps {
  spriteId: string;
  workingDir: string;
  path: string;
  name: string;
  isDir: boolean;
  depth: number;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string, entry: FileEntry) => void;
  onCreateFile?: (parentPath: string) => void;
  onCreateFolder?: (parentPath: string) => void;
  onRename?: (path: string, entry: FileEntry) => void;
  onDelete?: (path: string, entry: FileEntry) => void;
  entry?: FileEntry;
}

function TreeNode({
  spriteId,
  workingDir,
  path,
  name,
  isDir,
  depth,
  expandedPaths,
  selectedPath,
  onToggle,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  entry,
}: TreeNodeProps) {
  const isExpanded = expandedPaths.has(path);
  const isSelected = selectedPath === path;

  // Only fetch directory contents when expanded
  const { data, isLoading, error, refetch } = useSpriteDirectory(
    isDir && isExpanded ? spriteId : null,
    path,
    workingDir
  );

  const sortedEntries = useMemo(() => {
    if (!data?.entries) return [];
    return sortFileEntries(data.entries);
  }, [data?.entries]);

  const handleClick = useCallback(() => {
    if (isDir) {
      onToggle(path);
    }
    if (entry) {
      onSelect(path, entry);
    }
  }, [isDir, path, entry, onToggle, onSelect]);

  const handleDoubleClick = useCallback(() => {
    if (!isDir && entry) {
      onSelect(path, entry);
    }
  }, [isDir, path, entry, onSelect]);

  // Create a mock entry for the root node
  const nodeEntry: FileEntry = entry || {
    name,
    path,
    isDir,
    size: 0,
    mode: '0755',
    modTime: new Date().toISOString(),
    uid: 0,
    gid: 0,
  };

  const isBinary = !isDir && isBinaryFile(path);

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              'flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer text-sm',
              'hover:bg-accent/50 transition-colors',
              isSelected && 'bg-accent text-accent-foreground'
            )}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          >
            {/* Expand/collapse chevron for directories */}
            {isDir ? (
              <span className="w-4 h-4 flex items-center justify-center">
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </span>
            ) : (
              <span className="w-4" />
            )}

            {/* Icon */}
            <FileIcon name={name} isDir={isDir} isOpen={isExpanded} />

            {/* Name */}
            <span className={cn('truncate flex-1', isBinary && 'text-muted-foreground')}>
              {name}
            </span>

            {/* Error indicator */}
            {error && (
              <AlertCircle className="h-3 w-3 text-destructive" />
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {isDir && (
            <>
              <ContextMenuItem onClick={() => onCreateFile?.(path)}>
                <File className="mr-2 h-4 w-4" />
                New File
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onCreateFolder?.(path)}>
                <Folder className="mr-2 h-4 w-4" />
                New Folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onClick={() => onRename?.(path, nodeEntry)}>
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onDelete?.(path, nodeEntry)}
            className="text-destructive"
          >
            Delete
          </ContextMenuItem>
          {isDir && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Children */}
      {isDir && isExpanded && (
        <div>
          {isLoading && sortedEntries.length === 0 && (
            <div
              className="flex items-center gap-2 py-1 px-2 text-sm text-muted-foreground"
              style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          )}
          {error && (
            <div
              className="flex items-center gap-2 py-1 px-2 text-sm text-destructive"
              style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}
            >
              <AlertCircle className="h-3 w-3" />
              Failed to load
            </div>
          )}
          {sortedEntries.map((childEntry) => (
            <TreeNode
              key={childEntry.path}
              spriteId={spriteId}
              workingDir={workingDir}
              path={childEntry.path}
              name={childEntry.name}
              isDir={childEntry.isDir}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelect={onSelect}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRename={onRename}
              onDelete={onDelete}
              entry={childEntry}
            />
          ))}
          {!isLoading && !error && sortedEntries.length === 0 && (
            <div
              className="py-1 px-2 text-sm text-muted-foreground italic"
              style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}
            >
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// File icon component
function FileIcon({ name, isDir, isOpen }: { name: string; isDir: boolean; isOpen?: boolean }) {
  const ext = getFileExtension(name);
  const lowerName = name.toLowerCase();

  // Directory icons
  if (isDir) {
    const Icon = isOpen ? FolderOpen : Folder;
    let colorClass = 'text-yellow-500';

    // Special folder colors
    if (lowerName === 'node_modules') colorClass = 'text-gray-400';
    else if (lowerName === '.git') colorClass = 'text-orange-500';
    else if (lowerName === 'src') colorClass = 'text-blue-500';
    else if (lowerName === 'public') colorClass = 'text-green-500';
    else if (lowerName === 'components') colorClass = 'text-purple-500';
    else if (lowerName === 'pages' || lowerName === 'app') colorClass = 'text-pink-500';

    return <Icon className={cn('h-4 w-4 shrink-0', colorClass)} />;
  }

  // File type icons
  const iconMap: Record<string, { icon: typeof File; color: string }> = {
    ts: { icon: FileCode, color: 'text-blue-500' },
    tsx: { icon: FileCode, color: 'text-blue-400' },
    js: { icon: FileCode, color: 'text-yellow-500' },
    jsx: { icon: FileCode, color: 'text-yellow-400' },
    json: { icon: FileJson, color: 'text-yellow-600' },
    md: { icon: FileText, color: 'text-blue-300' },
    mdx: { icon: FileText, color: 'text-blue-300' },
    txt: { icon: FileText, color: 'text-gray-400' },
    css: { icon: FileCode, color: 'text-blue-400' },
    scss: { icon: FileCode, color: 'text-pink-400' },
    html: { icon: FileCode, color: 'text-orange-500' },
    py: { icon: FileCode, color: 'text-yellow-500' },
    go: { icon: FileCode, color: 'text-cyan-500' },
    rs: { icon: FileCode, color: 'text-orange-600' },
    java: { icon: FileCode, color: 'text-red-500' },
    rb: { icon: FileCode, color: 'text-red-400' },
    php: { icon: FileCode, color: 'text-purple-500' },
    sql: { icon: Database, color: 'text-blue-500' },
    sh: { icon: Terminal, color: 'text-green-500' },
    bash: { icon: Terminal, color: 'text-green-500' },
    yml: { icon: Settings, color: 'text-red-400' },
    yaml: { icon: Settings, color: 'text-red-400' },
    env: { icon: Settings, color: 'text-yellow-600' },
    png: { icon: FileImage, color: 'text-purple-400' },
    jpg: { icon: FileImage, color: 'text-purple-400' },
    jpeg: { icon: FileImage, color: 'text-purple-400' },
    gif: { icon: FileImage, color: 'text-purple-400' },
    svg: { icon: FileImage, color: 'text-orange-400' },
    ico: { icon: FileImage, color: 'text-purple-400' },
  };

  // Special file names
  if (lowerName === 'package.json') {
    return <FileJson className="h-4 w-4 shrink-0 text-green-500" />;
  }
  if (lowerName === 'tsconfig.json') {
    return <FileJson className="h-4 w-4 shrink-0 text-blue-500" />;
  }
  if (lowerName === '.gitignore') {
    return <Settings className="h-4 w-4 shrink-0 text-orange-500" />;
  }
  if (lowerName === 'dockerfile' || lowerName.startsWith('dockerfile.')) {
    return <FileCode className="h-4 w-4 shrink-0 text-blue-500" />;
  }

  const iconInfo = iconMap[ext];
  if (iconInfo) {
    const Icon = iconInfo.icon;
    return <Icon className={cn('h-4 w-4 shrink-0', iconInfo.color)} />;
  }

  return <File className="h-4 w-4 shrink-0 text-gray-400" />;
}
