/**
 * TaskSplitSuggestion
 *
 * Analyzes task descriptions and suggests splitting complex tasks
 * into smaller, more manageable subtasks.
 */

'use client';

import { useState, useMemo } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Split,
  Check,
  X,
  Loader2,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SpriteTaskPriority } from '@/types/spriteTask';

// Keywords that suggest a task might be too complex
const COMPLEXITY_KEYWORDS = [
  'and',
  'also',
  'then',
  'after that',
  'additionally',
  'as well as',
  'plus',
  'along with',
  'together with',
  'including',
  'multiple',
  'several',
  'various',
  'all',
  'both',
  'each',
  'every',
  'first',
  'second',
  'third',
  'finally',
  'lastly',
  'next',
  '1.',
  '2.',
  '3.',
  '-',
  '•',
  '*',
];

// Suggested subtask
interface SubtaskSuggestion {
  id: string;
  title: string;
  description: string;
  priority: SpriteTaskPriority;
  selected: boolean;
}

interface TaskSplitSuggestionProps {
  title: string;
  description: string;
  priority: SpriteTaskPriority;
  onApplySplit: (subtasks: SubtaskSuggestion[]) => void;
  className?: string;
}

// Analyze task complexity
function analyzeComplexity(title: string, description: string): {
  isComplex: boolean;
  score: number;
  reasons: string[];
} {
  const fullText = `${title} ${description}`.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  // Check for complexity keywords
  const foundKeywords = COMPLEXITY_KEYWORDS.filter((kw) =>
    fullText.includes(kw.toLowerCase())
  );
  if (foundKeywords.length > 0) {
    score += foundKeywords.length * 2;
    reasons.push(`Contains ${foundKeywords.length} complexity indicators`);
  }

  // Check for numbered/bulleted lists
  const listItems = (description.match(/^[\s]*[-•*]\s+|^\d+[.)]\s+/gm) || []).length;
  if (listItems >= 2) {
    score += listItems * 3;
    reasons.push(`Contains ${listItems} list items`);
  }

  // Check for multiple sentences
  const sentences = description.split(/[.!?]+/).filter((s) => s.trim()).length;
  if (sentences > 3) {
    score += sentences;
    reasons.push(`Contains ${sentences} sentences`);
  }

  // Check description length
  const wordCount = description.split(/\s+/).length;
  if (wordCount > 50) {
    score += Math.floor(wordCount / 20);
    reasons.push(`Long description (${wordCount} words)`);
  }

  // Check for multiple file references
  const fileRefs = (description.match(/\.[a-z]{2,4}\b/gi) || []).length;
  if (fileRefs > 2) {
    score += fileRefs;
    reasons.push(`References ${fileRefs} files`);
  }

  return {
    isComplex: score >= 5,
    score,
    reasons,
  };
}

// Generate subtask suggestions using heuristics
function generateSubtasks(
  title: string,
  description: string,
  priority: SpriteTaskPriority
): SubtaskSuggestion[] {
  const subtasks: SubtaskSuggestion[] = [];
  const lines = description.split('\n').filter((l) => l.trim());

  // Try to extract from numbered/bulleted lists
  const listPattern = /^[\s]*(?:[-•*]|\d+[.)]\s+)(.+)$/;
  const listItems = lines
    .filter((line) => listPattern.test(line))
    .map((line) => {
      const match = line.match(listPattern);
      return match ? match[1].trim() : '';
    })
    .filter(Boolean);

  if (listItems.length >= 2) {
    // Create subtasks from list items
    listItems.forEach((item, idx) => {
      subtasks.push({
        id: `subtask_${idx}_${Date.now()}`,
        title: item.length > 60 ? item.slice(0, 57) + '...' : item,
        description: item,
        priority,
        selected: true,
      });
    });
    return subtasks;
  }

  // Try to split by "and", "also", "then" etc.
  const andPattern = /\b(?:and|also|then|additionally|plus)\b/gi;
  const parts = description.split(andPattern).filter((p) => p.trim().length > 10);

  if (parts.length >= 2) {
    parts.forEach((part, idx) => {
      const cleanPart = part.trim().replace(/^[,.\s]+|[,.\s]+$/g, '');
      if (cleanPart.length > 5) {
        subtasks.push({
          id: `subtask_${idx}_${Date.now()}`,
          title: cleanPart.length > 60 ? cleanPart.slice(0, 57) + '...' : cleanPart,
          description: cleanPart,
          priority,
          selected: true,
        });
      }
    });
    return subtasks;
  }

  // Fall back to sentence-based splitting
  const sentences = description
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 15);

  if (sentences.length >= 2) {
    sentences.slice(0, 5).forEach((sentence, idx) => {
      const cleanSentence = sentence.trim();
      subtasks.push({
        id: `subtask_${idx}_${Date.now()}`,
        title: cleanSentence.length > 60 ? cleanSentence.slice(0, 57) + '...' : cleanSentence,
        description: cleanSentence,
        priority,
        selected: true,
      });
    });
  }

  return subtasks;
}

export function TaskSplitSuggestion({
  title,
  description,
  priority,
  onApplySplit,
  className,
}: TaskSplitSuggestionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [subtasks, setSubtasks] = useState<SubtaskSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Analyze complexity
  const analysis = useMemo(
    () => analyzeComplexity(title, description),
    [title, description]
  );

  // Don't show if not complex
  if (!analysis.isComplex) {
    return null;
  }

  const handleAnalyze = () => {
    setIsAnalyzing(true);

    // Simulate AI processing delay
    setTimeout(() => {
      const suggestions = generateSubtasks(title, description, priority);
      setSubtasks(suggestions);
      setIsAnalyzing(false);
      setIsExpanded(true);
    }, 500);
  };

  const toggleSubtask = (id: string) => {
    setSubtasks((prev) =>
      prev.map((st) =>
        st.id === id ? { ...st, selected: !st.selected } : st
      )
    );
  };

  const handleApply = () => {
    const selected = subtasks.filter((st) => st.selected);
    if (selected.length > 0) {
      onApplySplit(selected);
    }
  };

  const selectedCount = subtasks.filter((st) => st.selected).length;

  return (
    <div
      className={cn(
        'rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-900/50',
        className
      )}
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="p-3">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-yellow-100 dark:bg-yellow-900/50 rounded-md">
              <Lightbulb className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  This task might be complex
                </h4>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge
                        variant="secondary"
                        className="bg-yellow-100 text-yellow-700 text-xs"
                      >
                        Score: {analysis.score}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <ul className="text-xs space-y-1">
                        {analysis.reasons.map((reason, idx) => (
                          <li key={idx}>• {reason}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">
                Consider splitting into smaller tasks for better results.
              </p>
            </div>

            {subtasks.length === 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="border-yellow-300 hover:bg-yellow-100"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                )}
                Suggest Split
              </Button>
            ) : (
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="ghost">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>

        <CollapsibleContent>
          {subtasks.length > 0 && (
            <div className="border-t border-yellow-200 dark:border-yellow-900/50 p-3 space-y-3">
              <div className="space-y-2">
                {subtasks.map((subtask) => (
                  <div
                    key={subtask.id}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded border bg-white dark:bg-gray-900',
                      subtask.selected
                        ? 'border-yellow-300'
                        : 'border-gray-200 opacity-50'
                    )}
                  >
                    <button
                      onClick={() => toggleSubtask(subtask.id)}
                      className={cn(
                        'w-5 h-5 rounded border flex items-center justify-center',
                        subtask.selected
                          ? 'bg-yellow-500 border-yellow-500 text-white'
                          : 'border-gray-300'
                      )}
                    >
                      {subtask.selected && <Check className="h-3 w-3" />}
                    </button>
                    <span className="flex-1 text-sm truncate">{subtask.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {subtask.priority}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-yellow-200 dark:border-yellow-900/50">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSubtasks([]);
                    setIsExpanded(false);
                  }}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={selectedCount === 0}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  <Split className="h-3.5 w-3.5 mr-1" />
                  Split into {selectedCount} Task{selectedCount !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Export the subtask type for use in other components
export type { SubtaskSuggestion };
