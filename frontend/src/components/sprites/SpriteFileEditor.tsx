/**
 * SpriteFileEditor
 *
 * Text editor for viewing and editing sprite files.
 * Supports syntax highlighting and basic editing.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Save,
  X,
  Loader2,
  AlertCircle,
  FileWarning,
  Copy,
  Check,
  Undo,
  FileCode,
  Eye,
  Edit2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useSpriteFileContent,
  useWriteSpriteFile,
  getFileExtension,
  getLanguageFromExtension,
  formatFileSize,
  isBinaryFile,
} from '@/hooks/use-sprite-filesystem';
import type { FileEntry } from '@/types/sprite';
import { toast } from 'sonner';

interface SpriteFileEditorProps {
  spriteId: string;
  workingDir: string;
  file: FileEntry | null;
  onClose?: () => void;
  className?: string;
}

type EditorMode = 'view' | 'edit';

export function SpriteFileEditor({
  spriteId,
  workingDir,
  file,
  onClose,
  className,
}: SpriteFileEditorProps) {
  const [mode, setMode] = useState<EditorMode>('view');
  const [editedContent, setEditedContent] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filePath = file?.path || null;
  const isBinary = file ? isBinaryFile(file.path) : false;

  const {
    data: fileData,
    isLoading,
    error,
    refetch,
  } = useSpriteFileContent(spriteId, filePath, workingDir);

  const writeFile = useWriteSpriteFile();

  // Reset state when file changes
  useEffect(() => {
    setMode('view');
    setEditedContent('');
    setHasChanges(false);
  }, [filePath]);

  // Initialize edited content when file loads
  useEffect(() => {
    if (fileData?.content && mode === 'edit' && !hasChanges) {
      setEditedContent(fileData.content);
    }
  }, [fileData?.content, mode, hasChanges]);

  const handleEdit = useCallback(() => {
    if (fileData?.content) {
      setEditedContent(fileData.content);
      setMode('edit');
    }
  }, [fileData?.content]);

  const handleCancel = useCallback(() => {
    setMode('view');
    setEditedContent('');
    setHasChanges(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!file) return;

    try {
      await writeFile.mutateAsync({
        spriteId,
        path: file.path,
        content: editedContent,
        workingDir,
      });
      toast.success('File saved');
      setHasChanges(false);
      setMode('view');
      refetch();
    } catch (err) {
      toast.error('Failed to save file', {
        description: (err as Error).message,
      });
    }
  }, [spriteId, file, editedContent, workingDir, writeFile, refetch]);

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setEditedContent(e.target.value);
      setHasChanges(e.target.value !== fileData?.content);
    },
    [fileData?.content]
  );

  const handleCopy = useCallback(async () => {
    const content = mode === 'edit' ? editedContent : fileData?.content;
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Copied to clipboard');
    }
  }, [mode, editedContent, fileData?.content]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Save on Ctrl/Cmd + S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges) {
          handleSave();
        }
      }
      // Cancel on Escape
      if (e.key === 'Escape') {
        handleCancel();
      }
      // Handle Tab for indentation
      if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue =
          editedContent.substring(0, start) +
          '  ' +
          editedContent.substring(end);
        setEditedContent(newValue);
        setHasChanges(newValue !== fileData?.content);
        // Set cursor position after tab
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [editedContent, fileData?.content, handleSave, handleCancel, hasChanges]
  );

  // No file selected
  if (!file) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center text-muted-foreground">
          <FileCode className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Select a file to view or edit</p>
        </div>
      </div>
    );
  }

  // Binary file
  if (isBinary) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <FileHeader file={file} onClose={onClose} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileWarning className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Binary file cannot be displayed</p>
            <p className="text-sm mt-1">{formatFileSize(file.size)}</p>
          </div>
        </div>
      </div>
    );
  }

  const ext = getFileExtension(file.path);
  const language = getLanguageFromExtension(ext);
  const content = mode === 'edit' ? editedContent : (fileData?.content || '');
  const lineCount = content.split('\n').length;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{file.name}</span>
          <Badge variant="outline" className="text-xs">
            {language}
          </Badge>
          {hasChanges && (
            <Badge variant="secondary" className="text-xs">
              Modified
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Mode toggle */}
          <TooltipProvider>
            <Tabs value={mode} onValueChange={(v) => {
              if (v === 'edit') handleEdit();
              else if (!hasChanges) handleCancel();
            }}>
              <TabsList className="h-7">
                <TabsTrigger value="view" className="text-xs px-2 h-6">
                  <Eye className="h-3 w-3 mr-1" />
                  View
                </TabsTrigger>
                <TabsTrigger value="edit" className="text-xs px-2 h-6" disabled={isLoading}>
                  <Edit2 className="h-3 w-3 mr-1" />
                  Edit
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Actions */}
            <div className="flex items-center gap-1 ml-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleCopy}
                    disabled={isLoading || !content}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy contents</TooltipContent>
              </Tooltip>

              {mode === 'edit' && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleCancel}
                        disabled={writeFile.isPending}
                      >
                        <Undo className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Discard changes (Esc)</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 px-2"
                        onClick={handleSave}
                        disabled={!hasChanges || writeFile.isPending}
                      >
                        {writeFile.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Save className="h-3.5 w-3.5 mr-1" />
                        )}
                        Save
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save changes (Ctrl+S)</TooltipContent>
                  </Tooltip>
                </>
              )}

              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onClose}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive">
            <AlertCircle className="h-8 w-8 mb-2" />
            <p>Failed to load file</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : mode === 'view' ? (
          <ScrollArea className="h-full">
            <div className="flex text-sm font-mono">
              {/* Line numbers */}
              <div className="shrink-0 py-3 px-2 text-right text-muted-foreground select-none bg-muted/30 border-r">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} className="leading-5">
                    {i + 1}
                  </div>
                ))}
              </div>
              {/* Content */}
              <pre className="flex-1 p-3 overflow-x-auto">
                <code className="leading-5 whitespace-pre">{content || ' '}</code>
              </pre>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex h-full text-sm font-mono">
            {/* Line numbers */}
            <div className="shrink-0 py-3 px-2 text-right text-muted-foreground select-none bg-muted/30 border-r overflow-hidden">
              {Array.from({ length: Math.max(lineCount, 1) }, (_, i) => (
                <div key={i} className="leading-5">
                  {i + 1}
                </div>
              ))}
            </div>
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={editedContent}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              className={cn(
                'flex-1 p-3 bg-transparent resize-none outline-none',
                'leading-5 whitespace-pre overflow-auto',
                'focus:ring-0 focus:outline-none'
              )}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 border-t bg-muted/30 text-xs text-muted-foreground">
        <span>{lineCount} lines</span>
        <span>{formatFileSize(file.size)}</span>
      </div>
    </div>
  );
}

// File header component
function FileHeader({
  file,
  onClose,
}: {
  file: FileEntry;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
      <div className="flex items-center gap-2 min-w-0">
        <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{file.name}</span>
      </div>
      {onClose && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
