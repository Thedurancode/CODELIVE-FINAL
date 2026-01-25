/**
 * TaskDiffViewer
 *
 * Displays file changes (diffs) for a task in real-time.
 * Shows added/removed/modified files with line-by-line changes.
 */

'use client';

import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// Types for diff data
export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  oldPath?: string; // For renamed files
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'add' | 'delete';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface TaskDiffViewerProps {
  files: FileDiff[];
  branchName?: string;
  repoUrl?: string;
  className?: string;
}

// Parse a unified diff string into structured data
export function parseUnifiedDiff(diffText: string): FileDiff[] {
  const files: FileDiff[] = [];
  const fileRegex = /^diff --git a\/(.+) b\/(.+)$/gm;
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

  const fileDiffs = diffText.split(/(?=^diff --git)/m).filter(Boolean);

  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split('\n');
    const headerMatch = lines[0]?.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (!headerMatch) continue;

    const [, oldPath, newPath] = headerMatch;

    // Determine status
    let status: FileDiff['status'] = 'modified';
    if (lines.some((l) => l.startsWith('new file mode'))) {
      status = 'added';
    } else if (lines.some((l) => l.startsWith('deleted file mode'))) {
      status = 'deleted';
    } else if (oldPath !== newPath) {
      status = 'renamed';
    }

    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let additions = 0;
    let deletions = 0;
    let oldLineNum = 0;
    let newLineNum = 0;

    for (const line of lines) {
      const hunkMatch = line.match(hunkRegex);
      if (hunkMatch) {
        if (currentHunk) hunks.push(currentHunk);
        oldLineNum = parseInt(hunkMatch[1], 10);
        newLineNum = parseInt(hunkMatch[3], 10);
        currentHunk = {
          oldStart: oldLineNum,
          oldLines: parseInt(hunkMatch[2] || '1', 10),
          newStart: newLineNum,
          newLines: parseInt(hunkMatch[4] || '1', 10),
          lines: [],
        };
      } else if (currentHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.lines.push({
            type: 'add',
            content: line.slice(1),
            newLineNumber: newLineNum++,
          });
          additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push({
            type: 'delete',
            content: line.slice(1),
            oldLineNumber: oldLineNum++,
          });
          deletions++;
        } else if (line.startsWith(' ')) {
          currentHunk.lines.push({
            type: 'context',
            content: line.slice(1),
            oldLineNumber: oldLineNum++,
            newLineNumber: newLineNum++,
          });
        }
      }
    }

    if (currentHunk) hunks.push(currentHunk);

    files.push({
      path: newPath,
      oldPath: status === 'renamed' ? oldPath : undefined,
      status,
      additions,
      deletions,
      hunks,
    });
  }

  return files;
}

// Get file icon based on status
function getStatusIcon(status: FileDiff['status']) {
  switch (status) {
    case 'added':
      return <FilePlus className="h-4 w-4 text-green-500" />;
    case 'deleted':
      return <FileMinus className="h-4 w-4 text-red-500" />;
    case 'modified':
      return <FileEdit className="h-4 w-4 text-yellow-500" />;
    case 'renamed':
      return <FileCode className="h-4 w-4 text-blue-500" />;
  }
}

// Get status badge
function getStatusBadge(status: FileDiff['status']) {
  const colors = {
    added: 'bg-green-500/20 text-green-400 border-green-500/30',
    deleted: 'bg-red-500/20 text-red-400 border-red-500/30',
    modified: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    renamed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  return (
    <Badge variant="outline" className={cn('text-xs', colors[status])}>
      {status}
    </Badge>
  );
}

// Single file diff component
function FileDiffCard({ file, repoUrl }: { file: FileDiff; repoUrl?: string }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const fileName = file.path.split('/').pop() || file.path;

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(file.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            {getStatusIcon(file.status)}
            <span className="flex-1 font-mono text-sm truncate" title={file.path}>
              {file.path}
            </span>
            <div className="flex items-center gap-2">
              {file.additions > 0 && (
                <span className="text-xs text-green-500">+{file.additions}</span>
              )}
              {file.deletions > 0 && (
                <span className="text-xs text-red-500">-{file.deletions}</span>
              )}
              {getStatusBadge(file.status)}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyPath();
                }}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
              {repoUrl && (
                <a
                  href={`${repoUrl}/blob/HEAD/${file.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <ScrollArea className="max-h-[400px]">
            <div className="font-mono text-xs">
              {file.hunks.map((hunk, hunkIdx) => (
                <div key={hunkIdx}>
                  {/* Hunk header */}
                  <div className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs">
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                  </div>
                  {/* Lines */}
                  {hunk.lines.map((line, lineIdx) => (
                    <div
                      key={lineIdx}
                      className={cn(
                        'flex',
                        line.type === 'add' && 'bg-green-500/10',
                        line.type === 'delete' && 'bg-red-500/10'
                      )}
                    >
                      {/* Line numbers */}
                      <span className="w-10 text-right px-1 text-muted-foreground select-none border-r border-border">
                        {line.oldLineNumber || ' '}
                      </span>
                      <span className="w-10 text-right px-1 text-muted-foreground select-none border-r border-border">
                        {line.newLineNumber || ' '}
                      </span>
                      {/* Sign */}
                      <span
                        className={cn(
                          'w-4 text-center select-none',
                          line.type === 'add' && 'text-green-500',
                          line.type === 'delete' && 'text-red-500'
                        )}
                      >
                        {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
                      </span>
                      {/* Content */}
                      <pre className="flex-1 px-2 overflow-x-auto whitespace-pre">
                        {line.content}
                      </pre>
                    </div>
                  ))}
                </div>
              ))}
              {file.hunks.length === 0 && (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  {file.status === 'added' && 'New file (no diff preview)'}
                  {file.status === 'deleted' && 'File deleted'}
                  {file.status === 'renamed' && `Renamed from ${file.oldPath}`}
                  {file.status === 'modified' && 'No changes to display'}
                </div>
              )}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Main component
export function TaskDiffViewer({
  files,
  branchName,
  repoUrl,
  className,
}: TaskDiffViewerProps) {
  // Calculate totals
  const stats = useMemo(() => {
    return files.reduce(
      (acc, file) => ({
        additions: acc.additions + file.additions,
        deletions: acc.deletions + file.deletions,
        filesChanged: acc.filesChanged + 1,
      }),
      { additions: 0, deletions: 0, filesChanged: 0 }
    );
  }, [files]);

  if (files.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No file changes yet</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Stats header */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {stats.filesChanged} file{stats.filesChanged !== 1 ? 's' : ''} changed
          </span>
          {stats.additions > 0 && (
            <span className="text-green-500">+{stats.additions}</span>
          )}
          {stats.deletions > 0 && (
            <span className="text-red-500">-{stats.deletions}</span>
          )}
        </div>
        {branchName && (
          <Badge variant="outline" className="font-mono text-xs">
            {branchName}
          </Badge>
        )}
      </div>

      {/* File list */}
      <div className="space-y-2">
        {files.map((file, idx) => (
          <FileDiffCard key={`${file.path}-${idx}`} file={file} repoUrl={repoUrl} />
        ))}
      </div>
    </div>
  );
}
