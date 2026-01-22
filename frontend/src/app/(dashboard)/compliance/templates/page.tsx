'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  MoreHorizontal,
  FileSignature,
  AlertCircle,
  RefreshCw,
  FileText,
  ChevronDown,
  ChevronRight,
  Globe,
  MapPin,
  ExternalLink,
  Link as LinkIcon,
  Check,
  Loader2,
  Grid3X3,
  List,
  X,
  Copy,
} from 'lucide-react';
import Link from 'next/link';
import { DocuSealEmbed } from '@/components/compliance/DocuSealEmbed';
import {
  useDocumentTemplates,
  useDocuSealTemplates,
  useCreateDocumentTemplate,
  useUpdateDocumentTemplate,
  useDeleteDocumentTemplate,
  useToggleDocumentTemplate,
  useCreateMultipleDocumentTemplates,
  DocumentTemplate,
  CreateTemplatePayload,
  DOCUMENT_CATEGORIES,
  REQUIRED_FOR_OPTIONS,
  US_STATES,
  DocumentCategory,
} from '@/hooks/use-document-templates';
import { toast } from 'sonner';

const emptyTemplate: CreateTemplatePayload = {
  state: 'ALL',
  category: 'purchase_contract',
  name: '',
  description: '',
  docuSealTemplateId: 0,
  requiredFor: ['all'],
  priority: 50,
  enabled: true,
};

const CATEGORY_COLORS: Record<string, string> = {
  purchase_contract: 'bg-accent-500',
  assignment_addendum: 'bg-indigo-500',
  seller_disclosure: 'bg-purple-500',
  lead_paint: 'bg-amber-500',
  hoa_disclosure: 'bg-teal-500',
  inspection_notice: 'bg-cyan-500',
  financing_addendum: 'bg-emerald-500',
  closing_instructions: 'bg-green-500',
  proof_of_funds: 'bg-lime-500',
  offer_letter: 'bg-orange-500',
  jv_agreement: 'bg-rose-500',
  other: 'bg-zinc-500',
};

// State codes for quick selection regions
const STATE_REGIONS: Record<string, string[]> = {
  'Northeast': ['CT', 'DE', 'MA', 'MD', 'ME', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'],
  'Southeast': ['AL', 'FL', 'GA', 'KY', 'NC', 'SC', 'TN', 'VA', 'WV'],
  'Midwest': ['IA', 'IL', 'IN', 'KS', 'MI', 'MN', 'MO', 'ND', 'NE', 'OH', 'SD', 'WI'],
  'Southwest': ['AZ', 'NM', 'OK', 'TX'],
  'West': ['AK', 'CA', 'CO', 'HI', 'ID', 'MT', 'NV', 'OR', 'UT', 'WA', 'WY'],
};

// Bulk assignment document type
interface BulkAssignmentDoc {
  docuSealId: number;
  name: string;
  assignedStates: string[];
}

export default function DocumentTemplatesPage() {
  const [search, setSearch] = useState('');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [formData, setFormData] = useState<CreateTemplatePayload>(emptyTemplate);
  const [mounted, setMounted] = useState(false);
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set(['ALL']));

  // View mode: 'list' (original grouped view) or 'assignment' (document cards with state tags)
  const [viewMode, setViewMode] = useState<'list' | 'assignment'>('assignment');

  // Multi-state selection for new templates
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set(['ALL']));
  const [showStateSelector, setShowStateSelector] = useState(false);

  // DocuSeal preview modal
  const [previewTemplate, setPreviewTemplate] = useState<{ id: number; name: string; slug?: string } | null>(null);

  // Bulk assignment modal
  const [bulkAssignDoc, setBulkAssignDoc] = useState<BulkAssignmentDoc | null>(null);
  const [bulkAssignStates, setBulkAssignStates] = useState<Set<string>>(new Set());
  const [bulkAssignCategory, setBulkAssignCategory] = useState<DocumentCategory>('purchase_contract');

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: templates, isLoading, error, refetch } = useDocumentTemplates(
    selectedState !== 'all' ? selectedState : undefined,
    selectedCategory !== 'all' ? selectedCategory : undefined
  );
  const { data: docuSealTemplates, isLoading: loadingDocuSeal, error: docuSealError } = useDocuSealTemplates();
  const createTemplate = useCreateDocumentTemplate();
  const updateTemplate = useUpdateDocumentTemplate();
  const deleteTemplate = useDeleteDocumentTemplate();
  const toggleTemplate = useToggleDocumentTemplate();
  const createMultipleTemplates = useCreateMultipleDocumentTemplates();

  const allTemplates = Array.isArray(templates) ? templates : [];
  const filteredTemplates = allTemplates.filter(
    (template) =>
      template.name?.toLowerCase().includes(search.toLowerCase()) ||
      template.description?.toLowerCase().includes(search.toLowerCase()) ||
      template.docuSealTemplateName?.toLowerCase().includes(search.toLowerCase())
  );

  // Group templates by DocuSeal ID for assignment view
  const templatesByDocuSealId = useMemo(() => {
    const grouped: Record<number, { name: string; states: string[]; templates: DocumentTemplate[] }> = {};
    allTemplates.forEach((template) => {
      if (!grouped[template.docuSealTemplateId]) {
        grouped[template.docuSealTemplateId] = {
          name: template.docuSealTemplateName || template.name,
          states: [],
          templates: [],
        };
      }
      if (!grouped[template.docuSealTemplateId].states.includes(template.state)) {
        grouped[template.docuSealTemplateId].states.push(template.state);
      }
      grouped[template.docuSealTemplateId].templates.push(template);
    });
    return grouped;
  }, [allTemplates]);

  // Group templates by state
  const templatesByState = filteredTemplates.reduce((acc, template) => {
    const state = template.state;
    if (!acc[state]) acc[state] = [];
    acc[state].push(template);
    return acc;
  }, {} as Record<string, DocumentTemplate[]>);

  // Sort states: ALL first, then alphabetically
  const sortedStates = Object.keys(templatesByState).sort((a, b) => {
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
    setEditingTemplate(null);
    setFormData({ ...emptyTemplate, state: selectedState !== 'all' ? selectedState : 'ALL' });
    setSelectedStates(new Set([selectedState !== 'all' ? selectedState : 'ALL']));
    setShowStateSelector(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (template: DocumentTemplate) => {
    setEditingTemplate(template);
    setFormData({
      state: template.state,
      category: template.category,
      name: template.name,
      description: template.description || '',
      docuSealTemplateId: template.docuSealTemplateId,
      requiredFor: template.requiredFor || ['all'],
      priority: template.priority,
      enabled: template.enabled,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      // Find the DocuSeal template name
      const docuSealTemplate = docuSealTemplates?.find(t => t.id === formData.docuSealTemplateId);
      const dataWithTemplateName = {
        ...formData,
        docuSealTemplateName: docuSealTemplate?.name,
      };

      if (editingTemplate) {
        await updateTemplate.mutateAsync({ id: editingTemplate.id, data: dataWithTemplateName });
        toast.success('Template updated successfully');
      } else {
        // Create templates for all selected states
        const statesToCreate = Array.from(selectedStates);
        if (statesToCreate.length === 1) {
          await createTemplate.mutateAsync({ ...dataWithTemplateName, state: statesToCreate[0] });
          toast.success('Template created successfully');
        } else {
          const templatesToCreate = statesToCreate.map((state) => ({
            ...dataWithTemplateName,
            state,
          }));
          await createMultipleTemplates.mutateAsync(templatesToCreate);
          toast.success(`Created ${statesToCreate.length} templates successfully`);
        }
      }
      setIsDialogOpen(false);
      setFormData(emptyTemplate);
      setSelectedStates(new Set(['ALL']));
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.message || `Failed to ${editingTemplate ? 'update' : 'create'} template`;
      const errorDetails = err?.response?.data?.details;

      if (errorDetails?.errors) {
        // Show validation errors
        const fieldErrors = errorDetails.errors.map((e: any) => `${e.field}: ${e.message}`).join(', ');
        toast.error(`${errorMessage}: ${fieldErrors}`);
      } else if (errorDetails?.message) {
        toast.error(`${errorMessage}: ${errorDetails.message}`);
      } else {
        toast.error(errorMessage);
      }
      console.error('Template creation error:', err?.response?.data || err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await deleteTemplate.mutateAsync(id);
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const handleToggle = async (id: number, currentEnabled: boolean) => {
    try {
      await toggleTemplate.mutateAsync({ id, enabled: !currentEnabled });
      toast.success(`Template ${!currentEnabled ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to toggle template');
    }
  };

  const getCategoryBadge = (category: string) => {
    const cat = DOCUMENT_CATEGORIES.find((c) => c.value === category);
    return (
      <Badge className={`${CATEGORY_COLORS[category] || 'bg-zinc-500'} text-foreground text-xs`}>
        {cat?.label || category}
      </Badge>
    );
  };

  const handleRequiredForChange = (value: string, checked: boolean) => {
    const current = formData.requiredFor || [];
    if (checked) {
      setFormData({ ...formData, requiredFor: [...current, value] });
    } else {
      setFormData({ ...formData, requiredFor: current.filter((v) => v !== value) });
    }
  };

  // Open bulk assignment modal for a DocuSeal template
  const openBulkAssignModal = (docuSealId: number, docuSealName: string) => {
    const existingData = templatesByDocuSealId[docuSealId];
    const assignedStates = existingData?.states || [];
    setBulkAssignDoc({
      docuSealId,
      name: docuSealName,
      assignedStates,
    });
    setBulkAssignStates(new Set(assignedStates));
    setBulkAssignCategory('purchase_contract');
  };

  // Toggle a state in bulk assignment
  const toggleBulkAssignState = (stateCode: string) => {
    setBulkAssignStates((prev) => {
      const next = new Set(prev);
      if (next.has(stateCode)) {
        next.delete(stateCode);
      } else {
        next.add(stateCode);
      }
      return next;
    });
  };

  // Select all states in a region
  const selectRegion = (regionStates: string[]) => {
    setBulkAssignStates((prev) => {
      const next = new Set(prev);
      regionStates.forEach((s) => next.add(s));
      return next;
    });
  };

  // Clear all states in a region
  const clearRegion = (regionStates: string[]) => {
    setBulkAssignStates((prev) => {
      const next = new Set(prev);
      regionStates.forEach((s) => next.delete(s));
      return next;
    });
  };

  // Handle bulk assignment submission
  const handleBulkAssign = async () => {
    if (!bulkAssignDoc) return;

    const existingData = templatesByDocuSealId[bulkAssignDoc.docuSealId];
    const currentStates = new Set(existingData?.states || []);
    const newStates = bulkAssignStates;

    // Find states to add (in newStates but not in currentStates)
    const statesToAdd = Array.from(newStates).filter((s) => !currentStates.has(s));
    // Find states to remove (in currentStates but not in newStates)
    const statesToRemove = Array.from(currentStates).filter((s) => !newStates.has(s));

    const errors: string[] = [];
    let addedCount = 0;
    let removedCount = 0;

    try {
      // Create templates for new states
      if (statesToAdd.length > 0) {
        for (const state of statesToAdd) {
          try {
            await createTemplate.mutateAsync({
              state,
              category: bulkAssignCategory,
              name: bulkAssignDoc.name,
              docuSealTemplateId: bulkAssignDoc.docuSealId,
              requiredFor: ['all'],
              priority: 50,
              enabled: true,
            });
            addedCount++;
          } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Unknown error';
            errors.push(`Failed to add ${state}: ${msg}`);
            console.error(`Failed to add ${state}:`, err);
          }
        }
      }

      // Delete templates for removed states
      if (statesToRemove.length > 0 && existingData) {
        const templatesToDelete = existingData.templates.filter((t) =>
          statesToRemove.includes(t.state)
        );
        for (const t of templatesToDelete) {
          try {
            await deleteTemplate.mutateAsync(t.id);
            removedCount++;
          } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Unknown error';
            errors.push(`Failed to remove ${t.state}: ${msg}`);
            console.error(`Failed to remove ${t.state}:`, err);
          }
        }
      }

      // Show results
      if (errors.length > 0) {
        if (addedCount > 0 || removedCount > 0) {
          toast.warning(`Partially completed: Added ${addedCount}, removed ${removedCount}. ${errors.length} error(s).`, {
            description: errors.slice(0, 2).join('; '),
          });
        } else {
          toast.error('Failed to update state assignments', {
            description: errors[0],
          });
        }
      } else if (addedCount > 0 && removedCount > 0) {
        toast.success(`Added ${addedCount} state(s), removed ${removedCount} state(s)`);
      } else if (addedCount > 0) {
        toast.success(`Added to ${addedCount} state(s)`);
      } else if (removedCount > 0) {
        toast.success(`Removed from ${removedCount} state(s)`);
      } else {
        toast.info('No changes made');
      }

      setBulkAssignDoc(null);
      setBulkAssignStates(new Set());
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown error';
      toast.error('Failed to update state assignments', {
        description: msg,
      });
      console.error('Bulk assign error:', err);
    }
  };

  // Quick add to a single state from assignment view
  const handleQuickAddToState = async (docuSealId: number, docuSealName: string, stateCode: string) => {
    try {
      await createTemplate.mutateAsync({
        state: stateCode,
        category: 'purchase_contract',
        name: docuSealName,
        docuSealTemplateId: docuSealId,
        requiredFor: ['all'],
        priority: 50,
        enabled: true,
      });
      toast.success(`Added to ${stateCode}`);
    } catch (err) {
      toast.error('Failed to add to state');
    }
  };

  // Remove from a single state
  const handleRemoveFromState = async (docuSealId: number, stateCode: string) => {
    const existingData = templatesByDocuSealId[docuSealId];
    const templateToDelete = existingData?.templates.find((t) => t.state === stateCode);
    if (templateToDelete) {
      try {
        await deleteTemplate.mutateAsync(templateToDelete.id);
        toast.success(`Removed from ${stateCode}`);
      } catch (err) {
        toast.error('Failed to remove from state');
      }
    }
  };

  if (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Document Templates</h1>
          <p className="text-muted-foreground mt-1">Manage DocuSeal templates by state</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load templates</p>
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
            <span className="text-foreground text-sm">Document Templates</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <FileSignature className="h-8 w-8 text-emerald-500" />
            Document Templates
          </h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? 'Loading...' : `${allTemplates.length} templates configured`}
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
          {mounted && (
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Template
            </Button>
          )}
        </div>
      </div>

      {/* DocuSeal Connection Status */}
      <Card className="bg-card border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg ${docuSealError ? 'bg-red-500/20' : 'bg-emerald-500/20'} flex items-center justify-center`}>
                <LinkIcon className={`h-5 w-5 ${docuSealError ? 'text-red-400' : 'text-emerald-400'}`} />
              </div>
              <div>
                <h3 className="text-foreground font-medium">DocuSeal Connection</h3>
                <p className="text-sm text-muted-foreground">
                  {loadingDocuSeal
                    ? 'Connecting...'
                    : docuSealError
                    ? 'Not configured - Add your DocuSeal API key in settings'
                    : `${docuSealTemplates?.length || 0} templates available`}
                </p>
              </div>
            </div>
            {!docuSealError && docuSealTemplates && docuSealTemplates.length > 0 && (
              <Badge variant="outline" className="border-emerald-500 text-emerald-500">
                <Check className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
            {docuSealError && (
              <Badge variant="outline" className="border-red-500 text-red-500">
                <AlertCircle className="h-3 w-3 mr-1" />
                Not Connected
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View Mode Toggle & Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
          <Button
            variant={viewMode === 'assignment' ? 'default' : 'ghost'}
            size="sm"
            className={viewMode === 'assignment' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            onClick={() => setViewMode('assignment')}
          >
            <Grid3X3 className="h-4 w-4 mr-1" />
            Assignment
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            className={viewMode === 'list' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4 mr-1" />
            By State
          </Button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border text-foreground"
          />
        </div>
        {viewMode === 'list' && (
          <>
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
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[200px] bg-card border text-foreground">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent className="bg-secondary border">
                <SelectItem value="all">All Categories</SelectItem>
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
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
          </>
        )}
      </div>

      {/* Templates */}
      {isLoading ? (
        <Card className="bg-card border">
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : viewMode === 'assignment' ? (
        /* Assignment View - Document Cards with State Tags */
        <TooltipProvider>
          <div className="space-y-4">
            {/* DocuSeal Templates with State Assignments */}
            {Array.isArray(docuSealTemplates) && docuSealTemplates.length > 0 ? (
              <div className="grid gap-4">
                {docuSealTemplates
                  .filter((t) =>
                    !search ||
                    t.name.toLowerCase().includes(search.toLowerCase())
                  )
                  .map((template) => {
                    const assignedData = templatesByDocuSealId[template.id];
                    const assignedStates = assignedData?.states || [];
                    const hasAssignments = assignedStates.length > 0;

                    return (
                      <Card
                        key={template.id}
                        className={`bg-card border transition-colors ${
                          hasAssignments ? 'border-emerald-500/30' : ''
                        }`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={`h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                hasAssignments ? 'bg-emerald-500/20' : 'bg-secondary'
                              }`}>
                                <FileSignature className={`h-6 w-6 ${
                                  hasAssignments ? 'text-emerald-400' : 'text-muted-foreground'
                                }`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="text-foreground font-semibold truncate">
                                    {template.name}
                                  </h3>
                                  <Badge variant="outline" className="text-xs border text-muted-foreground flex-shrink-0">
                                    #{template.id}
                                  </Badge>
                                </div>
                                {template.folder_name && (
                                  <p className="text-xs text-muted-foreground mb-2">
                                    Folder: {template.folder_name}
                                  </p>
                                )}

                                {/* Assigned States Tags */}
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {assignedStates.length === 0 ? (
                                    <span className="text-xs text-muted-foreground italic">
                                      Not assigned to any states
                                    </span>
                                  ) : (
                                    <>
                                      {assignedStates.sort((a, b) => {
                                        if (a === 'ALL') return -1;
                                        if (b === 'ALL') return 1;
                                        return a.localeCompare(b);
                                      }).map((stateCode) => (
                                        <Tooltip key={stateCode}>
                                          <TooltipTrigger asChild>
                                            <button
                                              onClick={() => handleRemoveFromState(template.id, stateCode)}
                                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all group ${
                                                stateCode === 'ALL'
                                                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-red-500/20 hover:text-red-400'
                                                  : 'bg-accent-500/20 text-accent-400 hover:bg-red-500/20 hover:text-red-400'
                                              }`}
                                            >
                                              {stateCode === 'ALL' ? (
                                                <Globe className="h-3 w-3" />
                                              ) : (
                                                <MapPin className="h-3 w-3" />
                                              )}
                                              {stateCode}
                                              <X className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Click to remove from {stateCode}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      ))}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border text-foreground"
                                onClick={() => setPreviewTemplate({ id: template.id, name: template.name, slug: template.slug })}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => openBulkAssignModal(template.id, template.name)}
                              >
                                <MapPin className="h-4 w-4 mr-1" />
                                Assign States
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            ) : (
              <Card className="bg-card border">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No DocuSeal templates found</h3>
                  <p className="text-muted-foreground text-center max-w-sm">
                    {docuSealError
                      ? 'DocuSeal is not configured. Add your API key in settings.'
                      : 'No templates found in your DocuSeal account.'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TooltipProvider>
      ) : filteredTemplates.length === 0 ? (
        <div className="space-y-4">
          {/* Available DocuSeal Templates */}
          {Array.isArray(docuSealTemplates) && docuSealTemplates.length > 0 && !search && (
            <Card className="bg-card border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-foreground flex items-center gap-2">
                  <FileSignature className="h-5 w-5 text-emerald-500" />
                  Available DocuSeal Templates
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  These templates are available in your DocuSeal account. Click to add them to a state.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {docuSealTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border hover:border-emerald-500/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-foreground font-medium">{template.name}</p>
                          <p className="text-xs text-muted-foreground">
                            ID: #{template.id} {template.folder_name && `• ${template.folder_name}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border text-foreground hover:text-foreground"
                          onClick={() => setPreviewTemplate({ id: template.id, name: template.name, slug: template.slug })}
                        >
                          <ExternalLink className="mr-1 h-4 w-4" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => {
                            setFormData({
                              ...emptyTemplate,
                              docuSealTemplateId: template.id,
                              name: template.name,
                            });
                            setSelectedStates(new Set(['ALL']));
                            setShowStateSelector(false);
                            setIsDialogOpen(true);
                          }}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Add to State
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          <Card className="bg-card border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No templates configured</h3>
              <p className="text-muted-foreground text-center max-w-sm mb-4">
                {search
                  ? 'Try adjusting your search terms'
                  : 'Link your DocuSeal templates to states to define which documents are required for each location.'}
              </p>
              {!search && (
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={openAddDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Template
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedStates.map((stateCode) => {
            const stateTemplates = templatesByState[stateCode] || [];
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
                      <Globe className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <MapPin className="h-5 w-5 text-accent-500" />
                    )}
                    <div className="text-left">
                      <h3 className="text-foreground font-semibold">{getStateName(stateCode)}</h3>
                      <p className="text-xs text-muted-foreground">
                        {stateTemplates.length} template{stateTemplates.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border text-muted-foreground">
                    {stateCode}
                  </Badge>
                </button>

                {/* Expanded Templates Table */}
                {isExpanded && (
                  <div className="border-t border">
                    <Table>
                      <TableHeader>
                        <TableRow className="border hover:bg-secondary/50">
                          <TableHead className="text-muted-foreground">Template Name</TableHead>
                          <TableHead className="text-muted-foreground">Category</TableHead>
                          <TableHead className="text-muted-foreground">DocuSeal ID</TableHead>
                          <TableHead className="text-muted-foreground">Required For</TableHead>
                          <TableHead className="text-muted-foreground">Enabled</TableHead>
                          <TableHead className="text-muted-foreground w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stateTemplates.map((template) => (
                          <TableRow
                            key={template.id}
                            className="border hover:bg-secondary/50"
                          >
                            <TableCell>
                              <div>
                                <p className="text-foreground font-medium">{template.name}</p>
                                {template.description && (
                                  <p className="text-xs text-muted-foreground truncate max-w-xs">
                                    {template.description}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{getCategoryBadge(template.category)}</TableCell>
                            <TableCell>
                              <div>
                                <code className="text-xs bg-secondary px-2 py-1 rounded text-foreground">
                                  #{template.docuSealTemplateId}
                                </code>
                                {template.docuSealTemplateName && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {template.docuSealTemplateName}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(template.requiredFor || ['all']).map((req) => (
                                  <span
                                    key={req}
                                    className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded"
                                  >
                                    {req}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={template.enabled}
                                onCheckedChange={() => handleToggle(template.id, template.enabled)}
                              />
                            </TableCell>
                            <TableCell>
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
                                      onClick={() => openEditDialog(template)}
                                    >
                                      <Edit2 className="mr-2 h-4 w-4" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-red-400 focus:bg-secondary"
                                      onClick={() => handleDelete(template.id)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
                {editingTemplate ? 'Edit Document Template' : 'Add Document Template'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                {/* State(s) */}
                <div className="space-y-2">
                  <Label className="text-foreground">
                    {editingTemplate ? 'State' : 'State(s)'}
                  </Label>
                  {editingTemplate ? (
                    // Single state for editing
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
                  ) : (
                    // Multi-state selector for new templates
                    <div className="relative space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowStateSelector(!showStateSelector)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-secondary border border rounded-md text-foreground text-sm hover:bg-zinc-700 transition-colors"
                      >
                        <span className="truncate">
                          {selectedStates.size === 1
                            ? getStateName(Array.from(selectedStates)[0])
                            : `${selectedStates.size} states selected`}
                        </span>
                        <ChevronDown className={`h-4 w-4 ml-2 flex-shrink-0 transition-transform ${showStateSelector ? 'rotate-180' : ''}`} />
                      </button>
                      {showStateSelector && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-secondary border border rounded-md shadow-lg max-h-60 overflow-y-auto">
                          <div className="sticky top-0 bg-secondary p-2 border-b border flex gap-2">
                            <button
                              type="button"
                              className="text-xs text-emerald-400 hover:text-emerald-300"
                              onClick={() => setSelectedStates(new Set(US_STATES.map(s => s.value)))}
                            >
                              Select All
                            </button>
                            <span className="text-muted-foreground">|</span>
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => setSelectedStates(new Set(['ALL']))}
                            >
                              Clear
                            </button>
                          </div>
                          {US_STATES.map((state) => (
                            <label
                              key={state.value}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedStates.has(state.value)}
                                onChange={(e) => {
                                  const newStates = new Set(selectedStates);
                                  if (e.target.checked) {
                                    newStates.add(state.value);
                                  } else {
                                    newStates.delete(state.value);
                                  }
                                  if (newStates.size > 0) {
                                    setSelectedStates(newStates);
                                  }
                                }}
                                className="rounded border bg-zinc-700 text-emerald-500 focus:ring-emerald-500"
                              />
                              <span className="text-sm text-foreground">{state.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      {selectedStates.size > 1 && (
                        <p className="text-xs text-emerald-400">
                          This template will be created for {selectedStates.size} states
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label className="text-foreground">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) =>
                      setFormData({ ...formData, category: v as DocumentCategory })
                    }
                  >
                    <SelectTrigger className="bg-secondary border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border max-h-60">
                      {DOCUMENT_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          <div>
                            <span>{cat.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              - {cat.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Template Name */}
              <div className="space-y-2">
                <Label className="text-foreground">Template Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Texas Purchase Contract"
                  className="bg-secondary border text-foreground"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label className="text-foreground">Description (optional)</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this template..."
                  className="bg-secondary border text-foreground"
                  rows={2}
                />
              </div>

              {/* DocuSeal Template ID */}
              <div className="space-y-2">
                <Label className="text-foreground">DocuSeal Template</Label>
                {loadingDocuSeal ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm p-3 bg-secondary rounded-md">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading DocuSeal templates...
                  </div>
                ) : docuSealError ? (
                  <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/30 rounded-md">
                    DocuSeal not configured. Add your API key in settings.
                  </div>
                ) : Array.isArray(docuSealTemplates) && docuSealTemplates.length > 0 ? (
                  <Select
                    value={formData.docuSealTemplateId?.toString() || ''}
                    onValueChange={(v) =>
                      setFormData({ ...formData, docuSealTemplateId: parseInt(v) })
                    }
                  >
                    <SelectTrigger className="bg-secondary border text-foreground">
                      <SelectValue placeholder="Select a DocuSeal template" />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border max-h-60">
                      {docuSealTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          #{t.id} - {t.name} {t.folder_name ? `(${t.folder_name})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type="number"
                    value={formData.docuSealTemplateId || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, docuSealTemplateId: parseInt(e.target.value) || 0 })
                    }
                    placeholder="Enter DocuSeal template ID manually"
                    className="bg-secondary border text-foreground"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Select the DocuSeal template to use for this document type
                </p>
              </div>

              {/* Required For */}
              <div className="space-y-2">
                <Label className="text-foreground">Required For</Label>
                <div className="flex flex-wrap gap-4">
                  {REQUIRED_FOR_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`required-${option.value}`}
                        checked={(formData.requiredFor || []).includes(option.value)}
                        onCheckedChange={(checked) =>
                          handleRequiredForChange(option.value, checked as boolean)
                        }
                      />
                      <label
                        htmlFor={`required-${option.value}`}
                        className="text-sm text-foreground"
                      >
                        {option.label}
                      </label>
                    </div>
                  ))}
                </div>
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
                <p className="text-xs text-muted-foreground">
                  Higher priority templates are used first when multiple match
                </p>
              </div>

              {/* Enabled */}
              <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
                <div>
                  <p className="text-foreground">Enabled</p>
                  <p className="text-xs text-muted-foreground">Template will be available for use</p>
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
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleSubmit}
                disabled={
                  !formData.name ||
                  !formData.docuSealTemplateId ||
                  createTemplate.isPending ||
                  updateTemplate.isPending ||
                  createMultipleTemplates.isPending ||
                  (!editingTemplate && selectedStates.size === 0)
                }
              >
                {createTemplate.isPending || createMultipleTemplates.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : editingTemplate ? (
                  'Update Template'
                ) : selectedStates.size > 1 ? (
                  `Create ${selectedStates.size} Templates`
                ) : (
                  'Create Template'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DocuSeal Preview Modal */}
      {previewTemplate && (
        <DocuSealEmbed
          templateId={previewTemplate.id}
          templateName={previewTemplate.name}
          templateSlug={previewTemplate.slug}
          open={!!previewTemplate}
          onOpenChange={(open) => !open && setPreviewTemplate(null)}
        />
      )}

      {/* Bulk State Assignment Modal */}
      {mounted && (
        <Dialog open={!!bulkAssignDoc} onOpenChange={(open) => !open && setBulkAssignDoc(null)}>
          <DialogContent className="bg-card border max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <MapPin className="h-5 w-5 text-emerald-500" />
                Assign States to Document
              </DialogTitle>
            </DialogHeader>

            {bulkAssignDoc && (
              <div className="space-y-6 py-4">
                {/* Document Info */}
                <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-lg border">
                  <div className="h-12 w-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <FileSignature className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-foreground font-semibold">{bulkAssignDoc.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      DocuSeal ID: #{bulkAssignDoc.docuSealId} • {bulkAssignStates.size} state(s) selected
                    </p>
                  </div>
                </div>

                {/* Category Selection */}
                <div className="space-y-2">
                  <Label className="text-foreground">Document Category</Label>
                  <Select
                    value={bulkAssignCategory}
                    onValueChange={(v) => setBulkAssignCategory(v as DocumentCategory)}
                  >
                    <SelectTrigger className="bg-secondary border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border max-h-60">
                      {DOCUMENT_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap items-center gap-2 pb-2 border-b border">
                  <span className="text-sm text-muted-foreground">Quick select:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border"
                    onClick={() => {
                      setBulkAssignStates(new Set(['ALL']));
                    }}
                  >
                    <Globe className="h-3 w-3 mr-1" />
                    All States
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border"
                    onClick={() => setBulkAssignStates(new Set(US_STATES.filter(s => s.value !== 'ALL').map(s => s.value)))}
                  >
                    Select All 50 States
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border text-red-400 hover:text-red-300"
                    onClick={() => setBulkAssignStates(new Set())}
                  >
                    Clear All
                  </Button>
                  <div className="h-4 w-px bg-border mx-1" />
                  {Object.entries(STATE_REGIONS).map(([region, states]) => (
                    <Button
                      key={region}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border"
                      onClick={() => selectRegion(states)}
                    >
                      {region}
                    </Button>
                  ))}
                </div>

                {/* State Grid */}
                <div className="space-y-4">
                  {/* Universal Option */}
                  <div className="p-3 bg-secondary/50 rounded-lg border border">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkAssignStates.has('ALL')}
                        onChange={() => toggleBulkAssignState('ALL')}
                        className="rounded border bg-zinc-700 text-emerald-500 focus:ring-emerald-500 h-5 w-5"
                      />
                      <Globe className="h-5 w-5 text-emerald-500" />
                      <div>
                        <span className="text-foreground font-medium">All States (Universal)</span>
                        <p className="text-xs text-muted-foreground">Apply to all states at once</p>
                      </div>
                    </label>
                  </div>

                  {/* State Grid by Region */}
                  {Object.entries(STATE_REGIONS).map(([region, regionStates]) => (
                    <div key={region} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-foreground">{region}</h4>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-xs text-emerald-400 hover:text-emerald-300"
                            onClick={() => selectRegion(regionStates)}
                          >
                            Select all
                          </button>
                          <span className="text-muted-foreground">|</span>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => clearRegion(regionStates)}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-11 gap-2">
                        {regionStates.map((stateCode) => {
                          const isSelected = bulkAssignStates.has(stateCode);
                          const isCurrentlyAssigned = bulkAssignDoc.assignedStates.includes(stateCode);
                          return (
                            <button
                              key={stateCode}
                              type="button"
                              onClick={() => toggleBulkAssignState(stateCode)}
                              className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : isCurrentlyAssigned
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-secondary text-muted-foreground hover:bg-zinc-700 hover:text-foreground'
                              }`}
                            >
                              {stateCode}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                {bulkAssignStates.size > 0 && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-emerald-400">
                      <Check className="h-4 w-4" />
                      <span>
                        {bulkAssignStates.has('ALL')
                          ? 'Document will apply to all states'
                          : `Document will be assigned to ${bulkAssignStates.size} state(s)`}
                      </span>
                    </div>
                    {!bulkAssignStates.has('ALL') && bulkAssignStates.size > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Array.from(bulkAssignStates).sort().map((s) => (
                          <span key={s} className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                className="border text-foreground"
                onClick={() => setBulkAssignDoc(null)}
              >
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleBulkAssign}
                disabled={createMultipleTemplates.isPending || deleteTemplate.isPending}
              >
                {createMultipleTemplates.isPending || deleteTemplate.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Save Assignments
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
