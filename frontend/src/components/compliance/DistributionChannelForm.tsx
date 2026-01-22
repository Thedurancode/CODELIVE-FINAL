'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Share2, FileSignature } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useStateDistributionChannels,
  useUpdatePhase6,
  type DistributionChannel,
  type DistributionChannelOption,
} from '@/hooks/use-state-compliance';

interface DistributionChannelFormProps {
  dealId: number;
  state: string;
  currentChannels?: DistributionChannel[];
  isReadOnly?: boolean;
  onComplete?: () => void;
}

export function DistributionChannelForm({
  dealId,
  state,
  currentChannels = [],
  isReadOnly = false,
  onComplete,
}: DistributionChannelFormProps) {
  const [selectedChannels, setSelectedChannels] = useState<DistributionChannel[]>(currentChannels);
  const [error, setError] = useState<string | null>(null);

  const { data: channelsData, isLoading: isLoadingChannels } = useStateDistributionChannels(state);
  const updatePhase6 = useUpdatePhase6();

  const channelOptions: DistributionChannelOption[] = channelsData?.data || [];

  // Sync with currentChannels when they change
  useEffect(() => {
    if (currentChannels.length > 0) {
      setSelectedChannels(currentChannels);
    }
  }, [currentChannels]);

  const handleToggle = (channel: DistributionChannel, checked: boolean) => {
    if (isReadOnly) return;

    setSelectedChannels((prev) =>
      checked ? [...prev, channel] : prev.filter((c) => c !== channel)
    );
    setError(null);
  };

  const handleSubmit = async () => {
    if (selectedChannels.length === 0) {
      setError('Please select at least one distribution channel');
      return;
    }

    try {
      const result = await updatePhase6.mutateAsync({
        dealId,
        distributionChannels: selectedChannels,
      });

      if (result.success) {
        onComplete?.();
      } else {
        setError('Failed to update distribution channels');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update distribution channels');
    }
  };

  // Check if auction is selected (requires ASA)
  const hasAuction = selectedChannels.includes('auction');

  // Calculate required agreements
  const requiredAgreements = new Set<string>();
  if (selectedChannels.length > 0) {
    requiredAgreements.add('MSA');
  }
  if (hasAuction) {
    requiredAgreements.add('ASA');
  }

  if (isLoadingChannels) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-16 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          Distribution Channels
        </CardTitle>
        <CardDescription>
          Select how this deal will be distributed to potential buyers. You must select at least
          one channel.
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
          {channelOptions.map((option) => (
            <DistributionChannelOption
              key={option.channel}
              option={option}
              isSelected={selectedChannels.includes(option.channel)}
              isReadOnly={isReadOnly}
              onToggle={handleToggle}
            />
          ))}
        </div>

        {/* Required Agreements Notice */}
        {selectedChannels.length > 0 && (
          <Alert className="mt-4">
            <FileSignature className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">Required Agreements:</span>{' '}
              {Array.from(requiredAgreements).map((agreement, i) => (
                <Badge key={agreement} variant="secondary" className="ml-1">
                  {agreement}
                </Badge>
              ))}
              {hasAuction && (
                <p className="text-xs text-muted-foreground mt-1">
                  Auction Services Agreement (ASA) is required when using the auction channel.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!isReadOnly && (
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSubmit}
              disabled={selectedChannels.length === 0 || updatePhase6.isPending}
            >
              {updatePhase6.isPending ? 'Saving...' : 'Save & Continue'}
            </Button>
          </div>
        )}

        {isReadOnly && currentChannels.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Distribution channels configured
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DistributionChannelOptionProps {
  option: DistributionChannelOption;
  isSelected: boolean;
  isReadOnly: boolean;
  onToggle: (channel: DistributionChannel, checked: boolean) => void;
}

function DistributionChannelOption({
  option,
  isSelected,
  isReadOnly,
  onToggle,
}: DistributionChannelOptionProps) {
  return (
    <div
      className={cn(
        'relative rounded-lg border p-4 transition-all',
        isSelected && 'border-primary bg-primary/5 ring-2 ring-primary/20',
        !isReadOnly && 'cursor-pointer hover:border-muted-foreground/50',
        isReadOnly && 'cursor-default'
      )}
      onClick={() => !isReadOnly && onToggle(option.channel, !isSelected)}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={`channel-${option.channel}`}
          checked={isSelected}
          disabled={isReadOnly}
          onCheckedChange={(checked) => onToggle(option.channel, checked === true)}
          className="mt-0.5"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Label
              htmlFor={`channel-${option.channel}`}
              className={cn('font-medium cursor-pointer', isReadOnly && 'cursor-default')}
            >
              {option.label}
            </Label>
            {option.requiresAgreement && (
              <Badge variant="outline" className="text-xs">
                Requires {option.requiresAgreement}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
        </div>
      </div>
    </div>
  );
}

export default DistributionChannelForm;
