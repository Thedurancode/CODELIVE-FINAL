'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Bell,
  Clock,
  Calendar,
  MoreVertical,
  Check,
  Pause,
  X,
  Pencil,
  Trash2,
  AlertTriangle,
  Building2,
  User,
  FileText,
  ClipboardCheck,
  Repeat,
} from 'lucide-react';
import type { Reminder, ReminderStatus, ReminderPriority, ReminderLinkType } from '@/types';
import { formatDistanceToNow, format, isPast } from 'date-fns';

interface ReminderCardProps {
  reminder: Reminder;
  onAcknowledge: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onCancel: (id: string) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (id: string) => void;
}

const STATUS_COLORS: Record<ReminderStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  sent: 'bg-blue-500/20 text-blue-400',
  acknowledged: 'bg-green-500/20 text-green-400',
  snoozed: 'bg-purple-500/20 text-purple-400',
  cancelled: 'bg-zinc-500/20 text-zinc-400',
};

const PRIORITY_COLORS: Record<ReminderPriority, string> = {
  low: 'bg-zinc-500/20 text-zinc-400',
  normal: 'bg-blue-500/20 text-blue-400',
  high: 'bg-orange-500/20 text-orange-400',
  urgent: 'bg-red-500/20 text-red-400',
};

const LINK_TYPE_ICONS: Record<ReminderLinkType, React.ReactNode> = {
  deal: <Building2 className="h-3 w-3" />,
  task: <ClipboardCheck className="h-3 w-3" />,
  buyer: <User className="h-3 w-3" />,
  contract: <FileText className="h-3 w-3" />,
  compliance: <AlertTriangle className="h-3 w-3" />,
  general: <Bell className="h-3 w-3" />,
};

const SNOOZE_OPTIONS = [
  { label: '5 minutes', minutes: 5 },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: 'Tomorrow', minutes: 1440 },
];

export function ReminderCard({
  reminder,
  onAcknowledge,
  onSnooze,
  onCancel,
  onEdit,
  onDelete,
}: ReminderCardProps) {
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);

  const isOverdue = isPast(new Date(reminder.reminderTime)) && reminder.status === 'pending';
  const canAcknowledge = reminder.status === 'pending' || reminder.status === 'sent';
  const canSnooze = reminder.status === 'pending' || reminder.status === 'sent';
  const canCancel = reminder.status === 'pending' || reminder.status === 'snoozed';

  const formatReminderTime = () => {
    const date = new Date(reminder.reminderTime);
    if (isPast(date)) {
      return formatDistanceToNow(date, { addSuffix: true });
    }
    return format(date, 'MMM d, yyyy h:mm a');
  };

  return (
    <Card
      className={`bg-card border transition-colors ${
        isOverdue ? 'border-red-500/50' : 'hover:border-accent-500/50'
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className={`p-2 rounded-lg ${
              isOverdue
                ? 'bg-red-500/20 text-red-400'
                : reminder.status === 'acknowledged'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-accent-500/20 text-accent-400'
            }`}
          >
            {isOverdue ? (
              <AlertTriangle className="h-5 w-5" />
            ) : reminder.status === 'acknowledged' ? (
              <Check className="h-5 w-5" />
            ) : reminder.status === 'snoozed' ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Bell className="h-5 w-5" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="font-medium text-foreground truncate">{reminder.title}</h3>
                {reminder.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {reminder.description}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-secondary border">
                  <DropdownMenuItem onClick={() => onEdit(reminder)} className="text-foreground">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  {canAcknowledge && (
                    <DropdownMenuItem
                      onClick={() => onAcknowledge(reminder.id)}
                      className="text-green-400"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Acknowledge
                    </DropdownMenuItem>
                  )}
                  {canSnooze && (
                    <>
                      <DropdownMenuSeparator />
                      {SNOOZE_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option.minutes}
                          onClick={() => onSnooze(reminder.id, option.minutes)}
                          className="text-foreground"
                        >
                          <Pause className="mr-2 h-4 w-4" />
                          Snooze {option.label}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  {canCancel && (
                    <DropdownMenuItem
                      onClick={() => onCancel(reminder.id)}
                      className="text-orange-400"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onDelete(reminder.id)} className="text-red-400">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {/* Time */}
              <div
                className={`flex items-center gap-1 text-sm ${
                  isOverdue ? 'text-red-400' : 'text-muted-foreground'
                }`}
              >
                <Clock className="h-3 w-3" />
                <span>{formatReminderTime()}</span>
              </div>

              {/* Status Badge */}
              <Badge className={STATUS_COLORS[reminder.status]}>
                {reminder.status.charAt(0).toUpperCase() + reminder.status.slice(1)}
              </Badge>

              {/* Priority Badge */}
              <Badge className={PRIORITY_COLORS[reminder.priority]}>
                {reminder.priority.charAt(0).toUpperCase() + reminder.priority.slice(1)}
              </Badge>

              {/* Link Type Badge */}
              {reminder.linkType !== 'general' && (
                <Badge variant="outline" className="border text-foreground">
                  <span className="mr-1">{LINK_TYPE_ICONS[reminder.linkType]}</span>
                  {reminder.linkType.charAt(0).toUpperCase() + reminder.linkType.slice(1)}
                </Badge>
              )}

              {/* Recurrence Badge */}
              {reminder.recurrence && reminder.recurrence !== 'none' && (
                <Badge variant="outline" className="border text-foreground">
                  <Repeat className="h-3 w-3 mr-1" />
                  {reminder.recurrence.charAt(0).toUpperCase() + reminder.recurrence.slice(1)}
                </Badge>
              )}

              {/* Snoozed Badge */}
              {reminder.status === 'snoozed' && reminder.snoozedUntil && (
                <Badge className="bg-purple-500/20 text-purple-400">
                  <Pause className="h-3 w-3 mr-1" />
                  Until {format(new Date(reminder.snoozedUntil), 'h:mm a')}
                </Badge>
              )}
            </div>

            {/* Tags */}
            {reminder.tags && reminder.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {reminder.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="bg-secondary text-foreground text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Linked entity preview */}
            {reminder.property && (
              <div className="mt-2 p-2 rounded bg-secondary/50 text-sm">
                <span className="text-muted-foreground">Deal:</span>{' '}
                <span className="text-foreground">
                  {reminder.property.address
                    ? `${reminder.property.address.houseNumber} ${reminder.property.address.street}`
                    : `Property #${reminder.property.id}`}
                  {reminder.property.city && `, ${reminder.property.city}`}
                </span>
              </div>
            )}
            {reminder.task && (
              <div className="mt-2 p-2 rounded bg-secondary/50 text-sm">
                <span className="text-muted-foreground">Task:</span>{' '}
                <span className="text-foreground">{reminder.task.title}</span>
              </div>
            )}
            {reminder.buyer && (
              <div className="mt-2 p-2 rounded bg-secondary/50 text-sm">
                <span className="text-muted-foreground">Buyer:</span>{' '}
                <span className="text-foreground">{reminder.buyer.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions for pending reminders */}
        {canAcknowledge && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border text-green-400 hover:bg-green-500/10"
              onClick={() => onAcknowledge(reminder.id)}
            >
              <Check className="mr-2 h-4 w-4" />
              Acknowledge
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border text-purple-400 hover:bg-purple-500/10"
              onClick={() => onSnooze(reminder.id, 15)}
            >
              <Pause className="mr-2 h-4 w-4" />
              Snooze 15m
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
