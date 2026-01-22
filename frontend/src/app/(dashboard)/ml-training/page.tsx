'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Brain,
  Plus,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileDown,
  Play,
  TrendingUp,
  Target,
  Database,
} from 'lucide-react';
import {
  useFunds,
  useStates,
  usePropertyTypes,
  useResponseTypes,
  useLossCategories,
  useWinFactors,
  useMLStatus,
  useTrainingReadiness,
  useRecordFeedback,
  useTriggerTraining,
  useTrainingHistory,
} from '@/hooks/use-ml-training';
import { toast } from 'sonner';

interface FormData {
  dealId: string;
  askingPrice: string;
  arv: string;
  sqft: string;
  yearBuilt: string;
  bedrooms: string;
  bathrooms: string;
  repairEstimate: string;
  state: string;
  propertyType: string;
  street: string;
  city: string;
  zip: string;
  monthlyRent: string;
  photoCount: string;
  fundName: string;
  buyBoxId: string;
  submissionScore: string;
  responseType: string;
  offerAmount: string;
  lossCategory: string;
  winFactors: string[];
  lessonsLearned: string;
}

const initialFormData: FormData = {
  dealId: '',
  askingPrice: '',
  arv: '',
  sqft: '',
  yearBuilt: '',
  bedrooms: '',
  bathrooms: '',
  repairEstimate: '',
  state: '',
  propertyType: 'single_family',
  street: '',
  city: '',
  zip: '',
  monthlyRent: '',
  photoCount: '',
  fundName: '',
  buyBoxId: '',
  submissionScore: '',
  responseType: '',
  offerAmount: '',
  lossCategory: '',
  winFactors: [],
  lessonsLearned: '',
};

export default function MLTrainingPage() {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [activeTab, setActiveTab] = useState('add-data');

  // Data hooks
  const { data: fundsData, isLoading: loadingFunds } = useFunds();
  const { data: states, isLoading: loadingStates } = useStates();
  const { data: propertyTypes } = usePropertyTypes();
  const { data: responseTypes } = useResponseTypes();
  const { data: lossCategories } = useLossCategories();
  const { data: winFactors } = useWinFactors();
  const { data: mlStatus } = useMLStatus();
  const { data: readiness } = useTrainingReadiness();
  const { data: trainingHistory } = useTrainingHistory(5);

  // Mutations
  const recordFeedback = useRecordFeedback();
  const triggerTraining = useTriggerTraining();

  const handleInputChange = (field: keyof FormData, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFundChange = (fundName: string) => {
    const buyBox = fundsData?.buyBoxes.find((bb) => bb.fundName === fundName);
    setFormData((prev) => ({
      ...prev,
      fundName,
      buyBoxId: buyBox?.id || '',
    }));
  };

  const handleWinFactorToggle = (factor: string) => {
    setFormData((prev) => ({
      ...prev,
      winFactors: prev.winFactors.includes(factor)
        ? prev.winFactors.filter((f) => f !== factor)
        : [...prev.winFactors, factor],
    }));
  };

  const isPositiveOutcome = formData.responseType === 'closed' || formData.responseType === 'offer_accepted';
  const isNegativeOutcome = formData.responseType === 'passed' || formData.responseType === 'no_response';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.dealId || !formData.fundName || !formData.responseType) {
      toast.error('Please fill in required fields: Deal ID, Fund Name, and Response Type');
      return;
    }

    try {
      await recordFeedback.mutateAsync({
        dealId: formData.dealId,
        buyBoxId: formData.buyBoxId,
        fundName: formData.fundName,
        responseType: formData.responseType,
        submissionScore: parseFloat(formData.submissionScore) || 0,
        offerAmount: formData.offerAmount ? parseFloat(formData.offerAmount) : undefined,
        lossCategory: isNegativeOutcome ? formData.lossCategory : undefined,
        winFactors: isPositiveOutcome ? formData.winFactors.join(';') : undefined,
        lessonsLearned: formData.lessonsLearned || undefined,
        dealSnapshot: {
          askingPrice: parseFloat(formData.askingPrice) || 0,
          arv: parseFloat(formData.arv) || 0,
          sqft: parseFloat(formData.sqft) || 0,
          yearBuilt: parseInt(formData.yearBuilt) || 0,
          bedrooms: parseInt(formData.bedrooms) || 0,
          bathrooms: parseFloat(formData.bathrooms) || 0,
          repairEstimate: parseFloat(formData.repairEstimate) || 0,
          state: formData.state,
          propertyType: formData.propertyType,
          street: formData.street,
          city: formData.city,
          zip: formData.zip,
          monthlyRent: parseFloat(formData.monthlyRent) || undefined,
          photoCount: parseInt(formData.photoCount) || undefined,
        },
      });

      toast.success('Training data recorded successfully');
      setFormData(initialFormData);
    } catch (error) {
      toast.error('Failed to record training data');
    }
  };

  const handleTriggerTraining = async () => {
    try {
      const result = await triggerTraining.mutateAsync('deal_quality');
      if (result.success) {
        toast.success('Training completed successfully');
      } else {
        toast.error(result.message || 'Training failed');
      }
    } catch (error) {
      toast.error('Failed to trigger training');
    }
  };

  const readinessPercentage = readiness
    ? Math.min(100, (readiness.sampleCount / readiness.minRequired) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Brain className="h-8 w-8 text-purple-500" />
            ML Training
          </h1>
          <p className="text-muted-foreground mt-1">
            Train and improve deal quality prediction model
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border text-foreground"
            onClick={() => window.open('/api/ml/training/export', '_blank')}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Export Data
          </Button>
          <Button
            onClick={handleTriggerTraining}
            disabled={triggerTraining.isPending || !readiness?.ready}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {triggerTraining.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Training...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Train Model
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Model Status</p>
                <p className="text-2xl font-bold text-foreground">
                  {mlStatus?.modelLoaded ? 'Active' : 'Not Loaded'}
                </p>
              </div>
              <div
                className={`h-10 w-10 rounded-full flex items-center justify-center ${
                  mlStatus?.modelLoaded ? 'bg-green-500/20' : 'bg-zinc-700'
                }`}
              >
                <Brain
                  className={`h-5 w-5 ${mlStatus?.modelLoaded ? 'text-green-500' : 'text-muted-foreground'}`}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Training Samples</p>
                <p className="text-2xl font-bold text-foreground">
                  {readiness?.sampleCount || 0}
                  <span className="text-sm text-muted-foreground ml-1">/ {readiness?.minRequired || 100}</span>
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-accent-500/20 flex items-center justify-center">
                <Database className="h-5 w-5 text-accent-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Positive Samples</p>
                <p className="text-2xl font-bold text-green-400">{readiness?.positiveCount || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Negative Samples</p>
                <p className="text-2xl font-bold text-red-400">{readiness?.negativeCount || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Target className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Training Readiness */}
      <Card className="bg-card border">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Training Readiness</span>
            <span className="text-sm text-foreground">{Math.round(readinessPercentage)}%</span>
          </div>
          <Progress value={readinessPercentage} className="h-2" />
          {readiness && (
            <p className="text-sm text-muted-foreground mt-2">{readiness.recommendation}</p>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-secondary border">
          <TabsTrigger value="add-data" className="data-[state=active]:bg-secondary">
            <Plus className="mr-2 h-4 w-4" />
            Add Training Data
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-secondary">
            <Database className="mr-2 h-4 w-4" />
            Training History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="add-data">
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Deal Information */}
              <Card className="bg-card border">
                <CardHeader>
                  <CardTitle className="text-foreground">Deal Information</CardTitle>
                  <CardDescription>Core property details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Deal ID *</Label>
                    <Input
                      value={formData.dealId}
                      onChange={(e) => handleInputChange('dealId', e.target.value)}
                      placeholder="deal-001"
                      className="bg-secondary border text-foreground"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Asking Price ($) *</Label>
                      <Input
                        type="number"
                        value={formData.askingPrice}
                        onChange={(e) => handleInputChange('askingPrice', e.target.value)}
                        placeholder="185000"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">ARV ($) *</Label>
                      <Input
                        type="number"
                        value={formData.arv}
                        onChange={(e) => handleInputChange('arv', e.target.value)}
                        placeholder="265000"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Sq Ft</Label>
                      <Input
                        type="number"
                        value={formData.sqft}
                        onChange={(e) => handleInputChange('sqft', e.target.value)}
                        placeholder="1850"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Year Built</Label>
                      <Input
                        type="number"
                        value={formData.yearBuilt}
                        onChange={(e) => handleInputChange('yearBuilt', e.target.value)}
                        placeholder="1998"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Repair Est ($)</Label>
                      <Input
                        type="number"
                        value={formData.repairEstimate}
                        onChange={(e) => handleInputChange('repairEstimate', e.target.value)}
                        placeholder="35000"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Bedrooms</Label>
                      <Input
                        type="number"
                        value={formData.bedrooms}
                        onChange={(e) => handleInputChange('bedrooms', e.target.value)}
                        placeholder="3"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Bathrooms</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formData.bathrooms}
                        onChange={(e) => handleInputChange('bathrooms', e.target.value)}
                        placeholder="2"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">State *</Label>
                      <Select
                        value={formData.state}
                        onValueChange={(value) => handleInputChange('state', value)}
                      >
                        <SelectTrigger className="bg-secondary border text-foreground">
                          <SelectValue placeholder={loadingStates ? 'Loading...' : 'Select state'} />
                        </SelectTrigger>
                        <SelectContent className="bg-secondary border">
                          {states?.map((state) => (
                            <SelectItem key={state.code} value={state.code}>
                              {state.name} ({state.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Property Type</Label>
                      <Select
                        value={formData.propertyType}
                        onValueChange={(value) => handleInputChange('propertyType', value)}
                      >
                        <SelectTrigger className="bg-secondary border text-foreground">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent className="bg-secondary border">
                          {propertyTypes?.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Street Address</Label>
                    <Input
                      value={formData.street}
                      onChange={(e) => handleInputChange('street', e.target.value)}
                      placeholder="123 Oak Lane"
                      className="bg-secondary border text-foreground"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">City</Label>
                      <Input
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        placeholder="Orlando"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">ZIP</Label>
                      <Input
                        value={formData.zip}
                        onChange={(e) => handleInputChange('zip', e.target.value)}
                        placeholder="32801"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Monthly Rent ($)</Label>
                      <Input
                        type="number"
                        value={formData.monthlyRent}
                        onChange={(e) => handleInputChange('monthlyRent', e.target.value)}
                        placeholder="1800"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Photo Count</Label>
                      <Input
                        type="number"
                        value={formData.photoCount}
                        onChange={(e) => handleInputChange('photoCount', e.target.value)}
                        placeholder="12"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Fund Response */}
              <Card className="bg-card border">
                <CardHeader>
                  <CardTitle className="text-foreground">Fund Response</CardTitle>
                  <CardDescription>How the fund responded to this deal</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Fund Name *</Label>
                    <Select
                      value={formData.fundName}
                      onValueChange={handleFundChange}
                    >
                      <SelectTrigger className="bg-secondary border text-foreground">
                        <SelectValue placeholder={loadingFunds ? 'Loading...' : 'Select fund'} />
                      </SelectTrigger>
                      <SelectContent className="bg-secondary border">
                        {fundsData?.funds.map((fund) => (
                          <SelectItem key={fund} value={fund}>
                            {fund}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Buy Box ID</Label>
                    <Input
                      value={formData.buyBoxId}
                      readOnly
                      placeholder="Auto-filled from fund"
                      className="bg-secondary border text-muted-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Submission Score (0-100)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.submissionScore}
                      onChange={(e) => handleInputChange('submissionScore', e.target.value)}
                      placeholder="87.5"
                      className="bg-secondary border text-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Response Type *</Label>
                    <Select
                      value={formData.responseType}
                      onValueChange={(value) => handleInputChange('responseType', value)}
                    >
                      <SelectTrigger className="bg-secondary border text-foreground">
                        <SelectValue placeholder="Select response" />
                      </SelectTrigger>
                      <SelectContent className="bg-secondary border">
                        {responseTypes?.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <span
                              className={
                                type.category === 'positive'
                                  ? 'text-green-400'
                                  : type.category === 'negative'
                                  ? 'text-red-400'
                                  : 'text-foreground'
                              }
                            >
                              {type.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(formData.responseType === 'offer_made' ||
                    formData.responseType === 'offer_accepted' ||
                    formData.responseType === 'closed') && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Offer Amount ($)</Label>
                      <Input
                        type="number"
                        value={formData.offerAmount}
                        onChange={(e) => handleInputChange('offerAmount', e.target.value)}
                        placeholder="178000"
                        className="bg-secondary border text-foreground"
                      />
                    </div>
                  )}

                  {/* Loss Analysis (for negative outcomes) */}
                  {isNegativeOutcome && (
                    <div className="space-y-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                        <Label className="text-red-400 font-medium">Loss Analysis</Label>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Loss Category</Label>
                        <Select
                          value={formData.lossCategory}
                          onValueChange={(value) => handleInputChange('lossCategory', value)}
                        >
                          <SelectTrigger className="bg-secondary border text-foreground">
                            <SelectValue placeholder="Why was this deal lost?" />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {lossCategories?.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Win Analysis (for positive outcomes) */}
                  {isPositiveOutcome && (
                    <div className="space-y-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <Label className="text-green-400 font-medium">Win Analysis</Label>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Success Factors (select all that apply)</Label>
                        <div className="flex flex-wrap gap-2">
                          {winFactors?.map((factor) => (
                            <Badge
                              key={factor.value}
                              variant={formData.winFactors.includes(factor.value) ? 'default' : 'outline'}
                              className={`cursor-pointer ${
                                formData.winFactors.includes(factor.value)
                                  ? 'bg-green-600 hover:bg-green-700'
                                  : 'border text-muted-foreground hover:border-green-500'
                              }`}
                              onClick={() => handleWinFactorToggle(factor.value)}
                            >
                              {factor.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Lessons Learned</Label>
                    <Textarea
                      value={formData.lessonsLearned}
                      onChange={(e) => handleInputChange('lessonsLearned', e.target.value)}
                      placeholder="What would you do differently? What worked well?"
                      className="bg-secondary border text-foreground min-h-[100px]"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={recordFeedback.isPending}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {recordFeedback.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Training Data
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="history">
          <Card className="bg-card border">
            <CardHeader>
              <CardTitle className="text-foreground">Recent Training Runs</CardTitle>
              <CardDescription>History of model training sessions</CardDescription>
            </CardHeader>
            <CardContent>
              {trainingHistory && trainingHistory.length > 0 ? (
                <div className="space-y-4">
                  {trainingHistory.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
                    >
                      <div>
                        <p className="font-medium text-foreground">{run.modelType}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(run.startedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        {run.metrics && (
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Accuracy</p>
                            <p className="font-medium text-green-400">
                              {(run.metrics.accuracy * 100).toFixed(1)}%
                            </p>
                          </div>
                        )}
                        <Badge
                          variant={run.status === 'completed' ? 'default' : 'secondary'}
                          className={
                            run.status === 'completed'
                              ? 'bg-green-600'
                              : run.status === 'failed'
                              ? 'bg-red-600'
                              : 'bg-yellow-600'
                          }
                        >
                          {run.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No training runs yet</p>
                  <p className="text-sm text-muted-foreground">
                    Add at least {readiness?.minRequired || 100} samples to start training
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
