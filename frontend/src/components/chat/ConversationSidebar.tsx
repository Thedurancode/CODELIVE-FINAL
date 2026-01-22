'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Check, X, MessageSquare, ChevronLeft, History, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import { useChatStore } from '@/stores/chat-store';
import {
  useConversations,
  useUpdateConversationTitle,
  useDeleteConversation,
  type Conversation,
} from '@/hooks/use-conversations';

interface ConversationSidebarProps {
  onNewChat: () => void;
  className?: string;
}

export function ConversationSidebar({ onNewChat, className }: ConversationSidebarProps) {
  const { currentConversationId, setCurrentConversation } = useAppStore();
  const { conversationSidebarOpen, setConversationSidebarOpen } = useChatStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);

  const { data: conversations = [] } = useConversations();
  const updateTitleMutation = useUpdateConversationTitle();
  const deleteMutation = useDeleteConversation();

  const startEditing = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const saveTitle = async () => {
    if (!editingId || !editingTitle.trim()) return;
    try {
      await updateTitleMutation.mutateAsync({
        id: editingId,
        title: editingTitle.trim(),
      });
      cancelEditing();
      toast.success('Title updated');
    } catch (error) {
      console.error('Failed to update title:', error);
      toast.error('Failed to update title');
    }
  };

  const promptDelete = (conv: Conversation) => {
    setConversationToDelete(conv);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!conversationToDelete) return;

    try {
      await deleteMutation.mutateAsync(conversationToDelete.id);
      if (currentConversationId === conversationToDelete.id) {
        onNewChat();
      }
      toast.success('Conversation deleted');
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      toast.error('Failed to delete conversation');
    } finally {
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
    }
  };

  const cancelDelete = () => {
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return 'Previous 7 Days';
    if (diffDays < 30) return 'Previous 30 Days';
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Group conversations by date
  const groupedConversations = conversations.reduce((groups, conv) => {
    const date = formatDate(conv.lastMessageAt || conv.createdAt);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(conv);
    return groups;
  }, {} as Record<string, Conversation[]>);

  return (
    <>
      {/* Mobile backdrop */}
      {conversationSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setConversationSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'flex flex-col h-full border-r border-zinc-800 bg-zinc-900 transition-all duration-300',
          // Mobile
          'fixed left-0 top-0 z-40 w-72 -translate-x-full',
          conversationSidebarOpen && 'translate-x-0',
          // Desktop
          'lg:relative lg:translate-x-0',
          conversationSidebarOpen ? 'lg:w-72' : 'lg:w-0 lg:border-0 lg:overflow-hidden',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-zinc-400" />
            <span className="font-medium text-sm text-zinc-200">Chat History</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            onClick={() => setConversationSidebarOpen(false)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* New chat button */}
        <div className="p-3">
          <Button
            onClick={() => {
              onNewChat();
              setConversationSidebarOpen(false);
            }}
            className="w-full bg-accent-600 hover:bg-accent-500 text-white font-medium shadow-lg shadow-accent-600/20"
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Chat
          </Button>
        </div>

        {/* Conversations list */}
        <ScrollArea className="flex-1 px-2">
          <div className="pb-4">
            {Object.entries(groupedConversations).map(([date, convs]) => (
              <div key={date} className="mb-3">
                <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-2 py-2">
                  {date}
                </p>
                <div className="space-y-1">
                  {convs.map((conv) => (
                    <ContextMenu key={conv.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          className={cn(
                            'group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150',
                            currentConversationId === conv.id
                              ? 'bg-zinc-800 text-zinc-100'
                              : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                          )}
                          onClick={() => {
                            setCurrentConversation(conv.id);
                            setConversationSidebarOpen(false);
                          }}
                        >
                          <MessageSquare className={cn(
                            'h-4 w-4 flex-shrink-0 transition-colors',
                            currentConversationId === conv.id ? 'text-accent-400' : 'text-zinc-500'
                          )} />

                          {editingId === conv.id ? (
                            <div
                              className="flex items-center gap-1 flex-1 min-w-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Input
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                className="h-7 text-sm px-2 bg-zinc-700 border-zinc-600 text-zinc-100"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveTitle();
                                  if (e.key === 'Escape') cancelEditing();
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 hover:bg-zinc-700"
                                onClick={saveTitle}
                              >
                                <Check className="h-3.5 w-3.5 text-green-400" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 hover:bg-zinc-700"
                                onClick={cancelEditing}
                              >
                                <X className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span className="flex-1 text-sm truncate font-medium">{conv.title}</span>
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 hover:bg-zinc-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditing(conv);
                                  }}
                                >
                                  <Pencil className="h-3 w-3 text-zinc-400 hover:text-zinc-200" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 hover:bg-red-500/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    promptDelete(conv);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3 text-zinc-400 hover:text-red-400" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48 bg-zinc-900 border-zinc-700">
                        <ContextMenuItem
                          onClick={() => {
                            setCurrentConversation(conv.id);
                            setConversationSidebarOpen(false);
                          }}
                          className="text-zinc-200 focus:bg-zinc-800 focus:text-white"
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Open chat
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => startEditing(conv)}
                          className="text-zinc-200 focus:bg-zinc-800 focus:text-white"
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => navigator.clipboard.writeText(conv.title)}
                          className="text-zinc-200 focus:bg-zinc-800 focus:text-white"
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy title
                        </ContextMenuItem>
                        <ContextMenuSeparator className="bg-zinc-700" />
                        <ContextMenuItem
                          onClick={() => promptDelete(conv)}
                          variant="destructive"
                          className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete chat
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              </div>
            ))}
            {conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
                  <MessageSquare className="h-5 w-5 text-zinc-500" />
                </div>
                <p className="text-sm text-zinc-500 text-center">
                  No conversations yet
                </p>
                <p className="text-xs text-zinc-600 text-center mt-1">
                  Start a new chat to begin
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will permanently delete &quot;{conversationToDelete?.title}&quot; and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={cancelDelete}
              className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
