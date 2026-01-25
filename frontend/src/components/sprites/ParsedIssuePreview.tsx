/**
 * ParsedIssuePreview
 *
 * Displays smart-parsed issue data with subtasks, files, criteria, and generated prompt.
 */

'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  FileCode,
  ListChecks,
  Target,
  Code2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Cpu,
  AlertTriangle,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type {
  ParsedIssue,
  ParsedGitHubIssue,
  TaskComplexity,
  TASK_COMPLEXITY_COLORS,
  TASK_COMPLEXITY_LABELS,
  SPRITE_TASK_PRIORITY_COLORS,
  SPRITE_TASK_PRIORITY_LABELS,
} from '@/types/spriteTask';

interface ParsedIssuePreviewProps {
  parsed: ParsedIssue | ParsedGitHubIssue;
  className?: string;
  showPrompt?: boolean;
}

// Complexity badge colors
const complexityColors: Record<TaskComplexity, string> = {
  trivial: 'bg-green-500/10 text-green-500 border-green-500/20',
  simple: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  moderate: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  complex: 'bg-red-500/10 text-red-500 border-red-500/20',
};

// Priority badge colors
const priorityColors: Record<string, string> = {
  low: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  medium: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  urgent: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export function ParsedIssuePreview({
  parsed,
  className,
  showPrompt = true,
}: ParsedIssuePreviewProps) {
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isTechOpen, setIsTechOpen] = useState(false);

  const hasSubtasks = parsed.subtasks.length > 0;
  const hasFiles = parsed.targetFiles.length > 0;
  const hasCriteria = parsed.acceptanceCriteria.length > 0;
  const hasTech = parsed.technicalContext.mentionedTechnologies.length > 0;
  const hasCodeBlocks = parsed.technicalContext.codeBlocks.length > 0;
  const hasRelated = parsed.relatedIssues.length > 0;

  const isGitHubIssue = 'issueNumber' in parsed;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with badges */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={priorityColors[parsed.priority]}>
          {parsed.priority.charAt(0).toUpperCase() + parsed.priority.slice(1)} Priority
        </Badge>
        <Badge variant="outline" className={complexityColors[parsed.estimatedComplexity]}>
          <Cpu className="h-3 w-3 mr-1" />
          {parsed.estimatedComplexity.charAt(0).toUpperCase() +
            parsed.estimatedComplexity.slice(1)}{' '}
          Complexity
        </Badge>
        {isGitHubIssue && (
          <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">
            <Link2 className="h-3 w-3 mr-1" />#{(parsed as ParsedGitHubIssue).issueNumber}
          </Badge>
        )}
      </div>

      {/* Subtasks */}
      {hasSubtasks && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ListChecks className="h-4 w-4" />
            <span>Subtasks ({parsed.subtasks.length})</span>
          </div>
          <div className="space-y-1 pl-6">
            {parsed.subtasks.map((subtask, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {subtask.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                )}
                <span className={cn(subtask.completed && 'line-through text-muted-foreground')}>
                  {subtask.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Target Files */}
      {hasFiles && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileCode className="h-4 w-4" />
            <span>Target Files ({parsed.targetFiles.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-6">
            {parsed.targetFiles.map((file, i) => (
              <Badge key={i} variant="secondary" className="font-mono text-xs">
                {file}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Acceptance Criteria */}
      {hasCriteria && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Target className="h-4 w-4" />
            <span>Success Criteria ({parsed.acceptanceCriteria.length})</span>
          </div>
          <div className="space-y-1 pl-6">
            {parsed.acceptanceCriteria.map((criterion, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>{criterion}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Issues */}
      {hasRelated && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Link2 className="h-4 w-4" />
            <span>Related Issues</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-6">
            {parsed.relatedIssues.map((rel, i) => (
              <Badge
                key={i}
                variant="outline"
                className={cn(
                  'text-xs',
                  rel.type === 'blocked_by' && 'border-red-500/30 text-red-500',
                  rel.type === 'blocks' && 'border-orange-500/30 text-orange-500',
                  rel.type === 'related' && 'border-blue-500/30 text-blue-500',
                  rel.type === 'duplicate' && 'border-gray-500/30 text-gray-500'
                )}
              >
                {rel.type === 'blocked_by' && <AlertTriangle className="h-3 w-3 mr-1" />}
                {rel.type.replace('_', ' ')} #{rel.issueNumber}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Technical Context */}
      {(hasTech || hasCodeBlocks) && (
        <Collapsible open={isTechOpen} onOpenChange={setIsTechOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8">
              {isTechOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <Code2 className="h-4 w-4" />
              <span className="text-sm font-medium">Technical Context</span>
              {hasTech && (
                <span className="text-xs text-muted-foreground">
                  ({parsed.technicalContext.mentionedTechnologies.length} technologies)
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pl-6 pt-2">
            {hasTech && (
              <div className="flex flex-wrap gap-1.5">
                {parsed.technicalContext.mentionedTechnologies.map((tech, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tech}
                  </Badge>
                ))}
              </div>
            )}
            {hasCodeBlocks && (
              <div className="space-y-2">
                {parsed.technicalContext.codeBlocks.slice(0, 2).map((block, i) => (
                  <div key={i} className="space-y-1">
                    {block.context && (
                      <p className="text-xs text-muted-foreground italic">{block.context}</p>
                    )}
                    <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                      <code>{block.code.slice(0, 200)}{block.code.length > 200 && '...'}</code>
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Generated Prompt */}
      {showPrompt && (
        <Collapsible open={isPromptOpen} onOpenChange={setIsPromptOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8">
              {isPromptOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Generated Prompt</span>
              <span className="text-xs text-muted-foreground">
                ({parsed.prompt.length} chars)
              </span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="h-48 mt-2">
              <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap font-mono">
                {parsed.prompt}
              </pre>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Empty state */}
      {!hasSubtasks && !hasFiles && !hasCriteria && !hasTech && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No structured data extracted. The issue will be used as-is.
        </p>
      )}
    </div>
  );
}
