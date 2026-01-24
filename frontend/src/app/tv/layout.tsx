'use client';

import { SpriteTerminalDialog } from '@/components/sprites';

export default function TVLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SpriteTerminalDialog />
    </>
  );
}
