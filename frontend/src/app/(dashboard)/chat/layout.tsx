'use client';

import { ReactNode } from 'react';

interface ChatLayoutProps {
  children: ReactNode;
}

export default function ChatLayout({ children }: ChatLayoutProps) {
  // Override the dashboard layout padding for full-width chat
  return (
    <div className="h-[calc(100vh-4rem)] -mx-6 -my-6">
      {children}
    </div>
  );
}
