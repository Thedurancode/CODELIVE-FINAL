'use client';

/**
 * Field Mapping Editor
 *
 * Visual editor for configuring template field mappings.
 * Maps DocuSeal template fields to deal data sources.
 */

import { useState } from 'react';
import { useFieldMappings, useUpdateFieldMappings } from '@/hooks/use-template-admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ArrowRight, HelpCircle, Loader2, Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

interface FieldMapping {
  docuSealField: string;
  source: string;
  field: string;
  transform?: string;
}

interface FieldMappingEditorProps {
  templateId: number;
  templateName: string;
  currentMappings: Record<string, any> | undefined;
  docuSealFields?: Array<{ name: string; type: string; required: boolean }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FieldMappingEditor({
  templateId,
  templateName,
  currentMappings,
  docuSealFields,
  open,
  onOpenChange,
}: FieldMappingEditorProps) {
  const { data: fieldConfig } = useFieldMappings();
  const updateMutation = useUpdateFieldMappings(templateId);

  // Parse current mappings into array format
  const [mappings, setMappings] = useState<FieldMapping[]>(() => {
    if (!currentMappings) return [];
    return Object.entries(currentMappings).map(([docuSealField, value]) => {
      if (typeof value === 'string') {
        return { docuSealField, source: 'auto', field: value };
      }
      return {
        docuSealField,
        source: value.source || 'property',
        field: value.field || '',
        transform: value.transform,
      };
    });
  });

  const [newMapping, setNewMapping] = useState<FieldMapping>({
    docuSealField: '',
    source: 'property',
    field: '',
  });

  const handleAddMapping = () => {
    if (!newMapping.docuSealField || !newMapping.field) {
      toast.error('DocuSeal field name and source field are required');
      return;
    }

    if (mappings.some(m => m.docuSealField === newMapping.docuSealField)) {
      toast.error('This field is already mapped');
      return;
    }

    setMappings([...mappings, { ...newMapping }]);
    setNewMapping({ docuSealField: '', source: 'property', field: '' });
  };

  const handleRemoveMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const handleUpdateMapping = (index: number, updates: Partial<FieldMapping>) => {
    setMappings(mappings.map((m, i) => (i === index ? { ...m, ...updates } : m)));
  };

  const handleSave = async () => {
    // Convert array back to object format
    const fieldMappings: Record<string, any> = {};
    for (const m of mappings) {
      if (m.source === 'auto') {
        fieldMappings[m.docuSealField] = m.field;
      } else {
        fieldMappings[m.docuSealField] = {
          source: m.source,
          field: m.field,
          ...(m.transform && { transform: m.transform }),
        };
      }
    }

    try {
      await updateMutation.mutateAsync(fieldMappings);
      toast.success('Field mappings saved');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save field mappings');
    }
  };

  const handleAutoMap = () => {
    if (!docuSealFields?.length) return;

    const defaultMappings = fieldConfig?.defaultMappings || {};
    const newMappings: FieldMapping[] = [];

    for (const dsField of docuSealFields) {
      const fieldName = dsField.name || '';
      if (!fieldName) continue;

      // Check if already mapped
      if (mappings.some(m => m.docuSealField === fieldName)) continue;

      // Check if there's a default mapping
      const defaultMapping = defaultMappings[fieldName];
      if (defaultMapping) {
        newMappings.push({
          docuSealField: fieldName,
          source: defaultMapping.source || 'auto',
          field: defaultMapping.field,
        });
      }
    }

    if (newMappings.length > 0) {
      setMappings([...mappings, ...newMappings]);
      toast.success(`Auto-mapped ${newMappings.length} field(s)`);
    } else {
      toast.info('No additional fields could be auto-mapped');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Field Mappings: {templateName}</DialogTitle>
          <DialogDescription>
            Configure how deal data maps to DocuSeal template fields
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* DocuSeal Fields (if available) */}
          {docuSealFields && docuSealFields.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>DocuSeal Template Fields</Label>
                <Button variant="outline" size="sm" onClick={handleAutoMap}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Auto-Map
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/50">
                {docuSealFields.map((f, i) => (
                  <Badge
                    key={i}
                    variant={f.required ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => {
                      if (!mappings.some(m => m.docuSealField === f.name)) {
                        setNewMapping({ ...newMapping, docuSealField: f.name || '' });
                      }
                    }}
                  >
                    {f.name || '(unnamed)'} [{f.type}]
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Current Mappings */}
          <div className="space-y-2">
            <Label>Current Mappings ({mappings.length})</Label>
            {mappings.length === 0 ? (
              <div className="p-4 border rounded-md text-center text-muted-foreground">
                No custom mappings. Default mappings will be used.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DocuSeal Field</TableHead>
                    <TableHead></TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Transform</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{m.docuSealField}</TableCell>
                      <TableCell>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={m.source}
                          onValueChange={(v) => handleUpdateMapping(i, { source: v })}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            {fieldConfig?.sources.map((s) => (
                              <SelectItem key={s.name} value={s.name}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={m.field}
                          onChange={(e) => handleUpdateMapping(i, { field: e.target.value })}
                          className="w-40 font-mono text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={m.transform || 'none'}
                          onValueChange={(v) => handleUpdateMapping(i, { transform: v === 'none' ? undefined : v })}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {fieldConfig?.transforms.map((t) => (
                              <SelectItem key={t.name} value={t.name}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMapping(i)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Add New Mapping */}
          <div className="space-y-2">
            <Label>Add Mapping</Label>
            <div className="flex items-center gap-2">
              <Input
                value={newMapping.docuSealField}
                onChange={(e) => setNewMapping({ ...newMapping, docuSealField: e.target.value })}
                placeholder="DocuSeal field name"
                className="flex-1 font-mono"
              />
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Select
                value={newMapping.source}
                onValueChange={(v) => setNewMapping({ ...newMapping, source: v })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  {fieldConfig?.sources.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={newMapping.field}
                onChange={(e) => setNewMapping({ ...newMapping, field: e.target.value })}
                placeholder="Source field"
                className="w-40 font-mono"
              />
              <Button onClick={handleAddMapping}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Help Section */}
          <Accordion type="single" collapsible>
            <AccordionItem value="help">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Available Fields & Transforms
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Default Field Mappings</h4>
                    <div className="max-h-64 overflow-y-auto space-y-1 text-sm">
                      {fieldConfig?.defaultMappings &&
                        Object.entries(fieldConfig.defaultMappings).map(([name, config]) => (
                          <div key={name} className="flex justify-between">
                            <code className="text-xs">{name}</code>
                            <span className="text-muted-foreground text-xs truncate max-w-32">
                              {config.description}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Transforms</h4>
                    <div className="space-y-2 text-sm">
                      {fieldConfig?.transforms.map((t) => (
                        <div key={t.name}>
                          <code className="text-xs">{t.name}</code>
                          <span className="text-muted-foreground text-xs ml-2">
                            {t.example}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Mappings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FieldMappingEditor;
