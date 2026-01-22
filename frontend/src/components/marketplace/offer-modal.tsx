'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  DollarSign,
  Calendar,
  FileText,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { MarketplaceDeal, OfferRequest, FinanceType } from '@/types/marketplace';

const offerSchema = z.object({
  offerAmount: z.number().min(1000, 'Offer amount must be at least $1,000'),
  earnestMoney: z.number().min(0).optional(),
  closingDays: z.number().min(1).max(120, 'Closing must be within 120 days'),
  financeType: z.enum(['cash', 'hard_money', 'conventional', 'other']),
  proofOfFunds: z.boolean(),
  contingencies: z.array(z.string()),
  notes: z.string().max(500).optional(),
});

type OfferFormData = z.infer<typeof offerSchema>;

const CONTINGENCY_OPTIONS = [
  { id: 'inspection', label: 'Inspection' },
  { id: 'appraisal', label: 'Appraisal' },
  { id: 'financing', label: 'Financing' },
  { id: 'title', label: 'Clear Title' },
  { id: 'survey', label: 'Survey' },
];

const FINANCE_TYPE_OPTIONS: { value: FinanceType; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'hard_money', label: 'Hard Money' },
  { value: 'conventional', label: 'Conventional' },
  { value: 'other', label: 'Other' },
];

interface OfferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: MarketplaceDeal | null;
  onSubmit: (data: OfferRequest) => Promise<void>;
  isSubmitting?: boolean;
}

export function OfferModal({
  open,
  onOpenChange,
  deal,
  onSubmit,
  isSubmitting = false,
}: OfferModalProps) {
  const [step, setStep] = useState<'form' | 'review' | 'success'>('form');
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<OfferFormData>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
      offerAmount: deal?.deal.price || 0,
      earnestMoney: 0,
      closingDays: 14,
      financeType: 'cash',
      proofOfFunds: false,
      contingencies: [],
      notes: '',
    },
  });

  const formValues = watch();
  const contingencies = watch('contingencies');

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const handleFormSubmit = async (data: OfferFormData) => {
    if (step === 'form') {
      setStep('review');
      return;
    }

    try {
      await onSubmit({
        offerAmount: data.offerAmount,
        earnestMoney: data.earnestMoney,
        closingDays: data.closingDays,
        financeType: data.financeType,
        proofOfFunds: data.proofOfFunds,
        contingencies: data.contingencies,
        notes: data.notes,
      });
      setStep('success');
    } catch (error) {
      // Error handling is done in parent
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Clear any existing timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    // Reset after animation
    closeTimeoutRef.current = setTimeout(() => {
      setStep('form');
      reset();
      closeTimeoutRef.current = null;
    }, 200);
  };

  const toggleContingency = (id: string) => {
    const current = contingencies || [];
    if (current.includes(id)) {
      setValue(
        'contingencies',
        current.filter((c) => c !== id)
      );
    } else {
      setValue('contingencies', [...current, id]);
    }
  };

  if (!deal) return null;

  const askingPrice = deal.deal.price;
  const offerDiff = formValues.offerAmount - askingPrice;
  const offerDiffPercent = ((offerDiff / askingPrice) * 100).toFixed(1);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {step === 'success' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-8 text-center"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold">Offer Submitted!</h3>
              <p className="mt-1 text-muted-foreground">
                Your offer of {formatPrice(formValues.offerAmount)} has been sent to the wholesaler.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              You&apos;ll receive a notification when they respond.
            </p>
            <Button onClick={handleClose} className="mt-4">
              Done
            </Button>
          </motion.div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {step === 'form' ? 'Make an Offer' : 'Review Your Offer'}
              </DialogTitle>
              <DialogDescription>
                {step === 'form' ? (
                  <>
                    <span className="font-medium">{deal.deal.city}, {deal.deal.state}</span>
                    <span className="mx-2">•</span>
                    <span>Asking: {formatPrice(askingPrice)}</span>
                  </>
                ) : (
                  'Please review your offer details before submitting.'
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit(handleFormSubmit)}>
              {step === 'form' ? (
                <div className="space-y-4 py-4">
                  {/* Offer Amount */}
                  <div className="space-y-2">
                    <Label htmlFor="offerAmount">Offer Amount</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="offerAmount"
                        type="number"
                        className="pl-9"
                        {...register('offerAmount', { valueAsNumber: true })}
                      />
                    </div>
                    {formValues.offerAmount > 0 && (
                      <p
                        className={cn(
                          'text-xs',
                          offerDiff >= 0 ? 'text-amber-600' : 'text-green-600'
                        )}
                      >
                        {offerDiff >= 0 ? '+' : ''}
                        {formatPrice(offerDiff)} ({offerDiffPercent}%) {offerDiff >= 0 ? 'above' : 'below'} asking
                      </p>
                    )}
                    {errors.offerAmount && (
                      <p className="text-xs text-destructive">{errors.offerAmount.message}</p>
                    )}
                  </div>

                  {/* Earnest Money */}
                  <div className="space-y-2">
                    <Label htmlFor="earnestMoney">Earnest Money Deposit (Optional)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="earnestMoney"
                        type="number"
                        className="pl-9"
                        placeholder="0"
                        {...register('earnestMoney', { valueAsNumber: true })}
                      />
                    </div>
                  </div>

                  {/* Closing Days */}
                  <div className="space-y-2">
                    <Label htmlFor="closingDays">Days to Close</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="closingDays"
                        type="number"
                        className="pl-9"
                        {...register('closingDays', { valueAsNumber: true })}
                      />
                    </div>
                    {errors.closingDays && (
                      <p className="text-xs text-destructive">{errors.closingDays.message}</p>
                    )}
                  </div>

                  {/* Finance Type */}
                  <div className="space-y-2">
                    <Label>Financing Type</Label>
                    <Select
                      value={formValues.financeType}
                      onValueChange={(value: FinanceType) => setValue('financeType', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FINANCE_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Proof of Funds */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="proofOfFunds"
                      checked={formValues.proofOfFunds}
                      onCheckedChange={(checked) => setValue('proofOfFunds', !!checked)}
                    />
                    <Label htmlFor="proofOfFunds" className="cursor-pointer text-sm">
                      I have proof of funds available
                    </Label>
                  </div>

                  {/* Contingencies */}
                  <div className="space-y-2">
                    <Label>Contingencies</Label>
                    <div className="flex flex-wrap gap-2">
                      {CONTINGENCY_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleContingency(option.id)}
                          className={cn(
                            'rounded-full border px-3 py-1 text-sm transition-colors',
                            contingencies?.includes(option.id)
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Any additional terms or notes for the seller..."
                      className="resize-none"
                      rows={3}
                      {...register('notes')}
                    />
                  </div>
                </div>
              ) : (
                /* Review Step */
                <div className="space-y-4 py-4">
                  <div className="rounded-lg bg-muted p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground">Offer Amount</div>
                        <div className="text-lg font-semibold">
                          {formatPrice(formValues.offerAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Asking Price</div>
                        <div className="text-lg">{formatPrice(askingPrice)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Days to Close</div>
                        <div className="font-medium">{formValues.closingDays} days</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Finance Type</div>
                        <div className="font-medium capitalize">
                          {formValues.financeType.replace('_', ' ')}
                        </div>
                      </div>
                      {formValues.earnestMoney && formValues.earnestMoney > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground">Earnest Money</div>
                          <div className="font-medium">
                            {formatPrice(formValues.earnestMoney)}
                          </div>
                        </div>
                      )}
                      {contingencies && contingencies.length > 0 && (
                        <div className="col-span-2">
                          <div className="text-xs text-muted-foreground">Contingencies</div>
                          <div className="font-medium capitalize">
                            {contingencies.join(', ')}
                          </div>
                        </div>
                      )}
                      {formValues.notes && (
                        <div className="col-span-2">
                          <div className="text-xs text-muted-foreground">Notes</div>
                          <div className="text-sm">{formValues.notes}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <p>
                      By submitting this offer, you agree to proceed with the purchase if accepted.
                      Offers expire in 3 days.
                    </p>
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                {step === 'review' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep('form')}
                    disabled={isSubmitting}
                  >
                    Back
                  </Button>
                )}
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : step === 'form' ? (
                    'Review Offer'
                  ) : (
                    'Submit Offer'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
