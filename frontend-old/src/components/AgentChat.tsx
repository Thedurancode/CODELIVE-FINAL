import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  Avatar,
  CircularProgress,
  Fab,
  Drawer,
  Chip,
  Fade,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import BuildIcon from '@mui/icons-material/Build';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ToolEvent {
  type: 'tool_start' | 'tool_end';
  tool: string;
  message?: string;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function AgentChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTools, setActiveTools] = useState<Map<string, string>>(new Map());
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTools]);

  // Parse tool events from streamed content
  const parseToolEvent = (text: string): { event: ToolEvent | null; cleanText: string } => {
    const toolEventRegex = /\n?\{"type":"(tool_start|tool_end)","tool":"([^"]+)"(?:,"message":"([^"]+)")?\}\n?/g;
    let cleanText = text;
    let event: ToolEvent | null = null;

    const match = toolEventRegex.exec(text);
    if (match) {
      event = {
        type: match[1] as 'tool_start' | 'tool_end',
        tool: match[2],
        message: match[3],
      };
      cleanText = text.replace(match[0], '');
    }

    return { event, cleanText };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setActiveTools(new Map());

    // Create placeholder for assistant message
    const assistantMessageId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: 'assistant', content: '' },
    ]);

    try {
      const response = await fetch(`${API_URL}/api/agent/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let fullContent = '';
        let reading = true;

        while (reading) {
          const { done, value } = await reader.read();
          if (done) {
            reading = false;
            break;
          }

          const chunk = decoder.decode(value, { stream: true });

          // Process chunk for tool events
          let remaining = chunk;
          while (remaining.length > 0) {
            const { event, cleanText } = parseToolEvent(remaining);

            if (event) {
              if (event.type === 'tool_start') {
                setActiveTools((prev) => {
                  const next = new Map(prev);
                  next.set(event.tool, event.message || `Running ${event.tool}...`);
                  return next;
                });
              } else if (event.type === 'tool_end') {
                setActiveTools((prev) => {
                  const next = new Map(prev);
                  next.delete(event.tool);
                  return next;
                });
              }
              remaining = cleanText;
            } else {
              // No more tool events, add remaining text to content
              fullContent += remaining;
              break;
            }
          }

          // Update the assistant message with cleaned content
          const currentContent = fullContent;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: currentContent }
                : msg
            )
          );
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: 'Sorry, I encountered an error. Please try again.' }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setActiveTools(new Map());
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="chat"
        onClick={() => setOpen(true)}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
        }}
      >
        <ChatIcon />
      </Fab>

      {/* Chat Drawer */}
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 420 },
            maxWidth: '100%',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            bgcolor: 'background.default',
          }}
        >
          {/* Header */}
          <Paper
            elevation={2}
            sx={{
              p: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRadius: 0,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'primary.main' }}>
                <SmartToyIcon />
              </Avatar>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  DispoBot
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  AI Real Estate Assistant
                </Typography>
              </Box>
            </Box>
            <IconButton onClick={() => setOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Paper>

          {/* Messages */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {messages.length === 0 && (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 4,
                  color: 'text.secondary',
                }}
              >
                <SmartToyIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
                <Typography variant="body1" gutterBottom>
                  Hi! I'm DispoBot, your AI real estate assistant.
                </Typography>
                <Typography variant="body2">
                  Ask me about properties, deals, market analysis, or anything else!
                </Typography>
              </Box>
            )}

            {messages.map((message) => (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  alignItems: 'flex-start',
                  flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                }}
              >
                <Avatar
                  sx={{
                    bgcolor: message.role === 'user' ? 'secondary.main' : 'primary.main',
                    width: 32,
                    height: 32,
                  }}
                >
                  {message.role === 'user' ? (
                    <PersonIcon sx={{ fontSize: 18 }} />
                  ) : (
                    <SmartToyIcon sx={{ fontSize: 18 }} />
                  )}
                </Avatar>
                <Box sx={{ maxWidth: '80%' }}>
                  {/* Tool Status Chips - only show for assistant messages while loading */}
                  {message.role === 'assistant' && isLoading && activeTools.size > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                      {Array.from(activeTools.entries()).map(([tool, description]) => (
                        <Fade in key={tool}>
                          <Chip
                            icon={<BuildIcon sx={{ fontSize: 14 }} />}
                            label={description}
                            size="small"
                            color="info"
                            variant="outlined"
                            sx={{
                              fontSize: '0.7rem',
                              height: 24,
                              animation: 'pulse 1.5s ease-in-out infinite',
                              '@keyframes pulse': {
                                '0%, 100%': { opacity: 1 },
                                '50%': { opacity: 0.6 },
                              },
                            }}
                          />
                        </Fade>
                      ))}
                    </Box>
                  )}
                  <Paper
                    elevation={1}
                    sx={{
                      p: 1.5,
                      bgcolor: message.role === 'user' ? 'primary.main' : 'grey.100',
                      color: message.role === 'user' ? 'white' : 'text.primary',
                      borderRadius: 2,
                      '& p': { m: 0 },
                      '& ul, & ol': { pl: 2, my: 1 },
                      '& code': {
                        bgcolor: message.role === 'user' ? 'rgba(255,255,255,0.2)' : 'grey.200',
                        px: 0.5,
                        borderRadius: 0.5,
                        fontSize: '0.85em',
                      },
                      '& pre': {
                        bgcolor: message.role === 'user' ? 'rgba(255,255,255,0.1)' : 'grey.200',
                        p: 1,
                        borderRadius: 1,
                        overflow: 'auto',
                      },
                    }}
                  >
                    {message.content ? (
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                        <CircularProgress size={16} />
                        <Typography variant="body2" color="text.secondary">
                          {activeTools.size > 0 ? 'Working...' : 'Thinking...'}
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                </Box>
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </Box>

          {/* Input */}
          <Paper
            component="form"
            onSubmit={handleSubmit}
            elevation={3}
            sx={{
              p: 2,
              display: 'flex',
              gap: 1,
              borderRadius: 0,
            }}
          >
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Ask about properties, deals, analysis..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              size="small"
              autoComplete="off"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 3,
                },
              }}
            />
            <IconButton
              type="submit"
              color="primary"
              disabled={!input.trim() || isLoading}
              sx={{
                bgcolor: 'primary.main',
                color: 'white',
                '&:hover': { bgcolor: 'primary.dark' },
                '&:disabled': { bgcolor: 'grey.300' },
              }}
            >
              {isLoading ? <CircularProgress size={24} color="inherit" /> : <SendIcon />}
            </IconButton>
          </Paper>
        </Box>
      </Drawer>
    </>
  );
}
