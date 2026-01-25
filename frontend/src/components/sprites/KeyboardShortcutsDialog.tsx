/**
 * KeyboardShortcutsDialog
 *
 * Shows available keyboard shortcuts for the task queue.
 */

'use client';

import { Keyboard } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category?: string;
}

// Detect Mac
const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toLowerCase().includes('mac');

const SHORTCUTS: ShortcutItem[] = [
  // Navigation
  { keys: ['J'], description: 'Select next task', category: 'Navigation' },
  { keys: ['K'], description: 'Select previous task', category: 'Navigation' },
  { keys: ['Enter'], description: 'Expand/collapse selected task', category: 'Navigation' },
  { keys: ['/'], description: 'Focus search', category: 'Navigation' },

  // Actions
  { keys: ['N'], description: 'Create new task', category: 'Actions' },
  { keys: ['B'], description: 'Batch create tasks', category: 'Actions' },
  { keys: ['R'], description: 'Refresh task list', category: 'Actions' },
  { keys: ['P'], description: 'Process selected task', category: 'Actions' },
  { keys: ['X'], description: 'Cancel selected task', category: 'Actions' },

  // Views
  { keys: ['A'], description: 'Toggle activity view', category: 'Views' },
  { keys: ['1'], description: 'Show all tasks', category: 'Views' },
  { keys: ['2'], description: 'Show active tasks', category: 'Views' },
  { keys: ['3'], description: 'Show completed tasks', category: 'Views' },
  { keys: ['4'], description: 'Show failed tasks', category: 'Views' },

  // General
  { keys: ['?'], description: 'Show this help', category: 'General' },
  { keys: ['Esc'], description: 'Close dialog', category: 'General' },
];

// Group shortcuts by category
function groupShortcuts(shortcuts: ShortcutItem[]): Record<string, ShortcutItem[]> {
  return shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.category || 'General';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(shortcut);
    return acc;
  }, {} as Record<string, ShortcutItem[]>);
}

// Keyboard key component
function KeyboardKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center',
        'min-w-[24px] h-6 px-1.5',
        'bg-muted border border-border rounded',
        'text-xs font-mono font-medium',
        'shadow-sm'
      )}
    >
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  const grouped = groupShortcuts(SHORTCUTS);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate and manage tasks quickly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2">
          {Object.entries(grouped).map(([category, shortcuts]) => (
            <div key={category}>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                {category}
              </h4>
              <div className="space-y-2">
                {shortcuts.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <KeyboardKey key={keyIdx}>{key}</KeyboardKey>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground text-center">
            Press <KeyboardKey>?</KeyboardKey> anytime to show this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
