'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Share2,
  Copy,
  ExternalLink,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
  Users,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  usePropertyPublicLinks,
  useCreatePublicLink,
  useUpdatePublicLink,
  useDeletePublicLink,
  getPublicDealUrl,
  type PublicDealSettings,
  type PublicDealLink,
} from '@/hooks/use-public-deal-links';
import { formatDistanceToNow } from 'date-fns';

interface PublicLinkManagerProps {
  propertyId: string | number;
}

const DEFAULT_SETTINGS: PublicDealSettings = {
  showFinancials: true,
  showPropertyDetails: true,
  showOccupancy: true,
  showFeatures: true,
  showDocuments: true,
  showCompliance: true,
  showViewers: true,
  showBuyers: true,
  showOffers: true,
  showSkipTrace: true,
  showContacts: true,
  showDiscussion: true,
  showPhotos: true,
};

const SETTING_LABELS: Record<keyof PublicDealSettings, string> = {
  showFinancials: 'Financial Summary',
  showPropertyDetails: 'Property Details',
  showOccupancy: 'Occupancy & Access',
  showFeatures: 'Features & Amenities',
  showDocuments: 'Documents',
  showCompliance: 'Contract & Compliance',
  showViewers: 'Who Viewed This Deal',
  showBuyers: 'Potential Buyers',
  showOffers: 'Offers',
  showSkipTrace: 'Skip Trace Details',
  showContacts: 'Assigned Contacts',
  showDiscussion: 'Public Discussion',
  showPhotos: 'Property Photos',
};

export function PublicLinkManager({ propertyId }: PublicLinkManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [settings, setSettings] = useState<PublicDealSettings>(DEFAULT_SETTINGS);
  const [expiresAt, setExpiresAt] = useState<string>('');

  const { data: links = [], isLoading } = usePropertyPublicLinks(propertyId);
  const createLink = useCreatePublicLink(propertyId);
  const updateLink = useUpdatePublicLink();
  const deleteLink = useDeletePublicLink();

  const handleCreateLink = async () => {
    const result = await createLink.mutateAsync({
      settings,
      expiresAt: expiresAt || null,
    });

    if (result?.url) {
      const fullUrl = getPublicDealUrl(propertyId, result.link.token);
      try {
        await navigator.clipboard.writeText(fullUrl);
        toast.success('Link created and copied to clipboard!');
      } catch {
        toast.success('Link created!');
      }
    }

    setIsCreating(false);
    setSettings(DEFAULT_SETTINGS);
    setExpiresAt('');
  };

  const handleCopyLink = async (link: PublicDealLink) => {
    const url = getPublicDealUrl(propertyId, link.token);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard!');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleToggleActive = async (link: PublicDealLink) => {
    await updateLink.mutateAsync({
      linkId: link.id,
      data: { isActive: !link.isActive },
    });
  };

  const handleDeleteLink = async (linkId: number) => {
    if (confirm('Are you sure you want to delete this public link?')) {
      await deleteLink.mutateAsync(linkId);
    }
  };

  const handleToggleSetting = (key: keyof PublicDealSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectAll = () => {
    const allEnabled = Object.values(settings).every((v) => v === true);
    const newSettings = Object.keys(settings).reduce(
      (acc, key) => ({
        ...acc,
        [key]: !allEnabled,
      }),
      {} as PublicDealSettings
    );
    setSettings(newSettings);
  };

  const enabledCount = Object.values(settings).filter(Boolean).length;
  const totalCount = Object.keys(settings).length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="h-4 w-4 mr-2" />
          Public Links
          {links.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {links.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Public Deal Links</DialogTitle>
          <DialogDescription>
            Create shareable links with customizable visibility settings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Existing Links */}
          {links.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Existing Links</h3>
              {links.map((link) => (
                <div
                  key={link.id}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-muted px-2 py-1 rounded">
                          {link.token.substring(0, 12)}...
                        </code>
                        {link.isActive ? (
                          <Badge variant="default">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                        {link.expiresAt && (
                          <Badge variant="outline">
                            <Calendar className="h-3 w-3 mr-1" />
                            Expires {formatDistanceToNow(new Date(link.expiresAt), { addSuffix: true })}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {link.viewCount} views
                        </span>
                        <span>
                          Created {formatDistanceToNow(new Date(link.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyLink(link)}
                        title="Copy link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          window.open(getPublicDealUrl(propertyId, link.token), '_blank')
                        }
                        title="Open link"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(link)}
                        title={link.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {link.isActive ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteLink(link.id)}
                        title="Delete link"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Showing {Object.values(link.settings).filter(Boolean).length} of{' '}
                    {Object.keys(link.settings).length} sections
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create New Link */}
          {!isCreating ? (
            <Button onClick={() => setIsCreating(true)} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Create New Public Link
            </Button>
          ) : (
            <div className="space-y-4 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">New Public Link</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </Button>
              </div>

              {/* Expiration Date */}
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expiration Date (Optional)</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>

              {/* Visibility Settings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Visibility Settings ({enabledCount}/{totalCount})</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    {enabledCount === totalCount ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(SETTING_LABELS).map(([key, label]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between space-x-2 border rounded-lg p-3"
                    >
                      <Label
                        htmlFor={key}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {label}
                      </Label>
                      <Switch
                        id={key}
                        checked={settings[key as keyof PublicDealSettings]}
                        onCheckedChange={() =>
                          handleToggleSetting(key as keyof PublicDealSettings)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleCreateLink}
                disabled={createLink.isPending}
                className="w-full"
              >
                {createLink.isPending ? 'Creating...' : 'Create & Copy Link'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
