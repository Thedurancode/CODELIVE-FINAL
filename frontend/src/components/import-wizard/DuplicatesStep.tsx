'use client';

/**
 * Duplicates Step - Placeholder
 * TODO: Implement duplicates detection UI
 */

import type { UseImportWizardReturn } from '@/hooks/use-import-wizard';

interface DuplicatesStepProps {
  wizard: UseImportWizardReturn;
}

export function DuplicatesStep({ wizard }: DuplicatesStepProps) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      Duplicates detection step - coming soon
    </div>
  );
}
