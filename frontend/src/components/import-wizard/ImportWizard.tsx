'use client';

/**
 * Import Wizard Component
 *
 * Multi-step wizard for importing deals and buyers from CSV/Excel files
 * with field mapping, validation, and duplicate detection.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  Map,
  Eye,
  Users,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  X,
} from 'lucide-react';
import { useImportWizard } from '@/hooks/use-import-wizard';
import { FileUploadStep } from './FileUploadStep';
import { FieldMappingStep } from './FieldMappingStep';
import { PreviewStep } from './PreviewStep';
import { DuplicatesStep } from './DuplicatesStep';
import { ResultsStep } from './ResultsStep';
import type { WizardStep } from '@/types/import';

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS: { id: WizardStep; label: string; icon: React.ElementType }[] = [
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'mapping', label: 'Map Fields', icon: Map },
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'duplicates', label: 'Duplicates', icon: Users },
  { id: 'results', label: 'Results', icon: CheckCircle },
];

export function ImportWizard({ open, onOpenChange }: ImportWizardProps) {
  const wizard = useImportWizard();

  const currentStepIndex = STEPS.findIndex((s) => s.id === wizard.step);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const handleClose = () => {
    wizard.reset();
    onOpenChange(false);
  };

  const handleNext = () => {
    switch (wizard.step) {
      case 'mapping':
        wizard.generatePreview();
        break;
      case 'preview':
        wizard.detectDuplicates();
        break;
      case 'duplicates':
        wizard.commitImport();
        break;
      default:
        break;
    }
  };

  const renderStep = () => {
    switch (wizard.step) {
      case 'upload':
        return <FileUploadStep wizard={wizard} />;
      case 'mapping':
        return <FieldMappingStep wizard={wizard} />;
      case 'preview':
        return <PreviewStep wizard={wizard} />;
      case 'duplicates':
        return <DuplicatesStep wizard={wizard} />;
      case 'results':
        return <ResultsStep wizard={wizard} onClose={handleClose} />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-foreground">
              Import Data Wizard
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Step indicators */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const isActive = wizard.step === step.id;
                const isComplete = index < currentStepIndex;

                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-2 ${
                      isActive
                        ? 'text-primary'
                        : isComplete
                        ? 'text-green-500'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                        isActive
                          ? 'border-primary bg-primary/10'
                          : isComplete
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-muted-foreground/30'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium hidden sm:inline">
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <Progress value={progress} className="h-1" />
          </div>
        </DialogHeader>

        {/* Step content */}
        <div className="flex-1 overflow-auto py-4 min-h-0">{renderStep()}</div>

        {/* Footer with navigation */}
        {wizard.step !== 'results' && (
          <div className="flex-shrink-0 flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={wizard.goBack}
              disabled={wizard.step === 'upload' || wizard.isLoading}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <div className="flex items-center gap-2">
              {wizard.error && (
                <span className="text-sm text-destructive">{wizard.error}</span>
              )}
              {wizard.step !== 'upload' && (
                <Button
                  onClick={handleNext}
                  disabled={!wizard.canProceed() || wizard.isLoading}
                >
                  {wizard.isLoading ? (
                    <span className="flex items-center">
                      <svg
                        className="animate-spin h-4 w-4 mr-2"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Processing...
                    </span>
                  ) : wizard.step === 'duplicates' ? (
                    <>
                      Import
                      <CheckCircle className="h-4 w-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ImportWizard;
