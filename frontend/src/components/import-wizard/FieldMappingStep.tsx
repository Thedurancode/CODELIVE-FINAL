'use client';

/**
 * Field Mapping Step - Placeholder
 * TODO: Implement field mapping UI
 */

import type { UseImportWizardReturn } from '@/hooks/use-import-wizard';

interface FieldMappingStepProps {
  wizard: UseImportWizardReturn;
}

export function FieldMappingStep({ wizard }: FieldMappingStepProps) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      Field mapping step - coming soon
    </div>
  );
}
