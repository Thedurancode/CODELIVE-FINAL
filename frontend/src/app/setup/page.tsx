'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Building2, Bot, Users, Check, Plus, X, Upload } from 'lucide-react';
import { api } from '@/lib/api';

interface TeamMember {
  email: string;
  name: string;
  role: 'admin' | 'user';
}

type SetupStep = 'loading' | 'organization' | 'agent' | 'team' | 'complete';

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>('loading');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Organization state
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  // Agent state
  const [agentName, setAgentName] = useState('Diana');
  const [agentAvatar, setAgentAvatar] = useState('/agent.png');
  const [agentPersonality, setAgentPersonality] = useState(
    'I am a friendly and professional AI assistant specializing in real estate wholesale deals. I help manage contacts, analyze properties, and streamline deal workflows.'
  );

  // Team state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'user'>('user');

  // Check if setup is needed
  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const response = await api.get<{
        needsSetup: boolean;
        agentConfig: { name: string; avatar: string };
      }>('/api/setup/status');

      if (!response.needsSetup) {
        // Already set up, redirect to chat
        router.push('/chat');
      } else {
        setStep('organization');
      }
    } catch (err) {
      // If error, assume fresh install
      setStep('organization');
    }
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };

  const handleOrgNameChange = (value: string) => {
    setOrgName(value);
    if (!orgSlug || orgSlug === generateSlug(orgName)) {
      setOrgSlug(generateSlug(value));
    }
  };

  const addTeamMember = () => {
    if (newMemberEmail && !teamMembers.find(m => m.email === newMemberEmail)) {
      setTeamMembers([
        ...teamMembers,
        {
          email: newMemberEmail,
          name: newMemberName || newMemberEmail.split('@')[0],
          role: newMemberRole,
        },
      ]);
      setNewMemberEmail('');
      setNewMemberName('');
      setNewMemberRole('user');
    }
  };

  const removeTeamMember = (email: string) => {
    setTeamMembers(teamMembers.filter(m => m.email !== email));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await api.post('/api/setup/initialize', {
        organizationName: orgName,
        organizationSlug: orgSlug,
        agentName,
        agentAvatar,
        agentPersonality,
        teamMembers,
      });

      setStep('complete');

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize system');
    } finally {
      setIsSubmitting(false);
    }
  };

  const avatarOptions = [
    { url: '/agent.png', name: 'Diana' },
  ];

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Setup Complete!</h2>
            <p className="text-muted-foreground mb-4">
              Your system is ready. Redirecting to login...
            </p>
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress indicator */}
        <div className="flex items-center justify-center mb-8 gap-2">
          {['organization', 'agent', 'team'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : ['organization', 'agent', 'team'].indexOf(step) > i
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {['organization', 'agent', 'team'].indexOf(step) > i ? (
                  <Check className="h-5 w-5" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 2 && <div className="w-12 h-0.5 bg-gray-700 mx-2" />}
            </div>
          ))}
        </div>

        {/* Step 1: Organization */}
        {step === 'organization' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle>Welcome to CodeLive</CardTitle>
                  <CardDescription>Let's set up your organization</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name *</Label>
                <Input
                  id="orgName"
                  placeholder="My Company"
                  value={orgName}
                  onChange={(e) => handleOrgNameChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="orgSlug">URL Slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">app.codelive.com/</span>
                  <Input
                    id="orgSlug"
                    placeholder="my-company"
                    value={orgSlug}
                    onChange={(e) => setOrgSlug(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={() => setStep('agent')} disabled={!orgName}>
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: AI Agent */}
        {step === 'agent' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Bot className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle>Customize Your AI Assistant</CardTitle>
                  <CardDescription>Give your AI agent a name and personality</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="agentName">Agent Name</Label>
                <Input
                  id="agentName"
                  placeholder="Diana"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Agent Avatar</Label>
                <div className="flex gap-3 flex-wrap">
                  {avatarOptions.map((opt) => (
                    <button
                      key={opt.url}
                      onClick={() => setAgentAvatar(opt.url)}
                      className={`relative rounded-full p-1 transition-all ${
                        agentAvatar === opt.url
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                          : 'hover:opacity-80'
                      }`}
                    >
                      <Avatar className="h-16 w-16">
                        <AvatarImage src={opt.url} alt={opt.name} />
                        <AvatarFallback>{opt.name[0]}</AvatarFallback>
                      </Avatar>
                    </button>
                  ))}
                  <button
                    className="h-16 w-16 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center hover:border-gray-500 transition-colors"
                    onClick={() => {/* TODO: Upload custom avatar */}}
                  >
                    <Upload className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agentPersonality">Agent Personality & Introduction</Label>
                <Textarea
                  id="agentPersonality"
                  placeholder="Describe how your AI agent should introduce itself and behave..."
                  value={agentPersonality}
                  onChange={(e) => setAgentPersonality(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  This will be used as the agent's system prompt and introduction.
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep('organization')}>
                  Back
                </Button>
                <Button onClick={() => setStep('team')}>Continue</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Team Members */}
        {step === 'team' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle>Invite Team Members</CardTitle>
                  <CardDescription>Add admins and users to your organization (optional)</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Add team member form */}
              <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="memberEmail">Email *</Label>
                    <Input
                      id="memberEmail"
                      type="email"
                      placeholder="member@company.com"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="memberName">Name</Label>
                    <Input
                      id="memberName"
                      placeholder="John Doe"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <Label>Role</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={newMemberRole === 'admin' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setNewMemberRole('admin')}
                      >
                        Admin
                      </Button>
                      <Button
                        type="button"
                        variant={newMemberRole === 'user' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setNewMemberRole('user')}
                      >
                        User
                      </Button>
                    </div>
                  </div>
                  <Button onClick={addTeamMember} disabled={!newMemberEmail} className="mt-5">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </div>

              {/* Team member list */}
              {teamMembers.length > 0 && (
                <div className="space-y-2">
                  <Label>Team Members ({teamMembers.length})</Label>
                  <div className="space-y-2">
                    {teamMembers.map((member) => (
                      <div
                        key={member.email}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{member.name[0].toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{member.name}</p>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                            {member.role}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeTeamMember(member.email)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep('agent')}>
                  Back
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    'Complete Setup'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
