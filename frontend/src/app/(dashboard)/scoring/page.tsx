'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  BarChart3,
  CheckCircle,
  XCircle,
  Send,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { useScoreDeal } from '@/hooks/use-scoring';
import { toast } from 'sonner';
import type { ScoringResult, Property } from '@/types';

const matchTypeColors: Record<string, string> = {
  strong: 'bg-green-500/10 text-green-500 border-green-500/20',
  moderate: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  weak: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  no_match: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const states = ['TX', 'GA', 'FL', 'AZ', 'NC', 'SC', 'TN', 'AL', 'OH', 'IN'];
const propertyTypes = ['Single Family', 'Townhouse', 'Condo', 'Multi-Family'];

export default function ScoringPage() {
  const [formData, setFormData] = useState({
    address: '123 Oak Street',
    city: 'Dallas',
    state: 'TX',
    propertyType: 'Single Family',
    askingPrice: '285000',
    arv: '350000',
    yearBuilt: '1995',
    bedrooms: '3',
    bathrooms: '2',
    sqft: '1850',
  });
  const [results, setResults] = useState<ScoringResult[]>([]);

  const scoreDeal = useScoreDeal();

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleScore = async () => {
    const deal: Partial<Property> = {
      address: {
        houseNumber: '123',
        street: formData.address || 'Main Street',
      },
      city: formData.city,
      state: formData.state,
      propertyType: formData.propertyType,
      askingPrice: parseInt(formData.askingPrice) || 0,
      arv: parseInt(formData.arv) || 0,
      yearBuilt: parseInt(formData.yearBuilt) || 0,
      bedroomCount: parseInt(formData.bedrooms) || 0,
      bathroomCount: parseFloat(formData.bathrooms) || 0,
      livingSpaceSqFt: parseInt(formData.sqft) || 0,
    };

    try {
      const scoringResults = await scoreDeal.mutateAsync(deal);
      setResults(scoringResults);
      toast.success(`Scored against ${scoringResults.length} buy boxes`);
    } catch (error) {
      toast.error('Failed to score deal');
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Scoring</h1>
        <p className="text-muted-foreground mt-1">Test deal scoring against buy boxes</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Test Deal Form */}
        <Card className="bg-card border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-foreground">Test Deal Properties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Address</Label>
              <Input
                placeholder="123 Main St"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                className="bg-secondary border text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">City</Label>
                <Input
                  placeholder="Dallas"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  className="bg-secondary border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">State</Label>
                <Select value={formData.state} onValueChange={(v) => handleInputChange('state', v)}>
                  <SelectTrigger className="bg-secondary border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    {states.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator className="bg-secondary" />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Property Type</Label>
                <Select value={formData.propertyType} onValueChange={(v) => handleInputChange('propertyType', v)}>
                  <SelectTrigger className="bg-secondary border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    {propertyTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Asking Price</Label>
                <Input
                  type="number"
                  placeholder="250000"
                  value={formData.askingPrice}
                  onChange={(e) => handleInputChange('askingPrice', e.target.value)}
                  className="bg-secondary border text-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">ARV</Label>
                <Input
                  type="number"
                  placeholder="320000"
                  value={formData.arv}
                  onChange={(e) => handleInputChange('arv', e.target.value)}
                  className="bg-secondary border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Year Built</Label>
                <Input
                  type="number"
                  placeholder="2000"
                  value={formData.yearBuilt}
                  onChange={(e) => handleInputChange('yearBuilt', e.target.value)}
                  className="bg-secondary border text-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Bedrooms</Label>
                <Input
                  type="number"
                  placeholder="3"
                  value={formData.bedrooms}
                  onChange={(e) => handleInputChange('bedrooms', e.target.value)}
                  className="bg-secondary border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Bathrooms</Label>
                <Input
                  type="number"
                  placeholder="2"
                  value={formData.bathrooms}
                  onChange={(e) => handleInputChange('bathrooms', e.target.value)}
                  className="bg-secondary border text-foreground"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Square Feet</Label>
              <Input
                type="number"
                placeholder="1800"
                value={formData.sqft}
                onChange={(e) => handleInputChange('sqft', e.target.value)}
                className="bg-secondary border text-foreground"
              />
            </div>

            <Button
              onClick={handleScore}
              disabled={scoreDeal.isPending}
              className="w-full bg-accent-600 hover:bg-accent-700 text-white"
            >
              {scoreDeal.isPending ? (
                <>
                  <BarChart3 className="mr-2 h-4 w-4 animate-pulse" />
                  Scoring...
                </>
              ) : (
                <>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Score Against Buy Boxes
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="bg-card border lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-foreground">Scoring Results</CardTitle>
          </CardHeader>
          <CardContent>
            {scoreDeal.isPending ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Ready to Score</h3>
                <p className="text-muted-foreground max-w-sm">
                  Enter deal properties and click &quot;Score&quot; to see matching buy boxes
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[600px] pr-4">
                <Accordion type="single" collapsible className="space-y-4">
                  {results.map((result) => (
                    <AccordionItem
                      key={result.buyBoxId}
                      value={result.buyBoxId}
                      className="border border rounded-lg px-4"
                    >
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center gap-3">
                            {result.passedHardRequirements ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-500" />
                            )}
                            <div className="text-left">
                              <p className="font-medium text-foreground">{result.buyBoxName}</p>
                              <p className="text-sm text-muted-foreground">{result.fundName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className={matchTypeColors[result.matchType] || matchTypeColors.no_match}>
                              {result.matchType?.replace('_', ' ') || 'unknown'}
                            </Badge>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-foreground">{result.percentage}%</p>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="space-y-4">
                          <Progress
                            value={result.percentage}
                            className="h-2"
                          />

                          {result.failedHardRequirements && result.failedHardRequirements.length > 0 && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-medium text-red-400">Hard Requirements Failed</p>
                                <ul className="text-sm text-red-300 mt-1">
                                  {result.failedHardRequirements.map((req, i) => (
                                    <li key={i}>- {req}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}

                          {result.autoSubmitEligible && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                              <Zap className="h-5 w-5 text-green-500" />
                              <span className="text-green-400">Auto-submit eligible</span>
                            </div>
                          )}

                          {result.breakdown && result.breakdown.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-muted-foreground">Score Breakdown</p>
                              {result.breakdown.map((item, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between p-2 rounded bg-secondary/50"
                                >
                                  <div className="flex items-center gap-2">
                                    {item.passed ? (
                                      <CheckCircle className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span className="text-sm text-foreground">{item.criterion}</span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-xs text-muted-foreground">{item.details}</span>
                                    <span className="text-sm font-medium text-foreground">
                                      {item.earnedPoints}/{item.maxPoints}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {result.matchType === 'strong' && (
                            <Button className="w-full bg-accent-600 hover:bg-accent-700 text-white">
                              <Send className="mr-2 h-4 w-4" />
                              Submit to {result.fundName}
                            </Button>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
