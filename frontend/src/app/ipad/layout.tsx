import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'TV Remote | CodeLive',
  description: 'Control your CodeLive TV display',
  manifest: '/manifest-remote.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TV Remote',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#10b981',
};

export default function IPadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
