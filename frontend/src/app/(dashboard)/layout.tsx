'use client';

import { useEffect } from 'react';
import { Dock } from '@/components/layout/dock';
import { Header } from '@/components/layout/header';
import { PageTransition } from '@/components/layout/page-transition';
import { SpriteTerminalDialog } from '@/components/sprites';
import { AgentProvider } from '@/contexts/agent-context';
import { initializePushNotifications } from '@/lib/push-notifications';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initialize push notifications for logged-in users
  useEffect(() => {
    initializePushNotifications().catch(console.error);
  }, []);

  return (
    <AgentProvider>
      <div className="min-h-screen bg-background" suppressHydrationWarning>
        <Header />
        <main className="min-h-screen pt-20 pb-24 md:pb-28">
          <div className="p-4 md:p-6">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>

        {/* macOS-style Dock Navigation */}
        <Dock />

        {/* Global Sprite Terminal Dialog */}
        <SpriteTerminalDialog />
      </div>
    </AgentProvider>
  );
}
