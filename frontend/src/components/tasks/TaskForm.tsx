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
import type { Task, TaskStatus, TaskPriority, TaskLinkType } from '@/types';

interface TaskFormProps {
  task?: Partial<Task>;
  onSubmit: (data: Partial<Task>) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  propertyId?: number;
  buyerId?: string;
  complianceCheckId?: number;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const LINK_TYPE_OPTIONS: { value: TaskLinkType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'deal', label: 'Deal' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'compliance', label: 'Compliance' },
];

export function TaskForm({
  task,
  onSubmit,
  onCancel,
  isSubmitting = false,
  propertyId,
  buyerId,
  complianceCheckId,
}: TaskFormProps) {
  const [formData, setFormData] = useState<Partial<Task>>({
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'pending',
    priority: task?.priority || 'normal',
    dueDate: task?.dueDate?.split('T')[0] || '',
    linkType: task?.linkType || 'none',
    propertyId: task?.propertyId || propertyId || null,
    buyerId: task?.buyerId || buyerId || null,
    complianceCheckId: task?.complianceCheckId || complianceCheckId || null,
    notes: task?.notes || '',
    tags: task?.tags || [],
  });

  const [tagInput, setTagInput] = useState('');

  // Set linkType based on provided entity IDs
  useEffect(() => {
    if (propertyId && !task?.linkType) {
      setFormData((prev) => ({ ...prev, linkType: 'deal', propertyId }));
    } else if (buyerId && !task?.linkType) {
      setFormData((prev) => ({ ...prev, linkType: 'buyer', buyerId }));
    } else if (complianceCheckId && !task?.linkType) {
      setFormData((prev) => ({ ...prev, linkType: 'compliance', complianceCheckId }));
    }
  }, [propertyId, buyerId, complianceCheckId, task?.linkType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim()) return;

    const submitData = {
      ...formData,
      dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
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
      tags: prev.tags?.filter((tag) => tag !== tagToRemove) || [],
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="title" className="text-foreground text-base font-medium">
          Title *
        </Label>
        <Input
          id="title"
          value={formData.title || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Enter task title..."
          className="bg-card border text-foreground mt-2 h-11 text-base"
          required
        />
      </div>

      <div>
        <Label htmlFor="description" className="text-foreground text-base font-medium">
          Description
        </Label>
        <Textarea
          id="description"
          value={formData.description || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Enter task description..."
          className="bg-card border text-foreground mt-2 min-h-[120px] text-base"
        />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <Label htmlFor="status" className="text-foreground text-base font-medium">
            Status
          </Label>
          <Select
            value={formData.status}
            onValueChange={(value: TaskStatus) =>
              setFormData((prev) => ({ ...prev, status: value }))
            }
          >
            <SelectTrigger className="bg-card border text-foreground mt-2 h-11 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-secondary border">
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-foreground text-base">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="priority" className="text-foreground text-base font-medium">
            Priority
          </Label>
          <Select
            value={formData.priority}
            onValueChange={(value: TaskPriority) =>
              setFormData((prev) => ({ ...prev, priority: value }))
            }
          >
            <SelectTrigger className="bg-card border text-foreground mt-2 h-11 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-secondary border">
              {PRIORITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-foreground text-base">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <Label htmlFor="dueDate" className="text-foreground text-base font-medium">
            Due Date
          </Label>
          <Input
            id="dueDate"
            type="date"
            value={formData.dueDate?.split('T')[0] || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
            className="bg-card border text-foreground mt-2 h-11 text-base"
          />
        </div>

        <div>
          <Label htmlFor="linkType" className="text-foreground text-base font-medium">
            Link To
          </Label>
          <Select
            value={formData.linkType}
            onValueChange={(value: TaskLinkType) =>
              setFormData((prev) => ({ ...prev, linkType: value }))
            }
          >
            <SelectTrigger className="bg-card border text-foreground mt-2 h-11 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-secondary border">
              {LINK_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-foreground text-base">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="notes" className="text-foreground text-base font-medium">
          Notes
        </Label>
        <Textarea
          id="notes"
          value={formData.notes || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="Additional notes..."
          className="bg-card border text-foreground mt-2 text-base"
        />
      </div>

      <div>
        <Label className="text-foreground text-base font-medium">Tags</Label>
        <div className="flex gap-3 mt-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add tag..."
            className="bg-card border text-foreground flex-1 h-11 text-base"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddTag}
            className="border text-foreground h-11 w-11"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        {formData.tags && formData.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {formData.tags.map((tag) => (
              <Badge
                key={tag}
                className="bg-accent-500/20 text-accent-400 flex items-center gap-1.5 text-sm px-3 py-1"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-red-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-4 pt-5">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1 border text-foreground h-12 text-base"
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 bg-accent-600 hover:bg-accent-700 text-white h-12 text-base"
          disabled={isSubmitting || !formData.title?.trim()}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : task?.id ? (
            'Update Task'
          ) : (
            'Create Task'
          )}
        </Button>
      </div>
    </form>
  );
}
