'use client';

/**
 * Results Step - Placeholder
 * TODO: Implement results UI
 */

import type { UseImportWizardReturn } from '@/hooks/use-import-wizard';

interface ResultsStepProps {
  wizard: UseImportWizardReturn;
  onClose: () => void;
}

export function ResultsStep({ wizard, onClose }: ResultsStepProps) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      Import results step - coming soon
    </div>
  );
}
