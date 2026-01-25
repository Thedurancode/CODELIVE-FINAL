'use client';

import { formatDistanceToNow, format } from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  ActivityFeedEntry,
  EVENT_TYPE_COLORS,
  RESOURCE_TYPE_COLORS,
  RESOURCE_TYPE_LABELS,
  IMPORTANCE_COLORS,
  ActivityResourceType,
} from '@/hooks/use-activity-feed';
import {
  Building2,
  Users,
  CheckSquare,
  Shield,
  FileText,
  MessageCircle,
  DollarSign,
  ArrowRight,
  Settings,
  Plus,
  Edit,
  Trash2,
  Eye,
  Heart,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  UserPlus,
  User,
  Phone,
  UserCheck,
  AlertCircle,
  Upload,
  FileCheck,
  UserMinus,
  ShieldCheck,
  ShieldX,
  ExternalLink,
} from 'lucide-react';

// Icon mapping for event types
const EVENT_ICONS: Record<string, React.ElementType> = {
  deal_created: Plus,
  deal_updated: Edit,
  deal_deleted: Trash2,
  deal_viewed: Eye,
  deal_liked: Heart,
  deal_passed: X,
  offer_made: DollarSign,
  offer_updated: Edit,
  offer_accepted: CheckCircle2,
  offer_rejected: XCircle,
  offer_expired: Clock,
  buyer_created: UserPlus,
  buyer_updated: User,
  buyer_contacted: Phone,
  task_created: CheckSquare,
  task_assigned: UserCheck,
  task_completed: CheckCircle2,
  task_overdue: AlertCircle,
  compliance_check_passed: ShieldCheck,
  compliance_check_failed: ShieldX,
  compliance_issue_resolved: Shield,
  document_uploaded: Upload,
  document_signed: FileCheck,
  message_sent: MessageCircle,
  team_member_added: UserPlus,
  team_member_removed: UserMinus,
  pipeline_stage_changed: ArrowRight,
  system_event: Settings,
};

// Resource type icons
const RESOURCE_ICONS: Record<ActivityResourceType, React.ElementType> = {
  deal: Building2,
  buyer: Users,
  task: CheckSquare,
  compliance: Shield,
  document: FileText,
  message: MessageCircle,
  team: Users,
  offer: DollarSign,
  pipeline: ArrowRight,
  system: Settings,
};

interface ActivityItemProps {
  activity: ActivityFeedEntry;
  isRead?: boolean;
  onMarkAsRead?: (id: string) => void;
  showResourceType?: boolean;
  isLast?: boolean;
}

export function ActivityItem({
  activity,
  isRead = false,
  onMarkAsRead,
  showResourceType = true,
  isLast = false,
}: ActivityItemProps) {
  const EventIcon = EVENT_ICONS[activity.eventType] || Settings;
  const ResourceIcon = RESOURCE_ICONS[activity.resource.type] || Settings;

  const timeAgo = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true });
  const fullDate = format(new Date(activity.timestamp), 'PPpp');

  const eventColor = EVENT_TYPE_COLORS[activity.eventType] || 'text-zinc-400 bg-zinc-500/10 border-zinc-500/40';
  const resourceColor = RESOURCE_TYPE_COLORS[activity.resource.type] || 'text-zinc-400 bg-zinc-500/10 border-zinc-500/40';
  const importanceColor = IMPORTANCE_COLORS[activity.importance];

  const handleClick = () => {
    if (!isRead && onMarkAsRead) {
      onMarkAsRead(activity.id);
    }
  };

  return (
    <div
      className={cn(
        'group flex gap-3 transition-colors',
        !isRead && 'relative'
      )}
      onClick={handleClick}
    >
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full border-2 border-background',
            eventColor
          )}
        >
          <EventIcon className="h-4 w-4" />
        </div>
        {!isLast && (
          <div className="w-0.5 flex-1 bg-border/50 mt-1" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        {/* Unread indicator */}
        {!isRead && (
          <div className="absolute -left-1 top-3 w-2 h-2 rounded-full bg-primary animate-pulse" />
        )}

        <div className="p-3 rounded-lg bg-background/50 border border-border/50 hover:bg-background/80 hover:border-border transition-all">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Summary */}
              <p className="text-sm text-foreground font-medium line-clamp-2 group-hover:text-primary transition-colors">
                {activity.summary}
              </p>

              {/* Metadata row */}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[11px]">
                {/* Resource type badge */}
                {showResourceType && (
                  <Badge
                    variant="outline"
                    className={cn('text-[10px] px-1.5 py-0 border-0', resourceColor)}
                  >
                    <ResourceIcon className="h-3 w-3 mr-1" />
                    {RESOURCE_TYPE_LABELS[activity.resource.type]}
                  </Badge>
                )}

                {/* Actor */}
                <div className="flex items-center gap-1">
                  <div className="h-3.5 w-3.5 rounded-full bg-secondary flex items-center justify-center">
                    <User className="h-2 w-2 text-muted-foreground" />
                  </div>
                  <span className="text-muted-foreground">{activity.actor.name}</span>
                </div>

                <span className="text-muted-foreground/50">·</span>

                {/* Timestamp */}
                <time className="text-muted-foreground" title={fullDate}>
                  {timeAgo}
                </time>

                {/* Importance badge */}
                {activity.importance !== 'normal' && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] px-1.5 py-0', importanceColor)}
                    >
                      {activity.importance}
                    </Badge>
                  </>
                )}
              </div>

              {/* Additional details preview */}
              {activity.details && Object.keys(activity.details).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-muted-foreground">
                  {activity.details.price && (
                    <span className="px-1.5 py-0.5 rounded bg-muted/50">
                      ${activity.details.price.toLocaleString()}
                    </span>
                  )}
                  {activity.details.status && (
                    <span className="px-1.5 py-0.5 rounded bg-muted/50">
                      {activity.details.status}
                    </span>
                  )}
                  {activity.details.assigneeName && (
                    <span className="px-1.5 py-0.5 rounded bg-muted/50">
                      → {activity.details.assigneeName}
                    </span>
                  )}
                </div>
              )}

              {/* Resource link */}
              {activity.resource.url && (
                <Link
                  href={activity.resource.url}
                  className="inline-flex items-center gap-1 mt-2 text-[11px] text-primary hover:underline transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>{activity.resource.name || `View ${activity.resource.type}`}</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ActivityItem;
