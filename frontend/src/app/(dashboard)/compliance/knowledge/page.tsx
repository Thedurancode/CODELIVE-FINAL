'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  MoreHorizontal,
  BookOpen,
  AlertCircle,
  RefreshCw,
  FileText,
  Download,
  ChevronDown,
  ChevronRight,
  Globe,
  MapPin,
  ExternalLink,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import {
  useKnowledgeEntries,
  useCreateKnowledgeEntry,
  useUpdateKnowledgeEntry,
  useDeleteKnowledgeEntry,
  useToggleKnowledgeEntry,
  useSeedDefaultKnowledge,
  KnowledgeEntry,
  CreateKnowledgePayload,
  KNOWLEDGE_TYPES,
  US_STATES,
  KnowledgeType,
} from '@/hooks/use-compliance-knowledge';
import { toast } from 'sonner';

const emptyEntry: CreateKnowledgePayload = {
  state: 'ALL',
  type: 'note',
  title: '',
  content: '',
  summary: '',
  category: '',
  tags: [],
  sourceUrl: '',
  sourceName: '',
  priority: 50,
  enabled: true,
};

const TYPE_COLORS: Record<string, string> = {
  law: 'bg-red-500',
  regulation: 'bg-orange-500',
  legal_requirement: 'bg-amber-500',
  form: 'bg-yellow-500',
  license_info: 'bg-lime-500',
  fee_structure: 'bg-green-500',
  timeline: 'bg-emerald-500',
  disclosure: 'bg-teal-500',
  restriction: 'bg-cyan-500',
  penalty: 'bg-sky-500',
  case_law: 'bg-accent-500',
  best_practice: 'bg-indigo-500',
  contact: 'bg-violet-500',
  link: 'bg-purple-500',
  note: 'bg-zinc-500',
};

export default function KnowledgeBasePage() {
  const [search, setSearch] = useState('');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [formData, setFormData] = useState<CreateKnowledgePayload>(emptyEntry);
  const [tagsInput, setTagsInput] = useState('');
  const [mounted, setMounted] = useState(false);
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set(['ALL']));

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: entries, isLoading, error, refetch } = useKnowledgeEntries(
    selectedState !== 'all' ? selectedState : undefined,
    selectedType !== 'all' ? selectedType : undefined
  );
  const createEntry = useCreateKnowledgeEntry();
  const updateEntry = useUpdateKnowledgeEntry();
  const deleteEntry = useDeleteKnowledgeEntry();
  const toggleEntry = useToggleKnowledgeEntry();
  const seedKnowledge = useSeedDefaultKnowledge();

  const allEntries = Array.isArray(entries) ? entries : [];
  const filteredEntries = allEntries.filter(
    (entry) =>
      entry.title?.toLowerCase().includes(search.toLowerCase()) ||
      entry.content?.toLowerCase().includes(search.toLowerCase()) ||
      entry.summary?.toLowerCase().includes(search.toLowerCase()) ||
      entry.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  // Group entries by state
  const entriesByState = filteredEntries.reduce((acc, entry) => {
    const state = entry.state;
    if (!acc[state]) acc[state] = [];
    acc[state].push(entry);
    return acc;
  }, {} as Record<string, KnowledgeEntry[]>);

  // Sort states: ALL first, then alphabetically
  const sortedStates = Object.keys(entriesByState).sort((a, b) => {
    if (a === 'ALL') return -1;
    if (b === 'ALL') return 1;
    return a.localeCompare(b);
  });

  const toggleStateExpanded = (state: string) => {
    setExpandedStates((prev) => {
      const next = new Set(prev);
      if (next.has(state)) {
        next.delete(state);
      } else {
        next.add(state);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedStates(new Set(sortedStates));
  };

  const collapseAll = () => {
    setExpandedStates(new Set());
  };

  const getStateName = (code: string) => {
    if (code === 'ALL') return 'Universal (All States)';
    const state = US_STATES.find((s) => s.value === code);
    return state?.label || code;
  };

  const openAddDialog = () => {
    setEditingEntry(null);
    setFormData({ ...emptyEntry, state: selectedState !== 'all' ? selectedState : 'ALL' });
    setTagsInput('');
    setIsDialogOpen(true);
  };

  const openEditDialog = (entry: KnowledgeEntry) => {
    setEditingEntry(entry);
    setFormData({
      state: entry.state,
      type: entry.type,
      title: entry.title,
      content: entry.content,
      summary: entry.summary || '',
      category: entry.category || '',
      tags: entry.tags || [],
      sourceUrl: entry.sourceUrl || '',
      sourceName: entry.sourceName || '',
      priority: entry.priority,
      enabled: entry.enabled,
    });
    setTagsInput((entry.tags || []).join(', '));
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t);

      const payload = { ...formData, tags };

      if (editingEntry) {
        await updateEntry.mutateAsync({ id: editingEntry.id, data: payload });
        toast.success('Entry updated successfully');
      } else {
        await createEntry.mutateAsync(payload);
        toast.success('Entry created successfully');
      }
      setIsDialogOpen(false);
      setFormData(emptyEntry);
      setTagsInput('');
    } catch (err) {
      toast.error(`Failed to ${editingEntry ? 'update' : 'create'} entry`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    try {
      await deleteEntry.mutateAsync(id);
      toast.success('Entry deleted');
    } catch {
      toast.error('Failed to delete entry');
    }
  };

  const handleToggle = async (id: number, currentEnabled: boolean) => {
    try {
      await toggleEntry.mutateAsync({ id, enabled: !currentEnabled });
      toast.success(`Entry ${!currentEnabled ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to toggle entry');
    }
  };

  const handleSeedDefaults = async () => {
    if (!confirm('This will add default knowledge entries. Continue?')) return;
    try {
      await seedKnowledge.mutateAsync();
      toast.success('Default knowledge seeded successfully');
    } catch {
      toast.error('Failed to seed default knowledge');
    }
  };

  const getTypeBadge = (type: string) => {
    const t = KNOWLEDGE_TYPES.find((k) => k.value === type);
    return (
      <Badge className={`${TYPE_COLORS[type] || 'bg-zinc-500'} text-foreground text-xs`}>
        {t?.label || type}
      </Badge>
    );
  };

  if (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Knowledge Base</h1>
          <p className="text-muted-foreground mt-1">Manage state-specific compliance knowledge</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load knowledge</p>
            <p className="text-muted-foreground mb-4">{errorMessage}</p>
            <Button onClick={() => refetch()} variant="outline" className="border">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/compliance" className="text-muted-foreground hover:text-foreground text-sm">
              Compliance
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground text-sm">Knowledge Base</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-purple-500" />
            Knowledge Base
          </h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? 'Loading...' : `${allEntries.length} entries`}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="border text-foreground"
            onClick={() => refetch()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="border text-foreground"
            onClick={handleSeedDefaults}
            disabled={seedKnowledge.isPending}
          >
            <Download className="mr-2 h-4 w-4" />
            Seed Defaults
          </Button>
          {mounted && (
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Entry
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search knowledge..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border text-foreground"
          />
        </div>
        <Select value={selectedState} onValueChange={setSelectedState}>
          <SelectTrigger className="w-[180px] bg-card border text-foreground">
            <SelectValue placeholder="Filter by state" />
          </SelectTrigger>
          <SelectContent className="bg-secondary border">
            <SelectItem value="all">All States</SelectItem>
            {US_STATES.map((state) => (
              <SelectItem key={state.value} value={state.value}>
                {state.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-[180px] bg-card border text-foreground">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent className="bg-secondary border">
            <SelectItem value="all">All Types</SelectItem>
            {KNOWLEDGE_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sortedStates.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border text-muted-foreground hover:text-foreground"
              onClick={expandAll}
            >
              Expand All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border text-muted-foreground hover:text-foreground"
              onClick={collapseAll}
            >
              Collapse All
            </Button>
          </div>
        )}
      </div>

      {/* Knowledge Entries */}
      {isLoading ? (
        <Card className="bg-card border">
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filteredEntries.length === 0 ? (
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No entries found</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              {search
                ? 'Try adjusting your search terms'
                : 'Add your first knowledge entry or seed defaults'}
            </p>
            {!search && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="border"
                  onClick={handleSeedDefaults}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Seed Defaults
                </Button>
                <Button className="bg-purple-600 hover:bg-purple-700" onClick={openAddDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Entry
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedStates.map((stateCode) => {
            const stateEntries = entriesByState[stateCode] || [];
            const isExpanded = expandedStates.has(stateCode);

            return (
              <Card key={stateCode} className="bg-card border overflow-hidden">
                {/* State Header */}
                <button
                  onClick={() => toggleStateExpanded(stateCode)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    {stateCode === 'ALL' ? (
                      <Globe className="h-5 w-5 text-purple-500" />
                    ) : (
                      <MapPin className="h-5 w-5 text-emerald-500" />
                    )}
                    <div className="text-left">
                      <h3 className="text-foreground font-semibold">{getStateName(stateCode)}</h3>
                      <p className="text-xs text-muted-foreground">
                        {stateEntries.length} entr{stateEntries.length !== 1 ? 'ies' : 'y'}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border text-muted-foreground">
                    {stateCode}
                  </Badge>
                </button>

                {/* Expanded Entries */}
                {isExpanded && (
                  <div className="border-t border divide-y divide-border">
                    {stateEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-4 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              {getTypeBadge(entry.type)}
                              {entry.category && (
                                <span className="text-xs text-muted-foreground">{entry.category}</span>
                              )}
                            </div>
                            <h4 className="text-foreground font-medium mb-1">{entry.title}</h4>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {entry.summary || entry.content}
                            </p>
                            {entry.tags && entry.tags.length > 0 && (
                              <div className="flex items-center gap-2 mt-2">
                                <Tag className="h-3 w-3 text-muted-foreground" />
                                <div className="flex flex-wrap gap-1">
                                  {entry.tags.slice(0, 5).map((tag, i) => (
                                    <span
                                      key={i}
                                      className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                  {entry.tags.length > 5 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{entry.tags.length - 5} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            {entry.sourceUrl && (
                              <a
                                href={entry.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 mt-2"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {entry.sourceName || 'Source'}
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={entry.enabled}
                              onCheckedChange={() => handleToggle(entry.id, entry.enabled)}
                            />
                            {mounted && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="bg-card border"
                                >
                                  <DropdownMenuItem
                                    className="text-foreground focus:bg-secondary"
                                    onClick={() => openEditDialog(entry)}
                                  >
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-red-400 focus:bg-secondary"
                                    onClick={() => handleDelete(entry.id)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      {mounted && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="bg-card border max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingEntry ? 'Edit Knowledge Entry' : 'Add Knowledge Entry'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                {/* State */}
                <div className="space-y-2">
                  <Label className="text-foreground">State</Label>
                  <Select
                    value={formData.state}
                    onValueChange={(v) => setFormData({ ...formData, state: v })}
                  >
                    <SelectTrigger className="bg-secondary border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border">
                      {US_STATES.map((state) => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Type */}
                <div className="space-y-2">
                  <Label className="text-foreground">Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v) => setFormData({ ...formData, type: v as KnowledgeType })}
                  >
                    <SelectTrigger className="bg-secondary border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border max-h-60">
                      {KNOWLEDGE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div>
                            <span>{type.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              - {type.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label className="text-foreground">Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Texas Wholesaling Requirements"
                  className="bg-secondary border text-foreground"
                />
              </div>

              {/* Summary */}
              <div className="space-y-2">
                <Label className="text-foreground">Summary (optional)</Label>
                <Input
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                  placeholder="Brief one-line summary..."
                  className="bg-secondary border text-foreground"
                />
              </div>

              {/* Content */}
              <div className="space-y-2">
                <Label className="text-foreground">Content</Label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Full content (Markdown supported)..."
                  className="bg-secondary border text-foreground min-h-[150px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Category */}
                <div className="space-y-2">
                  <Label className="text-foreground">Category (optional)</Label>
                  <Input
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g., wholesaling, disclosure"
                    className="bg-secondary border text-foreground"
                  />
                </div>

                {/* Priority */}
                <div className="space-y-2">
                  <Label className="text-foreground">Priority (1-100)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({ ...formData, priority: parseInt(e.target.value) || 50 })
                    }
                    className="bg-secondary border text-foreground"
                  />
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label className="text-foreground">Tags (comma-separated)</Label>
                <Input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g., license, disclosure, contract"
                  className="bg-secondary border text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Source Name */}
                <div className="space-y-2">
                  <Label className="text-foreground">Source Name (optional)</Label>
                  <Input
                    value={formData.sourceName}
                    onChange={(e) => setFormData({ ...formData, sourceName: e.target.value })}
                    placeholder="e.g., Texas Real Estate Commission"
                    className="bg-secondary border text-foreground"
                  />
                </div>

                {/* Source URL */}
                <div className="space-y-2">
                  <Label className="text-foreground">Source URL (optional)</Label>
                  <Input
                    value={formData.sourceUrl}
                    onChange={(e) => setFormData({ ...formData, sourceUrl: e.target.value })}
                    placeholder="https://..."
                    className="bg-secondary border text-foreground"
                  />
                </div>
              </div>

              {/* Enabled */}
              <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
                <div>
                  <p className="text-foreground">Enabled</p>
                  <p className="text-xs text-muted-foreground">Entry will be included in AI context</p>
                </div>
                <Switch
                  checked={formData.enabled}
                  onCheckedChange={(v) => setFormData({ ...formData, enabled: v })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                className="border text-foreground"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                onClick={handleSubmit}
                disabled={
                  !formData.title ||
                  !formData.content ||
                  createEntry.isPending ||
                  updateEntry.isPending
                }
              >
                {editingEntry ? 'Update Entry' : 'Create Entry'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
