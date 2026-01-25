/**
 * useTaskDiff Hook
 *
 * Fetches and displays file changes for a task.
 * Polls for updates when task is in progress.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usePollSpriteTask } from './use-sprite-tasks';
import type { FileDiff } from '@/components/sprites/TaskDiffViewer';

interface TaskDiffResponse {
  files: FileDiff[];
  branchName: string;
  baseBranch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
}

/**
 * Fetch diff for a task's branch
 */
export function useTaskDiff(
  taskId: string | null | undefined,
  options?: { enabled?: boolean }
) {
  const { data: task } = usePollSpriteTask(taskId, options?.enabled ?? true);

  const hasBranch = !!task?.branchName;
  const isActive = task?.status === 'in_progress' || task?.status === 'assigned';

  return useQuery({
    queryKey: ['task-diff', taskId, task?.branchName],
    queryFn: async () => {
      if (!task?.branchName || !task?.projectId) {
        return null;
      }

      try {
        const response = await api.get<TaskDiffResponse>(
          `/api/sprite-tasks/${taskId}/diff`
        );
        return response;
      } catch (error) {
        // If endpoint doesn't exist or fails, return empty diff
        console.warn('[useTaskDiff] Failed to fetch diff:', error);
        return null;
      }
    },
    enabled: !!taskId && hasBranch && (options?.enabled ?? true),
    refetchInterval: isActive ? 10000 : false, // Poll every 10s while active
    staleTime: 5000,
  });
}

/**
 * Parse git diff output into structured format
 * (Client-side parsing for when we get raw diff text)
 */
export function parseGitDiff(diffText: string): FileDiff[] {
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

    let additions = 0;
    let deletions = 0;
    const hunks: FileDiff['hunks'] = [];
    let currentHunk: FileDiff['hunks'][0] | null = null;
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

/**
 * Fetch raw git diff from a sprite's working directory
 */
export function useSpriteDiff(
  spriteId: string | null | undefined,
  branchName: string | null | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['sprite-diff', spriteId, branchName],
    queryFn: async () => {
      if (!spriteId || !branchName) return null;

      try {
        const response = await api.get<{ diff: string }>(
          `/api/sprites/${spriteId}/diff?branch=${encodeURIComponent(branchName)}`
        );
        return parseGitDiff(response.diff);
      } catch (error) {
        console.warn('[useSpriteDiff] Failed to fetch diff:', error);
        return null;
      }
    },
    enabled: !!spriteId && !!branchName && (options?.enabled ?? true),
    staleTime: 5000,
  });
}
