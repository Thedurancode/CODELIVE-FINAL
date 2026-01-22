'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, AlertTriangle, Lock, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useStateTransactionTypes,
  useUpdatePhase1,
  type TransactionType,
  type TransactionTypeOption,
} from '@/hooks/use-state-compliance';

interface TransactionTypeFormProps {
  dealId: number;
  state: string;
  currentTransactionType?: TransactionType;
  isReadOnly?: boolean;
  onComplete?: () => void;
}

export function TransactionTypeForm({
  dealId,
  state,
  currentTransactionType,
  isReadOnly = false,
  onComplete,
}: TransactionTypeFormProps) {
  const [selectedType, setSelectedType] = useState<TransactionType | undefined>(
    currentTransactionType
  );
  const [error, setError] = useState<string | null>(null);

  const { data: transactionTypesData, isLoading: isLoadingTypes } = useStateTransactionTypes(state);
  const updatePhase1 = useUpdatePhase1();

  const transactionTypes: TransactionTypeOption[] = transactionTypesData?.data || [];

  const handleSelect = (type: TransactionType) => {
    if (isReadOnly) return;
    const option = transactionTypes.find((t) => t.type === type);
    if (option?.allowed) {
      setSelectedType(type);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedType) {
      setError('Please select a transaction type');
      return;
    }

    try {
      const result = await updatePhase1.mutateAsync({
        dealId,
        transactionType: selectedType,
      });

      if (result.success) {
        onComplete?.();
      } else {
        setError('Failed to update transaction type');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update transaction type');
    }
  };

  if (isLoadingTypes) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-20 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Transaction Type
        </CardTitle>
        <CardDescription>
          Select how this deal will be structured. Oklahoma pilot program only allows wholesale
          assignments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3">
          {transactionTypes.map((option) => (
            <TransactionTypeOption
              key={option.type}
              option={option}
              isSelected={selectedType === option.type}
              isReadOnly={isReadOnly}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {!isReadOnly && (
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSubmit}
              disabled={!selectedType || updatePhase1.isPending}
            >
              {updatePhase1.isPending ? 'Saving...' : 'Save & Continue'}
            </Button>
          </div>
        )}

        {isReadOnly && currentTransactionType && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Transaction type set to{' '}
            <span className="font-medium text-foreground">
              {transactionTypes.find((t) => t.type === currentTransactionType)?.label ||
                currentTransactionType}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TransactionTypeOptionProps {
  option: TransactionTypeOption;
  isSelected: boolean;
  isReadOnly: boolean;
  onSelect: (type: TransactionType) => void;
}

function TransactionTypeOption({
  option,
  isSelected,
  isReadOnly,
  onSelect,
}: TransactionTypeOptionProps) {
  const content = (
    <div
      className={cn(
        'relative rounded-lg border p-4 cursor-pointer transition-all',
        isSelected && option.allowed && 'border-primary bg-primary/5 ring-2 ring-primary/20',
        !option.allowed && 'opacity-60 cursor-not-allowed bg-muted/50',
        option.allowed && !isSelected && 'hover:border-muted-foreground/50',
        isReadOnly && 'cursor-default'
      )}
      onClick={() => option.allowed && !isReadOnly && onSelect(option.type)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{option.label}</span>
            {!option.allowed && <Lock className="h-4 w-4 text-muted-foreground" />}
            {isSelected && option.allowed && (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
          </div>
          {option.reason && (
            <p className="text-sm text-muted-foreground mt-1">{option.reason}</p>
          )}
        </div>
      </div>

      {isSelected && option.allowed && (
        <div className="absolute top-0 right-0 -mt-1 -mr-1">
          <span className="flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
          </span>
        </div>
      )}
    </div>
  );

  if (!option.allowed && option.reason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p>{option.reason}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

export default TransactionTypeForm;
