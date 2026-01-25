/**
 * SpriteFileBrowser
 *
 * Main file browser panel combining tree navigation and editor.
 * Provides full filesystem browsing and editing capabilities.
 */

'use client';

import { useState, useCallback } from 'react';
import {
  FolderTree,
  Plus,
  FilePlus,
  FolderPlus,
  Loader2,
  HardDrive,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SpriteFileTree } from './SpriteFileTree';
import { SpriteFileEditor } from './SpriteFileEditor';
import {
  useWriteSpriteFile,
  useDeleteSpriteFile,
  useRenameSpriteFile,
} from '@/hooks/use-sprite-filesystem';
import { useSpriteByProject } from '@/hooks/use-sprites';
import type { FileEntry } from '@/types/sprite';
import { isSpriteActive } from '@/types/sprite';
import { toast } from 'sonner';

interface SpriteFileBrowserProps {
  projectId: string;
  className?: string;
}

type DialogMode = 'create-file' | 'create-folder' | 'rename' | 'delete' | null;

export function SpriteFileBrowser({
  projectId,
  className,
}: SpriteFileBrowserProps) {
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [dialogPath, setDialogPath] = useState<string>('');
  const [dialogEntry, setDialogEntry] = useState<FileEntry | null>(null);
  const [dialogInput, setDialogInput] = useState<string>('');

  const { data: sprite, isLoading: spriteLoading } = useSpriteByProject(projectId);
  const writeFile = useWriteSpriteFile();
  const deleteFile = useDeleteSpriteFile();
  const renameFile = useRenameSpriteFile();

  const workingDir = sprite?.workingDirectory || '/home/user/project';

  // File selection handler
  const handleSelectFile = useCallback((path: string, entry: FileEntry) => {
    setSelectedPath(path);
    if (!entry.isDir) {
      setSelectedFile(entry);
    }
  }, []);

  // Dialog handlers
  const handleCreateFile = useCallback((parentPath: string) => {
    setDialogPath(parentPath);
    setDialogInput('');
    setDialogMode('create-file');
  }, []);

  const handleCreateFolder = useCallback((parentPath: string) => {
    setDialogPath(parentPath);
    setDialogInput('');
    setDialogMode('create-folder');
  }, []);

  const handleRename = useCallback((path: string, entry: FileEntry) => {
    setDialogPath(path);
    setDialogEntry(entry);
    setDialogInput(entry.name);
    setDialogMode('rename');
  }, []);

  const handleDelete = useCallback((path: string, entry: FileEntry) => {
    setDialogPath(path);
    setDialogEntry(entry);
    setDialogMode('delete');
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogMode(null);
    setDialogPath('');
    setDialogEntry(null);
    setDialogInput('');
  }, []);

  // Dialog submit handlers
  const handleCreateFileSubmit = useCallback(async () => {
    if (!sprite || !dialogInput.trim()) return;

    const newPath = `${dialogPath}/${dialogInput.trim()}`;
    try {
      await writeFile.mutateAsync({
        spriteId: sprite.id,
        path: newPath,
        content: '',
        workingDir,
        mkdir: true,
      });
      toast.success('File created');
      handleCloseDialog();
    } catch (err) {
      toast.error('Failed to create file', {
        description: (err as Error).message,
      });
    }
  }, [sprite, dialogPath, dialogInput, workingDir, writeFile, handleCloseDialog]);

  const handleCreateFolderSubmit = useCallback(async () => {
    if (!sprite || !dialogInput.trim()) return;

    const newPath = `${dialogPath}/${dialogInput.trim()}`;
    try {
      await writeFile.mutateAsync({
        spriteId: sprite.id,
        path: `${newPath}/.gitkeep`,
        content: '',
        workingDir,
        mkdir: true,
      });
      toast.success('Folder created');
      handleCloseDialog();
    } catch (err) {
      toast.error('Failed to create folder', {
        description: (err as Error).message,
      });
    }
  }, [sprite, dialogPath, dialogInput, workingDir, writeFile, handleCloseDialog]);

  const handleRenameSubmit = useCallback(async () => {
    if (!sprite || !dialogInput.trim() || !dialogEntry) return;

    const parentPath = dialogPath.split('/').slice(0, -1).join('/');
    const newPath = `${parentPath}/${dialogInput.trim()}`;

    try {
      await renameFile.mutateAsync({
        spriteId: sprite.id,
        source: dialogPath,
        dest: newPath,
        workingDir,
      });
      toast.success('Renamed successfully');

      // Update selection if the renamed item was selected
      if (selectedPath === dialogPath) {
        setSelectedPath(newPath);
        if (selectedFile?.path === dialogPath) {
          setSelectedFile({ ...selectedFile, path: newPath, name: dialogInput.trim() });
        }
      }

      handleCloseDialog();
    } catch (err) {
      toast.error('Failed to rename', {
        description: (err as Error).message,
      });
    }
  }, [sprite, dialogPath, dialogInput, dialogEntry, workingDir, renameFile, selectedPath, selectedFile, handleCloseDialog]);

  const handleDeleteSubmit = useCallback(async () => {
    if (!sprite || !dialogEntry) return;

    try {
      await deleteFile.mutateAsync({
        spriteId: sprite.id,
        path: dialogPath,
        workingDir,
        recursive: dialogEntry.isDir,
      });
      toast.success('Deleted successfully');

      // Clear selection if deleted item was selected
      if (selectedPath === dialogPath || selectedPath?.startsWith(`${dialogPath}/`)) {
        setSelectedPath(null);
        setSelectedFile(null);
      }

      handleCloseDialog();
    } catch (err) {
      toast.error('Failed to delete', {
        description: (err as Error).message,
      });
    }
  }, [sprite, dialogPath, dialogEntry, workingDir, deleteFile, selectedPath, handleCloseDialog]);

  // Loading state
  if (spriteLoading) {
    return (
      <Card className={cn('h-full', className)}>
        <CardContent className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // No sprite state
  if (!sprite) {
    return (
      <Card className={cn('h-full', className)}>
        <CardContent className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <HardDrive className="h-12 w-12 mb-2 opacity-50" />
          <p>Launch a coding agent to browse files</p>
        </CardContent>
      </Card>
    );
  }

  // Sprite not running state
  if (!isSpriteActive(sprite.status)) {
    return (
      <Card className={cn('h-full', className)}>
        <CardContent className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <HardDrive className="h-12 w-12 mb-2 opacity-50" />
          <p className="text-center">
            Coding agent is <span className="font-medium">{sprite.status}</span>
          </p>
          <p className="text-sm mt-1">Resume the agent to browse files</p>
        </CardContent>
      </Card>
    );
  }

  const isPending = writeFile.isPending || deleteFile.isPending || renameFile.isPending;

  return (
    <>
      <Card className={cn('h-full flex flex-col', className)}>
        <CardHeader className="p-3 pb-2 border-b shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              File Browser
            </CardTitle>
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    >
                      {sidebarCollapsed ? (
                        <PanelLeft className="h-4 w-4" />
                      ) : (
                        <PanelLeftClose className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    New
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleCreateFile(workingDir)}>
                    <FilePlus className="mr-2 h-4 w-4" />
                    New File
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleCreateFolder(workingDir)}>
                    <FolderPlus className="mr-2 h-4 w-4" />
                    New Folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0 min-h-0">
          <div className="flex h-full">
            {/* Sidebar - File Tree */}
            {!sidebarCollapsed && (
              <div className="w-64 border-r shrink-0 overflow-hidden">
                <SpriteFileTree
                  spriteId={sprite.id}
                  workingDir={workingDir}
                  selectedPath={selectedPath}
                  onSelectFile={handleSelectFile}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              </div>
            )}

            {/* Main Content - Editor */}
            <div className="flex-1 min-w-0">
              <SpriteFileEditor
                spriteId={sprite.id}
                workingDir={workingDir}
                file={selectedFile}
                onClose={() => setSelectedFile(null)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create File Dialog */}
      <Dialog open={dialogMode === 'create-file'} onOpenChange={() => handleCloseDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
            <DialogDescription>
              Enter the name for the new file in {dialogPath}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={dialogInput}
            onChange={(e) => setDialogInput(e.target.value)}
            placeholder="filename.ts"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFileSubmit();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleCreateFileSubmit} disabled={!dialogInput.trim() || isPending}>
              {writeFile.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={dialogMode === 'create-folder'} onOpenChange={() => handleCloseDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter the name for the new folder in {dialogPath}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={dialogInput}
            onChange={(e) => setDialogInput(e.target.value)}
            placeholder="folder-name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolderSubmit();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolderSubmit} disabled={!dialogInput.trim() || isPending}>
              {writeFile.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={dialogMode === 'rename'} onOpenChange={() => handleCloseDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {dialogEntry?.isDir ? 'Folder' : 'File'}</DialogTitle>
            <DialogDescription>
              Enter the new name for {dialogEntry?.name}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={dialogInput}
            onChange={(e) => setDialogInput(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleRenameSubmit}
              disabled={!dialogInput.trim() || dialogInput === dialogEntry?.name || isPending}
            >
              {renameFile.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={dialogMode === 'delete'} onOpenChange={() => handleCloseDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {dialogEntry?.isDir ? 'Folder' : 'File'}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{dialogEntry?.name}</strong>?
              {dialogEntry?.isDir && ' This will delete all contents.'}
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteSubmit} disabled={isPending}>
              {deleteFile.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
