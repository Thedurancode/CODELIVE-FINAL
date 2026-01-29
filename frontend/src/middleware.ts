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

  // Check for Better Auth session cookie
  // Better Auth uses 'codelive.session_token' based on our cookiePrefix config
  const sessionToken = request.cookies.get('codelive.session_token')?.value;

  // If no session and trying to access protected route, redirect to login
  if (!sessionToken && !pathname.startsWith('/login')) {
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
