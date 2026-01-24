'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { useInviteDetails, useAcceptInvite } from '@/hooks/use-client-portal';

// Shared background component
function PageBackground() {
  return (
    <>
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-black to-zinc-950" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent" />
      <div className="fixed inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
        backgroundSize: '50px 50px'
      }} />
    </>
  );
}

export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
  });

  const { data: invite, isLoading: isLoadingInvite, error } = useInviteDetails(token);
  const acceptInvite = useAcceptInvite();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Use invite email if provided, otherwise use form email
    const email = invite?.clientEmail || form.email;

    try {
      const result = await acceptInvite.mutateAsync({
        token,
        email,
        password: form.password,
        name: form.name,
      });

      // Store the token (use same key as main app for API compatibility)
      localStorage.setItem('dispotree_token', result.accessToken);
      document.cookie = `dispotree_token=${result.accessToken}; path=/; max-age=${60 * 60 * 24 * 7}`;

      toast.success('Account created! Redirecting...');
      router.push('/client');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (isLoadingInvite) {
    return (
      <div className="min-h-screen relative bg-black flex items-center justify-center">
        <PageBackground />
        <Loader2 className="h-8 w-8 animate-spin text-blue-500 relative z-10" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen relative bg-black flex items-center justify-center p-4">
        <PageBackground />
        <div className="relative z-10 w-full max-w-md">
          {/* CodeLive Logo */}
          <div className="flex justify-center mb-6">
            <img
              src="/codelive-logo.png"
              alt="CodeLive"
              className="h-10 w-auto object-contain"
            />
          </div>
          <Card className="bg-zinc-900/80 border-zinc-800 backdrop-blur-xl">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
                <h2 className="text-xl font-semibold text-white">Invalid Invite</h2>
                <p className="text-zinc-400">
                  This invite link is invalid or has expired.
                </p>
                <Button
                  variant="outline"
                  onClick={() => router.push('/client/login')}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Go to Login
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (invite.isExpired) {
    return (
      <div className="min-h-screen relative bg-black flex items-center justify-center p-4">
        <PageBackground />
        <div className="relative z-10 w-full max-w-md">
          {/* CodeLive Logo */}
          <div className="flex justify-center mb-6">
            <img
              src="/codelive-logo.png"
              alt="CodeLive"
              className="h-10 w-auto object-contain"
            />
          </div>
          <Card className="bg-zinc-900/80 border-zinc-800 backdrop-blur-xl">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto" />
                <h2 className="text-xl font-semibold text-white">Invite Expired</h2>
                <p className="text-zinc-400">
                  This invite has expired. Please contact the project owner for a new invite.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (invite.isAccepted) {
    return (
      <div className="min-h-screen relative bg-black flex items-center justify-center p-4">
        <PageBackground />
        <div className="relative z-10 w-full max-w-md">
          {/* CodeLive Logo */}
          <div className="flex justify-center mb-6">
            <img
              src="/codelive-logo.png"
              alt="CodeLive"
              className="h-10 w-auto object-contain"
            />
          </div>
          <Card className="bg-zinc-900/80 border-zinc-800 backdrop-blur-xl">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <h2 className="text-xl font-semibold text-white">Already Registered</h2>
                <p className="text-zinc-400">
                  This invite has already been accepted. Please sign in to continue.
                </p>
                <Button
                  onClick={() => router.push('/client/login')}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Go to Login
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-black flex items-center justify-center p-4">
      <PageBackground />

      <div className="relative z-10 w-full max-w-md">
        {/* CodeLive Logo at the top */}
        <div className="flex justify-center mb-6">
          <img
            src="/codelive-logo.png"
            alt="CodeLive"
            className="h-10 w-auto object-contain"
          />
        </div>

        <Card className="bg-zinc-900/80 border-zinc-800 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center">
            {invite.projectLogo ? (
              <div className="flex justify-center mb-4">
                <Image
                  src={invite.projectLogo}
                  alt={invite.projectTitle}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-lg object-cover"
                />
              </div>
            ) : (
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <span className="text-2xl font-bold text-blue-400">
                    {invite.projectTitle.charAt(0)}
                  </span>
                </div>
              </div>
            )}
            <CardTitle className="text-2xl text-white">
              Join {invite.projectTitle}
            </CardTitle>
            <p className="text-zinc-400 text-sm mt-2">
              {invite.invitedByName
                ? `${invite.invitedByName} invited you`
                : 'You have been invited'}{' '}
              to access this project
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Your name"
                  className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-blue-500 focus:ring-blue-500/20"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Email</Label>
                <Input
                  type="email"
                  value={invite.clientEmail || form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@example.com"
                  className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-blue-500 focus:ring-blue-500/20"
                  required
                  disabled={!!invite.clientEmail}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Create Password</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min. 8 characters"
                  className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-blue-500 focus:ring-blue-500/20"
                  required
                  minLength={8}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-5 mt-2"
                disabled={acceptInvite.isPending}
              >
                {acceptInvite.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  'Create Account & Join'
                )}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-zinc-500">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => router.push('/client/login')}
                className="text-blue-400 hover:text-blue-300 hover:underline"
              >
                Sign in
              </button>
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-600 mt-6">
          Powered by CodeLive AI
        </p>
      </div>
    </div>
  );
}
