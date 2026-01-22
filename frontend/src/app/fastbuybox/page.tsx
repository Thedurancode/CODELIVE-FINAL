'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  Sparkles,
  Check,
  ArrowRight,
  Home,
  TrendingUp,
  Shield,
  Zap,
  X,
  Plus,
  User,
  Users,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Target,
  Ban,
  Bell,
  Settings,
  Hammer,
  Calendar,
  Percent,
  Ruler,
  Clock,
  Upload,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

const PROPERTY_TYPES = [
  // Residential
  { value: 'single_family', label: 'Single-Family', icon: '🏠' },
  { value: 'condo_townhome', label: 'Condo/Townhome', icon: '🏘️' },
  { value: 'duplex_triplex_fourplex', label: 'Duplex/Triplex/Fourplex', icon: '🏗️' },
  { value: 'small_multifamily', label: 'Small Multifamily (5-20)', icon: '🏢' },
  { value: 'large_multifamily', label: 'Large Multifamily (20+)', icon: '🏙️' },
  { value: 'portfolio', label: 'Portfolios', icon: '📊' },
  // Commercial
  { value: 'commercial', label: 'Commercial', icon: '🏪' },
  { value: 'mobile_home_park', label: 'Mobile Home Parks', icon: '🏕️' },
  { value: 'storage_units', label: 'Storage Units', icon: '📦' },
  { value: 'other', label: 'Other', icon: '🔧' },
];

const STRATEGIES = [
  { value: 'fix_and_flip', label: 'Fix & Flip', icon: '🔨' },
  { value: 'long_term_rental', label: 'Buy & Hold', icon: '🏠' },
  { value: 'short_term_rental', label: 'Short-Term Rental', icon: '🌴' },
  { value: 'wholesale', label: 'Wholesale', icon: '📦' },
];

const CONDITION_LEVELS = [
  { value: 'any', label: 'Any Condition' },
  { value: 'light', label: 'Light Rehab ($0-25k)' },
  { value: 'medium', label: 'Medium Rehab ($25k-75k)' },
  { value: 'heavy', label: 'Heavy Rehab ($75k+)' },
];

const LEASE_TYPES = [
  { value: 'fixed_term', label: 'Fixed-term' },
  { value: 'month_to_month', label: 'Month-to-month' },
  { value: 'section_8_ok', label: 'Section 8 OK' },
];

const DEAL_SOURCE_OPTIONS = [
  { value: 'mls_only', label: 'MLS Only' },
  { value: 'off_market_only', label: 'Off-Market Only' },
  { value: 'both', label: 'Both (Show All)' },
];

const ZESTIMATE_OPTIONS = [
  { value: 0, label: 'Any Price' },
  { value: 5, label: '5% Below Zestimate' },
  { value: 10, label: '10% Below Zestimate' },
  { value: 15, label: '15% Below Zestimate' },
  { value: 20, label: '20% Below Zestimate' },
  { value: 25, label: '25% Below Zestimate' },
  { value: 30, label: '30% Below Zestimate' },
];

interface Contact {
  name: string;
  email: string;
  phone: string;
  markets: string[];
}

interface ZipcodeEntry {
  zipcode: string;
  city?: string;
  state?: string;
  contact?: {
    name: string;
    email: string;
    phone?: string;
  };
}

interface CustomCriteria {
  id: string;
  name: string;
  enabled: boolean;
}

export default function FastBuyBoxPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [createdBuyBox, setCreatedBuyBox] = useState<any>(null);

  // Loading animation with fade out
  useEffect(() => {
    const fadeTimer = setTimeout(() => setIsFading(true), 1200);
    const hideTimer = setTimeout(() => setIsLoading(false), 1700);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    fundName: '',
    contactEmail: '',
    contactPhone: '',
    states: [] as string[],
    zipcodes: [] as ZipcodeEntry[],
    contacts: [] as Contact[],
    propertyTypes: [] as string[],
    minPrice: 50000,
    maxPrice: 500000,
    minBedrooms: 2,
    maxBedrooms: 6,
    investmentStrategies: [] as string[],
    // Risk tolerance - all OFF by default
    allowHoa: false,
    allowPool: false,
    allowFloodZone: false,
    allowFoundationIssues: false,
    allowStructuralIssues: false,
    allowFireDamage: false,
    allowCodeViolations: false,
    allowOpenPermits: false,
    allowLiensIfCurable: false,
    allowPowerLines: false,
    allowDoubleYellowRoad: false,
    allowSolarPanels: false,
    allowSeptic: false,
    allowWell: false,
    allowMainRoad: false,
    allowLeasingRestrictions: false,
    allowAgeRestrictions: false,
    maxHoaMonthly: 500,
    crimeTolerance: 'medium' as 'low' | 'medium' | 'high',
    customCriteria: [] as CustomCriteria[],

    // === ADVANCED OPTIONS ===
    isAdvancedMode: false,

    // Extended property specs (Advanced Mode)
    minBathrooms: 1,
    maxBathrooms: 10,
    minYearBuilt: 1900,
    minSqft: 0,
    maxSqft: 0,
    minLotSizeSqft: 0,
    maxLotSizeSqft: 0,

    // Rehab preferences (Advanced Mode)
    conditionLevels: [] as string[],
    minRehabBudget: 0,
    maxRehabBudget: 0,

    // Deal source preference
    dealSourcePreference: 'both' as 'mls_only' | 'off_market_only' | 'both',

    // === STRATEGY-SPECIFIC: Fix & Flip ===
    flipMinBelowArvPercent: 0,
    flipMinExpectedProfit: 0,
    flipMaxClosingDays: 0,

    // === STRATEGY-SPECIFIC: Long-Term Rental ===
    rentalMinHoldYears: 0,
    rentalMinMonthlyRent: 0,
    rentalMaxMonthlyRent: 0,
    rentalMinRentToPrice: 0,
    rentalMinCapRate: 0,
    rentalMinCashOnCash: 0,
    rentalAllowBelowMarket: false,
    rentalLeaseTypes: [] as string[],

    // === ZESTIMATE ===
    maxPercentBelowZestimate: 0,

    // === NOTIFICATION SETTINGS ===
    matchStrictness: 'flexible' as 'strict' | 'flexible',
    deliveryFrequency: 'realtime' as 'realtime' | 'daily' | 'weekly',
  });

  // Custom criteria input
  const [customCriteriaInput, setCustomCriteriaInput] = useState('');

  // Format phone number as (XXX) XXX-XXXX
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const addCustomCriteria = () => {
    const name = customCriteriaInput.trim().toUpperCase();
    if (name && !formData.customCriteria.some(c => c.name === name)) {
      // Auto-detect positive/negative keywords
      const lowerName = name.toLowerCase();
      const positiveWords = ['yes', 'allow', 'must', 'require', 'need', 'want', 'include', 'accept', 'prefer', 'with'];
      const negativeWords = ['no', 'never', 'don\'t', 'dont', 'not', 'exclude', 'reject', 'avoid', 'prohibit', 'ban', 'without'];

      const hasNegative = negativeWords.some(word => lowerName.includes(word));
      const hasPositive = positiveWords.some(word => lowerName.includes(word));

      // Default to enabled, unless negative words found (and no positive words override)
      const autoEnabled = hasNegative && !hasPositive ? false : true;

      setFormData((prev) => ({
        ...prev,
        customCriteria: [
          ...prev.customCriteria,
          { id: `custom-${Date.now()}`, name, enabled: autoEnabled }
        ],
      }));
      setCustomCriteriaInput('');
    }
  };

  const toggleCustomCriteria = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      customCriteria: prev.customCriteria.map((c) =>
        c.id === id ? { ...c, enabled: !c.enabled } : c
      ),
    }));
  };

  const removeCustomCriteria = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      customCriteria: prev.customCriteria.filter((c) => c.id !== id),
    }));
  };

  // Helper to parse negative words from criteria name (for disabled/red criteria)
  // Also converts positive words to NO when in the disabled section
  const parseNegativeWord = (name: string): { negativeWord: string | null; rest: string } => {
    const negativeWords = ['NO', 'OFF', 'NEVER', 'DON\'T', 'DONT', 'NOT', 'EXCLUDE', 'REJECT', 'AVOID', 'PROHIBIT', 'BAN', 'WITHOUT'];
    const positiveWords = ['YES', 'ON'];
    const upperName = name.toUpperCase();

    // Check for negative words first
    for (const word of negativeWords) {
      if (upperName.startsWith(word + ' ')) {
        return {
          negativeWord: 'NO',
          rest: name.slice(word.length + 1).trim()
        };
      }
    }

    // If positive word found in disabled section, convert to NO
    for (const word of positiveWords) {
      if (upperName.startsWith(word + ' ')) {
        return {
          negativeWord: 'NO',
          rest: name.slice(word.length + 1).trim()
        };
      }
    }

    return { negativeWord: null, rest: name };
  };

  // Helper to parse positive words from criteria name (for enabled/green criteria)
  // Also converts negative words to YES when in the enabled section
  const parsePositiveWord = (name: string): { positiveWord: string | null; rest: string } => {
    const positiveWords = ['YES', 'ON'];
    const negativeWords = ['NO', 'OFF', 'NEVER', 'DON\'T', 'DONT', 'NOT', 'EXCLUDE', 'REJECT', 'AVOID', 'PROHIBIT', 'BAN', 'WITHOUT'];
    const upperName = name.toUpperCase();

    // Check for positive words first
    for (const word of positiveWords) {
      if (upperName.startsWith(word + ' ')) {
        return {
          positiveWord: 'YES',
          rest: name.slice(word.length + 1).trim()
        };
      }
    }

    // If negative word found in enabled section, convert to YES
    for (const word of negativeWords) {
      if (upperName.startsWith(word + ' ')) {
        return {
          positiveWord: 'YES',
          rest: name.slice(word.length + 1).trim()
        };
      }
    }

    return { positiveWord: null, rest: name };
  };

  // State selector key for forcing re-render
  const [stateSelectKey, setStateSelectKey] = useState(0);

  // Zipcode lookup function
  const lookupZipcode = async (zip: string): Promise<{ city: string; state: string } | null> => {
    try {
      const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (response.ok) {
        const data = await response.json();
        if (data.places && data.places.length > 0) {
          return {
            city: data.places[0]['place name'],
            state: data.places[0]['state abbreviation'],
          };
        }
      }
    } catch (error) {
      console.log('Zipcode lookup failed:', error);
    }
    return null;
  };

  // Zipcode input
  const [zipcodeInput, setZipcodeInput] = useState('');
  const [zipcodeCity, setZipcodeCity] = useState<string | null>(null);
  const [zipcodeLookingUp, setZipcodeLookingUp] = useState(false);
  const [showZipcodeContactForm, setShowZipcodeContactForm] = useState(false);
  const [pendingZipcode, setPendingZipcode] = useState('');
  const [zipcodeContact, setZipcodeContact] = useState({ name: '', email: '', phone: '' });
  const [bulkUploadLoading, setBulkUploadLoading] = useState(false);
  const zipFileInputRef = useRef<HTMLInputElement>(null);

  // Download sample CSV template
  const downloadSampleCSV = () => {
    const headers = 'zipcode,contact_name,contact_email,contact_phone';
    const sampleData = [
      '90210,John Smith,john@example.com,555-123-4567',
      '10001,Jane Doe,jane@example.com,555-987-6543',
      '33101,Mike Johnson,mike@example.com,',
      '60601,,,',
    ];
    const csvContent = [headers, ...sampleData].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zipcode_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parse and upload bulk zipcodes from CSV
  const handleBulkZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkUploadLoading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      // Skip header row if present
      const startIndex = lines[0].toLowerCase().includes('zipcode') ? 1 : 0;

      const newZipcodes: ZipcodeEntry[] = [];

      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
        const zipcode = parts[0]?.replace(/\D/g, '').slice(0, 5);

        if (zipcode && /^\d{5}$/.test(zipcode) && !formData.zipcodes.some(z => z.zipcode === zipcode) && !newZipcodes.some(z => z.zipcode === zipcode)) {
          const contactName = parts[1] || '';
          const contactEmail = parts[2] || '';
          const contactPhone = parts[3] || '';

          // Lookup city info
          const location = await lookupZipcode(zipcode);

          const entry: ZipcodeEntry = {
            zipcode,
            city: location?.city,
            state: location?.state,
          };

          // Add contact if name and email provided
          if (contactName && contactEmail) {
            entry.contact = {
              name: contactName,
              email: contactEmail,
              phone: contactPhone,
            };
          }

          newZipcodes.push(entry);
        }
      }

      if (newZipcodes.length > 0) {
        setFormData(prev => ({
          ...prev,
          zipcodes: [...prev.zipcodes, ...newZipcodes],
        }));
      }
    } catch (error) {
      console.error('Error parsing CSV:', error);
    } finally {
      setBulkUploadLoading(false);
      // Reset file input
      if (zipFileInputRef.current) {
        zipFileInputRef.current.value = '';
      }
    }
  };

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [newContact, setNewContact] = useState<Contact>({
    name: '',
    email: '',
    phone: '',
    markets: [],
  });

  const addZipcode = async (withContact = false) => {
    const zip = zipcodeInput.trim();
    if (zip && /^\d{5}$/.test(zip) && !formData.zipcodes.some(z => z.zipcode === zip)) {
      if (withContact) {
        setPendingZipcode(zip);
        setShowZipcodeContactForm(true);
        setZipcodeInput('');
        setZipcodeCity(null);
      } else {
        // Lookup city info
        const location = await lookupZipcode(zip);
        setFormData((prev) => ({
          ...prev,
          zipcodes: [...prev.zipcodes, {
            zipcode: zip,
            city: location?.city,
            state: location?.state,
          }],
        }));
        setZipcodeInput('');
        setZipcodeCity(null);
      }
    }
  };

  const confirmZipcodeWithContact = async () => {
    if (pendingZipcode && zipcodeContact.name && zipcodeContact.email) {
      const location = await lookupZipcode(pendingZipcode);
      setFormData((prev) => ({
        ...prev,
        zipcodes: [...prev.zipcodes, {
          zipcode: pendingZipcode,
          city: location?.city,
          state: location?.state,
          contact: { ...zipcodeContact }
        }],
      }));
      setPendingZipcode('');
      setZipcodeContact({ name: '', email: '', phone: '' });
      setShowZipcodeContactForm(false);
    }
  };

  const addZipcodeWithoutContact = async () => {
    if (pendingZipcode) {
      const location = await lookupZipcode(pendingZipcode);
      setFormData((prev) => ({
        ...prev,
        zipcodes: [...prev.zipcodes, {
          zipcode: pendingZipcode,
          city: location?.city,
          state: location?.state,
        }],
      }));
      setPendingZipcode('');
      setZipcodeContact({ name: '', email: '', phone: '' });
      setShowZipcodeContactForm(false);
    }
  };

  const removeZipcode = (zip: string) => {
    setFormData((prev) => ({
      ...prev,
      zipcodes: prev.zipcodes.filter((z) => z.zipcode !== zip),
    }));
  };

  const addContactToZipcode = (zip: string) => {
    setPendingZipcode(zip);
    setShowZipcodeContactForm(true);
  };

  const updateZipcodeContact = () => {
    if (pendingZipcode && zipcodeContact.name && zipcodeContact.email) {
      setFormData((prev) => ({
        ...prev,
        zipcodes: prev.zipcodes.map((z) =>
          z.zipcode === pendingZipcode
            ? { ...z, contact: { ...zipcodeContact } }
            : z
        ),
      }));
      setPendingZipcode('');
      setZipcodeContact({ name: '', email: '', phone: '' });
      setShowZipcodeContactForm(false);
    }
  };

  const removeZipcodeContact = (zip: string) => {
    setFormData((prev) => ({
      ...prev,
      zipcodes: prev.zipcodes.map((z) =>
        z.zipcode === zip ? { zipcode: z.zipcode } : z
      ),
    }));
  };

  const addContact = () => {
    if (newContact.name && newContact.email) {
      setFormData((prev) => ({
        ...prev,
        contacts: [...prev.contacts, newContact],
      }));
      setNewContact({ name: '', email: '', phone: '', markets: [] });
      setShowContactForm(false);
    }
  };

  const removeContact = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((_, i) => i !== index),
    }));
  };

  // Preview modal
  const [showPreview, setShowPreview] = useState(false);

  // Calculate completeness score
  const getCompletenessScore = () => {
    let score = 0;
    if (formData.name) score += 20;
    if (formData.contactEmail) score += 20;
    if (formData.states.length > 0) score += 20;
    if (formData.propertyTypes.length > 0) score += 15;
    if (formData.investmentStrategies.length > 0) score += 15;
    if (formData.contacts.length > 0) score += 5;
    if (formData.zipcodes.length > 0) score += 5;
    return Math.min(score, 100);
  };

  // Count risk factors allowed
  const getRiskCount = () => {
    let count = 0;
    if (formData.allowFloodZone) count++;
    if (formData.allowFoundationIssues) count++;
    if (formData.allowStructuralIssues) count++;
    if (formData.allowFireDamage) count++;
    if (formData.allowCodeViolations) count++;
    if (formData.allowOpenPermits) count++;
    return count;
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

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/fastbuybox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setCreatedBuyBox(data.data);
        setIsSuccess(true);
      } else {
        setError(data.error || 'Failed to create buy box');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess && createdBuyBox) {
    return (
      <div
        className="min-h-screen relative bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center p-4"
        style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
      >
        {/* Dark overlay with blur */}
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />

        <div className="relative z-10 w-full max-w-lg">
          {/* Logo above card */}
          <div className="flex justify-center mb-6">
            <img
              src="/dispotree-long-inverted.png"
              alt="CodeLive"
              className="h-12"
            />
          </div>

          <Card className="w-full bg-card/80 border backdrop-blur">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-green-500" />
              </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Buy Box Created!</h2>
            <p className="text-muted-foreground mb-6">
              Your buy box &quot;{createdBuyBox.name}&quot; is now active and matching deals.
            </p>

            <div className="bg-secondary/50 rounded-lg p-4 mb-6 text-left">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">States:</span>
                  <p className="text-foreground">{createdBuyBox.states?.map((s: string) => US_STATES.find(st => st.value === s)?.label || s).join(', ')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Price Range:</span>
                  <p className="text-foreground">
                    ${createdBuyBox.priceRange?.min?.toLocaleString()} - ${createdBuyBox.priceRange?.max?.toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Property Types:</span>
                  <p className="text-foreground">{createdBuyBox.propertyTypes?.join(', ')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Contact:</span>
                  <p className="text-foreground">{createdBuyBox.contactEmail}</p>
                </div>
                {createdBuyBox.zipcodes > 0 && (
                  <div>
                    <span className="text-muted-foreground">Zipcodes:</span>
                    <p className="text-foreground">
                      {createdBuyBox.zipcodes} targeted
                      {createdBuyBox.zipcodesWithContacts > 0 && (
                        <span className="text-green-400 text-xs ml-1">
                          ({createdBuyBox.zipcodesWithContacts} with contacts)
                        </span>
                      )}
                    </p>
                  </div>
                )}
                {createdBuyBox.contactsCount > 0 && (
                  <div>
                    <span className="text-muted-foreground">Contacts:</span>
                    <p className="text-foreground">{createdBuyBox.contactsCount} added</p>
                  </div>
                )}
                {createdBuyBox.customCriteriaCount > 0 && (
                  <div>
                    <span className="text-muted-foreground">Custom:</span>
                    <p className="text-green-400">{createdBuyBox.customCriteriaCount} criteria</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Link href="/login">
                <Button className="w-full bg-green-600 hover:bg-green-700">
                  Sign In to Manage Buy Box
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full border"
                onClick={() => {
                  setIsSuccess(false);
                  setFormData({
                    name: '',
                    fundName: '',
                    contactEmail: '',
                    contactPhone: '',
                    states: [],
                    zipcodes: [] as ZipcodeEntry[],
                    contacts: [],
                    propertyTypes: [],
                    minPrice: 50000,
                    maxPrice: 500000,
                    minBedrooms: 2,
                    maxBedrooms: 6,
                    investmentStrategies: [],
                    allowHoa: false,
                    allowPool: false,
                    allowFloodZone: false,
                    allowFoundationIssues: false,
                    allowStructuralIssues: false,
                    allowFireDamage: false,
                    allowCodeViolations: false,
                    allowOpenPermits: false,
                    allowLiensIfCurable: false,
                    allowPowerLines: false,
                    allowDoubleYellowRoad: false,
                    allowSolarPanels: false,
                    allowSeptic: false,
                    allowWell: false,
                    allowMainRoad: false,
                    allowLeasingRestrictions: false,
                    allowAgeRestrictions: false,
                    maxHoaMonthly: 500,
                    crimeTolerance: 'medium',
                    customCriteria: [],
                    // Advanced options
                    isAdvancedMode: false,
                    minBathrooms: 1,
                    maxBathrooms: 10,
                    minYearBuilt: 1900,
                    minSqft: 0,
                    maxSqft: 0,
                    minLotSizeSqft: 0,
                    maxLotSizeSqft: 0,
                    conditionLevels: [],
                    minRehabBudget: 0,
                    maxRehabBudget: 0,
                    dealSourcePreference: 'both',
                    // Fix & Flip
                    flipMinBelowArvPercent: 0,
                    flipMinExpectedProfit: 0,
                    flipMaxClosingDays: 0,
                    // Long-Term Rental
                    rentalMinHoldYears: 0,
                    rentalMinMonthlyRent: 0,
                    rentalMaxMonthlyRent: 0,
                    rentalMinRentToPrice: 0,
                    rentalMinCapRate: 0,
                    rentalMinCashOnCash: 0,
                    rentalAllowBelowMarket: false,
                    rentalLeaseTypes: [],
                    // Zestimate
                    maxPercentBelowZestimate: 0,
                    // Notification settings
                    matchStrictness: 'flexible',
                    deliveryFrequency: 'realtime',
                  });
                  setStep(1);
                }}
              >
                Create Another Buy Box
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
    >
      {/* Dark overlay with blur */}
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />

      {/* Loading overlay */}
      {isLoading && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-cover bg-center bg-no-repeat transition-opacity duration-500 ${
            isFading ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
        >
          <div className="absolute inset-0 bg-background/60 backdrop-blur-md" />
          <div className={`relative z-10 flex flex-col items-center gap-0 transition-all duration-500 -mt-24 ${
            isFading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
          }`}>
            <img
              src="/dispotree-logo-inverted.png"
              alt="CodeLive"
              className="w-48 h-48 object-contain animate-pulse"
            />
            <div className="relative">
              <div className="w-12 h-12 border-4 border-white/20 rounded-full" />
              <div className="absolute top-0 left-0 w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" style={{ animationDuration: '2s' }} />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
      {/* Header */}
      <div className="border-b border bg-background/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <img src="/dispotree-long-inverted.png" alt="CodeLive" className="h-12" />
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 pt-12 pb-8 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-4">
          Create Your Buy Box
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Tell us what you&apos;re looking for and we&apos;ll match you with deals that fit.
        </p>
      </div>

      {/* Progress */}
      <div className="max-w-2xl mx-auto px-4 mb-8">
        <div className="flex items-center justify-between">
          {[
            { num: 1, label: 'Your Info' },
            { num: 2, label: 'Location & Price' },
            { num: 3, label: 'Preferences' },
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg transition-all ${
                    step > s.num
                      ? 'text-foreground'
                      : step === s.num
                      ? 'text-foreground ring-2 ring-green-300'
                      : 'bg-zinc-700/50 text-muted-foreground border border'
                  }`}
                  style={step >= s.num ? { backgroundColor: '#349167' } : undefined}
                >
                  {step > s.num ? <Check className="w-6 h-6" /> : s.num}
                </div>
                <span className="text-foreground text-center text-base font-medium mt-3 whitespace-nowrap">{s.label}</span>
              </div>
              {idx < 2 && (
                <div
                  className={`w-16 md:w-24 h-1 mx-2 rounded transition-all mb-8 ${
                    step > s.num ? '' : 'bg-zinc-700/50'
                  }`}
                  style={step > s.num ? { backgroundColor: '#349167' } : undefined}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 pb-16">
        <Card className="bg-card/80 border backdrop-blur">
          <CardContent className="pt-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            {/* Step 1: Contact Info */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-foreground">Buy Box Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Texas Flips, Southeast Rentals"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-secondary/50 border text-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fundName" className="text-foreground">Company / Fund Name</Label>
                  <Input
                    id="fundName"
                    placeholder="e.g., ABC Investments LLC"
                    value={formData.fundName}
                    onChange={(e) => setFormData({ ...formData, fundName: e.target.value })}
                    className="bg-secondary/50 border text-foreground"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground text-base font-medium flex items-center gap-2">
                      <Mail className="w-4 h-4" /> Email *
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="deals@company.com"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                      className="bg-secondary/50 border text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-foreground text-base font-medium flex items-center gap-2">
                      <Phone className="w-4 h-4" /> Phone
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: formatPhone(e.target.value) })}
                      className="bg-secondary/50 border text-foreground"
                    />
                  </div>
                </div>

                {/* Additional Contacts */}
                <div className="space-y-3">
                  <Label className="text-foreground text-base font-medium flex items-center gap-2">
                    <Users className="w-4 h-4" /> Additional Contacts (Optional)
                  </Label>

                  {/* Listed contacts */}
                  {formData.contacts.length > 0 && (
                    <div className="space-y-2">
                      {formData.contacts.map((contact, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-green-600/20 rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-green-400" />
                            </div>
                            <div>
                              <p className="text-foreground text-sm font-medium">{contact.name}</p>
                              <p className="text-muted-foreground text-xs">{contact.email}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-red-400"
                            onClick={() => removeContact(index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add contact form */}
                  {showContactForm ? (
                    <div className="p-4 bg-secondary/30 rounded-lg border border space-y-3">
                      <Input
                        placeholder="Name *"
                        value={newContact.name}
                        onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                        className="bg-secondary/50 border text-foreground text-sm"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          type="tel"
                          placeholder="Phone (optional)"
                          value={newContact.phone}
                          onChange={(e) => setNewContact({ ...newContact, phone: formatPhone(e.target.value) })}
                          className="bg-secondary/50 border text-foreground text-sm"
                        />
                        <Input
                          type="email"
                          placeholder="Email *"
                          value={newContact.email}
                          onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                          className="bg-secondary/50 border text-foreground text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="text-foreground hover:opacity-90"
                          style={{ backgroundColor: '#349167' }}
                          onClick={addContact}
                        >
                          Add Contact
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => {
                            setShowContactForm(false);
                            setNewContact({ name: '', email: '', phone: '', markets: [] });
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-dashed border text-muted-foreground hover:text-foreground hover:border-green-500"
                      onClick={() => setShowContactForm(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Contact
                    </Button>
                  )}
                </div>

                <Button
                  className="w-full mt-4 text-base py-6 text-foreground hover:opacity-90"
                  style={{ backgroundColor: '#349167' }}
                  onClick={() => {
                    if (!formData.name || !formData.contactEmail) {
                      setError('Please fill in required fields');
                      return;
                    }
                    setError('');
                    setStep(2);
                  }}
                >
                  <span className="text-foreground">Continue</span> <ArrowRight className="w-4 h-4 ml-2 text-foreground" />
                </Button>
              </div>
            )}

            {/* Step 2: Location & Price */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-foreground text-base font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Target States *
                  </Label>
                  <Select
                    key={stateSelectKey}
                    onValueChange={(value) => {
                      if (value && value !== 'placeholder' && !formData.states.includes(value)) {
                        setFormData((prev) => ({
                          ...prev,
                          states: [...prev.states, value],
                        }));
                        // Force re-render to reset the select
                        setTimeout(() => setStateSelectKey(k => k + 1), 100);
                      }
                    }}
                  >
                    <SelectTrigger className="bg-secondary/50 border text-foreground text-base py-6">
                      <SelectValue placeholder={
                        formData.states.length === 0
                          ? "Select your target states..."
                          : `${formData.states.length} state${formData.states.length > 1 ? 's' : ''} selected - click to add more`
                      } />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border max-h-64">
                      {US_STATES.map((state) => {
                        const isSelected = formData.states.includes(state.value);
                        return (
                          <SelectItem
                            key={state.value}
                            value={state.value}
                            disabled={isSelected}
                            className={`text-base cursor-pointer ${
                              isSelected
                                ? 'text-green-400 bg-green-900/20'
                                : 'text-foreground hover:bg-zinc-700'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {isSelected && <Check className="w-4 h-4 text-green-400" />}
                              {state.label}
                              {isSelected && <span className="text-xs text-green-400 ml-auto">Selected</span>}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  {/* Selected states display */}
                  {formData.states.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.states.map((stateValue) => {
                        const state = US_STATES.find(s => s.value === stateValue);
                        return (
                          <Badge
                            key={stateValue}
                            className="bg-green-600 text-foreground text-base px-3 py-1.5 cursor-pointer hover:bg-red-600 transition-colors flex items-center gap-2"
                            onClick={() => toggleState(stateValue)}
                          >
                            {state?.label || stateValue}
                            <X className="w-4 h-4" />
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  {formData.states.length === 0 && (
                    <p className="text-sm text-muted-foreground">No states selected yet</p>
                  )}
                </div>

                {/* Zipcodes */}
                <div className="space-y-3">
                  <Label className="text-foreground text-base font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Target Zipcodes (Optional)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Add specific zipcodes to narrow down your search. You can assign a contact per zipcode.
                  </p>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input
                          placeholder="Enter 5-digit zipcode"
                          value={zipcodeInput}
                          onChange={async (e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                            setZipcodeInput(value);
                            setZipcodeCity(null);
                            if (value.length === 5) {
                              setZipcodeLookingUp(true);
                              const location = await lookupZipcode(value);
                              setZipcodeLookingUp(false);
                              if (location) {
                                setZipcodeCity(`${location.city}, ${location.state}`);
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addZipcode(false);
                            }
                          }}
                          className="bg-secondary/50 border text-foreground"
                          maxLength={5}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="border text-foreground hover:text-foreground"
                        onClick={() => addZipcode(false)}
                        title="Add zipcode"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-green-600 text-green-400 hover:text-green-300 hover:bg-green-600/10"
                        onClick={() => addZipcode(true)}
                        title="Add zipcode with contact"
                        disabled={!zipcodeInput || zipcodeInput.length !== 5}
                      >
                        <User className="w-4 h-4" />
                      </Button>
                    </div>
                    {/* City preview */}
                    {zipcodeLookingUp && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="animate-pulse">Looking up city...</span>
                      </p>
                    )}
                    {zipcodeCity && !zipcodeLookingUp && (
                      <p className="text-sm text-green-400 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {zipcodeCity}
                      </p>
                    )}
                    {zipcodeInput.length === 5 && !zipcodeCity && !zipcodeLookingUp && (
                      <p className="text-sm text-red-400">Invalid zipcode</p>
                    )}
                  </div>

                  {/* Bulk Upload Section */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                    <input
                      type="file"
                      ref={zipFileInputRef}
                      accept=".csv,.txt"
                      onChange={handleBulkZipUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs border text-muted-foreground hover:text-foreground"
                      onClick={downloadSampleCSV}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Sample CSV
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs border-accent-600 text-accent-400 hover:text-accent-300 hover:bg-accent-600/10"
                      onClick={() => zipFileInputRef.current?.click()}
                      disabled={bulkUploadLoading}
                    >
                      {bulkUploadLoading ? (
                        <span className="animate-pulse">Uploading...</span>
                      ) : (
                        <>
                          <Upload className="w-3 h-3 mr-1" />
                          Bulk Upload
                        </>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      CSV: zipcode, contact_name, contact_email, contact_phone
                    </span>
                  </div>

                  {/* Zipcode Contact Form Modal */}
                  {showZipcodeContactForm && (
                    <div className="p-4 bg-secondary/50 rounded-lg border border-green-600/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-green-600/20 rounded-full flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-green-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Zipcode {pendingZipcode}</p>
                            <p className="text-sm text-muted-foreground">Assign a contact for this area</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setShowZipcodeContactForm(false);
                            setPendingZipcode('');
                            setZipcodeContact({ name: '', email: '', phone: '' });
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input
                          placeholder="Contact name *"
                          value={zipcodeContact.name}
                          onChange={(e) => setZipcodeContact({ ...zipcodeContact, name: e.target.value })}
                          className="bg-secondary/50 border text-foreground text-sm"
                        />
                        <Input
                          type="email"
                          placeholder="Email *"
                          value={zipcodeContact.email}
                          onChange={(e) => setZipcodeContact({ ...zipcodeContact, email: e.target.value })}
                          className="bg-secondary/50 border text-foreground text-sm"
                        />
                        <Input
                          type="tel"
                          placeholder="Phone (optional)"
                          value={zipcodeContact.phone}
                          onChange={(e) => setZipcodeContact({ ...zipcodeContact, phone: formatPhone(e.target.value) })}
                          className="bg-secondary/50 border text-foreground text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={formData.zipcodes.some(z => z.zipcode === pendingZipcode) ? updateZipcodeContact : confirmZipcodeWithContact}
                          disabled={!zipcodeContact.name || !zipcodeContact.email}
                        >
                          <User className="w-3 h-3 mr-1" />
                          {formData.zipcodes.some(z => z.zipcode === pendingZipcode) ? 'Update Contact' : 'Add with Contact'}
                        </Button>
                        {!formData.zipcodes.some(z => z.zipcode === pendingZipcode) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border"
                            onClick={addZipcodeWithoutContact}
                          >
                            Add without Contact
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Zipcode List */}
                  {formData.zipcodes.length > 0 && (
                    <div className="space-y-2">
                      {formData.zipcodes.map((entry) => (
                        <div
                          key={entry.zipcode}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            entry.contact
                              ? 'bg-green-600/10 border-green-600/30'
                              : 'bg-secondary/30 border'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`min-w-[60px] px-2 h-10 rounded-lg flex items-center justify-center font-mono text-sm font-medium ${
                              entry.contact ? 'bg-green-600/20 text-green-400' : 'bg-accent-600/20 text-accent-400'
                            }`}>
                              {entry.zipcode}
                            </div>
                            <div className="flex-1">
                              {entry.city && (
                                <p className="text-sm text-foreground font-medium">{entry.city}, {entry.state}</p>
                              )}
                              {entry.contact ? (
                                <div>
                                  <p className={`text-sm ${entry.city ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
                                    {entry.contact.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{entry.contact.email}</p>
                                </div>
                              ) : (
                                <span className={`text-sm ${entry.city ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                  {entry.city ? '' : 'No city found'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {entry.contact ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
                                  onClick={() => {
                                    setZipcodeContact({
                                      name: entry.contact!.name,
                                      email: entry.contact!.email,
                                      phone: entry.contact!.phone || '',
                                    });
                                    addContactToZipcode(entry.zipcode);
                                  }}
                                  title="Edit contact"
                                >
                                  <User className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-muted-foreground hover:text-orange-400 h-8 w-8 p-0"
                                  onClick={() => removeZipcodeContact(entry.zipcode)}
                                  title="Remove contact"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-green-400 hover:text-green-300 h-8 px-2 text-xs"
                                onClick={() => addContactToZipcode(entry.zipcode)}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add Contact
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-red-400 h-8 w-8 p-0"
                              onClick={() => removeZipcode(entry.zipcode)}
                              title="Remove zipcode"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <Label className="text-foreground text-base font-medium flex items-center gap-2">
                    <DollarSign className="w-4 h-4" /> Price Range
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Min Price</Label>
                      <Select
                        value={String(formData.minPrice)}
                        onValueChange={(v) => setFormData({ ...formData, minPrice: Number(v) })}
                      >
                        <SelectTrigger className="bg-secondary/50 border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-secondary border">
                          {[0, 25000, 50000, 75000, 100000, 150000, 200000, 300000, 500000].map((price) => (
                            <SelectItem key={price} value={String(price)} className="text-foreground">
                              ${price.toLocaleString()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Max Price</Label>
                      <Select
                        value={String(formData.maxPrice)}
                        onValueChange={(v) => setFormData({ ...formData, maxPrice: Number(v) })}
                      >
                        <SelectTrigger className="bg-secondary/50 border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-secondary border">
                          {[100000, 200000, 300000, 400000, 500000, 750000, 1000000, 2000000, 5000000].map((price) => (
                            <SelectItem key={price} value={String(price)} className="text-foreground">
                              ${price.toLocaleString()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-foreground text-base font-medium flex items-center gap-2">
                    <Home className="w-4 h-4" /> Bedrooms
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Min Beds</Label>
                      <Select
                        value={String(formData.minBedrooms)}
                        onValueChange={(v) => setFormData({ ...formData, minBedrooms: Number(v) })}
                      >
                        <SelectTrigger className="bg-secondary/50 border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-secondary border">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <SelectItem key={n} value={String(n)} className="text-foreground">
                              {n}+ beds
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Max Beds</Label>
                      <Select
                        value={String(formData.maxBedrooms)}
                        onValueChange={(v) => setFormData({ ...formData, maxBedrooms: Number(v) })}
                      >
                        <SelectTrigger className="bg-secondary/50 border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-secondary border">
                          {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                            <SelectItem key={n} value={String(n)} className="text-foreground">
                              Up to {n} beds
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Advanced Options Toggle */}
                <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border">
                  <div>
                    <Label className="text-foreground font-medium flex items-center gap-2">
                      <Settings className="w-4 h-4" /> Advanced Options
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">Additional property specs, rehab, deal source & Zestimate filter</p>
                  </div>
                  <Switch
                    checked={formData.isAdvancedMode}
                    onCheckedChange={(checked) => setFormData({ ...formData, isAdvancedMode: checked as boolean })}
                  />
                </div>

                {/* Advanced Options Section */}
                {formData.isAdvancedMode && (
                  <div className="space-y-6 p-4 bg-secondary/20 rounded-lg border border/50">
                    {/* Bathrooms */}
                    <div className="space-y-3">
                      <Label className="text-foreground text-base font-medium flex items-center gap-2">
                        <Home className="w-4 h-4" /> Bathrooms
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">Min Baths</Label>
                          <Select
                            value={String(formData.minBathrooms)}
                            onValueChange={(v) => setFormData({ ...formData, minBathrooms: Number(v) })}
                          >
                            <SelectTrigger className="bg-secondary/50 border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-secondary border">
                              {[1, 1.5, 2, 2.5, 3, 4].map((n) => (
                                <SelectItem key={n} value={String(n)} className="text-foreground">
                                  {n}+ baths
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">Max Baths</Label>
                          <Select
                            value={String(formData.maxBathrooms)}
                            onValueChange={(v) => setFormData({ ...formData, maxBathrooms: Number(v) })}
                          >
                            <SelectTrigger className="bg-secondary/50 border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-secondary border">
                              {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                                <SelectItem key={n} value={String(n)} className="text-foreground">
                                  Up to {n} baths
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Year Built */}
                    <div className="space-y-3">
                      <Label className="text-foreground text-base font-medium flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Year Built
                      </Label>
                      <div>
                        <Label className="text-sm text-muted-foreground">Min Year Built</Label>
                        <Select
                          value={String(formData.minYearBuilt)}
                          onValueChange={(v) => setFormData({ ...formData, minYearBuilt: Number(v) })}
                        >
                          <SelectTrigger className="bg-secondary/50 border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {[1900, 1950, 1970, 1980, 1990, 2000, 2010, 2015, 2020].map((year) => (
                              <SelectItem key={year} value={String(year)} className="text-foreground">
                                {year === 1900 ? 'Any Year' : `${year} or newer`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Square Footage */}
                    <div className="space-y-3">
                      <Label className="text-foreground text-base font-medium flex items-center gap-2">
                        <Ruler className="w-4 h-4" /> Square Footage
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">Min Sqft</Label>
                          <Select
                            value={String(formData.minSqft)}
                            onValueChange={(v) => setFormData({ ...formData, minSqft: Number(v) })}
                          >
                            <SelectTrigger className="bg-secondary/50 border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-secondary border">
                              {[0, 500, 800, 1000, 1200, 1500, 2000, 2500, 3000].map((sqft) => (
                                <SelectItem key={sqft} value={String(sqft)} className="text-foreground">
                                  {sqft === 0 ? 'Any' : `${sqft.toLocaleString()} sqft+`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">Max Sqft</Label>
                          <Select
                            value={String(formData.maxSqft)}
                            onValueChange={(v) => setFormData({ ...formData, maxSqft: Number(v) })}
                          >
                            <SelectTrigger className="bg-secondary/50 border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-secondary border">
                              {[0, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000].map((sqft) => (
                                <SelectItem key={sqft} value={String(sqft)} className="text-foreground">
                                  {sqft === 0 ? 'Any' : `Up to ${sqft.toLocaleString()} sqft`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Lot Size */}
                    <div className="space-y-3">
                      <Label className="text-foreground text-base font-medium flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Lot Size (sqft)
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">Min Lot Size</Label>
                          <Select
                            value={String(formData.minLotSizeSqft)}
                            onValueChange={(v) => setFormData({ ...formData, minLotSizeSqft: Number(v) })}
                          >
                            <SelectTrigger className="bg-secondary/50 border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-secondary border">
                              {[0, 2000, 5000, 7500, 10000, 21780, 43560, 87120].map((sqft) => (
                                <SelectItem key={sqft} value={String(sqft)} className="text-foreground">
                                  {sqft === 0 ? 'Any' : sqft >= 43560 ? `${(sqft / 43560).toFixed(1)} acre+` : `${sqft.toLocaleString()} sqft+`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">Max Lot Size</Label>
                          <Select
                            value={String(formData.maxLotSizeSqft)}
                            onValueChange={(v) => setFormData({ ...formData, maxLotSizeSqft: Number(v) })}
                          >
                            <SelectTrigger className="bg-secondary/50 border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-secondary border">
                              {[0, 5000, 10000, 21780, 43560, 87120, 217800, 435600].map((sqft) => (
                                <SelectItem key={sqft} value={String(sqft)} className="text-foreground">
                                  {sqft === 0 ? 'Any' : sqft >= 43560 ? `Up to ${(sqft / 43560).toFixed(1)} acres` : `Up to ${sqft.toLocaleString()} sqft`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Rehab Budget */}
                    <div className="space-y-3">
                      <Label className="text-foreground text-base font-medium flex items-center gap-2">
                        <Hammer className="w-4 h-4" /> Rehab Budget Range
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">Min Rehab</Label>
                          <Select
                            value={String(formData.minRehabBudget)}
                            onValueChange={(v) => setFormData({ ...formData, minRehabBudget: Number(v) })}
                          >
                            <SelectTrigger className="bg-secondary/50 border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-secondary border">
                              {[0, 5000, 10000, 25000, 50000, 75000, 100000].map((amt) => (
                                <SelectItem key={amt} value={String(amt)} className="text-foreground">
                                  {amt === 0 ? 'Any' : `$${(amt / 1000).toFixed(0)}k+`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">Max Rehab</Label>
                          <Select
                            value={String(formData.maxRehabBudget)}
                            onValueChange={(v) => setFormData({ ...formData, maxRehabBudget: Number(v) })}
                          >
                            <SelectTrigger className="bg-secondary/50 border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-secondary border">
                              {[0, 25000, 50000, 75000, 100000, 150000, 200000, 300000].map((amt) => (
                                <SelectItem key={amt} value={String(amt)} className="text-foreground">
                                  {amt === 0 ? 'Any' : `Up to $${(amt / 1000).toFixed(0)}k`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Deal Source */}
                    <div className="space-y-3">
                      <Label className="text-foreground text-base font-medium flex items-center gap-2">
                        <Target className="w-4 h-4" /> Deal Source Preference
                      </Label>
                      <p className="text-xs text-muted-foreground">Are you okay with properties listed on the MLS?</p>
                      <div className="grid grid-cols-3 gap-2">
                        {DEAL_SOURCE_OPTIONS.map((option) => (
                          <div
                            key={option.value}
                            onClick={() => setFormData({ ...formData, dealSourcePreference: option.value as any })}
                            className={`p-3 rounded-lg border cursor-pointer transition-all text-center ${
                              formData.dealSourcePreference === option.value
                                ? 'bg-green-600/20 border-green-500'
                                : 'bg-secondary/30 border hover:border'
                            }`}
                          >
                            <span className="text-foreground text-sm font-medium">{option.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Zestimate Filter */}
                    <div className="space-y-3">
                      <Label className="text-foreground text-base font-medium flex items-center gap-2">
                        <Percent className="w-4 h-4" /> Zestimate Pricing Filter
                      </Label>
                      <p className="text-xs text-muted-foreground">Show properties priced at or below this percentage of the Zestimate</p>
                      <Select
                        value={String(formData.maxPercentBelowZestimate)}
                        onValueChange={(v) => setFormData({ ...formData, maxPercentBelowZestimate: Number(v) })}
                      >
                        <SelectTrigger className="bg-secondary/50 border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-secondary border">
                          {ZESTIMATE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={String(option.value)} className="text-foreground">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 border text-base py-6"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 text-base py-6 text-foreground hover:opacity-90"
                    style={{ backgroundColor: '#349167' }}
                    onClick={() => {
                      if (formData.states.length === 0) {
                        setError('Please select at least one state');
                        return;
                      }
                      setError('');
                      setStep(3);
                    }}
                  >
                    <span className="text-foreground">Continue</span> <ArrowRight className="w-5 h-5 ml-2 text-foreground" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Preferences */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-foreground text-base font-medium flex items-center gap-2">
                    <Building2 className="w-4 h-4" /> Property Types
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {PROPERTY_TYPES.map((type) => (
                      <div
                        key={type.value}
                        onClick={() => togglePropertyType(type.value)}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          formData.propertyTypes.includes(type.value)
                            ? 'bg-green-600/20 border-green-500'
                            : 'bg-secondary/30 border hover:border'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{type.icon}</span>
                          <span className="text-foreground font-medium text-sm">{type.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-foreground text-base font-medium flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Investment Strategy
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {STRATEGIES.map((strategy) => (
                      <div
                        key={strategy.value}
                        onClick={() => toggleStrategy(strategy.value)}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          formData.investmentStrategies.includes(strategy.value)
                            ? 'bg-green-600/20 border-green-500'
                            : 'bg-secondary/30 border hover:border'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{strategy.icon}</span>
                          <span className="text-foreground font-medium">{strategy.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fix & Flip Strategy Options */}
                {formData.investmentStrategies.includes('fix_and_flip') && (
                  <div className="space-y-4 p-4 bg-orange-950/20 rounded-lg border border-orange-600/30">
                    <h4 className="text-orange-400 font-medium flex items-center gap-2">
                      <Hammer className="w-4 h-4" /> Fix & Flip Criteria
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Min % Below ARV</Label>
                        <Select
                          value={String(formData.flipMinBelowArvPercent)}
                          onValueChange={(v) => setFormData({ ...formData, flipMinBelowArvPercent: Number(v) })}
                        >
                          <SelectTrigger className="bg-secondary/50 border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {[0, 10, 15, 20, 25, 30, 35, 40].map((pct) => (
                              <SelectItem key={pct} value={String(pct)} className="text-foreground">
                                {pct === 0 ? 'Any' : `${pct}% or more`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Min Expected Profit</Label>
                        <Select
                          value={String(formData.flipMinExpectedProfit)}
                          onValueChange={(v) => setFormData({ ...formData, flipMinExpectedProfit: Number(v) })}
                        >
                          <SelectTrigger className="bg-secondary/50 border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {[0, 10000, 20000, 30000, 40000, 50000, 75000, 100000].map((amt) => (
                              <SelectItem key={amt} value={String(amt)} className="text-foreground">
                                {amt === 0 ? 'Any' : `$${(amt / 1000).toFixed(0)}k+`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Max Closing Timeline</Label>
                        <Select
                          value={String(formData.flipMaxClosingDays)}
                          onValueChange={(v) => setFormData({ ...formData, flipMaxClosingDays: Number(v) })}
                        >
                          <SelectTrigger className="bg-secondary/50 border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {[0, 14, 21, 30, 45, 60, 90].map((days) => (
                              <SelectItem key={days} value={String(days)} className="text-foreground">
                                {days === 0 ? 'Any' : `${days} days`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Long-Term Rental Strategy Options */}
                {formData.investmentStrategies.includes('long_term_rental') && (
                  <div className="space-y-4 p-4 bg-accent-900/20 rounded-lg border border-accent-600/30">
                    <h4 className="text-accent-400 font-medium flex items-center gap-2">
                      <Home className="w-4 h-4" /> Long-Term Rental Criteria
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Min Hold Period (years)</Label>
                        <Select
                          value={String(formData.rentalMinHoldYears)}
                          onValueChange={(v) => setFormData({ ...formData, rentalMinHoldYears: Number(v) })}
                        >
                          <SelectTrigger className="bg-secondary/50 border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {[0, 1, 2, 3, 5, 7, 10].map((yrs) => (
                              <SelectItem key={yrs} value={String(yrs)} className="text-foreground">
                                {yrs === 0 ? 'Any' : `${yrs}+ years`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Min Monthly Rent</Label>
                        <Select
                          value={String(formData.rentalMinMonthlyRent)}
                          onValueChange={(v) => setFormData({ ...formData, rentalMinMonthlyRent: Number(v) })}
                        >
                          <SelectTrigger className="bg-secondary/50 border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {[0, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000].map((rent) => (
                              <SelectItem key={rent} value={String(rent)} className="text-foreground">
                                {rent === 0 ? 'Any' : `$${rent.toLocaleString()}/mo+`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Max Monthly Rent</Label>
                        <Select
                          value={String(formData.rentalMaxMonthlyRent)}
                          onValueChange={(v) => setFormData({ ...formData, rentalMaxMonthlyRent: Number(v) })}
                        >
                          <SelectTrigger className="bg-secondary/50 border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {[0, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000].map((rent) => (
                              <SelectItem key={rent} value={String(rent)} className="text-foreground">
                                {rent === 0 ? 'Any' : `Up to $${rent.toLocaleString()}/mo`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Min Rent-to-Price Ratio</Label>
                        <Select
                          value={String(formData.rentalMinRentToPrice)}
                          onValueChange={(v) => setFormData({ ...formData, rentalMinRentToPrice: Number(v) })}
                        >
                          <SelectTrigger className="bg-secondary/50 border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {[0, 0.5, 0.7, 0.8, 1.0, 1.2, 1.5, 2.0].map((ratio) => (
                              <SelectItem key={ratio} value={String(ratio)} className="text-foreground">
                                {ratio === 0 ? 'Any' : `${ratio}%+`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Min Cap Rate</Label>
                        <Select
                          value={String(formData.rentalMinCapRate)}
                          onValueChange={(v) => setFormData({ ...formData, rentalMinCapRate: Number(v) })}
                        >
                          <SelectTrigger className="bg-secondary/50 border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {[0, 4, 5, 6, 7, 8, 10, 12].map((rate) => (
                              <SelectItem key={rate} value={String(rate)} className="text-foreground">
                                {rate === 0 ? 'Any' : `${rate}%+`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Min Cash-on-Cash Return</Label>
                        <Select
                          value={String(formData.rentalMinCashOnCash)}
                          onValueChange={(v) => setFormData({ ...formData, rentalMinCashOnCash: Number(v) })}
                        >
                          <SelectTrigger className="bg-secondary/50 border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {[0, 5, 8, 10, 12, 15, 20].map((rate) => (
                              <SelectItem key={rate} value={String(rate)} className="text-foreground">
                                {rate === 0 ? 'Any' : `${rate}%+`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-accent-600/20">
                      <Label htmlFor="belowMarket" className="text-foreground">Allow Below-Market Rents</Label>
                      <Switch
                        id="belowMarket"
                        checked={formData.rentalAllowBelowMarket}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, rentalAllowBelowMarket: checked as boolean })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Lease Type Preferences</Label>
                      <div className="flex flex-wrap gap-2">
                        {LEASE_TYPES.map((lease) => (
                          <Badge
                            key={lease.value}
                            className={`cursor-pointer transition-all ${
                              formData.rentalLeaseTypes.includes(lease.value)
                                ? 'bg-accent-600 text-white hover:bg-accent-700'
                                : 'bg-zinc-700 text-foreground hover:bg-zinc-600'
                            }`}
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                rentalLeaseTypes: prev.rentalLeaseTypes.includes(lease.value)
                                  ? prev.rentalLeaseTypes.filter((l) => l !== lease.value)
                                  : [...prev.rentalLeaseTypes, lease.value],
                              }));
                            }}
                          >
                            {formData.rentalLeaseTypes.includes(lease.value) && <Check className="w-3 h-3 mr-1" />}
                            {lease.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <Label className="text-foreground text-base font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Risk Tolerance
                  </Label>

                  {/* Property Features */}
                  <div className="space-y-3 p-4 bg-secondary/30 rounded-lg">
                    <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide mb-3">Property Features</p>

                    {/* Allowed Features (YES) */}
                    {(formData.allowHoa || formData.allowPool || formData.allowSolarPanels || formData.allowSeptic || formData.allowWell || formData.allowMainRoad) && (
                      <div className="space-y-2">
                        <p className="text-xs text-green-400 font-medium uppercase tracking-wide flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Allowed
                        </p>
                        {formData.allowHoa && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowHoa} onCheckedChange={(checked) => setFormData({ ...formData, allowHoa: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">HOA</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowPool && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowPool} onCheckedChange={(checked) => setFormData({ ...formData, allowPool: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Pool</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowSolarPanels && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowSolarPanels} onCheckedChange={(checked) => setFormData({ ...formData, allowSolarPanels: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Solar Panels</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowSeptic && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowSeptic} onCheckedChange={(checked) => setFormData({ ...formData, allowSeptic: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Septic System</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowWell && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowWell} onCheckedChange={(checked) => setFormData({ ...formData, allowWell: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Well Water</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowMainRoad && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowMainRoad} onCheckedChange={(checked) => setFormData({ ...formData, allowMainRoad: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Main Road</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Not Allowed Features (NO) */}
                    {(!formData.allowHoa || !formData.allowPool || !formData.allowSolarPanels || !formData.allowSeptic || !formData.allowWell || !formData.allowMainRoad) && (
                      <div className="space-y-2">
                        <p className="text-xs text-red-400 font-medium uppercase tracking-wide flex items-center gap-1">
                          <Ban className="w-3 h-3" /> Not Allowed
                        </p>
                        {!formData.allowHoa && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowHoa} onCheckedChange={(checked) => setFormData({ ...formData, allowHoa: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">HOA</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowPool && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowPool} onCheckedChange={(checked) => setFormData({ ...formData, allowPool: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Pool</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowSolarPanels && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowSolarPanels} onCheckedChange={(checked) => setFormData({ ...formData, allowSolarPanels: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Solar Panels</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowSeptic && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowSeptic} onCheckedChange={(checked) => setFormData({ ...formData, allowSeptic: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Septic System</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowWell && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowWell} onCheckedChange={(checked) => setFormData({ ...formData, allowWell: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Well Water</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowMainRoad && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowMainRoad} onCheckedChange={(checked) => setFormData({ ...formData, allowMainRoad: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Main Road</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {formData.allowHoa && (
                      <div className="flex items-center gap-3 pt-2 border-t border">
                        <Label className="text-foreground text-base whitespace-nowrap">Max HOA/month</Label>
                        <Select
                          value={String(formData.maxHoaMonthly)}
                          onValueChange={(v) => setFormData({ ...formData, maxHoaMonthly: Number(v) })}
                        >
                          <SelectTrigger className="bg-secondary/50 border text-foreground w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-secondary border">
                            {[100, 200, 300, 400, 500, 750, 1000, 2000].map((n) => (
                              <SelectItem key={n} value={String(n)} className="text-foreground">
                                ${n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Property Issues */}
                  <div className="space-y-3 p-4 bg-card/50 rounded-lg border border">
                    <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide mb-3">Property Issues (Higher Risk)</p>

                    {/* Allowed Issues (YES) */}
                    {(formData.allowFloodZone || formData.allowFoundationIssues || formData.allowStructuralIssues || formData.allowFireDamage || formData.allowCodeViolations || formData.allowLiensIfCurable || formData.allowPowerLines || formData.allowDoubleYellowRoad) && (
                      <div className="space-y-2">
                        <p className="text-xs text-green-400 font-medium uppercase tracking-wide flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Allowed
                        </p>
                        {formData.allowFloodZone && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowFloodZone} onCheckedChange={(checked) => setFormData({ ...formData, allowFloodZone: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Flood Zone</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowFoundationIssues && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowFoundationIssues} onCheckedChange={(checked) => setFormData({ ...formData, allowFoundationIssues: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Foundation Issues</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowStructuralIssues && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowStructuralIssues} onCheckedChange={(checked) => setFormData({ ...formData, allowStructuralIssues: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Structural Issues</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowFireDamage && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowFireDamage} onCheckedChange={(checked) => setFormData({ ...formData, allowFireDamage: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Fire Damage</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowCodeViolations && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowCodeViolations} onCheckedChange={(checked) => setFormData({ ...formData, allowCodeViolations: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Code Violations</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowLiensIfCurable && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowLiensIfCurable} onCheckedChange={(checked) => setFormData({ ...formData, allowLiensIfCurable: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Liens</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowPowerLines && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowPowerLines} onCheckedChange={(checked) => setFormData({ ...formData, allowPowerLines: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Power Lines</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowDoubleYellowRoad && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowDoubleYellowRoad} onCheckedChange={(checked) => setFormData({ ...formData, allowDoubleYellowRoad: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Double Yellow Lined Road</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Not Allowed Issues (NO) */}
                    {(!formData.allowFloodZone || !formData.allowFoundationIssues || !formData.allowStructuralIssues || !formData.allowFireDamage || !formData.allowCodeViolations || !formData.allowLiensIfCurable || !formData.allowPowerLines || !formData.allowDoubleYellowRoad) && (
                      <div className="space-y-2">
                        <p className="text-xs text-red-400 font-medium uppercase tracking-wide flex items-center gap-1">
                          <Ban className="w-3 h-3" /> Not Allowed
                        </p>
                        {!formData.allowFloodZone && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowFloodZone} onCheckedChange={(checked) => setFormData({ ...formData, allowFloodZone: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Flood Zone</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowFoundationIssues && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowFoundationIssues} onCheckedChange={(checked) => setFormData({ ...formData, allowFoundationIssues: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Foundation Issues</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowStructuralIssues && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowStructuralIssues} onCheckedChange={(checked) => setFormData({ ...formData, allowStructuralIssues: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Structural Issues</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowFireDamage && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowFireDamage} onCheckedChange={(checked) => setFormData({ ...formData, allowFireDamage: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Fire Damage</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowCodeViolations && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowCodeViolations} onCheckedChange={(checked) => setFormData({ ...formData, allowCodeViolations: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Code Violations</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowLiensIfCurable && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowLiensIfCurable} onCheckedChange={(checked) => setFormData({ ...formData, allowLiensIfCurable: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Liens</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowPowerLines && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowPowerLines} onCheckedChange={(checked) => setFormData({ ...formData, allowPowerLines: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Power Lines</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowDoubleYellowRoad && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowDoubleYellowRoad} onCheckedChange={(checked) => setFormData({ ...formData, allowDoubleYellowRoad: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Double Yellow Lined Road</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Community & Location */}
                  <div className="space-y-3 p-4 bg-card/50 rounded-lg border border">
                    <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide mb-3">Community Restrictions</p>

                    {/* Allowed Restrictions (YES) */}
                    {(formData.allowLeasingRestrictions || formData.allowAgeRestrictions) && (
                      <div className="space-y-2">
                        <p className="text-xs text-green-400 font-medium uppercase tracking-wide flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Allowed
                        </p>
                        {formData.allowLeasingRestrictions && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowLeasingRestrictions} onCheckedChange={(checked) => setFormData({ ...formData, allowLeasingRestrictions: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Leasing Restrictions</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                        {formData.allowAgeRestrictions && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowAgeRestrictions} onCheckedChange={(checked) => setFormData({ ...formData, allowAgeRestrictions: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-green-500 font-bold text-base">YES</span>
                                <span className="text-base font-medium text-foreground">Age Restrictions (55+)</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Not Allowed Restrictions (NO) */}
                    {(!formData.allowLeasingRestrictions || !formData.allowAgeRestrictions) && (
                      <div className="space-y-2">
                        <p className="text-xs text-red-400 font-medium uppercase tracking-wide flex items-center gap-1">
                          <Ban className="w-3 h-3" /> Not Allowed
                        </p>
                        {!formData.allowLeasingRestrictions && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowLeasingRestrictions} onCheckedChange={(checked) => setFormData({ ...formData, allowLeasingRestrictions: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Leasing Restrictions</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!formData.allowAgeRestrictions && (
                          <div className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30">
                            <div className="flex items-center gap-3 flex-1">
                              <Switch checked={formData.allowAgeRestrictions} onCheckedChange={(checked) => setFormData({ ...formData, allowAgeRestrictions: checked })} />
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 font-bold text-base">NO</span>
                                <span className="text-base font-medium text-foreground">Age Restrictions (55+)</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                  {/* Custom Criteria */}
                  <div className="space-y-4 p-4 bg-green-950/20 rounded-lg border border-green-900/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-green-400 font-medium uppercase tracking-wide">Custom Criteria</p>
                        <p className="text-sm text-muted-foreground mt-1">Add your own requirements</p>
                      </div>
                      <Sparkles className="w-5 h-5 text-green-400" />
                    </div>

                    {/* Add custom criteria input */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g., No mobile homes, Must have garage..."
                        value={customCriteriaInput}
                        onChange={(e) => setCustomCriteriaInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCustomCriteria();
                          }
                        }}
                        className="bg-secondary/50 border text-foreground flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="border-green-600 text-green-400 hover:text-green-300 hover:bg-green-600/10"
                        onClick={addCustomCriteria}
                        disabled={!customCriteriaInput.trim()}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Custom criteria list - grouped by yes/no */}
                    {formData.customCriteria.length > 0 && (
                      <div className="space-y-4">
                        {/* Yes/Enabled criteria */}
                        {formData.customCriteria.filter(c => c.enabled).length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-green-400 font-medium uppercase tracking-wide flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Required
                            </p>
                            {formData.customCriteria.filter(c => c.enabled).map((criteria) => {
                              const { positiveWord, rest } = parsePositiveWord(criteria.name);
                              return (
                                <div
                                  key={criteria.id}
                                  className="flex items-center justify-between p-3 rounded-lg border transition-all bg-green-600/10 border-green-600/30"
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <Switch
                                      checked={criteria.enabled}
                                      onCheckedChange={() => toggleCustomCriteria(criteria.id)}
                                    />
                                    <div className="flex items-center gap-2">
                                      {positiveWord ? (
                                        <>
                                          <span className="text-green-500 font-bold text-base">{positiveWord}</span>
                                          <span className="text-base font-medium text-foreground">{rest}</span>
                                        </>
                                      ) : (
                                        <span className="text-base font-medium text-foreground">{criteria.name}</span>
                                      )}
                                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-red-400 h-8 w-8 p-0"
                                    onClick={() => removeCustomCriteria(criteria.id)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* No/Disabled criteria */}
                        {formData.customCriteria.filter(c => !c.enabled).length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-red-400 font-medium uppercase tracking-wide flex items-center gap-1">
                              <Ban className="w-3 h-3" /> Not Allowed
                            </p>
                            {formData.customCriteria.filter(c => !c.enabled).map((criteria) => {
                              const { negativeWord, rest } = parseNegativeWord(criteria.name);
                              return (
                                <div
                                  key={criteria.id}
                                  className="flex items-center justify-between p-3 rounded-lg border transition-all bg-red-600/10 border-red-600/30"
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <Switch
                                      checked={criteria.enabled}
                                      onCheckedChange={() => toggleCustomCriteria(criteria.id)}
                                    />
                                    <div className="flex items-center gap-2">
                                      {negativeWord ? (
                                        <>
                                          <span className="text-red-500 font-bold text-base">{negativeWord}</span>
                                          <span className="text-base font-medium text-foreground">{rest}</span>
                                        </>
                                      ) : (
                                        <span className="text-base font-medium text-foreground">{criteria.name}</span>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-red-400 h-8 w-8 p-0"
                                    onClick={() => removeCustomCriteria(criteria.id)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {formData.customCriteria.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        No custom criteria added yet
                      </p>
                    )}
                  </div>

                {/* Notification Settings */}
                <div className="space-y-4 p-4 bg-secondary/30 rounded-lg border border">
                  <h4 className="text-foreground font-medium flex items-center gap-2">
                    <Bell className="w-4 h-4" /> Notification Settings
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Match Strictness</Label>
                      <p className="text-xs text-muted-foreground">Strict = exact matches only</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(['strict', 'flexible'] as const).map((option) => (
                          <div
                            key={option}
                            onClick={() => setFormData({ ...formData, matchStrictness: option })}
                            className={`p-3 rounded-lg border cursor-pointer transition-all text-center ${
                              formData.matchStrictness === option
                                ? 'bg-green-600/20 border-green-500'
                                : 'bg-secondary/30 border hover:border'
                            }`}
                          >
                            <span className="text-foreground text-sm font-medium capitalize">{option}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Delivery Frequency</Label>
                      <p className="text-xs text-muted-foreground">How often to receive deal alerts</p>
                      <Select
                        value={formData.deliveryFrequency}
                        onValueChange={(v) => setFormData({ ...formData, deliveryFrequency: v as any })}
                      >
                        <SelectTrigger className="bg-secondary/50 border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-secondary border">
                          <SelectItem value="realtime" className="text-foreground">Real-time</SelectItem>
                          <SelectItem value="daily" className="text-foreground">Daily Digest</SelectItem>
                          <SelectItem value="weekly" className="text-foreground">Weekly Summary</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 border text-base py-6"
                    onClick={() => setStep(2)}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6"
                    onClick={() => setShowPreview(true)}
                    disabled={isSubmitting}
                  >
                    <Eye className="w-5 h-5 mr-2" />
                    Preview & Submit
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Floating Preview Button */}
      {step > 1 && !showPreview && (
        <button
          onClick={() => setShowPreview(true)}
          className="fixed bottom-6 right-6 bg-secondary hover:bg-zinc-700 text-foreground px-4 py-3 rounded-full shadow-lg border border flex items-center gap-2 transition-all hover:scale-105 z-20"
        >
          <Eye className="w-5 h-5" />
          <span className="hidden sm:inline">Preview</span>
          {getCompletenessScore() > 0 && (
            <span className="bg-green-600 text-xs px-2 py-0.5 rounded-full">
              {getCompletenessScore()}%
            </span>
          )}
        </button>
      )}

      {/* Preview Modal - White Paper Offer Letter Style */}
      {showPreview && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Letter Content */}
            <div className="overflow-y-auto max-h-[80vh]">
              {/* Letter Header */}
              <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 px-8 py-6 text-foreground">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">BUY BOX CRITERIA</h1>
                    <p className="text-muted-foreground text-sm mt-1">Investment Property Acquisition Parameters</p>
                  </div>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="text-muted-foreground hover:text-foreground p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Letter Body */}
              <div className="px-8 py-6 space-y-6">
                {/* Investor Info Section */}
                <div className="border-b-2 border-zinc-200 pb-6">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Investor Information</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Buy Box Name</p>
                      <p className="text-lg font-semibold text-zinc-900">{formData.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Company / Fund</p>
                      <p className="text-lg font-semibold text-zinc-900">{formData.fundName || formData.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Contact Email</p>
                      <p className="text-sm text-zinc-700">{formData.contactEmail || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Contact Phone</p>
                      <p className="text-sm text-zinc-700">{formData.contactPhone || '—'}</p>
                    </div>
                  </div>
                  {formData.contacts.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-zinc-100">
                      <p className="text-xs text-muted-foreground mb-2">Additional Team Members ({formData.contacts.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {formData.contacts.map((c, i) => (
                          <span key={i} className="text-xs bg-zinc-100 text-muted-foreground px-2 py-1 rounded">
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Geographic Criteria */}
                <div className="border-b-2 border-zinc-200 pb-6">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Geographic Criteria</h2>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Target States</p>
                      <div className="flex flex-wrap gap-1">
                        {formData.states.length > 0 ? formData.states.map((state) => (
                          <span key={state} className="text-xs bg-green-600/20 text-zinc-900 px-2 py-1 rounded border border-green-600/30">
                            {US_STATES.find(s => s.value === state)?.label || state}
                          </span>
                        )) : <span className="text-muted-foreground text-sm">No states selected</span>}
                      </div>
                    </div>
                    {formData.zipcodes.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Target Zipcodes ({formData.zipcodes.length})</p>
                        <div className="space-y-1">
                          {formData.zipcodes.slice(0, 8).map((z) => (
                            <div key={z.zipcode} className={`text-xs px-2 py-1.5 rounded border flex items-center gap-2 ${z.contact ? 'bg-green-50 border-green-200' : 'bg-zinc-50 border-zinc-200'}`}>
                              <span className="font-mono font-medium text-zinc-800">{z.zipcode}</span>
                              {z.city && (
                                <span className="text-muted-foreground">{z.city}, {z.state}</span>
                              )}
                              {z.contact && (
                                <span className="text-green-600 ml-auto">{z.contact.name}</span>
                              )}
                            </div>
                          ))}
                          {formData.zipcodes.length > 8 && (
                            <p className="text-xs text-muted-foreground px-2">+{formData.zipcodes.length - 8} more zipcodes</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Criteria */}
                <div className="border-b-2 border-zinc-200 pb-6">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Financial Criteria</h2>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center p-4 bg-zinc-50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Minimum Price</p>
                      <p className="text-xl font-bold text-zinc-900">${formData.minPrice.toLocaleString()}</p>
                    </div>
                    <div className="text-center p-4 bg-zinc-50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Maximum Price</p>
                      <p className="text-xl font-bold text-zinc-900">${formData.maxPrice.toLocaleString()}</p>
                    </div>
                    <div className="text-center p-4 bg-zinc-50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Bedrooms</p>
                      <p className="text-xl font-bold text-zinc-900">{formData.minBedrooms} - {formData.maxBedrooms}</p>
                    </div>
                  </div>
                </div>

                {/* Property & Strategy */}
                <div className="border-b-2 border-zinc-200 pb-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Property Types</h2>
                      <ul className="space-y-1">
                        {formData.propertyTypes.map((type) => (
                          <li key={type} className="flex items-center gap-2 text-sm text-zinc-700">
                            <Check className="w-4 h-4 text-green-600" />
                            {PROPERTY_TYPES.find((t) => t.value === type)?.label || type}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Investment Strategy</h2>
                      <ul className="space-y-1">
                        {formData.investmentStrategies.map((s) => (
                          <li key={s} className="flex items-center gap-2 text-sm text-zinc-700">
                            <span>{STRATEGIES.find((st) => st.value === s)?.icon}</span>
                            {STRATEGIES.find((st) => st.value === s)?.label || s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Risk Tolerance */}
                <div className="border-b-2 border-zinc-200 pb-6">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Risk Tolerance & Preferences</h2>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b border-zinc-100">
                      <span className="text-muted-foreground">HOA Properties</span>
                      <span className={formData.allowHoa ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {formData.allowHoa ? `Yes (max $${formData.maxHoaMonthly}/mo)` : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-100">
                      <span className="text-muted-foreground">Pool</span>
                      <span className={formData.allowPool ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {formData.allowPool ? 'Allowed' : 'Not Allowed'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-100">
                      <span className="text-muted-foreground">Flood Zone</span>
                      <span className={formData.allowFloodZone ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
                        {formData.allowFloodZone ? 'Allowed' : 'Not Allowed'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-100">
                      <span className="text-muted-foreground">Foundation Issues</span>
                      <span className={formData.allowFoundationIssues ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
                        {formData.allowFoundationIssues ? 'Allowed' : 'Not Allowed'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-100">
                      <span className="text-muted-foreground">Septic System</span>
                      <span className={formData.allowSeptic ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {formData.allowSeptic ? 'Allowed' : 'Not Allowed'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-100">
                      <span className="text-muted-foreground">Well Water</span>
                      <span className={formData.allowWell ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {formData.allowWell ? 'Allowed' : 'Not Allowed'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-100">
                      <span className="text-muted-foreground">Crime Tolerance</span>
                      <span className="text-zinc-900 font-medium capitalize">{formData.crimeTolerance}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-100">
                      <span className="text-muted-foreground">Leasing Restrictions</span>
                      <span className={formData.allowLeasingRestrictions ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
                        {formData.allowLeasingRestrictions ? 'Allowed' : 'Not Allowed'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Custom Criteria - Grouped */}
                {formData.customCriteria.length > 0 && (
                  <div className="pb-6">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Custom Criteria</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Required / Yes */}
                      {formData.customCriteria.filter(c => c.enabled).length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Required</p>
                          {formData.customCriteria.filter(c => c.enabled).map((c) => {
                            const { positiveWord, rest } = parsePositiveWord(c.name);
                            return (
                              <div
                                key={c.id}
                                className="flex items-center gap-2 p-2 rounded-lg border bg-green-50 border-green-200"
                              >
                                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                                {positiveWord ? (
                                  <>
                                    <span className="text-green-600 font-bold text-sm">{positiveWord}</span>
                                    <span className="text-green-800 text-sm">{rest}</span>
                                  </>
                                ) : (
                                  <span className="text-green-800 font-medium text-sm">{c.name}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Not Allowed / No */}
                      {formData.customCriteria.filter(c => !c.enabled).length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Not Allowed</p>
                          {formData.customCriteria.filter(c => !c.enabled).map((c) => {
                            const { negativeWord, rest } = parseNegativeWord(c.name);
                            return (
                              <div
                                key={c.id}
                                className="flex items-center gap-2 p-2 rounded-lg border bg-red-50 border-red-200"
                              >
                                <X className="w-4 h-4 text-red-600 flex-shrink-0" />
                                {negativeWord ? (
                                  <>
                                    <span className="text-red-600 font-bold text-sm">{negativeWord}</span>
                                    <span className="text-red-800 text-sm">{rest}</span>
                                  </>
                                ) : (
                                  <span className="text-red-800 text-sm">{c.name}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Signature Line */}
                <div className="pt-6 border-t-2 border-zinc-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="text-sm text-zinc-700">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Profile Completeness</p>
                      <p className="text-2xl font-bold text-green-600">{getCompletenessScore()}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-8 py-4 bg-zinc-50 border-t border-zinc-200">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                  onClick={() => setShowPreview(false)}
                >
                  Edit Criteria
                </Button>
                <Button
                  className="flex-1 bg-card hover:bg-secondary text-foreground"
                  onClick={() => {
                    setShowPreview(false);
                    handleSubmit();
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Zap className="w-4 h-4 mr-2 animate-pulse" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Submit Buy Box
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Copyright Footer */}
      <footer className="py-6 text-center text-muted-foreground text-sm">
        <p>&copy; {new Date().getFullYear()} DispoTree LLC. All rights reserved.</p>
      </footer>
      </div>
    </div>
  );
}
