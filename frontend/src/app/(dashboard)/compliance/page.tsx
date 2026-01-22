'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  Shield,
  AlertTriangle,
  AlertCircle,
  Info,
  RefreshCw,
  FileText,
  Download,
  ChevronDown,
  ChevronRight,
  MapPin,
  Globe,
  BookOpen,
  FileSignature,
  ArrowRight,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import {
  useComplianceRules,
  useCreateComplianceRule,
  useUpdateComplianceRule,
  useDeleteComplianceRule,
  useToggleComplianceRule,
  useSeedDefaultRules,
  useConfiguredStates,
  useGenerateRulesFromAI,
  useRuleTemplates,
  useCreateMultipleRules,
  useTestRule,
  ComplianceRule,
  CreateRulePayload,
  GeneratedRule,
  RuleTemplate,
  RuleTestResult,
  RULE_OPERATORS,
  PROPERTY_FIELDS,
  US_STATES,
} from '@/hooks/use-compliance-rules';
import { toast } from 'sonner';
import { Sparkles, Wand2, Copy, Check, Loader2, Zap, ChevronUp, BarChart3, FlaskConical, CheckCircle2, XCircle, Mic, MicOff } from 'lucide-react';
import { useRef, useCallback } from 'react';

// Web Speech API type declarations
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

const CATEGORIES = [
  { value: 'contract', label: 'Contract', color: 'bg-accent-500' },
  { value: 'disclosure', label: 'Disclosure', color: 'bg-purple-500' },
  { value: 'licensing', label: 'Licensing', color: 'bg-amber-500' },
  { value: 'general', label: 'General', color: 'bg-zinc-500' },
];

const SEVERITIES = [
  { value: 'critical', label: 'Critical', color: 'text-red-500 border-red-500', icon: AlertCircle },
  { value: 'warning', label: 'Warning', color: 'text-amber-500 border-amber-500', icon: AlertTriangle },
  { value: 'info', label: 'Info', color: 'text-accent-500 border-accent-500', icon: Info },
];

const emptyRule: CreateRulePayload = {
  state: 'ALL',
  name: '',
  description: '',
  category: 'contract',
  field: '',
  operator: 'required',
  value: '',
  severity: 'warning',
  message: '',
  enabled: true,
  order: 100,
};

export default function ComplianceRulesPage() {
  const [search, setSearch] = useState('');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ComplianceRule | null>(null);
  const [formData, setFormData] = useState<CreateRulePayload>(emptyRule);
  const [mounted, setMounted] = useState(false);
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set(['ALL']));

  // AI Rule Generator State
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [aiDescription, setAIDescription] = useState('');
  const [aiSelectedStates, setAiSelectedStates] = useState<Set<string>>(new Set(['ALL']));
  const [generatedRules, setGeneratedRules] = useState<GeneratedRule[]>([]);
  const [selectedGeneratedRules, setSelectedGeneratedRules] = useState<Set<number>>(new Set());

  // Speech Recognition State
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Templates State
  const [showTemplates, setShowTemplates] = useState(false);

  // Rule Testing State
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [testResults, setTestResults] = useState<RuleTestResult | null>(null);

  // Multi-state selection for new rules
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set(['ALL']));
  const [showStateSelector, setShowStateSelector] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Speech Recognition Handler
  const toggleSpeechRecognition = useCallback(() => {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported', {
        description: 'Please use Chrome, Edge, or Safari for voice input',
      });
      return;
    }

    if (isRecording) {
      // Stop recording
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    // Start recording
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecording(true);
      toast.info('Listening...', { description: 'Speak your compliance requirement' });
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript = transcript;
        }
      }

      if (finalTranscript) {
        setAIDescription((prev) => {
          const newText = prev ? `${prev} ${finalTranscript}` : finalTranscript;
          return newText.trim();
        });
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      if (event.error === 'no-speech') {
        toast.warning('No speech detected', { description: 'Please try again' });
      } else if (event.error === 'not-allowed') {
        toast.error('Microphone access denied', {
          description: 'Please allow microphone access in your browser settings',
        });
      } else {
        toast.error('Speech recognition error', { description: event.error });
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isRecording]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const { data: rules, isLoading, error, refetch } = useComplianceRules(
    selectedState !== 'all' ? selectedState : undefined
  );
  const { data: configuredStates } = useConfiguredStates();
  const { data: templates } = useRuleTemplates();
  const createRule = useCreateComplianceRule();
  const updateRule = useUpdateComplianceRule();
  const deleteRule = useDeleteComplianceRule();
  const toggleRule = useToggleComplianceRule();
  const seedRules = useSeedDefaultRules();
  const generateRules = useGenerateRulesFromAI();
  const createMultipleRules = useCreateMultipleRules();
  const testRule = useTestRule();

  const allRules = Array.isArray(rules) ? rules : [];
  const filteredRules = allRules.filter(
    (rule) =>
      rule.name?.toLowerCase().includes(search.toLowerCase()) ||
      rule.field?.toLowerCase().includes(search.toLowerCase()) ||
      rule.message?.toLowerCase().includes(search.toLowerCase())
  );

  // Group rules by state for the tabs
  const statesWithRules = Array.from(new Set(allRules.map((r) => r.state))).sort();

  // Group rules by state for collapsed view (ALL first, then alphabetically)
  const rulesByState = filteredRules.reduce((acc, rule) => {
    const state = rule.state;
    if (!acc[state]) acc[state] = [];
    acc[state].push(rule);
    return acc;
  }, {} as Record<string, ComplianceRule[]>);

  // Sort states: ALL first, then alphabetically
  const sortedStates = Object.keys(rulesByState).sort((a, b) => {
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
    setEditingRule(null);
    setFormData({ ...emptyRule, state: selectedState !== 'all' ? selectedState : 'ALL' });
    setSelectedStates(new Set([selectedState !== 'all' ? selectedState : 'ALL']));
    setShowStateSelector(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (rule: ComplianceRule) => {
    setEditingRule(rule);
    setFormData({
      state: rule.state,
      name: rule.name,
      description: rule.description || '',
      category: rule.category,
      field: rule.field,
      operator: rule.operator,
      value: rule.value || '',
      severity: rule.severity,
      message: rule.message,
      enabled: rule.enabled,
      order: rule.order,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingRule) {
        await updateRule.mutateAsync({ id: editingRule.id, data: formData });
        toast.success('Rule updated successfully');
      } else {
        // Create rules for all selected states
        const statesToCreate = Array.from(selectedStates);
        if (statesToCreate.length === 1) {
          await createRule.mutateAsync({ ...formData, state: statesToCreate[0] });
          toast.success('Rule created successfully');
        } else {
          const rulesToCreate = statesToCreate.map((state) => ({
            ...formData,
            state,
          }));
          await createMultipleRules.mutateAsync(rulesToCreate);
          toast.success(`Created ${statesToCreate.length} rules successfully`);
        }
      }
      setIsDialogOpen(false);
      setFormData(emptyRule);
      setSelectedStates(new Set(['ALL']));
    } catch (err) {
      toast.error(`Failed to ${editingRule ? 'update' : 'create'} rule`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      await deleteRule.mutateAsync(id);
      toast.success('Rule deleted');
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const handleToggle = async (id: number, currentEnabled: boolean) => {
    try {
      await toggleRule.mutateAsync({ id, enabled: !currentEnabled });
      toast.success(`Rule ${!currentEnabled ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to toggle rule');
    }
  };

  const handleSeedDefaults = async () => {
    if (!confirm('This will add default compliance rules. Continue?')) return;
    try {
      await seedRules.mutateAsync();
      toast.success('Default rules seeded successfully');
    } catch {
      toast.error('Failed to seed default rules');
    }
  };

  // AI Rule Generation Handlers
  const handleGenerateWithAI = async () => {
    if (aiDescription.length < 10) {
      toast.error('Please enter a more detailed description');
      return;
    }

    if (aiSelectedStates.size === 0) {
      toast.error('Please select at least one state');
      return;
    }

    try {
      // Generate rules for each selected state
      const allRules: GeneratedRule[] = [];
      const states = Array.from(aiSelectedStates);
      const errors: string[] = [];

      for (const state of states) {
        try {
          const result = await generateRules.mutateAsync({
            description: aiDescription,
            state,
          });
          // Add state info to each rule
          const rulesWithState = result.suggestedRules.map((rule: GeneratedRule) => ({
            ...rule,
            state,
          }));
          allRules.push(...rulesWithState);
        } catch (stateError: any) {
          console.error(`Failed to generate rules for ${state}:`, stateError);
          errors.push(state);
        }
      }

      if (allRules.length > 0) {
        setGeneratedRules(allRules);
        setSelectedGeneratedRules(new Set(allRules.map((_: GeneratedRule, i: number) => i)));
        if (errors.length > 0) {
          toast.warning(`Generated ${allRules.length} rule(s), but failed for: ${errors.join(', ')}`);
        } else {
          toast.success(`Generated ${allRules.length} rule suggestion(s) for ${states.length} state(s)`);
        }
      } else {
        toast.error('Failed to generate rules. Check that the AI service is configured and try again.');
      }
    } catch (error: any) {
      console.error('Rule generation error:', error);
      toast.error(error?.message || 'Failed to generate rules. Try rephrasing your description.');
    }
  };

  const toggleGeneratedRule = (index: number) => {
    setSelectedGeneratedRules((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleCreateGeneratedRules = async () => {
    const rulesToCreate = generatedRules
      .filter((_, index) => selectedGeneratedRules.has(index))
      .map((rule) => ({
        state: rule.state,
        name: rule.name,
        description: rule.description,
        category: rule.category as 'contract' | 'disclosure' | 'licensing' | 'general',
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
        severity: rule.severity as 'critical' | 'warning' | 'info',
        message: rule.message,
        enabled: true,
        order: 100,
      }));

    if (rulesToCreate.length === 0) {
      toast.error('Please select at least one rule to create');
      return;
    }

    try {
      await createMultipleRules.mutateAsync(rulesToCreate);
      toast.success(`Created ${rulesToCreate.length} rule(s) successfully`);
      setIsAIDialogOpen(false);
      setGeneratedRules([]);
      setSelectedGeneratedRules(new Set());
      setAIDescription('');
      setAiSelectedStates(new Set(['ALL']));
    } catch {
      toast.error('Failed to create rules');
    }
  };

  const handleUseTemplate = async (template: RuleTemplate) => {
    const ruleData: CreateRulePayload = {
      state: selectedState !== 'all' ? selectedState : 'ALL',
      name: template.rule.name,
      description: template.description,
      category: template.rule.category as 'contract' | 'disclosure' | 'licensing' | 'general',
      field: template.rule.field,
      operator: template.rule.operator,
      value: template.rule.value || '',
      severity: template.rule.severity as 'critical' | 'warning' | 'info',
      message: template.rule.message,
      enabled: true,
      order: 100,
    };

    try {
      await createRule.mutateAsync(ruleData);
      toast.success(`Rule "${template.name}" created successfully`);
    } catch {
      toast.error('Failed to create rule from template');
    }
  };

  const handleTestRule = async (ruleId: number) => {
    try {
      const result = await testRule.mutateAsync(ruleId);
      setTestResults(result);
      setIsTestDialogOpen(true);
    } catch {
      toast.error('Failed to test rule');
    }
  };

  const getSeverityBadge = (severity: string) => {
    const sev = SEVERITIES.find((s) => s.value === severity);
    const Icon = sev?.icon || Info;
    return (
      <Badge variant="outline" className={sev?.color}>
        <Icon className="h-3 w-3 mr-1" />
        {sev?.label || severity}
      </Badge>
    );
  };

  const getCategoryBadge = (category: string) => {
    const cat = CATEGORIES.find((c) => c.value === category);
    return (
      <Badge className={`${cat?.color || 'bg-zinc-500'} text-foreground`}>
        {cat?.label || category}
      </Badge>
    );
  };

  const operatorNeedsValue = (op: string) => {
    return !['required', 'is_true', 'is_false'].includes(op);
  };

  if (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Compliance Rules</h1>
          <p className="text-muted-foreground mt-1">Manage state-specific compliance rules</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load rules</p>
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
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Shield className="h-8 w-8 text-accent-500" />
            Compliance Rules
          </h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? 'Loading...' : `${allRules.length} rules configured`}
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
            disabled={seedRules.isPending}
          >
            <Download className="mr-2 h-4 w-4" />
            Seed Defaults
          </Button>
          {mounted && (
            <>
              <Button
                variant="outline"
                className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                onClick={() => setIsAIDialogOpen(true)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Create with AI
              </Button>
              <Button className="bg-accent-600 hover:bg-accent-700 text-white" onClick={openAddDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Rule
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/compliance/dashboard">
          <Card className="bg-card border hover:border-accent-500/50 hover:bg-secondary/50 transition-colors cursor-pointer group">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent-500/20 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-accent-400" />
                </div>
                <div>
                  <h3 className="text-foreground font-medium">Dashboard</h3>
                  <p className="text-sm text-muted-foreground">Analytics & bulk check</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-accent-400 transition-colors" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/compliance/knowledge">
          <Card className="bg-card border hover:border-purple-500/50 hover:bg-secondary/50 transition-colors cursor-pointer group">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-foreground font-medium">Knowledge Base</h3>
                  <p className="text-sm text-muted-foreground">Laws & regulations</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-purple-400 transition-colors" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/compliance/templates">
          <Card className="bg-card border hover:border-emerald-500/50 hover:bg-secondary/50 transition-colors cursor-pointer group">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <FileSignature className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-foreground font-medium">Document Templates</h3>
                  <p className="text-sm text-muted-foreground">DocuSeal templates</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-emerald-400 transition-colors" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/compliance/contacts">
          <Card className="bg-card border hover:border-amber-500/50 hover:bg-secondary/50 transition-colors cursor-pointer group">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Users className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-foreground font-medium">Contact Requirements</h3>
                  <p className="text-sm text-muted-foreground">Required contacts by state</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-amber-400 transition-colors" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Quick Templates Section */}
      <Card className="bg-card border">
        <button
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-secondary/50 transition-colors"
          onClick={() => setShowTemplates(!showTemplates)}
        >
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-amber-500" />
            <div className="text-left">
              <h3 className="text-foreground font-semibold">Quick Templates</h3>
              <p className="text-xs text-muted-foreground">
                One-click rule creation from common templates
              </p>
            </div>
          </div>
          {showTemplates ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
        {showTemplates && templates && templates.length > 0 && (
          <CardContent className="pt-0 pb-4 px-6 border-t border">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleUseTemplate(template)}
                  disabled={createRule.isPending}
                  className="text-left p-3 rounded-lg border border hover:border-amber-500/50 hover:bg-secondary/50 transition-colors group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{template.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground group-hover:text-amber-500 flex-shrink-0 ml-2" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs border text-muted-foreground">
                      {template.rule.category}
                    </Badge>
                    {template.rule.severity === 'critical' && (
                      <Badge variant="outline" className="text-xs border-red-500 text-red-500">
                        critical
                      </Badge>
                    )}
                    {template.rule.severity === 'warning' && (
                      <Badge variant="outline" className="text-xs border-amber-500 text-amber-500">
                        warning
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* State Selector */}
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Filter by State:</Label>
        <Select value={selectedState} onValueChange={setSelectedState}>
          <SelectTrigger className="w-[180px] bg-card border">
            <SelectValue placeholder="Select state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="ALL">Universal Rules</SelectItem>
            {(configuredStates || [])
              .filter((s) => s && s !== 'ALL')
              .sort()
              .map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search and Expand/Collapse buttons */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border text-foreground"
          />
        </div>
        {selectedState === 'all' && sortedStates.length > 0 && (
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

      {/* Rules Display */}
      {isLoading ? (
        <Card className="bg-card border">
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filteredRules.length === 0 ? (
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No rules found</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              {search
                ? 'Try adjusting your search terms'
                : 'Add your first compliance rule or seed defaults'}
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
                <Button className="bg-accent-600 hover:bg-accent-700 text-white" onClick={openAddDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Rule
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : selectedState === 'all' ? (
        /* Grouped by State View */
        <div className="space-y-4">
          {sortedStates.map((stateCode) => {
            const stateRules = rulesByState[stateCode] || [];
            const isExpanded = expandedStates.has(stateCode);
            const criticalCount = stateRules.filter((r) => r.severity === 'critical').length;
            const warningCount = stateRules.filter((r) => r.severity === 'warning').length;
            const enabledCount = stateRules.filter((r) => r.enabled).length;

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
                      <Globe className="h-5 w-5 text-accent-500" />
                    ) : (
                      <MapPin className="h-5 w-5 text-emerald-500" />
                    )}
                    <div className="text-left">
                      <h3 className="text-foreground font-semibold">{getStateName(stateCode)}</h3>
                      <p className="text-xs text-muted-foreground">
                        {stateRules.length} rule{stateRules.length !== 1 ? 's' : ''} • {enabledCount} enabled
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {criticalCount > 0 && (
                      <Badge variant="outline" className="text-red-500 border-red-500">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {criticalCount} critical
                      </Badge>
                    )}
                    {warningCount > 0 && (
                      <Badge variant="outline" className="text-amber-500 border-amber-500">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {warningCount} warning
                      </Badge>
                    )}
                    <Badge variant="outline" className="border text-muted-foreground">
                      {stateCode}
                    </Badge>
                  </div>
                </button>

                {/* Expanded Rules Table */}
                {isExpanded && (
                  <div className="border-t border">
                    <Table>
                      <TableHeader>
                        <TableRow className="border hover:bg-secondary/50">
                          <TableHead className="text-muted-foreground">Rule Name</TableHead>
                          <TableHead className="text-muted-foreground">Category</TableHead>
                          <TableHead className="text-muted-foreground">Field</TableHead>
                          <TableHead className="text-muted-foreground">Operator</TableHead>
                          <TableHead className="text-muted-foreground">Severity</TableHead>
                          <TableHead className="text-muted-foreground">Enabled</TableHead>
                          <TableHead className="text-muted-foreground w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stateRules.map((rule) => (
                          <TableRow
                            key={rule.id}
                            className="border hover:bg-secondary/50"
                          >
                            <TableCell>
                              <div>
                                <p className="text-foreground font-medium">{rule.name}</p>
                                <p className="text-xs text-muted-foreground truncate max-w-xs">
                                  {rule.message}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>{getCategoryBadge(rule.category)}</TableCell>
                            <TableCell>
                              <code className="text-xs bg-secondary px-2 py-1 rounded text-foreground">
                                {rule.field}
                              </code>
                            </TableCell>
                            <TableCell>
                              <span className="text-muted-foreground text-sm">
                                {RULE_OPERATORS.find((o) => o.value === rule.operator)?.label || rule.operator}
                                {rule.value && (
                                  <span className="text-muted-foreground ml-1">({rule.value})</span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell>{getSeverityBadge(rule.severity)}</TableCell>
                            <TableCell>
                              <Switch
                                checked={rule.enabled}
                                onCheckedChange={() => handleToggle(rule.id, rule.enabled)}
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
                                      className="text-cyan-400 focus:bg-secondary"
                                      onClick={() => handleTestRule(rule.id)}
                                      disabled={testRule.isPending}
                                    >
                                      <FlaskConical className="mr-2 h-4 w-4" />
                                      Test Rule
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-foreground focus:bg-secondary"
                                      onClick={() => openEditDialog(rule)}
                                    >
                                      <Edit2 className="mr-2 h-4 w-4" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-red-400 focus:bg-secondary"
                                      onClick={() => handleDelete(rule.id)}
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
      ) : (
        /* Single State Flat Table View */
        <Card className="bg-card border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border hover:bg-secondary/50">
                  <TableHead className="text-muted-foreground">Rule Name</TableHead>
                  <TableHead className="text-muted-foreground">Category</TableHead>
                  <TableHead className="text-muted-foreground">Field</TableHead>
                  <TableHead className="text-muted-foreground">Operator</TableHead>
                  <TableHead className="text-muted-foreground">Severity</TableHead>
                  <TableHead className="text-muted-foreground">Enabled</TableHead>
                  <TableHead className="text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRules.map((rule) => (
                  <TableRow
                    key={rule.id}
                    className="border hover:bg-secondary/50"
                  >
                    <TableCell>
                      <div>
                        <p className="text-foreground font-medium">{rule.name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-xs">
                          {rule.message}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{getCategoryBadge(rule.category)}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-secondary px-2 py-1 rounded text-foreground">
                        {rule.field}
                      </code>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {RULE_OPERATORS.find((o) => o.value === rule.operator)?.label || rule.operator}
                        {rule.value && (
                          <span className="text-muted-foreground ml-1">({rule.value})</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{getSeverityBadge(rule.severity)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggle(rule.id, rule.enabled)}
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
                              className="text-cyan-400 focus:bg-secondary"
                              onClick={() => handleTestRule(rule.id)}
                              disabled={testRule.isPending}
                            >
                              <FlaskConical className="mr-2 h-4 w-4" />
                              Test Rule
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-foreground focus:bg-secondary"
                              onClick={() => openEditDialog(rule)}
                            >
                              <Edit2 className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-400 focus:bg-secondary"
                              onClick={() => handleDelete(rule.id)}
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
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      {mounted && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="bg-card border max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingRule ? 'Edit Compliance Rule' : 'Add Compliance Rule'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                {/* State(s) */}
                <div className="space-y-2">
                  <Label className="text-foreground">
                    {editingRule ? 'State' : 'State(s)'}
                  </Label>
                  {editingRule ? (
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
                    // Multi-state selector for new rules
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
                              className="text-xs text-accent-400 hover:text-accent-300"
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
                                  // Ensure at least one state is selected
                                  if (newStates.size > 0) {
                                    setSelectedStates(newStates);
                                  }
                                }}
                                className="rounded border bg-zinc-700 text-accent-500 focus:ring-accent-500"
                              />
                              <span className="text-sm text-foreground">{state.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      {selectedStates.size > 1 && (
                        <p className="text-xs text-accent-400">
                          This rule will be created for {selectedStates.size} states
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
                    onValueChange={(v: 'contract' | 'disclosure' | 'licensing' | 'general') =>
                      setFormData({ ...formData, category: v })
                    }
                  >
                    <SelectTrigger className="bg-secondary border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border">
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Rule Name */}
              <div className="space-y-2">
                <Label className="text-foreground">Rule Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Minimum Asking Price"
                  className="bg-secondary border text-foreground"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label className="text-foreground">Description (optional)</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Explain what this rule checks for..."
                  className="bg-secondary border text-foreground"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Field */}
                <div className="space-y-2">
                  <Label className="text-foreground">Property Field</Label>
                  <Select
                    value={formData.field}
                    onValueChange={(v) => setFormData({ ...formData, field: v })}
                  >
                    <SelectTrigger className="bg-secondary border text-foreground">
                      <SelectValue placeholder="Select field..." />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border max-h-60">
                      {PROPERTY_FIELDS.map((field) => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Operator */}
                <div className="space-y-2">
                  <Label className="text-foreground">Operator</Label>
                  <Select
                    value={formData.operator}
                    onValueChange={(v) => setFormData({ ...formData, operator: v })}
                  >
                    <SelectTrigger className="bg-secondary border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border">
                      {RULE_OPERATORS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          <div>
                            <span>{op.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              - {op.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Value (conditional) */}
              {operatorNeedsValue(formData.operator) && (
                <div className="space-y-2">
                  <Label className="text-foreground">
                    Value
                    {formData.operator === 'in_list' || formData.operator === 'not_in_list'
                      ? ' (comma-separated)'
                      : ''}
                  </Label>
                  <Input
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder={
                      formData.operator === 'min_value' || formData.operator === 'max_value'
                        ? 'e.g., 50000'
                        : formData.operator === 'in_list'
                        ? 'e.g., TX,FL,CA'
                        : 'Enter value...'
                    }
                    className="bg-secondary border text-foreground"
                  />
                </div>
              )}

              {/* Severity */}
              <div className="space-y-2">
                <Label className="text-foreground">Severity</Label>
                <Select
                  value={formData.severity}
                  onValueChange={(v: 'critical' | 'warning' | 'info') =>
                    setFormData({ ...formData, severity: v })
                  }
                >
                  <SelectTrigger className="bg-secondary border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    {SEVERITIES.map((sev) => {
                      const Icon = sev.icon;
                      return (
                        <SelectItem key={sev.value} value={sev.value}>
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${sev.color.split(' ')[0]}`} />
                            {sev.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Error Message */}
              <div className="space-y-2">
                <Label className="text-foreground">Error Message</Label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Message shown when rule fails..."
                  className="bg-secondary border text-foreground"
                  rows={2}
                />
              </div>

              {/* Enabled */}
              <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
                <div>
                  <p className="text-foreground">Enabled</p>
                  <p className="text-xs text-muted-foreground">Rule will be checked when enabled</p>
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
                className="bg-accent-600 hover:bg-accent-700 text-white"
                onClick={handleSubmit}
                disabled={
                  !formData.name ||
                  !formData.field ||
                  !formData.message ||
                  createRule.isPending ||
                  updateRule.isPending ||
                  createMultipleRules.isPending ||
                  (!editingRule && selectedStates.size === 0)
                }
              >
                {createRule.isPending || createMultipleRules.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : editingRule ? (
                  'Update Rule'
                ) : selectedStates.size > 1 ? (
                  `Create ${selectedStates.size} Rules`
                ) : (
                  'Create Rule'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* AI Rule Generator Dialog */}
      {mounted && (
        <Dialog open={isAIDialogOpen} onOpenChange={(open) => {
          setIsAIDialogOpen(open);
          if (!open && isRecording) {
            recognitionRef.current?.stop();
            setIsRecording(false);
          }
        }}>
          <DialogContent className="bg-card border max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400" />
                Create Rules with AI
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Description Input */}
              <div className="space-y-2">
                <Label className="text-foreground">Describe your compliance requirement</Label>
                <div className="relative">
                  <Textarea
                    value={aiDescription}
                    onChange={(e) => setAIDescription(e.target.value)}
                    placeholder="Example: Require all Texas deals to have a broker license and verify that contracts are assignable. Also check that properties have at least 3 bedrooms."
                    className={`bg-secondary border text-foreground min-h-[100px] pr-12 ${isRecording ? 'border-purple-500/50 ring-2 ring-purple-500/20' : ''}`}
                    rows={4}
                  />
                  <button
                    type="button"
                    onClick={toggleSpeechRecognition}
                    className={`absolute bottom-3 right-3 p-2 rounded-full transition-all ${
                      isRecording
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                        : 'bg-secondary hover:bg-zinc-700 text-muted-foreground hover:text-foreground'
                    }`}
                    title={isRecording ? 'Stop recording' : 'Voice input'}
                  >
                    {isRecording ? (
                      <div className="relative">
                        <MicOff className="h-5 w-5" />
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-400"></span>
                        </span>
                      </div>
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Be specific about what fields to check, conditions to apply, and severity levels.
                </p>
              </div>

              {/* State Selector - Multi-select */}
              <div className="space-y-2">
                <Label className="text-foreground">Apply to States</Label>
                <div className="flex flex-wrap gap-2 p-3 bg-secondary border rounded-lg max-h-[200px] overflow-y-auto">
                  {US_STATES.map((state) => {
                    const isSelected = aiSelectedStates.has(state.value);
                    const isAll = state.value === 'ALL';
                    return (
                      <button
                        key={state.value}
                        type="button"
                        onClick={() => {
                          setAiSelectedStates((prev) => {
                            const next = new Set(prev);
                            if (isAll) {
                              // If clicking ALL, toggle between ALL only and nothing
                              if (next.has('ALL')) {
                                next.clear();
                              } else {
                                next.clear();
                                next.add('ALL');
                              }
                            } else {
                              // If clicking a specific state
                              next.delete('ALL'); // Remove ALL when selecting specific states
                              if (next.has(state.value)) {
                                next.delete(state.value);
                              } else {
                                next.add(state.value);
                              }
                            }
                            return next;
                          });
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : 'bg-zinc-700 text-muted-foreground hover:bg-zinc-600 hover:text-foreground'
                        }`}
                      >
                        {state.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {aiSelectedStates.size === 0
                    ? 'Select at least one state'
                    : aiSelectedStates.has('ALL')
                    ? 'Rules will apply to all states'
                    : `${aiSelectedStates.size} state(s) selected`}
                </p>
              </div>

              {/* Generate Button */}
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleGenerateWithAI}
                disabled={aiDescription.length < 10 || aiSelectedStates.size === 0 || generateRules.isPending}
              >
                {generateRules.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Generate Rules
                  </>
                )}
              </Button>

              {/* Generated Rules Preview */}
              {generatedRules.length > 0 && (
                <div className="space-y-3 mt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-foreground font-medium">
                      Generated Rules ({selectedGeneratedRules.size}/{generatedRules.length} selected)
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border text-muted-foreground"
                        onClick={() => setSelectedGeneratedRules(new Set(generatedRules.map((_, i) => i)))}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border text-muted-foreground"
                        onClick={() => setSelectedGeneratedRules(new Set())}
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {generatedRules.map((rule, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                          selectedGeneratedRules.has(index)
                            ? 'border-purple-500/50 bg-purple-500/10'
                            : 'border bg-secondary/50 hover:border'
                        }`}
                        onClick={() => toggleGeneratedRule(index)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            selectedGeneratedRules.has(index)
                              ? 'bg-purple-500 text-foreground'
                              : 'bg-zinc-700 text-muted-foreground'
                          }`}>
                            {selectedGeneratedRules.has(index) && <Check className="h-3 w-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-foreground font-medium">{rule.name}</p>
                              <Badge variant="outline" className={`text-xs ${
                                rule.severity === 'critical'
                                  ? 'border-red-500 text-red-500'
                                  : rule.severity === 'warning'
                                  ? 'border-amber-500 text-amber-500'
                                  : 'border-accent-500 text-accent-500'
                              }`}>
                                {rule.severity}
                              </Badge>
                              <Badge variant="outline" className="text-xs border text-muted-foreground">
                                {rule.category}
                              </Badge>
                            </div>
                            {rule.description && (
                              <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <code className="bg-secondary px-1.5 py-0.5 rounded">{rule.field}</code>
                              <span>{RULE_OPERATORS.find(o => o.value === rule.operator)?.label || rule.operator}</span>
                              {rule.value && <code className="bg-secondary px-1.5 py-0.5 rounded">{rule.value}</code>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 italic">"{rule.message}"</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                className="border text-foreground"
                onClick={() => {
                  setIsAIDialogOpen(false);
                  setGeneratedRules([]);
                  setSelectedGeneratedRules(new Set());
                  setAIDescription('');
                  setAiSelectedStates(new Set(['ALL']));
                }}
              >
                Cancel
              </Button>
              {generatedRules.length > 0 && (
                <Button
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={handleCreateGeneratedRules}
                  disabled={selectedGeneratedRules.size === 0 || createMultipleRules.isPending}
                >
                  {createMultipleRules.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Create {selectedGeneratedRules.size} Rule{selectedGeneratedRules.size !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Rule Test Results Dialog */}
      {mounted && (
        <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
          <DialogContent className="bg-card border max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-cyan-400" />
                Rule Test Results
              </DialogTitle>
            </DialogHeader>

            {testResults && (
              <div className="space-y-4">
                {/* Rule Info */}
                <div className="p-4 rounded-lg bg-secondary/50 border border">
                  <h3 className="text-foreground font-medium">{testResults.rule.name}</h3>
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                    <code className="bg-secondary px-1.5 py-0.5 rounded">{testResults.rule.field}</code>
                    <span>{RULE_OPERATORS.find(o => o.value === testResults.rule.operator)?.label || testResults.rule.operator}</span>
                    {testResults.rule.value && (
                      <code className="bg-secondary px-1.5 py-0.5 rounded">{testResults.rule.value}</code>
                    )}
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-secondary">
                    <p className="text-2xl font-bold text-foreground">{testResults.total}</p>
                    <p className="text-xs text-muted-foreground">Properties</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-emerald-500/20">
                    <p className="text-2xl font-bold text-emerald-500">{testResults.passed}</p>
                    <p className="text-xs text-muted-foreground">Would Pass</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-500/20">
                    <p className="text-2xl font-bold text-red-500">{testResults.failed}</p>
                    <p className="text-xs text-muted-foreground">Would Fail</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-accent-500/20">
                    <p className="text-2xl font-bold text-accent-500">{testResults.passRate}%</p>
                    <p className="text-xs text-muted-foreground">Pass Rate</p>
                  </div>
                </div>

                {/* Property Results */}
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  <h4 className="text-sm font-medium text-muted-foreground">Property Results</h4>
                  {testResults.properties.map((prop) => (
                    <div
                      key={prop.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        prop.wouldPass
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : 'bg-red-500/10 border-red-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {prop.wouldPass ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                        <div>
                          <p className="text-foreground text-sm">{prop.address}</p>
                          <p className="text-xs text-muted-foreground">{prop.state}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          Value: <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">
                            {prop.fieldValue === null ? 'null' : String(prop.fieldValue)}
                          </code>
                        </p>
                        {prop.reason && (
                          <p className="text-xs text-red-400 mt-1">{prop.reason}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {testResults.total === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No properties found for this rule's state filter
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                className="border text-foreground"
                onClick={() => setIsTestDialogOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
