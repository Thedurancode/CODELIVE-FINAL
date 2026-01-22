'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Bot,
  User,
  Loader2,
  Home,
  DollarSign,
  HelpCircle,
  MessageCircle,
  RefreshCw,
  Bell,
  Building2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWebSocket, WebSocketMessage } from '@/hooks/use-websocket';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Property } from '@/types';

// Quick prompts for buyers
const buyerQuickPrompts = [
  { text: 'Show me deals in Texas', icon: Home },
  { text: 'Find properties under $200K', icon: DollarSign },
  { text: 'What offers have I made?', icon: MessageCircle },
  { text: 'Help me understand ARV', icon: HelpCircle },
];

// Session storage key
const SESSION_KEY = 'dispotree_buyer_session';

export default function BuyerChatPage() {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist session ID across page reloads
  const [sessionId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) return stored;
      const newId = `buyer-${Date.now()}`;
      localStorage.setItem(SESSION_KEY, newId);
      return newId;
    }
    return `buyer-${Date.now()}`;
  });

  // Property context - when discussing a specific property
  const [activeProperty, setActiveProperty] = useState<Property | null>(null);
  const [showPropertyCard, setShowPropertyCard] = useState(false);

  // WebSocket for real-time notifications
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    // Handle seller response notifications
    if (message.type === 'system' && message.data?.sessionId === sessionId) {
      toast.success('Seller Responded!', {
        description: message.message,
        action: {
          label: 'View',
          onClick: () => {
            // Scroll to see the response
            if (scrollRef.current) {
              const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
              if (scrollElement) {
                scrollElement.scrollTop = scrollElement.scrollHeight;
              }
            }
          },
        },
      });
    }
  }, [sessionId]);

  const { isConnected } = useWebSocket({
    autoConnect: true,
    onMessage: handleWebSocketMessage,
  });

  // Manage input state manually (required in AI SDK v3+)
  const [input, setInput] = useState('');

  // Create transport with memoization to avoid recreating on each render
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/buyer/chat',
    body: {
      sessionId,
    },
    headers: {
      Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('dispotree_token') : ''}`,
    },
  }), [sessionId]);

  const {
    messages,
    sendMessage,
    status,
    error,
    regenerate,
    setMessages,
  } = useChat({
    transport,
    onFinish: ({ message }) => {
      // Check if message mentions a property ID and fetch context
      const textContent = message.parts
        ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map(part => part.text)
        .join('') || '';
      const propertyMatch = textContent.match(/property\s*#?(\d+)/i);
      if (propertyMatch) {
        fetchPropertyContext(propertyMatch[1]);
      }
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput('');
    }
  };

  // Fetch property context when mentioned
  const fetchPropertyContext = async (propertyId: string) => {
    try {
      const property = await api.get<Property>(`/api/listings/${propertyId}`);
      setActiveProperty(property);
      setShowPropertyCard(true);
    } catch {
      // Property not found or error - ignore silently
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Start new session
  const startNewSession = () => {
    const newId = `buyer-${Date.now()}`;
    localStorage.setItem(SESSION_KEY, newId);
    setMessages([]);
    setActiveProperty(null);
    setShowPropertyCard(false);
    window.location.reload();
  };

  const handleQuickPrompt = (prompt: string) => {
    if (prompt.trim()) {
      sendMessage({ text: prompt });
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Buyer Assistant</h1>
            <p className="text-muted-foreground text-sm">
              Ask about properties, make offers, or get help with your investment questions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn(
              'border-green-600 text-green-400',
              !isConnected && 'border-yellow-600 text-yellow-400'
            )}>
              <span className={cn(
                'w-2 h-2 rounded-full mr-2',
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
              )} />
              {isConnected ? 'Online' : 'Connecting...'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={startNewSession}
              className="border text-foreground"
            >
              New Chat
            </Button>
          </div>
        </div>

        {/* Chat Area */}
        <Card className="flex-1 bg-card border flex flex-col overflow-hidden">
          <CardContent className="flex-1 flex flex-col p-0">
            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                  <div className="w-20 h-20 rounded-full bg-blue-600/20 flex items-center justify-center mb-6">
                    <Home className="h-10 w-10 text-blue-500" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-2">
                    Welcome to CodeLive
                  </h2>
                  <p className="text-muted-foreground max-w-md mb-8">
                    I'm your personal real estate assistant. I can help you find
                    properties, make offers, and answer questions about deals.
                    If I don't know something, I'll contact the seller for you!
                  </p>

                  {/* Quick Prompts */}
                  <div className="grid grid-cols-2 gap-3 max-w-lg">
                    {buyerQuickPrompts.map((prompt) => (
                      <Button
                        key={prompt.text}
                        variant="outline"
                        className="border text-foreground hover:bg-secondary justify-start h-auto py-3"
                        onClick={() => handleQuickPrompt(prompt.text)}
                      >
                        <prompt.icon className="h-4 w-4 mr-2 text-blue-400" />
                        <span className="text-left text-sm">{prompt.text}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'flex gap-3',
                        message.role === 'user' ? 'flex-row-reverse' : ''
                      )}
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback
                          className={
                            message.role === 'user'
                              ? 'bg-blue-600 text-foreground'
                              : 'bg-zinc-700 text-foreground'
                          }
                        >
                          {message.role === 'user' ? (
                            <User className="h-4 w-4" />
                          ) : (
                            <Bot className="h-4 w-4" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={cn(
                          'max-w-[80%] rounded-lg p-3',
                          message.role === 'user'
                            ? 'bg-blue-600 text-foreground'
                            : 'bg-secondary text-foreground'
                        )}
                      >
                        <div className="text-sm whitespace-pre-wrap prose prose-invert prose-sm max-w-none">
                          {message.parts && message.parts.length > 0 ? (
                            message.parts.map((part, index) =>
                              part.type === 'text' ? <span key={index}>{part.text}</span> : null
                            )
                          ) : (
                            <span className="text-muted-foreground italic">Thinking...</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Loading indicator */}
                  {isLoading && (
                    <div className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-zinc-700 text-foreground">
                          <Bot className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-secondary rounded-lg p-3 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  )}

                  {/* Error message */}
                  {error && (
                    <div className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-red-700 text-foreground">
                          <Bot className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 flex items-center gap-2">
                        <span className="text-sm text-red-300">
                          Something went wrong. Please try again.
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => regenerate()}
                          className="text-red-300 hover:text-red-200"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t border">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  name="prompt"
                  value={input}
                  onChange={handleInputChange}
                  placeholder="Ask about properties, make offers, or ask questions..."
                  className="flex-1 bg-secondary border text-foreground"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-foreground"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Questions I can't answer will be forwarded to the seller
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Property Context Sidebar */}
      {showPropertyCard && activeProperty && (
        <Card className="w-80 bg-card border flex-shrink-0 hidden lg:block">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-400" />
                Property Details
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowPropertyCard(false)}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            {/* Property Photo */}
            {activeProperty.photoLinks?.[0] && (
              <div className="aspect-video rounded-lg overflow-hidden mb-4 bg-secondary">
                <img
                  src={activeProperty.photoLinks[0]}
                  alt="Property"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Property Info */}
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Address</p>
                <p className="text-foreground font-medium">
                  {activeProperty.address?.houseNumber} {activeProperty.address?.street}
                </p>
                <p className="text-foreground">
                  {activeProperty.city}, {activeProperty.state} {activeProperty.zip}
                </p>
              </div>

              {activeProperty.askingPrice && (
                <div>
                  <p className="text-muted-foreground">Asking Price</p>
                  <p className="text-foreground font-medium text-lg">
                    ${activeProperty.askingPrice.toLocaleString()}
                  </p>
                </div>
              )}

              {activeProperty.arv && (
                <div>
                  <p className="text-muted-foreground">ARV</p>
                  <p className="text-green-400 font-medium">
                    ${activeProperty.arv.toLocaleString()}
                  </p>
                </div>
              )}

              <div className="flex gap-4">
                {activeProperty.bedroomCount && (
                  <div>
                    <p className="text-muted-foreground">Beds</p>
                    <p className="text-foreground">{activeProperty.bedroomCount}</p>
                  </div>
                )}
                {activeProperty.bathroomCount && (
                  <div>
                    <p className="text-muted-foreground">Baths</p>
                    <p className="text-foreground">{activeProperty.bathroomCount}</p>
                  </div>
                )}
                {activeProperty.livingSpaceSqFt && (
                  <div>
                    <p className="text-muted-foreground">Sqft</p>
                    <p className="text-foreground">{activeProperty.livingSpaceSqFt.toLocaleString()}</p>
                  </div>
                )}
              </div>

              {activeProperty.propertyType && (
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="text-foreground">{activeProperty.propertyType}</p>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="mt-4 pt-4 border-t border space-y-2">
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => handleQuickPrompt(`Tell me more about property #${activeProperty.id}`)}
              >
                Ask About This Property
              </Button>
              <Button
                variant="outline"
                className="w-full border"
                onClick={() => handleQuickPrompt(`I want to make an offer on property #${activeProperty.id}`)}
              >
                Make an Offer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
