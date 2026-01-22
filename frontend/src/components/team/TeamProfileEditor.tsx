'use client';

/**
 * Team Profile Editor Component
 *
 * Dialog for editing team member profile including bio, expertise, title, and contact info.
 */

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  useTeamProfile,
  useUpdateTeamProfile,
  useUpdateNotificationPrefs,
  EXPERTISE_OPTIONS,
  TIMEZONE_OPTIONS,
} from '@/hooks/use-team-profile';
import {
  User,
  Phone,
  Mail,
  Briefcase,
  Clock,
  Bell,
  Check,
  X,
  Pencil,
  Loader2,
} from 'lucide-react';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  title: z.string().optional(),
  bio: z.string().max(500, 'Bio must be 500 characters or less').optional(),
  timezone: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface TeamProfileEditorProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TeamProfileEditor({ trigger, open: controlledOpen, onOpenChange }: TeamProfileEditorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [selectedExpertise, setSelectedExpertise] = useState<string[]>([]);

  const { data: profile, isLoading } = useTeamProfile();
  const updateProfile = useUpdateTeamProfile();
  const updateNotifications = useUpdateNotificationPrefs();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      phone: '',
      title: '',
      bio: '',
      timezone: 'America/New_York',
    },
  });

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name || '',
        phone: profile.phone || '',
        title: profile.title || '',
        bio: profile.bio || '',
        timezone: profile.timezone || 'America/New_York',
      });
      setSelectedExpertise(profile.expertise || []);
    }
  }, [profile, form]);

  const handleExpertiseToggle = (value: string) => {
    setSelectedExpertise(prev =>
      prev.includes(value)
        ? prev.filter(e => e !== value)
        : [...prev, value]
    );
  };

  const handleSaveProfile = async (data: ProfileFormData) => {
    try {
      await updateProfile.mutateAsync({
        ...data,
        expertise: selectedExpertise,
      });
      setOpen(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  };

  const handleNotificationToggle = async (key: string, value: boolean) => {
    try {
      await updateNotifications.mutateAsync({ [key]: value });
    } catch (error) {
      console.error('Failed to update notification preference:', error);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-2" />
            Edit Profile
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Edit Your Profile</DialogTitle>
          <DialogDescription>
            Update your team member profile, expertise, and notification preferences.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="profile" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="expertise">Expertise</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[400px] pr-4">
              <TabsContent value="profile" className="space-y-4 mt-4">
                {/* Avatar Section */}
                <div className="flex items-center gap-4 mb-6">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profile?.avatar} />
                    <AvatarFallback className="text-lg">
                      {profile?.name ? getInitials(profile.name) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{profile?.name}</p>
                    <p className="text-sm text-muted-foreground">{profile?.email}</p>
                    <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
                  </div>
                </div>

                <form onSubmit={form.handleSubmit(handleSaveProfile)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Full Name
                    </Label>
                    <Input
                      id="name"
                      {...form.register('name')}
                      placeholder="Your full name"
                    />
                    {form.formState.errors.name && (
                      <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="title" className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Job Title
                    </Label>
                    <Input
                      id="title"
                      {...form.register('title')}
                      placeholder="e.g., Acquisitions Manager"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      {...form.register('phone')}
                      placeholder="+1 (555) 123-4567"
                      type="tel"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timezone" className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Timezone
                    </Label>
                    <Select
                      value={form.watch('timezone')}
                      onValueChange={(value) => form.setValue('timezone', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio / About</Label>
                    <Textarea
                      id="bio"
                      {...form.register('bio')}
                      placeholder="Tell your team a bit about yourself..."
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground">
                      {form.watch('bio')?.length || 0}/500 characters
                    </p>
                    {form.formState.errors.bio && (
                      <p className="text-sm text-destructive">{form.formState.errors.bio.message}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={updateProfile.isPending}
                  >
                    {updateProfile.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Save Profile
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="expertise" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Areas of Expertise</Label>
                  <p className="text-sm text-muted-foreground">
                    Select the areas where you have experience or specialize in.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {EXPERTISE_OPTIONS.map((option) => {
                    const isSelected = selectedExpertise.includes(option.value);
                    return (
                      <Badge
                        key={option.value}
                        variant={isSelected ? 'default' : 'outline'}
                        className="cursor-pointer px-3 py-1.5"
                        onClick={() => handleExpertiseToggle(option.value)}
                      >
                        {isSelected && <Check className="h-3 w-3 mr-1" />}
                        {option.label}
                      </Badge>
                    );
                  })}
                </div>

                {selectedExpertise.length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-2">
                      Selected ({selectedExpertise.length}):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selectedExpertise.map((exp) => {
                        const label = EXPERTISE_OPTIONS.find(o => o.value === exp)?.label || exp;
                        return (
                          <Badge key={exp} variant="secondary" className="text-xs">
                            {label}
                            <X
                              className="h-3 w-3 ml-1 cursor-pointer"
                              onClick={() => handleExpertiseToggle(exp)}
                            />
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Button
                  className="w-full mt-4"
                  onClick={form.handleSubmit(handleSaveProfile)}
                  disabled={updateProfile.isPending}
                >
                  {updateProfile.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Save Expertise
                    </>
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="notifications" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Notification Preferences
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Choose how you want to receive notifications for deal activity.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <span className="font-medium">Email Notifications</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Receive email notifications for deal activity
                      </p>
                    </div>
                    <Switch
                      checked={profile?.notifyEmail ?? false}
                      onCheckedChange={(checked) => handleNotificationToggle('notifyEmail', checked)}
                      disabled={updateNotifications.isPending}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span className="font-medium">SMS Notifications</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Receive text messages for urgent updates
                      </p>
                    </div>
                    <Switch
                      checked={profile?.notifySms ?? false}
                      onCheckedChange={(checked) => handleNotificationToggle('notifySms', checked)}
                      disabled={updateNotifications.isPending}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        <span className="font-medium">Push Notifications</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Receive push notifications in browser
                      </p>
                    </div>
                    <Switch
                      checked={profile?.notifyPush ?? false}
                      onCheckedChange={(checked) => handleNotificationToggle('notifyPush', checked)}
                      disabled={updateNotifications.isPending}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="space-y-0.5">
                      <span className="font-medium">Deal Alerts</span>
                      <p className="text-sm text-muted-foreground">
                        Get notified about deal matches and updates
                      </p>
                    </div>
                    <Switch
                      checked={profile?.dealAlerts ?? false}
                      onCheckedChange={(checked) => handleNotificationToggle('dealAlerts', checked)}
                      disabled={updateNotifications.isPending}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="space-y-0.5">
                      <span className="font-medium">Instant Alerts</span>
                      <p className="text-sm text-muted-foreground">
                        Receive notifications immediately instead of in digest
                      </p>
                    </div>
                    <Switch
                      checked={profile?.instantAlerts ?? false}
                      onCheckedChange={(checked) => handleNotificationToggle('instantAlerts', checked)}
                      disabled={updateNotifications.isPending}
                    />
                  </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default TeamProfileEditor;
