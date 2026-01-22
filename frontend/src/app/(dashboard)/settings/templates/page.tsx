'use client';

/**
 * Contract Templates Admin Page
 *
 * Manage StateDocumentTemplates and DocuSeal integration.
 * - View all templates by state/phase
 * - Assign DocuSeal templates
 * - Configure field mappings
 * - Enable/disable auto-send
 */

import { useState } from 'react';
import {
  useTemplates,
  useDocuSealTemplates,
  useTemplateOptions,
  useTemplateSummary,
  useUpdateTemplate,
  useAssignDocuSealTemplate,
  useDeleteTemplate,
  useCreateTemplate,
  useTemplatePreview,
  useValidateMappings,
  useTestSendTemplate,
  useTemplateDocument,
  getPhaseLabel,
  getTriggerLabel,
  getCategoryLabel,
  type StateDocumentTemplate,
  type DocuSealTemplate,
} from '@/hooks/use-template-admin';
import { FieldMappingEditor } from '@/components/settings/FieldMappingEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  Info,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

export default function TemplatesAdminPage() {
  const [stateFilter, setStateFilter] = useState<string>('OK');
  const [selectedTemplate, setSelectedTemplate] = useState<StateDocumentTemplate | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [fieldMappingTemplate, setFieldMappingTemplate] = useState<StateDocumentTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<StateDocumentTemplate | null>(null);
  const [testSendTemplate, setTestSendTemplate] = useState<StateDocumentTemplate | null>(null);
  const [documentPreviewTemplate, setDocumentPreviewTemplate] = useState<StateDocumentTemplate | null>(null);

  // Queries
  const { data: templates, isLoading: templatesLoading, refetch: refetchTemplates } = useTemplates({ state: stateFilter });
  const { data: docuSealTemplates, isLoading: docuSealLoading } = useDocuSealTemplates();
  const { data: options } = useTemplateOptions();
  const { data: summary, refetch: refetchSummary } = useTemplateSummary();

  // Group templates by phase
  const templatesByPhase = templates?.reduce((acc, t) => {
    const phase = t.phase ?? -1;
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(t);
    return acc;
  }, {} as Record<number, StateDocumentTemplate[]>) || {};

  const phases = Object.keys(templatesByPhase).map(Number).sort((a, b) => a - b);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contract Templates</h1>
          <p className="text-muted-foreground">
            Manage document templates and DocuSeal integration
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchTemplates(); refetchSummary(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Template
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {summary.map((s) => (
            <Card
              key={s.state}
              className={`cursor-pointer transition-colors ${stateFilter === s.state ? 'border-primary' : ''}`}
              onClick={() => setStateFilter(s.state)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{s.state}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total:</span> {s.total}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Configured:</span>{' '}
                    <span className={s.configured === s.total ? 'text-green-600' : 'text-yellow-600'}>
                      {s.configured}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Enabled:</span> {s.enabled}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Auto-send:</span> {s.auto_send}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">Templates by Phase</TabsTrigger>
          <TabsTrigger value="docuseal">DocuSeal Templates</TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          {templatesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : phases.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No templates found for {stateFilter}</p>
                <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            phases.map((phase) => (
              <Card key={phase}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Badge variant="outline">Phase {phase}</Badge>
                    {getPhaseLabel(phase)}
                  </CardTitle>
                  <CardDescription>
                    {templatesByPhase[phase].length} template(s)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Signers</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead>DocuSeal ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templatesByPhase[phase].map((template) => (
                        <TemplateRow
                          key={template.id}
                          template={template}
                          docuSealTemplates={docuSealTemplates || []}
                          onAssign={() => {
                            setSelectedTemplate(template);
                            setAssignDialogOpen(true);
                          }}
                          onEditFieldMappings={() => setFieldMappingTemplate(template)}
                          onPreview={() => setPreviewTemplate(template)}
                          onTestSend={() => setTestSendTemplate(template)}
                          onViewDocument={() => setDocumentPreviewTemplate(template)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* DocuSeal Tab */}
        <TabsContent value="docuseal">
          <Card>
            <CardHeader>
              <CardTitle>DocuSeal Templates</CardTitle>
              <CardDescription>
                Available templates in your DocuSeal account
              </CardDescription>
            </CardHeader>
            <CardContent>
              {docuSealLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !docuSealTemplates?.length ? (
                <div className="py-12 text-center text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                  <p>No DocuSeal templates found or service not configured</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Fields</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Assigned To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docuSealTemplates.map((ds) => {
                      const assignedTo = templates?.find(t => t.docuSealTemplateId === ds.id);
                      return (
                        <TableRow key={ds.id}>
                          <TableCell className="font-mono">{ds.id}</TableCell>
                          <TableCell>{ds.name}</TableCell>
                          <TableCell>
                            {ds.fieldsCount > 0 ? (
                              <Badge variant="outline" className="text-green-600">
                                {ds.fieldsCount} fields
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600">
                                No fields
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{new Date(ds.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {assignedTo ? (
                              <Badge>{assignedTo.name}</Badge>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Assign Dialog */}
      {selectedTemplate && (
        <AssignDialog
          template={selectedTemplate}
          docuSealTemplates={docuSealTemplates || []}
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          onClose={() => {
            setAssignDialogOpen(false);
            setSelectedTemplate(null);
          }}
        />
      )}

      {/* Create Dialog */}
      <CreateTemplateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        options={options}
        defaultState={stateFilter}
      />

      {/* Field Mapping Editor */}
      {fieldMappingTemplate && (
        <FieldMappingEditor
          templateId={fieldMappingTemplate.id}
          templateName={fieldMappingTemplate.name}
          currentMappings={fieldMappingTemplate.fieldMappings}
          docuSealFields={
            docuSealTemplates?.find(ds => ds.id === fieldMappingTemplate.docuSealTemplateId)?.fields
          }
          open={!!fieldMappingTemplate}
          onOpenChange={(open) => {
            if (!open) setFieldMappingTemplate(null);
          }}
        />
      )}

      {/* Preview Dialog */}
      {previewTemplate && (
        <PreviewDialog
          template={previewTemplate}
          open={!!previewTemplate}
          onOpenChange={(open) => {
            if (!open) setPreviewTemplate(null);
          }}
        />
      )}

      {/* Test Send Dialog */}
      {testSendTemplate && (
        <TestSendDialog
          template={testSendTemplate}
          open={!!testSendTemplate}
          onOpenChange={(open) => {
            if (!open) setTestSendTemplate(null);
          }}
        />
      )}

      {/* Document Preview Dialog */}
      {documentPreviewTemplate && (
        <DocumentPreviewDialog
          template={documentPreviewTemplate}
          open={!!documentPreviewTemplate}
          onOpenChange={(open) => {
            if (!open) setDocumentPreviewTemplate(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// TEMPLATE ROW COMPONENT
// ============================================================================

function TemplateRow({
  template,
  docuSealTemplates,
  onAssign,
  onEditFieldMappings,
  onPreview,
  onTestSend,
  onViewDocument,
}: {
  template: StateDocumentTemplate;
  docuSealTemplates: DocuSealTemplate[];
  onAssign: () => void;
  onEditFieldMappings: () => void;
  onPreview: () => void;
  onTestSend: () => void;
  onViewDocument: () => void;
}) {
  const updateMutation = useUpdateTemplate(template.id);
  const deleteMutation = useDeleteTemplate();

  const handleToggleEnabled = async () => {
    try {
      await updateMutation.mutateAsync({ enabled: !template.enabled });
      toast.success(`Template ${template.enabled ? 'disabled' : 'enabled'}`);
    } catch (error) {
      toast.error('Failed to update template');
    }
  };

  const handleToggleAutoSend = async () => {
    try {
      await updateMutation.mutateAsync({ autoSend: !template.autoSend });
      toast.success(`Auto-send ${template.autoSend ? 'disabled' : 'enabled'}`);
    } catch (error) {
      toast.error('Failed to update template');
    }
  };

  const isConfigured = template.docuSealTemplateId > 0;

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{template.name}</div>
        {template.description && (
          <div className="text-sm text-muted-foreground truncate max-w-xs">
            {template.description}
          </div>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{getCategoryLabel(template.category)}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {template.signerRoles?.map((role) => (
            <Badge key={role} variant="outline" className="text-xs">
              {role}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-sm">{getTriggerLabel(template.triggerOn)}</span>
          {template.autoSend && (
            <Badge variant="default" className="text-xs">Auto</Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {isConfigured ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {template.docuSealTemplateId}
            </Badge>
            {template.docuSealTemplateName && (
              <span className="text-xs text-muted-foreground truncate max-w-24">
                {template.docuSealTemplateName}
              </span>
            )}
          </div>
        ) : (
          <Badge variant="destructive" className="text-xs">
            <Unlink className="h-3 w-3 mr-1" />
            Not assigned
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={template.enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={updateMutation.isPending}
          />
          <span className="text-xs text-muted-foreground">
            {template.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={onAssign} title="Assign DocuSeal Template">
            <Link2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEditFieldMappings}
            title="Configure Field Mappings"
            disabled={!isConfigured}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewDocument}
            title="View Document"
            disabled={!isConfigured}
          >
            <FileText className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onPreview}
            title="Preview with Sample Data"
            disabled={!isConfigured}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onTestSend}
            title="Send Test Contract"
            disabled={!isConfigured}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// PREVIEW DIALOG
// ============================================================================

function PreviewDialog({
  template,
  open,
  onOpenChange,
}: {
  template: StateDocumentTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: preview, isLoading } = useTemplatePreview(template.id);
  const { data: validation } = useValidateMappings(template.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview: {template.name}</DialogTitle>
          <DialogDescription>
            Field values with sample data
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !preview ? (
          <div className="py-8 text-center text-muted-foreground">
            Failed to load preview
          </div>
        ) : (
          <div className="space-y-6">
            {/* Validation Warnings */}
            {validation && validation.warnings.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Validation Warnings ({validation.warnings.length})
                </Label>
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {validation.warnings.map((w, i) => (
                    <div
                      key={i}
                      className={`p-2 text-sm flex items-start gap-2 ${
                        w.level === 'error' ? 'bg-red-50 dark:bg-red-950' :
                        w.level === 'warning' ? 'bg-yellow-50 dark:bg-yellow-950' :
                        'bg-blue-50 dark:bg-blue-950'
                      }`}
                    >
                      {w.level === 'error' ? (
                        <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                      ) : w.level === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      )}
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Validation Summary */}
            {validation?.summary && (
              <div className="flex gap-4 text-sm">
                <Badge variant="outline">
                  {validation.summary.mapped}/{validation.summary.total} fields mapped
                </Badge>
                {validation.summary.errors > 0 && (
                  <Badge variant="destructive">
                    {validation.summary.errors} error(s)
                  </Badge>
                )}
                {validation.summary.warnings > 0 && (
                  <Badge variant="outline" className="text-yellow-600">
                    {validation.summary.warnings} warning(s)
                  </Badge>
                )}
              </div>
            )}

            {/* Field Preview */}
            <div className="space-y-2">
              <Label>Field Values</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(preview.preview).map(([fieldName, data]) => (
                    <TableRow key={fieldName}>
                      <TableCell className="font-mono text-sm">{fieldName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {data.source ? `${data.source}.${data.field}` : '-'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {data.value || <span className="text-muted-foreground italic">empty</span>}
                      </TableCell>
                      <TableCell>
                        {data.mapped ? (
                          <Badge variant="outline" className="text-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Mapped
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Unmapped
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Unmapped Fields Warning */}
            {preview.unmappedFields.length > 0 && (
              <div className="border border-yellow-500/50 rounded-md p-4 bg-yellow-50 dark:bg-yellow-950">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800 dark:text-yellow-200">
                      {preview.unmappedFields.length} Unmapped Field(s)
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {preview.unmappedFields.map((f, i) => (
                        <Badge key={i} variant={f.required ? 'destructive' : 'outline'}>
                          {f.name} [{f.type}]{f.required && ' (required)'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// TEST SEND DIALOG
// ============================================================================

function TestSendDialog({
  template,
  open,
  onOpenChange,
}: {
  template: StateDocumentTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [email, setEmail] = useState('');
  const testSendMutation = useTestSendTemplate(template.id);
  const { data: validation } = useValidateMappings(template.id);

  const handleSend = async () => {
    if (!email) {
      toast.error('Email is required');
      return;
    }

    try {
      const result = await testSendMutation.mutateAsync(email);
      toast.success(result.message || `Test contract sent to ${email}`);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to send test contract');
    }
  };

  const hasErrors = validation?.warnings.some(w => w.level === 'error');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Test Contract</DialogTitle>
          <DialogDescription>
            Send "{template.name}" with sample data to verify field mappings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Validation warnings */}
          {hasErrors && (
            <div className="border border-red-500/50 rounded-md p-4 bg-red-50 dark:bg-red-950">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-200">
                    Template has validation errors
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Some required fields are not mapped. The test contract may have missing data.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Recipient Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test@example.com"
            />
            <p className="text-xs text-muted-foreground">
              The contract will be sent to this email address with sample data filled in.
            </p>
          </div>

          <div className="border rounded-md p-4 bg-muted/50">
            <p className="text-sm">
              <strong>Note:</strong> This is a test submission. The document will be marked as "[TEST]"
              and should not be used for any legal purposes.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!email || testSendMutation.isPending}>
            {testSendMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Send className="h-4 w-4 mr-2" />
            Send Test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ASSIGN DIALOG
// ============================================================================

function AssignDialog({
  template,
  docuSealTemplates,
  open,
  onOpenChange,
  onClose,
}: {
  template: StateDocumentTemplate;
  docuSealTemplates: DocuSealTemplate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}) {
  const [selectedDocuSealId, setSelectedDocuSealId] = useState<string>(
    template.docuSealTemplateId > 0 ? template.docuSealTemplateId.toString() : ''
  );

  const assignMutation = useAssignDocuSealTemplate(template.id);

  const handleAssign = async () => {
    if (!selectedDocuSealId) return;

    try {
      await assignMutation.mutateAsync(parseInt(selectedDocuSealId));
      toast.success(`Assigned DocuSeal template ${selectedDocuSealId} to "${template.name}"`);
      onClose();
    } catch (error) {
      toast.error('Failed to assign template');
    }
  };

  const selectedDs = docuSealTemplates.find(ds => ds.id.toString() === selectedDocuSealId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign DocuSeal Template</DialogTitle>
          <DialogDescription>
            Select a DocuSeal template to use for "{template.name}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>DocuSeal Template</Label>
            <Select value={selectedDocuSealId} onValueChange={setSelectedDocuSealId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {docuSealTemplates.map((ds) => (
                  <SelectItem key={ds.id} value={ds.id.toString()}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{ds.id}</span>
                      <span>{ds.name}</span>
                      {ds.fieldsCount > 0 ? (
                        <Badge variant="outline" className="text-green-600 text-xs">
                          {ds.fieldsCount} fields
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-yellow-600 text-xs">
                          No fields
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedDs && selectedDs.fieldsCount > 0 && (
            <div className="space-y-2">
              <Label>Template Fields</Label>
              <div className="border rounded-md p-3 bg-muted/50 max-h-48 overflow-y-auto">
                <div className="flex flex-wrap gap-2">
                  {selectedDs.fields.map((field, i) => (
                    <Badge key={i} variant={field.required ? 'default' : 'outline'}>
                      {field.name || '(unnamed)'} [{field.type}]
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedDs && selectedDs.fieldsCount === 0 && (
            <div className="border rounded-md p-4 bg-yellow-50 dark:bg-yellow-950">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">No fields configured</p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    This template has no fields. You need to add fields in DocuSeal before data can be auto-populated.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!selectedDocuSealId || assignMutation.isPending}>
            {assignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Assign Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// CREATE DIALOG
// ============================================================================

function CreateTemplateDialog({
  open,
  onOpenChange,
  options,
  defaultState,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options?: {
    categories: Array<{ value: string; label: string; description: string }>;
    triggers: Array<{ value: string; label: string; description: string }>;
    signerRoles: Array<{ value: string; label: string; description: string }>;
    phases: Array<{ value: number; label: string; description: string }>;
  };
  defaultState: string;
}) {
  const [formData, setFormData] = useState({
    state: defaultState,
    category: '',
    name: '',
    description: '',
    phase: '',
    triggerOn: 'manual',
    autoSend: false,
    signerRoles: ['wholesaler'],
  });

  const createMutation = useCreateTemplate();

  const handleCreate = async () => {
    if (!formData.state || !formData.category || !formData.name) {
      toast.error('State, category, and name are required');
      return;
    }

    try {
      await createMutation.mutateAsync({
        ...formData,
        phase: formData.phase ? parseInt(formData.phase) : undefined,
        triggerOn: formData.triggerOn as 'manual' | 'phase_enter' | 'phase_complete',
      });
      toast.success(`Template "${formData.name}" created`);
      onOpenChange(false);
      setFormData({
        state: defaultState,
        category: '',
        name: '',
        description: '',
        phase: '',
        triggerOn: 'manual',
        autoSend: false,
        signerRoles: ['wholesaler'],
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to create template');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Template</DialogTitle>
          <DialogDescription>
            Add a new document template configuration
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>State</Label>
              <Input
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                placeholder="OK"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Phase</Label>
              <Select value={formData.phase} onValueChange={(v) => setFormData({ ...formData, phase: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select phase" />
                </SelectTrigger>
                <SelectContent>
                  {options?.phases.map((p) => (
                    <SelectItem key={p.value} value={p.value.toString()}>
                      {p.label} - {p.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {options?.categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label} - {c.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Template display name"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Trigger</Label>
              <Select value={formData.triggerOn} onValueChange={(v) => setFormData({ ...formData, triggerOn: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options?.triggers.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Auto-send</Label>
              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  checked={formData.autoSend}
                  onCheckedChange={(checked) => setFormData({ ...formData, autoSend: checked })}
                />
                <span className="text-sm text-muted-foreground">
                  {formData.autoSend ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// DOCUMENT PREVIEW DIALOG
// ============================================================================

function DocumentPreviewDialog({
  template,
  open,
  onOpenChange,
}: {
  template: StateDocumentTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: docInfo, isLoading, error } = useTemplateDocument(template.id);
  const [selectedDoc, setSelectedDoc] = useState(0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {template.name}
          </DialogTitle>
          <DialogDescription>
            View the document template
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <p className="text-muted-foreground">Failed to load document preview</p>
            <p className="text-sm text-red-500 mt-2">{(error as Error).message}</p>
          </div>
        ) : !docInfo?.documents?.length ? (
          <div className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No document available</p>
            <p className="text-sm text-muted-foreground mt-2">
              The template may not have a document attached yet.
            </p>
            {docInfo?.editorUrl && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => window.open(docInfo.editorUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in DocuSeal
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Document tabs if multiple */}
            {docInfo.documents.length > 1 && (
              <div className="flex gap-2 border-b pb-2">
                {docInfo.documents.map((doc, i) => (
                  <Button
                    key={i}
                    variant={selectedDoc === i ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setSelectedDoc(i)}
                  >
                    {doc.name || `Document ${i + 1}`}
                  </Button>
                ))}
              </div>
            )}

            {/* PDF Embed */}
            <div className="border rounded-lg overflow-hidden bg-muted/50" style={{ height: '60vh' }}>
              <iframe
                src={docInfo.documents[selectedDoc]?.url}
                className="w-full h-full"
                title={`Document Preview - ${template.name}`}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                DocuSeal Template ID: <Badge variant="outline" className="font-mono ml-1">{docInfo.docuSealTemplateId}</Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(docInfo.documents[selectedDoc]?.url, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open PDF
                </Button>
                {docInfo.editorUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(docInfo.editorUrl, '_blank')}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Edit in DocuSeal
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
