import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const publicRoutes = [
  '/login',
  '/register',
  '/fastbuybox',
  '/property-chat',
  '/broker-apply',
  '/chat', // AI chat should be accessible - it handles its own auth fallback
  '/ipad', // TV remote controller
  '/tv', // TV display
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for Supabase auth cookies
  // Supabase uses various cookie names depending on configuration:
  // - sb-<project-ref>-auth-token (main session token)
  // - sb-access-token (access token)
  // We check for any cookie that indicates a Supabase session
  const cookies = request.cookies;
  const hasSupabaseSession = Array.from(cookies.getAll()).some(cookie =>
    (cookie.name.includes('sb-') && cookie.name.includes('-auth-token')) ||
    cookie.name === 'sb-access-token'
  );

  // If no session and trying to access protected route, redirect to login
  if (!hasSupabaseSession && !pathname.startsWith('/login')) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static files (images, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|gif|svg|ico|webp)$).*)',
  ],
};
