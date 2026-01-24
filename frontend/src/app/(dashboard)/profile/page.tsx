'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Camera,
  Loader2,
  Save,
  User,
  Building2,
  Phone,
  Mail,
  Shield,
  Calendar,
  TrendingUp,
  Heart,
  X as XIcon,
  ThumbsDown,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Activity,
  Clock,
  Award,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUser, useUpdateProfile } from '@/hooks/use-user';
import { cn } from '@/lib/utils';

// Profile sections configuration
const profileSections = [
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'account', label: 'Account', icon: Shield },
];

export default function ProfilePage() {
  const { data: user, isLoading, error } = useCurrentUser();
  const updateProfile = useUpdateProfile();

  const [activeSection, setActiveSection] = useState('personal');
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    name: '',
    company: '',
    phone: '',
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize form when user data loads
  const initForm = () => {
    if (user) {
      setForm({
        name: user.name || '',
        company: user.company || '',
        phone: user.phone || '',
      });
      setAvatarPreview(null);
    }
  };

  const handleEdit = () => {
    initForm();
    setIsEditing(true);
  };

  const handleCancel = () => {
    initForm();
    setIsEditing(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    try {
      const updateData: { name?: string; company?: string; phone?: string; avatar?: string } = {};

      if (form.name !== user?.name) updateData.name = form.name;
      if (form.company !== (user?.company || '')) updateData.company = form.company;
      if (form.phone !== (user?.phone || '')) updateData.phone = form.phone;
      if (avatarPreview !== null) updateData.avatar = avatarPreview || '';

      if (Object.keys(updateData).length === 0) {
        toast.info('No changes to save');
        setIsEditing(false);
        return;
      }

      await updateProfile.mutateAsync(updateData);
      toast.success('Profile updated successfully');
      setIsEditing(false);
      setAvatarPreview(null);
    } catch (err) {
      toast.error(`Failed to update profile: ${(err as Error).message}`);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const renderSectionContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        </div>
      );
    }

    switch (activeSection) {
      case 'personal':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Personal Information</h2>
                <p className="text-sm text-muted-foreground">Manage your personal details</p>
              </div>
              {!isEditing && (
                <Button onClick={handleEdit} size="sm">
                  Edit Profile
                </Button>
              )}
            </div>

            {/* Avatar Section */}
            <div className="flex items-center gap-6 p-4 rounded-xl bg-muted/50 border border-border/50">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage
                    src={avatarPreview !== null ? avatarPreview : user?.avatar}
                    alt={user?.name}
                  />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                    {getInitials(user?.name || 'U')}
                  </AvatarFallback>
                </Avatar>
                {isEditing && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-1.5 bg-primary rounded-full hover:bg-primary/90 transition-colors"
                  >
                    <Camera className="h-3.5 w-3.5 text-primary-foreground" />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{user?.name}</h3>
                <p className="text-muted-foreground text-sm">{user?.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className="capitalize">
                    {user?.role?.replace('_', ' ')}
                  </Badge>
                  {user?.verified && (
                    <Badge variant="outline" className="border-green-500/50 text-green-500 bg-green-500/10">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>
              </div>
              {isEditing && (avatarPreview || user?.avatar) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveAvatar}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                >
                  <XIcon className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              )}
            </div>

            {/* Form Fields */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-2">
                <Label className="text-muted-foreground text-sm flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Full Name
                </Label>
                {isEditing ? (
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                ) : (
                  <p className="font-medium">{user?.name || '-'}</p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-2">
                <Label className="text-muted-foreground text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <p className="font-medium">{user?.email}</p>
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-2">
                <Label className="text-muted-foreground text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Company
                </Label>
                {isEditing ? (
                  <Input
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="Your company"
                  />
                ) : (
                  <p className="font-medium">{user?.company || '-'}</p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-2">
                <Label className="text-muted-foreground text-sm flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone
                </Label>
                {isEditing ? (
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="(555) 555-5555"
                  />
                ) : (
                  <p className="font-medium">{user?.phone || '-'}</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {isEditing && (
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        );

      case 'activity':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Activity Stats</h2>
              <p className="text-sm text-muted-foreground">Your activity and engagement metrics</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{user?.totalDealsViewed || 0}</p>
                    <p className="text-xs text-muted-foreground">Deals Viewed</p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Heart className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{user?.totalLikes || 0}</p>
                    <p className="text-xs text-muted-foreground">Likes</p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <ThumbsDown className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{user?.totalPasses || 0}</p>
                    <p className="text-xs text-muted-foreground">Passes</p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{user?.totalOffers || 0}</p>
                    <p className="text-xs text-muted-foreground">Offers Made</p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{user?.acceptedOffers || 0}</p>
                    <p className="text-xs text-muted-foreground">Accepted</p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Award className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {user?.totalOffers && user?.acceptedOffers
                        ? Math.round((user.acceptedOffers / user.totalOffers) * 100)
                        : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">Success Rate</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'account':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Account Information</h2>
              <p className="text-sm text-muted-foreground">Your account details and status</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Role</p>
                    <p className="text-xs text-muted-foreground">Your account permission level</p>
                  </div>
                </div>
                <Badge className="capitalize">{user?.role?.replace('_', ' ')}</Badge>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-medium">Verification Status</p>
                    <p className="text-xs text-muted-foreground">Account verification</p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    user?.verified
                      ? 'border-green-500/50 text-green-500 bg-green-500/10'
                      : 'border-yellow-500/50 text-yellow-500 bg-yellow-500/10'
                  )}
                >
                  {user?.verified ? 'Verified' : 'Pending'}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium">Member Since</p>
                    <p className="text-xs text-muted-foreground">Account creation date</p>
                  </div>
                </div>
                <span className="text-sm font-medium">
                  {user?.createdAt ? formatDate(user.createdAt) : '-'}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Last Updated</p>
                    <p className="text-xs text-muted-foreground">Profile last modified</p>
                  </div>
                </div>
                <span className="text-sm font-medium">
                  {user?.updatedAt ? formatDate(user.updatedAt) : '-'}
                </span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (error) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold">Failed to load profile</h2>
          <p className="text-muted-foreground">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-start justify-center py-6">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 px-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Profile</h1>
              <p className="text-sm text-muted-foreground">Manage your account settings</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex min-h-[600px]">
            {/* Sidebar */}
            <div className="w-56 border-r border-border/50 bg-muted/30 p-2">
              <ScrollArea className="h-[600px]">
                <nav className="space-y-1">
                  {profileSections.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                          'hover:bg-muted/70',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                        <span className="text-sm font-medium">{section.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </ScrollArea>
            </div>

            {/* Content */}
            <div className="flex-1 p-6">
              <ScrollArea className="h-[600px] pr-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeSection}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {renderSectionContent()}
                  </motion.div>
                </AnimatePresence>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
