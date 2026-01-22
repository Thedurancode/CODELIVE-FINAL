'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import type { PropertyDocument } from '@/hooks/use-property-documents';
import type { PropertyContact } from '@/types';

interface DropPayload {
  documents: PropertyDocument[];
  contact: PropertyContact;
}

interface DocumentDropContextType {
  // Selected documents for multi-select
  selectedDocuments: PropertyDocument[];
  toggleDocumentSelection: (doc: PropertyDocument) => void;
  selectAllDocuments: (docs: PropertyDocument[]) => void;
  clearSelection: () => void;
  isSelected: (docId: number) => boolean;

  // All documents (for single-drag scenarios)
  allDocuments: PropertyDocument[];
  setAllDocuments: (docs: PropertyDocument[]) => void;

  // Drag state
  isDragging: boolean;
  draggedDocuments: PropertyDocument[];

  // Drop handling
  pendingDrop: DropPayload | null;
  setPendingDrop: (payload: DropPayload | null) => void;

  // Contact registry for drop handling
  registerContact: (contactId: string, contact: PropertyContact) => void;
  unregisterContact: (contactId: string) => void;

  // Email modal
  showEmailModal: boolean;
  setShowEmailModal: (show: boolean) => void;
}

const DocumentDropContext = createContext<DocumentDropContextType | null>(null);

export function useDocumentDrop() {
  const context = useContext(DocumentDropContext);
  if (!context) {
    throw new Error('useDocumentDrop must be used within DocumentDropProvider');
  }
  return context;
}

interface DocumentDropProviderProps {
  children: React.ReactNode;
}

export function DocumentDropProvider({ children }: DocumentDropProviderProps) {
  const [selectedDocuments, setSelectedDocuments] = useState<PropertyDocument[]>([]);
  const [allDocumentsState, setAllDocumentsState] = useState<PropertyDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedDocuments, setDraggedDocuments] = useState<PropertyDocument[]>([]);
  const [pendingDrop, setPendingDrop] = useState<DropPayload | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Use ref to store all documents to avoid re-render loops
  const allDocumentsRef = useRef<PropertyDocument[]>([]);

  const setAllDocuments = useCallback((docs: PropertyDocument[]) => {
    // Only update if actually different (compare by length and first/last id)
    const current = allDocumentsRef.current;
    const isDifferent = docs.length !== current.length ||
      (docs.length > 0 && current.length > 0 && (docs[0].id !== current[0].id || docs[docs.length-1].id !== current[current.length-1].id));

    if (isDifferent) {
      allDocumentsRef.current = docs;
      setAllDocumentsState(docs);
    }
  }, []);

  const allDocuments = allDocumentsState;

  // Registry of contacts for drop handling
  const contactRegistry = useRef<Map<string, PropertyContact>>(new Map());

  const registerContact = useCallback((contactId: string, contact: PropertyContact) => {
    contactRegistry.current.set(contactId, contact);
  }, []);

  const unregisterContact = useCallback((contactId: string) => {
    contactRegistry.current.delete(contactId);
  }, []);

  const toggleDocumentSelection = useCallback((doc: PropertyDocument) => {
    setSelectedDocuments(prev => {
      const isCurrentlySelected = prev.some(d => d.id === doc.id);
      if (isCurrentlySelected) {
        return prev.filter(d => d.id !== doc.id);
      } else {
        return [...prev, doc];
      }
    });
  }, []);

  const selectAllDocuments = useCallback((docs: PropertyDocument[]) => {
    setSelectedDocuments(docs);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedDocuments([]);
  }, []);

  const isSelected = useCallback((docId: number) => {
    return selectedDocuments.some(d => d.id === docId);
  }, [selectedDocuments]);

  const handleDragStart = useCallback((start: { draggableId: string }) => {
    setIsDragging(true);

    // Get the dragged document ID
    const draggedId = parseInt(start.draggableId.replace('document-', ''));

    // If the dragged document is selected, drag all selected documents
    const isSelectedDoc = selectedDocuments.some(d => d.id === draggedId);

    if (isSelectedDoc && selectedDocuments.length > 0) {
      setDraggedDocuments(selectedDocuments);
    } else {
      // Single document drag - find it from allDocuments ref
      const singleDoc = allDocumentsRef.current.find(d => d.id === draggedId);
      if (singleDoc) {
        setDraggedDocuments([singleDoc]);
      }
    }
  }, [selectedDocuments]);

  const handleDragEnd = useCallback((result: DropResult) => {
    const currentDraggedDocs = draggedDocuments;
    setIsDragging(false);
    setDraggedDocuments([]);

    // If dropped outside a valid droppable, do nothing
    if (!result.destination) {
      return;
    }

    // Check if dropped on a contact
    if (result.destination.droppableId.startsWith('contact-')) {
      const contactId = result.destination.droppableId;
      const contact = contactRegistry.current.get(contactId);

      if (contact && currentDraggedDocs.length > 0) {
        // Set pending drop and show email modal
        setPendingDrop({
          documents: currentDraggedDocs,
          contact: contact,
        });
        setShowEmailModal(true);
      }
    }
  }, [draggedDocuments]);

  const value: DocumentDropContextType = useMemo(() => ({
    selectedDocuments,
    toggleDocumentSelection,
    selectAllDocuments,
    clearSelection,
    isSelected,
    allDocuments,
    setAllDocuments,
    isDragging,
    draggedDocuments,
    pendingDrop,
    setPendingDrop,
    registerContact,
    unregisterContact,
    showEmailModal,
    setShowEmailModal,
  }), [
    selectedDocuments,
    toggleDocumentSelection,
    selectAllDocuments,
    clearSelection,
    isSelected,
    allDocuments,
    setAllDocuments,
    isDragging,
    draggedDocuments,
    pendingDrop,
    registerContact,
    unregisterContact,
    showEmailModal,
  ]);

  return (
    <DocumentDropContext.Provider value={value}>
      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {children}
      </DragDropContext>
    </DocumentDropContext.Provider>
  );
}
