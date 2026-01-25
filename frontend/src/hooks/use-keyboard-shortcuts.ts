/**
 * useKeyboardShortcuts Hook
 *
 * Global keyboard shortcuts for task queue and sprite management.
 */

import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean; // Cmd on Mac
  description: string;
  action: () => void;
}

/**
 * Check if an element is an input element (should not trigger shortcuts)
 */
function isInputElement(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if (element.isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Hook to register keyboard shortcuts
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (isInputElement(event.target)) {
        return;
      }

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;
        const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Format a shortcut for display
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  // Use ⌘ on Mac, Ctrl on others
  const isMac =
    typeof navigator !== 'undefined' &&
    navigator.platform.toLowerCase().includes('mac');

  if (shortcut.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
  if (shortcut.meta) parts.push(isMac ? '⌘' : 'Win');
  if (shortcut.alt) parts.push(isMac ? '⌥' : 'Alt');
  if (shortcut.shift) parts.push('⇧');

  // Format the key
  let key = shortcut.key.toUpperCase();
  if (key === 'ESCAPE') key = 'Esc';
  if (key === 'ENTER') key = '↵';
  if (key === 'ARROWUP') key = '↑';
  if (key === 'ARROWDOWN') key = '↓';
  if (key === 'ARROWLEFT') key = '←';
  if (key === 'ARROWRIGHT') key = '→';

  parts.push(key);

  return parts.join(isMac ? '' : '+');
}

/**
 * Pre-defined shortcuts for task queue
 */
export const TASK_QUEUE_SHORTCUTS = {
  NEW_TASK: { key: 'n', description: 'Create new task' },
  REFRESH: { key: 'r', description: 'Refresh task list' },
  SEARCH: { key: '/', description: 'Focus search' },
  TOGGLE_ACTIVITY: { key: 'a', description: 'Toggle activity view' },
  HELP: { key: '?', shift: true, description: 'Show shortcuts help' },
  ESCAPE: { key: 'Escape', description: 'Close dialog/cancel' },
  NEXT_TASK: { key: 'j', description: 'Select next task' },
  PREV_TASK: { key: 'k', description: 'Select previous task' },
  EXPAND_TASK: { key: 'Enter', description: 'Expand/collapse selected task' },
  PROCESS_TASK: { key: 'p', description: 'Process selected task' },
  CANCEL_TASK: { key: 'x', description: 'Cancel selected task' },
} as const;
