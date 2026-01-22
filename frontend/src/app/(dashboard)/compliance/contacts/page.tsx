'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Search,
  Users,
  MapPin,
  Globe,
  AlertTriangle,
  Check,
  X,
  Plus,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Briefcase,
  Scale,
  Building2,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  useContactRequirementTypes,
  useBulkAssignContactRequirement,
  useBulkRemoveContactRequirement,
  DEFAULT_CONTACT_TYPES,
  ATTORNEY_STATES,
  BROKER_REQUIRED_STATES,
  type ContactRequirement,
  type ContactRequirementType,
} from '@/hooks/use-contact-requirements';
import { US_STATES } from '@/hooks/use-document-templates';

// State regions for quick selection
const STATE_REGIONS: Record<string, string[]> = {
  'Northeast': ['CT', 'DE', 'MA', 'MD', 'ME', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'],
  'Southeast': ['AL', 'FL', 'GA', 'KY', 'NC', 'SC', 'TN', 'VA', 'WV'],
  'Midwest': ['IA', 'IL', 'IN', 'KS', 'MI', 'MN', 'MO', 'ND', 'NE', 'OH', 'SD', 'WI'],
  'Southwest': ['AZ', 'NM', 'OK', 'TX'],
  'West': ['AK', 'CA', 'CO', 'HI', 'ID', 'MT', 'NV', 'OR', 'UT', 'WA', 'WY'],
};

// Contact category icons
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  wholesaler: <Briefcase className="h-5 w-5" />,
  seller: <UserCheck className="h-5 w-5" />,
  buyer: <UserCheck className="h-5 w-5" />,
  attorney: <Scale className="h-5 w-5" />,
  title_company: <Building2 className="h-5 w-5" />,
  escrow_agent: <Building2 className="h-5 w-5" />,
  broker: <Briefcase className="h-5 w-5" />,
  notary: <UserCheck className="h-5 w-5" />,
};

// Bulk assignment contact type
interface BulkAssignContact {
  category: string;
  role: string;
  phase: number;
  blocking: boolean;
  currentStates: string[];
}

// Custom field for contact type
interface CustomField {
  fieldName: string;
  displayName: string;
  dataType: 'string' | 'email' | 'phone' | 'number' | 'date' | 'boolean';
  required: boolean;
}

// Data types for custom fields
const DATA_TYPES = [
  { value: 'string', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes/No' },
];

export default function ContactRequirementsPage() {
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(true);

  // Bulk assignment modal
  const [bulkAssignContact, setBulkAssignContact] = useState<BulkAssignContact | null>(null);
  const [bulkAssignStates, setBulkAssignStates] = useState<Set<string>>(new Set());

  // Add new contact type modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedNewContact, setSelectedNewContact] = useState<ContactRequirement | null>(null);

  // Custom contact type creation
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [customPhase, setCustomPhase] = useState(0);
  const [customBlocking, setCustomBlocking] = useState(true);
  const [customFields, setCustomFields] = useState<CustomField[]>([
    { fieldName: 'name', displayName: 'Name', dataType: 'string', required: true },
  ]);

  // Data fetching
  const { data: contactTypes, isLoading, error, refetch } = useContactRequirementTypes();
  const bulkAssign = useBulkAssignContactRequirement();
  const bulkRemove = useBulkRemoveContactRequirement();

  // Filter contact types by search
  const filteredTypes = useMemo(() => {
    if (!contactTypes) return [];
    if (!search) return contactTypes;
    return contactTypes.filter(
      (t) =>
        t.role.toLowerCase().includes(search.toLowerCase()) ||
        t.category.toLowerCase().includes(search.toLowerCase())
    );
  }, [contactTypes, search]);

  // Get available contact types that aren't yet configured
  const availableContactTypes = useMemo(() => {
    if (!contactTypes) return DEFAULT_CONTACT_TYPES;
    const existingCategories = new Set(contactTypes.map((t) => t.category));
    return DEFAULT_CONTACT_TYPES.filter((t) => !existingCategories.has(t.category));
  }, [contactTypes]);

  // Open bulk assignment modal
  const openBulkAssignModal = (contact: ContactRequirementType) => {
    const currentStates = Array.isArray(contact.states) ? contact.states : [];
    setBulkAssignContact({
      category: contact.category,
      role: contact.role,
      phase: contact.phase,
      blocking: contact.blocking,
      currentStates,
    });
    setBulkAssignStates(new Set(currentStates));
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
    if (!bulkAssignContact) return;

    const currentStates = new Set(bulkAssignContact.currentStates);
    const newStates = bulkAssignStates;

    // Find states to add (in newStates but not in currentStates)
    const statesToAdd = Array.from(newStates).filter((s) => !currentStates.has(s));
    // Find states to remove (in currentStates but not in newStates)
    const statesToRemove = Array.from(currentStates).filter((s) => !newStates.has(s));

    try {
      let addedCount = 0;
      let removedCount = 0;

      // Add to new states
      if (statesToAdd.length > 0) {
        const contactRequirement = DEFAULT_CONTACT_TYPES.find(
          (t) => t.category === bulkAssignContact.category
        ) || {
          category: bulkAssignContact.category,
          role: bulkAssignContact.role,
          phase: bulkAssignContact.phase,
          blocking: bulkAssignContact.blocking,
          requiredFields: [],
        };

        const result = await bulkAssign.mutateAsync({
          contactRequirement,
          states: statesToAdd,
        });
        addedCount = result.summary.added || 0;
      }

      // Remove from states
      if (statesToRemove.length > 0) {
        const result = await bulkRemove.mutateAsync({
          category: bulkAssignContact.category,
          states: statesToRemove,
        });
        removedCount = result.summary.removed || 0;
      }

      if (addedCount > 0 && removedCount > 0) {
        toast.success(`Added to ${addedCount} state(s), removed from ${removedCount} state(s)`);
      } else if (addedCount > 0) {
        toast.success(`Added to ${addedCount} state(s)`);
      } else if (removedCount > 0) {
        toast.success(`Removed from ${removedCount} state(s)`);
      } else {
        toast.info('No changes made');
      }

      setBulkAssignContact(null);
      setBulkAssignStates(new Set());
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      toast.error('Failed to update state assignments', { description: msg });
      console.error(err);
    }
  };

  // Handle adding a new contact type
  const handleAddNewContactType = async () => {
    let contactToAdd: ContactRequirement;

    if (isCustomMode) {
      // Validate custom fields
      if (!customCategory.trim()) {
        toast.error('Please enter a category identifier');
        return;
      }
      if (!customRole.trim()) {
        toast.error('Please enter a display name');
        return;
      }
      if (customFields.length === 0) {
        toast.error('Please add at least one field');
        return;
      }

      // Check if category already exists
      const existingCategories = new Set(contactTypes?.map((t) => t.category) || []);
      if (existingCategories.has(customCategory.toLowerCase().replace(/\s+/g, '_'))) {
        toast.error('A contact type with this category already exists');
        return;
      }

      contactToAdd = {
        category: customCategory.toLowerCase().replace(/\s+/g, '_'),
        role: customRole,
        phase: customPhase,
        blocking: customBlocking,
        storageTable: 'contacts',
        requiredFields: customFields.map((f) => ({
          fieldName: f.fieldName.toLowerCase().replace(/\s+/g, '_'),
          displayName: f.displayName,
          dataType: f.dataType,
          required: f.required,
        })),
      };
    } else {
      if (!selectedNewContact) return;
      contactToAdd = selectedNewContact;
    }

    try {
      const result = await bulkAssign.mutateAsync({
        contactRequirement: contactToAdd,
        states: Array.from(bulkAssignStates),
      });

      const addedCount = result.summary.added || 0;
      toast.success(`Added "${contactToAdd.role}" to ${addedCount} state(s)`);

      // Reset all state
      setShowAddModal(false);
      setSelectedNewContact(null);
      setBulkAssignStates(new Set());
      resetCustomForm();
    } catch (err: any) {
      toast.error('Failed to add contact type', { description: err?.message });
    }
  };

  // Reset custom form
  const resetCustomForm = () => {
    setIsCustomMode(false);
    setCustomCategory('');
    setCustomRole('');
    setCustomPhase(0);
    setCustomBlocking(true);
    setCustomFields([{ fieldName: 'name', displayName: 'Name', dataType: 'string', required: true }]);
  };

  // Add a new custom field
  const addCustomField = () => {
    setCustomFields([
      ...customFields,
      { fieldName: '', displayName: '', dataType: 'string', required: false },
    ]);
  };

  // Update a custom field
  const updateCustomField = (index: number, updates: Partial<CustomField>) => {
    setCustomFields(
      customFields.map((field, i) => (i === index ? { ...field, ...updates } : field))
    );
  };

  // Remove a custom field
  const removeCustomField = (index: number) => {
    if (customFields.length <= 1) {
      toast.error('Must have at least one field');
      return;
    }
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  // Handle quick remove from a single state
  const handleRemoveFromState = async (category: string, stateCode: string) => {
    try {
      await bulkRemove.mutateAsync({ category, states: [stateCode] });
      toast.success(`Removed from ${stateCode}`);
    } catch (err) {
      toast.error('Failed to remove from state');
    }
  };

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <Card className="bg-destructive/10 border-destructive">
          <CardContent className="p-6">
            <p className="text-destructive">Error loading contact requirements: {(error as Error).message}</p>
            <Button onClick={() => refetch()} variant="outline" className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/compliance">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Contact Requirements</h1>
            <p className="text-muted-foreground">
              Manage which contacts are required for deals in each state
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {availableContactTypes.length > 0 && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                setShowAddModal(true);
                setBulkAssignStates(new Set());
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Contact Type
            </Button>
          )}
        </div>
      </div>

      {/* Quick Info Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card className="bg-card border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Users className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{contactTypes?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Contact Types</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Scale className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{ATTORNEY_STATES.length}</p>
              <p className="text-sm text-muted-foreground">Attorney States</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Briefcase className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{BROKER_REQUIRED_STATES.length}</p>
              <p className="text-sm text-muted-foreground">Broker Required States</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contact types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border text-foreground"
          />
        </div>
      </div>

      {/* Contact Types */}
      {isLoading ? (
        <Card className="bg-card border">
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filteredTypes.length === 0 ? (
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No contact requirements configured</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Add contact types to define which contacts are required for deals in each state.
            </p>
            {availableContactTypes.length > 0 && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  setShowAddModal(true);
                  setBulkAssignStates(new Set());
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Contact Type
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider>
          <div className="grid gap-4">
            {filteredTypes.map((contact) => {
              // Ensure states is always an array
              const states = Array.isArray(contact.states) ? contact.states : [];
              const hasAssignments = states.length > 0;
              const icon = CATEGORY_ICONS[contact.category] || <Users className="h-5 w-5" />;

              return (
                <Card
                  key={contact.category}
                  className={`bg-card border transition-colors ${
                    hasAssignments ? 'border-emerald-500/30' : ''
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div
                          className={`h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            hasAssignments ? 'bg-emerald-500/20 text-emerald-400' : 'bg-secondary text-muted-foreground'
                          }`}
                        >
                          {icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-foreground font-semibold">{contact.role}</h3>
                            <Badge variant="outline" className="text-xs border text-muted-foreground">
                              {contact.category}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                contact.blocking
                                  ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                  : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                              }`}
                            >
                              {contact.blocking ? 'Blocking' : 'Optional'}
                            </Badge>
                            <Badge variant="outline" className="text-xs border text-muted-foreground">
                              Phase {contact.phase}
                            </Badge>
                          </div>

                          {/* Assigned States Tags */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {states.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">
                                Not assigned to any states
                              </span>
                            ) : (
                              <>
                                {states
                                  .sort((a, b) => a.localeCompare(b))
                                  .slice(0, 15)
                                  .map((stateCode) => (
                                    <Tooltip key={stateCode}>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={() => handleRemoveFromState(contact.category, stateCode)}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all group bg-emerald-500/20 text-emerald-400 hover:bg-red-500/20 hover:text-red-400"
                                        >
                                          <MapPin className="h-3 w-3" />
                                          {stateCode}
                                          <X className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Click to remove from {stateCode}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ))}
                                {states.length > 15 && (
                                  <span className="text-xs text-muted-foreground px-2 py-1">
                                    +{states.length - 15} more
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => openBulkAssignModal(contact)}
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
        </TooltipProvider>
      )}

      {/* Bulk State Assignment Modal */}
      {mounted && (
        <Dialog open={!!bulkAssignContact} onOpenChange={(open) => !open && setBulkAssignContact(null)}>
          <DialogContent className="bg-card border max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <MapPin className="h-5 w-5 text-emerald-500" />
                Assign States to Contact Requirement
              </DialogTitle>
            </DialogHeader>

            {bulkAssignContact && (
              <div className="space-y-6 py-4">
                {/* Contact Info */}
                <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-lg border">
                  <div className="h-12 w-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    {CATEGORY_ICONS[bulkAssignContact.category] || <Users className="h-6 w-6 text-emerald-400" />}
                  </div>
                  <div>
                    <h3 className="text-foreground font-semibold">{bulkAssignContact.role}</h3>
                    <p className="text-xs text-muted-foreground">
                      {bulkAssignContact.category} • Phase {bulkAssignContact.phase} • {bulkAssignStates.size} state(s) selected
                    </p>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap items-center gap-2 pb-2 border-b border">
                  <span className="text-sm text-muted-foreground">Quick select:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border"
                    onClick={() => setBulkAssignStates(new Set(US_STATES.filter((s) => s.value !== 'ALL').map((s) => s.value)))}
                  >
                    All 50 States
                  </Button>
                  {bulkAssignContact.category === 'attorney' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border bg-purple-500/10 text-purple-400"
                      onClick={() => setBulkAssignStates(new Set(ATTORNEY_STATES))}
                    >
                      <Scale className="h-3 w-3 mr-1" />
                      Attorney States
                    </Button>
                  )}
                  {bulkAssignContact.category === 'broker' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border bg-amber-500/10 text-amber-400"
                      onClick={() => setBulkAssignStates(new Set(BROKER_REQUIRED_STATES))}
                    >
                      <Briefcase className="h-3 w-3 mr-1" />
                      Broker Required
                    </Button>
                  )}
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

                {/* State Grid by Region */}
                <div className="space-y-4">
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
                          const isCurrentlyAssigned = bulkAssignContact.currentStates.includes(stateCode);
                          const isAttorneyState = ATTORNEY_STATES.includes(stateCode);
                          const isBrokerState = BROKER_REQUIRED_STATES.includes(stateCode);

                          return (
                            <button
                              key={stateCode}
                              type="button"
                              onClick={() => toggleBulkAssignState(stateCode)}
                              className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all relative ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : isCurrentlyAssigned
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-secondary text-muted-foreground hover:bg-zinc-700 hover:text-foreground'
                              }`}
                              title={
                                isAttorneyState
                                  ? 'Attorney state'
                                  : isBrokerState
                                  ? 'Broker required state'
                                  : undefined
                              }
                            >
                              {stateCode}
                              {(isAttorneyState || isBrokerState) && (
                                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-purple-500" />
                              )}
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
                      <span>Contact will be required in {bulkAssignStates.size} state(s)</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Array.from(bulkAssignStates)
                        .sort()
                        .slice(0, 20)
                        .map((s) => (
                          <span key={s} className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                            {s}
                          </span>
                        ))}
                      {bulkAssignStates.size > 20 && (
                        <span className="px-1.5 py-0.5 text-emerald-400 text-xs">
                          +{bulkAssignStates.size - 20} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" className="border text-foreground" onClick={() => setBulkAssignContact(null)}>
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleBulkAssign}
                disabled={bulkAssign.isPending || bulkRemove.isPending}
              >
                {bulkAssign.isPending || bulkRemove.isPending ? (
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

      {/* Add New Contact Type Modal */}
      {mounted && (
        <Dialog open={showAddModal} onOpenChange={(open) => {
          setShowAddModal(open);
          if (!open) resetCustomForm();
        }}>
          <DialogContent className="bg-card border max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <Plus className="h-5 w-5 text-emerald-500" />
                Add New Contact Requirement
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Mode Toggle */}
              <div className="flex gap-2 p-1 bg-secondary rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomMode(false);
                    setSelectedNewContact(null);
                  }}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    !isCustomMode
                      ? 'bg-emerald-600 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Choose from Presets
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomMode(true);
                    setSelectedNewContact(null);
                  }}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    isCustomMode
                      ? 'bg-purple-600 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Create Custom Type
                </button>
              </div>

              {/* Preset Mode */}
              {!isCustomMode && (
                <div className="space-y-2">
                  <Label className="text-foreground">Select Contact Type</Label>
                  {availableContactTypes.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground bg-secondary/50 rounded-lg">
                      All preset contact types have already been configured.
                      <br />
                      <span className="text-sm">Switch to "Create Custom Type" to add a new one.</span>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {availableContactTypes.map((contact) => {
                        const isSelected = selectedNewContact?.category === contact.category;
                        return (
                          <button
                            key={contact.category}
                            type="button"
                            onClick={() => setSelectedNewContact(contact)}
                            className={`p-4 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500/10'
                                : 'border hover:border-emerald-500/50 bg-secondary/50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                                  isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-secondary text-muted-foreground'
                                }`}
                              >
                                {CATEGORY_ICONS[contact.category] || <Users className="h-5 w-5" />}
                              </div>
                              <div className="flex-1">
                                <p className="font-semibold text-foreground">{contact.role}</p>
                                <p className="text-xs text-muted-foreground">
                                  {contact.category} • Phase {contact.phase} • {contact.blocking ? 'Blocking' : 'Optional'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Fields: {contact.requiredFields?.map((f) => f.displayName).join(', ')}
                                </p>
                              </div>
                              {isSelected && <Check className="h-5 w-5 text-emerald-500 ml-auto" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Custom Mode */}
              {isCustomMode && (
                <div className="space-y-4">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-foreground">Category ID</Label>
                      <Input
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder="e.g., inspector, surveyor"
                        className="bg-secondary border text-foreground"
                      />
                      <p className="text-xs text-muted-foreground">
                        Unique identifier (lowercase, no spaces)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground">Display Name</Label>
                      <Input
                        value={customRole}
                        onChange={(e) => setCustomRole(e.target.value)}
                        placeholder="e.g., Property Inspector"
                        className="bg-secondary border text-foreground"
                      />
                      <p className="text-xs text-muted-foreground">
                        Name shown in the UI
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-foreground">Deal Phase</Label>
                      <Select
                        value={String(customPhase)}
                        onValueChange={(v) => setCustomPhase(parseInt(v))}
                      >
                        <SelectTrigger className="bg-secondary border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border">
                          <SelectItem value="0">Phase 0 - Initial Submission</SelectItem>
                          <SelectItem value="1">Phase 1 - Due Diligence</SelectItem>
                          <SelectItem value="2">Phase 2 - Closing</SelectItem>
                          <SelectItem value="3">Phase 3 - Post-Closing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                      <div>
                        <p className="text-foreground font-medium">Blocking?</p>
                        <p className="text-xs text-muted-foreground">
                          If yes, deal can't proceed without this contact
                        </p>
                      </div>
                      <Switch
                        checked={customBlocking}
                        onCheckedChange={setCustomBlocking}
                      />
                    </div>
                  </div>

                  {/* Custom Fields */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-foreground">Required Fields</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addCustomField}
                        className="h-7 text-xs border"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Field
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {customFields.map((field, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-12 gap-2 p-3 bg-secondary/50 rounded-lg items-center"
                        >
                          <div className="col-span-3">
                            <Input
                              value={field.fieldName}
                              onChange={(e) =>
                                updateCustomField(index, { fieldName: e.target.value })
                              }
                              placeholder="field_name"
                              className="bg-secondary border text-foreground text-sm h-8"
                            />
                          </div>
                          <div className="col-span-3">
                            <Input
                              value={field.displayName}
                              onChange={(e) =>
                                updateCustomField(index, { displayName: e.target.value })
                              }
                              placeholder="Display Name"
                              className="bg-secondary border text-foreground text-sm h-8"
                            />
                          </div>
                          <div className="col-span-2">
                            <Select
                              value={field.dataType}
                              onValueChange={(v: 'string' | 'email' | 'phone' | 'number' | 'date' | 'boolean') =>
                                updateCustomField(index, { dataType: v })
                              }
                            >
                              <SelectTrigger className="bg-secondary border text-foreground text-sm h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-card border">
                                {DATA_TYPES.map((dt) => (
                                  <SelectItem key={dt.value} value={dt.value}>
                                    {dt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2 flex items-center gap-2">
                            <Switch
                              checked={field.required}
                              onCheckedChange={(v) => updateCustomField(index, { required: v })}
                            />
                            <span className="text-xs text-muted-foreground">Required</span>
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeCustomField(index)}
                              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* State Selection (only show if contact type selected or custom mode has required info) */}
              {(selectedNewContact || (isCustomMode && customCategory && customRole)) && (
                <>
                  <div className="flex flex-wrap items-center gap-2 pb-2 border-b border">
                    <span className="text-sm text-muted-foreground">Quick select:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border"
                      onClick={() => setBulkAssignStates(new Set(US_STATES.filter((s) => s.value !== 'ALL').map((s) => s.value)))}
                    >
                      All 50 States
                    </Button>
                    {(selectedNewContact?.category === 'attorney' || customCategory === 'attorney') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border bg-purple-500/10 text-purple-400"
                        onClick={() => setBulkAssignStates(new Set(ATTORNEY_STATES))}
                      >
                        <Scale className="h-3 w-3 mr-1" />
                        Attorney States Only
                      </Button>
                    )}
                    {(selectedNewContact?.category === 'broker' || customCategory === 'broker') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border bg-amber-500/10 text-amber-400"
                        onClick={() => setBulkAssignStates(new Set(BROKER_REQUIRED_STATES))}
                      >
                        <Briefcase className="h-3 w-3 mr-1" />
                        Broker Required Only
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border text-red-400 hover:text-red-300"
                      onClick={() => setBulkAssignStates(new Set())}
                    >
                      Clear All
                    </Button>
                  </div>

                  {/* State Grid */}
                  <div className="space-y-4">
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
                            return (
                              <button
                                key={stateCode}
                                type="button"
                                onClick={() => toggleBulkAssignState(stateCode)}
                                className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white'
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
                          "{isCustomMode ? customRole : selectedNewContact?.role}" will be required in {bulkAssignStates.size} state(s)
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                className="border text-foreground"
                onClick={() => {
                  setShowAddModal(false);
                  resetCustomForm();
                  setSelectedNewContact(null);
                  setBulkAssignStates(new Set());
                }}
              >
                Cancel
              </Button>
              <Button
                className={isCustomMode ? "bg-purple-600 hover:bg-purple-700" : "bg-emerald-600 hover:bg-emerald-700"}
                onClick={handleAddNewContactType}
                disabled={
                  bulkAssignStates.size === 0 ||
                  bulkAssign.isPending ||
                  (isCustomMode ? (!customCategory || !customRole || customFields.length === 0) : !selectedNewContact)
                }
              >
                {bulkAssign.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {isCustomMode ? 'Create Custom Type' : 'Add Contact Type'}
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
