'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Loader2,
  FolderOpen,
  Plus,
  X,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileSignature,
  ClipboardCheck,
  DollarSign,
  ShieldAlert,
  Camera,
  Eye,
  ChevronDown,
  ChevronUp,
  Send,
  Bell,
  RefreshCw,
  Link2,
  Unlink,
  Circle,
  FileCheck,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useUnifiedDocuments,
  useLinkDocumentToCompliance,
  useUnlinkDocumentFromCompliance,
  getUnifiedStatusDisplay,
  getPhaseName,
  isDocumentComplete,
  documentNeedsAttention,
  type UnifiedDocument,
  type UnifiedDocumentStatus,
  PHASE_NAMES,
} from '@/hooks/use-unified-documents';
import {
  useUploadDocuments,
  useDeleteDocument,
  getDocumentDownloadUrl,
  formatFileSize,
} from '@/hooks/use-property-documents';
import {
  useSendDocument,
  useSendDocumentReminder,
  useSyncDocumentStatus,
} from '@/hooks/use-document-checklist';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/hooks/use-document-templates';

// Document type icons config
const documentTypeIcons: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  contract: { icon: FileSignature, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  inspection: { icon: ClipboardCheck, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  appraisal: { icon: DollarSign, color: 'text-green-400', bgColor: 'bg-green-500/10' },
  disclosure: { icon: ShieldAlert, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  photo: { icon: Camera, color: 'text-pink-400', bgColor: 'bg-pink-500/10' },
  title: { icon: FileText, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10' },
  other: { icon: FileText, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10' },
  signed_contract: { icon: FileCheck, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
};

interface UnifiedDocumentSectionProps {
  propertyId: string;
  propertyState?: string;
  transactionType?: 'wholesaling' | 'retail' | 'all';
  propertyAddress?: string;
}

export function UnifiedDocumentSection({
  propertyId,
  propertyState,
  transactionType = 'wholesaling',
  propertyAddress,
}: UnifiedDocumentSectionProps) {
  const [activeTab, setActiveTab] = useState<'required' | 'all' | 'signed'>('required');
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([0, 1, 2]));
  const [showUploadArea, setShowUploadArea] = useState(false);
  const [isUploadDragging, setIsUploadDragging] = useState(false);
  const [selectedUploadType, setSelectedUploadType] = useState<string>('other');
  const [selectedComplianceCategory, setSelectedComplianceCategory] = useState<string>('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [docToLink, setDocToLink] = useState<UnifiedDocument | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<UnifiedDocument | null>(null);
  const [signerEmail, setSignerEmail] = useState('');
  const [signerName, setSignerName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch unified documents
  const {
    phaseGroups,
    allDocuments,
    uploadedDocuments,
    signedDocuments,
    requiredDocuments,
    otherDocuments,
    summary,
    isLoading,
    isError,
    error,
  } = useUnifiedDocuments(propertyId, { state: propertyState, transactionType });

  // Mutations
  const uploadMutation = useUploadDocuments(propertyId);
  const deleteMutation = useDeleteDocument();
  const linkMutation = useLinkDocumentToCompliance();
  const unlinkMutation = useUnlinkDocumentFromCompliance();
  const sendDocument = useSendDocument();
  const sendReminder = useSendDocumentReminder();
  const syncStatus = useSyncDocumentStatus();

  // Toggle phase expansion
  const togglePhase = (phase: number) => {
    setExpandedPhases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(phase)) {
        newSet.delete(phase);
      } else {
        newSet.add(phase);
      }
      return newSet;
    });
  };

  // Handle file upload
  const handleUploadDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsUploadDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      try {
        const result = await uploadMutation.mutateAsync({
          files,
          documentType: selectedUploadType,
        });
        if (result.errors && result.errors.length > 0) {
          toast.error(`Upload failed: ${result.errors[0].error}`);
        } else if (result.documents && result.documents.length > 0) {
          toast.success(`${result.documents.length} document(s) uploaded`);

          // If a compliance category was selected, link the documents
          if (selectedComplianceCategory && result.documents.length === 1) {
            await linkMutation.mutateAsync({
              documentId: result.documents[0].id,
              complianceCategory: selectedComplianceCategory,
            });
            toast.success('Document linked to requirement');
          }
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to upload');
      }
    },
    [uploadMutation, selectedUploadType, selectedComplianceCategory, linkMutation]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      try {
        const result = await uploadMutation.mutateAsync({
          files,
          documentType: selectedUploadType,
        });
        if (result.errors && result.errors.length > 0) {
          toast.error(`Upload failed: ${result.errors[0].error}`);
        } else if (result.documents && result.documents.length > 0) {
          toast.success(`${result.documents.length} document(s) uploaded`);

          if (selectedComplianceCategory && result.documents.length === 1) {
            await linkMutation.mutateAsync({
              documentId: result.documents[0].id,
              complianceCategory: selectedComplianceCategory,
            });
          }
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to upload');
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [uploadMutation, selectedUploadType, selectedComplianceCategory, linkMutation]
  );

  // Handle document deletion
  const handleDelete = async (doc: UnifiedDocument) => {
    if (doc.type !== 'uploaded' || !doc.uploadedDoc) {
      toast.error('Only uploaded documents can be deleted');
      return;
    }

    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;

    try {
      await deleteMutation.mutateAsync({
        documentId: doc.uploadedDoc.id,
        propertyId,
      });
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete document');
    }
  };

  // Handle download
  const handleDownload = (doc: UnifiedDocument) => {
    if (doc.downloadUrl) {
      window.open(doc.downloadUrl, '_blank');
    } else if (doc.uploadedDoc) {
      const url = getDocumentDownloadUrl(doc.uploadedDoc.id);
      const token = localStorage.getItem('dispotree_token');
      const link = document.createElement('a');
      link.href = `${url}?token=${token}`;
      link.target = '_blank';
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Handle linking document to compliance category
  const openLinkDialog = (doc: UnifiedDocument) => {
    setDocToLink(doc);
    setLinkDialogOpen(true);
  };

  const handleLinkDocument = async (category: string) => {
    if (!docToLink || !docToLink.uploadedDoc) return;

    try {
      await linkMutation.mutateAsync({
        documentId: docToLink.uploadedDoc.id,
        complianceCategory: category,
      });
      toast.success('Document linked to requirement');
      setLinkDialogOpen(false);
      setDocToLink(null);
    } catch {
      toast.error('Failed to link document');
    }
  };

  const handleUnlinkDocument = async (doc: UnifiedDocument) => {
    if (!doc.uploadedDoc) return;

    try {
      await unlinkMutation.mutateAsync({ documentId: doc.uploadedDoc.id });
      toast.success('Document unlinked');
    } catch {
      toast.error('Failed to unlink document');
    }
  };

  // Handle sending document for signature
  const openSendDialog = (doc: UnifiedDocument) => {
    setSelectedRequirement(doc);
    setSendDialogOpen(true);
  };

  const handleSendDocument = async () => {
    if (!selectedRequirement || !selectedRequirement.requirement || !signerEmail) return;

    try {
      await sendDocument.mutateAsync({
        templateId: selectedRequirement.requirement.templateId,
        propertyId,
        signers: [
          {
            email: signerEmail,
            name: signerName || undefined,
            role: 'signer',
          },
        ],
        expiresInDays: 7,
      });
      toast.success(`${selectedRequirement.name} sent for signature`);
      setSendDialogOpen(false);
      setSelectedRequirement(null);
      setSignerEmail('');
      setSignerName('');
    } catch {
      toast.error('Failed to send document');
    }
  };

  // Handle sending reminder
  const handleSendReminder = async (doc: UnifiedDocument) => {
    if (!doc.requirement?.submissionId) return;

    try {
      await sendReminder.mutateAsync({
        submissionId: doc.requirement.submissionId,
        propertyId,
      });
      toast.success('Reminder sent');
    } catch {
      toast.error('Failed to send reminder');
    }
  };

  // Handle syncing status
  const handleSyncStatus = async (doc: UnifiedDocument) => {
    if (!doc.requirement?.submissionId) return;

    try {
      await syncStatus.mutateAsync({
        submissionId: doc.requirement.submissionId,
        propertyId,
      });
      toast.success('Status synced');
    } catch {
      toast.error('Failed to sync status');
    }
  };

  // Get icon for document
  const getDocIcon = (doc: UnifiedDocument) => {
    const category = doc.category || doc.uploadedDoc?.documentType || 'other';
    const config = documentTypeIcons[category] || documentTypeIcons.other;
    return config;
  };

  // Render a single document row
  const renderDocumentRow = (doc: UnifiedDocument, showActions = true) => {
    const statusDisplay = getUnifiedStatusDisplay(doc.status);
    const iconConfig = getDocIcon(doc);
    const DocIcon = iconConfig.icon;
    const needsAttention = documentNeedsAttention(doc);
    const isComplete = isDocumentComplete(doc);

    return (
      <div
        key={doc.id}
        className={cn(
          'group p-3 rounded-lg transition-all border',
          needsAttention
            ? 'bg-red-500/5 border-red-500/20'
            : isComplete
            ? 'bg-green-500/5 border-green-500/20'
            : 'bg-secondary/50 border-transparent hover:border-border'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn('flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center', iconConfig.bgColor)}>
            <DocIcon className={cn('h-5 w-5', iconConfig.color)} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-foreground font-medium truncate">{doc.name}</span>
              <Badge
                variant="outline"
                className={cn('text-xs', statusDisplay.color, statusDisplay.bgColor)}
              >
                {statusDisplay.label}
              </Badge>
              {doc.required && (
                <Badge variant="outline" className="text-xs text-amber-400 bg-amber-500/10 border-amber-500/20">
                  Required
                </Badge>
              )}
            </div>

            {/* Meta info */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {doc.uploadedDoc && (
                <>
                  <span>{formatFileSize(doc.uploadedDoc.fileSize)}</span>
                  <span>•</span>
                </>
              )}
              {doc.createdAt && (
                <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
              )}
              {doc.category && (
                <>
                  <span>•</span>
                  <span className="capitalize">{doc.category.replace(/_/g, ' ')}</span>
                </>
              )}
            </div>

            {/* Submission status info */}
            {doc.requirement?.alreadySent && doc.requirement.submissionStatus && (
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <span>Sent {doc.requirement.sentAt ? new Date(doc.requirement.sentAt).toLocaleDateString() : ''}</span>
                {doc.requirement.submissionStatus === 'completed' && doc.requirement.completedAt && (
                  <span className="text-green-400">• Signed {new Date(doc.requirement.completedAt).toLocaleDateString()}</span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          {showActions && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Download */}
              {(doc.downloadUrl || doc.uploadedDoc) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDownload(doc)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}

              {/* Link to requirement (for unlinked uploads) */}
              {doc.type === 'uploaded' && !doc.category && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openLinkDialog(doc)}
                  className="h-8 w-8 text-muted-foreground hover:text-cyan-400"
                  title="Link to requirement"
                >
                  <Link2 className="h-4 w-4" />
                </Button>
              )}

              {/* Unlink (for linked uploads) */}
              {doc.type === 'uploaded' && doc.category && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleUnlinkDocument(doc)}
                  className="h-8 w-8 text-muted-foreground hover:text-amber-400"
                  title="Unlink from requirement"
                >
                  <Unlink className="h-4 w-4" />
                </Button>
              )}

              {/* Send for signature (for unsent requirements) */}
              {doc.type === 'requirement' && doc.status === 'not_sent' && doc.requirement && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openSendDialog(doc)}
                  className="h-8 px-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                >
                  <Send className="h-4 w-4 mr-1" />
                  Send
                </Button>
              )}

              {/* Reminder (for pending) */}
              {doc.status === 'pending' && doc.requirement?.submissionId && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSendReminder(doc)}
                    className="h-8 w-8 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                    title="Send reminder"
                  >
                    <Bell className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSyncStatus(doc)}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="Sync status"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </>
              )}

              {/* View signed document */}
              {doc.status === 'signed' && doc.downloadUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(doc.downloadUrl, '_blank')}
                  className="h-8 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  View
                </Button>
              )}

              {/* Delete (for uploads only) */}
              {doc.type === 'uploaded' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(doc)}
                  className="h-8 w-8 text-muted-foreground hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <FolderOpen className="h-5 w-5 text-cyan-500" />
            Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (isError) {
    console.error('UnifiedDocumentSection error:', error);
    return (
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <FolderOpen className="h-5 w-5 text-cyan-500" />
            Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6">
            <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load documents</p>
            {error && (
              <p className="text-xs text-muted-foreground/70 mt-1">{error.message}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-foreground">
              <FolderOpen className="h-5 w-5 text-cyan-500" />
              Documents
              {allDocuments.length > 0 && (
                <Badge variant="outline" className="ml-2 bg-secondary text-muted-foreground">
                  {allDocuments.length}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {propertyState && (
                <Badge variant="outline" className="text-muted-foreground">
                  {propertyState}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  summary.totalRequired > 0 && summary.totalCompleted === summary.totalRequired
                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                    : summary.totalPending > 0
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'text-muted-foreground'
                )}
              >
                {summary.totalCompleted}/{summary.totalRequired} complete
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Progress Bar */}
          {summary.totalRequired > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Required Documents</span>
                <span className="text-foreground font-medium">{summary.completionPercentage}%</span>
              </div>
              <Progress value={summary.completionPercentage} className="h-2 bg-secondary" />
            </div>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid w-full grid-cols-3 bg-secondary">
              <TabsTrigger value="required" className="data-[state=active]:bg-card">
                Required ({summary.totalRequired})
              </TabsTrigger>
              <TabsTrigger value="all" className="data-[state=active]:bg-card">
                All ({allDocuments.length})
              </TabsTrigger>
              <TabsTrigger value="signed" className="data-[state=active]:bg-card">
                Signed ({summary.totalSigned})
              </TabsTrigger>
            </TabsList>

            {/* Required Documents Tab - Phase Grouped */}
            <TabsContent value="required" className="space-y-3 mt-4">
              {phaseGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No requirements configured</p>
                </div>
              ) : (
                phaseGroups.map((group) => (
                  <div key={group.phase} className="border rounded-lg overflow-hidden">
                    {/* Phase Header */}
                    <button
                      onClick={() => togglePhase(group.phase)}
                      className="w-full flex items-center justify-between p-3 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {expandedPhases.has(group.phase) ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium text-foreground">
                          Phase {group.phase}: {group.name}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          group.totalCompleted === group.totalRequired
                            ? 'bg-green-500/10 text-green-400 border-green-500/30'
                            : 'text-muted-foreground'
                        )}
                      >
                        {group.totalCompleted}/{group.totalRequired}
                      </Badge>
                    </button>

                    {/* Phase Documents */}
                    {expandedPhases.has(group.phase) && (
                      <div className="p-3 space-y-2">
                        {group.documents.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            No documents for this phase
                          </p>
                        ) : (
                          group.documents.map((doc) => renderDocumentRow(doc))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Other Documents (unlinked) */}
              {otherDocuments.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="p-3 bg-secondary/30">
                    <span className="text-sm font-medium text-muted-foreground">
                      Other Documents (Not Linked)
                    </span>
                  </div>
                  <div className="p-3 space-y-2">
                    {otherDocuments.map((doc) => renderDocumentRow(doc))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* All Documents Tab */}
            <TabsContent value="all" className="space-y-2 mt-4">
              {allDocuments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No documents yet</p>
                </div>
              ) : (
                allDocuments.map((doc) => renderDocumentRow(doc))
              )}
            </TabsContent>

            {/* Signed Documents Tab */}
            <TabsContent value="signed" className="space-y-2 mt-4">
              {signedDocuments.filter(d => d.status === 'signed').length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <FileCheck className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No signed documents yet</p>
                </div>
              ) : (
                signedDocuments
                  .filter(d => d.status === 'signed')
                  .map((doc) => renderDocumentRow(doc))
              )}
            </TabsContent>
          </Tabs>

          {/* Upload Area */}
          {!showUploadArea ? (
            <Button
              variant="outline"
              className="w-full border-2 border-dashed hover:border-cyan-500 hover:bg-cyan-500/10 transition-all"
              onClick={() => setShowUploadArea(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Upload Documents
            </Button>
          ) : (
            <div className="space-y-3 p-4 border rounded-lg bg-secondary/20">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Upload Documents</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUploadArea(false)}
                  className="h-8 px-2"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Link to requirement selector */}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  Link to requirement:
                </Label>
                <Select
                  value={selectedComplianceCategory || '_none'}
                  onValueChange={(val) => setSelectedComplianceCategory(val === '_none' ? '' : val)}
                >
                  <SelectTrigger className="flex-1 h-8 text-xs bg-secondary">
                    <SelectValue placeholder="None (upload only)" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border">
                    <SelectItem value="_none">None (upload only)</SelectItem>
                    {DOCUMENT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsUploadDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsUploadDragging(false);
                }}
                onDrop={handleUploadDrop}
                className={cn(
                  'border-2 border-dashed rounded-lg p-6 transition-all text-center',
                  isUploadDragging
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.txt,.md,.zip"
                />

                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-8 w-8 text-cyan-500 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Uploading...</p>
                  </>
                ) : (
                  <>
                    <Upload
                      className={cn(
                        'h-8 w-8 mx-auto mb-2',
                        isUploadDragging ? 'text-cyan-500' : 'text-muted-foreground'
                      )}
                    />
                    <p className="text-sm text-muted-foreground">
                      Drag & drop or{' '}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-cyan-500 hover:underline"
                      >
                        browse
                      </button>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PDF, Word, Excel, Images, up to 10MB
                    </p>
                  </>
                )}
              </div>

              {/* Document type selector */}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  Upload as:
                </Label>
                <Select value={selectedUploadType} onValueChange={setSelectedUploadType}>
                  <SelectTrigger className="flex-1 h-8 text-xs bg-secondary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border">
                    {Object.entries(documentTypeIcons).map(([key, config]) => {
                      if (key === 'signed_contract') return null;
                      const Icon = config.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <Icon className={cn('h-3.5 w-3.5', config.color)} />
                            <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Link Document Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="bg-card border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-cyan-500" />
              Link to Requirement
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Link "{docToLink?.name}" to a compliance requirement
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {DOCUMENT_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => handleLinkDocument(cat.value)}
                className="w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary text-left transition-colors"
              >
                <p className="text-foreground font-medium">{cat.label}</p>
                <p className="text-muted-foreground text-xs">{cat.description}</p>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Document Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="bg-card border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-cyan-500" />
              Send for Signature
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Send {selectedRequirement?.name} via DocuSeal
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedRequirement && (
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-foreground font-medium">{selectedRequirement.name}</p>
                {selectedRequirement.description && (
                  <p className="text-muted-foreground text-sm">{selectedRequirement.description}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="signer-email">Signer Email *</Label>
              <Input
                id="signer-email"
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                className="bg-secondary border"
                placeholder="signer@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signer-name">Signer Name (optional)</Label>
              <Input
                id="signer-name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="bg-secondary border"
                placeholder="John Doe"
              />
            </div>

            <p className="text-muted-foreground text-xs">
              Document expires in 7 days. Property details will be auto-filled.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendDocument}
              disabled={!signerEmail || sendDocument.isPending}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {sendDocument.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
