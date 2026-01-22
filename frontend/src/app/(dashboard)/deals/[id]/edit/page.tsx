'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProperty, useUpdateProperty } from '@/hooks/use-properties';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Home,
  DollarSign,
  Building2,
  Sparkles,
  Check,
  Loader2,
  MapPin,
  Users,
  FileText,
  Plus,
  X,
} from 'lucide-react';
import Link from 'next/link';

const PROPERTY_TYPES = [
  'Single Family',
  'Townhouse',
  'Condo',
  'Multi-Family (2-4)',
  'Duplex',
  'Triplex',
  'Fourplex',
  'Manufactured',
  'Land',
  'Other',
];

const OWNERSHIP_TYPES = [
  'Fee Simple',
  'Leasehold',
  'Condominium',
  'Timeshare',
  'Life Estate',
  'Other',
];

const OCCUPANCY_STATUSES = [
  'Vacant',
  'Owner Occupied',
  'Tenant Occupied',
  'Unknown',
];

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

export default function EditDealPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = params.id as string;

  const { data: property, isLoading, error } = useProperty(propertyId);
  const updateProperty = useUpdateProperty();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoInput, setPhotoInput] = useState('');

  // Form state
  const [houseNumber, setHouseNumber] = useState('');
  const [street, setStreet] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [county, setCounty] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [propertyOwnership, setPropertyOwnership] = useState('');
  const [bedroomCount, setBedroomCount] = useState('');
  const [bathroomCount, setBathroomCount] = useState('');
  const [livingSpaceSqFt, setLivingSpaceSqFt] = useState('');
  const [lotSizeSqFt, setLotSizeSqFt] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [stories, setStories] = useState('');
  const [pool, setPool] = useState(false);
  const [solar, setSolar] = useState(false);
  const [septic, setSeptic] = useState(false);
  const [well, setWell] = useState(false);
  const [hoa, setHoa] = useState(false);
  const [occupancyStatus, setOccupancyStatus] = useState('');
  const [occupancyDetails, setOccupancyDetails] = useState('');
  const [deliveredVacant, setDeliveredVacant] = useState(false);
  const [reservePrice, setReservePrice] = useState('');
  const [buyItNowPrice, setBuyItNowPrice] = useState('');
  const [arv, setArv] = useState('');
  const [renovationBudget, setRenovationBudget] = useState('');
  const [rehabCost, setRehabCost] = useState('');
  const [wholesalerLlcName, setWholesalerLlcName] = useState('');
  const [llcOwnerName, setLlcOwnerName] = useState('');
  const [llcOwnerEmail, setLlcOwnerEmail] = useState('');
  const [assignable, setAssignable] = useState(false);
  const [marketingClauseFound, setMarketingClauseFound] = useState(false);
  const [brokerOnFile, setBrokerOnFile] = useState(false);
  const [financeable, setFinanceable] = useState(false);
  const [description, setDescription] = useState('');
  const [photoLinks, setPhotoLinks] = useState<string[]>([]);

  // Populate form when property data loads
  useEffect(() => {
    if (property) {
      // Address
      if (typeof property.address === 'object' && property.address) {
        setHouseNumber(property.address.houseNumber || '');
        setStreet(property.address.street || '');
        setAddress2(property.address.address2 || '');
      } else if (typeof property.address === 'string') {
        setStreet(property.address);
      }
      setCity(property.city || '');
      setState(property.state || '');
      setZip(property.zip || '');
      setCounty(property.county || '');

      // Property details
      setPropertyType(property.propertyType || '');
      setPropertyOwnership(property.propertyOwnership || '');
      setBedroomCount(property.bedroomCount?.toString() || '');
      setBathroomCount(property.bathroomCount?.toString() || '');
      setLivingSpaceSqFt(property.livingSpaceSqFt?.toString() || '');
      setLotSizeSqFt(property.lotSizeSqFt?.toString() || '');
      setYearBuilt(property.yearBuilt?.toString() || '');
      setStories(property.stories?.toString() || '');

      // Features
      setPool(property.pool || false);
      setSolar(property.solar || false);
      setSeptic(property.septic || false);
      setWell(property.well || false);
      setHoa(property.hoa || false);

      // Occupancy
      setOccupancyStatus(property.occupancyStatus || '');
      setOccupancyDetails(property.occupancyDetails || '');
      setDeliveredVacant(property.deliveredVacant || false);

      // Financial
      setReservePrice(property.reservePrice?.toString() || '');
      setBuyItNowPrice(property.buyItNowPrice?.toString() || '');
      setArv(property.arv?.toString() || '');
      setRenovationBudget(property.renovationBudget?.toString() || '');
      setRehabCost(property.rehabCost?.toString() || '');

      // Wholesaler
      setWholesalerLlcName(property.wholesalerLlcName || '');
      setLlcOwnerName(property.llcOwnerName || '');
      setLlcOwnerEmail(property.llcOwnerEmail || '');

      // Contract
      setAssignable(property.assignable || false);
      setMarketingClauseFound(property.marketingClauseFound || false);
      setBrokerOnFile(property.brokerOnFile || false);
      setFinanceable(property.financeable || false);

      // Description & Photos
      setDescription(property.propertyListingDescription || property.description || '');
      setPhotoLinks(property.photoLinks || property.photos || []);
    }
  }, [property]);

  const onSubmit = async () => {
    setIsSubmitting(true);

    try {
      const updateData: Record<string, unknown> = {
        address: {
          houseNumber,
          street,
          address2: address2 || undefined,
        },
        city,
        state,
        zip,
        county: county || undefined,
        propertyType,
        propertyOwnership,
        bedroomCount: bedroomCount ? parseInt(bedroomCount) : undefined,
        bathroomCount: bathroomCount ? parseFloat(bathroomCount) : undefined,
        livingSpaceSqFt: livingSpaceSqFt ? parseInt(livingSpaceSqFt) : undefined,
        lotSizeSqFt: lotSizeSqFt ? parseInt(lotSizeSqFt) : undefined,
        yearBuilt: yearBuilt ? parseInt(yearBuilt) : undefined,
        stories: stories ? parseInt(stories) : undefined,
        pool,
        solar,
        septic,
        well,
        hoa,
        occupancyStatus,
        occupancyDetails: occupancyDetails || undefined,
        deliveredVacant,
        reservePrice: reservePrice ? parseFloat(reservePrice) : undefined,
        buyItNowPrice: buyItNowPrice ? parseFloat(buyItNowPrice) : undefined,
        arv: arv ? parseFloat(arv) : undefined,
        renovationBudget: renovationBudget ? parseFloat(renovationBudget) : undefined,
        rehabCost: rehabCost ? parseFloat(rehabCost) : undefined,
        wholesalerLlcName: wholesalerLlcName || undefined,
        llcOwnerName: llcOwnerName || undefined,
        llcOwnerEmail: llcOwnerEmail || undefined,
        assignable,
        marketingClauseFound,
        brokerOnFile,
        financeable,
        propertyListingDescription: description || undefined,
        photoLinks: photoLinks.length > 0 ? photoLinks : undefined,
      };

      await updateProperty.mutateAsync({ id: propertyId, data: updateData });

      toast.success('Deal updated successfully!');
      router.push(`/deals/${propertyId}`);
    } catch (error) {
      console.error('Error updating property:', error);
      toast.error('Failed to update deal', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addPhoto = () => {
    if (!photoInput.trim()) return;
    setPhotoLinks([...photoLinks, photoInput.trim()]);
    setPhotoInput('');
  };

  const removePhoto = (index: number) => {
    setPhotoLinks(photoLinks.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <X className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Property not found</p>
            <p className="text-muted-foreground">The property you&apos;re looking for doesn&apos;t exist.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/deals/${propertyId}`}>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground -ml-2 mb-2">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Deal
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Edit Deal</h1>
          <p className="text-muted-foreground mt-1">Update property information</p>
        </div>
      </div>

      {/* Address Section */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <MapPin className="h-5 w-5 text-accent-400" />
            Property Address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-3">
              <Label className="text-muted-foreground text-sm">Number</Label>
              <Input
                placeholder="123"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
            <div className="col-span-9">
              <Label className="text-muted-foreground text-sm">Street Name</Label>
              <Input
                placeholder="Main Street"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-sm">Apt, Suite, Unit</Label>
            <Input
              placeholder="Apt 4B"
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
              className="mt-1 bg-secondary border text-foreground"
            />
          </div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-5">
              <Label className="text-muted-foreground text-sm">City</Label>
              <Input
                placeholder="Austin"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
            <div className="col-span-3">
              <Label className="text-muted-foreground text-sm">State</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                  <SelectValue placeholder="ST" />
                </SelectTrigger>
                <SelectContent className="bg-secondary border">
                  {STATES.map((s) => (
                    <SelectItem key={s} value={s} className="text-foreground">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-4">
              <Label className="text-muted-foreground text-sm">ZIP Code</Label>
              <Input
                placeholder="78701"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-sm">County</Label>
            <Input
              placeholder="Travis County"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              className="mt-1 bg-secondary border text-foreground"
            />
          </div>
        </CardContent>
      </Card>

      {/* Details Accordion */}
      <Card className="bg-card border">
        <CardContent className="p-0">
          <Accordion type="multiple" defaultValue={['basic', 'financial']} className="w-full">
            {/* Basic Property Details */}
            <AccordionItem value="basic" className="border-b border px-6">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-2 text-foreground">
                  <Home className="h-4 w-4 text-purple-400" />
                  Property Details
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-sm">Property Type</Label>
                    <Select value={propertyType} onValueChange={setPropertyType}>
                      <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="bg-secondary border">
                        {PROPERTY_TYPES.map((type) => (
                          <SelectItem key={type} value={type} className="text-foreground">
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Ownership Type</Label>
                    <Select value={propertyOwnership} onValueChange={setPropertyOwnership}>
                      <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                        <SelectValue placeholder="Select ownership" />
                      </SelectTrigger>
                      <SelectContent className="bg-secondary border">
                        {OWNERSHIP_TYPES.map((type) => (
                          <SelectItem key={type} value={type} className="text-foreground">
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Bedrooms</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="3"
                      value={bedroomCount}
                      onChange={(e) => setBedroomCount(e.target.value)}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Bathrooms</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="2"
                      value={bathroomCount}
                      onChange={(e) => setBathroomCount(e.target.value)}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Living Area (sq ft)</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="1500"
                      value={livingSpaceSqFt}
                      onChange={(e) => setLivingSpaceSqFt(e.target.value)}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Lot Size (sq ft)</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="5000"
                      value={lotSizeSqFt}
                      onChange={(e) => setLotSizeSqFt(e.target.value)}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Year Built</Label>
                    <Input
                      type="number"
                      min="1800"
                      max={new Date().getFullYear() + 1}
                      placeholder="1980"
                      value={yearBuilt}
                      onChange={(e) => setYearBuilt(e.target.value)}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Stories</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="1"
                      value={stories}
                      onChange={(e) => setStories(e.target.value)}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-3 pt-2">
                  <p className="text-sm font-medium text-foreground">Property Features</p>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                      <Label className="text-sm text-foreground">Pool</Label>
                      <Switch checked={pool} onCheckedChange={setPool} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                      <Label className="text-sm text-foreground">Solar Panels</Label>
                      <Switch checked={solar} onCheckedChange={setSolar} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                      <Label className="text-sm text-foreground">Septic</Label>
                      <Switch checked={septic} onCheckedChange={setSeptic} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                      <Label className="text-sm text-foreground">Well Water</Label>
                      <Switch checked={well} onCheckedChange={setWell} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                      <Label className="text-sm text-foreground">HOA</Label>
                      <Switch checked={hoa} onCheckedChange={setHoa} />
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Occupancy */}
            <AccordionItem value="occupancy" className="border-b border px-6">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-2 text-foreground">
                  <Users className="h-4 w-4 text-purple-400" />
                  Occupancy & Access
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div>
                  <Label className="text-muted-foreground text-sm">Occupancy Status</Label>
                  <Select value={occupancyStatus} onValueChange={setOccupancyStatus}>
                    <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border">
                      {OCCUPANCY_STATUSES.map((status) => (
                        <SelectItem key={status} value={status} className="text-foreground">
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                  <div>
                    <Label className="text-sm text-foreground">Will Be Delivered Vacant</Label>
                    <p className="text-xs text-muted-foreground">Property will be vacant at closing</p>
                  </div>
                  <Switch checked={deliveredVacant} onCheckedChange={setDeliveredVacant} />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Occupancy Details</Label>
                  <Textarea
                    placeholder="Any additional occupancy information..."
                    className="mt-1 bg-secondary border text-foreground min-h-20"
                    value={occupancyDetails}
                    onChange={(e) => setOccupancyDetails(e.target.value)}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Financial Details */}
            <AccordionItem value="financial" className="border-b border px-6">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-2 text-foreground">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  Financial Information
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-sm">Reserve Price</Label>
                    <div className="relative mt-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        min="0"
                        placeholder="150000"
                        value={reservePrice}
                        onChange={(e) => setReservePrice(e.target.value)}
                        className="pl-8 bg-secondary border text-foreground"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Buy It Now Price</Label>
                    <div className="relative mt-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        min="0"
                        placeholder="175000"
                        value={buyItNowPrice}
                        onChange={(e) => setBuyItNowPrice(e.target.value)}
                        className="pl-8 bg-secondary border text-foreground"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">After Repair Value (ARV)</Label>
                    <div className="relative mt-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        min="0"
                        placeholder="250000"
                        value={arv}
                        onChange={(e) => setArv(e.target.value)}
                        className="pl-8 bg-secondary border text-foreground"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Renovation Budget</Label>
                    <div className="relative mt-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        min="0"
                        placeholder="30000"
                        value={renovationBudget}
                        onChange={(e) => setRenovationBudget(e.target.value)}
                        className="pl-8 bg-secondary border text-foreground"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Rehab Cost</Label>
                    <div className="relative mt-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        min="0"
                        placeholder="25000"
                        value={rehabCost}
                        onChange={(e) => setRehabCost(e.target.value)}
                        className="pl-8 bg-secondary border text-foreground"
                      />
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Wholesaler Info */}
            <AccordionItem value="contact" className="border-b border px-6">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-2 text-foreground">
                  <Building2 className="h-4 w-4 text-amber-400" />
                  Wholesaler Information
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-sm">LLC Name</Label>
                    <Input
                      placeholder="ABC Properties LLC"
                      value={wholesalerLlcName}
                      onChange={(e) => setWholesalerLlcName(e.target.value)}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Owner Name</Label>
                    <Input
                      placeholder="John Doe"
                      value={llcOwnerName}
                      onChange={(e) => setLlcOwnerName(e.target.value)}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground text-sm">Owner Email</Label>
                    <Input
                      type="email"
                      placeholder="owner@example.com"
                      value={llcOwnerEmail}
                      onChange={(e) => setLlcOwnerEmail(e.target.value)}
                      className="mt-1 bg-secondary border text-foreground"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Contract & Compliance */}
            <AccordionItem value="contract" className="border-b border px-6">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-2 text-foreground">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  Contract & Compliance
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                    <Label className="text-sm text-foreground">Assignable Contract</Label>
                    <Switch checked={assignable} onCheckedChange={setAssignable} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                    <Label className="text-sm text-foreground">Marketing Clause</Label>
                    <Switch checked={marketingClauseFound} onCheckedChange={setMarketingClauseFound} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                    <Label className="text-sm text-foreground">Broker on File</Label>
                    <Switch checked={brokerOnFile} onCheckedChange={setBrokerOnFile} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                    <Label className="text-sm text-foreground">Financeable</Label>
                    <Switch checked={financeable} onCheckedChange={setFinanceable} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Description & Photos */}
            <AccordionItem value="media" className="px-6">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-2 text-foreground">
                  <FileText className="h-4 w-4 text-pink-400" />
                  Description & Photos
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div>
                  <Label className="text-muted-foreground text-sm">Property Description</Label>
                  <Textarea
                    placeholder="Describe the property, highlights, repairs needed..."
                    className="mt-1 bg-secondary border text-foreground min-h-24"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground text-sm">Photo URLs</Label>
                    {photoLinks.length > 0 && (
                      <span className="text-xs text-muted-foreground">{photoLinks.length} photo{photoLinks.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="https://example.com/photo.jpg"
                      value={photoInput}
                      onChange={(e) => setPhotoInput(e.target.value)}
                      className="bg-secondary border text-foreground"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addPhoto();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={addPhoto}
                      className="border"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {photoLinks.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {photoLinks.map((photo, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1 px-2 py-1 bg-secondary rounded text-sm text-foreground"
                        >
                          <span className="truncate max-w-[200px]">{photo}</span>
                          <button
                            type="button"
                            onClick={() => removePhoto(index)}
                            className="text-muted-foreground hover:text-red-400"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Submit Actions */}
      <div className="flex gap-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1 border text-foreground"
          onClick={() => router.push(`/deals/${propertyId}`)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Save Changes
              <Check className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
