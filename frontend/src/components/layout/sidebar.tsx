'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import {
  LayoutDashboard,
  Settings,
  ChevronLeft,
  Users,
  Mail,
  Activity,
  Phone,
  Calendar,
  FolderKanban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/activity-feed', label: 'Activity Feed', icon: Activity },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/email', label: 'Email', icon: Mail },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useAppStore();

  // Close sidebar on mobile when route changes
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    // Close on route change for mobile
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pathname, setSidebarOpen]);

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen border-r border bg-card transition-all duration-300',
          // Mobile: hidden by default, slide in when open
          'max-md:-translate-x-full max-md:w-64',
          sidebarOpen && 'max-md:translate-x-0',
          // Desktop: normal behavior
          'md:translate-x-0',
          sidebarOpen ? 'md:w-64' : 'md:w-20'
        )}
      >
      <div className={cn(
        "flex h-16 items-center px-4",
        sidebarOpen ? "justify-between" : "justify-center"
      )}>
        {sidebarOpen ? (
          <>
            <Link href="/dashboard" className="flex items-center gap-2">
              <Image
                src="/Dispotree-icon.png"
                alt="CodeLive"
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
              />
              <span className="text-xl font-bold text-foreground">CodeLive</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="text-muted-foreground hover:text-foreground p-0"
          >
            <Image
              src="/Dispotree-icon.png"
              alt="CodeLive"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
          </Button>
        )}
      </div>

      <Separator className="bg-border" />

      <ScrollArea className="h-[calc(100vh-8rem)]">
        <nav className="space-y-1 p-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent-600 text-white'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  !sidebarOpen && 'justify-center px-2'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="absolute bottom-0 left-0 right-0 border-t border p-2">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            pathname === '/settings'
              ? 'bg-accent-600 text-white'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            !sidebarOpen && 'justify-center px-2'
          )}
        >
          <Settings className="h-5 w-5 shrink-0" />
          {sidebarOpen && <span>Settings</span>}
        </Link>
      </div>
    </aside>
    </>
  );
}
