'use client';

/**
 * AI Activity Slide for TV Display
 *
 * Shows real-time Codelive Agent WebSocket events in an animated,
 * visually appealing format suitable for TV displays.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  FileText,
  Terminal,
  Lightbulb,
  CheckCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  Sparkles,
  Code,
  Search,
  FolderOpen,
  Zap,
  Brain,
  Rocket,
} from 'lucide-react';

const AUTOMAKER_WS_URL = process.env.NEXT_PUBLIC_AUTOMAKER_WS_URL || 'ws://localhost:3008/api/events';

interface ActivityEvent {
  id: string;
  type: 'tool' | 'progress' | 'complete' | 'error' | 'agent' | 'status';
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  color: string;
  timestamp: Date;
}

// Map tool names to icons and colors
const getToolDisplay = (toolName: string): { icon: React.ReactNode; color: string; label: string } => {
  const toolMap: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    Read: { icon: <FileText className="h-6 w-6" />, color: 'text-blue-400', label: 'Reading File' },
    Write: { icon: <Code className="h-6 w-6" />, color: 'text-green-400', label: 'Writing Code' },
    Edit: { icon: <Code className="h-6 w-6" />, color: 'text-amber-400', label: 'Editing File' },
    Glob: { icon: <Search className="h-6 w-6" />, color: 'text-sky-400', label: 'Searching Files' },
    Grep: { icon: <Search className="h-6 w-6" />, color: 'text-teal-400', label: 'Searching Code' },
    Bash: { icon: <Terminal className="h-6 w-6" />, color: 'text-orange-400', label: 'Running Command' },
    ListDir: { icon: <FolderOpen className="h-6 w-6" />, color: 'text-cyan-400', label: 'Listing Directory' },
  };
  return toolMap[toolName] || { icon: <Zap className="h-6 w-6" />, color: 'text-zinc-400', label: toolName };
};

export function AIActivitySlide() {
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const eventIdRef = useRef(0);

  // Connect to WebSocket
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(AUTOMAKER_WS_URL);

      ws.onopen = () => {
        setIsConnected(true);
        addEvent({
          type: 'status',
          icon: <Wifi className="h-6 w-6" />,
          title: 'Connected',
          subtitle: 'Listening for agent activity...',
          color: 'text-green-400',
        });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setIsConnected(false);
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  const addEvent = (eventData: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
    const newEvent: ActivityEvent = {
      ...eventData,
      id: `event-${eventIdRef.current++}`,
      timestamp: new Date(),
    };

    setEvents((prev) => {
      const updated = [newEvent, ...prev];
      // Keep only last 15 events
      return updated.slice(0, 15);
    });
  };

  const handleMessage = (msg: { type: string; payload: any }) => {
    switch (msg.type) {
      case 'suggestions:event':
        handleSuggestionsEvent(msg.payload);
        break;
      case 'agent:stream':
        handleAgentEvent(msg.payload);
        break;
      case 'auto-mode:event':
        handleAutoModeEvent(msg.payload);
        break;
      case 'backlog-plan:event':
        handleBacklogEvent(msg.payload);
        break;
    }
  };

  const handleSuggestionsEvent = (payload: any) => {
    switch (payload?.type) {
      case 'suggestions_progress':
        setIsGenerating(true);
        break;
      case 'suggestions_tool':
        const tool = getToolDisplay(payload.tool);
        addEvent({
          type: 'tool',
          icon: tool.icon,
          title: tool.label,
          subtitle: typeof payload.input === 'object' ? payload.input?.file_path || payload.input?.pattern : undefined,
          color: tool.color,
        });
        break;
      case 'suggestions_complete':
        setIsGenerating(false);
        addEvent({
          type: 'complete',
          icon: <Lightbulb className="h-6 w-6" />,
          title: 'Suggestions Generated',
          subtitle: `${payload.suggestions?.length || 0} new ideas`,
          color: 'text-yellow-400',
        });
        break;
      case 'suggestions_error':
        setIsGenerating(false);
        addEvent({
          type: 'error',
          icon: <AlertCircle className="h-6 w-6" />,
          title: 'Generation Failed',
          subtitle: payload.error,
          color: 'text-red-400',
        });
        break;
    }
  };

  const handleAgentEvent = (payload: any) => {
    if (payload?.tool) {
      const tool = getToolDisplay(payload.tool);
      addEvent({
        type: 'tool',
        icon: tool.icon,
        title: tool.label,
        subtitle: payload.file || payload.command?.substring(0, 50),
        color: tool.color,
      });
    } else if (payload?.message) {
      addEvent({
        type: 'agent',
        icon: <Bot className="h-6 w-6" />,
        title: 'Agent Thinking',
        subtitle: payload.message.substring(0, 60) + '...',
        color: 'text-red-400',
      });
    }
  };

  const handleAutoModeEvent = (payload: any) => {
    switch (payload?.type) {
      case 'auto_mode_feature_start':
        setCurrentAgent(payload.featureTitle || payload.title || 'Working...');
        setIsGenerating(true);
        addEvent({
          type: 'status',
          icon: <Rocket className="h-6 w-6" />,
          title: 'Agent Started',
          subtitle: payload.featureTitle || payload.title,
          color: 'text-cyan-400',
        });
        break;

      case 'auto_mode_progress':
        addEvent({
          type: 'progress',
          icon: <Bot className="h-6 w-6" />,
          title: 'Agent Working',
          subtitle: payload.message?.substring(0, 60) || payload.phase,
          color: 'text-red-400',
        });
        break;

      case 'auto_mode_tool':
        const tool = getToolDisplay(payload.tool || payload.name || 'Tool');
        addEvent({
          type: 'tool',
          icon: tool.icon,
          title: tool.label,
          subtitle: payload.file || payload.path || payload.input?.file_path,
          color: tool.color,
        });
        break;

      case 'auto_mode_feature_complete':
        setIsGenerating(false);
        addEvent({
          type: 'complete',
          icon: <CheckCircle className="h-6 w-6" />,
          title: 'Task Completed',
          subtitle: payload.featureTitle || payload.title,
          color: 'text-green-400',
        });
        setCurrentAgent(null);
        break;

      case 'auto_mode_error':
        setIsGenerating(false);
        addEvent({
          type: 'error',
          icon: <AlertCircle className="h-6 w-6" />,
          title: 'Error',
          subtitle: payload.error || payload.message,
          color: 'text-red-400',
        });
        break;

      case 'auto_mode_started':
        addEvent({
          type: 'status',
          icon: <Rocket className="h-6 w-6" />,
          title: 'Auto Mode Started',
          subtitle: 'Processing queue...',
          color: 'text-cyan-400',
        });
        break;

      case 'auto_mode_stopped':
        setIsGenerating(false);
        setCurrentAgent(null);
        addEvent({
          type: 'status',
          icon: <AlertCircle className="h-6 w-6" />,
          title: 'Auto Mode Stopped',
          color: 'text-zinc-400',
        });
        break;
    }
  };

  const handleBacklogEvent = (payload: any) => {
    if (payload?.type === 'backlog_plan_complete') {
      addEvent({
        type: 'complete',
        icon: <Brain className="h-6 w-6" />,
        title: 'Backlog Plan Ready',
        subtitle: `${payload.plan?.features?.length || 0} tasks planned`,
        color: 'text-cyan-400',
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-8 overflow-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <motion.div
              animate={isGenerating ? {
                boxShadow: [
                  '0 0 0 0 rgba(239, 68, 68, 0.4)',
                  '0 0 0 20px rgba(239, 68, 68, 0)',
                ]
              } : {}}
              transition={{
                duration: 1.5,
                repeat: isGenerating ? Infinity : 0,
                ease: 'easeOut'
              }}
              className="p-4 rounded-2xl bg-gradient-to-br from-red-600 to-red-500"
            >
              <Bot className="h-12 w-12 text-white" />
            </motion.div>
            {isGenerating && (
              <motion.div
                className="absolute inset-0 rounded-2xl bg-red-500/30"
                animate={{ opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>
          <div>
            <h1 className="text-5xl font-bold text-white">
              Live Agents
            </h1>
            <p className="text-xl text-zinc-400 mt-1">
              {currentAgent ? `Working on: ${currentAgent}` : 'Real-time Events'}
            </p>
          </div>
        </div>

        {/* Connection Status */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`flex items-center gap-3 px-6 py-3 rounded-full ${
            isConnected
              ? 'bg-green-500/20 border border-green-500/30'
              : 'bg-red-500/20 border border-red-500/30'
          }`}
        >
          {isConnected ? (
            <>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Wifi className="h-6 w-6 text-green-400" />
              </motion.div>
              <span className="text-xl text-green-400 font-medium">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-6 w-6 text-red-400" />
              <span className="text-xl text-red-400 font-medium">Disconnected</span>
            </>
          )}
        </motion.div>
      </motion.div>

      {/* Activity Feed */}
      <div className="flex-1 relative overflow-hidden">
        {/* Generating Indicator */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-0 left-0 right-0 flex items-center justify-center gap-4 py-4 bg-red-500/10 border border-red-500/20 rounded-2xl mb-4 z-10"
            >
              <motion.div
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Sparkles className="h-8 w-8 text-red-400" />
              </motion.div>
              <span className="text-2xl text-red-400 font-medium">Agent is working...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Events List */}
        <div className={`space-y-4 ${isGenerating ? 'mt-20' : ''}`}>
          <AnimatePresence mode="popLayout">
            {events.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-96 text-zinc-600"
              >
                <Bot className="h-24 w-24 mb-4 opacity-30" />
                <p className="text-3xl">Waiting for AI activity...</p>
                <p className="text-xl mt-2">Events will appear here in real-time</p>
              </motion.div>
            ) : (
              events.map((event, index) => (
                <motion.div
                  key={event.id}
                  layout
                  initial={{ opacity: 0, x: -100, scale: 0.8 }}
                  animate={{
                    opacity: index === 0 ? 1 : 0.7 - (index * 0.04),
                    x: 0,
                    scale: index === 0 ? 1 : 0.98 - (index * 0.01)
                  }}
                  exit={{ opacity: 0, x: 100, scale: 0.8 }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 30,
                    opacity: { duration: 0.2 }
                  }}
                  className={`flex items-center gap-6 p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 ${
                    index === 0 ? 'bg-zinc-800/50 border-zinc-700/50' : ''
                  }`}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                    className={`p-4 rounded-xl bg-zinc-800/50 ${event.color}`}
                  >
                    {event.icon}
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-2xl font-semibold ${event.color}`}>
                      {event.title}
                    </h3>
                    {event.subtitle && (
                      <p className="text-lg text-zinc-500 truncate mt-1">
                        {event.subtitle}
                      </p>
                    )}
                  </div>
                  <div className="text-lg text-zinc-600">
                    {event.timestamp.toLocaleTimeString()}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex items-center justify-center gap-8 mt-8 pt-6 border-t border-zinc-800/50"
      >
        <div className="flex items-center gap-2 text-zinc-500">
          <Zap className="h-5 w-5" />
          <span className="text-lg">{events.filter(e => e.type === 'tool').length} tool calls</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <CheckCircle className="h-5 w-5" />
          <span className="text-lg">{events.filter(e => e.type === 'complete').length} completed</span>
        </div>
      </motion.div>
    </div>
  );
}
