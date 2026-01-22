'use client';

/**
 * File Upload Step
 *
 * Step 1: Select import type and upload file
 */

import { useRef, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Upload,
  FileSpreadsheet,
  Building,
  Users,
  Loader2,
} from 'lucide-react';
import type { UseImportWizardReturn } from '@/hooks/use-import-wizard';
import type { ImportType } from '@/types/import';

interface FileUploadStepProps {
  wizard: UseImportWizardReturn;
}

export function FileUploadStep({ wizard }: FileUploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }, []);

  const handleImport = useCallback(() => {
    if (selectedFile && wizard.importType) {
      wizard.uploadFile(selectedFile, wizard.importType);
    }
  }, [selectedFile, wizard]);

  const importTypes: { id: ImportType; label: string; description: string; icon: React.ElementType }[] = [
    {
      id: 'deals',
      label: 'Deals / Properties',
      description: 'Import property listings with address, price, and details',
      icon: Building,
    },
    {
      id: 'buyers',
      label: 'Buyers',
      description: 'Import buyer contacts with preferences and counties',
      icon: Users,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Import Type Selection */}
      <div className="space-y-3">
        <Label className="text-base font-medium">What are you importing?</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {importTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = wizard.importType === type.id;

            return (
              <Card
                key={type.id}
                className={`cursor-pointer transition-all ${
                  isSelected
                    ? 'ring-2 ring-primary border-primary'
                    : 'hover:border-primary/50'
                }`}
                onClick={() => wizard.setImportType(type.id)}
              >
                <CardContent className="p-4 flex items-start gap-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{type.label}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {type.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* File Upload Area */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Upload your file</Label>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".csv,.xlsx,.xls"
          className="hidden"
        />
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-primary bg-primary/10'
              : selectedFile
              ? 'border-green-500 bg-green-500/10'
              : 'border-muted-foreground/30 hover:border-primary/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {selectedFile ? (
            <>
              <FileSpreadsheet className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-medium text-foreground mb-1">
                {selectedFile.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB • Click to change file
              </p>
            </>
          ) : (
            <>
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-lg font-medium text-foreground mb-1">
                Drop your file here
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                or click to browse
              </p>
              <Button variant="outline" type="button">
                Browse Files
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Supported formats: CSV, Excel (.xlsx, .xls) • Max size: 50MB
        </p>
      </div>

      {/* Upload Button */}
      {selectedFile && wizard.importType && (
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleImport}
            disabled={wizard.isUploading}
            className="min-w-[200px]"
          >
            {wizard.isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload & Continue
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default FileUploadStep;
