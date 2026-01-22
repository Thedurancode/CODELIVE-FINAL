'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
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
  ChevronLeft,
  ChevronRight,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Archive,
  GripVertical,
  Mail,
  Pencil,
  Tag,
  RefreshCw,
  Send,
  FileCheck,
  User,
  Sparkles,
  Brain,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDocumentDrop } from './DocumentDropContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  usePropertyDocuments,
  useUploadDocuments,
  useDeleteDocument,
  useUpdateDocumentType,
  useRenameDocument,
  useClassifyDocument,
  useClassifyAllDocuments,
  getDocumentDownloadUrl,
  formatFileSize,
  getConfidenceLabel,
  formatClassificationSource,
  type PropertyDocument,
  type DocumentClassification,
} from '@/hooks/use-property-documents';
import {
  useSignedContracts,
  useSendContractReminder,
  useSyncContractStatus,
  getContractStatusDisplay,
  formatContractDate,
  type SignedContract,
} from '@/hooks/use-signed-contracts';

const documentTypeConfig: Record<
  string,
  { label: string; color: string; icon: React.ElementType; iconColor: string; bgColor: string }
> = {
  contract: {
    label: 'Contract',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    icon: FileSignature,
    iconColor: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  inspection: {
    label: 'Inspection',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    icon: ClipboardCheck,
    iconColor: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  appraisal: {
    label: 'Appraisal',
    color: 'bg-green-500/10 text-green-400 border-green-500/20',
    icon: DollarSign,
    iconColor: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  disclosure: {
    label: 'Disclosure',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    icon: ShieldAlert,
    iconColor: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  photo: {
    label: 'Photo',
    color: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    icon: Camera,
    iconColor: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
  },
  title: {
    label: 'Title',
    color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    icon: FileText,
    iconColor: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
  },
  other: {
    label: 'Other',
    color: 'bg-zinc-500/10 text-muted-foreground border-zinc-500/20',
    icon: FileText,
    iconColor: 'text-muted-foreground',
    bgColor: 'bg-zinc-500/10',
  },
  signed_contract: {
    label: 'Signed Contract',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: FileCheck,
    iconColor: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
};

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  ready: { icon: CheckCircle2, color: 'text-green-500', label: 'Ready' },
  uploading: { icon: Loader2, color: 'text-blue-500', label: 'Uploading' },
  processing: { icon: Clock, color: 'text-amber-500', label: 'Processing' },
  classifying: { icon: Loader2, color: 'text-cyan-500', label: 'Classifying' },
  failed: { icon: AlertCircle, color: 'text-red-500', label: 'Failed' },
};

interface PropertyDocumentsSectionProps {
  propertyId: string;
  propertyAddress?: string;
}

export function PropertyDocumentsSection({ propertyId, propertyAddress }: PropertyDocumentsSectionProps) {
  const [isUploadDragging, setIsUploadDragging] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('other');
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<UnifiedDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [renameDoc, setRenameDoc] = useState<UnifiedDocument | null>(null);
  const [newName, setNewName] = useState('');
  const [showUploadArea, setShowUploadArea] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Document drop context for drag-to-contact functionality
  const documentDropContext = useDocumentDrop();
  const {
    selectedDocuments,
    toggleDocumentSelection,
    selectAllDocuments,
    clearSelection,
    isSelected,
    setAllDocuments,
    isDragging: isDocDragging,
  } = documentDropContext || {
    selectedDocuments: [],
    toggleDocumentSelection: () => {},
    selectAllDocuments: () => {},
    clearSelection: () => {},
    isSelected: () => false,
    setAllDocuments: () => {},
    isDragging: false,
  };

  const { data, isLoading, error, refetch } = usePropertyDocuments(propertyId);
  const uploadMutation = useUploadDocuments(propertyId);
  const deleteMutation = useDeleteDocument();
  const updateTypeMutation = useUpdateDocumentType();
  const renameMutation = useRenameDocument();
  const classifyMutation = useClassifyDocument();
  const classifyAllMutation = useClassifyAllDocuments();

  // Signed contracts from DocuSeal
  const {
    data: signedContractsData,
    isLoading: isLoadingSignedContracts,
    refetch: refetchSignedContracts,
  } = useSignedContracts(propertyId);
  const sendReminderMutation = useSendContractReminder();
  const syncStatusMutation = useSyncContractStatus();

  const documents = data?.documents || [];
  const signedContracts = signedContractsData || [];

  // Create unified document type that includes both regular docs and signed contracts
  type UnifiedDocument = Omit<PropertyDocument, 'documentType'> & {
    documentType: PropertyDocument['documentType'] | 'signed_contract';
    // Additional fields for signed contracts
    isSignedContract?: boolean;
    signedContractData?: SignedContract;
  };

  // Transform signed contracts into unified document format
  const transformedSignedContracts: UnifiedDocument[] = signedContracts
    .filter((sc) => sc.status === 'completed') // Only show completed signed contracts
    .map((sc) => ({
      id: sc.id,
      propertyId: Number(propertyId),
      documentType: 'signed_contract' as const,
      fileName: sc.templateName || 'Signed Contract',
      originalName: sc.templateName || 'Signed Contract',
      mimeType: 'application/pdf',
      fileSize: 0, // Not available from DocuSeal
      storageKey: sc.combinedDocumentUrl || '',
      uploadedBy: undefined,
      status: 'ready' as const,
      metadata: undefined,
      createdAt: sc.completedAt || sc.createdAt,
      updatedAt: sc.updatedAt,
      isSignedContract: true,
      signedContractData: sc,
    }));

  // Combine all documents
  const allDocuments: UnifiedDocument[] = [...documents, ...transformedSignedContracts];

  // Separate into groups
  const regularDocuments = allDocuments.filter((doc) => !doc.isSignedContract);
  const signedContractDocuments = allDocuments.filter((doc) => doc.isSignedContract);

  // Open rename dialog
  const openRenameDialog = useCallback((doc: UnifiedDocument) => {
    // Prevent renaming signed contracts
    if (doc.isSignedContract) {
      toast.error('Signed contracts cannot be renamed');
      return;
    }
    setRenameDoc(doc);
    setNewName(doc.originalName);
  }, []);

  // Close rename dialog
  const closeRenameDialog = useCallback(() => {
    setRenameDoc(null);
    setNewName('');
  }, []);

  // Handle rename submit
  const handleRename = useCallback(async () => {
    if (!renameDoc || !newName.trim()) return;

    // Prevent renaming signed contracts (extra safety check)
    if (renameDoc.isSignedContract) {
      toast.error('Signed contracts cannot be renamed');
      closeRenameDialog();
      return;
    }

    // Don't rename if name hasn't changed
    if (newName.trim() === renameDoc.originalName) {
      closeRenameDialog();
      return;
    }

    try {
      await renameMutation.mutateAsync({
        documentId: renameDoc.id,
        propertyId,
        originalName: newName.trim(),
      });
      toast.success('Document renamed');
      closeRenameDialog();
    } catch (error) {
      toast.error('Failed to rename document');
    }
  }, [renameDoc, newName, renameMutation, propertyId, closeRenameDialog]);

  // Handle changing document type
  const handleChangeType = useCallback(
    async (doc: UnifiedDocument, newType: string) => {
      // Prevent changing type of signed contracts
      if (doc.isSignedContract) {
        toast.error('Signed contract types cannot be changed');
        return;
      }
      if (doc.documentType === newType) return;

      try {
        await updateTypeMutation.mutateAsync({
          documentId: doc.id,
          propertyId,
          documentType: newType,
        });
        toast.success(`Changed to ${documentTypeConfig[newType]?.label || newType}`);
      } catch (error) {
        toast.error('Failed to update document type');
      }
    },
    [updateTypeMutation, propertyId]
  );

  // Handle classifying a single document
  const handleClassifyDocument = useCallback(
    async (doc: UnifiedDocument) => {
      if (doc.isSignedContract) {
        toast.error('Signed contracts cannot be classified');
        return;
      }

      try {
        toast.loading('Classifying document...', { id: `classify-${doc.id}` });
        const result = await classifyMutation.mutateAsync({
          documentId: doc.id,
          propertyId,
        });
        toast.dismiss(`classify-${doc.id}`);

        if (result.wasAutoApplied) {
          toast.success(
            `Classified as ${documentTypeConfig[result.classification.classifiedType]?.label || result.classification.classifiedType}` +
            ` (${(result.classification.confidence * 100).toFixed(0)}% confidence)`
          );
        } else {
          toast.success(
            `Classification: ${documentTypeConfig[result.classification.classifiedType]?.label || result.classification.classifiedType}` +
            ` (${(result.classification.confidence * 100).toFixed(0)}% confidence - review suggested)`
          );
        }
        await refetch();
      } catch (error) {
        toast.dismiss(`classify-${doc.id}`);
        toast.error('Failed to classify document');
      }
    },
    [classifyMutation, propertyId, refetch]
  );

  // Handle classifying all documents
  const handleClassifyAllDocuments = useCallback(async () => {
    try {
      toast.loading('Classifying all documents...', { id: 'classify-all' });
      const result = await classifyAllMutation.mutateAsync({
        propertyId,
        forceReclassify: false,
        autoApply: true,
      });
      toast.dismiss('classify-all');

      toast.success(
        `Classified ${result.summary.classified} documents` +
        (result.summary.skipped > 0 ? `, ${result.summary.skipped} skipped` : '') +
        (result.summary.failed > 0 ? `, ${result.summary.failed} failed` : '')
      );
      await refetch();
    } catch (error) {
      toast.dismiss('classify-all');
      toast.error('Failed to classify documents');
    }
  }, [classifyAllMutation, propertyId, refetch]);

  // Keep context updated with all documents for drag handling
  // Use documents.length as dependency to avoid infinite loops from array reference changes
  useEffect(() => {
    if (setAllDocuments && documents.length > 0) {
      setAllDocuments(documents);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents.length]);

  // Toggle selection mode
  const toggleSelectionMode = useCallback(() => {
    if (selectionMode) {
      clearSelection();
    }
    setSelectionMode(!selectionMode);
  }, [selectionMode, clearSelection]);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (selectedDocuments.length === allDocuments.length) {
      clearSelection();
    } else {
      selectAllDocuments(allDocuments as unknown as PropertyDocument[]);
    }
  }, [allDocuments, selectedDocuments.length, selectAllDocuments, clearSelection]);

  // Download all documents as ZIP
  const handleDownloadAll = useCallback(async () => {
    if (documents.length === 0) {
      toast.error('No documents to download');
      return;
    }

    setIsDownloadingAll(true);
    toast.info('Preparing download...');

    try {
      // Dynamically import JSZip
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Create a sanitized folder name from property address
      const folderName = propertyAddress
        ? propertyAddress.replace(/[^a-zA-Z0-9\s-]/g, '').trim().substring(0, 50)
        : `Property-${propertyId}`;

      const folder = zip.folder(folderName);
      if (!folder) {
        throw new Error('Failed to create ZIP folder');
      }

      // Download each document and add to ZIP
      let successCount = 0;
      const token = localStorage.getItem('dispotree_token');

      for (const doc of documents) {
        try {
          const url = getDocumentDownloadUrl(doc.id);
          const response = await fetch(url, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          });

          if (!response.ok) {
            console.error(`Failed to download ${doc.originalName}: ${response.status}`);
            continue;
          }

          const blob = await response.blob();
          folder.file(doc.originalName, blob);
          successCount++;
        } catch (err) {
          console.error(`Error downloading ${doc.originalName}:`, err);
        }
      }

      if (successCount === 0) {
        throw new Error('Failed to download any documents');
      }

      // Generate and download ZIP
      const content = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `${folderName}-documents.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(zipUrl);

      toast.success(`Downloaded ${successCount} document(s)`);
    } catch (error) {
      console.error('Download all error:', error);
      toast.error('Failed to create ZIP file');
    } finally {
      setIsDownloadingAll(false);
    }
  }, [documents, propertyId, propertyAddress]);

  // Check if file type is previewable
  const isPreviewable = (mimeType: string) => {
    return (
      mimeType.startsWith('image/') ||
      mimeType === 'application/pdf' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || // .docx
      mimeType === 'application/msword' || // .doc
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // .xlsx
      mimeType === 'application/vnd.ms-excel' || // .xls
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || // .pptx
      mimeType === 'application/vnd.ms-powerpoint' // .ppt
    );
  };

  // Check if file is editable (Word/Excel/PowerPoint documents)
  const isEditable = (mimeType: string) => {
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || // .docx
      mimeType === 'application/msword' || // .doc
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // .xlsx
      mimeType === 'application/vnd.ms-excel' || // .xls
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || // .pptx
      mimeType === 'application/vnd.ms-powerpoint' // .ppt
    );
  };

  // Handle downloading signed contract (must be defined before handleDownload)
  const handleDownloadSignedContract = useCallback((doc: UnifiedDocument) => {
    if (doc.isSignedContract && doc.signedContractData?.combinedDocumentUrl) {
      window.open(doc.signedContractData.combinedDocumentUrl, '_blank');
    }
  }, []);

  // Download a single document
  const handleDownload = useCallback((doc: UnifiedDocument) => {
    // Handle signed contracts differently
    if (doc.isSignedContract) {
      handleDownloadSignedContract(doc);
      return;
    }

    // Handle regular documents
    const url = getDocumentDownloadUrl(doc.id);
    const token = localStorage.getItem('dispotree_token');

    // Open in new tab with auth
    const link = document.createElement('a');
    link.href = `${url}?token=${token}`;
    link.target = '_blank';
    link.download = doc.originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [handleDownloadSignedContract]);

  // Open document preview
  const handlePreview = useCallback(async (doc: UnifiedDocument) => {
    // Signed contracts open directly in new tab
    if (doc.isSignedContract) {
      handleDownloadSignedContract(doc);
      return;
    }
    if (!isPreviewable(doc.mimeType)) {
      // For non-previewable files, just download
      toast.info('This file type cannot be previewed. Downloading instead...');
      handleDownload(doc);
      return;
    }

    setPreviewDoc(doc);
    setPreviewLoading(true);
    setZoomLevel(1);

    try {
      // Get the signed URL from the backend (avoids CORS issues with redirects)
      const baseUrl = getDocumentDownloadUrl(doc.id);
      const token = localStorage.getItem('dispotree_token');

      const urlResponse = await fetch(`${baseUrl}?urlOnly=true`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (!urlResponse.ok) {
        throw new Error(`Failed to get document URL: ${urlResponse.status}`);
      }

      const urlData = await urlResponse.json();
      if (!urlData.success || !urlData.data?.url) {
        throw new Error(urlData.error || 'Failed to get document URL');
      }

      const signedUrl = urlData.data.url;

      // For images, fetch the actual content and create blob URL
      if (doc.mimeType.startsWith('image/')) {
        const response = await fetch(signedUrl);

        if (!response.ok) {
          throw new Error(`Failed to load image: ${response.status}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setPreviewUrl(blobUrl);
      } else {
        // For PDFs and Office docs, use the signed URL directly
        setPreviewUrl(signedUrl);
      }
    } catch (error) {
      console.error('Preview error:', error);
      toast.error('Failed to load preview');
      setPreviewDoc(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [handleDownload]);

  // Close preview
  const closePreview = useCallback(() => {
    // Revoke blob URL if it exists to prevent memory leaks
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewDoc(null);
    setPreviewUrl(null);
    setZoomLevel(1);
  }, [previewUrl]);

  // Navigate between documents in preview
  const navigatePreview = useCallback((direction: 'prev' | 'next') => {
    if (!previewDoc) return;

    // Cleanup current blob URL before navigating
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    const previewableDocs = documents.filter(d => isPreviewable(d.mimeType));
    const currentIndex = previewableDocs.findIndex(d => d.id === previewDoc.id);

    let newIndex: number;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % previewableDocs.length;
    } else {
      newIndex = (currentIndex - 1 + previewableDocs.length) % previewableDocs.length;
    }

    handlePreview(previewableDocs[newIndex]);
  }, [previewDoc, previewUrl, documents, handlePreview]);

  // Keyboard navigation for preview
  useEffect(() => {
    if (!previewDoc) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview();
      if (e.key === 'ArrowRight') navigatePreview('next');
      if (e.key === 'ArrowLeft') navigatePreview('prev');
      if (e.key === '+' || e.key === '=') setZoomLevel(z => Math.min(z + 0.25, 3));
      if (e.key === '-') setZoomLevel(z => Math.max(z - 0.25, 0.5));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewDoc, closePreview, navigatePreview]);

  const handleUploadDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsUploadDragging(true);
  }, []);

  const handleUploadDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsUploadDragging(false);
  }, []);

  const handleUploadDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsUploadDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      try {
        const result = await uploadMutation.mutateAsync({ files, documentType: selectedType });
        if (result.errors && result.errors.length > 0) {
          toast.error(`Upload failed: ${result.errors[0].error}`);
        } else if (result.documents && result.documents.length > 0) {
          toast.success(`${result.documents.length} document(s) uploaded successfully`);
          // Force refetch after successful upload
          await refetch();
        } else {
          toast.info('Upload completed but no documents were saved');
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to upload documents');
        console.error('Upload error:', error);
      }
    },
    [uploadMutation, selectedType, refetch]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      try {
        const result = await uploadMutation.mutateAsync({ files, documentType: selectedType });
        if (result.errors && result.errors.length > 0) {
          toast.error(`Upload failed: ${result.errors[0].error}`);
        } else if (result.documents && result.documents.length > 0) {
          toast.success(`${result.documents.length} document(s) uploaded successfully`);
          // Force refetch after successful upload
          await refetch();
        } else {
          toast.info('Upload completed but no documents were saved');
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to upload documents');
        console.error('Upload error:', error);
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [uploadMutation, selectedType, refetch]
  );

  const handleDelete = useCallback(
    async (doc: UnifiedDocument) => {
      // Prevent deletion of signed contracts (they're managed by DocuSeal)
      if (doc.isSignedContract) {
        toast.error('Signed contracts cannot be deleted from here. They are managed by DocuSeal.');
        return;
      }

      if (!confirm(`Delete "${doc.originalName}"? This cannot be undone.`)) return;

      try {
        await deleteMutation.mutateAsync({ documentId: doc.id, propertyId });
        toast.success('Document deleted');
      } catch (error) {
        toast.error('Failed to delete document');
      }
    },
    [deleteMutation, propertyId]
  );

  // Handle sending reminder for signed contract
  const handleSendReminder = useCallback(
    async (doc: UnifiedDocument) => {
      if (!doc.isSignedContract || !doc.signedContractData) return;

      try {
        await sendReminderMutation.mutateAsync(doc.signedContractData.id);
        toast.success('Reminder sent successfully');
        refetchSignedContracts();
      } catch (error) {
        toast.error('Failed to send reminder');
      }
    },
    [sendReminderMutation, refetchSignedContracts]
  );

  // Handle syncing contract status
  const handleSyncStatus = useCallback(
    async (doc: UnifiedDocument) => {
      if (!doc.isSignedContract || !doc.signedContractData) return;

      try {
        await syncStatusMutation.mutateAsync(doc.signedContractData.id);
        toast.success('Status synced successfully');
        refetchSignedContracts();
      } catch (error) {
        toast.error('Failed to sync status');
      }
    },
    [syncStatusMutation, refetchSignedContracts]
  );

  // Get document type config with fallback
  const getDocTypeConfig = (docType: string) => {
    return documentTypeConfig[docType] || documentTypeConfig.other;
  };

  // Update allDocuments with DocumentDrop context
  useEffect(() => {
    if (setAllDocuments && allDocuments.length > 0) {
      setAllDocuments(allDocuments as unknown as PropertyDocument[]);
    }
  }, [allDocuments, setAllDocuments]);

  // Display documents with expand/collapse
  const displayedRegularDocs = isExpanded ? regularDocuments : regularDocuments.slice(0, 4);
  const displayedSignedDocs = signedContractDocuments; // Always show all signed contracts

  return (
    <Card className="bg-card border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <FolderOpen className="h-5 w-5 text-cyan-500" />
            Documents
            {allDocuments.length > 0 && (
              <Badge variant="outline" className="ml-2 bg-secondary text-muted-foreground border">
                {allDocuments.length}
                {signedContractDocuments.length > 0 && (
                  <span className="ml-1 text-emerald-400">
                    ({signedContractDocuments.length} signed)
                  </span>
                )}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Selection mode controls */}
            {allDocuments.length > 0 && (
              <>
                {selectionMode ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAll}
                      className="text-muted-foreground hover:text-foreground hover:bg-secondary"
                    >
                      {selectedDocuments.length === allDocuments.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleSelectionMode}
                      className="text-muted-foreground hover:text-foreground hover:bg-secondary"
                    >
                      Cancel
                    </Button>
                    {selectedDocuments.length > 0 && (
                      <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                        {selectedDocuments.length} selected
                      </Badge>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClassifyAllDocuments}
                      disabled={classifyAllMutation.isPending}
                      className="text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10"
                      title="Classify all documents with AI"
                    >
                      {classifyAllMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-1" />
                      )}
                      Classify
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleSelectionMode}
                      className="text-muted-foreground hover:text-foreground hover:bg-secondary"
                      title="Select documents to drag to contacts"
                    >
                      <Mail className="h-4 w-4 mr-1" />
                      Select
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownloadAll}
                      disabled={isDownloadingAll}
                      className="text-muted-foreground hover:text-foreground hover:bg-secondary"
                      title="Download all as ZIP"
                    >
                      {isDownloadingAll ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Documents List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
            <p className="text-sm text-amber-400">Could not load documents</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[280px] break-words">
              {error.message?.includes('relation') || error.message?.includes('does not exist')
                ? 'Database table not yet created. Please restart the backend server.'
                : error.message || 'Unknown error'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
              className="mt-2 text-muted-foreground hover:text-foreground"
            >
              Retry
            </Button>
          </div>
        ) : allDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No documents yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload contracts, inspections, or other files
            </p>
          </div>
        ) : (
          <Droppable droppableId="documents-list" isDropDisabled={true}>
            {(droppableProvided) => (
              <div
                ref={droppableProvided.innerRef}
                {...droppableProvided.droppableProps}
                className="space-y-2"
              >
                {/* Regular Documents Section */}
                {displayedRegularDocs.length > 0 && (
                  <>
                    {signedContractDocuments.length > 0 && (
                      <div className="flex items-center gap-2 py-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Regular Documents
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    {displayedRegularDocs.map((doc, index) => {
                  const typeConfig = getDocTypeConfig(doc.documentType);
                  const DocIcon = typeConfig.icon;
                  const statusCfg = statusConfig[doc.status] || statusConfig.ready;
                  const StatusIcon = statusCfg.icon;
                  const canPreview = isPreviewable(doc.mimeType);
                  const isDocSelected = isSelected(doc.id);

                  return (
                    <Draggable
                      key={doc.id}
                      draggableId={`document-${doc.id}`}
                      index={index}
                      isDragDisabled={!selectionMode}
                    >
                      {(provided, snapshot) => (
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              onClick={(e) => {
                                if (selectionMode) {
                                  e.stopPropagation();
                                  toggleDocumentSelection(doc as unknown as PropertyDocument);
                                } else {
                                  handlePreview(doc);
                                }
                              }}
                              className={cn(
                                'group flex items-center gap-3 p-3 rounded-lg transition-all',
                                snapshot.isDragging
                                  ? 'bg-cyan-500/20 border border-cyan-500 shadow-lg shadow-cyan-500/20'
                                  : 'bg-secondary/50 hover:bg-secondary',
                                selectionMode && isDocSelected && 'bg-cyan-500/10 border border-cyan-500/30',
                                selectionMode && !isDocSelected && 'border border-transparent',
                                canPreview && !selectionMode && 'cursor-pointer',
                                selectionMode && 'cursor-grab active:cursor-grabbing'
                              )}
                            >
                              {/* Drag Handle + Checkbox in selection mode */}
                              {selectionMode && (
                                <div className="flex items-center gap-2">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="text-muted-foreground hover:text-foreground cursor-grab"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </div>
                                  <Checkbox
                                    checked={isDocSelected}
                                    onCheckedChange={() => toggleDocumentSelection(doc as unknown as PropertyDocument)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="border data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                                  />
                                </div>
                              )}

                              {/* Document Type Icon */}
                              <div className={cn(
                                'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                                typeConfig.bgColor
                              )}>
                                <DocIcon className={cn('h-5 w-5', typeConfig.iconColor)} />
                              </div>

                              {/* File Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {doc.originalName}
                                  </p>
                                  <StatusIcon
                                    className={cn(
                                      'h-3.5 w-3.5 flex-shrink-0',
                                      statusCfg.color,
                                      doc.status === 'uploading' && 'animate-spin'
                                    )}
                                  />
                                  {canPreview && !selectionMode && (
                                    <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', typeConfig.color)}>
                                    {typeConfig.label}
                                  </Badge>
                                  {/* Classification confidence indicator */}
                                  {doc.metadata?.classification && doc.metadata.classification.success && (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        'text-[10px] px-1.5 py-0 gap-1',
                                        doc.metadata.classification.wasAutoApplied
                                          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                      )}
                                      title={`Classified by ${formatClassificationSource(doc.metadata.classification.source)} - ${(doc.metadata.classification.confidence * 100).toFixed(0)}% confidence`}
                                    >
                                      <Sparkles className="h-2.5 w-2.5" />
                                      {(doc.metadata.classification.confidence * 100).toFixed(0)}%
                                    </Badge>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatFileSize(doc.fileSize)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(doc.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>

                              {/* Actions (hidden in selection mode) */}
                              {!selectionMode && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {canPreview && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePreview(doc);
                                      }}
                                      className="h-8 w-8 text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10"
                                      title="View"
                                    >
                                      <Maximize2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownload(doc);
                                    }}
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-zinc-700"
                                    title="Download"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(doc);
                                    }}
                                    disabled={deleteMutation.isPending}
                                    className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                    title="Delete"
                                  >
                                    {deleteMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-56 bg-card border">
                            {/* Preview/View */}
                            {canPreview && (
                              <ContextMenuItem
                                onSelect={() => handlePreview(doc)}
                                className="text-foreground focus:bg-secondary focus:text-foreground"
                              >
                                <Eye className="h-4 w-4 mr-2 text-muted-foreground" />
                                View
                              </ContextMenuItem>
                            )}

                            {/* Download */}
                            <ContextMenuItem
                              onSelect={() => handleDownload(doc)}
                              className="text-foreground focus:bg-secondary focus:text-foreground"
                            >
                              <Download className="h-4 w-4 mr-2 text-muted-foreground" />
                              Download
                            </ContextMenuItem>

                            <ContextMenuSeparator className="bg-secondary" />

                            {/* Classify with AI */}
                            <ContextMenuItem
                              onSelect={() => handleClassifyDocument(doc)}
                              className="text-foreground focus:bg-cyan-500/10 focus:text-cyan-400"
                            >
                              <Sparkles className="h-4 w-4 mr-2 text-cyan-400" />
                              Classify with AI
                              {doc.metadata?.classification?.success && (
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                  {(doc.metadata.classification.confidence * 100).toFixed(0)}%
                                </span>
                              )}
                            </ContextMenuItem>

                            {/* Rename */}
                            <ContextMenuItem
                              onSelect={() => openRenameDialog(doc)}
                              className="text-foreground focus:bg-secondary focus:text-foreground"
                            >
                              <Pencil className="h-4 w-4 mr-2 text-muted-foreground" />
                              Rename
                            </ContextMenuItem>

                            {/* Change Type Submenu */}
                            <ContextMenuSub>
                              <ContextMenuSubTrigger className="text-foreground focus:bg-secondary focus:text-foreground">
                                <Tag className="h-4 w-4 mr-2 text-muted-foreground" />
                                Change Type
                              </ContextMenuSubTrigger>
                              <ContextMenuSubContent className="bg-card border">
                                {Object.entries(documentTypeConfig).map(([key, config]) => {
                                  const TypeIcon = config.icon;
                                  const isCurrentType = doc.documentType === key;
                                  return (
                                    <ContextMenuItem
                                      key={key}
                                      onSelect={() => handleChangeType(doc, key)}
                                      className={cn(
                                        'text-foreground focus:bg-secondary focus:text-foreground',
                                        isCurrentType && 'bg-secondary/50'
                                      )}
                                    >
                                      <TypeIcon className={cn('h-4 w-4 mr-2', config.iconColor)} />
                                      {config.label}
                                      {isCurrentType && (
                                        <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-cyan-500" />
                                      )}
                                    </ContextMenuItem>
                                  );
                                })}
                              </ContextMenuSubContent>
                            </ContextMenuSub>

                            <ContextMenuSeparator className="bg-secondary" />

                            {/* Delete */}
                            <ContextMenuItem
                              onSelect={() => handleDelete(doc)}
                              className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      )}
                    </Draggable>
                  );
                })}
                  </>
                )}

                {/* Signed Contracts Section */}
                {displayedSignedDocs.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 py-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <FileCheck className="h-3.5 w-3.5" />
                        Completed & Signed Contracts
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    {displayedSignedDocs.map((doc, index) => {
                  const typeConfig = getDocTypeConfig(doc.documentType);
                  const DocIcon = typeConfig.icon;
                  const statusCfg = statusConfig[doc.status] || statusConfig.ready;
                  const StatusIcon = statusCfg.icon;
                  const canPreview = isPreviewable(doc.mimeType);
                  const isDocSelected = isSelected(doc.id);
                  const signedData = doc.signedContractData;

                  return (
                    <Draggable
                      key={`signed-${doc.id}`}
                      draggableId={`signed-document-${doc.id}`}
                      index={regularDocuments.length + index}
                      isDragDisabled={!selectionMode}
                    >
                      {(provided, snapshot) => (
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              onClick={(e) => {
                                if (selectionMode) {
                                  e.stopPropagation();
                                  toggleDocumentSelection(doc as unknown as PropertyDocument);
                                } else {
                                  handlePreview(doc);
                                }
                              }}
                              className={cn(
                                'group flex items-center gap-3 p-3 rounded-lg transition-all border',
                                snapshot.isDragging
                                  ? 'bg-emerald-500/20 border-emerald-500 shadow-lg shadow-emerald-500/20'
                                  : 'bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/20',
                                selectionMode && isDocSelected && 'bg-cyan-500/10 border-cyan-500/30',
                                selectionMode && !isDocSelected && 'border-transparent',
                                !selectionMode && 'cursor-pointer',
                                selectionMode && 'cursor-grab active:cursor-grabbing'
                              )}
                            >
                              {/* Drag Handle + Checkbox in selection mode */}
                              {selectionMode && (
                                <div className="flex items-center gap-2">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="text-muted-foreground hover:text-foreground cursor-grab"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </div>
                                  <Checkbox
                                    checked={isDocSelected}
                                    onCheckedChange={() => toggleDocumentSelection(doc as unknown as PropertyDocument)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="border data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                                  />
                                </div>
                              )}

                              {/* Document Type Icon */}
                              <div className={cn(
                                'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                                typeConfig.bgColor
                              )}>
                                <DocIcon className={cn('h-5 w-5', typeConfig.iconColor)} />
                              </div>

                              {/* File Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {doc.originalName}
                                  </p>
                                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0">
                                    Completed
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {signedData?.submitters && signedData.submitters.length > 0 && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <User className="h-3 w-3" />
                                      <span>
                                        {signedData.submitters.filter((s) => s.status === 'completed').length}/
                                        {signedData.submitters.length} signed
                                      </span>
                                    </div>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    {signedData?.completedAt && new Date(signedData.completedAt).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>

                              {/* Actions (hidden in selection mode) */}
                              {!selectionMode && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadSignedContract(doc);
                                    }}
                                    className="h-8 w-8 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
                                    title="Download Signed"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  {signedData?.auditLogUrl && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(signedData.auditLogUrl, '_blank');
                                      }}
                                      className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-zinc-700"
                                      title="View Audit Log"
                                    >
                                      <FileText className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSyncStatus(doc);
                                    }}
                                    disabled={syncStatusMutation.isPending}
                                    className="h-8 w-8 text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10"
                                    title="Sync Status"
                                  >
                                    {syncStatusMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <RefreshCw className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-56 bg-card border">
                            {/* Download */}
                            <ContextMenuItem
                              onSelect={() => handleDownloadSignedContract(doc)}
                              className="text-foreground focus:bg-secondary focus:text-foreground"
                            >
                              <Download className="h-4 w-4 mr-2 text-muted-foreground" />
                              Download Signed Contract
                            </ContextMenuItem>

                            {/* View Audit Log */}
                            {signedData?.auditLogUrl && (
                              <ContextMenuItem
                                onSelect={() => window.open(signedData.auditLogUrl, '_blank')}
                                className="text-foreground focus:bg-secondary focus:text-foreground"
                              >
                                <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                                View Audit Log
                              </ContextMenuItem>
                            )}

                            <ContextMenuSeparator className="bg-secondary" />

                            {/* Sync Status */}
                            <ContextMenuItem
                              onSelect={() => handleSyncStatus(doc)}
                              className="text-foreground focus:bg-secondary focus:text-foreground"
                            >
                              <RefreshCw className="h-4 w-4 mr-2 text-muted-foreground" />
                              Sync Status
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      )}
                    </Draggable>
                  );
                })}
                  </>
                )}

                {droppableProvided.placeholder}

                {/* Show More */}
                {regularDocuments.length > 4 && (
                  <Button
                    variant="ghost"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full text-muted-foreground hover:text-foreground hover:bg-secondary text-sm"
                  >
                    {isExpanded ? (
                      <>
                        <X className="h-4 w-4 mr-2" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Show All ({regularDocuments.length - 4} more)
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </Droppable>
        )}

        {/* Upload Area - Show/Hide based on state */}
        {!showUploadArea ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsUploadDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsUploadDragging(false);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsUploadDragging(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length > 0) {
                try {
                  await uploadMutation.mutateAsync({ files, documentType: selectedType });
                  toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
                } catch {
                  toast.error('Failed to upload files');
                }
              }
            }}
            onClick={() => setShowUploadArea(true)}
            className={cn(
              "inline-flex items-center justify-center rounded-md text-sm font-medium transition-all cursor-pointer px-3 py-1.5",
              isUploadDragging
                ? "bg-cyan-500/20 text-cyan-400 ring-2 ring-cyan-500 ring-offset-2 ring-offset-background"
                : "text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10"
            )}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {isUploadDragging ? "Drop files" : "Add"}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Upload Documents</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUploadArea(false)}
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div
              onDragOver={handleUploadDragOver}
              onDragLeave={handleUploadDragLeave}
              onDrop={handleUploadDrop}
              className={cn(
                'relative border-2 border-dashed rounded-lg p-6 transition-all',
                isUploadDragging
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border hover:border bg-secondary/30'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.svg,.txt,.md,.rtf,.zip"
              />

              <div className="flex flex-col items-center text-center">
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-10 w-10 text-cyan-500 animate-spin mb-3" />
                    <p className="text-sm text-muted-foreground">Uploading...</p>
                  </>
                ) : (
                  <>
                    <Upload
                      className={cn(
                        'h-10 w-10 mb-3 transition-colors',
                        isUploadDragging ? 'text-cyan-500' : 'text-muted-foreground'
                      )}
                    />
                    <p className="text-sm text-muted-foreground mb-2">
                      Drag & drop files here, or{' '}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-cyan-500 hover:text-cyan-400 underline"
                      >
                        browse
                      </button>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, Word, Excel, Images, TXT, CSV, ZIP up to 10MB
                    </p>
                  </>
                )}
              </div>

              {/* Document Type Selector */}
              <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border">
                <span className="text-xs text-muted-foreground">Upload as:</span>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-[160px] h-8 text-xs bg-secondary border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    {Object.entries(documentTypeConfig).map(([key, config]) => {
                      const Icon = config.icon;
                      return (
                        <SelectItem key={key} value={key} className="text-xs">
                          <div className="flex items-center gap-2">
                            <Icon className={cn('h-3.5 w-3.5', config.iconColor)} />
                            {config.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Fullscreen Document Preview Modal */}
      {previewDoc && previewUrl && (
        <div className="fixed inset-0 z-50 bg-background/95 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-card/80 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              {(() => {
                const config = documentTypeConfig[previewDoc.documentType] || documentTypeConfig.other;
                const Icon = config.icon;
                return (
                  <div className={cn('p-2 rounded-lg', config.bgColor)}>
                    <Icon className={cn('h-5 w-5', config.iconColor)} />
                  </div>
                );
              })()}
              <div>
                <h3 className="text-foreground font-medium">{previewDoc.originalName}</h3>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(previewDoc.fileSize)} • {new Date(previewDoc.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Zoom controls (for images) */}
              {previewDoc.mimeType.startsWith('image/') && (
                <div className="flex items-center gap-1 mr-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setZoomLevel(z => Math.max(z - 0.25, 0.5))}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={zoomLevel <= 0.5}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-muted-foreground text-sm w-16 text-center">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setZoomLevel(z => Math.min(z + 0.25, 3))}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={zoomLevel >= 3}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {isEditable(previewDoc.mimeType) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleDownload(previewDoc);
                    toast.success('Downloading for editing', {
                      description: 'Edit the file locally, then re-upload to save changes'
                    });
                  }}
                  className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDownload(previewDoc)}
                className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-secondary"
                title="Download"
              >
                <Download className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={closePreview}
                className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-secondary"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex items-center justify-center relative overflow-auto p-4">
            {previewLoading ? (
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            ) : previewDoc.mimeType.startsWith('image/') ? (
              <div
                className="relative transition-transform duration-200"
                style={{ transform: `scale(${zoomLevel})` }}
              >
                <img
                  src={previewUrl}
                  alt={previewDoc.originalName}
                  className="max-w-full max-h-[calc(100vh-160px)] object-contain rounded-lg shadow-2xl"
                  onError={(e) => {
                    console.error('Image load error:', e);
                    toast.error('Failed to load image. Check browser console for details.');
                  }}
                />
              </div>
            ) : previewDoc.mimeType === 'application/pdf' ? (
              <iframe
                src={`${previewUrl}#view=FitH`}
                title={previewDoc.originalName}
                className="w-full h-full max-w-5xl rounded-lg bg-white shadow-2xl"
                style={{ minHeight: 'calc(100vh - 160px)' }}
                onError={(e) => {
                  console.error('PDF load error:', e);
                  toast.error('Failed to load PDF. Click download to view locally.');
                }}
              />
            ) : isEditable(previewDoc.mimeType) ? (
              <div className="w-full h-full max-w-7xl flex flex-col items-center justify-center">
                <div className="text-center mb-6">
                  <FileText className="h-20 w-20 text-cyan-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">{previewDoc.originalName}</h3>
                  <p className="text-muted-foreground mb-4">
                    {previewDoc.mimeType.includes('word') ? 'Word Document' : 'Excel Spreadsheet'}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button
                      onClick={() => {
                        handleDownload(previewDoc);
                        toast.success('Downloading for editing', {
                          description: 'Edit the file locally, then re-upload to save changes'
                        });
                      }}
                      className="bg-cyan-500 hover:bg-cyan-600 text-white"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Download & Edit
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(previewUrl)}&embedded=true`, '_blank');
                      }}
                      className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View in New Tab
                    </Button>
                  </div>
                </div>
                <div className="p-6 bg-secondary/50 rounded-lg max-w-2xl">
                  <p className="text-sm text-muted-foreground mb-3">
                    <strong className="text-foreground">How to edit this document:</strong>
                  </p>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Click "Download & Edit" to download the file</li>
                    <li>Open it in Microsoft Word or Excel on your computer</li>
                    <li>Make your changes and save the file</li>
                    <li>Come back here and click "Add Documents" to upload the updated version</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Preview not available for this file type</p>
                <Button
                  onClick={() => handleDownload(previewDoc)}
                  className="mt-4"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
            )}

            {/* Navigation arrows */}
            {documents.filter(d => isPreviewable(d.mimeType)).length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigatePreview('prev')}
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 bg-background/50 hover:bg-background/70 text-foreground rounded-full"
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigatePreview('next')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 bg-background/50 hover:bg-background/70 text-foreground rounded-full"
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}
          </div>

          {/* Footer with document counter */}
          {documents.filter(d => isPreviewable(d.mimeType)).length > 1 && (
            <div className="p-4 bg-card/80 backdrop-blur-sm flex justify-center">
              <div className="flex items-center gap-2">
                {documents.filter(d => isPreviewable(d.mimeType)).map((doc) => {
                  const isActive = doc.id === previewDoc.id;
                  return (
                    <button
                      key={doc.id}
                      onClick={() => handlePreview(doc)}
                      className={cn(
                        'w-2 h-2 rounded-full transition-all',
                        isActive ? 'bg-cyan-500 w-6' : 'bg-zinc-600 hover:bg-zinc-500'
                      )}
                      title={doc.originalName}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Keyboard shortcuts hint */}
          <div className="absolute bottom-4 left-4 text-xs text-muted-foreground">
            <span className="bg-secondary px-2 py-1 rounded mr-2">ESC</span> Close
            <span className="bg-secondary px-2 py-1 rounded mx-2">←</span>
            <span className="bg-secondary px-2 py-1 rounded mr-2">→</span> Navigate
            {previewDoc.mimeType.startsWith('image/') && (
              <>
                <span className="bg-secondary px-2 py-1 rounded mx-2">+</span>
                <span className="bg-secondary px-2 py-1 rounded mr-2">-</span> Zoom
              </>
            )}
          </div>
        </div>
      )}

      {/* Rename Document Dialog */}
      <Dialog open={!!renameDoc} onOpenChange={(open) => !open && closeRenameDialog()}>
        <DialogContent className="bg-card border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Pencil className="h-5 w-5 text-cyan-500" />
              Rename Document
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Enter a new name for this document.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-muted-foreground text-xs">Document Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                }}
                className="mt-1 bg-secondary border text-foreground"
                placeholder="Enter document name..."
                autoFocus
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 border text-foreground"
                onClick={closeRenameDialog}
                disabled={renameMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-foreground"
                onClick={handleRename}
                disabled={!newName.trim() || renameMutation.isPending}
              >
                {renameMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
