'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, AlertTriangle, CheckCircle2, ChevronRight, Lock, Unlock } from 'lucide-react';
import {
  usePropertyChecklist,
  getStatusIcon,
  getStatusColor,
  getStatusBadgeColor,
  getSigningStatusStyles,
  type ChecklistSection,
  type ChecklistItem,
  type PhaseStatus,
  type GateStatus,
} from '@/hooks/use-property-checklist';

interface PropertyChecklistDialogProps {
  propertyId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactItemClick?: (contactSpec: { category: string; role: string }) => void;
}

export function PropertyChecklistDialog({
  propertyId,
  open,
  onOpenChange,
  onContactItemClick,
}: PropertyChecklistDialogProps) {
  const [viewMode, setViewMode] = useState<'phases' | 'sections'>('phases');
  const { data: checklist, isLoading, error } = usePropertyChecklist(propertyId, open);

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading checklist...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load checklist: {error instanceof Error ? error.message : 'Unknown error'}
            </AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    );
  }

  if (!checklist) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b bg-gradient-to-br from-background to-accent/5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent mb-2">
                Property Compliance Checklist
              </DialogTitle>
              <DialogDescription className="text-base flex items-center gap-3">
                <span className="px-3 py-1 bg-accent-500/10 text-accent-500 rounded-full text-sm font-medium">
                  {checklist.state}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="px-3 py-1 bg-purple-500/10 text-purple-400 rounded-full text-sm font-medium">
                  Phase {checklist.currentPhase}
                </span>
              </DialogDescription>
            </div>
            <Badge
              className={`${getStatusBadgeColor(checklist.overallStatus)} text-sm px-4 py-1.5 font-semibold`}
            >
              {checklist.overallStatus.toUpperCase()}
            </Badge>
          </div>

          {/* Overall Progress */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-sm mb-2.5">
              <span className="font-semibold text-foreground">Overall Progress</span>
              <span className="text-lg font-bold bg-gradient-to-br from-accent-500 to-purple-500 bg-clip-text text-transparent">
                {checklist.overallProgress}%
              </span>
            </div>
            <Progress value={checklist.overallProgress} className="h-3 bg-secondary" />
          </div>
        </DialogHeader>

        {/* View Mode Tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'phases' | 'sections')} className="flex-1">
          <div className="border-b px-6 py-2 bg-muted/30">
            <TabsList className="grid w-full max-w-[400px] grid-cols-2">
              <TabsTrigger value="phases" className="flex items-center gap-2">
                <span>Phase Timeline</span>
              </TabsTrigger>
              <TabsTrigger value="sections" className="flex items-center gap-2">
                <span>Sections View</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="h-[calc(90vh-280px)]">
            {/* Blocking Issues Alert */}
            {checklist.blockingIssues.length > 0 && (
              <div className="p-6 pb-0">
                <Alert variant="destructive" className="border-red-500/50 bg-red-500/10 shadow-lg">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertDescription>
                    <div className="font-bold text-base mb-3">
                      {checklist.blockingIssues.length} Blocking Issue
                      {checklist.blockingIssues.length > 1 ? 's' : ''}
                    </div>
                    <ul className="space-y-2">
                      {checklist.blockingIssues.map((issue, idx) => (
                        <li key={idx} className="text-sm flex items-start gap-2">
                          <span className="text-red-500 font-bold mt-0.5">•</span>
                          <span className="flex-1">{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Phase Timeline View */}
            <TabsContent value="phases" className="mt-0 p-6">
              <PhaseTimeline
                phases={checklist.phases || []}
                gates={checklist.gates || []}
                currentPhase={checklist.currentPhase}
                nextSteps={checklist.nextSteps}
                onContactItemClick={onContactItemClick}
              />
            </TabsContent>

            {/* Sections View (Legacy) */}
            <TabsContent value="sections" className="mt-0 p-6 space-y-5">
              <ChecklistSectionComponent
                section={checklist.sections.llcSetup}
                title="LLC Setup"
                icon="🏢"
              />
              <ChecklistSectionComponent
                section={checklist.sections.contacts}
                title="Contacts"
                icon="👥"
                onContactItemClick={onContactItemClick}
              />
              <ChecklistSectionComponent
                section={checklist.sections.documents}
                title="Documents"
                icon="📄"
              />
              <ChecklistSectionComponent
                section={checklist.sections.agreements}
                title="Agreements"
                icon="📝"
              />
              <ChecklistSectionComponent
                section={checklist.sections.complianceRules}
                title="Compliance Rules"
                icon="⚖️"
              />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Phase Timeline Component
// ============================================================================

interface PhaseTimelineProps {
  phases: PhaseStatus[];
  gates: GateStatus[];
  currentPhase: number;
  nextSteps: string[];
  onContactItemClick?: (contactSpec: { category: string; role: string }) => void;
}

function PhaseTimeline({ phases, gates, currentPhase, nextSteps, onContactItemClick }: PhaseTimelineProps) {
  // Only current phase expanded by default
  const [expandedPhase, setExpandedPhase] = useState<number | null>(currentPhase);

  // Only show phases that have items or are current/past
  const relevantPhases = phases.filter(p =>
    p.items.length > 0 || p.phase <= currentPhase + 1
  );

  return (
    <div className="space-y-6">
      {/* Next Steps Card */}
      {nextSteps.length > 0 && (
        <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <h3 className="font-semibold text-sm">Next Steps</h3>
          </div>
          <div className="space-y-1 pl-4">
            {nextSteps.map((step, idx) => (
              <p key={idx} className="text-sm text-muted-foreground">{step}</p>
            ))}
          </div>
        </div>
      )}

      {/* Phase List */}
      <div className="relative">
        {/* Vertical Line */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-1">
          {relevantPhases.map((phase, idx) => {
            const gateAfter = gates.find(g => g.afterPhase === phase.phase);
            const isExpanded = expandedPhase === phase.phase;
            const isCurrent = phase.phase === currentPhase;
            const isComplete = phase.status === 'complete';
            const isBlocked = phase.status === 'blocked';

            return (
              <div key={phase.phase}>
                {/* Phase Row */}
                <button
                  onClick={() => setExpandedPhase(isExpanded ? null : phase.phase)}
                  className={`w-full flex items-center gap-4 p-3 rounded-lg transition-all relative ${
                    isCurrent
                      ? 'bg-blue-500/10'
                      : isExpanded
                      ? 'bg-accent/10'
                      : 'hover:bg-accent/5'
                  }`}
                >
                  {/* Status Dot */}
                  <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 shadow-sm ${
                    isComplete
                      ? 'bg-green-500 text-white'
                      : isCurrent
                      ? 'bg-blue-500 text-white ring-4 ring-blue-500/20'
                      : isBlocked
                      ? 'bg-red-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {isComplete ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <span>{phase.phase}</span>
                    )}
                  </div>

                  {/* Phase Info */}
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isCurrent ? 'text-blue-600' : ''}`}>
                        {phase.name}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500 text-white uppercase">
                          Current
                        </span>
                      )}
                      {isBlocked && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white uppercase">
                          Blocked
                        </span>
                      )}
                    </div>
                    {(isCurrent || isExpanded) && (
                      <p className="text-xs text-muted-foreground mt-0.5">{phase.description}</p>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {phase.items.length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              isComplete ? 'bg-green-500' :
                              isBlocked ? 'bg-red-500' :
                              isCurrent ? 'bg-blue-500' :
                              'bg-muted-foreground'
                            }`}
                            style={{ width: `${phase.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8">
                          {phase.progress}%
                        </span>
                      </div>
                    )}
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                      isExpanded ? 'rotate-90' : ''
                    }`} />
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="ml-14 mr-2 mt-1 mb-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
                    {phase.items.length > 0 ? (
                      phase.items.map((item) => (
                        <ChecklistItemCompact
                          key={item.id}
                          item={item}
                          onContactItemClick={
                            item.category === 'contact' ? onContactItemClick : undefined
                          }
                        />
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground py-2 text-center">
                        {isComplete ? '✓ All items complete' : 'No items in this phase'}
                      </p>
                    )}
                  </div>
                )}

                {/* Gate Indicator */}
                {gateAfter && gateAfter.status !== 'pending' && (
                  <div className="ml-14 my-2">
                    <div className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full ${
                      gateAfter.status === 'passed'
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-red-500/10 text-red-600'
                    }`}>
                      {gateAfter.status === 'passed' ? (
                        <Unlock className="w-3 h-3" />
                      ) : (
                        <Lock className="w-3 h-3" />
                      )}
                      <span className="font-medium">{gateAfter.name}</span>
                      {gateAfter.status === 'blocked' && (
                        <span className="opacity-70">
                          • {gateAfter.requirements.filter(r => !r.met).length} items needed
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Compact Checklist Item (for phase timeline)
// ============================================================================

interface ChecklistItemCompactProps {
  item: ChecklistItem;
  onContactItemClick?: (contactSpec: { category: string; role: string }) => void;
}

function ChecklistItemCompact({ item, onContactItemClick }: ChecklistItemCompactProps) {
  const isComplete = item.status === 'complete';
  const isMissing = item.status === 'missing';
  const isBlocking = item.blocking && isMissing;

  const category = item.metadata?.category || item.details?.category;
  const role = item.metadata?.role || item.details?.role;
  const contactName = item.metadata?.contactName;
  const isClickable = item.category === 'contact' && isMissing && onContactItemClick && category && role;

  const signingStatus = item.signingStatus;
  const signingStyles = signingStatus ? getSigningStatusStyles(signingStatus) : null;

  return (
    <div
      onClick={isClickable ? () => onContactItemClick({ category, role }) : undefined}
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
        isBlocking
          ? 'border-red-500/30 bg-red-500/5'
          : isComplete
          ? 'border-green-500/20 bg-green-500/5'
          : 'border-border bg-card/50 hover:bg-accent/5'
      } ${isClickable ? 'cursor-pointer hover:border-accent' : ''}`}
    >
      {/* Status Icon */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
        isComplete
          ? 'bg-green-500 text-white'
          : isBlocking
          ? 'bg-red-500 text-white'
          : 'bg-muted text-muted-foreground'
      }`}>
        {isComplete ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : isBlocking ? (
          <AlertTriangle className="w-3 h-3" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-current" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium truncate ${isComplete ? 'text-green-600' : ''}`}>
            {item.name}
          </span>
          {isBlocking && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white uppercase flex-shrink-0">
              Required
            </span>
          )}
          {signingStyles && item.category === 'agreement' && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${signingStyles.bg} ${signingStyles.text} flex-shrink-0`}>
              {signingStyles.label}
            </span>
          )}
        </div>
        {contactName && isComplete && (
          <p className="text-xs text-green-600 truncate">{contactName}</p>
        )}
      </div>

      {/* Action hint */}
      {isClickable && (
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      )}
    </div>
  );
}

// ============================================================================
// Section Component (Legacy View)
// ============================================================================

interface ChecklistSectionComponentProps {
  section: ChecklistSection;
  title: string;
  icon: string;
  onContactItemClick?: (contactSpec: { category: string; role: string }) => void;
}

function ChecklistSectionComponent({ section, title, icon, onContactItemClick }: ChecklistSectionComponentProps) {
  if (section.items.length === 0) {
    return null;
  }

  // Check if this is the Contacts section
  const isContactsSection = title === 'Contacts';

  return (
    <div className="border rounded-xl p-6 bg-card/50 backdrop-blur-sm shadow-sm">
      {/* Section Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl mt-1">{icon}</span>
          <div>
            <h3 className="font-bold text-xl text-foreground mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground">
              {section.completedCount} of {section.requiredCount} required items complete
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold bg-gradient-to-br from-accent-500 to-purple-500 bg-clip-text text-transparent">
            {section.progress}%
          </div>
        </div>
      </div>

      {/* Section Progress Bar */}
      <Progress value={section.progress} className="h-2 mb-5" />

      {/* Section Items */}
      <div className="space-y-3">
        {section.items.map((item) => (
          <ChecklistItemComponent
            key={item.id}
            item={item}
            isContactItem={isContactsSection}
            onContactItemClick={onContactItemClick}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Checklist Item Component
// ============================================================================

interface ChecklistItemComponentProps {
  item: ChecklistItem;
  isContactItem?: boolean;
  onContactItemClick?: (contactSpec: { category: string; role: string }) => void;
}

function ChecklistItemComponent({ item, isContactItem, onContactItemClick }: ChecklistItemComponentProps) {
  const statusIcon = getStatusIcon(item.status);
  const statusColor = getStatusColor(item.status);

  // Get category and role from metadata or details
  const category = item.metadata?.category || item.details?.category;
  const role = item.metadata?.role || item.details?.role;
  const contactName = item.metadata?.contactName;

  // Signing status for agreements
  const signingStatus = item.signingStatus;
  const signingStyles = signingStatus ? getSigningStatusStyles(signingStatus) : null;

  // Make contact items clickable if missing and callback is provided
  const isClickable = isContactItem && item.status === 'missing' && onContactItemClick && category && role;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isClickable && onContactItemClick) {
      onContactItemClick({
        category: category as string,
        role: role as string,
      });
    }
  };

  return (
    <div
      onClick={isClickable ? handleClick : undefined}
      className={`flex items-start gap-4 p-4 rounded-lg border transition-all ${
        item.blocking && item.status === 'missing'
          ? 'border-red-500/30 bg-red-500/5 shadow-sm'
          : item.status === 'complete'
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-border/50 bg-card hover:bg-accent/5'
      } ${isClickable ? 'cursor-pointer hover:shadow-md hover:scale-[1.01]' : ''}`}
    >
      {/* Status Icon */}
      <div className={`text-2xl ${statusColor} flex-shrink-0 mt-0.5`}>{statusIcon}</div>

      {/* Item Content */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex-1 space-y-1.5">
          {/* Title Row */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm text-foreground">{item.name}</h4>
            {item.required && (
              <Badge variant="outline" className="text-xs px-2 py-0 h-5">
                Required
              </Badge>
            )}
            {item.blocking && item.status === 'missing' && (
              <Badge variant="destructive" className="text-xs px-2 py-0 h-5 animate-pulse">
                BLOCKING
              </Badge>
            )}
            {/* Signing Status Badge */}
            {signingStyles && item.category === 'agreement' && (
              <Badge className={`text-xs px-2 py-0 h-5 ${signingStyles.bg} ${signingStyles.text}`}>
                {signingStyles.icon} {signingStyles.label}
              </Badge>
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>

          {/* Assigned Contact Name - Show prominently when complete */}
          {item.status === 'complete' && contactName && (
            <div className="mt-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30">
              <p className="text-xs text-green-600 font-medium mb-0.5">Assigned Contact</p>
              <p className="text-sm font-bold text-green-600">{contactName}</p>
            </div>
          )}

          {/* Clickable hint for contact items */}
          {isClickable && (
            <div className="flex items-center gap-1.5 text-xs text-accent-500 font-medium mt-1">
              <span>Click to assign contact</span>
              <ChevronRight className="h-3 w-3" />
            </div>
          )}

          {/* Completed Date */}
          {item.completedAt && (
            <div className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              <span>Completed {new Date(item.completedAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
