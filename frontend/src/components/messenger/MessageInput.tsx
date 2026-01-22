'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { Send, Paperclip, AtSign, Loader2, AlertCircle, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useSendTeamMessage, useSendTypingIndicator, useTeamMembers, type TeamMember } from '@/hooks/use-team-chat';
import { toast } from 'sonner';

export interface MessageInputProps {
  conversationId: string;
  onMessageSent?: () => void;
  disabled?: boolean;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function MessageInput({ conversationId, onMessageSent, disabled }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  const sendMessage = useSendTeamMessage();
  const { sendTyping } = useSendTypingIndicator();

  // Keep a ref to the latest sendTyping function to avoid stale closures in cleanup
  const sendTypingRef = useRef(sendTyping);
  useEffect(() => {
    sendTypingRef.current = sendTyping;
  }, [sendTyping]);

  // Fetch team members for @mentions (search when typing)
  const { data: teamMembers = [] } = useTeamMembers(mentionQuery || undefined);

  // Filter team members based on mention query (client-side filter for instant feedback)
  const filteredMembers = teamMembers.filter((member) =>
    member.name.toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 5); // Limit to 5 results

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            }
          }

          if (finalTranscript) {
            setMessage((prev) => {
              const separator = prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : '';
              return prev + separator + finalTranscript;
            });
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          if (event.error === 'not-allowed') {
            toast.error('Microphone access denied');
          }
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }

    return () => {
      if (recognitionRef.current) {
        // Remove event handlers before stopping to prevent callbacks with stale state
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const toggleSpeechRecognition = () => {
    if (!recognitionRef.current) {
      toast.error('Speech recognition not supported');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
      toast.success('Listening...');
    }
  };

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    sendTyping(conversationId, true);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(conversationId, false);
    }, 2000);
  }, [conversationId, sendTyping]);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    const currentConversationId = conversationId;
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        // Use ref to get the latest sendTyping function, avoiding stale closures
        sendTypingRef.current(currentConversationId, false);
      }
    };
  }, [conversationId]); // Remove sendTyping from deps since we use the ref

  // Detect @ mentions
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const position = e.target.selectionStart || 0;
    setMessage(value);
    setCursorPosition(position);

    if (!disabled) {
      handleTyping();
    }

    // Check for @ mention trigger
    const textBeforeCursor = value.slice(0, position);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      setShowMentions(true);
      setMentionQuery(mentionMatch[1]);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
      setMentionQuery('');
    }
  };

  // Insert mention
  const insertMention = (member: TeamMember) => {
    const textBeforeCursor = message.slice(0, cursorPosition);
    const textAfterCursor = message.slice(cursorPosition);

    // Find the @ symbol position
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const beforeMention = message.slice(0, atIndex);
    const afterMention = textAfterCursor;

    const newMessage = `${beforeMention}@${member.name} ${afterMention}`;
    setMessage(newMessage);
    setShowMentions(false);
    setMentionQuery('');

    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPosition = atIndex + member.name.length + 2; // +2 for @ and space
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  };

  // Handle keyboard navigation in mentions dropdown
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => Math.min(prev + 1, filteredMembers.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Send message
  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || sendMessage.isPending || disabled) return;

    // Stop speech recognition if active
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    try {
      // Stop typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      sendTyping(conversationId, false);

      // Clear message immediately for better UX (optimistic)
      setMessage('');

      await sendMessage.mutateAsync({
        conversationId,
        content: trimmedMessage,
      });

      onMessageSent?.();
    } catch (error) {
      // Message will be queued for retry, restore it in UI
      setMessage(trimmedMessage);
      console.error('Failed to send message:', error);
    }
  };

  // Trigger mention manually
  const triggerMention = () => {
    if (textareaRef.current) {
      const position = textareaRef.current.selectionStart || message.length;
      const newMessage = message.slice(0, position) + '@' + message.slice(position);
      setMessage(newMessage);
      setCursorPosition(position + 1);
      setShowMentions(true);
      setMentionQuery('');
      textareaRef.current.focus();
    }
  };

  return (
    <div className="relative border-t p-3">
      {/* Mentions dropdown */}
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-background border rounded-lg shadow-lg max-h-40 overflow-auto z-50">
          {filteredMembers.map((member, index) => (
            <button
              key={member.id}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50',
                index === mentionIndex && 'bg-muted'
              )}
              onClick={() => insertMention(member)}
            >
              <div className="relative">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
                {/* Online status indicator - always show as online for now */}
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-500 border border-background" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{member.name}</p>
                  <span className="text-xs text-green-500">Online</span>
                </div>
                {member.email && (
                  <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                )}
                {member.role && (
                  <p className="text-xs text-muted-foreground capitalize">{member.role.replace(/_/g, ' ')}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Offline indicator */}
      {disabled && (
        <div className="flex items-center gap-2 mb-2 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertCircle className="h-3 w-3" />
          You're offline. Messages will be queued.
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Offline - messages will be queued" : "Type a message... (@ to mention)"}
            className={cn(
              "min-h-[40px] max-h-[120px] resize-none pr-24",
              isListening && "border-red-500 ring-1 ring-red-500",
              disabled && "opacity-75"
            )}
            rows={1}
            disabled={disabled}
          />

          {/* Action buttons inside textarea */}
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            {/* Voice input button */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={toggleSpeechRecognition}
              disabled={disabled}
              className={cn(
                isListening && "text-red-500 bg-red-500/10"
              )}
              title={isListening ? "Stop recording" : "Voice input"}
            >
              {isListening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={triggerMention}
              disabled={disabled}
              title="Mention someone"
            >
              <AtSign className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled
              title="Attach file (coming soon)"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </div>

          {/* Recording indicator */}
          {isListening && (
            <div className="absolute left-3 bottom-2 flex items-center gap-2 text-red-500 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              Recording...
            </div>
          )}
        </div>

        <Button
          onClick={handleSend}
          disabled={!message.trim() || sendMessage.isPending}
          size="icon"
          className={cn(
            "transition-all",
            sendMessage.isPending && "opacity-75"
          )}
        >
          {sendMessage.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Character count for long messages */}
      {message.length > 500 && (
        <div className={cn(
          "text-xs mt-1 text-right",
          message.length > 10000 ? "text-red-500" : "text-muted-foreground"
        )}>
          {message.length.toLocaleString()}/10,000
        </div>
      )}
    </div>
  );
}

export default MessageInput;
