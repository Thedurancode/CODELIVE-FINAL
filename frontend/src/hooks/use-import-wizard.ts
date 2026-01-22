/**
 * Import Wizard Hook
 *
 * Manages the state and API calls for the import wizard
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ImportType,
  WizardStep,
  SourceColumn,
  TargetField,
  FieldMapping,
  PreviewRow,
  ValidationResult,
  DuplicateMatch,
  DuplicateAction,
  ImportResult,
  UploadResponse,
  PreviewResponse,
  DuplicateDetectionResult,
  ImportWizardState,
} from '@/types/import';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Helper function to get auth token
const getToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('dispotree_token');
  }
  return null;
};

// API helper
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(!options.body || options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.data;
}

export function useImportWizard() {
  const queryClient = useQueryClient();

  // Wizard state
  const [state, setState] = useState<ImportWizardState>({
    step: 'upload',
    importType: null,
    sessionId: null,
    fileName: null,
    totalRows: 0,
    sourceColumns: [],
    targetFields: [],
    mappings: [],
    preview: [],
    validation: null,
    duplicates: [],
    duplicateActions: {},
    result: null,
    isLoading: false,
    error: null,
  });

  // Reset wizard
  const reset = useCallback(() => {
    setState({
      step: 'upload',
      importType: null,
      sessionId: null,
      fileName: null,
      totalRows: 0,
      sourceColumns: [],
      targetFields: [],
      mappings: [],
      preview: [],
      validation: null,
      duplicates: [],
      duplicateActions: {},
      result: null,
      isLoading: false,
      error: null,
    });
  }, []);

  // Set step
  const setStep = useCallback((step: WizardStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  // Set import type
  const setImportType = useCallback((importType: ImportType) => {
    setState((prev) => ({ ...prev, importType }));
  }, []);

  // Upload file mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, importType }: { file: File; importType: ImportType }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('importType', importType);

      const token = getToken();
      const res = await fetch(`${API_URL}/api/import-wizard/upload`, {
        method: 'POST',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      return data.data as UploadResponse;
    },
    onSuccess: async (data) => {
      // Fetch target fields
      const targetFields = await apiCall<TargetField[]>(
        `/api/import-wizard/fields/${state.importType}`
      );

      setState((prev) => ({
        ...prev,
        sessionId: data.sessionId,
        fileName: data.fileName,
        totalRows: data.totalRows,
        sourceColumns: data.sourceColumns,
        targetFields,
        mappings: data.suggestedMappings,
        step: 'mapping',
        isLoading: false,
        error: null,
      }));

      toast.success(`File uploaded: ${data.totalRows} rows found`);
    },
    onError: (error: Error) => {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message,
      }));
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  // Upload file
  const uploadFile = useCallback(
    (file: File, importType: ImportType) => {
      setState((prev) => ({ ...prev, isLoading: true, importType }));
      uploadMutation.mutate({ file, importType });
    },
    [uploadMutation]
  );

  // Update mappings mutation
  const updateMappingsMutation = useMutation({
    mutationFn: async (mappings: FieldMapping[]) => {
      if (!state.sessionId) throw new Error('No session');
      await apiCall(`/api/import-wizard/session/${state.sessionId}/mappings`, {
        method: 'PUT',
        body: JSON.stringify({ mappings }),
      });
      return mappings;
    },
    onSuccess: (mappings) => {
      setState((prev) => ({ ...prev, mappings }));
    },
  });

  // Update mappings
  const updateMappings = useCallback(
    (mappings: FieldMapping[]) => {
      setState((prev) => ({ ...prev, mappings }));
    },
    []
  );

  // Get preview mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!state.sessionId) throw new Error('No session');

      // First update mappings
      await apiCall(`/api/import-wizard/session/${state.sessionId}/mappings`, {
        method: 'PUT',
        body: JSON.stringify({ mappings: state.mappings }),
      });

      // Then get preview
      return apiCall<PreviewResponse>(
        `/api/import-wizard/session/${state.sessionId}/preview?limit=10`
      );
    },
    onSuccess: (data) => {
      setState((prev) => ({
        ...prev,
        preview: data.rows,
        validation: data.validation,
        step: 'preview',
        isLoading: false,
      }));
    },
    onError: (error: Error) => {
      setState((prev) => ({ ...prev, isLoading: false, error: error.message }));
      toast.error(`Preview failed: ${error.message}`);
    },
  });

  // Generate preview
  const generatePreview = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: true }));
    previewMutation.mutate();
  }, [previewMutation]);

  // Detect duplicates mutation
  const detectDuplicatesMutation = useMutation({
    mutationFn: async () => {
      if (!state.sessionId) throw new Error('No session');
      return apiCall<DuplicateDetectionResult>(
        `/api/import-wizard/session/${state.sessionId}/duplicates`
      );
    },
    onSuccess: (data) => {
      const actions: Record<number, DuplicateAction> = {};
      data.matches.forEach((match) => {
        actions[match.rowNumber] = match.suggestedAction;
      });

      setState((prev) => ({
        ...prev,
        duplicates: data.matches,
        duplicateActions: actions,
        step: 'duplicates',
        isLoading: false,
      }));

      if (data.duplicatesFound > 0) {
        toast.info(`Found ${data.duplicatesFound} potential duplicates`);
      }
    },
    onError: (error: Error) => {
      setState((prev) => ({ ...prev, isLoading: false, error: error.message }));
      toast.error(`Duplicate detection failed: ${error.message}`);
    },
  });

  // Detect duplicates
  const detectDuplicates = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: true }));
    detectDuplicatesMutation.mutate();
  }, [detectDuplicatesMutation]);

  // Update duplicate action
  const setDuplicateAction = useCallback(
    (rowNumber: number, action: DuplicateAction) => {
      setState((prev) => ({
        ...prev,
        duplicateActions: {
          ...prev.duplicateActions,
          [rowNumber]: action,
        },
      }));
    },
    []
  );

  // Commit import mutation
  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!state.sessionId) throw new Error('No session');

      // Update duplicate actions
      await apiCall(`/api/import-wizard/session/${state.sessionId}/duplicates`, {
        method: 'PUT',
        body: JSON.stringify({ actions: state.duplicateActions }),
      });

      // Commit import
      return apiCall<ImportResult>(
        `/api/import-wizard/session/${state.sessionId}/commit`,
        { method: 'POST' }
      );
    },
    onSuccess: (data) => {
      setState((prev) => ({
        ...prev,
        result: data,
        step: 'results',
        isLoading: false,
      }));

      // Invalidate relevant queries
      if (state.importType === 'deals') {
        queryClient.invalidateQueries({ queryKey: ['properties'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['buyers'] });
      }

      if (data.success) {
        toast.success(
          `Import complete: ${data.imported} imported, ${data.skipped} skipped`
        );
      } else {
        toast.warning(`Import completed with ${data.failed} failures`);
      }
    },
    onError: (error: Error) => {
      setState((prev) => ({ ...prev, isLoading: false, error: error.message }));
      toast.error(`Import failed: ${error.message}`);
    },
  });

  // Commit import
  const commitImport = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: true }));
    commitMutation.mutate();
  }, [commitMutation]);

  // Skip duplicates step (when no duplicates found)
  const skipDuplicates = useCallback(() => {
    commitMutation.mutate();
    setState((prev) => ({ ...prev, isLoading: true }));
  }, [commitMutation]);

  // Go back to previous step
  const goBack = useCallback(() => {
    setState((prev) => {
      const steps: WizardStep[] = ['upload', 'mapping', 'preview', 'duplicates', 'results'];
      const currentIndex = steps.indexOf(prev.step);
      if (currentIndex > 0) {
        return { ...prev, step: steps[currentIndex - 1] };
      }
      return prev;
    });
  }, []);

  // Check if we can proceed
  const canProceed = useCallback(() => {
    switch (state.step) {
      case 'upload':
        return state.importType !== null;
      case 'mapping':
        return state.mappings.length > 0;
      case 'preview':
        return state.validation?.isValid || (state.validation?.summary.errors === 0);
      case 'duplicates':
        return true;
      default:
        return false;
    }
  }, [state]);

  return {
    // State
    ...state,

    // Actions
    reset,
    setStep,
    setImportType,
    uploadFile,
    updateMappings,
    generatePreview,
    detectDuplicates,
    setDuplicateAction,
    commitImport,
    skipDuplicates,
    goBack,
    canProceed,

    // Loading states
    isUploading: uploadMutation.isPending,
    isPreviewing: previewMutation.isPending,
    isDetecting: detectDuplicatesMutation.isPending,
    isCommitting: commitMutation.isPending,
  };
}

export type UseImportWizardReturn = ReturnType<typeof useImportWizard>;
