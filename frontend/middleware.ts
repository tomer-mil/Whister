/**
 * Next.js Middleware
 * Route protection and authentication checks
 */

import { NextRequest, NextResponse } from 'next/server';

// Routes that require authentication
const protectedRoutes = [
  '/',
  '/room',
  '/game',
];

// Routes that are only for unauthenticated users
const authRoutes = [
  '/login',
  '/register',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('accessToken')?.value;

  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some((route) => {
    if (route === '/') {
      return pathname === '/' || pathname === '';
    }
    return pathname.startsWith(route);
  });

  // Check if route is auth-only
  const isAuthRoute = authRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Redirect to login if accessing protected route without auth
  if (isProtectedRoute && !accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to home if accessing auth route with auth
  if (isAuthRoute && accessToken) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
