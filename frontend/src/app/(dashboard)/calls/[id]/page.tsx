'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
  User,
  Building2,
  ArrowLeft,
  RefreshCw,
  Play,
  Pause,
  Download,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MessageSquare,
  Bot,
  Wrench,
  Smile,
  Meh,
  Frown,
  Mail,
  MapPin,
  Tag,
  FileText,
  Calendar,
  DollarSign,
  Home,
  BedDouble,
  Bath,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useCall,
  useReanalyzeCall,
  formatDuration,
  getStatusColor,
  getOutcomeColor,
  formatOutcome,
  type CallDirection,
  type CallStatus,
} from '@/hooks/use-calls';
import { cn } from '@/lib/utils';
import { useState, useRef } from 'react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CallDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: callDetail, isLoading, error, refetch } = useCall(id);
  const reanalyze = useReanalyzeCall();
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const getDirectionIcon = (dir: CallDirection, callStatus: CallStatus) => {
    if (callStatus === 'no-answer' || callStatus === 'failed' || callStatus === 'busy') {
      return <PhoneMissed className="h-5 w-5 text-red-500" />;
    }
    return dir === 'inbound' ? (
      <PhoneIncoming className="h-5 w-5 text-blue-500" />
    ) : (
      <PhoneOutgoing className="h-5 w-5 text-green-500" />
    );
  };

  const getSentimentIcon = (sentiment: number | null) => {
    if (sentiment === null) return <Meh className="h-5 w-5 text-gray-400" />;
    if (sentiment >= 0.7) return <Smile className="h-5 w-5 text-green-500" />;
    if (sentiment >= 0.4) return <Meh className="h-5 w-5 text-amber-500" />;
    return <Frown className="h-5 w-5 text-red-500" />;
  };

  const handleCopyTranscript = () => {
    if (!callDetail?.transcript) return;
    const text = callDetail.transcript
      .map((t) => `${t.speaker}: ${t.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !callDetail) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-semibold">Call not found</h2>
        <p className="text-muted-foreground">The call you're looking for doesn't exist or was deleted.</p>
        <Button onClick={() => router.push('/calls')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Calls
        </Button>
      </div>
    );
  }

  const { call, transcript, contact, deal, events } = callDetail;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/calls')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          {getDirectionIcon(call.direction, call.status)}
          <div>
            <h1 className="text-2xl font-bold">
              {call.direction === 'inbound' ? call.from_number : call.to_number}
            </h1>
            <p className="text-muted-foreground">
              {call.direction === 'inbound' ? 'Inbound call' : 'Outbound call'} •{' '}
              {format(new Date(call.created_at), 'MMM d, yyyy h:mm a')}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => reanalyze.mutate(call.id)}
            disabled={reanalyze.isPending}
          >
            {reanalyze.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Reanalyze
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Transcript & Summary */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Call Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {call.summary ? (
                <p className="text-sm leading-relaxed">{call.summary}</p>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  No summary available. Click "Reanalyze" to generate one.
                </p>
              )}

              {/* Action Items */}
              {call.action_items && call.action_items.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Action Items</h4>
                  <ul className="space-y-1">
                    {call.action_items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Extracted Data */}
              {call.extracted && Object.keys(call.extracted).length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Extracted Information</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {call.extracted.name && (
                      <div>
                        <span className="text-muted-foreground">Name:</span>{' '}
                        <span className="font-medium">{call.extracted.name}</span>
                      </div>
                    )}
                    {call.extracted.intent && (
                      <div>
                        <span className="text-muted-foreground">Intent:</span>{' '}
                        <span className="font-medium">{call.extracted.intent}</span>
                      </div>
                    )}
                    {call.extracted.next_step && (
                      <div>
                        <span className="text-muted-foreground">Next Step:</span>{' '}
                        <span className="font-medium">{call.extracted.next_step}</span>
                      </div>
                    )}
                    {call.extracted.callback_time && (
                      <div>
                        <span className="text-muted-foreground">Callback:</span>{' '}
                        <span className="font-medium">{call.extracted.callback_time}</span>
                      </div>
                    )}
                    {call.extracted.budget && (
                      <div>
                        <span className="text-muted-foreground">Budget:</span>{' '}
                        <span className="font-medium">{call.extracted.budget}</span>
                      </div>
                    )}
                    {call.extracted.email && (
                      <div>
                        <span className="text-muted-foreground">Email:</span>{' '}
                        <span className="font-medium">{call.extracted.email}</span>
                      </div>
                    )}
                  </div>
                  {call.extracted.objections && call.extracted.objections.length > 0 && (
                    <div className="mt-2">
                      <span className="text-muted-foreground text-sm">Objections:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {call.extracted.objections.map((obj, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {obj}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recording Player */}
          {call.recording_url && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Recording
                </CardTitle>
              </CardHeader>
              <CardContent className="py-3">
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={togglePlayback}
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <audio
                    ref={audioRef}
                    src={call.recording_url}
                    onEnded={() => setIsPlaying(false)}
                    className="flex-1"
                    controls
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                  >
                    <a href={call.recording_url} download>
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Transcript */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Transcript
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyTranscript}
                disabled={!transcript || transcript.length === 0}
              >
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </CardHeader>
            <CardContent>
              {transcript && transcript.length > 0 ? (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    {transcript.map((entry, i) => (
                      <div
                        key={i}
                        className={cn(
                          'flex gap-3',
                          entry.speaker === 'Agent' ? 'flex-row-reverse' : ''
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            entry.speaker === 'Agent'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          )}
                        >
                          {entry.speaker === 'Agent' ? (
                            <Bot className="h-4 w-4" />
                          ) : (
                            <User className="h-4 w-4" />
                          )}
                        </div>
                        <div
                          className={cn(
                            'flex flex-col max-w-[80%]',
                            entry.speaker === 'Agent' ? 'items-end' : 'items-start'
                          )}
                        >
                          <div
                            className={cn(
                              'rounded-lg px-4 py-2',
                              entry.speaker === 'Agent'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            )}
                          >
                            <p className="text-sm">{entry.text}</p>
                          </div>
                          <span className="text-xs text-muted-foreground mt-1">
                            {format(new Date(entry.ts), 'h:mm:ss a')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-muted-foreground text-sm italic text-center py-8">
                  No transcript available for this call.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Tool Calls */}
          {events && events.filter((e) => e.type === 'tool_call').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Tool Calls
                </CardTitle>
                <CardDescription>
                  Actions the AI agent took during the call
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {events
                    .filter((e) => e.type === 'tool_call')
                    .map((event, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                      >
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="font-medium text-sm">
                            {(event.payload as any)?.name || 'Unknown tool'}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(event.ts), 'h:mm:ss a')}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - Call Info & Related Entities */}
        <div className="flex flex-col gap-6">
          {/* Call Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Call Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Status</span>
                <Badge variant="outline" className={cn('capitalize', getStatusColor(call.status))}>
                  {call.status.replace(/-/g, ' ')}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Outcome</span>
                {call.outcome ? (
                  <Badge variant="outline" className={cn(getOutcomeColor(call.outcome))}>
                    {formatOutcome(call.outcome)}
                  </Badge>
                ) : (
                  <span className="text-sm">-</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Sentiment</span>
                <div className="flex items-center gap-2">
                  {getSentimentIcon(call.sentiment)}
                  <span className="text-sm">
                    {call.sentiment !== null ? `${Math.round(call.sentiment * 100)}%` : '-'}
                  </span>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Duration</span>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{formatDuration(call.duration_sec)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Agent Profile</span>
                <Badge variant="secondary" className="capitalize">
                  {call.agent_profile}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">From</span>
                <span className="text-sm font-mono">{call.from_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">To</span>
                <span className="text-sm font-mono">{call.to_number}</span>
              </div>
            </CardContent>
          </Card>

          {/* Contact Card */}
          {contact && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <User className="h-4 w-4" />
                  Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="font-medium hover:underline"
                  >
                    {contact.name}
                  </Link>
                  <p className="text-xs text-muted-foreground capitalize">{contact.type}</p>
                </div>
                {contact.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.phone}</span>
                  </div>
                )}
                {contact.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{contact.email}</span>
                  </div>
                )}
                {contact.company && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.company}</span>
                  </div>
                )}
                {contact.tags && contact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Deal Card */}
          {deal && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="h-4 w-4" />
                  Deal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Link
                    href={`/deals/${deal.id}`}
                    className="font-medium hover:underline"
                  >
                    {deal.address}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {deal.city}, {deal.state} {deal.zip}
                  </p>
                </div>
                {deal.propertyType && (
                  <div className="flex items-center gap-2 text-sm">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span>{deal.propertyType}</span>
                  </div>
                )}
                <div className="flex items-center gap-4 text-sm">
                  {deal.bedroomCount && (
                    <div className="flex items-center gap-1">
                      <BedDouble className="h-4 w-4 text-muted-foreground" />
                      <span>{deal.bedroomCount}</span>
                    </div>
                  )}
                  {deal.bathroomCount && (
                    <div className="flex items-center gap-1">
                      <Bath className="h-4 w-4 text-muted-foreground" />
                      <span>{deal.bathroomCount}</span>
                    </div>
                  )}
                  {deal.livingSpaceSqFt && (
                    <div className="flex items-center gap-1">
                      <Square className="h-4 w-4 text-muted-foreground" />
                      <span>{deal.livingSpaceSqFt.toLocaleString()} sqft</span>
                    </div>
                  )}
                </div>
                {(deal.reservePrice || deal.buyItNowPrice) && (
                  <div className="space-y-1">
                    {deal.reservePrice && (
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span>Reserve: ${deal.reservePrice.toLocaleString()}</span>
                      </div>
                    )}
                    {deal.buyItNowPrice && (
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="h-4 w-4 text-green-500" />
                        <span>Buy Now: ${deal.buyItNowPrice.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
                {deal.status && (
                  <Badge variant="outline" className="capitalize">
                    {deal.status}
                  </Badge>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
