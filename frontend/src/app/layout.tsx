import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#a12d32' },
    { media: '(prefers-color-scheme: dark)', color: '#a12d32' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'CodeLive - AI-Powered Development Platform',
  description: 'AI-powered development and productivity platform',
  applicationName: 'CodeLive',
  keywords: ['development', 'AI', 'productivity', 'coding', 'automation'],
  authors: [{ name: 'CodeLive' }],
  creator: 'CodeLive',
  publisher: 'CodeLive',
  formatDetection: {
    telephone: true,
    email: true,
    address: true,
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/Dispotree-icon.png', color: '#a12d32' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CodeLive',
    startupImage: [
      '/apple-touch-icon.png',
    ],
  },
  openGraph: {
    type: 'website',
    siteName: 'CodeLive',
    title: 'CodeLive - AI-Powered Development Platform',
    description: 'AI-powered development and productivity platform',
    images: [{ url: '/dispotree-logo.png', width: 1024, height: 1024 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CodeLive - AI-Powered Development Platform',
    description: 'AI-powered development and productivity platform',
    images: ['/dispotree-logo.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CodeLive" />
        <link rel="apple-touch-startup-image" href="/apple-touch-icon.png" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
