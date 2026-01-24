'use client';

import { Toaster } from 'sonner';
import { FadeTransition } from '@/components/layout/page-transition';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <FadeTransition>{children}</FadeTransition>
      <Toaster position="top-right" theme="dark" />
    </>
  );
}
