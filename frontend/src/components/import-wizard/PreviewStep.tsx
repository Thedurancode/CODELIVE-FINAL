'use client';

/**
 * Preview Step - Placeholder
 * TODO: Implement preview UI
 */

import type { UseImportWizardReturn } from '@/hooks/use-import-wizard';

interface PreviewStepProps {
  wizard: UseImportWizardReturn;
}

export function PreviewStep({ wizard }: PreviewStepProps) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      Preview step - coming soon
    </div>
  );
}
