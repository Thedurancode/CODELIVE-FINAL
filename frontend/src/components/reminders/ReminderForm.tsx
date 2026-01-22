'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Loader2 } from 'lucide-react';
import type { Reminder, ReminderPriority, ReminderLinkType, ReminderRecurrence } from '@/types';

interface ReminderFormProps {
  reminder?: Partial<Reminder>;
  onSubmit: (data: Partial<Reminder>) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  propertyId?: number;
  taskId?: string;
  buyerId?: string;
}

const PRIORITY_OPTIONS: { value: ReminderPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const LINK_TYPE_OPTIONS: { value: ReminderLinkType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'deal', label: 'Deal' },
  { value: 'task', label: 'Task' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'contract', label: 'Contract' },
  { value: 'compliance', label: 'Compliance' },
];

const RECURRENCE_OPTIONS: { value: ReminderRecurrence; label: string }[] = [
  { value: 'none', label: 'No Repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export function ReminderForm({
  reminder,
  onSubmit,
  onCancel,
  isSubmitting = false,
  propertyId,
  taskId,
  buyerId,
}: ReminderFormProps) {
  // Format date for datetime-local input
  const formatDateForInput = (date: string | undefined) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState<Partial<Reminder>>({
    title: reminder?.title || '',
    description: reminder?.description || '',
    reminderTime: formatDateForInput(reminder?.reminderTime) || '',
    recurrence: reminder?.recurrence || 'none',
    priority: reminder?.priority || 'normal',
    linkType: reminder?.linkType || 'general',
    propertyId: reminder?.propertyId || propertyId || null,
    taskId: reminder?.taskId || taskId || null,
    buyerId: reminder?.buyerId || buyerId || null,
    notes: reminder?.notes || '',
    tags: reminder?.tags || [],
  });

  const [tagInput, setTagInput] = useState('');

  // Set linkType based on provided entity IDs
  useEffect(() => {
    if (propertyId && !reminder?.linkType) {
      setFormData((prev) => ({ ...prev, linkType: 'deal', propertyId }));
    } else if (taskId && !reminder?.linkType) {
      setFormData((prev) => ({ ...prev, linkType: 'task', taskId }));
    } else if (buyerId && !reminder?.linkType) {
      setFormData((prev) => ({ ...prev, linkType: 'buyer', buyerId }));
    }
  }, [propertyId, taskId, buyerId, reminder?.linkType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim() || !formData.reminderTime) return;

    const submitData = {
      ...formData,
      reminderTime: new Date(formData.reminderTime as string).toISOString(),
    };

    await onSubmit(submitData);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()],
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((t) => t !== tagToRemove),
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title" className="text-foreground">
          Title <span className="text-red-500">*</span>
        </Label>
        <Input
          id="title"
          value={formData.title || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Enter reminder title"
          className="bg-card border text-foreground"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description" className="text-foreground">
          Description
        </Label>
        <Textarea
          id="description"
          value={formData.description || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Add a description (optional)"
          className="bg-card border text-foreground resize-none"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="reminderTime" className="text-foreground">
            Date & Time <span className="text-red-500">*</span>
          </Label>
          <Input
            id="reminderTime"
            type="datetime-local"
            value={formData.reminderTime || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, reminderTime: e.target.value }))}
            className="bg-card border text-foreground"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="recurrence" className="text-foreground">
            Repeat
          </Label>
          <Select
            value={formData.recurrence}
            onValueChange={(v) =>
              setFormData((prev) => ({ ...prev, recurrence: v as ReminderRecurrence }))
            }
          >
            <SelectTrigger className="bg-card border text-foreground">
              <SelectValue placeholder="Select recurrence" />
            </SelectTrigger>
            <SelectContent className="bg-secondary border">
              {RECURRENCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-foreground">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="priority" className="text-foreground">
            Priority
          </Label>
          <Select
            value={formData.priority}
            onValueChange={(v) =>
              setFormData((prev) => ({ ...prev, priority: v as ReminderPriority }))
            }
          >
            <SelectTrigger className="bg-card border text-foreground">
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent className="bg-secondary border">
              {PRIORITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-foreground">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linkType" className="text-foreground">
            Link To
          </Label>
          <Select
            value={formData.linkType}
            onValueChange={(v) =>
              setFormData((prev) => ({ ...prev, linkType: v as ReminderLinkType }))
            }
          >
            <SelectTrigger className="bg-card border text-foreground">
              <SelectValue placeholder="Select link type" />
            </SelectTrigger>
            <SelectContent className="bg-secondary border">
              {LINK_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-foreground">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes" className="text-foreground">
          Notes
        </Label>
        <Textarea
          id="notes"
          value={formData.notes || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="Additional notes (optional)"
          className="bg-card border text-foreground resize-none"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-foreground">Tags</Label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add a tag"
            className="bg-card border text-foreground flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTag();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddTag}
            className="border"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {formData.tags && formData.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {formData.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="bg-secondary text-foreground cursor-pointer hover:bg-red-500/20"
                onClick={() => handleRemoveTag(tag)}
              >
                {tag}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="border">
          Cancel
        </Button>
        <Button
          type="submit"
          className="bg-accent-600 hover:bg-accent-700 text-white"
          disabled={isSubmitting || !formData.title?.trim() || !formData.reminderTime}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : reminder?.id ? (
            'Update Reminder'
          ) : (
            'Create Reminder'
          )}
        </Button>
      </div>
    </form>
  );
}
