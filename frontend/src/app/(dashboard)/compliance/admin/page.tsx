'use client';

import { useState } from 'react';
import {
  useStateSpecs,
  useStateSummary,
  useStateRules,
  useStateDisclosures,
  usePendingApprovals,
  useAvailableCommands,
  useSpecStats,
  useAICommand,
  useCloneState,
  useAddRule,
  useUpdateRule,
  useDeleteRule,
  useAddDisclosure,
  useBulkToggleRules,
  useApproveCommand,
  useRejectCommand,
  useExportState,
  useValidateLogic,
  useVersionHistory,
  Rule,
  Disclosure,
} from '@/hooks/use-compliance-specs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Copy,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Trash2,
  Pencil,
  Terminal,
  Database,
  Webhook,
} from 'lucide-react';

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function ComplianceSpecAdminPage() {
  const [selectedState, setSelectedState] = useState<string>('');
  const [activeTab, setActiveTab] = useState('rules');

  const { data: states, isLoading: statesLoading } = useStateSpecs();
  const { data: stats } = useSpecStats();
  const { data: approvals } = usePendingApprovals();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Compliance Spec Admin</h1>
          <p className="text-muted-foreground">
            Manage state compliance rules, disclosures, and gates
          </p>
        </div>
        <div className="flex items-center gap-4">
          <StatsDisplay stats={stats} />
          <AICommandButton />
        </div>
      </div>

      {/* Pending Approvals Alert */}
      {approvals && approvals.length > 0 && (
        <PendingApprovalsCard approvals={approvals} />
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* State List Sidebar */}
        <div className="col-span-3">
          <StateListCard
            states={states || []}
            selectedState={selectedState}
            onSelectState={setSelectedState}
            isLoading={statesLoading}
          />
        </div>

        {/* State Detail */}
        <div className="col-span-9">
          {selectedState ? (
            <StateDetailCard
              stateCode={selectedState}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <Card className="h-96 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a state to view and manage its compliance spec</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// STATS DISPLAY
// =============================================================================

function StatsDisplay({ stats }: { stats?: { cache: any; webhooks: any } }) {
  if (!stats) return null;

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1">
        <Database className="h-4 w-4 text-muted-foreground" />
        <span>{stats.cache?.type || 'memory'}</span>
        <Badge variant="secondary">{stats.cache?.keys || 0} cached</Badge>
      </div>
      <div className="flex items-center gap-1">
        <Webhook className="h-4 w-4 text-muted-foreground" />
        <Badge variant="secondary">{stats.webhooks?.webhooks || 0} webhooks</Badge>
      </div>
    </div>
  );
}

// =============================================================================
// AI COMMAND BUTTON
// =============================================================================

function AICommandButton() {
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [result, setResult] = useState<any>(null);
  const aiCommand = useAICommand();
  const { data: commands } = useAvailableCommands();

  const handleExecute = async (execute: boolean) => {
    try {
      const res = await aiCommand.mutateAsync({ command, execute, skipApproval: false });
      setResult(res);
      if (execute && res.success) {
        setCommand('');
      }
    } catch (error) {
      setResult({ success: false, error: (error as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Terminal className="h-4 w-4 mr-2" />
          AI Command
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI Command Interface</DialogTitle>
          <DialogDescription>
            Enter natural language commands to manage compliance specs
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Command</Label>
            <Textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g., Add a lead paint disclosure to Oklahoma"
              className="min-h-24"
            />
          </div>

          {result && (
            <div
              className={`p-4 rounded-lg ${
                result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              } border`}
            >
              <div className="font-medium mb-2">
                {result.success ? 'Success' : 'Error'}
              </div>
              {result.parsed && (
                <div className="text-sm space-y-1">
                  <p>
                    <strong>Intent:</strong> {result.parsed.intent}
                  </p>
                  <p>
                    <strong>Confidence:</strong> {(result.parsed.confidence * 100).toFixed(0)}%
                  </p>
                  <p>
                    <strong>Explanation:</strong> {result.parsed.explanation}
                  </p>
                  {result.parsed.requiresApproval && (
                    <Badge variant="destructive">Requires Approval</Badge>
                  )}
                </div>
              )}
              {result.result && (
                <p className="text-sm mt-2">{result.result.message}</p>
              )}
              {result.error && <p className="text-sm text-red-600">{result.error}</p>}
            </div>
          )}

          <div>
            <Label className="text-muted-foreground">Available Commands:</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {commands?.map((cmd) => (
                <Badge
                  key={cmd.name}
                  variant={cmd.dangerous ? 'destructive' : 'secondary'}
                  className="text-xs cursor-pointer"
                  onClick={() => setCommand(cmd.name.replace(/_/g, ' '))}
                >
                  {cmd.name}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleExecute(false)}>
            Parse Only
          </Button>
          <Button onClick={() => handleExecute(true)} disabled={aiCommand.isPending}>
            {aiCommand.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// PENDING APPROVALS
// =============================================================================

function PendingApprovalsCard({ approvals }: { approvals: any[] }) {
  const approveCommand = useApproveCommand();
  const rejectCommand = useRejectCommand();

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-amber-800">
          <Clock className="h-5 w-5" />
          Pending Approvals ({approvals.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {approvals.slice(0, 3).map((approval) => (
            <div
              key={approval.id}
              className="flex items-center justify-between p-2 bg-white rounded border"
            >
              <div>
                <p className="font-medium">{approval.parsed_intent}</p>
                <p className="text-sm text-muted-foreground">{approval.raw_command}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rejectCommand.mutate({ commandId: approval.id })}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => approveCommand.mutate(approval.id)}
                >
                  Approve
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// STATE LIST
// =============================================================================

function StateListCard({
  states,
  selectedState,
  onSelectState,
  isLoading,
}: {
  states: any[];
  selectedState: string;
  onSelectState: (code: string) => void;
  isLoading: boolean;
}) {
  const [cloneOpen, setCloneOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>States</CardTitle>
          <CloneStateButton open={cloneOpen} onOpenChange={setCloneOpen} states={states} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : states.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No states configured</p>
        ) : (
          <div className="space-y-1">
            {states.map((state) => (
              <button
                key={state.state_code}
                onClick={() => onSelectState(state.state_code)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  selectedState === state.state_code
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{state.state_code}</span>
                  <Badge
                    variant={state.status === 'active' ? 'default' : 'secondary'}
                  >
                    {state.status}
                  </Badge>
                </div>
                <p className="text-xs opacity-80">{state.state_name}</p>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// CLONE STATE BUTTON
// =============================================================================

function CloneStateButton({
  open,
  onOpenChange,
  states,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  states: any[];
}) {
  const [sourceState, setSourceState] = useState('');
  const [targetState, setTargetState] = useState('');
  const [targetStateName, setTargetStateName] = useState('');
  const cloneState = useCloneState();

  const handleClone = async () => {
    try {
      await cloneState.mutateAsync({ sourceState, targetState, targetStateName });
      onOpenChange(false);
      setSourceState('');
      setTargetState('');
      setTargetStateName('');
    } catch (error) {
      console.error('Clone failed:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Copy className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clone State Spec</DialogTitle>
          <DialogDescription>
            Create a new state by copying an existing spec
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Source State</Label>
            <Select value={sourceState} onValueChange={setSourceState}>
              <SelectTrigger>
                <SelectValue placeholder="Select source state" />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s.state_code} value={s.state_code}>
                    {s.state_code} - {s.state_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Target State Code</Label>
            <Input
              value={targetState}
              onChange={(e) => setTargetState(e.target.value.toUpperCase())}
              placeholder="e.g., TX"
              maxLength={2}
            />
          </div>

          <div>
            <Label>Target State Name</Label>
            <Input
              value={targetStateName}
              onChange={(e) => setTargetStateName(e.target.value)}
              placeholder="e.g., Texas"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleClone}
            disabled={!sourceState || !targetState || !targetStateName || cloneState.isPending}
          >
            {cloneState.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Clone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// STATE DETAIL
// =============================================================================

function StateDetailCard({
  stateCode,
  activeTab,
  onTabChange,
}: {
  stateCode: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const { data: summary, isLoading } = useStateSummary(stateCode);
  const exportState = useExportState();

  const handleExport = async () => {
    try {
      const data = await exportState.mutateAsync(stateCode);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${stateCode.toLowerCase()}-spec.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  if (isLoading) {
    return (
      <Card className="h-96 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>
              {summary?.stateName || stateCode}
              <Badge className="ml-2" variant="outline">
                v{summary?.version}
              </Badge>
            </CardTitle>
            <CardDescription>
              {summary?.rules} rules, {summary?.disclosures} disclosures, {summary?.gates} gates
            </CardDescription>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="disclosures">Disclosures</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Ops</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-4">
            <RulesTab stateCode={stateCode} />
          </TabsContent>

          <TabsContent value="disclosures" className="mt-4">
            <DisclosuresTab stateCode={stateCode} />
          </TabsContent>

          <TabsContent value="bulk" className="mt-4">
            <BulkOperationsTab stateCode={stateCode} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <HistoryTab stateCode={stateCode} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// RULES TAB
// =============================================================================

function RulesTab({ stateCode }: { stateCode: string }) {
  const [phaseFilter, setPhaseFilter] = useState<number | undefined>(undefined);
  const [addOpen, setAddOpen] = useState(false);
  const { data: rules, isLoading } = useStateRules(stateCode, phaseFilter);

  const phases = Array.from({ length: 13 }, (_, i) => i);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select
          value={phaseFilter?.toString() || 'all'}
          onValueChange={(v) => setPhaseFilter(v === 'all' ? undefined : parseInt(v))}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by phase" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Phases</SelectItem>
            {phases.map((p) => (
              <SelectItem key={p} value={p.toString()}>
                Phase {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <AddRuleButton stateCode={stateCode} open={addOpen} onOpenChange={setAddOpen} />
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Phase</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Blocking</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules?.map((rule) => (
              <RuleRow key={rule.rule_code} rule={rule} stateCode={stateCode} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function RuleRow({ rule, stateCode }: { rule: Rule; stateCode: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const deleteRule = useDeleteRule();
  const updateRule = useUpdateRule();

  const handleToggle = () => {
    updateRule.mutate({
      stateCode,
      ruleCode: rule.rule_code,
      updates: { is_active: !rule.is_active },
    });
  };

  const handleDelete = () => {
    if (confirm(`Delete rule ${rule.rule_code}?`)) {
      deleteRule.mutate({ stateCode, ruleCode: rule.rule_code });
    }
  };

  return (
    <TableRow className={!rule.is_active ? 'opacity-50' : ''}>
      <TableCell className="font-mono text-xs">{rule.rule_code}</TableCell>
      <TableCell>
        <Badge variant="outline">{rule.phase}</Badge>
      </TableCell>
      <TableCell className="max-w-xs truncate">{rule.name}</TableCell>
      <TableCell>
        <Badge
          variant={
            rule.severity === 'critical'
              ? 'destructive'
              : rule.severity === 'warning'
              ? 'default'
              : 'secondary'
          }
        >
          {rule.severity}
        </Badge>
      </TableCell>
      <TableCell>
        {rule.is_blocking && <CheckCircle className="h-4 w-4 text-red-500" />}
      </TableCell>
      <TableCell>
        <Switch checked={rule.is_active} onCheckedChange={handleToggle} />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <EditRuleDialog
          rule={rule}
          stateCode={stateCode}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      </TableCell>
    </TableRow>
  );
}

// =============================================================================
// ADD/EDIT RULE DIALOGS
// =============================================================================

function AddRuleButton({
  stateCode,
  open,
  onOpenChange,
}: {
  stateCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState({
    ruleCode: '',
    name: '',
    phase: 0,
    severity: 'warning' as const,
    isBlocking: false,
    errorMessage: '',
    remediation: '',
  });
  const addRule = useAddRule();

  const handleSubmit = async () => {
    try {
      await addRule.mutateAsync({ stateCode, rule: form });
      onOpenChange(false);
      setForm({
        ruleCode: '',
        name: '',
        phase: 0,
        severity: 'warning',
        isBlocking: false,
        errorMessage: '',
        remediation: '',
      });
    } catch (error) {
      console.error('Add rule failed:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Rule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Rule Code</Label>
              <Input
                value={form.ruleCode}
                onChange={(e) => setForm({ ...form, ruleCode: e.target.value })}
                placeholder={`${stateCode}-P0-R1`}
              />
            </div>
            <div>
              <Label>Phase</Label>
              <Select
                value={form.phase.toString()}
                onValueChange={(v) => setForm({ ...form, phase: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 13 }, (_, i) => (
                    <SelectItem key={i} value={i.toString()}>
                      Phase {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Rule name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Severity</Label>
              <Select
                value={form.severity}
                onValueChange={(v: any) => setForm({ ...form, severity: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={form.isBlocking}
                onCheckedChange={(v) => setForm({ ...form, isBlocking: v })}
              />
              <Label>Blocking</Label>
            </div>
          </div>

          <div>
            <Label>Error Message</Label>
            <Textarea
              value={form.errorMessage}
              onChange={(e) => setForm({ ...form, errorMessage: e.target.value })}
              placeholder="Message shown when rule fails"
            />
          </div>

          <div>
            <Label>Remediation</Label>
            <Textarea
              value={form.remediation}
              onChange={(e) => setForm({ ...form, remediation: e.target.value })}
              placeholder="How to fix the issue"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!form.ruleCode || !form.name || addRule.isPending}>
            {addRule.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRuleDialog({
  rule,
  stateCode,
  open,
  onOpenChange,
}: {
  rule: Rule;
  stateCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState({
    name: rule.name,
    severity: rule.severity,
    isBlocking: rule.is_blocking,
    errorMessage: rule.error_message || '',
    remediation: rule.remediation || '',
  });
  const updateRule = useUpdateRule();

  const handleSubmit = async () => {
    try {
      await updateRule.mutateAsync({ stateCode, ruleCode: rule.rule_code, updates: form });
      onOpenChange(false);
    } catch (error) {
      console.error('Update rule failed:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Rule: {rule.rule_code}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Severity</Label>
              <Select
                value={form.severity}
                onValueChange={(v: any) => setForm({ ...form, severity: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={form.isBlocking}
                onCheckedChange={(v) => setForm({ ...form, isBlocking: v })}
              />
              <Label>Blocking</Label>
            </div>
          </div>

          <div>
            <Label>Error Message</Label>
            <Textarea
              value={form.errorMessage}
              onChange={(e) => setForm({ ...form, errorMessage: e.target.value })}
            />
          </div>

          <div>
            <Label>Remediation</Label>
            <Textarea
              value={form.remediation}
              onChange={(e) => setForm({ ...form, remediation: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={updateRule.isPending}>
            {updateRule.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// DISCLOSURES TAB
// =============================================================================

function DisclosuresTab({ stateCode }: { stateCode: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const { data: disclosures, isLoading } = useStateDisclosures(stateCode);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddDisclosureButton stateCode={stateCode} open={addOpen} onOpenChange={setAddOpen} />
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phase</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {disclosures?.map((disclosure) => (
              <TableRow key={disclosure.disclosure_code}>
                <TableCell className="font-mono text-xs">
                  {disclosure.disclosure_code}
                </TableCell>
                <TableCell>{disclosure.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{disclosure.phase}</Badge>
                </TableCell>
                <TableCell>
                  {disclosure.is_required && <CheckCircle className="h-4 w-4 text-green-500" />}
                </TableCell>
                <TableCell>
                  {disclosure.is_active ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function AddDisclosureButton({
  stateCode,
  open,
  onOpenChange,
}: {
  stateCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState({
    disclosureCode: '',
    name: '',
    description: '',
    phase: 4,
    isRequired: true,
  });
  const addDisclosure = useAddDisclosure();

  const handleSubmit = async () => {
    try {
      await addDisclosure.mutateAsync({ stateCode, disclosure: form });
      onOpenChange(false);
      setForm({
        disclosureCode: '',
        name: '',
        description: '',
        phase: 4,
        isRequired: true,
      });
    } catch (error) {
      console.error('Add disclosure failed:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Disclosure
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Disclosure</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Disclosure Code</Label>
            <Input
              value={form.disclosureCode}
              onChange={(e) => setForm({ ...form, disclosureCode: e.target.value })}
              placeholder={`${stateCode}-D1`}
            />
          </div>

          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Disclosure name"
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detailed description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Phase</Label>
              <Select
                value={form.phase.toString()}
                onValueChange={(v) => setForm({ ...form, phase: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 13 }, (_, i) => (
                    <SelectItem key={i} value={i.toString()}>
                      Phase {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={form.isRequired}
                onCheckedChange={(v) => setForm({ ...form, isRequired: v })}
              />
              <Label>Required</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.disclosureCode || !form.name || addDisclosure.isPending}
          >
            {addDisclosure.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Disclosure
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// BULK OPERATIONS TAB
// =============================================================================

function BulkOperationsTab({ stateCode }: { stateCode: string }) {
  const [phase, setPhase] = useState<number | undefined>(undefined);
  const bulkToggle = useBulkToggleRules();
  const validateLogic = useValidateLogic();
  const [logic, setLogic] = useState('');
  const [validationResult, setValidationResult] = useState<any>(null);

  const handleBulkAction = async (action: 'enable' | 'disable') => {
    try {
      await bulkToggle.mutateAsync({ stateCode, action, phase });
    } catch (error) {
      console.error('Bulk action failed:', error);
    }
  };

  const handleValidate = async () => {
    try {
      const result = await validateLogic.mutateAsync(logic);
      setValidationResult(result);
    } catch (error) {
      setValidationResult({ valid: false, issues: [(error as Error).message] });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bulk Toggle Rules</CardTitle>
          <CardDescription>Enable or disable multiple rules at once</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label>Phase (optional)</Label>
              <Select
                value={phase?.toString() || 'all'}
                onValueChange={(v) => setPhase(v === 'all' ? undefined : parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All phases" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Phases</SelectItem>
                  {Array.from({ length: 13 }, (_, i) => (
                    <SelectItem key={i} value={i.toString()}>
                      Phase {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => handleBulkAction('disable')}
              disabled={bulkToggle.isPending}
            >
              Disable All
            </Button>
            <Button onClick={() => handleBulkAction('enable')} disabled={bulkToggle.isPending}>
              {bulkToggle.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enable All
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Validate Rule Logic</CardTitle>
          <CardDescription>Check if custom JavaScript logic is safe</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>JavaScript Logic</Label>
            <Textarea
              value={logic}
              onChange={(e) => setLogic(e.target.value)}
              placeholder="return property.price > 100000"
              className="font-mono"
            />
          </div>

          <Button onClick={handleValidate} disabled={!logic || validateLogic.isPending}>
            {validateLogic.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Validate
          </Button>

          {validationResult && (
            <div
              className={`p-4 rounded-lg ${
                validationResult.valid
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              } border`}
            >
              <div className="flex items-center gap-2 font-medium">
                {validationResult.valid ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Logic is valid and safe
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    Logic has issues
                  </>
                )}
              </div>
              {validationResult.issues?.length > 0 && (
                <ul className="mt-2 text-sm list-disc list-inside">
                  {validationResult.issues.map((issue: string, i: number) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// HISTORY TAB
// =============================================================================

function HistoryTab({ stateCode }: { stateCode: string }) {
  const { data: versions, isLoading } = useVersionHistory(stateCode);

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {versions?.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No version history</p>
      ) : (
        versions?.map((version: any) => (
          <div
            key={version.id}
            className="flex items-start justify-between p-3 border rounded-lg"
          >
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{version.change_type}</Badge>
                <span className="text-sm font-medium">{version.table_name}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {version.change_description}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{new Date(version.created_at).toLocaleDateString()}</p>
              <p>{version.changed_by}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
