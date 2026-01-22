'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Loader2 } from 'lucide-react';
import type { Contact, ContactType, ContactStatus } from '@/types';

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: 'broker', label: 'Broker' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'attorney', label: 'Attorney' },
  { value: 're_agent', label: 'RE Agent' },
  { value: 'other', label: 'Other' },
];

const CONTACT_STATUSES: { value: ContactStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

interface ContactFormProps {
  contact?: Contact;
  onSubmit: (data: Partial<Contact>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

// Types that require license information
const LICENSE_REQUIRED_TYPES: ContactType[] = ['broker', 're_agent'];

export function ContactForm({ contact, onSubmit, onCancel, isLoading }: ContactFormProps) {
  const [name, setName] = useState(contact?.name || '');
  const [type, setType] = useState<ContactType>(contact?.type || 'other');
  const [email, setEmail] = useState(contact?.email || '');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [company, setCompany] = useState(contact?.company || '');
  const [address, setAddress] = useState(contact?.address || '');
  const [city, setCity] = useState(contact?.city || '');
  const [state, setState] = useState(contact?.state || '');
  const [zip, setZip] = useState(contact?.zip || '');
  const [notes, setNotes] = useState(contact?.notes || '');
  const [tags, setTags] = useState<string[]>(contact?.tags || []);
  const [status, setStatus] = useState<ContactStatus>(contact?.status || 'active');
  const [tagInput, setTagInput] = useState('');

  // License fields for brokers/agents
  const [licenseNumber, setLicenseNumber] = useState(contact?.licenseNumber || '');
  const [licenseState, setLicenseState] = useState(contact?.licenseState || '');
  const [licenseExpiration, setLicenseExpiration] = useState(
    contact?.licenseExpiration ? new Date(contact.licenseExpiration).toISOString().split('T')[0] : ''
  );

  // Show license fields for broker and agent types
  const showLicenseFields = LICENSE_REQUIRED_TYPES.includes(type);

  useEffect(() => {
    if (contact) {
      setName(contact.name || '');
      setType(contact.type || 'other');
      setEmail(contact.email || '');
      setPhone(contact.phone || '');
      setCompany(contact.company || '');
      setAddress(contact.address || '');
      setCity(contact.city || '');
      setState(contact.state || '');
      setZip(contact.zip || '');
      setNotes(contact.notes || '');
      setTags(contact.tags || []);
      setStatus(contact.status || 'active');
      setLicenseNumber(contact.licenseNumber || '');
      setLicenseState(contact.licenseState || '');
      setLicenseExpiration(
        contact.licenseExpiration ? new Date(contact.licenseExpiration).toISOString().split('T')[0] : ''
      );
    }
  }, [contact]);

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      type,
      email: email || undefined,
      phone: phone || undefined,
      company: company || undefined,
      address: address || undefined,
      city: city || undefined,
      state: state || undefined,
      zip: zip || undefined,
      notes: notes || undefined,
      tags,
      status,
      // License fields (only included for broker/agent types)
      licenseNumber: showLicenseFields && licenseNumber ? licenseNumber : undefined,
      licenseState: showLicenseFields && licenseState ? licenseState : undefined,
      licenseExpiration: showLicenseFields && licenseExpiration ? new Date(licenseExpiration) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label className="text-muted-foreground text-sm">Name *</Label>
          <Input
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 bg-secondary border text-foreground"
            required
          />
        </div>
        <div>
          <Label className="text-muted-foreground text-sm">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as ContactType)}>
            <SelectTrigger className="mt-1 bg-secondary border text-foreground">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent className="bg-secondary border">
              {CONTACT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-foreground">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-muted-foreground text-sm">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ContactStatus)}>
            <SelectTrigger className="mt-1 bg-secondary border text-foreground">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent className="bg-secondary border">
              {CONTACT_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-foreground">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Contact Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-muted-foreground text-sm">Email</Label>
          <Input
            type="email"
            placeholder="john@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 bg-secondary border text-foreground"
          />
        </div>
        <div>
          <Label className="text-muted-foreground text-sm">Phone</Label>
          <Input
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 bg-secondary border text-foreground"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-muted-foreground text-sm">Company</Label>
          <Input
            placeholder="Acme Properties LLC"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="mt-1 bg-secondary border text-foreground"
          />
        </div>
      </div>

      {/* License Info - Only for Brokers and Agents */}
      {showLicenseFields && (
        <div className="p-4 bg-secondary/50 rounded-lg border border/50 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-accent-500 rounded-full" />
            <Label className="text-foreground text-sm font-medium">
              License Information {type === 'broker' ? '(Broker)' : '(Agent)'}
            </Label>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Label className="text-muted-foreground text-sm">License Number</Label>
              <Input
                placeholder="e.g., NJ-12345678"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">License State</Label>
              <Select value={licenseState} onValueChange={setLicenseState}>
                <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                  <SelectValue placeholder="ST" />
                </SelectTrigger>
                <SelectContent className="bg-secondary border max-h-60">
                  {STATES.map((s) => (
                    <SelectItem key={s} value={s} className="text-foreground">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3">
              <Label className="text-muted-foreground text-sm">License Expiration</Label>
              <Input
                type="date"
                value={licenseExpiration}
                onChange={(e) => setLicenseExpiration(e.target.value)}
                className="mt-1 bg-secondary border text-foreground"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            License information is used for compliance verification when this contact is assigned to deals.
          </p>
        </div>
      )}

      {/* Address */}
      <div className="space-y-4">
        <div>
          <Label className="text-muted-foreground text-sm">Address</Label>
          <Input
            placeholder="123 Main St"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-1 bg-secondary border text-foreground"
          />
        </div>
        <div className="grid grid-cols-6 gap-4">
          <div className="col-span-3">
            <Label className="text-muted-foreground text-sm">City</Label>
            <Input
              placeholder="Austin"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 bg-secondary border text-foreground"
            />
          </div>
          <div className="col-span-1">
            <Label className="text-muted-foreground text-sm">State</Label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="mt-1 bg-secondary border text-foreground">
                <SelectValue placeholder="ST" />
              </SelectTrigger>
              <SelectContent className="bg-secondary border max-h-60">
                {STATES.map((s) => (
                  <SelectItem key={s} value={s} className="text-foreground">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-muted-foreground text-sm">ZIP</Label>
            <Input
              placeholder="78701"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="mt-1 bg-secondary border text-foreground"
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <Label className="text-muted-foreground text-sm">Notes</Label>
        <Textarea
          placeholder="Add any notes about this contact..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 bg-secondary border text-foreground min-h-24"
        />
      </div>

      {/* Tags */}
      <div>
        <Label className="text-muted-foreground text-sm">Tags</Label>
        <div className="flex gap-2 mt-1">
          <Input
            placeholder="Add a tag..."
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            className="bg-secondary border text-foreground"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={addTag}
            className="border"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="bg-zinc-700 text-foreground hover:bg-zinc-600"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 hover:text-red-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4 border-t border">
        <Button
          type="button"
          variant="outline"
          className="flex-1 border text-foreground"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 bg-accent-600 hover:bg-accent-700 text-white"
          disabled={isLoading || !name.trim()}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : contact ? (
            'Update Contact'
          ) : (
            'Create Contact'
          )}
        </Button>
      </div>
    </form>
  );
}
