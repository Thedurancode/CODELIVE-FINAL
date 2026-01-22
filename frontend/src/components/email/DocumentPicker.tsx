'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  FileText,
  Image,
  File,
  FileSpreadsheet,
  Loader2,
  Building2,
  FolderOpen,
  Check,
  X,
} from 'lucide-react';
import { useAllDocuments, type DocumentWithProperty } from '@/hooks/use-email-client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface DocumentPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (documents: DocumentWithProperty[]) => void;
  selectedDocuments?: DocumentWithProperty[];
}

const documentTypes = [
  { value: 'all', label: 'All Types' },
  { value: 'contract', label: 'Contracts' },
  { value: 'photo', label: 'Photos' },
  { value: 'inspection', label: 'Inspections' },
  { value: 'appraisal', label: 'Appraisals' },
  { value: 'disclosure', label: 'Disclosures' },
  { value: 'other', label: 'Other' },
];

function getDocumentIcon(mimeType: string, documentType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType === 'application/pdf') return FileText;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getPropertyAddress(property?: DocumentWithProperty['property']): string {
  if (!property) return 'Unknown Property';

  let address = '';
  if (typeof property.address === 'string') {
    address = property.address;
  } else if (property.address) {
    address = `${property.address.houseNumber || ''} ${property.address.street || ''}`.trim();
  }

  if (property.city) {
    address = address ? `${address}, ${property.city}` : property.city;
  }
  if (property.state) {
    address += ` ${property.state}`;
  }

  return address || 'Unknown Property';
}

export function DocumentPicker({
  open,
  onClose,
  onSelect,
  selectedDocuments = [],
}: DocumentPickerProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<number, DocumentWithProperty>>(
    () => new Map(selectedDocuments.map(d => [d.id, d]))
  );

  const { data, isLoading } = useAllDocuments({
    page,
    limit: 50,
    search: search || undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
  });

  const documents = data?.data || [];
  const pagination = data?.pagination;

  // Group documents by property
  const groupedDocuments = useMemo(() => {
    const groups = new Map<number, { property: DocumentWithProperty['property']; documents: DocumentWithProperty[] }>();

    for (const doc of documents) {
      const propertyId = doc.propertyId;
      if (!groups.has(propertyId)) {
        groups.set(propertyId, {
          property: doc.property,
          documents: [],
        });
      }
      groups.get(propertyId)!.documents.push(doc);
    }

    return Array.from(groups.values());
  }, [documents]);

  const handleToggleDocument = (doc: DocumentWithProperty) => {
    const newSelected = new Map(selected);
    if (newSelected.has(doc.id)) {
      newSelected.delete(doc.id);
    } else {
      newSelected.set(doc.id, doc);
    }
    setSelected(newSelected);
  };

  const handleConfirm = () => {
    onSelect(Array.from(selected.values()));
    onClose();
  };

  const handleClear = () => {
    setSelected(new Map());
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl h-[80vh] flex flex-col bg-card border">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-accent-500" />
            Attach Documents
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 bg-secondary border text-foreground"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40 bg-secondary border text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-secondary border">
              {documentTypes.map((type) => (
                <SelectItem key={type.value} value={type.value} className="text-foreground">
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Selected count */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between py-2 px-3 bg-accent-600/20 border border-accent-600/30 rounded-lg shrink-0">
            <span className="text-sm text-accent-400">
              {selected.size} document{selected.size !== 1 ? 's' : ''} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground h-7"
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        )}

        {/* Document list */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : groupedDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mb-3" />
              <p className="text-lg">No documents found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedDocuments.map((group, groupIndex) => (
                <div key={groupIndex} className="space-y-2">
                  {/* Property header */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground sticky top-0 bg-card py-1">
                    <Building2 className="h-4 w-4" />
                    <span>{getPropertyAddress(group.property)}</span>
                    <Badge variant="outline" className="text-xs border text-muted-foreground">
                      {group.documents.length} files
                    </Badge>
                  </div>

                  {/* Documents */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                    {group.documents.map((doc) => {
                      const Icon = getDocumentIcon(doc.mimeType, doc.documentType);
                      const isSelected = selected.has(doc.id);

                      return (
                        <button
                          key={doc.id}
                          onClick={() => handleToggleDocument(doc)}
                          className={cn(
                            'flex items-start gap-3 p-3 rounded-lg border text-left transition-all',
                            isSelected
                              ? 'bg-accent-600/20 border-accent-600/50'
                              : 'bg-secondary/50 border hover:bg-secondary'
                          )}
                        >
                          <div className={cn(
                            'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                            isSelected ? 'bg-accent-600' : 'bg-zinc-700'
                          )}>
                            {isSelected ? (
                              <Check className="h-5 w-5 text-foreground" />
                            ) : (
                              <Icon className="h-5 w-5 text-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              'text-sm font-medium truncate',
                              isSelected ? 'text-foreground' : 'text-foreground'
                            )}>
                              {doc.originalName}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge
                                variant="secondary"
                                className="text-xs bg-zinc-700 text-foreground"
                              >
                                {doc.documentType}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatFileSize(doc.fileSize)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border shrink-0">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="text-muted-foreground"
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {pagination.totalPages} ({pagination.total} documents)
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page === pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
              className="text-muted-foreground"
            >
              Next
            </Button>
          </div>
        )}

        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="bg-accent-600 hover:bg-accent-700"
          >
            Attach {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
