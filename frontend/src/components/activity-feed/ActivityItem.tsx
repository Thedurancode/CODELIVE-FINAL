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
}

export function ActivityItem({ activity, isRead = false, onMarkAsRead, showResourceType = true }: ActivityItemProps) {
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
        'group relative flex gap-4 p-4 transition-colors',
        'hover:bg-secondary/50',
        !isRead && 'bg-accent-500/5'
      )}
      onClick={handleClick}
    >
      {/* Unread indicator */}
      {!isRead && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent-500" />
      )}

      {/* Icon */}
      <div
        className={cn(
          'flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border',
          eventColor
        )}
      >
        <EventIcon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Summary */}
            <p className="text-sm text-foreground font-medium">
              {activity.summary}
            </p>

            {/* Actor and timestamp */}
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="font-medium">{activity.actor.name}</span>
              <span>-</span>
              <time title={fullDate}>{timeAgo}</time>
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {showResourceType && (
              <Badge
                variant="outline"
                className={cn('text-xs', resourceColor)}
              >
                <ResourceIcon className="h-3 w-3 mr-1" />
                {RESOURCE_TYPE_LABELS[activity.resource.type]}
              </Badge>
            )}
            {activity.importance !== 'normal' && (
              <Badge
                variant="outline"
                className={cn('text-xs', importanceColor)}
              >
                {activity.importance}
              </Badge>
            )}
          </div>
        </div>

        {/* Resource link */}
        {activity.resource.url && (
          <Link
            href={activity.resource.url}
            className="inline-flex items-center gap-1 mt-2 text-xs text-accent-400 hover:text-accent-300 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ResourceIcon className="h-3 w-3" />
            <span>{activity.resource.name || `View ${activity.resource.type}`}</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}

        {/* Additional details preview */}
        {activity.details && Object.keys(activity.details).length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            {activity.details.price && (
              <span className="mr-3">
                Price: ${activity.details.price.toLocaleString()}
              </span>
            )}
            {activity.details.status && (
              <span className="mr-3">
                Status: {activity.details.status}
              </span>
            )}
            {activity.details.assigneeName && (
              <span>
                Assigned to: {activity.details.assigneeName}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityItem;
