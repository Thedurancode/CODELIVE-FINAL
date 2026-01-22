'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  DollarSign,
  MapPin,
  Mail,
  Phone,
  Check,
  ArrowRight,
  ArrowLeft,
  Home,
  Zap,
  X,
  Plus,
  TrendingUp,
  Shield,
} from 'lucide-react';
import { useCreateBuyBox, useUpdateBuyBox } from '@/hooks/use-buyboxes';
import { toast } from 'sonner';
import type { HedgeFundBuyBox } from '@/types';

const US_STATES = [
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' },
];

const PROPERTY_TYPES = [
  { value: 'single_family', label: 'Single-Family', icon: '🏠' },
  { value: 'condo_townhome', label: 'Condo/Townhome', icon: '🏘️' },
  { value: 'duplex_triplex_fourplex', label: 'Multi-Family 2-4', icon: '🏗️' },
  { value: 'small_multifamily', label: 'Multi-Family 5-20', icon: '🏢' },
  { value: 'large_multifamily', label: 'Multi-Family 20+', icon: '🏙️' },
  { value: 'portfolio', label: 'Portfolios', icon: '📊' },
  { value: 'commercial', label: 'Commercial', icon: '🏪' },
  { value: 'mobile_home_park', label: 'Mobile Home', icon: '🏕️' },
  { value: 'storage_units', label: 'Storage', icon: '📦' },
  { value: 'other', label: 'Other', icon: '🔧' },
];

const STRATEGIES = [
  { value: 'fix_and_flip', label: 'Fix & Flip', icon: '🔨' },
  { value: 'long_term_rental', label: 'Buy & Hold', icon: '🏠' },
  { value: 'short_term_rental', label: 'STR', icon: '🌴' },
  { value: 'wholesale', label: 'Wholesale', icon: '📦' },
];

const FUND_TYPES = [
  { value: 'institutional', label: 'Institutional' },
  { value: 'private_equity', label: 'Private Equity' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'reit', label: 'REIT' },
  { value: 'hedge_fund', label: 'Hedge Fund' },
  { value: 'other', label: 'Other' },
];

interface CustomCriteria {
  id: string;
  name: string;
  enabled: boolean;
}

interface AdminBuyBoxFormProps {
  buyBox?: HedgeFundBuyBox;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function AdminBuyBoxForm({ buyBox, onSuccess, onCancel }: AdminBuyBoxFormProps) {
  const createBuyBox = useCreateBuyBox();
  const updateBuyBox = useUpdateBuyBox();
  const isEditing = !!buyBox;

  const [step, setStep] = useState(1);
  const [customCriteriaInput, setCustomCriteriaInput] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    name: buyBox?.name || '',
    fundName: buyBox?.fundName || '',
    fundType: buyBox?.fundType || 'institutional',
    contactEmail: buyBox?.contactEmail || '',
    contactPhone: buyBox?.contactPhone || '',
    states: buyBox?.criteria?.states || [],
    propertyTypes: buyBox?.criteria?.propertyTypes || [],
    minPrice: buyBox?.criteria?.minPrice || 50000,
    maxPrice: buyBox?.criteria?.maxPrice || 500000,
    minBedrooms: buyBox?.criteria?.minBedrooms || 2,
    maxBedrooms: buyBox?.criteria?.maxBedrooms || 6,
    investmentStrategies: buyBox?.criteria?.investmentStrategies || [],
    // Risk tolerance
    allowHoa: buyBox?.criteria?.allowHoa ?? false,
    allowPool: buyBox?.criteria?.allowPool ?? false,
    allowFloodZone: buyBox?.criteria?.allowFloodZone ?? false,
    allowFoundationIssues: buyBox?.criteria?.allowFoundationIssues ?? false,
    allowSeptic: buyBox?.criteria?.allowSeptic ?? false,
    allowWell: buyBox?.criteria?.allowWell ?? false,
    allowSolarPanels: buyBox?.criteria?.allowSolarPanels ?? false,
    allowFireDamage: buyBox?.criteria?.allowFireDamage ?? false,
    allowCodeViolations: buyBox?.criteria?.allowCodeViolations ?? false,
    // Custom criteria
    customCriteria: [] as CustomCriteria[],
    // Auto submit
    autoSubmit: buyBox?.autoSubmit ?? false,
    autoSubmitThreshold: buyBox?.autoSubmitThreshold || 80,
    priority: buyBox?.priority || 5,
  });

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const toggleState = (state: string) => {
    setFormData((prev) => ({
      ...prev,
      states: prev.states.includes(state)
        ? prev.states.filter((s) => s !== state)
        : [...prev.states, state],
    }));
  };

  const togglePropertyType = (type: string) => {
    setFormData((prev) => ({
      ...prev,
      propertyTypes: prev.propertyTypes.includes(type)
        ? prev.propertyTypes.filter((t) => t !== type)
        : [...prev.propertyTypes, type],
    }));
  };

  const toggleStrategy = (strategy: string) => {
    setFormData((prev) => ({
      ...prev,
      investmentStrategies: prev.investmentStrategies.includes(strategy)
        ? prev.investmentStrategies.filter((s) => s !== strategy)
        : [...prev.investmentStrategies, strategy],
    }));
  };

  const addCustomCriteria = () => {
    const name = customCriteriaInput.trim().toUpperCase();
    if (name && !formData.customCriteria.some(c => c.name === name)) {
      setFormData((prev) => ({
        ...prev,
        customCriteria: [...prev.customCriteria, { id: `custom-${Date.now()}`, name, enabled: true }],
      }));
      setCustomCriteriaInput('');
    }
  };

  const removeCustomCriteria = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      customCriteria: prev.customCriteria.filter((c) => c.id !== id),
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Buy box name is required');
      return;
    }
    if (formData.states.length === 0) {
      toast.error('Select at least one state');
      return;
    }

    const criteria = {
      states: formData.states,
      propertyTypes: formData.propertyTypes.length > 0 ? formData.propertyTypes : undefined,
      minPrice: formData.minPrice || undefined,
      maxPrice: formData.maxPrice || undefined,
      minBedrooms: formData.minBedrooms || undefined,
      maxBedrooms: formData.maxBedrooms || undefined,
      investmentStrategies: formData.investmentStrategies.length > 0 ? formData.investmentStrategies : undefined,
      allowHoa: formData.allowHoa,
      allowPool: formData.allowPool,
      allowSeptic: formData.allowSeptic,
      allowWell: formData.allowWell,
      allowFloodZone: formData.allowFloodZone,
      allowFoundationIssues: formData.allowFoundationIssues,
      allowSolarPanels: formData.allowSolarPanels,
      allowFireDamage: formData.allowFireDamage,
      allowCodeViolations: formData.allowCodeViolations,
      hardNos: formData.customCriteria.filter(c => !c.enabled).map(c => c.name).join(', ') || undefined,
    };

    const payload = {
      fund_name: formData.fundName || formData.name,
      fund_type: formData.fundType,
      criteria,
      contact_email: formData.contactEmail || undefined,
      contact_phone: formData.contactPhone || undefined,
      active: true,
      priority: formData.priority,
      auto_submit: formData.autoSubmit,
      auto_submit_threshold: formData.autoSubmitThreshold,
    };

    try {
      if (isEditing && buyBox) {
        await updateBuyBox.mutateAsync({ id: buyBox.id, data: payload });
        toast.success('Buy box updated successfully!');
      } else {
        await createBuyBox.mutateAsync(payload);
        toast.success('Buy box created successfully!');
      }
      onSuccess?.();
    } catch (error) {
      toast.error(isEditing ? 'Failed to update buy box' : 'Failed to create buy box');
    }
  };

  const canProceed = () => {
    if (step === 1) return formData.name.trim() !== '';
    if (step === 2) return formData.states.length > 0;
    return true;
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {isEditing ? 'Edit Buy Box' : 'Create Buy Box'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {step === 1 && 'Enter your info'}
            {step === 2 && 'Set location & price'}
            {step === 3 && 'Configure preferences'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium cursor-pointer transition-all ${
                step > s
                  ? 'bg-green-600 text-foreground'
                  : step === s
                  ? 'bg-green-600 text-foreground ring-2 ring-green-400/50'
                  : 'bg-secondary text-muted-foreground'
              }`}
              onClick={() => setStep(s)}
            >
              {step > s ? <Check className="w-4 h-4" /> : s}
            </div>
          ))}
        </div>
      </div>

      {/* Form Content */}
      <div className="py-5 space-y-5">
        {/* Step 1: Contact Info */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Buy Box Name *
              </Label>
              <Input
                placeholder="e.g., Texas Flips, Southeast Rentals"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-secondary/50 border text-foreground h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Company / Fund</Label>
                <Input
                  placeholder="ABC Investments LLC"
                  value={formData.fundName}
                  onChange={(e) => setFormData({ ...formData, fundName: e.target.value })}
                  className="bg-secondary/50 border text-foreground h-9 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Fund Type</Label>
                <Select value={formData.fundType} onValueChange={(v) => setFormData({ ...formData, fundType: v })}>
                  <SelectTrigger className="bg-secondary/50 border text-foreground h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-secondary border">
                    {FUND_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-foreground text-sm">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email
                </Label>
                <Input
                  type="email"
                  placeholder="deals@company.com"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  className="bg-secondary/50 border text-foreground h-9 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Phone
                </Label>
                <Input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: formatPhone(e.target.value) })}
                  className="bg-secondary/50 border text-foreground h-9 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Location & Price */}
        {step === 2 && (
          <div className="space-y-4">
            {/* States */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-foreground text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Target States *
                </Label>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData({ ...formData, states: US_STATES.map(s => s.value) })}
                    className="h-6 text-xs text-muted-foreground hover:text-foreground"
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData({ ...formData, states: [] })}
                    className="h-6 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              {formData.states.length > 0 && (
                <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">
                  {formData.states.length} states selected
                </Badge>
              )}
              <div className="grid grid-cols-8 gap-1 max-h-[140px] overflow-y-auto p-2 bg-secondary/30 rounded-lg">
                {US_STATES.map((state) => (
                  <button
                    key={state.value}
                    onClick={() => toggleState(state.value)}
                    className={`p-1.5 rounded text-xs font-medium transition-all ${
                      formData.states.includes(state.value)
                        ? 'bg-green-600 text-foreground'
                        : 'bg-secondary text-muted-foreground hover:bg-zinc-700'
                    }`}
                  >
                    {state.value}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Range */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Price Range
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    placeholder="Min"
                    value={formData.minPrice}
                    onChange={(e) => setFormData({ ...formData, minPrice: parseInt(e.target.value) || 0 })}
                    className="pl-7 bg-secondary/50 border text-foreground h-9 text-sm"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={formData.maxPrice}
                    onChange={(e) => setFormData({ ...formData, maxPrice: parseInt(e.target.value) || 0 })}
                    className="pl-7 bg-secondary/50 border text-foreground h-9 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Bedrooms */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm flex items-center gap-2">
                <Home className="w-4 h-4" /> Bedrooms
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  placeholder="Min beds"
                  value={formData.minBedrooms}
                  onChange={(e) => setFormData({ ...formData, minBedrooms: parseInt(e.target.value) || 0 })}
                  className="bg-secondary/50 border text-foreground h-9 text-sm"
                />
                <Input
                  type="number"
                  placeholder="Max beds"
                  value={formData.maxBedrooms}
                  onChange={(e) => setFormData({ ...formData, maxBedrooms: parseInt(e.target.value) || 0 })}
                  className="bg-secondary/50 border text-foreground h-9 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Preferences */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Property Types */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Property Types
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {PROPERTY_TYPES.map((type) => (
                  <div
                    key={type.value}
                    onClick={() => togglePropertyType(type.value)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                      formData.propertyTypes.includes(type.value)
                        ? 'bg-green-600/20 border-green-500 text-foreground'
                        : 'bg-secondary/30 border text-muted-foreground hover:border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{type.icon}</span>
                      <span className="text-xs font-medium">{type.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Investment Strategies */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Investment Strategy
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {STRATEGIES.map((strategy) => (
                  <div
                    key={strategy.value}
                    onClick={() => toggleStrategy(strategy.value)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                      formData.investmentStrategies.includes(strategy.value)
                        ? 'bg-green-600/20 border-green-500 text-foreground'
                        : 'bg-secondary/30 border text-muted-foreground hover:border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{strategy.icon}</span>
                      <span className="text-sm font-medium">{strategy.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Tolerance */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" /> Risk Tolerance
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'allowHoa', label: 'HOA' },
                  { key: 'allowPool', label: 'Pool' },
                  { key: 'allowSeptic', label: 'Septic' },
                  { key: 'allowWell', label: 'Well' },
                  { key: 'allowFloodZone', label: 'Flood Zone' },
                  { key: 'allowFoundationIssues', label: 'Foundation' },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg"
                  >
                    <span className="text-xs text-foreground">{item.label}</span>
                    <Switch
                      checked={(formData as any)[item.key]}
                      onCheckedChange={(v) => setFormData({ ...formData, [item.key]: v })}
                      className="scale-75"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Criteria */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> Custom Criteria
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., NO MOLD, YES GARAGE"
                  value={customCriteriaInput}
                  onChange={(e) => setCustomCriteriaInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addCustomCriteria()}
                  className="bg-secondary/50 border text-foreground h-9 text-sm"
                />
                <Button onClick={addCustomCriteria} size="sm" className="bg-green-600 hover:bg-green-700 text-foreground h-9">
                  Add
                </Button>
              </div>
              {formData.customCriteria.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {formData.customCriteria.map((c) => (
                    <Badge
                      key={c.id}
                      className="bg-green-600/20 text-green-400 border border-green-600/30 cursor-pointer text-xs"
                      onClick={() => removeCustomCriteria(c.id)}
                    >
                      {c.name} <X className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Auto-Submit */}
            <div className="p-3 bg-secondary/30 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-foreground font-medium">Auto-Submit</span>
                </div>
                <Switch
                  checked={formData.autoSubmit}
                  onCheckedChange={(v) => setFormData({ ...formData, autoSubmit: v })}
                />
              </div>
              {formData.autoSubmit && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-muted-foreground text-xs">Threshold (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.autoSubmitThreshold}
                      onChange={(e) => setFormData({ ...formData, autoSubmitThreshold: parseInt(e.target.value) || 0 })}
                      className="mt-1 bg-secondary/50 border text-foreground h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Priority (1-10)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
                      className="mt-1 bg-secondary/50 border text-foreground h-8 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t border pt-4 flex items-center justify-between">
        <div className="flex gap-2">
          {step > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(step - 1)}
              className="border text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="border text-foreground"
          >
            Cancel
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {formData.states.length > 0 && (
            <Badge className="bg-green-600/20 text-green-400 border border-green-600/30 text-xs">
              {formData.states.length} states
            </Badge>
          )}

          {step < 3 ? (
            <Button
              size="sm"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="bg-green-600 hover:bg-green-700 text-foreground"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={createBuyBox.isPending || updateBuyBox.isPending}
              className="bg-green-600 hover:bg-green-700 text-foreground"
            >
              {createBuyBox.isPending || updateBuyBox.isPending
                ? (isEditing ? 'Saving...' : 'Creating...')
                : (isEditing ? 'Save Changes' : 'Create Buy Box')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminBuyBoxForm;
