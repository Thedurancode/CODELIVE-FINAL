'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Building2,
  DollarSign,
  MapPin,
  Home,
  Mail,
  Phone,
  Zap,
  Check,
  X,
  ChevronRight,
} from 'lucide-react';
import { useCreateBuyBox, useUpdateBuyBox } from '@/hooks/use-buyboxes';
import { toast } from 'sonner';
import type { BuyBoxCriteria, HedgeFundBuyBox } from '@/types';

// US States grouped by region
const STATE_REGIONS = {
  'Southeast': ['FL', 'GA', 'AL', 'SC', 'NC', 'TN', 'MS', 'LA', 'AR', 'KY', 'VA', 'WV'],
  'Southwest': ['TX', 'AZ', 'NM', 'OK'],
  'Midwest': ['OH', 'IN', 'IL', 'MI', 'WI', 'MN', 'IA', 'MO', 'KS', 'NE', 'SD', 'ND'],
  'Northeast': ['NY', 'PA', 'NJ', 'CT', 'MA', 'RI', 'NH', 'VT', 'ME', 'MD', 'DE', 'DC'],
  'West': ['CA', 'NV', 'CO', 'UT', 'WA', 'OR', 'ID', 'MT', 'WY', 'AK', 'HI'],
};

const ALL_STATES = Object.values(STATE_REGIONS).flat();

const PROPERTY_TYPES = [
  { id: 'single_family', label: 'Single Family', icon: '🏠' },
  { id: 'townhouse', label: 'Townhouse', icon: '🏘️' },
  { id: 'condo', label: 'Condo', icon: '🏢' },
  { id: 'multi_family', label: 'Multi-Family (2-4)', icon: '🏗️' },
  { id: 'duplex', label: 'Duplex', icon: '🏚️' },
  { id: 'manufactured', label: 'Manufactured', icon: '🏕️' },
];

const FUND_TYPES = [
  { id: 'institutional', label: 'Institutional' },
  { id: 'private_equity', label: 'Private Equity' },
  { id: 'family_office', label: 'Family Office' },
  { id: 'reit', label: 'REIT' },
  { id: 'hedge_fund', label: 'Hedge Fund' },
  { id: 'other', label: 'Other' },
];

interface BuyBoxFormProps {
  buyBox?: HedgeFundBuyBox;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function BuyBoxForm({ buyBox, onSuccess, onCancel }: BuyBoxFormProps) {
  const createBuyBox = useCreateBuyBox();
  const updateBuyBox = useUpdateBuyBox();
  const isEditing = !!buyBox;

  // Form state - initialize with buyBox data if editing
  const [fundName, setFundName] = useState(buyBox?.fundName || '');
  const [fundType, setFundType] = useState(buyBox?.fundType || 'institutional');
  const [contactEmail, setContactEmail] = useState(buyBox?.contactEmail || '');
  const [contactPhone, setContactPhone] = useState(buyBox?.contactPhone || '');

  // Criteria state
  const [selectedStates, setSelectedStates] = useState<string[]>(buyBox?.criteria?.states || []);
  const [selectedPropertyTypes, setSelectedPropertyTypes] = useState<string[]>(buyBox?.criteria?.propertyTypes || []);
  const [minPrice, setMinPrice] = useState(buyBox?.criteria?.minPrice?.toString() || '');
  const [maxPrice, setMaxPrice] = useState(buyBox?.criteria?.maxPrice?.toString() || '');
  const [minBedrooms, setMinBedrooms] = useState(buyBox?.criteria?.minBedrooms?.toString() || '');
  const [maxBedrooms, setMaxBedrooms] = useState(buyBox?.criteria?.maxBedrooms?.toString() || '');
  const [minBathrooms, setMinBathrooms] = useState(buyBox?.criteria?.minBathrooms?.toString() || '');
  const [maxBathrooms, setMaxBathrooms] = useState(buyBox?.criteria?.maxBathrooms?.toString() || '');
  const [minSqft, setMinSqft] = useState(buyBox?.criteria?.minSqft?.toString() || '');
  const [maxSqft, setMaxSqft] = useState(buyBox?.criteria?.maxSqft?.toString() || '');
  const [minYearBuilt, setMinYearBuilt] = useState(buyBox?.criteria?.minYearBuilt?.toString() || '');

  // Exclusions
  const [allowPool, setAllowPool] = useState(buyBox?.criteria?.allowPool ?? true);
  const [allowSeptic, setAllowSeptic] = useState(buyBox?.criteria?.allowSeptic ?? true);
  const [allowFloodZone, setAllowFloodZone] = useState(buyBox?.criteria?.allowFloodZone ?? false);
  const [allowFoundationIssues, setAllowFoundationIssues] = useState(buyBox?.criteria?.allowFoundationIssues ?? false);

  // Auto-submit
  const [autoSubmit, setAutoSubmit] = useState(buyBox?.autoSubmit ?? false);
  const [autoSubmitThreshold, setAutoSubmitThreshold] = useState(buyBox?.autoSubmitThreshold?.toString() || '80');
  const [priority, setPriority] = useState(buyBox?.priority?.toString() || '5');

  // Toggle state for a region
  const toggleRegion = (region: keyof typeof STATE_REGIONS) => {
    const regionStates = STATE_REGIONS[region];
    const allSelected = regionStates.every(s => selectedStates.includes(s));

    if (allSelected) {
      setSelectedStates(prev => prev.filter(s => !regionStates.includes(s)));
    } else {
      setSelectedStates(prev => [...new Set([...prev, ...regionStates])]);
    }
  };

  // Toggle individual state
  const toggleState = (state: string) => {
    setSelectedStates(prev =>
      prev.includes(state)
        ? prev.filter(s => s !== state)
        : [...prev, state]
    );
  };

  // Toggle property type
  const togglePropertyType = (typeId: string) => {
    setSelectedPropertyTypes(prev =>
      prev.includes(typeId)
        ? prev.filter(t => t !== typeId)
        : [...prev, typeId]
    );
  };

  // Format price for display
  const formatPriceInput = (value: string) => {
    const num = value.replace(/[^0-9]/g, '');
    return num;
  };

  // Submit handler
  const handleSubmit = async () => {
    if (!fundName.trim()) {
      toast.error('Fund name is required');
      return;
    }

    if (selectedStates.length === 0) {
      toast.error('Select at least one state');
      return;
    }

    const criteria: BuyBoxCriteria = {
      states: selectedStates,
      propertyTypes: selectedPropertyTypes.length > 0 ? selectedPropertyTypes : undefined,
      minPrice: minPrice ? parseInt(minPrice) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice) : undefined,
      minBedrooms: minBedrooms ? parseInt(minBedrooms) : undefined,
      maxBedrooms: maxBedrooms ? parseInt(maxBedrooms) : undefined,
      minBathrooms: minBathrooms ? parseInt(minBathrooms) : undefined,
      maxBathrooms: maxBathrooms ? parseInt(maxBathrooms) : undefined,
      minSqft: minSqft ? parseInt(minSqft) : undefined,
      maxSqft: maxSqft ? parseInt(maxSqft) : undefined,
      minYearBuilt: minYearBuilt ? parseInt(minYearBuilt) : undefined,
      allowPool,
      allowSeptic,
      allowFloodZone,
      allowFoundationIssues,
    };

    const payload = {
      fund_name: fundName,
      fund_type: fundType,
      criteria,
      contact_email: contactEmail || undefined,
      contact_phone: contactPhone || undefined,
      active: true,
      priority: parseInt(priority),
      auto_submit: autoSubmit,
      auto_submit_threshold: parseInt(autoSubmitThreshold),
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

  return (
    <div className="flex flex-col h-full">
      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Fund Info */}
          <div className="space-y-4 p-4 bg-secondary/50 rounded-lg">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Building2 className="h-4 w-4 text-accent-400" />
              Fund Information
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-muted-foreground text-sm">Fund Name *</Label>
                <Input
                  placeholder="e.g., ABC Investments"
                  value={fundName}
                  onChange={(e) => setFundName(e.target.value)}
                  className="mt-1 bg-card border text-foreground"
                />
              </div>

              <div>
                <Label className="text-muted-foreground text-sm">Fund Type</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {FUND_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setFundType(type.id)}
                      className={`p-2 rounded-lg text-sm text-center transition-colors ${
                        fundType === type.id
                          ? 'bg-accent-600 text-white'
                          : 'bg-secondary text-muted-foreground hover:bg-zinc-700'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-sm">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="contact@fund.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="pl-9 bg-card border text-foreground"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Phone</Label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="pl-9 bg-card border text-foreground"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* States Selection */}
          <div className="p-4 bg-secondary/50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <MapPin className="h-4 w-4 text-green-400" />
                <span>Target States</span>
                {selectedStates.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-green-600 rounded-full text-xs">
                    {selectedStates.length} selected
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedStates([...ALL_STATES])}
                  className="h-7 text-xs border text-foreground"
                >
                  All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedStates([])}
                  className="h-7 text-xs border text-foreground"
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {Object.entries(STATE_REGIONS).map(([region, states]) => {
                const selectedCount = states.filter(s => selectedStates.includes(s)).length;
                const allSelected = selectedCount === states.length;

                return (
                  <div key={region} className="space-y-2">
                    <button
                      onClick={() => toggleRegion(region as keyof typeof STATE_REGIONS)}
                      className="flex items-center justify-between w-full py-1.5 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          allSelected
                            ? 'bg-green-600 border-green-600'
                            : selectedCount > 0
                              ? 'bg-green-600/50 border-green-600'
                              : 'border'
                        }`}>
                          {allSelected && <Check className="h-3 w-3 text-foreground" />}
                          {!allSelected && selectedCount > 0 && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                        </div>
                        <span className="font-medium text-foreground text-sm">{region}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {selectedCount}/{states.length}
                      </span>
                    </button>

                    <div className="grid grid-cols-6 gap-1.5 pl-6">
                      {states.map((state) => (
                        <button
                          key={state}
                          onClick={() => toggleState(state)}
                          className={`p-1.5 rounded text-xs font-medium transition-colors ${
                            selectedStates.includes(state)
                              ? 'bg-green-600 text-foreground'
                              : 'bg-secondary text-muted-foreground hover:bg-zinc-700'
                          }`}
                        >
                          {state}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Property Types */}
          <div className="p-4 bg-secondary/50 rounded-lg">
            <div className="flex items-center gap-2 text-foreground font-medium mb-3">
              <Home className="h-4 w-4 text-purple-400" />
              <span>Property Types</span>
              {selectedPropertyTypes.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-purple-600 rounded-full text-xs">
                  {selectedPropertyTypes.length} selected
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PROPERTY_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => togglePropertyType(type.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${
                    selectedPropertyTypes.includes(type.id)
                      ? 'bg-purple-600 text-foreground'
                      : 'bg-secondary text-muted-foreground hover:bg-zinc-700'
                  }`}
                >
                  <span>{type.icon}</span>
                  <span className="text-xs">{type.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Leave empty to accept all types</p>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Price & Size */}
          <div className="p-4 bg-secondary/50 rounded-lg space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <DollarSign className="h-4 w-4 text-yellow-400" />
              <span>Price & Size</span>
            </div>

            {/* Price */}
            <div>
              <Label className="text-muted-foreground text-sm">Price Range</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="text"
                    placeholder="Min"
                    value={minPrice ? parseInt(minPrice).toLocaleString() : ''}
                    onChange={(e) => setMinPrice(formatPriceInput(e.target.value))}
                    className="pl-7 bg-card border text-foreground"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="text"
                    placeholder="Max"
                    value={maxPrice ? parseInt(maxPrice).toLocaleString() : ''}
                    onChange={(e) => setMaxPrice(formatPriceInput(e.target.value))}
                    className="pl-7 bg-card border text-foreground"
                  />
                </div>
              </div>
            </div>

            {/* Bed/Bath Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-sm">Bedrooms</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={minBedrooms}
                    onChange={(e) => setMinBedrooms(e.target.value)}
                    className="bg-card border text-foreground"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={maxBedrooms}
                    onChange={(e) => setMaxBedrooms(e.target.value)}
                    className="bg-card border text-foreground"
                  />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Bathrooms</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={minBathrooms}
                    onChange={(e) => setMinBathrooms(e.target.value)}
                    className="bg-card border text-foreground"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={maxBathrooms}
                    onChange={(e) => setMaxBathrooms(e.target.value)}
                    className="bg-card border text-foreground"
                  />
                </div>
              </div>
            </div>

            {/* Sqft / Year Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-sm">Square Feet</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={minSqft}
                    onChange={(e) => setMinSqft(e.target.value)}
                    className="bg-card border text-foreground"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={maxSqft}
                    onChange={(e) => setMaxSqft(e.target.value)}
                    className="bg-card border text-foreground"
                  />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Min Year Built</Label>
                <Input
                  type="number"
                  placeholder="e.g., 1980"
                  value={minYearBuilt}
                  onChange={(e) => setMinYearBuilt(e.target.value)}
                  className="mt-2 bg-card border text-foreground"
                />
              </div>
            </div>
          </div>

          {/* Property Features */}
          <div className="p-4 bg-secondary/50 rounded-lg">
            <div className="flex items-center gap-2 text-foreground font-medium mb-3">
              <X className="h-4 w-4 text-red-400" />
              <span>Property Features</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'pool', label: 'Allow Pool', value: allowPool, setter: setAllowPool },
                { id: 'septic', label: 'Allow Septic', value: allowSeptic, setter: setAllowSeptic },
                { id: 'flood', label: 'Allow Flood Zone', value: allowFloodZone, setter: setAllowFloodZone },
                { id: 'foundation', label: 'Allow Foundation Issues', value: allowFoundationIssues, setter: setAllowFoundationIssues },
              ].map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                >
                  <span className="text-sm text-foreground">{item.label}</span>
                  <Switch
                    checked={item.value}
                    onCheckedChange={item.setter}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Auto-Submit */}
          <div className="p-4 bg-secondary/50 rounded-lg space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Zap className="h-4 w-4 text-amber-400" />
              <span>Auto-Submit Settings</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <p className="text-sm text-foreground">Enable Auto-Submit</p>
                <p className="text-xs text-muted-foreground">Automatically submit matching deals</p>
              </div>
              <Switch
                checked={autoSubmit}
                onCheckedChange={setAutoSubmit}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-sm">Score Threshold (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={autoSubmitThreshold}
                  onChange={(e) => setAutoSubmitThreshold(e.target.value)}
                  className="mt-2 bg-card border text-foreground"
                  disabled={!autoSubmit}
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Priority (1-10)</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="mt-2 bg-card border text-foreground"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary & Actions */}
      <div className="border-t border pt-4 mt-4 space-y-3">
        {/* Quick Summary */}
        <div className="flex flex-wrap gap-2 text-xs">
          {selectedStates.length > 0 && (
            <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded">
              {selectedStates.length} states
            </span>
          )}
          {selectedPropertyTypes.length > 0 && (
            <span className="px-2 py-1 bg-purple-900/50 text-purple-400 rounded">
              {selectedPropertyTypes.length} types
            </span>
          )}
          {(minPrice || maxPrice) && (
            <span className="px-2 py-1 bg-yellow-900/50 text-yellow-400 rounded">
              ${minPrice ? parseInt(minPrice).toLocaleString() : '0'} - ${maxPrice ? parseInt(maxPrice).toLocaleString() : '∞'}
            </span>
          )}
          {autoSubmit && (
            <span className="px-2 py-1 bg-amber-900/50 text-amber-400 rounded">
              Auto @ {autoSubmitThreshold}%
            </span>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 border text-foreground"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
            onClick={handleSubmit}
            disabled={createBuyBox.isPending || updateBuyBox.isPending}
          >
            {createBuyBox.isPending || updateBuyBox.isPending ? (
              isEditing ? 'Updating...' : 'Creating...'
            ) : (
              <>
                {isEditing ? 'Update Buy Box' : 'Create Buy Box'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default BuyBoxForm;
