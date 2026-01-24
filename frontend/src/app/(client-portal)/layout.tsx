'use client';

import { Toaster } from 'sonner';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Bug,
  GitPullRequest,
  GitCommit,
  FolderKanban,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Public pages don't need navigation
  const isPublicPage = pathname.startsWith('/client/login') || pathname.startsWith('/client/invite');

  const handleLogout = () => {
    localStorage.removeItem('dispotree_token');
    document.cookie = 'dispotree_token=; path=/; max-age=0';
    window.location.href = '/client/login';
  };

  if (isPublicPage) {
    return (
      <>
        {children}
        <Toaster position="top-right" theme="dark" />
      </>
    );
  }

  // Extract project ID from pathname for navigation
  const projectMatch = pathname.match(/\/client\/projects\/([^\/]+)/);
  const projectId = projectMatch ? projectMatch[1] : null;

  const navItems = projectId
    ? [
        { href: '/client', icon: Home, label: 'Projects' },
        { href: `/client/projects/${projectId}`, icon: FolderKanban, label: 'Overview' },
        { href: `/client/projects/${projectId}/issues`, icon: Bug, label: 'Issues' },
        { href: `/client/projects/${projectId}/prs`, icon: GitPullRequest, label: 'Pull Requests' },
        { href: `/client/projects/${projectId}/commits`, icon: GitCommit, label: 'Commits' },
      ]
    : [{ href: '/client', icon: Home, label: 'Projects' }];

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/client" className="font-semibold">
              Client Portal
            </Link>
            <nav className="hidden md:flex items-center gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 text-sm font-medium transition-colors hover:text-foreground',
                    pathname === item.href
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t">
        <div className="flex items-center justify-around py-2">
          {navItems.slice(0, 5).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors',
                pathname === item.href
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="container px-4 py-6 pb-24 md:pb-6">{children}</main>

      <Toaster position="top-right" theme="dark" />
    </div>
  );
}
