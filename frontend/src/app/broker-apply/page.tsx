'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApplyAsBroker, useBrokerProfile } from '@/hooks/use-broker';
import { toast } from 'sonner';
import { Shield, CheckCircle2, Clock, XCircle, Building2, FileText, Phone, Mail, Loader2, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const US_STATES = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

export default function BrokerApplyPage() {
  const router = useRouter();
  const { data: existingProfile, isLoading: profileLoading } = useBrokerProfile();
  const applyAsBroker = useApplyAsBroker();
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    licenseNumber: '',
    licenseState: '',
    licenseExpirationDate: '',
    brokerageCompany: '',
    brokerageAddress: '',
    brokeragePhone: '',
    brokerageEmail: '',
    eoInsurancePolicy: '',
    eoExpirationDate: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.licenseNumber || !formData.licenseState || !formData.licenseExpirationDate || !formData.brokerageCompany) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await applyAsBroker.mutateAsync(formData);
      setSubmitted(true);
      toast.success('Broker application submitted successfully!');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to submit application');
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Show success page after submission
  if (submitted) {
    return (
      <div
        className="min-h-screen relative bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center p-4"
        style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
      >
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />

        <Card className="relative z-10 w-full max-w-md bg-card/80 border backdrop-blur">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Image
                src="/dispotree-long-inverted.png"
                alt="CodeLive"
                width={200}
                height={48}
                className="h-12 w-auto"
              />
            </div>
            <div className="mx-auto w-16 h-16 rounded-full bg-accent-500/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-accent-500" />
            </div>
            <CardTitle className="text-2xl text-foreground">Application Submitted!</CardTitle>
            <p className="text-muted-foreground text-sm mt-2">
              Your broker application has been submitted successfully. Our team will review it and get back to you soon.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 bg-secondary/50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">License Number</span>
                  <p className="text-foreground">{formData.licenseNumber}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">License State</span>
                  <p className="text-foreground">{formData.licenseState}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Brokerage</span>
                  <p className="text-foreground">{formData.brokerageCompany}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p className="text-yellow-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Pending Review
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-secondary/30 rounded-lg border border">
              <h4 className="text-foreground font-medium mb-2">What happens next?</h4>
              <ul className="text-muted-foreground text-sm space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-accent-500 mt-1">1.</span>
                  Our team reviews your application and credentials
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent-500 mt-1">2.</span>
                  You&apos;ll receive an email notification once approved
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent-500 mt-1">3.</span>
                  Start reviewing and approving deals on the platform
                </li>
              </ul>
            </div>

            <Link href="/login" className="block mt-6">
              <Button variant="outline" className="w-full border text-foreground hover:bg-secondary/50">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show status if already applied
  if (existingProfile) {
    const statusConfig = {
      pending: {
        icon: Clock,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
        title: 'Application Pending',
        description: 'Your broker application is under review. You will be notified once it is approved.',
      },
      approved: {
        icon: CheckCircle2,
        color: 'text-accent-500',
        bgColor: 'bg-accent-500/10',
        title: 'Application Approved',
        description: 'Congratulations! You are now an approved broker and can review deals.',
      },
      rejected: {
        icon: XCircle,
        color: 'text-red-500',
        bgColor: 'bg-red-500/10',
        title: 'Application Rejected',
        description: existingProfile.rejectionReason || 'Your application was not approved.',
      },
      suspended: {
        icon: XCircle,
        color: 'text-orange-500',
        bgColor: 'bg-orange-500/10',
        title: 'Account Suspended',
        description: 'Your broker account has been suspended. Please contact support.',
      },
    };

    const status = statusConfig[existingProfile.status] || statusConfig.pending;
    const StatusIcon = status.icon;

    return (
      <div
        className="min-h-screen relative bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center p-4"
        style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
      >
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />

        <Card className="relative z-10 w-full max-w-md bg-card/80 border backdrop-blur">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Image
                src="/dispotree-long-inverted.png"
                alt="CodeLive"
                width={200}
                height={48}
                className="h-12 w-auto"
              />
            </div>
            <div className={`mx-auto w-16 h-16 rounded-full ${status.bgColor} flex items-center justify-center mb-4`}>
              <StatusIcon className={`h-8 w-8 ${status.color}`} />
            </div>
            <CardTitle className="text-2xl text-foreground">{status.title}</CardTitle>
            <p className="text-muted-foreground text-sm mt-2">{status.description}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 bg-secondary/50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">License Number</span>
                  <p className="text-foreground">{existingProfile.licenseNumber}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">License State</span>
                  <p className="text-foreground">{existingProfile.licenseState}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Brokerage</span>
                  <p className="text-foreground">{existingProfile.brokerageCompany}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Submitted</span>
                  <p className="text-foreground">{new Date(existingProfile.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            {existingProfile.status === 'approved' && (
              <Button
                className="w-full mt-6 bg-accent-600 hover:bg-accent-700"
                onClick={() => router.push('/broker/approvals')}
              >
                Go to Deal Approvals
              </Button>
            )}

            <Link href="/login" className="block mt-4">
              <Button variant="outline" className="w-full border text-foreground hover:bg-secondary/50">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center p-4"
      style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
    >
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />

      <Card className="relative z-10 w-full max-w-lg bg-card/80 border backdrop-blur">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image
              src="/dispotree-long-inverted.png"
              alt="CodeLive"
              width={200}
              height={48}
              className="h-12 w-auto"
            />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="h-6 w-6 text-accent-500" />
            <CardTitle className="text-2xl text-foreground">Broker Application</CardTitle>
          </div>
          <p className="text-muted-foreground text-sm">
            Apply to become a licensed broker on CodeLive
          </p>
        </CardHeader>
        <CardContent>
          {profileLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* License Information */}
              <div className="space-y-3">
                <h3 className="text-foreground font-medium flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  License Information
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="licenseNumber" className="text-muted-foreground text-sm">
                      License Number <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="licenseNumber"
                      value={formData.licenseNumber}
                      onChange={(e) => handleChange('licenseNumber', e.target.value)}
                      placeholder="e.g., 12345678"
                      className="bg-secondary/50 border text-foreground"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="licenseState" className="text-muted-foreground text-sm">
                      License State <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.licenseState}
                      onValueChange={(value) => handleChange('licenseState', value)}
                    >
                      <SelectTrigger className="bg-secondary/50 border text-foreground">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent className="bg-secondary border max-h-60">
                        {US_STATES.map((state) => (
                          <SelectItem
                            key={state.value}
                            value={state.value}
                            className="text-foreground hover:bg-zinc-700"
                          >
                            {state.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="licenseExpirationDate" className="text-muted-foreground text-sm">
                    License Expiration Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="licenseExpirationDate"
                    type="date"
                    value={formData.licenseExpirationDate}
                    onChange={(e) => handleChange('licenseExpirationDate', e.target.value)}
                    className="bg-secondary/50 border text-foreground"
                    required
                  />
                </div>
              </div>

              {/* Brokerage Information */}
              <div className="space-y-3">
                <h3 className="text-foreground font-medium flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Brokerage Information
                </h3>
                <div className="space-y-1.5">
                  <Label htmlFor="brokerageCompany" className="text-muted-foreground text-sm">
                    Brokerage Company Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="brokerageCompany"
                    value={formData.brokerageCompany}
                    onChange={(e) => handleChange('brokerageCompany', e.target.value)}
                    placeholder="e.g., ABC Realty"
                    className="bg-secondary/50 border text-foreground"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brokerageAddress" className="text-muted-foreground text-sm">
                    Brokerage Address
                  </Label>
                  <Input
                    id="brokerageAddress"
                    value={formData.brokerageAddress}
                    onChange={(e) => handleChange('brokerageAddress', e.target.value)}
                    placeholder="123 Main St, City, State ZIP"
                    className="bg-secondary/50 border text-foreground"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="brokeragePhone" className="text-muted-foreground text-sm">
                      <Phone className="h-3 w-3 inline mr-1" />
                      Phone
                    </Label>
                    <Input
                      id="brokeragePhone"
                      type="tel"
                      value={formData.brokeragePhone}
                      onChange={(e) => handleChange('brokeragePhone', e.target.value)}
                      placeholder="(555) 123-4567"
                      className="bg-secondary/50 border text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="brokerageEmail" className="text-muted-foreground text-sm">
                      <Mail className="h-3 w-3 inline mr-1" />
                      Email
                    </Label>
                    <Input
                      id="brokerageEmail"
                      type="email"
                      value={formData.brokerageEmail}
                      onChange={(e) => handleChange('brokerageEmail', e.target.value)}
                      placeholder="broker@company.com"
                      className="bg-secondary/50 border text-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* E&O Insurance (Optional) */}
              <div className="space-y-3">
                <h3 className="text-foreground font-medium flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  E&O Insurance <span className="text-muted-foreground font-normal">(Optional)</span>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="eoInsurancePolicy" className="text-muted-foreground text-sm">
                      Policy Number
                    </Label>
                    <Input
                      id="eoInsurancePolicy"
                      value={formData.eoInsurancePolicy}
                      onChange={(e) => handleChange('eoInsurancePolicy', e.target.value)}
                      placeholder="Policy #"
                      className="bg-secondary/50 border text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="eoExpirationDate" className="text-muted-foreground text-sm">
                      Expiration Date
                    </Label>
                    <Input
                      id="eoExpirationDate"
                      type="date"
                      value={formData.eoExpirationDate}
                      onChange={(e) => handleChange('eoExpirationDate', e.target.value)}
                      className="bg-secondary/50 border text-foreground"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-accent-600 hover:bg-accent-700"
                disabled={applyAsBroker.isPending}
              >
                {applyAsBroker.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Application'
                )}
              </Button>

              <Link href="/login" className="block">
                <Button variant="outline" className="w-full border text-foreground hover:bg-secondary/50">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
